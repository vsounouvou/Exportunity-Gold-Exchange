import { db } from "@db";
import { meetParticipants, meetSessionEvents, meetSessions, messages } from "@db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getOpenAIClient } from "../openai";
import { addMeetArtifact, recordMeetEvent } from "./service";

type GenerateSummaryInput = {
  tenantId: number;
  meetingId: string;
  requestedByUserId?: number | null;
  trigger: "auto_end" | "manual" | "action_request";
};

type SummaryResult = {
  transcriptText: string;
  summaryText: string;
  summaryBullets: string[];
  actionItems: Array<{ owner: string; task: string; dueDate?: string | null }>;
  decisions: string[];
  risks: string[];
  draftEmail: { subject: string; body: string };
};

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackSummary(input: { transcriptText: string; participants: Array<{ displayName: string | null }> }): SummaryResult {
  const lines = input.transcriptText
    .split(/\r?\n/g)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .slice(0, 200);
  const participantNames = input.participants
    .map((p) => cleanText(p.displayName || ""))
    .filter(Boolean)
    .slice(0, 10);
  const bullets = [
    "Meeting transcript captured for review.",
    `Participants: ${participantNames.join(", ") || "N/A"}.`,
    lines.length > 0 ? `Discussed ${Math.min(lines.length, 20)} key message lines.` : "No transcript lines were captured.",
  ];
  const summaryText = lines.length
    ? `This meeting covered operational updates and next steps. A detailed review should confirm owners and deadlines for each commitment.`
    : "No live transcript lines were captured. Ask participants to provide notes before closing action items.";
  const actionItems = lines.slice(0, 3).map((line, idx) => ({
    owner: participantNames[idx % (participantNames.length || 1)] || "Unassigned",
    task: line.length > 140 ? `${line.slice(0, 137)}...` : line,
    dueDate: null,
  }));
  const decisions = [] as string[];
  const risks = lines.length === 0 ? ["Missing transcript content can reduce summary quality."] : [];
  const draftEmail = {
    subject: "Meeting recap and next steps",
    body: `${summaryText}\n\nKey points:\n${bullets.map((b) => `- ${b}`).join("\n")}\n\nAction items:\n${actionItems.map((a) => `- ${a.owner}: ${a.task}`).join("\n") || "- None yet"}`,
  };
  return {
    transcriptText: input.transcriptText,
    summaryText,
    summaryBullets: bullets,
    actionItems,
    decisions,
    risks,
    draftEmail,
  };
}

function parseModelJson(text: string): any {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(fenced);
  } catch {
    return null;
  }
}

async function summarizeWithModel(input: {
  transcriptText: string;
  participants: Array<{ displayName: string | null; role: string | null }>;
  title: string;
}) {
  const client = getOpenAIClient();
  const participantText = input.participants.map((p) => `${cleanText(p.displayName || "Unknown")} (${cleanText(p.role || "attendee")})`).join(", ");

  const completion = await client.chat.completions.create({
    model: process.env.MEET_SUMMARY_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You summarize business meetings. Return strict JSON only: {summaryText,summaryBullets[],actionItems[{owner,task,dueDate}],decisions[],risks[],draftEmail:{subject,body}}",
      },
      {
        role: "user",
        content: `Meeting title: ${input.title}\nParticipants: ${participantText}\n\nTranscript:\n${input.transcriptText.slice(
          0,
          12000,
        )}\n\nGenerate concise executive output.`,
      },
    ],
  });
  const parsed = parseModelJson(String(completion.choices?.[0]?.message?.content || ""));
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
}

async function collectTranscriptText(input: { tenantId: number; meetingId: string }) {
  const rows = await db.query.meetSessionEvents.findMany({
    where: and(eq(meetSessionEvents.tenantId, input.tenantId), eq(meetSessionEvents.meetingId, input.meetingId)),
    orderBy: [asc(meetSessionEvents.createdAt)],
  });

  const lines: string[] = [];
  for (const row of rows) {
    if (row.eventType !== "chat_message") continue;
    const payload = (row.payload || {}) as Record<string, unknown>;
    const author = cleanText(payload.author || payload.displayName || payload.sender || "Participant");
    const text = cleanText(payload.text || payload.message || "");
    if (!text) continue;
    lines.push(`${author}: ${text}`);
  }
  return lines.join("\n");
}

