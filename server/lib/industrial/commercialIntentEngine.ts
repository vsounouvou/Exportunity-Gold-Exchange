import { normalizeIndustrialText } from "./taxonomy";

export type CommercialIntent =
  | "SOURCE_PRODUCT"
  | "BUY_PRODUCT"
  | "SELL_EXPORT"
  | "FIND_BUYER"
  | "FIND_MACHINERY"
  | "FIND_RAW_MATERIAL"
  | "REQUEST_QUOTE"
  | "COMPARE_SUPPLIERS"
  | "PLACE_ORDER"
  | "TRACK_ORDER"
  | "NEGOTIATE"
  | "MARKET_RESEARCH"
  | "MARKET_ENTRY"
  | "VERIFY_SUPPLIER"
  | "FINANCING"
  | "LOGISTICS"
  | "GENERAL_QUESTION";

export type CommercialActionMode = "ANSWER" | "ASK" | "ACT" | "ESCALATE";

export type CommercialProductIntent = {
  name?: string;
  category?: string;
  specification?: string;
  quantity?: string;
  unit?: string;
};

export type CommercialIntentAnalysis = {
  intent: CommercialIntent;
  confidence: number;
  commercial: boolean;
  product: CommercialProductIntent;
  origin?: string;
  destination?: string;
  targetPrice?: string;
  currency?: string;
  deadline?: string;
  frequency?: string;
  incoterm?: string;
  customerType?: string;
  missingFields: string[];
  suggestedAction: CommercialActionMode;
};

type ProductDefinition = {
  terms: string[];
  name: { fr: string; en: string };
  category: string;
};

const PRODUCTS: ProductDefinition[] = [
  {
    terms: ["huile de palme", "palm oil", "oleine de palme", "palm olein"],
    name: { fr: "Huile de palme", en: "Palm oil" },
    category: "palm_oil",
  },
  {
    terms: ["huile de soja", "soybean oil", "soya oil"],
    name: { fr: "Huile de soja", en: "Soybean oil" },
    category: "soybean_oil",
  },
  {
    terms: ["beurre de karite", "shea butter", "karite"],
    name: { fr: "Beurre de karite", en: "Shea butter" },
    category: "shea",
  },
  {
    terms: ["noix de cajou", "cashew", "anacarde"],
    name: { fr: "Noix de cajou", en: "Cashew" },
    category: "cashew",
  },
  {
    terms: ["cacao", "cocoa"],
    name: { fr: "Cacao", en: "Cocoa" },
    category: "cocoa",
  },
  {
    terms: ["cafe", "coffee"],
    name: { fr: "Cafe", en: "Coffee" },
    category: "coffee",
  },
  {
    terms: ["coton", "cotton"],
    name: { fr: "Coton", en: "Cotton" },
    category: "cotton",
  },
  {
    terms: ["sesame"],
    name: { fr: "Sesame", en: "Sesame" },
    category: "sesame",
  },
  {
    terms: ["mais", "maize", "corn"],
    name: { fr: "Mais", en: "Maize" },
    category: "maize",
  },
  {
    terms: ["riz", "rice"],
    name: { fr: "Riz", en: "Rice" },
    category: "rice",
  },
  {
    terms: ["sucre", "sugar"],
    name: { fr: "Sucre", en: "Sugar" },
    category: "sugar",
  },
  {
    terms: ["acier", "steel"],
    name: { fr: "Acier", en: "Steel" },
    category: "steel",
  },
  {
    terms: ["ciment", "cement"],
    name: { fr: "Ciment", en: "Cement" },
    category: "cement",
  },
  {
    terms: ["aluminium", "aluminum"],
    name: { fr: "Aluminium", en: "Aluminium" },
    category: "aluminium",
  },
  {
    terms: ["polymere", "polymer", "resine", "resin"],
    name: { fr: "Polymere industriel", en: "Industrial polymer" },
    category: "polymer",
  },
];

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeIndustrialText(term)));
}

