import { and, desc, eq } from "drizzle-orm";

import { db } from "@db";
import { activityLog, agents, goals, tasks } from "@db/schema";

export type IndustrialRequirementHandoffType =
  | "machinery"
  | "raw_material"
  | "industrial_input"
  | "spare_part"
  | "custom_manufacturing"
  | "industrial_service"
  | "export_quotation";

export type IndustrialRequirementHandoffUrgency =
  "standard" | "urgent" | "planned";

type HandoffAgentKey =
  "tassi" | "commercial" | "technical" | "sourcing" | "logistics" | "quality";

export type IndustrialRequirementHandoffPlan = {
  primaryAgentKey: HandoffAgentKey;
  participantAgentKeys: HandoffAgentKey[];
  priority: "medium" | "high" | "critical";
  urgencyScore: number;
};

export type IndustrialRequirementOperationsHandoffInput = {
  tenantId: number;
  requirementId: string;
  referenceCode: string;
  requirementType: IndustrialRequirementHandoffType;
  categoryCode: string;
  title: string;
  details: string;
  quantityText?: string | null;
  deliveryCountryCode?: string | null;
  deliveryCity?: string | null;
  urgency: IndustrialRequirementHandoffUrgency;
  requesterCompany?: string | null;
  requesterName: string;
};

export type IndustrialRequirementOperationsHandoffResult = {
  status: "created" | "existing" | "unavailable";
  taskId: number | null;
  companyId: number | null;
  assignedAgentId: number | null;
  assignedAgentName: string | null;
  participantAgentIds: number[];
  reason?: string;
};

const INDUSTRIAL_INTAKE_GOAL_TITLE = "Industrial demand intake";

