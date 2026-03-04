import { Router } from "express";
import { ensureTenantAdmin } from "./utils/auth";

const router = Router();

router.use(ensureTenantAdmin);

router.get("/alerts", async (_req, res) => {
  res.json({ ok: true, items: [] });
});

router.post("/rules", async (_req, res) => {
  res.json({ ok: true });
});

export default router;

