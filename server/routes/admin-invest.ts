import { Router } from "express";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@db";
import { investorLeads, investmentOpportunities } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";

const router = Router();
router.use(ensureTenantAdmin);

function ensureTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function parseLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(1, Math.trunc(parsed)), max);
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeType(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["sme", "machinery", "farm", "factory", "gold", "commodities"].includes(normalized)) return normalized;
  return "sme";
}

function normalizeStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["draft", "published", "archived"].includes(normalized)) return normalized;
  return "draft";
}

function normalizeLeadStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["new", "qualified", "onboarding", "closed_lost", "closed_won"].includes(normalized)) return normalized;
  return "new";
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function parseDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function slugify(value: unknown, fallback = "opportunity") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

router.get("/opportunities", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toLowerCase();
    const type = String(req.query?.type || "").trim().toLowerCase();
    const limit = parseLimit(req.query?.limit, 120, 400);

    const conditions = [eq(investmentOpportunities.tenantId, tenant.id)];
    if (status && status !== "all") conditions.push(eq(investmentOpportunities.status, normalizeStatus(status) as any));
    if (type && type !== "all") conditions.push(eq(investmentOpportunities.type, normalizeType(type) as any));
    if (q) {
      conditions.push(
        or(
          ilike(investmentOpportunities.title, `%${q}%`),
          ilike(investmentOpportunities.summary, `%${q}%`),
          ilike(investmentOpportunities.slug, `%${q}%`),
          ilike(investmentOpportunities.country, `%${q}%`),
        ) as any,
      );
    }

    const items = await db
      .select()
      .from(investmentOpportunities)
      .where(and(...conditions))
      .orderBy(desc(investmentOpportunities.updatedAt), asc(investmentOpportunities.sortOrder))
      .limit(limit);

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list opportunities" });
  }
});

router.post("/opportunities", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "title required" });

    const [item] = await db
      .insert(investmentOpportunities)
      .values({
        tenantId: tenant.id,
        type: normalizeType(req.body?.type) as any,
        slug: slugify(req.body?.slug || title),
        title,
        summary: String(req.body?.summary || "").trim() || null,
        country: String(req.body?.country || "").trim() || null,
        trackRecordBadge: String(req.body?.trackRecordBadge ?? req.body?.track_record_badge ?? "").trim() || "Verified on platform",
        fundingGoalMin: req.body?.fundingGoalMin != null ? String(req.body.fundingGoalMin) : null,
        fundingGoalMax: req.body?.fundingGoalMax != null ? String(req.body.fundingGoalMax) : null,
        currency: String(req.body?.currency || "").trim() || "USD",
        useOfFunds: parseTags(req.body?.useOfFunds ?? req.body?.use_of_funds),
        contractDurationMonths: Number.isFinite(Number(req.body?.contractDurationMonths)) ? Number(req.body.contractDurationMonths) : null,
        trackedKpis: parseTags(req.body?.trackedKpis ?? req.body?.tracked_kpis),
        returnModel: String(req.body?.returnModel ?? req.body?.return_model ?? "").trim() || null,
        riskNotes: String(req.body?.riskNotes ?? req.body?.risk_notes ?? "").trim() || null,
        mitigations: String(req.body?.mitigations || "").trim() || null,
        narrative: String(req.body?.narrative || "").trim() || null,
        fundingPlan: req.body?.fundingPlan && typeof req.body.fundingPlan === "object" ? req.body.fundingPlan : {},
        status: normalizeStatus(req.body?.status) as any,
        featured: parseBoolean(req.body?.featured, false),
        sortOrder: Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0,
        publishedAt: parseDate(req.body?.publishedAt ?? req.body?.published_at),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to create opportunity" });
  }
});