export function resolveIndustrialRequirementHandoffPlan(input: {
  requirementType: IndustrialRequirementHandoffType;
  urgency: IndustrialRequirementHandoffUrgency;
}): IndustrialRequirementHandoffPlan {
  // Awa owns the buyer relationship. Specialist agents join the same case for
  // technical, sourcing, quality, and logistics work without fragmenting the
  // client's commercial conversation.
  const primaryAgentKey: HandoffAgentKey = "commercial";

  const participantKeys = new Set<HandoffAgentKey>([
    primaryAgentKey,
    "commercial",
    "tassi",
  ]);

  if (
    input.requirementType === "machinery" ||
    input.requirementType === "spare_part" ||
    input.requirementType === "custom_manufacturing"
  ) {
    participantKeys.add("technical");
    participantKeys.add("sourcing");
  }

  if (
    input.requirementType === "raw_material" ||
    input.requirementType === "industrial_input"
  ) {
    participantKeys.add("sourcing");
  }

  if (
    input.requirementType === "spare_part" ||
    input.requirementType === "custom_manufacturing"
  ) {
    participantKeys.add("quality");
  }

  if (input.requirementType === "export_quotation") {
    participantKeys.add("sourcing");
    participantKeys.add("logistics");
  }

  if (input.requirementType === "industrial_service") {
    participantKeys.add("technical");
    participantKeys.add("logistics");
  }

  return {
    primaryAgentKey,
    participantAgentKeys: Array.from(participantKeys),
    priority:
      input.urgency === "urgent"
        ? "critical"
        : input.urgency === "planned"
          ? "medium"
          : "high",
    urgencyScore:
      input.urgency === "urgent" ? 10 : input.urgency === "planned" ? 4 : 7,
  };
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function organizationKey(value: unknown): string {
  const key = asMetadata(value).organizationKey;
  return typeof key === "string" ? key.trim() : "";
}

function buildTaskDescription(
  input: IndustrialRequirementOperationsHandoffInput,
) {
  const delivery = [input.deliveryCity, input.deliveryCountryCode]
    .filter((value): value is string => Boolean(String(value || "").trim()))
    .join(", ");
  const requester = [input.requesterCompany, input.requesterName]
    .filter((value): value is string => Boolean(String(value || "").trim()))
    .join(" - ");

  return [
    `Public industrial requirement ${input.referenceCode}.`,
    `Type: ${input.requirementType}. Category: ${input.categoryCode}. Urgency: ${input.urgency}.`,
    `Request: ${input.title}`,
    `Details: ${input.details}`,
    input.quantityText ? `Quantity: ${input.quantityText}` : null,
    delivery ? `Delivery context: ${delivery}` : null,
    requester ? `Requester: ${requester}` : null,
    "Review the technical and commercial case before any supplier, logistics, payment, or contract action. External outreach remains subject to visible human approval.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function createIndustrialRequirementOperationsHandoff(
  input: IndustrialRequirementOperationsHandoffInput,
): Promise<IndustrialRequirementOperationsHandoffResult> {
  const plan = resolveIndustrialRequirementHandoffPlan(input);
  const tenantAgents = await db.query.agents.findMany({
    where: and(
      eq(agents.tenantId, input.tenantId),
      eq(agents.status, "active"),
    ),
    columns: {
      id: true,
      companyId: true,
      name: true,
      metadata: true,
    },
  });
  const byKey = new Map(
    tenantAgents
      .map((agent) => [organizationKey(agent.metadata), agent] as const)
      .filter(([key]) => key),
  );
  const primaryAgent = byKey.get(plan.primaryAgentKey);
  const companyId = Number(
    primaryAgent?.companyId ||
      tenantAgents.find((agent) => Number(agent.companyId) > 0)?.companyId ||
      0,
  );

  if (!primaryAgent || !companyId) {
    return {
      status: "unavailable",
      taskId: null,
      companyId: companyId || null,
      assignedAgentId: primaryAgent?.id ? Number(primaryAgent.id) : null,
      assignedAgentName: primaryAgent?.name || null,
      participantAgentIds: [],
      reason:
        "The Exportunity industrial agent organization is not available for task routing.",
    };
  }

  const participantAgentIds = plan.participantAgentKeys
    .map((key) => byKey.get(key)?.id)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const taskTitle = `Review ${input.referenceCode}: ${input.title}`.slice(
    0,
    240,
  );
  const existingTask = await db.query.tasks.findFirst({
    where: and(eq(tasks.companyId, companyId), eq(tasks.title, taskTitle)),
    columns: { id: true, agentId: true },
    orderBy: [desc(tasks.id)],
  });

  if (existingTask?.id) {
    return {
      status: "existing",
      taskId: Number(existingTask.id),
      companyId,
      assignedAgentId: Number(existingTask.agentId || primaryAgent.id),
      assignedAgentName: primaryAgent.name,
      participantAgentIds,
    };
  }

  let goal = await db.query.goals.findFirst({
    where: and(
      eq(goals.companyId, companyId),
      eq(goals.title, INDUSTRIAL_INTAKE_GOAL_TITLE),
    ),
    columns: { id: true },
    orderBy: [desc(goals.updatedAt), desc(goals.id)],
  });

  if (!goal?.id) {
    const [createdGoal] = await db
      .insert(goals)
      .values({
        companyId,
        ownerAgentId: primaryAgent.id,
        title: INDUSTRIAL_INTAKE_GOAL_TITLE,
        description:
          "Review and route public Exportunity B2B requirements into accountable technical, sourcing, commercial, quality, and logistics work.",
        status: "in_progress",
        priority: "high",
        metadata: {
          source: "exportunity_industrial_front_office",
          companyContext:
            "B2B industrial sourcing, commodities, machinery, and trade facilitation.",
        } as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: goals.id });
    goal = createdGoal || null;
  }

  if (!goal?.id) {
    return {
      status: "unavailable",
      taskId: null,
      companyId,
      assignedAgentId: primaryAgent.id,
      assignedAgentName: primaryAgent.name,
      participantAgentIds,
      reason:
        "The Operations Center objective could not be prepared for this industrial requirement.",
    };
  }

  const now = new Date();
  const [task] = await db
    .insert(tasks)
    .values({
      agentId: primaryAgent.id,
      companyId,
      goalId: goal.id,
      objectiveId: goal.id,
      title: taskTitle,
      description: buildTaskDescription(input),
      priority: plan.priority,
      status: "backlog",
      executionType: "industrial_intake",
      urgencyScore: plan.urgencyScore,
      importanceScore: 8,
      dependencyScore: 5,
      isAutomated: false,
      isGroupTask: participantAgentIds.length > 1,
      participantAgentIds,
      approvalStatus: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tasks.id });

  if (!task?.id) {
    return {
      status: "unavailable",
      taskId: null,
      companyId,
      assignedAgentId: primaryAgent.id,
      assignedAgentName: primaryAgent.name,
      participantAgentIds,
      reason:
        "The Operations Center task could not be created for this industrial requirement.",
    };
  }

  await db.insert(activityLog).values({
    companyId,
    agentId: primaryAgent.id,
    eventType: "industrial_intake",
    eventCategory: "operations",
    title: `New industrial case ${input.referenceCode}`,
    description: `Assigned to ${primaryAgent.name} for an accountable internal review before any external action.`,
    metadata: {
      taskId: task.id,
      requirementId: input.requirementId,
      referenceCode: input.referenceCode,
      requirementType: input.requirementType,
      categoryCode: input.categoryCode,
      participantAgentIds,
      source: "exportunity_industrial_front_office",
    } as any,
    createdAt: now,
  });

  return {
    status: "created",
    taskId: Number(task.id),
    companyId,
    assignedAgentId: primaryAgent.id,
    assignedAgentName: primaryAgent.name,
    participantAgentIds,
  };
}
