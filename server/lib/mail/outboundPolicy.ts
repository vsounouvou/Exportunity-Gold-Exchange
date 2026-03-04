export type SignatureProfile = {
  displayName: string;
  role: string;
  department?: string | null;
  companyName: string;
  emailAddress: string;
  website: string;
  phone?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
};

export type NormalizedRecipientResult = {
  recipients: string[];
  invalid: string[];
};

export type DeliveryEvaluation = {
  ok: boolean;
  accepted: string[];
  rejected: string[];
  pending: string[];
  missing: string[];
  response: string;
};

function uniq(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function looksMachineGeneratedAddress(email: string) {
  const localPart = String(email.split("@")[0] || "");
  if (!localPart) return true;
  if (/^\d{10,}\.[a-f0-9]{10,}$/i.test(localPart)) return true;
  if (/^[a-f0-9]{24,}$/i.test(localPart)) return true;
  return false;
}

export function normalizeAndValidateRecipients(input: unknown[]): NormalizedRecipientResult {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const raw of input) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    if (!EMAIL_RE.test(email) || looksMachineGeneratedAddress(email)) {
      invalid.push(email);
      continue;
    }
    valid.push(email);
  }

  return {
    recipients: uniq(valid),
    invalid: uniq(invalid),
  };
}

function normalizeSmtpList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return uniq(
    value
      .map((entry) => normalizeEmail(entry))
      .filter(Boolean),
  );
}

export function evaluateSmtpDelivery(requestedRecipients: string[], smtpInfo: unknown): DeliveryEvaluation {
  const payload = smtpInfo && typeof smtpInfo === "object" ? (smtpInfo as Record<string, unknown>) : {};
  const accepted = normalizeSmtpList(payload.accepted);
  const rejected = normalizeSmtpList(payload.rejected);
  const pending = normalizeSmtpList(payload.pending);
  const requested = uniq(requestedRecipients.map((entry) => normalizeEmail(entry)).filter(Boolean));
  const missing = requested.filter((entry) => !accepted.includes(entry));
  const response = String(payload.response || "").trim();
  const ok = rejected.length === 0 && pending.length === 0 && missing.length === 0 && accepted.length === requested.length;

  return { ok, accepted, rejected, pending, missing, response };
}

function extractNameFromRecipient(email: string) {
  const local = String(email.split("@")[0] || "").trim();
  if (!local) return "Team";
  const token = local
    .replace(/[._-]+/g, " ")
    .replace(/[^A-Za-z ]+/g, " ")
    .trim()
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
    .trim();
  return token || "Team";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeBodyText(value: string) {
  const lines = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^\s*(\{|\[).*(\}|\])\s*$/.test(line))
    .filter((line) => !/^\s*(trace(id)?|correlation(id)?|metadata|payload|debug|log)\s*:/i.test(line));

  const compact = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return compact;
}

function stripExistingSignature(value: string) {
  const normalized = String(value || "").replace(/\r\n/g, "\n").replace(/\u0000/g, "").trimEnd();
  if (!normalized) return "";

  const lines = normalized.split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() === "--") {
      return lines.slice(0, i).join("\n").trim();
    }
  }

  const signoffRe =
    /^(best regards|kind regards|regards|sincerely|thanks|thank you|cordially|respectfully|with appreciation|warm regards)[,!.]?$/i;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 14); i -= 1) {
    if (signoffRe.test(lines[i].trim())) {
      return lines.slice(0, i).join("\n").trim();
    }
  }

  const footerKeyRe = /^(email|web|website|phone)\s*:/i;
  const urlRe = /^https?:\/\//i;
  for (let i = Math.max(0, lines.length - 12); i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t) continue;
    if (footerKeyRe.test(t) || urlRe.test(t)) {
      return lines.slice(0, i).join("\n").trim();
    }
  }

  return lines.join("\n").trim();
}

function ensureGreeting(body: string, firstRecipient: string) {
  const trimmed = body.trim();
  if (/^dear\s+/i.test(trimmed)) return trimmed;
  const recipientName = extractNameFromRecipient(firstRecipient);
  return `Dear ${recipientName},\n\n${trimmed}`.trim();
}

function buildTextSignature(profile: SignatureProfile) {
  const titleLine = [profile.role, profile.department].filter(Boolean).join(" \u00b7 ").trim();
  return [
    "--",
    profile.displayName,
    titleLine || profile.role,
    profile.companyName,
    "",
    `Email: ${profile.emailAddress}`,
    `Web: ${profile.website}`,
    profile.phone ? `Phone: ${profile.phone}` : null,
    profile.address ? `Address: ${profile.address}` : null,
  ].join("\n");
}

