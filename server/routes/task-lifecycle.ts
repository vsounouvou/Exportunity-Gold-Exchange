import { Router } from "express";
import { 
  createTask, 
  getTaskById, 
  getTasksByCompany, 
  getTasksByAgent,
  updateTaskStatus, 
  assignTask,
  linkTaskToMeeting,
  createRecurringTaskInstance,
  processRecurringTasks,
  getBlockedTasks,
  getOverdueTasks,
  type TaskStatus,
  type TaskPriority
} from "../lib/taskLifecycleService";
import { db } from "@db";
import { tasks } from "@db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { 
      companyId, title, description, agentId, priority, dueDate,
      isGroupTask, participantAgentIds, isRecurring, recurrenceRule, sourceMeetingId 
    } = req.body;
    const goalId = Number(req.body?.goalId ?? req.body?.goal_id ?? 0);
    const objectiveId = Number(req.body?.objectiveId ?? req.body?.objective_id ?? goalId ?? 0);
    
    if (!companyId || !title || !description) {
      return res.status(400).json({ error: "companyId, title, and description are required" });
    }
    if (!goalId || !objectiveId) {
      return res.status(422).json({ error: "goalId and objectiveId are required to create tasks" });
    }
    
    const task = await createTask({
      companyId,
      goalId,
      objectiveId,
      title,
      description,
      agentId,
      priority: priority as TaskPriority,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      isGroupTask,
      participantAgentIds,
      isRecurring,
      recurrenceRule,
      sourceMeetingId,
    });
    
    res.status(201).json(task);
  } catch (error: any) {
    console.error("[TaskLifecycle] Create error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/company/:companyId", async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    const { status, priority, agentId, goalId, isRecurring } = req.query;
    
    const tasksList = await getTasksByCompany(companyId, {
      status: status as TaskStatus | undefined,
      priority: priority as TaskPriority | undefined,
      agentId: agentId ? parseInt(agentId as string) : undefined,
      goalId: goalId ? parseInt(goalId as string) : undefined,
      isRecurring: isRecurring !== undefined ? isRecurring === 'true' : undefined,
    });
    
    res.json(tasksList);
  } catch (error: any) {
    console.error("[TaskLifecycle] Get by company error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/agent/:agentId", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const tasksList = await getTasksByAgent(agentId);
    res.json(tasksList);
  } catch (error: any) {
    console.error("[TaskLifecycle] Get by agent error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const task = await getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    res.json(task);
  } catch (error: any) {
    console.error("[TaskLifecycle] Get by ID error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { status, reason } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }
    
    const validStatuses: TaskStatus[] = ['backlog', 'in_progress', 'blocked', 'done', 'canceled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    
    const result = await updateTaskStatus(taskId, status, reason);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json(result.task);
  } catch (error: any) {
    console.error("[TaskLifecycle] Update status error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/assign", async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { agentId } = req.body;
    
    if (!agentId) {
      return res.status(400).json({ error: "agentId is required" });
    }
    
    const updated = await assignTask(taskId, agentId);
    
    if (!updated) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    res.json(updated);
  } catch (error: any) {
    console.error("[TaskLifecycle] Assign error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { title, description, priority, dueDate, isGroupTask, participantAgentIds } = req.body;
    const hasGoalId = Object.prototype.hasOwnProperty.call(req.body || {}, "goalId") || Object.prototype.hasOwnProperty.call(req.body || {}, "goal_id");
    const hasObjectiveId =
      Object.prototype.hasOwnProperty.call(req.body || {}, "objectiveId") ||
      Object.prototype.hasOwnProperty.call(req.body || {}, "objective_id");
    const goalId = hasGoalId ? Number(req.body?.goalId ?? req.body?.goal_id ?? 0) : undefined;
    const objectiveId = hasObjectiveId
      ? Number(req.body?.objectiveId ?? req.body?.objective_id ?? 0)
      : hasGoalId
        ? Number(goalId ?? 0)
        : undefined;
    
    const updates: any = { updatedAt: new Date() };
    
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
    if (hasGoalId && !goalId) return res.status(422).json({ error: "goalId cannot be empty" });
    if (hasObjectiveId && !objectiveId) return res.status(422).json({ error: "objectiveId cannot be empty" });
    if (goalId !== undefined) updates.goalId = goalId;
    if (objectiveId !== undefined) updates.objectiveId = objectiveId;
    if (isGroupTask !== undefined) updates.isGroupTask = isGroupTask;
    if (participantAgentIds !== undefined) updates.participantAgentIds = participantAgentIds;
    
    const [updated] = await db.update(tasks)
      .set(updates)
      .where(eq(tasks.id, taskId))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    res.json(updated);
  } catch (error: any) {
    console.error("[TaskLifecycle] Update error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/link-meeting", async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { meetingId } = req.body;
    
    if (!meetingId) {
      return res.status(400).json({ error: "meetingId is required" });
    }
    
    await linkTaskToMeeting(taskId, meetingId);
    res.json({ success: true });
  } catch (error: any) {
    console.error("[TaskLifecycle] Link meeting error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/create-instance", async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const instance = await createRecurringTaskInstance(taskId);
    
    if (!instance) {
      return res.status(400).json({ error: "Could not create instance. Task may not be recurring or end date passed." });
    }
    
    res.status(201).json(instance);
  } catch (error: any) {
    console.error("[TaskLifecycle] Create instance error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/process-recurring", async (req, res) => {
  try {
    const createdCount = await processRecurringTasks();
    res.json({ success: true, createdCount });
  } catch (error: any) {
    console.error("[TaskLifecycle] Process recurring error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/company/:companyId/blocked", async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    const tasksList = await getBlockedTasks(companyId);
    res.json(tasksList);
  } catch (error: any) {
    console.error("[TaskLifecycle] Get blocked error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/company/:companyId/overdue", async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    const tasksList = await getOverdueTasks(companyId);
    res.json(tasksList);
  } catch (error: any) {
    console.error("[TaskLifecycle] Get overdue error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    
    const [deleted] = await db.delete(tasks)
      .where(eq(tasks.id, taskId))
      .returning();
    
    if (!deleted) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    res.json({ success: true, deleted });
  } catch (error: any) {
    console.error("[TaskLifecycle] Delete error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
