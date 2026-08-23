import type { SocialPublicationStatus } from "./socialPlatformAdapter";

export const SUPPORTED_SOCIAL_PLATFORMS = [
  "facebook",
  "instagram",
  "youtube",
  "tiktok",
  "linkedin",
  "x",
] as const;

export type SocialPlatform = (typeof SUPPORTED_SOCIAL_PLATFORMS)[number];

export const REQUIRED_SOCIAL_SCOPES: Record<SocialPlatform, string[]> = {
  facebook: [
    "pages_show_list",
    "pages_manage_engagement",
    "pages_manage_posts",
    "pages_read_engagement",
    "pages_read_user_engagement",
  ],
  instagram: [
    "pages_show_list",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
  ],
  youtube: [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.upload",
  ],
  tiktok: [],
  linkedin: [],
  x: [],
};

export function normalizeSocialPlatform(value: unknown): SocialPlatform {
  const normalized = String(value || "").trim().toLowerCase();
  if ((SUPPORTED_SOCIAL_PLATFORMS as readonly string[]).includes(normalized)) {
    return normalized as SocialPlatform;
  }
  throw new Error("Unsupported social platform");
}

export function providerForPlatform(platform: SocialPlatform) {
  if (platform === "facebook" || platform === "instagram") return "meta";
  if (platform === "youtube") return "google";
  return platform;
}

export function integrationIdForPlatform(platform: SocialPlatform) {
  if (platform === "facebook" || platform === "instagram") {
    return "meta_business";
  }
  if (platform === "youtube") return "youtube";
  return platform;
}

export function publicationStatusForRightsBlockers(blockers: string[]): SocialPublicationStatus {
  const normalized = blockers.map((entry) => String(entry || "").toLowerCase());
  if (normalized.some((entry) => entry.includes("takedown") || entry.includes("restricted") || entry.includes("revoked"))) {
    return "RESTRICTED";
  }
  if (normalized.some((entry) => entry.includes("consent") || entry.includes("release") || entry.includes("music_license"))) {
    return "AWAITING_CONSENT";
  }
  if (normalized.some((entry) => entry.includes("fact") || entry.includes("source_url"))) {
    return "AWAITING_FACTS";
  }
  if (normalized.some((entry) => entry.includes("rights") || entry.includes("grant") || entry.includes("usage_not_granted") || entry.includes("channel_not_granted") || entry.includes("territory_not_granted"))) {
    return "AWAITING_RIGHTS";
  }
  return "NEEDS_REVIEW";
}

export function deriveConnectionReadiness(input: {
  configured: boolean;
  connection?: {
    status?: unknown;
    scopes?: unknown;
    expiresAt?: unknown;
    revokedAt?: unknown;
    tokenMeta?: unknown;
  } | null;
  requiredScopes: string[];
  target?: {
    authorizationStatus?: unknown;
    healthStatus?: unknown;
    capabilities?: unknown;
    permissions?: unknown;
    lastVerifiedAt?: unknown;
  } | null;
  adapterAvailable: boolean;
  now?: Date;
}) {
  const blockers: string[] = [];
  const connection = input.connection || null;
  const target = input.target || null;
  const now = input.now || new Date();

  if (!input.configured) blockers.push("provider_application_configuration_required");
  if (!connection) blockers.push("account_authorization_required");
  if (connection) {
    const status = String(connection.status || "").trim().toLowerCase();
    if (connection.revokedAt || status !== "connected") blockers.push("account_reconnect_required");
    const expiresAt = connection.expiresAt ? new Date(String(connection.expiresAt)) : null;
    const tokenMeta = connection.tokenMeta && typeof connection.tokenMeta === "object" && !Array.isArray(connection.tokenMeta)
      ? (connection.tokenMeta as Record<string, unknown>)
      : {};
    if (tokenMeta.scopeEvidenceVerified !== true) {
      blockers.push("provider_permission_evidence_required");
    }
    if (tokenMeta.authorizationReady !== true) {
      blockers.push("provider_authorization_evidence_incomplete");
    }
    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime() && tokenMeta.hasRefreshToken !== true) {
      blockers.push("authorization_expired_without_refresh_token");
    }
    const scopes = Array.isArray(connection.scopes)
      ? connection.scopes.map((scope) => String(scope || "").trim()).filter(Boolean)
      : [];
    const missingScopes = input.requiredScopes.filter((scope) => !scopes.includes(scope));
    blockers.push(...missingScopes.map((scope) => `permission_required:${scope}`));
  }

  if (!target) blockers.push("business_publication_target_verification_required");
  if (target) {
    const authorizationStatus = String(target.authorizationStatus || "unknown").toLowerCase();
    const healthStatus = String(target.healthStatus || "unknown").toLowerCase();
    if (authorizationStatus !== "authorized") blockers.push(`target_authorization_${authorizationStatus}`);
    if (healthStatus !== "healthy") blockers.push(`target_health_${healthStatus}`);
    if (!target.lastVerifiedAt) blockers.push("target_verification_timestamp_required");
    const targetPermissions = Array.isArray(target.permissions)
      ? target.permissions.map((permission) => String(permission || "").trim()).filter(Boolean)
      : [];
    const targetPermissionGaps = input.requiredScopes.filter(
      (permission) => !targetPermissions.includes(permission),
    );
    blockers.push(
      ...targetPermissionGaps.map((permission) => `target_permission_required:${permission}`),
    );
  }
  if (!input.adapterAvailable) blockers.push("official_platform_adapter_unavailable");

  const uniqueBlockers = Array.from(new Set(blockers));
  return {
    officialPublicationReady: uniqueBlockers.length === 0,
    manualFallbackAvailable: true,
    blockers: uniqueBlockers,
    status: uniqueBlockers.length === 0 ? "READY" : "MANUAL_REQUIRED",
  } as const;
}

