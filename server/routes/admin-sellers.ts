import { Router } from "express";
import { db } from "@db";
import { desc, eq } from "drizzle-orm";

import { walletRoles } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";

const router = Router();

router.use(ensureTenantAdmin);

router.get("/", async (_req, res) => {
  try {
    const items = await db.query.walletRoles.findMany({
      where: eq(walletRoles.role, "SELLER"),
      orderBy: desc(walletRoles.updatedAt),
      limit: 200,
    });
    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list sellers" });
  }
});

router.get("/:sellerId", async (req, res) => {
  try {
    const sellerId = String(req.params.sellerId || "").trim();
    const seller = await db.query.walletRoles.findFirst({ where: eq(walletRoles.id, sellerId as any) });
    if (!seller) return res.status(404).json({ message: "seller not found" });
    res.json({ ok: true, seller });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load seller" });
  }
});

router.post("/create", async (req, res) => {
  try {
    const userId = String(req.body?.userId || "").trim();
    if (!userId) return res.status(400).json({ message: "userId is required" });

    const [created] = await db
      .insert(walletRoles)
      .values({ userId, role: "SELLER", status: "ACTIVE", limits: req.body?.limits || {}, createdAt: new Date(), updatedAt: new Date() })
      .returning();

    res.json({ ok: true, seller: created });
  } catch (err: any) {
    res.status(400).json({ message: err?.message || "Failed to create seller" });
  }
});

router.post("/:sellerId/suspend", async (req, res) => {
  try {
    const sellerId = String(req.params.sellerId || "").trim();
    await db.update(walletRoles).set({ status: "SUSPENDED", updatedAt: new Date() }).where(eq(walletRoles.id, sellerId as any));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to suspend seller" });
  }
});

router.post("/:sellerId/limits", async (req, res) => {
  try {
    const sellerId = String(req.params.sellerId || "").trim();
    const limits = req.body?.limits && typeof req.body.limits === "object" ? req.body.limits : {};
    await db.update(walletRoles).set({ limits, updatedAt: new Date() }).where(eq(walletRoles.id, sellerId as any));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update limits" });
  }
});

export default router;

