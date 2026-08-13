import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@db";
import {
  activityLog,
  actionRequests,
  agents,
  companies,
  industrialAuditLogs,
  industrialProductRequirements,
  industrialRequirements,
  tasks,
} from "@db/schema";
import { createActionRequest } from "../actions/ActionRouter";
import { isAgentRunnableStatus } from "../agents/visibility";
import { runAgentTask } from "../agent-os/router";
import { updateTaskStatus } from "../taskLifecycleService";
import type { IndustrialRequirementOperationsHandoffResult } from "./operationsHandoff";
import {
  loadIndustrialOpportunityExecutions,
  nextActionForIndustrialExecution,
} from "./opportunityExecution";

export const INDUSTRIAL_AGENT_TASK_INTENT =
  "industrial_opportunity_workstream";

type TextValue = string | null | undefined;

export type IndustrialAgentWorkFacts = {
  requirementId: string;
  referenceCode: string;
  requirementType: string;
  categoryCode: string;
  title: string;
  details: string;
  quantityText?: TextValue;
  deliveryCountryCode?: TextValue;
  deliveryCity?: TextValue;
  requiredBy?: Date | null;
  urgency?: TextValue;
  requesterCompany?: TextValue;
  requesterName?: TextValue;
  commercialIntent?: TextValue;
  commercialActionMode?: TextValue;
  product?: {
    name?: TextValue;
    category?: TextValue;
    specification?: TextValue;
    quantity?: TextValue;
    unit?: TextValue;
    origin?: TextValue;
    destination?: TextValue;
    targetPrice?: TextValue;
    currency?: TextValue;
    deadline?: TextValue;
    frequency?: TextValue;
    incoterm?: TextValue;
    customerType?: TextValue;
    missingFields?: string[] | null;
  } | null;
  task: {
    id: number;
    title: string;
    description: string;
    workstreamKey: string;
  };
  agent: {
    id: number;
    name: string;
    role: string;
  };
};

