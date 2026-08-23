export function externalCommunicationsEnabled(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

export function releasedOwnerOnlyTestBypassesGlobalGate(
  ownerTest: { authorized?: unknown; channelEnabled?: unknown } | null | undefined,
) {
  return ownerTest?.authorized === true && ownerTest.channelEnabled === true;
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
