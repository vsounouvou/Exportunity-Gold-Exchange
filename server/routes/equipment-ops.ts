import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@db";
import { and, desc, eq, ilike, or } from "drizzle-orm";

import {
  eceSessions,
  eceUsers,
  equipment,
  equipmentListings,
  equipmentContracts,
  equipmentDeployments,
  maintenanceTickets,
  payoutsLedger,
} from "@db/schema";
import { isChairmanAssistantUser } from "./utils/auth";
import { createWalletTransfer } from "../lib/wallet/transfers";
import { SYSTEM_WALLET_USER_IDS, getOrCreateSystemWalletAccount, getOrCreateWalletAccount } from "../lib/wallet/wallet";

const router = Router();

function requireTenant(req: any, res: Response) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function toInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function toUuid(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^[0-9a-fA-F-]{36}$/.test(raw)) return null;
  return raw;
}

function toXofAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? ""));
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return Number.isFinite(rounded) ? Math.max(0, rounded) : 0;
}

async function verifySession(token?: string) {
  if (!token) return null;
  const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
  return user;
}

async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Authentication required" });
    (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function isAdminUser(user: any) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  const currentMode = user?.currentMode;
  return (
    currentMode === "admin" || roles.includes("admin") || perms.includes("*") || isChairmanAssistantUser(user)
  );
}

function isEquipmentOwnerUser(user: any) {
  const roles = Array.isArray(user?.roles) ? user.roles.map(String) : [];
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  const currentMode = String(user?.currentMode || "");
  return (
    perms.includes("*") ||
    perms.includes("manage_shop") ||
    perms.includes("manage_products") ||
    perms.includes("manage_equipment") ||
    roles.includes("machinery_manufacturer") ||
    roles.includes("machinery_reseller") ||
    roles.includes("seller") ||
    currentMode === "machinery_manufacturer" ||
    currentMode === "machinery_reseller" ||
    currentMode === "seller"
  );
}

async function assertEquipmentAccess(params: { tenantId: number; equipmentId: string; user: any }) {
  const row = await db.query.equipment.findFirst({
    where: and(eq(equipment.id, params.equipmentId as any), eq(equipment.tenantId, params.tenantId)),
  });
  if (!row) throw new Error("equipment_not_found");

  if (isAdminUser(params.user)) return row;
  if (row.ownerUserId && row.ownerUserId === params.user.id) return row;
  throw new Error("forbidden");
}

async function assertListingAccess(params: { tenantId: number; listingId: string; user: any }) {
  const row = await db.query.equipmentListings.findFirst({
    where: and(eq(equipmentListings.id, params.listingId as any), eq(equipmentListings.tenantId, params.tenantId)),
  });
  if (!row) throw new Error("listing_not_found");

  if (isAdminUser(params.user)) return row;

  const eqRow = await db.query.equipment.findFirst({
    where: and(eq(equipment.id, row.equipmentId as any), eq(equipment.tenantId, params.tenantId)),
    columns: { ownerUserId: true },
  });
  if (eqRow?.ownerUserId && eqRow.ownerUserId === params.user.id) return row;
  throw new Error("forbidden");
}

async function assertContractAccess(params: { tenantId: number; contractId: string; user: any }) {
  const row = await db.query.equipmentContracts.findFirst({
    where: and(eq(equipmentContracts.id, params.contractId as any), eq(equipmentContracts.tenantId, params.tenantId)),
  });
  if (!row) throw new Error("contract_not_found");

  if (isAdminUser(params.user)) return row;
  if (row.ownerUserId && row.ownerUserId === params.user.id) return row;
  if (row.clientUserId && row.clientUserId === params.user.id) return row;
  throw new Error("forbidden");
}

// ======================
// Equipment CRUD (Pro)
// ======================

router.get("/equipment", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const limit = Math.min(200, Math.max(1, toInt(req.query.limit) ?? 50));
    const offset = Math.max(0, toInt(req.query.offset) ?? 0);

    const where = and(
      eq(equipment.tenantId, tenant.id),
      isAdminUser(user) ? undefined : eq(equipment.ownerUserId, user.id),
    );

    const rows = await db
      .select()
      .from(equipment)
      .where(where)
      .orderBy(desc(equipment.updatedAt), desc(equipment.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ equipment: rows, limit, offset });
  } catch {
    res.status(500).json({ message: "Failed to load equipment" });
  }
});

router.post("/equipment", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const user = req.user;
    if (!isEquipmentOwnerUser(user) && !isAdminUser(user)) {
      return res.status(403).json({ message: "Pro access required" });
    }

    const category = String(req.body?.category || "").trim();
    if (!category) return res.status(400).json({ message: "category is required" });

    const now = new Date();
    const [created] = await db
      .insert(equipment)
      .values({
        tenantId: tenant.id,
        ownerUserId: user.id,
        ownerOrgId: req.body?.ownerOrgId ? toInt(req.body.ownerOrgId) : null,
        category,
        make: req.body?.make ? String(req.body.make) : null,
        model: req.body?.model ? String(req.body.model) : null,
        year: req.body?.year ? toInt(req.body.year) : null,
        serialNumber: req.body?.serialNumber ? String(req.body.serialNumber) : null,
        condition: req.body?.condition ? String(req.body.condition) : "used",
        currentStatus: req.body?.currentStatus ? String(req.body.currentStatus) : "available",
        currentLocationLat: req.body?.currentLocationLat ? String(req.body.currentLocationLat) : null,
        currentLocationLng: req.body?.currentLocationLng ? String(req.body.currentLocationLng) : null,
        currentRegionId: req.body?.currentRegionId ? toInt(req.body.currentRegionId) : null,
        currentCountryId: req.body?.currentCountryId ? toInt(req.body.currentCountryId) : null,
        photos: Array.isArray(req.body?.photos) ? req.body.photos.map(String) : [],
        documents: req.body?.documents && typeof req.body.documents === "object" ? req.body.documents : {},
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    res.status(201).json({ ok: true, equipment: created });
  } catch {
    res.status(500).json({ message: "Failed to create equipment" });
  }
});

