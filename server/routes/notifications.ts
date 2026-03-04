import { Router } from "express";
import { ensureTenantStaff } from "./utils/auth";
import { listNotificationsForUser, markNotificationsRead } from "../lib/notifications";

const router = Router();
router.use(ensureTenantStaff);

router.get("/", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });
    const staffUser = req.staffUser;
    if (!staffUser) return res.status(401).json({ message: "Authentication required" });

    const limit = req.query?.limit ? Number(req.query.limit) : undefined;
    const data = await listNotificationsForUser({ tenantId: tenant.id, userId: Number(staffUser.id), limit });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list notifications" });
  }
});

router.post("/read", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });
    const staffUser = req.staffUser;
    if (!staffUser) return res.status(401).json({ message: "Authentication required" });

    const ids = Array.isArray(req.body?.notificationIds) ? req.body.notificationIds : [];
    const out = await markNotificationsRead({
      tenantId: tenant.id,
      userId: Number(staffUser.id),
      notificationIds: ids.map((x: any) => Number(x)),
    });
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to mark notifications read" });
  }
});

export default router;

