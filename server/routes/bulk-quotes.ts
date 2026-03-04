import { Router, type Request, type Response } from "express";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@db";
import { metEstimateRequests } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import { hasTenantModule } from "../../tenants/index";

const router = Router();

const MAX_PAGE_SIZE = 200;
const QUOTE_STATUSES = ["NEW", "REVIEWING", "SENT", "CLOSED"] as const;

const publicRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().email().max(254).optional().nullable(),
  city: z.string().trim().min(2).max(120),
  projectCity: z.string().trim().max(120).optional().nullable(),
  landSizeM2: z.coerce.number().min(0).optional().nullable(),
  floors: z.coerce.number().int().min(0).optional().nullable(),
  rooms: z.coerce.number().int().min(0).optional().nullable(),
  budgetCfa: z.coerce.number().int().min(0).optional().nullable(),
  timeline: z.string().trim().max(400).optional().nullable(),
  brief: z.string().trim().max(5000).optional().nullable(),
});

const adminPatchSchema = z.object({
  status: z.enum(QUOTE_STATUSES).optional(),
  internalNotes: z.string().trim().max(5000).optional().nullable(),
});

function parseLimit(value: unknown, fallback = 50) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function parseOffset(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function tenantFromRequest(req: Request) {
  const tenant = (req as any)?.tenant;
  const id = Number(tenant?.id || 0);
  const key = String(tenant?.key || "").trim().toLowerCase();
  if (!id || !key) return null;
  return { id, key };
}

function ensureBulkQuotesEnabled(req: Request, res: Response) {
  const tenant = tenantFromRequest(req);
  if (!tenant) {
    res.status(500).json({ ok: false, message: "Tenant context unavailable." });
    return null;
  }
  if (!hasTenantModule(tenant.key, "bulk_quotes")) {
    res.status(404).json({ ok: false, message: "Bulk quote module disabled for this tenant." });
    return null;
  }
  return tenant;
}

router.post("/api/bulk-quotes/requests", async (req: Request, res: Response) => {
  try {
    const tenant = ensureBulkQuotesEnabled(req, res);
    if (!tenant) return;

    const payload = publicRequestSchema.safeParse(req.body || {});
    if (!payload.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid payload",
        issues: payload.error.flatten(),
      });
    }

    const input = payload.data;
    const [created] = await db
      .insert(metEstimateRequests)
      .values({
        tenantId: tenant.id,
        tenantKey: tenant.key,
        projectCity: String(input.projectCity || input.city).trim(),
        landSizeM2: input.landSizeM2 ? String(input.landSizeM2) : null,
        floors: input.floors ?? null,
        rooms: input.rooms ?? null,
        budgetCfa: input.budgetCfa ?? null,
        timeline: input.timeline ?? null,
        brief: [input.brief, `name=${input.name}`, `phone=${input.phone}`, input.email ? `email=${input.email}` : null]
          .filter(Boolean)
          .join("\n"),
        status: "NEW",
        createdByUserId: null,
        leadId: null,
        internalNotes: null,
        planFileUrl: null,
      })
      .returning({
        id: metEstimateRequests.id,
        status: metEstimateRequests.status,
        createdAt: metEstimateRequests.createdAt,
      });

    return res.status(201).json({
      ok: true,
      requestId: created.id,
      status: created.status,
      createdAt: created.createdAt,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to create bulk quote request." });
  }
});

router.get("/api/admin/bulk-quotes/requests", ensureTenantAdmin, async (req: Request, res: Response) => {
  try {
    const tenant = ensureBulkQuotesEnabled(req, res);
    if (!tenant) return;

    const status = String(req.query?.status || "").trim().toUpperCase();
    const q = String(req.query?.q || "").trim();
    const limit = parseLimit(req.query?.limit);
    const offset = parseOffset(req.query?.offset);

    const whereParts = [
      eq(metEstimateRequests.tenantId, tenant.id),
      eq(metEstimateRequests.tenantKey, tenant.key),
    ];

    if ((QUOTE_STATUSES as readonly string[]).includes(status)) {
      whereParts.push(eq(metEstimateRequests.status, status as any));
    }

    if (q) {
      const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
      whereParts.push(
        sql`(${ilike(metEstimateRequests.projectCity, like)} or ${ilike(metEstimateRequests.timeline, like)} or ${ilike(metEstimateRequests.brief, like)})`,
      );
    }

    const where = and(...whereParts);

    const [rows, [countRow]] = await Promise.all([
      db
        .select()
        .from(metEstimateRequests)
        .where(where)
        .orderBy(desc(metEstimateRequests.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(metEstimateRequests)
        .where(where),
    ]);

    return res.json({
      ok: true,
      items: rows,
      total: Number(countRow?.count || 0),
      limit,
      offset,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to list bulk quote requests." });
  }
});

router.patch("/api/admin/bulk-quotes/requests/:id", ensureTenantAdmin, async (req: Request, res: Response) => {
  try {
    const tenant = ensureBulkQuotesEnabled(req, res);
    if (!tenant) return;

    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, message: "Quote request id is required." });

    const payload = adminPatchSchema.safeParse(req.body || {});
    if (!payload.success) {
      return res.status(400).json({
        ok: false,
        message: "Invalid payload",
        issues: payload.error.flatten(),
      });
    }

    const updates = payload.data;
    if (!Object.keys(updates).length) {
      return res.status(400).json({ ok: false, message: "No changes requested." });
    }

    const [updated] = await db
      .update(metEstimateRequests)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(metEstimateRequests.id, id),
          eq(metEstimateRequests.tenantId, tenant.id),
          eq(metEstimateRequests.tenantKey, tenant.key),
        ),
      )
      .returning();

    if (!updated) return res.status(404).json({ ok: false, message: "Quote request not found." });

    return res.json({ ok: true, item: updated });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to update bulk quote request." });
  }
});

export default router;

