export type CommercialIntentType =
  | "source_product"
  | "sell_product"
  | "find_buyers"
  | "find_machinery"
  | "find_raw_material"
  | "request_quote"
  | "compare_suppliers"
  | "request_price"
  | "place_order"
  | "track_order"
  | "negotiate"
  | "explore_market"
  | "verify_supplier"
  | "request_financing"
  | "request_logistics"
  | "upload_document"
  | "general_commercial"
  | "other";

export type SuggestedAction = "ANSWER" | "ASK" | "ACT" | "ESCALATE";

export interface DetectedProduct {
  name?: string;
  category?: string;
  specification?: string;
  quantity?: number;
  unit?: string;
}

export interface CommercialIntentResult {
  intent: CommercialIntentType;
  confidence: number;
  commercial: boolean;
  language: "en" | "fr" | "auto";
  product?: DetectedProduct;
  origin?: string;
  destination?: string;
  targetPrice?: number;
  currency?: string;
  deadline?: string;
  frequency?: string;
  incoterm?: string;
  customerType?: string;
  orderReference?: string;
  requirementId?: string;
  requirementReferenceCode?: string;
  productRequirementId?: string;
  missingFields: string[];
  suggestedAction: SuggestedAction;
  rationale: string[];
}

interface DetectionInput {
  message?: string;
  priorIntent?: string;
  priorResult?: CommercialIntentResult | null;
}

interface CommodityPattern {
  pattern: RegExp;
  product: string;
  aliases?: string[];
}

interface IntentScorer {
  intent: CommercialIntentType;
  score: (text: string) => number;
}

const COMMODITY_PATTERNS: CommodityPattern[] = [
  {
    pattern: /\bpalm\s*oil\b|\bhuile(?:\s+de)?\s+palme\b/i,
    product: "palm oil",
    aliases: ["huile de palme raffinée", "huile de palme brute", "huile de palme"],
  },
  { pattern: /\bcashew\b|\banacarde\b|\bnoix de cajou\b|\bcajou\b/i, product: "cashew", aliases: ["noix de cajou", "anacarde"] },
  { pattern: /\bcocoa\b|\bcacao\b/i, product: "cocoa" },
  { pattern: /\bcoffee\b|\bcafe\b/i, product: "coffee" },
  { pattern: /\brice\b|\briz\b/i, product: "rice" },
  { pattern: /\bcotton\b|\bcoton\b/i, product: "cotton" },
  { pattern: /\bcement\b|\bciment\b/i, product: "cement" },
  { pattern: /\bsteel\b|\bacier\b/i, product: "steel" },
  { pattern: /\bfertiliz\w*\b|\bengrais\b/i, product: "fertilizer" },
  { pattern: /\bsolar panels?\b|\bpanneaux? solaires?\b/i, product: "solar panel" },
  { pattern: /\bpackaging\b|\bemballages?\b/i, product: "packaging" },
  { pattern: /\bmachin(?:ery|e)\b|\bmachinerie\b|\bmateriel\b/i, product: "industrial machinery" },
  { pattern: /\btruck\b|\bcamion\b|\bvehicle(s)?\b/i, product: "truck" },
];

const UNIT_ALIASES: Array<{ key: string; re: RegExp }> = [
  { key: "kg", re: /\b(?:kg|kilogrammes?|kilogramme)\b/i },
  { key: "t", re: /\b(?:t|mt|tonnes?|tonnage)\b/i },
  { key: "bags", re: /\bbags?\b|\bsacs?\b/i },
  { key: "tons", re: /\b(?:tonnes?|tons?|ton)\b/i },
  { key: "pieces", re: /\b(?:units?|pcs?|pi[eè]ces?|pieces?)\b/i },
  { key: "l", re: /\bl\b|\blitre?s?\b/i },
];

