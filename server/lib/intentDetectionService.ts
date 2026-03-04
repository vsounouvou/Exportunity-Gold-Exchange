import { db } from "@db";
import { goals, agents } from "@db/schema";
import { desc, eq } from "drizzle-orm";
import { createGoal, GoalPriority } from "./goalService";
import { createTask, TaskPriority } from "./taskLifecycleService";
import { initiateBackgroundConversation } from "./backgroundConversationEngine";

export interface DetectedIntent {
  type: 'goal_creation' | 'task_creation' | 'meeting_request' | 'status_inquiry' | 'general';
  confidence: number;
  entities: {
    title?: string;
    description?: string;
    priority?: string;
    deadline?: string;
    agentName?: string;
    agentId?: number;
    departmentName?: string;
  };
}

export interface IntentResult {
  detected: boolean;
  intent: DetectedIntent;
  action?: {
    type: string;
    result: any;
    message: string;
  };
}

const GOAL_KEYWORDS = [
  'create a goal', 'new goal', 'set a goal', 'establish goal', 'our goal is',
  'we need to achieve', 'objective is', 'target is', 'aim to', 'want to accomplish'
];

const TASK_KEYWORDS = [
  'create a task', 'new task', 'add task', 'assign', 'need to do',
  'make sure', 'don\'t forget', 'remember to', 'schedule', 'todo'
];

const MEETING_KEYWORDS = [
  'schedule a meeting', 'set up a meeting', 'organize meeting', 'call a meeting',
  'let\'s meet', 'bring together', 'discuss with team', 'align on', 'sync up'
];

const PRIORITY_MAP: Record<string, string> = {
  'urgent': 'critical',
  'high priority': 'high',
  'important': 'high',
  'asap': 'critical',
  'medium': 'medium',
  'low': 'low',
  'whenever': 'low',
  'eventually': 'low',
};

export async function detectIntent(message: string): Promise<DetectedIntent> {
  const lowerMessage = message.toLowerCase();
  
  let type: DetectedIntent['type'] = 'general';
  let confidence = 0;
  
  for (const keyword of GOAL_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      type = 'goal_creation';
      confidence = 0.8;
      break;
    }
  }
  
  if (confidence < 0.5) {
    for (const keyword of TASK_KEYWORDS) {
      if (lowerMessage.includes(keyword)) {
        type = 'task_creation';
        confidence = 0.7;
        break;
      }
    }
  }
  
  if (confidence < 0.5) {
    for (const keyword of MEETING_KEYWORDS) {
      if (lowerMessage.includes(keyword)) {
        type = 'meeting_request';
        confidence = 0.75;
        break;
      }
    }
  }
  
  const entities: DetectedIntent['entities'] = {};
  
  const titleMatch = lowerMessage.match(/(?:goal|task|objective|target|aim)(?:\s+is)?(?:\s+to)?\s*[:\-]?\s*["']?([^"'\n.!?]{5,100})/i);
  if (titleMatch) {
    entities.title = titleMatch[1].trim();
  } else if (type !== 'general') {
    const sentences = message.split(/[.!?]/);
    if (sentences.length > 0) {
      const cleanSentence = sentences[0].replace(/^(create|new|set up|add|schedule)\s+(a\s+)?(goal|task|meeting)/i, '').trim();
      if (cleanSentence.length > 5) {
        entities.title = cleanSentence.slice(0, 100);
      }
    }
  }
  
  const assigneePatterns = [
    /(?:assign(?:ed)?\s+to|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:should|will|needs? to)/i,
    /(?:ask|have|get)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+to/i,
  ];
  
  for (const pattern of assigneePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      entities.agentName = match[1].trim();
      break;
    }
  }
  
  for (const [keyword, priority] of Object.entries(PRIORITY_MAP)) {
    if (lowerMessage.includes(keyword)) {
      entities.priority = priority;
      break;
    }
  }
  
  const deadlinePatterns = [
    /by\s+(tomorrow|next\s+week|end\s+of\s+\w+|monday|tuesday|wednesday|thursday|friday|\d{1,2}[\/\-]\d{1,2})/i,
    /due\s+(tomorrow|next\s+week|\d{1,2}[\/\-]\d{1,2})/i,
    /within\s+(\d+)\s+(days?|weeks?|months?)/i,
  ];
  
  for (const pattern of deadlinePatterns) {
    const match = lowerMessage.match(pattern);
    if (match) {
      entities.deadline = match[1];
      break;
    }
  }
  
  return {
    type,
    confidence,
    entities,
  };
}

