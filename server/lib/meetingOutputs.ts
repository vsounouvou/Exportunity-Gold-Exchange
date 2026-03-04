import { db } from "@db";
import { meetingDecisions, meetingParticipants, meetings, messages, tasks } from "@db/schema";
import { and, asc, eq } from "drizzle-orm";
import { generateAndStoreSummary, type MeetingSummary } from "./meetingSummary";

function formatSummaryMarkdown(summary: MeetingSummary) {
  const lines: string[] = [];
  lines.push("## Summary");
  lines.push("");
  lines.push(String(summary.summary || "").trim() || "-");
  lines.push("");

  if (Array.isArray(summary.keyPoints) && summary.keyPoints.length) {
    lines.push("## Key Points");
    lines.push("");
    for (const point of summary.keyPoints) lines.push(`- ${String(point || "").trim()}`.trim());
    lines.push("");
  }

  if (Array.isArray(summary.decisions) && summary.decisions.length) {
    lines.push("## Decisions");
    lines.push("");
    for (const decision of summary.decisions) lines.push(`- ${String(decision || "").trim()}`.trim());
    lines.push("");
  }

  if (Array.isArray(summary.actionItems) && summary.actionItems.length) {
    lines.push("## Tasks");
    lines.push("");
    for (const item of summary.actionItems) lines.push(`- ${String(item || "").trim()}`.trim());
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

async function resolveNoteTakerAgentId(input: { meetingId: number; tenantId: number | null; fallbackAgentId?: number | null }) {
  const participants = await db.query.meetingParticipants.findMany({
    where: and(eq(meetingParticipants.meetingId, input.meetingId), eq(meetingParticipants.participantType, "agent" as any)),
    orderBy: [asc(meetingParticipants.createdAt)],
  });

  const noteTaker = participants.find((p: any) => String(p.role || "").toLowerCase() === "note_taker" && p.agentId);
  if (noteTaker?.agentId) return Number(noteTaker.agentId);

  const anyAgent = participants.find((p: any) => p.agentId);
  if (anyAgent?.agentId) return Number(anyAgent.agentId);

  if (input.fallbackAgentId && Number.isFinite(Number(input.fallbackAgentId))) return Number(input.fallbackAgentId);
  return null;
}

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x || "").trim()).filter(Boolean);
}

export async function generateAndStoreMeetingOutputs(input: {
  meetingId: number;
  tenantId: number | null;
  createdBy?: string | null;
  replace?: boolean;
}) {
  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, input.meetingId) });
  if (!meeting) throw new Error("Meeting not found");

  const convo = String(meeting.conversationId || "").trim();
  if (!convo) throw new Error("Meeting conversation missing");

  const messagesList = await db.query.messages.findMany({
    where: eq(messages.conversationId, convo),
    orderBy: [messages.createdAt],
    with: {
      fromAgent: true,
      toAgent: true,
    },
  });

  const summary = await generateAndStoreSummary(meeting as any, messagesList as any);
  const summaryMd = formatSummaryMarkdown(summary);

  await db
    .update(meetings)
    .set({
      summaryMd,
      updatedAt: new Date(),
    } as any)
    .where(eq(meetings.id, meeting.id));

  const decisions = normalizeList(summary.decisions);
  const actionItems = normalizeList(summary.actionItems);

  if (input.replace) {
    await db.delete(meetingDecisions).where(eq(meetingDecisions.meetingId, meeting.id));
    await db
      .delete(tasks)
      .where(and(eq(tasks.sourceMeetingId, meeting.id), eq(tasks.executionType, "meeting_output" as any)));
  }

  const insertedDecisions =
    decisions.length > 0
      ? await db
          .insert(meetingDecisions)
          .values(
            decisions.map((text) => ({
              tenantId: input.tenantId,
              meetingId: meeting.id,
              decisionText: text,
              ownerType: "none",
              createdBy: input.createdBy ?? null,
              createdAt: new Date(),
            })) as any,
          )
          .returning()
      : [];

  const noteTakerAgentId = await resolveNoteTakerAgentId({
    meetingId: meeting.id,
    tenantId: input.tenantId,
    fallbackAgentId: meeting.organizerId ?? null,
  });

  const insertedTasks =
    actionItems.length > 0
      ? await db
          .insert(tasks)
          .values(
            actionItems.map((item) => ({
              agentId: noteTakerAgentId,
              companyId: meeting.companyId ?? null,
              title: item.slice(0, 120) || "Meeting task",
              description: `From meeting: ${meeting.title}\nMeeting ID: ${meeting.id}\n\n${item}`.trim(),
              priority: "medium",
              status: "backlog",
              executionType: "meeting_output",
              sourceMeetingId: meeting.id,
              dueDate: null,
              updatedAt: new Date(),
            })) as any,
          )
          .returning()
      : [];

  return {
    meetingId: meeting.id,
    summary,
    summaryMd,
    decisions: insertedDecisions,
    tasks: insertedTasks,
  };
}