export type QueuedIndustrialAgentWork = {
  actionRequestId: number;
  publicActionId: string | null;
  taskId: number;
  agentId: number;
  agentName: string;
  workstreamKey: string;
  status: string;
  reused?: boolean;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatFact(label: string, value: unknown) {
  const text = cleanText(value);
  return text ? `${label}: ${text}` : `${label}: not provided`;
}

function formatDate(value: Date | null | undefined) {
  if (!value || Number.isNaN(value.valueOf())) return "not provided";
  return value.toISOString().slice(0, 10);
}

export function buildIndustrialAgentTaskInstruction(
  facts: IndustrialAgentWorkFacts,
) {
  const missingFields = facts.product?.missingFields?.filter(Boolean) || [];
  const quantity = [facts.product?.quantity, facts.product?.unit]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
  const delivery = [
    facts.product?.destination || facts.deliveryCity,
    facts.deliveryCountryCode,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(", ");

  return [
    "Execute this internal Exportunity commercial-opportunity workstream.",
    "Use only the canonical case facts below and relevant company knowledge. Treat all unverified information as unverified.",
    "",
    "CASE",
    `Reference: ${facts.referenceCode}`,
    `Requirement ID: ${facts.requirementId}`,
    `Commercial intent: ${cleanText(facts.commercialIntent) || "not classified"}`,
    `Action mode: ${cleanText(facts.commercialActionMode) || "internal review"}`,
    `Requirement type: ${facts.requirementType}`,
    `Category: ${facts.categoryCode}`,
    `Request: ${facts.title}`,
    `Details: ${facts.details}`,
    formatFact("Product", facts.product?.name),
    formatFact("Product category", facts.product?.category),
    formatFact("Specification", facts.product?.specification),
    formatFact("Quantity", quantity || facts.quantityText),
    formatFact("Origin preference", facts.product?.origin),
    formatFact("Destination", delivery),
    formatFact("Target price", facts.product?.targetPrice),
    formatFact("Currency", facts.product?.currency),
    formatFact("Frequency", facts.product?.frequency),
    formatFact("Incoterm", facts.product?.incoterm),
    `Required by: ${cleanText(facts.product?.deadline) || formatDate(facts.requiredBy)}`,
    formatFact("Urgency", facts.urgency),
    formatFact("Customer type", facts.product?.customerType),
    formatFact("Requester company", facts.requesterCompany),
    formatFact("Requester", facts.requesterName),
    `Missing qualification fields: ${missingFields.length ? missingFields.join(", ") : "none recorded"}`,
    "",
    "ASSIGNMENT",
    `Employee: ${facts.agent.name}`,
    `Role: ${facts.agent.role}`,
    `Workstream: ${facts.task.workstreamKey}`,
    `Task: ${facts.task.title}`,
    facts.task.description,
    "",
    "CONTROL BOUNDARY",
    "This is internal analysis only. Do not send messages, contact suppliers, book transport, move money, accept terms, sign contracts, or claim that any external action occurred.",
    "Do not invent suppliers, prices, stock, certifications, quotations, contacts, or completed checks. Distinguish facts, assumptions, missing evidence, and recommendations.",
    "If evidence is insufficient, state exactly what is missing and which controlled next action should be proposed for approval.",
    "",
    "Return a concise review using exactly these headings:",
    "FINDINGS",
    "EVIDENCE USED",
    "MISSING EVIDENCE",
    "RISKS",
    "RECOMMENDED NEXT ACTIONS",
    "REVIEW STATUS: READY_FOR_REVIEW or BLOCKED_NEEDS_INPUT",
  ].join("\n");
}

export function summarizeIndustrialAgentOutput(value: unknown, max = 640) {
  const normalized = cleanText(value).replace(/\s+/g, " ");
  if (!normalized) return "No review output was produced.";
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, Math.max(1, max - 3)).trimEnd()}...`;
}

function priorityValue(value: unknown) {
  const priority = cleanText(value).toLowerCase();
  if (priority === "urgent" || priority === "critical") return 90;
  if (priority === "high") return 70;
  if (priority === "low") return 30;
  return 50;
}

function queuedWorkFromAction(input: {
  row: any;
  taskId: number;
  agentId: number;
  agentName: string;
  workstreamKey: string;
  reused?: boolean;
}): QueuedIndustrialAgentWork {
  return {
    actionRequestId: Number(input.row.id),
    publicActionId: cleanText(input.row.publicActionId) || null,
    taskId: input.taskId,
    agentId: input.agentId,
    agentName: input.agentName,
    workstreamKey: input.workstreamKey,
    status: cleanText(input.row.status) || "QUEUED",
    reused: input.reused,
  };
}

export async function queueIndustrialOpportunityAgentWork(input: {
  tenantId: number;
  requirementId: string;
  referenceCode: string;
  sourceConversationId?: string | null;
  handoff: IndustrialRequirementOperationsHandoffResult;
  requestedByUserId?: number | null;
}) {
  if (!input.handoff.taskId || !input.handoff.companyId) return [];

  const queued: QueuedIndustrialAgentWork[] = [];
  for (const workstream of input.handoff.workstreams) {
    if (!workstream.taskId || !workstream.agentId) continue;
    const row = await createActionRequest({
      tenantId: input.tenantId,
      requestedByUserId: input.requestedByUserId || null,
      requestedByAgentKey: "commercial",
      actionType: "RUN_AGENT_TASK",
      payload: {
        agentId: workstream.agentId,
        companyId: input.handoff.companyId,
        taskId: workstream.taskId,
        requirementId: input.requirementId,
        referenceCode: input.referenceCode,
        workstreamKey: workstream.key,
        executionScope: "industrial_opportunity",
      },
      mode: "REAL",
      priority: priorityValue(workstream.status),
      idempotencyKey: `industrial-agent-task:${workstream.taskId}:v1`,
      correlationId: `industrial-requirement:${input.requirementId}`,
      relatedConversationId: input.sourceConversationId || null,
      isAdmin: true,
    });
    queued.push(
      queuedWorkFromAction({
        row,
        taskId: workstream.taskId,
        agentId: workstream.agentId,
        agentName: workstream.agentName,
        workstreamKey: workstream.key,
      }),
    );
  }

  if (!queued.length) return queued;
  const now = new Date();
  const queuedTaskIds = queued.map((item) => item.taskId);
  await Promise.all([
    db
      .update(tasks)
      .set({
        status: "in_progress",
        approvalStatus: "approved",
        isAutomated: true,
        updatedAt: now,
      })
      .where(eq(tasks.id, input.handoff.taskId)),
    db
      .update(tasks)
      .set({
        approvalStatus: "approved",
        isAutomated: true,
        updatedAt: now,
      })
      .where(inArray(tasks.id, queuedTaskIds)),
    db.insert(activityLog).values({
      companyId: input.handoff.companyId,
      agentId: input.handoff.assignedAgentId,
      eventType: "industrial_agent_work_queued",
      eventCategory: "operations",
      title: `${queued.length} agent workstreams queued for ${input.referenceCode}`,
      description:
        "The assigned internal employees were placed on the governed Agent OS queue. No external outreach or commercial commitment was started.",
      metadata: {
        taskId: input.handoff.taskId,
        requirementId: input.requirementId,
        referenceCode: input.referenceCode,
        actionRequestIds: queued.map((item) => item.actionRequestId),
        workstreamTaskIds: queuedTaskIds,
        agentIds: queued.map((item) => item.agentId),
        externalActionStarted: false,
      } as any,
      createdAt: now,
    }),
    db.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.requestedByUserId || null,
      action: "industrial_requirement.agent_work_queued",
      entityType: "industrial_requirement",
      entityId: input.requirementId,
      nextValue: {
        actionRequestIds: queued.map((item) => item.actionRequestId),
        taskIds: queued.map((item) => item.taskId),
      },
      metadata: {
        parentTaskId: input.handoff.taskId,
        workstreams: queued,
        externalActionStarted: false,
      },
    }),
  ]);

  return queued;
}

export async function queueIndustrialOpportunityWorkstream(input: {
  tenantId: number;
  requirementId: string;
  taskId: number;
  requestedByUserId?: number | null;
  sourceConversationId?: string | null;
}) {
  const context = await loadIndustrialAgentWorkContext({
    tenantId: input.tenantId,
    requirementId: input.requirementId,
    taskId: input.taskId,
  });
  const taskStatus = cleanText(context.task.status) || "backlog";
  if (!["backlog", "blocked"].includes(taskStatus)) {
    throw new Error(
      taskStatus === "in_progress"
        ? "This employee workstream is already running."
        : "Only queued or blocked employee workstreams can be run.",
    );
  }

  const activeAction = await db.query.actionRequests.findFirst({
    where: and(
      eq(actionRequests.tenantId, input.tenantId),
      eq(actionRequests.actionType, "RUN_AGENT_TASK"),
      inArray(actionRequests.status, [
        "PENDING",
        "QUEUED",
        "RUNNING",
        "REQUIRES_APPROVAL",
      ]),
      eq(
        sql<string>`${actionRequests.payload}->>'taskId'`,
        String(input.taskId),
      ),
    ),
    orderBy: [desc(actionRequests.id)],
  });
  if (activeAction) {
    return queuedWorkFromAction({
      row: activeAction,
      taskId: input.taskId,
      agentId: Number(context.agent.id),
      agentName: context.facts.agent.name,
      workstreamKey: context.facts.task.workstreamKey,
      reused: true,
    });
  }

  const previousAction = await db.query.actionRequests.findFirst({
    where: and(
      eq(actionRequests.tenantId, input.tenantId),
      eq(actionRequests.actionType, "RUN_AGENT_TASK"),
      eq(
        sql<string>`${actionRequests.payload}->>'taskId'`,
        String(input.taskId),
      ),
    ),
    orderBy: [desc(actionRequests.id)],
  });
  const runNumber = Number(previousAction?.id || 0) + 1;
  const started = await updateTaskStatus(
    input.taskId,
    "in_progress",
    "Queued for the assigned employee through the governed Agent OS action worker.",
  );
  if (!started.success) {
    throw new Error(started.error || "The employee workstream could not be queued.");
  }
  let row: any;
  try {
    row = await createActionRequest({
      tenantId: input.tenantId,
      requestedByUserId: input.requestedByUserId || null,
      requestedByAgentKey: "commercial",
      actionType: "RUN_AGENT_TASK",
      payload: {
        agentId: Number(context.agent.id),
        companyId: Number(context.task.companyId),
        taskId: input.taskId,
        requirementId: input.requirementId,
        referenceCode: context.requirement.referenceCode,
        workstreamKey: context.facts.task.workstreamKey,
        executionScope: "industrial_opportunity",
      },
      mode: "REAL",
      priority: priorityValue(context.task.priority),
      idempotencyKey: `industrial-agent-task:${input.taskId}:run:${runNumber}`,
      correlationId: `industrial-requirement:${input.requirementId}`,
      relatedConversationId: input.sourceConversationId || null,
      isAdmin: true,
    });
  } catch (error) {
    await updateTaskStatus(
      input.taskId,
      "blocked",
      `Agent OS queue creation failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    throw error;
  }
  const now = new Date();
  await Promise.all([
    db
      .update(tasks)
      .set({
        status: "in_progress",
        approvalStatus: "approved",
        isAutomated: true,
        updatedAt: now,
      })
      .where(eq(tasks.id, context.parentTaskId)),
    db
      .update(tasks)
      .set({ approvalStatus: "approved", isAutomated: true, updatedAt: now })
      .where(eq(tasks.id, input.taskId)),
    db.insert(activityLog).values({
      companyId: Number(context.task.companyId),
      agentId: Number(context.agent.id),
      eventType: "industrial_agent_work_queued",
      eventCategory: "operations",
      title: `${context.facts.agent.name} was queued for ${context.facts.task.workstreamKey}`,
      description:
        "The employee will perform an evidence-bound internal review. No supplier contact, payment, or commitment was started.",
      metadata: {
        taskId: input.taskId,
        requirementId: input.requirementId,
        actionRequestId: Number(row.id),
        externalActionStarted: false,
      } as any,
      createdAt: now,
    }),
    db.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.requestedByUserId || null,
      action: "industrial_requirement.agent_work_queued",
      entityType: "industrial_requirement",
      entityId: input.requirementId,
      nextValue: {
        taskId: input.taskId,
        actionRequestId: Number(row.id),
        status: "in_progress",
      },
      metadata: {
        parentTaskId: context.parentTaskId,
        agentId: context.agent.id,
        workstreamKey: context.facts.task.workstreamKey,
        externalActionStarted: false,
      },
    }),
  ]);

  return queuedWorkFromAction({
    row,
    taskId: input.taskId,
    agentId: Number(context.agent.id),
    agentName: context.facts.agent.name,
    workstreamKey: context.facts.task.workstreamKey,
  });
}