router.get("/equipment/:id", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const equipmentId = toUuid(req.params.id);
    if (!equipmentId) return res.status(400).json({ message: "Invalid id" });

    const row = await assertEquipmentAccess({ tenantId: tenant.id, equipmentId, user });
    res.json({ equipment: row });
  } catch (error: any) {
    if (error?.message === "equipment_not_found") return res.status(404).json({ message: "Equipment not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to load equipment" });
  }
});

router.patch("/equipment/:id", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const equipmentId = toUuid(req.params.id);
    if (!equipmentId) return res.status(400).json({ message: "Invalid id" });

    await assertEquipmentAccess({ tenantId: tenant.id, equipmentId, user });

    const allowed = [
      "category",
      "make",
      "model",
      "year",
      "serialNumber",
      "condition",
      "currentStatus",
      "currentLocationLat",
      "currentLocationLng",
      "currentRegionId",
      "currentCountryId",
      "photos",
      "documents",
    ] as const;

    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (key in (req.body || {})) {
        const val = req.body?.[key];
        if (key === "photos") {
          updates.photos = Array.isArray(val) ? val.map(String) : [];
        } else if (key === "documents") {
          updates.documents = val && typeof val === "object" ? val : {};
        } else if (key === "year" || key.endsWith("Id")) {
          updates[key] = val == null ? null : toInt(val);
        } else if (key.endsWith("Lat") || key.endsWith("Lng")) {
          updates[key] = val == null ? null : String(val);
        } else {
          updates[key] = val == null ? null : String(val);
        }
      }
    }

    updates.updatedAt = new Date();

    const [updated] = await db
      .update(equipment)
      .set(updates)
      .where(and(eq(equipment.tenantId, tenant.id), eq(equipment.id, equipmentId as any)))
      .returning();

    res.json({ ok: true, equipment: updated });
  } catch (error: any) {
    if (error?.message === "equipment_not_found") return res.status(404).json({ message: "Equipment not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to update equipment" });
  }
});

// ======================
// Listings
// ======================

router.get("/equipment-listings", async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const limit = Math.min(200, Math.max(1, toInt(req.query.limit) ?? 30));
    const offset = Math.max(0, toInt(req.query.offset) ?? 0);
    const q = String(req.query.q || "").trim();

    const token = String(req.headers.authorization || "").replace("Bearer ", "").trim();
    const user = token ? await verifySession(token) : null;
    const canAdmin = user ? isAdminUser(user) : false;
    const canOwner = user ? isEquipmentOwnerUser(user) : false;

    const listingType = String(req.query.listingType || "").trim();
    const category = String(req.query.category || "").trim();
    const condition = String(req.query.condition || "").trim();
    const status = String(req.query.status || "").trim();
    const visibility = String(req.query.visibility || "").trim();

    const statusClause = canAdmin
      ? status && status !== "all"
        ? eq(equipmentListings.status, status as any)
        : undefined
      : canOwner
        ? status && status !== "all"
          ? eq(equipmentListings.status, status as any)
          : undefined
        : eq(equipmentListings.status, "published" as any);

    const visibilityClause = canAdmin
      ? visibility && visibility !== "all"
        ? eq(equipmentListings.visibility, visibility as any)
        : undefined
      : canOwner
        ? visibility && visibility !== "all"
          ? eq(equipmentListings.visibility, visibility as any)
          : undefined
        : eq(equipmentListings.visibility, "public" as any);

    const where = and(
      eq(equipmentListings.tenantId, tenant.id),
      statusClause,
      listingType ? eq(equipmentListings.listingType, listingType as any) : undefined,
      visibilityClause,
      q ? ilike(equipmentListings.title, `%${q}%`) : undefined,
    );

    const rows = await db
      .select({
        listing: equipmentListings,
        equipment: equipment,
        owner: {
          id: eceUsers.id,
          displayName: eceUsers.displayName,
        },
      })
      .from(equipmentListings)
      .leftJoin(equipment, and(eq(equipmentListings.equipmentId, equipment.id), eq(equipment.tenantId, tenant.id)))
      .leftJoin(eceUsers, eq(equipment.ownerUserId, eceUsers.id))
      .where(
        and(
          where,
          canAdmin ? undefined : canOwner && user ? eq(equipment.ownerUserId, user.id) : undefined,
          category ? eq(equipment.category, category) : undefined,
          condition ? eq(equipment.condition, condition as any) : undefined,
        ),
      )
      .orderBy(desc(equipmentListings.updatedAt), desc(equipmentListings.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      listings: rows.map((r) => ({
        ...r.listing,
        equipment: r.equipment?.id ? r.equipment : null,
        owner: r.owner?.id ? r.owner : null,
      })),
      limit,
      offset,
      nextOffset: offset + rows.length,
    });
  } catch {
    res.status(500).json({ message: "Failed to load listings" });
  }
});