router.patch("/opportunities/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.investmentOpportunities.findFirst({
      where: and(eq(investmentOpportunities.id, id), eq(investmentOpportunities.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "opportunity not found" });

    const [item] = await db
      .update(investmentOpportunities)
      .set({
        type: Object.prototype.hasOwnProperty.call(req.body || {}, "type")
          ? (normalizeType(req.body?.type) as any)
          : current.type,
        slug: Object.prototype.hasOwnProperty.call(req.body || {}, "slug")
          ? slugify(req.body?.slug || current.slug)
          : current.slug,
        title: Object.prototype.hasOwnProperty.call(req.body || {}, "title")
          ? String(req.body?.title || "").trim() || current.title
          : current.title,
        summary: Object.prototype.hasOwnProperty.call(req.body || {}, "summary")
          ? String(req.body?.summary || "").trim() || null
          : current.summary,
        country: Object.prototype.hasOwnProperty.call(req.body || {}, "country")
          ? String(req.body?.country || "").trim() || null
          : current.country,
        trackRecordBadge: Object.prototype.hasOwnProperty.call(req.body || {}, "trackRecordBadge") ||
          Object.prototype.hasOwnProperty.call(req.body || {}, "track_record_badge")
          ? String(req.body?.trackRecordBadge ?? req.body?.track_record_badge ?? "").trim() || "Verified on platform"
          : current.trackRecordBadge,
        fundingGoalMin: Object.prototype.hasOwnProperty.call(req.body || {}, "fundingGoalMin")
          ? req.body?.fundingGoalMin != null
            ? String(req.body.fundingGoalMin)
            : null
          : current.fundingGoalMin,
        fundingGoalMax: Object.prototype.hasOwnProperty.call(req.body || {}, "fundingGoalMax")
          ? req.body?.fundingGoalMax != null
            ? String(req.body.fundingGoalMax)
            : null
          : current.fundingGoalMax,
        currency: Object.prototype.hasOwnProperty.call(req.body || {}, "currency")
          ? String(req.body?.currency || "").trim() || "USD"
          : current.currency,
        useOfFunds: Object.prototype.hasOwnProperty.call(req.body || {}, "useOfFunds") ||
          Object.prototype.hasOwnProperty.call(req.body || {}, "use_of_funds")
          ? parseTags(req.body?.useOfFunds ?? req.body?.use_of_funds)
          : current.useOfFunds,
        contractDurationMonths: Object.prototype.hasOwnProperty.call(req.body || {}, "contractDurationMonths")
          ? Number.isFinite(Number(req.body?.contractDurationMonths))
            ? Number(req.body.contractDurationMonths)
            : null
          : current.contractDurationMonths,
        trackedKpis: Object.prototype.hasOwnProperty.call(req.body || {}, "trackedKpis") ||
          Object.prototype.hasOwnProperty.call(req.body || {}, "tracked_kpis")
          ? parseTags(req.body?.trackedKpis ?? req.body?.tracked_kpis)
          : current.trackedKpis,
        returnModel: Object.prototype.hasOwnProperty.call(req.body || {}, "returnModel") ||
          Object.prototype.hasOwnProperty.call(req.body || {}, "return_model")
          ? String(req.body?.returnModel ?? req.body?.return_model ?? "").trim() || null
          : current.returnModel,
        riskNotes: Object.prototype.hasOwnProperty.call(req.body || {}, "riskNotes") ||
          Object.prototype.hasOwnProperty.call(req.body || {}, "risk_notes")
          ? String(req.body?.riskNotes ?? req.body?.risk_notes ?? "").trim() || null
          : current.riskNotes,
        mitigations: Object.prototype.hasOwnProperty.call(req.body || {}, "mitigations")
          ? String(req.body?.mitigations || "").trim() || null
          : current.mitigations,
        narrative: Object.prototype.hasOwnProperty.call(req.body || {}, "narrative")
          ? String(req.body?.narrative || "").trim() || null
          : current.narrative,
        fundingPlan: Object.prototype.hasOwnProperty.call(req.body || {}, "fundingPlan")
          ? req.body?.fundingPlan && typeof req.body.fundingPlan === "object"
            ? req.body.fundingPlan
            : {}
          : current.fundingPlan,
        status: Object.prototype.hasOwnProperty.call(req.body || {}, "status")
          ? (normalizeStatus(req.body?.status) as any)
          : current.status,
        featured: Object.prototype.hasOwnProperty.call(req.body || {}, "featured")
          ? parseBoolean(req.body?.featured, false)
          : current.featured,
        sortOrder: Object.prototype.hasOwnProperty.call(req.body || {}, "sortOrder")
          ? Number.isFinite(Number(req.body?.sortOrder))
            ? Number(req.body.sortOrder)
            : 0
          : current.sortOrder,
        publishedAt: Object.prototype.hasOwnProperty.call(req.body || {}, "publishedAt") ||
          Object.prototype.hasOwnProperty.call(req.body || {}, "published_at")
          ? parseDate(req.body?.publishedAt ?? req.body?.published_at)
          : current.publishedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(investmentOpportunities.id, id), eq(investmentOpportunities.tenantId, tenant.id)))
      .returning();

    res.json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to update opportunity" });
  }
});

router.delete("/opportunities/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const rows = await db
      .delete(investmentOpportunities)
      .where(and(eq(investmentOpportunities.id, id), eq(investmentOpportunities.tenantId, tenant.id)))
      .returning({ id: investmentOpportunities.id });

    if (!rows.length) return res.status(404).json({ message: "opportunity not found" });
    res.json({ ok: true, deletedId: rows[0].id });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete opportunity" });
  }
});

router.get("/leads", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 120, 400);
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toLowerCase();

    const conditions = [eq(investorLeads.tenantId, tenant.id)];
    if (status && status !== "all") conditions.push(eq(investorLeads.status, normalizeLeadStatus(status) as any));
    if (q) {
      conditions.push(
        or(
          ilike(investorLeads.name, `%${q}%`),
          ilike(investorLeads.email, `%${q}%`),
          ilike(investorLeads.country, `%${q}%`),
          ilike(investorLeads.message, `%${q}%`),
        ) as any,
      );
    }

    const items = await db
      .select()
      .from(investorLeads)
      .where(and(...conditions))
      .orderBy(desc(investorLeads.createdAt))
      .limit(limit);

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load investor leads" });
  }
});

router.patch("/leads/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.investorLeads.findFirst({
      where: and(eq(investorLeads.id, id), eq(investorLeads.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "lead not found" });

    const [item] = await db
      .update(investorLeads)
      .set({
        status: Object.prototype.hasOwnProperty.call(req.body || {}, "status")
          ? (normalizeLeadStatus(req.body?.status) as any)
          : current.status,
        message: Object.prototype.hasOwnProperty.call(req.body || {}, "message")
          ? String(req.body?.message || "").trim() || null
          : current.message,
        interestTags: Object.prototype.hasOwnProperty.call(req.body || {}, "interestTags") ||
          Object.prototype.hasOwnProperty.call(req.body || {}, "interest_tags")
          ? parseTags(req.body?.interestTags ?? req.body?.interest_tags)
          : current.interestTags,
        updatedAt: new Date(),
      })
      .where(and(eq(investorLeads.id, id), eq(investorLeads.tenantId, tenant.id)))
      .returning();

    res.json({ ok: true, item });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to update investor lead" });
  }
});

export default router;
