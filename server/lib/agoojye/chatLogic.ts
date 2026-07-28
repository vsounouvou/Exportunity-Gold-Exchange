export type AgoojiyePresence = "online" | "busy" | "away" | "offline";

const inactiveStatuses = new Set([
  "ancien membre",
  "archived",
  "disabled",
  "inactive",
  "suspended",
]);

export function normalizeAgoojiyeMemberStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "active";
  if (inactiveStatuses.has(normalized)) return normalized;
  if (["actif", "active", "invited", "invite", "invité"].includes(normalized)) {
    return normalized.startsWith("inv") ? "invited" : "active";
  }
  return normalized;
}

export function isActiveAgoojiyeMember(value: unknown) {
  return !inactiveStatuses.has(normalizeAgoojiyeMemberStatus(value));
}

export function normalizeAgoojiyePresence(value: unknown): AgoojiyePresence {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "busy" || normalized === "occupé" || normalized === "occupe") return "busy";
  if (normalized === "away" || normalized === "absent") return "away";
  if (normalized === "online" || normalized === "en ligne") return "online";
  return "offline";
}

export function directConversationSlug(leftUserId: number, rightUserId: number) {
  return `dm-${[leftUserId, rightUserId].map(Number).sort((left, right) => left - right).join("-")}`;
}

export function resolveThreadRoot(input: {
  replyToMessageId?: number | null;
  replyThreadRootMessageId?: number | null;
}) {
  if (!input.replyToMessageId) return null;
  return Number(input.replyThreadRootMessageId || input.replyToMessageId);
}

export function extractAgoojiyeMentions(body: string) {
  const values = String(body || "").match(/(^|\s)@([\p{L}\p{N}._-]{2,80})/gu) || [];
  return [...new Set(values.map((value) => value.trim().slice(1).toLocaleLowerCase("fr")))];
}

export function isAgoojiyeAssistantMentioned(body: string) {
  return /(^|\s)@agoojiye(?:\s|$|[.,!?;:])/iu.test(String(body || ""));
}

export function messageCanBeEdited(input: {
  senderUserId?: number | null;
  currentUserId: number;
  createdAt: Date | string;
  deletedAt?: Date | string | null;
  isAdmin?: boolean;
  editWindowMinutes?: number;
}) {
  if (input.deletedAt) return false;
  if (input.isAdmin) return true;
  if (Number(input.senderUserId || 0) !== Number(input.currentUserId)) return false;
  const createdAt = new Date(input.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt <= Math.max(1, input.editWindowMinutes || 30) * 60_000;
}

export function attachmentKind(mimeType: string) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "voice";
  if (mime.startsWith("video/")) return "video";
  return "document";
}
