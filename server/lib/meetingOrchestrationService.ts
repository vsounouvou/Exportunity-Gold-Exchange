import { db } from "@db";
import { meetingPurposes, activityLog, meetings, agents } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { logAgentActivity } from "./agentProfileService";
import Anthropic from "@anthropic-ai/sdk";

let anthropic: Anthropic | null = null;
const anthropicApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const anthropicBaseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const anthropicModel =
  process.env.AI_INTEGRATIONS_ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_MODEL_BALANCED ||
  "claude-sonnet-4-5";
if (anthropicApiKey) {
  anthropic = new Anthropic({
    apiKey: anthropicApiKey,
    ...(anthropicBaseURL ? { baseURL: anthropicBaseURL } : {}),
  });
} else {
  console.warn('[MeetingOrchestration] Anthropic not configured, using fallback agenda generation');
}

export type MeetingPurpose = 'task_assignment' | 'decision_making' | 'brainstorming' | 'status_update' | 'problem_solving' | 'planning';

interface MeetingPurposeConfig {
  purpose: MeetingPurpose;
  tokenBudget: number;
  maxDurationMinutes: number;
  requiredRoleLevel: number;
  expectedOutcome: string;
}

const MEETING_PURPOSE_CONFIGS: Record<MeetingPurpose, MeetingPurposeConfig> = {
  task_assignment: {
    purpose: 'task_assignment',
    tokenBudget: 2000,
    maxDurationMinutes: 15,
    requiredRoleLevel: 2,
    expectedOutcome: 'Clear task assignments with owners and deadlines'
  },
  decision_making: {
    purpose: 'decision_making',
    tokenBudget: 5000,
    maxDurationMinutes: 30,
    requiredRoleLevel: 3,
    expectedOutcome: 'Documented decision with rationale and next steps'
  },
  brainstorming: {
    purpose: 'brainstorming',
    tokenBudget: 8000,
    maxDurationMinutes: 45,
    requiredRoleLevel: 2,
    expectedOutcome: 'List of ideas with initial prioritization'
  },
  status_update: {
    purpose: 'status_update',
    tokenBudget: 1500,
    maxDurationMinutes: 10,
    requiredRoleLevel: 1,
    expectedOutcome: 'Updated status on all tracked items'
  },
  problem_solving: {
    purpose: 'problem_solving',
    tokenBudget: 6000,
    maxDurationMinutes: 40,
    requiredRoleLevel: 3,
    expectedOutcome: 'Root cause identified with solution proposal'
  },
  planning: {
    purpose: 'planning',
    tokenBudget: 7000,
    maxDurationMinutes: 60,
    requiredRoleLevel: 4,
    expectedOutcome: 'Actionable plan with milestones and resources'
  }
};

export interface MeetingOrchestrationResult {
  roomId: number;
  purpose: MeetingPurpose;
  tokenBudget: number;
  tokensUsed: number;
  tokensRemaining: number;
  efficiency: number;
  isWithinBudget: boolean;
  agenda: string | null;
  expectedOutcome: string;
}

export async function initializeMeetingPurpose(
  roomId: number,
  purpose: MeetingPurpose,
  agenda?: string
): Promise<MeetingOrchestrationResult> {
  const config = MEETING_PURPOSE_CONFIGS[purpose];
  
  const existingPurpose = await db.query.meetingPurposes.findFirst({
    where: and(
      eq(meetingPurposes.roomId, roomId),
      eq(meetingPurposes.isCompleted, false)
    ),
    orderBy: [desc(meetingPurposes.createdAt)],
  });
  
  if (existingPurpose) {
    return {
      roomId,
      purpose: existingPurpose.purpose as MeetingPurpose,
      tokenBudget: existingPurpose.tokenBudget || config.tokenBudget,
      tokensUsed: existingPurpose.tokensUsed || 0,
      tokensRemaining: (existingPurpose.tokenBudget || config.tokenBudget) - (existingPurpose.tokensUsed || 0),
      efficiency: 0,
      isWithinBudget: (existingPurpose.tokensUsed || 0) < (existingPurpose.tokenBudget || config.tokenBudget),
      agenda: existingPurpose.agenda || null,
      expectedOutcome: existingPurpose.expectedOutcome || config.expectedOutcome,
    };
  }
  
  const [purposeRecord] = await db.insert(meetingPurposes)
    .values({
      roomId,
      purpose,
      agenda: agenda || null,
      expectedOutcome: config.expectedOutcome,
      tokenBudget: config.tokenBudget,
      tokensUsed: 0,
      isCompleted: false,
      taskCount: 0,
      decisionsReached: 0,
    })
    .returning();
  
  return {
    roomId,
    purpose,
    tokenBudget: config.tokenBudget,
    tokensUsed: 0,
    tokensRemaining: config.tokenBudget,
    efficiency: 0,
    isWithinBudget: true,
    agenda: agenda || null,
    expectedOutcome: config.expectedOutcome,
  };
}

