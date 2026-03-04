export function normalizeEmailSubject(subject: string | null | undefined) {
  const raw = String(subject || "").trim();
  if (!raw) return "(no-subject)";

  // Strip common prefixes repeatedly: Re:, Fwd:, etc.
  let value = raw;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = value.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "");
    if (next === value) break;
    value = next;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 500);

  return normalized || "(no-subject)";
}

