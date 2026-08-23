export const EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE =
  "business_identity_and_requirement_product_relevance" as const;
export const EXPORTUNITY_SUPPLIER_VERIFICATION_MINIMUM_EVIDENCE = 2;
export const EXPORTUNITY_SUPPLIER_VERIFICATION_MAXIMUM_EVIDENCE_AGE_DAYS = 183;

export const EXPORTUNITY_SUPPLIER_CONTACT_TYPES = [
  "email",
  "phone",
  "website",
] as const;

export type SupplierBusinessContactType =
  (typeof EXPORTUNITY_SUPPLIER_CONTACT_TYPES)[number];

export type SupplierPromotionChecklist = {
  legalIdentityConfirmed: true;
  countryOfRegistrationConfirmed: true;
  requirementProductRelevanceConfirmed: true;
  publicBusinessContactConfirmed: true;
  evidenceReviewedByHuman: true;
  noOutreachAuthorized: true;
};

export type ParsedSupplierPromotionDecision = {
  candidateId: string;
  legalName: string;
  normalizedLegalName: string;
  countryCode: string;
  selectedEvidenceIds: string[];
  officialEvidenceId: string;
  contactEvidenceId: string;
  contact: {
    type: SupplierBusinessContactType;
    value: string;
  };
  checklist: SupplierPromotionChecklist;
  decisionNotes: string;
  verificationScope: typeof EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE;
};

export type SupplierPromotionEvidenceRecord = {
  id: string;
  sourceType: string;
  sourceUrl: string;
  retrievedAt: Date | string;
  contentHash: string;
  evidence: Record<string, unknown>;
};

export class SupplierVerificationPolicyError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SupplierVerificationPolicyError";
    this.code = code;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{6,30}$/;

function fail(message: string): never {
  throw new SupplierVerificationPolicyError(
    "SUPPLIER_VERIFICATION_VALIDATION_FAILED",
    message,
  );
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

function parseUuid(value: unknown, field: string) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) fail(`${field} must be a valid UUID.`);
  return normalized;
}

export function normalizeSupplierLegalName(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseContactValue(type: SupplierBusinessContactType, value: unknown) {
  const contactValue = boundedText(value, "contact.value", 5, 320);
  if (type === "email") {
    const normalized = contactValue.toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) fail("contact.value must be a valid business email.");
    return normalized;
  }
  if (type === "phone") {
    if (!PHONE_PATTERN.test(contactValue)) fail("contact.value must be a valid business phone number.");
    return contactValue.replace(/\s+/g, " ");
  }
  try {
    const url = new URL(contactValue);
    if (!/^https?:$/.test(url.protocol)) throw new Error("unsupported protocol");
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return fail("contact.value must be a valid HTTP(S) business website.");
  }
}

function parseChecklist(value: unknown): SupplierPromotionChecklist {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("checklist must contain the required human attestations.");
  }
  const raw = value as Record<string, unknown>;
  const keys: Array<keyof SupplierPromotionChecklist> = [
    "legalIdentityConfirmed",
    "countryOfRegistrationConfirmed",
    "requirementProductRelevanceConfirmed",
    "publicBusinessContactConfirmed",
    "evidenceReviewedByHuman",
    "noOutreachAuthorized",
  ];
  for (const key of keys) {
    if (raw[key] !== true) fail(`checklist.${key} must be explicitly confirmed.`);
  }
  return Object.fromEntries(keys.map((key) => [key, true])) as SupplierPromotionChecklist;
}

export function parseSupplierPromotionDecision(
  value: unknown,
): ParsedSupplierPromotionDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("Supplier verification decision payload is required.");
  }
  const raw = value as Record<string, any>;
  const candidateId = parseUuid(raw.candidateId, "candidateId");
  const legalName = boundedText(raw.legalName, "legalName", 2, 180);
  const normalizedLegalName = normalizeSupplierLegalName(legalName);
  if (normalizedLegalName.length < 2) fail("legalName is not specific enough.");
  const countryCode = String(raw.countryCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    fail("countryCode must be a two-letter ISO country code.");
  }

  if (!Array.isArray(raw.selectedEvidenceIds)) {
    return fail("selectedEvidenceIds must be an array of evidence UUIDs.");
  }
  const selectedEvidenceIds = Array.from(
    new Set(raw.selectedEvidenceIds.map((id: unknown) => parseUuid(id, "selectedEvidenceIds"))),
  );
  if (
    selectedEvidenceIds.length < EXPORTUNITY_SUPPLIER_VERIFICATION_MINIMUM_EVIDENCE ||
    selectedEvidenceIds.length > 10
  ) {
    fail("Select 2 to 10 independent evidence snapshots for verification.");
  }
  const officialEvidenceId = parseUuid(raw.officialEvidenceId, "officialEvidenceId");
  const contactEvidenceId = parseUuid(raw.contactEvidenceId, "contactEvidenceId");
  if (!selectedEvidenceIds.includes(officialEvidenceId)) {
    fail("officialEvidenceId must be included in selectedEvidenceIds.");
  }
  if (!selectedEvidenceIds.includes(contactEvidenceId)) {
    fail("contactEvidenceId must be included in selectedEvidenceIds.");
  }
  if (officialEvidenceId === contactEvidenceId) {
    fail("Identity and business-contact verification require two different official evidence snapshots.");
  }

  const contactType = String(raw.contact?.type ?? "").trim() as SupplierBusinessContactType;
  if (!EXPORTUNITY_SUPPLIER_CONTACT_TYPES.includes(contactType)) {
    fail("contact.type must be email, phone, or website.");
  }

  return {
    candidateId,
    legalName,
    normalizedLegalName,
    countryCode,
    selectedEvidenceIds,
    officialEvidenceId,
    contactEvidenceId,
    contact: {
      type: contactType,
      value: parseContactValue(contactType, raw.contact?.value),
    },
    checklist: parseChecklist(raw.checklist),
    decisionNotes: boundedText(raw.decisionNotes, "decisionNotes", 24, 2_000),
    verificationScope: EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE,
  };
}

