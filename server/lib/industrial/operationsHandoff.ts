import { and, desc, eq } from "drizzle-orm";

import { db } from "@db";
import { activityLog, agents, goals, tasks } from "@db/schema";
import {
  industrialSpecialistKeys,
  resolveIndustrialRequirementHandoffPlan,
  type HandoffAgentKey,
  type IndustrialRequirementHandoffPlan,
  type IndustrialRequirementHandoffType,
  type IndustrialRequirementHandoffUrgency,
} from "./operationsHandoffPolicy";

export {
  industrialSpecialistKeys,
  resolveIndustrialRequirementHandoffPlan,
} from "./operationsHandoffPolicy";
export type {
  IndustrialRequirementHandoffPlan,
  IndustrialRequirementHandoffType,
  IndustrialRequirementHandoffUrgency,
} from "./operationsHandoffPolicy";

export type IndustrialRequirementWorkstream = {
  key: HandoffAgentKey;
  taskId: number;
  agentId: number;
  agentName: string;
  role: string;
  title: string;
  status: string;
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
  participants: Array<{
    key: HandoffAgentKey;
    agentId: number;
    agentName: string;
    role: string;
  }>;
  workstreams: IndustrialRequirementWorkstream[];
  missingSpecialistKeys: HandoffAgentKey[];
  reason?: string;
};

const INDUSTRIAL_INTAKE_GOAL_TITLE = "Industrial demand intake";

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

const WORKSTREAM_DEFINITIONS: Record<
  Exclude<HandoffAgentKey, "tassi" | "commercial">,
  { label: string; instruction: string }
> = {
  technical: {
    label: "Technical review",
    instruction:
      "Validate specifications, identify technical ambiguities, and record the evidence needed before supplier selection.",
  },
  sourcing: {
    label: "Supplier sourcing",
    instruction:
      "Build a traceable candidate-supplier shortlist and comparison criteria. Do not contact any supplier before approval.",
  },
  logistics: {
    label: "Logistics and delivery",
    instruction:
      "Assess route, delivery constraints, Incoterm implications, and missing transport information without booking freight.",
  },
  quality: {
    label: "Quality requirements",
    instruction:
      "Define required quality evidence, certifications, inspection points, and acceptance criteria.",
  },
  finance: {
    label: "Commercial finance",
    instruction:
      "Review target price, payment currency, payment terms, margin risks, and financial information still required.",
  },
  compliance: {
    label: "Trade compliance",
    instruction:
      "Identify counterparty, origin, destination, customs, sanctions, and documentary checks required before commitment.",
  },
};

type RoutedAgent = {
  id: number;
  companyId: number | null;
  name: string;
  role: string;
  metadata: unknown;
};

async function ensureSpecialistWorkstreams(input: {
  parentTaskId: number;
  companyId: number;
  goalId: number | null;
  referenceCode: string;
  requestTitle: string;
  plan: IndustrialRequirementHandoffPlan;
  byKey: Map<string, RoutedAgent>;
}) {
  const existing = await db.query.tasks.findMany({
    where: eq(tasks.parentTaskId, input.parentTaskId),
    columns: { id: true, agentId: true, title: true, status: true },
    orderBy: [desc(tasks.id)],
  });
  const byAgentId = new Map(
    existing
      .filter((task) => Number(task.agentId) > 0)
      .map((task) => [Number(task.agentId), task] as const),
  );
  const result: IndustrialRequirementWorkstream[] = [];
  const specialistKeys = industrialSpecialistKeys(input.plan);

  for (const key of specialistKeys) {
    const agent = input.byKey.get(key);
    if (!agent?.id) continue;
    const definition = WORKSTREAM_DEFINITIONS[key];
    const title = `${input.referenceCode} - ${definition.label}`.slice(0, 240);
    let workstream = byAgentId.get(Number(agent.id));
    if (!workstream) {
      const [created] = await db
        .insert(tasks)
        .values({
          agentId: agent.id,
          companyId: input.companyId,
          goalId: input.goalId,
          objectiveId: input.goalId,
          parentTaskId: input.parentTaskId,
          title,
          description: [
            `Specialist workstream for ${input.referenceCode}: ${input.requestTitle}.`,
            definition.instruction,
            "Record findings in the shared case. External outreach, payments, contracts, and public claims require visible human approval.",
          ].join("\n"),
          priority: input.plan.priority,
          status: "backlog",
          executionType: "ind_workstream",
          urgencyScore: input.plan.urgencyScore,
          importanceScore: 8,
          dependencyScore: 6,
          isAutomated: false,
          isGroupTask: false,
          participantAgentIds: [agent.id],
          approvalStatus: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({
          id: tasks.id,
          agentId: tasks.agentId,
          title: tasks.title,
          status: tasks.status,
        });
      workstream = created;
    }
    if (!workstream?.id) continue;
    result.push({
      key,
      taskId: Number(workstream.id),
      agentId: Number(agent.id),
      agentName: agent.name,
      role: agent.role,
      title: workstream.title,
      status: String(workstream.status || "backlog"),
    });
  }
  return result;
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
      role: true,
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
      participants: [],
      workstreams: [],
      missingSpecialistKeys: plan.participantAgentKeys,
      reason:
        "The Exportunity industrial agent organization is not available for task routing.",
    };
  }

  const participantAgentIds = plan.participantAgentKeys
    .map((key) => byKey.get(key)?.id)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const participants = plan.participantAgentKeys
    .map((key) => {
      const agent = byKey.get(key);
      return agent?.id
        ? {
            key,
            agentId: Number(agent.id),
            agentName: agent.name,
            role: agent.role,
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const missingSpecialistKeys = plan.participantAgentKeys.filter(
    (key) => !byKey.get(key)?.id,
  );
  const taskTitle = `Review ${input.referenceCode}: ${input.title}`.slice(
    0,
    240,
  );
  const existingTask = await db.query.tasks.findFirst({
    where: and(eq(tasks.companyId, companyId), eq(tasks.title, taskTitle)),
    columns: { id: true, agentId: true, goalId: true },
    orderBy: [desc(tasks.id)],
  });

  if (existingTask?.id) {
    const workstreams = await ensureSpecialistWorkstreams({
      parentTaskId: Number(existingTask.id),
      companyId,
      goalId: existingTask.goalId ? Number(existingTask.goalId) : null,
      referenceCode: input.referenceCode,
      requestTitle: input.title,
      plan,
      byKey,
    });
    return {
      status: "existing",
      taskId: Number(existingTask.id),
      companyId,
      assignedAgentId: Number(existingTask.agentId || primaryAgent.id),
      assignedAgentName: primaryAgent.name,
      participantAgentIds,
      participants,
      workstreams,
      missingSpecialistKeys,
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
      participants,
      workstreams: [],
      missingSpecialistKeys,
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
      participants,
      workstreams: [],
      missingSpecialistKeys,
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

  const workstreams = await ensureSpecialistWorkstreams({
    parentTaskId: Number(task.id),
    companyId,
    goalId: Number(goal.id),
    referenceCode: input.referenceCode,
    requestTitle: input.title,
    plan,
    byKey,
  });

  return {
    status: "created",
    taskId: Number(task.id),
    companyId,
    assignedAgentId: primaryAgent.id,
    assignedAgentName: primaryAgent.name,
    participantAgentIds,
    participants,
    workstreams,
    missingSpecialistKeys,
  };
}
