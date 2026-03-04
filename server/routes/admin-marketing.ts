import crypto from "node:crypto";
import { Router } from "express";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@db";
import {
  marketingAssets,
  marketingLibrary,
  marketingMediaItems,
  marketingMediaRuns,
  marketingMediaSources,
  marketingPosts,
  marketingPress,
  marketingScreenshots,
} from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";

const router = Router();
router.use(ensureTenantAdmin);

type MarketingRecordStatus = "draft" | "published" | "archived";
type MarketingMediaStatus = "discovered" | "reviewed" | "published" | "rejected";
type MarketingMediaType = "article" | "video" | "profile" | "press_release" | "podcast" | "post";

async function checkUrlOk(url: string): Promise<{ ok: boolean; status: number }> {
  const raw = String(url || "").trim();
  if (!raw) return { ok: false, status: 0 };
  if (!/^https?:\/\//i.test(raw)) return { ok: false, status: 0 };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  const headers = { "user-agent": "ExportunityAdminLinkCheck/1.0" };

  try {
    const head = await fetch(raw, { method: "HEAD", redirect: "follow", signal: controller.signal, headers });
    if (head.status === 405 || head.status === 403) {
      const getRes = await fetch(raw, { method: "GET", redirect: "follow", signal: controller.signal, headers });
      return { ok: getRes.status >= 200 && getRes.status < 400, status: getRes.status };
    }
    return { ok: head.status >= 200 && head.status < 400, status: head.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

function parseLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(1, Math.trunc(parsed)), max);
}

function parseOffset(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.trunc(parsed);
}

function slugify(value: unknown, fallback = "item") {
  const base = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallback;
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => String(entry || "").trim())
          .filter(Boolean),
      ),
    );
  }
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function parseStatus(value: unknown, fallback: MarketingRecordStatus = "draft"): MarketingRecordStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "draft" || raw === "published" || raw === "archived") return raw as MarketingRecordStatus;
  return fallback;
}

function parseMediaStatus(value: unknown, fallback: MarketingMediaStatus = "discovered") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "discovered" || raw === "reviewed" || raw === "published" || raw === "rejected") return raw as MarketingMediaStatus;
  return fallback;
}

function parseMediaType(value: unknown, fallback: MarketingMediaType = "article") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "article" || raw === "video" || raw === "profile" || raw === "press_release" || raw === "podcast" || raw === "post") {
    return raw as MarketingMediaType;
  }
  return fallback;
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function scrubLegacyBranding(value: unknown) {
  return String(value ?? "")
    .replace(/https?:\/\/(?:www\.)?rayon\.world\/?/gi, "https://exportunity.net/")
    .replace(/(?:www\.)?rayon\.world/gi, "exportunity.net")
    .replace(/\brayOn\b/g, "Exportunity Platform");
}

function ensureTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function hasBodyField(body: any, key: string) {
  return Boolean(body && Object.prototype.hasOwnProperty.call(body, key));
}

function parseSortOrder(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function parseScore(value: unknown, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function readFeatured(raw: unknown) {
  if (!raw || typeof raw !== "object") return false;
  return parseBoolean((raw as Record<string, unknown>).featured, false);
}

function withFeaturedRaw(raw: unknown, featured: boolean | undefined) {
  const next = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  if (typeof featured === "boolean") next.featured = featured;
  return next;
}

router.get("/marketing/posts", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 60, 300);
    const offset = parseOffset(req.query?.offset);
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toLowerCase();

    const conditions = [eq(marketingPosts.tenantId, tenant.id)];
    if (status && status !== "all") conditions.push(eq(marketingPosts.status, parseStatus(status) as any));
    if (q) {
      conditions.push(
        or(ilike(marketingPosts.title, `%${q}%`), ilike(marketingPosts.slug, `%${q}%`), ilike(marketingPosts.excerpt, `%${q}%`)) as any,
      );
    }

    const items = await db
      .select()
      .from(marketingPosts)
      .where(and(...conditions))
      .orderBy(desc(marketingPosts.updatedAt), desc(marketingPosts.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ ok: true, items, limit, offset, hasMore: items.length === limit });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list posts" });
  }
});

