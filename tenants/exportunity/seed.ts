import type { TenantSeedPlan } from "../_shared/seedCommon";

export const exportunitySeedPlan: TenantSeedPlan = {
  categories: [
    "Export-Ready Factory Products",
    "Machinery and Production Equipment",
    "Raw Materials",
    "Industrial Inputs and Consumables",
    "Spare Parts and Components",
    "Industrial Services",
  ],
  demoContent: [
    { key: "industrial_taxonomy", title: "Industrial taxonomy", count: 6 },
    { key: "industrial_agents", title: "Industrial operations agents", count: 0 },
  ],
};
