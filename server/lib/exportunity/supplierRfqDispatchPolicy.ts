import { createHash } from "node:crypto";

export const EXPORTUNITY_RFQ_CONTACT_AUTHORIZATION_MAXIMUM_DAYS = 90;
export const EXPORTUNITY_RFQ_WHATSAPP_MAXIMUM_CHARACTERS = 1_600;

export const EXPORTUNITY_RFQ_DISPATCH_CHECKLIST = [
  "exactApprovedContent",
  "recipientMatchesVerifiedPromotion",
  "contactAuthorizationCurrent",
  "suppressionRegistryChecked",
  "singleRecipientOnly",
  "noAutomaticRetry",
] as const;

export const EXPORTUNITY_RFQ_CONTACT_AUTHORIZATION_BASES = [
  "explicit_consent",
  "existing_business_relationship",
  "supplier_initiated_inquiry",
] as const;

export type SupplierRfqDispatchChannel = "email" | "whatsapp";
export type SupplierRfqContactControlState = "authorized" | "suppressed";
export type SupplierRfqContactAuthorizationBasis =
  (typeof EXPORTUNITY_RFQ_CONTACT_AUTHORIZATION_BASES)[number];
export type SupplierRfqDispatchChecklistKey =
  (typeof EXPORTUNITY_RFQ_DISPATCH_CHECKLIST)[number];
export type SupplierRfqDispatchChecklist = Record<SupplierRfqDispatchChecklistKey, true>;

export type ParsedSupplierRfqContactControlInput = {
  supplierProfileId: string;
  sourcePromotionId: string | null;
  channel: SupplierRfqDispatchChannel;
  contactValue: string;
  contactHash: string;
  contactMasked: string;
  state: SupplierRfqContactControlState;
  authorizationBasis: SupplierRfqContactAuthorizationBasis | null;
  evidenceReference: string | null;
  authorizationExpiresAt: Date | null;
  suppressionReason: string | null;
  notes: string;
};

export type ParsedSupplierRfqDispatchInput = {
  channel: SupplierRfqDispatchChannel;
  expectedContentHash: string;
  expectedRecipientHash: string;
  dispatchNotes: string;
  checklist: SupplierRfqDispatchChecklist;
};

export class SupplierRfqDispatchPolicyError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SupplierRfqDispatchPolicyError";
    this.code = code;
  }
}

export function redactSupplierRfqProviderError(
  value: unknown,
  recipient?: string,
) {
  let message = String(
    value instanceof Error ? value.message : value || "Provider request failed",
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);
  for (const sensitiveValue of [recipient, recipient ? `whatsapp:${recipient}` : null]) {
    if (sensitiveValue) message = message.split(sensitiveValue).join("[redacted-recipient]");
  }
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:whatsapp:)?\+?[1-9][0-9\s().-]{7,20}/gi, "[redacted-phone]")
    .slice(0, 2_000);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupplierRfqDispatchPolicyError(
      "SUPPLIER_RFQ_DISPATCH_INPUT_INVALID",
      "A JSON object is required.",
    );
  }
  return value as Record<string, unknown>;
}

function boundedText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new SupplierRfqDispatchPolicyError(
      "SUPPLIER_RFQ_DISPATCH_TEXT_INVALID",
      `${field} must contain between ${minimum} and ${maximum} characters.`,
    );
  }
  return normalized;
}

function uuid(value: unknown, field: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new SupplierRfqDispatchPolicyError(
      "SUPPLIER_RFQ_DISPATCH_ID_INVALID",
      `${field} must be a valid UUID.`,
    );
  }
  return normalized;
}

function sha256(value: unknown, field: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new SupplierRfqDispatchPolicyError(
      "SUPPLIER_RFQ_DISPATCH_HASH_INVALID",
      `${field} must be a lowercase SHA-256 hash.`,
    );
  }
  return normalized;
}

function dispatchChannel(value: unknown): SupplierRfqDispatchChannel {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized !== "email" && normalized !== "whatsapp") {
    throw new SupplierRfqDispatchPolicyError(
      "SUPPLIER_RFQ_DISPATCH_CHANNEL_INVALID",
      "channel must be email or whatsapp.",
    );
  }
  return normalized;
}

export function normalizeSupplierRfqDispatchContact(
  channel: SupplierRfqDispatchChannel,
  value: unknown,
) {
  const raw = String(value || "").trim();
  if (channel === "email") {
    const normalized = raw.toLowerCase();
    if (normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) {
      throw new SupplierRfqDispatchPolicyError(
        "SUPPLIER_RFQ_DISPATCH_EMAIL_INVALID",
        "The verified email contact is invalid.",
      );
    }
    return normalized;
  }

  const withoutScheme = raw.replace(/^whatsapp:/i, "").trim();
  const compact = withoutScheme.replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  if (!E164_PATTERN.test(normalized)) {
    throw new SupplierRfqDispatchPolicyError(
      "SUPPLIER_RFQ_DISPATCH_PHONE_INVALID",
      "The verified WhatsApp contact must use E.164 format.",
    );
  }
  return normalized;
}

export function hashSupplierRfqDispatchContact(
  channel: SupplierRfqDispatchChannel,
  normalizedContact: string,
) {
  return createHash("sha256")
    .update(`${channel}:${normalizedContact}`, "utf8")
    .digest("hex");
}

export function maskSupplierRfqDispatchContact(
  channel: SupplierRfqDispatchChannel,
  normalizedContact: string,
) {
  if (channel === "email") {
    const [local = "", domain = ""] = normalizedContact.split("@");
    return `${local.slice(0, 1) || "*"}***@${domain}`;
  }
  return `${normalizedContact.slice(0, 3)}***${normalizedContact.slice(-4)}`;
}