router.post("/equipment-listings", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const user = req.user;
    if (!isEquipmentOwnerUser(user) && !isAdminUser(user)) {
      return res.status(403).json({ message: "Pro access required" });
    }

    const equipmentId = toUuid(req.body?.equipmentId);
    if (!equipmentId) return res.status(400).json({ message: "equipmentId is required" });
    await assertEquipmentAccess({ tenantId: tenant.id, equipmentId, user });

    const listingType = String(req.body?.listingType || "").trim();
    if (!listingType) return res.status(400).json({ message: "listingType is required" });
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const now = new Date();
    const [created] = await db
      .insert(equipmentListings)
      .values({
        tenantId: tenant.id,
        equipmentId,
        listingType: listingType as any,
        title,
        description: req.body?.description ? String(req.body.description) : null,
        priceSale: req.body?.priceSale != null ? String(req.body.priceSale) : null,
        priceDay: req.body?.priceDay != null ? String(req.body.priceDay) : null,
        priceWeek: req.body?.priceWeek != null ? String(req.body.priceWeek) : null,
        priceMonth: req.body?.priceMonth != null ? String(req.body.priceMonth) : null,
        depositAmount: req.body?.depositAmount != null ? String(req.body.depositAmount) : "0",
        minRentalDays: req.body?.minRentalDays != null ? Math.max(1, toInt(req.body.minRentalDays) ?? 1) : 1,
        includedHoursPerDay: req.body?.includedHoursPerDay != null ? toInt(req.body.includedHoursPerDay) : null,
        overtimeRate: req.body?.overtimeRate != null ? String(req.body.overtimeRate) : null,
        deliverySupported: Boolean(req.body?.deliverySupported),
        deliveryRadiusKm: req.body?.deliveryRadiusKm != null ? toInt(req.body.deliveryRadiusKm) : null,
        operatorIncluded: Boolean(req.body?.operatorIncluded),
        operatorDailyCost: req.body?.operatorDailyCost != null ? String(req.body.operatorDailyCost) : null,
        availabilityCalendar:
          req.body?.availabilityCalendar && typeof req.body.availabilityCalendar === "object"
            ? req.body.availabilityCalendar
            : {},
        visibility: req.body?.visibility ? String(req.body.visibility) : "public",
        status: req.body?.status ? String(req.body.status) : "draft",
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    res.status(201).json({ ok: true, listing: created });
  } catch (error: any) {
    if (error?.message === "equipment_not_found") return res.status(404).json({ message: "Equipment not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to create listing" });
  }
});

router.patch("/equipment-listings/:id", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const user = req.user;
    const listingId = toUuid(req.params.id);
    if (!listingId) return res.status(400).json({ message: "Invalid id" });

    await assertListingAccess({ tenantId: tenant.id, listingId, user });

    const allowed = [
      "listingType",
      "title",
      "description",
      "priceSale",
      "priceDay",
      "priceWeek",
      "priceMonth",
      "depositAmount",
      "minRentalDays",
      "includedHoursPerDay",
      "overtimeRate",
      "deliverySupported",
      "deliveryRadiusKm",
      "operatorIncluded",
      "operatorDailyCost",
      "availabilityCalendar",
      "visibility",
      "status",
    ] as const;

    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (key in (req.body || {})) {
        const val = req.body?.[key];
        if (key === "minRentalDays" || key === "includedHoursPerDay" || key === "deliveryRadiusKm") {
          updates[key] = val == null ? null : toInt(val);
        } else if (key === "deliverySupported" || key === "operatorIncluded") {
          updates[key] = Boolean(val);
        } else if (key === "availabilityCalendar") {
          updates[key] = val && typeof val === "object" ? val : {};
        } else {
          updates[key] = val == null ? null : String(val);
        }
      }
    }
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(equipmentListings)
      .set(updates)
      .where(and(eq(equipmentListings.tenantId, tenant.id), eq(equipmentListings.id, listingId as any)))
      .returning();

    res.json({ ok: true, listing: updated });
  } catch (error: any) {
    if (error?.message === "listing_not_found") return res.status(404).json({ message: "Listing not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to update listing" });
  }
});

router.post("/equipment-listings/:id/publish", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;
    const listingId = toUuid(req.params.id);
    if (!listingId) return res.status(400).json({ message: "Invalid id" });

    await assertListingAccess({ tenantId: tenant.id, listingId, user });

    const [updated] = await db
      .update(equipmentListings)
      .set({ status: "published" as any, updatedAt: new Date() })
      .where(and(eq(equipmentListings.tenantId, tenant.id), eq(equipmentListings.id, listingId as any)))
      .returning();

    res.json({ ok: true, listing: updated });
  } catch (error: any) {
    if (error?.message === "listing_not_found") return res.status(404).json({ message: "Listing not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to publish listing" });
  }
});

router.post("/equipment-listings/:id/pause", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;
    const listingId = toUuid(req.params.id);
    if (!listingId) return res.status(400).json({ message: "Invalid id" });

    await assertListingAccess({ tenantId: tenant.id, listingId, user });

    const [updated] = await db
      .update(equipmentListings)
      .set({ status: "paused" as any, updatedAt: new Date() })
      .where(and(eq(equipmentListings.tenantId, tenant.id), eq(equipmentListings.id, listingId as any)))
      .returning();

    res.json({ ok: true, listing: updated });
  } catch (error: any) {
    if (error?.message === "listing_not_found") return res.status(404).json({ message: "Listing not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to pause listing" });
  }
});

// ======================
// Contracts + deployments
// ======================

