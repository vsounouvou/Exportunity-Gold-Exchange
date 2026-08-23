import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@db";
import {
  activityLog,
  agents,
  contacts,
  goals,
  industrialAuditLogs,
  industrialOrders,
  industrialRequirements,
  payments,
  tasks,
} from "@db/schema";
import {
  INDUSTRIAL_ORDER_PAYMENT_PURPOSE,
  INDUSTRIAL_ORDER_PAYMENT_TARGET,
  IndustrialPaymentError,
  industrialProviderAmountMatches,
  isIndustrialOrderPaymentAuthorized,
  providerCurrencyMatches,
  resolveIndustrialOrderPaymentAmount,
} from "./orderPaymentPolicy";
import { ensureIndustrialFulfillmentPlan } from "./fulfillment";

export {
  INDUSTRIAL_ORDER_PAYMENT_PURPOSE,
  INDUSTRIAL_ORDER_PAYMENT_TARGET,
  IndustrialPaymentError,
  industrialProviderAmountMatches,
  isIndustrialOrderPaymentAuthorized,
  providerCurrencyMatches,
  resolveIndustrialOrderPaymentAmount,
} from "./orderPaymentPolicy";

const INDUSTRIAL_FULFILMENT_GOAL_TITLE = "Industrial order fulfilment";

function organizationKey(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const key = (value as Record<string, unknown>).organizationKey;
  return typeof key === "string" ? key.trim() : "";
}

export async function loadAuthorizedIndustrialOrder(input: {
  tenantId: number;
  orderId: string;
  userId?: number | null;
  userEmail?: string | null;
  isAdmin?: boolean;
}) {
  const [row] = await db
    .select({
      order: industrialOrders,
      requirement: industrialRequirements,
      contact: contacts,
    })
    .from(industrialOrders)
    .innerJoin(
      industrialRequirements,
      and(
        eq(industrialRequirements.id, industrialOrders.requirementId),
        eq(industrialRequirements.tenantId, industrialOrders.tenantId),
      ),
    )
    .leftJoin(contacts, eq(contacts.id, industrialRequirements.customerContactId))
    .where(
      and(
        eq(industrialOrders.id, input.orderId),
        eq(industrialOrders.tenantId, input.tenantId),
      ),
    )
    .limit(1);

  if (!row?.order || !row.requirement) {
    throw new IndustrialPaymentError(
      "industrial_order_not_found",
      "Industrial order not found.",
      404,
    );
  }

  const authorized = isIndustrialOrderPaymentAuthorized({
    isAdmin: Boolean(input.isAdmin),
    userId: input.userId,
    userEmail: input.userEmail,
    requesterUserId: row.requirement.requesterUserId,
    requesterEmail: row.requirement.requesterEmail,
    contactPrimaryEmail: row.contact?.primaryEmail,
    contactEmails: row.contact?.emails,
    contactLegacyEmail: row.contact?.email,
  });
  if (!authorized) {
    throw new IndustrialPaymentError(
      "industrial_order_forbidden",
      "This industrial order does not belong to the current customer.",
      403,
    );
  }

  return row;
}

export async function loadAuthorizedIndustrialOrderPaymentTarget(input: {
  tenantId: number;
  orderId: string;
  userId?: number | null;
  userEmail?: string | null;
  isAdmin?: boolean;
}) {
  const row = await loadAuthorizedIndustrialOrder(input);
  if (row.order.status === "cancelled" || row.order.status === "completed") {
    throw new IndustrialPaymentError(
      "industrial_order_not_payable",
      "This industrial order is no longer open for payment.",
      409,
    );
  }
  if (row.order.paymentStatus === "paid") {
    throw new IndustrialPaymentError(
      "industrial_order_already_paid",
      "This industrial order has already been paid.",
      409,
    );
  }

  const canonical = resolveIndustrialOrderPaymentAmount({
    totalAmount: row.order.totalAmount,
    totalAmountMinor: row.order.totalAmountMinor,
    currencyCode: row.order.currencyCode,
  });
  return { ...row, ...canonical };
}

