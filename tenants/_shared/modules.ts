import type { PlatformModuleKey } from "../types";

export const BASE_COMMERCE_MODULES: PlatformModuleKey[] = [
  "products",
  "collections",
  "cart",
  "checkout",
  "wallet",
  "agents",
  "analytics",
  "map",
  "image_gen",
];

export function dedupeModules(modules: PlatformModuleKey[]): PlatformModuleKey[] {
  return Array.from(new Set(modules));
}

export function mergeModules(enabled: PlatformModuleKey[], disabled: PlatformModuleKey[] = []): PlatformModuleKey[] {
  const denied = new Set(disabled);
  return dedupeModules(enabled).filter((moduleKey) => !denied.has(moduleKey));
}
