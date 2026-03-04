export { defaultNegativePrompt, defaultStyleSuffix, type ModelTier } from "./promptDefaults";

import { defaultNegativePrompt, type ModelTier } from "./promptDefaults";
import { ASSET_REGISTRY } from "../../config/assetRegistry";

export type LandingAssetPreset = {
  namespace: string;
  assetKey: string;
  aspect: string;
  modelTier: ModelTier;
  prompt: string;
  negativePrompt: string;
  description?: string;
};

const legacyLandingAssetPresets: LandingAssetPreset[] = [
  {
    namespace: "bourse",
    assetKey: "landing/hero_desktop",
    aspect: "16:9",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    description: "Main gateway hero background on /gateway (desktop).",
    prompt:
      "A clean, well-managed, mercury-free gold supply chain scene in modern West Africa: adult Black professionals and miners in proper PPE and business attire in a safe, organized environment, showing responsible extraction and trade. In the background, neat gravity separation equipment and organized work zones; in the foreground, a secure tray with gold doré bars and a tamper-evident sealed bag on a clean table. Everyone looks calm and confident. Documentary realism, institutional tone, neutral lighting, professional photography, high clarity, no dramatic shadows.",
  },
  {
    namespace: "bourse",
    assetKey: "landing/hero_panel",
    aspect: "16:9",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    description: "Right-side hero panel image on /gateway.",
    prompt:
      "A modern, regulated gold trade operations control room in Africa: adult Black compliance and operations professionals reviewing supply chain flows on screens (no readable text), with a secure tray of gold doré bars and a calibrated scale on a clean desk. Documentary realism, institutional tone, neutral lighting.",
  },
  {
    namespace: "bourse",
    assetKey: "landing/role_miner",
    aspect: "3:2",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    description: "Gateway role tile image for Miner / Producer.",
    prompt:
      "Adult Black gold miners wearing full PPE (hard hats, safety vests, gloves, boots) working in a well-managed mercury-free alluvial gold site. Show gravity separation with organized sluice boxes and controlled water flow, clear safety zones, clean equipment placement. A supervisor smiles while holding a natural gold nugget in a gloved hand. The site is structured and safe, not chaotic. Documentary realism, institutional tone, neutral lighting, professional photography, high clarity.",
  },
  {
    namespace: "bourse",
    assetKey: "landing/role_wholesaler",
    aspect: "3:2",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    description: "Gateway role tile image for Wholesaler / Bureau d'Achat.",
    prompt:
      "African gold buying office (bureau d’achat) in a modern professional setting. Adult Black staff in business attire. Visible calibrated scale, tamper-evident sealed bags, batch labels with NO readable text, compliance checklist on a tablet, clean desk, secure storage tray. Regulated institutional feel. Documentary realism, neutral lighting, professional photography, high clarity.",
  },
  {
    namespace: "bourse",
    assetKey: "landing/role_buyer",
    aspect: "3:2",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    description: "Gateway role tile image for Buyer / Trader.",
    prompt:
      "Adult Black buyer/trader in a modern office reviewing verified supply and pricing dashboards on a monitor (interface shapes visible but NO readable text). Secure tray with gold bars on the desk. Calm, professional, regulated environment. Documentary realism, institutional tone, neutral lighting, professional photography, high clarity.",
  },
  {
    namespace: "bourse",
    assetKey: "landing/role_investor",
    aspect: "3:2",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    description: "Gateway role tile image for Investor.",
    prompt:
      "Adult Black investor/analyst in a professional office reviewing gold flow reports and risk dashboards on screen (charts visible but NO readable text). Serious but optimistic tone, clean modern environment, institutional look. Documentary realism, neutral lighting, professional photography, high clarity.",
  },
  {
    namespace: "bourse",
    assetKey: "landing/role_explore",
    aspect: "3:2",
    modelTier: "quality",
    negativePrompt: defaultNegativePrompt,
    description: "Optional gateway role tile image for Explore / demo experience.",
    prompt:
      "Modern Africa-focused digital infrastructure overview: a large screen shows a clean map-style interface with nodes and routes across Africa (NO readable text). On the desk: compliance documents (no readable text) and a secure gold sample tray. Regulated institution + technology platform feel. Documentary realism, institutional tone, neutral lighting, professional photography, high clarity.",
  },
];

