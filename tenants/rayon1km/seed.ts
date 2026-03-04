import type { TenantSeedPlan } from "../_shared/seedCommon";

export const rayon1kmSeedPlan: TenantSeedPlan = {
  categories: ["Food", "Beauty", "Health", "Services", "Home", "Mobility", "Fashion", "Daily essentials"],
  demoContent: [
    { key: "nearby_products", title: "Nearby products", count: 30 },
    { key: "nearby_shops", title: "Nearby shops", count: 12 },
  ],
};
