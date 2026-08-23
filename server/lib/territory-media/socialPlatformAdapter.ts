/**
 * Provider-neutral contract for official business-account integrations.
 *
 * Implementations must use provider-supported APIs and business authorization.
 * Ordinary account passwords never belong in this contract, and a provider
 * response is required before an implementation may return PUBLISHED.
 */
export const SOCIAL_PUBLICATION_STATUSES = [
  "DRAFT",
  "AWAITING_RIGHTS",
  "AWAITING_CONSENT",
  "AWAITING_FACTS",
  "NEEDS_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "UPLOADING",
  "PROCESSING",
  "PUBLISHED",
  "FAILED",
  "RESTRICTED",
  "MANUAL_REQUIRED",
  "TAKEDOWN_REQUESTED",
  "REMOVED",
] as const;

export type SocialPublicationStatus = (typeof SOCIAL_PUBLICATION_STATUSES)[number];

export type SocialProviderContext = {
  tenantId: number;
  connectionId: string;
  targetId?: number | null;
  platform: string;
  externalAccountId?: string | null;
};

export type SocialProviderResult = {
  providerRequestId?: string | null;
  providerObjectId?: string | null;
  providerUrl?: string | null;
  status: SocialPublicationStatus;
  confirmedAt?: string | null;
  evidence: Record<string, unknown>;
};

export type SocialAccountHealth = {
  status: "healthy" | "degraded" | "restricted" | "reconnect_required" | "unknown";
  capabilities: string[];
  permissions: string[];
  restrictions: string[];
  checkedAt: string;
  evidence: Record<string, unknown>;
};

export interface SocialPlatformAdapter {
  readonly provider: string;
  readonly platforms: readonly string[];

  authorizeAccount(input: {
    tenantId: number;
    userId: number;
    platform: string;
    returnTo: string;
  }): Promise<{ authorizationUrl: string; stateReference: string }>;

  refreshAuthorization(context: SocialProviderContext): Promise<{
    expiresAt: string | null;
    evidence: Record<string, unknown>;
  }>;

  discoverCapabilities(context: SocialProviderContext): Promise<SocialAccountHealth>;

  validatePermissions(input: SocialProviderContext & {
    requiredPermissions: string[];
  }): Promise<SocialAccountHealth>;

  getAccountHealth(context: SocialProviderContext): Promise<SocialAccountHealth>;

  uploadMedia(input: SocialProviderContext & {
    assetUrl: string;
    mediaType: string;
    checksum?: string | null;
    altText?: string | null;
  }): Promise<SocialProviderResult>;

  createPost(input: SocialProviderContext & {
    title?: string | null;
    caption: string;
    hashtags: string[];
    destinationLink?: string | null;
    uploadedMediaIds: string[];
  }): Promise<SocialProviderResult>;

  schedulePost(input: SocialProviderContext & {
    providerObjectId: string;
    scheduledAt: string;
  }): Promise<SocialProviderResult>;

  publishPost(input: SocialProviderContext & {
    providerObjectId: string;
  }): Promise<SocialProviderResult>;

  getPublicationStatus(input: SocialProviderContext & {
    providerObjectId: string;
  }): Promise<SocialProviderResult>;

  getComments(input: SocialProviderContext & {
    providerObjectId: string;
    cursor?: string | null;
  }): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null; evidence: Record<string, unknown> }>;

  getMessages(input: SocialProviderContext & {
    cursor?: string | null;
  }): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null; evidence: Record<string, unknown> }>;

  replyToComment(input: SocialProviderContext & {
    commentId: string;
    body: string;
    approvalReference: string;
  }): Promise<SocialProviderResult>;

  replyToMessage(input: SocialProviderContext & {
    conversationId: string;
    body: string;
    approvalReference: string;
  }): Promise<SocialProviderResult>;

  getPostMetrics(input: SocialProviderContext & {
    providerObjectId: string;
  }): Promise<{ metrics: Record<string, number>; evidence: Record<string, unknown> }>;

  createAdvertisement(input: SocialProviderContext & {
    providerObjectId: string;
    campaignReference: string;
    budgetAuthorizationReference: string;
  }): Promise<SocialProviderResult>;

  pauseAdvertisement(input: SocialProviderContext & {
    providerAdvertisementId: string;
    reason: string;
  }): Promise<SocialProviderResult>;
}
