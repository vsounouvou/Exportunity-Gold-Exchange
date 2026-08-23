import { createHash } from "node:crypto";

import {
  EXPORTUNITY_SUPPLIER_CONTACT_TYPES,
  EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE,
  type SupplierBusinessContactType,
} from "./supplierVerificationPolicy";
import type { RequirementProductFacts } from "./productRequirementReadModel";

export const EXPORTUNITY_RFQ_REQUESTED_FIELDS = [
  "unit_price",
  "currency",
  "minimum_order_quantity",
  "production_lead_time",
  "incoterms",
  "payment_terms",
  "quote_valid_until",
  "packaging",
  "shipping_origin",
] as const;

export const EXPORTUNITY_RFQ_MAXIMUM_RESPONSE_WINDOW_DAYS = 45;
export const EXPORTUNITY_RFQ_MAXIMUM_AUTHORIZATION_HOURS = 168;

export type SupplierRfqStatus =
  | "draft"
  | "approval_pending"
  | "approved_for_outreach"
  | "rejected"
  | "cancelled";

export type SupplierRfqApprovalChecklist = {
  contentReviewed: true;
  recipientMatchesVerifiedContact: true;
  requirementStillCurrent: true;
  noUnsupportedCommercialClaims: true;
  buyerDataApprovedForDisclosure: true;
  separateDispatchRequired: true;
};

export type ParsedSupplierRfqDraftInput = {
  promotionId: string;
  buyerInstructions: string | null;
  responseDeadline: Date;
};

export type ParsedSupplierRfqApprovalInput = {
  checklist: SupplierRfqApprovalChecklist;
  decisionNotes: string;
  authorizationWindowHours: number;
};

export type SupplierRfqContent = {
  subject: string;
  messageBody: string;
  requestedFields: string[];
  requirementSnapshot: Record<string, unknown>;
  supplierSnapshot: Record<string, unknown>;
  buyerInstructions: string | null;
  responseDeadline: Date;
  contentHash: string;
};

export class SupplierRfqPolicyError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SupplierRfqPolicyError";
    this.code = code;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  throw new SupplierRfqPolicyError("SUPPLIER_RFQ_VALIDATION_FAILED", message);
}

function boundedText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (normalized.length < minimum || normalized.length > maximum) {
    fail(`${field} must contain ${minimum} to ${maximum} characters.`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maximum: number) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length > maximum) fail(`${field} must not exceed ${maximum} characters.`);
  return normalized;
}

