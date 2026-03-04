import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@db";
import { bureauDAchat, eceSessions, eceUsers, goldOffers, sellers } from "@db/schema";
import {
  seedBureauDAchat,
  seedBureauxAsSellers,
  seedDubaiDealers,
  seedDubaiDealersAsSellers,
} from "./seed-bureau-data";
import { seedGoldMinesAsSellers } from "./seed-gold-mines";
import { seedJewelryStoresAsSellers, seedRetailGoldSellersAsSellers } from "./seed-retail-market";

export type DemoCredentials = {
  admin: { email: string; password: string };
  users: Array<{ email: string; password: string; roles: string[] }>;
};

function getArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

export async function seedDemoUsers(): Promise<DemoCredentials> {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@exportunity.local").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  const demoUsers = [
    { email: adminEmail, password: adminPassword, roles: ["admin", "buyer", "supplier", "shareholder"], permissions: ["*"], currentMode: "admin", buyerType: "retail" },
    { email: "buyer.retail@exportunity.local", password: "Test123!", roles: ["buyer"], permissions: [], currentMode: "buyer", buyerType: "retail" },
    { email: "buyer.wholesale@exportunity.local", password: "Test123!", roles: ["buyer"], permissions: [], currentMode: "buyer", buyerType: "wholesale" },
    { email: "supplier1@exportunity.local", password: "Test123!", roles: ["supplier"], permissions: ["manage_products", "manage_orders"], currentMode: "supplier", buyerType: "retail" },
    { email: "shareholder1@exportunity.local", password: "Test123!", roles: ["shareholder"], permissions: ["view_financials"], currentMode: "shareholder", buyerType: "retail" },
  ] as const;

  const createdOrExisting: Array<{ email: string; password: string; roles: string[] }> = [];

  for (const u of demoUsers) {
    const existing = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.email, u.email),
    });

    if (existing) {
      createdOrExisting.push({ email: u.email, password: u.password, roles: [...u.roles] });
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, 10);
    await db.insert(eceUsers).values({
      email: u.email,
      passwordHash,
      displayName: u.email.split("@")[0],
      role: u.roles[0] as any,
      roles: [...u.roles] as any,
      permissions: [...u.permissions] as any,
      isActive: true,
      emailVerified: true,
      currentMode: u.currentMode as any,
      buyerType: (u as any).buyerType,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: { seeded: true },
    });

    createdOrExisting.push({ email: u.email, password: u.password, roles: [...u.roles] });
  }

  return {
    admin: { email: adminEmail, password: adminPassword },
    users: createdOrExisting,
  };
}

export async function seedGoldOffersForBureaux(options?: { offersPerBureau?: number }) {
  const offersPerBureau = options?.offersPerBureau ?? 3;
  const bureaus = await db.select().from(bureauDAchat);

  let offersCreated = 0;
  for (const bureau of bureaus) {
    const existing = await db.query.goldOffers.findFirst({
      where: eq(goldOffers.bureauId, bureau.id),
    });
    if (existing) continue;

    for (let i = 0; i < offersPerBureau; i++) {
      const weightGrams = (Math.floor(Math.random() * 1500) + 250).toFixed(4);
      const purityCarat = (Math.random() > 0.6 ? 22 : 24).toFixed(2);
      const fineWeightGrams = (
        parseFloat(weightGrams) * (parseFloat(purityCarat) / 24)
      ).toFixed(4);

      const pricePerGramUsd = (82 + Math.random() * 10).toFixed(4);
      const discountPercent = (Math.random() * 3).toFixed(2);

      await db.insert(goldOffers).values({
        tenantId: bureau.tenantId,
        bureauId: bureau.id,
        weightGrams,
        purityCarat,
        fineWeightGrams,
        pricePerGramUsd,
        discountPercent,
        productionType: "artisanal",
        sourceRegion: bureau.city,
        batchId: `BATCH-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
        photos: [],
        isAvailable: true,
        metadata: { seeded: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      offersCreated++;
    }
  }

  return { offersCreated, bureaus: bureaus.length };
}

export async function seedDemoData() {
  const pointsFile = process.env.SEED_GPS_POINTS_FILE || getArgValue("--gps");

  const credentials = await seedDemoUsers();

  await seedBureauDAchat();
  await seedBureauxAsSellers();
  await seedDubaiDealers();
  await seedDubaiDealersAsSellers();
  await seedGoldMinesAsSellers({ pointsFile });
  await seedRetailGoldSellersAsSellers();
  await seedJewelryStoresAsSellers();

  const offers = await seedGoldOffersForBureaux({ offersPerBureau: 3 });

  return { credentials, offers };
}

export async function ensureDemoData() {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.AUTO_SEED === "false") return;

  await seedDemoUsers();

  const anySeller = await db.query.sellers.findFirst();
  const anyBureau = await db.query.bureauDAchat.findFirst();

  // If the core marketplace tables are empty, seed everything.
  if (!anySeller || !anyBureau) {
    await seedDemoData();
    return;
  }

  // Otherwise, only fill missing offer data.
  const anyOffer = await db.query.goldOffers.findFirst();
  if (!anyOffer) {
    await seedGoldOffersForBureaux({ offersPerBureau: 3 });
  }
}

export async function resetDemoData() {
  await db.delete(eceSessions);
  await db
    .delete(eceUsers)
    .where(sql`(${eceUsers.metadata}::text) ILIKE '%"seeded":true%'`);

  await db.execute(sql`DELETE FROM seller_products WHERE seller_id IN (SELECT id FROM sellers WHERE is_demo = true)`);
  await db.delete(sellers).where(eq(sellers.isDemo, true));

  await db.delete(goldOffers);
  // Keep bureau_d_achat rows (they are also used as reference data). Re-seeding is idempotent.
}
