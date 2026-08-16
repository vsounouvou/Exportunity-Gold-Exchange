export type CommercialStaffingContext = {
  intent?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  requirementType: string;
  missingSpecialistKeys?: string[];
};

export type CommercialStaffingSignalType =
  | "recurring_demand"
  | "critical_capability_gap"
  | "inactive_capacity"
  | "active_capacity"
  | "capacity_expansion";

export type CommercialStaffingRecommendation = {
  roleTitle: string;
  signalType: CommercialStaffingSignalType;
  demandThreshold: number;
  rationale: string;
  roleCode?: string;
  departmentKey?: string;
  dynamicRoleSeat?: boolean;
};

const RECURRING_DEMAND_THRESHOLDS: Record<string, number> = {
  "Palm Oil Desk Agent": 10,
  "Cocoa Desk Agent": 10,
  "Coffee Desk Agent": 10,
  "Cashew Desk Agent": 10,
  "Machinery and Industrial Equipment Desk Agent": 5,
  "Buyer Intelligence Lead": 5,
};

const CASE_CAPACITY_BY_ROLE: Record<string, number> = {
  "Machinery and Industrial Equipment Desk Agent": 4,
  "Specification Agent": 4,
  "Quality Documentation Agent": 4,
  "Trade Compliance Agent": 4,
  "Commercial Finance Agent": 6,
  "Freight Routing Agent": 6,
  "Account Executive": 8,
  "Supplier Discovery Agent": 8,
  "Buyer Intelligence Lead": 8,
};

const DEFAULT_CASE_CAPACITY = 6;
const CAPACITY_EXPANSION_DEMAND_THRESHOLD = 2;

const MISSING_SPECIALIST_ROLES: Record<string, string> = {
  commercial: "Account Executive",
  sourcing: "Supplier Discovery Agent",
  technical: "Specification Agent",
  logistics: "Freight Routing Agent",
  finance: "Commercial Finance Agent",
  quality: "Quality Documentation Agent",
  compliance: "Trade Compliance Agent",
};

const DYNAMIC_PRODUCT_LABELS: Record<string, string> = {
  soybean_oil: "Soybean Oil",
  shea: "Shea",
  cotton: "Cotton",
  sesame: "Sesame",
  maize: "Maize",
  rice: "Rice",
  sugar: "Sugar",
  steel: "Steel",
  cement: "Cement",
  aluminium: "Aluminium",
  polymer: "Industrial Polymer",
};

const DYNAMIC_PRODUCT_NAME_ALIASES: Array<{
  category: keyof typeof DYNAMIC_PRODUCT_LABELS;
  terms: string[];
}> = [
  { category: "soybean_oil", terms: ["soybean oil", "soya oil", "huile de soja"] },
  { category: "shea", terms: ["shea butter", "beurre de karite", "karite"] },
  { category: "cotton", terms: ["cotton", "coton"] },
  { category: "sesame", terms: ["sesame"] },
  { category: "maize", terms: ["maize", "corn", "mais"] },
  { category: "rice", terms: ["rice", "riz"] },
  { category: "sugar", terms: ["sugar", "sucre"] },
  { category: "steel", terms: ["steel", "acier"] },
  { category: "cement", terms: ["cement", "ciment"] },
  { category: "aluminium", terms: ["aluminium", "aluminum"] },
  { category: "polymer", terms: ["industrial polymer", "polymere industriel"] },
];

