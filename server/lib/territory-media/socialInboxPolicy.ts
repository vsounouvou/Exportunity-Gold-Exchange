export const SOCIAL_INBOX_CLASSIFICATIONS = [
  "interest",
  "purchase_request",
  "wholesale_request",
  "partnership",
  "producer_application",
  "creator_application",
  "delivery_question",
  "complaint",
  "misinformation",
  "spam",
  "abuse",
  "sensitive_issue",
  "press_request",
] as const;

export type SocialInboxClassification = (typeof SOCIAL_INBOX_CLASSIFICATIONS)[number];

export const SOCIAL_INBOX_PLATFORMS = ["facebook", "instagram", "youtube", "tiktok", "linkedin", "x"] as const;
export type SocialInboxPlatform = (typeof SOCIAL_INBOX_PLATFORMS)[number];

export const SOCIAL_INBOX_EVENT_TYPES = ["comment", "direct_message", "mention", "reply"] as const;
export type SocialInboxEventType = (typeof SOCIAL_INBOX_EVENT_TYPES)[number];

export const SOCIAL_INBOX_CHANNELS = [
  "facebook_comment",
  "facebook_messenger",
  "instagram_comment",
  "instagram_dm",
  "youtube_comment",
  "tiktok_comment",
  "tiktok_dm",
  "linkedin_comment",
  "linkedin_dm",
  "x_reply",
  "x_dm",
] as const;
export type SocialInboxChannel = (typeof SOCIAL_INBOX_CHANNELS)[number];

export const SOCIAL_INBOX_VERIFICATION_METHODS = [
  "provider_signature",
  "provider_api_poll",
  "manual_export_review",
] as const;

const PLATFORM_PROVIDER: Record<SocialInboxPlatform, "meta" | "google" | "tiktok" | "linkedin" | "x"> = {
  facebook: "meta",
  instagram: "meta",
  youtube: "google",
  tiktok: "tiktok",
  linkedin: "linkedin",
  x: "x",
};

const PLATFORM_CHANNELS: Record<SocialInboxPlatform, readonly SocialInboxChannel[]> = {
  facebook: ["facebook_comment", "facebook_messenger"],
  instagram: ["instagram_comment", "instagram_dm"],
  youtube: ["youtube_comment"],
  tiktok: ["tiktok_comment", "tiktok_dm"],
  linkedin: ["linkedin_comment", "linkedin_dm"],
  x: ["x_reply", "x_dm"],
};

const LEAD_ELIGIBLE = new Set<SocialInboxClassification>([
  "interest",
  "purchase_request",
  "wholesale_request",
  "partnership",
  "producer_application",
  "creator_application",
  "press_request",
]);

const HUMAN_ONLY = new Set<SocialInboxClassification>([
  "complaint",
  "misinformation",
  "spam",
  "abuse",
  "sensitive_issue",
  "press_request",
]);

type ClassificationRule = {
  classification: SocialInboxClassification;
  confidenceBps: number;
  keys: string[];
  patterns: RegExp[];
};

