import type { CompanyBrainWorkspaceService } from "@db/schema";

export const GOOGLE_IDENTITY_SCOPES = ["openid", "email", "profile"] as const;

export const GOOGLE_WORKSPACE_READ_SCOPES: Record<CompanyBrainWorkspaceService, string> = {
  drive: "https://www.googleapis.com/auth/drive.readonly",
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  contacts: "https://www.googleapis.com/auth/contacts.readonly",
};

const GOOGLE_IDENTITY_SCOPE_ALIASES = new Set([
  ...GOOGLE_IDENTITY_SCOPES,
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
]);

export const FORBIDDEN_GOOGLE_WORKSPACE_SCOPE_FRAGMENTS = [
  "gmail.send",
  "gmail.compose",
  "gmail.modify",
  "gmail.labels",
  "gmail.settings",
  "contacts.other.readonly",
  "/auth/drive.file",
  "/auth/drive.appdata",
  "/auth/drive.metadata",
  "/auth/drive.activity",
  "/auth/calendar.events",
] as const;

export function isWorkspaceService(value: unknown): value is CompanyBrainWorkspaceService {
  return value === "drive" || value === "gmail" || value === "contacts";
}

export function scopesForWorkspaceService(service: CompanyBrainWorkspaceService) {
  return [...GOOGLE_IDENTITY_SCOPES, GOOGLE_WORKSPACE_READ_SCOPES[service]];
}

export function normalizeGoogleScopes(value: unknown, fallback: string[] = []) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\s,]+/)
        .filter(Boolean);
  const normalized = values.map((item) => String(item || "").trim()).filter(Boolean);
  return Array.from(new Set(normalized.length ? normalized : fallback));
}

export function validateReadOnlyWorkspaceScopes(
  service: CompanyBrainWorkspaceService,
  rawScopes: unknown,
) {
  const scopes = normalizeGoogleScopes(rawScopes, scopesForWorkspaceService(service));
  const expectedServiceScope = GOOGLE_WORKSPACE_READ_SCOPES[service];
  const forbidden = scopes.filter((scope) => {
    const lower = scope.toLowerCase();
    if (lower === expectedServiceScope.toLowerCase()) return false;
    if (GOOGLE_IDENTITY_SCOPE_ALIASES.has(scope)) return false;
    return true;
  });
  const explicitWriteScopes = scopes.filter((scope) => {
    const lower = scope.toLowerCase();
    return FORBIDDEN_GOOGLE_WORKSPACE_SCOPE_FRAGMENTS.some((fragment) => lower.includes(fragment));
  });
  const missingServiceScope = !scopes.includes(expectedServiceScope);

  return {
    valid: forbidden.length === 0 && explicitWriteScopes.length === 0 && !missingServiceScope,
    scopes,
    forbiddenScopes: Array.from(new Set([...forbidden, ...explicitWriteScopes])),
    missingServiceScope,
    expectedServiceScope,
  };
}

export function assertReadOnlyWorkspaceScopes(
  service: CompanyBrainWorkspaceService,
  rawScopes: unknown,
) {
  const result = validateReadOnlyWorkspaceScopes(service, rawScopes);
  if (!result.valid) {
    throw new Error(
      `Google ${service} connection did not grant the exact read-only scope set. ` +
        `Missing=${result.missingServiceScope}; forbidden=${result.forbiddenScopes.join(", ") || "none"}`,
    );
  }
  return result.scopes;
}
