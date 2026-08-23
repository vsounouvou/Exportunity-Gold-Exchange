export const MEDIA_INTERVIEW_MODES = [
  "asynchronous_mobile",
  "live_browser",
  "live_audio",
  "recorded_video_call",
  "in_person_field",
  "human_presented_ai_prepared",
  "guided_self_recording",
] as const;

export const MEDIA_INTERVIEW_STATUSES = [
  "draft",
  "consent_pending",
  "scheduled",
  "in_progress",
  "paused",
  "submitted",
  "review_required",
  "approved",
  "rejected",
  "cancelled",
] as const;

export const MEDIA_FACT_STATUSES = [
  "VERIFIED",
  "SUPPORTED_BY_DOCUMENT",
  "PRODUCER_CLAIM",
  "CREATOR_CLAIM",
  "INFERENCE",
  "UNVERIFIED",
  "OUTDATED",
] as const;

export const MEDIA_CLAIM_CATEGORIES = [
  "identity",
  "story",
  "product",
  "capacity",
  "price",
  "packaging",
  "certification",
  "buyer_segment",
  "export_experience",
  "delivery",
  "constraint",
  "call_to_action",
  "correction",
  "other",
] as const;

export const MEDIA_STUDIO_PROJECT_STATUSES = [
  "draft",
  "awaiting_source_verification",
  "awaiting_rights",
  "awaiting_producer_consent",
  "editing",
  "compliance_review",
  "awaiting_approval",
  "approved",
  "rendering",
  "ready",
  "scheduled",
  "published",
  "failed",
  "restricted",
  "archived",
  "revoked",
] as const;

export const MEDIA_STUDIO_ASSET_ROLES = [
  "source_video",
  "source_audio",
  "interview_recording",
  "licensed_creator_media",
  "product_photo",
  "brand_file",
  "logo",
  "document",
  "voice_recording",
  "generated_image",
  "generated_video_segment",
  "stock_media",
  "transcript",
  "subtitle",
  "thumbnail",
  "music",
  "other",
] as const;

export const MEDIA_RENDER_OUTPUT_FORMATS = [
  "vertical_9_16",
  "feed_4_5",
  "square_1_1",
  "landscape_16_9",
  "duration_15s",
  "duration_30s",
  "duration_60s",
  "feature_3m",
  "long_form_interview",
  "audio_only",
  "article",
  "transcript",
  "subtitle_file",
  "thumbnail",
] as const;

