import type { SocialPlatformAdapter } from "./socialPlatformAdapter";

type JsonRecord = Record<string, unknown>;

export const META_SOCIAL_PUBLICATION_ADAPTER_VERSION = "meta-social-publication-v1";
export const META_SOCIAL_PUBLICATION_FEATURE_FLAG = "FEATURE_META_SOCIAL_PUBLICATION_ADAPTER";
export const META_SOCIAL_PUBLICATION_PLATFORMS = ["facebook", "instagram"] as const;

export type MetaSocialPublicationPlatform =
  (typeof META_SOCIAL_PUBLICATION_PLATFORMS)[number];

export type MetaGraphRequest = {
  method: "GET" | "POST";
  path: string;
  accessToken: string;
  query?: Record<string, string>;
  body?: JsonRecord;
  label: string;
};

export type MetaGraphResponse = {
  payload: JsonRecord;
  requestId: string | null;
};

export type MetaGraphTransport = (input: MetaGraphRequest) => Promise<MetaGraphResponse>;

export type MetaApprovedPublicationPackage = {
  packageVersion: number;
  status: "APPROVED";
  mode: "official_api";
  platform: MetaSocialPublicationPlatform;
  channel: string;
  title: string;
  caption: string;
  hashtags: string[];
  altText: string;
  finalAsset: {
    url: string;
    type: string;
  };
  thumbnail: string | null;
  destinationLink: string;
  trackingCode: string;
  attributionText: string | null;
  approvedAt: string;
  externalPublicationClaimed: false;
};

export type MetaPublicationTarget = {
  platform: MetaSocialPublicationPlatform;
  externalAccountId: string;
  parentAccountId?: string | null;
};

export type MetaPublicationExecutionResult = {
  status: "PROCESSING" | "PUBLISHED";
  providerObjectId: string;
  providerContainerId: string | null;
  providerUrl: string | null;
  providerConfirmedAt: string | null;
  providerPublishedAt: string | null;
  evidence: JsonRecord;
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

function asStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => asText(entry)).filter(Boolean)
    : [];
}

function isTruthy(value: unknown) {
  return ["1", "true", "yes", "on", "enabled"].includes(asText(value).toLowerCase());
}

function safeProviderRequestId(value: unknown) {
  const requestId = asText(value);
  return /^[A-Za-z0-9._:-]{1,200}$/.test(requestId) ? requestId : null;
}

function requireGraphVersion(value: unknown) {
  const graphVersion = asText(value);
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error(
      "A pinned EXPORTUNITY_META_GRAPH_VERSION is required for official Meta publication",
    );
  }
  return graphVersion;
}

function requireGraphPath(value: unknown) {
  const path = asText(value);
  if (!/^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path)) {
    throw new Error("Meta Graph path failed the fixed-host allowlist");
  }
  return path;
}

function requireProviderId(value: unknown, field: string) {
  const id = asText(value);
  if (!/^[A-Za-z0-9_.-]{1,240}$/.test(id)) {
    throw new Error(`${field} is missing or invalid`);
  }
  return id;
}

