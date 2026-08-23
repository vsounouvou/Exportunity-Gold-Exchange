import OpenAI from "openai";
import { createHash } from "crypto";
import { assertAiEnabled, isAiEnabled } from "../ai-consent";
import { EXPORTUNITY_COMPANY_CONTEXT } from "./companyContext";
import {
  analyzeCommercialIntent,
  COMMERCIAL_INTENTS,
  resolveCommercialQualification,
  type CommercialIntentAnalysis,
} from "./commercialIntentEngine";
import { getExportunityAgentModelPolicy } from "./modelPolicy";
import {
  INDUSTRIAL_REQUIREMENT_TYPES,
  INDUSTRIAL_TAXONOMY,
  isIndustrialCategoryCode,
  normalizeIndustrialText,
} from "./taxonomy";

export type IndustrialIntakeLanguage = "fr" | "en";

export type IndustrialIntakeFacts = {
  quantityText?: string;
  deliveryDestination?: string;
  requiredBy?: string;
  purchasePriority?: string;
};

export type IndustrialIntakePreview = {
  requirementType:
    | "machinery"
    | "raw_material"
    | "industrial_input"
    | "spare_part"
    | "custom_manufacturing"
    | "industrial_service"
    | "export_quotation";
  categoryCode: string;
  title: string;
  urgency: "standard" | "urgent" | "planned";
  facts: IndustrialIntakeFacts;
  intent: CommercialIntentAnalysis["intent"];
  confidence: number;
  commercial: boolean;
  product: CommercialIntentAnalysis["product"];
  origin?: string;
  targetPrice?: string;
  currency?: string;
  deadline?: string;
  frequency?: string;
  incoterm?: string;
  customerType?: string;
  missingFields: string[];
  suggestedAction: CommercialIntentAnalysis["suggestedAction"];
  classificationMode: "deterministic" | "semantic_fallback";
  response: string;
};

export type IndustrialIntakeAssistantReply = IndustrialIntakePreview & {
  /**
   * A model may improve wording or propose a semantic fallback, but validated
   * deterministic rules remain the only action authority for a created case.
   */
  responseMode: "ai" | "guided";
};

const TYPE_LABELS: Record<
  IndustrialIntakeLanguage,
  Record<IndustrialIntakePreview["requirementType"], string>
> = {
  en: {
    machinery: "machine or production-line request",
    raw_material: "raw-material or commodity request",
    industrial_input: "industrial input request",
    spare_part: "spare-part request",
    custom_manufacturing: "scan-to-manufacture request",
    industrial_service: "industrial service request",
    export_quotation: "export-product request",
  },
  fr: {
    machinery: "demande de machine ou de ligne de production",
    raw_material: "demande de matiere premiere ou de commodite",
    industrial_input: "demande d'intrant industriel",
    spare_part: "demande de piece detachee",
    custom_manufacturing: "demande de scan et fabrication",
    industrial_service: "demande de service industriel",
    export_quotation: "demande de produit export",
  },
};

const CATEGORY_BY_REQUIREMENT_TYPE: Record<
  IndustrialIntakePreview["requirementType"],
  string
> = {
  machinery: "machinery_and_production_equipment",
  raw_material: "raw_materials",
  industrial_input: "industrial_inputs_and_consumables",
  spare_part: "spare_parts_and_components",
  custom_manufacturing: "spare_parts_and_components",
  industrial_service: "industrial_services",
  export_quotation: "export_ready_factory_products",
};

const SEMANTIC_FALLBACK_MIN_CONFIDENCE = 0.82;
const VALID_INCOTERMS = new Set([
  "EXW",
  "FCA",
  "FOB",
  "CFR",
  "CIF",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
]);

export type SemanticCommercialIntentCandidate = {
  intent: CommercialIntentAnalysis["intent"];
  confidence: number;
  productName?: string;
  productCategory?: string;
  specification?: string;
  quantity?: string;
  unit?: string;
  requirementType?: IndustrialIntakePreview["requirementType"];
  categoryCode?: string;
  origin?: string;
  destination?: string;
  targetPrice?: string;
  currency?: string;
  deadline?: string;
  frequency?: string;
  incoterm?: string;
  customerType?: string;
};

const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const;

/**
 * Strict provider response shape. A model never returns an action mode; action
 * authority remains in resolveCommercialQualification after validation.
 */
