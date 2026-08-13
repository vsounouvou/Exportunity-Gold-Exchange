export const INDUSTRIAL_SUPPLIER_STATUSES = [
  "draft",
  "under_review",
  "active",
  "suspended",
  "archived",
] as const;

export type IndustrialSupplierStatus =
  (typeof INDUSTRIAL_SUPPLIER_STATUSES)[number];

export const INDUSTRIAL_SUPPLIER_NDA_STATUSES = [
  "not_assessed",
  "under_review",
  "signed",
  "not_required",
] as const;

export type IndustrialSupplierNdaStatus =
  (typeof INDUSTRIAL_SUPPLIER_NDA_STATUSES)[number];

export const INDUSTRIAL_SUPPLIER_CAPABILITY_EXAMPLES = [
  "CNC machining",
  "turning",
  "milling",
  "casting",
  "welding",
  "fabrication",
  "sheet metal",
  "3D printing",
  "industrial electrical work",
  "motor repair",
  "pump repair",
  "automation",
  "battery systems",
  "equipment installation",
  "commissioning",
  "maintenance",
] as const;

type SupplierCapabilityRecord = {
  supplierStatus: string;
  verificationStatus: string;
  categoryCodes?: unknown;
  capabilities?: unknown;
  industriesServed?: unknown;
  materialsHandled?: unknown;
  email?: unknown;
  phone?: unknown;
  website?: unknown;
  verifiedAt?: unknown;
};

type IndustrialRequirementForMatching = {
  categoryCode: string;
  requirementType: string;
  title?: string | null;
  details?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  specification?: string | null;
};

export function normalizeIndustrialStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const values: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(normalized);
  }

  return values;
}

export function normalizeIndustrialSupplierProfileInput(input: {
  countryCode?: unknown;
  industriesServed?: unknown;
  categoryCodes?: unknown;
  capabilities?: unknown;
  equipmentAvailable?: unknown;
  materialsHandled?: unknown;
  certifications?: unknown;
  technicalDocumentReferences?: unknown;
  mediaReferences?: unknown;
}) {
  return {
    countryCode: String(input.countryCode || "").trim().toUpperCase(),
    industriesServed: normalizeIndustrialStringList(input.industriesServed),
    categoryCodes: normalizeIndustrialStringList(input.categoryCodes),
    capabilities: normalizeIndustrialStringList(input.capabilities),
    equipmentAvailable: normalizeIndustrialStringList(input.equipmentAvailable),
    materialsHandled: normalizeIndustrialStringList(input.materialsHandled),
    certifications: normalizeIndustrialStringList(input.certifications),
    technicalDocumentReferences: normalizeIndustrialStringList(
      input.technicalDocumentReferences,
    ),
    mediaReferences: normalizeIndustrialStringList(input.mediaReferences),
  };
}

export function isSupplierEligibleForCapabilityMatching(
  supplier: Pick<SupplierCapabilityRecord, "supplierStatus" | "verificationStatus">,
) {
  return (
    supplier.supplierStatus === "active" &&
    supplier.verificationStatus === "verified"
  );
}

function normalizedTerms(value: string | null | undefined) {
  return String(value || "")
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((term) => term.length >= 3);
}

function hasTermOverlap(values: string[], source: string) {
  const sourceTerms = new Set(normalizedTerms(source));
  return values.some((value) =>
    normalizedTerms(value).some((term) => sourceTerms.has(term)),
  );
}

export function scoreIndustrialSupplierCapabilityMatch(
  supplier: SupplierCapabilityRecord,
  requirement: IndustrialRequirementForMatching,
) {
  if (!isSupplierEligibleForCapabilityMatching(supplier)) {
    return {
      eligible: false,
      score: 0,
      matchedCategory: false,
      matchedCapability: false,
      matchedIndustry: false,
      matchedMaterial: false,
      relevanceScore: 0,
      verificationScore: 0,
      contactabilityScore: 0,
    };
  }

  const categoryCodes = normalizeIndustrialStringList(supplier.categoryCodes);
  const capabilities = normalizeIndustrialStringList(supplier.capabilities);
  const industriesServed = normalizeIndustrialStringList(supplier.industriesServed);
  const materialsHandled = normalizeIndustrialStringList(supplier.materialsHandled);
  const normalizedCategory = String(requirement.categoryCode || "")
    .trim()
    .toLocaleLowerCase("fr");
  const requirementText = [
    requirement.requirementType,
    requirement.title,
    requirement.details,
    requirement.productName,
    requirement.productCategory,
    requirement.specification,
  ]
    .filter(Boolean)
    .join(" ");
  const matchedCategory = categoryCodes.some(
    (category) => {
      const normalized = category.toLocaleLowerCase("fr");
      return (
        normalized === normalizedCategory ||
        normalized === String(requirement.productCategory || "").toLocaleLowerCase("fr") ||
        hasTermOverlap([category], requirementText)
      );
    },
  );
  const matchedCapability = hasTermOverlap(capabilities, requirementText);
  const matchedIndustry = hasTermOverlap(industriesServed, requirementText);
  const matchedMaterial = hasTermOverlap(materialsHandled, requirementText);
  const relevanceScore = Math.min(
    100,
    (matchedCategory ? 45 : 0) +
      (matchedMaterial ? 30 : 0) +
      (matchedCapability ? 15 : 0) +
      (matchedIndustry ? 10 : 0),
  );
  const verificationScore = supplier.verifiedAt ? 100 : 85;
  const contactabilityScore = Math.min(
    100,
    (String(supplier.email || "").trim() ? 55 : 0) +
      (String(supplier.phone || "").trim() ? 30 : 0) +
      (String(supplier.website || "").trim() ? 15 : 0),
  );
  const score = Math.round(
    relevanceScore * 0.7 + verificationScore * 0.2 + contactabilityScore * 0.1,
  );

  return {
    eligible: true,
    score,
    matchedCategory,
    matchedCapability,
    matchedIndustry,
    matchedMaterial,
    relevanceScore,
    verificationScore,
    contactabilityScore,
  };
}

export function nextIndustrialSupplierReviewState(
  action: "request_changes" | "approve" | "suspend" | "archive",
) {
  switch (action) {
    case "approve":
      return {
        supplierStatus: "active" as const,
        verificationStatus: "verified" as const,
      };
    case "suspend":
      return {
        supplierStatus: "suspended" as const,
        verificationStatus: "suspended" as const,
      };
    case "archive":
      return {
        supplierStatus: "archived" as const,
        verificationStatus: "unverified" as const,
      };
    default:
      return {
        supplierStatus: "under_review" as const,
        verificationStatus: "under_review" as const,
      };
  }
}
