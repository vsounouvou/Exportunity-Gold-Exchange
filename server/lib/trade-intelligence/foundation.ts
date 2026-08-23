export type TradeIntelligenceCountry = {
  code: string;
  name: string;
  slug: string;
};

/** The 54 UN member states in Africa. Empty catalog coverage is never evidence. */
export const TRADE_INTELLIGENCE_AFRICA_COUNTRIES = [
  { code: "DZ", name: "Algeria", slug: "algeria" },
  { code: "AO", name: "Angola", slug: "angola" },
  { code: "BJ", name: "Benin", slug: "benin" },
  { code: "BW", name: "Botswana", slug: "botswana" },
  { code: "BF", name: "Burkina Faso", slug: "burkina-faso" },
  { code: "BI", name: "Burundi", slug: "burundi" },
  { code: "CV", name: "Cabo Verde", slug: "cabo-verde" },
  { code: "CM", name: "Cameroon", slug: "cameroon" },
  { code: "CF", name: "Central African Republic", slug: "central-african-republic" },
  { code: "TD", name: "Chad", slug: "chad" },
  { code: "KM", name: "Comoros", slug: "comoros" },
  { code: "CD", name: "Democratic Republic of the Congo", slug: "democratic-republic-congo" },
  { code: "CG", name: "Republic of the Congo", slug: "republic-congo" },
  { code: "CI", name: "Côte d’Ivoire", slug: "cote-divoire" },
  { code: "DJ", name: "Djibouti", slug: "djibouti" },
  { code: "EG", name: "Egypt", slug: "egypt" },
  { code: "GQ", name: "Equatorial Guinea", slug: "equatorial-guinea" },
  { code: "ER", name: "Eritrea", slug: "eritrea" },
  { code: "SZ", name: "Eswatini", slug: "eswatini" },
  { code: "ET", name: "Ethiopia", slug: "ethiopia" },
  { code: "GA", name: "Gabon", slug: "gabon" },
  { code: "GM", name: "Gambia", slug: "gambia" },
  { code: "GH", name: "Ghana", slug: "ghana" },
  { code: "GN", name: "Guinea", slug: "guinea" },
  { code: "GW", name: "Guinea-Bissau", slug: "guinea-bissau" },
  { code: "KE", name: "Kenya", slug: "kenya" },
  { code: "LS", name: "Lesotho", slug: "lesotho" },
  { code: "LR", name: "Liberia", slug: "liberia" },
  { code: "LY", name: "Libya", slug: "libya" },
  { code: "MG", name: "Madagascar", slug: "madagascar" },
  { code: "MW", name: "Malawi", slug: "malawi" },
  { code: "ML", name: "Mali", slug: "mali" },
  { code: "MR", name: "Mauritania", slug: "mauritania" },
  { code: "MU", name: "Mauritius", slug: "mauritius" },
  { code: "MA", name: "Morocco", slug: "morocco" },
  { code: "MZ", name: "Mozambique", slug: "mozambique" },
  { code: "NA", name: "Namibia", slug: "namibia" },
  { code: "NE", name: "Niger", slug: "niger" },
  { code: "NG", name: "Nigeria", slug: "nigeria" },
  { code: "RW", name: "Rwanda", slug: "rwanda" },
  { code: "ST", name: "São Tomé and Príncipe", slug: "sao-tome-principe" },
  { code: "SN", name: "Senegal", slug: "senegal" },
  { code: "SC", name: "Seychelles", slug: "seychelles" },
  { code: "SL", name: "Sierra Leone", slug: "sierra-leone" },
  { code: "SO", name: "Somalia", slug: "somalia" },
  { code: "ZA", name: "South Africa", slug: "south-africa" },
  { code: "SS", name: "South Sudan", slug: "south-sudan" },
  { code: "SD", name: "Sudan", slug: "sudan" },
  { code: "TZ", name: "Tanzania", slug: "tanzania" },
  { code: "TG", name: "Togo", slug: "togo" },
  { code: "TN", name: "Tunisia", slug: "tunisia" },
  { code: "UG", name: "Uganda", slug: "uganda" },
  { code: "ZM", name: "Zambia", slug: "zambia" },
  { code: "ZW", name: "Zimbabwe", slug: "zimbabwe" },
] as const satisfies readonly TradeIntelligenceCountry[];