router.post("/marketing/posts", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const title = scrubLegacyBranding(req.body?.title).trim();
    if (!title) return res.status(400).json({ message: "title required" });

    const slug = slugify(req.body?.slug || title, "post");
    const publishedAt = normalizeDate(req.body?.publishedAt ?? req.body?.published_at);
    const now = new Date();

    const [item] = await db
      .insert(marketingPosts)
      .values({
        tenantId: tenant.id,
        slug,
        title,
        excerpt: scrubLegacyBranding(req.body?.excerpt).trim() || null,
        contentMarkdown: scrubLegacyBranding(req.body?.contentMarkdown ?? req.body?.content_markdown).trim() || null,
        contentHtml: scrubLegacyBranding(req.body?.contentHtml ?? req.body?.content_html).trim() || null,
        coverImageLocal: String((req.body?.coverImageLocal ?? req.body?.cover_image_local) || "").trim() || null,
        tags: parseTags(req.body?.tags),
        externalUrl: scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null,
        status: parseStatus(req.body?.status),
        sortOrder: Number.parseInt(String(req.body?.sortOrder ?? req.body?.sort_order ?? "0"), 10) || 0,
        publishedAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to create post" });
  }
});

router.patch("/marketing/posts/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.marketingPosts.findFirst({
      where: and(eq(marketingPosts.id, id), eq(marketingPosts.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "post not found" });

    const titleInput = scrubLegacyBranding(req.body?.title).trim();
    const nextTitle = titleInput || current.title;
    const slug = slugify(req.body?.slug || nextTitle || current.slug || `post-${id}`, "post");
    const publishedAt =
      hasBodyField(req.body, "publishedAt") || hasBodyField(req.body, "published_at")
        ? normalizeDate(req.body?.publishedAt ?? req.body?.published_at)
        : current.publishedAt;
    const nextStatus = hasBodyField(req.body, "status") ? parseStatus(req.body?.status, current.status) : current.status;
    const nextSortOrder =
      hasBodyField(req.body, "sortOrder") || hasBodyField(req.body, "sort_order")
        ? parseSortOrder(req.body?.sortOrder ?? req.body?.sort_order, current.sortOrder)
        : current.sortOrder;
    const nextTags = hasBodyField(req.body, "tags") ? parseTags(req.body?.tags) : current.tags;

    const [item] = await db
      .update(marketingPosts)
      .set({
        slug,
        title: nextTitle,
        excerpt: hasBodyField(req.body, "excerpt") ? scrubLegacyBranding(req.body?.excerpt).trim() || null : current.excerpt,
        contentMarkdown:
          hasBodyField(req.body, "contentMarkdown") || hasBodyField(req.body, "content_markdown")
            ? scrubLegacyBranding(req.body?.contentMarkdown ?? req.body?.content_markdown).trim() || null
            : current.contentMarkdown,
        contentHtml:
          hasBodyField(req.body, "contentHtml") || hasBodyField(req.body, "content_html")
            ? scrubLegacyBranding(req.body?.contentHtml ?? req.body?.content_html).trim() || null
            : current.contentHtml,
        coverImageLocal:
          hasBodyField(req.body, "coverImageLocal") || hasBodyField(req.body, "cover_image_local")
            ? String((req.body?.coverImageLocal ?? req.body?.cover_image_local) || "").trim() || null
            : current.coverImageLocal,
        tags: nextTags,
        externalUrl:
          hasBodyField(req.body, "externalUrl") || hasBodyField(req.body, "external_url")
            ? scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null
            : current.externalUrl,
        status: nextStatus as any,
        sortOrder: nextSortOrder,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(marketingPosts.id, id), eq(marketingPosts.tenantId, tenant.id)))
      .returning();

    if (!item) return res.status(404).json({ message: "post not found" });
    res.json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to update post" });
  }
});

router.delete("/marketing/posts/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const rows = await db
      .delete(marketingPosts)
      .where(and(eq(marketingPosts.id, id), eq(marketingPosts.tenantId, tenant.id)))
      .returning({ id: marketingPosts.id });
    if (!rows.length) return res.status(404).json({ message: "post not found" });
    res.json({ ok: true, deletedId: rows[0].id });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete post" });
  }
});

router.get("/marketing/press", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 80, 300);
    const offset = parseOffset(req.query?.offset);
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toLowerCase();

    const conditions = [eq(marketingPress.tenantId, tenant.id)];
    if (status && status !== "all") conditions.push(eq(marketingPress.status, parseStatus(status) as any));
    if (q) conditions.push(or(ilike(marketingPress.title, `%${q}%`), ilike(marketingPress.outlet, `%${q}%`)) as any);

    const items = await db
      .select()
      .from(marketingPress)
      .where(and(...conditions))
      .orderBy(desc(marketingPress.updatedAt), desc(marketingPress.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ ok: true, items, limit, offset, hasMore: items.length === limit });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list press" });
  }
});

