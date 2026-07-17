export type AgoojiyeHumanMailboxProfile = {
  localPart: string;
  displayName: string;
  passwordEnv: string;
};

export const AGOOJIYE_HUMAN_MAILBOX_PROFILES: readonly AgoojiyeHumanMailboxProfile[] = [
  { localPart: "regis", displayName: "Regis", passwordEnv: "AGOOJIYE_MAILBOX_REGIS_PASSWORD" },
  { localPart: "marise", displayName: "Marise", passwordEnv: "AGOOJIYE_MAILBOX_MARISE_PASSWORD" },
  { localPart: "vital", displayName: "Vital", passwordEnv: "AGOOJIYE_MAILBOX_VITAL_PASSWORD" },
  { localPart: "surian", displayName: "Surian", passwordEnv: "AGOOJIYE_MAILBOX_SURIAN_PASSWORD" },
  { localPart: "binta", displayName: "Binta", passwordEnv: "AGOOJIYE_MAILBOX_BINTA_PASSWORD" },
] as const;

export const AGOOJIYE_MAIL_DOMAIN = "agoojiye.com";

export function agoojiyeMailboxAddress(localPart: string) {
  return `${String(localPart || "").trim().toLowerCase()}@${AGOOJIYE_MAIL_DOMAIN}`;
}

export function agoojiyeMaildirPath(localPart: string) {
  return `/var/mail/${AGOOJIYE_MAIL_DOMAIN}/${String(localPart || "").trim().toLowerCase()}`;
}

export function isAgoojiyeHumanMailboxAddress(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return AGOOJIYE_HUMAN_MAILBOX_PROFILES.some((profile) => agoojiyeMailboxAddress(profile.localPart) === email);
}

export function isExplicitOptOutMessage(value: unknown) {
  const text = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(unsubscribe|desabonne|desinscri|stop emailing|do not contact|ne me contactez plus)\b/.test(text);
}

export function extractHardBounceRecipient(value: unknown) {
  const text = String(value || "");
  const patterns = [
    /(?:final-recipient|original-recipient)\s*:\s*rfc822\s*;\s*([^\s<>;,]+@[^\s<>;,]+)/i,
    /(?:recipient address rejected|delivery to)\s*[:<]?\s*([^\s<>;,]+@[^\s<>;,]+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const email = String(match?.[1] || "").trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  }
  return null;
}

export function agoojiyeConversationKey(messageId: unknown, mailboxId: unknown, threadId: unknown) {
  const normalizedMessageId = String(messageId || "").trim().toLowerCase();
  return normalizedMessageId
    ? `rfc:${normalizedMessageId}`
    : `mail-engine:${Number(mailboxId) || 0}:${Number(threadId) || 0}`;
}

export function canUseExactMailboxSender(input: {
  tenantKey: unknown;
  email: unknown;
  senderAddressMode: unknown;
}) {
  return (
    String(input.tenantKey || "").trim().toLowerCase() === "agoojye" &&
    String(input.senderAddressMode || "").trim().toLowerCase() === "mailbox_exact" &&
    isAgoojiyeHumanMailboxAddress(input.email)
  );
}