export const SEMANTIC_COMMERCIAL_INTENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: [...COMMERCIAL_INTENTS] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    productName: nullableStringSchema,
    productCategory: nullableStringSchema,
    specification: nullableStringSchema,
    quantity: nullableStringSchema,
    unit: nullableStringSchema,
    requirementType: {
      anyOf: [
        { type: "string", enum: [...INDUSTRIAL_REQUIREMENT_TYPES] },
        { type: "null" },
      ],
    },
    categoryCode: {
      anyOf: [
        {
          type: "string",
          enum: INDUSTRIAL_TAXONOMY.map((category) => category.code),
        },
        { type: "null" },
      ],
    },
    origin: nullableStringSchema,
    destination: nullableStringSchema,
    targetPrice: nullableStringSchema,
    currency: nullableStringSchema,
    deadline: nullableStringSchema,
    frequency: nullableStringSchema,
    incoterm: nullableStringSchema,
    customerType: nullableStringSchema,
  },
  required: [
    "intent",
    "confidence",
    "productName",
    "productCategory",
    "specification",
    "quantity",
    "unit",
    "requirementType",
    "categoryCode",
    "origin",
    "destination",
    "targetPrice",
    "currency",
    "deadline",
    "frequency",
    "incoterm",
    "customerType",
  ],
} as const;

function boundedSemanticString(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function semanticProductCategory(value: unknown) {
  const bounded = boundedSemanticString(value, 80);
  if (!bounded) return undefined;
  const normalized = normalizeIndustrialText(bounded).replace(/\s+/g, "_");
  return normalized ? normalized.slice(0, 80) : undefined;
}

export function parseSemanticCommercialIntentCandidate(
  value: unknown,
): SemanticCommercialIntentCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const intent = COMMERCIAL_INTENTS.find(
    (entry) => entry === String(candidate.intent || ""),
  );
  const confidence = Number(candidate.confidence);
  if (
    !intent ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  )
    return null;

  const requirementType = INDUSTRIAL_REQUIREMENT_TYPES.find(
    (entry) => entry === String(candidate.requirementType || ""),
  );
  const categoryCodeValue = boundedSemanticString(candidate.categoryCode, 80);
  const categoryCode =
    categoryCodeValue && isIndustrialCategoryCode(categoryCodeValue)
      ? categoryCodeValue
      : undefined;
  const currencyValue = boundedSemanticString(candidate.currency, 8)?.toUpperCase();
  const incotermValue = boundedSemanticString(candidate.incoterm, 8)?.toUpperCase();

  return {
    intent,
    confidence,
    productName: boundedSemanticString(candidate.productName, 160),
    productCategory: semanticProductCategory(candidate.productCategory),
    specification: boundedSemanticString(candidate.specification, 240),
    quantity: boundedSemanticString(candidate.quantity, 80),
    unit: boundedSemanticString(candidate.unit, 40),
    requirementType,
    categoryCode,
    origin: boundedSemanticString(candidate.origin, 120),
    destination: boundedSemanticString(candidate.destination, 120),
    targetPrice: boundedSemanticString(candidate.targetPrice, 120),
    currency:
      currencyValue && /^[A-Z]{3,5}$/.test(currencyValue)
        ? currencyValue
        : undefined,
    deadline: boundedSemanticString(candidate.deadline, 120),
    frequency: boundedSemanticString(candidate.frequency, 120),
    incoterm:
      incotermValue && VALID_INCOTERMS.has(incotermValue)
        ? incotermValue
        : undefined,
    customerType: boundedSemanticString(candidate.customerType, 80),
  };
}

export function shouldUseSemanticCommercialFallback(
  message: string,
  preview: IndustrialIntakePreview,
) {
  if (mayRefineDeterministicBuyIntent(message, preview)) return true;
  if (preview.product.name) return false;
  if (preview.commercial) return true;

  const normalized = normalizeIndustrialText(message);
  const hasCommercialCue = includesAny(normalized, [
    "looking for",
    "recherche",
    "cherche",
    "procurement",
    "purchase",
    "acheter",
    "buy",
    "supplier",
    "fournisseur",
    "vendor",
    "supply",
    "approvisionnement",
    "source",
    "quote",
    "devis",
    "order",
    "commande",
    "need",
    "besoin",
    "wholesale",
    "en gros",
    "export",
    "import",
    "deliver",
    "livrer",
  ]);
  const hasTradeStructure = Boolean(
    preview.facts.quantityText &&
      (preview.facts.deliveryDestination || preview.incoterm),
  );
  return hasCommercialCue || hasTradeStructure;
}

export function mayRefineDeterministicBuyIntent(
  message: string,
  preview: IndustrialIntakePreview,
) {
  if (preview.intent !== "BUY_PRODUCT" || !preview.product.name) return false;
  const normalized = normalizeIndustrialText(message);
  const explicitBuyingCue = includesAny(normalized, [
    "acheter",
    "achat",
    "buy",
    "purchase",
    "commander",
    "commande",
    "order",
    "besoin de",
    "need",
    "looking for",
    "recherche",
    "cherche",
    "sourcer",
    "source",
    "approvisionner",
    "procurement",
  ]);
  return !explicitBuyingCue;
}

function semanticQuantityText(candidate: SemanticCommercialIntentCandidate) {
  return boundedSemanticString(
    [candidate.quantity, candidate.unit].filter(Boolean).join(" "),
    120,
  );
}