router.post("/marketing/press", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const title = scrubLegacyBranding(req.body?.title).trim();
    if (!title) return res.status(400).json({ message: "title required" });
    const slug = slugify(req.body?.slug || title, "press");
    const publishedAt = normalizeDate(req.body?.publishedAt ?? req.body?.published_at);
    const now = new Date();

    const [item] = await db
      .insert(marketingPress)
      .values({
        tenantId: tenant.id,
        slug,
        title,
        outlet: scrubLegacyBranding(req.body?.outlet).trim() || null,
        excerpt: scrubLegacyBranding(req.body?.excerpt).trim() || null,
        externalUrl: scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null,
        thumbnailLocal: String((req.body?.thumbnailLocal ?? req.body?.thumbnail_local) || "").trim() || null,
        tags: parseTags(req.body?.tags),
        status: parseStatus(req.body?.status),
        sortOrder: Number.parseInt(String(req.body?.sortOrder ?? req.body?.sort_order ?? "0"), 10) || 0,
        publishedAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to create press item" });
  }
});

router.patch("/marketing/press/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.marketingPress.findFirst({
      where: and(eq(marketingPress.id, id), eq(marketingPress.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "press item not found" });

    const titleInput = scrubLegacyBranding(req.body?.title).trim();
    const nextTitle = titleInput || current.title;
    const slug = slugify(req.body?.slug || nextTitle || current.slug || `press-${id}`, "press");
    const publishedAt =
      hasBodyField(req.body, "publishedAt") || hasBodyField(req.body, "published_at")
        ? normalizeDate(req.body?.publishedAt ?? req.body?.published_at)
        : current.publishedAt;
    const nextStatus = hasBodyField(req.body, "status") ? parseStatus(req.body?.status, current.status) : current.status;
    const nextSortOrder =
      hasBodyField(req.body, "sortOrder") || hasBodyField(req.body, "sort_order")
        ? parseSortOrder(req.body?.sortOrder ?? req.body?.sort_order, current.sortOrder)
        : current.sortOrder;
    const nextTags = hasBodyField(req.body, "tags") ? parseTags(req.body?.tags) : current.tags;

    const [item] = await db
      .update(marketingPress)
      .set({
        slug,
        title: nextTitle,
        outlet: hasBodyField(req.body, "outlet") ? scrubLegacyBranding(req.body?.outlet).trim() || null : current.outlet,
        excerpt: hasBodyField(req.body, "excerpt") ? scrubLegacyBranding(req.body?.excerpt).trim() || null : current.excerpt,
        externalUrl:
          hasBodyField(req.body, "externalUrl") || hasBodyField(req.body, "external_url")
            ? scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null
            : current.externalUrl,
        thumbnailLocal:
          hasBodyField(req.body, "thumbnailLocal") || hasBodyField(req.body, "thumbnail_local")
            ? String((req.body?.thumbnailLocal ?? req.body?.thumbnail_local) || "").trim() || null
            : current.thumbnailLocal,
        tags: nextTags,
        status: nextStatus as any,
        sortOrder: nextSortOrder,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(marketingPress.id, id), eq(marketingPress.tenantId, tenant.id)))
      .returning();

    if (!item) return res.status(404).json({ message: "press item not found" });
    res.json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to update press item" });
  }
});

router.delete("/marketing/press/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const rows = await db
      .delete(marketingPress)
      .where(and(eq(marketingPress.id, id), eq(marketingPress.tenantId, tenant.id)))
      .returning({ id: marketingPress.id });
    if (!rows.length) return res.status(404).json({ message: "press item not found" });
    res.json({ ok: true, deletedId: rows[0].id });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete press item" });
  }
});

router.get("/marketing/library", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 120, 400);
    const offset = parseOffset(req.query?.offset);
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toLowerCase();

    const conditions = [eq(marketingLibrary.tenantId, tenant.id)];
    if (status && status !== "all") conditions.push(eq(marketingLibrary.status, parseStatus(status) as any));
    if (q) {
      conditions.push(
        or(ilike(marketingLibrary.title, `%${q}%`), ilike(marketingLibrary.description, `%${q}%`), ilike(marketingLibrary.category, `%${q}%`)) as any,
      );
    }

    const items = await db
      .select()
      .from(marketingLibrary)
      .where(and(...conditions))
      .orderBy(desc(marketingLibrary.updatedAt), desc(marketingLibrary.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ ok: true, items, limit, offset, hasMore: items.length === limit });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list library items" });
  }
});

