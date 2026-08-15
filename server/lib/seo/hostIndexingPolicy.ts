const EXPORTUNITY_STAGING_HOSTS = new Set([
  "clone.exportunity.net",
  "www.clone.exportunity.net",
]);

export function normalizeRequestHost(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.split(",")[0]?.split(":")[0]?.trim().toLowerCase() || "";
}

export function isProtectedExportunityStagingHost(host: unknown): boolean {
  return EXPORTUNITY_STAGING_HOSTS.has(normalizeRequestHost(host));
}

export function shouldNoIndexExportunityHost(host: unknown): boolean {
  return isProtectedExportunityStagingHost(host);
}
