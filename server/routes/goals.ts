import { Router } from "express";
import { 
  createGoal, 
  getGoalById, 
  getGoalsByCompany, 
  updateGoalStatus, 
  updateGoalProgress,
  getGoalMeetings,
  getGoalAgents,
  checkGoalsWithoutTasks,
  checkBlockedGoals,
  type GoalStatus,
  type GoalPriority
} from "../lib/goalService";
import { db } from "@db";
import { actionRuns, goals } from "@db/schema";
import { eq } from "drizzle-orm";
import { ensureTenantStaff } from "./utils/auth";
import { ActionExecutionError, executeAction } from "../lib/actions/executeAction";
import { completeRunSuccess } from "../lib/actions/actionRuns";

const router = Router();

function resolveTenantId(req: any) {
  const tenantId = Number(req?.tenant?.id);
  if (Number.isFinite(tenantId) && tenantId > 0) return Math.trunc(tenantId);
  const fallback = Number(req?.body?.tenantId ?? req?.query?.tenantId);
  if (Number.isFinite(fallback) && fallback > 0) return Math.trunc(fallback);
  return 1;
}

function resolveMode(value: unknown) {
  return String(value || "").trim().toUpperCase() === "SIMULATE" ? "SIMULATE" : "LIVE";
}

async function runActionGate(
  req: any,
  res: any,
  actionKey: string,
  payload: Record<string, unknown>,
  objectiveId?: number | null,
) {
  try {
    const actionResult = await executeAction(actionKey, payload, {
      tenantId: resolveTenantId(req),
      companyId: Number(req?.body?.companyId ?? req?.query?.companyId) || null,
      actorUserId: Number(req?.staffUser?.id ?? 0) || null,
      actorRole: req?.staffUser?.role ?? null,
      actor: req?.staffUser ?? null,
      objectiveId: (objectiveId ?? Number(req?.params?.id ?? 0)) || null,
      sessionId: req?.body?.sessionId ?? req?.body?.meetingId ?? null,
      conversationId: req?.body?.conversationId ?? null,
      mode: resolveMode(req?.body?.mode),
      approvalReason: typeof req?.body?.approvalReason === "string" ? req.body.approvalReason : null,
    });

    if (!actionResult.ok && actionResult.status === "REQUIRES_APPROVAL") {
      res.status(202).json({ ok: false, requiresApproval: true, action: actionResult });
      return null;
    }

    return actionResult;
  } catch (error: any) {
    if (error instanceof ActionExecutionError) {
      res.status(error.statusCode || 500).json({
        message: error.message,
        code: error.code,
        correlationId: error.correlationId,
      });
      return null;
    }
    throw error;
  }
}

