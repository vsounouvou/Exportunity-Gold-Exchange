import type { GatewayMessage } from "./types";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\w)(?:\+?\d[\d()\s-]{7,}\d)(?!\w)/g;
const CARDISH_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const SECRET_TOKEN_PATTERN = /\b(?:sk|rk|pk|api|token)_[A-Za-z0-9_-]{8,}\b/g;

export function redactTextPII(input: string): string {
  const text = String(input || "");
  if (!text) return text;
  return text
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(PHONE_PATTERN, "[REDACTED_PHONE]")
    .replace(CARDISH_PATTERN, "[REDACTED_NUMBER]")
    .replace(SECRET_TOKEN_PATTERN, "[REDACTED_SECRET]");
}

export function redactMessages(messages: GatewayMessage[]): GatewayMessage[] {
  return (Array.isArray(messages) ? messages : []).map((message) => ({
    ...message,
    content: redactTextPII(String(message.content || "")),
  }));
}
