import { db } from "@db";
import { tasks, goals, meetingPurposes, agents, activityLog } from "@db/schema";
import { eq, and, desc, asc, sql, inArray, isNull, gte, lte } from "drizzle-orm";
import { createGoal, updateGoalProgress } from "./goalService";

export type TaskStatus = 'backlog' | 'in_progress' | 'blocked' | 'done' | 'canceled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface CreateTaskInput {
  companyId: number;
  goalId: number;
  objectiveId: number;
  title: string;
  description: string;
  agentId?: number;
  priority?: TaskPriority;
  dueDate?: Date;
  isGroupTask?: boolean;
  participantAgentIds?: number[];
  isRecurring?: boolean;
  recurrenceRule?: {
    pattern: 'daily' | 'weekly' | 'monthly' | 'custom';
    interval?: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    endDate?: string;
  };
  sourceMeetingId?: number;
}

export interface TaskWithRelations {
  id: number;
  companyId: number | null;
  goalId: number | null;
  objectiveId: number | null;
  title: string;
  description: string;
  agentId: number | null;
  priority: string | null;
  status: string | null;
  dueDate: Date | null;
  isGroupTask: boolean | null;
  participantAgentIds: number[] | null;
  isRecurring: boolean | null;
  recurrenceRule: any;
  sourceMeetingId: number | null;
  lastMeetingId: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  completedAt: Date | null;
  agent?: {
    id: number;
    name: string;
    role: string | null;
  } | null;
  goal?: {
    id: number;
    title: string;
    status: string | null;
  } | null;
  objective?: {
    id: number;
    title: string;
    status: string | null;
  } | null;
  lastMeeting?: {
    id: number;
    topic: string | null;
    summary: string | null;
  } | null;
}

const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['in_progress', 'canceled'],
  in_progress: ['done', 'blocked', 'backlog', 'canceled'],
  blocked: ['in_progress', 'backlog', 'canceled'],
  done: ['in_progress'],
  canceled: ['backlog'],
};

async function resolveTaskGoalObjectiveLink(
  companyId: number,
  goalId?: number,
  objectiveId?: number
): Promise<{ goalId: number; objectiveId: number }> {
  const normalizedGoalId = Number.isFinite(goalId as number) && Number(goalId) > 0 ? Number(goalId) : undefined;
  const normalizedObjectiveId =
    Number.isFinite(objectiveId as number) && Number(objectiveId) > 0 ? Number(objectiveId) : undefined;

  if (normalizedGoalId && normalizedObjectiveId) return { goalId: normalizedGoalId, objectiveId: normalizedObjectiveId };
  if (normalizedGoalId && !normalizedObjectiveId) return { goalId: normalizedGoalId, objectiveId: normalizedGoalId };
  if (!normalizedGoalId && normalizedObjectiveId) return { goalId: normalizedObjectiveId, objectiveId: normalizedObjectiveId };

  const existingGoal = await db.query.goals.findFirst({
    where: eq(goals.companyId, companyId),
    columns: { id: true },
    orderBy: [desc(goals.updatedAt), desc(goals.id)],
  });
  if (existingGoal?.id) return { goalId: existingGoal.id, objectiveId: existingGoal.id };

  const created = await createGoal({
    companyId,
    title: "Operational Backlog",
    description: "Auto-generated goal to attach meeting-derived tasks.",
    priority: "medium",
  });
  return { goalId: created.id, objectiveId: created.id };
}

export async function createTask(input: CreateTaskInput): Promise<typeof tasks.$inferSelect> {
  const [task] = await db.insert(tasks)
    .values({
      companyId: input.companyId,
      goalId: input.goalId,
      objectiveId: input.objectiveId,
      title: input.title,
      description: input.description,
      agentId: input.agentId || null,
      priority: input.priority || 'medium',
      status: 'backlog',
      dueDate: input.dueDate || null,
      isGroupTask: input.isGroupTask || false,
      participantAgentIds: input.participantAgentIds || [],
      isRecurring: input.isRecurring || false,
      recurrenceRule: input.recurrenceRule || null,
      sourceMeetingId: input.sourceMeetingId || null,
      approvalStatus: 'pending',
    })
    .returning();
  
  await logTaskActivity(
    input.companyId,
    task.id,
    'task_created',
    `Task created: ${task.title}`,
    { goalId: input.goalId, objectiveId: input.objectiveId, agentId: input.agentId }
  );
  
  if (input.sourceMeetingId) {
    await linkTaskToMeeting(task.id, input.sourceMeetingId);
  }
  
  return task;
}

