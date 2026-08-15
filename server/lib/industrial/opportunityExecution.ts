import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

type RecordLike = Record<string, unknown>;

export type IndustrialOpportunityExecutionTask = {
  id: number;
  parentTaskId: number | null;
  agentId: number | null;
  agentName: string | null;
  agentRole: string | null;
  agentAvatarUrl: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  executionType: string | null;
  approvalStatus: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  completedAt: Date | null;
  key: string;
  allowedNextStatuses: string[];
};

export type IndustrialOpportunityExecution = {
  requirementId: string;
  parentTask: IndustrialOpportunityExecutionTask | null;
  workstreams: IndustrialOpportunityExecutionTask[];
  team: Array<{
    key: string;
    agentId: number | null;
    agentName: string;
    role: string;
    avatarUrl: string | null;
    taskId: number | null;
    taskStatus: string;
  }>;
  missingSpecialistKeys: string[];
  status:
    | "staffing_required"
    | "assigned"
    | "working"
    | "blocked"
    | "review_ready"
    | "completed";
  progress: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    backlog: number;
    percent: number;
  };
  timeline: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    agentName: string | null;
    taskId: number | null;
    createdAt: Date | null;
    output: string | null;
  }>;
};

const TASK_STATUS_TRANSITIONS: Record<string, string[]> = {
  backlog: ["in_progress", "canceled"],
  in_progress: ["done", "blocked", "backlog", "canceled"],
  blocked: ["in_progress", "backlog", "canceled"],
  done: ["in_progress"],
  canceled: ["backlog"],
};

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : {};
}

function positiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : [];
}

const SPECIALIST_ROLE_PATTERNS: Array<{
  key: string;
  patterns: RegExp[];
}> = [
  {
    key: "commercial",
    patterns: [
      /account executive/,
      /commercial director/,
      /business development/,
      /customer success/,
      /deal closer/,
    ],
  },
  {
    key: "sourcing",
    patterns: [
      /supplier discovery/,
      /sourcing/,
      /procurement/,
      /buyer intelligence/,
      /commodity desk/,
    ],
  },
  {
    key: "technical",
    patterns: [
      /specification agent/,
      /technical/,
      /engineering/,
      /machinery and industrial equipment/,
    ],
  },
  {
    key: "logistics",
    patterns: [/freight routing/, /logistics/, /delivery/, /trade operations/],
  },
  {
    key: "finance",
    patterns: [/commercial finance/, /finance/, /treasury/, /accountant/],
  },
  {
    key: "quality",
    patterns: [/quality documentation/, /quality assurance/, /quality control/],
  },
  {
    key: "compliance",
    patterns: [/trade compliance/, /compliance/, /legal/, /risk/],
  },
];

export function industrialSpecialistKeyForRole(...values: unknown[]) {
  const haystack = values.map((value) => text(value).toLowerCase()).join(" ");
  if (!haystack) return null;
  return (
    SPECIALIST_ROLE_PATTERNS.find((candidate) =>
      candidate.patterns.some((pattern) => pattern.test(haystack)),
    )?.key || null
  );
}

export function allowedIndustrialTaskStatuses(status: unknown) {
  return TASK_STATUS_TRANSITIONS[text(status)] || [];
}

function taskKey(
  task: Omit<IndustrialOpportunityExecutionTask, "key" | "allowedNextStatuses">,
  snapshotByTaskId: Map<number, RecordLike>,
) {
  const snapshot = snapshotByTaskId.get(task.id);
  const snapshotKey = text(snapshot?.key);
  if (snapshotKey) return snapshotKey;
  if (task.executionType === "workforce_activation") {
    return (
      industrialSpecialistKeyForRole(task.agentRole, task.title) || "staffing"
    );
  }
  if (task.executionType === "ind_commercial_review") {
    return "commercial_review";
  }
  if (task.executionType === "industrial_intake") return "commercial";
  return (
    industrialSpecialistKeyForRole(task.agentRole, task.title) ||
    text(task.executionType) ||
    "specialist"
  );
}

