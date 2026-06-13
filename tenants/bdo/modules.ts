import type { PlatformModuleKey } from "../types";

export const bdoModulesEnabled: PlatformModuleKey[] = [
  "products",
  "collections",
  "cart",
  "checkout",
  "wallet",
  "agents",
  "analytics",
  "map",
  "image_gen",
  "wholesale",
  "bulk_quotes",
  "suppliers",
];

export const bdoModulesDisabled: PlatformModuleKey[] = [
  "stories",
  "audio",
  "parent_dashboard",
  "child_profiles",
  "safe_ai_chat",
  "character_creator",
  "print_on_demand",
  "luxury_drops",
];
