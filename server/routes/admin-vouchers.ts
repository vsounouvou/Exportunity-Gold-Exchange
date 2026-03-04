import { Router } from "express";
import { db } from "@db";
import { asc, desc, eq } from "drizzle-orm";

import { voucherBatches, vouchers } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import { createVoucherBatch, issueVoucherBatch, listVoucherBatches } from "../lib/wallet/vouchers";

const router = Router();

router.use(ensureTenantAdmin);

router.get("/batches", async (_req, res) => {
  try {
    const items = await listVoucherBatches(100);
    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list batches" });
  }
});

router.post("/batches/create", async (req, res) => {
  try {
    const issuerWalletAccountId = String(req.body?.issuerWalletAccountId || "").trim();
    const voucherCount = Number(req.body?.voucherCount);
    const voucherValue = Number(req.body?.voucherValue);
    const commissionScheme = req.body?.commissionScheme && typeof req.body.commissionScheme === "object" ? req.body.commissionScheme : undefined;

    const batch = await createVoucherBatch({ issuerWalletAccountId, voucherCount, voucherValue, currency: "XOF", commissionScheme });
    res.json({ ok: true, batch });
  } catch (err: any) {
    res.status(400).json({ message: err?.message || "Failed to create batch" });
  }
});

router.post("/batches/:batchId/issue", async (req, res) => {
  try {
    const batchId = String(req.params.batchId || "").trim();
    const out = await issueVoucherBatch({ batchId });
    res.json({ ok: true, ...out });
  } catch (err: any) {
    res.status(400).json({ message: err?.message || "Failed to issue batch" });
  }
});

router.get("/batches/:batchId", async (req, res) => {
  try {
    const batchId = String(req.params.batchId || "").trim();
    const batch = await db.query.voucherBatches.findFirst({ where: eq(voucherBatches.id, batchId as any) });
    if (!batch) return res.status(404).json({ message: "batch not found" });

    const items = await db.query.vouchers.findMany({ where: eq(vouchers.batchId, batch.id), orderBy: asc(vouchers.createdAt), limit: 500 });
    res.json({ ok: true, batch, vouchers: items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load batch" });
  }
});

router.post("/:voucherId/void", async (req, res) => {
  try {
    const voucherId = String(req.params.voucherId || "").trim();
    await db.update(vouchers).set({ status: "VOID" }).where(eq(vouchers.id, voucherId as any));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to void voucher" });
  }
});

export default router;

