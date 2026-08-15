import { db } from "@db";
import { tasks, activityLog, agents, messages, chatRooms, companies, actionRequests } from "@db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { generateAgentResponse } from "./ai-provider";
import { createActionRequest } from "./actions/ActionRouter";
import { buildApprovedTaskActionLink } from "./task-action-link";

interface ExtractedTask {
  title: string;
  description: string;
  assignedTo: string;
  priority: "low" | "medium" | "high" | "critical";
  dueDate?: string;
}

interface TaskExtractionResult {
  tasks: ExtractedTask[];
  decisions: string[];
  summary: string;
}

export async function extractTasksFromMeeting(
  roomId: number,
  conversationId: string,
  companyId: number
): Promise<TaskExtractionResult> {
  const roomMessages = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [desc(messages.createdAt)],
    limit: 50,
  });

  if (roomMessages.length === 0) {
    return { tasks: [], decisions: [], summary: "No messages to extract from" };
  }

  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  const agentMap = new Map(companyAgents.map(a => [a.id, a]));
  
  const transcript = roomMessages
    .reverse()
    .map(m => {
      const agent = m.fromAgentId ? agentMap.get(m.fromAgentId) : null;
      const speaker = agent ? agent.name : "User";
      return `${speaker}: ${m.content}`;
    })
    .join("\n");

  const extractionPrompt = `Analyze this meeting transcript and extract actionable tasks, decisions made, and a brief summary.

TRANSCRIPT:
${transcript}

AVAILABLE TEAM MEMBERS:
${companyAgents.map(a => `- ${a.name} (${a.role})`).join("\n")}

Respond in this exact JSON format:
{
  "tasks": [
    {
      "title": "Brief task title",
      "description": "Detailed description of what needs to be done",
      "assignedTo": "Agent name from the list above",
      "priority": "low|medium|high|critical",
      "dueDate": "YYYY-MM-DD or null if not specified"
    }
  ],
  "decisions": ["Decision 1", "Decision 2"],
  "summary": "Brief 1-2 sentence summary of the meeting"
}

Rules:
- Only extract concrete, actionable tasks
- Assign tasks to appropriate team members based on their roles
- Set realistic priorities
- If no clear tasks, return empty tasks array
- Always include a summary`;

  try {
    const response = await generateAgentResponse(extractionPrompt, {
      role: "Meeting Analyst",
      companyId,
      context: {
        recentMessages: [],
      },
    });

    const jsonMatch = response.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { tasks: [], decisions: [], summary: "Could not parse extraction results" };
    }

    const result: TaskExtractionResult = JSON.parse(jsonMatch[0]);
    return result;
  } catch (error) {
    console.error("[TaskExtraction] Error:", error);
    return { tasks: [], decisions: [], summary: "Extraction failed" };
  }
}

export async function createTasksFromExtraction(
  extraction: TaskExtractionResult,
  sourceMeetingId: number,
  companyId: number,
  goalId?: number
): Promise<number[]> {
  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  const agentNameMap = new Map(
    companyAgents.map(a => [a.name.toLowerCase(), a])
  );

  const createdTaskIds: number[] = [];

  for (const extractedTask of extraction.tasks) {
    const assignedAgent = agentNameMap.get(extractedTask.assignedTo.toLowerCase());
    
    if (!assignedAgent) {
      console.log(`[TaskExtraction] No agent found for: ${extractedTask.assignedTo}`);
      continue;
    }

    const manager = assignedAgent.managerId
      ? companyAgents.find(a => a.id === assignedAgent.managerId)
      : null;

    const [newTask] = await db.insert(tasks).values({
      agentId: assignedAgent.id,
      companyId,
      goalId: goalId ?? null,
      title: extractedTask.title,
      description: extractedTask.description,
      priority: extractedTask.priority,
      status: "pending",
      sourceMeetingId,
      approvalStatus: manager ? "pending" : "approved",
      dueDate: extractedTask.dueDate ? new Date(extractedTask.dueDate) : null,
    }).returning();

    createdTaskIds.push(newTask.id);

    await db.insert(activityLog).values({
      companyId,
      agentId: assignedAgent.id,
      eventType: "task_created",
      eventCategory: "task",
      title: `Task created: ${extractedTask.title}`,
      description: `Extracted from meeting, assigned to ${assignedAgent.name}`,
      metadata: {
        taskId: newTask.id,
        meetingId: sourceMeetingId,
      },
    });
  }

  return createdTaskIds;
}

