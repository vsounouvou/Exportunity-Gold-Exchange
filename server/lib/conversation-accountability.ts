const ACTION_LINE_PATTERN = /^(?:[-*]\s*)?(?:action item|task|follow[- ]?up|next step|todo)\s*[:\-]\s*/i;
const STRUCTURED_LINE_PATTERN = /^(?:[-*]\s*)?(?:decision|decided|approved|resolved)\s*[:\-]\s*/i;

function cleanLine(value: string) {
  return String(value || "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildConversationAccountabilityTask(input: {
  conversationId: string;
  titleSource: string;
  description: string;
}) {
  const conversationId = String(input.conversationId || "").trim();
  const lines = String(input.titleSource || "")
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);
  const actionLine = lines.find((line) => ACTION_LINE_PATTERN.test(line));
  const firstNonDecisionLine = lines.find((line) => !STRUCTURED_LINE_PATTERN.test(line));
  const titleSeed = cleanLine(
    String(actionLine || firstNonDecisionLine || lines[0] || "Conversation follow-up")
      .replace(ACTION_LINE_PATTERN, "")
      .replace(STRUCTURED_LINE_PATTERN, ""),
  );
  const title = (titleSeed || "Conversation follow-up").slice(0, 120);
  const reference = `[Conversation: ${conversationId}]`;
  const body = String(input.description || input.titleSource || "").trim();

  return {
    title,
    legacyTitle: `Conversation ${conversationId}`.slice(0, 120),
    reference,
    description: body ? `${reference}\n\n${body}` : reference,
  };
}