async function loadIndustrialAgentWorkContext(input: {
  tenantId: number;
  requirementId: string;
  taskId: number;
  payloadAgentId?: number | null;
  workstreamKey?: string | null;
}) {
  const requirement = await db.query.industrialRequirements.findFirst({
    where: and(
      eq(industrialRequirements.id, input.requirementId),
      eq(industrialRequirements.tenantId, input.tenantId),
    ),
  });
  if (!requirement) throw new Error("Industrial requirement not found for agent work.");

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, input.taskId),
  });
  if (!task || task.executionType !== "ind_workstream") {
    throw new Error("The selected task is not an industrial opportunity workstream.");
  }
  const handoff =
    requirement.metadata && typeof requirement.metadata === "object"
      ? ((requirement.metadata as any).operationsHandoff || {})
      : {};
  const parentTaskId = Number(handoff.taskId || 0);
  if (!parentTaskId || Number(task.parentTaskId || 0) !== parentTaskId) {
    throw new Error("The workstream is not linked to the canonical opportunity handoff.");
  }
  if (!task.companyId || !task.agentId) {
    throw new Error("The opportunity workstream has no company or assigned employee.");
  }
  if (input.payloadAgentId && Number(task.agentId) !== input.payloadAgentId) {
    throw new Error("The queued employee does not match the workstream assignment.");
  }

  const [company, agent, product] = await Promise.all([
    db.query.companies.findFirst({ where: eq(companies.id, task.companyId) }),
    db.query.agents.findFirst({ where: eq(agents.id, task.agentId) }),
    db.query.industrialProductRequirements.findFirst({
      where: and(
        eq(industrialProductRequirements.requirementId, requirement.id),
        eq(industrialProductRequirements.tenantId, input.tenantId),
      ),
    }),
  ]);
  if (!company || Number(company.tenantId || 0) !== input.tenantId) {
    throw new Error("The workstream company is outside the action tenant.");
  }
  if (
    !agent ||
    Number(agent.tenantId || 0) !== input.tenantId ||
    Number(agent.companyId || 0) !== Number(task.companyId) ||
    !isAgentRunnableStatus(agent.status) ||
    agent.isTest ||
    !agent.isVisible
  ) {
    throw new Error("The assigned employee is not available to execute this workstream.");
  }

  return {
    requirement,
    task,
    agent,
    parentTaskId,
    facts: {
      requirementId: requirement.id,
      referenceCode: requirement.referenceCode,
      requirementType: requirement.requirementType,
      categoryCode: requirement.categoryCode,
      title: requirement.title,
      details: requirement.details,
      quantityText: requirement.quantityText,
      deliveryCountryCode: requirement.deliveryCountryCode,
      deliveryCity: requirement.deliveryCity,
      requiredBy: requirement.requiredBy,
      urgency: requirement.urgency,
      requesterCompany: requirement.requesterCompany,
      requesterName: requirement.requesterName,
      commercialIntent: requirement.commercialIntent,
      commercialActionMode: requirement.commercialActionMode,
      product: product
        ? {
            name: product.productName,
            category: product.productCategory,
            specification: product.specification,
            quantity: product.quantityText,
            unit: product.unit,
            origin: product.origin,
            destination: product.destination,
            targetPrice: product.targetPrice,
            currency: product.currency,
            deadline: product.deadlineText,
            frequency: product.frequency,
            incoterm: product.incoterm,
            customerType: product.customerType,
            missingFields: product.missingFields,
          }
        : null,
      task: {
        id: Number(task.id),
        title: task.title,
        description: task.description,
        workstreamKey: cleanText(input.workstreamKey) || "specialist",
      },
      agent: {
        id: Number(agent.id),
        name: cleanText(agent.displayName) || agent.name,
        role: agent.role,
      },
    } satisfies IndustrialAgentWorkFacts,
  };
}

