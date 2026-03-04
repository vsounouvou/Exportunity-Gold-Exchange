import type { PlatformModuleKey } from "../types";

export const zoneModulesEnabled: PlatformModuleKey[] = [
  "products",
  "collections",
  "cart",
  "checkout",
  "wallet",
  "agents",
  "analytics",
  "map",
  "wholesale",
  "image_gen",
];

export const zoneModulesDisabled: PlatformModuleKey[] = [
  "stories",
  "audio",
  "parent_dashboard",
  "child_profiles",
  "safe_ai_chat",
  "character_creator",
  "print_on_demand",
  "luxury_drops",
  "bulk_quotes",
];