export function applySemanticCommercialIntentCandidate(input: {
  preview: IndustrialIntakePreview;
  candidate: unknown;
  language?: IndustrialIntakeLanguage;
  allowIntentRefinement?: boolean;
}): IndustrialIntakePreview {
  const candidate = parseSemanticCommercialIntentCandidate(input.candidate);
  if (
    !candidate ||
    candidate.confidence < SEMANTIC_FALLBACK_MIN_CONFIDENCE ||
    (candidate.intent === "GENERAL_QUESTION" && !input.allowIntentRefinement)
  ) {
    return input.preview;
  }

  const semanticRequirementType =
    candidate.requirementType ||
    (candidate.categoryCode
      ? (Object.entries(CATEGORY_BY_REQUIREMENT_TYPE).find(
          ([, code]) => code === candidate.categoryCode,
        )?.[0] as IndustrialIntakePreview["requirementType"] | undefined)
      : undefined);
  const canRefineDefaultRoute =
    input.preview.requirementType === "industrial_input" &&
    input.preview.categoryCode === "industrial_inputs_and_consumables";
  const requirementType =
    canRefineDefaultRoute && semanticRequirementType
      ? semanticRequirementType
      : input.preview.requirementType;
  const categoryCode = CATEGORY_BY_REQUIREMENT_TYPE[requirementType];
  const intent =
    input.preview.intent === "GENERAL_QUESTION" ||
    (input.allowIntentRefinement && input.preview.intent === "BUY_PRODUCT")
      ? candidate.intent
      : input.preview.intent;
  const facts: IndustrialIntakeFacts = {
    ...input.preview.facts,
    quantityText:
      input.preview.facts.quantityText || semanticQuantityText(candidate),
    deliveryDestination:
      input.preview.facts.deliveryDestination || candidate.destination,
    requiredBy: input.preview.facts.requiredBy || candidate.deadline,
  };
  const product = {
    name: input.preview.product.name || candidate.productName,
    category:
      input.preview.product.category || candidate.productCategory || categoryCode,
    specification:
      input.preview.product.specification || candidate.specification,
    quantity:
      input.preview.product.quantity ||
      candidate.quantity ||
      facts.quantityText,
    unit: input.preview.product.unit || candidate.unit,
  };
  const commercialIntent = resolveCommercialQualification({
    analysis: {
      intent,
      confidence:
        input.preview.intent === "GENERAL_QUESTION" ||
        input.allowIntentRefinement
          ? candidate.confidence
          : Math.max(input.preview.confidence, candidate.confidence),
      commercial: intent !== "GENERAL_QUESTION",
      product,
      origin: input.preview.origin || candidate.origin,
      destination:
        input.preview.facts.deliveryDestination || candidate.destination,
      targetPrice: input.preview.targetPrice || candidate.targetPrice,
      currency: input.preview.currency || candidate.currency,
      deadline: input.preview.deadline || candidate.deadline,
      frequency: input.preview.frequency || candidate.frequency,
      incoterm: input.preview.incoterm || candidate.incoterm,
      customerType: input.preview.customerType || candidate.customerType,
    },
    requireTradeTerms:
      intent !== "GENERAL_QUESTION" && requirementType === "raw_material",
  });

  return {
    ...input.preview,
    requirementType,
    categoryCode,
    facts,
    intent: commercialIntent.intent,
    confidence: commercialIntent.confidence,
    commercial: commercialIntent.commercial,
    product: commercialIntent.product,
    origin: commercialIntent.origin,
    targetPrice: commercialIntent.targetPrice,
    currency: commercialIntent.currency,
    deadline: commercialIntent.deadline,
    frequency: commercialIntent.frequency,
    incoterm: commercialIntent.incoterm,
    customerType: commercialIntent.customerType,
    missingFields: commercialIntent.missingFields,
    suggestedAction: commercialIntent.suggestedAction,
    classificationMode: "semantic_fallback",
    response: guidedResponseForRequirement(
      requirementType,
      input.language || "fr",
      commercialIntent,
    ),
  };
}

