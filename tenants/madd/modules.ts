import type { PlatformModuleKey } from "../types";

export const maddModulesEnabled: PlatformModuleKey[] = [
  "products",
  "collections",
  "cart",
  "checkout",
  "wallet",
  "agents",
  "analytics",
  "stories",
  "audio",
  "safe_ai_chat",
  "character_creator",
  "print_on_demand",
];

export const maddModulesDisabled: PlatformModuleKey[] = [
  "map",
  "wholesale",
  "bulkQuotes",
  "bulk_quotes",
  "suppliers",
  "image_gen",
  "luxuryDrops",
  "luxury_drops",
];
