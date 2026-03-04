import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@db";
import { contactMessages, marketingLibrary, marketingPosts, marketingPress, websiteSettings } from "@db/schema";

import { ensureTenantAdmin } from "./utils/auth";

const router = Router();
const publicApi = Router();
const adminApi = Router();

type HozCollectionKind = "books" | "jewelry";

const HOZ_SITE_DEFAULTS: Record<string, Record<string, unknown>> = {
  "home.hero": {
    title: "House of Zogue",
    subtitle: "Books, jewelry, and cultural media",
    ctaLabel: "Enter the house",
    ctaHref: "/books",
  },
  "home.doctrine": {
    heading: "Doctrine",
    points: [
      "Curate objects with narrative value.",
      "Protect editorial quality.",
      "Scale through disciplined publishing systems.",
    ],
  },
  "home.press": {
    heading: "Press and Features",
    blurb: "Selected mentions and stories from the House of Zogue newsroom.",
  },
  "home.contact": {
    heading: "Contact",
    email: "editorial@houseofzogue.com",
    whatsapp: "+22900000000",
  },
};

function ensureHozTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant || String(tenant.key || "").trim().toLowerCase() !== "hoz") {
    res.status(404).json({ message: "House of Zogue routes are unavailable on this tenant host" });
    return null;
  }
  return tenant;
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeLimit(value: unknown, fallback = 40, max = 200) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(Math.trunc(parsed), max));
}

function normalizeCategory(value: unknown): HozCollectionKind | null {
  const raw = normalizeText(value).toLowerCase();
  if (raw === "books" || raw === "book") return "books";
  if (raw === "jewelry" || raw === "jewel" || raw === "jewellery") return "jewelry";
  return null;
}

function slugify(value: unknown, fallback: string) {
  const normalized = normalizeText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) => normalizeText(entry)).filter(Boolean)));
  }
  const raw = normalizeText(value);
  if (!raw) return [];
  return Array.from(new Set(raw.split(",").map((entry) => normalizeText(entry)).filter(Boolean)));
}

function parseJsonValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  const raw = normalizeText(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // ignore parsing failures and store as plain text in content key
  }
  return { content: raw };
}

function resolveScope(tenantId: number) {
  return `tenant:${tenantId}:hoz`;
}

async function readSiteSettings(tenantId: number) {
  const scope = resolveScope(tenantId);
  const rows = await db.query.websiteSettings.findMany({
    where: eq(websiteSettings.scope, scope),
    orderBy: [desc(websiteSettings.updatedAt)],
    limit: 200,
  });

  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    byKey.set(String(row.key || ""), (row.value as Record<string, unknown>) || {});
  }

  const merged: Record<string, Record<string, unknown>> = {};
  for (const [key, fallback] of Object.entries(HOZ_SITE_DEFAULTS)) {
    merged[key] = byKey.get(key) || fallback;
  }

  for (const [key, value] of byKey.entries()) {
    if (!merged[key]) merged[key] = value;
  }

  return { scope, rows, content: merged };
}

publicApi.get("/public/content", async (req: any, res) => {
  try {
    const tenant = ensureHozTenant(req, res);
    if (!tenant) return;
    const payload = await readSiteSettings(Number(tenant.id));
    return res.json({ ok: true, content: payload.content });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load House of Zogue content" });
  }
});

publicApi.get("/public/collections", async (req: any, res) => {
  try {
    const tenant = ensureHozTenant(req, res);
    if (!tenant) return;
    const kind = normalizeCategory(req.query?.kind);
    const limit = normalizeLimit(req.query?.limit, 24, 120);

    const rows = await db.query.marketingLibrary.findMany({
      where: and(
        eq(marketingLibrary.tenantId, Number(tenant.id)),
        kind ? eq(marketingLibrary.category, kind) : undefined,
      ),
      orderBy: [desc(marketingLibrary.updatedAt), desc(marketingLibrary.createdAt)],
      limit,
    });

    return res.json({ ok: true, items: rows });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load House of Zogue collections" });
  }
});