router.get("/marketing/screenshots", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const limit = parseLimit(req.query?.limit, 200, 500);
    const query = String(req.query?.q || "").trim();
    const moduleFilter = String(req.query?.module || "").trim();
    const status = String(req.query?.status || "all").trim().toLowerCase();

    const conditions: any[] = [eq(marketingScreenshots.tenantId, tenant.id)];
    if (status !== "all") conditions.push(eq(marketingScreenshots.status, parseStatus(status, "draft") as any));
    if (moduleFilter) conditions.push(eq(marketingScreenshots.module, moduleFilter));
    if (query) {
      conditions.push(
        or(
          ilike(marketingScreenshots.title, `%${query}%`),
          ilike(marketingScreenshots.caption, `%${query}%`),
          ilike(marketingScreenshots.module, `%${query}%`),
          ilike(marketingScreenshots.slug, `%${query}%`),
        ) as any,
      );
    }

    const items = await db
      .select()
      .from(marketingScreenshots)
      .where(and(...conditions))
      .orderBy(marketingScreenshots.sortOrder, desc(marketingScreenshots.updatedAt))
      .limit(limit);

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list screenshots" });
  }
});

router.post("/marketing/screenshots", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const title = scrubLegacyBranding(req.body?.title);
    const imageLocalPath = String(req.body?.imageLocalPath || "").trim();
    if (!title) return res.status(400).json({ message: "title required" });
    if (!imageLocalPath) return res.status(400).json({ message: "imageLocalPath required" });

    const slug = slugify(req.body?.slug, slugify(title, `shot-${crypto.randomUUID().slice(0, 8)}`));
    const module = scrubLegacyBranding(req.body?.module) || "platform";
    const caption = scrubLegacyBranding(req.body?.caption) || null;
    const tags = parseTags(req.body?.tags);
    const status = parseStatus(req.body?.status, "draft");
    const sortOrder = parseSortOrder(req.body?.sortOrder, 0);

    const [row] = await db
      .insert(marketingScreenshots)
      .values({
        tenantId: tenant.id,
        slug,
        title,
        module,
        caption,
        imageLocalPath,
        tags,
        status: status as any,
        sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json({ ok: true, item: row });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to create screenshot" });
  }
});

router.patch("/marketing/screenshots/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const patch: any = { updatedAt: new Date() };
    if (hasBodyField(req.body, "title")) patch.title = scrubLegacyBranding(req.body?.title);
    if (hasBodyField(req.body, "slug")) patch.slug = slugify(req.body?.slug, `shot-${id}`);
    if (hasBodyField(req.body, "module")) patch.module = scrubLegacyBranding(req.body?.module) || "platform";
    if (hasBodyField(req.body, "caption")) patch.caption = scrubLegacyBranding(req.body?.caption) || null;
    if (hasBodyField(req.body, "imageLocalPath")) patch.imageLocalPath = String(req.body?.imageLocalPath || "").trim();
    if (hasBodyField(req.body, "tags")) patch.tags = parseTags(req.body?.tags);
    if (hasBodyField(req.body, "status")) patch.status = parseStatus(req.body?.status, "draft");
    if (hasBodyField(req.body, "sortOrder")) patch.sortOrder = parseSortOrder(req.body?.sortOrder, 0);

    const [updated] = await db
      .update(marketingScreenshots)
      .set(patch)
      .where(and(eq(marketingScreenshots.tenantId, tenant.id), eq(marketingScreenshots.id, id)))
      .returning();

    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true, item: updated });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to update screenshot" });
  }
});

router.delete("/marketing/screenshots/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const deleted = await db
      .delete(marketingScreenshots)
      .where(and(eq(marketingScreenshots.tenantId, tenant.id), eq(marketingScreenshots.id, id)))
      .returning();

    if (!deleted.length) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete screenshot" });
  }
});

router.post("/marketing/library", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const title = scrubLegacyBranding(req.body?.title).trim();
    if (!title) return res.status(400).json({ message: "title required" });
    const slug = slugify(req.body?.slug || title, "library");
    const publishedAt = normalizeDate(req.body?.publishedAt ?? req.body?.published_at);
    const now = new Date();

    const [item] = await db
      .insert(marketingLibrary)
      .values({
        tenantId: tenant.id,
        slug,
        title,
        description: scrubLegacyBranding(req.body?.description).trim() || null,
        category: scrubLegacyBranding(req.body?.category).trim() || null,
        language: String(req.body?.language || "").trim() || null,
        duration: String(req.body?.duration || "").trim() || null,
        externalUrl: scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null,
        embedUrl: String((req.body?.embedUrl ?? req.body?.embed_url) || "").trim() || null,
        thumbnailLocal: String((req.body?.thumbnailLocal ?? req.body?.thumbnail_local) || "").trim() || null,
        tags: parseTags(req.body?.tags),
        status: parseStatus(req.body?.status),
        sortOrder: Number.parseInt(String(req.body?.sortOrder ?? req.body?.sort_order ?? "0"), 10) || 0,
        publishedAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to create library item" });
  }
});

