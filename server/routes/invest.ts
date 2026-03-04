import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@db";
import { investorLeads, investmentOpportunities } from "@db/schema";
import { getContactNotificationConfig, sendContactNotification } from "../lib/contact/notifier";

const router = Router();

type SeedOpportunity = {
  slug?: string;
  type?: string;
  title?: string;
  summary?: string;
  country?: string;
  trackRecordBadge?: string;
  fundingGoalMin?: number;
  fundingGoalMax?: number;
  currency?: string;
  useOfFunds?: string[];
  contractDurationMonths?: number;
  trackedKpis?: string[];
  returnModel?: string;
  riskNotes?: string;
  mitigations?: string;
  narrative?: string;
  fundingPlan?: Record<string, unknown>;
  status?: string;
  featured?: boolean;
  sortOrder?: number;
};

function parseLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(1, Math.trunc(parsed)), max);
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

async function readSeedOpportunities() {
  try {
    const filePath = path.resolve(process.cwd(), "content", "invest", "opportunities.json");
    const raw = await fs.readFile(filePath, "utf8");
    const payload = JSON.parse(raw) as { items?: SeedOpportunity[] };
    return Array.isArray(payload.items) ? payload.items : [];
  } catch {
    return [];
  }
}

function normalizeOpportunityType(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["sme", "machinery", "farm", "factory", "gold", "commodities"].includes(normalized)) {
    return normalized as "sme" | "machinery" | "farm" | "factory" | "gold" | "commodities";
  }
  return "sme";
}

function normalizeLeadStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["new", "qualified", "onboarding", "closed_lost", "closed_won"].includes(normalized)) {
    return normalized;
  }
  return "new";
}

function mapSeedToItem(seed: SeedOpportunity, index: number, tenantId: number) {
  const slug = String(seed.slug || "").trim() || `opportunity-${index + 1}`;
  return {
    id: `seed-invest-${index + 1}`,
    tenantId,
    type: normalizeOpportunityType(seed.type),
    slug,
    title: String(seed.title || "").trim() || "Investment opportunity",
    summary: String(seed.summary || "").trim() || null,
    country: String(seed.country || "").trim() || null,
    trackRecordBadge: String(seed.trackRecordBadge || "").trim() || "Verified on platform",
    fundingGoalMin: seed.fundingGoalMin != null ? String(seed.fundingGoalMin) : null,
    fundingGoalMax: seed.fundingGoalMax != null ? String(seed.fundingGoalMax) : null,
    currency: String(seed.currency || "").trim() || "USD",
    useOfFunds: Array.isArray(seed.useOfFunds) ? seed.useOfFunds : [],
    contractDurationMonths: Number.isFinite(Number(seed.contractDurationMonths))
      ? Number(seed.contractDurationMonths)
      : null,
    trackedKpis: Array.isArray(seed.trackedKpis) ? seed.trackedKpis : [],
    returnModel: String(seed.returnModel || "").trim() || null,
    riskNotes: String(seed.riskNotes || "").trim() || null,
    mitigations: String(seed.mitigations || "").trim() || null,
    narrative: String(seed.narrative || "").trim() || null,
    fundingPlan: seed.fundingPlan && typeof seed.fundingPlan === "object" ? seed.fundingPlan : {},
    status: String(seed.status || "").trim().toLowerCase() === "published" ? "published" : "draft",
    featured: Boolean(seed.featured),
    sortOrder: Number.isFinite(Number(seed.sortOrder)) ? Number(seed.sortOrder) : index,
    publishedAt: null,
    createdAt: null,
    updatedAt: null,
    seed: true,
  };
}

function applySeedOpportunityFilters(
  rows: ReturnType<typeof mapSeedToItem>[],
  filters: { q?: string; type?: string; country?: string; featuredOnly?: boolean },
) {
  let output = rows;
  if (filters.q) {
    const lower = filters.q.toLowerCase();
    output = output.filter((row) =>
      [row.title, row.summary, row.country].some((value) => String(value || "").toLowerCase().includes(lower)),
    );
  }
  if (filters.type) output = output.filter((row) => row.type === normalizeOpportunityType(filters.type));
  if (filters.country) {
    const lowerCountry = filters.country.toLowerCase();
    output = output.filter((row) => String(row.country || "").toLowerCase().includes(lowerCountry));
  }
  if (filters.featuredOnly) output = output.filter((row) => row.featured);
  return output;
}

function isMissingRelation(error: any, relationName: string) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("does not exist") && message.includes(relationName.toLowerCase());
}

