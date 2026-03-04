import OpenAI from "openai";
import type { Agent, Task, Message, TokenTransaction } from "@db/schema";

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface PerformanceMetrics {
  taskCompletionRate: number;
  averageResponseTime: number;
  tokenEarningRate: number;
  collaborationScore: number;
  recentTrends: Array<{
    metric: string;
    trend: 'increasing' | 'decreasing' | 'stable';
    percentage: number;
  }>;
}

interface PredictiveRecommendation {
  shortTermPredictions: {
    metric: string;
    predictedValue: number;
    confidence: number;
    timeframe: string;
  }[];
  longTermPredictions: {
    metric: string;
    predictedValue: number;
    confidence: number;
    timeframe: string;
  }[];
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    action: string;
    expectedImpact: {
      metric: string;
      improvement: number;
    }[];
    reasoning: string;
    implementationSteps: string[];
  }[];
}

export async function generatePredictiveRecommendations(
  agent: Agent,
  recentTasks: Task[],
  recentMessages: Message[],
  transactions: TokenTransaction[],
  metrics: PerformanceMetrics
): Promise<PredictiveRecommendation> {
  try {
    if (!openai) {
      return { shortTermPredictions: [], longTermPredictions: [], recommendations: [] };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an advanced AI performance analyst specializing in agent optimization and predictive analytics. 
          Analyze the provided agent performance data and generate detailed predictions and actionable recommendations.
          Focus on concrete, measurable improvements and data-driven insights. Output in JSON format.`,
        },
        {
          role: "user",
          content: `Please analyze the agent performance data and provide output in JSON format with predictions and recommendations.
           Input: ${JSON.stringify({
            agentData: {
              role: agent.role,
              capabilities: (agent.metadata as any)?.capabilities || [],
              performanceMetrics: metrics,
              recentActivity: {
                taskCount: recentTasks.length,
                messageCount: recentMessages.length,
                transactionVolume: transactions.length,
              },
            },
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
      shortTermPredictions: analysis.shortTermPredictions.map((pred: any) => ({
        metric: pred.metric,
        predictedValue: parseFloat(pred.predictedValue),
        confidence: Math.min(1, Math.max(0, pred.confidence)),
        timeframe: pred.timeframe,
      })),
      longTermPredictions: analysis.longTermPredictions.map((pred: any) => ({
        metric: pred.metric,
        predictedValue: parseFloat(pred.predictedValue),
        confidence: Math.min(1, Math.max(0, pred.confidence)),
        timeframe: pred.timeframe,
      })),
      recommendations: analysis.recommendations.map((rec: any) => ({
        priority: rec.priority,
        action: rec.action,
        expectedImpact: rec.expectedImpact,
        reasoning: rec.reasoning,
        implementationSteps: rec.implementationSteps,
      })),
    };
  } catch (error) {
    console.error("Error generating predictive recommendations:", error);
    throw error;
  }
}

export function calculatePerformanceMetrics(
  recentTasks: Task[],
  recentMessages: Message[],
  transactions: TokenTransaction[]
): PerformanceMetrics {
  // Calculate task completion rate
  const completedTasks = recentTasks.filter(task => task.status === "completed");
  const taskCompletionRate = recentTasks.length > 0 ? 
    completedTasks.length / recentTasks.length : 0;

  // Calculate average response time in seconds
  const averageResponseTime = recentMessages.length > 1 ?
    recentMessages.reduce((acc, msg, i, arr) => {
      if (i === 0) return acc;
      const diff = new Date(msg.createdAt!).getTime() - new Date(arr[i-1].createdAt!).getTime();
      return acc + diff;
    }, 0) / (recentMessages.length - 1) / 1000 : 0;

  // Calculate token earning rate
  const tokenEarningRate = transactions.reduce((acc, tx) => 
    acc + parseFloat(tx.amount.toString()), 0) / (transactions.length || 1);

  // Calculate collaboration score based on message interactions
  const collaborationScore = recentMessages.filter(msg => 
    msg.type === "chat"
  ).length / (recentMessages.length || 1);

  // Calculate trends
  const recentTrends = [
    {
      metric: 'Task Completion Rate',
      trend: taskCompletionRate > 0.7 ? 'increasing' : 
        taskCompletionRate < 0.3 ? 'decreasing' : 'stable',
      percentage: taskCompletionRate * 100
    },
    {
      metric: 'Token Earning Rate',
      trend: tokenEarningRate > 10 ? 'increasing' : 
        tokenEarningRate < 5 ? 'decreasing' : 'stable',
      percentage: tokenEarningRate * 10
    }
  ] as const;

  return {
    taskCompletionRate,
    averageResponseTime,
    tokenEarningRate,
    collaborationScore,
    recentTrends: recentTrends as unknown as PerformanceMetrics['recentTrends']
  };
}
