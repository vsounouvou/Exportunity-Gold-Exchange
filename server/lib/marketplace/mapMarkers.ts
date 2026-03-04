import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { mapMarkerStyles } from "@db/schema";

export type MarkerIconType = "lucide" | "emoji" | "svg" | "image_url";

export type MarkerStyleSeed = {
  key: string;
  label: string;
  iconType: MarkerIconType;
  iconValue: string;
  color: string;
  size: number;
  zIndex: number;
  isActive: boolean;
};

const SHOP_DEFAULT_STYLE: MarkerStyleSeed = {
  key: "shop_default",
  label: "Shop (Default)",
  iconType: "emoji",
  iconValue: "🏪",
  color: "#111827",
  size: 28,
  zIndex: 10,
  isActive: true,
};

export const DEFAULT_MAP_MARKER_STYLES: MarkerStyleSeed[] = [
  SHOP_DEFAULT_STYLE,
  { key: "groceries", label: "Groceries", iconType: "emoji", iconValue: "🛒", color: "#16a34a", size: 28, zIndex: 11, isActive: true },
  { key: "restaurants", label: "Restaurants", iconType: "emoji", iconValue: "🍲", color: "#f97316", size: 28, zIndex: 11, isActive: true },
  { key: "fashion", label: "Fashion", iconType: "emoji", iconValue: "👗", color: "#db2777", size: 28, zIndex: 11, isActive: true },
  { key: "beauty", label: "Beauty", iconType: "emoji", iconValue: "🧴", color: "#a855f7", size: 28, zIndex: 11, isActive: true },
  { key: "electronics", label: "Electronics", iconType: "emoji", iconValue: "📺", color: "#2563eb", size: 28, zIndex: 11, isActive: true },
  { key: "phones", label: "Phones", iconType: "emoji", iconValue: "📱", color: "#0ea5e9", size: 28, zIndex: 11, isActive: true },
  { key: "home", label: "Home & Decor", iconType: "emoji", iconValue: "🏠", color: "#059669", size: 28, zIndex: 11, isActive: true },
  { key: "pharmacy", label: "Pharmacy", iconType: "emoji", iconValue: "💊", color: "#ef4444", size: 28, zIndex: 11, isActive: true },
  { key: "building", label: "Building", iconType: "emoji", iconValue: "🧱", color: "#b45309", size: 28, zIndex: 11, isActive: true },
  { key: "auto", label: "Auto & Moto", iconType: "emoji", iconValue: "🚗", color: "#374151", size: 28, zIndex: 11, isActive: true },
];

export const LEGACY_DEFAULT_MAP_MARKER_STYLE_KEYS = new Set(
  DEFAULT_MAP_MARKER_STYLES.map((style) => style.key).filter((key) => key !== SHOP_DEFAULT_STYLE.key),
);

export function normalizeMarkerStyleKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function upsertDefaultMapMarkerStyles(tenantId: number) {
  const seedMode = String(process.env.MAP_MARKER_DEFAULT_SEED_MODE || "shop_only")
    .trim()
    .toLowerCase();
  const seedFullDefaults = seedMode === "all" || seedMode === "full" || process.env.MAP_MARKER_SEED_FULL_DEFAULTS === "true";
  const seeds = seedFullDefaults ? DEFAULT_MAP_MARKER_STYLES : [SHOP_DEFAULT_STYLE];

  for (const style of seeds) {
    const existing = await db.query.mapMarkerStyles.findFirst({
      where: and(eq(mapMarkerStyles.tenantId, tenantId), eq(mapMarkerStyles.key, style.key)),
    });

    if (existing) continue;

    await db.insert(mapMarkerStyles).values({
      tenantId,
      key: style.key,
      label: style.label,
      iconType: style.iconType,
      iconValue: style.iconValue,
      color: style.color,
      size: style.size,
      zIndex: style.zIndex,
      isActive: style.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  }
}
