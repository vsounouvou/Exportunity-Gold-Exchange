import OpenAI from "openai";
import type { Meeting, Agent, Task } from "@db/schema";
import { db } from "@db";
import { eq, and, gte, lte } from "drizzle-orm";
import { agentAvailability } from "@db/schema";

type AgentAvailability = typeof agentAvailability.$inferSelect;

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface PriorityScore {
  urgency: number;  // 1-5 scale
  importance: number;  // 1-5 scale
  impact: number;  // 1-5 scale
  finalScore: number;  // Weighted average
  category: 'critical' | 'important' | 'moderate' | 'low';
}

interface PriorityRecommendation {
  score: PriorityScore;
  reasoning: string;
  suggestedActions: string[];
  alternativeSlots?: {
    startTime: Date;
    endTime: Date;
    confidence: number;
  }[];
  impactAnalysis: {
    positiveOutcomes: string[];
    risksToMitigate: string[];
  };
}

export async function analyzeMeetingPriority(
  meeting: Meeting,
  participants: Agent[],
  relatedTasks: Task[]
): Promise<PriorityRecommendation> {
  try {
    if (!openai) {
      return {
        score: { urgency: 2, importance: 2, impact: 2, finalScore: 2, category: "moderate" },
        reasoning: "AI is not configured; returning a default priority estimate.",
        suggestedActions: ["Configure OPENAI_API_KEY to enable AI prioritization."],
        impactAnalysis: { positiveOutcomes: [], risksToMitigate: [] },
      };
    }

    // Prepare context for GPT analysis
    const context = {
      meetingDetails: {
        title: meeting.title,
        description: meeting.description,
        duration: meeting.duration,
        type: meeting.type,
        startTime: meeting.startTime,
      },
      participants: participants.map(p => ({
        role: p.role,
        capabilities: p.capabilities,
      })),
      relatedTasks: relatedTasks.map(t => ({
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
      })),
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an AI meeting prioritization expert. Analyze the meeting details and provide comprehensive 
          priority scoring and recommendations. Consider participant roles, related tasks, and business impact.
          Output should be in JSON format with detailed reasoning and actionable suggestions.`
        },
        {
          role: "user",
          content: `Analyze this meeting's priority and provide recommendations:
          ${JSON.stringify(context, null, 2)}`
        }
      ],
      response_format: { type: "json_object" },
    });

    if (!response.choices[0].message.content) {
      throw new Error("Empty response from OpenAI API");
    }

    const analysis = JSON.parse(response.choices[0].message.content);

    // Calculate final score (weighted average)
    const weightedScore = (
      (analysis.urgency * 0.4) +
      (analysis.importance * 0.4) +
      (analysis.impact * 0.2)
    );

    // Determine category based on final score
    let category: PriorityScore['category'] = 'low';
    if (weightedScore >= 4) category = 'critical';
    else if (weightedScore >= 3) category = 'important';
    else if (weightedScore >= 2) category = 'moderate';

    return {
      score: {
        urgency: analysis.urgency,
        importance: analysis.importance,
        impact: analysis.impact,
        finalScore: weightedScore,
        category,
      },
      reasoning: analysis.reasoning,
      suggestedActions: analysis.suggestedActions,
      alternativeSlots: analysis.alternativeSlots?.map((slot: any) => ({
        startTime: new Date(slot.startTime),
        endTime: new Date(slot.endTime),
        confidence: slot.confidence,
      })),
      impactAnalysis: {
        positiveOutcomes: analysis.impactAnalysis.positiveOutcomes,
        risksToMitigate: analysis.impactAnalysis.risksToMitigate,
      },
    };
  } catch (error) {
    console.error("Error analyzing meeting priority:", error);
    throw error;
  }
}

// Function to suggest optimal meeting slots based on priority and availability
export async function suggestOptimalSlots(
  meeting: Meeting,
  participants: Agent[],
  priority: PriorityScore,
  startDate: Date,
  endDate: Date
): Promise<Array<{ startTime: Date; endTime: Date; score: number }>> {
  try {
    // Get all participants' availability within the date range
    const availabilityPromises = participants.map(agent =>
      db.query.agentAvailability.findMany({
        where: and(
          eq(agentAvailability.agentId, agent.id),
          gte(agentAvailability.startTime, startDate),
          lte(agentAvailability.endTime, endDate)
        ),
        orderBy: [agentAvailability.startTime],
      })
    );

    const availabilities = await Promise.all(availabilityPromises);

    // Find common available slots
    const commonSlots = findCommonTimeSlots(availabilities, meeting.duration || 60);

    // Score each slot based on various factors
    const scoredSlots = commonSlots.map(slot => ({
      startTime: slot.startTime,
      endTime: slot.endTime,
      score: calculateSlotScore(slot, priority, participants),
    }));

    // Sort by score and return top slots
    return scoredSlots.sort((a, b) => b.score - a.score).slice(0, 5);
  } catch (error) {
    console.error("Error suggesting optimal slots:", error);
    throw error;
  }
}

function findCommonTimeSlots(
  availabilities: AgentAvailability[][],
  durationMinutes: number
): Array<{ startTime: Date; endTime: Date }> {
  // Implementation of finding common free time slots
  // This is a simplified version - in production, you'd want a more sophisticated algorithm
  const slots: Array<{ startTime: Date; endTime: Date }> = [];

  // Get the earliest start time and latest end time
  const startTimes = availabilities.flat().map(a => new Date(a.startTime).getTime());
  const endTimes = availabilities.flat().map(a => new Date(a.endTime).getTime());

  const earliestStart = new Date(Math.max(...startTimes));
  const latestEnd = new Date(Math.min(...endTimes));

  // For demonstration, create 30-minute interval slots
  let currentTime = earliestStart;
  while (currentTime < latestEnd) {
    const slotEnd = new Date(currentTime.getTime() + durationMinutes * 60000);
    if (slotEnd <= latestEnd) {
      slots.push({
        startTime: new Date(currentTime),
        endTime: slotEnd,
      });
    }
    currentTime = new Date(currentTime.getTime() + 30 * 60000); // 30-minute intervals
  }

  return slots;
}

function calculateSlotScore(
  slot: { startTime: Date; endTime: Date },
  priority: PriorityScore,
  participants: Agent[]
): number {
  let score = 0;

  // Factor 1: Time of day (prefer working hours)
  const hour = slot.startTime.getHours();
  if (hour >= 9 && hour <= 17) score += 2;
  else if (hour >= 8 && hour <= 18) score += 1;

  // Factor 2: Priority impact
  score += priority.finalScore * 2;

  // Factor 3: Participant count
  score += Math.min(participants.length, 5);

  return score;
}