router.patch("/marketing/library/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.marketingLibrary.findFirst({
      where: and(eq(marketingLibrary.id, id), eq(marketingLibrary.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "library item not found" });

    const titleInput = scrubLegacyBranding(req.body?.title).trim();
    const nextTitle = titleInput || current.title;
    const slug = slugify(req.body?.slug || nextTitle || current.slug || `library-${id}`, "library");
    const publishedAt =
      hasBodyField(req.body, "publishedAt") || hasBodyField(req.body, "published_at")
        ? normalizeDate(req.body?.publishedAt ?? req.body?.published_at)
        : current.publishedAt;
    const nextStatus = hasBodyField(req.body, "status") ? parseStatus(req.body?.status, current.status) : current.status;
    const nextSortOrder =
      hasBodyField(req.body, "sortOrder") || hasBodyField(req.body, "sort_order")
        ? parseSortOrder(req.body?.sortOrder ?? req.body?.sort_order, current.sortOrder)
        : current.sortOrder;
    const nextTags = hasBodyField(req.body, "tags") ? parseTags(req.body?.tags) : current.tags;

    const [item] = await db
      .update(marketingLibrary)
      .set({
        slug,
        title: nextTitle,
        description:
          hasBodyField(req.body, "description") ? scrubLegacyBranding(req.body?.description).trim() || null : current.description,
        category: hasBodyField(req.body, "category") ? scrubLegacyBranding(req.body?.category).trim() || null : current.category,
        language: hasBodyField(req.body, "language") ? String(req.body?.language || "").trim() || null : current.language,
        duration: hasBodyField(req.body, "duration") ? String(req.body?.duration || "").trim() || null : current.duration,
        externalUrl:
          hasBodyField(req.body, "externalUrl") || hasBodyField(req.body, "external_url")
            ? scrubLegacyBranding(req.body?.externalUrl ?? req.body?.external_url).trim() || null
            : current.externalUrl,
        embedUrl:
          hasBodyField(req.body, "embedUrl") || hasBodyField(req.body, "embed_url")
            ? String((req.body?.embedUrl ?? req.body?.embed_url) || "").trim() || null
            : current.embedUrl,
        thumbnailLocal:
          hasBodyField(req.body, "thumbnailLocal") || hasBodyField(req.body, "thumbnail_local")
            ? String((req.body?.thumbnailLocal ?? req.body?.thumbnail_local) || "").trim() || null
            : current.thumbnailLocal,
        tags: nextTags,
        status: nextStatus as any,
        sortOrder: nextSortOrder,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(marketingLibrary.id, id), eq(marketingLibrary.tenantId, tenant.id)))
      .returning();

    if (!item) return res.status(404).json({ message: "library item not found" });
    res.json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to update library item" });
  }
});

router.delete("/marketing/library/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const rows = await db
      .delete(marketingLibrary)
      .where(and(eq(marketingLibrary.id, id), eq(marketingLibrary.tenantId, tenant.id)))
      .returning({ id: marketingLibrary.id });
    if (!rows.length) return res.status(404).json({ message: "library item not found" });
    res.json({ ok: true, deletedId: rows[0].id });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete library item" });
  }
});

router.get("/marketing/media", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 120, 300);
    const offset = parseOffset(req.query?.offset);
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toLowerCase();
    const type = String(req.query?.type || "").trim().toLowerCase();

    const conditions = [eq(marketingMediaItems.tenantId, tenant.id)];
    if (status && status !== "all") conditions.push(eq(marketingMediaItems.status, parseMediaStatus(status) as any));
    if (type && type !== "all") conditions.push(eq(marketingMediaItems.type, parseMediaType(type) as any));
    if (q) {
      conditions.push(or(ilike(marketingMediaItems.title, `%${q}%`), ilike(marketingMediaItems.outlet, `%${q}%`), ilike(marketingMediaItems.url, `%${q}%`)) as any);
    }

    const items = await db
      .select()
      .from(marketingMediaItems)
      .where(and(...conditions))
      .orderBy(desc(marketingMediaItems.updatedAt), desc(marketingMediaItems.createdAt))
      .limit(limit)
      .offset(offset);
    const mapped = items.map((item: any) => ({
      ...item,
      featured: readFeatured(item.raw),
    }));
    res.json({ ok: true, items: mapped, limit, offset, hasMore: items.length === limit });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list media items" });
  }
});