// Deliberately deterministic and reviewable. This is routing, not a claim of
// human-level intent detection; the evidence keys make every decision auditable.
const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    classification: "sensitive_issue",
    confidenceBps: 9400,
    keys: ["legal_or_safety", "personal_data", "minor_or_self_harm"],
    patterns: [
      /\b(lawyer|legal action|regulator|police|lawsuit|court|injur(?:y|ed)|unsafe|poison|recall)\b/,
      /\b(personal data|privacy breach|identity theft|passport|bank account)\b/,
      /\b(child|minor|self harm|suicide|trafficking|exploitation)\b/,
      /\b(avocat|justice|police|bless(?:e|ure)|dangereux|donnees personnelles)\b/,
    ],
  },
  {
    classification: "abuse",
    confidenceBps: 9300,
    keys: ["threat_or_harassment"],
    patterns: [
      /\b(i will (?:hurt|kill|find|destroy)|you should die|hate you|threat)\b/,
      /\b(je vais (?:vous )?(?:tuer|frapper)|menace|harcelement)\b/,
    ],
  },
  {
    classification: "spam",
    confidenceBps: 9000,
    keys: ["unsolicited_promotion", "suspicious_link_pattern"],
    patterns: [
      /\b(crypto giveaway|guaranteed profit|earn money fast|free followers|buy followers|dm for promotion)\b/,
      /\b(gagnez de l'argent vite|abonn(?:e|es) gratuits|promotion garantie)\b/,
    ],
  },
  {
    classification: "misinformation",
    confidenceBps: 8700,
    keys: ["false_claim_or_impersonation"],
    patterns: [
      /\b(this is (?:fake|false)|you are a scam|not the real|impersonat(?:e|ing)|fabricated claim)\b/,
      /\b(c'est faux|arnaque|usurpation|faux compte|information fausse)\b/,
    ],
  },
  {
    classification: "complaint",
    confidenceBps: 8800,
    keys: ["dissatisfaction_or_refund"],
    patterns: [
      /\b(complaint|refund|damaged|broken|wrong item|never arrived|poor quality|terrible service|not satisfied)\b/,
      /\b(plainte|remboursement|endommage|casse|mauvais produit|jamais recu|mauvaise qualite|insatisfait)\b/,
    ],
  },
  {
    classification: "press_request",
    confidenceBps: 9100,
    keys: ["press_or_interview"],
    patterns: [
      /\b(journalist|press request|media inquiry|interview request|newsroom|publication deadline)\b/,
      /\b(journaliste|demande de presse|interview|redaction|media)\b/,
    ],
  },
  {
    classification: "producer_application",
    confidenceBps: 9000,
    keys: ["producer_onboarding"],
    patterns: [
      /\b(i am (?:a )?(?:producer|farmer|manufacturer)|list my products|become a supplier|producer application)\b/,
      /\b(je suis (?:un |une )?(?:producteur|agriculteur|fabricant)|vendre mes produits|devenir fournisseur)\b/,
    ],
  },
  {
    classification: "creator_application",
    confidenceBps: 9000,
    keys: ["creator_onboarding"],
    patterns: [
      /\b(content creator|influencer|videographer|photographer|creator application|collaborate as a creator)\b/,
      /\b(createur de contenu|influenceur|videaste|photographe|candidature createur)\b/,
    ],
  },
  {
    classification: "wholesale_request",
    confidenceBps: 9200,
    keys: ["bulk_or_distribution"],
    patterns: [
      /\b(wholesale|bulk order|distributor|reseller|container load|minimum order|moq|trade price)\b/,
      /\b(grossiste|commande en gros|distributeur|revendeur|prix de gros|quantite minimum)\b/,
    ],
  },
  {
    classification: "partnership",
    confidenceBps: 8700,
    keys: ["business_partnership"],
    patterns: [
      /\b(partnership|strategic partner|business collaboration|joint venture|sponsor(?:ship)?)\b/,
      /\b(partenariat|collaboration commerciale|coentreprise|sponsor)\b/,
    ],
  },
  {
    classification: "delivery_question",
    confidenceBps: 8900,
    keys: ["delivery_or_tracking"],
    patterns: [
      /\b(delivery|shipping|ship to|tracking|where is my order|arrival time|customs clearance)\b/,
      /\b(livraison|expedition|suivi|ou est ma commande|delai d'arrivee|dedouanement)\b/,
    ],
  },
  {
    classification: "purchase_request",
    confidenceBps: 8600,
    keys: ["explicit_purchase_intent"],
    patterns: [
      /\b(i want to buy|ready to order|place an order|checkout|send (?:an )?invoice|buy this|purchase this|quotation)\b/,
      /\b(je veux acheter|passer une commande|pret a commander|facture|acheter ceci|devis)\b/,
    ],
  },
];

function normalizedText(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function enumValue<T extends readonly string[]>(values: T, value: unknown, field: string): T[number] {
  const normalized = normalizedText(value).replace(/\s+/g, "_");
  if (!(values as readonly string[]).includes(normalized)) throw new Error(`${field} is unsupported`);
  return normalized as T[number];
}

export function providerForSocialInboxPlatform(platform: SocialInboxPlatform) {
  return PLATFORM_PROVIDER[platform];
}

export function normalizeSocialInboxDescriptor(input: {
  provider: unknown;
  platform: unknown;
  channel: unknown;
  eventType: unknown;
}) {
  const platform = enumValue(SOCIAL_INBOX_PLATFORMS, input.platform, "platform");
  const channel = enumValue(SOCIAL_INBOX_CHANNELS, input.channel, "channel");
  const eventType = enumValue(SOCIAL_INBOX_EVENT_TYPES, input.eventType, "eventType");
  const provider = normalizedText(input.provider);
  const expectedProvider = providerForSocialInboxPlatform(platform);
  if (provider !== expectedProvider && provider !== "manual") {
    throw new Error(`provider must be ${expectedProvider} for ${platform}`);
  }
  if (!PLATFORM_CHANNELS[platform].includes(channel)) {
    throw new Error(`channel ${channel} does not belong to ${platform}`);
  }
  if (eventType === "direct_message" && !channel.endsWith("_dm") && channel !== "facebook_messenger") {
    throw new Error("direct_message events require a direct-message channel");
  }
  if (eventType !== "direct_message" && (channel.endsWith("_dm") || channel === "facebook_messenger")) {
    throw new Error("direct-message channels require eventType direct_message");
  }
  return { provider: provider as typeof expectedProvider | "manual", platform, channel, eventType };
}

export function classifySocialInboxText(value: unknown) {
  const text = normalizedText(value);
  const urlCount = (text.match(/https?:\/\//g) || []).length;
  if (urlCount >= 3) {
    return {
      classification: "spam" as const,
      confidenceBps: 9300,
      evidence: { policyVersion: "social-inbox-routing-v1", matchedRule: "suspicious_link_pattern", urlCount },
    };
  }
  for (const rule of CLASSIFICATION_RULES) {
    const patternIndex = rule.patterns.findIndex((pattern) => pattern.test(text));
    if (patternIndex >= 0) {
      return {
        classification: rule.classification,
        confidenceBps: rule.confidenceBps,
        evidence: {
          policyVersion: "social-inbox-routing-v1",
          matchedRule: rule.keys[Math.min(patternIndex, rule.keys.length - 1)],
          deterministic: true,
        },
      };
    }
  }
  return {
    classification: "interest" as const,
    confidenceBps: text.length >= 8 ? 6200 : 4500,
    evidence: {
      policyVersion: "social-inbox-routing-v1",
      matchedRule: "default_interest_review",
      deterministic: true,
      reviewRecommended: true,
    },
  };
}

export function isLeadEligibleClassification(classification: SocialInboxClassification) {
  return LEAD_ELIGIBLE.has(classification);
}

export function moderationStatusForClassification(classification: SocialInboxClassification) {
  if (classification === "sensitive_issue") return "sensitive" as const;
  if (classification === "complaint") return "complaint" as const;
  if (classification === "misinformation") return "misinformation" as const;
  if (classification === "spam") return "spam" as const;
  if (classification === "abuse") return "abuse" as const;
  return "normal" as const;
}

export function initialReplyPolicyStatus(classification: SocialInboxClassification) {
  return HUMAN_ONLY.has(classification) ? ("human_only" as const) : ("fact_pack_required" as const);
}

export function socialInboxDueAt(classification: SocialInboxClassification, receivedAt = new Date()) {
  const minutes =
    classification === "sensitive_issue" || classification === "abuse"
      ? 30
      : classification === "complaint" || classification === "misinformation" || classification === "press_request"
        ? 60
        : classification === "purchase_request" || classification === "wholesale_request"
          ? 240
          : 720;
  return new Date(receivedAt.getTime() + minutes * 60_000);
}

export function sanitizeSocialVerificationEvidence(value: unknown, now = new Date()) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  if (source.verified !== true) throw new Error("verified provider evidence is required");
  if (source.businessOwnedAccountConfirmed !== true) throw new Error("business-owned account confirmation is required");
  if (source.credentialsExcluded !== true) throw new Error("verification must confirm credentials were excluded");
  const method = enumValue(SOCIAL_INBOX_VERIFICATION_METHODS, source.method, "verification method");
  const verifiedAt = new Date(String(source.verifiedAt || ""));
  if (!Number.isFinite(verifiedAt.getTime())) throw new Error("verification verifiedAt is required");
  if (verifiedAt.getTime() > now.getTime() + 5 * 60_000) throw new Error("verification timestamp cannot be in the future");
  const requestId = String(source.requestId || "").trim().slice(0, 240);
  const checksum = String(source.checksum || "").trim().slice(0, 240);
  if (!requestId && !checksum) throw new Error("verification requestId or checksum is required");
  return {
    verified: true,
    method,
    verifiedAt: verifiedAt.toISOString(),
    businessOwnedAccountConfirmed: true,
    credentialsExcluded: true,
    adapter: String(source.adapter || "").trim().slice(0, 120) || null,
    requestId: requestId || null,
    checksum: checksum || null,
    source: String(source.source || "").trim().slice(0, 120) || null,
  };
}

export function evaluateSocialReplyPolicy(input: {
  classification: SocialInboxClassification;
  adapterAvailable: boolean;
  approvedFactRefs?: string[];
  approvedPolicyRefs?: string[];
  approvedToneRef?: string | null;
  approvedPriceRefs?: string[];
  containsPriceClaim?: boolean;
  humanApproved?: boolean;
}) {
  const blockers: string[] = [];
  if (!input.adapterAvailable) blockers.push("official_reply_adapter_unavailable");
  if (!(input.approvedFactRefs || []).length) blockers.push("approved_product_fact_reference_required");
  if (!(input.approvedPolicyRefs || []).length) blockers.push("approved_policy_reference_required");
  if (!String(input.approvedToneRef || "").trim()) blockers.push("approved_tone_reference_required");
  if (input.containsPriceClaim && !(input.approvedPriceRefs || []).length) {
    blockers.push("approved_price_reference_required");
  }
  if (HUMAN_ONLY.has(input.classification) && input.humanApproved !== true) {
    blockers.push("human_approval_required_for_sensitive_classification");
  }
  return {
    eligible: blockers.length === 0,
    blockers,
    externalReplyPerformed: false,
    policyVersion: "social-reply-governance-v1",
  };
}