function guidedResponseForRequirement(
  requirementType: IndustrialIntakePreview["requirementType"],
  language: IndustrialIntakeLanguage,
  commercialIntent?: CommercialIntentAnalysis,
) {
  if (commercialIntent && !commercialIntent.commercial) {
    return language === "fr"
      ? "J'ai compris qu'il s'agit d'une question generale, et non d'une demande d'achat. Je peux y repondre sans creer de dossier d'approvisionnement."
      : "I understood this as a general question, not a buying request. I can answer it without creating a sourcing case.";
  }
  const typeLabel = TYPE_LABELS[language][requirementType];
  const productName = commercialIntent?.product?.name;

  const nextCommercialQuestion = (() => {
    const nextField = commercialIntent?.missingFields?.[0];
    if (!nextField) return "";

    const questions: Record<string, Record<IndustrialIntakeLanguage, string>> = {
      "product.name": {
        fr: "Quel produit recherchez-vous exactement ?",
        en: "Which product do you need exactly?",
      },
      "product.quantity": {
        fr: "De quelle quantite avez-vous besoin ?",
        en: "What quantity do you need?",
      },
      destination: {
        fr: "Dans quelle ville ou quel pays la marchandise doit-elle etre livree ?",
        en: "In which city or country should the goods be delivered?",
      },
      "product.specification": {
        fr: "Quelle specification ou qualite recherchez-vous ?",
        en: "Which specification or grade do you require?",
      },
      frequency: {
        fr: "S'agit-il d'un achat ponctuel ou d'un besoin recurrent ?",
        en: "Is this a one-time purchase or a recurring requirement?",
      },
      incoterm: {
        fr: "Avez-vous un Incoterm prefere, par exemple CIF, FOB ou DDP ?",
        en: "Do you have a preferred Incoterm, such as CIF, FOB, or DDP?",
      },
    };

    return questions[nextField]?.[language] || "";
  })();

  if (commercialIntent?.commercial && nextCommercialQuestion) {
    const requestSummary =
      requirementType === "raw_material"
        ? language === "fr"
          ? `votre demande d'approvisionnement${productName ? ` en ${productName}` : ""}`
          : `your sourcing request${productName ? ` for ${productName}` : ""}`
        : language === "fr"
          ? `votre demande${productName ? ` pour ${productName}` : " commerciale"}`
          : `your request${productName ? ` for ${productName}` : ""}`;
    return language === "fr"
      ? `J'ai bien note ${requestSummary}. ${nextCommercialQuestion}`
      : `I have noted ${requestSummary}. ${nextCommercialQuestion}`;
  }

  if (requirementType === "raw_material") {
    return language === "fr"
      ? `J'ai bien note votre demande d'approvisionnement${productName ? ` en ${productName}` : " en matiere premiere"}. Les elements commerciaux essentiels sont complets; je peux maintenant preparer le dossier pour votre validation.`
      : `I have noted your sourcing request${productName ? ` for ${productName}` : " for a raw material"}. The essential commercial details are complete, so I can now prepare the case for your review.`;
  }
  if (requirementType === "export_quotation") {
    return language === "fr"
      ? `J'ai identifie une demande commerciale${productName ? ` pour ${productName}` : " pour un produit export"}. Je vais confirmer le volume, la destination et les conditions de l'operation avant toute action externe.`
      : `I identified a commercial request${productName ? ` for ${productName}` : " for an export product"}. I will confirm the volume, destination, and transaction terms before any external action.`;
  }
  if (
    requirementType === "spare_part" ||
    requirementType === "custom_manufacturing" ||
    requirementType === "machinery"
  ) {
    return language === "fr"
      ? `J'ai prepare une ${typeLabel}. Une photo, une reference, un plan ou un fichier CAD sera utile si vous en avez un; rien ne sera envoye a un fournisseur avant la revue du dossier.`
      : `I have prepared a ${typeLabel}. A photo, reference, drawing, or CAD file will be useful if available; nothing is sent to a supplier before the case is reviewed.`;
  }
  return language === "fr"
    ? `J'ai identifie une ${typeLabel}. Je vais recueillir les informations indispensables une question a la fois avant toute action externe.`
    : `I identified a ${typeLabel}. I will collect the essential information one question at a time before any external action.`;
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function truncateTitle(message: string) {
  const compact = String(message || "")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length > 180 ? `${compact.slice(0, 177).trim()}...` : compact;
}

function compactCapturedValue(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,:;=-]+|[\s,:;=-]+$/g, "")
    .trim();
}

function extractQuantityText(message: string) {
  const compact = compactCapturedValue(message);
  const unit =
    "(?:unit(?:e|es|é|ée|és|ées)?|pi(?:e|è)ces?|items?|kg|kilogrammes?|kilograms?|tonnes?|tons?|sacs?|bags?|cartons?|boxes?|caisses?|palettes?|pallets?|litres?|liters?|barils?|barrels?|rouleaux?|rolls?|m[eè]tres?|meters?|m2|m3|roulements?|bearings?|machines?|moteurs?|motors?)";
  const number = "(\\d(?:[\\d\\s.,]*\\d)?)";
  const patterns = [
    new RegExp(
      `\\b(?:acheter|commander|sourcer|rechercher|cherche|besoin(?:\\s+de)?|buy|order|source|need|want)\\s+(?:environ\\s+|approximately\\s+|about\\s+)?${number}\\s*(${unit})\\b`,
      "iu",
    ),
    new RegExp(`\\b${number}\\s*(${unit})\\b`, "iu"),
    new RegExp(
      `\\b(?:quantit[eé]|quantity|qty|volume)\\s*[:=]?\\s*${number}(?:\\s*(${unit}))?\\b`,
      "iu",
    ),
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match) continue;
    return compactCapturedValue([match[1], match[2]].filter(Boolean).join(" "));
  }
  return undefined;
}

