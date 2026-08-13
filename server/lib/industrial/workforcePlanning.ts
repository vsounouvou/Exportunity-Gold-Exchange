import { sql } from "drizzle-orm";

import { db } from "@db";
import { ensureExportunityRoleSeatCatalog } from "../company-brain/ensureRoleSeatCatalog";
import { EXPORTUNITY_ROLE_SEATS } from "../company-brain/roleSeatCatalog";
import {
  commercialStaffingRecommendations,
  type CommercialStaffingContext,
} from "./workforcePlanningPolicy";
import { assembleWorkforceGovernanceContext } from "./workforceGovernance";

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
  dynamicRoleSeat: boolean;
  existingRuntimeAgentId: number | null;
  assignmentTaskId: number | null;
  governanceStatus: string;
  companyBrainContextPackId: number | null;
};

function rows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

async function assignActiveEmployeeToRequirement(input: {
  tenantId: number;
  companyId: number | null;
  staffingRequestId: number;
  requirementId: string;
  referenceCode: string;
  runtimeAgentId: number;
  roleTitle: string;
}): Promise<number | null> {
  if (!input.companyId || !input.runtimeAgentId) return null;

  return db.transaction(async (tx) => {
    const agentResult = await tx.execute(sql`
      select id, company_id, manager_id, display_name, role, status
      from agents
      where id = ${input.runtimeAgentId}
        and tenant_id = ${input.tenantId}
        and company_id = ${input.companyId}
      limit 1
      for update
    `);
    const agent = rows<any>(agentResult)[0];
    if (!agent || String(agent.status) !== "active" || !Number(agent.manager_id || 0)) {
      return null;
    }

    const requirementResult = await tx.execute(sql`
      select id, reference_code, title, details, metadata
      from industrial_requirements
      where id = ${input.requirementId}::uuid
        and tenant_id = ${input.tenantId}
      limit 1
    `);
    const requirement = rows<any>(requirementResult)[0];
    if (!requirement) return null;

    const metadata =
      requirement.metadata && typeof requirement.metadata === "object"
        ? requirement.metadata
        : {};
    const operationsHandoff =
      metadata.operationsHandoff && typeof metadata.operationsHandoff === "object"
        ? metadata.operationsHandoff
        : {};
    let parentTaskId = Number(operationsHandoff.taskId || 0) || null;
    let goalId: number | null = null;
    let objectiveId: number | null = null;
    if (parentTaskId) {
      const parentResult = await tx.execute(sql`
        select id, goal_id, objective_id
        from tasks
        where id = ${parentTaskId}
          and company_id = ${input.companyId}
        limit 1
      `);
      const parent = rows<any>(parentResult)[0];
      parentTaskId = Number(parent?.id || 0) || null;
      goalId = Number(parent?.goal_id || 0) || null;
      objectiveId = Number(parent?.objective_id || 0) || goalId;
    }
    if (!parentTaskId) {
      const fallbackParentResult = await tx.execute(sql`
        select id, goal_id, objective_id
        from tasks
        where company_id = ${input.companyId}
          and title like ${`Review ${input.referenceCode}:%`}
        order by id desc
        limit 1
      `);
      const fallbackParent = rows<any>(fallbackParentResult)[0];
      parentTaskId = Number(fallbackParent?.id || 0) || null;
      goalId = Number(fallbackParent?.goal_id || 0) || null;
      objectiveId = Number(fallbackParent?.objective_id || 0) || goalId;
    }

    const taskTitle = `${input.referenceCode} - ${input.roleTitle}`.slice(0, 240);
    const existingTaskResult = await tx.execute(sql`
      select id
      from tasks
      where company_id = ${input.companyId}
        and agent_id = ${input.runtimeAgentId}
        and title = ${taskTitle}
      order by id desc
      limit 1
    `);
    const existingTaskId = Number(rows<any>(existingTaskResult)[0]?.id || 0);
    if (existingTaskId) return existingTaskId;

    const createdTaskResult = await tx.execute(sql`
      insert into tasks (
        agent_id, company_id, goal_id, objective_id, parent_task_id,
        title, description, priority, status, execution_type,
        urgency_score, importance_score, dependency_score, is_automated,
        is_group_task, participant_agent_ids, approval_status,
        approved_by_agent_id, approved_at, created_at, updated_at
      ) values (
        ${input.runtimeAgentId}, ${input.companyId}, ${goalId}, ${objectiveId},
        ${parentTaskId}, ${taskTitle},
        ${[
          `Case-linked assignment for ${input.referenceCode}: ${requirement.title}.`,
          `${agent.display_name || input.roleTitle} is already an approved active employee and is being reused for this new matching demand.`,
          `Review the requirement and record findings in the shared case: ${String(requirement.details || "").slice(0, 1200)}`,
          "Do not send external messages, make payments, sign contracts, publish claims, or start background conversations without a separate visible approval.",
        ].join("\n")},
        'high', 'backlog', 'workforce_activation', 7, 8, 5,
        false, false, ${JSON.stringify([input.runtimeAgentId])}::jsonb,
        'approved', ${Number(agent.manager_id)}, now(), now(), now()
      )
      returning id
    `);
    const taskId = Number(rows<any>(createdTaskResult)[0]?.id || 0);
    if (!taskId) return null;

    if (parentTaskId) {
      await tx.execute(sql`
        update tasks
        set is_group_task = true,
            participant_agent_ids = case
              when coalesce(participant_agent_ids, '[]'::jsonb) @>
                ${JSON.stringify([input.runtimeAgentId])}::jsonb
                then coalesce(participant_agent_ids, '[]'::jsonb)
              else coalesce(participant_agent_ids, '[]'::jsonb) ||
                ${JSON.stringify([input.runtimeAgentId])}::jsonb
            end,
            updated_at = now()
        where id = ${parentTaskId}
          and company_id = ${input.companyId}
      `);
    }

    const assignmentMetadata = {
      staffingRequestId: input.staffingRequestId,
      requirementId: input.requirementId,
      referenceCode: input.referenceCode,
      taskId,
      parentTaskId,
      managerAgentId: Number(agent.manager_id),
      assignmentMode: "reuse_active_employee",
      externalActionsStarted: false,
    };
    await tx.execute(sql`
      insert into activity_log (
        company_id, agent_id, event_type, event_category,
        title, description, metadata, created_at
      ) values (
        ${input.companyId}, ${input.runtimeAgentId},
        'workforce_assignment', 'operations',
        ${`${agent.display_name || input.roleTitle} joined ${input.referenceCode}`},
        ${`An existing active employee was assigned to new verified demand under manager #${agent.manager_id}.`},
        ${JSON.stringify(assignmentMetadata)}::jsonb, now()
      )
    `);
    await tx.execute(sql`
      insert into industrial_audit_logs (
        tenant_id, actor_user_id, action, entity_type, entity_id, reason,
        previous_value, next_value, metadata, created_at
      ) values (
        ${input.tenantId}, null,
        'industrial_requirement.active_employee_assigned',
        'industrial_requirement', ${input.requirementId}::uuid,
        ${`Reused active ${input.roleTitle} capacity for verified demand ${input.referenceCode}.`},
        '{}'::jsonb,
        ${JSON.stringify({
          agentId: input.runtimeAgentId,
          roleTitle: input.roleTitle,
          taskId,
          parentTaskId,
        })}::jsonb,
        ${JSON.stringify(assignmentMetadata)}::jsonb, now()
      )
    `);
    return taskId;
  });
}

export async function proposeCommercialStaffing(input: {
  tenantId: number;
  companyId: number | null;
  requirementId: string;
  referenceCode: string;
  proposedByAgentId?: number | null;
  assignmentMode?: "assign_active_employee" | "signal_only";
  context: CommercialStaffingContext;
}): Promise<StaffingProposal[]> {
  await ensureExportunityRoleSeatCatalog();
  const recommendations = commercialStaffingRecommendations(input.context);
  if (!recommendations.length) return [];

  const proposals: StaffingProposal[] = [];
  for (const recommendation of recommendations) {
    const roleTitle = recommendation.roleTitle;
    const seat = EXPORTUNITY_ROLE_SEATS.find((item) => item.role === roleTitle);
    const roleCode = seat?.immutableAgentId || recommendation.roleCode;
    const departmentKey = seat?.departmentKey || recommendation.departmentKey;
    if (!roleCode || !departmentKey) continue;
    const templateResult = await db.execute(sql`
      select id, runtime_agent_id, seat_status, role_profile
      from ece_agent_templates
      where tenant_id = ${input.tenantId}
        and code = ${roleCode}
      limit 1
    `);
    const template = rows<any>(templateResult)[0];
    const runtimeAgentId = Number(template?.runtime_agent_id || 0);
    let runtimeStatus = "";
    if (runtimeAgentId > 0) {
      const runtimeResult = await db.execute(sql`
        select id, status
        from agents
        where id = ${runtimeAgentId} and tenant_id = ${input.tenantId}
        limit 1
      `);
      const runtime = rows<any>(runtimeResult)[0];
      runtimeStatus = String(runtime?.status || "");
    }

    const runtimeIsActive = runtimeStatus === "active";
    if (input.assignmentMode === "signal_only" && runtimeIsActive) {
      continue;
    }
    const effectiveSignalType = runtimeAgentId > 0
      ? runtimeIsActive
        ? "active_capacity"
        : "inactive_capacity"
      : recommendation.signalType;
    const effectiveThreshold = runtimeAgentId > 0 ? 1 : recommendation.demandThreshold;
    const reason = runtimeAgentId > 0
      ? runtimeIsActive
        ? `${roleTitle} already has an active employee. ${input.referenceCode} is added to that employee's demand-backed workload.`
        : `${roleTitle} is provisioned but inactive while ${input.referenceCode} requires this specialist capability.`
      : recommendation.signalType === "critical_capability_gap"
        ? `${input.referenceCode} exposed a critical execution gap for ${roleTitle}; human staffing review is required.`
        : `Verified demand is accumulating for ${roleTitle}. Review becomes available after ${recommendation.demandThreshold} distinct commercial requirements.`;
    const governance = await assembleWorkforceGovernanceContext({
      tenantId: input.tenantId,
      companyId: input.companyId,
      requirementId: input.requirementId,
      referenceCode: input.referenceCode,
      roleCode,
      roleTitle,
      proposedByAgentId: input.proposedByAgentId,
    });
    const evidence = {
      source: "industrial_commercial_intake",
      requirementId: input.requirementId,
      referenceCode: input.referenceCode,
      commercialIntent: input.context.intent || null,
      productName: input.context.productName || null,
      productCategory: input.context.productCategory || null,
      requirementType: input.context.requirementType,
      missingSpecialistKeys: input.context.missingSpecialistKeys || [],
      existingRuntimeAgentId: runtimeAgentId || null,
      externalActionsStarted: false,
      assignmentMode: input.assignmentMode || "assign_active_employee",
      signalType: effectiveSignalType,
      rationale: recommendation.rationale,
      dynamicRoleSeat: Boolean(recommendation.dynamicRoleSeat || template?.role_profile?.dynamicRoleSeat),
      companyBrain: {
        contextPackId: governance.contextPackId,
        governanceStatus: governance.status,
        citationCount: governance.citationCount,
        conflictCount: governance.knownConflicts.length,
        openQuestionCount: governance.openQuestions.length,
      },
      recordedAt: new Date().toISOString(),
    };
    const initialStatus = runtimeIsActive
      ? "active"
      : effectiveThreshold <= 1
      ? "proposed"
      : "monitoring";
    const evidenceArray = [evidence];
    const requirementEvidence = [{ requirementId: input.requirementId }];
    const inserted = await db.execute(sql`
      insert into industrial_agent_staffing_requests (
        tenant_id, company_id, requirement_id, role_template_id, role_code,
        role_title, department_key, reason, evidence, priority, status,
        proposed_by_agent_id, demand_count, demand_threshold, signal_type,
        evidence_items, company_brain_context_pack_id, governance_status,
        governance_snapshot, last_signal_at, activated_at, created_at, updated_at
      ) values (
        ${input.tenantId}, ${input.companyId}, ${input.requirementId},
        ${Number(template?.id || 0) || null}, ${roleCode},
        ${roleTitle}, ${departmentKey}, ${reason},
        ${JSON.stringify(evidence)}::jsonb, 'high', ${initialStatus},
        ${input.proposedByAgentId || null}, 1,
        ${effectiveThreshold}, ${effectiveSignalType},
        ${JSON.stringify(evidenceArray)}::jsonb, ${governance.contextPackId},
        ${governance.status}, ${JSON.stringify(governance)}::jsonb, now(),
        ${runtimeIsActive ? new Date() : null}, now(), now()
      )
      on conflict (tenant_id, role_code)
        where status in ('monitoring', 'proposed', 'approved', 'provisioned', 'active', 'paused')
      do update set
        requirement_id = excluded.requirement_id,
        reason = excluded.reason,
        evidence = case
          when industrial_agent_staffing_requests.status in ('approved', 'provisioned', 'active', 'paused')
            then coalesce(industrial_agent_staffing_requests.evidence, '{}'::jsonb) ||
              jsonb_build_object('latestDemandSignal', excluded.evidence)
          else excluded.evidence
        end,
        role_template_id = coalesce(industrial_agent_staffing_requests.role_template_id, excluded.role_template_id),
        provisioned_agent_id = coalesce(industrial_agent_staffing_requests.provisioned_agent_id, ${runtimeAgentId || null}),
        demand_count = industrial_agent_staffing_requests.demand_count +
          case
            when coalesce(industrial_agent_staffing_requests.evidence_items, '[]'::jsonb) @>
              ${JSON.stringify(requirementEvidence)}::jsonb then 0
            else 1
          end,
        demand_threshold = excluded.demand_threshold,
        signal_type = excluded.signal_type,
        company_brain_context_pack_id = case
          when industrial_agent_staffing_requests.status in ('approved', 'provisioned', 'active', 'paused')
            then industrial_agent_staffing_requests.company_brain_context_pack_id
          else excluded.company_brain_context_pack_id
        end,
        governance_status = case
          when industrial_agent_staffing_requests.status in ('approved', 'provisioned', 'active', 'paused')
            then industrial_agent_staffing_requests.governance_status
          else excluded.governance_status
        end,
        governance_snapshot = case
          when industrial_agent_staffing_requests.status in ('approved', 'provisioned', 'active', 'paused')
            then industrial_agent_staffing_requests.governance_snapshot
          else excluded.governance_snapshot
        end,
        evidence_items = case
          when coalesce(industrial_agent_staffing_requests.evidence_items, '[]'::jsonb) @>
            ${JSON.stringify(requirementEvidence)}::jsonb
            then industrial_agent_staffing_requests.evidence_items
          else coalesce(industrial_agent_staffing_requests.evidence_items, '[]'::jsonb) || excluded.evidence_items
        end,
        status = case
          when excluded.signal_type = 'active_capacity'
            then 'active'
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
        activated_at = case
          when excluded.signal_type = 'active_capacity'
            then coalesce(
              industrial_agent_staffing_requests.activated_at,
              excluded.activated_at,
              now()
            )
          else industrial_agent_staffing_requests.activated_at
        end,
        last_signal_at = now(),
        updated_at = now()
      returning id, role_code, role_title, department_key, reason, status, priority,
        demand_count, demand_threshold, signal_type, governance_status,
        company_brain_context_pack_id
    `);
    const row = rows<any>(inserted)[0];
    if (!row?.id) continue;
    let assignmentTaskId: number | null = null;
    if (runtimeIsActive && input.assignmentMode !== "signal_only") {
      try {
        assignmentTaskId = await assignActiveEmployeeToRequirement({
          tenantId: input.tenantId,
          companyId: input.companyId,
          staffingRequestId: Number(row.id),
          requirementId: input.requirementId,
          referenceCode: input.referenceCode,
          runtimeAgentId,
          roleTitle,
        });
      } catch (error) {
        console.error("industrial_active_employee_assignment_failed", {
          requirementId: input.requirementId,
          staffingRequestId: Number(row.id),
          runtimeAgentId,
          message: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
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
      dynamicRoleSeat: Boolean(recommendation.dynamicRoleSeat || template?.role_profile?.dynamicRoleSeat),
      existingRuntimeAgentId: runtimeAgentId || null,
      assignmentTaskId,
      governanceStatus: String(row.governance_status || governance.status),
      companyBrainContextPackId:
        Number(row.company_brain_context_pack_id || governance.contextPackId || 0) || null,
    });
  }
  return proposals;
}