router.post("/marketing/media", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const title = scrubLegacyBranding(req.body?.title).trim();
    const url = scrubLegacyBranding(req.body?.url).trim();
    if (!title) return res.status(400).json({ message: "title required" });
    if (!url) return res.status(400).json({ message: "url required" });

    const now = new Date();
    const id = String(req.body?.id || crypto.randomUUID());
    const featured = hasBodyField(req.body, "featured") ? parseBoolean(req.body?.featured, false) : undefined;
    const rawPayload = withFeaturedRaw(req.body?.raw && typeof req.body.raw === "object" ? req.body.raw : {}, featured);
    const [item] = await db
      .insert(marketingMediaItems)
      .values({
        id,
        tenantId: tenant.id,
        type: parseMediaType(req.body?.type),
        title,
        outlet: scrubLegacyBranding(req.body?.outlet).trim() || null,
        url,
        canonicalUrl: scrubLegacyBranding(req.body?.canonicalUrl ?? req.body?.canonical_url).trim() || null,
        publishedAt: normalizeDate(req.body?.publishedAt ?? req.body?.published_at),
        language: String(req.body?.language || "").trim() || null,
        excerpt: scrubLegacyBranding(req.body?.excerpt).trim() || null,
        summaryBullets: parseTags(req.body?.summaryBullets ?? req.body?.summary_bullets),
        summaryParagraph: scrubLegacyBranding(req.body?.summaryParagraph ?? req.body?.summary_paragraph).trim() || null,
        summaryQuality: String((req.body?.summaryQuality ?? req.body?.summary_quality) || "low").trim() || "low",
        tags: parseTags(req.body?.tags),
        thumbnailRemoteUrl: String((req.body?.thumbnailRemoteUrl ?? req.body?.thumbnail_remote_url) || "").trim() || null,
        thumbnailLocalPath: String((req.body?.thumbnailLocalPath ?? req.body?.thumbnail_local_path) || "").trim() || null,
        mediaEmbedUrl: String((req.body?.mediaEmbedUrl ?? req.body?.media_embed_url) || "").trim() || null,
        author: scrubLegacyBranding(req.body?.author).trim() || null,
        sourceQueries: parseTags(req.body?.sourceQueries ?? req.body?.source_queries),
        relevanceScore: Number.isFinite(Number(req.body?.relevanceScore)) ? Number(req.body.relevanceScore) : 0.5,
        confidenceScore: Number.isFinite(Number(req.body?.confidenceScore)) ? Number(req.body.confidenceScore) : 0.5,
        duplicateOf: String((req.body?.duplicateOf ?? req.body?.duplicate_of) || "").trim() || null,
        status: parseMediaStatus(req.body?.status, "discovered"),
        raw: rawPayload,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json({ ok: true, item: { ...item, featured: readFeatured(item.raw) } });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "URL already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to create media item" });
  }
});