router.get("/equipment-contracts", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const limit = Math.min(200, Math.max(1, toInt(req.query.limit) ?? 50));
    const offset = Math.max(0, toInt(req.query.offset) ?? 0);

    const where = and(
      eq(equipmentContracts.tenantId, tenant.id),
      isAdminUser(user)
        ? undefined
        : or(eq(equipmentContracts.ownerUserId, user.id), eq(equipmentContracts.clientUserId, user.id)),
    );

    const rows = await db
      .select()
      .from(equipmentContracts)
      .where(where)
      .orderBy(desc(equipmentContracts.updatedAt), desc(equipmentContracts.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ contracts: rows, limit, offset });
  } catch {
    res.status(500).json({ message: "Failed to load contracts" });
  }
});

router.post("/equipment-contracts", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const listingId = toUuid(req.body?.listingId);
    if (!listingId) return res.status(400).json({ message: "listingId is required" });

    const listing = await db.query.equipmentListings.findFirst({
      where: and(eq(equipmentListings.id, listingId as any), eq(equipmentListings.tenantId, tenant.id)),
    });
    if (!listing) return res.status(404).json({ message: "Listing not found" });
    if (listing.status !== "published") return res.status(400).json({ message: "Listing is not available" });

    const eqRow = await db.query.equipment.findFirst({
      where: and(eq(equipment.id, listing.equipmentId as any), eq(equipment.tenantId, tenant.id)),
    });
    if (!eqRow) return res.status(404).json({ message: "Equipment not found" });

    const contractType = String(req.body?.contractType || "").trim();
    if (!contractType) return res.status(400).json({ message: "contractType is required" });

    const startDate = req.body?.startDate ? new Date(String(req.body.startDate)) : null;
    const endDate = req.body?.endDate ? new Date(String(req.body.endDate)) : null;
    if (contractType === "rental") {
      if (!startDate || Number.isNaN(startDate.getTime())) {
        return res.status(400).json({ message: "startDate is required" });
      }
      if (!endDate || Number.isNaN(endDate.getTime())) {
        return res.status(400).json({ message: "endDate is required" });
      }
    }

    const siteLat = req.body?.siteLat != null ? String(req.body.siteLat) : null;
    const siteLng = req.body?.siteLng != null ? String(req.body.siteLng) : null;
    const siteId = req.body?.siteId ? String(req.body.siteId) : null;

    if (contractType === "rental" && (!siteLat || !siteLng)) {
      return res.status(400).json({ message: "siteLat/siteLng are required for rentals" });
    }

    const now = new Date();

    const created = await db.transaction(async (tx) => {
      const [contract] = await tx
        .insert(equipmentContracts)
        .values({
          tenantId: tenant.id,
          contractType: contractType as any,
          listingId,
          equipmentId: eqRow.id,
          clientUserId: user.id,
          ownerUserId: eqRow.ownerUserId,
          ownerOrgId: eqRow.ownerOrgId,
          startDate: startDate || null,
          endDate: endDate || null,
          pricingSummary:
            req.body?.pricingSummary && typeof req.body.pricingSummary === "object" ? req.body.pricingSummary : {},
          depositAmount: listing.depositAmount ?? "0",
          escrowStatus: "none" as any,
          paymentStatus: "unpaid" as any,
          contractStatus: "pending" as any,
          eSignStatus: "pending" as any,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!contract) throw new Error("create_failed");

      const [deployment] = await tx
        .insert(equipmentDeployments)
        .values({
          tenantId: tenant.id,
          contractId: contract.id,
          siteId,
          siteLat,
          siteLng,
          dispatchStatus: "scheduled" as any,
          returnStatus: "not_due" as any,
          checklists: {},
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return { contract, deployment };
    });

    res.status(201).json({ ok: true, ...created });
  } catch {
    res.status(500).json({ message: "Failed to create contract" });
  }
});

router.post("/equipment-deployments", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const contractId = toUuid(req.body?.contractId);
    if (!contractId) return res.status(400).json({ message: "contractId is required" });

    const contract = await assertContractAccess({ tenantId: tenant.id, contractId, user });
    if (!isAdminUser(user) && contract.ownerUserId !== user.id) {
      return res.status(403).json({ message: "Only the owner can create deployments" });
    }

    const siteLat = req.body?.siteLat != null ? String(req.body.siteLat) : null;
    const siteLng = req.body?.siteLng != null ? String(req.body.siteLng) : null;
    const siteId = req.body?.siteId ? String(req.body.siteId) : null;

    const now = new Date();
    const existing = await db.query.equipmentDeployments.findFirst({
      where: and(eq(equipmentDeployments.tenantId, tenant.id), eq(equipmentDeployments.contractId, contractId as any)),
    });

    if (existing?.id) {
      const [updated] = await db
        .update(equipmentDeployments)
        .set({ siteId, siteLat, siteLng, updatedAt: now })
        .where(and(eq(equipmentDeployments.tenantId, tenant.id), eq(equipmentDeployments.id, existing.id as any)))
        .returning();
      return res.json({ ok: true, deployment: updated });
    }

    const [created] = await db
      .insert(equipmentDeployments)
      .values({
        tenantId: tenant.id,
        contractId,
        siteId,
        siteLat,
        siteLng,
        dispatchStatus: "scheduled" as any,
        returnStatus: "not_due" as any,
        checklists: {},
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, deployment: created });
  } catch (error: any) {
    if (error?.message === "contract_not_found") return res.status(404).json({ message: "Contract not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to create deployment" });
  }
});

