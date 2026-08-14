export type CommercialQualificationStep =
  | "product"
  | "quantity"
  | "destination"
  | "timing"
  | "origin"
  | "quality"
  | "frequency"
  | "incoterm"
  | "budget";

export type CommercialQualificationValues = {
  productName?: string | null;
  quantity?: string | null;
  destination?: string | null;
  deadline?: string | null;
  origin?: string | null;
  specification?: string | null;
  frequency?: string | null;
  incoterm?: string | null;
  targetPrice?: string | null;
};

const FIELD_STEPS: Record<string, CommercialQualificationStep> = {
  "product.name": "product",
  "product.quantity": "quantity",
  destination: "destination",
  deadline: "timing",
  origin: "origin",
  "product.specification": "quality",
  frequency: "frequency",
  incoterm: "incoterm",
  targetPrice: "budget",
};

function hasValue(value: string | null | undefined) {
  return Boolean(String(value || "").trim());
}

function valueForField(
  field: string,
  values: CommercialQualificationValues,
) {
  switch (field) {
    case "product.name":
      return values.productName;
    case "product.quantity":
      return values.quantity;
    case "destination":
      return values.destination;
    case "deadline":
      return values.deadline;
    case "origin":
      return values.origin;
    case "product.specification":
      return values.specification;
    case "frequency":
      return values.frequency;
    case "incoterm":
      return values.incoterm;
    case "targetPrice":
      return values.targetPrice;
    default:
      return undefined;
  }
}

export function unresolvedCommercialQualificationFields(
  missingFields: string[] | null | undefined,
  values: CommercialQualificationValues,
) {
  return Array.from(
    new Set(
      (missingFields || [])
        .map((field) => String(field || "").trim())
        .filter(Boolean),
    ),
  ).filter((field) => {
    if (!(field in FIELD_STEPS)) return true;
    return !hasValue(valueForField(field, values));
  });
}

export function nextCommercialQualificationStep(
  missingFields: string[] | null | undefined,
  values: CommercialQualificationValues,
) {
  const unresolved = unresolvedCommercialQualificationFields(
    missingFields,
    values,
  );
  for (const field of unresolved) {
    const step = FIELD_STEPS[field];
    if (step) return step;
  }
  return null;
}
