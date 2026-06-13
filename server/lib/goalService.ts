import { db } from "@db";
import { goals, tasks, meetingPurposes, agents, activityLog } from "@db/schema";
import { eq, and, desc, asc, count, sql, inArray } from "drizzle-orm";

export type GoalStatus = 'planned' | 'in_progress' | 'blocked' | 'completed' | 'canceled';
export type GoalPriority = 'low' | 'medium' | 'high' | 'critical';

export interface CreateGoalInput {
  companyId: number;
  title: string;
  description?: string;
  ownerAgentId?: number;
  deadline?: Date;
  priority?: GoalPriority;
  parentGoalId?: number;
  metadata?: {
    keyResults?: string[];
    successCriteria?: string[];
    notes?: string;
  };
}

export interface GoalWithStats {
  id: number;
  companyId: number;
  ownerAgentId: number | null;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  deadline: Date | null;
  startDate: Date | null;
  completedAt: Date | null;
  progress: number | null;
  parentGoalId: number | null;
  metadata: any;
  createdAt: Date | null;
  updatedAt: Date | null;
  ownerAgent?: {
    id: number;
    name: string;
    role: string | null;
  } | null;
  taskStats: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    backlog: number;
  };
  nextSteps: string[];
}

export async function createGoal(input: CreateGoalInput): Promise<typeof goals.$inferSelect> {
  const [goal] = await db.insert(goals)
    .values({
      companyId: input.companyId,
      title: input.title,
      description: input.description || null,
      ownerAgentId: input.ownerAgentId || null,
      deadline: input.deadline || null,
      priority: input.priority || 'medium',
      parentGoalId: input.parentGoalId || null,
      status: 'planned',
      progress: 0,
      metadata: input.metadata || {},
    })
    .returning();
  
  await logGoalActivity(goal.companyId, goal.id, 'goal_created', `Goal created: ${goal.title}`);
  
  return goal;
}

export async function getGoalById(goalId: number): Promise<GoalWithStats | null> {
  const goal = await db.query.goals.findFirst({
    where: eq(goals.id, goalId),
    with: {
      ownerAgent: true,
    },
  });
  
  if (!goal) return null;
  
  const goalTasks = await getTasksForGoal(goalId);
  const taskStats = calculateTaskStats(goalTasks);
  const nextSteps = await getGoalNextSteps(goalId);
  
  return {
    ...goal,
    ownerAgent: goal.ownerAgent ? {
      id: goal.ownerAgent.id,
      name: goal.ownerAgent.name,
      role: goal.ownerAgent.role,
    } : null,
    taskStats,
    nextSteps,
  };
}

export async function getGoalsByCompany(companyId: number, filters?: {
  status?: GoalStatus;
  priority?: GoalPriority;
  ownerAgentId?: number;
}): Promise<GoalWithStats[]> {
  let conditions = [eq(goals.companyId, companyId)];
  
  if (filters?.status) {
    conditions.push(eq(goals.status, filters.status));
  }
  if (filters?.priority) {
    conditions.push(eq(goals.priority, filters.priority));
  }
  if (filters?.ownerAgentId) {
    conditions.push(eq(goals.ownerAgentId, filters.ownerAgentId));
  }
  
  const goalsList = await db.query.goals.findMany({
    where: and(...conditions),
    with: {
      ownerAgent: true,
    },
    orderBy: [desc(goals.createdAt)],
  });

  const tasksByGoalId = await getTasksByGoalIds(goalsList.map((goal) => goal.id));
  
  return Promise.all(goalsList.map(async (goal) => {
    const goalTasks = tasksByGoalId.get(goal.id) || [];
    const taskStats = calculateTaskStats(goalTasks);
    const nextSteps = await getGoalNextSteps(goal.id);
    
    return {
      ...goal,
      ownerAgent: goal.ownerAgent ? {
        id: goal.ownerAgent.id,
        name: goal.ownerAgent.name,
        role: goal.ownerAgent.role,
      } : null,
      taskStats,
      nextSteps,
    };
  }));
}

export async function updateGoalStatus(
  goalId: number,
  newStatus: GoalStatus,
  reason?: string
): Promise<typeof goals.$inferSelect | null> {
  const goal = await db.query.goals.findFirst({
    where: eq(goals.id, goalId),
  });
  
  if (!goal) return null;
  
  const oldStatus = goal.status;
  const updates: Partial<typeof goals.$inferInsert> = {
    status: newStatus,
    updatedAt: new Date(),
  };
  
  if (newStatus === 'in_progress' && !goal.startDate) {
    updates.startDate = new Date();
  }
  
  if (newStatus === 'completed') {
    updates.completedAt = new Date();
    updates.progress = 100;
  }
  
  const [updated] = await db.update(goals)
    .set(updates)
    .where(eq(goals.id, goalId))
    .returning();
  
  await logGoalActivity(
    goal.companyId,
    goalId,
    'goal_status_changed',
    `Goal status changed from ${oldStatus} to ${newStatus}${reason ? `: ${reason}` : ''}`,
    { oldStatus, newStatus, reason }
  );
  
  return updated;
}