const TRADE_INTELLIGENCE_PRIORITY_COUNTRY_CODES = new Set<string>([
  "BJ",
  "CI",
  "GH",
  "NG",
  "SN",
]);

export const TRADE_INTELLIGENCE_PRIORITY_COUNTRIES =
  TRADE_INTELLIGENCE_AFRICA_COUNTRIES.filter((country) =>
    TRADE_INTELLIGENCE_PRIORITY_COUNTRY_CODES.has(country.code),
  );

export type TradeIntelligenceSector = {
  code: string;
  name: string;
  nameFr: string;
  description: string;
  canonicalCategoryCodes: readonly string[];
  coverageTier?: "priority" | "research_backlog";
};

/** Initial active sectors. The governed database catalog can extend this list. */
export const TRADE_INTELLIGENCE_PRIORITY_SECTORS = [
  {
    code: "industrial_machinery",
    name: "Industrial machinery",
    nameFr: "Machines industrielles",
    description: "Production machinery, complete lines, and industrial equipment.",
    canonicalCategoryCodes: ["machinery_and_production_equipment"],
  },
  {
    code: "construction_equipment",
    name: "Construction equipment",
    nameFr: "Équipements de construction",
    description: "Heavy equipment, site machinery, and construction systems.",
    canonicalCategoryCodes: ["machinery_and_production_equipment"],
  },
  {
    code: "transport_equipment",
    name: "Transport equipment",
    nameFr: "Équipements de transport",
    description: "Commercial vehicles, rolling stock, and transport equipment.",
    canonicalCategoryCodes: ["machinery_and_production_equipment"],
  },
  {
    code: "agricultural_commodities",
    name: "Agricultural commodities",
    nameFr: "Matières premières agricoles",
    description: "Agricultural raw materials and trade commodities.",
    canonicalCategoryCodes: ["raw_materials"],
  },
  {
    code: "food_agro_processing",
    name: "Food and agro-processing",
    nameFr: "Agroalimentaire et transformation",
    description: "Food inputs, processing equipment, and export-ready outputs.",
    canonicalCategoryCodes: [
      "raw_materials",
      "machinery_and_production_equipment",
      "export_ready_factory_products",
    ],
  },
  {
    code: "energy_solar",
    name: "Energy and solar",
    nameFr: "Énergie et solaire",
    description: "Energy infrastructure, solar systems, and technical inputs.",
    canonicalCategoryCodes: [
      "machinery_and_production_equipment",
      "industrial_inputs_and_consumables",
    ],
  },
  {
    code: "logistics",
    name: "Logistics",
    nameFr: "Logistique",
    description: "Freight, warehousing, customs, and industrial logistics services.",
    canonicalCategoryCodes: ["industrial_services"],
  },
] as const satisfies readonly TradeIntelligenceSector[];

export const TRADE_INTELLIGENCE_COUNTRY_DIMENSIONS = [
  "country_profile",
  "market_access",
  "regulations",
  "tariffs",
  "logistics",
  "companies",
  "products",
  "opportunities",
  "news",
] as const;

export function isTradeIntelligencePriorityCountry(value: unknown) {
  const code = normalizeCountryCode(value);
  return Boolean(code && TRADE_INTELLIGENCE_PRIORITY_COUNTRY_CODES.has(code));
}