export const landingAssetPresets: LandingAssetPreset[] = (() => {
  const fromRegistry = ASSET_REGISTRY.filter(
    (entry) => entry.generatedBy === "preset" && entry.tags.includes("landing") && !!entry.defaultPrompt
  ).map((entry) => ({
    namespace: entry.namespace,
    assetKey: entry.key,
    aspect: entry.aspectRatio || "1:1",
    modelTier: entry.modelTier || "quality",
    prompt: entry.defaultPrompt!,
    negativePrompt: entry.negativePrompt || defaultNegativePrompt,
    description: entry.usage,
  }));

  return fromRegistry.length ? fromRegistry : legacyLandingAssetPresets;
})();

export type CategoryTemplate = {
  label: string;
  aspect: string;
  modelTier: ModelTier;
  basePrompt: string;
  mustInclude: string[];
  mustNotInclude: string[];
  negativeAdditions?: string;
};

export const categoryTemplates: Record<string, CategoryTemplate> = {
  stamped: {
    label: "Stamped Gold (Bars / Coins)",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Secure institutional product photography of refined stamped gold bars or coins on a clean surface. Close-up macro realism, crisp metal reflections, neutral studio lighting, high clarity. Include a tamper-evident sealed bag or certification card; any hallmark-style stamps must be present but NOT readable.",
    mustInclude: [
      "refined gold bar or coin",
      "clean surface",
      "tamper-evident sealed packaging or certification card",
      "no readable text",
    ],
    mustNotInclude: ["raw ore", "dore", "dore bar", "nuggets", "food", "fruits", "vegetables", "random jewelry"],
    negativeAdditions:
      "raw ore, dore, nugget, mining, excavator, food, fruits, vegetables, produce, jewelry, ring, necklace",
  },
  gold: {
    label: "Gold / Dore / Raw lots",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Secure institutional product photography of gold dore bars, nuggets, or sealed lots on a clean surface, regulated environment, professional documentary realism, neutral lighting, high clarity.",
    mustInclude: ["secure tray or tamper-evident sealed bag", "clean surface", "no readable text"],
    mustNotInclude: ["food", "fruits", "vegetables", "market groceries", "random jewelry"],
    negativeAdditions: "food, fruits, vegetables, produce, tomatoes, avocados, grocery, market stall",
  },
  jewelry: {
    label: "Jewelry",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Jewelry macro photography in a neutral studio setup: studio product photography of jewelry on a clean background, high detail metal reflections, neutral lighting, high clarity.",
    mustInclude: ["jewelry macro", "neutral studio", "no readable text", "no brand logo"],
    mustNotInclude: ["food", "produce", "gold bars unless explicitly requested"],
    negativeAdditions: "food, fruits, vegetables, produce, gold bar, dore bar, nugget lot",
  },
  produce: {
    label: "Food / Produce",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Clean food photography of fresh produce on a neutral background, natural lighting, high clarity, true-to-life colors.",
    mustInclude: ["food photography", "accurate item appearance", "no readable text", "no logos"],
    mustNotInclude: ["gold bars", "dore", "nuggets", "mining equipment", "industrial scenes"],
    negativeAdditions: "gold bar, dore, nugget, bullion, mining, excavator, sluice, industrial site",
  },
  groceries: {
    label: "Groceries",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Professional e-commerce grocery product photography on a clean background, true-to-life packaging and ingredients, neutral lighting, realistic color and texture.",
    mustInclude: ["single grocery product focus", "retail-ready presentation", "no readable text", "no logos"],
    mustNotInclude: ["gold bars", "jewelry", "industrial machinery", "construction site"],
    negativeAdditions: "gold, bullion, jewelry, ring, necklace, excavator, cement yard, car engine",
  },
  restaurants: {
    label: "Restaurant Dish",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Appetite-focused food plating photo of a prepared meal, realistic ingredients, clean table setup, natural light, premium delivery-app style presentation.",
    mustInclude: ["prepared dish", "clean plate or food box", "authentic texture", "no readable text"],
    mustNotInclude: ["jewelry macro", "gold bars", "raw mining material", "construction tools"],
    negativeAdditions: "gold bar, bullion, ring, bracelet, excavator, tools, workshop, blueprint",
  },
  fashion: {
    label: "Fashion Apparel",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Clean fashion catalog photo of clothing or accessories, fabric details visible, premium e-commerce styling, neutral studio background, balanced soft light.",
    mustInclude: ["fashion item in focus", "material texture visible", "no readable text", "no logos"],
    mustNotInclude: ["food ingredients", "electronics internals", "construction materials", "car parts"],
    negativeAdditions: "plate of food, circuit board closeup, cement bag, brake pads, engine oil can",
  },
  beauty: {
    label: "Beauty & Cosmetics",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Premium cosmetics product photography with clean composition, clear bottle or jar details, soft beauty lighting, realistic skin-care and hair-care context.",
    mustInclude: ["beauty product focus", "clean packaging", "no readable text", "no logos"],
    mustNotInclude: ["gold bars", "jewelry showcase", "heavy machinery", "auto workshop parts"],
    negativeAdditions: "gold bullion, necklace closeup, excavator, brake disc, engine bay",
  },
  electronics: {
    label: "Electronics",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Modern electronics product shot, clean desk or studio setup, realistic materials and reflections, sharp edges, premium e-commerce quality.",
    mustInclude: ["electronic device in focus", "clean background", "no readable text", "no logos"],
    mustNotInclude: ["food dish", "beauty cream", "construction cement", "car repair parts"],
    negativeAdditions: "meal plate, lotion jar, cement bag, wrench pile, engine oil spill",
  },
  phones: {
    label: "Phones & Accessories",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Smartphone and accessories product photography with realistic scale, crisp product edges, neutral premium background, mobile-commerce listing style.",
    mustInclude: ["phone or phone accessory in focus", "clean composition", "no readable text", "no logos"],
    mustNotInclude: ["gold jewelry", "food produce", "building materials", "vehicle parts"],
    negativeAdditions: "ring macro, tomatoes, cement, rebar, tire tread, engine block",
  },
  home: {
    label: "Home & Decor",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Interior-friendly home decor product photo with warm but neutral styling, realistic household context, clean composition for marketplace listing.",
    mustInclude: ["home item in focus", "clean scene", "no readable text", "no logos"],
    mustNotInclude: ["restaurant meal closeup", "car parts", "gold bars", "industrial workshop"],
    negativeAdditions: "food plate, brake pads, bullion bar, welding sparks, factory line",
  },
  pharmacy: {
    label: "Pharmacy / Parapharmacy",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Clinical clean product photography for health and wellness items, sterile-looking background, trustworthy and clear pack-shot composition.",
    mustInclude: ["health product in focus", "clean clinical background", "no readable text", "no logos"],
    mustNotInclude: ["food plating", "jewelry macro", "construction materials", "automotive parts"],
    negativeAdditions: "restaurant plate, ring macro, cement, bricks, car tire, engine",
  },
  building: {
    label: "Building Materials / Services",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Professional construction product photo for materials or service tools, clean workshop context, realistic texture and utility-focused framing.",
    mustInclude: ["building product or tool in focus", "industrial realism", "no readable text", "no logos"],
    mustNotInclude: ["jewelry closeup", "beauty product", "restaurant meal", "gold bullion"],
    negativeAdditions: "diamond ring, lipstick tube, plated food, gold bar, necklace",
  },
  auto: {
    label: "Auto & Moto",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Automotive parts product photography with workshop-grade realism, clean background, clear part shape and materials, e-commerce catalog style.",
    mustInclude: ["auto or moto part in focus", "sharp detail", "no readable text", "no logos"],
    mustNotInclude: ["food produce", "beauty cosmetics", "fashion model styling", "gold jewelry macro"],
    negativeAdditions: "fruit basket, skincare bottle, runway outfit, bracelet closeup, necklace macro",
  },
  service: {
    label: "Service Listing",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt:
      "Professional service listing hero image with relevant tools and workspace context, realistic documentary style, clean composition for marketplace cards.",
    mustInclude: ["service context tools", "clean professional scene", "no readable text", "no logos"],
    mustNotInclude: ["jewelry macro", "gold bars", "food-only closeup unrelated to service"],
    negativeAdditions: "diamond ring, bullion stack, plated meal macro, fashion runway portrait",
  },
  generic: {
    label: "Generic",
    aspect: "1:1",
    modelTier: "quality",
    basePrompt: "Institutional product photography on a clean background, neutral lighting, high clarity.",
    mustInclude: ["no readable text", "no logos"],
    mustNotInclude: [],
  },
};