router.patch("/marketing/media/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.marketingMediaItems.findFirst({
      where: and(eq(marketingMediaItems.id, id), eq(marketingMediaItems.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "media item not found" });

    const titleInput = scrubLegacyBranding(req.body?.title).trim();
    const nextTitle = titleInput || current.title;
    const nextUrl =
      hasBodyField(req.body, "url")
        ? scrubLegacyBranding(req.body?.url).trim() || current.url
        : current.url;
    const nextPublishedAt =
      hasBodyField(req.body, "publishedAt") || hasBodyField(req.body, "published_at")
        ? normalizeDate(req.body?.publishedAt ?? req.body?.published_at)
        : current.publishedAt;
    const nextStatus = hasBodyField(req.body, "status") ? parseMediaStatus(req.body?.status, current.status) : current.status;
    const nextType = hasBodyField(req.body, "type") ? parseMediaType(req.body?.type, current.type) : current.type;
    const nextFeatured = hasBodyField(req.body, "featured") ? parseBoolean(req.body?.featured, readFeatured(current.raw)) : undefined;
    const nextRawBase =
      hasBodyField(req.body, "raw") && req.body?.raw && typeof req.body.raw === "object" ? req.body.raw : current.raw;
    const nextRaw = withFeaturedRaw(nextRawBase, nextFeatured);

    const [item] = await db
      .update(marketingMediaItems)
      .set({
        type: nextType as any,
        title: nextTitle,
        outlet: hasBodyField(req.body, "outlet") ? scrubLegacyBranding(req.body?.outlet).trim() || null : current.outlet,
        url: nextUrl,
        canonicalUrl:
          hasBodyField(req.body, "canonicalUrl") || hasBodyField(req.body, "canonical_url")
            ? scrubLegacyBranding(req.body?.canonicalUrl ?? req.body?.canonical_url).trim() || null
            : current.canonicalUrl,
        publishedAt: nextPublishedAt,
        language: hasBodyField(req.body, "language") ? String(req.body?.language || "").trim() || null : current.language,
        excerpt: hasBodyField(req.body, "excerpt") ? scrubLegacyBranding(req.body?.excerpt).trim() || null : current.excerpt,
        summaryBullets:
          hasBodyField(req.body, "summaryBullets") || hasBodyField(req.body, "summary_bullets")
            ? parseTags(req.body?.summaryBullets ?? req.body?.summary_bullets)
            : current.summaryBullets,
        summaryParagraph:
          hasBodyField(req.body, "summaryParagraph") || hasBodyField(req.body, "summary_paragraph")
            ? scrubLegacyBranding(req.body?.summaryParagraph ?? req.body?.summary_paragraph).trim() || null
            : current.summaryParagraph,
        summaryQuality:
          hasBodyField(req.body, "summaryQuality") || hasBodyField(req.body, "summary_quality")
            ? String((req.body?.summaryQuality ?? req.body?.summary_quality) || "low").trim() || "low"
            : current.summaryQuality,
        tags: hasBodyField(req.body, "tags") ? parseTags(req.body?.tags) : current.tags,
        thumbnailRemoteUrl:
          hasBodyField(req.body, "thumbnailRemoteUrl") || hasBodyField(req.body, "thumbnail_remote_url")
            ? String((req.body?.thumbnailRemoteUrl ?? req.body?.thumbnail_remote_url) || "").trim() || null
            : current.thumbnailRemoteUrl,
        thumbnailLocalPath:
          hasBodyField(req.body, "thumbnailLocalPath") || hasBodyField(req.body, "thumbnail_local_path")
            ? String((req.body?.thumbnailLocalPath ?? req.body?.thumbnail_local_path) || "").trim() || null
            : current.thumbnailLocalPath,
        mediaEmbedUrl:
          hasBodyField(req.body, "mediaEmbedUrl") || hasBodyField(req.body, "media_embed_url")
            ? String((req.body?.mediaEmbedUrl ?? req.body?.media_embed_url) || "").trim() || null
            : current.mediaEmbedUrl,
        author: hasBodyField(req.body, "author") ? scrubLegacyBranding(req.body?.author).trim() || null : current.author,
        sourceQueries:
          hasBodyField(req.body, "sourceQueries") || hasBodyField(req.body, "source_queries")
            ? parseTags(req.body?.sourceQueries ?? req.body?.source_queries)
            : current.sourceQueries,
        relevanceScore: hasBodyField(req.body, "relevanceScore") ? parseScore(req.body?.relevanceScore, current.relevanceScore) : current.relevanceScore,
        confidenceScore:
          hasBodyField(req.body, "confidenceScore") ? parseScore(req.body?.confidenceScore, current.confidenceScore) : current.confidenceScore,
        duplicateOf:
          hasBodyField(req.body, "duplicateOf") || hasBodyField(req.body, "duplicate_of")
            ? String((req.body?.duplicateOf ?? req.body?.duplicate_of) || "").trim() || null
            : current.duplicateOf,
        status: nextStatus as any,
        raw: nextRaw,
        updatedAt: new Date(),
      })
      .where(and(eq(marketingMediaItems.id, id), eq(marketingMediaItems.tenantId, tenant.id)))
      .returning();

    res.json({ ok: true, item: { ...item, featured: readFeatured(item.raw) } });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "URL already exists" });
    }
    res.status(500).json({ message: error?.message || "Failed to update media item" });
  }
});

router.post("/marketing/media/:id/verify", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });

    const current = await db.query.marketingMediaItems.findFirst({
      where: and(eq(marketingMediaItems.id, id), eq(marketingMediaItems.tenantId, tenant.id)),
    });
    if (!current) return res.status(404).json({ message: "media item not found" });

    const target = String(current.canonicalUrl || current.url || "").trim();
    const result = await checkUrlOk(target);

    const rawNext = current.raw && typeof current.raw === "object" ? { ...(current.raw as Record<string, unknown>) } : {};
    (rawNext as any).linkCheck = { ok: result.ok, status: result.status, checkedAt: new Date().toISOString() };

    await db
      .update(marketingMediaItems)
      .set({ raw: rawNext as any, updatedAt: new Date() })
      .where(and(eq(marketingMediaItems.id, id), eq(marketingMediaItems.tenantId, tenant.id)));

    res.json({ ok: true, id, verified: result.ok, status: result.status });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to verify url" });
  }
});

router.delete("/marketing/media/:id", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "invalid id" });

    const rows = await db
      .delete(marketingMediaItems)
      .where(and(eq(marketingMediaItems.id, id), eq(marketingMediaItems.tenantId, tenant.id)))
      .returning({ id: marketingMediaItems.id });
    if (!rows.length) return res.status(404).json({ message: "media item not found" });
    res.json({ ok: true, deletedId: rows[0].id });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to delete media item" });
  }
});

