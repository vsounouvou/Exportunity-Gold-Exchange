export const AGOOJIYE_JOB_TYPES = [
  "mail_sync",
  "webhook_processing",
  "attachment_processing",
  "scheduled_send",
  "follow_up",
  "bounce_processing",
  "complaint_processing",
  "reply_classification",
  "pipeline_summary",
  "overdue_task_notifications",
  "mailbox_health",
] as const;

export type AgoojiyeJobType = (typeof AGOOJIYE_JOB_TYPES)[number];

export function isAgoojiyeJobType(value: unknown): value is AgoojiyeJobType {
  return AGOOJIYE_JOB_TYPES.includes(String(value ?? "").trim() as AgoojiyeJobType);
}

export function classifyAgoojiyeReply(value: unknown) {
  const body = String(value ?? "").toLowerCase();
  const has = (...terms: string[]) => terms.some((term) => body.includes(term));
  if (has("desabonn", "désabonn", "unsubscribe", "ne me contactez plus", "stop email")) {
    return { classification: "opt_out", confidence: 100, requiresHumanReview: false };
  }
  if (has("undeliver", "mailbox unavailable", "user unknown", "adresse introuvable", "delivery failed")) {
    return { classification: "bounce", confidence: 95, requiresHumanReview: true };
  }
  if (has("rendez-vous", "meeting", "calendrier", "disponible", "appel", "call")) {
    return { classification: "meeting_interest", confidence: 80, requiresHumanReview: true };
  }
  if (has("interesse", "intéressé", "interessant", "intéressant", "proposition", "partenariat", "sponsor")) {
    return { classification: "positive_interest", confidence: 75, requiresHumanReview: true };
  }
  if (has("pas interesse", "pas intéressé", "declin", "déclin", "refus", "non merci")) {
    return { classification: "negative", confidence: 80, requiresHumanReview: true };
  }
  return { classification: "needs_review", confidence: 35, requiresHumanReview: true };
}

export function nextAgoojiyeRetry(attemptCount: number, now = new Date()) {
  const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
  return new Date(now.getTime() + delayMinutes * 60_000);
}