function canonicalRequirementDetails(product: RequirementProductFacts) {
  return [
    product.specification || "Not captured in the canonical Product Requirement",
    product.origin ? `Origin: ${product.origin}` : null,
    product.frequency ? `Frequency: ${product.frequency}` : null,
    product.incoterm ? `Incoterm: ${product.incoterm}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

function parseUuid(value: unknown, field: string) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) fail(`${field} must be a valid UUID.`);
  return normalized;
}

function toObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("A structured RFQ payload is required.");
  }
  return value as Record<string, any>;
}

function parseFutureDate(value: unknown, field: string, input: {
  now: Date;
  minimumHours: number;
  maximumHours: number;
}) {
  const parsed = new Date(String(value ?? ""));
  const minimum = input.now.getTime() + input.minimumHours * 60 * 60 * 1_000;
  const maximum = input.now.getTime() + input.maximumHours * 60 * 60 * 1_000;
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.getTime() < minimum ||
    parsed.getTime() > maximum
  ) {
    fail(`${field} must be between ${input.minimumHours} and ${input.maximumHours} hours from now.`);
  }
  return parsed;
}

export function parseSupplierRfqDraftInput(
  value: unknown,
  options: { now?: Date } = {},
): ParsedSupplierRfqDraftInput {
  const raw = toObject(value);
  const now = options.now || new Date();
  return {
    promotionId: parseUuid(raw.promotionId, "promotionId"),
    buyerInstructions: optionalText(raw.buyerInstructions, "buyerInstructions", 1_000),
    responseDeadline: parseFutureDate(raw.responseDeadline, "responseDeadline", {
      now,
      minimumHours: 24,
      maximumHours: EXPORTUNITY_RFQ_MAXIMUM_RESPONSE_WINDOW_DAYS * 24,
    }),
  };
}

function parseApprovalChecklist(value: unknown): SupplierRfqApprovalChecklist {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("checklist must contain the required RFQ approval attestations.");
  }
  const raw = value as Record<string, unknown>;
  const keys: Array<keyof SupplierRfqApprovalChecklist> = [
    "contentReviewed",
    "recipientMatchesVerifiedContact",
    "requirementStillCurrent",
    "noUnsupportedCommercialClaims",
    "buyerDataApprovedForDisclosure",
    "separateDispatchRequired",
  ];
  for (const key of keys) {
    if (raw[key] !== true) fail(`checklist.${key} must be explicitly confirmed.`);
  }
  return Object.fromEntries(keys.map((key) => [key, true])) as SupplierRfqApprovalChecklist;
}

export function parseSupplierRfqApprovalInput(
  value: unknown,
): ParsedSupplierRfqApprovalInput {
  const raw = toObject(value);
  const authorizationWindowHours = Number(raw.authorizationWindowHours);
  if (
    !Number.isInteger(authorizationWindowHours) ||
    authorizationWindowHours < 1 ||
    authorizationWindowHours > EXPORTUNITY_RFQ_MAXIMUM_AUTHORIZATION_HOURS
  ) {
    fail(
      `authorizationWindowHours must be an integer from 1 to ${EXPORTUNITY_RFQ_MAXIMUM_AUTHORIZATION_HOURS}.`,
    );
  }
  return {
    checklist: parseApprovalChecklist(raw.checklist),
    decisionNotes: boundedText(raw.decisionNotes, "decisionNotes", 24, 2_000),
    authorizationWindowHours,
  };
}

export function parseSupplierRfqRejectionInput(value: unknown) {
  const raw = toObject(value);
  return {
    decisionNotes: boundedText(raw.decisionNotes, "decisionNotes", 24, 2_000),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function computeSupplierRfqContentHash(input: {
  subject: string;
  messageBody: string;
  requestedFields: string[];
  requirementSnapshot: Record<string, unknown>;
  supplierSnapshot: Record<string, unknown>;
  buyerInstructions: string | null;
  responseDeadline: Date | string;
}) {
  const canonical = stableValue({
    subject: input.subject,
    messageBody: input.messageBody,
    requestedFields: input.requestedFields,
    requirementSnapshot: input.requirementSnapshot,
    supplierSnapshot: input.supplierSnapshot,
    buyerInstructions: input.buyerInstructions,
    responseDeadline: new Date(input.responseDeadline).toISOString(),
  });
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function assertSupplierRfqContentIntegrity(input: Parameters<
  typeof computeSupplierRfqContentHash
>[0] & { contentHash: string }) {
  const expected = computeSupplierRfqContentHash(input);
  if (expected !== input.contentHash) {
    fail("The RFQ content no longer matches its approval hash.");
  }
  return true;
}

export function composeSupplierRfqContent(input: {
  requirement: {
    referenceCode: unknown;
    title: unknown;
    details: unknown;
    quantityText: unknown;
    deliveryCountryCode: unknown;
    deliveryCity?: unknown;
    requiredBy?: Date | string | null;
    productRequirement?: RequirementProductFacts | null;
  };
  supplier: {
    legalName: unknown;
    countryCode: unknown;
    contactType: unknown;
    contactValue: unknown;
    verificationScope: unknown;
  };
  buyerInstructions: string | null;
  responseDeadline: Date;
}): SupplierRfqContent {
  const requirementReference = boundedText(
    input.requirement.referenceCode,
    "requirement.referenceCode",
    3,
    80,
  );
  const canonicalProductRequirement =
    input.requirement.productRequirement?.source ===
      "canonical_product_requirement" &&
    input.requirement.productRequirement.productRequirementId
      ? input.requirement.productRequirement
      : null;
  const product = boundedText(
    canonicalProductRequirement?.name || input.requirement.title,
    "requirement.title",
    3,
    240,
  );
  const details = boundedText(
    canonicalProductRequirement
      ? canonicalRequirementDetails(canonicalProductRequirement)
      : input.requirement.details,
    "requirement.details",
    3,
    4_000,
  );
  const quantity = boundedText(
    canonicalProductRequirement
      ? canonicalProductRequirement.quantityText
      : input.requirement.quantityText,
    "requirement.quantityText",
    1,
    240,
  );
  const deliveryCountryCode = String(input.requirement.deliveryCountryCode ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(deliveryCountryCode)) {
    fail("requirement.deliveryCountryCode must be captured before RFQ drafting.");
  }
  const deliveryCity = optionalText(
    input.requirement.deliveryCity,
    "requirement.deliveryCity",
    160,
  );
  const legalName = boundedText(input.supplier.legalName, "supplier.legalName", 2, 180);
  const supplierCountryCode = String(input.supplier.countryCode ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(supplierCountryCode)) {
    fail("supplier.countryCode must be a confirmed two-letter country code.");
  }
  const contactType = String(input.supplier.contactType ?? "") as SupplierBusinessContactType;
  if (!EXPORTUNITY_SUPPLIER_CONTACT_TYPES.includes(contactType)) {
    fail("The RFQ recipient must use the confirmed promotion contact type.");
  }
  const contactValue = boundedText(input.supplier.contactValue, "supplier.contactValue", 5, 320);
  if (input.supplier.verificationScope !== EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE) {
    fail("The supplier promotion does not have the required verification scope.");
  }

  let requiredBy: string | null = null;
  if (!canonicalProductRequirement && input.requirement.requiredBy) {
    const parsed = new Date(input.requirement.requiredBy);
    if (Number.isNaN(parsed.valueOf())) fail("requirement.requiredBy is invalid.");
    requiredBy = parsed.toISOString();
  }
  const canonicalDestination = canonicalProductRequirement
    ? boundedText(
        canonicalProductRequirement.destination,
        "requirement.productRequirement.destination",
        2,
        240,
      )
    : null;
  const canonicalDeadline = canonicalProductRequirement
    ? optionalText(
        canonicalProductRequirement.deadlineText,
        "requirement.productRequirement.deadlineText",
        240,
      )
    : null;
  const deliveryDestination = canonicalProductRequirement
    ? canonicalDestination
    : deliveryCity
      ? `${deliveryCity}, ${deliveryCountryCode}`
      : deliveryCountryCode;
  const responseDeadlineLabel = input.responseDeadline.toISOString();
  const requiredByLine = canonicalProductRequirement
    ? canonicalDeadline
      ? `Requested delivery timing: ${canonicalDeadline}`
      : "Requested delivery timing: please state your earliest achievable date"
    : requiredBy
      ? `Requested delivery date: ${requiredBy}`
      : "Requested delivery date: please state your earliest achievable date";
  const buyerInstructionLine = input.buyerInstructions
    ? `Additional buyer instructions: ${input.buyerInstructions}`
    : "Additional buyer instructions: none supplied";

  const subject = `RFQ ${requirementReference}: ${product}`.slice(0, 240);
  const messageBody = [
    `Hello ${legalName} commercial team,`,
    "",
    "Exportunity is preparing a governed, non-binding sourcing request. Please provide your current commercial response for the requirement below.",
    "",
    `Requirement reference: ${requirementReference}`,
    `Product or service: ${product}`,
    `Specification: ${details}`,
    `Quantity: ${quantity}`,
    `Delivery destination: ${deliveryDestination}`,
    requiredByLine,
    `Response requested by: ${responseDeadlineLabel}`,
    buyerInstructionLine,
    "",
    `Please state: ${EXPORTUNITY_RFQ_REQUESTED_FIELDS.join(", ").replace(/_/g, " ")}.`,
    "Please identify assumptions, exclusions, and any supporting technical or certification documents. Exportunity has not pre-verified capacity, pricing, certification, lead time, or performance.",
    "",
    "If you do not want further Exportunity sourcing messages at this contact, reply with that instruction and we will suppress the contact.",
    "",
    "This RFQ draft is not a purchase order, contract, payment request, or commitment to buy. Any later communication, quote acceptance, order, or payment requires its own governed action.",
  ].join("\n");

  const requirementSnapshot = {
    referenceCode: requirementReference,
    title: product,
    details,
    quantityText: quantity,
    deliveryCountryCode,
    deliveryCity: canonicalProductRequirement ? null : deliveryCity,
    ...(canonicalProductRequirement
      ? {
          destinationText: canonicalDestination,
          deadlineText: canonicalDeadline,
        }
      : {}),
    requiredBy,
    ...(canonicalProductRequirement
      ? {
          productRequirement: {
            ...canonicalProductRequirement,
          },
        }
      : {}),
  };
  const supplierSnapshot = {
    legalName,
    countryCode: supplierCountryCode,
    contactType,
    contactValue,
    verificationScope: EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE,
  };
  const hashInput = {
    subject,
    messageBody,
    requestedFields: [...EXPORTUNITY_RFQ_REQUESTED_FIELDS],
    requirementSnapshot,
    supplierSnapshot,
    buyerInstructions: input.buyerInstructions,
    responseDeadline: input.responseDeadline,
  };

  return {
    ...hashInput,
    contentHash: computeSupplierRfqContentHash(hashInput),
  };
}

export function supplierRfqAuthorizationExpiry(input: {
  decidedAt: Date;
  authorizationWindowHours: number;
}) {
  return new Date(
    input.decidedAt.getTime() + input.authorizationWindowHours * 60 * 60 * 1_000,
  );
}
