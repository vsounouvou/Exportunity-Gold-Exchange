export const TERRITORY_COVERAGE_DIMENSIONS = [
  "producer",
  "buyer",
  "creator",
  "carrier",
  "payment",
  "language",
  "content",
] as const;

export type TerritoryCoverageDimension = (typeof TERRITORY_COVERAGE_DIMENSIONS)[number];
export type TerritoryOperatingMode = "research_only" | "media_pilot" | "commerce";
export type CoverageStatus = "unknown" | "gap" | "candidate" | "verified" | "working";

export type CoverageDimensionValue = {
  status: CoverageStatus;
  count?: number;
  evidenceRefs?: string[];
  note?: string;
};

export type TerritoryCoverageInput = Partial<Record<TerritoryCoverageDimension, CoverageDimensionValue>>;

export const TERRITORY_ACTIVATION_WORKSTREAMS = [
  {
    key: "territory_research",
    agent: "data" as const,
    departmentKey: "territory_intelligence",
    roleKey: "territory_research_lead",
    responsibility: "Close geography, demand, language, and operating-data gaps with cited evidence.",
  },
  {
    key: "producer_discovery",
    agent: "client_hunter" as const,
    departmentKey: "producer_network",
    roleKey: "producer_scout",
    responsibility: "Discover producer candidates and retain source provenance without claiming verification.",
  },
  {
    key: "buyer_discovery",
    agent: "client_hunter" as const,
    departmentKey: "commercial_growth",
    roleKey: "buyer_scout",
    responsibility: "Map aggregated buyer demand and qualified commercial-intent gaps.",
  },
  {
    key: "creator_discovery",
    agent: "media" as const,
    departmentKey: "media_growth_territory",
    roleKey: "creator_scout",
    responsibility: "Record creator content as source references; never copy or reuse it before rights clearance.",
  },
  {
    key: "carrier_coverage",
    agent: "ops" as const,
    departmentKey: "fulfillment",
    roleKey: "carrier_coverage_analyst",
    responsibility: "Identify carrier candidates and distinguish discovery from verified contractual readiness.",
  },
  {
    key: "payment_readiness",
    agent: "compliance" as const,
    departmentKey: "protected_payment",
    roleKey: "payment_readiness_reviewer",
    responsibility: "Verify provider capability and legal wording before any protected-payment claim.",
  },
  {
    key: "language_localization",
    agent: "marketing" as const,
    departmentKey: "media_growth_territory",
    roleKey: "language_localization_lead",
    responsibility: "Prepare canonical-language and localized content requirements for the territory.",
  },
  {
    key: "content_reserve",
    agent: "media" as const,
    departmentKey: "media_growth_territory",
    roleKey: "content_reserve_editor",
    responsibility: "Plan a rights-cleared content reserve and accurate manual publication packages.",
  },
  {
    key: "team_staffing",
    agent: "ops" as const,
    departmentKey: "territory_operations",
    roleKey: "territory_team_coordinator",
    responsibility: "Prepare bounded agent and human assignments without starting autonomous execution.",
  },
  {
    key: "budget_readiness",
    agent: "compliance" as const,
    departmentKey: "territory_operations",
    roleKey: "budget_authorization_reviewer",
    responsibility: "Check budget envelopes, approval limits, and prohibited spend before activation.",
  },
  {
    key: "field_validation",
    agent: "ops" as const,
    departmentKey: "territory_operations",
    roleKey: "field_validation_coordinator",
    responsibility: "Prepare human field-validation assignments for facts that cannot be verified remotely.",
  },
] as const;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean)),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeCoverageStatus(value: unknown): CoverageStatus {
  const status = String(value || "").trim().toLowerCase();
  if (
    status === "gap" ||
    status === "candidate" ||
    status === "verified" ||
    status === "working"
  ) {
    return status;
  }
  return "unknown";
}

export function normalizeTerritoryCoverage(value: unknown): TerritoryCoverageInput {
  const input = asRecord(value);
  const normalized: TerritoryCoverageInput = {};
  for (const key of TERRITORY_COVERAGE_DIMENSIONS) {
    const raw = asRecord(input[key]);
    normalized[key] = {
      status: normalizeCoverageStatus(raw.status),
      count: Number.isFinite(Number(raw.count)) ? Math.max(0, Math.trunc(Number(raw.count))) : undefined,
      evidenceRefs: asStringArray(raw.evidenceRefs),
      note: String(raw.note || "").trim() || undefined,
    };
  }
  return normalized;
}