export function buildTradeIntelligenceCoverageTargets(
  tenantId: number,
  sectors: readonly TradeIntelligenceSector[] =
    TRADE_INTELLIGENCE_PRIORITY_SECTORS,
) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error("A positive Exportunity tenant id is required.");
  }

  const metadataFor = (country: TradeIntelligenceCountry) => {
    const priority = isTradeIntelligencePriorityCountry(country.code);
    return {
      phase: priority ? "phase_1" : "africa_completion_backlog",
      coverageScope: "africa_54",
      coverageTier: priority ? "priority" : "research_backlog",
      countryName: country.name,
      seededAsCoverageTarget: true,
      emptyCoverageIsNotEvidence: true,
    };
  };

  return [
    ...TRADE_INTELLIGENCE_AFRICA_COUNTRIES.flatMap((country) =>
      TRADE_INTELLIGENCE_COUNTRY_DIMENSIONS.map((dimension) => ({
        tenantId,
        countryCode: country.code,
        dimension,
        sectorCode: "__all__",
        missingFields: ["verified_sources", "verified_facts"],
        metadata: metadataFor(country),
      })),
    ),
    ...TRADE_INTELLIGENCE_AFRICA_COUNTRIES.flatMap((country) =>
      sectors.map((sector) => ({
        tenantId,
        countryCode: country.code,
        dimension: "sector_profile" as const,
        sectorCode: sector.code,
        missingFields: ["market_size", "trade_flows", "companies", "rules"],
        metadata: {
          ...metadataFor(country),
          sectorName: sector.name,
          sectorNameFr: sector.nameFr,
          canonicalCategoryCodes: [...sector.canonicalCategoryCodes],
          sectorCoverageTier: sector.coverageTier || "priority",
        },
      })),
    ),
  ];
}

export const TRADE_PUBLICATION_ELIGIBILITY_THRESHOLD = 75;

export type TradeDemandEventType =
  | "search"
  | "assistant_intent"
  | "requirement"
  | "zero_result"
  | "rfq"
  | "quote"
  | "order";

export type TradeCoverageStatus =
  | "empty"
  | "researching"
  | "partial"
  | "verified"
  | "stale";

