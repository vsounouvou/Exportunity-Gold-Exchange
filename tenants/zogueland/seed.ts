import type { TenantSeedPlan } from "../_shared/seedCommon";

export const zoguelandSeedPlan: TenantSeedPlan = {
  categories: [
    "Stories",
    "Audiobooks",
    "Printable Books",
    "STEM Kits",
    "Educational Toys",
    "Art Packs",
    "Character Avatars",
    "Wall Art",
    "Clothing",
    "Learning Tools",
  ],
  demoContent: [
    { key: "story_products", title: "Story products", count: 10 },
    { key: "audiobooks", title: "Audiobooks", count: 5 },
    { key: "printable_packs", title: "Printable packs", count: 5 },
    { key: "character_templates", title: "Character templates", count: 3 },
  ],
};