export async function getTaskById(taskId: number): Promise<TaskWithRelations | null> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: {
      agent: true,
      goal: true,
      objective: true,
    },
  });
  
  if (!task) return null;
  
  let lastMeeting = null;
  if (task.lastMeetingId) {
    lastMeeting = await db.query.meetingPurposes.findFirst({
      where: eq(meetingPurposes.id, task.lastMeetingId),
    });
  }
  
  return {
    ...task,
    participantAgentIds: task.participantAgentIds as number[] | null,
    agent: task.agent ? {
      id: task.agent.id,
      name: task.agent.name,
      role: task.agent.role,
    } : null,
    goal: task.goal ? {
      id: task.goal.id,
      title: task.goal.title,
      status: task.goal.status,
    } : null,
    objective: task.objective ? {
      id: task.objective.id,
      title: task.objective.title,
      status: task.objective.status,
    } : null,
    lastMeeting: lastMeeting ? {
      id: lastMeeting.id,
      topic: lastMeeting.topic,
      summary: lastMeeting.summary,
    } : null,
  };
}

export async function getTasksByCompany(companyId: number, filters?: {
  status?: TaskStatus;
  priority?: TaskPriority;
  agentId?: number;
  goalId?: number;
  isRecurring?: boolean;
}): Promise<TaskWithRelations[]> {
  let conditions = [eq(tasks.companyId, companyId)];
  
  if (filters?.status) {
    conditions.push(eq(tasks.status, filters.status));
  }
  if (filters?.priority) {
    conditions.push(eq(tasks.priority, filters.priority));
  }
  if (filters?.agentId) {
    conditions.push(eq(tasks.agentId, filters.agentId));
  }
  if (filters?.goalId) {
    conditions.push(eq(tasks.goalId, filters.goalId));
  }
  if (filters?.isRecurring !== undefined) {
    conditions.push(eq(tasks.isRecurring, filters.isRecurring));
  }
  
  const tasksList = await db.query.tasks.findMany({
    where: and(...conditions),
    with: {
      agent: true,
      goal: true,
      objective: true,
    },
    orderBy: [asc(tasks.dueDate), desc(tasks.priority), desc(tasks.createdAt)],
  });
  
  return tasksList.map(task => ({
    ...task,
    participantAgentIds: task.participantAgentIds as number[] | null,
    agent: task.agent ? {
      id: task.agent.id,
      name: task.agent.name,
      role: task.agent.role,
    } : null,
    goal: task.goal ? {
      id: task.goal.id,
      title: task.goal.title,
      status: task.goal.status,
    } : null,
    objective: task.objective ? {
      id: task.objective.id,
      title: task.objective.title,
      status: task.objective.status,
    } : null,
    lastMeeting: null,
  }));
}

export async function getTasksByAgent(agentId: number): Promise<TaskWithRelations[]> {
  const agentTasks = await db.query.tasks.findMany({
    where: eq(tasks.agentId, agentId),
    with: {
      agent: true,
      goal: true,
      objective: true,
    },
    orderBy: [asc(tasks.dueDate), desc(tasks.priority)],
  });
  
  return agentTasks.map(task => ({
    ...task,
    participantAgentIds: task.participantAgentIds as number[] | null,
    agent: task.agent ? {
      id: task.agent.id,
      name: task.agent.name,
      role: task.agent.role,
    } : null,
    goal: task.goal ? {
      id: task.goal.id,
      title: task.goal.title,
      status: task.goal.status,
    } : null,
    objective: task.objective ? {
      id: task.objective.id,
      title: task.objective.title,
      status: task.objective.status,
    } : null,
    lastMeeting: null,
  }));
}

