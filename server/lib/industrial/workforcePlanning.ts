import { sql } from "drizzle-orm";

import { db } from "@db";
import { ensureExportunityRoleSeatCatalog } from "../company-brain/ensureRoleSeatCatalog";
import { EXPORTUNITY_ROLE_SEATS } from "../company-brain/roleSeatCatalog";
import {
  commercialStaffingCapacityDecision,
  commercialStaffingCapacityExpansionThreshold,
  commercialStaffingCapacityRoleCode,
  commercialStaffingCaseCapacity,
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
  capacityLimit: number;
  openCaseCount: number;
  activeEmployeeCount: number;
  capacityExpansion: boolean;
};

function rows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

type EmployeeCapacity = {
  agentId: number;
  runtimeStatus: string;
  managerId: number | null;
  roleCode: string;
  roleTemplateId: number | null;
  staffingRequestId: number | null;
  openCaseCount: number;
};

type CapacityRequest = {
  id: number;
  roleCode: string;
  roleTemplateId: number | null;
  provisionedAgentId: number | null;
  status: string;
  capacityOrdinal: number;
  demandThreshold: number;
};

type RoleCapacityPlan = {
  mode: "unprovisioned" | "active" | "inactive" | "expand";
  baseRoleCode: string;
  targetRoleCode: string;
  targetRoleTemplateId: number | null;
  targetStaffingRequestId: number | null;
  runtimeAgentId: number | null;
  runtimeStatus: string;
  openCaseCount: number;
  teamOpenCaseCount: number;
  activeEmployeeCount: number;
  capacityLimit: number;
  capacityOrdinal: number;
  expansionDemandThreshold: number;
};

type ActiveEmployeeAssignmentResult = {
  status: "assigned" | "capacity_full" | "unavailable";
  taskId: number | null;
  openCaseCount: number;
};

async function loadEmployeeCapacity(executor: any, input: {
  tenantId: number;
  agentId: number;
  roleCode: string;
  roleTemplateId?: number | null;
  staffingRequestId?: number | null;
}): Promise<EmployeeCapacity | null> {
  if (!input.agentId) return null;
  const result = await executor.execute(sql`
    select
      a.id,
      a.status,
      a.manager_id,
      count(t.id) filter (
        where t.execution_type = 'workforce_activation'
          and t.status in ('backlog', 'in_progress', 'blocked')
      )::integer as open_case_count
    from agents a
    left join tasks t on t.agent_id = a.id
    where a.id = ${input.agentId}
      and a.tenant_id = ${input.tenantId}
    group by a.id, a.status, a.manager_id
    limit 1
  `);
  const row = rows<any>(result)[0];
  if (!row?.id) return null;
  return {
    agentId: Number(row.id),
    runtimeStatus: String(row.status || ""),
    managerId: Number(row.manager_id || 0) || null,
    roleCode: input.roleCode,
    roleTemplateId: Number(input.roleTemplateId || 0) || null,
    staffingRequestId: Number(input.staffingRequestId || 0) || null,
    openCaseCount: Number(row.open_case_count || 0),
  };
}

