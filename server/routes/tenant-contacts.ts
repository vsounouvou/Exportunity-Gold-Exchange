import { Router } from "express";
import multer from "multer";
import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";
import {
  claimLegacyTenantContacts,
  diagnosticsTenantContacts,
  forceClaimTenantContacts,
  importTenantContactsCsv,
  listTenantContacts,
  upsertCanonicalContact,
  ensureTenantContactLink,
} from "../lib/contact/tenantContacts";
import { db } from "@db";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

function parseIntSafe(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function parseLimit(value: unknown, fallback = 50, max = 500) {
  const n = parseIntSafe(value, fallback);
  if (n <= 0) return fallback;
  return Math.min(max, n);
}

function parseOffset(value: unknown, fallback = 0) {
  const n = parseIntSafe(value, fallback);
  if (n <= 0) return 0;
  return n;
}

function getTenant(req: any, res: any) {
  const tenant = req?.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function getUserId(req: any) {
  const user = req?.staffUser || req?.adminUser || req?.tenantUser;
  const id = Number(user?.id || 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

const router = Router();
router.use(ensureTenantStaff);

router.get("/", async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;

    const q = String(req.query?.q || "").trim();
    const source = String(req.query?.source || "").trim();
    const status = String(req.query?.status || "").trim();
    const consent = String(req.query?.consent || "").trim();
    const hasWhatsapp = String(req.query?.hasWhatsapp || "").trim();
    const includeArchived = String(req.query?.include_archived || "").trim().toLowerCase() === "true";
    const limit = parseLimit(req.query?.limit, 50, 250);
    const offset = parseOffset(req.query?.offset, 0);

    const result = await listTenantContacts({
      tenantId: tenant.id,
      q,
      source,
      status,
      consent,
      hasWhatsapp,
      limit,
      offset,
      includeArchived,
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to list contacts" });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const displayName = String(req.body?.displayName || req.body?.name || "").trim() || null;
    const company = String(req.body?.company || "").trim() || null;
    const jobTitle = String(req.body?.jobTitle || "").trim() || null;
    const emails = Array.isArray(req.body?.emails)
      ? req.body.emails.map((item: any) => String(item || "").trim()).filter(Boolean)
      : [];
    const phones = Array.isArray(req.body?.phones)
      ? req.body.phones.map((item: any) => String(item || "").trim()).filter(Boolean)
      : [];

    const created = await db.transaction(async (tx) => {
      const contact = await upsertCanonicalContact(tx, {
        displayName,
        company,
        jobTitle,
        emails,
        phones,
        source: "manual",
        sourceSystem: "manual",
        createdByUserId: userId,
      });
      await ensureTenantContactLink(tx, { tenantId: tenant.id, contactId: contact.contactId, createdByUserId: userId });
      return contact;
    });

    return res.json({ ok: true, ...created });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to create contact" });
  }
});

router.post("/import/csv", upload.single("file"), async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "Upload one CSV file under `file`." });

    const summary = await importTenantContactsCsv({
      tenantId: tenant.id,
      userId,
      fileName: file.originalname || "contacts.csv",
      fileBuffer: file.buffer,
    });
    return res.json(summary);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to import CSV" });
  }
});

router.post("/diagnostics", async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const result = await diagnosticsTenantContacts({ tenantId: tenant.id, userId });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to run diagnostics" });
  }
});

router.post("/claim-legacy", async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const force = String(req.body?.force || "").trim().toLowerCase() === "true";
    const result = await claimLegacyTenantContacts({ tenantId: tenant.id, userId, force });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to claim legacy contacts" });
  }
});

router.post("/force-claim", ensureTenantAdmin, async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const result = await forceClaimTenantContacts({ tenantId: tenant.id, userId });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to force claim contacts" });
  }
});

export default router;
