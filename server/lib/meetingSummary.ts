import { openai } from "./openai";
import type { Message, Meeting } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";
import { meetings } from "@db/schema";

export interface MeetingSummary {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  decisions: string[];
  participantContributions: {
    [agentId: number]: {
      contribution: string;
      engagementLevel: number;
    };
  };
  duration: number; // in minutes
  sentiment: number; // -1 to 1
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in (item as any)) return String((item as any).text || "");
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  if (typeof content === "object") {
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  return String(content);
}

function parseBulletSection(raw: string): string[] {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-"))
    .map((line) => line.replace(/^-+\s*/, "").trim())
    .filter(Boolean);
}

function buildFallbackMeetingSummary(meeting: Meeting, messages: Message[]): MeetingSummary {
  const messageTexts = messages
    .map((message) => contentToText((message as any)?.content).trim())
    .filter(Boolean);

  const keyPoints = messageTexts.slice(0, 5);

  const actionItems = messageTexts
    .filter((line) => /\b(action|todo|task|follow[-\s]?up|next step|will)\b/i.test(line))
    .slice(0, 8);

  const decisions = messageTexts
    .filter((line) => /\b(decide|decision|approved|agreed|confirmed)\b/i.test(line))
    .slice(0, 8);

  const duration =
    meeting.duration ||
    (meeting.endTime && meeting.startTime
      ? Math.max(
          0,
          Math.round((new Date(meeting.endTime).getTime() - new Date(meeting.startTime).getTime()) / 60000),
        )
      : 0);

  const avgSentiment = messages.length
    ? messages.reduce((sum, msg) => sum + Number((msg.metadata as any)?.sentiment ?? 0), 0) / messages.length
    : 0;

  const summary =
    keyPoints.length > 0
      ? `Fallback summary for "${meeting.title}": ${keyPoints.slice(0, 3).join(" | ")}`
      : `Fallback summary for "${meeting.title}": meeting ended with ${messages.length} captured message(s).`;

  return {
    summary,
    keyPoints,
    actionItems,
    decisions,
    participantContributions: {},
    duration,
    sentiment: avgSentiment,
  };
}

export async function generateMeetingSummary(
  meeting: Meeting,
  messages: Message[]
): Promise<MeetingSummary> {
  try {
    const hasMessageContent = messages.some((msg) => contentToText((msg as any)?.content).trim().length > 0);
    if (!hasMessageContent || String(process.env.MEETING_SUMMARY_DISABLE_AI || "").trim() === "1") {
      return buildFallbackMeetingSummary(meeting, messages);
    }

    const messageContext = messages
      .map(msg => `${msg.fromAgentId} -> ${msg.toAgentId}: ${contentToText(msg.content)}`)
      .join("\n");

    const systemPrompt = `Analyze this business meeting conversation and provide a comprehensive summary in the following format:

[Summary]
{high-level meeting summary}

[Key Points]
- {key point 1}
- {key point 2}
...

[Action Items]
- {action item 1}
- {action item 2}
...

[Decisions Made]
- {decision 1}
- {decision 2}
...

[Participant Analysis]
{participant_id}: {contribution summary}, {engagement_level 0-1}

Consider:
- Main topics discussed
- Decisions reached
- Action items assigned
- Level of participation
- Overall meeting effectiveness`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageContext }
      ],
      temperature: 0.7,
    }, {
      timeout: 20_000,
    });

    const content = response.choices[0].message.content || "";
    const sections: string[] = content.split("\n\n");

    // Parse the formatted response
    const summary = String(sections[0] || "").replace("[Summary]\n", "").trim();

    const keyPoints = parseBulletSection(String(sections[1] || "").replace("[Key Points]\n", ""));

    const actionItems = parseBulletSection(String(sections[2] || "").replace("[Action Items]\n", ""));

    const decisions = parseBulletSection(String(sections[3] || "").replace("[Decisions Made]\n", ""));

    const participantAnalysis = String(sections[4] || "")
      .replace("[Participant Analysis]\n", "")
      .split("\n")
      .reduce((acc: { [key: string]: any }, line: string) => {
        const [agentId, analysis] = line.split(": ");
        if (!analysis) return acc;

        const [contribution, engagementStr] = analysis.split(", ");
        const engagement = parseFloat(engagementStr) || 0.5;

        acc[agentId] = {
          contribution,
          engagementLevel: engagement
        };

        return acc;
      }, {});

    // Calculate meeting duration in minutes
    const duration = meeting.duration || 
      (meeting.endTime && meeting.startTime 
        ? Math.round((new Date(meeting.endTime).getTime() - new Date(meeting.startTime).getTime()) / 60000)
        : 0);

    // Calculate overall sentiment
    const avgSentiment = messages.length
      ? messages.reduce((sum, msg) => sum + Number((msg.metadata as any)?.sentiment ?? 0), 0) / messages.length
      : 0;

    return {
      summary: summary || `Meeting summary for "${meeting.title}"`,
      keyPoints,
      actionItems,
      decisions,
      participantContributions: participantAnalysis,
      duration,
      sentiment: avgSentiment,
    };
  } catch (error) {
    console.error("Error generating meeting summary, using fallback:", error);
    return buildFallbackMeetingSummary(meeting, messages);
  }
}

export async function storeMeetingSummary(
  meetingId: number,
  summary: MeetingSummary
): Promise<void> {
  try {
    const existing = await db.query.meetings.findFirst({
      where: eq(meetings.id, meetingId),
    });

    await db.update(meetings).set({
      metadata: {
        ...(existing?.metadata ?? {}),
        summary: JSON.stringify(summary),
        lastUpdated: new Date().toISOString(),
      },
      updatedAt: new Date(),
    }).where(eq(meetings.id, meetingId));
  } catch (error) {
    console.error("Error storing meeting summary:", error);
    throw error;
  }
}

export async function generateAndStoreSummary(
  meeting: Meeting,
  messages: Message[]
): Promise<MeetingSummary> {
  const summary = await generateMeetingSummary(meeting, messages);
  await storeMeetingSummary(meeting.id, summary);
  return summary;
}