const STATIC_OR_GENERIC_PRODUCT_CATEGORIES = new Set([
  "palm_oil",
  "cocoa",
  "coffee",
  "cashew",
  "machinery",
  "machine",
  "equipment",
  "spare_part",
  "spare_parts",
  "spare_parts_and_components",
  "custom_manufacturing",
  "raw_material",
  "raw_materials",
  "industrial_input",
  "industrial_inputs",
  "product",
  "products",
  "other",
  "unknown",
]);

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function slugify(value: unknown) {
  return normalize(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function commercialStaffingCaseCapacity(roleTitle: unknown) {
  return CASE_CAPACITY_BY_ROLE[String(roleTitle || "").trim()] || DEFAULT_CASE_CAPACITY;
}

export function commercialStaffingCapacityExpansionThreshold() {
  return CAPACITY_EXPANSION_DEMAND_THRESHOLD;
}

export function commercialStaffingCapacityDecision(
  openCaseCount: unknown,
  capacityLimit: unknown,
) {
  const normalizedOpenCaseCount = Math.max(
    0,
    Math.trunc(Number(openCaseCount) || 0),
  );
  const normalizedCapacityLimit = Math.max(
    1,
    Math.trunc(Number(capacityLimit) || DEFAULT_CASE_CAPACITY),
  );
  const availableSlots = Math.max(
    0,
    normalizedCapacityLimit - normalizedOpenCaseCount,
  );

  return {
    openCaseCount: normalizedOpenCaseCount,
    capacityLimit: normalizedCapacityLimit,
    availableSlots,
    atCapacity: availableSlots === 0,
  };
}

export function commercialStaffingCapacityRoleCode(
  baseRoleCode: unknown,
  ordinal: number,
) {
  const safeBase = normalize(baseRoleCode)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 92) || "specialist";
  const safeOrdinal = Math.max(2, Math.trunc(Number(ordinal) || 2));
  return `exportunity-demand-seat-capacity-${safeBase}-${String(safeOrdinal).padStart(2, "0")}`;
}

function titleizeCategory(value: unknown) {
  const slug = slugify(value);
  if (!slug) return "";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .slice(0, 72);
}

function normalizedSearchText(value: unknown) {
  return slugify(value).replace(/-/g, " ");
}

function resolvedDynamicCategory(context: CommercialStaffingContext) {
  const suppliedCategory = normalize(context.productCategory).replace(/-/g, "_");
  const suppliedCategorySlug = slugify(suppliedCategory);
  const categoryIsUsable =
    suppliedCategorySlug.length >= 2 &&
    !STATIC_OR_GENERIC_PRODUCT_CATEGORIES.has(suppliedCategory) &&
    !STATIC_OR_GENERIC_PRODUCT_CATEGORIES.has(suppliedCategorySlug.replace(/-/g, "_"));
  if (categoryIsUsable) return suppliedCategory;

  const productName = normalizedSearchText(context.productName);
  if (!productName) return "";
  const match = DYNAMIC_PRODUCT_NAME_ALIASES.find((candidate) =>
    candidate.terms.some((term) => productName.includes(normalizedSearchText(term))),
  );
  return match?.category || "";
}

function dynamicProductDesk(context: CommercialStaffingContext) {
  const category = resolvedDynamicCategory(context);
  const categorySlug = slugify(category);
  if (
    !categorySlug ||
    categorySlug.length < 2 ||
    STATIC_OR_GENERIC_PRODUCT_CATEGORIES.has(category) ||
    STATIC_OR_GENERIC_PRODUCT_CATEGORIES.has(categorySlug.replace(/-/g, "_"))
  ) {
    return null;
  }
  const label =
    DYNAMIC_PRODUCT_LABELS[category.replace(/-/g, "_")] ||
    titleizeCategory(category);
  if (!label) return null;
  return {
    roleTitle: `${label} Desk Agent`,
    roleCode: `exportunity-demand-seat-${categorySlug}`,
    departmentKey: "commodity-industry-desks",
  };
}

export function commercialStaffingSpecialistKey(roleTitle: unknown) {
  const normalizedRoleTitle = normalize(roleTitle);
  return (
    Object.entries(MISSING_SPECIALIST_ROLES).find(
      ([, title]) => normalize(title) === normalizedRoleTitle,
    )?.[0] || null
  );
}

export function commercialStaffingRecommendations(
  context: CommercialStaffingContext,
): CommercialStaffingRecommendation[] {
  const recommendations = new Map<string, CommercialStaffingRecommendation>();
  const category = normalize(context.productCategory);
  const intent = normalize(context.intent);

  const addRecurringDemand = (roleTitle: string) => {
    recommendations.set(roleTitle, {
      roleTitle,
      signalType: "recurring_demand",
      demandThreshold: RECURRING_DEMAND_THRESHOLDS[roleTitle] || 5,
      rationale:
        "Create a permanent desk only after enough distinct commercial requirements prove durable demand.",
    });
  };

  if (category === "palm_oil") addRecurringDemand("Palm Oil Desk Agent");
  if (category === "cocoa") addRecurringDemand("Cocoa Desk Agent");
  if (category === "coffee") addRecurringDemand("Coffee Desk Agent");
  if (category === "cashew") addRecurringDemand("Cashew Desk Agent");
  if (
    ["machinery", "spare_part", "custom_manufacturing"].includes(
      context.requirementType,
    )
  ) {
    addRecurringDemand("Machinery and Industrial Equipment Desk Agent");
  }
  if (intent === "find_buyer" || intent === "sell_export") {
    addRecurringDemand("Buyer Intelligence Lead");
  }

  const emergingDesk = dynamicProductDesk(context);
  if (emergingDesk && !recommendations.has(emergingDesk.roleTitle)) {
    recommendations.set(emergingDesk.roleTitle, {
      ...emergingDesk,
      signalType: "recurring_demand",
      demandThreshold: 5,
      dynamicRoleSeat: true,
      rationale:
        "Create a new governed product desk only after five distinct commercial requirements prove recurring demand and a human approves the role.",
    });
  }

  for (const specialistKey of context.missingSpecialistKeys || []) {
    const normalizedKey = normalize(specialistKey);
    const roleTitle = MISSING_SPECIALIST_ROLES[normalizedKey];
    if (!roleTitle || recommendations.has(roleTitle)) continue;
    recommendations.set(roleTitle, {
      roleTitle,
      signalType: "critical_capability_gap",
      demandThreshold: 1,
      rationale:
        `A live commercial case cannot be staffed because the ${normalizedKey} specialist is unavailable.`,
    });
  }

  return Array.from(recommendations.values());
}

export function commercialStaffingRoleTitles(
  context: CommercialStaffingContext,
) {
  return commercialStaffingRecommendations(context).map(
    (recommendation) => recommendation.roleTitle,
  );
}
