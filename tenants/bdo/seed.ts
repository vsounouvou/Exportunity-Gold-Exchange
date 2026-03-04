import type { TenantSeedPlan } from "../_shared/seedCommon";

export const bdoSeedPlan: TenantSeedPlan = {
  categories: ["Gold", "Machinery", "Jewelry", "Logistics", "Finance"],
  demoContent: [
    { key: "gold_listings", title: "Gold listings", count: 12 },
    { key: "bureaus", title: "Authorized bureaus", count: 8 },
  ],
};
