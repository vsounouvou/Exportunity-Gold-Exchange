import "../env";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";

import { db } from "@db";
import { eceUsers, tenants, equipment, equipmentListings } from "@db/schema";

function truthy(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase() === "true";
}

async function resolveTenant() {
  const key = String(process.env.TENANT_KEY || "").trim();
  if (key) {
    const t = await db.query.tenants.findFirst({ where: eq(tenants.key, key) });
    if (t) return t;
    throw new Error(`tenant_not_found:${key}`);
  }
  const first = await db.query.tenants.findFirst();
  if (!first) throw new Error("no_tenants");
  return first;
}

async function ensureEquipmentOwner(tenantId: number) {
  const email = "equipment-owner@demo.local";
  const existing = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) });
  if (existing) return existing;

  const password = "demo1234";
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  const [created] = await db
    .insert(eceUsers)
    .values({
      email,
      passwordHash,
      displayName: "Equipment Owner (Demo)",
      role: "machinery_reseller" as any,
      roles: ["machinery_reseller"] as any,
      permissions: ["manage_equipment"] as any,
      isActive: true,
      emailVerified: true,
      verificationLevel: "BASIC_VERIFIED" as any,
      currentMode: "machinery_reseller" as any,
      buyerType: "wholesale" as any,
      metadata: { seeded: true, tenantId } as any,
      createdAt: now,
      updatedAt: now,
    } as any)
    .returning();

  if (!created) throw new Error("failed_to_create_user");
  return created;
}

const EQUIPMENT_SEED = [
  {
    category: "Excavator 22T (Tracked)",
    make: "CAT",
    model: "320D",
    condition: "refurbished",
    lat: "5.359",
    lng: "-4.008",
    listing: { listingType: "rent", title: "Excavator 22T (Tracked) — refurbished", priceDay: "250000", depositAmount: "1500000" },
  },
  {
    category: "Alluvial Gold Trommel (Wash Plant)",
    make: "EXPERT",
    model: "Trommel-100",
    condition: "new",
    lat: "6.369",
    lng: "2.433",
    listing: { listingType: "sale", title: "Alluvial Gold Trommel — new (built-to-order)", priceSale: "12500000", depositAmount: "2500000" },
  },
  {
    category: "Water Pump (High Flow)",
    make: "Honda",
    model: "WP-3",
    condition: "used",
    lat: "6.497",
    lng: "2.628",
    listing: { listingType: "rent", title: "Water pump — high flow (used)", priceDay: "45000", depositAmount: "250000" },
  },
] as const;

async function ensureEquipmentAndListing(input: {
  tenantId: number;
  ownerUserId: number;
  seed: (typeof EQUIPMENT_SEED)[number];
}) {
  const now = new Date();

  const existingEquipment = await db.query.equipment.findFirst({
    where: and(eq(equipment.tenantId, input.tenantId), eq(equipment.category, input.seed.category)),
  });

  const eqRow =
    existingEquipment ??
    (await db
      .insert(equipment)
      .values({
        tenantId: input.tenantId,
        ownerUserId: input.ownerUserId,
        category: input.seed.category,
        make: input.seed.make,
        model: input.seed.model,
        condition: input.seed.condition as any,
        currentStatus: "available" as any,
        currentLocationLat: input.seed.lat,
        currentLocationLng: input.seed.lng,
        photos: ["/generated-icon.png"],
        documents: { seeded: true },
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning()
      .then((rows) => rows[0]));

  if (!eqRow?.id) return;

  const existingListing = await db.query.equipmentListings.findFirst({
    where: and(eq(equipmentListings.tenantId, input.tenantId), eq(equipmentListings.equipmentId, eqRow.id)),
  });

  if (existingListing) return;

  await db.insert(equipmentListings).values({
    tenantId: input.tenantId,
    equipmentId: eqRow.id,
    listingType: input.seed.listing.listingType as any,
    title: input.seed.listing.title,
    description: "Seeded demo listing for equipment marketplace + rentals.",
    priceDay: (input.seed.listing as any).priceDay ?? null,
    priceSale: (input.seed.listing as any).priceSale ?? null,
    depositAmount: input.seed.listing.depositAmount,
    minRentalDays: 1,
    visibility: "public" as any,
    status: "published" as any,
    createdAt: now,
    updatedAt: now,
  } as any);
}

async function main() {
  if (!truthy(process.env.ALLOW_EQUIPMENT_SEED)) {
    console.error("[seed-equipment-ops-demo] Refusing to run. Set ALLOW_EQUIPMENT_SEED=true to proceed.");
    process.exit(1);
  }

  const isProd = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  const allowProd = process.argv.includes("--allow-production");
  if (isProd && !allowProd) {
    console.error("[seed-equipment-ops-demo] Refusing to run with NODE_ENV=production. Add --allow-production to override.");
    process.exit(1);
  }

  const tenant = await resolveTenant();
  const owner = await ensureEquipmentOwner(tenant.id);

  for (const seed of EQUIPMENT_SEED) {
    await ensureEquipmentAndListing({ tenantId: tenant.id, ownerUserId: owner.id, seed });
  }

  console.log(
    [
      "",
      "[seed-equipment-ops-demo] Done.",
      `- tenant: ${tenant.key} (id=${tenant.id})`,
      `- equipment: ${EQUIPMENT_SEED.length}`,
      `- owner email: equipment-owner@demo.local (password: demo1234)`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error("[seed-equipment-ops-demo] Failed:", err);
  process.exit(1);
});