router.post("/marketing/media/bulk", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((item: any) => String(item || "").trim()).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ message: "ids required" });

    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!action) return res.status(400).json({ message: "action required" });

    if (action === "publish" || action === "review" || action === "reject") {
      const status = action === "publish" ? "published" : action === "review" ? "reviewed" : "rejected";
      const items = await db
        .update(marketingMediaItems)
        .set({ status: status as any, updatedAt: new Date() })
        .where(and(eq(marketingMediaItems.tenantId, tenant.id), inArray(marketingMediaItems.id, ids)))
        .returning();
      return res.json({ ok: true, updated: items.length, status });
    }

    if (action === "tag") {
      const tag = String(req.body?.tag || "").trim();
      if (!tag) return res.status(400).json({ message: "tag required" });
      const rows = await db.query.marketingMediaItems.findMany({
        where: and(eq(marketingMediaItems.tenantId, tenant.id), inArray(marketingMediaItems.id, ids)),
      });

      const updates = await Promise.all(
        rows.map((row) => {
          const tags = Array.isArray(row.tags) ? new Set(row.tags.map((item) => String(item || "").trim()).filter(Boolean)) : new Set<string>();
          tags.add(tag);
          return db
            .update(marketingMediaItems)
            .set({ tags: Array.from(tags), updatedAt: new Date() })
            .where(and(eq(marketingMediaItems.id, row.id), eq(marketingMediaItems.tenantId, tenant.id)))
            .returning();
        }),
      );

      const updated = updates.reduce((acc, rows) => acc + rows.length, 0);
      return res.json({ ok: true, updated, tag });
    }

    if (action === "mark_duplicate") {
      const duplicateOf = String(req.body?.duplicateOf || "").trim();
      if (!duplicateOf) return res.status(400).json({ message: "duplicateOf required" });
      const items = await db
        .update(marketingMediaItems)
        .set({ duplicateOf, updatedAt: new Date() })
        .where(and(eq(marketingMediaItems.tenantId, tenant.id), inArray(marketingMediaItems.id, ids)))
        .returning();
      return res.json({ ok: true, updated: items.length, duplicateOf });
    }

    if (action === "feature" || action === "unfeature") {
      const featured = action === "feature";
      const rows = await db.query.marketingMediaItems.findMany({
        where: and(eq(marketingMediaItems.tenantId, tenant.id), inArray(marketingMediaItems.id, ids)),
      });
      const updates = await Promise.all(
        rows.map((row) =>
          db
            .update(marketingMediaItems)
            .set({ raw: withFeaturedRaw(row.raw, featured), updatedAt: new Date() })
            .where(and(eq(marketingMediaItems.id, row.id), eq(marketingMediaItems.tenantId, tenant.id)))
            .returning({ id: marketingMediaItems.id }),
        ),
      );
      const updated = updates.reduce((acc, batch) => acc + batch.length, 0);
      return res.json({ ok: true, updated, featured });
    }

    return res.status(400).json({ message: "unsupported action" });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed bulk update" });
  }
});

router.get("/marketing/media/runs", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 20, 100);
    const items = await db.query.marketingMediaRuns.findMany({
      where: eq(marketingMediaRuns.tenantId, tenant.id),
      orderBy: [desc(marketingMediaRuns.startedAt)],
      limit,
    });
    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list media runs" });
  }
});

router.get("/marketing/media/sources", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 40, 200);
    const runId = String(req.query?.runId || "").trim();
    const conditions = [eq(marketingMediaSources.tenantId, tenant.id)];
    if (runId) conditions.push(eq(marketingMediaSources.runId, runId));

    const items = await db
      .select()
      .from(marketingMediaSources)
      .where(and(...conditions))
      .orderBy(desc(marketingMediaSources.fetchedAt))
      .limit(limit);
    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list media sources" });
  }
});

router.get("/marketing/assets", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;
    const limit = parseLimit(req.query?.limit, 100, 400);
    const q = String(req.query?.q || "").trim();
    const conditions = [eq(marketingAssets.tenantId, tenant.id)];
    if (q) conditions.push(or(ilike(marketingAssets.title, `%${q}%`), ilike(marketingAssets.key, `%${q}%`), ilike(marketingAssets.localPath, `%${q}%`)) as any);

    const items = await db
      .select()
      .from(marketingAssets)
      .where(and(...conditions))
      .orderBy(desc(marketingAssets.updatedAt))
      .limit(limit);

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list marketing assets" });
  }
});

export default router;
