import crypto from "crypto";

export type PlatformSignatureInput = {
  tenantId: number;
  agentKey: string;
  to: string[];
  subject: string;
  sentAtIso: string;
};

function requireSignatureSecret() {
  const candidates = [
    String(process.env.MAIL_PLATFORM_SIGNATURE_SECRET || "").trim(),
    String(process.env.MAIL_SIGNATURE_SECRET || "").trim(),
    String(process.env.SESSION_SECRET || "").trim(),
  ].filter(Boolean);
  if (candidates.length > 0) {
    return candidates[0];
  }
  return "mail-platform-signature-dev-secret";
}

export function signPlatformHeaders(input: PlatformSignatureInput) {
  const secret = requireSignatureSecret();
  const canonical = [
    String(input.tenantId),
    String(input.agentKey || "").trim().toLowerCase(),
    input.to.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean).join(","),
    String(input.subject || "").trim(),
    String(input.sentAtIso || "").trim(),
  ].join("|");

  const signature = crypto.createHmac("sha256", secret).update(canonical).digest("hex");

  return {
    "X-Tenant-ID": String(input.tenantId),
    "X-Agent-ID": String(input.agentKey || ""),
    "X-Platform-Signature": signature,
    "X-Platform-Signature-At": String(input.sentAtIso || ""),
  } as const;
}
