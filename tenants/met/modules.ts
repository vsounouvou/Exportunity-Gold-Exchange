import type { PlatformModuleKey } from "../types";

export const metModulesEnabled: PlatformModuleKey[] = [
  "products",
  "collections",
  "cart",
  "checkout",
  "wallet",
  "agents",
  "analytics",
  "bulkQuotes",
  "bulk_quotes",
  "suppliers",
  "image_gen",
];

export const metModulesDisabled: PlatformModuleKey[] = [
  "map",
  "insights",
  "agentsMarketplace",
  "stories",
  "audio",
  "parent_dashboard",
  "child_profiles",
  "safe_ai_chat",
  "character_creator",
  "print_on_demand",
  "luxury_drops",
  "wholesale",
];
