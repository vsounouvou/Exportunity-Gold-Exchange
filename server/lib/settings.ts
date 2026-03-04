import { db } from "@db";
import { websiteSettings } from "@db/schema";
import { and, eq, ilike, sql } from "drizzle-orm";

type SettingValue = any;

function isMissingTableError(err: unknown) {
  const code = (err as any)?.code;
  const message = String((err as any)?.message || "");
  return code === "42P01" || message.includes("does not exist");
}

export async function getSetting<T = SettingValue>(scope: string, key: string, defaultValue?: T): Promise<T | undefined> {
  try {
    const row = await db.query.websiteSettings.findFirst({
      where: (fields, { and }) => and(eq(websiteSettings.scope, scope), eq(websiteSettings.key, key)),
    });
    if (!row) return defaultValue;
    return (row.value as T) ?? defaultValue;
  } catch (err) {
    if (isMissingTableError(err)) return defaultValue;
    throw err;
  }
}

export async function getSettingsByPrefix<T = Record<string, any>>(scope: string, prefix: string) {
  try {
    const rows = await db
      .select()
      .from(websiteSettings)
      .where(and(eq(websiteSettings.scope, scope), ilike(websiteSettings.key, `${prefix}%`)));
    const result: Record<string, any> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result as T;
  } catch (err) {
    if (isMissingTableError(err)) return {} as T;
    throw err;
  }
}

export async function setSetting(scope: string, key: string, value: SettingValue, updatedBy?: string) {
  try {
    const existing = await db.query.websiteSettings.findFirst({
      where: (fields, { and }) => and(eq(websiteSettings.scope, scope), eq(websiteSettings.key, key)),
    });
    if (existing) {
      await db
        .update(websiteSettings)
        .set({ value, updatedAt: new Date(), updatedBy })
        .where(and(eq(websiteSettings.scope, scope), eq(websiteSettings.key, key)));
    } else {
      await db.insert(websiteSettings).values({
        scope,
        key,
        value,
        updatedAt: new Date(),
        updatedBy,
      });
    }
  } catch (err) {
    if (isMissingTableError(err)) return;
    throw err;
  }
}