export const MEDIA_RENDER_STATUSES = [
  "prepared",
  "provider_submission_approved",
  "provider_submitted",
  "rendering",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type MediaInterviewMode = (typeof MEDIA_INTERVIEW_MODES)[number];
export type MediaFactStatus = (typeof MEDIA_FACT_STATUSES)[number];
export type MediaClaimCategory = (typeof MEDIA_CLAIM_CATEGORIES)[number];
export type MediaStudioAssetRole = (typeof MEDIA_STUDIO_ASSET_ROLES)[number];
export type MediaRenderOutputFormat = (typeof MEDIA_RENDER_OUTPUT_FORMATS)[number];

type JsonRecord = Record<string, unknown>;

const CREDENTIAL_KEY_PATTERN = /(^|[_\-.])(authorization|auth|bearer|cookie|credential|password|passwd|passphrase|secret|token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|private[_-]?key|session[_-]?id)($|[_\-.])/i;
const CREDENTIAL_VALUE_PATTERNS = [
  /\bbearer\s+[a-z0-9._~+/=-]{12,}/i,
  /(?:access_token|refresh_token|id_token|api[_-]?key|client[_-]?secret|password|auth_token)=([^&\s]{6,})/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
];

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringArray(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  return Array.from(new Set(values.map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function hasMaterialEvidence(value: unknown) {
  const evidence = asRecord(value);
  return Object.values(evidence).some((entry) => {
    if (typeof entry === "string") return Boolean(entry.trim());
    if (Array.isArray(entry)) return entry.length > 0;
    if (entry && typeof entry === "object") return Object.keys(entry as object).length > 0;
    return entry !== null && entry !== undefined && entry !== false;
  });
}

function consentExplanationPresent(value: unknown) {
  const evidence = asRecord(value);
  return [
    evidence.explanationReference,
    evidence.explainedAt,
    evidence.consentFormReference,
    evidence.recordingReference,
    evidence.confirmationReference,
  ].some((entry) => typeof entry === "string" && Boolean(entry.trim()));
}

function isPublicUse(value: unknown) {
  const uses = stringArray(value).map((entry) => entry.toLowerCase());
  return uses.some((entry) =>
    [
      "public",
      "publication",
      "organic_publication",
      "paid_ad",
      "advertising",
      "social",
      "website",
      "newsletter",
      "sales",
      "group_campaign",
    ].includes(entry),
  );
}

function validDate(value: unknown) {
  if (!value) return false;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return !Number.isNaN(parsed.getTime());
}

function scanAndSanitize(
  value: unknown,
  path: string,
  redactedPaths: string[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => scanAndSanitize(entry, `${path}[${index}]`, redactedPaths));
  }
  if (value && typeof value === "object") {
    const output: JsonRecord = {};
    for (const [key, entry] of Object.entries(value as JsonRecord)) {
      const entryPath = path ? `${path}.${key}` : key;
      if (CREDENTIAL_KEY_PATTERN.test(key)) {
        redactedPaths.push(entryPath);
        output[key] = "[REDACTED]";
        continue;
      }
      output[key] = scanAndSanitize(entry, entryPath, redactedPaths);
    }
    return output;
  }
  if (typeof value === "string" && CREDENTIAL_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    redactedPaths.push(path || "$value");
    return "[REDACTED]";
  }
  return value;
}

/** Returns a safe copy. Callers must reject storage when containsCredentials is true. */
export function sanitizeMediaStudioEvidence(value: unknown) {
  const redactedPaths: string[] = [];
  const sanitized = scanAndSanitize(value, "", redactedPaths);
  return {
    sanitized,
    containsCredentials: redactedPaths.length > 0,
    redactedPaths: Array.from(new Set(redactedPaths)),
    credentialsStored: false as const,
  };
}

export function normalizeMediaInterviewMode(value: unknown): MediaInterviewMode {
  const normalized = String(value || "").trim().toLowerCase();
  if ((MEDIA_INTERVIEW_MODES as readonly string[]).includes(normalized)) {
    return normalized as MediaInterviewMode;
  }
  throw new Error("Unsupported interview mode");
}

export function normalizeMediaFactStatus(value: unknown): MediaFactStatus {
  const normalized = String(value || "UNVERIFIED").trim().toUpperCase();
  if ((MEDIA_FACT_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as MediaFactStatus;
  }
  throw new Error("Unsupported fact status");
}

export function normalizeMediaClaimCategory(value: unknown): MediaClaimCategory {
  const normalized = String(value || "other").trim().toLowerCase();
  if ((MEDIA_CLAIM_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized as MediaClaimCategory;
  }
  throw new Error("Unsupported claim category");
}

export function normalizeMediaStudioAssetRole(value: unknown): MediaStudioAssetRole {
  const normalized = String(value || "").trim().toLowerCase();
  if ((MEDIA_STUDIO_ASSET_ROLES as readonly string[]).includes(normalized)) {
    return normalized as MediaStudioAssetRole;
  }
  throw new Error("Unsupported studio asset role");
}

export function normalizeMediaRenderOutputFormat(value: unknown): MediaRenderOutputFormat {
  const normalized = String(value || "").trim().toLowerCase();
  if ((MEDIA_RENDER_OUTPUT_FORMATS as readonly string[]).includes(normalized)) {
    return normalized as MediaRenderOutputFormat;
  }
  throw new Error("Unsupported render output format");
}

export function evaluateInterviewReadiness(input: {
  session: {
    intervieweeName?: unknown;
    intervieweeRole?: unknown;
    organizationName?: unknown;
    intendedUses?: unknown;
    recordingConsentStatus?: unknown;
    publicationConsentStatus?: unknown;
    aiProcessingConsentStatus?: unknown;
    consentEvidence?: unknown;
  };
  claims?: Array<{
    id?: unknown;
    factStatus?: unknown;
    isMaterial?: unknown;
    evidenceReferences?: unknown;
    evidence?: unknown;
    verifiedByUserId?: unknown;
    verifiedAt?: unknown;
    intervieweeApprovedAt?: unknown;
  }> | null;
}) {
  const reviewBlockers: string[] = [];
  const productionBlockers: string[] = [];
  const session = input.session || {};
  const claims = Array.isArray(input.claims) ? input.claims : [];

  if (!String(session.intervieweeName || "").trim()) reviewBlockers.push("interviewee_name_required");
  if (!String(session.intervieweeRole || "").trim()) reviewBlockers.push("interviewee_role_required");
  if (!String(session.organizationName || "").trim()) reviewBlockers.push("organization_name_required");
  if (!consentExplanationPresent(session.consentEvidence)) reviewBlockers.push("consent_explanation_evidence_required");
  if (String(session.recordingConsentStatus || "").toLowerCase() !== "granted") {
    reviewBlockers.push("recording_consent_required");
  }
  if (String(session.aiProcessingConsentStatus || "").toLowerCase() !== "granted") {
    reviewBlockers.push("ai_processing_consent_required");
  }
  if (!claims.length) reviewBlockers.push("at_least_one_interview_claim_required");

  productionBlockers.push(...reviewBlockers);
  if (isPublicUse(session.intendedUses) && String(session.publicationConsentStatus || "").toLowerCase() !== "granted") {
    productionBlockers.push("publication_consent_required_for_intended_use");
  }

  for (const [index, claim] of claims.entries()) {
    if (claim?.isMaterial === false) continue;
    const claimId = String(claim?.id || index + 1);
    const status = normalizeMediaFactStatus(claim?.factStatus);
    if (status === "VERIFIED") {
      if (!Number(claim?.verifiedByUserId) || !validDate(claim?.verifiedAt) || !hasMaterialEvidence(claim?.evidence)) {
        productionBlockers.push(`claim:${claimId}:verification_evidence_required`);
      }
      continue;
    }
    if (status === "SUPPORTED_BY_DOCUMENT") {
      if (!stringArray(claim?.evidenceReferences).length) {
        productionBlockers.push(`claim:${claimId}:document_reference_required`);
      }
      continue;
    }
    productionBlockers.push(`claim:${claimId}:material_${status.toLowerCase()}_not_publishable`);
  }

  const uniqueReviewBlockers = Array.from(new Set(reviewBlockers));
  const uniqueProductionBlockers = Array.from(new Set(productionBlockers));
  return {
    reviewReady: uniqueReviewBlockers.length === 0,
    productionReady: uniqueProductionBlockers.length === 0,
    reviewBlockers: uniqueReviewBlockers,
    productionBlockers: uniqueProductionBlockers,
    publicUseIntended: isPublicUse(session.intendedUses),
    materialClaimCount: claims.filter((claim) => claim?.isMaterial !== false).length,
    evaluatedFactStatuses: MEDIA_FACT_STATUSES,
  };
}

export function evaluateStudioProjectReadiness(input: {
  project: { status?: unknown; sourceReferenceId?: unknown; rightsGrantId?: unknown };
  interview?: { status?: unknown; readiness?: { productionReady?: unknown; productionBlockers?: unknown } } | null;
  sourceReference?: { id?: unknown; sourceUrl?: unknown; reuseStatus?: unknown; takedownState?: unknown } | null;
  rightsGrant?: {
    id?: unknown;
    status?: unknown;
    producerConsentStatus?: unknown;
    subjectReleaseStatus?: unknown;
    musicLicenseStatus?: unknown;
    expiresAt?: unknown;
    evidence?: unknown;
  } | null;
  assets?: Array<{
    id?: unknown;
    storageReference?: unknown;
    originalSource?: unknown;
    ownerName?: unknown;
    assetRole?: unknown;
    rightsStatus?: unknown;
    subjectConsentStatus?: unknown;
    musicLicenseStatus?: unknown;
    takedownState?: unknown;
    metadata?: unknown;
  }> | null;
  now?: Date;
}) {
  const blockers: string[] = [];
  const source = input.sourceReference || null;
  const grant = input.rightsGrant || null;
  const interview = input.interview || null;
  const assets = Array.isArray(input.assets) ? input.assets : [];
  const now = input.now || new Date();

  if (!interview || String(interview.status || "").toLowerCase() !== "approved") {
    blockers.push("approved_interview_required");
  }
  if (interview?.readiness?.productionReady !== true) {
    const reasons = Array.isArray(interview?.readiness?.productionBlockers)
      ? interview?.readiness?.productionBlockers
      : [];
    blockers.push("interview_production_readiness_required", ...reasons.map((reason) => `interview:${String(reason)}`));
  }
  if (!source || !Number(source.id)) blockers.push("source_content_reference_required");
  if (source) {
    if (!String(source.sourceUrl || "").trim()) blockers.push("source_url_required");
    if (String(source.takedownState || "clear").toLowerCase() !== "clear") blockers.push("source_takedown_or_dispute_active");
    if (["restricted", "revoked", "takedown"].includes(String(source.reuseStatus || "").toLowerCase())) {
      blockers.push("source_reuse_restricted");
    }
  }
  if (!grant || !Number(grant.id)) blockers.push("active_rights_grant_required");
  if (grant) {
    if (String(grant.status || "").toLowerCase() !== "granted") blockers.push("rights_grant_not_active");
    if (grant.expiresAt) {
      const expiresAt = new Date(String(grant.expiresAt));
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) blockers.push("rights_grant_expired");
    }
    if (String(grant.producerConsentStatus || "").toLowerCase() !== "granted") blockers.push("producer_consent_not_cleared");
    if (!["granted", "not_required"].includes(String(grant.subjectReleaseStatus || "").toLowerCase())) blockers.push("subject_release_not_cleared");
    if (!["granted", "not_required"].includes(String(grant.musicLicenseStatus || "").toLowerCase())) blockers.push("music_license_not_cleared");
    if (!hasMaterialEvidence(grant.evidence)) blockers.push("rights_evidence_required");
  }
  if (!assets.length) blockers.push("at_least_one_provenance_asset_required");
  for (const [index, asset] of assets.entries()) {
    const assetId = String(asset.id || index + 1);
    if (!String(asset.storageReference || "").trim()) blockers.push(`asset:${assetId}:storage_reference_required`);
    if (!String(asset.originalSource || "").trim()) blockers.push(`asset:${assetId}:original_source_required`);
    if (!String(asset.ownerName || "").trim()) blockers.push(`asset:${assetId}:owner_required`);
    if (String(asset.takedownState || "clear").toLowerCase() !== "clear") blockers.push(`asset:${assetId}:takedown_or_restriction_active`);
    if (String(asset.rightsStatus || "").toLowerCase() !== "granted") blockers.push(`asset:${assetId}:rights_not_granted`);
    if (!["granted", "not_applicable"].includes(String(asset.subjectConsentStatus || "").toLowerCase())) {
      blockers.push(`asset:${assetId}:subject_consent_not_cleared`);
    }
    if (String(asset.assetRole || "").toLowerCase() === "music" && String(asset.musicLicenseStatus || "").toLowerCase() !== "granted") {
      blockers.push(`asset:${assetId}:music_license_not_cleared`);
    }
    const credentialCheck = sanitizeMediaStudioEvidence(asset.metadata);
    if (credentialCheck.containsCredentials) blockers.push(`asset:${assetId}:credential_material_forbidden`);
  }

  const uniqueBlockers = Array.from(new Set(blockers));
  return {
    readyForApproval: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    evaluatedAt: now.toISOString(),
    externalRenderExecuted: false as const,
    externalPublicationExecuted: false as const,
  };
}

export function evaluateRenderPreparation(input: {
  project: { status?: unknown };
  version: { status?: unknown; contentHash?: unknown };
  projectReadiness: { readyForApproval?: unknown; blockers?: unknown };
  outputFormat: unknown;
  inputAssetHashes?: unknown;
}) {
  const blockers: string[] = [];
  let outputFormat: MediaRenderOutputFormat | null = null;
  try {
    outputFormat = normalizeMediaRenderOutputFormat(input.outputFormat);
  } catch {
    blockers.push("supported_output_format_required");
  }
  if (String(input.project?.status || "").toLowerCase() !== "approved") blockers.push("approved_project_required");
  if (String(input.version?.status || "").toLowerCase() !== "approved") blockers.push("approved_version_required");
  if (!String(input.version?.contentHash || "").trim()) blockers.push("approved_version_content_hash_required");
  if (input.projectReadiness?.readyForApproval !== true) {
    blockers.push("project_compliance_readiness_required");
    const projectBlockers = Array.isArray(input.projectReadiness?.blockers) ? input.projectReadiness.blockers : [];
    blockers.push(...projectBlockers.map((blocker) => `project:${String(blocker)}`));
  }
  const inputAssetHashes = stringArray(input.inputAssetHashes);
  if (!inputAssetHashes.length) blockers.push("input_asset_hashes_required");

  const uniqueBlockers = Array.from(new Set(blockers));
  return {
    ready: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    outputFormat,
    inputAssetHashes,
    renderStatus: "prepared" as const,
    externalRenderExecuted: false as const,
    providerSubmissionExecuted: false as const,
    providerJobReference: null,
  };
}
