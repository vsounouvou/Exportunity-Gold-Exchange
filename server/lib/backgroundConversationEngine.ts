import { db } from "@db";
import { agents, chatRooms, roomMemberships, messages, companies, tenants } from "@db/schema";
import { eq, and, inArray, desc, sql, asc } from "drizzle-orm";
import { generateAgentResponse } from "./ai-provider";
import type { Server } from "socket.io";
import { assertAiBackgroundEnabled } from "./ai-consent";
import {
  dispatchAgentActionIntents,
  renderActionDispatchFeedback,
  stripAgentActionMarkers,
} from "./actions/agentActionIntents";
import { getSetting } from "./settings";
import { filterProductionAgentIds } from "./agents/productionAllowlist";

interface ConversationTrigger {
  type: 'scheduled' | 'event' | 'escalation' | 'report';
  agentIds: number[];
  topic: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  context?: any;
}

interface AgentContext {
  id: number;
  name: string;
  role: string;
  department: string;
  managerId: number | null;
  companyId: number;
  capabilities: string[];
}

let io: Server | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let stopTimeoutId: ReturnType<typeof setTimeout> | null = null;
let isExecuting = false;
let lastCycleAt: string | null = null;
let lastError: string | null = null;
let lastCycleStats: Record<string, unknown> | null = null;
let cachedBackgroundTenantId: number | null = null;
const recurringMeetingLastRunByScope = new Map<string, number>();

function parsePositiveIntEnv(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function isFreeModeEnabled() {
  const raw = String(process.env.AI_BACKGROUND_FREE_MODE || process.env.AI_BACKGROUND_ALLOW_FREE_MODE || "").trim();
  if (raw) return truthyEnv(raw);
  return String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production";
}

const COMPANY_COOLDOWN_MS = Number(process.env.AI_BACKGROUND_COMPANY_COOLDOWN_MS || 30 * 60_000);
const MESSAGE_DELAY_MS = Math.max(0, Math.trunc(Number(process.env.AI_BACKGROUND_MESSAGE_DELAY_MS || 0)));
const MIN_EXCHANGES = Math.max(2, parsePositiveIntEnv(process.env.AI_BACKGROUND_MIN_EXCHANGES, 4));
const MAX_EXCHANGES = Math.max(MIN_EXCHANGES, parsePositiveIntEnv(process.env.AI_BACKGROUND_MAX_EXCHANGES, 7));
const MAX_SENTENCES_PER_MESSAGE = Math.max(
  2,
  parsePositiveIntEnv(process.env.AI_BACKGROUND_MAX_SENTENCES_PER_MESSAGE, 5),
);
const MAX_MESSAGE_CHARS = Math.max(320, parsePositiveIntEnv(process.env.AI_BACKGROUND_MAX_MESSAGE_CHARS, 1400));

const debug = (context: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [BGConv:${context}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function asPositiveIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => toPositiveInt(entry))
        .filter((entry): entry is number => typeof entry === "number" && entry > 0),
    ),
  );
}

async function resolveBackgroundTenantId() {
  if (cachedBackgroundTenantId && cachedBackgroundTenantId > 0) return cachedBackgroundTenantId;

  const preferredTenantKey = String(process.env.DEFAULT_TENANT_KEY || "bdo").trim().toLowerCase();
  if (preferredTenantKey) {
    const preferred = await db.query.tenants.findFirst({
      where: eq(tenants.key, preferredTenantKey as any),
      columns: { id: true },
    });
    if (preferred?.id) {
      cachedBackgroundTenantId = Number(preferred.id);
      return cachedBackgroundTenantId;
    }
  }

  const fallbackRows = await db.select({ id: tenants.id }).from(tenants).orderBy(asc(tenants.id)).limit(1);
  const fallbackId = fallbackRows[0]?.id ? Number(fallbackRows[0].id) : null;
  cachedBackgroundTenantId = fallbackId && fallbackId > 0 ? fallbackId : null;
  return cachedBackgroundTenantId;
}

type RecurringMeetingConfig = {
  enabled: boolean;
  intervalMinutes: number;
  topic: string | null;
  companyId: number | null;
  participantAgentIds: number[];
};