async function resolveRoleCapacityPlan(executor: any, input: {
  tenantId: number;
  baseRoleCode: string;
  baseRoleTemplateId: number | null;
  baseRuntimeAgentId: number | null;
  roleTitle: string;
}): Promise<RoleCapacityPlan> {
  const capacityLimit = commercialStaffingCaseCapacity(input.roleTitle);
  const expansionDemandThreshold = commercialStaffingCapacityExpansionThreshold();
  const expansionResult = await executor.execute(sql`
    select
      id,
      role_code,
      role_template_id,
      provisioned_agent_id,
      status,
      demand_threshold,
      coalesce(nullif(evidence->>'capacityOrdinal', '')::integer, 2) as capacity_ordinal
    from industrial_agent_staffing_requests
    where tenant_id = ${input.tenantId}
      and evidence->>'baseRoleCode' = ${input.baseRoleCode}
      and status in ('monitoring', 'proposed', 'approved', 'provisioned', 'active', 'paused')
    order by coalesce(nullif(evidence->>'capacityOrdinal', '')::integer, 2) asc, id asc
  `);
  const expansionRequests = rows<any>(expansionResult).map((row): CapacityRequest => ({
    id: Number(row.id),
    roleCode: String(row.role_code),
    roleTemplateId: Number(row.role_template_id || 0) || null,
    provisionedAgentId: Number(row.provisioned_agent_id || 0) || null,
    status: String(row.status || ""),
    capacityOrdinal: Math.max(2, Number(row.capacity_ordinal || 2)),
    demandThreshold: Math.max(1, Number(row.demand_threshold || expansionDemandThreshold)),
  }));

  const employees: EmployeeCapacity[] = [];
  const baseEmployee = await loadEmployeeCapacity(executor, {
    tenantId: input.tenantId,
    agentId: Number(input.baseRuntimeAgentId || 0),
    roleCode: input.baseRoleCode,
    roleTemplateId: input.baseRoleTemplateId,
  });
  if (baseEmployee) employees.push(baseEmployee);
  for (const request of expansionRequests) {
    if (!request.provisionedAgentId) continue;
    if (employees.some((employee) => employee.agentId === request.provisionedAgentId)) continue;
    const employee = await loadEmployeeCapacity(executor, {
      tenantId: input.tenantId,
      agentId: request.provisionedAgentId,
      roleCode: request.roleCode,
      roleTemplateId: request.roleTemplateId,
      staffingRequestId: request.id,
    });
    if (employee) employees.push(employee);
  }

  const activeEmployees = employees
    .filter((employee) => employee.runtimeStatus === "active" && employee.managerId)
    .sort((left, right) => left.openCaseCount - right.openCaseCount || left.agentId - right.agentId);
  const teamOpenCaseCount = activeEmployees.reduce(
    (total, employee) => total + employee.openCaseCount,
    0,
  );
  const availableEmployee = activeEmployees.find(
    (employee) => employee.openCaseCount < capacityLimit,
  );
  if (availableEmployee) {
    return {
      mode: "active",
      baseRoleCode: input.baseRoleCode,
      targetRoleCode: availableEmployee.roleCode,
      targetRoleTemplateId: availableEmployee.roleTemplateId,
      targetStaffingRequestId: availableEmployee.staffingRequestId,
      runtimeAgentId: availableEmployee.agentId,
      runtimeStatus: availableEmployee.runtimeStatus,
      openCaseCount: availableEmployee.openCaseCount,
      teamOpenCaseCount,
      activeEmployeeCount: activeEmployees.length,
      capacityLimit,
      capacityOrdinal:
        expansionRequests.find((request) => request.id === availableEmployee.staffingRequestId)
          ?.capacityOrdinal || 1,
      expansionDemandThreshold,
    };
  }

  const inactiveEmployee = employees.find(
    (employee) => employee.runtimeStatus !== "active",
  );
  if (inactiveEmployee) {
    return {
      mode: "inactive",
      baseRoleCode: input.baseRoleCode,
      targetRoleCode: inactiveEmployee.roleCode,
      targetRoleTemplateId: inactiveEmployee.roleTemplateId,
      targetStaffingRequestId: inactiveEmployee.staffingRequestId,
      runtimeAgentId: inactiveEmployee.agentId,
      runtimeStatus: inactiveEmployee.runtimeStatus,
      openCaseCount: inactiveEmployee.openCaseCount,
      teamOpenCaseCount,
      activeEmployeeCount: activeEmployees.length,
      capacityLimit,
      capacityOrdinal:
        expansionRequests.find((request) => request.id === inactiveEmployee.staffingRequestId)
          ?.capacityOrdinal || 1,
      expansionDemandThreshold,
    };
  }

  if (activeEmployees.length) {
    const pendingExpansion = expansionRequests.find(
      (request) => !request.provisionedAgentId || request.status !== "active",
    );
    const nextOrdinal = pendingExpansion?.capacityOrdinal ||
      Math.max(1, ...expansionRequests.map((request) => request.capacityOrdinal)) + 1;
    return {
      mode: "expand",
      baseRoleCode: input.baseRoleCode,
      targetRoleCode:
        pendingExpansion?.roleCode ||
        commercialStaffingCapacityRoleCode(input.baseRoleCode, nextOrdinal),
      targetRoleTemplateId: pendingExpansion?.roleTemplateId || null,
      targetStaffingRequestId: pendingExpansion?.id || null,
      runtimeAgentId: null,
      runtimeStatus: "",
      openCaseCount: capacityLimit,
      teamOpenCaseCount,
      activeEmployeeCount: activeEmployees.length,
      capacityLimit,
      capacityOrdinal: nextOrdinal,
      expansionDemandThreshold:
        pendingExpansion?.demandThreshold || expansionDemandThreshold,
    };
  }

  return {
    mode: input.baseRuntimeAgentId ? "inactive" : "unprovisioned",
    baseRoleCode: input.baseRoleCode,
    targetRoleCode: input.baseRoleCode,
    targetRoleTemplateId: input.baseRoleTemplateId,
    targetStaffingRequestId: null,
    runtimeAgentId: input.baseRuntimeAgentId,
    runtimeStatus: baseEmployee?.runtimeStatus || "",
    openCaseCount: baseEmployee?.openCaseCount || 0,
    teamOpenCaseCount: 0,
    activeEmployeeCount: 0,
    capacityLimit,
    capacityOrdinal: 1,
    expansionDemandThreshold,
  };
}

