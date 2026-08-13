import { sql } from "drizzle-orm";

import { db } from "@db";
import { ensureExportunityRoleSeatCatalog } from "../company-brain/ensureRoleSeatCatalog";
import { EXPORTUNITY_ROLE_SEATS } from "../company-brain/roleSeatCatalog";
import {
  commercialStaffingRecommendations,
  type CommercialStaffingContext,
} from "./workforcePlanningPolicy";

export {
  commercialStaffingRecommendations,
  commercialStaffingRoleTitles,
} from "./workforcePlanningPolicy";

type StaffingProposal = {
  id: number;
  roleCode: string;
  roleTitle: string;
  departmentKey: string;
  reason: string;
  status: string;
  priority: string;
  demandCount: number;
  demandThreshold: number;
  signalType: string;
  reviewReady: boolean;
};

function rows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

export async function proposeCommercialStaffing(input: {
  tenantId: number;
  companyId: number | null;
  requirementId: string;
  referenceCode: string;
  proposedByAgentId?: number | null;
  context: CommercialStaffingContext;
}): Promise<StaffingProposal[]> {
  await ensureExportunityRoleSeatCatalog();
  const recommendations = commercialStaffingRecommendations(input.context);
  if (!recommendations.length) return [];

  const proposals: StaffingProposal[] = [];
  for (const recommendation of recommendations) {
    const roleTitle = recommendation.roleTitle;
    const seat = EXPORTUNITY_ROLE_SEATS.find((item) => item.role === roleTitle);
    if (!seat) continue;
    const templateResult = await db.execute(sql`
      select id, runtime_agent_id, seat_status
      from ece_agent_templates
      where tenant_id = ${input.tenantId}
        and code = ${seat.immutableAgentId}
      limit 1
    `);
    const template = rows<any>(templateResult)[0];
    const runtimeAgentId = Number(template?.runtime_agent_id || 0);
    if (runtimeAgentId > 0) {
      const runtimeResult = await db.execute(sql`
        select id, status
        from agents
        where id = ${runtimeAgentId} and tenant_id = ${input.tenantId}
        limit 1
      `);
      const runtime = rows<any>(runtimeResult)[0];
      if (runtime?.status === "active") continue;
    }

    const effectiveSignalType = runtimeAgentId > 0
      ? "inactive_capacity"
      : recommendation.signalType;
    const effectiveThreshold = runtimeAgentId > 0
      ? 1
      : recommendation.demandThreshold;
    const reason = runtimeAgentId > 0
      ? `${roleTitle} is provisioned but inactive while ${input.referenceCode} requires this specialist capability.`
      : recommendation.signalType === "critical_capability_gap"
        ? `${input.referenceCode} exposed a critical execution gap for ${roleTitle}; human staffing review is required.`
        : `Verified demand is accumulating for ${roleTitle}. Review becomes available after ${recommendation.demandThreshold} distinct commercial requirements.`;
    const evidence = {
      source: "industrial_commercial_intake",
      requirementId: input.requirementId,
      referenceCode: input.referenceCode,
      commercialIntent: input.context.intent || null,
      productCategory: input.context.productCategory || null,
      requirementType: input.context.requirementType,
      missingSpecialistKeys: input.context.missingSpecialistKeys || [],
      existingRuntimeAgentId: runtimeAgentId || null,
      externalActionsStarted: false,
      signalType: effectiveSignalType,
      rationale: recommendation.rationale,
      recordedAt: new Date().toISOString(),
    };
    const initialStatus = effectiveThreshold <= 1
      ? "proposed"
      : "monitoring";
    const evidenceArray = [evidence];
    const requirementEvidence = [{ requirementId: input.requirementId }];
    const inserted = await db.execute(sql`
      insert into industrial_agent_staffing_requests (
        tenant_id, company_id, requirement_id, role_template_id, role_code,
        role_title, department_key, reason, evidence, priority, status,
        proposed_by_agent_id, demand_count, demand_threshold, signal_type,
        evidence_items, last_signal_at, created_at, updated_at
      ) values (
        ${input.tenantId}, ${input.companyId}, ${input.requirementId},
        ${Number(template?.id || 0) || null}, ${seat.immutableAgentId},
        ${seat.role}, ${seat.departmentKey}, ${reason},
        ${JSON.stringify(evidence)}::jsonb, 'high', ${initialStatus},
        ${input.proposedByAgentId || null}, 1,
        ${effectiveThreshold}, ${effectiveSignalType},
        ${JSON.stringify(evidenceArray)}::jsonb, now(), now(), now()
      )
      on conflict (tenant_id, role_code)
        where status in ('monitoring', 'proposed', 'approved', 'provisioned', 'active', 'paused')
      do update set
        requirement_id = excluded.requirement_id,
        reason = excluded.reason,
        evidence = excluded.evidence,
        demand_count = industrial_agent_staffing_requests.demand_count +
          case
            when coalesce(industrial_agent_staffing_requests.evidence_items, '[]'::jsonb) @>
              ${JSON.stringify(requirementEvidence)}::jsonb then 0
            else 1
          end,
        demand_threshold = excluded.demand_threshold,
        signal_type = excluded.signal_type,
        evidence_items = case
          when coalesce(industrial_agent_staffing_requests.evidence_items, '[]'::jsonb) @>
            ${JSON.stringify(requirementEvidence)}::jsonb
            then industrial_agent_staffing_requests.evidence_items
          else coalesce(industrial_agent_staffing_requests.evidence_items, '[]'::jsonb) || excluded.evidence_items
        end,
        status = case
          when industrial_agent_staffing_requests.status = 'monitoring'
            and industrial_agent_staffing_requests.demand_count +
              case
                when coalesce(industrial_agent_staffing_requests.evidence_items, '[]'::jsonb) @>
                  ${JSON.stringify(requirementEvidence)}::jsonb then 0
                else 1
              end >= excluded.demand_threshold
            then 'proposed'
          else industrial_agent_staffing_requests.status
        end,
        last_signal_at = now(),
        updated_at = now()
      returning id, role_code, role_title, department_key, reason, status, priority,
        demand_count, demand_threshold, signal_type
    `);
    const row = rows<any>(inserted)[0];
    if (!row?.id) continue;
    proposals.push({
      id: Number(row.id),
      roleCode: String(row.role_code),
      roleTitle: String(row.role_title),
      departmentKey: String(row.department_key),
      reason: String(row.reason),
      status: String(row.status),
      priority: String(row.priority),
      demandCount: Number(row.demand_count || 0),
      demandThreshold: Number(row.demand_threshold || 1),
      signalType: String(row.signal_type || effectiveSignalType),
      reviewReady: String(row.status) === "proposed",
    });
  }
  return proposals;
}