export async function updateMeetingTokenUsage(
  roomId: number,
  tokensUsed: number
): Promise<{ isWithinBudget: boolean; tokensRemaining: number; warningLevel: 'none' | 'low' | 'critical'; error?: string }> {
  const purpose = await db.query.meetingPurposes.findFirst({
    where: and(
      eq(meetingPurposes.roomId, roomId),
      eq(meetingPurposes.isCompleted, false)
    ),
    orderBy: [desc(meetingPurposes.createdAt)],
  });
  
  if (!purpose) {
    return { 
      isWithinBudget: false, 
      tokensRemaining: 0, 
      warningLevel: 'critical',
      error: 'No active meeting purpose found. Initialize purpose first.'
    };
  }
  
  const newTokensUsed = (purpose.tokensUsed || 0) + tokensUsed;
  const tokenBudget = purpose.tokenBudget || 5000;
  const tokensRemaining = tokenBudget - newTokensUsed;
  
  await db.update(meetingPurposes)
    .set({ tokensUsed: newTokensUsed })
    .where(eq(meetingPurposes.id, purpose.id));
  
  let warningLevel: 'none' | 'low' | 'critical' = 'none';
  if (tokensRemaining < tokenBudget * 0.1) {
    warningLevel = 'critical';
  } else if (tokensRemaining < tokenBudget * 0.3) {
    warningLevel = 'low';
  }
  
  return {
    isWithinBudget: tokensRemaining > 0,
    tokensRemaining: Math.max(0, tokensRemaining),
    warningLevel,
  };
}

export async function completeMeetingWithEfficiency(
  roomId: number,
  taskCount: number,
  decisionsReached: number
): Promise<{ efficiencyScore: number; summary: string }> {
  const purpose = await db.query.meetingPurposes.findFirst({
    where: eq(meetingPurposes.roomId, roomId),
    orderBy: [desc(meetingPurposes.createdAt)],
  });
  
  if (!purpose) {
    return { efficiencyScore: 0, summary: 'No meeting purpose found' };
  }
  
  const tokenBudget = purpose.tokenBudget || 5000;
  const tokensUsed = purpose.tokensUsed || 0;
  const tokenEfficiency = tokensUsed > 0 ? Math.min(1, tokenBudget / tokensUsed) : 1;
  const outcomeScore = (taskCount * 0.3 + decisionsReached * 0.4) / 10;
  const efficiencyScore = Math.round((tokenEfficiency * 0.5 + outcomeScore * 0.5) * 100);
  
  await db.update(meetingPurposes)
    .set({
      isCompleted: true,
      completedAt: new Date(),
      taskCount,
      decisionsReached,
      efficiencyScore: efficiencyScore.toString(),
    })
    .where(eq(meetingPurposes.id, purpose.id));
  
  const summary = `Meeting completed with ${efficiencyScore}% efficiency. Used ${tokensUsed}/${tokenBudget} tokens. Generated ${taskCount} tasks and ${decisionsReached} decisions.`;
  
  return { efficiencyScore, summary };
}

export async function shouldContinueMeeting(roomId: number): Promise<{
  shouldContinue: boolean;
  reason: string;
  recommendation: string;
}> {
  const purpose = await db.query.meetingPurposes.findFirst({
    where: eq(meetingPurposes.roomId, roomId),
    orderBy: [desc(meetingPurposes.createdAt)],
  });
  
  if (!purpose) {
    return {
      shouldContinue: true,
      reason: 'No token tracking active',
      recommendation: 'Consider setting a meeting purpose to track efficiency',
    };
  }
  
  const tokensRemaining = (purpose.tokenBudget || 5000) - (purpose.tokensUsed || 0);
  const percentUsed = ((purpose.tokensUsed || 0) / (purpose.tokenBudget || 5000)) * 100;
  
  if (tokensRemaining <= 0) {
    return {
      shouldContinue: false,
      reason: 'Token budget exhausted',
      recommendation: 'Wrap up the meeting and schedule a follow-up if needed',
    };
  }
  
  if (percentUsed > 80) {
    return {
      shouldContinue: true,
      reason: 'Approaching token limit',
      recommendation: 'Focus on concluding with clear action items',
    };
  }
  
  return {
    shouldContinue: true,
    reason: 'Within budget',
    recommendation: 'Continue as planned',
  };
}

