export function externalCommunicationsEnabled(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

const EXTERNAL_COMMUNICATION_ACTIONS = new Set([
  "SEND_EMAIL",
  "SEND_SMS",
  "SEND_WHATSAPP",
  "SEND_MEETING_INVITE",
]);

export function isExternalCommunicationAction(actionType: unknown) {
  return EXTERNAL_COMMUNICATION_ACTIONS.has(
    String(actionType || "")
      .trim()
      .toUpperCase(),
  );
}
