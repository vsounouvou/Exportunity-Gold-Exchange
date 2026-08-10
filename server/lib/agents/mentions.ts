export type MentionAlias = { alias: string; agentId: number };

const RESERVED_MENTION_ALIASES = new Set(["all", "everyone", "team"]);

export const normalizeForMention = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildAgentMentionAliases(agentRows: any[]): MentionAlias[] {
  const full: MentionAlias[] = [];
  const firstCounts = new Map<string, number>();
  const lastCounts = new Map<string, number>();

  for (const agent of agentRows) {
    const agentId = Number(agent?.id);
    if (!Number.isInteger(agentId) || agentId <= 0) continue;
    const normalizedName = normalizeForMention(agent?.name);
    if (!normalizedName) continue;

    full.push({ alias: normalizedName, agentId });

    const parts = normalizedName.split(" ").filter(Boolean);
    if (!parts.length) continue;

    const first = parts[0];
    const last = parts[parts.length - 1];

    if (first.length >= 3 && !RESERVED_MENTION_ALIASES.has(first)) {
      firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
    }

    if (last.length >= 3 && !RESERVED_MENTION_ALIASES.has(last)) {
      lastCounts.set(last, (lastCounts.get(last) ?? 0) + 1);
    }
  }

  const aliases: MentionAlias[] = [...full];

  for (const entry of full) {
    const parts = entry.alias.split(" ").filter(Boolean);
    if (!parts.length) continue;

    const first = parts[0];
    const last = parts[parts.length - 1];

    if (firstCounts.get(first) === 1) {
      aliases.push({ alias: first, agentId: entry.agentId });
    }

    if (lastCounts.get(last) === 1 && last !== first) {
      aliases.push({ alias: last, agentId: entry.agentId });
    }
  }

  const seen = new Set<string>();
  return aliases.filter(({ alias, agentId }) => {
    const key = `${agentId}:${alias}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getMentionedAgentIdsFromText(
  rawText: unknown,
  aliases: MentionAlias[],
  options?: { allowBareMentions?: boolean; allowLeadingBareMentions?: boolean },
): number[] {
  const text = normalizeForMention(rawText);
  if (!text) return [];

  const allowBareMentions = Boolean(options?.allowBareMentions);
  const allowLeadingBareMentions = Boolean(options?.allowLeadingBareMentions);
  const mentioned = new Set<number>();

  for (const { alias, agentId } of aliases) {
    if (!alias) continue;
    const escapedAlias = escapeRegex(alias);
    const explicitMention = new RegExp(`(^|[^\\w])@${escapedAlias}(?=$|[^\\w])`);
    if (explicitMention.test(text)) {
      mentioned.add(agentId);
      continue;
    }

    if (allowLeadingBareMentions) {
      const leadingBareMention = new RegExp(`^${escapedAlias}(?=$|[^\\w])`);
      if (leadingBareMention.test(text)) {
        mentioned.add(agentId);
        continue;
      }
    }

    if (!allowBareMentions) continue;

    const bareMention = new RegExp(`(^|[^\\w@])${escapedAlias}(?=$|[^\\w])`);
    if (bareMention.test(text)) mentioned.add(agentId);
  }

  return Array.from(mentioned);
}