export function channelForVerifiedPromotionContact(contactType: unknown) {
  const normalized = String(contactType || "").trim().toLowerCase();
  if (normalized === "email") return "email" as const;
  if (normalized === "phone") return "whatsapp" as const;
  return null;
}

export function parseSupplierRfqContactControlInput(
  value: unknown,
  options: { now?: Date } = {},
): ParsedSupplierRfqContactControlInput {
  const input = objectValue(value);
  const now = options.now ?? new Date();
  const supplierProfileId = uuid(input.supplierProfileId, "supplierProfileId");
  const channel = dispatchChannel(input.channel);
  const state = String(input.state || "").trim().toLowerCase();
  if (state !== "authorized" && state !== "suppressed") {
    throw new SupplierRfqDispatchPolicyError(
      "SUPPLIER_RFQ_CONTACT_STATE_INVALID",
      "state must be authorized or suppressed.",
    );
  }
  const contactValue = normalizeSupplierRfqDispatchContact(channel, input.contactValue);
  const contactHash = hashSupplierRfqDispatchContact(channel, contactValue);
  const contactMasked = maskSupplierRfqDispatchContact(channel, contactValue);
  const notes = boundedText(input.notes, "notes", 24, 1_000);

  if (state === "suppressed") {
    return {
      supplierProfileId,
      sourcePromotionId: input.sourcePromotionId
        ? uuid(input.sourcePromotionId, "sourcePromotionId")
        : null,
      channel,
      contactValue,
      contactHash,
      contactMasked,
      state,
      authorizationBasis: null,
      evidenceReference: null,
      authorizationExpiresAt: null,
      suppressionReason: boundedText(
        input.suppressionReason,
        "suppressionReason",
        12,
        1_000,
      ),
      notes,
    };
  }

  const sourcePromotionId = uuid(input.sourcePromotionId, "sourcePromotionId");
  const authorizationBasis = String(input.authorizationBasis || "")
    .trim()
    .toLowerCase() as SupplierRfqContactAuthorizationBasis;
  if (!EXPORTUNITY_RFQ_CONTACT_AUTHORIZATION_BASES.includes(authorizationBasis)) {
    throw new SupplierRfqDispatchPolicyError(
      "SUPPLIER_RFQ_CONTACT_BASIS_INVALID",
      "authorizationBasis must identify the reviewed permission basis.",
    );
  }
  const evidenceReference = boundedText(
    input.evidenceReference,
    "evidenceReference",
    8,
    500,
  );
  const authorizationExpiresAt = new Date(String(input.authorizationExpiresAt || ""));
  const minimumExpiry = now.getTime() + 60 * 60 * 1_000;
  const maximumExpiry =
    now.getTime() + EXPORTUNITY_RFQ_CONTACT_AUTHORIZATION_MAXIMUM_DAYS * 24 * 60 * 60 * 1_000;
  if (
    Number.isNaN(authorizationExpiresAt.valueOf()) ||
    authorizationExpiresAt.getTime() < minimumExpiry ||
    authorizationExpiresAt.getTime() > maximumExpiry
  ) {
    throw new SupplierRfqDispatchPolicyError(
      "SUPPLIER_RFQ_CONTACT_EXPIRY_INVALID",
      `authorizationExpiresAt must be between 1 hour and ${EXPORTUNITY_RFQ_CONTACT_AUTHORIZATION_MAXIMUM_DAYS} days from now.`,
    );
  }

  return {
    supplierProfileId,
    sourcePromotionId,
    channel,
    contactValue,
    contactHash,
    contactMasked,
    state,
    authorizationBasis,
    evidenceReference,
    authorizationExpiresAt,
    suppressionReason: null,
    notes,
  };
}

export function parseSupplierRfqDispatchInput(
  value: unknown,
): ParsedSupplierRfqDispatchInput {
  const input = objectValue(value);
  const channel = dispatchChannel(input.channel);
  const checklistInput = objectValue(input.checklist);
  const checklist = {} as SupplierRfqDispatchChecklist;
  for (const key of EXPORTUNITY_RFQ_DISPATCH_CHECKLIST) {
    if (checklistInput[key] !== true) {
      throw new SupplierRfqDispatchPolicyError(
        "SUPPLIER_RFQ_DISPATCH_ATTESTATION_REQUIRED",
        `${key} must be explicitly confirmed before dispatch.`,
      );
    }
    checklist[key] = true;
  }

  return {
    channel,
    expectedContentHash: sha256(input.expectedContentHash, "expectedContentHash"),
    expectedRecipientHash: sha256(input.expectedRecipientHash, "expectedRecipientHash"),
    dispatchNotes: boundedText(input.dispatchNotes, "dispatchNotes", 24, 1_000),
    checklist,
  };
}

export function computeSupplierRfqDispatchIdempotencyKey(input: {
  decisionId: string;
  contentHash: string;
  channel: SupplierRfqDispatchChannel;
  recipientHash: string;
}) {
  return createHash("sha256")
    .update(
      [input.decisionId, input.contentHash, input.channel, input.recipientHash].join(":"),
      "utf8",
    )
    .digest("hex");
}

export function assertSupplierRfqWhatsAppLength(messageBody: string) {
  if (messageBody.length > EXPORTUNITY_RFQ_WHATSAPP_MAXIMUM_CHARACTERS) {
    throw new SupplierRfqDispatchPolicyError(
      "SUPPLIER_RFQ_WHATSAPP_CONTENT_TOO_LONG",
      `WhatsApp RFQ content must not exceed ${EXPORTUNITY_RFQ_WHATSAPP_MAXIMUM_CHARACTERS} characters. Use email or create a shorter revision.`,
    );
  }
  return true;
}
