import type { TenantSeedPlan } from "../_shared/seedCommon";

export const exportunitySeedPlan: TenantSeedPlan = {
  categories: ["Retail", "Wholesale", "Services", "Equipment", "Financial tools"],
  demoContent: [
    { key: "marketplace_products", title: "Marketplace products", count: 40 },
    { key: "agents", title: "Operational agents", count: 20 },
  ],
};