function safeProviderUrl(value: unknown, platform: MetaSocialPublicationPlatform) {
  const raw = asText(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    const allowed = platform === "instagram"
      ? hostname === "instagram.com" || hostname.endsWith(".instagram.com")
      : hostname === "facebook.com" || hostname.endsWith(".facebook.com");
    if (url.protocol !== "https:" || !allowed || url.username || url.password || url.hash) return null;
    for (const key of url.searchParams.keys()) {
      if (/(?:access|refresh|auth)?[_-]?token|secret|password|api[_-]?key|signature/i.test(key)) {
        return null;
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function requirePublicHttpsUrl(value: unknown, field: string) {
  const raw = asText(value);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${field} must be an absolute public HTTPS URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${field} must be an absolute public HTTPS URL without embedded credentials or fragments`);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new Error(`${field} must resolve through a public provider-retrievable host`);
  }
  for (const key of url.searchParams.keys()) {
    if (/(?:access|refresh|auth)?[_-]?token|secret|password|api[_-]?key|signature/i.test(key)) {
      throw new Error(`${field} must not contain credential-like query parameters`);
    }
  }
  return url.toString();
}

function boundedText(value: unknown, field: string, max: number, required = true) {
  const text = asText(value);
  if (required && !text) throw new Error(`${field} is required`);
  if (text.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return text;
}

function safeErrorDetails(payload: JsonRecord) {
  const error = asRecord(payload.error);
  const code = Number(error.code);
  const subcode = Number(error.error_subcode);
  return {
    providerErrorType: boundedText(error.type, "providerErrorType", 120, false) || null,
    providerErrorCode: Number.isFinite(code) ? Math.trunc(code) : null,
    providerErrorSubcode: Number.isFinite(subcode) ? Math.trunc(subcode) : null,
    providerTransient: error.is_transient === true,
  };
}

export class MetaGraphRequestError extends Error {
  readonly code = "META_GRAPH_REQUEST_FAILED";
  readonly httpStatus: number | null;
  readonly outcomeAmbiguous: boolean;
  readonly evidence: JsonRecord;

  constructor(input: {
    label: string;
    httpStatus?: number | null;
    outcomeAmbiguous: boolean;
    evidence?: JsonRecord;
  }) {
    const status = input.httpStatus ? ` (HTTP ${input.httpStatus})` : "";
    super(`Meta ${input.label} failed${status}`);
    this.name = "MetaGraphRequestError";
    this.httpStatus = input.httpStatus || null;
    this.outcomeAmbiguous = input.outcomeAmbiguous;
    this.evidence = {
      ...(input.evidence || {}),
      credentialsExcluded: true,
      automaticRetryAllowed: false,
    };
  }
}

export function metaSocialPublicationFeatureStatus() {
  const enabled = isTruthy(process.env[META_SOCIAL_PUBLICATION_FEATURE_FLAG]);
  const graphVersion = asText(process.env.EXPORTUNITY_META_GRAPH_VERSION);
  const configured = Boolean(
    asText(process.env.EXPORTUNITY_META_APP_ID) &&
    asText(process.env.EXPORTUNITY_META_APP_SECRET) &&
    /^v\d+\.\d+$/.test(graphVersion),
  );
  return {
    adapter: META_SOCIAL_PUBLICATION_ADAPTER_VERSION,
    featureFlag: META_SOCIAL_PUBLICATION_FEATURE_FLAG,
    enabled,
    configured,
    graphVersionPinned: /^v\d+\.\d+$/.test(graphVersion),
    platforms: [...META_SOCIAL_PUBLICATION_PLATFORMS],
    automaticRetry: false,
    backgroundExecution: false,
    advertisementExecution: false,
    outboundMessaging: false,
    credentialsExposed: false,
  };
}

export function createMetaGraphTransport(input: {
  graphVersion?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
} = {}): MetaGraphTransport {
  const graphVersion = requireGraphVersion(
    input.graphVersion || process.env.EXPORTUNITY_META_GRAPH_VERSION,
  );
  const timeoutMs = Math.max(1_000, Math.min(30_000, Number(input.timeoutMs || 12_000)));
  const fetcher = input.fetcher || fetch;
  return async (request) => {
    const path = requireGraphPath(request.path);
    const accessToken = boundedText(request.accessToken, "Meta access token", 8_192);
    const url = new URL(`https://graph.facebook.com/${graphVersion}${path}`);
    for (const [key, value] of Object.entries(request.query || {})) {
      if (!/^[a-z_]{1,80}$/i.test(key)) throw new Error("Meta query key failed the allowlist");
      if (/(?:token|secret|password|key)/i.test(key)) {
        throw new Error("Meta credentials must be sent in the Authorization header");
      }
      url.searchParams.set(key, asText(value));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url.toString(), {
        method: request.method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
          ...(request.method === "POST" ? { "content-type": "application/json" } : {}),
        },
        body: request.method === "POST" ? JSON.stringify(request.body || {}) : undefined,
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as JsonRecord;
      const requestId = safeProviderRequestId(
        response.headers.get("x-fb-trace-id") || response.headers.get("x-fb-request-id"),
      );
      if (!response.ok || payload.error) {
        const details = safeErrorDetails(payload);
        throw new MetaGraphRequestError({
          label: request.label,
          httpStatus: response.status,
          outcomeAmbiguous: request.method === "POST" && (
            response.status >= 500 ||
            response.status === 408 ||
            details.providerTransient
          ),
          evidence: {
            ...details,
            providerRequestId: requestId,
          },
        });
      }
      return { payload, requestId };
    } catch (error: any) {
      if (error instanceof MetaGraphRequestError) throw error;
      throw new MetaGraphRequestError({
        label: request.label,
        outcomeAmbiguous: request.method === "POST",
        evidence: {
          transportFailure: true,
          timeout: error?.name === "AbortError",
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function normalizeMetaApprovedPublicationPackage(
  value: unknown,
): MetaApprovedPublicationPackage {
  const input = asRecord(value);
  const platform = asText(input.platform).toLowerCase();
  if (!(META_SOCIAL_PUBLICATION_PLATFORMS as readonly string[]).includes(platform)) {
    throw new Error("Official Meta publication supports Facebook and Instagram only");
  }
  if (input.status !== "APPROVED" || input.mode !== "official_api") {
    throw new Error("Official Meta publication requires an approved official_api package");
  }
  const finalAsset = asRecord(input.finalAsset);
  const hashtags = asStringList(input.hashtags).slice(0, 30).map((entry) =>
    entry.startsWith("#") ? entry : `#${entry.replace(/\s+/g, "")}`,
  );
  const thumbnail = asText(input.thumbnail);
  return {
    packageVersion: Number(input.packageVersion || 1),
    status: "APPROVED",
    mode: "official_api",
    platform: platform as MetaSocialPublicationPlatform,
    channel: boundedText(input.channel || platform, "channel", 80),
    title: boundedText(input.title, "title", 300),
    caption: boundedText(input.caption, "caption", 10_000),
    hashtags,
    altText: boundedText(input.altText, "altText", 2_000),
    finalAsset: {
      url: requirePublicHttpsUrl(finalAsset.url, "finalAsset.url"),
      type: boundedText(finalAsset.type || "unspecified", "finalAsset.type", 120),
    },
    thumbnail: thumbnail ? requirePublicHttpsUrl(thumbnail, "thumbnail") : null,
    destinationLink: requirePublicHttpsUrl(input.destinationLink, "destinationLink"),
    trackingCode: boundedText(input.trackingCode, "trackingCode", 120),
    attributionText: boundedText(input.attributionText, "attributionText", 1_000, false) || null,
    approvedAt: boundedText(input.approvedAt, "approvedAt", 80),
    externalPublicationClaimed: false,
  };
}

function composeCaption(publication: MetaApprovedPublicationPackage) {
  const parts = [
    publication.caption,
    publication.hashtags.join(" "),
    publication.destinationLink,
    publication.trackingCode,
  ].filter(Boolean);
  const body = parts.join("\n\n");
  const maximum = publication.platform === "instagram" ? 2_200 : 10_000;
  if (body.length > maximum) {
    throw new Error(`${publication.platform} publication body exceeds ${maximum} characters`);
  }
  return body;
}

function imageAsset(publication: MetaApprovedPublicationPackage) {
  const type = publication.finalAsset.type.toLowerCase();
  const pathname = new URL(publication.finalAsset.url).pathname.toLowerCase();
  return (
    type.includes("image") ||
    type.includes("photo") ||
    /\.(?:jpe?g|png|webp)$/.test(pathname)
  );
}

function instagramJpegAsset(publication: MetaApprovedPublicationPackage) {
  const type = publication.finalAsset.type.toLowerCase();
  const pathname = new URL(publication.finalAsset.url).pathname.toLowerCase();
  return type.includes("jpeg") || type.includes("jpg") || /\.jpe?g$/.test(pathname);
}

export async function resolveMetaPageAuthorization(input: {
  transport: MetaGraphTransport;
  userAccessToken: string;
  target: MetaPublicationTarget;
}) {
  const targetId = requireProviderId(input.target.externalAccountId, "externalAccountId");
  const expectedParentId = input.target.parentAccountId
    ? requireProviderId(input.target.parentAccountId, "parentAccountId")
    : null;
  const response = await input.transport({
    method: "GET",
    path: "/me/accounts",
    accessToken: input.userAccessToken,
    query: {
      fields: "id,name,tasks,access_token,instagram_business_account{id}",
      limit: "100",
    },
    label: "Page authorization lookup",
  });
  for (const page of asRecords(response.payload.data)) {
    const pageId = asText(page.id);
    const instagram = asRecord(page.instagram_business_account);
    const matches = input.target.platform === "facebook"
      ? pageId === targetId
      : asText(instagram.id) === targetId && (!expectedParentId || pageId === expectedParentId);
    if (!matches) continue;
    const tasks = asStringList(page.tasks);
    const requiredTasks = input.target.platform === "facebook"
      ? ["CREATE_CONTENT", "MANAGE", "MODERATE"]
      : ["CREATE_CONTENT"];
    const missingTasks = requiredTasks.filter((task) => !tasks.includes(task));
    if (missingTasks.length) {
      throw new Error(`The selected Meta Page is missing required tasks: ${missingTasks.join(", ")}`);
    }
    const pageAccessToken = asText(page.access_token);
    if (!pageAccessToken) {
      throw new Error("Meta did not return a Page access token for the selected business target");
    }
    return {
      pageId,
      pageAccessToken,
      evidence: {
        providerRequestId: response.requestId,
        targetMatchedExactly: true,
        parentPageMatched: input.target.platform === "instagram" ? pageId : null,
        tasks,
        pageCredentialResolvedTransiently: true,
        pageCredentialPersisted: false,
        credentialsExcluded: true,
      },
    };
  }
  throw new Error("The selected Meta business target is no longer available to this authorization");
}

async function verifyPublishedObject(input: {
  transport: MetaGraphTransport;
  accessToken: string;
  objectId: string;
  platform: MetaSocialPublicationPlatform;
}) {
  const objectId = requireProviderId(input.objectId, "providerObjectId");
  const response = await input.transport({
    method: "GET",
    path: `/${objectId}`,
    accessToken: input.accessToken,
    query: {
      fields: input.platform === "instagram"
        ? "id,permalink,timestamp,media_type"
        : "id,permalink_url,created_time,is_published",
    },
    label: `${input.platform} publication verification`,
  });
  const returnedId = requireProviderId(response.payload.id, "verifiedProviderObjectId");
  if (returnedId !== objectId) {
    throw new Error("Meta publication verification returned a different provider object");
  }
  if (input.platform === "facebook" && response.payload.is_published === false) {
    throw new Error("Meta returned the Facebook object but did not confirm it as published");
  }
  const providerTimestamp = asText(
    input.platform === "instagram" ? response.payload.timestamp : response.payload.created_time,
  );
  return {
    providerUrl: safeProviderUrl(
      input.platform === "instagram" ? response.payload.permalink : response.payload.permalink_url,
      input.platform,
    ),
    providerTimestamp: providerTimestamp || null,
    providerRequestId: response.requestId,
    mediaType: boundedText(response.payload.media_type, "mediaType", 80, false) || null,
  };
}

async function publishFacebook(input: {
  transport: MetaGraphTransport;
  pageId: string;
  pageAccessToken: string;
  publication: MetaApprovedPublicationPackage;
  authorizationEvidence: JsonRecord;
}): Promise<MetaPublicationExecutionResult> {
  const message = composeCaption(input.publication);
  const isImage = imageAsset(input.publication);
  const response = await input.transport({
    method: "POST",
    path: `/${requireProviderId(input.pageId, "pageId")}/${isImage ? "photos" : "feed"}`,
    accessToken: input.pageAccessToken,
    body: isImage
      ? {
          url: input.publication.finalAsset.url,
          caption: message,
          alt_text_custom: input.publication.altText,
          published: true,
        }
      : {
          message,
          link: input.publication.destinationLink,
          published: true,
        },
    label: "Facebook Page publication",
  });
  const providerObjectId = requireProviderId(
    response.payload.post_id || response.payload.id,
    "providerObjectId",
  );
  const verified = await verifyPublishedObject({
    transport: input.transport,
    accessToken: input.pageAccessToken,
    objectId: providerObjectId,
    platform: "facebook",
  });
  const confirmedAt = new Date().toISOString();
  return {
    status: "PUBLISHED",
    providerObjectId,
    providerContainerId: null,
    providerUrl: verified.providerUrl,
    providerConfirmedAt: confirmedAt,
    providerPublishedAt: verified.providerTimestamp || confirmedAt,
    evidence: {
      adapter: META_SOCIAL_PUBLICATION_ADAPTER_VERSION,
      platform: "facebook",
      endpoint: isImage ? "page/photos" : "page/feed",
      providerCreateRequestId: response.requestId,
      providerVerifyRequestId: verified.providerRequestId,
      providerObjectId,
      providerUrl: verified.providerUrl,
      providerTimestamp: verified.providerTimestamp,
      ...input.authorizationEvidence,
      providerMutationPerformed: true,
      externalPublicationPerformed: true,
      providerConfirmationVerified: true,
      credentialsExcluded: true,
    },
  };
}

async function publishInstagramContainer(input: {
  transport: MetaGraphTransport;
  instagramAccountId: string;
  pageAccessToken: string;
  containerId: string;
  authorizationEvidence: JsonRecord;
  containerCreateRequestId?: string | null;
}): Promise<MetaPublicationExecutionResult> {
  const containerId = requireProviderId(input.containerId, "providerContainerId");
  const statusResponse = await input.transport({
    method: "GET",
    path: `/${containerId}`,
    accessToken: input.pageAccessToken,
    query: { fields: "id,status_code,status" },
    label: "Instagram container status",
  });
  const statusCode = asText(statusResponse.payload.status_code).toUpperCase();
  if (statusCode !== "FINISHED") {
    if (["ERROR", "EXPIRED"].includes(statusCode)) {
      throw new MetaGraphRequestError({
        label: "Instagram media container processing",
        outcomeAmbiguous: false,
        evidence: {
          providerContainerId: containerId,
          providerContainerStatus: statusCode,
          providerRequestId: statusResponse.requestId,
        },
      });
    }
    const providerMutationPerformed = Boolean(input.containerCreateRequestId);
    return {
      status: "PROCESSING",
      providerObjectId: containerId,
      providerContainerId: containerId,
      providerUrl: null,
      providerConfirmedAt: null,
      providerPublishedAt: null,
      evidence: {
        adapter: META_SOCIAL_PUBLICATION_ADAPTER_VERSION,
        platform: "instagram",
        providerContainerId: containerId,
        providerContainerStatus: statusCode || "UNKNOWN",
        providerContainerCreateRequestId: input.containerCreateRequestId || null,
        providerContainerStatusRequestId: statusResponse.requestId,
        ...input.authorizationEvidence,
        providerMutationPerformed,
        providerContainerCreated: providerMutationPerformed,
        externalPublicationPerformed: false,
        providerConfirmationVerified: false,
        automaticRetryStarted: false,
        explicitForegroundContinuationRequired: true,
        credentialsExcluded: true,
      },
    };
  }
  const publishResponse = await input.transport({
    method: "POST",
    path: `/${requireProviderId(input.instagramAccountId, "instagramAccountId")}/media_publish`,
    accessToken: input.pageAccessToken,
    body: { creation_id: containerId },
    label: "Instagram media publication",
  });
  const providerObjectId = requireProviderId(publishResponse.payload.id, "providerObjectId");
  const verified = await verifyPublishedObject({
    transport: input.transport,
    accessToken: input.pageAccessToken,
    objectId: providerObjectId,
    platform: "instagram",
  });
  const confirmedAt = new Date().toISOString();
  return {
    status: "PUBLISHED",
    providerObjectId,
    providerContainerId: containerId,
    providerUrl: verified.providerUrl,
    providerConfirmedAt: confirmedAt,
    providerPublishedAt: verified.providerTimestamp || confirmedAt,
    evidence: {
      adapter: META_SOCIAL_PUBLICATION_ADAPTER_VERSION,
      platform: "instagram",
      endpoint: "instagram/media_publish",
      providerContainerId: containerId,
      providerContainerCreateRequestId: input.containerCreateRequestId || null,
      providerContainerStatusRequestId: statusResponse.requestId,
      providerPublishRequestId: publishResponse.requestId,
      providerVerifyRequestId: verified.providerRequestId,
      providerObjectId,
      providerUrl: verified.providerUrl,
      providerTimestamp: verified.providerTimestamp,
      mediaType: verified.mediaType,
      ...input.authorizationEvidence,
      providerMutationPerformed: true,
      externalPublicationPerformed: true,
      providerConfirmationVerified: true,
      credentialsExcluded: true,
    },
  };
}

async function publishInstagram(input: {
  transport: MetaGraphTransport;
  instagramAccountId: string;
  pageAccessToken: string;
  publication: MetaApprovedPublicationPackage;
  authorizationEvidence: JsonRecord;
}): Promise<MetaPublicationExecutionResult> {
  if (!instagramJpegAsset(input.publication)) {
    throw new Error("The first released Instagram adapter supports single JPEG image posts only");
  }
  const createResponse = await input.transport({
    method: "POST",
    path: `/${requireProviderId(input.instagramAccountId, "instagramAccountId")}/media`,
    accessToken: input.pageAccessToken,
    body: {
      image_url: input.publication.finalAsset.url,
      caption: composeCaption(input.publication),
      alt_text: input.publication.altText,
    },
    label: "Instagram media container creation",
  });
  const containerId = requireProviderId(createResponse.payload.id, "providerContainerId");
  return publishInstagramContainer({
    transport: input.transport,
    instagramAccountId: input.instagramAccountId,
    pageAccessToken: input.pageAccessToken,
    containerId,
    authorizationEvidence: input.authorizationEvidence,
    containerCreateRequestId: createResponse.requestId,
  });
}

export async function publishApprovedMetaPackage(input: {
  transport: MetaGraphTransport;
  userAccessToken: string;
  target: MetaPublicationTarget;
  publication: unknown;
}): Promise<MetaPublicationExecutionResult> {
  const publication = normalizeMetaApprovedPublicationPackage(input.publication);
  if (publication.platform !== input.target.platform) {
    throw new Error("Publication package platform does not match the selected Meta target");
  }
  const authorization = await resolveMetaPageAuthorization({
    transport: input.transport,
    userAccessToken: input.userAccessToken,
    target: input.target,
  });
  if (publication.platform === "facebook") {
    return publishFacebook({
      transport: input.transport,
      pageId: authorization.pageId,
      pageAccessToken: authorization.pageAccessToken,
      publication,
      authorizationEvidence: authorization.evidence,
    });
  }
  return publishInstagram({
    transport: input.transport,
    instagramAccountId: input.target.externalAccountId,
    pageAccessToken: authorization.pageAccessToken,
    publication,
    authorizationEvidence: authorization.evidence,
  });
}

export async function continueApprovedInstagramPublication(input: {
  transport: MetaGraphTransport;
  userAccessToken: string;
  target: MetaPublicationTarget;
  providerContainerId: string;
}): Promise<MetaPublicationExecutionResult> {
  if (input.target.platform !== "instagram") {
    throw new Error("Only a processing Instagram container can be continued");
  }
  const authorization = await resolveMetaPageAuthorization({
    transport: input.transport,
    userAccessToken: input.userAccessToken,
    target: input.target,
  });
  return publishInstagramContainer({
    transport: input.transport,
    instagramAccountId: input.target.externalAccountId,
    pageAccessToken: authorization.pageAccessToken,
    containerId: input.providerContainerId,
    authorizationEvidence: authorization.evidence,
  });
}

function unsupportedCapability(capability: string): never {
  throw new Error(`${capability} is not released by ${META_SOCIAL_PUBLICATION_ADAPTER_VERSION}`);
}

/**
 * The provider-neutral adapter identity for the released Page/Instagram
 * publication slice. OAuth, replies, messages, metrics, scheduling, and ads
 * remain separate explicit capabilities and fail closed here.
 */
export class MetaSocialPublishingAdapter implements SocialPlatformAdapter {
  readonly provider = "meta";
  readonly platforms = META_SOCIAL_PUBLICATION_PLATFORMS;

  constructor(
    private readonly transport: MetaGraphTransport,
    private readonly userAccessToken: string,
    private readonly target: MetaPublicationTarget,
  ) {}

  publishApprovedPackage(publication: unknown) {
    return publishApprovedMetaPackage({
      transport: this.transport,
      userAccessToken: this.userAccessToken,
      target: this.target,
      publication,
    });
  }

  continueInstagramPublication(providerContainerId: string) {
    return continueApprovedInstagramPublication({
      transport: this.transport,
      userAccessToken: this.userAccessToken,
      target: this.target,
      providerContainerId,
    });
  }

  authorizeAccount: SocialPlatformAdapter["authorizeAccount"] = async () =>
    unsupportedCapability("OAuth authorization");
  refreshAuthorization: SocialPlatformAdapter["refreshAuthorization"] = async () =>
    unsupportedCapability("OAuth refresh");
  discoverCapabilities: SocialPlatformAdapter["discoverCapabilities"] = async () =>
    unsupportedCapability("capability discovery");
  validatePermissions: SocialPlatformAdapter["validatePermissions"] = async () =>
    unsupportedCapability("permission validation");
  getAccountHealth: SocialPlatformAdapter["getAccountHealth"] = async () =>
    unsupportedCapability("account health");
  uploadMedia: SocialPlatformAdapter["uploadMedia"] = async () =>
    unsupportedCapability("standalone media upload");
  createPost: SocialPlatformAdapter["createPost"] = async () =>
    unsupportedCapability("ungoverned post creation");
  schedulePost: SocialPlatformAdapter["schedulePost"] = async () =>
    unsupportedCapability("provider scheduling");
  publishPost: SocialPlatformAdapter["publishPost"] = async () =>
    unsupportedCapability("ungoverned post publication");
  getPublicationStatus: SocialPlatformAdapter["getPublicationStatus"] = async () =>
    unsupportedCapability("generic publication status");
  getComments: SocialPlatformAdapter["getComments"] = async () =>
    unsupportedCapability("comment polling");
  getMessages: SocialPlatformAdapter["getMessages"] = async () =>
    unsupportedCapability("message polling");
  replyToComment: SocialPlatformAdapter["replyToComment"] = async () =>
    unsupportedCapability("comment reply");
  replyToMessage: SocialPlatformAdapter["replyToMessage"] = async () =>
    unsupportedCapability("message reply");
  getPostMetrics: SocialPlatformAdapter["getPostMetrics"] = async () =>
    unsupportedCapability("post metrics");
  createAdvertisement: SocialPlatformAdapter["createAdvertisement"] = async () =>
    unsupportedCapability("advertisement creation");
  pauseAdvertisement: SocialPlatformAdapter["pauseAdvertisement"] = async () =>
    unsupportedCapability("advertisement mutation");
}
