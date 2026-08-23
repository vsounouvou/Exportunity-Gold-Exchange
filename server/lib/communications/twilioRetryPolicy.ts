function positiveInteger(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export function resolveTwilioSendMaxAttempts(
  override?: number,
  configuredValue: unknown = process.env.TWILIO_SEND_MAX_ATTEMPTS,
) {
  const configuredAttempts = positiveInteger(configuredValue, 3);
  return positiveInteger(override, configuredAttempts);
}