router.post("/equipment-contracts/:id/accept", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;
    const contractId = toUuid(req.params.id);
    if (!contractId) return res.status(400).json({ message: "Invalid id" });

    const contract = await assertContractAccess({ tenantId: tenant.id, contractId, user });
    if (!contract.ownerUserId || contract.ownerUserId !== user.id) {
      return res.status(403).json({ message: "Only the owner can accept" });
    }

    const now = new Date();
    const [updated] = await db
      .update(equipmentContracts)
      .set({ contractStatus: "active" as any, updatedAt: now })
      .where(and(eq(equipmentContracts.tenantId, tenant.id), eq(equipmentContracts.id, contractId as any)))
      .returning();

    if (updated?.equipmentId) {
      await db
        .update(equipment)
        .set({ currentStatus: "reserved" as any, updatedAt: now })
        .where(and(eq(equipment.tenantId, tenant.id), eq(equipment.id, updated.equipmentId as any)));
    }

    res.json({ ok: true, contract: updated });
  } catch (error: any) {
    if (error?.message === "contract_not_found") return res.status(404).json({ message: "Contract not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to accept contract" });
  }
});

router.post("/equipment-contracts/:id/cancel", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;
    const contractId = toUuid(req.params.id);
    if (!contractId) return res.status(400).json({ message: "Invalid id" });

    await assertContractAccess({ tenantId: tenant.id, contractId, user });

    const now = new Date();
    const [updated] = await db
      .update(equipmentContracts)
      .set({ contractStatus: "cancelled" as any, updatedAt: now })
      .where(and(eq(equipmentContracts.tenantId, tenant.id), eq(equipmentContracts.id, contractId as any)))
      .returning();

    let contract = updated;
    let escrowTransfer: any = null;

    if (contract?.escrowStatus === "holding") {
      const depositAmount = toXofAmount(contract.depositAmount);
      if (depositAmount > 0) {
        const escrowWallet = await getOrCreateSystemWalletAccount(SYSTEM_WALLET_USER_IDS.equipmentEscrow);

        const summary = contract.pricingSummary && typeof contract.pricingSummary === "object" ? contract.pricingSummary : {};
        const escrowMeta = summary && typeof (summary as any).escrow === "object" ? (summary as any).escrow : {};

        let renterWalletId = toUuid((escrowMeta as any)?.clientWalletAccountId);
        if (!renterWalletId && contract.clientUserId) {
          const renter = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, contract.clientUserId) });
          if (renter?.email) {
            const wallet = await getOrCreateWalletAccount(String(renter.email));
            renterWalletId = wallet.id;
          }
        }
        if (!renterWalletId && user?.email) {
          const wallet = await getOrCreateWalletAccount(String(user.email));
          renterWalletId = wallet.id;
        }
        if (!renterWalletId) throw new Error("missing_renter_wallet");

        escrowTransfer = await createWalletTransfer({
          fromWalletAccountId: escrowWallet.id,
          toWalletAccountId: renterWalletId,
          amount: depositAmount,
          memo: `Equipment escrow auto-release (cancel ${contractId})`,
          metadata: { tenantId: tenant.id, contractId, kind: "equipment_deposit_escrow_auto_release_cancel" },
        });

        const nextSummary = {
          ...summary,
          escrow: {
            ...escrowMeta,
            releaseTransferId: escrowTransfer.transfer.id,
            releasedAmount: depositAmount,
            releasedAt: new Date().toISOString(),
            autoReleasedReason: "cancel",
          },
        };

        const [released] = await db
          .update(equipmentContracts)
          .set({ escrowStatus: "released" as any, pricingSummary: nextSummary, updatedAt: new Date() })
          .where(and(eq(equipmentContracts.tenantId, tenant.id), eq(equipmentContracts.id, contractId as any)))
          .returning();

        contract = released ?? contract;
      }
    }

    res.json({ ok: true, contract, escrowTransfer });
  } catch (error: any) {
    if (error?.message === "contract_not_found") return res.status(404).json({ message: "Contract not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    if (error?.message === "missing_renter_wallet") return res.status(400).json({ message: "Missing renter wallet" });
    res.status(500).json({ message: "Failed to cancel contract" });
  }
});

router.post("/equipment-contracts/:id/sign", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;
    const contractId = toUuid(req.params.id);
    if (!contractId) return res.status(400).json({ message: "Invalid id" });

    await assertContractAccess({ tenantId: tenant.id, contractId, user });

    const now = new Date();
    const [updated] = await db
      .update(equipmentContracts)
      .set({ eSignStatus: "signed" as any, updatedAt: now })
      .where(and(eq(equipmentContracts.tenantId, tenant.id), eq(equipmentContracts.id, contractId as any)))
      .returning();

    res.json({ ok: true, contract: updated });
  } catch (error: any) {
    if (error?.message === "contract_not_found") return res.status(404).json({ message: "Contract not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to sign contract" });
  }
});

router.post("/equipment-deployments/:id/confirm-delivery", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;
    const deploymentId = toUuid(req.params.id);
    if (!deploymentId) return res.status(400).json({ message: "Invalid id" });

    const deployment = await db.query.equipmentDeployments.findFirst({
      where: and(eq(equipmentDeployments.id, deploymentId as any), eq(equipmentDeployments.tenantId, tenant.id)),
    });
    if (!deployment) return res.status(404).json({ message: "Deployment not found" });

    const contract = await assertContractAccess({ tenantId: tenant.id, contractId: deployment.contractId as any, user });
    if (!isAdminUser(user) && contract.ownerUserId !== user.id) {
      return res.status(403).json({ message: "Only the owner can confirm delivery" });
    }

    const now = new Date();
    const [updated] = await db
      .update(equipmentDeployments)
      .set({
        dispatchStatus: "delivered" as any,
        deliveredAt: now,
        updatedAt: now,
      })
      .where(and(eq(equipmentDeployments.tenantId, tenant.id), eq(equipmentDeployments.id, deploymentId as any)))
      .returning();

    if (contract.equipmentId) {
      await db
        .update(equipment)
        .set({
          currentStatus: "deployed" as any,
          currentLocationLat: updated?.siteLat ?? null,
          currentLocationLng: updated?.siteLng ?? null,
          updatedAt: now,
        })
        .where(and(eq(equipment.tenantId, tenant.id), eq(equipment.id, contract.equipmentId as any)));
    }

    res.json({ ok: true, deployment: updated });
  } catch (error: any) {
    if (error?.message === "contract_not_found") return res.status(404).json({ message: "Contract not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to confirm delivery" });
  }
});