function extractRequiredBy(message: string) {
  const compact = compactCapturedValue(message);
  const numberWord =
    "(?:\\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze|trente|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|thirty)";
  const duration = new RegExp(
    `\\b(?:sous|dans|d['’]ici|within|in)\\s+${numberWord}\\s+(?:heures?|hours?|jours?|days?|semaines?|weeks?|mois|months?)\\b`,
    "iu",
  );
  const dated =
    /\b(?:avant|before|by)\s+(?:le\s+)?\d{1,2}(?:[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)?\b/iu;
  const immediate =
    /\b(?:des que possible|d[eè]s que possible|as soon as possible|asap|imm[eé]diatement|immediately|aujourd'hui|today)\b/iu;

  return compactCapturedValue(
    compact.match(duration)?.[0] ||
      compact.match(dated)?.[0] ||
      compact.match(immediate)?.[0] ||
      "",
  ) || undefined;
}

function extractDeliveryDestination(message: string) {
  const compact = compactCapturedValue(message);
  const explicit = compact.match(
    /\b(?:destination|livraison|delivery)\s*[:=\-]\s*([^,.;\n]{2,80})/iu,
  );
  const routed = compact.match(
    /\b(?:livrer|livre|livr[eé]e?|exp[eé]dier|acheminer|deliver|delivered|ship|shipping)\s+(?:a|à|au|aux|vers|to|in)\s+([^,.;\n]{2,80})/iu,
  );
  const incotermRoute = compact.match(
    /\b(?:livraison|delivery)\s+(?:(?:sous|under)\s+)?(?:EXW|FCA|CPT|CIP|DAP|DPU|DDP|FAS|FOB|CFR|CIF)\s+(?:(?:a|\u00e0|au|aux|vers|to|in)\s+)?([^,.;\n]{2,80})/iu,
  );
  const labelledRoute = compact.match(
    /\b(?:livraison|delivery)\s+(?:a|\u00e0|au|aux|vers|to|in)\s+([^,.;\n]{2,80})/iu,
  );
  const value =
    explicit?.[1] ||
    routed?.[1] ||
    incotermRoute?.[1] ||
    labelledRoute?.[1] ||
    "";
  return (
    compactCapturedValue(
      value.split(
        /\s+(?:sous|dans|d['’]ici|avant|within|before|by)\s+/iu,
      )[0] || "",
    ) || undefined
  );
}

function extractPurchasePriority(
  message: string,
  language: IndustrialIntakeLanguage,
) {
  const normalized = normalizeIndustrialText(message);
  if (
    includesAny(normalized, [
      "certification",
      "certified",
      "qualite",
      "quality",
      "conformite",
      "compliance",
    ])
  )
    return language === "fr"
      ? "Qualite et certifications"
      : "Quality and certifications";
  if (
    includesAny(normalized, [
      "moins cher",
      "meilleur prix",
      "lowest price",
      "best price",
      "budget",
      "cout total",
      "total cost",
    ])
  )
    return language === "fr" ? "Meilleur cout total" : "Best total cost";
  if (
    includesAny(normalized, [
      "local",
      "beninois",
      "beninoise",
      "verified local",
      "fournisseur verifie",
    ])
  )
    return language === "fr"
      ? "Fournisseur local verifie"
      : "Verified local supplier";
  return undefined;
}

export function extractIndustrialIntakeFacts(
  message: string,
  language: IndustrialIntakeLanguage = "fr",
): IndustrialIntakeFacts {
  return {
    quantityText: extractQuantityText(message),
    deliveryDestination: extractDeliveryDestination(message),
    requiredBy: extractRequiredBy(message),
    purchasePriority: extractPurchasePriority(message, language),
  };
}

/**
 * Deterministic public-intake routing. It deliberately does not claim stock,
 * pricing, or supplier availability before a human review has happened.
 */
export function classifyIndustrialIntake(
  message: string,
  language: IndustrialIntakeLanguage = "fr",
): IndustrialIntakePreview {
  const normalized = normalizeIndustrialText(message);
  const facts = extractIndustrialIntakeFacts(message, language);
  const commercialIntent = analyzeCommercialIntent({
    message,
    language,
    quantityText: facts.quantityText,
    destination: facts.deliveryDestination,
    deadline: facts.requiredBy,
  });
  const isUrgent = includesAny(normalized, [
    "urgent",
    "urgence",
    "arrete",
    "arretee",
    "panne",
    "broken",
    "breakdown",
    "stopped",
    "downtime",
  ]);
  const isPlanned = includesAny(normalized, [
    "planifie",
    "planned",
    "next month",
    "mois prochain",
    "quarter",
    "trimestre",
  ]);

  let requirementType: IndustrialIntakePreview["requirementType"] =
    "industrial_input";
  let categoryCode = "industrial_inputs_and_consumables";

  if (
    includesAny(normalized, [
      "reverse engineering",
      "reverse engineer",
      "refaire",
      "reproduire",
      "reproduce",
      "fabriquer une piece",
      "manufacture a part",
      "scan",
      "cad",
      "dxf",
      "dwg",
      "step file",
      "stl",
    ])
  ) {
    requirementType = "custom_manufacturing";
    categoryCode = "spare_parts_and_components";
  } else if (
    includesAny(normalized, [
      "piece",
      "spare part",
      "replacement part",
      "part ",
      "parts",
      "bearing",
      "roulement",
      "belt",
      "courroie",
      "sprocket",
      "poulie",
      "pulley",
      "coupling",
      "gear",
      "engrenage",
      "pump housing",
      "capteur",
      "sensor",
      "reducer",
      "reducteur",
    ])
  ) {
    requirementType = "spare_part";
    categoryCode = "spare_parts_and_components";
  } else if (
    includesAny(normalized, [
      "machine",
      "ligne",
      "production line",
      "equipment",
      "equipement",
      "compresseur",
      "compressor",
      "pompe",
      "pump",
      "conveyor",
      "convoyeur",
    ])
  ) {
    requirementType = "machinery";
    categoryCode = "machinery_and_production_equipment";
  } else if (
    Boolean(commercialIntent.product.category) ||
    includesAny(normalized, [
      "matiere premiere",
      "raw material",
      "commodity",
      "commodite",
      "steel",
      "acier",
      "ciment",
      "cement",
      "cocoa",
      "cacao",
      "cotton",
      "coton",
      "cashew",
      "anacarde",
      "polymer",
      "polymere",
      "aluminium",
      "huile de palme",
      "palm oil",
      "huile de soja",
      "soybean oil",
      "beurre de karite",
      "shea butter",
      "sesame",
      "mais",
      "maize",
      "riz",
      "rice",
      "sucre",
      "sugar",
    ])
  ) {
    requirementType = "raw_material";
    categoryCode = "raw_materials";
  } else if (
    includesAny(normalized, [
      "export product",
      "produit export",
      "container",
      "conteneur",
      "catalogue export",
    ])
  ) {
    requirementType = "export_quotation";
    categoryCode = "export_ready_factory_products";
  } else if (
    includesAny(normalized, [
      "logistique",
      "logistics",
      "freight",
      "transport",
      "douane",
      "customs",
      "maintenance",
      "repair",
      "reparation",
      "installation",
      "inspection",
      "export",
      "import",
    ])
  ) {
    requirementType = "industrial_service";
    categoryCode = "industrial_services";
  }

  const urgency = isUrgent ? "urgent" : isPlanned ? "planned" : "standard";
  const response = guidedResponseForRequirement(
    requirementType,
    language,
    commercialIntent,
  );

  return {
    requirementType,
    categoryCode,
    title: truncateTitle(message),
    urgency,
    facts,
    intent: commercialIntent.intent,
    confidence: commercialIntent.confidence,
    commercial: commercialIntent.commercial,
    product: commercialIntent.product,
    origin: commercialIntent.origin,
    targetPrice: commercialIntent.targetPrice,
    currency: commercialIntent.currency,
    deadline: commercialIntent.deadline,
    frequency: commercialIntent.frequency,
    incoterm: commercialIntent.incoterm,
    customerType: commercialIntent.customerType,
    missingFields: commercialIntent.missingFields,
    suggestedAction: commercialIntent.suggestedAction,
    classificationMode: "deterministic",
    response,
  };
}

function cleanAssistantReply(value: string) {
  return String(value || "")
    .replace(/^\s*\[(?:analysis|response|continue)\]\s*:?\s*/gim, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function responseText(response: any) {
  if (typeof response?.output_text === "string") return response.output_text;
  if (!Array.isArray(response?.output)) return "";

  return response.output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((part: any) => String(part?.text || part?.refusal || ""))
    .filter(Boolean)
    .join("\n");
}

function toSafetyIdentifier(requesterIdentity?: string) {
  const stableIdentity = String(
    requesterIdentity || "public-industrial-intake",
  ).trim();
  return `exportunity_${createHash("sha256").update(stableIdentity).digest("hex").slice(0, 48)}`;
}

function buildIndustrialAssistantSystemPrompt(input: {
  language: IndustrialIntakeLanguage;
  preview: IndustrialIntakePreview;
  agentMode: "concierge" | "commercial";
}) {
  const languageInstruction =
    input.language === "fr" ? "Reply in French." : "Reply in English.";

  const identity =
    input.agentMode === "commercial"
      ? `You are Awa Kouadio, Exportunity's Director of Commercial and Client Success. You own the client-facing deal from qualified interest to a mutually agreed next step. Use consultative discovery: understand the requirement, business impact, timing, decision criteria, and genuine objections. Progress the deal without pressure, manipulation, or artificial urgency.`
      : `You are Tassi Hangbe, the visible B2B sourcing and operations concierge for Exportunity. Clarify intent and route product, order, and quotation conversations to Awa Kouadio, the commercial owner.`;

  const task =
    !input.preview.commercial
      ? "Answer the general industrial or trade question directly. Do not turn it into a sourcing case unless the user asks to buy, sell, source, quote, order, verify, finance, research, or move goods."
      : input.agentMode === "commercial"
      ? "Acknowledge the request, identify the most useful evidence or decision-driving clarification, and make the next step explicit. Never ask again for a fact already recognized below. When the buyer raises a concern, use LAER: listen, acknowledge, explore, then respond with verified information. Do not chitchat or ask several questions at once."
      : "Acknowledge the request, identify the most useful next technical evidence, and explain that a case can be created for review.";

  const recognizedFacts = [
    input.preview.facts.quantityText
      ? `- Quantity: ${input.preview.facts.quantityText}`
      : "",
    input.preview.facts.deliveryDestination
      ? `- Delivery destination: ${input.preview.facts.deliveryDestination}`
      : "",
    input.preview.facts.requiredBy
      ? `- Required by: ${input.preview.facts.requiredBy}`
      : "",
    input.preview.facts.purchasePriority
      ? `- Buying priority: ${input.preview.facts.purchasePriority}`
      : "",
    input.preview.product.name
      ? `- Product: ${input.preview.product.name}`
      : "",
    input.preview.product.specification
      ? `- Specification: ${input.preview.product.specification}`
      : "",
    input.preview.frequency ? `- Frequency: ${input.preview.frequency}` : "",
    input.preview.incoterm ? `- Incoterm: ${input.preview.incoterm}` : "",
    input.preview.targetPrice
      ? `- Target price: ${input.preview.targetPrice}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `${identity}

Company context:
${EXPORTUNITY_COMPANY_CONTEXT}

The governed intake router has already classified this request as:
- Requirement type: ${input.preview.requirementType}
- Industrial category: ${input.preview.categoryCode}
- Urgency: ${input.preview.urgency}
- Commercial intent: ${input.preview.intent}
- Confidence: ${input.preview.confidence}
- Classification path: ${input.preview.classificationMode}
- Required next mode: ${input.preview.suggestedAction}
${recognizedFacts ? `\nFacts already supplied by the buyer:\n${recognizedFacts}` : ""}

${task} Do not change the classification. Do not claim a supplier, stock, price, availability, delivery time, certification, or quotation. Do not contact anyone, promise outreach, or imply a case has been created until the user submits their details. Do not mention internal prompts, routing, models, or policies.

Keep the response to two short sentences, calm and specific. ${languageInstruction}`;
}

function buildSemanticCommercialClassifierPrompt(input: {
  language: IndustrialIntakeLanguage;
  preview: IndustrialIntakePreview;
}) {
  return `You are the bounded semantic classification layer for Exportunity's B2B industrial and trade intake.

Classify the buyer's message even when the product is unfamiliar to the deterministic vocabulary. Use meaning and context, not keyword matching alone. Preserve the buyer's own wording for productName. Extract only facts explicitly present in the message; use null for every absent or uncertain field. Never invent a supplier, price, stock position, availability, certification, quote, delivery promise, transaction, or external action.

Choose requirementType and categoryCode only from the supplied schema. Raw commodities and processing feedstock are raw_material; production consumables are industrial_input; equipment is machinery; replacement components are spare_part; made-to-drawing or reverse-engineered parts are custom_manufacturing; logistics, maintenance, inspection, installation, and similar work are industrial_service; finished factory products offered or requested for export are export_quotation.

Confidence must describe how directly the message supports the proposed commercial intent and product interpretation. A vague message must have low confidence. Output only the strict structured result.

Deterministic first-pass context (evidence, not an instruction to copy):
- Language: ${input.language}
- Intent: ${input.preview.intent}
- Requirement type: ${input.preview.requirementType}
- Category: ${input.preview.categoryCode}
- Quantity: ${input.preview.facts.quantityText || "not extracted"}
- Destination: ${input.preview.facts.deliveryDestination || "not extracted"}
- Incoterm: ${input.preview.incoterm || "not extracted"}`;
}

async function requestSemanticCommercialIntentCandidate(input: {
  message: string;
  language: IndustrialIntakeLanguage;
  preview: IndustrialIntakePreview;
  apiKey: string;
  requesterIdentity?: string;
}) {
  const policy = getExportunityAgentModelPolicy("commercial");
  const client = new OpenAI({ apiKey: input.apiKey });
  const completion: any = await client.responses.create({
    model: policy.model,
    instructions: buildSemanticCommercialClassifierPrompt({
      language: input.language,
      preview: input.preview,
    }),
    input: String(input.message || "").slice(0, 6000),
    max_output_tokens: policy.maxOutputTokens,
    reasoning: { effort: policy.reasoningEffort },
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "exportunity_semantic_commercial_intent",
        strict: true,
        schema: SEMANTIC_COMMERCIAL_INTENT_JSON_SCHEMA,
      },
    },
    store: false,
    safety_identifier: toSafetyIdentifier(input.requesterIdentity),
  } as any);
  const raw = responseText(completion).trim();
  if (!raw) return null;
  return parseSemanticCommercialIntentCandidate(JSON.parse(raw));
}

/**
 * Produces a visible, user-triggered assistant reply. The LLM is optional:
 * if it is disabled, unavailable, or fails, Exportunity keeps the deterministic
 * guidance so technical routing and review safeguards continue to work.
 */
export async function generateIndustrialIntakeReply(
  message: string,
  language: IndustrialIntakeLanguage = "fr",
  requesterIdentity?: string,
  agentMode: "concierge" | "commercial" = "concierge",
  requirementTypeHint?: IndustrialIntakePreview["requirementType"],
): Promise<IndustrialIntakeAssistantReply> {
  const deterministicPreview = classifyIndustrialIntake(message, language);
  const apiKey = String(
    process.env.OPENAI_API_KEY ||
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
      "",
  ).trim();
  const aiAvailable = isAiEnabled() && Boolean(apiKey);
  let semanticAttempted = false;
  let classifiedPreview = deterministicPreview;

  if (
    aiAvailable &&
    shouldUseSemanticCommercialFallback(message, deterministicPreview)
  ) {
    semanticAttempted = true;
    try {
      assertAiEnabled({
        what: "Semantically classify an Exportunity industrial intake",
        why: "The visible buyer request contains a possible commercial product or trade need that the deterministic vocabulary did not fully identify.",
        forHowLong: "For this visible message only.",
        resources: ["External OpenAI API call", "Compute/network usage"],
        visibility:
          "The accepted classification is visible in the returned intent, product, category, missing fields, and next clarification.",
      });
      const candidate = await requestSemanticCommercialIntentCandidate({
        message,
        language,
        preview: deterministicPreview,
        apiKey,
        requesterIdentity,
      });
      classifiedPreview = applySemanticCommercialIntentCandidate({
        preview: deterministicPreview,
        candidate,
        language,
        allowIntentRefinement: mayRefineDeterministicBuyIntent(
          message,
          deterministicPreview,
        ),
      });
    } catch {
      console.warn(
        "[industrial-intake] semantic classification unavailable; retaining deterministic intake",
      );
    }
  }

  const preview = requirementTypeHint
    ? {
        ...classifiedPreview,
        requirementType: requirementTypeHint,
        categoryCode: CATEGORY_BY_REQUIREMENT_TYPE[requirementTypeHint],
        response: guidedResponseForRequirement(
          requirementTypeHint,
          language,
          classifiedPreview,
        ),
      }
    : classifiedPreview;

  // Qualification questions must stay grounded in deterministic extraction.
  // This prevents an optional model reply from asking the buyer to repeat facts.
  if (
    agentMode === "commercial" &&
    preview.commercial &&
    preview.suggestedAction === "ASK" &&
    preview.missingFields.length > 0
  ) {
    return { ...preview, responseMode: "guided" };
  }

  if (!aiAvailable || (semanticAttempted && preview.commercial)) {
    return { ...preview, responseMode: "guided" };
  }

  const policy = getExportunityAgentModelPolicy(
    agentMode === "commercial" ? "commercial" : "tassi",
  );

  try {
    assertAiEnabled({
      what: "Reply to an Exportunity industrial intake",
      why: "The requester asked Exportunity AI to help prepare a technical sourcing case.",
      forHowLong: "For this visible message only.",
      resources: ["External OpenAI API call", "Compute/network usage"],
      visibility:
        "The requester sees the full assistant reply in the Exportunity AI conversation.",
    });

    const client = new OpenAI({ apiKey });
    const completion: any = await client.responses.create({
      model: policy.model,
      instructions: buildIndustrialAssistantSystemPrompt({
        language,
        preview,
        agentMode,
      }),
      input: String(message || "").slice(0, 6000),
      max_output_tokens: policy.maxOutputTokens,
      reasoning: { effort: policy.reasoningEffort },
      text: { verbosity: "low" },
      safety_identifier: toSafetyIdentifier(requesterIdentity),
    } as any);

    const response = cleanAssistantReply(responseText(completion));
    if (response) {
      return { ...preview, response, responseMode: "ai" };
    }
  } catch {
    // A request must still be usable when an optional provider is unavailable.
    console.warn(
      "[industrial-intake] OpenAI reply unavailable; using guided intake response",
    );
  }

  return { ...preview, responseMode: "guided" };
}
