export function normalizeAgentKey(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeTenantSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function agentKeyToMailboxSlug(agentKey: string) {
  return normalizeAgentKey(agentKey).replace(/_/g, ".");
}

export function buildMailboxLocalPart(agentKey: string, tenantSlug: string) {
  const agentSlug = agentKeyToMailboxSlug(agentKey);
  const t = normalizeTenantSlug(tenantSlug);
  const maxLocalPart = 63;
  const suffix = `.${t}`;
  const maxAgentPart = Math.max(1, maxLocalPart - suffix.length);
  const trimmedAgent = agentSlug.slice(0, maxAgentPart).replace(/\.+$/g, "");
  const local = `${trimmedAgent}${suffix}`
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
  return local.slice(0, maxLocalPart);
}

