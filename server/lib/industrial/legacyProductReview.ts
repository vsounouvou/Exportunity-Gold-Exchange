export const INDUSTRIAL_LEGACY_PRODUCT_REVIEW_STATUSES = [
  "APPROVED_EXPORT_PRODUCT",
  "APPROVED_MACHINERY",
  "APPROVED_RAW_MATERIAL",
  "APPROVED_INDUSTRIAL_INPUT",
  "APPROVED_SPARE_PART",
  "APPROVED_INDUSTRIAL_SERVICE",
  "REQUIRES_RECLASSIFICATION",
  "REQUIRES_VERIFICATION",
  "INCOMPLETE",
  "DUPLICATE",
  "OUT_OF_SCOPE",
  "ARCHIVED",
] as const;

export type IndustrialLegacyProductReviewStatus =
  (typeof INDUSTRIAL_LEGACY_PRODUCT_REVIEW_STATUSES)[number];

export type IndustrialCatalogClassification =
  | "export_ready_factory_product"
  | "machinery"
  | "raw_material"
  | "industrial_input"
  | "spare_part"
  | "industrial_service";

export type LegacyProductScopeInput = {
  name: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  sku?: string | null;
  images?: unknown;
  isDemo?: boolean | null;
  isProducer?: boolean | null;
  productionType?: string | null;
};

export type LegacyProductReviewRecommendation = {
  status: IndustrialLegacyProductReviewStatus;
  classification: IndustrialCatalogClassification | null;
  reason: string;
};

const APPROVED_STATUS_CLASSIFICATIONS: Partial<
  Record<IndustrialLegacyProductReviewStatus, IndustrialCatalogClassification>
> = {
  APPROVED_EXPORT_PRODUCT: "export_ready_factory_product",
  APPROVED_MACHINERY: "machinery",
  APPROVED_RAW_MATERIAL: "raw_material",
  APPROVED_INDUSTRIAL_INPUT: "industrial_input",
  APPROVED_SPARE_PART: "spare_part",
  APPROVED_INDUSTRIAL_SERVICE: "industrial_service",
};

const RETAIL_CATEGORY_TERMS = [
  "bakery",
  "pastr",
  "beverage",
  "boisson",
  "food",
  "alimentation",
  "ready-meal",
  "plat",
  "beauty",
  "cosmetic",
  "pharmacy",
  "wellness",
  "fashion",
  "clothing",
  "mode",
  "home-decor",
  "decoration",
  "stationery",
  "papeterie",
  "transport",
];

function compact(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("en-US");
}

function hasImages(images: unknown) {
  if (Array.isArray(images)) return images.some((entry) => String(entry || "").trim());
  return Boolean(String(images || "").trim());
}

export function normalizeLegacyProductName(value: string) {
  return compact(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function classificationForApprovedLegacyProductReviewStatus(
  status: IndustrialLegacyProductReviewStatus,
) {
  return APPROVED_STATUS_CLASSIFICATIONS[status] || null;
}

export function recommendLegacyProductReview(
  input: LegacyProductScopeInput,
): LegacyProductReviewRecommendation {
  const category = `${compact(input.categorySlug)} ${compact(input.categoryName)}`;
  const description = `${compact(input.shortDescription)} ${compact(input.description)}`;
  const name = compact(input.name);

  if (input.isDemo) {
    return {
      status: "OUT_OF_SCOPE",
      classification: null,
      reason:
        "Legacy demonstration record. It cannot enter the Exportunity industrial public surface without a separate verified industrial source.",
    };
  }

  if (!name || (!description && !input.sku && !hasImages(input.images))) {
    return {
      status: "INCOMPLETE",
      classification: null,
      reason:
        "The legacy record lacks enough technical or commercial evidence for industrial review.",
    };
  }

  if (RETAIL_CATEGORY_TERMS.some((term) => category.includes(term))) {
    return {
      status: "OUT_OF_SCOPE",
      classification: null,
      reason:
        "The current category is consumer retail and does not belong in Exportunity's industrial public experience.",
    };
  }

  if (/\b(spare|bearing|belt|chain|seal|valve|motor|gear|coupling|sensor)\b/.test(`${name} ${description}`)) {
    return {
      status: "REQUIRES_VERIFICATION",
      classification: "spare_part",
      reason:
        "The record may be an industrial spare part, but supplier, compatibility, and technical specifications require verification.",
    };
  }

  if (/\b(machine|machinery|equipment|compressor|generator|pump|conveyor|production line)\b/.test(`${name} ${description}`)) {
    return {
      status: "REQUIRES_VERIFICATION",
      classification: "machinery",
      reason:
        "The record may be industrial equipment, but manufacturer, model, capacity, and verification evidence require review.",
    };
  }

  if (/agric|commodity|raw material|matiere premiere|intrant/.test(category)) {
    return {
      status: "REQUIRES_VERIFICATION",
      classification: "raw_material",
      reason:
        "The record may be an industrial raw material, but the producing company, specifications, and supply evidence require verification.",
    };
  }

  if (/repair|reparation|maintenance|service/.test(category)) {
    return {
      status: "REQUIRES_VERIFICATION",
      classification: "industrial_service",
      reason:
        "The record may be an industrial service, but provider capability and technical scope require verification.",
    };
  }

  if (/hardware|tool|quincaillerie|outil|industrial input|consumable/.test(category)) {
    return {
      status: "REQUIRES_RECLASSIFICATION",
      classification: "industrial_input",
      reason:
        "The record may be an industrial input, but its intended factory use and controlled taxonomy category require a staff decision.",
    };
  }

  if (input.isProducer || /manufactur|factory|export/.test(`${name} ${description}`)) {
    return {
      status: "REQUIRES_VERIFICATION",
      classification: "export_ready_factory_product",
      reason:
        "The record may represent factory production, but factory ownership, capacity, and export evidence require verification.",
    };
  }

  return {
    status: "REQUIRES_RECLASSIFICATION",
    classification: null,
    reason:
      "The legacy category does not map safely to the controlled Exportunity industrial taxonomy.",
  };
}