router.get("/api/invest/opportunities", async (req: any, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const limit = parseLimit(req.query?.limit, 32, 120);
  const q = String(req.query?.q || "").trim();
  const type = String(req.query?.type || "").trim().toLowerCase();
  const country = String(req.query?.country || "").trim();
  const featuredOnly = parseBoolean(req.query?.featured, false);

  const loadSeedFallback = async () => {
    const seeds = await readSeedOpportunities();
    const mapped = seeds.map((seed, index) => mapSeedToItem(seed, index, tenant.id));
    const filtered = applySeedOpportunityFilters(mapped, { q, type, country, featuredOnly });
    return filtered.slice(0, limit);
  };

  try {
    const conditions: any[] = [eq(investmentOpportunities.tenantId, tenant.id), eq(investmentOpportunities.status, "published")];
    if (q) {
      conditions.push(
        or(
          ilike(investmentOpportunities.title, `%${q}%`),
          ilike(investmentOpportunities.summary, `%${q}%`),
          ilike(investmentOpportunities.country, `%${q}%`),
        ) as any,
      );
    }
    if (type) conditions.push(eq(investmentOpportunities.type, normalizeOpportunityType(type) as any));
    if (country) conditions.push(ilike(investmentOpportunities.country, `%${country}%`) as any);
    if (featuredOnly) conditions.push(eq(investmentOpportunities.featured, true));

    let items = await db
      .select()
      .from(investmentOpportunities)
      .where(and(...conditions))
      .orderBy(desc(investmentOpportunities.featured), asc(investmentOpportunities.sortOrder), desc(investmentOpportunities.publishedAt))
      .limit(limit);

    if (!items.length) {
      const fallback = await loadSeedFallback();
      return res.json({ ok: true, items: fallback, fallback: true });
    }

    res.json({ ok: true, items });
  } catch (error: any) {
    if (isMissingRelation(error, "investment_opportunities")) {
      const fallback = await loadSeedFallback();
      return res.json({ ok: true, items: fallback, fallback: true, reason: "investment_table_missing" });
    }
    res.status(500).json({ message: error?.message || "Failed to load investment opportunities" });
  }
});

router.get("/api/invest/opportunities/:slug", async (req: any, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;
  const slug = String(req.params?.slug || "").trim();
  if (!slug) return res.status(400).json({ message: "slug required" });

  try {
    const row = await db.query.investmentOpportunities.findFirst({
      where: and(
        eq(investmentOpportunities.tenantId, tenant.id),
        eq(investmentOpportunities.slug, slug),
        eq(investmentOpportunities.status, "published"),
      ),
    });

    if (row) return res.json({ ok: true, item: row });

    const seeds = await readSeedOpportunities();
    const fallback = seeds.find((seed) => String(seed.slug || "").trim() === slug);
    if (!fallback) return res.status(404).json({ message: "Opportunity not found" });

    res.json({ ok: true, item: mapSeedToItem(fallback, 0, tenant.id), fallback: true });
  } catch (error: any) {
    if (isMissingRelation(error, "investment_opportunities")) {
      const seeds = await readSeedOpportunities();
      const fallback = seeds.find((seed) => String(seed.slug || "").trim() === slug);
      if (!fallback) return res.status(404).json({ message: "Opportunity not found" });
      return res.json({ ok: true, item: mapSeedToItem(fallback, 0, tenant.id), fallback: true, reason: "investment_table_missing" });
    }
    res.status(500).json({ message: error?.message || "Failed to load opportunity detail" });
  }
});

router.post("/api/invest/leads", async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone || "").trim() || null;
    const country = String(req.body?.country || "").trim() || null;
    const investorType = String(req.body?.investorType ?? req.body?.investor_type ?? "").trim() || null;
    const message = String(req.body?.message || "").trim() || null;
    const interestTags = parseTags(req.body?.interestTags ?? req.body?.interest_tags);
    const sourceUrl = String(req.body?.sourceUrl ?? req.body?.source_url ?? "").trim() || null;

    if (!name) return res.status(400).json({ message: "name required" });
    if (!email) return res.status(400).json({ message: "valid email required" });

    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0]?.trim() || null;
    const userAgent = String(req.headers["user-agent"] || "").trim() || null;
    const now = new Date();

    const [lead] = await db
      .insert(investorLeads)
      .values({
        tenantId: tenant.id,
        name,
        email,
        phone,
        country,
        investorType,
        message,
        interestTags,
        status: normalizeLeadStatus(req.body?.status) as any,
        notifyStatus: "pending",
        notifyError: null,
        notifiedAt: null,
        sourceUrl,
        userAgent,
        ip,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const cfg = getContactNotificationConfig();
    if (!cfg.enabled || !cfg.from) {
      await db
        .update(investorLeads)
        .set({ notifyStatus: "skipped", notifyError: "contact_notify_not_configured", updatedAt: new Date() })
        .where(eq(investorLeads.id, lead.id));
      return res.status(201).json({ ok: true, id: lead.id, notify: { status: "skipped" } });
    }

    const subject = `[Investor Lead] ${name} <${email}>`;
    const body = [
      `New investor lead (tenant=${tenant.key})`,
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : null,
      country ? `Country: ${country}` : null,
      investorType ? `Investor type: ${investorType}` : null,
      interestTags.length ? `Interest tags: ${interestTags.join(", ")}` : null,
      sourceUrl ? `Source URL: ${sourceUrl}` : null,
      "",
      "Message:",
      message || "(none)",
      "",
      `IP: ${ip || "unknown"}`,
      `User-Agent: ${userAgent || "unknown"}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const sent = await sendContactNotification({
        to: cfg.to,
        from: cfg.from,
        subject,
        text: body,
      });
      await db
        .update(investorLeads)
        .set({
          notifyStatus: "sent",
          notifyError: sent.messageId ? null : "missing_message_id",
          notifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(investorLeads.id, lead.id));
      return res.status(201).json({ ok: true, id: lead.id, notify: { status: "sent", messageId: sent.messageId } });
    } catch (notifyError: any) {
      await db
        .update(investorLeads)
        .set({
          notifyStatus: "failed",
          notifyError: String(notifyError?.message || notifyError || "notification_failed").slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(investorLeads.id, lead.id));
      return res.status(201).json({
        ok: true,
        id: lead.id,
        notify: { status: "failed", error: String(notifyError?.message || notifyError || "notification_failed") },
      });
    }
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to submit investor lead" });
  }
});

export default router;
