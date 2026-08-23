import { and, eq, inArray } from "drizzle-orm";
import { db } from "@db";
import { agentsProduction } from "@db/schema";

import { createGovernedTask } from "../intelligence/service";
import {
  buildQualifiedSourcingTaskPlan,
  EXPORTUNITY_SOURCING_EXECUTION_AGENT_KEY,
  EXPORTUNITY_SOURCING_MANAGER_AGENT_KEY,
} from "./sourcingTaskPolicy";

export type QualifiedSourcingTaskSyncStatus =
  | "not_eligible"
  | "agent_assignment_missing"
  | "review_task_ready";

export interface QualifiedSourcingTaskSyncResult {
  status: QualifiedSourcingTaskSyncStatus;
  taskId: number | null;
  publicTaskId: string | null;
  state: string | null;
  idempotencyKey: string | null;
  managerAgentId: number | null;
  executionAgentId: number | null;
  managerAgentKey: string;
  executionAgentKey: string;
  missingAgentKeys: string[];
  requiresHumanApproval: true;
  outboundActionsAllowed: false;
}

function baseResult(
  status: QualifiedSourcingTaskSyncStatus,
): QualifiedSourcingTaskSyncResult {
  return {
    status,
    taskId: null,
    publicTaskId: null,
    state: null,
    idempotencyKey: null,
    managerAgentId: null,
    executionAgentId: null,
    managerAgentKey: EXPORTUNITY_SOURCING_MANAGER_AGENT_KEY,
    executionAgentKey: EXPORTUNITY_SOURCING_EXECUTION_AGENT_KEY,
    missingAgentKeys: [],
    requiresHumanApproval: true,
    outboundActionsAllowed: false,
  };
}

export async function syncQualifiedSourcingTask(input: {
  tenantId: number;
  tenantKey: string;
  crmStatus: string;
  crmStage: string | null;
  chatLeadId: string;
  commercialLeadId: number | null;
  opportunityId: number | null;
  opportunityReferenceCode: string | null;
  requirementId: string | null;
  requirementReferenceCode: string | null;
}): Promise<QualifiedSourcingTaskSyncResult> {
  const plan = buildQualifiedSourcingTaskPlan(input);
  if (!plan) return baseResult("not_eligible");

  const productionAgents = await db
    .select({
      agentKey: agentsProduction.agentKey,
      agentId: agentsProduction.agentId,
    })
    .from(agentsProduction)
    .where(
      and(
        eq(agentsProduction.tenantId, input.tenantId),
        eq(agentsProduction.isEnabled, true),
        inArray(agentsProduction.agentKey, [
          plan.managerAgentKey,
          plan.executionAgentKey,
        ]),
      ),
    );

  const agentIds = new Map(
    productionAgents
      .filter((row) => Number.isInteger(Number(row.agentId)) && Number(row.agentId) > 0)
      .map((row) => [String(row.agentKey), Number(row.agentId)]),
  );
  const managerAgentId = agentIds.get(plan.managerAgentKey) || null;
  const executionAgentId = agentIds.get(plan.executionAgentKey) || null;
  const missingAgentKeys = [
    ...(managerAgentId ? [] : [plan.managerAgentKey]),
    ...(executionAgentId ? [] : [plan.executionAgentKey]),
  ];

  if (missingAgentKeys.length > 0) {
    return {
      ...baseResult("agent_assignment_missing"),
      idempotencyKey: plan.idempotencyKey,
      managerAgentId,
      executionAgentId,
      missingAgentKeys,
    };
  }

  const task = await createGovernedTask({
    tenantId: input.tenantId,
    idempotencyKey: plan.idempotencyKey,
    moduleId: plan.moduleId,
    title: plan.title,
    instruction: plan.instruction,
    objective: plan.objective,
    managerTier: "MANAGER",
    policyTier: "MANAGER",
    priority: plan.priority,
    source: "MANUAL",
    tokenBudget: plan.tokenBudget,
    managerAgentId,
    executionAgentId,
    metadata: {
      ...plan.metadata,
      managerAgentId,
      executionAgentId,
    },
  });

  return {
    ...baseResult("review_task_ready"),
    taskId: Number(task.id),
    publicTaskId: String(task.publicTaskId || "").trim() || null,
    state: String(task.state || plan.initialState),
    idempotencyKey: plan.idempotencyKey,
    managerAgentId,
    executionAgentId,
  };
}