export async function approveTask(
  taskId: number,
  approverAgentId: number,
  context?: { tenantId?: number | null; requestedByUserId?: number | null },
): Promise<{ success: boolean; actionRequestId?: number }> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) return { success: false };

  const assignedAgent = task.agentId
    ? await db.query.agents.findFirst({ where: eq(agents.id, task.agentId) })
    : null;

  const approver = await db.query.agents.findFirst({
    where: eq(agents.id, approverAgentId),
  });

  if (!approver) return { success: false };

  const canApprove =
    assignedAgent?.managerId === approverAgentId ||
    approver.isDepartmentHead ||
    approver.role?.toLowerCase().includes("director") ||
    approver.role?.toLowerCase().includes("ceo") ||
    approver.role?.toLowerCase().includes("chief");

  if (!canApprove) return { success: false };

  const company = task.companyId
    ? await db.query.companies.findFirst({
        where: eq(companies.id, task.companyId),
        columns: { id: true, tenantId: true },
      })
    : null;
  const requestedTenantId = Number(context?.tenantId || 0) || null;
  if (!company?.tenantId || (requestedTenantId && Number(company.tenantId) !== requestedTenantId)) {
    return { success: false };
  }
  const tenantId = Number(company.tenantId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error("Cannot create an execution record without a tenant");
  }

  await db.update(tasks)
    .set({
      approvalStatus: "approved",
      approvedByAgentId: approverAgentId,
      approvedAt: new Date(),
      status: "pending",
    })
    .where(eq(tasks.id, taskId));

  const actionLink = buildApprovedTaskActionLink(task, approverAgentId);
  let actionRequest = await db.query.actionRequests.findFirst({
    where: and(
      eq(actionRequests.tenantId, tenantId),
      eq(actionRequests.idempotencyKey, actionLink.idempotencyKey),
    ),
  });

  if (!actionRequest) {
    try {
      actionRequest = await createActionRequest({
        tenantId,
        requestedByUserId: context?.requestedByUserId ?? null,
        actionType: actionLink.actionType,
        payload: actionLink.payload,
        idempotencyKey: actionLink.idempotencyKey,
        correlationId: actionLink.correlationId,
        relatedThreadId: actionLink.relatedThreadId,
        isAdmin: true,
      });
    } catch (error) {
      actionRequest = await db.query.actionRequests.findFirst({
        where: and(
          eq(actionRequests.tenantId, tenantId),
          eq(actionRequests.idempotencyKey, actionLink.idempotencyKey),
        ),
      });
      if (!actionRequest) throw error;
    }
  }

  await db.insert(activityLog).values({
    companyId: task.companyId ?? 0,
    agentId: approverAgentId,
    eventType: "task_approved",
    eventCategory: "task",
    title: `Task approved: ${task.title}`,
    description: `Approved by ${approver.name}`,
    metadata: {
      taskId,
      targetAgentId: task.agentId ?? undefined,
    },
  });

  return { success: true, actionRequestId: Number(actionRequest?.id || 0) || undefined };
}

export async function rejectTask(
  taskId: number,
  approverAgentId: number,
  reason: string
): Promise<boolean> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) return false;

  const approver = await db.query.agents.findFirst({
    where: eq(agents.id, approverAgentId),
  });

  if (!approver) return false;

  await db.update(tasks)
    .set({
      approvalStatus: "rejected",
      approvedByAgentId: approverAgentId,
      approvedAt: new Date(),
      rejectionReason: reason,
      status: "cancelled",
    })
    .where(eq(tasks.id, taskId));

  await db.insert(activityLog).values({
    companyId: task.companyId ?? 0,
    agentId: approverAgentId,
    eventType: "task_rejected",
    eventCategory: "task",
    title: `Task rejected: ${task.title}`,
    description: `Rejected by ${approver.name}: ${reason}`,
    metadata: {
      taskId,
      targetAgentId: task.agentId ?? undefined,
    },
  });

  return true;
}

export async function getAgentTasks(
  agentId: number,
  includeAll: boolean = false
): Promise<any[]> {
  const conditions = includeAll
    ? eq(tasks.agentId, agentId)
    : and(
        eq(tasks.agentId, agentId),
        eq(tasks.approvalStatus, "approved")
      );

  return db.query.tasks.findMany({
    where: conditions,
    orderBy: [desc(tasks.createdAt)],
  });
}

export async function getPendingApprovals(
  managerAgentId: number
): Promise<any[]> {
  const directReports = await db.query.agents.findMany({
    where: eq(agents.managerId, managerAgentId),
  });

  const reportIds = directReports.map(r => r.id);
  
  if (reportIds.length === 0) return [];

  const pendingTasks = await db.query.tasks.findMany({
    where: eq(tasks.approvalStatus, "pending"),
    orderBy: [desc(tasks.createdAt)],
  });

  return pendingTasks.filter(t => t.agentId && reportIds.includes(t.agentId));
}
