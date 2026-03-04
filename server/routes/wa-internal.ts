import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@db";
import { eceSessions, eceUsers, waOffers, waOrders } from "@db/schema";
import { and, desc, eq, ilike } from "drizzle-orm";
import { isChairmanAssistantUser } from "./utils/auth";

type AuthedRequest = Request & { user?: any };

async function verifySession(token: string | undefined) {
  if (!token) return null;
  const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  return await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const user = await verifySession(token);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  req.user = user;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  if (req.user?.role === "admin" || roles.includes("admin") || isChairmanAssistantUser(req.user)) return next();
  return res.status(403).json({ error: "Admin access required" });
}

const router = Router();

// Offers
router.post("/offers/draft", requireAuth, async (req: AuthedRequest, res) => {
  const { type, quantity, unit, location, price, notes, mediaIds = [] } = req.body || {};
  if (!type || !quantity || !unit) return res.status(400).json({ error: "type, quantity, unit are required" });

  const [offer] = await db
    .insert(waOffers)
    .values({
      createdByUserId: req.user!.id,
      status: "draft",
      type,
      quantity: String(quantity),
      unit,
      locationJson: location || { country: "CI" },
      priceJson: price || null,
      notes: notes || null,
      mediaIds,
      metadata: {},
    })
    .returning();
  res.status(201).json(offer);
});

router.patch("/offers/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const offer = await db.query.waOffers.findFirst({ where: eq(waOffers.id, id) });
  if (!offer) return res.status(404).json({ error: "Offer not found" });

  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  const isAdmin = req.user?.role === "admin" || roles.includes("admin") || isChairmanAssistantUser(req.user);
  if (!isAdmin && offer.createdByUserId !== req.user!.id) return res.status(403).json({ error: "Forbidden" });

  const patch: any = { ...req.body, updatedAt: new Date() };
  delete patch.id;
  delete patch.createdByUserId;
  delete patch.createdAt;
  delete patch.publishedAt;
  await db.update(waOffers).set(patch).where(eq(waOffers.id, id));
  const updated = await db.query.waOffers.findFirst({ where: eq(waOffers.id, id) });
  res.json(updated);
});

router.post("/offers/:id/confirm", requireAuth, async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const offer = await db.query.waOffers.findFirst({ where: eq(waOffers.id, id) });
  if (!offer) return res.status(404).json({ error: "Offer not found" });
  if (offer.createdByUserId !== req.user!.id) return res.status(403).json({ error: "Forbidden" });

  const mediaIds = (offer as any).mediaIds as number[] | undefined;
  if (!mediaIds?.length) return res.status(400).json({ error: "At least 1 photo is required" });

  await db.update(waOffers).set({ status: "pending_review", updatedAt: new Date() }).where(eq(waOffers.id, id));
  res.json({ ok: true });
});

router.post("/offers/:id/withdraw", requireAuth, async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const offer = await db.query.waOffers.findFirst({ where: eq(waOffers.id, id) });
  if (!offer) return res.status(404).json({ error: "Offer not found" });

  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  const isAdmin = req.user?.role === "admin" || roles.includes("admin") || isChairmanAssistantUser(req.user);
  if (!isAdmin && offer.createdByUserId !== req.user!.id) return res.status(403).json({ error: "Forbidden" });

  await db.update(waOffers).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(waOffers.id, id));
  res.json({ ok: true });
});

router.get("/offers", async (req, res) => {
  const { q } = req.query;
  const where = q ? and(eq(waOffers.status, "published"), ilike(waOffers.notes, `%${q}%`)) : eq(waOffers.status, "published");
  const offers = await db.query.waOffers.findMany({ where, orderBy: desc(waOffers.createdAt), limit: 50 });
  res.json(offers);
});

router.get("/offers/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const offer = await db.query.waOffers.findFirst({ where: eq(waOffers.id, id) });
  if (!offer) return res.status(404).json({ error: "Offer not found" });
  res.json(offer);
});

// Orders / intents
router.post("/orders/intent", requireAuth, async (_req: AuthedRequest, res) => {
  res.status(201).json({ ok: true, message: "Intent recorded" });
});

router.post("/orders", requireAuth, async (req: AuthedRequest, res) => {
  const { offerId, quantity, unit } = req.body || {};
  if (!offerId || !quantity || !unit) return res.status(400).json({ error: "offerId, quantity, unit required" });

  const offer = await db.query.waOffers.findFirst({ where: and(eq(waOffers.id, Number(offerId)), eq(waOffers.status, "published")) });
  if (!offer) return res.status(404).json({ error: "Offer not found" });

  const [order] = await db
    .insert(waOrders)
    .values({
      offerId: offer.id,
      buyerUserId: req.user!.id,
      quantity: String(quantity),
      unit,
      status: "pending_terms",
      metadata: {},
    })
    .returning();

  res.status(201).json(order);
});

router.get("/orders/:id/status", requireAuth, async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const order = await db.query.waOrders.findFirst({ where: and(eq(waOrders.id, id), eq(waOrders.buyerUserId, req.user!.id)) });
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ id: order.id, status: order.status, updatedAt: order.updatedAt });
});

// Admin review queue
router.get("/admin/review-queue", requireAuth, requireAdmin, async (_req: AuthedRequest, res) => {
  const queue = await db.query.waOffers.findMany({ where: eq(waOffers.status, "pending_review"), orderBy: desc(waOffers.createdAt), limit: 50 });
  res.json(queue);
});

router.post("/admin/offers/:id/approve", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  await db.update(waOffers).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(waOffers.id, id));
  res.json({ ok: true });
});

router.post("/admin/offers/:id/reject", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const reason = String(req.body?.reason || "Rejected").trim();
  const offer = await db.query.waOffers.findFirst({ where: eq(waOffers.id, id) });
  if (!offer) return res.status(404).json({ error: "Offer not found" });
  const metadata = { ...(offer as any).metadata, rejectedReason: reason, rejectedAt: new Date().toISOString() };
  await db.update(waOffers).set({ status: "draft", metadata, updatedAt: new Date() }).where(eq(waOffers.id, id));
  res.json({ ok: true });
});

router.post("/admin/request-docs", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const ref = req.body?.ref;
  if (!ref) return res.status(400).json({ error: "ref required" });
  res.json({ ok: true });
});

export default router;