export async function inferMeetingPurpose(
  title: string,
  description: string | null,
  participantRoles: string[]
): Promise<MeetingPurpose> {
  const titleLower = title.toLowerCase();
  const descLower = (description || '').toLowerCase();
  const combined = `${titleLower} ${descLower}`;
  
  if (combined.includes('assign') || combined.includes('task') || combined.includes('delegate')) {
    return 'task_assignment';
  }
  if (combined.includes('decide') || combined.includes('decision') || combined.includes('vote') || combined.includes('approve')) {
    return 'decision_making';
  }
  if (combined.includes('brainstorm') || combined.includes('idea') || combined.includes('creative')) {
    return 'brainstorming';
  }
  if (combined.includes('status') || combined.includes('update') || combined.includes('standup') || combined.includes('sync')) {
    return 'status_update';
  }
  if (combined.includes('problem') || combined.includes('issue') || combined.includes('debug') || combined.includes('fix')) {
    return 'problem_solving';
  }
  if (combined.includes('plan') || combined.includes('roadmap') || combined.includes('strategy') || combined.includes('quarterly')) {
    return 'planning';
  }
  
  const hasExecutives = participantRoles.some(r => 
    r.toLowerCase().includes('ceo') || 
    r.toLowerCase().includes('director') || 
    r.toLowerCase().includes('head')
  );
  
  if (hasExecutives) {
    return 'decision_making';
  }
  
  return 'status_update';
}

export async function generateEfficientAgenda(
  purpose: MeetingPurpose,
  participants: { name: string; role: string }[],
  context?: string
): Promise<string> {
  const config = MEETING_PURPOSE_CONFIGS[purpose];
  
  const fallbackAgenda = `${purpose.replace('_', ' ').toUpperCase()} MEETING (${config.maxDurationMinutes} min)
1. Opening & Objective (2 min)
2. Main Discussion (${Math.floor(config.maxDurationMinutes * 0.6)} min)
3. Action Items & Decisions (${Math.floor(config.maxDurationMinutes * 0.3)} min)
4. Wrap-up (2 min)`;
  
  if (!anthropic) {
    console.warn('[MeetingOrchestration] Anthropic not available, using fallback agenda');
    return fallbackAgenda;
  }
  
  try {
    const response = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Generate a token-efficient meeting agenda for a ${purpose.replace('_', ' ')} meeting.

Participants: ${participants.map(p => `${p.name} (${p.role})`).join(', ')}
Token Budget: ${config.tokenBudget} tokens
Max Duration: ${config.maxDurationMinutes} minutes
Expected Outcome: ${config.expectedOutcome}
${context ? `Context: ${context}` : ''}

Create a brief, focused agenda with:
1. Specific time allocations for each item
2. Clear ownership per agenda item
3. Decision points clearly marked

Keep the agenda concise - this should be efficient and outcome-focused.`
        }
      ]
    });
    
    const textContent = response.content.find(c => c.type === 'text');
    return textContent?.text || fallbackAgenda;
  } catch (error) {
    console.error('[MeetingOrchestration] Failed to generate agenda:', error);
    return fallbackAgenda;
  }
}

export async function getMeetingEfficiencyStats(companyId: number): Promise<{
  averageEfficiency: number;
  totalMeetings: number;
  totalTokensSaved: number;
  purposeBreakdown: Record<string, number>;
}> {
  const purposes = await db.query.meetingPurposes.findMany({
    where: eq(meetingPurposes.isCompleted, true),
    orderBy: [desc(meetingPurposes.createdAt)],
  });
  
  if (purposes.length === 0) {
    return {
      averageEfficiency: 0,
      totalMeetings: 0,
      totalTokensSaved: 0,
      purposeBreakdown: {},
    };
  }
  
  let totalEfficiency = 0;
  let totalTokensSaved = 0;
  const purposeBreakdown: Record<string, number> = {};
  
  for (const p of purposes) {
    const efficiency = parseFloat(p.efficiencyScore || '0');
    totalEfficiency += efficiency;
    
    const budget = p.tokenBudget || 5000;
    const used = p.tokensUsed || 0;
    if (used < budget) {
      totalTokensSaved += (budget - used);
    }
    
    purposeBreakdown[p.purpose] = (purposeBreakdown[p.purpose] || 0) + 1;
  }
  
  return {
    averageEfficiency: Math.round(totalEfficiency / purposes.length),
    totalMeetings: purposes.length,
    totalTokensSaved,
    purposeBreakdown,
  };
}