router.post("/equipment-deployments/:id/confirm-return", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;
    const deploymentId = toUuid(req.params.id);
    if (!deploymentId) return res.status(400).json({ message: "Invalid id" });

    const deployment = await db.query.equipmentDeployments.findFirst({
      where: and(eq(equipmentDeployments.id, deploymentId as any), eq(equipmentDeployments.tenantId, tenant.id)),
    });
    if (!deployment) return res.status(404).json({ message: "Deployment not found" });

    const contract = await assertContractAccess({ tenantId: tenant.id, contractId: deployment.contractId as any, user });
    if (!isAdminUser(user) && contract.ownerUserId !== user.id && contract.clientUserId !== user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const now = new Date();
    const [updated] = await db
      .update(equipmentDeployments)
      .set({
        returnStatus: "returned" as any,
        returnedAt: now,
        updatedAt: now,
      })
      .where(and(eq(equipmentDeployments.tenantId, tenant.id), eq(equipmentDeployments.id, deploymentId as any)))
      .returning();

    if (contract.equipmentId) {
      await db
        .update(equipment)
        .set({
          currentStatus: "available" as any,
          updatedAt: now,
        })
        .where(and(eq(equipment.tenantId, tenant.id), eq(equipment.id, contract.equipmentId as any)));
    }

    let contractRow = contract;
    let escrowTransfer: any = null;

    if (contractRow?.escrowStatus === "holding") {
      const depositAmount = toXofAmount(contractRow.depositAmount);
      if (depositAmount > 0) {
        const escrowWallet = await getOrCreateSystemWalletAccount(SYSTEM_WALLET_USER_IDS.equipmentEscrow);

        const summary =
          contractRow.pricingSummary && typeof contractRow.pricingSummary === "object" ? contractRow.pricingSummary : {};
        const escrowMeta =
          summary && typeof (summary as any).escrow === "object" ? (summary as any).escrow : {};

        let renterWalletId = toUuid((escrowMeta as any)?.clientWalletAccountId);
        if (!renterWalletId && contractRow.clientUserId) {
          const renter = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, contractRow.clientUserId) });
          if (renter?.email) {
            const wallet = await getOrCreateWalletAccount(String(renter.email));
            renterWalletId = wallet.id;
          }
        }
        if (!renterWalletId && user?.email) {
          const wallet = await getOrCreateWalletAccount(String(user.email));
          renterWalletId = wallet.id;
        }
        if (renterWalletId) {
          escrowTransfer = await createWalletTransfer({
            fromWalletAccountId: escrowWallet.id,
            toWalletAccountId: renterWalletId,
            amount: depositAmount,
            memo: `Equipment escrow auto-release (return ${contractRow.id})`,
            metadata: { tenantId: tenant.id, contractId: contractRow.id, kind: "equipment_deposit_escrow_auto_release_return" },
          });

          const nextSummary = {
            ...summary,
            escrow: {
              ...escrowMeta,
              releaseTransferId: escrowTransfer.transfer.id,
              releasedAmount: depositAmount,
              releasedAt: new Date().toISOString(),
              autoReleasedReason: "return",
            },
          };

          const [released] = await db
            .update(equipmentContracts)
            .set({ escrowStatus: "released" as any, pricingSummary: nextSummary, updatedAt: new Date() })
            .where(and(eq(equipmentContracts.tenantId, tenant.id), eq(equipmentContracts.id, contractRow.id as any)))
            .returning();

          contractRow = released ?? contractRow;
        }
      }
    }

    res.json({ ok: true, deployment: updated, contract: contractRow, escrowTransfer });
  } catch (error: any) {
    if (error?.message === "contract_not_found") return res.status(404).json({ message: "Contract not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to confirm return" });
  }
});

// ======================
// Maintenance
// ======================

router.get("/maintenance-tickets", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const limit = Math.min(200, Math.max(1, toInt(req.query.limit) ?? 50));
    const offset = Math.max(0, toInt(req.query.offset) ?? 0);

    const where = and(
      eq(maintenanceTickets.tenantId, tenant.id),
      isAdminUser(user) ? undefined : eq(equipment.ownerUserId, user.id),
    );

    const rows = await db
      .select({ ticket: maintenanceTickets, equipment })
      .from(maintenanceTickets)
      .leftJoin(equipment, and(eq(maintenanceTickets.equipmentId, equipment.id), eq(equipment.tenantId, tenant.id)))
      .where(where)
      .orderBy(desc(maintenanceTickets.updatedAt), desc(maintenanceTickets.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      tickets: rows.map((r) => ({
        ...r.ticket,
        equipment: r.equipment?.id ? r.equipment : null,
      })),
      limit,
      offset,
    });
  } catch {
    res.status(500).json({ message: "Failed to load tickets" });
  }
});

