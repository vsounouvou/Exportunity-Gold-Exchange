type ApprovedTaskLike = {
  id: number;
  title: string;
  description: string;
  agentId?: number | null;
  companyId?: number | null;
  goalId?: number | null;
  objectiveId?: number | null;
  priority?: string | null;
  dueDate?: Date | string | null;
  sourceMeetingId?: number | null;
  sourceMessageId?: number | null;
};

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildApprovedTaskActionLink(task: ApprovedTaskLike, approverAgentId: number) {
  const taskId = positiveInteger(task.id);
  if (!taskId) throw new Error("A persisted task is required before approval");

  const approvedByAgentId = positiveInteger(approverAgentId);
  if (!approvedByAgentId) throw new Error("A valid approving agent is required");

  const dueDate = task.dueDate instanceof Date ? task.dueDate.toISOString() : task.dueDate || null;

  return {
    actionType: "CREATE_TASK" as const,
    idempotencyKey: `task-approval:${taskId}`,
    correlationId: `meeting-task:${taskId}`,
    relatedThreadId: positiveInteger(task.sourceMeetingId),
    payload: {
      existingTaskId: taskId,
      taskId,
      title: String(task.title || "").trim(),
      description: String(task.description || task.title || "").trim(),
      agentId: positiveInteger(task.agentId),
      companyId: positiveInteger(task.companyId),
      goalId: positiveInteger(task.goalId),
      objectiveId: positiveInteger(task.objectiveId),
      priority: String(task.priority || "medium").trim().toLowerCase(),
      status: "ready",
      dueDate,
      sourceMeetingId: positiveInteger(task.sourceMeetingId),
      sourceMessageId: positiveInteger(task.sourceMessageId),
      approvedByAgentId,
      source: "meeting_task_approval",
    },
  };
}