export function normalizeTradeKey(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

export function normalizeCountryCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function normalizeTradeSectorCode(value: unknown) {
  if (String(value || "").trim() === "__all__") return "__all__";
  return normalizeTradeKey(value).replace(/-/g, "_");
}

export type TradeIndustrySectorStatus = "draft" | "review" | "active" | "retired";
export type TradeIndustrySectorAction =
  | "submit_for_review"
  | "activate"
  | "retire";

export function resolveTradeIndustrySectorTransition(
  status: string,
  action: string,
): TradeIndustrySectorStatus | null {
  if (status === "draft" && action === "submit_for_review") return "review";
  if (status === "review" && action === "activate") return "active";
  if (status === "active" && action === "retire") return "retired";
  return null;
}

export function inferTradeSectorCode(input: {
  categoryCode?: string | null;
  requirementType?: string | null;
  productName?: string | null;
  details?: string | null;
}) {
  const normalized = normalizeTradeKey(
    [
      input.categoryCode,
      input.requirementType,
      input.productName,
      input.details,
    ]
      .filter(Boolean)
      .join(" "),
  ).replace(/-/g, " ");
  if (/\b(logistic|freight|shipping|transport service|warehouse|customs broker)\b/.test(normalized)) {
    return "logistics";
  }
  if (/\b(solar|photovoltaic|battery|inverter|renewable energy)\b/.test(normalized)) {
    return "energy_solar";
  }
  if (/\b(excavator|bulldozer|loader|crane|concrete mixer|construction equipment)\b/.test(normalized)) {
    return "construction_equipment";
  }
  if (/\b(truck|bus|trailer|vehicle|transport equipment|rolling stock)\b/.test(normalized)) {
    return "transport_equipment";
  }
  if (
    /\b(palm oil|huile de palme|cocoa|cacao|cashew|anacarde|cotton|coton|coffee|cafe|sesame|maize|mais|corn|rice|riz|soy|soja|shea|karite|agricultural commodit|matiere premiere agricole)\b/.test(
      normalized,
    )
  ) {
    return "agricultural_commodities";
  }
  if (/\b(food|beverage|agro process|edible|flour|juice|packaged food)\b/.test(normalized)) {
    return "food_agro_processing";
  }
  if (
    input.categoryCode === "machinery_and_production_equipment" ||
    input.requirementType === "machinery"
  ) {
    return "industrial_machinery";
  }
  return null;
}

const TRADE_INTELLIGENCE_DESTINATION_ALIASES = ([
  ...TRADE_INTELLIGENCE_AFRICA_COUNTRIES.flatMap((country) => [
    [normalizeTradeKey(country.name).replace(/-/g, " "), country.code] as [string, string],
    [country.slug.replace(/-/g, " "), country.code] as [string, string],
  ]),
  ["algerie", "DZ"],
  ["afrique du sud", "ZA"],
  ["cap vert", "CV"],
  ["cameroun", "CM"],
  ["republique centrafricaine", "CF"],
  ["tchad", "TD"],
  ["comores", "KM"],
  ["republique democratique du congo", "CD"],
  ["congo kinshasa", "CD"],
  ["dr congo", "CD"],
  ["drc", "CD"],
  ["congo brazzaville", "CG"],
  ["ivory coast", "CI"],
  ["egypte", "EG"],
  ["guinee equatoriale", "GQ"],
  ["erythree", "ER"],
  ["ethiopie", "ET"],
  ["libye", "LY"],
  ["mauritanie", "MR"],
  ["maurice", "MU"],
  ["maroc", "MA"],
  ["namibie", "NA"],
  ["sao tome et principe", "ST"],
  ["somalie", "SO"],
  ["soudan du sud", "SS"],
  ["soudan", "SD"],
  ["tanzanie", "TZ"],
  ["tunisie", "TN"],
  ["ouganda", "UG"],
  ["zambie", "ZM"],
  ["abidjan", "CI"],
  ["bouake", "CI"],
  ["san pedro", "CI"],
  ["cotonou", "BJ"],
  ["porto novo", "BJ"],
  ["parakou", "BJ"],
  ["accra", "GH"],
  ["tema", "GH"],
  ["kumasi", "GH"],
  ["takoradi", "GH"],
  ["lagos", "NG"],
  ["abuja", "NG"],
  ["kano", "NG"],
  ["port harcourt", "NG"],
  ["dakar", "SN"],
  ["thies", "SN"],
  ["saint louis", "SN"],
] as Array<[string, string]>).sort(
  (left, right) => right[0].length - left[0].length,
);

export function inferAfricaDestinationCountryCode(value: unknown) {
  const normalized = normalizeTradeKey(value).replace(/-/g, " ");
  if (!normalized) return null;
  const padded = ` ${normalized} `;
  return (
    TRADE_INTELLIGENCE_DESTINATION_ALIASES.find(([alias]) =>
      padded.includes(` ${alias} `),
    )?.[1] || null
  );
}

/** @deprecated Use inferAfricaDestinationCountryCode for new demand capture. */
export function inferPhaseOneDestinationCountryCode(value: unknown) {
  const code = inferAfricaDestinationCountryCode(value);
  return isTradeIntelligencePriorityCountry(code) ? code : null;
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateTradePublicationEligibility(input: {
  factCount: number;
  verifiedFactCount: number;
  independentSourceCount: number;
  sourceTrustScores: number[];
  freshestVerifiedAt?: Date | string | null;
  hasConflicts?: boolean;
  now?: Date;
}) {
  const factCount = Math.max(0, Math.floor(input.factCount || 0));
  const verifiedFactCount = Math.min(
    factCount,
    Math.max(0, Math.floor(input.verifiedFactCount || 0)),
  );
  const independentSourceCount = Math.max(
    0,
    Math.floor(input.independentSourceCount || 0),
  );
  const trustScores = input.sourceTrustScores
    .map((value) => clamp(Number(value), 0, 1))
    .filter(Number.isFinite);
  const averageTrust = trustScores.length
    ? trustScores.reduce((sum, value) => sum + value, 0) / trustScores.length
    : 0;
  const verificationRatio = factCount ? verifiedFactCount / factCount : 0;
  const evidenceScore = Math.min(30, factCount * 6);
  const verificationScore = verificationRatio * 25;
  const diversityScore = Math.min(15, independentSourceCount * 7.5);
  const trustScore = averageTrust * 15;

  const now = input.now || new Date();
  const freshest = input.freshestVerifiedAt
    ? new Date(input.freshestVerifiedAt)
    : null;
  const ageDays =
    freshest && !Number.isNaN(freshest.valueOf())
      ? Math.max(0, (now.valueOf() - freshest.valueOf()) / 86_400_000)
      : Number.POSITIVE_INFINITY;
  const freshnessScore =
    ageDays <= 90 ? 15 : ageDays <= 180 ? 10 : ageDays <= 365 ? 5 : 0;
  const conflictPenalty = input.hasConflicts ? 30 : 0;
  const score = Math.round(
    clamp(
      evidenceScore +
        verificationScore +
        diversityScore +
        trustScore +
        freshnessScore -
        conflictPenalty,
      0,
      100,
    ),
  );

  const reasons: string[] = [];
  if (factCount < 2) reasons.push("At least two cited facts are required.");
  if (verifiedFactCount < 2) {
    reasons.push("At least two facts must complete human verification.");
  }
  if (independentSourceCount < 2) {
    reasons.push("At least two independent sources are required.");
  }
  if (ageDays > 365) reasons.push("Verified evidence is stale or missing.");
  if (input.hasConflicts) reasons.push("Conflicting evidence requires review.");
  if (score < TRADE_PUBLICATION_ELIGIBILITY_THRESHOLD) {
    reasons.push(
      `The evidence quality score is below ${TRADE_PUBLICATION_ELIGIBILITY_THRESHOLD}.`,
    );
  }

  return {
    score,
    eligible:
      score >= TRADE_PUBLICATION_ELIGIBILITY_THRESHOLD &&
      factCount >= 2 &&
      verifiedFactCount >= 2 &&
      independentSourceCount >= 2 &&
      ageDays <= 365 &&
      !input.hasConflicts,
    reasons,
    metrics: {
      factCount,
      verifiedFactCount,
      independentSourceCount,
      averageTrust: Number(averageTrust.toFixed(3)),
      ageDays: Number.isFinite(ageDays) ? Math.round(ageDays) : null,
    },
  };
}

export function deriveTradeCoverage(input: {
  expectedFacts: number;
  factCount: number;
  verifiedFactCount: number;
  sourceCount: number;
  lastVerifiedAt?: Date | string | null;
  researchInProgress?: boolean;
  now?: Date;
}) {
  const expectedFacts = Math.max(1, Math.floor(input.expectedFacts || 1));
  const factCount = Math.max(0, Math.floor(input.factCount || 0));
  const verifiedFactCount = Math.min(
    factCount,
    Math.max(0, Math.floor(input.verifiedFactCount || 0)),
  );
  const sourceCount = Math.max(0, Math.floor(input.sourceCount || 0));
  const evidenceCoverage = Math.min(1, factCount / expectedFacts);
  const verificationRatio = factCount ? verifiedFactCount / factCount : 0;
  const sourceDiversity = Math.min(1, sourceCount / 2);
  const coveragePercent = Math.round(evidenceCoverage * 100);
  const qualityScore = Math.round(
    clamp(
      evidenceCoverage * 40 + verificationRatio * 40 + sourceDiversity * 20,
      0,
      100,
    ),
  );

  const verifiedDate = input.lastVerifiedAt
    ? new Date(input.lastVerifiedAt)
    : null;
  const now = input.now || new Date();
  const isStale =
    Boolean(verifiedDate && !Number.isNaN(verifiedDate.valueOf())) &&
    now.valueOf() - (verifiedDate?.valueOf() || 0) > 365 * 86_400_000;

  let status: TradeCoverageStatus;
  if (isStale) status = "stale";
  else if (!factCount) status = input.researchInProgress ? "researching" : "empty";
  else if (
    coveragePercent === 100 &&
    verificationRatio === 1 &&
    sourceCount >= 2
  ) {
    status = "verified";
  } else {
    status = input.researchInProgress ? "researching" : "partial";
  }

  return { status, coveragePercent, qualityScore };
}

export type TradeDemandRadarInput = {
  eventType: TradeDemandEventType | string;
  normalizedProduct?: string | null;
  queryText?: string | null;
  destinationCountryCode?: string | null;
  sectorCode?: string | null;
  commercialIntent?: string | null;
  resultCount?: number | null;
  difficultyScore?: number | null;
  estimatedValue?: string | number | null;
  currencyCode?: string | null;
};

const DEMAND_WEIGHTS: Record<string, number> = {
  search: 1,
  assistant_intent: 2,
  requirement: 6,
  zero_result: 4,
  rfq: 8,
  quote: 10,
  order: 15,
};

export function buildTradeDemandRadar(events: TradeDemandRadarInput[]) {
  const groups = new Map<
    string,
    {
      product: string;
      destinationCountryCode: string | null;
      sectorCode: string | null;
      eventCount: number;
      zeroResultCount: number;
      commercialEventCount: number;
      score: number;
      difficultyTotal: number;
      estimatedValues: Record<string, number>;
    }
  >();

  for (const event of events) {
    const product = normalizeTradeKey(
      event.normalizedProduct || event.queryText || "unclassified-demand",
    );
    if (!product) continue;
    const country = normalizeCountryCode(event.destinationCountryCode);
    const sector = normalizeTradeSectorCode(event.sectorCode) || null;
    const key = `${product}|${country || "__unknown__"}|${sector || "__all__"}`;
    const current = groups.get(key) || {
      product,
      destinationCountryCode: country,
      sectorCode: sector,
      eventCount: 0,
      zeroResultCount: 0,
      commercialEventCount: 0,
      score: 0,
      difficultyTotal: 0,
      estimatedValues: {},
    };
    const weight = DEMAND_WEIGHTS[event.eventType] || 1;
    const difficulty = clamp(Number(event.difficultyScore || 0), 0, 100);
    current.eventCount += 1;
    current.zeroResultCount +=
      event.eventType === "zero_result" || event.resultCount === 0 ? 1 : 0;
    current.commercialEventCount +=
      event.eventType === "requirement" ||
      event.eventType === "rfq" ||
      event.eventType === "quote" ||
      event.eventType === "order" ||
      Boolean(event.commercialIntent)
        ? 1
        : 0;
    current.score += weight + difficulty / 25;
    current.difficultyTotal += difficulty;
    const currency = String(event.currencyCode || "").trim().toUpperCase();
    const estimatedValue = Number(event.estimatedValue || 0);
    if (currency && Number.isFinite(estimatedValue) && estimatedValue > 0) {
      current.estimatedValues[currency] =
        (current.estimatedValues[currency] || 0) + estimatedValue;
    }
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => ({
      product: group.product,
      destinationCountryCode: group.destinationCountryCode,
      sectorCode: group.sectorCode,
      eventCount: group.eventCount,
      zeroResultCount: group.zeroResultCount,
      commercialEventCount: group.commercialEventCount,
      demandScore: Number(group.score.toFixed(2)),
      averageDifficulty: Number(
        (group.difficultyTotal / group.eventCount).toFixed(1),
      ),
      estimatedValues: group.estimatedValues,
    }))
    .sort(
      (left, right) =>
        right.demandScore - left.demandScore ||
        right.eventCount - left.eventCount ||
        left.product.localeCompare(right.product),
    );
}

export function shouldProposeZeroResultMission(input: {
  eventType: TradeDemandEventType | string;
  resultCount?: number | null;
  normalizedProduct?: string | null;
  queryText?: string | null;
  commercialIntent?: string | null;
}) {
  const product = normalizeTradeKey(input.normalizedProduct || input.queryText);
  return Boolean(
    product &&
      (input.eventType === "zero_result" || input.resultCount === 0) &&
      (input.commercialIntent || input.eventType === "zero_result"),
  );
}

export function buildZeroResultResearchMission(input: {
  normalizedProduct?: string | null;
  queryText?: string | null;
  destinationCountryCode?: string | null;
  sectorCode?: string | null;
  difficultyScore?: number | null;
}) {
  const product = normalizeTradeKey(input.normalizedProduct || input.queryText);
  if (!product) throw new Error("A normalized product or query is required.");
  const countryCode = normalizeCountryCode(input.destinationCountryCode);
  const sectorCode = normalizeTradeSectorCode(input.sectorCode) || null;
  const difficulty = clamp(Number(input.difficultyScore || 0), 0, 100);
  return {
    missionType: "zero_result_investigation",
    title: `Investigate unmet demand: ${product.replace(/-/g, " ")}`,
    objective: [
      `Find verifiable suppliers, products, market-access rules, and logistics options for ${product.replace(/-/g, " ")}.`,
      countryCode ? `Destination market: ${countryCode}.` : null,
      "Record source URLs and field-level evidence; do not publish or contact external parties without approval.",
    ]
      .filter(Boolean)
      .join(" "),
    countryCode,
    sectorCode,
    priority: difficulty >= 75 ? "urgent" : difficulty >= 45 ? "high" : "medium",
    evidenceRequirements: [
      "At least two independent sources",
      "Supplier or producer evidence",
      "Applicable market-access or regulatory evidence",
      "Logistics route evidence",
    ],
  } as const;
}
