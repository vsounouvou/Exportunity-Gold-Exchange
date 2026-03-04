import nodemailer from "nodemailer";

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function parseCsv(value: unknown): string[] {
  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function createSmtpTransport() {
  const useSendmail = truthyEnv(process.env.MAIL_SMTP_SENDMAIL);
  if (useSendmail) {
    const sendmailPath = String(process.env.MAIL_SMTP_SENDMAIL_PATH || "").trim() || undefined;
    return nodemailer.createTransport({
      sendmail: true,
      newline: "unix",
      path: sendmailPath,
    });
  }

  const host = String(process.env.MAIL_SMTP_HOST || "").trim();
  const port = Number(process.env.MAIL_SMTP_PORT || 587);
  const user = String(process.env.MAIL_SMTP_USER || "").trim();
  const pass = String(process.env.MAIL_SMTP_PASS || "").trim();
  const secure = String(process.env.MAIL_SMTP_SECURE || "").trim() === "true";
  const rejectUnauthorized = String(process.env.MAIL_SMTP_TLS_REJECT_UNAUTHORIZED || "").trim() !== "false";

  const allowNoAuth = truthyEnv(process.env.MAIL_SMTP_ALLOW_NO_AUTH);
  if (!host) throw new Error("SMTP not configured (MAIL_SMTP_HOST missing)");
  if (!allowNoAuth && !(user && pass)) {
    throw new Error("SMTP not configured (set MAIL_SMTP_USER/MAIL_SMTP_PASS or MAIL_SMTP_SENDMAIL=true)");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    tls: { rejectUnauthorized },
  });
}

export function getContactNotificationConfig() {
  const to = parseCsv(process.env.CONTACT_NOTIFY_TO);
  const from =
    String(process.env.CONTACT_NOTIFY_FROM || "").trim() ||
    String(process.env.MAIL_FROM_DEFAULT || "").trim() ||
    String(process.env.MAIL_SMTP_USER || "").trim() ||
    null;

  return {
    enabled: to.length > 0 && !!from,
    to,
    from,
    subjectPrefix: String(process.env.CONTACT_NOTIFY_SUBJECT_PREFIX || "[Contact]").trim() || "[Contact]",
  };
}

export async function sendContactNotification(input: {
  to: string[];
  from: string;
  subject: string;
  text: string;
}) {
  const transport = createSmtpTransport();
  const info = await transport.sendMail({
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
  return { messageId: info?.messageId ? String(info.messageId) : null };
}