async function assignActiveEmployeeToRequirement(executor: any, input: {
  tenantId: number;
  companyId: number | null;
  staffingRequestId: number;
  requirementId: string;
  referenceCode: string;
  runtimeAgentId: number;
  roleTitle: string;
  capacityLimit: number;
}): Promise<ActiveEmployeeAssignmentResult> {
  if (!input.companyId || !input.runtimeAgentId) {
    return { status: "unavailable", taskId: null, openCaseCount: 0 };
  }

    const tx = executor;
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
      return { status: "unavailable", taskId: null, openCaseCount: 0 };
    }

    const requirementResult = await tx.execute(sql`
      select id, reference_code, title, details, metadata
      from industrial_requirements
      where id = ${input.requirementId}::uuid
        and tenant_id = ${input.tenantId}
      limit 1
    `);
    const requirement = rows<any>(requirementResult)[0];
    if (!requirement) {
      return { status: "unavailable", taskId: null, openCaseCount: 0 };
    }

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
    if (existingTaskId) {
      return {
        status: "assigned",
        taskId: existingTaskId,
        openCaseCount: 0,
      };
    }

    const workloadResult = await tx.execute(sql`
      select count(*)::integer as open_case_count
      from tasks
      where agent_id = ${input.runtimeAgentId}
        and execution_type = 'workforce_activation'
        and status in ('backlog', 'in_progress', 'blocked')
    `);
    const capacityDecision = commercialStaffingCapacityDecision(
      rows<any>(workloadResult)[0]?.open_case_count,
      input.capacityLimit,
    );
    if (capacityDecision.atCapacity) {
      return {
        status: "capacity_full",
        taskId: null,
        openCaseCount: capacityDecision.openCaseCount,
      };
    }

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
    if (!taskId) {
      return {
        status: "unavailable",
        taskId: null,
        openCaseCount: capacityDecision.openCaseCount,
      };
    }

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
    return {
      status: "assigned",
      taskId,
      openCaseCount: capacityDecision.openCaseCount + 1,
    };
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
    const baseRoleCode = seat?.immutableAgentId || recommendation.roleCode;
    const departmentKey = seat?.departmentKey || recommendation.departmentKey;
    if (!baseRoleCode || !departmentKey) continue;
    const governance = await assembleWorkforceGovernanceContext({
      tenantId: input.tenantId,
      companyId: input.companyId,
      requirementId: input.requirementId,
      referenceCode: input.referenceCode,
      roleCode: baseRoleCode,
      roleTitle,
      proposedByAgentId: input.proposedByAgentId,
    });
    const persistProposal = () => db.transaction(
      async (tx): Promise<StaffingProposal | null> => {
    await tx.execute(sql`
      select pg_advisory_xact_lock(
        ${input.tenantId},
        hashtext(${`workforce-capacity:${baseRoleCode}`})
      )
    `);
    const baseTemplateResult = await tx.execute(sql`
      select id, runtime_agent_id, seat_status, role_profile
      from ece_agent_templates
      where tenant_id = ${input.tenantId}
        and code = ${baseRoleCode}
      limit 1
    `);
    const baseTemplate = rows<any>(baseTemplateResult)[0];
    const capacityPlan = await resolveRoleCapacityPlan(tx, {
      tenantId: input.tenantId,
      baseRoleCode,
      baseRoleTemplateId: Number(baseTemplate?.id || 0) || null,
      baseRuntimeAgentId: Number(baseTemplate?.runtime_agent_id || 0) || null,
      roleTitle,
    });
    const roleCode = capacityPlan.targetRoleCode;
    let template = baseTemplate;
    if (roleCode !== baseRoleCode) {
      const targetTemplateResult = await tx.execute(sql`
        select id, runtime_agent_id, seat_status, role_profile
        from ece_agent_templates
        where tenant_id = ${input.tenantId}
          and (
            id = ${capacityPlan.targetRoleTemplateId}
            or code = ${roleCode}
          )
        order by case when id = ${capacityPlan.targetRoleTemplateId} then 0 else 1 end
        limit 1
      `);
      template = rows<any>(targetTemplateResult)[0];
    }

    const runtimeAgentId = Number(capacityPlan.runtimeAgentId || 0);
    const runtimeIsActive = capacityPlan.mode === "active";
    if (input.assignmentMode === "signal_only" && capacityPlan.mode === "active") {
      return null;
    }
    const effectiveSignalType = capacityPlan.mode === "active"
      ? "active_capacity"
      : capacityPlan.mode === "inactive"
        ? "inactive_capacity"
        : capacityPlan.mode === "expand"
          ? "capacity_expansion"
          : recommendation.signalType;
    const effectiveThreshold = capacityPlan.mode === "expand"
      ? capacityPlan.expansionDemandThreshold
      : runtimeAgentId > 0
        ? 1
        : recommendation.demandThreshold;
    const reason = capacityPlan.mode === "active"
      ? `${roleTitle} has available capacity. ${input.referenceCode} is assigned to the least-loaded qualified employee (${capacityPlan.openCaseCount}/${capacityPlan.capacityLimit} open cases before assignment).`
      : capacityPlan.mode === "inactive"
        ? `${roleTitle} has provisioned but inactive capacity while ${input.referenceCode} requires this specialist capability.`
        : capacityPlan.mode === "expand"
          ? `${capacityPlan.activeEmployeeCount} active ${roleTitle} employee${capacityPlan.activeEmployeeCount === 1 ? " is" : "s are"} at capacity. ${input.referenceCode} is an overflow signal for governed capacity seat ${capacityPlan.capacityOrdinal}.`
          : recommendation.signalType === "critical_capability_gap"
            ? `${input.referenceCode} exposed a critical execution gap for ${roleTitle}; human staffing review is required.`
            : `Verified demand is accumulating for ${roleTitle}. Review becomes available after ${recommendation.demandThreshold} distinct commercial requirements.`;
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
      dynamicRoleSeat: Boolean(
        capacityPlan.mode === "expand" ||
          recommendation.dynamicRoleSeat ||
          template?.role_profile?.dynamicRoleSeat
      ),
      baseRoleCode,
      capacityOrdinal: capacityPlan.capacityOrdinal,
      capacityLimit: capacityPlan.capacityLimit,
      openCaseCount: capacityPlan.openCaseCount,
      teamOpenCaseCount: capacityPlan.teamOpenCaseCount,
      activeEmployeeCount: capacityPlan.activeEmployeeCount,
      capacityExpansion: capacityPlan.mode === "expand",
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
    const inserted = await tx.execute(sql`
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
    if (!row?.id) return null;
    let assignmentTaskId: number | null = null;
    if (runtimeIsActive && input.assignmentMode !== "signal_only") {
      const assignment = await assignActiveEmployeeToRequirement(tx, {
        tenantId: input.tenantId,
        companyId: input.companyId,
        staffingRequestId: Number(row.id),
        requirementId: input.requirementId,
        referenceCode: input.referenceCode,
        runtimeAgentId,
        roleTitle,
        capacityLimit: capacityPlan.capacityLimit,
      });
      if (assignment.status === "capacity_full") {
        throw new Error("CAPACITY_PLAN_STALE");
      }
      assignmentTaskId = assignment.taskId;
    }
    return {
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
      dynamicRoleSeat: Boolean(
        capacityPlan.mode === "expand" ||
          recommendation.dynamicRoleSeat ||
          template?.role_profile?.dynamicRoleSeat
      ),
      existingRuntimeAgentId: runtimeAgentId || null,
      assignmentTaskId,
      governanceStatus: String(row.governance_status || governance.status),
      companyBrainContextPackId:
        Number(row.company_brain_context_pack_id || governance.contextPackId || 0) || null,
      capacityLimit: capacityPlan.capacityLimit,
      openCaseCount: capacityPlan.openCaseCount,
      activeEmployeeCount: capacityPlan.activeEmployeeCount,
      capacityExpansion: capacityPlan.mode === "expand",
    };
      },
    );
    let proposal: StaffingProposal | null = null;
    try {
      proposal = await persistProposal();
    } catch (error) {
      console.error("industrial_workforce_capacity_transaction_failed", {
        requirementId: input.requirementId,
        baseRoleCode,
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
    if (proposal) proposals.push(proposal);
  }
  return proposals;
}