async function postSummarySystemMessage(input: {
  tenantId: number;
  meetingId: string;
  conversationId: string | null;
  summaryText: string;
  summaryBullets: string[];
  actionItems: Array<{ owner: string; task: string; dueDate?: string | null }>;
  decisions: string[];
  risks: string[];
}) {
  if (!input.conversationId) return;
  const content = [
    `MEETING_RECAP (${input.meetingId})`,
    "",
    input.summaryText,
    "",
    "Key points:",
    ...input.summaryBullets.map((item) => `- ${item}`),
    "",
    "Action items:",
    ...(input.actionItems.length
      ? input.actionItems.map((item) => `- ${item.owner}: ${item.task}${item.dueDate ? ` (due ${item.dueDate})` : ""}`)
      : ["- None"]),
    "",
    "Decisions:",
    ...(input.decisions.length ? input.decisions.map((item) => `- ${item}`) : ["- None captured"]),
    "",
    "Risks:",
    ...(input.risks.length ? input.risks.map((item) => `- ${item}`) : ["- None highlighted"]),
  ].join("\n");

  await db.insert(messages).values({
    content,
    conversationId: input.conversationId,
    fromAgentId: null,
    toAgentId: null,
    type: "system",
    status: "sent",
    deliveredAt: new Date(),
    metadata: {
      kind: "meet.summary",
      meetingId: input.meetingId,
    },
    createdAt: new Date(),
  });
}

export async function generateMeetingSummary(input: GenerateSummaryInput) {
  const meeting = await db.query.meetSessions.findFirst({
    where: and(eq(meetSessions.id, input.meetingId), eq(meetSessions.tenantId, input.tenantId)),
  });
  if (!meeting) throw new Error("Meeting not found");

  const participants = await db.query.meetParticipants.findMany({
    where: and(eq(meetParticipants.tenantId, input.tenantId), eq(meetParticipants.meetingId, input.meetingId)),
    orderBy: [asc(meetParticipants.createdAt)],
  });
  const transcriptText = await collectTranscriptText({ tenantId: input.tenantId, meetingId: input.meetingId });
  let result = fallbackSummary({
    transcriptText,
    participants: participants.map((p) => ({ displayName: p.displayName || null })),
  });

  try {
    const model = await summarizeWithModel({
      transcriptText: transcriptText || "No transcript lines available.",
      participants: participants.map((p) => ({ displayName: p.displayName || null, role: p.role || null })),
      title: meeting.title,
    });
    if (model) {
      result = {
        transcriptText,
        summaryText: cleanText(model.summaryText) || result.summaryText,
        summaryBullets: Array.isArray(model.summaryBullets)
          ? model.summaryBullets.map((v: unknown) => cleanText(v)).filter(Boolean).slice(0, 8)
          : result.summaryBullets,
        actionItems: Array.isArray(model.actionItems)
          ? model.actionItems
              .map((v: any) => ({
                owner: cleanText(v?.owner || "Unassigned") || "Unassigned",
                task: cleanText(v?.task || ""),
                dueDate: cleanText(v?.dueDate || "") || null,
              }))
              .filter((v: any) => Boolean(v.task))
              .slice(0, 12)
          : result.actionItems,
        decisions: Array.isArray(model.decisions)
          ? model.decisions.map((v: unknown) => cleanText(v)).filter(Boolean).slice(0, 8)
          : result.decisions,
        risks: Array.isArray(model.risks) ? model.risks.map((v: unknown) => cleanText(v)).filter(Boolean).slice(0, 8) : result.risks,
        draftEmail: {
          subject: cleanText(model?.draftEmail?.subject) || result.draftEmail.subject,
          body: cleanText(model?.draftEmail?.body) || result.draftEmail.body,
        },
      };
    }
  } catch {
    // fallback already prepared
  }

  const transcriptArtifact = await addMeetArtifact({
    tenantId: input.tenantId,
    meetingId: input.meetingId,
    type: "transcript",
    storageUrl: null,
    metadata: {
      text: result.transcriptText,
      generatedBy: "meet.ai-worker",
      trigger: input.trigger,
    },
  });
  const summaryArtifact = await addMeetArtifact({
    tenantId: input.tenantId,
    meetingId: input.meetingId,
    type: "summary",
    storageUrl: null,
    metadata: {
      summaryText: result.summaryText,
      summaryBullets: result.summaryBullets,
      actionItems: result.actionItems,
      decisions: result.decisions,
      risks: result.risks,
      generatedBy: "meet.ai-worker",
      trigger: input.trigger,
    },
  });
  const emailDraftArtifact = await addMeetArtifact({
    tenantId: input.tenantId,
    meetingId: input.meetingId,
    type: "email_draft",
    storageUrl: null,
    metadata: {
      ...result.draftEmail,
      generatedBy: "meet.ai-worker",
      trigger: input.trigger,
    },
  });

  await recordMeetEvent({
    tenantId: input.tenantId,
    meetingId: input.meetingId,
    eventType: "summary_generated",
    payload: {
      trigger: input.trigger,
      requestedByUserId: input.requestedByUserId ?? null,
      summaryArtifactId: summaryArtifact.id,
    },
  });

  await postSummarySystemMessage({
    tenantId: input.tenantId,
    meetingId: input.meetingId,
    conversationId: meeting.conversationId || null,
    summaryText: result.summaryText,
    summaryBullets: result.summaryBullets,
    actionItems: result.actionItems,
    decisions: result.decisions,
    risks: result.risks,
  });

  return {
    transcriptArtifact,
    summaryArtifact,
    emailDraftArtifact,
    output: result,
  };
}

