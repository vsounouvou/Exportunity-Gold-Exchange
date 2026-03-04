import { db } from "@db";
import { meetings, meetingParticipants, type MeetingParticipant } from "@db/schema";
import { eq, and, gte, lte, count } from "drizzle-orm";
import type { Meeting } from "@db/schema";

interface DensityScore {
  timestamp: string;
  score: number;  // 0-1 scale
  meetingCount: number;
  totalDuration: number;
  participantCount: number;
}

interface HeatmapData {
  densityScores: DensityScore[];
  insights: {
    peakHours: string[];
    quietHours: string[];
    recommendations: string[];
  };
  statistics: {
    averageDailyMeetings: number;
    averageDuration: number;
    participantDistribution: Record<string, number>;
  };
}

export async function calculateMeetingDensity(
  startDate: Date,
  endDate: Date,
  organizerId?: number
): Promise<HeatmapData> {
  try {
    // Get all meetings in the date range
    const meetingsData = await db.query.meetings.findMany({
      where: and(
        gte(meetings.startTime, startDate),
        lte(meetings.startTime, endDate),
        organizerId ? eq(meetings.organizerId, organizerId) : undefined
      ),
      with: {
        participants: true,
      },
    });

    // Initialize data structure for hourly slots
    const hourlyDensity: Record<string, {
      meetings: Meeting[];
      participants: Set<number>;
    }> = {};

    // Process meetings into hourly slots
    meetingsData.forEach(meeting => {
      const startHour = new Date(meeting.startTime);
      startHour.setMinutes(0, 0, 0);
      const key = startHour.toISOString();

      if (!hourlyDensity[key]) {
        hourlyDensity[key] = {
          meetings: [],
          participants: new Set(),
        };
      }

      hourlyDensity[key].meetings.push(meeting);
      if (meeting.participants) {
        meeting.participants.forEach((p: MeetingParticipant) => 
          p.agentId != null ? hourlyDensity[key].participants.add(p.agentId) : null
        );
      }
    });

    // Calculate density scores
    const densityScores: DensityScore[] = Object.entries(hourlyDensity)
      .map(([timestamp, data]) => {
        const totalDuration = data.meetings.reduce(
          (sum, m) => sum + (m.duration || 0),
          0
        );

        // Normalize score based on multiple factors
        const durationScore = Math.min(totalDuration / 60, 1); // Cap at 1 hour
        const participantScore = Math.min(
          data.participants.size / 10,
          1
        ); // Cap at 10 participants
        const meetingScore = Math.min(
          data.meetings.length / 3,
          1
        ); // Cap at 3 meetings

        const score = (durationScore + participantScore + meetingScore) / 3;

        return {
          timestamp,
          score,
          meetingCount: data.meetings.length,
          totalDuration,
          participantCount: data.participants.size,
        };
      })
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    // Generate insights
    const sortedByScore = [...densityScores].sort((a, b) => b.score - a.score);
    const peakHours = sortedByScore
      .slice(0, 3)
      .map(d => new Date(d.timestamp).toLocaleTimeString());
    const quietHours = sortedByScore
      .slice(-3)
      .map(d => new Date(d.timestamp).toLocaleTimeString());

    // Calculate statistics
    const totalMeetings = meetingsData.length;
    const daySpan = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const averageDailyMeetings = totalMeetings / daySpan;
    const averageDuration =
      meetingsData.reduce((sum, m) => sum + (m.duration || 0), 0) / totalMeetings;

    // Generate recommendations based on patterns
    const recommendations = [];
    if (averageDailyMeetings > 5) {
      recommendations.push(
        "Consider consolidating some meetings to reduce meeting fatigue"
      );
    }
    if (sortedByScore[0]?.score > 0.8) {
      recommendations.push(
        "High meeting density detected - consider spreading meetings more evenly"
      );
    }
    if (quietHours.length > 0) {
      recommendations.push(
        `Consider utilizing quieter time slots around ${quietHours[0]} for focused work`
      );
    }

    // Calculate participant distribution
    const participantDistribution: Record<string, number> = {};
    meetingsData.forEach(meeting => {
      const size = meeting.participants?.length || 0;
      const key = size <= 3 ? "small" : size <= 8 ? "medium" : "large";
      participantDistribution[key] = (participantDistribution[key] || 0) + 1;
    });

    return {
      densityScores,
      insights: {
        peakHours,
        quietHours,
        recommendations,
      },
      statistics: {
        averageDailyMeetings,
        averageDuration,
        participantDistribution,
      },
    };
  } catch (error) {
    console.error("Error calculating meeting density:", error);
    throw error;
  }
}
