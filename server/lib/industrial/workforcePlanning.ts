import { sql } from "drizzle-orm";

import { db } from "@db";
import { ensureExportunityRoleSeatCatalog } from "../company-brain/ensureRoleSeatCatalog";
import { EXPORTUNITY_ROLE_SEATS } from "../company-brain/roleSeatCatalog";
import {
  commercialStaffingRoleTitles,
  type CommercialStaffingContext,
} from "./workforcePlanningPolicy";

export { commercialStaffingRoleTitles } from "./workforcePlanningPolicy";

type StaffingProposal = {
  id: number;
  roleCode: string;
  roleTitle: string;
  departmentKey: string;
  reason: string;
  status: string;
  priority: string;
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
  const requestedRoles = commercialStaffingRoleTitles(input.context);
  if (!requestedRoles.length) return [];

  const proposals: StaffingProposal[] = [];
  for (const roleTitle of requestedRoles) {
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

    const reason = runtimeAgentId > 0
      ? `${roleTitle} is provisioned but inactive while ${input.referenceCode} requires this specialist capability.`
      : `${input.referenceCode} created verified demand for ${roleTitle}; no active runtime currently owns this desk.`;
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
    };
    const inserted = await db.execute(sql`
      insert into industrial_agent_staffing_requests (
        tenant_id, company_id, requirement_id, role_template_id, role_code,
        role_title, department_key, reason, evidence, priority, status,
        proposed_by_agent_id, created_at, updated_at
      ) values (
        ${input.tenantId}, ${input.companyId}, ${input.requirementId},
        ${Number(template?.id || 0) || null}, ${seat.immutableAgentId},
        ${seat.role}, ${seat.departmentKey}, ${reason},
        ${JSON.stringify(evidence)}::jsonb, 'high', 'proposed',
        ${input.proposedByAgentId || null}, now(), now()
      )
      on conflict (tenant_id, role_code)
        where status in ('proposed', 'approved', 'provisioned')
      do update set
        requirement_id = excluded.requirement_id,
        reason = excluded.reason,
        evidence = excluded.evidence,
        updated_at = now()
      returning id, role_code, role_title, department_key, reason, status, priority
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
    });
  }
  return proposals;
}
