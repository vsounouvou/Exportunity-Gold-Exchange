import OpenAI from "openai";
import type { Agent, Message, Task } from "@db/schema";

export type InteractionType = "collaboration" | "conflict" | "support" | "feedback";
export type TeamMetricType = "cohesion" | "communication" | "efficiency" | "innovation";

export type TeamDynamics = {
  type: InteractionType;
  sentiment?: number;
  impact?: number;
  context?: string;
  createdAt?: Date | string;
};

export type TeamMetrics = {
  metric: TeamMetricType;
  value: number;
  createdAt?: Date | string;
};

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface TeamAnalysis {
  currentMetrics: {
    cohesion: number;
    communication: number;
    efficiency: number;
    innovation: number;
  };
  predictions: {
    metric: TeamMetricType;
    currentValue: number;
    predictedValue: number;
    confidence: number;
    timeframe: string;
    factors: {
      name: string;
      impact: number;
      trend: "positive" | "negative" | "neutral";
    }[];
  }[];
  recommendations: {
    action: string;
    expectedImpact: number;
    priority: "high" | "medium" | "low";
  }[];
}

interface InteractionAnalysis {
  type: InteractionType;
  sentiment: number;
  impact: number;
  context: string;
}

export async function analyzeTeamInteraction(
  message: Message,
  fromAgent: Agent,
  toAgent: Agent
): Promise<InteractionAnalysis> {
  try {
    if (!openai) {
      return { type: "collaboration", sentiment: 0, impact: 0.5, context: "AI disabled (no OPENAI_API_KEY)" };
    }
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert in analyzing team dynamics and interpersonal interactions. Analyze the given message and provide insights about the interaction type, sentiment, and impact in JSON format.",
        },
        {
          role: "user",
          content: `Please analyze this interaction and provide output in JSON format with the following fields: type (one of: collaboration, conflict, support, feedback), sentiment (-1 to 1), impact (0 to 1), and context.

Input: ${JSON.stringify({
            message: message.content,
            fromAgent: { role: fromAgent.role, capabilities: fromAgent.capabilities },
            toAgent: { role: toAgent.role, capabilities: toAgent.capabilities },
          })}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI API");
    }

    const analysis = JSON.parse(content);
    return {
      type: analysis.type,
      sentiment: Math.max(-1, Math.min(1, analysis.sentiment)),
      impact: Math.max(0, Math.min(1, analysis.impact)),
      context: analysis.context,
    };
  } catch (error) {
    console.error("Error analyzing team interaction:", error);
    throw error;
  }
}

export async function predictTeamDynamics(
  recentInteractions: TeamDynamics[],
  recentMetrics: TeamMetrics[],
  agents: Agent[],
  tasks: Task[]
): Promise<TeamAnalysis> {
  try {
    if (!openai) {
      return {
        currentMetrics: { cohesion: 0.5, communication: 0.5, efficiency: 0.5, innovation: 0.5 },
        predictions: [],
        recommendations: [],
      };
    }
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an AI specialized in predicting team dynamics and providing actionable recommendations for improvement. Analyze the provided data and generate predictions in JSON format.",
        },
        {
          role: "user",
          content: `Please analyze the team dynamics data and provide output in JSON format with the following structure:
{
  "currentMetrics": {
    "cohesion": number,
    "communication": number,
    "efficiency": number,
    "innovation": number
  },
  "predictions": [{
    "metric": string,
    "currentValue": number,
    "predictedValue": number,
    "confidence": number,
    "timeframe": string,
    "factors": [{
      "name": string,
      "impact": number,
      "trend": "positive" | "negative" | "neutral"
    }]
  }],
  "recommendations": [{
    "action": string,
    "expectedImpact": number,
    "priority": "high" | "medium" | "low"
  }]
}

Input: ${JSON.stringify({
            interactions: recentInteractions,
            metrics: recentMetrics,
            agents: agents.map(a => ({ role: a.role, capabilities: a.capabilities })),
            tasks: tasks.map(t => ({ status: t.status, priority: t.priority })),
          })}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI API");
    }

    const analysis = JSON.parse(content);
    return {
      currentMetrics: {
        cohesion: Math.max(0, Math.min(1, analysis.currentMetrics.cohesion)),
        communication: Math.max(0, Math.min(1, analysis.currentMetrics.communication)),
        efficiency: Math.max(0, Math.min(1, analysis.currentMetrics.efficiency)),
        innovation: Math.max(0, Math.min(1, analysis.currentMetrics.innovation)),
      },
      predictions: analysis.predictions.map((pred: any) => ({
        metric: pred.metric,
        currentValue: Math.max(0, Math.min(1, pred.currentValue)),
        predictedValue: Math.max(0, Math.min(1, pred.predictedValue)),
        confidence: Math.max(0, Math.min(1, pred.confidence)),
        timeframe: pred.timeframe,
        factors: pred.factors,
      })),
      recommendations: analysis.recommendations,
    };
  } catch (error) {
    console.error("Error predicting team dynamics:", error);
    throw error;
  }
}
