export const INDUSTRIAL_OPEN_REQUIREMENT_STATUSES = [
  "submitted",
  "triaged",
  "under_review",
  "supplier_matching",
  "quote_preparation",
  "quoted",
] as const;

type RequirementDemandRow = {
  categoryCode: string;
  requirementType?: string | null;
  urgency?: string | null;
  total?: number | string | null;
};

type RecurringDemandRow = {
  categoryCode: string;
  total?: number | string | null;
};

type SupplierPerformanceRow = {
  id: string;
  displayName: string;
  supplierStatus: string;
  verificationStatus: string;
  countryCode?: string | null;
  city?: string | null;
  leadTimeText?: string | null;
  onTimeDeliveryRate?: number | string | null;
};

type CommercialValueRow = {
  currencyCode?: string | null;
  totalAmount?: unknown;
  total?: unknown;
};

type QuoteStatusCountRow = {
  status?: string | null;
  total?: unknown;
};

export type IndustrialDemandSignal = {
  categoryCode: string;
  openRequirements: number;
  urgentRequirements: number;
  customManufacturingRequirements: number;
  activeRecurringPlans: number;
};

export type IndustrialCommercialValue = {
  currencyCode: string;
  totalAmount: string;
  recordCount: number;
};

export type IndustrialQuoteDecisionMetrics = {
  total: number;
  issued: number;
  accepted: number;
  declined: number;
  expired: number;
  cancelled: number;
  decisionCount: number;
  conversionRate: number | null;
};

function asCount(value: unknown) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function decimalToMinorUnits(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(text)) return 0n;
  const negative = text.startsWith("-");
  const normalized = text.replace(/^[-+]/, "");
  const [whole = "0", fraction = ""] = normalized.split(".");
  const units = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -units : units;
}

function minorUnitsToDecimal(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

export function summarizeIndustrialCommercialValues(
  rows: CommercialValueRow[],
) {
  const totals = new Map<string, { amount: bigint; recordCount: number }>();
  for (const row of rows) {
    const currencyCode = String(row.currencyCode || "XOF").trim() || "XOF";
    const current = totals.get(currencyCode) || {
      amount: 0n,
      recordCount: 0,
    };
    current.amount += decimalToMinorUnits(row.totalAmount);
    current.recordCount += asCount(row.total);
    totals.set(currencyCode, current);
  }
  return [...totals.entries()]
    .map(([currencyCode, value]) => ({
      currencyCode,
      totalAmount: minorUnitsToDecimal(value.amount),
      recordCount: value.recordCount,
    }))
    .sort((left, right) => left.currencyCode.localeCompare(right.currencyCode));
}

export function calculateIndustrialQuoteDecisionMetrics(
  rows: QuoteStatusCountRow[],
): IndustrialQuoteDecisionMetrics {
  const totalFor = (status: string) =>
    rows
      .filter((row) => row.status === status)
      .reduce((total, row) => total + asCount(row.total), 0);
  const accepted = totalFor("accepted");
  const declined = totalFor("declined");
  const decisionCount = accepted + declined;
  return {
    total: rows.reduce((total, row) => total + asCount(row.total), 0),
    issued: totalFor("issued"),
    accepted,
    declined,
    expired: totalFor("expired"),
    cancelled: totalFor("cancelled"),
    decisionCount,
    conversionRate:
      decisionCount > 0
        ? Math.round((accepted / decisionCount) * 1000) / 10
        : null,
  };
}

export function buildIndustrialDemandSignals(
  requirements: RequirementDemandRow[],
  recurringPlans: RecurringDemandRow[],
) {
  const byCategory = new Map<string, IndustrialDemandSignal>();
  const ensure = (categoryCode: string) => {
    const key = String(categoryCode || "").trim() || "uncategorized";
    const existing = byCategory.get(key);
    if (existing) return existing;
    const created: IndustrialDemandSignal = {
      categoryCode: key,
      openRequirements: 0,
      urgentRequirements: 0,
      customManufacturingRequirements: 0,
      activeRecurringPlans: 0,
    };
    byCategory.set(key, created);
    return created;
  };

  for (const row of requirements) {
    const signal = ensure(row.categoryCode);
    const total = asCount(row.total);
    signal.openRequirements += total;
    if (row.urgency === "urgent") signal.urgentRequirements += total;
    if (row.requirementType === "custom_manufacturing") {
      signal.customManufacturingRequirements += total;
    }
  }

  for (const row of recurringPlans) {
    ensure(row.categoryCode).activeRecurringPlans += asCount(row.total);
  }

  return [...byCategory.values()].sort((left, right) => {
    if (right.urgentRequirements !== left.urgentRequirements) {
      return right.urgentRequirements - left.urgentRequirements;
    }
    if (right.openRequirements !== left.openRequirements) {
      return right.openRequirements - left.openRequirements;
    }
    if (right.activeRecurringPlans !== left.activeRecurringPlans) {
      return right.activeRecurringPlans - left.activeRecurringPlans;
    }
    return left.categoryCode.localeCompare(right.categoryCode, "fr");
  });
}

export function rankRecordedSupplierPerformance(
  suppliers: SupplierPerformanceRow[],
) {
  return suppliers
    .filter(
      (supplier) =>
        supplier.supplierStatus === "active" &&
        supplier.verificationStatus === "verified" &&
        supplier.onTimeDeliveryRate !== null &&
        supplier.onTimeDeliveryRate !== undefined &&
        String(supplier.onTimeDeliveryRate).trim() !== "" &&
        Number.isFinite(Number(supplier.onTimeDeliveryRate)),
    )
    .map((supplier) => ({
      ...supplier,
      onTimeDeliveryRate: Number(supplier.onTimeDeliveryRate),
    }))
    .sort((left, right) => {
      if (right.onTimeDeliveryRate !== left.onTimeDeliveryRate) {
        return right.onTimeDeliveryRate - left.onTimeDeliveryRate;
      }
      return left.displayName.localeCompare(right.displayName, "fr");
    });
}