async function refreshIndustrialExecution(input: {
  tenantId: number;
  requirementId: string;
  metadata: unknown;
}) {
  const execution = (
    await loadIndustrialOpportunityExecutions({
      tenantId: input.tenantId,
      requirements: [{ id: input.requirementId, metadata: input.metadata }],
      includeTimeline: true,
    })
  ).get(input.requirementId);
  if (!execution) return null;
  const nextAction = nextActionForIndustrialExecution(execution);
  await db
    .update(industrialRequirements)
    .set({ nextAction, nextActionAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(industrialRequirements.id, input.requirementId),
        eq(industrialRequirements.tenantId, input.tenantId),
      ),
    );
  return { execution, nextAction };
}

export async function executeIndustrialOpportunityAgentWork(input: {
  tenantId: number;
  actionRequestId: number;
  requirementId: string;
  taskId: number;
  payloadAgentId?: number | null;
  workstreamKey?: string | null;
  correlationId?: string | null;
  conversationId?: string | null;
}) {
  const context = await loadIndustrialAgentWorkContext(input);
  const currentStatus = cleanText(context.task.status) || "backlog";
  if (currentStatus === "canceled") {
    throw new Error("Canceled opportunity workstreams cannot be executed.");
  }
  if (currentStatus !== "in_progress") {
    const started = await updateTaskStatus(
      input.taskId,
      "in_progress",
      "Claimed by the governed Agent OS action worker.",
    );
    if (!started.success) throw new Error(started.error || "Workstream could not be started.");
  }

  await db.insert(activityLog).values({
    companyId: Number(context.task.companyId),
    agentId: Number(context.agent.id),
    eventType: "industrial_agent_work_started",
    eventCategory: "operations",
    title: `${context.facts.agent.name} started ${context.facts.task.workstreamKey}`,
    description: `Agent OS began an evidence-bound review for ${context.requirement.referenceCode}.`,
    metadata: {
      taskId: input.taskId,
      requirementId: input.requirementId,
      actionRequestId: input.actionRequestId,
      externalActionStarted: false,
    } as any,
    createdAt: new Date(),
  });

  try {
    const instruction = buildIndustrialAgentTaskInstruction(context.facts);
    const result = await runAgentTask({
      agentId: Number(context.agent.id),
      companyId: Number(context.task.companyId),
      task: instruction,
      intent: INDUSTRIAL_AGENT_TASK_INTENT,
      entityId: `industrial_requirement:${input.requirementId}`,
      conversationId: input.conversationId || null,
      correlationId:
        input.correlationId || `industrial-requirement:${input.requirementId}`,
      vars: {
        requirementId: input.requirementId,
        taskId: input.taskId,
        referenceCode: context.requirement.referenceCode,
        workstreamKey: context.facts.task.workstreamKey,
      },
    });
    const error = cleanText(result.output.error);
    const message = cleanText(result.output.message);
    if (error || !message) {
      throw new Error(error || "The assigned employee produced no review output.");
    }

    const completed = await updateTaskStatus(
      input.taskId,
      "done",
      `Agent OS job ${result.jobId} produced a review for human inspection.`,
    );
    if (!completed.success) {
      throw new Error(completed.error || "Workstream completion could not be recorded.");
    }
    const summary = summarizeIndustrialAgentOutput(message);
    await Promise.all([
      db.insert(activityLog).values({
        companyId: Number(context.task.companyId),
        agentId: Number(context.agent.id),
        eventType: "industrial_agent_work_completed",
        eventCategory: "operations",
        title: `${context.facts.agent.name} completed ${context.facts.task.workstreamKey}`,
        description: summary,
        metadata: {
          taskId: input.taskId,
          requirementId: input.requirementId,
          actionRequestId: input.actionRequestId,
          agentJobId: result.jobId,
          routerDecision: result.decision.decision,
          output: message,
          provider: result.output.provider || null,
          model: result.output.model || null,
          reviewRequired: true,
          externalActionStarted: false,
        } as any,
        createdAt: new Date(),
      }),
      db.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        action: "industrial_requirement.agent_work_completed",
        entityType: "industrial_requirement",
        entityId: input.requirementId,
        nextValue: {
          taskId: input.taskId,
          status: "done",
          agentJobId: result.jobId,
        },
        metadata: {
          actionRequestId: input.actionRequestId,
          agentId: context.agent.id,
          workstreamKey: context.facts.task.workstreamKey,
          routerDecision: result.decision.decision,
          reviewRequired: true,
          externalActionStarted: false,
        },
      }),
    ]);
    const refreshed = await refreshIndustrialExecution({
      tenantId: input.tenantId,
      requirementId: input.requirementId,
      metadata: context.requirement.metadata,
    });
    return {
      actionType: "RUN_AGENT_TASK",
      requirementId: input.requirementId,
      taskId: input.taskId,
      agentId: Number(context.agent.id),
      agentName: context.facts.agent.name,
      workstreamKey: context.facts.task.workstreamKey,
      jobId: result.jobId,
      routerDecision: result.decision.decision,
      summary,
      output: message,
      provider: cleanText(result.output.provider) || null,
      model: cleanText(result.output.model) || null,
      executionStatus: refreshed?.execution.status || null,
      nextAction: refreshed?.nextAction || null,
      reviewRequired: true,
      externalActionStarted: false,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Industrial agent work failed.";
    const latestTask = await db.query.tasks.findFirst({
      where: eq(tasks.id, input.taskId),
      columns: { status: true },
    });
    if (latestTask?.status === "in_progress") {
      await updateTaskStatus(
        input.taskId,
        "blocked",
        `Agent OS execution blocked: ${message}`,
      );
    }
    await Promise.all([
      db.insert(activityLog).values({
        companyId: Number(context.task.companyId),
        agentId: Number(context.agent.id),
        eventType: "industrial_agent_work_blocked",
        eventCategory: "operations",
        title: `${context.facts.agent.name} could not complete ${context.facts.task.workstreamKey}`,
        description: message,
        metadata: {
          taskId: input.taskId,
          requirementId: input.requirementId,
          actionRequestId: input.actionRequestId,
          externalActionStarted: false,
        } as any,
        createdAt: new Date(),
      }),
      db.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        action: "industrial_requirement.agent_work_blocked",
        entityType: "industrial_requirement",
        entityId: input.requirementId,
        nextValue: { taskId: input.taskId, status: "blocked" },
        reason: message,
        metadata: {
          actionRequestId: input.actionRequestId,
          agentId: context.agent.id,
          workstreamKey: context.facts.task.workstreamKey,
          externalActionStarted: false,
        },
      }),
    ]);
    await refreshIndustrialExecution({
      tenantId: input.tenantId,
      requirementId: input.requirementId,
      metadata: context.requirement.metadata,
    });
    throw error;
  }
}
