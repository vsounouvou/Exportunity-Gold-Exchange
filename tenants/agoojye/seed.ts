import type { TenantSeedPlan } from "../_shared/seedCommon";

export const agoojyeSeedPlan: TenantSeedPlan = {
  categories: [
    "Mobilité électrique",
    "Challenge Véhicule Électrique",
    "Partenaires",
    "Sponsors",
    "Documents",
  ],
  demoContent: [
    { key: "teams", title: "Équipes AGOOJIYE", count: 9 },
    { key: "email_aliases", title: "Alias email officiels", count: 13 },
    { key: "milestones", title: "Jalons publics et internes", count: 10 },
  ],
};