export async function markIndustrialOrderPaymentPending(input: {
  tenantId: number;
  orderId: string;
  paymentId: string;
}) {
  const [order] = await db
    .select({ paymentStatus: industrialOrders.paymentStatus })
    .from(industrialOrders)
    .where(
      and(
        eq(industrialOrders.id, input.orderId),
        eq(industrialOrders.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  if (!order || order.paymentStatus === "paid") return;

  await db
    .update(industrialOrders)
    .set({
      paymentStatus: "pending",
      lastPaymentId: input.paymentId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(industrialOrders.id, input.orderId),
        eq(industrialOrders.tenantId, input.tenantId),
      ),
    );
}

async function createProcurementReleaseTask(
  tx: any,
  input: {
    tenantId: number;
    orderId: string;
    requirementId: string;
    referenceCode: string;
    requirementTitle: string;
    paymentId: string;
    amount: string;
    currency: string;
  },
) {
  const tenantAgents = await tx
    .select({
      id: agents.id,
      companyId: agents.companyId,
      name: agents.name,
      metadata: agents.metadata,
    })
    .from(agents)
    .where(and(eq(agents.tenantId, input.tenantId), eq(agents.status, "active")));
  const byKey = new Map<string, (typeof tenantAgents)[number]>();
  for (const agent of tenantAgents) {
    const key = organizationKey(agent.metadata);
    if (key && !byKey.has(key)) byKey.set(key, agent);
  }

  const primaryAgent = byKey.get("sourcing") || byKey.get("finance") || byKey.get("logistics");
  const companyId = Number(
    primaryAgent?.companyId ||
      tenantAgents.find((agent: any) => Number(agent.companyId) > 0)?.companyId ||
      0,
  );
  if (!primaryAgent?.id || !companyId) {
    return {
      taskId: null,
      assignedAgentId: null,
      participantAgentIds: [] as number[],
      created: false,
      reason: "The industrial employee organization is not available for procurement routing.",
    };
  }

  const participantAgentIds = Array.from(
    new Set(
      ["sourcing", "finance", "logistics"]
        .map((key) => Number(byKey.get(key)?.id || 0))
        .filter((id) => id > 0),
    ),
  );
  let [goal] = await tx
    .select({ id: goals.id })
    .from(goals)
    .where(
      and(
        eq(goals.companyId, companyId),
        eq(goals.title, INDUSTRIAL_FULFILMENT_GOAL_TITLE),
      ),
    )
    .orderBy(desc(goals.updatedAt), desc(goals.id))
    .limit(1);

  if (!goal?.id) {
    [goal] = await tx
      .insert(goals)
      .values({
        companyId,
        ownerAgentId: primaryAgent.id,
        title: INDUSTRIAL_FULFILMENT_GOAL_TITLE,
        description:
          "Convert verified customer payments into controlled procurement, quality, logistics, and delivery execution.",
        status: "in_progress",
        priority: "high",
        metadata: {
          source: "exportunity_industrial_order_payment",
          externalActionsRequireApproval: true,
        } as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: goals.id });
  }

  const taskTitle = `Release ${input.referenceCode} for procurement`.slice(0, 240);
  let [task] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.companyId, companyId), eq(tasks.title, taskTitle)))
    .orderBy(desc(tasks.id))
    .limit(1);
  let created = false;

  if (!task?.id && goal?.id) {
    [task] = await tx
      .insert(tasks)
      .values({
        agentId: primaryAgent.id,
        companyId,
        goalId: goal.id,
        objectiveId: goal.id,
        title: taskTitle,
        description: [
          `Customer payment is verified for industrial order ${input.referenceCode}.`,
          `Requirement: ${input.requirementTitle}`,
          `Paid: ${input.amount} ${input.currency}.`,
          "Review the accepted quotation, supplier terms, quality evidence, logistics route, and payment controls before releasing procurement.",
          "Do not contact a supplier, transfer funds, or book logistics without the visible approval required by Exportunity governance.",
        ].join("\n"),
        priority: "high",
        status: "backlog",
        executionType: "procurement_release",
        urgencyScore: 9,
        importanceScore: 9,
        dependencyScore: 8,
        isAutomated: false,
        isGroupTask: participantAgentIds.length > 1,
        participantAgentIds,
        approvalStatus: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: tasks.id });
    created = Boolean(task?.id);
  }

  if (created && task?.id) {
    await tx.insert(activityLog).values({
      companyId,
      agentId: primaryAgent.id,
      eventType: "industrial_payment",
      eventCategory: "operations",
      title: `Payment verified for ${input.referenceCode}`,
      description: `${primaryAgent.name} must review the procurement release with Finance and Logistics before any external action.`,
      metadata: {
        taskId: task.id,
        orderId: input.orderId,
        requirementId: input.requirementId,
        paymentId: input.paymentId,
        participantAgentIds,
        externalActionsStarted: false,
      } as any,
      createdAt: new Date(),
    });
  }

  return {
    taskId: task?.id ? Number(task.id) : null,
    assignedAgentId: Number(primaryAgent.id),
    participantAgentIds,
    created,
    reason: null,
  };
}