router.post("/", ensureTenantStaff, async (req, res) => {
  try {
    const { companyId, title, description, ownerAgentId, deadline, priority, parentGoalId, metadata } = req.body;
    
    if (!companyId || !title) {
      return res.status(400).json({ error: "companyId and title are required" });
    }

    const gate = await runActionGate(req, res, "OBJECTIVE_CREATE", {
      companyId,
      title,
      description,
      ownerAgentId,
      deadline,
      priority,
      parentGoalId,
    });
    if (!gate) return;
    
    const goal = await createGoal({
      companyId,
      title,
      description,
      ownerAgentId,
      deadline: deadline ? new Date(deadline) : undefined,
      priority: priority as GoalPriority,
      parentGoalId,
      metadata,
    });

    const actionRunId = Number(req.body?.actionRunId ?? req.body?.action_run_id ?? 0) || null;
    if (actionRunId) {
      const tenantId = resolveTenantId(req);
      await db
        .update(actionRuns)
        .set({ objectiveId: goal.id, updatedAt: new Date() })
        .where(eq(actionRuns.id, actionRunId));

      try {
        await completeRunSuccess({
          tenantId,
          runId: actionRunId,
          result: { objective_id: goal.id, company_id: companyId },
          evidence: [
            {
              evidenceType: "OBJECTIVE_CREATE",
              payload: {
                objective_id: goal.id,
                company_id: companyId,
                title,
              },
            },
          ],
        });
      } catch (error: any) {
        return res.status(500).json({
          error: "Objective created but evidence enforcement failed",
          message: error?.message || "Missing evidence",
          objective: goal,
        });
      }
    }
    
    res.status(201).json(goal);
  } catch (error: any) {
    console.error("[Goals] Create error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/company/:companyId", ensureTenantStaff, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    const { status, priority, ownerAgentId } = req.query;

    const gate = await runActionGate(req, res, "OBJECTIVE_SEARCH", {
      companyId,
      status,
      priority,
      ownerAgentId,
    });
    if (!gate) return;
    
    const goalsList = await getGoalsByCompany(companyId, {
      status: status as GoalStatus | undefined,
      priority: priority as GoalPriority | undefined,
      ownerAgentId: ownerAgentId ? parseInt(ownerAgentId as string) : undefined,
    });
    
    res.json(goalsList);
  } catch (error: any) {
    console.error("[Goals] Get by company error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", ensureTenantStaff, async (req, res) => {
  try {
    const goalId = parseInt(req.params.id);

    const gate = await runActionGate(req, res, "OBJECTIVE_VIEW", { goalId }, goalId);
    if (!gate) return;

    const goal = await getGoalById(goalId);
    
    if (!goal) {
      return res.status(404).json({ error: "Goal not found" });
    }
    
    res.json(goal);
  } catch (error: any) {
    console.error("[Goals] Get by ID error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/status", ensureTenantStaff, async (req, res) => {
  try {
    const goalId = parseInt(req.params.id);
    const { status, reason } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }
    
    const validStatuses: GoalStatus[] = ['planned', 'in_progress', 'blocked', 'completed', 'canceled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const gate = await runActionGate(
      req,
      res,
      status === "completed" || status === "canceled" ? "OBJECTIVE_CLOSE" : "OBJECTIVE_UPDATE",
      { goalId, status, reason },
      goalId,
    );
    if (!gate) return;
    
    const updated = await updateGoalStatus(goalId, status, reason);
    
    if (!updated) {
      return res.status(404).json({ error: "Goal not found" });
    }
    
    res.json(updated);
  } catch (error: any) {
    console.error("[Goals] Update status error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id", ensureTenantStaff, async (req, res) => {
  try {
    const goalId = parseInt(req.params.id);
    const { title, description, priority, deadline, ownerAgentId, metadata } = req.body;

    const gate = await runActionGate(
      req,
      res,
      "OBJECTIVE_UPDATE",
      { goalId, title, description, priority, deadline, ownerAgentId, metadata },
      goalId,
    );
    if (!gate) return;
    
    const updates: any = { updatedAt: new Date() };
    
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (deadline !== undefined) updates.deadline = deadline ? new Date(deadline) : null;
    if (ownerAgentId !== undefined) updates.ownerAgentId = ownerAgentId;
    if (metadata !== undefined) updates.metadata = metadata;
    
    const [updated] = await db.update(goals)
      .set(updates)
      .where(eq(goals.id, goalId))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: "Goal not found" });
    }
    
    res.json(updated);
  } catch (error: any) {
    console.error("[Goals] Update error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/recalculate-progress", ensureTenantStaff, async (req, res) => {
  try {
    const goalId = parseInt(req.params.id);

    const gate = await runActionGate(req, res, "OBJECTIVE_UPDATE", { goalId, op: "recalculate_progress" }, goalId);
    if (!gate) return;

    const progress = await updateGoalProgress(goalId);
    res.json({ progress });
  } catch (error: any) {
    console.error("[Goals] Recalculate progress error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id/meetings", ensureTenantStaff, async (req, res) => {
  try {
    const goalId = parseInt(req.params.id);

    const gate = await runActionGate(req, res, "OBJECTIVE_VIEW", { goalId, relation: "meetings" }, goalId);
    if (!gate) return;

    const meetings = await getGoalMeetings(goalId);
    res.json(meetings);
  } catch (error: any) {
    console.error("[Goals] Get meetings error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id/agents", ensureTenantStaff, async (req, res) => {
  try {
    const goalId = parseInt(req.params.id);

    const gate = await runActionGate(req, res, "OBJECTIVE_VIEW", { goalId, relation: "agents" }, goalId);
    if (!gate) return;

    const agentsList = await getGoalAgents(goalId);
    res.json(agentsList);
  } catch (error: any) {
    console.error("[Goals] Get agents error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/company/:companyId/without-tasks", ensureTenantStaff, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);

    const gate = await runActionGate(req, res, "OBJECTIVE_SEARCH", { companyId, filter: "without_tasks" });
    if (!gate) return;

    const goalsList = await checkGoalsWithoutTasks(companyId);
    res.json(goalsList);
  } catch (error: any) {
    console.error("[Goals] Check without tasks error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/company/:companyId/blocked", ensureTenantStaff, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);

    const gate = await runActionGate(req, res, "OBJECTIVE_SEARCH", { companyId, filter: "blocked" });
    if (!gate) return;

    const goalsList = await checkBlockedGoals(companyId);
    res.json(goalsList);
  } catch (error: any) {
    console.error("[Goals] Check blocked error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", ensureTenantStaff, async (req, res) => {
  try {
    const goalId = parseInt(req.params.id);

    const gate = await runActionGate(req, res, "OBJECTIVE_DELETE", { goalId }, goalId);
    if (!gate) return;
    
    const [deleted] = await db.delete(goals)
      .where(eq(goals.id, goalId))
      .returning();
    
    if (!deleted) {
      return res.status(404).json({ error: "Goal not found" });
    }
    
    res.json({ success: true, deleted });
  } catch (error: any) {
    console.error("[Goals] Delete error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
