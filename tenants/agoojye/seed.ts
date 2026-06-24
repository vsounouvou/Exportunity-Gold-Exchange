import type { TenantSeedPlan } from "../_shared/seedCommon";

export const agoojyeSeedPlan: TenantSeedPlan = {
  categories: [
    "Mobilite electrique",
    "Challenge Vehicule Electrique",
    "Partenaires",
    "Sponsors",
    "Documents",
  ],
  demoContent: [
    { key: "teams", title: "Equipes AGOOJYE", count: 9 },
    { key: "email_aliases", title: "Alias email officiels", count: 13 },
    { key: "milestones", title: "Jalons publics et internes", count: 10 },
  ],
};