publicApi.get("/public/media", async (req: any, res) => {
  try {
    const tenant = ensureHozTenant(req, res);
    if (!tenant) return;
    const limit = normalizeLimit(req.query?.limit, 20, 100);

    const [press, posts] = await Promise.all([
      db.query.marketingPress.findMany({
        where: eq(marketingPress.tenantId, Number(tenant.id)),
        orderBy: [desc(marketingPress.updatedAt), desc(marketingPress.createdAt)],
        limit,
      }),
      db.query.marketingPosts.findMany({
        where: eq(marketingPosts.tenantId, Number(tenant.id)),
        orderBy: [desc(marketingPosts.updatedAt), desc(marketingPosts.createdAt)],
        limit,
      }),
    ]);

    return res.json({ ok: true, press, posts });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load House of Zogue media" });
  }
});

publicApi.post("/public/contact", async (req: any, res) => {
  try {
    const tenant = ensureHozTenant(req, res);
    if (!tenant) return;

    const fullName = normalizeText(req.body?.fullName || req.body?.name);
    const email = normalizeText(req.body?.email);
    const message = normalizeText(req.body?.message);
    const company = normalizeText(req.body?.company);
    const phone = normalizeText(req.body?.phone);

    if (!fullName || !email || !message) {
      return res.status(400).json({ message: "fullName, email, and message are required" });
    }

    const [firstName, ...rest] = fullName.split(" ").filter(Boolean);
    const lastName = rest.join(" ").trim() || firstName;

    const [created] = await db
      .insert(contactMessages)
      .values({
        tenantId: Number(tenant.id),
        firstName,
        lastName,
        email,
        phone: phone || null,
        company: company || null,
        message,
        source: "hoz.public.contact",
        notifyStatus: "pending",
        userAgent: normalizeText(req.headers["user-agent"]) || null,
        ip: normalizeText(req.ip) || null,
        createdAt: new Date(),
      })
      .returning({ id: contactMessages.id, createdAt: contactMessages.createdAt });

    return res.status(201).json({ ok: true, item: created });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to submit House of Zogue contact request" });
  }
});

adminApi.use(ensureTenantAdmin);

adminApi.use((req: any, res: any, next: any) => {
  const tenant = ensureHozTenant(req, res);
  if (!tenant) return;
  next();
});

adminApi.get("/dashboard", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const tenantId = Number(tenant.id);

    const [books, jewelry, posts, press, inbox] = await Promise.all([
      db.query.marketingLibrary.findMany({
        where: and(eq(marketingLibrary.tenantId, tenantId), eq(marketingLibrary.category, "books")),
        columns: { id: true },
        limit: 1000,
      }),
      db.query.marketingLibrary.findMany({
        where: and(eq(marketingLibrary.tenantId, tenantId), eq(marketingLibrary.category, "jewelry")),
        columns: { id: true },
        limit: 1000,
      }),
      db.query.marketingPosts.findMany({
        where: eq(marketingPosts.tenantId, tenantId),
        columns: { id: true },
        limit: 1000,
      }),
      db.query.marketingPress.findMany({
        where: eq(marketingPress.tenantId, tenantId),
        columns: { id: true },
        limit: 1000,
      }),
      db.query.contactMessages.findMany({
        where: eq(contactMessages.tenantId, tenantId),
        columns: { id: true },
        limit: 1000,
      }),
    ]);

    const settings = await readSiteSettings(tenantId);

    return res.json({
      ok: true,
      metrics: {
        books: books.length,
        jewelry: jewelry.length,
        posts: posts.length,
        press: press.length,
        inbox: inbox.length,
        siteBlocks: Object.keys(settings.content).length,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load House of Zogue dashboard" });
  }
});

adminApi.get("/content/site", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const payload = await readSiteSettings(tenantId);
    return res.json({ ok: true, scope: payload.scope, content: payload.content, items: payload.rows });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load House of Zogue site content" });
  }
});

adminApi.put("/content/site/:key", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const key = normalizeText(req.params?.key);
    if (!key) return res.status(400).json({ message: "key is required" });

    const value = parseJsonValue(req.body?.value ?? req.body);
    const scope = resolveScope(tenantId);
    const actor = normalizeText(req.adminUser?.email || req.adminUser?.displayName || "admin");

    const [item] = await db
      .insert(websiteSettings)
      .values({
        scope,
        key,
        value,
        updatedAt: new Date(),
        updatedBy: actor,
      })
      .onConflictDoUpdate({
        target: [websiteSettings.scope, websiteSettings.key],
        set: {
          value,
          updatedAt: new Date(),
          updatedBy: actor,
        },
      })
      .returning();

    return res.json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to update House of Zogue site content" });
  }
});

