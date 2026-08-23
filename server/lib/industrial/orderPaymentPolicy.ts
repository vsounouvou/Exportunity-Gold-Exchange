import {
  currencyMinorUnitScale,
  formatMinorUnits,
  parseExactDecimalToMinorUnits,
} from "../exportunity/commercialOfferPolicy";

export const INDUSTRIAL_ORDER_PAYMENT_PURPOSE =
  "INDUSTRIAL_ORDER_PAYMENT" as const;
export const INDUSTRIAL_ORDER_PAYMENT_TARGET = "INDUSTRIAL_ORDER" as const;

const MAX_GATEWAY_AMOUNT_MINOR = 2_147_483_647n;

export class IndustrialPaymentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "IndustrialPaymentError";
  }
}

function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email || null;
}

export function resolveIndustrialOrderPaymentAmount(input: {
  totalAmount: unknown;
  totalAmountMinor?: unknown;
  currencyCode: unknown;
}) {
  const currency = String(input.currencyCode ?? "XOF").trim().toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new IndustrialPaymentError(
      "industrial_order_currency_invalid",
      "The industrial order currency is missing or invalid.",
      409,
    );
  }

  const scale = currencyMinorUnitScale(currency);
  const storedMajor = String(input.totalAmount ?? "").trim();
  const storedMatch = storedMajor.match(/^(0|[1-9]\d{0,23})(?:\.(\d{1,3}))?$/);
  if (!storedMatch) {
    throw new IndustrialPaymentError(
      "industrial_order_amount_invalid",
      "The industrial order does not have a payable exact total.",
      409,
    );
  }
  const storedFraction = storedMatch[2] || "";
  const unsupportedFraction = storedFraction.slice(scale);
  if (unsupportedFraction && !/^0+$/.test(unsupportedFraction)) {
    throw new IndustrialPaymentError(
      "industrial_order_amount_scale_invalid",
      `The industrial order total exceeds the ${scale}-decimal precision supported by ${currency}.`,
      409,
    );
  }
  const canonicalMajor =
    scale === 0
      ? storedMatch[1]
      : `${storedMatch[1]}.${storedFraction.slice(0, scale).padEnd(scale, "0")}`;

  let parsedStoredMinor: string;
  try {
    parsedStoredMinor = parseExactDecimalToMinorUnits(canonicalMajor, currency);
  } catch {
    throw new IndustrialPaymentError(
      "industrial_order_amount_invalid",
      "The industrial order does not have a payable exact total.",
      409,
    );
  }

  const storedMinorText = String(input.totalAmountMinor ?? "").trim();
  if (storedMinorText && !/^(0|[1-9]\d*)$/.test(storedMinorText)) {
    throw new IndustrialPaymentError(
      "industrial_order_minor_amount_invalid",
      "The industrial order exact minor-unit amount is invalid.",
      409,
    );
  }
  if (storedMinorText && storedMinorText !== parsedStoredMinor) {
    throw new IndustrialPaymentError(
      "industrial_order_amount_evidence_mismatch",
      "The industrial order formatted total does not match its exact minor-unit amount.",
      409,
    );
  }

  const amountMinorText = storedMinorText || parsedStoredMinor;
  const amountMinor = BigInt(amountMinorText);
  if (amountMinor <= 0n) {
    throw new IndustrialPaymentError(
      "industrial_order_amount_invalid",
      "The industrial order does not have a payable total.",
      409,
    );
  }
  if (amountMinor > MAX_GATEWAY_AMOUNT_MINOR) {
    throw new IndustrialPaymentError(
      "industrial_order_amount_out_of_range",
      "The industrial order total requires a governed bank-transfer payment plan.",
      409,
    );
  }

  return {
    amountMinor: Number(amountMinor),
    amountMinorText,
    amountScale: scale,
    gatewayAmount: formatMinorUnits(amountMinorText, currency),
    currency,
  };
}

export function industrialProviderAmountMatches(input: {
  providerAmount: unknown;
  expectedAmountMinor: unknown;
  currencyCode: unknown;
}) {
  if (input.providerAmount === null || input.providerAmount === undefined) return false;
  const expected = String(input.expectedAmountMinor ?? "").trim();
  if (!/^(0|[1-9]\d*)$/.test(expected)) return false;
  const currency = String(input.currencyCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return false;
  try {
    return (
      parseExactDecimalToMinorUnits(String(input.providerAmount).trim(), currency) ===
      expected
    );
  } catch {
    return false;
  }
}

export function providerCurrencyMatches(input: {
  providerCurrency: unknown;
  expectedCurrency: unknown;
}) {
  const provider = String(input.providerCurrency ?? "").trim().toUpperCase();
  const expected = String(input.expectedCurrency ?? "").trim().toUpperCase();
  return Boolean(provider && expected && /^[A-Z]{3}$/.test(expected) && provider === expected);
}

export function isIndustrialOrderPaymentAuthorized(input: {
  isAdmin: boolean;
  userId?: number | null;
  userEmail?: string | null;
  requesterUserId?: number | null;
  requesterEmail?: string | null;
  contactPrimaryEmail?: string | null;
  contactEmails?: unknown;
  contactLegacyEmail?: string | null;
}) {
  if (input.isAdmin) return true;
  if (
    Number.isFinite(Number(input.userId)) &&
    Number(input.userId) > 0 &&
    Number(input.userId) === Number(input.requesterUserId)
  ) {
    return true;
  }

  const userEmail = normalizeEmail(input.userEmail);
  if (!userEmail) return false;
  const allowedEmails = new Set(
    [
      input.requesterEmail,
      input.contactPrimaryEmail,
      input.contactLegacyEmail,
      ...(Array.isArray(input.contactEmails) ? input.contactEmails : []),
    ]
      .map(normalizeEmail)
      .filter((value): value is string => Boolean(value)),
  );
  return allowedEmails.has(userEmail);
}