export function buildIndustrialOpportunityExecution(input: {
  requirementId: string;
  parentTaskId: number;
  taskRows: Array<
    Omit<IndustrialOpportunityExecutionTask, "key" | "allowedNextStatuses">
  >;
  activityRows?: Array<{
    id: number;
    eventType: string;
    title: string;
    description: string | null;
    agentId: number | null;
    agentName: string | null;
    metadata: unknown;
    createdAt: Date | null;
  }>;
  fallbackParticipants?: unknown;
  snapshotWorkstreams?: unknown;
  missingSpecialistKeys?: unknown;
}): IndustrialOpportunityExecution {
  const snapshotWorkstreams = Array.isArray(input.snapshotWorkstreams)
    ? input.snapshotWorkstreams.map(record)
    : [];
  const snapshotByTaskId = new Map(
    snapshotWorkstreams
      .map((item) => [positiveInt(item.taskId), item] as const)
      .filter((entry): entry is [number, RecordLike] => Boolean(entry[0])),
  );
  const taskRows = input.taskRows.map((task) => ({
    ...task,
    key: taskKey(task, snapshotByTaskId),
    allowedNextStatuses: allowedIndustrialTaskStatuses(task.status),
  }));
  const parentTask =
    taskRows.find((task) => task.id === input.parentTaskId) || null;
  const workstreams = taskRows
    .filter((task) => task.parentTaskId === input.parentTaskId)
    .sort((left, right) => {
      const leftDone = left.status === "done" ? 1 : 0;
      const rightDone = right.status === "done" ? 1 : 0;
      if (leftDone !== rightDone) return leftDone - rightDone;
      return left.id - right.id;
    });
  const progressSource = workstreams.length
    ? workstreams
    : parentTask
      ? [parentTask]
      : [];
  const completed = progressSource.filter((task) => task.status === "done").length;
  const inProgress = progressSource.filter(
    (task) => task.status === "in_progress",
  ).length;
  const blocked = progressSource.filter((task) => task.status === "blocked").length;
  const backlog = progressSource.filter((task) => task.status === "backlog").length;
  const total = progressSource.length;
  const staffedSpecialistKeys = new Set(
    workstreams
      .filter((task) => Boolean(task.agentId))
      .map((task) => task.key),
  );
  const missingSpecialistKeys = stringArray(input.missingSpecialistKeys).filter(
    (key) => !staffedSpecialistKeys.has(key),
  );
  const status: IndustrialOpportunityExecution["status"] = blocked
    ? "blocked"
    : inProgress
      ? "working"
      : total > 0 && completed === total
        ? parentTask?.status === "done"
          ? "completed"
          : "review_ready"
        : missingSpecialistKeys.length
          ? "staffing_required"
          : "assigned";

  const fallbackParticipants = Array.isArray(input.fallbackParticipants)
    ? input.fallbackParticipants.map(record)
    : [];
  const teamByAgentId = new Map<number, IndustrialOpportunityExecution["team"][number]>();
  const teamWithoutAgent: IndustrialOpportunityExecution["team"] = [];

  for (const participant of fallbackParticipants) {
    const agentId = positiveInt(participant.agentId);
    const item = {
      key: text(participant.key) || "specialist",
      agentId,
      agentName: text(participant.agentName) || text(participant.role) || "Open role",
      role: text(participant.role) || "Specialist",
      avatarUrl: null,
      taskId: null,
      taskStatus: "assigned",
    };
    if (agentId) teamByAgentId.set(agentId, item);
    else teamWithoutAgent.push(item);
  }

  for (const task of [parentTask, ...workstreams].filter(
    (item): item is IndustrialOpportunityExecutionTask => Boolean(item),
  )) {
    if (!task.agentId) continue;
    const existing = teamByAgentId.get(task.agentId);
    teamByAgentId.set(task.agentId, {
      key: existing?.key || task.key,
      agentId: task.agentId,
      agentName: task.agentName || existing?.agentName || `Agent #${task.agentId}`,
      role: task.agentRole || existing?.role || "Specialist",
      avatarUrl: task.agentAvatarUrl || existing?.avatarUrl || null,
      taskId: task.id,
      taskStatus: task.status,
    });
  }

  const activityTimeline = (input.activityRows || []).map((event) => ({
    id: `activity-${event.id}`,
    type: event.eventType,
    title: event.title,
    description: event.description,
    agentName: event.agentName,
    taskId: positiveInt(record(event.metadata).taskId),
    createdAt: event.createdAt,
    output: text(record(event.metadata).output) || null,
  }));
  const activityTaskIds = new Set(
    activityTimeline.map((event) => event.taskId).filter(Boolean),
  );
  const taskTimeline = taskRows
    .filter((task) => !activityTaskIds.has(task.id))
    .map((task) => ({
      id: `task-${task.id}`,
      type: "task_assigned",
      title: `${task.agentName || "Agent"} assigned: ${task.title}`,
      description: "A real Operations Center task was created for this opportunity.",
      agentName: task.agentName,
      taskId: task.id,
      createdAt: task.createdAt,
      output: null,
    }));
  const timeline = [...activityTimeline, ...taskTimeline]
    .sort(
      (left, right) =>
        new Date(right.createdAt || 0).getTime() -
        new Date(left.createdAt || 0).getTime(),
    )
    .slice(0, 40);

  return {
    requirementId: input.requirementId,
    parentTask,
    workstreams,
    team: [...teamByAgentId.values(), ...teamWithoutAgent],
    missingSpecialistKeys,
    status,
    progress: {
      total,
      completed,
      inProgress,
      blocked,
      backlog,
      percent: total ? Math.round((completed / total) * 100) : 0,
    },
    timeline,
  };
}

