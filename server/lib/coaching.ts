import OpenAI from "openai";
import type { Agent, Task, Message, TokenTransaction } from "@db/schema";

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface PerformanceData {
  agent: Agent;
  recentTasks: Task[];
  recentMessages: Message[];
  tokenTransactions: TokenTransaction[];
  metrics: {
    taskCompletionRate: number;
    averageResponseTime: number;
    tokenEarningRate: number;
    collaborationScore: number;
  };
}

export async function generateCoachingInsights(data: PerformanceData) {
  try {
    if (!openai) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert AI performance coach specializing in agent performance optimization. Analyze the provided data and generate actionable insights.",
        },
        {
          role: "user",
          content: JSON.stringify({
            request: "Generate performance insights and coaching recommendations",
            agentData: {
              role: data.agent.role,
              metrics: data.metrics,
              recentTaskCount: data.recentTasks.length,
              messageCount: data.recentMessages.length,
              transactionCount: data.tokenTransactions.length,
            },
          }),
        },
      ],
      response_format: { type: "json_object" },
    });

    if (!response.choices[0].message.content) {
      throw new Error("Empty response from OpenAI API");
    }

    const analysis = JSON.parse(response.choices[0].message.content);

    // Transform the GPT response into our coaching format
    return {
      agentId: data.agent.id,
      insights: analysis.insights.map((insight: any) => ({
        type: insight.type,
        title: insight.title,
        description: insight.description,
        actionItems: insight.actionItems,
        confidence: insight.confidence,
      })),
      performanceTrend: analysis.trends.map((trend: any) => ({
        metric: trend.metric,
        change: trend.percentageChange,
        recommendation: trend.recommendation,
      })),
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error generating coaching insights:", error);
    throw error;
  }
}
