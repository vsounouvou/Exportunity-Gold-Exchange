import type { TenantSeedPlan } from "../_shared/seedCommon";

export const metSeedPlan: TenantSeedPlan = {
  categories: [
    "Earth Bricks (CSEB)",
    "Lime / Plaster",
    "Clay Plaster",
    "Bamboo",
    "Natural Insulation",
    "Solar Lighting",
    "House Plans",
    "Tools & Equipment",
    "Contractor Services",
  ],
  demoContent: [
    { key: "construction_products", title: "Construction products", count: 25 },
    { key: "quote_templates", title: "Bulk quote templates", count: 8 },
  ],
};