export async function applyIndustrialOrderPaymentSucceeded(input: {
  tenantId: number;
  paymentId: string;
  actorUserId?: number | null;
}) {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.id, input.paymentId),
          eq(payments.tenantId, input.tenantId),
        ),
      )
      .limit(1);
    if (!payment) {
      throw new IndustrialPaymentError(
        "industrial_payment_not_found",
        "Industrial payment not found.",
        404,
      );
    }

    const purpose = String(payment.purpose || "").trim().toUpperCase();
    const targetType = String(payment.targetType || "").trim().toUpperCase();
    const orderId = String(payment.targetId || "").trim();
    if (
      purpose !== INDUSTRIAL_ORDER_PAYMENT_PURPOSE ||
      targetType !== INDUSTRIAL_ORDER_PAYMENT_TARGET ||
      !orderId
    ) {
      throw new IndustrialPaymentError(
        "industrial_payment_target_invalid",
        "The payment is not linked to an industrial order.",
        409,
      );
    }
    if (String(payment.status || "").trim().toLowerCase() !== "succeeded") {
      throw new IndustrialPaymentError(
        "industrial_payment_not_verified",
        "The payment provider has not confirmed this industrial payment.",
        409,
      );
    }

    await tx.execute(sql`
      select pg_advisory_xact_lock(
        ${input.tenantId},
        hashtext(${`industrial-order-payment:${orderId}`})
      )
    `);

    const [row] = await tx
      .select({ order: industrialOrders, requirement: industrialRequirements })
      .from(industrialOrders)
      .innerJoin(
        industrialRequirements,
        and(
          eq(industrialRequirements.id, industrialOrders.requirementId),
          eq(industrialRequirements.tenantId, industrialOrders.tenantId),
        ),
      )
      .where(
        and(
          eq(industrialOrders.id, orderId),
          eq(industrialOrders.tenantId, input.tenantId),
        ),
      )
      .limit(1);
    if (!row?.order || !row.requirement) {
      throw new IndustrialPaymentError(
        "industrial_order_not_found",
        "Industrial order not found.",
        404,
      );
    }

    const canonical = resolveIndustrialOrderPaymentAmount({
      totalAmount: row.order.totalAmount,
      totalAmountMinor: row.order.totalAmountMinor,
      currencyCode: row.order.currencyCode,
    });
    if (
      String(payment.amount ?? "").trim() !== canonical.amountMinorText ||
      String(payment.currency || "").trim().toUpperCase() !== canonical.currency
    ) {
      throw new IndustrialPaymentError(
        "industrial_payment_amount_mismatch",
        "The confirmed payment does not match the industrial order total.",
        409,
      );
    }

    if (row.order.paymentStatus === "paid") {
      await tx
        .update(payments)
        .set({ creditedAt: payment.creditedAt || new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(payments.id, payment.id),
            eq(payments.tenantId, input.tenantId),
          ),
        );
      const fulfillment = await ensureIndustrialFulfillmentPlan(
        {
          tenantId: input.tenantId,
          orderId,
          paymentId: payment.id,
          publicEta: row.order.plannedDeliveryAt || null,
          routeSnapshot: {
            destinationCountryCode: row.requirement.deliveryCountryCode || null,
            destinationCity: row.requirement.deliveryCity || null,
            requirementReferenceCode: row.requirement.referenceCode,
          },
          actorUserId: input.actorUserId || null,
        },
        tx,
      );
      return {
        status: "existing" as const,
        orderId,
        fulfillmentPlanId: fulfillment.plan.id,
        procurementTaskId: null,
        assignedAgentId: null,
        participantAgentIds: [] as number[],
      };
    }

    const paidAt = new Date();
    await tx
      .update(industrialOrders)
      .set({
        paymentStatus: "paid",
        paidAmount: canonical.gatewayAmount,
        paidCurrencyCode: canonical.currency,
        paidAt,
        lastPaymentId: payment.id,
        updatedAt: paidAt,
      })
      .where(
        and(
          eq(industrialOrders.id, orderId),
          eq(industrialOrders.tenantId, input.tenantId),
        ),
      );

    await tx
      .update(payments)
      .set({ creditedAt: paidAt, updatedAt: paidAt })
      .where(
        and(
          eq(payments.id, payment.id),
          eq(payments.tenantId, input.tenantId),
        ),
      );

    await tx
      .update(industrialRequirements)
      .set({
        nextAction:
          "Payment verified. Procurement release is awaiting accountable employee review.",
        nextActionAt: paidAt,
        updatedAt: paidAt,
      })
      .where(
        and(
          eq(industrialRequirements.id, row.requirement.id),
          eq(industrialRequirements.tenantId, input.tenantId),
        ),
      );

    const handoff = await createProcurementReleaseTask(tx, {
      tenantId: input.tenantId,
      orderId,
      requirementId: row.requirement.id,
      referenceCode: row.order.referenceCode,
      requirementTitle: row.requirement.title,
      paymentId: payment.id,
      amount: canonical.gatewayAmount,
      currency: canonical.currency,
    });
    const fulfillment = await ensureIndustrialFulfillmentPlan(
      {
        tenantId: input.tenantId,
        orderId,
        paymentId: payment.id,
        procurementTaskId: handoff.taskId,
        publicEta: row.order.plannedDeliveryAt || null,
        routeSnapshot: {
          destinationCountryCode: row.requirement.deliveryCountryCode || null,
          destinationCity: row.requirement.deliveryCity || null,
          requirementReferenceCode: row.requirement.referenceCode,
        },
        actorUserId: input.actorUserId || null,
      },
      tx,
    );

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId || null,
      action: "industrial_order.payment_received",
      entityType: "industrial_order",
      entityId: row.order.id,
      reason:
        "Payment provider confirmation matched the canonical industrial order amount and currency.",
      previousValue: {
        paymentStatus: row.order.paymentStatus,
        paidAmount: row.order.paidAmount,
        paidCurrencyCode: row.order.paidCurrencyCode,
      },
      nextValue: {
        paymentStatus: "paid",
        paidAmount: canonical.gatewayAmount,
        paidCurrencyCode: canonical.currency,
        procurementTaskId: handoff.taskId,
        fulfillmentPlanId: fulfillment.plan.id,
      },
      metadata: {
        paymentId: payment.id,
        provider: payment.provider,
        providerTransactionId: payment.providerTransactionId,
        procurementTaskCreated: handoff.created,
        procurementTaskReason: handoff.reason,
        externalActionsStarted: false,
      },
      createdAt: paidAt,
    });

    return {
      status: "applied" as const,
      orderId,
      fulfillmentPlanId: fulfillment.plan.id,
      procurementTaskId: handoff.taskId,
      assignedAgentId: handoff.assignedAgentId,
      participantAgentIds: handoff.participantAgentIds,
    };
  });
}