export async function loadIndustrialOpportunityExecutions(input: {
  tenantId: number;
  requirements: Array<{ id: string; metadata: unknown }>;
  includeTimeline?: boolean;
}) {
  const [{ db }, { activityLog, agents, companies, tasks }] =
    await Promise.all([import("@db"), import("@db/schema")]);
  const requirementByParentTaskId = new Map<
    number,
    {
      id: string;
      handoff: RecordLike;
    }
  >();
  for (const requirement of input.requirements) {
    const handoff = record(record(requirement.metadata).operationsHandoff);
    const parentTaskId = positiveInt(handoff.taskId);
    if (parentTaskId) {
      requirementByParentTaskId.set(parentTaskId, {
        id: requirement.id,
        handoff,
      });
    }
  }
  const parentTaskIds = [...requirementByParentTaskId.keys()];
  if (!parentTaskIds.length) return new Map<string, IndustrialOpportunityExecution>();

  const taskRows = await db
    .select({
      id: tasks.id,
      parentTaskId: tasks.parentTaskId,
      companyId: tasks.companyId,
      agentId: tasks.agentId,
      agentName: agents.displayName,
      fallbackAgentName: agents.name,
      agentRole: agents.role,
      agentAvatar: agents.avatar,
      agentAvatarUrl: agents.avatarUrl,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      executionType: tasks.executionType,
      approvalStatus: tasks.approvalStatus,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .innerJoin(
      companies,
      and(
        eq(tasks.companyId, companies.id),
        eq(companies.tenantId, input.tenantId),
      ),
    )
    .leftJoin(
      agents,
      and(eq(tasks.agentId, agents.id), eq(agents.tenantId, input.tenantId)),
    )
    .where(
      or(
        inArray(tasks.id, parentTaskIds),
        inArray(tasks.parentTaskId, parentTaskIds),
      ),
    )
    .orderBy(tasks.id);

  const taskIds = taskRows.map((task) => Number(task.id));
  const companyIds = Array.from(
    new Set(
      taskRows
        .map((task) => positiveInt(task.companyId))
        .filter((id): id is number => Boolean(id)),
    ),
  );
  const activityRows =
    input.includeTimeline && companyIds.length && taskIds.length
      ? await db
          .select({
            id: activityLog.id,
            eventType: activityLog.eventType,
            title: activityLog.title,
            description: activityLog.description,
            agentId: activityLog.agentId,
            agentName: agents.displayName,
            fallbackAgentName: agents.name,
            metadata: activityLog.metadata,
            createdAt: activityLog.createdAt,
          })
          .from(activityLog)
          .leftJoin(
            agents,
            and(
              eq(activityLog.agentId, agents.id),
              eq(agents.tenantId, input.tenantId),
            ),
          )
          .where(
            and(
              inArray(activityLog.companyId, companyIds),
              or(
                inArray(
                  sql<string>`${activityLog.metadata}->>'requirementId'`,
                  input.requirements.map((requirement) => requirement.id),
                ),
                inArray(
                  sql<string>`${activityLog.metadata}->>'taskId'`,
                  taskIds.map(String),
                ),
              ),
            ),
          )
          .orderBy(desc(activityLog.createdAt))
          .limit(300)
      : [];

  const result = new Map<string, IndustrialOpportunityExecution>();
  for (const [parentTaskId, requirement] of requirementByParentTaskId) {
    const relatedTasks = taskRows
      .filter(
        (task) =>
          Number(task.id) === parentTaskId ||
          Number(task.parentTaskId) === parentTaskId,
      )
      .map((task) => ({
        id: Number(task.id),
        parentTaskId: positiveInt(task.parentTaskId),
        agentId: positiveInt(task.agentId),
        agentName: text(task.agentName) || text(task.fallbackAgentName) || null,
        agentRole: text(task.agentRole) || null,
        agentAvatarUrl:
          text(task.agentAvatarUrl) || text(task.agentAvatar) || null,
        title: text(task.title),
        description: text(task.description),
        status: text(task.status) || "backlog",
        priority: text(task.priority) || "medium",
        executionType: text(task.executionType) || null,
        approvalStatus: text(task.approvalStatus) || null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        completedAt: task.completedAt,
      }));
    const relatedTaskIds = new Set(relatedTasks.map((task) => task.id));
    const relatedActivity = activityRows
      .filter((event) => {
        const metadata = record(event.metadata);
        return (
          text(metadata.requirementId) === requirement.id ||
          relatedTaskIds.has(positiveInt(metadata.taskId) || 0)
        );
      })
      .map((event) => ({
        id: Number(event.id),
        eventType: text(event.eventType),
        title: text(event.title),
        description: text(event.description) || null,
        agentId: positiveInt(event.agentId),
        agentName:
          text(event.agentName) || text(event.fallbackAgentName) || null,
        metadata: event.metadata,
        createdAt: event.createdAt,
      }));
    result.set(
      requirement.id,
      buildIndustrialOpportunityExecution({
        requirementId: requirement.id,
        parentTaskId,
        taskRows: relatedTasks,
        activityRows: relatedActivity,
        fallbackParticipants: requirement.handoff.participants,
        snapshotWorkstreams: requirement.handoff.workstreams,
        missingSpecialistKeys: requirement.handoff.missingSpecialistKeys,
      }),
    );
  }
  return result;
}

export function nextActionForIndustrialExecution(
  execution: IndustrialOpportunityExecution,
) {
  const blocked = execution.workstreams.find((task) => task.status === "blocked");
  if (blocked) return `Resolve blocked workstream: ${blocked.title}`;
  const active = execution.workstreams.find(
    (task) => task.status === "in_progress",
  );
  if (active) {
    return `${active.agentName || "Assigned specialist"} is working on ${active.title}.`;
  }
  if (
    execution.workstreams.length &&
    execution.workstreams.every((task) => task.status === "done")
  ) {
    const commercialReview = execution.workstreams.find(
      (task) => task.key === "commercial_review",
    );
    if (commercialReview) {
      return `${commercialReview.agentName || "Commercial Director"}'s commercial deal brief is ready for approval before any external action.`;
    }
    return "Review the completed specialist findings and prepare the next controlled commercial action.";
  }
  const next = execution.workstreams.find((task) => task.status === "backlog");
  if (next) return `Start assigned workstream: ${next.title}`;
  if (execution.missingSpecialistKeys.length) {
    return `Review staffing needs: ${execution.missingSpecialistKeys.join(", ")}.`;
  }
  return "Review the opportunity and assign its next controlled action.";
}
