const FORBIDDEN_SMTP_SECRET_FIELDS = [
  "smtpPassword",
  "smtpPasswordEncrypted",
  "smtp_password",
  "smtp_password_encrypted",
] as const;

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function hasForbiddenAgoojiyeSmtpSecret(input: unknown) {
  if (!input || typeof input !== "object") return false;
  const record = input as Record<string, unknown>;
  return FORBIDDEN_SMTP_SECRET_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(record, field) && text(record[field]));
}

export function sanitizeAgoojiyeEmailSettingsRow<T extends Record<string, unknown>>(row: T) {
  const { smtpPasswordEncrypted: _legacySecret, ...safe } = row;
  return {
    ...safe,
    credentialsMode: "environment",
  };
}

