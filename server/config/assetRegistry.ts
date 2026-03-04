import { defaultNegativePrompt, type ModelTier } from "../lib/imageGen/promptDefaults";

export type AssetType = "image" | "icon" | "logo" | "og" | "banner";
export type AssetGeneratedBy = "preset" | "manual" | "agent";

export type AssetRegistryEntry = {
  key: string;
  namespace: string;
  variant?: string;
  type: AssetType;
  aspectRatio?: string;
  recommendedSize?: string;
  usage: string;
  tags: string[];
  generatedBy: AssetGeneratedBy;
  defaultPrompt?: string;
  negativePrompt?: string;
  modelTier?: ModelTier;
  input?: Record<string, any>;
  metadata?: Record<string, any>;
};

export type CategoryDescriptor = { id: number; name?: string | null; slug?: string | null };

function normalizeVariant(value: unknown) {
  const v = String(value ?? "").trim();
  return v || "default";
}

export function registryKey(entry: Pick<AssetRegistryEntry, "namespace" | "key" | "variant">) {
  return `${entry.namespace}::${entry.key}::${normalizeVariant(entry.variant)}`;
}

export const ASSET_REGISTRY: AssetRegistryEntry[] = [
  // ======================
  // Bourse: Landing presets
  // ======================
  {
    namespace: "bourse",
    key: "landing/hero_desktop",
    type: "image",
    aspectRatio: "16:9",
    recommendedSize: "1920x1080",
    usage: "Main gateway hero background on /gateway (desktop).",
    tags: ["landing", "gateway", "preset"],
    generatedBy: "preset",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    defaultPrompt:
      "A clean, well-managed, mercury-free gold supply chain scene in modern West Africa: adult Black professionals and miners in proper PPE and business attire in a safe, organized environment, showing responsible extraction and trade. In the background, neat gravity separation equipment and organized work zones; in the foreground, a secure tray with gold doré bars and a tamper-evident sealed bag on a clean table. Everyone looks calm and confident. Documentary realism, institutional tone, neutral lighting, professional photography, high clarity, no dramatic shadows.",
    input: { aspect_ratio: "16:9", output_format: "png" },
  },
  {
    namespace: "bourse",
    key: "landing/hero_panel",
    type: "image",
    aspectRatio: "16:9",
    recommendedSize: "1600x900",
    usage: "Right-side hero panel image on /gateway.",
    tags: ["landing", "gateway", "preset"],
    generatedBy: "preset",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    defaultPrompt:
      "A modern, regulated gold trade operations control room in Africa: adult Black compliance and operations professionals reviewing supply chain flows on screens (no readable text), with a secure tray with gold doré bars and a calibrated scale on a clean desk. Documentary realism, institutional tone, neutral lighting.",
    input: { aspect_ratio: "16:9", output_format: "png" },
  },
  {
    namespace: "bourse",
    key: "landing/role_miner",
    type: "image",
    aspectRatio: "3:2",
    recommendedSize: "1500x1000",
    usage: "Gateway role tile image for Miner / Producer.",
    tags: ["landing", "gateway", "role", "preset"],
    generatedBy: "preset",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    defaultPrompt:
      "Adult Black gold miners wearing full PPE (hard hats, safety vests, gloves, boots) working in a well-managed mercury-free alluvial gold site. Show gravity separation with organized sluice boxes and controlled water flow, clear safety zones, clean equipment placement. A supervisor smiles while holding a natural gold nugget in a gloved hand. The site is structured and safe, not chaotic. Documentary realism, institutional tone, neutral lighting, professional photography, high clarity.",
    input: { aspect_ratio: "3:2", output_format: "png" },
  },
  {
    namespace: "bourse",
    key: "landing/role_wholesaler",
    type: "image",
    aspectRatio: "3:2",
    recommendedSize: "1500x1000",
    usage: "Gateway role tile image for Wholesaler / Bureau d'Achat.",
    tags: ["landing", "gateway", "role", "preset"],
    generatedBy: "preset",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    defaultPrompt:
      "African gold buying office (bureau d'achat) in a modern professional setting. Adult Black staff in business attire. Visible calibrated scale, tamper-evident sealed bags, batch labels with NO readable text, compliance checklist on a tablet, clean desk, secure storage tray. Regulated institutional feel. Documentary realism, neutral lighting, professional photography, high clarity.",
    input: { aspect_ratio: "3:2", output_format: "png" },
  },
  {
    namespace: "bourse",
    key: "landing/role_buyer",
    type: "image",
    aspectRatio: "3:2",
    recommendedSize: "1500x1000",
    usage: "Gateway role tile image for Buyer / Trader.",
    tags: ["landing", "gateway", "role", "preset"],
    generatedBy: "preset",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    defaultPrompt:
      "Adult Black buyer/trader in a modern office reviewing verified supply and pricing dashboards on a monitor (interface shapes visible but NO readable text). Secure tray with gold bars on the desk. Calm, professional, regulated environment. Documentary realism, institutional tone, neutral lighting, professional photography, high clarity.",
    input: { aspect_ratio: "3:2", output_format: "png" },
  },
  {
    namespace: "bourse",
    key: "landing/role_investor",
    type: "image",
    aspectRatio: "3:2",
    recommendedSize: "1500x1000",
    usage: "Gateway role tile image for Investor.",
    tags: ["landing", "gateway", "role", "preset"],
    generatedBy: "preset",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    defaultPrompt:
      "Adult Black investor/analyst in a professional office reviewing gold flow reports and risk dashboards on screen (charts visible but NO readable text). Serious but optimistic tone, clean modern environment, institutional look. Documentary realism, neutral lighting, professional photography, high clarity.",
    input: { aspect_ratio: "3:2", output_format: "png" },
  },
  {
    namespace: "bourse",
    key: "landing/role_explore",
    type: "image",
    aspectRatio: "3:2",
    recommendedSize: "1500x1000",
    usage: "Optional gateway role tile image for Explore / demo experience.",
    tags: ["landing", "gateway", "role", "preset"],
    generatedBy: "preset",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    defaultPrompt:
      "Modern Africa-focused digital infrastructure overview: a large screen shows a clean map-style interface with nodes and routes across Africa (NO readable text). On the desk: compliance documents (no readable text) and a secure gold sample tray. Regulated institution + technology platform feel. Documentary realism, institutional tone, neutral lighting, professional photography, high clarity.",
    input: { aspect_ratio: "3:2", output_format: "png" },
  },

  // ======================
  // Website assets (upload-first)
  // ======================
  {
    namespace: "bourse",
    key: "website/logo",
    type: "logo",
    aspectRatio: "1:1",
    recommendedSize: "512x512",
    usage: "Primary brand logo (used in headers, emails, receipts).",
    tags: ["website", "logo"],
    generatedBy: "manual",
  },
  {
    namespace: "bourse",
    key: "website/og_image",
    type: "og",
    aspectRatio: "1.91:1",
    recommendedSize: "1200x630",
    usage: "Open Graph share image.",
    tags: ["website", "og"],
    generatedBy: "manual",
  },
  {
    namespace: "bourse",
    key: "website/favicon",
    type: "icon",
    aspectRatio: "1:1",
    recommendedSize: "64x64",
    usage: "Favicon (browser tab).",
    tags: ["website", "favicon"],
    generatedBy: "manual",
  },
  {
    namespace: "exportunity",
    key: "website/logo",
    type: "logo",
    aspectRatio: "1:1",
    recommendedSize: "512x512",
    usage: "Primary brand logo (used in headers, emails, receipts).",
    tags: ["website", "logo"],
    generatedBy: "manual",
  },
  {
    namespace: "exportunity",
    key: "website/og_image",
    type: "og",
    aspectRatio: "1.91:1",
    recommendedSize: "1200x630",
    usage: "Open Graph share image.",
    tags: ["website", "og"],
    generatedBy: "manual",
  },
  {
    namespace: "exportunity",
    key: "website/favicon",
    type: "icon",
    aspectRatio: "1:1",
    recommendedSize: "64x64",
    usage: "Favicon (browser tab).",
    tags: ["website", "favicon"],
    generatedBy: "manual",
  },
];