const INTENT_SCORES: IntentScorer[] = [
  {
    intent: "source_product",
    score: (text) =>
      (/\bsource|sourcing|sourcer|supplier|suppliers|search|find|looking for|cherche|recherche|trouver|want to buy|i want to buy|je veux acheter|j[' ]?ai besoin/i.test(text)
        ? 0.9
        : 0) +
      (/\b(source|buy|buying|acheter|huile|oil|palm|cacao|cashew|cement|steel|fertiliz|machinery|truck|raw material|commodity)\b/i.test(text)
        ? 0.2
        : 0),
  },
  {
    intent: "find_buyers",
    score: (text) =>
      /buyers?|trouver (?:des )?acheteurs|trouver des clients|opportunit|prospect|demandeurs?/i.test(text) ? 0.82 : 0,
  },
  {
    intent: "sell_product",
    score: (text) => /(sell|s?eller|je veux vendre|vendre|exporter|vente|distribute|supplier|to sell)/i.test(text) ? 0.78 : 0,
  },
  {
    intent: "request_quote",
    score: (text) => /(quote|devis|quotation|rfq|rfx|c?ould you quote|ask a quote|request a quote)/i.test(text) ? 0.86 : 0,
  },
  {
    intent: "compare_suppliers",
    score: (text) => /(compare suppliers|compare|comparaison|contre|meilleurs fournisseurs|several suppliers|alternative|alternatives)/i.test(text) ? 0.84 : 0,
  },
  {
    intent: "place_order",
    score: (text) => /(place order|order now|confirm|reserve|book|i want to buy|commander|acheter|order)/i.test(text) ? 0.8 : 0,
  },
  {
    intent: "track_order",
    score: (text) => /(track|track order|where is|delivery status|livraison|suivi|where.*commande|suivre ma commande)/i.test(text) ? 0.82 : 0,
  },
  {
    intent: "negotiate",
    score: (text) => /(negotiate|negotiat|discount|moins cher|moins|counter|counteroffer|renegotiat|trop cher)/i.test(text) ? 0.84 : 0,
  },
  {
    intent: "request_logistics",
    score: (text) => /(logistics|transport|delivery|shipping|freight|route|shipment|livraison|colis|truck|navire|camion)/i.test(text) ? 0.78 : 0,
  },
  {
    intent: "request_financing",
    score: (text) => /(financing|finance|escrow|advance|payment|paiement|versement|invoice|facture|refund|deposit)/i.test(text) ? 0.76 : 0,
  },
  {
    intent: "verify_supplier",
    score: (text) => /(verify|verification|due diligence|credibility|certification|background|contactability|reference|qualification)/i.test(text) ? 0.8 : 0,
  },
  {
    intent: "find_machinery",
    score: (text) => /(machinery|machine|équipement|equipement|truck|vehicle|excavator|pompe|generator|industrial machine)/i.test(text) ? 0.78 : 0,
  },
  {
    intent: "find_raw_material",
    score: (text) => /(raw material|mati[eè]re premi[eè]re|matiere premiere|input(s)? materials?)/i.test(text) ? 0.78 : 0,
  },
  {
    intent: "explore_market",
    score: (text) => /(market|trend|demand|supply|competitor|price trend|export|import|country|market size)/i.test(text) ? 0.65 : 0,
  },
];

const INTENT_KEYWORDS: Partial<Record<CommercialIntentType, string[]>> = {
  source_product: ["sourcing", "source", "find", "supplier", "acheter", "purchase", "need"],
  sell_product: ["sell", "vendre", "export", "exporter", "manufacturer"],
  find_buyers: ["buyer", "buyers", "vendeur", "demand", "clients", "who can buy"],
  find_machinery: ["machinery", "truck", "generator", "excavator", "equipement", "machine"],
  find_raw_material: ["raw", "matiere", "input", "raw material"],
  request_quote: ["quote", "devis", "quotation", "request quote", "pricing", "price"],
  compare_suppliers: ["compare", "comparison", "diff", "best", "cheaper", "reliable"],
  request_price: ["price", "cost", "tarif", "coût", "budget", "estimate"],
  place_order: ["order", "commande", "buy", "finalize", "reserve", "confirm"],
  track_order: ["track", "delivery", "status", "where is", "suivi", "livraison"],
  negotiate: ["negotiate", "moins", "moins cher", "counter", "discount", "renegotiate"],
  explore_market: ["market", "trending", "demand", "supply", "competitors", "import", "export"],
  verify_supplier: ["verify", "certification", "contactability", "background", "qualification"],
  request_financing: ["finance", "paiement", "payment", "credit", "escrow", "advance", "invoice", "deposit"],
  request_logistics: ["logistics", "shipping", "transport", "delivery", "route", "freight", "shipment", "cargo"],
  upload_document: ["upload", "photo", "image", "document", "rfq", "spec sheet", "specification"],
  general_commercial: ["trade", "commerce", "transaction", "opportunity", "sourcing", "buyer", "supplier"],
  other: [],
};

const COMMODITY_KEYWORDS = INTENT_KEYWORDS.source_product ?? [];
function includeCommodityHint(text: string) {
  return COMMODITY_KEYWORDS.some((value) => new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

function toDecimal(value: string) {
  const normalized = value
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/(?<=\d)\.(?=\d{3}\b)/g, "");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeInput(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectLanguage(text: string) {
  const hasFrench = /\b(je|nous|vous|voudr|souhait|achet|vendez|livraison|demande|comment|pour|produit|quantit|commande|merci)\b/i.test(
    text,
  );
  const hasEnglish = /\b(i|we|you|please|would|could|need|want|order|quote|supplier|delivery|when|where|price|thank)\b/i.test(text);
  if (hasFrench && !hasEnglish) return "fr";
  if (hasEnglish && !hasFrench) return "en";
  return "auto";
}

function detectProduct(text: string, lowered: string): DetectedProduct | undefined {
  for (const item of COMMODITY_PATTERNS) {
    if (item.pattern.test(lowered)) {
      if (item.product === "palm oil") {
        const refined = /\b(?:refined|raffinee?)\b/i.test(lowered);
        const crude = /\b(?:crude|brute?)\b/i.test(lowered);
        return {
          name: refined ? "refined palm oil" : crude ? "crude palm oil" : "palm oil",
          category: "palm oil",
          specification: refined ? "refined" : crude ? "crude" : undefined,
        };
      }

      const specification = item.aliases
        ? [...item.aliases]
            .sort((left, right) => right.length - left.length)
            .find((alias) => normalizeInput(text).includes(normalizeInput(alias)))
        : undefined;
      return {
        name: specification || item.product,
        category: item.product,
        specification,
      };
    }
  }
  return undefined;
}

function detectGenericProduct(text: string, lowered: string): DetectedProduct | undefined {
  const strongSourcingCue =
    /\b(?:source|sourcing|sourcer|acheter|purchase|buy|find|looking for|cherche|recherche|trouver)\b/i.test(lowered);
  const contextualNeed =
    (/\b(?:i|we)\s+need\b|\b(?:j[' ]?ai|nous avons)\s+besoin\b/i.test(lowered) &&
      (/\d+\s*(?:kg|t|mt|tonnes?|tons?|units?|pcs?|litres?|l)\b/i.test(lowered) ||
        /\b(?:deliver|delivery|ship|livrer|livraison|destination)\b/i.test(lowered)));
  if (!strongSourcingCue && !contextualNeed) return undefined;

  const patterns = [
    /\b(?:je\s+(?:cherche|recherche|veux\s+sourcer|veux\s+acheter|souhaite\s+acheter)|nous\s+(?:cherchons|recherchons|voulons\s+acheter)|j[' ]?ai\s+besoin\s+de)\s+(.+)/i,
    /\b(?:(?:i|we)\s+(?:need|want\s+to\s+(?:source|buy)|are\s+looking\s+for)|i['’]?m\s+looking\s+for)\s+(.+)/i,
    /\b(?:source|sourcer|acheter|purchase|buy|find)\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const candidate = String(match[1])
      .split(/\s+(?:to\s+be\s+delivered|delivered|for\s+delivery|deliver(?:ed)?\s+to|ship(?:ped)?\s+to|[aà]\s+livrer|livr(?:er|e|ee|é|ée)\s+[aà]|destination|vers)\b/i)[0]
      .replace(/^\s*\d+(?:[.,]\d+)?\s*(?:kg|kilogrammes?|t|mt|tonnes?|tons?|bags?|sacs?|units?|pcs?|pieces?|litres?|l)\s+(?:de|d['’]|of)?\s*/i, "")
      .replace(/^\s*(?:de|du|des|d['’]|a|an|some)\s+/i, "")
      .replace(/[.,;:!?]+$/g, "")
      .trim();

    if (candidate.length < 2 || candidate.length > 120) continue;
    if (/^(?:help|information|info|something|anything|support|assistance)$/i.test(candidate)) continue;
    return { name: candidate, category: "unclassified product" };
  }

  return undefined;
}

function detectQuantity(lowered: string): { value: number; unit: string } | null {
  const match = lowered.match(
    /(?:\b(?:quantit[eé]|volume|qt|qte|qty)\b\s*[:=-]?\s*)?(\d+(?:[.,]\d+)?)\s*(kg|kilogrammes?|t|tonnes?|ton|mt|bags?|sacs?|units?|pcs?|pi[eè]ces?|litres?|l)\b/i,
  );
  if (!match?.[1]) return null;
  const value = toDecimal(match[1]);
  if (value === null) return null;
  return { value, unit: String(match[2] || "unit").toLowerCase().trim() };
}

function normalizeUnit(unit: string) {
  const direct = UNIT_ALIASES.find((item) => item.re.test(unit));
  return direct?.key || unit || "unit";
}

function detectLocation(label: "origin" | "destination", lowered: string): string | undefined {
  const location = "([a-z][a-z.' -]{1,60}?)";
  const end = "(?=[,.;!?]|\\s+(?:by|before|within|for|avec|incoterm|monthly|weekly|par\\s+mois)\\b|$)";
  const patterns =
    label === "destination"
      ? [
          new RegExp(`\\b(?:deliver(?:ed|y)?\\s+(?:to|in)|ship(?:ped)?\\s+(?:to|in)|delivery\\s+(?:to|in)|to\\s+be\\s+delivered\\s+to)\\s+${location}${end}`, "i"),
          new RegExp(`\\b(?:a\\s+livrer\\s+a|livr(?:er|e|ee)\\s+a|expedi(?:er|e|ee)\\s+a|destination(?:\\s+de)?|vers)\\s+${location}${end}`, "i"),
          new RegExp(`\\b(?:to|in|at|a|au)\\s+${location}$`, "i"),
        ]
      : [
          new RegExp(`\\b(?:from|origin(?:ating)?\\s+in|origin\\s*[:=-]?|origine\\s*[:=-]?|provenant\\s+de|depuis)\\s+${location}${end}`, "i"),
        ];

  for (const regex of patterns) {
    const match = lowered.match(regex);
    if (!match?.[1]) continue;
    const cleaned = String(match[1]).replace(/[.,;:]$/g, "").trim();
    if (cleaned.length > 2 && cleaned.length < 80) return cleaned;
  }
  return undefined;
}

function detectPriceAndCurrency(lowered: string): { amount?: number; currency?: string } {
  const match = lowered.match(
    /\b(?:at|for|up to|jusqu['’]a|jusqu[ -]au|<=)\s*(\d+[.,]?\d*)\s*(usd|us\$|eur|€|xof|cfa|ghs|gbp|£|ngn|fcfa)?\b/i,
  );
  if (!match?.[1]) return {};
  const amount = toDecimal(match[1]);
  if (amount === null) return {};
  const rawCurrency = match[2]?.toLowerCase();
  if (!rawCurrency) return { amount };
  const currency =
    rawCurrency === "$" || rawCurrency === "us$" ? "USD" : rawCurrency.replace(/[^\w]/g, "").toUpperCase() || undefined;
  return { amount, currency };
}

function detectIncoterm(lowered: string) {
  const match = lowered.match(/\b(fob|cif|cfr|fca|dap|exw|cip|dat)\b/i);
  return match?.[1]?.toUpperCase();
}

function detectDeadline(lowered: string) {
  const match = lowered.match(/\b(by|before|within|avant|d'ici|jusqu?['’]a)\s+([a-z0-9\s\-\/]+?)(?:[.,;:]|$)/i);
  return match?.[2] ? match[2].trim() : undefined;
}

function detectFrequency(lowered: string) {
  const match = lowered.match(
    /\b((?:\d+\s*)?(?:x|times?|fois|par mois|per month|monthly|weekly|annually|yearly|daily|quotidienne|recurrent|recurrente?))\b/i,
  );
  return match?.[1] ? match[1].trim() : undefined;
}

function detectOrderReference(message: string, lowered: string) {
  const first = lowered.match(
    /\b(?:order|commande|référence|reference|tracking|suivi|ref)\s*(?:no|numéro|number|#)?\s*[:\-]?\s*([a-z0-9][a-z0-9-]{2,})/i,
  );
  const second = message.match(/\b(?:#|ref|ref:)\s*([a-z0-9][a-z0-9-]{2,})/i);
  const third = message.match(/\b(?:ord(?:re)?|cmd)\s*[:#]?\s*([a-z0-9][a-z0-9-]{2,})/i);
  const hit = first?.[1] || second?.[1] || third?.[1] || third?.[2];
  if (!hit) return undefined;
  return String(hit).trim();
}

function detectCustomerType(lowered: string) {
  const match = lowered.match(/\b(exporter|importer|buyer|seller|manufacturer|vendeur|acheteur|fabricant|trader)\b/i);
  return match?.[1];
}

function hasEscalateSignals(lowered: string) {
  return /(legal|lawsuit|litigation|suspicious|compliance|customs violation|sanctions|fraud|dispute|urgent risk|counterfeit|unsafe|safety)\b/i.test(
    lowered,
  );
}

function scoreIntent(lowered: string, priorIntent?: string) {
  let best = { intent: "other" as CommercialIntentType, score: 0 };
  for (const candidate of INTENT_SCORES) {
    const score = candidate.score(lowered);
    if (score > best.score) {
      best = { intent: candidate.intent, score };
    }
  }

  const commodityMatch = detectProduct("", lowered);
  const isCommodityQuery = includeCommodityHint(lowered);
  if (commodityMatch?.name && (/source|sourcing|supplier|acheter|trouver|find/.test(lowered) || isCommodityQuery || best.score > 0.6)) {
    return { intent: "source_product" as CommercialIntentType, score: Math.min(1, Math.max(best.score, 0.75)) };
  }

  if (priorIntent && priorIntent !== "other" && best.intent === "other") {
    return { intent: priorIntent as CommercialIntentType, score: Math.min(1, 0.2) };
  }

  return best;
}

function requiredFields(intent: CommercialIntentType): string[] {
  if (intent === "source_product") return ["product_name", "destination", "quantity"];
  if (intent === "sell_product") return ["product_name"];
  if (intent === "find_buyers") return ["product_name"];
  if (intent === "place_order") return ["product_name", "quantity", "destination"];
  if (intent === "request_quote" || intent === "compare_suppliers") return ["product_name"];
  if (intent === "track_order") return ["order_reference"];
  if (intent === "negotiate") return ["product_name", "target_price"];
  if (intent === "request_financing" || intent === "request_logistics") return ["product_name"];
  if (intent === "find_machinery") return ["product_name"];
  if (intent === "find_raw_material") return ["product_name", "destination"];
  return [];
}

function missingFor(
  intent: CommercialIntentType,
  payload: Omit<CommercialIntentResult, "intent" | "confidence" | "commercial" | "language" | "rationale">,
): string[] {
  const required = requiredFields(intent);
  const missing: string[] = [];
  if (required.includes("product_name") && !payload.product?.name) missing.push("product_name");
  if (required.includes("destination") && !payload.destination) missing.push("destination");
  if (required.includes("quantity") && !(payload.product?.quantity && payload.product.quantity > 0)) missing.push("quantity");
  if (required.includes("order_reference") && !payload.orderReference) missing.push("order_reference");
  if (required.includes("target_price") && !payload.targetPrice) missing.push("target_price");
  if (required.includes("frequency") && !payload.frequency) missing.push("frequency");
  return missing;
}

function resolveAction(confidence: number, commercial: boolean, missing: string[], lowered: string): SuggestedAction {
  if (!commercial) return "ANSWER";
  if (hasEscalateSignals(lowered)) return "ESCALATE";
  if (missing.length > 0) return "ASK";
  if (confidence >= 0.65) return "ACT";
  return "ASK";
}

export function detectCommercialIntent(message: string, options: DetectionInput = {}): CommercialIntentResult {
  const text = String(message || "").trim();
  const lowered = normalizeInput(text);
  const priorResult = options.priorResult || null;
  const priorIntent = String(options.priorIntent || priorResult?.intent || "").toLowerCase();

  const intentScoring = scoreIntent(lowered, priorIntent);
  let intent: CommercialIntentType = intentScoring.intent;
  let confidence = Math.min(1, Math.max(0, intentScoring.score));

  const rationale: string[] = [];
  const detectedLanguage = detectLanguage(lowered);
  const language = detectedLanguage === "auto" && priorResult?.language ? priorResult.language : detectedLanguage;

  const detectedProduct = detectProduct(text, lowered) || detectGenericProduct(text, lowered);
  const product = detectedProduct
    ? { ...detectedProduct }
    : priorResult?.product
      ? { ...priorResult.product }
      : undefined;
  if (product?.name) rationale.push(`product_detected:${product.name}`);
  if (product?.specification && product.specification !== product.name) rationale.push(`specification_detected:${product.specification}`);

  const quantity = detectQuantity(lowered);
  if (quantity) {
    product && (product.quantity = quantity.value);
    product && (product.unit = normalizeUnit(quantity.unit));
    rationale.push(`quantity_detected:${quantity.value}${quantity.unit}`);
  }

  const destination = detectLocation("destination", lowered) || priorResult?.destination;
  const origin = detectLocation("origin", lowered) || priorResult?.origin;
  const orderReference = detectOrderReference(text, lowered) || priorResult?.orderReference;
  if (destination) rationale.push(`destination_detected:${destination}`);
  if (origin) rationale.push(`origin_detected:${origin}`);

  const priceHint = detectPriceAndCurrency(lowered);
  if (priceHint.amount !== undefined) rationale.push(`target_price_detected:${priceHint.amount}`);

  const incoterm = detectIncoterm(lowered) || priorResult?.incoterm;
  if (incoterm) rationale.push(`incoterm_detected:${incoterm}`);

  const deadline = detectDeadline(lowered) || priorResult?.deadline;
  const frequency = detectFrequency(lowered) || priorResult?.frequency;
  const customerType = detectCustomerType(lowered) || priorResult?.customerType;

  if (priorResult?.commercial && priorResult.intent === intent) {
    confidence = Math.max(confidence, Math.min(0.95, priorResult.confidence * 0.95));
    rationale.push("prior_commercial_context_merged");
  }

  if (product?.name && /source|sourcing|supplier|acheter|sourcer|commande|order|prix|price|livraison|huile|machinery|truck/.test(lowered)) {
    confidence = Math.max(confidence, 0.75);
  }

  const rawKeywords = INTENT_KEYWORDS[intent] || [];
  if (rawKeywords.length > 0) {
    const keywordHits = rawKeywords.filter((value) => new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lowered)).length;
    if (keywordHits > 0) rationale.push(`intent_keyword_hits:${keywordHits}`);
  }

  const base: Omit<CommercialIntentResult, "confidence" | "commercial" | "missingFields" | "suggestedAction"> = {
    intent,
    language,
    product: product?.name || product?.category || product?.specification || Object.keys(product || {}).length ? product : undefined,
    origin,
    destination,
    targetPrice: priceHint.amount ?? priorResult?.targetPrice,
    currency: priceHint.currency || priorResult?.currency,
    deadline,
    frequency,
    orderReference,
    incoterm,
    customerType,
    requirementId: priorResult?.requirementId,
    requirementReferenceCode: priorResult?.requirementReferenceCode,
    productRequirementId: priorResult?.productRequirementId,
    rationale,
  };

  const missingFields = missingFor(intent, base as any);
  const commercial =
    Boolean(priorResult?.commercial && priorResult.intent === intent) ||
    confidence >= 0.45 ||
    /(source|sourcing|supplier|commande|order|prix|price|achat|vende|livraison|huile|machine|truck)/.test(lowered);
  const suggestedAction = resolveAction(confidence, commercial, missingFields, lowered);

  return {
    ...base,
    confidence,
    commercial,
    missingFields,
    suggestedAction,
  };
}

export function buildCommercialClarificationMessage(result: CommercialIntentResult) {
  const isFrench = result.language === "fr";
  if (result.intent === "track_order") {
    if (result.missingFields.includes("order_reference")) {
      return isFrench
        ? "Pour suivre votre commande, j’ai besoin du numéro de commande ou du lien de suivi."
        : "To track this order I need your order number or a tracking link.";
    }
    return isFrench
      ? "Je vérifie votre commande en ce moment. Je reviens avec le statut actuel."
      : "I’m checking that order now and will return the latest status.";
  }

  if (result.missingFields.includes("product_name")) {
    return isFrench ? "Quel produit souhaitez-vous traiter ?" : "What product are we dealing with?";
  }

  if (result.missingFields.includes("quantity")) {
    return isFrench
      ? "Et quelle quantité (et unité) avez-vous besoin ?"
      : "What quantity and unit do you need?";
  }

  if (result.missingFields.includes("destination")) {
    return isFrench
      ? "Très bien. Vers quel pays/ville doit-il être livré ?"
      : "Great. What country or city should it be delivered to?";
  }

  if (result.missingFields.length) {
    return isFrench
      ? `Pour avancer, il me manque encore: ${result.missingFields.join(", ")}.`
      : `To move this forward I still need: ${result.missingFields.join(", ")}.`;
  }

  if (result.intent === "request_quote") {
    return isFrench
      ? "Très bien. Je prépare une demande de devis et je reviens avec des options comparables."
      : "Great. I’ll prepare the request for quotation and return with comparable options.";
  }

  return isFrench
    ? "J’ai bien noté votre demande commerciale. Je vous propose la prochaine étape."
    : "I’ve captured that commercial request and will move it forward.";
}

export function buildCommercialActivationMessage(result: CommercialIntentResult) {
  const isFrench = result.language === "fr";
  const product = result.product?.name ? ` ${result.product.name}` : "";
  const destination = result.destination ? ` vers ${result.destination}` : "";
  const specification = result.product?.specification && result.product.specification !== result.product.name ? ` (${result.product.specification})` : "";
  const quantity =
    result.product?.quantity && result.product?.unit
      ? `${result.product.quantity} ${result.product.unit}`
      : result.product?.quantity
        ? String(result.product.quantity)
        : "";
  const details = [product, specification, destination, quantity ? ` (${quantity})` : ""].filter(Boolean).join(" ");

  if (result.intent === "source_product") {
    return isFrench
      ? `C’est bien reçu${details ? ` (${details.trim()})` : ""}. Votre demande est enregistrée; la prochaine étape est la recherche de fournisseurs qualifiés.`
      : `Got it${details ? ` (${details.trim()})` : ""}. Your requirement is recorded; the next step is qualified supplier research.`;
  }

  if (result.intent === "track_order") {
    return isFrench ? "Je vérifie le statut de votre suivi et je vous reviens avec la prochaine étape." : "I’m checking the order status and will return the next step.";
  }

  if (result.intent === "request_quote") {
    return isFrench
      ? "Votre besoin de devis est enregistré pour examen commercial. Aucun fournisseur n’est encore confirmé."
      : "Your quote requirement is recorded for commercial review. No supplier is confirmed yet.";
  }

  return isFrench
    ? "Demande commerciale enregistrée. La prochaine étape opérationnelle reste soumise à l’examen indiqué."
    : "Commercial request recorded. The next operational step remains subject to the stated review.";
}