router.post("/maintenance-tickets", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const equipmentId = toUuid(req.body?.equipmentId);
    if (!equipmentId) return res.status(400).json({ message: "equipmentId is required" });

    await assertEquipmentAccess({ tenantId: tenant.id, equipmentId, user });

    const now = new Date();
    const [created] = await db
      .insert(maintenanceTickets)
      .values({
        tenantId: tenant.id,
        equipmentId,
        deploymentId: req.body?.deploymentId ? toUuid(req.body.deploymentId) : null,
        severity: req.body?.severity ? String(req.body.severity) : "low",
        issueType: req.body?.issueType ? String(req.body.issueType) : null,
        description: req.body?.description ? String(req.body.description) : null,
        photos: Array.isArray(req.body?.photos) ? req.body.photos.map(String) : [],
        status: "open" as any,
        assignedTechId: req.body?.assignedTechId ? toInt(req.body.assignedTechId) : null,
        quoteAmount: null,
        approvedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    res.status(201).json({ ok: true, ticket: created });
  } catch (error: any) {
    if (error?.message === "equipment_not_found") return res.status(404).json({ message: "Equipment not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to create ticket" });
  }
});

router.post("/maintenance-tickets/:id/quote", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Admin/staff required" });

    const ticketId = toUuid(req.params.id);
    if (!ticketId) return res.status(400).json({ message: "Invalid id" });

    const quoteAmount = req.body?.quoteAmount != null ? String(req.body.quoteAmount) : null;
    if (!quoteAmount) return res.status(400).json({ message: "quoteAmount is required" });

    const now = new Date();
    const [updated] = await db
      .update(maintenanceTickets)
      .set({ quoteAmount, status: "quoted" as any, updatedAt: now })
      .where(and(eq(maintenanceTickets.tenantId, tenant.id), eq(maintenanceTickets.id, ticketId as any)))
      .returning();

    res.json({ ok: true, ticket: updated });
  } catch {
    res.status(500).json({ message: "Failed to quote ticket" });
  }
});

router.post("/maintenance-tickets/:id/approve", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const ticketId = toUuid(req.params.id);
    if (!ticketId) return res.status(400).json({ message: "Invalid id" });

    const ticket = await db.query.maintenanceTickets.findFirst({
      where: and(eq(maintenanceTickets.id, ticketId as any), eq(maintenanceTickets.tenantId, tenant.id)),
    });
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    await assertEquipmentAccess({ tenantId: tenant.id, equipmentId: ticket.equipmentId as any, user });

    const now = new Date();
    const [updated] = await db
      .update(maintenanceTickets)
      .set({ status: "approved" as any, approvedAt: now, updatedAt: now })
      .where(and(eq(maintenanceTickets.tenantId, tenant.id), eq(maintenanceTickets.id, ticketId as any)))
      .returning();

    res.json({ ok: true, ticket: updated });
  } catch (error: any) {
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to approve ticket" });
  }
});

router.post("/maintenance-tickets/:id/complete", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;
    if (!isAdminUser(user)) return res.status(403).json({ message: "Admin/staff required" });

    const ticketId = toUuid(req.params.id);
    if (!ticketId) return res.status(400).json({ message: "Invalid id" });

    const now = new Date();
    const [updated] = await db
      .update(maintenanceTickets)
      .set({ status: "done" as any, completedAt: now, updatedAt: now })
      .where(and(eq(maintenanceTickets.tenantId, tenant.id), eq(maintenanceTickets.id, ticketId as any)))
      .returning();

    res.json({ ok: true, ticket: updated });
  } catch {
    res.status(500).json({ message: "Failed to complete ticket" });
  }
});

// ======================
// Payout ledger (stub)
// ======================

router.get("/payouts-ledger", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const limit = Math.min(200, Math.max(1, toInt(req.query.limit) ?? 50));
    const offset = Math.max(0, toInt(req.query.offset) ?? 0);

    const where = and(
      eq(payoutsLedger.tenantId, tenant.id),
      isAdminUser(user) ? undefined : eq(payoutsLedger.ownerUserId, user.id),
    );

    const rows = await db
      .select()
      .from(payoutsLedger)
      .where(where)
      .orderBy(desc(payoutsLedger.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ entries: rows, limit, offset });
  } catch {
    res.status(500).json({ message: "Failed to load payout ledger" });
  }
});

router.post("/payouts-ledger/:id/request-payout", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;
    const id = toUuid(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const entry = await db.query.payoutsLedger.findFirst({
      where: and(eq(payoutsLedger.id, id as any), eq(payoutsLedger.tenantId, tenant.id)),
    });
    if (!entry) return res.status(404).json({ message: "Entry not found" });
    if (!isAdminUser(user) && entry.ownerUserId !== user.id) return res.status(403).json({ message: "Forbidden" });

    const [updated] = await db
      .update(payoutsLedger)
      .set({ payoutStatus: "available" as any })
      .where(and(eq(payoutsLedger.tenantId, tenant.id), eq(payoutsLedger.id, id as any)))
      .returning();

    res.json({ ok: true, entry: updated });
  } catch {
    res.status(500).json({ message: "Failed to request payout" });
  }
});

// ======================
// Payments (Escrow)
// ======================