function evidenceText(record: SupplierPromotionEvidenceRecord) {
  const evidence = record.evidence || {};
  return normalizeSupplierLegalName(
    [
      evidence.summary,
      evidence.excerpt,
      ...(Array.isArray(evidence.signals) ? evidence.signals : []),
      evidence.registryNumber,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function host(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function assessSupplierPromotionEvidence(input: {
  decision: ParsedSupplierPromotionDecision;
  evidence: SupplierPromotionEvidenceRecord[];
  now?: Date;
}) {
  const { decision } = input;
  const byId = new Map(input.evidence.map((item) => [item.id.toLowerCase(), item]));
  const selected = decision.selectedEvidenceIds.map((id) => byId.get(id)).filter(Boolean) as SupplierPromotionEvidenceRecord[];
  if (selected.length !== decision.selectedEvidenceIds.length) {
    return fail("Every selected evidence snapshot must belong to this discovery candidate.");
  }
  const independentSourceUrls = new Set(selected.map((item) => item.sourceUrl));
  const independentContentHashes = new Set(selected.map((item) => item.contentHash));
  if (
    independentSourceUrls.size < EXPORTUNITY_SUPPLIER_VERIFICATION_MINIMUM_EVIDENCE ||
    independentContentHashes.size < EXPORTUNITY_SUPPLIER_VERIFICATION_MINIMUM_EVIDENCE
  ) {
    fail("Verification requires at least two distinct source URLs and content snapshots.");
  }

  const now = input.now || new Date();
  const maximumAgeMs =
    EXPORTUNITY_SUPPLIER_VERIFICATION_MAXIMUM_EVIDENCE_AGE_DAYS * 24 * 60 * 60 * 1_000;
  for (const item of selected) {
    const retrievedAt = new Date(item.retrievedAt);
    if (
      Number.isNaN(retrievedAt.valueOf()) ||
      retrievedAt.getTime() > now.getTime() + 24 * 60 * 60 * 1_000 ||
      now.getTime() - retrievedAt.getTime() > maximumAgeMs
    ) {
      fail(`Evidence ${item.id} is stale or has an invalid retrieval time.`);
    }
  }

  const official = byId.get(decision.officialEvidenceId);
  if (!official || official.sourceType !== "government_registry") {
    fail("The official identity source must be a government_registry snapshot.");
  }
  const registryNumber = String(official.evidence?.registryNumber ?? "").trim();
  if (registryNumber.length < 2) {
    fail("Government registry evidence must include a registry number.");
  }
  const normalizedOfficialText = evidenceText(official);
  if (!normalizedOfficialText.includes(decision.normalizedLegalName)) {
    fail("Government registry evidence must explicitly contain the confirmed legal name.");
  }

  const contactEvidence = byId.get(decision.contactEvidenceId);
  if (
    !contactEvidence ||
    !["official_website", "government_registry"].includes(contactEvidence.sourceType)
  ) {
    fail("The business contact must be supported by an official website or government registry snapshot.");
  }
  const normalizedContact = normalizeSupplierLegalName(decision.contact.value);
  const contactSupported =
    decision.contact.type === "website"
      ? host(decision.contact.value) === host(contactEvidence.sourceUrl)
      : evidenceText(contactEvidence).includes(normalizedContact);
  if (!contactSupported) {
    fail("The selected official evidence does not support the confirmed business contact.");
  }

  return {
    evidenceCount: selected.length,
    registryNumber,
    officialEvidenceId: official.id,
    contactEvidenceId: contactEvidence.id,
    contentHashes: selected.map((item) => item.contentHash),
    oldestRetrievedAt: selected
      .map((item) => new Date(item.retrievedAt))
      .sort((left, right) => left.getTime() - right.getTime())[0]
      .toISOString(),
  };
}
