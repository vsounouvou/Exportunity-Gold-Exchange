export type MindbasePromptDraft = {
  name: string;
  description?: string | null;
  personaRole?: string | null;
  personaTone?: string | null;
  personaRules?: string[] | string | null;
  styleConstraints?: string[] | string | null;
};

function normalizeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return trimmed
      .split(/\r?\n|,/g)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

export function buildMindbaseSystemPrompt(input: MindbasePromptDraft) {
  const personaRole = String(input.personaRole || "").trim() || "specialized digital expert";
  const tone = String(input.personaTone || "").trim() || "clear, direct, practical";
  const description = String(input.description || "").trim();
  const rules = normalizeArray(input.personaRules).slice(0, 12);
  const style = normalizeArray(input.styleConstraints).slice(0, 12);

  const ruleBlock = rules.length
    ? rules.map((rule, idx) => `${idx + 1}. ${rule}`).join("\n")
    : "1. If knowledge is missing, explicitly say what is missing and ask clarifying questions.\n2. Do not invent citations or claims.\n3. Keep responses practical and outcome-oriented.";

  const styleBlock = style.length
    ? style.map((item, idx) => `${idx + 1}. ${item}`).join("\n")
    : "1. Prefer concise sections.\n2. Use bullet points for operational steps.\n3. Keep language professional and concrete.";

  return [
    `You are "${input.name}", a ${personaRole}.`,
    description ? `Purpose: ${description}` : "Purpose: Help users execute with reliable expertise.",
    `Tone: ${tone}.`,
    "\nRules:\n" + ruleBlock,
    "\nStyle constraints:\n" + styleBlock,
    "\nSafety constraints:",
    "- Never present uncertain facts as confirmed.",
    "- Do not provide legal/medical/financial certainty; include caution when relevant.",
    "- If you cannot execute due to permissions or missing tools, return BLOCKED + reason + next required permission.",
    "\nKnowledge policy:",
    "- Use uploaded knowledge chunks when relevant.",
    "- Cite source filenames when you use knowledge.",
    "- If knowledge is missing, say so and request the needed document.",
  ].join("\n");
}

export function chunkKnowledgeText(input: string) {
  const text = String(input || "").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [] as string[];

  const maxLen = 3600;
  const overlap = 650;
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const end = Math.min(text.length, cursor + maxLen);
    const chunk = text.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    cursor = Math.max(0, end - overlap);
  }

  return chunks;
}

export function extractMentionSlug(input: string) {
  const match = String(input || "").match(/@([a-z0-9][a-z0-9-]{1,63})/i);
  return match ? String(match[1]).toLowerCase() : "";
}

export function computeCreditsCostPerMessage(pricePer100Messages: number) {
  const normalized = Number.isFinite(pricePer100Messages) ? Number(pricePer100Messages) : 0;
  return Math.max(1, Math.ceil(normalized / 100));
}

export type WorkspaceRoutingMode = "mention" | "round_robin" | "sticky";

export function selectWorkspaceAgentRoute(input: {
  message: string;
  orderedAgentSlugs: string[];
  stickySlug?: string | null;
  latestSlug?: string | null;
}) {
  const normalizedSlugs = input.orderedAgentSlugs.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean);
  const mention = extractMentionSlug(input.message);
  if (mention) {
    const mentioned = normalizedSlugs.find((slug) => slug === mention);
    if (mentioned) return { slug: mentioned, mode: "mention" as WorkspaceRoutingMode };
  }

  const sticky = String(input.stickySlug || "").trim().toLowerCase();
  if (sticky && normalizedSlugs.includes(sticky)) {
    return { slug: sticky, mode: "sticky" as WorkspaceRoutingMode };
  }

  if (!normalizedSlugs.length) return { slug: "", mode: "round_robin" as WorkspaceRoutingMode };

  const latest = String(input.latestSlug || "").trim().toLowerCase();
  if (!latest || !normalizedSlugs.includes(latest)) {
    return { slug: normalizedSlugs[0], mode: "round_robin" as WorkspaceRoutingMode };
  }

  const idx = normalizedSlugs.findIndex((slug) => slug === latest);
  const next = normalizedSlugs[(idx + 1) % normalizedSlugs.length];
  return { slug: next, mode: "round_robin" as WorkspaceRoutingMode };
}
