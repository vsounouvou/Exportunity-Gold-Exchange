import { Router } from "express";
import { ensureTenantAdmin } from "./utils/auth";
import { parseIntelligenceCronKind, parseIntelligenceTier, type IntelligenceTier } from "../lib/intelligence/policyDefaults";
import {
  attachWorkflowSpecToTask,
  createGovernedCronJob,
  createGovernedTask,
  listGovernedCronJobs,
  listGovernedTasks,
  listIntelligenceAlerts,
  listIntelligenceAuditEvents,
  listIntelligencePolicies,
  listIntelligenceTokenLedger,
  queueGovernedTask,
  transitionGovernedTaskState,
  triggerEventCronJobs,
  triggerGovernedCronJobNow,
  upsertTenantPolicy,
} from "../lib/intelligence/service";
import { normalizeGovernedTaskState } from "../lib/intelligence/stateMachine";

const router = Router();
router.use(ensureTenantAdmin);

function getTenantId(req: any): number {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isInteger(tenantId) || tenantId <= 0) throw new Error("Tenant context required");
  return tenantId;
}

function asPositiveInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function asActorType(adminUser: any): "SUPER" | "MANAGER" {
  const role = String(adminUser?.role || "")
    .trim()
    .toLowerCase();
  const roles: string[] = Array.isArray(adminUser?.roles)
    ? adminUser.roles.map((entry: unknown) => String(entry || "").trim().toLowerCase())
    : [];

  if (role.includes("chairman") || role.includes("super") || roles.some((entry: string) => entry.includes("chairman") || entry.includes("super"))) {
    return "SUPER";
  }
  return "MANAGER";
}

router.get("/policies", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const policies = await listIntelligencePolicies(tenantId);
    res.json({ ok: true, policies });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list policies" });
  }
});

router.put("/policies/:tier", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const tier = parseIntelligenceTier(req.params.tier, "MANAGER");

    const policy = await upsertTenantPolicy({
      tenantId,
      tier,
      maxContext: Number(req.body?.maxContext ?? req.body?.max_context ?? 0),
      maxReasoningDepth: Number(req.body?.maxReasoningDepth ?? req.body?.max_reasoning_depth ?? 0),
      maxTokenBudgetPerTask: Number(req.body?.maxTokenBudgetPerTask ?? req.body?.max_token_budget_per_task ?? 0),
      maxTasksPerHour: Number(req.body?.maxTasksPerHour ?? req.body?.max_tasks_per_hour ?? 0),
      allowCrossTenant: Boolean(req.body?.allowCrossTenant ?? req.body?.allow_cross_tenant),
      allowLlm: Boolean(req.body?.allowLlm ?? req.body?.allow_llm),
      metadata: typeof req.body?.metadata === "object" && req.body.metadata ? req.body.metadata : {},
      userId: req.adminUser?.id ?? null,
    });

    res.json({ ok: true, policy });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "Failed to update policy" });
  }
});

router.get("/tasks", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const state = normalizeGovernedTaskState(req.query?.state) ?? null;
    const moduleId = String(req.query?.moduleId || req.query?.module_id || "").trim() || null;
    const limit = asPositiveInt(req.query?.limit, 100);
    const tasks = await listGovernedTasks({ tenantId, state, moduleId, limit });
    res.json({ ok: true, tasks });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list tasks" });
  }
});

router.post("/tasks", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const actorType = asActorType(req.adminUser);
    const managerTier: IntelligenceTier = parseIntelligenceTier(req.body?.managerTier ?? req.body?.manager_tier, actorType);
    const policyTier: IntelligenceTier = parseIntelligenceTier(req.body?.policyTier ?? req.body?.policy_tier, managerTier);

    const task = await createGovernedTask({
      tenantId,
      moduleId: String((req.body?.moduleId ?? req.body?.module_id) || "").trim() || "general",
      title: String(req.body?.title || "Governed task").trim(),
      instruction: String(req.body?.instruction || "Execute governed workflow").trim(),
      objective: String(req.body?.objective || "").trim() || null,
      managerTier,
      policyTier,
      priority: Number(req.body?.priority ?? 0),
      source: "MANUAL",
      tokenBudget: req.body?.tokenBudget ?? req.body?.token_budget ?? null,
      managerAgentId: asPositiveInt(req.body?.managerAgentId ?? req.body?.manager_agent_id, 0) || null,
      executionAgentId: asPositiveInt(req.body?.executionAgentId ?? req.body?.execution_agent_id, 0) || null,
      createdByUserId: req.adminUser?.id ?? null,
      metadata: typeof req.body?.metadata === "object" && req.body.metadata ? req.body.metadata : {},
    });

    res.status(201).json({ ok: true, task });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "Failed to create governed task" });
  }
});

router.post("/tasks/:id/workflow", async (req: any, res) => {
  try {
    const taskId = asPositiveInt(req.params.id, 0);
    if (!taskId) return res.status(400).json({ message: "Invalid task id" });

    const task = await attachWorkflowSpecToTask({
      taskId,
      workflowSpec: req.body?.workflowSpec ?? req.body,
      actorType: asActorType(req.adminUser),
      actorId: req.adminUser?.id ? String(req.adminUser.id) : null,
    });

    res.json({ ok: true, task });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "Failed to attach workflow" });
  }
});

