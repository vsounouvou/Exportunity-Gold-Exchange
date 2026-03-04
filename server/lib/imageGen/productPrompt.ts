import { categoryTemplates, defaultNegativePrompt, type ModelTier } from "./presets";

type ProductRow = {
  id: number;
  name?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  weight?: string | number | null;
  weightUnit?: string | null;
  attributes?: any;
  tags?: any;
};

type CategoryRow = {
  id: number;
  name?: string | null;
  slug?: string | null;
} | null;

export type ProductTemplateKey = keyof typeof categoryTemplates;
export type ProductImagePreset = "gold" | "jewelry" | "produce" | "generic";

export function getProductPrimaryAssetKey(input: {
  tenantKey: string;
  categorySlug?: string | null;
  productId: number;
}) {
  const tenantKey = String(input.tenantKey || "").trim() || "unknown";
  const categorySlug = String(input.categorySlug || "").trim() || "general";
  const productId = String(input.productId);
  return `${tenantKey}/${categorySlug}/${productId}/primary`;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAny(text: string, signals: string[]) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return false;

  return signals.some((signalRaw) => {
    const signal = normalizeText(signalRaw);
    if (!signal) return false;
    if (signal.includes(" ")) return normalizedText.includes(signal);
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(signal)}([^a-z0-9]|$)`);
    return pattern.test(normalizedText);
  });
}

function mapCategorySlugToTemplate(slugRaw: string): ProductTemplateKey | null {
  const slug = normalizeText(slugRaw);
  if (!slug) return null;

  if (slug.includes("stamped")) return "stamped";
  if (slug.includes("jewel") || slug.includes("bijou") || slug.includes("gold-art")) return "jewelry";
  if (slug.includes("dore") || slug.includes("bullion") || slug.includes("ingot")) return "gold";

  if (slug.includes("grocery") || slug.includes("epicer") || slug.includes("mini-mart")) return "groceries";
  if (slug.includes("restaurant") || slug.includes("restauration") || slug.includes("street-food") || slug.includes("food")) {
    return "restaurants";
  }
  if (slug.includes("fashion") || slug.includes("mode") || slug.includes("textile") || slug.includes("tailor")) return "fashion";
  if (slug.includes("beauty") || slug.includes("cosmetic") || slug.includes("salon")) return "beauty";
  if (slug.includes("electronics") || slug.includes("electronic")) return "electronics";
  if (slug.includes("phone") || slug.includes("teleph") || slug.includes("mobile")) return "phones";
  if (slug.includes("home") || slug.includes("deco") || slug.includes("decor") || slug.includes("maison")) return "home";
  if (slug.includes("pharmacy") || slug.includes("pharma") || slug.includes("parapharm")) return "pharmacy";
  if (slug.includes("building") || slug.includes("bricol") || slug.includes("material") || slug.includes("construction")) {
    return "building";
  }
  if (slug.includes("auto") || slug.includes("moto") || slug.includes("vehicle")) return "auto";
  if (slug.includes("service") || slug.includes("installation") || slug.includes("repair")) return "service";
  if (slug.includes("produce") || slug.includes("fruit") || slug.includes("vegetable")) return "produce";

  return null;
}

export function inferPromptTemplateKey(input: {
  tenantKey?: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  productName?: string | null;
  shortDescription?: string | null;
  description?: string | null;
}): ProductTemplateKey {
  const slugTemplate = mapCategorySlugToTemplate(String(input.categorySlug || ""));
  if (slugTemplate) return slugTemplate;

  const coreText = normalizeText(
    [
      input.categorySlug,
      input.categoryName,
      input.productName,
      input.shortDescription,
      input.tenantKey,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const extendedText = normalizeText([coreText, input.description].filter(Boolean).join(" "));

  const stampedSignals = ["stamped", "hallmark", "assay", "coin", "coins", "certified bar"];
  // "ring" is intentionally excluded to avoid false positives in words like "during".
  const jewelrySignals = ["jewelry", "jewel", "bracelet", "necklace", "pendant", "earring", "bijou", "bague", "alliance"];
  const goldSignals = ["dore", "gold", "ingot", "bullion", "nugget", "dust", "karat"];
  const groceriesSignals = [
    "grocery",
    "epicerie",
    "rice",
    "riz",
    "huile",
    "spaghetti",
    "farine",
    "haricot",
    "oignon",
    "potato",
    "tomate",
    "bissap",
  ];
  const restaurantsSignals = [
    "restaurant",
    "restauration",
    "atti",
    "garba",
    "kedjenou",
    "alloco",
    "foutou",
    "akassa",
    "brochette",
    "street food",
    "menu",
  ];
  const fashionSignals = ["fashion", "mode", "wax", "boubou", "chemise", "robe", "sneaker", "sandales", "tailor"];
  const beautySignals = ["beauty", "beaute", "karite", "cosmetic", "savon", "shampoo", "parfum", "makeup", "skin"];
  const electronicsSignals = ["electronics", "tv", "laptop", "routeur", "router", "imprimante", "camera ip", "usb", "onduleur"];
  const phonesSignals = ["phone", "smartphone", "powerbank", "usb-c", "coque", "verre trempe", "montre connectee", "tripod"];
  const homeSignals = ["home", "deco", "rideaux", "tapis", "vaisselle", "marmite", "table", "chaise", "rangement"];
  const pharmacySignals = ["pharmacy", "pharma", "vitamine", "sirop", "antiseptique", "pansement", "thermometre"];
  const buildingSignals = [
    "building",
    "ciment",
    "carrelage",
    "robinetterie",
    "prise",
    "perceuse",
    "renovation",
    "plomberie",
    "gravier",
    "sable",
    "materiaux",
    "materiau",
  ];
  const autoSignals = ["auto", "moto", "batterie", "huile moteur", "frein", "pneu", "diagnostic moteur", "casque moto"];
  const produceSignals = ["produce", "vegetable", "fruit", "tomato", "avocado", "banana", "mango", "onion", "potato", "fresh"];
  const serviceSignals = ["service", "installation", "repair", "conseil", "consult", "maintenance", "diagnostic"];

  const detect = (text: string): ProductTemplateKey => {
    if (hasAny(text, stampedSignals)) return "stamped";
    if (hasAny(text, jewelrySignals)) return "jewelry";
    if (hasAny(text, goldSignals)) return "gold";

    if (hasAny(text, restaurantsSignals)) return "restaurants";
    if (hasAny(text, groceriesSignals)) return "groceries";
    if (hasAny(text, produceSignals)) return "produce";

    if (hasAny(text, buildingSignals)) return "building";
    if (hasAny(text, autoSignals)) return "auto";
    if (hasAny(text, phonesSignals)) return "phones";
    if (hasAny(text, electronicsSignals)) return "electronics";
    if (hasAny(text, homeSignals)) return "home";
    if (hasAny(text, pharmacySignals)) return "pharmacy";
    if (hasAny(text, fashionSignals)) return "fashion";
    if (hasAny(text, beautySignals)) return "beauty";
    if (hasAny(text, serviceSignals)) return "service";
    return "generic";
  };

  const fromCore = detect(coreText);
  if (fromCore !== "generic") return fromCore;

  const fromExtended = detect(extendedText);
  if (fromExtended !== "generic") return fromExtended;

  return "generic";
}

export function inferProductImagePreset(input: {
  tenantKey?: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  productName?: string | null;
  shortDescription?: string | null;
  description?: string | null;
}): ProductImagePreset {
  const templateKey = inferPromptTemplateKey(input);
  if (templateKey === "stamped" || templateKey === "gold") return "gold";
  if (templateKey === "jewelry") return "jewelry";
  if (templateKey === "produce" || templateKey === "groceries" || templateKey === "restaurants" || templateKey === "pharmacy") {
    return "produce";
  }
  return "generic";
}

function pickTemplateKey(input: { tenantKey?: string; product: ProductRow; category: CategoryRow }): ProductTemplateKey {
  return inferPromptTemplateKey({
    tenantKey: input.tenantKey,
    categorySlug: input.category?.slug,
    categoryName: input.category?.name,
    productName: input.product.name,
    shortDescription: input.product.shortDescription,
    description: input.product.description,
  });
}

function extractAttribute(attrs: any, keys: string[]): string | null {
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return null;
  for (const key of keys) {
    const raw = (attrs as any)[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  }
  return null;
}

export function buildProductPrompt(input: {
  tenantKey?: string;
  product: ProductRow;
  category?: CategoryRow;
}): { prompt: string; negativePrompt: string; aspect: string; modelTier: ModelTier } {
  const category = input.category ?? null;
  const product = input.product;
  const templateKey = pickTemplateKey({ tenantKey: input.tenantKey, product, category });
  const template = categoryTemplates[templateKey] ?? categoryTemplates.generic;

  const title = String(product.name || "").trim() || "product";
  const categoryLabel = String(category?.name || category?.slug || template.label).trim();

  const attrs = product.attributes;
  const purity = extractAttribute(attrs, ["purity", "purityPct", "karat", "assay", "grade"]);
  const packaging = extractAttribute(attrs, ["packaging", "package", "seal", "sealed", "bag"]);
  const material = extractAttribute(attrs, ["material", "metal", "composition"]);

  const weightValue = product.weight != null ? String(product.weight).trim() : "";
  const weightUnit = String(product.weightUnit || "").trim();
  const weight = weightValue ? `${weightValue}${weightUnit ? ` ${weightUnit}` : ""}` : null;

  const mustInclude = template.mustInclude.map((s) => s.trim()).filter(Boolean);
  const mustNotInclude = template.mustNotInclude.map((s) => s.trim()).filter(Boolean);

  const promptParts: string[] = [];
  promptParts.push(`Product: ${title}.`);
  if (categoryLabel) promptParts.push(`Category: ${categoryLabel}.`);
  if (material) promptParts.push(`Material: ${material}.`);
  if (purity) promptParts.push(`Purity: ${purity}.`);
  if (weight) promptParts.push(`Weight: ${weight}.`);
  if (packaging) promptParts.push(`Packaging: ${packaging}.`);

  promptParts.push(template.basePrompt);

  if (mustInclude.length) {
    promptParts.push(`Include: ${mustInclude.join(", ")}.`);
  }
  if (mustNotInclude.length) {
    promptParts.push(`Do NOT show: ${mustNotInclude.join(", ")}.`);
  }

  // Always reinforce "no readable text/logos" at prompt-level (negative prompt covers it too).
  promptParts.push("No readable text, no logos, no watermarks.");

  const negativePrompt = [defaultNegativePrompt, template.negativeAdditions].filter(Boolean).join(", ");
  return { prompt: promptParts.join(" "), negativePrompt, aspect: template.aspect, modelTier: template.modelTier };
}