router.post("/payments/escrow/hold", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const contractId = toUuid(req.body?.contractId);
    if (!contractId) return res.status(400).json({ message: "contractId is required" });

    const contract = await assertContractAccess({ tenantId: tenant.id, contractId, user });
    if (!isAdminUser(user) && contract.clientUserId !== user.id) {
      return res.status(403).json({ message: "Only the renter can hold escrow" });
    }

    if (contract.escrowStatus === "holding") {
      return res.status(409).json({ message: "Escrow already holding" });
    }

    const depositAmount = toXofAmount(contract.depositAmount);
    if (depositAmount <= 0) return res.status(400).json({ message: "depositAmount must be > 0" });

    const fromWalletAccountId = toUuid(req.body?.walletAccountId);
    const renterWallet = fromWalletAccountId
      ? { id: fromWalletAccountId }
      : await getOrCreateWalletAccount(String(user.email || user.id));

    const escrowWallet = await getOrCreateSystemWalletAccount(SYSTEM_WALLET_USER_IDS.equipmentEscrow);

    const transfer = await createWalletTransfer({
      fromWalletAccountId: renterWallet.id,
      toWalletAccountId: escrowWallet.id,
      amount: depositAmount,
      memo: `Equipment deposit escrow (${contractId})`,
      metadata: { tenantId: tenant.id, contractId, kind: "equipment_deposit_escrow_hold" },
    });

    const existingSummary =
      contract.pricingSummary && typeof contract.pricingSummary === "object" ? contract.pricingSummary : {};
    const escrowMeta =
      existingSummary && typeof (existingSummary as any).escrow === "object" ? (existingSummary as any).escrow : {};

    const nextSummary = {
      ...existingSummary,
      escrow: {
        ...escrowMeta,
        depositAmount,
        clientWalletAccountId: renterWallet.id,
        escrowWalletAccountId: escrowWallet.id,
        holdTransferId: transfer.transfer.id,
        heldAt: new Date().toISOString(),
      },
    };

    const now = new Date();
    const [updated] = await db
      .update(equipmentContracts)
      .set({
        escrowStatus: "holding" as any,
        paymentStatus: contract.paymentStatus === "paid" ? ("paid" as any) : ("partial" as any),
        pricingSummary: nextSummary,
        updatedAt: now,
      })
      .where(and(eq(equipmentContracts.tenantId, tenant.id), eq(equipmentContracts.id, contractId as any)))
      .returning();

    res.json({ ok: true, transfer, contract: updated });
  } catch (error: any) {
    if (error?.message === "contract_not_found") return res.status(404).json({ message: "Contract not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to hold escrow" });
  }
});

router.post("/payments/escrow/release", requireUser, async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const user = req.user;

    const contractId = toUuid(req.body?.contractId);
    if (!contractId) return res.status(400).json({ message: "contractId is required" });

    const contract = await assertContractAccess({ tenantId: tenant.id, contractId, user });
    if (!isAdminUser(user) && contract.ownerUserId !== user.id) {
      return res.status(403).json({ message: "Only the owner can release escrow" });
    }

    if (contract.escrowStatus !== "holding" && contract.escrowStatus !== "partial") {
      return res.status(400).json({ message: "Escrow is not holding" });
    }

    const depositAmount = toXofAmount(contract.depositAmount);
    if (depositAmount <= 0) return res.status(400).json({ message: "depositAmount must be > 0" });

    const requestedAmount = req.body?.amount != null ? toXofAmount(req.body.amount) : depositAmount;
    const releaseAmount = Math.min(depositAmount, Math.max(0, requestedAmount));
    if (releaseAmount <= 0) return res.status(400).json({ message: "amount must be > 0" });

    const escrowWallet = await getOrCreateSystemWalletAccount(SYSTEM_WALLET_USER_IDS.equipmentEscrow);

    const existingSummary =
      contract.pricingSummary && typeof contract.pricingSummary === "object" ? contract.pricingSummary : {};
    const escrowMeta =
      existingSummary && typeof (existingSummary as any).escrow === "object" ? (existingSummary as any).escrow : {};

    const clientWalletAccountId = toUuid((escrowMeta as any)?.clientWalletAccountId);
    let renterWalletId: string | null = clientWalletAccountId;

    if (!renterWalletId && contract.clientUserId) {
      const renter = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, contract.clientUserId) });
      if (renter?.email) {
        const renterWallet = await getOrCreateWalletAccount(String(renter.email));
        renterWalletId = renterWallet.id;
      }
    }

    if (!renterWalletId) return res.status(400).json({ message: "Missing renter wallet" });

    const transfer = await createWalletTransfer({
      fromWalletAccountId: escrowWallet.id,
      toWalletAccountId: renterWalletId,
      amount: releaseAmount,
      memo: `Equipment escrow release (${contractId})`,
      metadata: { tenantId: tenant.id, contractId, kind: "equipment_deposit_escrow_release" },
    });

    const nextStatus = releaseAmount >= depositAmount ? "released" : "partial";
    const nextSummary = {
      ...existingSummary,
      escrow: {
        ...escrowMeta,
        releaseTransferId: transfer.transfer.id,
        releasedAmount: releaseAmount,
        releasedAt: new Date().toISOString(),
      },
    };

    const now = new Date();
    const [updated] = await db
      .update(equipmentContracts)
      .set({ escrowStatus: nextStatus as any, pricingSummary: nextSummary, updatedAt: now })
      .where(and(eq(equipmentContracts.tenantId, tenant.id), eq(equipmentContracts.id, contractId as any)))
      .returning();

    res.json({ ok: true, transfer, contract: updated });
  } catch (error: any) {
    if (error?.message === "contract_not_found") return res.status(404).json({ message: "Contract not found" });
    if (error?.message === "forbidden") return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: "Failed to release escrow" });
  }
});

router.post("/payments/schedule/create", requireUser, async (_req: any, res) => {
  res.status(501).json({ message: "Scheduled payments not implemented yet" });
});

export default router;