async function loadRecurringMeetingConfig(tenantId: number): Promise<RecurringMeetingConfig | null> {
  const scope = `tenant:${tenantId}:ops.background`;
  const value = await getSetting<any>(scope, "recurring_meeting", null);
  if (!value || typeof value !== "object") return null;

  const enabledRaw =
    typeof value.enabled === "boolean"
      ? value.enabled
      : String(value.enabled ?? "false").trim().toLowerCase() === "true";
  const intervalRaw = toPositiveInt(value.intervalMinutes ?? value.interval_minutes);
  const intervalMinutes = intervalRaw ? Math.min(24 * 60, Math.max(1, intervalRaw)) : 30;
  const topic = typeof value.topic === "string" && value.topic.trim() ? value.topic.trim() : null;
  const companyId = toPositiveInt(value.companyId ?? value.company_id);
  const participantAgentIds = asPositiveIntArray(value.participantAgentIds ?? value.participant_agent_ids);

  return {
    enabled: enabledRaw,
    intervalMinutes,
    topic,
    companyId,
    participantAgentIds,
  };
}

function pickRecurringMeetingParticipants(company: any, participantAgentIds: number[]) {
  const companyAgents = Array.isArray(company?.agents) ? company.agents : [];
  if (participantAgentIds.length) {
    const selected = companyAgents.filter((agent: any) => participantAgentIds.includes(Number(agent?.id)));
    if (selected.length >= 2) return selected;
  }

  const managers = companyAgents.filter((a: any) => companyAgents.some((sub: any) => Number(sub?.managerId) === Number(a?.id)));
  const manager = managers[0] || companyAgents[0];
  if (!manager) return [];
  const subordinates = companyAgents.filter((a: any) => Number(a?.managerId) === Number(manager?.id)).slice(0, 2);

  const fallback = [manager, ...subordinates].filter(Boolean);
  return fallback.length >= 2 ? fallback : companyAgents.slice(0, 3);
}

async function maybeRunConfiguredRecurringMeeting(companiesWithAgents: any[]) {
  const tenantId = await resolveBackgroundTenantId();
  if (!tenantId) return false;

  const config = await loadRecurringMeetingConfig(tenantId);
  if (!config?.enabled) return false;
  if (!config.topic || !config.topic.trim()) return false;
  if (!Array.isArray(config.participantAgentIds) || config.participantAgentIds.length < 2) return false;
  if (!config.companyId) return false;

  const scopeKey = `${tenantId}:${config.companyId || "any"}`;
  const nowMs = Date.now();
  const lastRunMs = recurringMeetingLastRunByScope.get(scopeKey) || 0;
  if (nowMs - lastRunMs < config.intervalMinutes * 60_000) {
    return false;
  }

  const targetCompany = companiesWithAgents.find((company: any) => Number(company?.id) === config.companyId);
  if (!targetCompany) return false;

  const participants = (Array.isArray(targetCompany?.agents) ? targetCompany.agents : []).filter((agent: any) =>
    config.participantAgentIds.includes(Number(agent?.id)),
  );
  if (participants.length < 2) return false;

  const topic = config.topic.trim();

  await initiateBackgroundConversation({
    type: "scheduled",
    agentIds: participants.map((agent: any) => Number(agent.id)).filter((id: number) => Number.isInteger(id) && id > 0),
    topic,
    priority: "medium",
    context: {
      companyId: Number(targetCompany.id),
      source: "recurring_config",
      recurringMeeting: true,
      intervalMinutes: config.intervalMinutes,
    },
  });

  recurringMeetingLastRunByScope.set(scopeKey, nowMs);
  return true;
}

