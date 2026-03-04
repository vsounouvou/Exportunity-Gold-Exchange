import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { notificationDeliveries, notifications } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import { createNotification, listNotificationsForAdmin } from "../lib/notifications";

const router = Router();
router.use(ensureTenantAdmin);

router.get("/", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const status = req.query?.status ? String(req.query.status) : null;
    const channel = req.query?.channel ? String(req.query.channel) : null;
    const limit = req.query?.limit ? Number(req.query.limit) : undefined;

    const data = await listNotificationsForAdmin({ tenantId: tenant.id, limit, status, channel });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list notifications" });
  }
});

router.get("/:id", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });
    const id = Number(req.params?.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });

    const notification = await db.query.notifications.findFirst({
      where: and(eq(notifications.tenantId, tenant.id), eq(notifications.id, id)),
    });
    if (!notification) return res.status(404).json({ message: "Not found" });

    const deliveries = await db.query.notificationDeliveries.findMany({
      where: and(eq(notificationDeliveries.tenantId, tenant.id), eq(notificationDeliveries.notificationId, id)),
      orderBy: [desc(notificationDeliveries.createdAt)],
      limit: 500,
    });

    res.json({ ok: true, notification, deliveries });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load notification" });
  }
});

router.post("/test", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });
    const adminUser = req.adminUser;

    const recipientUserId = Number(req.body?.recipientUserId ?? req.body?.userId ?? 0);
    if (!Number.isFinite(recipientUserId) || recipientUserId <= 0) {
      return res.status(400).json({ message: "recipientUserId required" });
    }

    const agentKey = String(req.body?.agentKey ?? req.body?.agent ?? "support").trim();
    const eventKey = String(req.body?.eventKey ?? "admin.test").trim() || "admin.test";
    const title = String(req.body?.title ?? "Test notification").trim();
    const message = String(req.body?.message ?? "PING").trim();
    const channels = Array.isArray(req.body?.channels) ? req.body.channels : null;
    const requireEmail = Boolean(req.body?.requireEmail ?? false);

    const created = await createNotification({
      tenantId: tenant.id,
      requestedByUserId: adminUser?.id ? Number(adminUser.id) : null,
      agentKey,
      recipientUserId,
      eventKey,
      title,
      message,
      channels,
      requireEmail,
    });

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create notification" });
  }
});

export default router;

