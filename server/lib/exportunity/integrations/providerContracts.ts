export const EXPORTUNITY_GOOGLE_INTEGRATION_ID = "google_workspace" as const;
export const EXPORTUNITY_YOUTUBE_INTEGRATION_ID = "youtube" as const;
export const EXPORTUNITY_META_INTEGRATION_ID = "meta_business" as const;

/**
 * Phase-one Google access is evidence-only. Any write-capable scope belongs to
 * a later, separately reviewed release and must not be accumulated here.
 */
export const EXPORTUNITY_GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
] as const;

export const EXPORTUNITY_YOUTUBE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

export const EXPORTUNITY_GOOGLE_REQUIRED_APIS = [
  "Gmail API",
  "Google Calendar API",
  "Google Drive API",
] as const;

export const EXPORTUNITY_YOUTUBE_REQUIRED_APIS = [
  "YouTube Data API v3",
] as const;

/**
 * These are the permissions already approved for the Exportunity Commerce Meta
 * app. Publishing/spend permissions are intentionally not implied here.
 */
export const EXPORTUNITY_META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_manage_comments",
] as const;

export const EXPORTUNITY_GOOGLE_CALLBACK_PATH =
  "/api/exportunity/integrations/google/callback" as const;
export const EXPORTUNITY_META_CALLBACK_PATH =
  "/api/exportunity/integrations/meta/callback" as const;

export const EXPORTUNITY_INTEGRATION_IDS = [
  EXPORTUNITY_GOOGLE_INTEGRATION_ID,
  EXPORTUNITY_YOUTUBE_INTEGRATION_ID,
  EXPORTUNITY_META_INTEGRATION_ID,
] as const;

export type ExportunityOAuthIntegrationId =
  (typeof EXPORTUNITY_INTEGRATION_IDS)[number];

export function isExportunityOAuthIntegrationId(
  value: unknown,
): value is ExportunityOAuthIntegrationId {
  return EXPORTUNITY_INTEGRATION_IDS.includes(
    String(value || "") as ExportunityOAuthIntegrationId,
  );
}

export function providerForExportunityIntegration(
  integrationId: ExportunityOAuthIntegrationId,
) {
  return integrationId === EXPORTUNITY_META_INTEGRATION_ID
    ? ("meta" as const)
    : ("google" as const);
}

export function scopesForExportunityIntegration(
  integrationId: ExportunityOAuthIntegrationId,
): readonly string[] {
  if (integrationId === EXPORTUNITY_GOOGLE_INTEGRATION_ID) {
    return EXPORTUNITY_GOOGLE_SCOPES;
  }
  if (integrationId === EXPORTUNITY_YOUTUBE_INTEGRATION_ID) {
    return EXPORTUNITY_YOUTUBE_SCOPES;
  }
  return EXPORTUNITY_META_SCOPES;
}