export async function processIntent(
  intent: DetectedIntent,
  companyId: number,
  userId: number
): Promise<IntentResult> {
  if (intent.confidence < 0.5) {
    return {
      detected: false,
      intent,
    };
  }
  
  switch (intent.type) {
    case 'goal_creation':
      return await processGoalCreation(intent, companyId);
    case 'task_creation':
      return await processTaskCreation(intent, companyId);
    case 'meeting_request':
      return await processMeetingRequest(intent, companyId);
    default:
      return {
        detected: false,
        intent,
      };
  }
}

async function findAgentByName(companyId: number, agentName: string): Promise<{ id: number; name: string } | null> {
  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });
  
  const lowerName = agentName.toLowerCase();
  const nameParts = lowerName.split(/\s+/);
  
  for (const agent of companyAgents) {
    const agentNameLower = agent.name.toLowerCase();
    if (agentNameLower === lowerName) {
      return { id: agent.id, name: agent.name };
    }
    if (nameParts.some(part => part.length > 2 && agentNameLower.includes(part))) {
      return { id: agent.id, name: agent.name };
    }
  }
  
  return null;
}

async function processGoalCreation(
  intent: DetectedIntent,
  companyId: number
): Promise<IntentResult> {
  if (!intent.entities.title) {
    return {
      detected: true,
      intent,
      action: {
        type: 'goal_creation_pending',
        result: null,
        message: "I understand you want to create a goal. Could you provide more details about what the goal should be?",
      },
    };
  }
  
  let deadline: Date | undefined;
  if (intent.entities.deadline) {
    deadline = parseDeadline(intent.entities.deadline);
  }
  
  let ownerAgentId: number | undefined;
  let assignedAgentName: string | undefined;
  let agentNotFoundMessage = '';
  
  if (intent.entities.agentName) {
    const agent = await findAgentByName(companyId, intent.entities.agentName);
    if (agent) {
      ownerAgentId = agent.id;
      assignedAgentName = agent.name;
    } else {
      agentNotFoundMessage = `I couldn't find anyone named "${intent.entities.agentName}" in your team. `;
    }
  }
  
  try {
    const goal = await createGoal({
      companyId,
      title: intent.entities.title,
      description: intent.entities.description || `Goal created from voice command: ${intent.entities.title}`,
      priority: (intent.entities.priority || 'medium') as GoalPriority,
      deadline,
      ownerAgentId,
    });
    
    let assignmentMsg = assignedAgentName 
      ? `I've assigned it to ${assignedAgentName}.` 
      : (agentNotFoundMessage || 'Would you like me to assign it to someone?');
    
    return {
      detected: true,
      intent,
      action: {
        type: 'goal_created',
        result: goal,
        message: `I've created a new goal: "${goal.title}". ${deadline ? `It's due ${intent.entities.deadline}. ` : ''}${assignmentMsg}`,
      },
    };
  } catch (error) {
    console.error("Failed to create goal from intent:", error);
    return {
      detected: true,
      intent,
      action: {
        type: 'goal_creation_failed',
        result: null,
        message: "I encountered an issue while creating the goal. Please try again or create it manually from the Goals page.",
      },
    };
  }
}

async function processTaskCreation(
  intent: DetectedIntent,
  companyId: number
): Promise<IntentResult> {
  if (!intent.entities.title) {
    return {
      detected: true,
      intent,
      action: {
        type: 'task_creation_pending',
        result: null,
        message: "I understand you want to create a task. What should the task be?",
      },
    };
  }
  
  let dueDate: Date | undefined;
  if (intent.entities.deadline) {
    dueDate = parseDeadline(intent.entities.deadline);
  }
  
  let assigneeId: number | undefined;
  let assigneeName: string | undefined;
  let agentNotFoundMessage = '';
  
  if (intent.entities.agentName) {
    const agent = await findAgentByName(companyId, intent.entities.agentName);
    if (agent) {
      assigneeId = agent.id;
      assigneeName = agent.name;
    } else {
      agentNotFoundMessage = `I couldn't find anyone named "${intent.entities.agentName}" in your team. `;
    }
  }
  
  try {
    const linkage = await resolveGoalObjectiveForTask(companyId, intent.entities.title);
    const task = await createTask({
      companyId,
      goalId: linkage.goalId,
      objectiveId: linkage.objectiveId,
      title: intent.entities.title,
      description: intent.entities.description || `Task created from voice command: ${intent.entities.title}`,
      priority: (intent.entities.priority || 'medium') as TaskPriority,
      dueDate,
      agentId: assigneeId,
    });
    
    let assignmentMsg = assigneeName 
      ? `Assigned to ${assigneeName}.` 
      : (agentNotFoundMessage || 'Ready to be assigned.');
    
    return {
      detected: true,
      intent,
      action: {
        type: 'task_created',
        result: task,
        message: `Task created: "${task.title}". ${dueDate ? `Due ${intent.entities.deadline}. ` : ''}${assignmentMsg}`,
      },
    };
  } catch (error) {
    console.error("Failed to create task from intent:", error);
    return {
      detected: true,
      intent,
      action: {
        type: 'task_creation_failed',
        result: null,
        message: "I couldn't create the task. Please try again or add it manually from the Tasks page.",
      },
    };
  }
}

