import type { TenantSeedPlan } from "../_shared/seedCommon";

export const hozSeedPlan: TenantSeedPlan = {
  categories: ["Jewelry", "Couture / Clothing", "Accessories", "Limited Drops", "Collections", "Art Objects"],
  demoContent: [
    { key: "luxury_collections", title: "Luxury collections", count: 16 },
    { key: "editorial_media", title: "Editorial media", count: 10 },
  ],
};