export async function updateGoalProgress(goalId: number): Promise<number> {
  const goalTasks = await db.query.tasks.findMany({
    where: eq(tasks.goalId, goalId),
  });
  
  if (goalTasks.length === 0) {
    return 0;
  }
  
  const completedTasks = goalTasks.filter(t => t.status === 'done').length;
  const progress = Math.round((completedTasks / goalTasks.length) * 100);
  
  await db.update(goals)
    .set({ 
      progress,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, goalId));
  
  if (progress === 100) {
    const goal = await db.query.goals.findFirst({
      where: eq(goals.id, goalId),
    });
    
    if (goal && goal.status !== 'completed') {
      await updateGoalStatus(goalId, 'completed', 'All tasks completed');
    }
  }
  
  return progress;
}

export async function checkGoalsWithoutTasks(companyId: number): Promise<typeof goals.$inferSelect[]> {
  const allGoals = await db.query.goals.findMany({
    where: and(
      eq(goals.companyId, companyId),
      inArray(goals.status, ['planned', 'in_progress'])
    ),
  });
  
  const tasksByGoalId = await getTasksByGoalIds(allGoals.map((goal) => goal.id));
  return allGoals.filter(g => {
    const activeTasks = (tasksByGoalId.get(g.id) || []).filter(t => 
      t.status !== 'done' && t.status !== 'canceled'
    );
    return activeTasks.length === 0;
  });
}

export async function checkBlockedGoals(companyId: number): Promise<typeof goals.$inferSelect[]> {
  const allGoals = await db.query.goals.findMany({
    where: and(
      eq(goals.companyId, companyId),
      eq(goals.status, 'in_progress')
    ),
  });
  
  const tasksByGoalId = await getTasksByGoalIds(allGoals.map((goal) => goal.id));
  return allGoals.filter(g => {
    const goalTasks = tasksByGoalId.get(g.id) || [];
    const blockedTasks = goalTasks.filter(t => t.status === 'blocked');
    const activeTasks = goalTasks.filter(t => 
      t.status !== 'done' && t.status !== 'canceled'
    );
    return blockedTasks.length > 0 && blockedTasks.length === activeTasks.length;
  });
}

export async function getGoalMeetings(goalId: number): Promise<typeof meetingPurposes.$inferSelect[]> {
  return db.query.meetingPurposes.findMany({
    where: eq(meetingPurposes.goalId, goalId),
    orderBy: [desc(meetingPurposes.createdAt)],
  });
}

export async function getGoalAgents(goalId: number): Promise<{
  agentId: number;
  name: string;
  role: string | null;
  taskCount: number;
}[]> {
  const goalTasks = await db.query.tasks.findMany({
    where: eq(tasks.goalId, goalId),
    with: {
      agent: true,
    },
  });
  
  const agentMap = new Map<number, {
    agentId: number;
    name: string;
    role: string | null;
    taskCount: number;
  }>();
  
  for (const task of goalTasks) {
    if (task.agentId && task.agent) {
      const existing = agentMap.get(task.agentId);
      if (existing) {
        existing.taskCount++;
      } else {
        agentMap.set(task.agentId, {
          agentId: task.agentId,
          name: task.agent.name,
          role: task.agent.role,
          taskCount: 1,
        });
      }
    }
    
    const participants = (task.participantAgentIds as number[]) || [];
    for (const participantId of participants) {
      if (!agentMap.has(participantId)) {
        const agent = await db.query.agents.findFirst({
          where: eq(agents.id, participantId),
        });
        if (agent) {
          agentMap.set(participantId, {
            agentId: participantId,
            name: agent.name,
            role: agent.role,
            taskCount: 0,
          });
        }
      }
    }
  }
  
  return Array.from(agentMap.values()).sort((a, b) => b.taskCount - a.taskCount);
}

async function getTasksForGoal(goalId: number): Promise<Array<typeof tasks.$inferSelect>> {
  return db.query.tasks.findMany({
    where: eq(tasks.goalId, goalId),
  });
}

async function getTasksByGoalIds(goalIds: number[]): Promise<Map<number, Array<typeof tasks.$inferSelect>>> {
  const uniqueGoalIds = Array.from(new Set(goalIds.filter((id) => Number.isFinite(id) && id > 0)));
  const byGoalId = new Map<number, Array<typeof tasks.$inferSelect>>();
  if (!uniqueGoalIds.length) return byGoalId;

  const goalTasks = await db.query.tasks.findMany({
    where: inArray(tasks.goalId, uniqueGoalIds),
  });

  for (const task of goalTasks) {
    const goalId = Number(task.goalId || 0);
    if (!goalId) continue;
    const list = byGoalId.get(goalId) || [];
    list.push(task);
    byGoalId.set(goalId, list);
  }

  return byGoalId;
}

async function getGoalNextSteps(goalId: number): Promise<string[]> {
  const goalTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.goalId, goalId),
      inArray(tasks.status, ['backlog', 'in_progress'])
    ),
    orderBy: [asc(tasks.dueDate), desc(tasks.priority)],
    limit: 5,
  });
  
  return goalTasks.map(t => t.title);
}

function calculateTaskStats(taskList: any[]): {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  backlog: number;
} {
  return {
    total: taskList.length,
    completed: taskList.filter(t => t.status === 'done').length,
    inProgress: taskList.filter(t => t.status === 'in_progress').length,
    blocked: taskList.filter(t => t.status === 'blocked').length,
    backlog: taskList.filter(t => t.status === 'backlog').length,
  };
}

async function logGoalActivity(
  companyId: number,
  goalId: number,
  eventType: string,
  title: string,
  metadata?: Record<string, any>
): Promise<void> {
  await db.insert(activityLog).values({
    companyId,
    eventType,
    eventCategory: 'goal',
    title,
    metadata: {
      goalId,
      ...metadata,
    },
  });
}
