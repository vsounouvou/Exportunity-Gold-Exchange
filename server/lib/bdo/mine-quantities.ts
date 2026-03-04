import { db } from "@db";
import { sql } from "drizzle-orm";

export type MineType = "artisanal" | "semi_artisanal" | "industrial";

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampMineAvailableKg(valueKg: number, mineType: MineType): number {
  // Spec realism rules:
  // - Artisanal: 0.2–1.8 kg weekly estimate
  // - Semi-artisanal: 1.0–4.5 kg weekly estimate
  // - Never exceed 5 kg on map pins
  if (!Number.isFinite(valueKg)) return mineType === "semi_artisanal" ? 1.2 : 0.6;
  if (mineType === "semi_artisanal") return clamp(valueKg, 1.0, 4.5);
  if (mineType === "industrial") return clamp(valueKg, 1.0, 5.0);
  return clamp(valueKg, 0.2, 1.8);
}

export function computeDefaultAvgWeeklyOutputKg(seed: number, mineType: MineType): number {
  const rnd = mulberry32(seed)();
  if (mineType === "semi_artisanal") return 1.0 + rnd * 3.5; // 1..4.5
  if (mineType === "industrial") return 3.0 + rnd * 2.0; // 3..5 (still clamped on display)
  return 0.2 + rnd * 1.6; // 0.2..1.8
}

export function computeAvailableThisWeekKg(seed: number, mineType: MineType, avgWeeklyOutputKg: number): number {
  const rnd = mulberry32(seed)();
  const factor = 0.6 + rnd * 0.6; // 0.6..1.2
  return clampMineAvailableKg(avgWeeklyOutputKg * factor, mineType);
}

export function inferMineTypeFromText(value: string | null | undefined): MineType {
  const text = String(value || "").toLowerCase();
  if (text.includes("semi-industrial") || text.includes("semi industrial") || text.includes("semi artisanal")) {
    return "semi_artisanal";
  }
  if (text.includes("industrial")) return "industrial";
  return "artisanal";
}

export async function ensureMineQuantityColumns() {
  await db.execute(sql`alter table sellers add column if not exists mine_type text;`);
  await db.execute(sql`alter table sellers add column if not exists avg_weekly_output_kg numeric(10,3);`);
  await db.execute(sql`alter table sellers add column if not exists available_this_week_kg numeric(10,3);`);
  await db.execute(sql`alter table sellers add column if not exists mine_last_updated_at timestamptz;`);
}
