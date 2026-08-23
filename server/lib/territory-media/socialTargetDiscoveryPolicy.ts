import crypto from "node:crypto";

import {
  REQUIRED_SOCIAL_SCOPES,
  type SocialPlatform,
} from "./socialPublicationPolicy";

type JsonRecord = Record<string, unknown>;

export type DiscoveredSocialTarget = {
  candidateKey: string;
  connectionId: string;
  provider: "meta" | "google";
  platform: "facebook" | "instagram" | "youtube";
  channel: "page" | "professional_account" | "channel";
  externalAccountId: string;
  externalAccountLabel: string;
  parentAccountId: string | null;
  parentAccountLabel: string | null;
  capabilities: string[];
  permissions: string[];
  authorizationStatus: "authorized";
  healthStatus: "healthy";
  evidenceSource: "meta_me_accounts" | "youtube_channels_mine";
  credentialsExcluded: true;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asRecords(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function stringArray(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(values.map((entry) => asText(entry).toLowerCase()).filter(Boolean)),
  ).sort();
}

function candidateKey(connectionId: string, platform: string, externalAccountId: string) {
  return crypto
    .createHash("sha256")
    .update(`${connectionId}:${platform}:${externalAccountId}`)
    .digest("hex")
    .slice(0, 24);
}

function safePermissions(platform: SocialPlatform, grantedScopes: unknown) {
  const granted = stringArray(grantedScopes);
  return REQUIRED_SOCIAL_SCOPES[platform].filter((scope) => granted.includes(scope.toLowerCase()));
}

export function parseMetaTargetCandidates(input: {
  connectionId: string;
  platform: "facebook" | "instagram";
  grantedScopes: unknown;
  payload: unknown;
}) {
  const connectionId = asText(input.connectionId);
  if (!connectionId) throw new Error("connectionId is required");
  const permissions = safePermissions(input.platform, input.grantedScopes);
  const candidates: DiscoveredSocialTarget[] = [];

  for (const page of asRecords(asRecord(input.payload).data)) {
    const pageId = asText(page.id);
    const pageName = asText(page.name);
    if (!pageId || !pageName) continue;
    const tasks = stringArray(page.tasks);

    if (input.platform === "facebook") {
      candidates.push({
        candidateKey: candidateKey(connectionId, "facebook", pageId),
        connectionId,
        provider: "meta",
        platform: "facebook",
        channel: "page",
        externalAccountId: pageId,
        externalAccountLabel: pageName,
        parentAccountId: null,
        parentAccountLabel: null,
        capabilities: tasks,
        permissions,
        authorizationStatus: "authorized",
        healthStatus: "healthy",
        evidenceSource: "meta_me_accounts",
        credentialsExcluded: true,
      });
      continue;
    }

    const instagram = asRecord(page.instagram_business_account);
    const instagramId = asText(instagram.id);
    if (!instagramId) continue;
    const instagramLabel =
      asText(instagram.username) || asText(instagram.name) || `Instagram ${instagramId}`;
    const capabilities = Array.from(
      new Set([
        ...tasks,
        ...(permissions.includes("instagram_basic") ? ["instagram_basic"] : []),
        ...(permissions.includes("instagram_content_publish")
          ? ["instagram_content_publish"]
          : []),
      ]),
    ).sort();
    candidates.push({
      candidateKey: candidateKey(connectionId, "instagram", instagramId),
      connectionId,
      provider: "meta",
      platform: "instagram",
      channel: "professional_account",
      externalAccountId: instagramId,
      externalAccountLabel: instagramLabel,
      parentAccountId: pageId,
      parentAccountLabel: pageName,
      capabilities,
      permissions,
      authorizationStatus: "authorized",
      healthStatus: "healthy",
      evidenceSource: "meta_me_accounts",
      credentialsExcluded: true,
    });
  }

  return candidates;
}

export function parseYouTubeTargetCandidates(input: {
  connectionId: string;
  grantedScopes: unknown;
  payload: unknown;
}) {
  const connectionId = asText(input.connectionId);
  if (!connectionId) throw new Error("connectionId is required");
  const permissions = safePermissions("youtube", input.grantedScopes);
  return asRecords(asRecord(input.payload).items).flatMap((channel) => {
    const externalAccountId = asText(channel.id);
    const snippet = asRecord(channel.snippet);
    const title = asText(snippet.title);
    if (!externalAccountId || !title) return [];
    const capabilities = [
      ...(permissions.includes("https://www.googleapis.com/auth/youtube.readonly")
        ? ["channel_read"]
        : []),
      ...(permissions.includes("https://www.googleapis.com/auth/youtube.upload")
        ? ["video_upload"]
        : []),
    ];
    return [{
      candidateKey: candidateKey(connectionId, "youtube", externalAccountId),
      connectionId,
      provider: "google" as const,
      platform: "youtube" as const,
      channel: "channel" as const,
      externalAccountId,
      externalAccountLabel: title,
      parentAccountId: null,
      parentAccountLabel: null,
      capabilities,
      permissions,
      authorizationStatus: "authorized" as const,
      healthStatus: "healthy" as const,
      evidenceSource: "youtube_channels_mine" as const,
      credentialsExcluded: true as const,
    }];
  });
}

export function candidateContainsCredentialMaterial(value: unknown) {
  const serialized = JSON.stringify(value || {}).toLowerCase();
  return [
    "access_token",
    "refresh_token",
    "auth_token",
    "client_secret",
    "api_key",
    "bearer ",
  ].some((needle) => serialized.includes(needle));
}
