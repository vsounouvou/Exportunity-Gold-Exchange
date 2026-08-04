type TenantContentInput = {
  tenantKey?: string | null;
  content?: unknown;
  metadata?: unknown;
};

const EXPORTUNITY_LEGACY_BDO_MARKERS = [
  /\bbourse de l[\s'’-]*or\b/i,
  /certified physical gold/i,
  /verified jewelry/i,
  /purchase objective/i,
  /gold price locking/i,
  /refinery allocation/i,
  /conditional resale/i,
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function isExportunityTenant(tenantKey: unknown) {
  return String(tenantKey || "").trim().toLowerCase() === "exportunity";
}

export function isQuarantinedTenantContent(metadata: unknown) {
  const record = asRecord(metadata);
  return String(record.tenantContextStatus || "").trim().toLowerCase() === "quarantined";
}

export function isLegacyBdoContent(content: unknown) {
  const text = String(content || "");
  return EXPORTUNITY_LEGACY_BDO_MARKERS.some((pattern) => pattern.test(text));
}

/**
 * Legacy conversations predate strict tenant isolation. Exportunity must never
 * present Bourse de l'Or policy text as its own operational context.
 */
export function isTenantContentVisible(input: TenantContentInput) {
  if (!isExportunityTenant(input.tenantKey)) return true;
  if (isQuarantinedTenantContent(input.metadata)) return false;
  return !isLegacyBdoContent(input.content);
}

export function getTenantContentQuarantineReason(input: TenantContentInput) {
  if (!isExportunityTenant(input.tenantKey)) return null;
  if (isQuarantinedTenantContent(input.metadata)) return "previously_quarantined";
  return isLegacyBdoContent(input.content) ? "legacy_bdo_context" : null;
}