export function initializeBackgroundConversationEngine(socketServer: Server) {
  io = socketServer;
  try {
    startBackgroundConversationEngine();
  } catch (error) {
    debug("init", "Background Conversation Engine not started", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Start periodic background conversations (every 5 minutes)
 */
function startPeriodicConversations() {
  // Run immediately on start
  executeBackgroundConversations();
  
  // Then run every 5 minutes
  intervalId = setInterval(() => {
    executeBackgroundConversations();
  }, 5 * 60 * 1000);
  
  debug("scheduler", "Periodic conversation scheduler started (5min intervals)");
}

export function setBackgroundConversationSocketServer(socketServer: Server) {
  io = socketServer;
}

export function getBackgroundConversationEngineStatus() {
  return {
    hasSocketServer: !!io,
    running: !!intervalId,
    lastCycleAt,
    lastError,
    lastCycleStats,
    companyCooldownMs: Number.isFinite(COMPANY_COOLDOWN_MS) ? COMPANY_COOLDOWN_MS : null,
  };
}

export function startBackgroundConversationEngine(options?: { durationMs?: number }) {
  assertAiBackgroundEnabled({
    what: "Start background AI conversations",
    why: "This runs periodic agent-to-agent conversations without direct user prompts.",
    forHowLong: options?.durationMs
      ? `For ${Math.round(options.durationMs / 60000)} minutes.`
      : "Until explicitly stopped.",
    resources: ["External AI API calls", "Database reads/writes", "Background timers"],
    howToAuthorize: [
      "Set `AI_ENABLED=true` and `AI_BACKGROUND_ENABLED=true` and restart the server",
      "Or call `POST /api/ai/background/start` with explicit confirmation",
    ],
    howToStop: ["Call `POST /api/ai/background/stop`", "Or stop the server process"],
  });

  if (!io) {
    throw new Error("Socket server not initialized; cannot start background conversation engine");
  }

  if (intervalId) return;

  debug("init", "Background Conversation Engine initialized");
  startPeriodicConversations();

  if (options?.durationMs) {
    if (stopTimeoutId) clearTimeout(stopTimeoutId);
    stopTimeoutId = setTimeout(() => stopBackgroundConversationEngine(), options.durationMs);
  }
}

export function stopBackgroundConversationEngine() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (stopTimeoutId) {
    clearTimeout(stopTimeoutId);
    stopTimeoutId = null;
  }
  debug("scheduler", "Background conversation engine stopped");
}

/**
 * Main execution loop for background conversations
 */
async function executeBackgroundConversations() {
  if (isExecuting) return;
  isExecuting = true;
  try {
    lastCycleAt = new Date().toISOString();
    lastError = null;
    lastCycleStats = null;
    const freeModeEnabled = isFreeModeEnabled();
    debug("execute", "Starting background conversation cycle");
    
    // Get all active companies with their agents
    const companiesWithAgents = await db.query.companies.findMany({
      with: {
        agents: {
          where: and(eq(agents.status, 'active'), eq(agents.isTest, false), eq(agents.isVisible, true)),
          orderBy: [agents.name],
        },
      },
    });
    
    debug("execute", `Found ${companiesWithAgents.length} companies to process`);
    let companiesProcessed = 0;
    let conversationsAttempted = 0;
    
    const recurringTriggered = await maybeRunConfiguredRecurringMeeting(companiesWithAgents);
    if (recurringTriggered) conversationsAttempted += 1;

    if (freeModeEnabled) {
      for (const company of companiesWithAgents) {
        if (company.agents.length < 2) continue; // Need at least 2 agents for a conversation
        companiesProcessed += 1;

        debug("company", `Processing company: ${company.name} (${company.agents.length} agents)`);

        // Trigger different types of conversations
        conversationsAttempted += 1;
        await triggerDepartmentSync(company);
        conversationsAttempted += 1;
        await triggerHierarchyReport(company);
        conversationsAttempted += 1;
        await triggerCrossCollaboration(company);
      }
    }

    lastCycleStats = {
      companiesFound: companiesWithAgents.length,
      companiesProcessed,
      conversationsAttempted,
      recurringTriggered,
      freeModeEnabled,
    };
    
    debug("execute", "Background conversation cycle completed");
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    debug("error", "Failed to execute background conversations", { error });
  } finally {
    isExecuting = false;
  }
}

/**
 * Trigger department-specific sync conversations
 */
async function triggerDepartmentSync(company: any) {
  try {
    // Group agents by role (since we don't have department field)
    const departments: Record<string, any[]> = {};
    
    for (const agent of company.agents) {
      // Extract department from role (e.g., "Marketing Manager" -> "Marketing")
      const dept = agent.role?.split(' ')[0] || 'General';
      if (!departments[dept]) departments[dept] = [];
      departments[dept].push(agent);
    }
    
    // Create sync conversations for each department with 2+ members
    for (const [deptName, deptAgents] of Object.entries(departments)) {
      if (deptAgents.length < 2) continue;
      
      const topics = [
        `Daily status update for ${deptName}`,
        `${deptName} priorities review`,
        `${deptName} blockers and challenges`,
        `${deptName} collaboration opportunities`,
      ];
      
      const topic = topics[Math.floor(Math.random() * topics.length)];
      
      await initiateBackgroundConversation({
        type: 'scheduled',
        agentIds: deptAgents.map(a => a.id).slice(0, 3), // Max 3 agents per conversation
        topic,
        priority: 'medium',
        context: { department: deptName, companyId: company.id },
      });
    }
  } catch (error) {
    debug("dept-sync:error", "Failed to trigger department sync", { error });
  }
}

/**
 * Trigger hierarchy-based reporting conversations
 */
async function triggerHierarchyReport(company: any) {
  try {
    // Find all manager-subordinate pairs
    const managers = company.agents.filter((a: any) => 
      company.agents.some((sub: any) => sub.managerId === a.id)
    );
    
    for (const manager of managers) {
      const subordinates = company.agents.filter((a: any) => a.managerId === manager.id);
      if (subordinates.length === 0) continue;
      
      // Pick 1-2 random subordinates for a check-in
      const selected = subordinates
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(2, subordinates.length));
      
      const topics = [
        `${manager.name} check-in with team`,
        `Progress update to ${manager.name}`,
        `${manager.name}: Team alignment discussion`,
      ];
      
      await initiateBackgroundConversation({
        type: 'report',
        agentIds: [manager.id, ...selected.map((s: any) => s.id)],
        topic: topics[Math.floor(Math.random() * topics.length)],
        priority: 'medium',
        context: { hierarchyLevel: 'manager-subordinate', companyId: company.id },
      });
    }
  } catch (error) {
    debug("hierarchy:error", "Failed to trigger hierarchy conversations", { error });
  }
}

/**
 * Trigger cross-department collaboration
 */
async function triggerCrossCollaboration(company: any) {
  try {
    // Get agents from different departments (extracted from role)
    const departments = [...new Set(company.agents.map((a: any) => a.role?.split(' ')[0] || 'General'))];
    
    if (departments.length < 2) return;
    
    // Pick 2 random departments
    const [dept1, dept2] = departments.sort(() => Math.random() - 0.5).slice(0, 2);
    
    const agent1 = company.agents.find((a: any) => (a.role?.split(' ')[0] || 'General') === dept1);
    const agent2 = company.agents.find((a: any) => (a.role?.split(' ')[0] || 'General') === dept2);
    
    if (!agent1 || !agent2) return;
    
    const topics = [
      `Cross-department collaboration: ${dept1} & ${dept2}`,
      `${dept1} + ${dept2}: Project alignment`,
      `Inter-department sync: ${dept1} and ${dept2}`,
    ];
    
    await initiateBackgroundConversation({
      type: 'event',
      agentIds: [agent1.id, agent2.id],
      topic: topics[Math.floor(Math.random() * topics.length)],
      priority: 'low',
      context: { type: 'cross-collaboration', departments: [dept1, dept2], companyId: company.id },
    });
  } catch (error) {
    debug("collab:error", "Failed to trigger collaboration", { error });
  }
}

/**
 * Initiate a background conversation between agents
 */
export async function initiateBackgroundConversation(trigger: ConversationTrigger) {
  try {
    debug("initiate", `Starting conversation: ${trigger.topic}`, {
      agents: trigger.agentIds,
      priority: trigger.priority,
    });
    
    // Get full agent details
    const participantsRaw = await db.query.agents.findMany({
      where: inArray(agents.id, trigger.agentIds),
    });

    const runnableParticipants = participantsRaw.filter((p: any) => {
      const status = String(p?.status || "").toLowerCase();
      return status === "active" && !p?.isTest && p?.isVisible !== false;
    });

    const tenantId = await resolveBackgroundTenantId();
    const allowedIds = tenantId
      ? await filterProductionAgentIds({
          tenantId,
          agentIds: runnableParticipants.map((p: any) => Number(p.id)),
          context: "background:initiate",
        })
      : runnableParticipants.map((p: any) => Number(p.id));
    const allowedSet = new Set(allowedIds);
    const participants = runnableParticipants.filter((p: any) => allowedSet.has(Number(p.id)));
    
    if (participants.length < 2) {
      debug("initiate:skip", "Not enough participants");
      return;
    }

    const companyId =
      participants.find((p: any) => Number.isInteger(Number((p as any)?.companyId)))?.companyId ??
      (trigger.context && Number.isInteger(Number(trigger.context.companyId)) ? Number(trigger.context.companyId) : null);

    if (companyId && Number.isFinite(COMPANY_COOLDOWN_MS) && COMPANY_COOLDOWN_MS > 0) {
      const last = await db.query.chatRooms.findFirst({
        where: sql`coalesce(${chatRooms.metadata}->>'isBackgroundConversation','false') = 'true' and coalesce(${chatRooms.metadata}->>'companyId', ${chatRooms.metadata}->'context'->>'companyId', '') = ${String(companyId)}`,
        orderBy: [desc(chatRooms.createdAt)],
      });
      if (last?.createdAt) {
        const lastMs = new Date(last.createdAt as any).getTime();
        if (Number.isFinite(lastMs) && Date.now() - lastMs < COMPANY_COOLDOWN_MS) {
          debug("initiate:skip", "Company cooldown active", { companyId, lastRoomId: last.id });
          return;
        }
      }
    }
    
    // Create a chat room for this background conversation
    const [room] = await db.insert(chatRooms).values({
      name: trigger.topic,
      type: 'general',
      description: `Autonomous background conversation - ${trigger.type}`,
      conversationId: `bg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      metadata: {
        isBackgroundConversation: true,
        companyId,
        trigger: trigger.type,
        priority: trigger.priority,
        context: trigger.context,
      },
    }).returning();
    
    // Add all participants to the room
    await db.insert(roomMemberships).values(
      participants.map(p => ({
        roomId: room.id,
        agentId: p.id,
        joinedAt: new Date(),
        isActive: true,
      }))
    );
    
    debug("room", `Created room ${room.id} for background conversation`);
    
    // Execute the conversation (2-4 message exchanges)
    await executeConversation(room, participants, trigger);
    
  } catch (error) {
    debug("initiate:error", "Failed to initiate conversation", { error });
  }
}

/**
 * Execute a complete background conversation
 */
async function executeConversation(
  room: any,
  participants: any[],
  trigger: ConversationTrigger
) {
  try {
    const exchangeCount = MIN_EXCHANGES + Math.floor(Math.random() * (MAX_EXCHANGES - MIN_EXCHANGES + 1));
    debug("conversation", `Executing ${exchangeCount} exchanges in room ${room.id}`);
    const tenantId = await resolveBackgroundTenantId();
    
    // Conversation context
    const recentMessages: any[] = [];
    
    for (let i = 0; i < exchangeCount; i++) {
      // Select speaker (rotate or based on hierarchy/relevance)
      const speaker = selectNextSpeaker(participants, recentMessages, trigger);
      
      if (!speaker) break;
      
      // Generate message based on role and context
      const messageContent = await generateBackgroundMessage(
        speaker,
        participants,
        recentMessages,
        trigger,
        i === 0
      );
      
      if (!messageContent) break;
      
      // Save message to database
      const visibleMessageContentRaw = String(messageContent || "").trim();
      const visibleMessageContent = (stripAgentActionMarkers(visibleMessageContentRaw) || visibleMessageContentRaw).trim();
      if (!visibleMessageContent) break;

      const [savedMessage] = await db.insert(messages).values({
        content: visibleMessageContent,
        fromAgentId: speaker.id,
        toAgentId: null,
        type: 'chat',
        status: 'sent',
        conversationId: room.conversationId,
        metadata: {
          isBackgroundMessage: true,
          exchangeIndex: i,
          totalExchanges: exchangeCount,
        },
      }).returning();
      
      // Add to recent messages for context
      recentMessages.push({
        content: visibleMessageContent,
        fromAgent: { name: speaker.name, role: speaker.role },
        timestamp: new Date(),
      });

      if (tenantId && tenantId > 0) {
        const actionDispatch = await dispatchAgentActionIntents({
          text: visibleMessageContentRaw,
          tenantId,
          conversationId: String(room.conversationId || ""),
          source: "operations-center.background.engine",
          companyId: toPositiveInt((room.metadata as any)?.companyId) ?? toPositiveInt(trigger.context?.companyId),
          channelId: "background",
          requestedByUserId: null,
          isAdmin: false,
          agent: {
            id: Number(speaker?.id) || null,
            name: String(speaker?.name || ""),
            role: String(speaker?.role || ""),
          },
          fallbackRecipientEmails: null,
        });

        if (actionDispatch.created.length || actionDispatch.blocked.length) {
          const feedback = renderActionDispatchFeedback(actionDispatch).trim();
          if (feedback) {
            const [feedbackMessage] = await db.insert(messages).values({
              content: feedback,
              fromAgentId: null,
              toAgentId: null,
              type: "system",
              status: "sent",
              deliveredAt: new Date(),
              conversationId: room.conversationId,
              metadata: {
                isBackgroundMessage: true,
                kind: "action_dispatch_feedback",
                dispatch: actionDispatch,
              },
            }).returning();

            if (io) {
              io.emit("background_message", {
                roomId: room.id,
                message: feedbackMessage,
                agent: null,
              });
            }
          }
        }
      }
      
      debug("message", `Agent ${speaker.name}: ${visibleMessageContent.substring(0, 60)}...`);
      
      // Emit to socket if available (for real-time updates)
      if (io) {
        io.emit("background_message", {
          roomId: room.id,
          message: savedMessage,
          agent: { id: speaker.id, name: speaker.name, role: speaker.role },
        });
      }
      
      // Small delay between messages for realism
      if (MESSAGE_DELAY_MS) await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY_MS));
    }
    
    debug("conversation", `Completed conversation in room ${room.id}`);
    
    // Generate and save conversation summary
    await generateConversationSummary(room, recentMessages, participants);
    
  } catch (error) {
    debug("conversation:error", "Failed to execute conversation", { error });
  }
}

/**
 * Select the next speaker based on hierarchy and context
 */
function selectNextSpeaker(
  participants: any[],
  recentMessages: any[],
  trigger: ConversationTrigger
): any | null {
  if (recentMessages.length === 0) {
    // First message: prioritize senior roles
    const sortedByRole = [...participants].sort((a, b) => {
      const roleRank: Record<string, number> = {
        'CEO': 5, 'Director': 4, 'Manager': 3, 'Lead': 2, 'Specialist': 1, 'Analyst': 1
      };
      const aRank = Object.entries(roleRank).find(([key]) => a.role.includes(key))?.[1] || 0;
      const bRank = Object.entries(roleRank).find(([key]) => b.role.includes(key))?.[1] || 0;
      return bRank - aRank;
    });
    return sortedByRole[0];
  }
  
  // Subsequent messages: avoid same speaker twice in a row, prefer round-robin
  const lastSpeaker = recentMessages[recentMessages.length - 1]?.fromAgent?.name;
  const available = participants.filter(p => p.name !== lastSpeaker);
  
  if (available.length === 0) return null;
  
  // Simple round-robin
  const speakerCounts: Record<string, number> = {};
  recentMessages.forEach(msg => {
    const name = msg.fromAgent.name;
    speakerCounts[name] = (speakerCounts[name] || 0) + 1;
  });
  
  available.sort((a, b) => (speakerCounts[a.name] || 0) - (speakerCounts[b.name] || 0));
  return available[0];
}

/**
 * Generate a concise, professional background message
 */
async function generateBackgroundMessage(
  speaker: any,
  participants: any[],
  recentMessages: any[],
  trigger: ConversationTrigger,
  isFirstMessage: boolean
): Promise<string | null> {
  try {
    const otherParticipants = participants
      .filter(p => p.id !== speaker.id)
      .map(p => `${p.name} (${p.role})`)
      .join(', ');
    
    const conversationHistory = recentMessages
      .map(m => `${m.fromAgent.name}: ${m.content}`)
      .join('\n');
    
    let prompt = '';
    
    if (isFirstMessage) {
      prompt = `You are ${speaker.name}, a ${speaker.role}. You're starting a brief ${trigger.type} discussion about "${trigger.topic}" with ${otherParticipants}.

CRITICAL RULES:
- Keep response concise but useful (2-4 sentences)
- Be professional and efficient
- Get straight to the point
- Focus on concrete facts, blockers, and next steps
- If there is an action owner, name them directly

Start the discussion:`;
    } else {
      prompt = `You are ${speaker.name}, a ${speaker.role}. Continue this ${trigger.type} discussion with ${otherParticipants}.

Topic: "${trigger.topic}"

Recent conversation:
${conversationHistory}

CRITICAL RULES:
- Keep response concise (2-3 sentences)
- Be sharp and professional
- Build on what was said
- Add value, don't repeat
- Make one concrete contribution (decision, risk, metric, or action)

Your response:`;
    }
    
    const response = await generateAgentResponse(prompt, {
      role: speaker.role,
      agentId: speaker.id,
      companyId: speaker.companyId,
      context: {
        recentMessages,
        roomName: trigger.topic,
        roomType: trigger.type,
        exchanges: recentMessages.length,
      },
    });
    
    // Extract just the response text, removing analysis
    let messageText = String(response.response || "").trim();
    const normalized = messageText.replace(/\s+/g, " ").trim();
    const sentenceParts = normalized
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (sentenceParts.length > MAX_SENTENCES_PER_MESSAGE) {
      messageText = sentenceParts.slice(0, MAX_SENTENCES_PER_MESSAGE).join(" ");
    } else {
      messageText = normalized;
    }

    if (messageText.length > MAX_MESSAGE_CHARS) {
      messageText = `${messageText.slice(0, MAX_MESSAGE_CHARS - 1).trimEnd()}…`;
    }

    return messageText;
    
  } catch (error) {
    debug("generate:error", "Failed to generate message", { error });
    return null;
  }
}

/**
 * Generate a summary for a completed background conversation
 */
async function generateConversationSummary(
  room: any,
  messages: any[],
  participants: any[]
) {
  try {
    if (messages.length === 0) return;
    
    const conversationText = messages
      .map(m => `${m.fromAgent.name}: ${m.content}`)
      .join('\n');
    
    const summaryPrompt = `Summarize this business conversation in 2-4 short sentences. Extract key points and action items.

Conversation:
${conversationText}

Summary (include any action items with "Action:" prefix and keep language plain):`;
    
    const summaryResponse = await generateAgentResponse(summaryPrompt, {
      role: "Meeting Coordinator",
      context: {
        recentMessages: messages,
        roomName: room.name,
        roomType: 'summary',
      },
    });
    
    const summaryTextRaw = String(summaryResponse.response || "").trim();
    const summaryText = (stripAgentActionMarkers(summaryTextRaw) || summaryTextRaw).trim();
    
    // Update room metadata with summary
    await db.update(chatRooms)
      .set({
        metadata: {
          ...room.metadata,
          summary: summaryText,
          messageCount: messages.length,
          participants: participants.map((p: any) => ({ id: p.id, name: p.name, role: p.role })),
          completedAt: new Date().toISOString(),
        },
      })
      .where(eq(chatRooms.id, room.id));
    
    debug("summary", `Generated summary for room ${room.id}`);
    
    // Extract and create tasks from action items
    const companyId = participants.find((p: any) => p.companyId)?.companyId;
    if (participants.length > 0 && companyId) {
      try {
        const { processMeetingCompletion } = await import("./taskLifecycleService");
        const result = await processMeetingCompletion(
          room.id,
          companyId,
          summaryText,
          participants.map((p: any) => ({ id: p.id, name: p.name, role: p.role }))
        );
        
        if (result.tasksCreated > 0) {
          debug("tasks", `Created ${result.tasksCreated} tasks from meeting ${room.id}`);
        }
      } catch (taskError) {
        debug("tasks:error", "Failed to create tasks from meeting", { error: taskError });
      }
    } else {
      debug("tasks:skip", `No companyId found for participants in room ${room.id}`);
    }
    
  } catch (error) {
    debug("summary:error", "Failed to generate summary", { error });
  }
}

/**
 * Trigger an escalation conversation (for urgent matters)
 */
export async function triggerEscalation(
  agentId: number,
  managerId: number,
  issue: string,
  context?: any
) {
  await initiateBackgroundConversation({
    type: 'escalation',
    agentIds: [agentId, managerId],
    topic: `Escalation: ${issue}`,
    priority: 'urgent',
    context,
  });
}

/**
 * Trigger a scheduled report conversation
 */
export async function triggerScheduledReport(
  reportType: string,
  agentIds: number[],
  context?: any
) {
  await initiateBackgroundConversation({
    type: 'report',
    agentIds,
    topic: `${reportType} Report`,
    priority: 'medium',
    context,
  });
}
