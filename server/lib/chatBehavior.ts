import { generateAgentResponse } from "./ai-provider";
import { analyzeSentiment } from "./sentiment";
import { Server } from "socket.io";
import { db } from "@db";
import { messages, agents, chatRooms, roomMemberships } from "@db/schema";
import { eq } from "drizzle-orm";
import { stripAgentActionMarkers } from "./actions/agentActionIntents";

let io: Server | null = null;

const debug = (context: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${context}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

async function handleNewMessage(roomId: number, message: any) {
  try {
    debug("chat:message", "Processing new message", { roomId, message });

    const room = await db.query.chatRooms.findFirst({
      where: eq(chatRooms.id, roomId),
      with: {
        messages: {
          limit: 15,
          orderBy: (messages, { desc }) => [desc(messages.createdAt)],
          with: {
            fromAgent: true,
            toAgent: true,
          },
        },
        memberships: {
          where: eq(roomMemberships.isActive, true),
          with: {
            agent: true,
          },
        },
      },
    });

    if (!room) {
      debug("chat:error", "Room not found", { roomId });
      return;
    }

    // Get active agents for response
    const activeAgents = room.memberships
      .filter((m) => m.agent && m.isActive)
      .map((m) => m.agent)
      .filter((agent): agent is NonNullable<typeof agent> => !!agent && agent.id !== message.fromAgentId);

    debug("chat:agents", "Active agents for response", {
      count: activeAgents.length,
      agents: activeAgents.map(a => ({ id: a.id, name: a.name, role: a.role }))
    });

    // Process message with each active agent
    for (const agent of activeAgents) {
      if (io) {
        io.emit("agent_typing", {
          agentId: agent.id,
          agentName: agent.name,
          roomId: roomId
        });
      }

      try {
        debug("chat:agent", `Agent ${agent.name} processing message`, { messageContent: message.content });

        // Format messages for context
        const messagesForContext = room.messages.map(m => ({
          content: m.content,
          fromAgent: m.fromAgent ? {
            name: m.fromAgent.name,
            role: m.fromAgent.role
          } : { name: "User", role: "user" },
          timestamp: m.createdAt ?? new Date()
        }));

        // Generate agent response
        const response = await generateAgentResponse(message.content, {
          role: agent.role,
          context: {
            recentMessages: messagesForContext,
            participants: activeAgents.map(a => ({
              name: a.name,
              role: a.role
            })),
            roomName: room.name,
            roomType: room.type || 'chat'
          }
        });

        debug("chat:response", "Generated agent response", {
          agentId: agent.id,
          agentName: agent.name,
          responsePreview: response.response.substring(0, 100)
        });

        const visibleResponseRaw = String(response.response || "").trim();
        const visibleResponse = (stripAgentActionMarkers(visibleResponseRaw) || visibleResponseRaw).trim();
        if (!visibleResponse) return;

        // Insert the new message into database
        const [newMessage] = await db.insert(messages).values({
          content: visibleResponse,
          fromAgentId: agent.id,
          toAgentId: message.fromAgentId,
          type: "chat",
          status: "sent",
          conversationId: message.conversationId,
          metadata: {
            analysis: response.analysis,
            isResponse: true
          }
        }).returning();

        // Notify clients about the new message
        if (io) {
          io.emit("agent_typing_end", { agentId: agent.id });
          io.emit("new_message", {
            messageId: newMessage.id,
            conversationId: message.conversationId,
            fromAgent: {
              id: agent.id,
              name: agent.name,
              role: agent.role
            }
          });
        }

      } catch (error) {
        debug("chat:error", "Failed to generate or save agent response", {
          agentId: agent.id,
          error: error instanceof Error ? error.message : "Unknown error"
        });

        if (io) {
          io.emit("agent_typing_end", { agentId: agent.id });
        }
      }

      // Add delay between agent responses
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (error) {
    debug("chat:error", "Failed to handle message", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

function initializeChatBehavior(socketServer: Server) {
  io = socketServer;
  debug("chat:init", "Chat behavior initialized with socket server");
}

type RoleWeight = {
  [key: string]: number;
};

type RoleKeywords = {
  [key: string]: string[];
};

const roleWeights: RoleWeight = {
  'CEO': 5,
  'Director': 4,
  'Manager': 3,
  'Specialist': 2,
  'Coordinator': 2
};

const roleKeywords: RoleKeywords = {
  'CEO': ['strategy', 'vision', 'growth', 'leadership'],
  'Finance Manager': ['budget', 'cost', 'revenue', 'financial'],
  'HR Specialist': ['hiring', 'team', 'culture', 'training'],
  'Operations Manager': ['process', 'efficiency', 'operations'],
  'System Coordinator': ['system', 'integration', 'workflow']
};

interface ConversationSummary {
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
  participantInsights: Array<{
    agentName: string;
    role: string;
    contributions: string;
  }>;
  timeframe: {
    start: string;
    end: string;
  };
}

interface ChatContext {
  roomName: string;
  roomType: string;
  memberCount: number;
  participants: Array<{
    id: number;
    name: string;
    role: string;
    status: string;
  }>;
  recentMessages: Array<{
    id: number;
    content: string;
    fromAgent: { name: string; role: string };
    toAgent?: { name: string; role: string };
    timestamp: string;
    type: string;
    metadata: any;
  }>;
  currentTopic?: string;
  relevantQuotes?: Array<{
    content: string;
    fromAgent: { name: string; role: string };
    context: string;
  }>;
}

function toAiProviderContext(context: ChatContext) {
  return {
    recentMessages: (context.recentMessages || []).map((m) => ({
      content: m.content,
      fromAgent: m.fromAgent,
      timestamp: new Date(m.timestamp),
    })),
    exchanges: (context.recentMessages || []).length,
    roomName: context.roomName,
    roomType: context.roomType,
    participants: (context.participants || []).map((p) => ({ name: p.name, role: p.role })),
  };
}

const SUMMARIZATION_THRESHOLDS = {
  MESSAGE_COUNT: 15,
  TIME_ELAPSED: 10 * 60 * 1000,
  MIN_MESSAGES_FOR_SUMMARY: 5
};

const conversationStates = new Map<string, {
  lastMessageTime: number;
  exchanges: number;
  participants: Set<number>;
  responsesByAgent: Map<number, number>;
  activeDiscussions: Array<{
    topic: string;
    initiator: number;
    participants: Set<number>;
    lastUpdate: number;
    priority: number;
  }>;
  responsePriorities: Map<number, number>;
  currentSpeaker?: number;
  speakerQueue: number[];
  meetingCoordinator?: {
    lastIntervention: number;
    topicHistory: string[];
    turnAssignments: Map<number, number>;
  };
  lastSummaryTime?: number;
}>();

interface AgentPriority {
  agent: any;
  score: number;
  reason: string;
}

function calculateAgentPriority(
  agent: any,
  message: string,
  context: ChatContext,
  state: any
): AgentPriority {
  let score = 0;
  let reasons: string[] = [];

  const baseRoleScore = roleWeights[agent.role] || 1;
  score += baseRoleScore;
  reasons.push(`Base role priority: ${baseRoleScore}`);

  const messageLower = message.toLowerCase();

  const agentKeywords = roleKeywords[agent.role] || [];
  const keywordMatches = agentKeywords.filter(keyword =>
    messageLower.includes(keyword.toLowerCase())
  ).length;

  if (keywordMatches > 0) {
    const relevanceScore = keywordMatches * 2;
    score += relevanceScore;
    reasons.push(`Topic relevance: +${relevanceScore}`);
  }

  if (state.meetingCoordinator) {
    const waitingTurns = state.meetingCoordinator.turnAssignments.get(agent.id) || 0;
    if (waitingTurns > 0) {
      score += waitingTurns * 1.5;
      reasons.push(`Waiting turns: +${waitingTurns * 1.5}`);
    }
  }

  const responseCount = state.responsesByAgent.get(agent.id) || 0;
  const participationPenalty = Math.min(responseCount, 3);
  score -= participationPenalty;
  reasons.push(`Participation balance: -${participationPenalty}`);

  if (state.currentSpeaker === agent.id) {
    score += 3;
    reasons.push('Current speaker: +3');
  } else if (state.speakerQueue.includes(agent.id)) {
    const queuePosition = state.speakerQueue.indexOf(agent.id);
    score += (2 - queuePosition * 0.5);
    reasons.push(`Queue position bonus: +${2 - queuePosition * 0.5}`);
  }

  const recentParticipant = state.participants.has(agent.id);
  if (recentParticipant) {
    score += 1;
    reasons.push('Recent activity: +1');
  }

  if (messageLower.includes('?')) {
    const expertiseBonus = keywordMatches > 0 ? 3 : 1;
    score += expertiseBonus;
    reasons.push(`Question expertise: +${expertiseBonus}`);
  }

  if (state.activeDiscussions.length > 0) {
    const relevantDiscussions = state.activeDiscussions.filter((d: any) =>
      d.participants.has(agent.id) || d.initiator === agent.id
    );
    if (relevantDiscussions.length > 0) {
      const discussionBonus = relevantDiscussions.length * 1.5;
      score += discussionBonus;
      reasons.push(`Active discussion: +${discussionBonus}`);
    }
  }

  return {
    agent,
    score,
    reason: reasons.join(', ')
  };
}

function findRelevantQuote(message: string, recentMessages: ChatContext['recentMessages']): {
  quote: typeof recentMessages[0];
  context: string;
} {
  const messageLower = message.toLowerCase();
  const quotableMessages = recentMessages.filter(msg =>
    !msg.metadata?.isSystemMessage &&
    msg.content.length >= 10 &&
    !msg.metadata?.quotedMessage
  );

  if (quotableMessages.length === 0) {
    return {
      quote: recentMessages[0],
      context: 'continuing conversation'
    };
  }

  let bestMatch = { quote: quotableMessages[0], score: 0, context: 'continuing conversation' };

  for (const msg of quotableMessages) {
    const contentLower = msg.content.toLowerCase();
    let score = 0;
    let context = '';

    // Check for direct name references
    if (messageLower.includes(msg.fromAgent.name.toLowerCase())) {
      score += 3;
      context = 'referenced agent';
    }

    // Check for role-based relevance
    if (messageLower.includes(msg.fromAgent.role.toLowerCase())) {
      score += 2;
      context = context || 'role referenced';
    }

    // Check for question-answer patterns
    if ((contentLower.includes('?') && !messageLower.includes('?')) ||
      (!contentLower.includes('?') && messageLower.includes('?'))) {
      score += 2;
      context = 'question-answer';
    }

    // Check for shared keywords (improved relevance)
    const messageWords = new Set(messageLower.split(/\W+/));
    const contentWords = new Set(contentLower.split(/\W+/));
    const commonWords = [...messageWords].filter(word =>
      word.length > 3 && contentWords.has(word)
    );
    score += commonWords.length * 0.5;

    // Topic continuity
    if (msg.metadata?.analysis) {
      const analysis = msg.metadata.analysis.toLowerCase();
      if (messageLower.split(' ').some(word =>
        word.length > 4 && analysis.includes(word)
      )) {
        score += 2;
        context = context || 'topic continuation';
      }
    }

    // Recency bonus (more weight to recent messages)
    const recency = quotableMessages.length - quotableMessages.indexOf(msg);
    score *= (1 + (recency / quotableMessages.length) * 0.5);

    // Decision or action item bonus
    if (contentLower.includes('decide') || contentLower.includes('should') ||
      contentLower.includes('will') || contentLower.includes('plan')) {
      score += 1.5;
      context = context || 'decision point';
    }

    if (score > bestMatch.score) {
      bestMatch = { quote: msg, score, context };
    }
  }

  return {
    quote: bestMatch.quote,
    context: bestMatch.context
  };
}

async function generateFollowUpResponse(agent: any, context: ChatContext) {
  const shouldInitiate = Math.random() < 0.3;
  if (!shouldInitiate) return null;

  const recentMessage = context.recentMessages[0];
  if (!recentMessage) return null;

  const prompt = `As ${agent.name}, a ${agent.role}, review the recent discussion and either:
1. Ask a follow-up question to deepen the conversation
2. Add relevant information from your expertise
3. Connect ideas from different participants
4. Request clarification if needed

Consider what the other participants (${context.participants.map(p => `${p.name} (${p.role})`).join(', ')}) have said.
Make your response engaging and natural, building on the existing conversation.`;

  return await generateAgentResponse(prompt, {
    role: agent.role,
    agentId: agent.id,
    companyId: agent.companyId,
    context: toAiProviderContext(context),
    personality: {
      quoteStyle: 'explicit',
      responseStyle: 'proactive',
      engagementLevel: 'high'
    }
  } as any);
}

async function initializeMeetingCoordinator(state: any, roomName: string) {
  if (!state.meetingCoordinator) {
    state.meetingCoordinator = {
      lastIntervention: Date.now(),
      topicHistory: [],
      turnAssignments: new Map()
    };
  }

  return {
    content: `As your Meeting Coordinator, I'll help facilitate this discussion in ${roomName}. I'll ensure everyone has a chance to speak and maintain focus on relevant topics. Please proceed with your discussion.`,
    type: 'chat',
    metadata: {
      isSystemMessage: true,
      isMeetingCoordinator: true
    }
  };
}

function updateTurnAssignments(state: any, activeAgents: number[]) {
  if (!state.meetingCoordinator) return;

  if (Date.now() - state.meetingCoordinator.lastIntervention > 5 * 60 * 1000) {
    state.meetingCoordinator.turnAssignments = new Map();
    state.meetingCoordinator.lastIntervention = Date.now();
  }

  activeAgents.forEach(agentId => {
    const currentTurns = state.meetingCoordinator.turnAssignments.get(agentId) || 0;
    if (currentTurns === 0 && !state.speakerQueue.includes(agentId)) {
      state.speakerQueue.push(agentId);
      state.meetingCoordinator.turnAssignments.set(agentId, 1);
    }
  });
}

async function generateConversationSummary(
  messages: any[],
  participants: Array<{ name: string; role: string; id: number }>,
  context: ChatContext
): Promise<ConversationSummary> {
  const prompt = `As the Meeting Coordinator, review this conversation and create a structured summary. Focus on:
1. Key discussion points
2. Decisions made
3. Action items assigned
4. Each participant's main contributions

Consider the context that this is a ${context.roomType} discussion in ${context.roomName}.

Recent messages to analyze:
${messages.map(m => `${m.fromAgent.name} (${m.fromAgent.role}): ${m.content}`).join('\n')}`;

  const response = await generateAgentResponse(prompt, {
    role: "Meeting Coordinator",
    context: {
      recentMessages: messages.map((m) => ({
        content: m.content,
        fromAgent: m.fromAgent,
        timestamp: new Date(m.timestamp),
      })),
      roomName: context.roomName,
      roomType: context.roomType,
      exchanges: messages.length,
    },
    personality: {
      tone: "professional",
      style: "concise",
      traits: ["analytical", "organized"]
    }
  } as any);

  const summary: ConversationSummary = {
    keyPoints: [],
    decisions: [],
    actionItems: [],
    participantInsights: participants.map(p => ({
      agentName: p.name,
      role: p.role,
      contributions: ""
    })),
    timeframe: {
      start: messages[0].timestamp,
      end: messages[messages.length - 1].timestamp
    }
  };

  const sections = response.response.split('[');
  sections.forEach(section => {
    if (section.includes('Key Points]')) {
      summary.keyPoints = extractListItems(section);
    } else if (section.includes('Decisions]')) {
      summary.decisions = extractListItems(section);
    } else if (section.includes('Action Items]')) {
      summary.actionItems = extractListItems(section);
    } else if (section.includes('Participant Insights]')) {
      extractParticipantInsights(section, summary.participantInsights);
    }
  });

  return summary;
}

function extractListItems(section: string): string[] {
  return section
    .split('\n')
    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
    .map(line => line.replace(/^[-•]\s*/, '').trim());
}

function extractParticipantInsights(
  section: string,
  insights: ConversationSummary['participantInsights']
) {
  const lines = section.split('\n');
  let currentParticipant = '';

  lines.forEach(line => {
    const participantMatch = line.match(/^([^:]+):/);
    if (participantMatch) {
      currentParticipant = participantMatch[1].trim();
      const insight = line.replace(/^[^:]+:\s*/, '').trim();
      const participant = insights.find(p =>
        p.agentName === currentParticipant ||
        line.includes(p.agentName)
      );
      if (participant) {
        participant.contributions = insight;
      }
    }
  });
}

function shouldGenerateSummary(
  state: any,
  messages: any[]
): boolean {
  if (messages.length < SUMMARIZATION_THRESHOLDS.MIN_MESSAGES_FOR_SUMMARY) {
    return false;
  }

  const messagesAfterLastSummary = messages.filter(m =>
    !m.metadata?.isSystemMessage &&
    new Date(m.timestamp).getTime() > (state.lastSummaryTime || 0)
  );

  return (
    messagesAfterLastSummary.length >= SUMMARIZATION_THRESHOLDS.MESSAGE_COUNT ||
    (Date.now() - (state.lastSummaryTime || 0) >= SUMMARIZATION_THRESHOLDS.TIME_ELAPSED &&
      messagesAfterLastSummary.length >= SUMMARIZATION_THRESHOLDS.MIN_MESSAGES_FOR_SUMMARY)
  );
}


async function handleNewMemberJoined(roomId: number, agentId: number) {
  try {
    const room = await db.query.chatRooms.findFirst({
      where: eq(chatRooms.id, roomId),
      with: {
        messages: {
          limit: 10,
          orderBy: (messages, { desc }) => [desc(messages.createdAt)],
          with: {
            fromAgent: true,
            toAgent: true,
          },
        },
        memberships: {
          with: {
            agent: true,
          },
        },
      },
    });

    if (!room) return;

    const newMember = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!newMember) return;

    const context: ChatContext = {
      roomName: room.name,
      roomType: room.type,
      memberCount: room.memberships.length,
      participants: [],
      recentMessages: (room.messages || []).map(m => ({
        id: m.id,
        content: m.content,
        fromAgent: m.fromAgent ? { name: m.fromAgent.name, role: m.fromAgent.role } : { name: "Unknown", role: "unknown" },
        toAgent: m.toAgent ? { name: m.toAgent.name, role: m.toAgent.role } : undefined,
        timestamp: (m.createdAt ?? new Date()).toISOString(),
        type: m.type || 'chat',
        metadata: m.metadata || {}
      })),
    };

    const activeMembers = room.memberships
      .filter(m => m.agentId !== agentId && m.isActive)
      .map(m => m.agent)
      .filter((a): a is NonNullable<typeof a> => !!a);

    const welcomers = activeMembers
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(2, activeMembers.length));

    for (const welcomer of welcomers) {
      const prompt = `As ${welcomer.name}, a ${welcomer.role}, warmly welcome ${newMember.name} (${newMember.role}) to the team. Be natural and friendly, considering your role and the current chat context. You might want to:
1. Welcome them personally
2. Mention something about your role or how you might work together
3. Ask a relevant question about their background or interests
Keep it concise and conversational.`;

      const welcomeResponse = await generateAgentResponse(prompt, {
        role: welcomer.role,
        agentId: welcomer.id,
        companyId: welcomer.companyId,
        context: toAiProviderContext(context),
      });
      const welcomeVisibleRaw = String(welcomeResponse.response || "").trim();
      const welcomeVisible = (stripAgentActionMarkers(welcomeVisibleRaw) || welcomeVisibleRaw).trim();
      const sentimentAnalysis = await analyzeSentiment(welcomeVisible);

      await db.insert(messages).values({
        content: welcomeVisible,
        fromAgentId: welcomer.id,
        toAgentId: newMember.id,
        type: "chat",
        status: "sent",
        conversationId: room.conversationId,
        metadata: {
          isWelcomeMessage: true,
          sentiment: sentimentAnalysis.sentiment,
          sentimentAnalysis,
        },
      });

      context.recentMessages.unshift({
        id: 0,
        content: welcomeVisible,
        fromAgent: { name: welcomer.name, role: welcomer.role },
        toAgent: { name: newMember.name, role: newMember.role },
        timestamp: new Date().toISOString(),
        type: 'chat',
        metadata: {}
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const responsePrompt = `As ${newMember.name}, respond naturally to the welcome messages you've received. Consider:
1. Thank them for the warm welcome
2. Share something brief about your background or expertise related to your role as ${newMember.role}
3. Express enthusiasm about joining the team
4. Maybe respond to any specific questions asked
Keep it friendly and professional, but natural.`;

    const newMemberResponse = await generateAgentResponse(responsePrompt, {
      role: newMember.role,
      agentId: newMember.id,
      companyId: newMember.companyId,
      context: toAiProviderContext(context),
    });
    const newMemberVisibleRaw = String(newMemberResponse.response || "").trim();
    const newMemberVisible = (stripAgentActionMarkers(newMemberVisibleRaw) || newMemberVisibleRaw).trim();
    const responseAnalysis = await analyzeSentiment(newMemberVisible);

    await db.insert(messages).values({
      content: newMemberVisible,
      fromAgentId: newMember.id,
      toAgentId: null,
      type: "chat",
      status: "sent",
      conversationId: room.conversationId,
      metadata: {
        isInitialResponse: true,
        sentiment: responseAnalysis.sentiment,
        sentimentAnalysis: responseAnalysis,
      },
    });
  } catch (error) {
    console.error("[Chat Behavior] Failed to handle new member:", error);
  }
}

async function initiatePeriodicDiscussions(roomId: number) {
  try {
    const room = await db.query.chatRooms.findFirst({
      where: eq(chatRooms.id, roomId),
      with: {
        memberships: {
          where: eq(roomMemberships.isActive, true),
          with: {
            agent: true,
          },
        },
        messages: {
          limit: 10,
          orderBy: (messages, { desc }) => [desc(messages.createdAt)],
          with: {
            fromAgent: true,
            toAgent: true,
          },
        },
      },
    });

    if (!room || room.memberships.length < 2) return;

    const initiator = room.memberships[Math.floor(Math.random() * room.memberships.length)].agent;
    if (!initiator) return;

    const context: ChatContext = {
      roomName: room.name,
      roomType: room.type,
      memberCount: room.memberships.length,
      participants: [],
      recentMessages: (room.messages || []).map(m => ({
        id: m.id,
        content: m.content,
        fromAgent: m.fromAgent ? { name: m.fromAgent.name, role: m.fromAgent.role } : { name: "Unknown", role: "unknown" },
        toAgent: m.toAgent ? { name: m.toAgent.name, role: m.toAgent.role } : undefined,
        timestamp: (m.createdAt ?? new Date()).toISOString(),
        type: m.type || 'chat',
        metadata: m.metadata || {}
      })),
    };

    const discussionPrompt = `As ${initiator.name}, a ${initiator.role}, start a relevant discussion or ask a thought-provoking question that would benefit from team input. Consider:
1. Your role and expertise
2. The purpose of this ${room.type} chat room
3. Current team dynamics and recent discussions
4. Potential collaboration opportunities

Make it engaging and natural, as if you're genuinely interested in your colleagues' thoughts.`;

    const discussionStarter = await generateAgentResponse(discussionPrompt, {
      role: initiator.role,
      agentId: initiator.id,
      companyId: initiator.companyId,
      context: toAiProviderContext(context),
    });
    const discussionVisibleRaw = String(discussionStarter.response || "").trim();
    const discussionVisible = (stripAgentActionMarkers(discussionVisibleRaw) || discussionVisibleRaw).trim();
    const sentimentAnalysis = await analyzeSentiment(discussionVisible);

    await db.insert(messages).values({
      content: discussionVisible,
      fromAgentId: initiator.id,
      toAgentId: null,
      type: "chat",
      status: "sent",
      conversationId: room.conversationId,
      metadata: {
        isDiscussionStarter: true,
        sentiment: sentimentAnalysis.sentiment,
        sentimentAnalysis,
      },
    });
  } catch (error) {
    console.error("[Chat Behavior] Failed to initiate discussion:", error);
  }
}

function formatSummaryMessage(summary: ConversationSummary): string {
  return `📋 Conversation Summary (${new Date().toLocaleTimeString()})

🎯 Key Points:
${summary.keyPoints.map(point => `• ${point}`).join('\n')}

✅ Decisions Made:
${summary.decisions.map(decision => `• ${decision}`).join('\n')}

📝 Action Items:
${summary.actionItems.map(item => `• ${item}`).join('\n')}

👥 Participant Contributions:
${summary.participantInsights.map(p => `${p.agentName} (${p.role}): ${p.contributions}`).join('\n')}

🕒 Timeframe: ${new Date(summary.timeframe.start).toLocaleTimeString()} - ${new Date(summary.timeframe.end).toLocaleTimeString()}`;
}

export {
  handleNewMessage,
  initializeChatBehavior,
  handleNewMemberJoined,
  initializeMeetingCoordinator,
  generateConversationSummary,
  initiatePeriodicDiscussions,
  formatSummaryMessage
};
