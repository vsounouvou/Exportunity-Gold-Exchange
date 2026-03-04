import type { TenantSeedPlan } from "../_shared/seedCommon";

export const vsSeedPlan: TenantSeedPlan = {
  categories: ["Books", "Courses", "Consulting", "Digital Assets", "Speaking", "Merchandise"],
  demoContent: [
    { key: "press_assets", title: "Press assets", count: 18 },
    { key: "insight_posts", title: "Insight posts", count: 22 },
  ],
};
