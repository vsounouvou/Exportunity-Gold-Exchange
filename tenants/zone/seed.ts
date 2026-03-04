import type { TenantSeedPlan } from "../_shared/seedCommon";

export const zoneSeedPlan: TenantSeedPlan = {
  categories: ["Groceries", "Construction", "Fashion", "Electronics", "Services"],
  demoContent: [
    { key: "retail_shops", title: "Retail shops", count: 24 },
    { key: "featured_products", title: "Featured products", count: 60 },
  ],
};
