export type MediaPublicationUsage =
  | "organic_publication"
  | "paid_ad"
  | "derivative_edit"
  | "translation"
  | "dubbing";

type RightsGrantLike = {
  id?: unknown;
  status?: unknown;
  rightsHolderName?: unknown;
  rightsBasis?: unknown;
  usageTypes?: unknown;
  channels?: unknown;
  territoryIds?: unknown;
  allTerritories?: unknown;
  startsAt?: unknown;
  expiresAt?: unknown;
  producerConsentStatus?: unknown;
  subjectReleaseStatus?: unknown;
  musicLicenseStatus?: unknown;
  attributionText?: unknown;
  attributionRules?: unknown;
  evidence?: unknown;
};

type SourceReferenceLike = {
  id?: unknown;
  sourceUrl?: unknown;
  reuseStatus?: unknown;
  takedownState?: unknown;
};

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)),
  );
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
        .map((entry) => Math.trunc(entry)),
    ),
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isConsentReady(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "granted" || normalized === "not_required";
}

export function hasMaterialRightsEvidence(value: unknown) {
  const evidence = record(value);
  return Object.values(evidence).some((entry) => {
    if (typeof entry === "string") return Boolean(entry.trim());
    if (Array.isArray(entry)) return entry.length > 0;
    return entry !== null && entry !== undefined && entry !== false;
  });
}

export function evaluateMediaPublicationEligibility(input: {
  sourceReference?: SourceReferenceLike | null;
  grants?: RightsGrantLike[] | null;
  usageType?: MediaPublicationUsage;
  channel?: string | null;
  territoryId?: number | null;
  now?: Date;
}) {
  const usageType = input.usageType || "organic_publication";
  const channel = String(input.channel || "web").trim().toLowerCase();
  const territoryId = Number(input.territoryId || 0) || null;
  const now = input.now || new Date();
  const sourceReference = input.sourceReference || null;

  if (!sourceReference) {
    return {
      eligible: false,
      blockers: ["source_content_reference_required"],
      grantId: null,
      evaluatedAt: now.toISOString(),
      usageType,
      channel,
      territoryId,
    };
  }

  const sourceBlockers: string[] = [];
  if (!String(sourceReference.sourceUrl || "").trim()) sourceBlockers.push("source_url_required");
  if (String(sourceReference.takedownState || "clear").toLowerCase() !== "clear") {
    sourceBlockers.push("source_is_under_takedown_or_dispute");
  }
  if (["restricted", "revoked", "takedown"].includes(String(sourceReference.reuseStatus || "").toLowerCase())) {
    sourceBlockers.push("source_reuse_is_restricted");
  }
  if (sourceBlockers.length) {
    return {
      eligible: false,
      blockers: sourceBlockers,
      grantId: null,
      evaluatedAt: now.toISOString(),
      usageType,
      channel,
      territoryId,
    };
  }

  const grantEvaluations = (Array.isArray(input.grants) ? input.grants : []).map((grant) => {
    const blockers: string[] = [];
    const status = String(grant.status || "").trim().toLowerCase();
    if (status !== "granted") blockers.push("rights_grant_not_active");
    if (!String(grant.rightsHolderName || "").trim()) blockers.push("rights_holder_required");
    if (!String(grant.rightsBasis || "").trim()) blockers.push("rights_basis_required");

    const startsAt = dateOrNull(grant.startsAt);
    const expiresAt = dateOrNull(grant.expiresAt);
    if (startsAt && startsAt.getTime() > now.getTime()) blockers.push("rights_grant_not_started");
    if (expiresAt && expiresAt.getTime() <= now.getTime()) blockers.push("rights_grant_expired");

    const usageTypes = stringArray(grant.usageTypes);
    if (!usageTypes.includes(usageType) && !usageTypes.includes("all")) {
      blockers.push(`usage_not_granted:${usageType}`);
    }

    const channels = stringArray(grant.channels);
    if (channels.length && !channels.includes(channel) && !channels.includes("all")) {
      blockers.push(`channel_not_granted:${channel}`);
    }

    const territoryIds = numberArray(grant.territoryIds);
    if (territoryId) {
      if (!grant.allTerritories && !territoryIds.includes(territoryId)) {
        blockers.push(`territory_not_granted:${territoryId}`);
      }
    } else if (!grant.allTerritories) {
      blockers.push("global_publication_scope_not_granted");
    }

    if (!isConsentReady(grant.producerConsentStatus)) blockers.push("producer_consent_not_cleared");
    if (!isConsentReady(grant.subjectReleaseStatus)) blockers.push("subject_release_not_cleared");
    if (!isConsentReady(grant.musicLicenseStatus)) blockers.push("music_license_not_cleared");
    if (!hasMaterialRightsEvidence(grant.evidence)) blockers.push("rights_evidence_required");

    const attributionRules = record(grant.attributionRules);
    if (attributionRules.required === true && !String(grant.attributionText || "").trim()) {
      blockers.push("required_attribution_missing");
    }

    return {
      grantId: Number(grant.id || 0) || null,
      eligible: blockers.length === 0,
      blockers,
    };
  });

  const eligibleGrant = grantEvaluations.find((result) => result.eligible) || null;
  const blockers = eligibleGrant
    ? []
    : grantEvaluations.length
      ? Array.from(new Set(grantEvaluations.flatMap((result) => result.blockers)))
      : ["active_rights_grant_required"];

  return {
    eligible: Boolean(eligibleGrant),
    blockers,
    grantId: eligibleGrant?.grantId ?? null,
    evaluatedAt: now.toISOString(),
    usageType,
    channel,
    territoryId,
  };
}