export async function syncIndustrialOrderPaymentState(input: {
  tenantId: number;
  paymentId: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "cancelled";
  actorUserId?: number | null;
}) {
  if (input.status === "succeeded") {
    return applyIndustrialOrderPaymentSucceeded(input);
  }

  const [payment] = await db
    .select({
      purpose: payments.purpose,
      targetType: payments.targetType,
      targetId: payments.targetId,
    })
    .from(payments)
    .where(
      and(
        eq(payments.id, input.paymentId),
        eq(payments.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  if (
    String(payment?.purpose || "").trim().toUpperCase() !==
      INDUSTRIAL_ORDER_PAYMENT_PURPOSE ||
    String(payment?.targetType || "").trim().toUpperCase() !==
      INDUSTRIAL_ORDER_PAYMENT_TARGET ||
    !payment?.targetId
  ) {
    return null;
  }

  const [order] = await db
    .select({
      paymentStatus: industrialOrders.paymentStatus,
      lastPaymentId: industrialOrders.lastPaymentId,
    })
    .from(industrialOrders)
    .where(
      and(
        eq(industrialOrders.id, payment.targetId),
        eq(industrialOrders.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  if (!order || order.paymentStatus === "paid") return null;
  if (order.lastPaymentId && order.lastPaymentId !== input.paymentId) {
    return {
      status: "stale" as const,
      orderId: payment.targetId,
      ignoredPaymentId: input.paymentId,
    };
  }

  await db
    .update(industrialOrders)
    .set({
      paymentStatus:
        input.status === "failed" || input.status === "cancelled"
          ? "failed"
          : "pending",
      lastPaymentId: input.paymentId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(industrialOrders.id, payment.targetId),
        eq(industrialOrders.tenantId, input.tenantId),
      ),
    );
  return { status: input.status, orderId: payment.targetId };
}