export function buildCategoryAssetRegistryEntries(input: { namespace: string; categories: CategoryDescriptor[] }): AssetRegistryEntry[] {
  const namespace = String(input.namespace || "").trim() || "default";
  const items: AssetRegistryEntry[] = [];

  for (const category of input.categories || []) {
    const id = Number(category?.id);
    if (!Number.isFinite(id) || id <= 0) continue;

    const name = String(category?.name || "").trim() || `Category ${id}`;
    const slug = String(category?.slug || "").trim();

    items.push({
      namespace,
      key: `categories/${id}/cover`,
      type: "image",
      aspectRatio: "16:9",
      recommendedSize: "1200x675",
      usage: `Category cover image: ${name}${slug ? ` (${slug})` : ""}.`,
      tags: ["category", "categories", ...(slug ? [`category:${slug}`] : [])],
      generatedBy: "preset",
      modelTier: "quality",
      negativePrompt: defaultNegativePrompt,
      defaultPrompt: `Clean, modern, premium category cover image for: ${name}. No readable text, no logos, no watermarks.`,
      input: { aspect_ratio: "16:9", output_format: "png" },
      metadata: { categoryId: id, categoryName: name, categorySlug: slug || null, slot: "cover" },
    });

    items.push({
      namespace,
      key: `categories/${id}/icon`,
      type: "icon",
      aspectRatio: "1:1",
      recommendedSize: "512x512",
      usage: `Category icon image: ${name}${slug ? ` (${slug})` : ""}.`,
      tags: ["category", "categories", "icon", ...(slug ? [`category:${slug}`] : [])],
      generatedBy: "preset",
      modelTier: "quality",
      negativePrompt: defaultNegativePrompt,
      defaultPrompt: `Minimal, clean category icon for: ${name}. Flat design, high contrast, centered, no readable text, no logos, no watermarks.`,
      input: { aspect_ratio: "1:1", output_format: "png" },
      metadata: { categoryId: id, categoryName: name, categorySlug: slug || null, slot: "icon" },
    });
  }

  return items;
}

