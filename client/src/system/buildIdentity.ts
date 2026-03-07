function toStringOrNull(value: unknown): string | null {
  const next = String(value ?? "").trim();
  return next || null;
}

export function getClientBuildId(): string | null {
  if (typeof window === "undefined") return null;
  return (
    toStringOrNull((window as any).__BUILD_ID__) ??
    toStringOrNull((window as any).__EXPORTUNITY_CONFIG__?.buildId) ??
    null
  );
}

export function isVersionGuardEnabledByConfig(): boolean {
  if (typeof window === "undefined") return true;
  const raw = (window as any).__EXPORTUNITY_CONFIG__?.versionGuardEnabled;
  if (raw == null) return true;
  const normalized = String(raw).trim().toLowerCase();
  if (!normalized) return true;
  return !["0", "false", "off", "no"].includes(normalized);
}
