import { db } from "@db";
import { meetings, meetingParticipants, type Meeting } from "@db/schema";
import { eq, and, lte, gte, desc } from "drizzle-orm";

interface MeetingContext {
  title: string;
  description?: string;
  participantIds: number[];
  type: string;
  startTime: Date;
}

interface DurationPrediction {
  suggestedDuration: number;  // in minutes
  confidence: number;         // 0-1 scale
  reasoning: string[];
  similarMeetings: Meeting[];
}

export async function predictMeetingDuration(context: MeetingContext): Promise<DurationPrediction> {
  try {
    const meetingType =
      context.type === "scheduled" || context.type === "spontaneous" ? context.type : "scheduled";

    // Get historical meetings from the last 90 days
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);

    // Fetch completed meetings with similar characteristics
    const historicalMeetings = await db.query.meetings.findMany({
      where: and(
        eq(meetings.type, meetingType),
        gte(meetings.startTime, threeMonthsAgo),
        eq(meetings.status, "completed"),
      ),
      with: {
        participants: true,
      },
      orderBy: [desc(meetings.startTime)],
    });

    // Calculate similarity scores for each historical meeting
    const scoredMeetings = historicalMeetings.map(meeting => {
      let score = 0;
      
      // Title similarity (basic word matching)
      const titleWords = new Set(context.title.toLowerCase().split(/\s+/));
      const historicalTitleWords = new Set(meeting.title.toLowerCase().split(/\s+/));
      const commonWords = [...titleWords].filter(word => historicalTitleWords.has(word));
      score += (commonWords.length / Math.max(titleWords.size, historicalTitleWords.size)) * 0.3;

      // Participant overlap
      const historicalParticipantIds = new Set(meeting.participants.map(p => p.agentId));
      const participantOverlap = context.participantIds.filter(id => 
        historicalParticipantIds.has(id)
      ).length;
      score += (participantOverlap / Math.max(context.participantIds.length, historicalParticipantIds.size)) * 0.4;

      // Time of day similarity
      const hourDiff = Math.abs(
        new Date(context.startTime).getHours() - 
        new Date(meeting.startTime).getHours()
      );
      score += (1 - hourDiff / 24) * 0.3;

      return {
        meeting,
        score,
      };
    });

    // Sort by similarity score
    scoredMeetings.sort((a, b) => b.score - a.score);

    // Get top similar meetings
    const topSimilarMeetings = scoredMeetings.slice(0, 5);

    // Calculate suggested duration
    const durations = topSimilarMeetings.map(({ meeting }) => meeting.duration || 0);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length || 60;

    // Round to nearest 15 minutes
    const suggestedDuration = Math.round(avgDuration / 15) * 15;

    // Calculate confidence based on similarity scores
    const avgSimilarity = topSimilarMeetings.reduce((sum, m) => sum + m.score, 0) / 
      topSimilarMeetings.length;

    // Generate reasoning
    const reasoning = [];
    if (durations.length > 0) {
      reasoning.push(`Based on ${durations.length} similar past meetings`);
      if (avgSimilarity > 0.7) {
        reasoning.push("High similarity with past meetings");
      }
      const timeRange = `${Math.min(...durations)}-${Math.max(...durations)} minutes`;
      reasoning.push(`Historical meeting durations ranged from ${timeRange}`);
    } else {
      reasoning.push("No similar meetings found, using default duration");
    }

    return {
      suggestedDuration,
      confidence: avgSimilarity,
      reasoning,
      similarMeetings: topSimilarMeetings.map(m => m.meeting),
    };
  } catch (error) {
    console.error("Error predicting meeting duration:", error);
    throw error;
  }
}