function normalizedHashtags(values: unknown) {
  const list = Array.isArray(values) ? values : String(values || "").split(",");
  return Array.from(
    new Set(
      list
        .map((value) => String(value || "").trim().replace(/^#+/, ""))
        .filter(Boolean)
        .map((value) => `#${value.replace(/\s+/g, "")}`),
    ),
  );
}

function platformInstructions(platform: SocialPlatform) {
  const destination = {
    facebook: "the verified Exportunity-owned Facebook Page",
    instagram: "the verified Exportunity-owned Instagram professional account",
    youtube: "the verified Exportunity-owned YouTube channel",
    tiktok: "the verified Exportunity-owned TikTok business account",
    linkedin: "the verified Exportunity-owned LinkedIn Page",
    x: "the verified Exportunity-owned X organization account",
  }[platform];
  return [
    `Open ${destination}; do not use a personal or unverified destination.`,
    "Confirm the asset, caption, destination link, rights scope, attribution, and alt text match this package.",
    "Publish manually using the platform's native interface and retain the platform post ID/URL as evidence.",
    "Do not mark the Exportunity attempt PUBLISHED until an official provider response is recorded.",
  ];
}

export function buildManualPublicationPackage(input: {
  platform: SocialPlatform;
  channel?: string | null;
  title: string;
  caption?: string | null;
  hashtags?: unknown;
  altText?: string | null;
  assetUrl: string;
  assetType?: string | null;
  thumbnailUrl?: string | null;
  destinationLink: string;
  trackingCode: string;
  attributionText?: string | null;
  generatedAt?: Date;
}) {
  const title = String(input.title || "").trim();
  const assetUrl = String(input.assetUrl || "").trim();
  const destinationLink = String(input.destinationLink || "").trim();
  const trackingCode = String(input.trackingCode || "").trim();
  if (!title) throw new Error("Publication title is required");
  if (!assetUrl) throw new Error("A final asset URL or path is required");
  if (!destinationLink) throw new Error("A destination link is required");
  if (!trackingCode) throw new Error("A tracking code is required");

  const attributionText = String(input.attributionText || "").trim();
  const baseCaption = String(input.caption || title).trim();
  const caption = attributionText && !baseCaption.includes(attributionText)
    ? `${baseCaption}\n\n${attributionText}`
    : baseCaption;

  return {
    packageVersion: 1,
    status: "MANUAL_REQUIRED" as const,
    platform: input.platform,
    channel: String(input.channel || input.platform).trim().toLowerCase(),
    finalAsset: {
      url: assetUrl,
      type: String(input.assetType || "unspecified").trim().toLowerCase(),
    },
    caption,
    title,
    hashtags: normalizedHashtags(input.hashtags),
    altText: String(input.altText || title).trim(),
    thumbnail: String(input.thumbnailUrl || "").trim() || null,
    publishingInstructions: platformInstructions(input.platform),
    destinationLink,
    trackingCode,
    attributionText: attributionText || null,
    generatedAt: (input.generatedAt || new Date()).toISOString(),
    externalPublicationClaimed: false,
  };
}

export function buildOfficialPublicationPackage(input: {
  platform: SocialPlatform;
  channel?: string | null;
  title: string;
  caption?: string | null;
  hashtags?: unknown;
  altText?: string | null;
  assetUrl: string;
  assetType?: string | null;
  thumbnailUrl?: string | null;
  destinationLink: string;
  trackingCode: string;
  attributionText?: string | null;
  approvedAt?: Date;
}) {
  const manual = buildManualPublicationPackage({
    ...input,
    generatedAt: input.approvedAt,
  });
  const { publishingInstructions: _publishingInstructions, generatedAt: _generatedAt, ...shared } = manual;
  return {
    ...shared,
    status: "APPROVED" as const,
    mode: "official_api" as const,
    approvedAt: (input.approvedAt || new Date()).toISOString(),
    externalPublicationClaimed: false,
  };
}