adminApi.get("/content/library", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const kind = normalizeCategory(req.query?.kind);
    const limit = normalizeLimit(req.query?.limit, 120, 400);

    const items = await db.query.marketingLibrary.findMany({
      where: and(eq(marketingLibrary.tenantId, tenantId), kind ? eq(marketingLibrary.category, kind) : undefined),
      orderBy: [desc(marketingLibrary.updatedAt), desc(marketingLibrary.createdAt)],
      limit,
    });

    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to list House of Zogue collections" });
  }
});

adminApi.post("/content/library", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const title = normalizeText(req.body?.title);
    if (!title) return res.status(400).json({ message: "title is required" });
    const kind = normalizeCategory(req.body?.category) || "books";
    const now = new Date();

    const [item] = await db
      .insert(marketingLibrary)
      .values({
        tenantId,
        slug: slugify(req.body?.slug || title, `hoz-item-${Date.now()}`),
        title,
        description: normalizeText(req.body?.description) || null,
        category: kind,
        externalUrl: normalizeText(req.body?.externalUrl || req.body?.external_url) || null,
        thumbnailLocal: normalizeText(req.body?.thumbnailLocal || req.body?.thumbnail_local) || null,
        tags: parseTags(req.body?.tags),
        status: "published",
        sortOrder: Number.parseInt(String(req.body?.sortOrder || 0), 10) || 0,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return res.status(201).json({ ok: true, item });
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "slug already exists" });
    }
    return res.status(500).json({ message: error?.message || "Failed to create House of Zogue collection item" });
  }
});

adminApi.get("/content/posts", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const limit = normalizeLimit(req.query?.limit, 120, 400);
    const items = await db.query.marketingPosts.findMany({
      where: eq(marketingPosts.tenantId, tenantId),
      orderBy: [desc(marketingPosts.updatedAt), desc(marketingPosts.createdAt)],
      limit,
    });
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to list House of Zogue posts" });
  }
});

adminApi.get("/content/press", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const limit = normalizeLimit(req.query?.limit, 120, 400);
    const items = await db.query.marketingPress.findMany({
      where: eq(marketingPress.tenantId, tenantId),
      orderBy: [desc(marketingPress.updatedAt), desc(marketingPress.createdAt)],
      limit,
    });
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to list House of Zogue press items" });
  }
});

adminApi.get("/inbox", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const limit = normalizeLimit(req.query?.limit, 120, 400);
    const items = await db.query.contactMessages.findMany({
      where: eq(contactMessages.tenantId, tenantId),
      orderBy: [desc(contactMessages.createdAt)],
      limit,
    });
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to list House of Zogue inbox" });
  }
});

adminApi.patch("/inbox/:id", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const id = Number.parseInt(String(req.params?.id || ""), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "valid id is required" });

    const notifyStatus = normalizeText(req.body?.notifyStatus || req.body?.status).toLowerCase();
    const nextStatus = notifyStatus === "sent" || notifyStatus === "failed" || notifyStatus === "skipped" ? notifyStatus : "pending";
    const notifyError = normalizeText(req.body?.notifyError || req.body?.error) || null;

    const [item] = await db
      .update(contactMessages)
      .set({
        notifyStatus: nextStatus,
        notifyError,
        notifiedAt: nextStatus === "sent" ? new Date() : null,
      })
      .where(and(eq(contactMessages.id, id), eq(contactMessages.tenantId, tenantId)))
      .returning();

    if (!item) return res.status(404).json({ message: "message not found" });
    return res.json({ ok: true, item });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to update House of Zogue inbox item" });
  }
});

adminApi.get("/settings", async (req: any, res) => {
  try {
    const tenantId = Number(req.tenant.id);
    const site = await readSiteSettings(tenantId);
    return res.json({
      ok: true,
      tenant: { id: tenantId, key: "hoz", name: req.tenant?.name || "House of Zogue" },
      siteContent: site.content,
      integrations: {
        publishing: ["marketing_posts", "marketing_press", "marketing_library"],
        inbox: "contact_messages",
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load House of Zogue settings" });
  }
});

router.use("/api/hoz", publicApi);
router.use("/api/admin/hoz", adminApi);

export default router;