function isCoverageReady(value: CoverageDimensionValue | undefined) {
  return value?.status === "verified" || value?.status === "working";
}

export function evaluateTerritoryActivationReadiness(input: {
  territory: {
    territoryType?: unknown;
    centerLat?: unknown;
    centerLng?: unknown;
    geometryGeojson?: unknown;
    radiusMeters?: unknown;
    source?: unknown;
    sourceRef?: unknown;
  };
  profile: {
    operatingMode?: unknown;
    primaryLanguage?: unknown;
    prioritySectors?: unknown;
    geographyEvidence?: unknown;
  };
  coverage?: unknown;
}) {
  const operatingModeRaw = String(input.profile.operatingMode || "research_only")
    .trim()
    .toLowerCase();
  const operatingMode: TerritoryOperatingMode =
    operatingModeRaw === "media_pilot" || operatingModeRaw === "commerce"
      ? operatingModeRaw
      : "research_only";
  const coverage = normalizeTerritoryCoverage(input.coverage);
  const blockers: string[] = [];
  const dataGaps: string[] = [];

  if (String(input.territory.territoryType || "").toLowerCase() !== "neighborhood") {
    blockers.push("neighborhood_operating_unit_required");
  }

  const lat = Number(input.territory.centerLat);
  const lng = Number(input.territory.centerLng);
  const hasUsableCenter =
    Number.isFinite(lat) && Number.isFinite(lng) && !(Math.abs(lat) < 0.0000001 && Math.abs(lng) < 0.0000001);
  const hasBoundaryOrRadius =
    Boolean(input.territory.geometryGeojson) || Number(input.territory.radiusMeters) > 0;
  const geographyEvidence = asRecord(input.profile.geographyEvidence);
  const canonicalSourceConfirmed =
    Boolean(String(input.territory.source || "").trim()) &&
    Boolean(String(input.territory.sourceRef || "").trim());
  const manualEvidenceConfirmed =
    geographyEvidence.confirmed === true &&
    Boolean(String(geographyEvidence.reference || geographyEvidence.sourceRef || "").trim());

  if (!hasUsableCenter || !hasBoundaryOrRadius || (!canonicalSourceConfirmed && !manualEvidenceConfirmed)) {
    blockers.push("verified_geography_evidence_required");
  }

  if (!String(input.profile.primaryLanguage || "").trim()) {
    blockers.push("primary_language_required");
  }
  if (!asStringArray(input.profile.prioritySectors).length) {
    blockers.push("priority_sector_required");
  }

  for (const key of TERRITORY_COVERAGE_DIMENSIONS) {
    const status = coverage[key]?.status || "unknown";
    if (status === "unknown" || status === "gap") dataGaps.push(`${key}_coverage_gap`);
  }

  if (operatingMode === "media_pilot") {
    if (!isCoverageReady(coverage.creator)) blockers.push("verified_creator_coverage_required_for_media_pilot");
    if (!isCoverageReady(coverage.content)) blockers.push("rights_cleared_content_required_for_media_pilot");
  }

  if (operatingMode === "commerce") {
    if (!isCoverageReady(coverage.producer)) blockers.push("verified_producer_coverage_required_for_commerce");
    if (!isCoverageReady(coverage.carrier)) blockers.push("verified_carrier_path_required_for_commerce");
    if (!isCoverageReady(coverage.payment)) blockers.push("verified_payment_path_required_for_commerce");
  }

  const uniqueBlockers = Array.from(new Set(blockers));
  const uniqueDataGaps = Array.from(new Set(dataGaps));
  return {
    operatingMode,
    eligibleForApproval: uniqueBlockers.length === 0,
    readinessStatus: uniqueBlockers.length ? "blocked" : "approval_ready",
    blockers: uniqueBlockers,
    dataGaps: uniqueDataGaps,
    coverage,
    coverageStatus: uniqueDataGaps.length ? "gaps_identified" : "verified",
  } as const;
}