router.post("/tasks/:id/queue", async (req: any, res) => {
  try {
    const taskId = asPositiveInt(req.params.id, 0);
    if (!taskId) return res.status(400).json({ message: "Invalid task id" });

    const task = await queueGovernedTask({
      taskId,
      actorType: asActorType(req.adminUser),
      actorId: req.adminUser?.id ? String(req.adminUser.id) : null,
    });

    res.json({ ok: true, task });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "Failed to queue task" });
  }
});

router.post("/tasks/:id/state", async (req: any, res) => {
  try {
    const taskId = asPositiveInt(req.params.id, 0);
    if (!taskId) return res.status(400).json({ message: "Invalid task id" });

    const toState = normalizeGovernedTaskState(req.body?.toState ?? req.body?.to_state);
    if (!toState) return res.status(400).json({ message: "Invalid task state" });

    const task = await transitionGovernedTaskState({
      taskId,
      toState,
      actorType: asActorType(req.adminUser),
      actorId: req.adminUser?.id ? String(req.adminUser.id) : null,
      errorCode: req.body?.errorCode ?? req.body?.error_code ?? null,
      errorMessage: req.body?.errorMessage ?? req.body?.error_message ?? null,
      payload: typeof req.body?.payload === "object" && req.body.payload ? req.body.payload : {},
    });

    res.json({ ok: true, task });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "Failed to update state" });
  }
});

router.get("/cron-jobs", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const includeInactive = String(req.query?.includeInactive || req.query?.include_inactive || "").trim().toLowerCase() === "true";
    const jobs = await listGovernedCronJobs({ tenantId, includeInactive });
    res.json({ ok: true, jobs });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list cron jobs" });
  }
});

router.post("/cron-jobs", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);

    const job = await createGovernedCronJob({
      tenantId,
      name: String(req.body?.name || "Governed cron").trim(),
      cronKind: parseIntelligenceCronKind(req.body?.cronKind ?? req.body?.cron_kind, "TIME"),
      triggerMode: String((req.body?.triggerMode ?? req.body?.trigger_mode) || "SCHEDULE").trim().toUpperCase() === "EVENT" ? "EVENT" : "SCHEDULE",
      scheduleCron: String((req.body?.scheduleCron ?? req.body?.schedule_cron) || "").trim() || null,
      eventKey: String((req.body?.eventKey ?? req.body?.event_key) || "").trim() || null,
      moduleId: String((req.body?.moduleId ?? req.body?.module_id) || "general").trim(),
      policyTier: parseIntelligenceTier(req.body?.policyTier ?? req.body?.policy_tier, "EXECUTION"),
      workflowTemplate: typeof req.body?.workflowTemplate === "object" && req.body.workflowTemplate
        ? req.body.workflowTemplate
        : typeof req.body?.workflow_template === "object" && req.body.workflow_template
          ? req.body.workflow_template
          : {},
      metadata: typeof req.body?.metadata === "object" && req.body.metadata ? req.body.metadata : {},
      createdByUserId: req.adminUser?.id ?? null,
    });

    res.status(201).json({ ok: true, job });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "Failed to create cron job" });
  }
});

router.post("/cron-jobs/:id/trigger", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const cronJobId = asPositiveInt(req.params.id, 0);
    if (!cronJobId) return res.status(400).json({ message: "Invalid cron job id" });

    const result = await triggerGovernedCronJobNow({
      tenantId,
      cronJobId,
      actorType: asActorType(req.adminUser),
      actorId: req.adminUser?.id ? String(req.adminUser.id) : null,
      createdByUserId: req.adminUser?.id ?? null,
    });

    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "Failed to trigger cron job" });
  }
});

router.post("/events/:eventKey/trigger", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const eventKey = String(req.params.eventKey || "").trim();
    if (!eventKey) return res.status(400).json({ message: "eventKey required" });

    const results = await triggerEventCronJobs({
      tenantId,
      eventKey,
      actorType: asActorType(req.adminUser),
      actorId: req.adminUser?.id ? String(req.adminUser.id) : null,
      createdByUserId: req.adminUser?.id ?? null,
    });

    res.json({ ok: true, results });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "Failed to trigger event cron jobs" });
  }
});

router.get("/audit-events", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const limit = asPositiveInt(req.query?.limit, 200);
    const taskId = asPositiveInt(req.query?.taskId ?? req.query?.task_id, 0) || null;
    const events = await listIntelligenceAuditEvents({ tenantId, limit, taskId });
    res.json({ ok: true, events });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list audit events" });
  }
});

router.get("/token-ledger", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const limit = asPositiveInt(req.query?.limit, 200);
    const taskId = asPositiveInt(req.query?.taskId ?? req.query?.task_id, 0) || null;
    const entries = await listIntelligenceTokenLedger({ tenantId, limit, taskId });
    res.json({ ok: true, entries });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list token ledger" });
  }
});

router.get("/alerts", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const limit = asPositiveInt(req.query?.limit, 200);
    const onlyOpen = String(req.query?.onlyOpen || req.query?.only_open || "").trim().toLowerCase() === "true";
    const alerts = await listIntelligenceAlerts({ tenantId, limit, onlyOpen });
    res.json({ ok: true, alerts });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list alerts" });
  }
});

export default router;
