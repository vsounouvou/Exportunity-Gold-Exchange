export type RequirementProductSource =
  | "canonical_product_requirement"
  | "industrial_requirement_legacy";

export type RequirementProductFacts = {
  source: RequirementProductSource;
  productRequirementId: string | null;
  sourceMessageId: number | null;
  name: string;
  category: string | null;
  specification: string | null;
  quantity: string | null;
  quantityText: string | null;
  unit: string | null;
  origin: string | null;
  destination: string | null;
  targetPrice: string | null;
  currency: string | null;
  deadlineText: string | null;
  frequency: string | null;
  incoterm: string | null;
  customerType: string | null;
};

type RequirementLike = {
  title?: unknown;
  categoryCode?: unknown;
  quantityText?: unknown;
  deliveryCountryCode?: unknown;
  deliveryCity?: unknown;
  metadata?: unknown;
};

type ProductRequirementLike = {
  id?: unknown;
  sourceMessageId?: unknown;
  productName?: unknown;
  productCategory?: unknown;
  specification?: unknown;
  quantity?: unknown;
  quantityText?: unknown;
  unit?: unknown;
  origin?: unknown;
  destination?: unknown;
  targetPrice?: unknown;
  currency?: unknown;
  deadlineText?: unknown;
  frequency?: unknown;
  incoterm?: unknown;
  customerType?: unknown;
} | null;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, maximum = 4_000) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function decimalText(value: unknown) {
  const normalized = text(value, 80);
  if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return normalized;
  }
  return normalized.includes(".")
    ? normalized.replace(/0+$/, "").replace(/\.$/, "")
    : normalized;
}

function legacyFacts(requirement: RequirementLike): RequirementProductFacts {
  const metadata = record(requirement.metadata);
  const commercialIntent = record(metadata.commercialIntent);
  const product = record(commercialIntent.product);
  const discoveryProduct = record(metadata.discoveryProduct);
  const title = text(requirement.title, 240) || "";
  const titleProduct = title.split("•").pop()?.trim() || title;
  const quantity = text(product.quantity, 80);
  const unit = text(product.unit, 40);
  const deliveryCity = text(requirement.deliveryCity, 160);
  const deliveryCountryCode = text(requirement.deliveryCountryCode, 2)?.toUpperCase() || null;
  const fallbackDestination = [deliveryCity, deliveryCountryCode]
    .filter(Boolean)
    .join(", ");

  return {
    source: "industrial_requirement_legacy",
    productRequirementId: null,
    sourceMessageId: null,
    name:
      text(product.name, 240) ||
      text(discoveryProduct.name, 240) ||
      titleProduct ||
      text(requirement.categoryCode, 120) ||
      "",
    category:
      text(product.category, 240) ||
      text(discoveryProduct.category, 240) ||
      text(requirement.categoryCode, 120),
    specification:
      text(product.specification, 500) ||
      text(discoveryProduct.specification, 500),
    quantity,
    quantityText:
      text(requirement.quantityText, 240) ||
      (quantity ? `${quantity}${unit ? ` ${unit}` : ""}` : null),
    unit,
    origin: text(commercialIntent.origin, 240),
    destination:
      text(commercialIntent.destination, 240) || fallbackDestination || null,
    targetPrice: text(commercialIntent.targetPrice, 120),
    currency: text(commercialIntent.currency, 12)?.toUpperCase() || null,
    deadlineText: text(commercialIntent.deadline, 240),
    frequency: text(commercialIntent.frequency, 240),
    incoterm: text(commercialIntent.incoterm, 20)?.toUpperCase() || null,
    customerType: text(commercialIntent.customerType, 100),
  };
}

export function resolveRequirementProductFacts(input: {
  requirement: RequirementLike;
  productRequirement?: ProductRequirementLike;
}): RequirementProductFacts {
  const legacy = legacyFacts(input.requirement);
  const canonical = input.productRequirement;
  const productRequirementId = text(canonical?.id, 80);
  if (!productRequirementId) return legacy;

  const quantity = decimalText(canonical?.quantity);
  const unit = text(canonical?.unit, 40);
  const productName =
    text(canonical?.productName, 240) ||
    text(canonical?.productCategory, 240) ||
    legacy.name;

  return {
    source: "canonical_product_requirement",
    productRequirementId,
    sourceMessageId: positiveInteger(canonical?.sourceMessageId),
    name: productName,
    category: text(canonical?.productCategory, 240),
    specification: text(canonical?.specification, 500),
    quantity,
    quantityText:
      text(canonical?.quantityText, 240) ||
      (quantity ? `${quantity}${unit ? ` ${unit}` : ""}` : null),
    unit,
    origin: text(canonical?.origin, 240),
    destination: text(canonical?.destination, 240),
    targetPrice: text(canonical?.targetPrice, 120),
    currency: text(canonical?.currency, 12)?.toUpperCase() || null,
    deadlineText: text(canonical?.deadlineText, 240),
    frequency: text(canonical?.frequency, 240),
    incoterm: text(canonical?.incoterm, 20)?.toUpperCase() || null,
    customerType: text(canonical?.customerType, 100),
  };
}