function compact(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function detectedProduct(
  normalized: string,
  language: "fr" | "en",
): CommercialProductIntent {
  const match = PRODUCTS.find((entry) => includesAny(normalized, entry.terms));
  if (!match) return {};
  return {
    name: match.name[language],
    category: match.category,
  };
}

function extractSpecification(normalized: string) {
  if (includesAny(normalized, ["raffinee", "raffine", "refined", "rbd"])) {
    return "refined";
  }
  if (includesAny(normalized, ["brute", "brut", "crude", "cpo"])) {
    return "crude";
  }
  if (includesAny(normalized, ["bio", "biologique", "organic"])) {
    return "organic";
  }
  if (includesAny(normalized, ["food grade", "alimentaire"])) {
    return "food_grade";
  }
  return undefined;
}

function extractQuantity(message: string) {
  const unit =
    "(?:kg|kilogrammes?|kilograms?|tonnes?|tons?|t|sacs?|bags?|cartons?|boxes?|caisses?|palettes?|pallets?|litres?|liters?|l|barils?|barrels?|conteneurs?|containers?|unites?|units?|pieces?|items?)";
  const match = compact(message).match(
    new RegExp(`\\b(\\d(?:[\\d\\s.,]*\\d)?)\\s*(${unit})\\b`, "iu"),
  );
  if (!match) return {};
  return {
    quantity: compact(match[1]),
    unit: compact(match[2]),
  };
}

function extractIncoterm(message: string) {
  return compact(message).match(/\b(EXW|FCA|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/i)?.[1]?.toUpperCase();
}

function extractTargetPrice(message: string) {
  const match = compact(message).match(
    /(?:budget|prix(?:\s+cible)?|target price|price|a|at)?\s*(?:de|of|:|=)?\s*([$EURGBP]{1,3}|USD|EUR|GBP|XOF|FCFA|AED)?\s*(\d[\d\s.,]*)(?:\s*([$EURGBP]{1,3}|USD|EUR|GBP|XOF|FCFA|AED))?(?:\s*(?:\/|par|per)\s*([a-zA-Z]+))?/iu,
  );
  if (!match || (!match[1] && !match[3])) return {};
  const currency = compact(match[1] || match[3]).toUpperCase();
  const normalizedCurrency =
    currency === "$" ? "USD" : currency === "EUR" ? "EUR" : currency;
  return {
    targetPrice: compact(
      `${match[2]} ${normalizedCurrency}${match[4] ? `/${match[4]}` : ""}`,
    ),
    currency: normalizedCurrency,
  };
}

function extractFrequency(normalized: string, language: "fr" | "en") {
  if (includesAny(normalized, ["chaque semaine", "weekly", "hebdomadaire"]))
    return language === "fr" ? "Chaque semaine" : "Weekly";
  if (includesAny(normalized, ["chaque mois", "monthly", "mensuel"]))
    return language === "fr" ? "Chaque mois" : "Monthly";
  if (includesAny(normalized, ["recurrent", "recurring", "regular supply"]))
    return language === "fr" ? "Approvisionnement recurrent" : "Recurring supply";
  if (includesAny(normalized, ["ponctuel", "one time", "single order"]))
    return language === "fr" ? "Achat ponctuel" : "One-time purchase";
  return undefined;
}

function extractCustomerType(normalized: string) {
  if (includesAny(normalized, ["usine", "factory", "manufacturer", "fabricant"]))
    return "manufacturer";
  if (includesAny(normalized, ["distributeur", "distributor", "grossiste", "wholesaler"]))
    return "distributor";
  if (includesAny(normalized, ["importateur", "importer"])) return "importer";
  if (includesAny(normalized, ["exportateur", "exporter"])) return "exporter";
  if (includesAny(normalized, ["mine", "mining", "miniere"])) return "mining_company";
  return undefined;
}

function determineIntent(normalized: string, hasProduct: boolean): CommercialIntent {
  if (includesAny(normalized, ["suivre ma commande", "track order", "ou est ma commande"]))
    return "TRACK_ORDER";
  if (includesAny(normalized, ["comparer les fournisseurs", "compare suppliers", "compare quotes"]))
    return "COMPARE_SUPPLIERS";
  if (includesAny(normalized, ["verifier fournisseur", "verify supplier", "supplier verification"]))
    return "VERIFY_SUPPLIER";
  if (includesAny(normalized, ["trouver des acheteurs", "find buyers", "buyer search"]))
    return "FIND_BUYER";
  if (includesAny(normalized, ["vendre a l export", "sell for export", "exporter mes", "sell my product"]))
    return "SELL_EXPORT";
  if (includesAny(normalized, ["etude de marche", "market research", "market intelligence"]))
    return "MARKET_RESEARCH";
  if (includesAny(normalized, ["entrer sur le marche", "market entry", "nouveau marche"]))
    return "MARKET_ENTRY";
  if (includesAny(normalized, ["financement", "financing", "credit", "working capital"]))
    return "FINANCING";
  if (includesAny(normalized, ["logistique", "logistics", "freight", "transport", "douane", "customs"]))
    return "LOGISTICS";
  if (includesAny(normalized, ["negocier", "negotiate", "negociation", "meilleur prix"]))
    return "NEGOTIATE";
  if (includesAny(normalized, ["passer commande", "place order", "commander maintenant"]))
    return "PLACE_ORDER";
  if (includesAny(normalized, ["devis", "quotation", "quote", "rfq"]))
    return "REQUEST_QUOTE";
  if (includesAny(normalized, ["machine", "equipment", "equipement", "ligne de production"]))
    return "FIND_MACHINERY";
  if (includesAny(normalized, ["matiere premiere", "raw material", "commodity", "commodite"]))
    return "FIND_RAW_MATERIAL";
  if (includesAny(normalized, ["sourcer", "source", "approvisionner", "trouver fournisseur", "find supplier"]))
    return "SOURCE_PRODUCT";
  if (hasProduct || includesAny(normalized, ["acheter", "buy", "commander", "order", "besoin de", "need"]))
    return "BUY_PRODUCT";
  return "GENERAL_QUESTION";
}

function missingFieldsFor(input: {
  intent: CommercialIntent;
  product: CommercialProductIntent;
  destination?: string;
  frequency?: string;
  incoterm?: string;
}) {
  const transactional = new Set<CommercialIntent>([
    "SOURCE_PRODUCT",
    "BUY_PRODUCT",
    "FIND_RAW_MATERIAL",
    "REQUEST_QUOTE",
    "PLACE_ORDER",
  ]);
  if (!transactional.has(input.intent)) return [];

  const missing: string[] = [];
  if (!input.product.name) missing.push("product.name");
  if (!input.product.quantity) missing.push("product.quantity");
  if (!input.destination) missing.push("destination");
  if (input.product.category === "palm_oil" && !input.product.specification)
    missing.push("product.specification");
  if (!input.frequency) missing.push("frequency");
  if (!input.incoterm) missing.push("incoterm");
  return missing;
}

export function analyzeCommercialIntent(input: {
  message: string;
  language?: "fr" | "en";
  quantityText?: string;
  destination?: string;
  deadline?: string;
}): CommercialIntentAnalysis {
  const language = input.language || "fr";
  const normalized = normalizeIndustrialText(input.message);
  const product = detectedProduct(normalized, language);
  const quantity = extractQuantity(input.message);
  product.quantity = quantity.quantity || input.quantityText;
  product.unit = quantity.unit;
  product.specification = extractSpecification(normalized);

  const intent = determineIntent(normalized, Boolean(product.name));
  const commercial = intent !== "GENERAL_QUESTION";
  const frequency = extractFrequency(normalized, language);
  const incoterm = extractIncoterm(input.message);
  const pricing = extractTargetPrice(input.message);
  const missingFields = missingFieldsFor({
    intent,
    product,
    destination: input.destination,
    frequency,
    incoterm,
  });
  const explicitIntent = intent !== "GENERAL_QUESTION";
  const evidenceCount = [product.name, product.quantity, input.destination, frequency, incoterm]
    .filter(Boolean).length;

  return {
    intent,
    confidence: explicitIntent
      ? Math.min(0.98, 0.78 + evidenceCount * 0.04)
      : 0.35,
    commercial,
    product,
    destination: input.destination,
    targetPrice: pricing.targetPrice,
    currency: pricing.currency,
    deadline: input.deadline,
    frequency,
    incoterm,
    customerType: extractCustomerType(normalized),
    missingFields,
    suggestedAction:
      !commercial
        ? "ANSWER"
        : missingFields.length
          ? "ASK"
          : "ACT",
  };
}
