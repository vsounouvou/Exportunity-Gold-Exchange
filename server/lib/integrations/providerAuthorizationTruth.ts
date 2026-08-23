export type MindbaseOAuthProvider = "google" | "meta";

export type ScopeEvidenceSource =
  | "google_token_response"
  | "meta_permissions_edge"
  | "provider_scope_unavailable";

export type ScopeEvidence = {
  requestedScopes: string[];
  grantedScopes: string[];
  missingScopes: string[];
  declinedScopes: string[];
  scopeEvidenceSource: ScopeEvidenceSource;
  scopeEvidenceVerified: boolean;
  authorizationReady: boolean;
};

export type MetaPermissionStatus = {
  permission: string;
  status: string;
};

const INTEGRATION_PROVIDERS: Record<string, MindbaseOAuthProvider> = {
  gmail: "google",
  calendar: "google",
  drive: "google",
  youtube: "google",
  facebook: "meta",
  instagram: "meta",
};

export function normalizeGrantedScopes(value: unknown): string[] {
  const entries = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[,\s]+/)
        .filter(Boolean);
  return Array.from(
    new Set(entries.map((entry) => String(entry ?? "").trim()).filter(Boolean)),
  );
}

export function expectedProviderForIntegration(
  integrationId: unknown,
): MindbaseOAuthProvider | null {
  return INTEGRATION_PROVIDERS[String(integrationId ?? "").trim().toLowerCase()] || null;
}

export function providerMatchesIntegration(input: {
  provider: unknown;
  integrationId: unknown;
}) {
  const provider = String(input.provider ?? "").trim().toLowerCase();
  const expectedProvider = expectedProviderForIntegration(input.integrationId);
  return {
    matches: Boolean(expectedProvider && provider === expectedProvider),
    provider,
    expectedProvider,
  };
}

export function buildScopeEvidence(input: {
  requestedScopes: unknown;
  grantedScopes: unknown;
  declinedScopes?: unknown;
  scopeEvidenceSource: ScopeEvidenceSource;
  scopeEvidenceVerified: boolean;
}): ScopeEvidence {
  const requestedScopes = normalizeGrantedScopes(input.requestedScopes);
  const grantedScopes = normalizeGrantedScopes(input.grantedScopes);
  const granted = new Set(grantedScopes);
  const declinedScopes = normalizeGrantedScopes(input.declinedScopes).filter(
    (scope) => !granted.has(scope),
  );
  const missingScopes = requestedScopes.filter((scope) => !granted.has(scope));
  const scopeEvidenceVerified = input.scopeEvidenceVerified === true;
  return {
    requestedScopes,
    grantedScopes,
    missingScopes,
    declinedScopes,
    scopeEvidenceSource: input.scopeEvidenceSource,
    scopeEvidenceVerified,
    authorizationReady: scopeEvidenceVerified && missingScopes.length === 0,
  };
}

export function parseMetaPermissionEvidence(
  payload: unknown,
  requestedScopes: unknown,
): ScopeEvidence & { providerPermissionStatuses: MetaPermissionStatus[] } {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const data = Array.isArray(record.data) ? record.data : null;
  const providerPermissionStatuses = (data || [])
    .map((entry) => {
      const item =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : {};
      return {
        permission: String(item.permission ?? "").trim(),
        status: String(item.status ?? "").trim().toLowerCase(),
      };
    })
    .filter((entry) => entry.permission && entry.status);
  const grantedScopes = providerPermissionStatuses
    .filter((entry) => entry.status === "granted")
    .map((entry) => entry.permission);
  const declinedScopes = providerPermissionStatuses
    .filter((entry) => entry.status !== "granted")
    .map((entry) => entry.permission);
  const evidence = buildScopeEvidence({
    requestedScopes,
    grantedScopes,
    declinedScopes,
    scopeEvidenceSource: data ? "meta_permissions_edge" : "provider_scope_unavailable",
    scopeEvidenceVerified: Boolean(data),
  });
  return { ...evidence, providerPermissionStatuses };
}
