import crypto from "node:crypto";

import { db } from "@db";
import { companyBrainAuditEvents } from "@db/schema";
import { sql } from "drizzle-orm";

import { getAgentPolicy } from "../agent-os/registry";
import {
  loadCompanyBrainContextPack,
} from "../company-brain/contextAssembler";
import { ensureCompanyBrainTables } from "../company-brain/ensureTables";
import { isCompanyBrainFeatureEnabled } from "../company-brain/featureFlags";
import {
  summarizeWorkforceGovernancePack,
  type WorkforceGovernanceSnapshot,
} from "./workforceGovernancePolicy";

export {
  assertWorkforceGovernanceReady,
  summarizeWorkforceGovernancePack,
} from "./workforceGovernancePolicy";
export type {
  WorkforceGovernanceSnapshot,
  WorkforceGovernanceStatus,
} from "./workforceGovernancePolicy";

const STAFFING_CANONICAL_KEYS = [
  "company.identity.strategic_proposition",
  "company.identity.operating_proposition",
  "company.scope.verticals_are_not_company_limits",
  "company.architecture.preserve_and_connect",
  "company.agent_policy.no_invented_company_facts",
  "company.policy.external_communications_default",
];

function rows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

function unavailableSnapshot(input: {
  taskKey: string;
  reason: string;
  agentId?: number | null;
}): WorkforceGovernanceSnapshot {
  return {
    version: "workforce-governance-v1",
    status: "unavailable",
    reason: input.reason,
    contextPackId: null,
    correlationId: null,
    taskKey: input.taskKey,
    agentId: input.agentId || null,
    sourceCitations: [],
    citationCount: 0,
    knownConflicts: [],
    openQuestions: [],
    requiredApprovals: [],
    assembledAt: new Date().toISOString(),
    expiresAt: null,
    externalActionsStarted: false,
  };
}

async function resolvePlanningAgentId(input: {
  tenantId: number;
  companyId: number | null;
  preferredAgentId?: number | null;
}) {
  const result = await db.execute(sql`
    select id
    from agents
    where tenant_id = ${input.tenantId}
      and status = 'active'
      and (${input.companyId}::integer is null or company_id = ${input.companyId})
      and (
        id = ${input.preferredAgentId || null}
        or coalesce(metadata->>'organizationKey', '') in ('tassi', 'fenou', 'commercial', 'data')
      )
    order by
      case when id = ${input.preferredAgentId || null} then 0 else 1 end,
      case coalesce(metadata->>'organizationKey', '')
        when 'tassi' then 0
        when 'fenou' then 1
        when 'commercial' then 2
        when 'data' then 3
        else 9
      end,
      id asc
    limit 1
  `);
  return Number(rows<{ id: number }>(result)[0]?.id || 0) || null;
}

export async function assembleWorkforceGovernanceContext(input: {
  tenantId: number;
  companyId: number | null;
  requirementId: string | null;
  referenceCode: string;
  roleCode: string;
  roleTitle: string;
  proposedByAgentId?: number | null;
  staffingRequestId?: number | null;
}): Promise<WorkforceGovernanceSnapshot> {
  const taskKey = `workforce.staffing:${input.roleCode}:${input.referenceCode || input.requirementId || "demand"}`;
  if (
    !isCompanyBrainFeatureEnabled("companyBrain") ||
    !isCompanyBrainFeatureEnabled("contextPacks")
  ) {
    return unavailableSnapshot({
      taskKey,
      reason: "Company Brain context packs are disabled. Enable them before staffing approval.",
    });
  }

  await ensureCompanyBrainTables();
  const agentId = await resolvePlanningAgentId({
    tenantId: input.tenantId,
    companyId: input.companyId,
    preferredAgentId: input.proposedByAgentId,
  });
  if (!agentId) {
    return unavailableSnapshot({
      taskKey,
      reason: "No active governed planning agent is available for this staffing review.",
    });
  }

  const correlationId = crypto.randomUUID();
  try {
    const agentPolicy = await getAgentPolicy(agentId);
    if (agentPolicy.tenantId !== input.tenantId) {
      return unavailableSnapshot({
        taskKey,
        agentId,
        reason: "The selected planning agent does not belong to this tenant.",
      });
    }
    const pack = await loadCompanyBrainContextPack({
      tenantId: input.tenantId,
      companyId: input.companyId,
      agentPolicy,
      taskKey,
      purpose: "internal",
      correlationId,
      canonicalKeys: STAFFING_CANONICAL_KEYS,
    });
    const snapshot = summarizeWorkforceGovernancePack(pack);
    await db.insert(companyBrainAuditEvents).values({
      tenantId: input.tenantId,
      companyId: input.companyId,
      actorType: "agent",
      actorId: String(agentId),
      eventType: "workforce_governance_context_assembled",
      entityType: input.staffingRequestId
        ? "industrial_agent_staffing_request"
        : "industrial_requirement",
      entityId: String(input.staffingRequestId || input.requirementId || input.roleCode),
      correlationId,
      payload: {
        roleCode: input.roleCode,
        roleTitle: input.roleTitle,
        referenceCode: input.referenceCode,
        contextPackId: snapshot.contextPackId,
        governanceStatus: snapshot.status,
        citationCount: snapshot.citationCount,
        conflictCount: snapshot.knownConflicts.length,
        openQuestionCount: snapshot.openQuestions.length,
        externalActionsStarted: false,
      },
    });
    return snapshot;
  } catch (error) {
    console.error("workforce_governance_context_failed", {
      tenantId: input.tenantId,
      requirementId: input.requirementId,
      staffingRequestId: input.staffingRequestId,
      roleCode: input.roleCode,
      message: error instanceof Error ? error.message : "unknown error",
    });
    return unavailableSnapshot({
      taskKey,
      agentId,
      reason: "Company Brain context could not be assembled. Retry before staffing approval.",
    });
  }
}