export async function updateTaskStatus(
  taskId: number,
  newStatus: TaskStatus,
  reason?: string
): Promise<{ success: boolean; task?: typeof tasks.$inferSelect; error?: string }> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  
  if (!task) {
    return { success: false, error: 'Task not found' };
  }
  
  const currentStatus = (task.status || 'backlog') as TaskStatus;
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
  
  if (!allowedTransitions.includes(newStatus)) {
    return { 
      success: false, 
      error: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowedTransitions.join(', ')}` 
    };
  }
  
  const updates: Partial<typeof tasks.$inferInsert> = {
    status: newStatus,
    updatedAt: new Date(),
  };
  
  updates.completedAt = newStatus === "done" ? new Date() : null;
  
  const [updated] = await db.update(tasks)
    .set(updates)
    .where(eq(tasks.id, taskId))
    .returning();
  
  await logTaskActivity(
    task.companyId || 0,
    taskId,
    'task_status_changed',
    `Task "${task.title}" status changed: ${currentStatus} → ${newStatus}${reason ? ` (${reason})` : ''}`,
    { oldStatus: currentStatus, newStatus, reason }
  );
  
  if (task.goalId && (newStatus === 'done' || currentStatus === 'done')) {
    await updateGoalProgress(task.goalId);
  }
  
  return { success: true, task: updated };
}

export async function assignTask(
  taskId: number,
  agentId: number
): Promise<typeof tasks.$inferSelect | null> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  
  if (!task) return null;
  
  const [updated] = await db.update(tasks)
    .set({ 
      agentId,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning();
  
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });
  
  await logTaskActivity(
    task.companyId || 0,
    taskId,
    'task_assigned',
    `Task "${task.title}" assigned to ${agent?.name || 'Agent #' + agentId}`,
    { agentId, agentName: agent?.name }
  );
  
  return updated;
}

export async function linkTaskToMeeting(taskId: number, meetingId: number): Promise<void> {
  await db.update(tasks)
    .set({ 
      lastMeetingId: meetingId,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
  
  const meeting = await db.query.meetingPurposes.findFirst({
    where: eq(meetingPurposes.id, meetingId),
  });
  
  if (meeting) {
    const linkedTaskIds = (meeting.linkedTaskIds as number[]) || [];
    if (!linkedTaskIds.includes(taskId)) {
      await db.update(meetingPurposes)
        .set({ 
          linkedTaskIds: [...linkedTaskIds, taskId],
        })
        .where(eq(meetingPurposes.id, meetingId));
    }
  }
}

export async function createRecurringTaskInstance(parentTaskId: number): Promise<typeof tasks.$inferSelect | null> {
  const parentTask = await db.query.tasks.findFirst({
    where: eq(tasks.id, parentTaskId),
  });
  
  if (!parentTask || !parentTask.isRecurring) return null;
  
  const rule = parentTask.recurrenceRule as any;
  if (!rule) return null;
  
  const nextDueDate = calculateNextDueDate(new Date(), rule);
  
  if (rule.endDate && nextDueDate > new Date(rule.endDate)) {
    return null;
  }
  
  const [instance] = await db.insert(tasks)
    .values({
      companyId: parentTask.companyId,
      goalId: parentTask.goalId,
      objectiveId: parentTask.objectiveId ?? parentTask.goalId,
      title: parentTask.title,
      description: parentTask.description,
      agentId: parentTask.agentId,
      priority: parentTask.priority,
      status: 'backlog',
      dueDate: nextDueDate,
      isGroupTask: parentTask.isGroupTask,
      participantAgentIds: parentTask.participantAgentIds,
      isRecurring: false,
      parentTaskId: parentTaskId,
    })
    .returning();
  
  await db.update(tasks)
    .set({ 
      lastInstanceDate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, parentTaskId));
  
  await logTaskActivity(
    parentTask.companyId || 0,
    instance.id,
    'recurring_task_instance',
    `Recurring task instance created: ${instance.title}`,
    { parentTaskId }
  );
  
  return instance;
}

export async function processRecurringTasks(): Promise<number> {
  const recurringTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.isRecurring, true),
      inArray(tasks.status, ['backlog', 'in_progress'])
    ),
  });
  
  let createdCount = 0;
  const now = new Date();
  
  for (const task of recurringTasks) {
    const rule = task.recurrenceRule as any;
    if (!rule) continue;
    
    const lastInstance = task.lastInstanceDate ? new Date(task.lastInstanceDate) : new Date(task.createdAt || now);
    const nextDue = calculateNextDueDate(lastInstance, rule);
    
    if (nextDue <= now) {
      const instance = await createRecurringTaskInstance(task.id);
      if (instance) createdCount++;
    }
  }
  
  return createdCount;
}

function calculateNextDueDate(fromDate: Date, rule: {
  pattern: 'daily' | 'weekly' | 'monthly' | 'custom';
  interval?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
}): Date {
  const next = new Date(fromDate);
  const interval = rule.interval || 1;
  
  switch (rule.pattern) {
    case 'daily':
      next.setDate(next.getDate() + interval);
      break;
    case 'weekly':
      next.setDate(next.getDate() + (7 * interval));
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + interval);
      if (rule.dayOfMonth) {
        next.setDate(rule.dayOfMonth);
      }
      break;
    case 'custom':
      next.setDate(next.getDate() + interval);
      break;
  }
  
  return next;
}

export async function getBlockedTasks(companyId: number): Promise<TaskWithRelations[]> {
  return getTasksByCompany(companyId, { status: 'blocked' });
}

export async function getOverdueTasks(companyId: number): Promise<TaskWithRelations[]> {
  const now = new Date();
  
  const overdue = await db.query.tasks.findMany({
    where: and(
      eq(tasks.companyId, companyId),
      inArray(tasks.status, ['backlog', 'in_progress']),
      lte(tasks.dueDate, now)
    ),
    with: {
      agent: true,
      goal: true,
    },
    orderBy: [asc(tasks.dueDate)],
  });
  
  return overdue.map(task => ({
    ...task,
    participantAgentIds: task.participantAgentIds as number[] | null,
    agent: task.agent ? {
      id: task.agent.id,
      name: task.agent.name,
      role: task.agent.role,
    } : null,
    goal: task.goal ? {
      id: task.goal.id,
      title: task.goal.title,
      status: task.goal.status,
    } : null,
    lastMeeting: null,
  }));
}

async function logTaskActivity(
  companyId: number,
  taskId: number,
  eventType: string,
  title: string,
  metadata?: Record<string, any>
): Promise<void> {
  await db.insert(activityLog).values({
    companyId,
    eventType,
    eventCategory: 'task',
    title,
    metadata: {
      taskId,
      ...metadata,
    },
  });
}

export interface MeetingActionItem {
  title: string;
  description: string;
  assigneeAgentId?: number;
  priority?: TaskPriority;
  dueDate?: Date;
}

export async function createTasksFromMeeting(
  meetingId: number,
  companyId: number,
  actionItems: MeetingActionItem[],
  goalId?: number,
  objectiveId?: number
): Promise<typeof tasks.$inferSelect[]> {
  const createdTasks: typeof tasks.$inferSelect[] = [];
  const linkage = await resolveTaskGoalObjectiveLink(companyId, goalId, objectiveId);
  
  for (const item of actionItems) {
    try {
      const task = await createTask({
        companyId,
        goalId: linkage.goalId,
        objectiveId: linkage.objectiveId,
        title: item.title,
        description: item.description,
        agentId: item.assigneeAgentId,
        priority: item.priority || 'medium',
        dueDate: item.dueDate,
        sourceMeetingId: meetingId,
      });
      
      createdTasks.push(task);
      
      await logTaskActivity(
        companyId,
        task.id,
        'task_from_meeting',
        `Task "${task.title}" created from meeting #${meetingId}`,
        { meetingId, goalId: linkage.goalId, objectiveId: linkage.objectiveId }
      );
    } catch (error) {
      console.error(`Failed to create task from meeting action item:`, error);
    }
  }
  
  return createdTasks;
}

