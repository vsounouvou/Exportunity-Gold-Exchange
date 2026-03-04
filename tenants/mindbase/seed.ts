import type { TenantSeedPlan } from "../_shared/seedCommon";

export const mindbaseSeedPlan: TenantSeedPlan = {
  categories: ["Expert agents", "Knowledge files", "Workspaces"],
  demoContent: [
    { key: "featured_agents", title: "Featured agents", count: 12 },
    { key: "creator_profiles", title: "Creator profiles", count: 6 },
  ],
};