async function resolveGoalObjectiveForTask(companyId: number, title: string) {
  const existing = await db.query.goals.findFirst({
    where: eq(goals.companyId, companyId),
    columns: { id: true },
    orderBy: [desc(goals.updatedAt), desc(goals.id)],
  });
  if (existing?.id) {
    return { goalId: existing.id, objectiveId: existing.id };
  }

  const fallbackGoal = await createGoal({
    companyId,
    title: "Operational Backlog",
    description: `Auto-generated goal to host incoming tasks (latest: ${title})`,
    priority: "medium",
  });
  return { goalId: fallbackGoal.id, objectiveId: fallbackGoal.id };
}

async function processMeetingRequest(
  intent: DetectedIntent,
  companyId: number
): Promise<IntentResult> {
  if (!companyId) {
    return {
      detected: true,
      intent,
      action: {
        type: 'meeting_no_company',
        result: null,
        message: "Please select a company first before scheduling a meeting.",
      },
    };
  }
  
  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });
  
  if (companyAgents.length < 2) {
    return {
      detected: true,
      intent,
      action: {
        type: 'meeting_insufficient_agents',
        result: null,
        message: `Your company only has ${companyAgents.length} agent(s). You need at least 2 team members to hold a meeting.`,
      },
    };
  }
  
  try {
    let selectedAgents: { id: number; name: string }[] = [];
    let agentNotFoundMessage = '';
    let hasExplicitSelection = false;
    
    if (intent.entities.agentName) {
      hasExplicitSelection = true;
      const requestedAgent = await findAgentByName(companyId, intent.entities.agentName);
      if (requestedAgent) {
        selectedAgents.push(requestedAgent);
      } else {
        agentNotFoundMessage = `I couldn't find "${intent.entities.agentName}" in your team. `;
        hasExplicitSelection = false;
      }
    }
    
    if (!hasExplicitSelection || selectedAgents.length === 0) {
      selectedAgents = companyAgents.slice(0, 3).map(a => ({ id: a.id, name: a.name }));
    } else if (selectedAgents.length < 2) {
      const remaining = companyAgents
        .filter(a => !selectedAgents.find(s => s.id === a.id))
        .slice(0, 2 - selectedAgents.length)
        .map(a => ({ id: a.id, name: a.name }));
      selectedAgents = [...selectedAgents, ...remaining];
    }
    
    const agentIds = selectedAgents.map(a => a.id);
    const agentNames = selectedAgents.map(a => a.name);
    const topic = intent.entities.title || "Team alignment discussion";
    
    await initiateBackgroundConversation({
      type: 'scheduled',
      agentIds,
      topic,
      priority: intent.entities.priority === 'critical' ? 'urgent' : 'medium',
    });
    
    return {
      detected: true,
      intent,
      action: {
        type: 'meeting_scheduled',
        result: { agentIds, topic, agentNames },
        message: `${agentNotFoundMessage}I've initiated a meeting on "${topic}" with ${agentNames.join(', ')}. They'll start discussing shortly and I'll summarize the outcomes.`,
      },
    };
  } catch (error) {
    console.error("Failed to schedule meeting from intent:", error);
    return {
      detected: true,
      intent,
      action: {
        type: 'meeting_failed',
        result: null,
        message: "I couldn't set up the meeting. Please try again later.",
      },
    };
  }
}

function parseDeadline(deadline: string): Date {
  const now = new Date();
  const lower = deadline.toLowerCase();
  
  if (lower === 'tomorrow') {
    now.setDate(now.getDate() + 1);
    return now;
  }
  
  if (lower.includes('next week')) {
    now.setDate(now.getDate() + 7);
    return now;
  }
  
  const dayMatch = lower.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (dayMatch) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = days.indexOf(dayMatch[1].toLowerCase());
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    now.setDate(now.getDate() + daysUntil);
    return now;
  }
  
  const relativeMatch = lower.match(/(\d+)\s*(days?|weeks?|months?)/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    if (unit.startsWith('day')) {
      now.setDate(now.getDate() + amount);
    } else if (unit.startsWith('week')) {
      now.setDate(now.getDate() + amount * 7);
    } else if (unit.startsWith('month')) {
      now.setMonth(now.getMonth() + amount);
    }
    return now;
  }
  
  const dateMatch = lower.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]) - 1;
    const day = parseInt(dateMatch[2]);
    now.setMonth(month, day);
    if (now < new Date()) {
      now.setFullYear(now.getFullYear() + 1);
    }
    return now;
  }
  
  now.setDate(now.getDate() + 7);
  return now;
}
