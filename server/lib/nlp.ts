import { type Message, type Agent, messages, agents } from "@db/schema";
import { db } from "@db";
import { eq, and, desc } from "drizzle-orm";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface ConversationContext {
  recentMessages: Message[];
  agentTraits: any;
  learningMetrics: any;
}

/**
 * Enhanced context gathering for more natural responses
 */
async function gatherConversationContext(
  fromAgentId: number,
  toAgentId: number,
  limit: number = 5
): Promise<ConversationContext> {
  // Get recent messages between these agents
  const recentMessages = await db.query.messages.findMany({
    where: and(
      eq(messages.fromAgentId, fromAgentId),
      eq(messages.toAgentId, toAgentId)
    ),
    orderBy: [desc(messages.createdAt)],
    limit
  });

  // Get agent traits and learning metrics
  const [fromAgent, toAgent] = await Promise.all([
    db.query.agents.findFirst({ where: eq(agents.id, fromAgentId) }),
    db.query.agents.findFirst({ where: eq(agents.id, toAgentId) })
  ]);

  const toAgentAny = toAgent as any;
  return {
    recentMessages,
    agentTraits: toAgentAny?.behavioralTraits ?? toAgentAny?.metadata?.behavioralTraits ?? {},
    learningMetrics: toAgentAny?.learningMetrics ?? toAgentAny?.metadata?.learningMetrics ?? {},
  };
}

/**
 * Analyze message sentiment and complexity
 */
async function analyzeMessage(content: string): Promise<{
  sentiment: number;
  complexity: number;
  contextRelevance: number;
}> {
  if (!openai) {
    return { sentiment: 0.5, complexity: 0.5, contextRelevance: 0.5 };
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "Analyze the following message and return scores for sentiment (1-5), complexity (1-5), and context relevance (1-5) as a JSON object."
      },
      {
        role: "user",
        content
      }
    ],
    response_format: { type: "json_object" }
  });

  const response = completion.choices[0].message.content;
  if (!response) {
    throw new Error("Failed to get valid response from OpenAI");
  }

  const scores = JSON.parse(response);

  return {
    sentiment: (scores.sentiment - 1) / 4, // Normalize to 0-1
    complexity: (scores.complexity - 1) / 4,
    contextRelevance: (scores.contextRelevance - 1) / 4
  };
}

/**
 * Generate more natural, context-aware responses
 */
export async function generateEnhancedResponse(
  content: string,
  fromAgentId: number,
  toAgentId: number
): Promise<{
  response: string;
  metrics: {
    sentiment: number;
    complexity: number;
    contextRelevance: number;
  };
}> {
  const context = await gatherConversationContext(fromAgentId, toAgentId);
  const messageAnalysis = await analyzeMessage(content);
  if (!openai) {
    return { response: content, metrics: messageAnalysis };
  }

  // Build conversation history for context
  const conversationHistory = context.recentMessages
    .map(msg => `${msg.fromAgentId === fromAgentId ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  // Get agent's behavioral traits for personality
  const traits = context.agentTraits;
  const learningMetrics = context.learningMetrics;

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `You are an AI agent with the following traits:
          - Decision making style: ${traits.decisionMaking}
          - Risk tolerance: ${traits.riskTolerance}
          - Communication style: ${traits.communicationStyle}

          Recent conversation context:
          ${conversationHistory}

          Respond in a natural, human-like way while maintaining your personality traits.
          Format your response with [Analysis] and [Response] sections.`
      },
      {
        role: "user",
        content
      }
    ],
    temperature: 0.7, // Slightly higher for more natural variation
    max_tokens: 1000
  });

  const response = completion.choices[0].message.content;
  if (!response) {
    throw new Error("Failed to get valid response from OpenAI");
  }

  return {
    response,
    metrics: messageAnalysis
  };
}