function splitParagraphs(value: string) {
  return value
    .split(/\n{2,}/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function renderHtmlParagraphs(value: string) {
  return splitParagraphs(value)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function buildHtmlSignature(profile: SignatureProfile) {
  const titleLine = [profile.role, profile.department].filter(Boolean).join(" \u00b7 ").trim();
  const avatarUrl = typeof profile.avatarUrl === "string" && profile.avatarUrl.trim() ? profile.avatarUrl.trim() : null;
  const phone = typeof profile.phone === "string" && profile.phone.trim() ? profile.phone.trim() : null;
  const address = typeof profile.address === "string" && profile.address.trim() ? profile.address.trim() : null;

  return [
    `<div data-agent-signature=\"true\" style=\"margin-top:18px;padding-top:14px;border-top:1px solid #e5e7eb;color:#111827;font-family:Arial,Helvetica,sans-serif;\">`,
    `<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;\">`,
    `<tr>`,
    avatarUrl
      ? `<td style=\"padding-right:12px;vertical-align:top;\">` +
        `<img src=\"${escapeHtml(avatarUrl)}\" width=\"56\" height=\"56\" alt=\"${escapeHtml(profile.displayName)}\" style=\"display:block;border-radius:9999px;border:1px solid #e5e7eb;background:#f3f4f6;\" />` +
        `</td>`
      : ``,
    `<td style=\"vertical-align:top;\">`,
    `<div style=\"font-size:14px;line-height:1.25;font-weight:700;color:#111827;\">${escapeHtml(profile.displayName)}</div>`,
    `<div style=\"font-size:13px;line-height:1.35;color:#374151;margin-top:2px;\">${escapeHtml(titleLine || profile.role)}</div>`,
    `<div style=\"font-size:12px;line-height:1.35;color:#6b7280;margin-top:2px;\">${escapeHtml(profile.companyName)}</div>`,
    `<div style=\"font-size:12px;line-height:1.5;color:#111827;margin-top:10px;\">`,
    `<span>Email: <a href=\"mailto:${escapeHtml(profile.emailAddress)}\" style=\"color:#0ea5e9;text-decoration:none;\">${escapeHtml(profile.emailAddress)}</a></span>`,
    ` &nbsp;|&nbsp; `,
    `<span>Web: <a href=\"${escapeHtml(profile.website)}\" style=\"color:#0ea5e9;text-decoration:none;\">${escapeHtml(profile.website)}</a></span>`,
    phone ? ` &nbsp;|&nbsp; <span>Phone: <span style=\"color:#111827;\">${escapeHtml(phone)}</span></span>` : ``,
    `</div>`,
    address
      ? `<div style=\"font-size:11px;line-height:1.35;color:#6b7280;margin-top:6px;\">${escapeHtml(address)}</div>`
      : ``,
    `</td>`,
    `</tr>`,
    `</table>`,
    `</div>`,
  ].join("");
}

function normalizeSubject(subject: string) {
  const clean = String(subject || "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean) return clean;
  return "Introduction to Bourse de l'Or Platform";
}

export function buildProfessionalEmailContent(params: {
  to: string[];
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  signature: SignatureProfile;
}) {
  const recipients = normalizeAndValidateRecipients(params.to);
  if (!recipients.recipients.length) {
    throw new Error("At least one valid recipient email is required.");
  }
  if (recipients.invalid.length) {
    throw new Error(`Invalid recipient email(s): ${recipients.invalid.join(", ")}`);
  }

  const textCandidate =
    typeof params.textBody === "string" && params.textBody.trim()
      ? params.textBody
      : typeof params.htmlBody === "string"
        ? stripHtml(params.htmlBody)
        : "";

  const sanitized = sanitizeBodyText(textCandidate);
  if (!sanitized) {
    throw new Error("Email body is empty after removing system metadata. Provide professional message content.");
  }

  const withoutSignature = stripExistingSignature(sanitized);
  const withGreeting = ensureGreeting(withoutSignature, recipients.recipients[0]);
  const textSignature = buildTextSignature(params.signature);
  const finalTextBody = `${withGreeting}\n\n${textSignature}`.trim();

  const htmlBody = [
    `<div data-agent-email=\"true\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111827;\">`,
    renderHtmlParagraphs(withGreeting),
    buildHtmlSignature(params.signature),
    `</div>`,
  ].join("");

  return {
    recipients: recipients.recipients,
    subject: normalizeSubject(params.subject),
    textBody: finalTextBody,
    htmlBody,
  };
}

export function describeDeliveryFailure(outcome: DeliveryEvaluation) {
  const parts: string[] = [];
  if (outcome.rejected.length) parts.push(`rejected=${outcome.rejected.join(", ")}`);
  if (outcome.pending.length) parts.push(`pending=${outcome.pending.join(", ")}`);
  if (outcome.missing.length) parts.push(`missing_acceptance=${outcome.missing.join(", ")}`);
  if (outcome.response) parts.push(`smtp_response=${outcome.response}`);
  return parts.join(" | ") || "smtp_delivery_unconfirmed";
}