export async function extractActionItemsFromSummary(
  summary: string,
  participants: { id: number; name: string; role?: string }[]
): Promise<MeetingActionItem[]> {
  const actionItems: MeetingActionItem[] = [];
  
  const lines = summary.split(/\n/);
  
  const actionWithAssigneePatterns = [
    /^action:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:to|will|should|must)\s+(.+)/i,
    /^action:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[-:]\s*(.+)/i,
    /^task:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:to|will)\s+(.+)/i,
    /^todo:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[-:]\s*(.+)/i,
  ];
  
  const actionPatterns = [
    /^action:\s*(.+)/i,
    /^todo:\s*(.+)/i,
    /^task:\s*(.+)/i,
    /^next\s*step:\s*(.+)/i,
    /^follow[- ]?up:\s*(.+)/i,
    /(?:will|should|needs? to|must|has to)\s+(.{10,})/i,
    /(?:assigned|delegate[sd]? to)\s+(.{10,})/i,
    /-\s*(?:action|task|todo):\s*(.+)/i,
  ];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 10) continue;
    
    const sentences = trimmed.split(/(?<=[.!?])\s+/);
    
    for (const sentence of sentences) {
      const sentenceTrimmed = sentence.trim();
      if (sentenceTrimmed.length < 10) continue;
      
      let assignee: { id: number; name: string } | undefined;
      let rawTitle: string | undefined;
      let matched = false;
      
      for (const pattern of actionWithAssigneePatterns) {
        const match = sentenceTrimmed.match(pattern);
        if (match && match[1] && match[2]) {
          const assigneeName = match[1].trim();
          rawTitle = match[2].trim();
          
          for (const participant of participants) {
            const nameLower = participant.name.toLowerCase();
            const assigneeLower = assigneeName.toLowerCase();
            if (nameLower === assigneeLower || 
                nameLower.includes(assigneeLower) || 
                assigneeLower.includes(nameLower.split(' ')[0])) {
              assignee = participant;
              break;
            }
          }
          
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        for (const pattern of actionPatterns) {
          const match = sentenceTrimmed.match(pattern);
          if (match && match[1]) {
            rawTitle = match[1].trim();
            
            for (const participant of participants) {
              const nameParts = participant.name.toLowerCase().split(/\s+/);
              const sentenceLower = sentenceTrimmed.toLowerCase();
              
              if (nameParts.some(part => part.length > 2 && sentenceLower.includes(part))) {
                assignee = participant;
                break;
              }
            }
            
            matched = true;
            break;
          }
        }
      }
      
      if (matched && rawTitle) {
        const normalizedTitle = rawTitle
          .replace(/[.!?,;:]+$/, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100);
        
        if (normalizedTitle.length < 5) continue;
        
        const normalizedLower = normalizedTitle.toLowerCase();
        const isDuplicate = actionItems.some(a => {
          const existingNorm = a.title.toLowerCase().replace(/[.!?,;:]+$/, '').trim();
          return existingNorm === normalizedLower || 
                 existingNorm.includes(normalizedLower) || 
                 normalizedLower.includes(existingNorm);
        });
        
        if (!isDuplicate) {
          actionItems.push({
            title: normalizedTitle,
            description: sentenceTrimmed,
            assigneeAgentId: assignee?.id,
            priority: 'medium',
          });
        }
      }
    }
  }
  
  return actionItems;
}

export async function processMeetingCompletion(
  meetingId: number,
  companyId: number,
  summary: string,
  participants: { id: number; name: string; role?: string }[],
  goalId?: number
): Promise<{ tasksCreated: number; tasks: typeof tasks.$inferSelect[] }> {
  const actionItems = await extractActionItemsFromSummary(summary, participants);
  
  if (actionItems.length === 0) {
    return { tasksCreated: 0, tasks: [] };
  }
  
  const createdTasks = await createTasksFromMeeting(
    meetingId,
    companyId,
    actionItems,
    goalId
  );
  
  return {
    tasksCreated: createdTasks.length,
    tasks: createdTasks,
  };
}
