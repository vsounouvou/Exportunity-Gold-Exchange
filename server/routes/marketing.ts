import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@db";
import { marketingLibrary, marketingMediaItems, marketingPosts, marketingPress, marketingScreenshots } from "@db/schema";

const router = Router();

const LINK_CHECK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const linkCheckCache = new Map<string, { ok: boolean; status: number; checkedAt: number }>();

async function checkUrlOk(url: string): Promise<{ ok: boolean; status: number }> {
  const raw = String(url || "").trim();
  if (!raw) return { ok: false, status: 0 };
  if (!/^https?:\/\//i.test(raw)) return { ok: false, status: 0 };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  const headers = { "user-agent": "ExportunityLinkCheck/1.0" };

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

async function withVerified(items: any[], enabled: boolean) {
  const now = Date.now();
  const out = items.map((item) => {
    const linkCheck = item?.raw && typeof item.raw === "object" ? (item.raw as any).linkCheck : null;
    const checkedAtMs = linkCheck?.checkedAt ? new Date(String(linkCheck.checkedAt)).getTime() : 0;
    const rawOk = Boolean(linkCheck?.ok) && Number.isFinite(checkedAtMs) && now - checkedAtMs < LINK_CHECK_TTL_MS;
    return { ...item, verified: rawOk };
  });
  if (!enabled) return out;

  const targets = out
    .map((item) => String(item?.canonicalUrl || item?.url || "").trim())
    .filter((u) => /^https?:\/\//i.test(u));

  const unique = Array.from(new Set(targets));
  const toCheck: string[] = [];
  for (const url of unique) {
    const alreadyVerified = out.some((item) => item.verified && String(item?.canonicalUrl || item?.url || "").trim() === url);
    if (alreadyVerified) continue;
    const cached = linkCheckCache.get(url);
    if (cached && now - cached.checkedAt < LINK_CHECK_TTL_MS) continue;
    toCheck.push(url);
    if (toCheck.length >= 20) break;
  }

  await Promise.all(
    toCheck.map(async (url) => {
      const result = await checkUrlOk(url);
      linkCheckCache.set(url, { ok: result.ok, status: result.status, checkedAt: Date.now() });
    }),
  );

  return out.map((item) => {
    if (item.verified) return item;
    const key = String(item?.canonicalUrl || item?.url || "").trim();
    const cached = key ? linkCheckCache.get(key) : null;
    return { ...item, verified: Boolean(cached?.ok) };
  });
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

function parseTags(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function asMediaType(raw: unknown) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "video") return "video";
  if (value === "profile") return "profile";
  if (value === "press_release") return "press_release";
  if (value === "podcast") return "podcast";
  if (value === "post") return "post";
  return "article";
}

function mapSeedItem(seed: any, index: number) {
  const note = String(seed?.notes || "").trim();
  return {
    id: `seed-media-${index + 1}`,
    tenantId: 0,
    type: asMediaType(seed?.type),
    title: String(seed?.title || "").trim() || "Featured coverage",
    outlet: String(seed?.outlet || "").trim() || null,
    url: String(seed?.url || "").trim(),
    canonicalUrl: String(seed?.url || "").trim() || null,
    publishedAt: String(seed?.published_at || "").trim() || null,
    language: /\b(fr|français|afrique|bénin)\b/i.test(`${seed?.title || ""} ${note}`) ? "fr" : "en",
    excerpt: note || null,
    summaryBullets: note ? [note] : [],
    summaryParagraph: note || "Featured public coverage about Exportunity and Vital Sounouvou.",
    summaryQuality: "low",
    tags: [...new Set([...parseTags(seed?.tags), "featured", "seed"])],
    thumbnailRemoteUrl: null,
    thumbnailLocalPath: null,
    mediaEmbedUrl: null,
    author: null,
    sourceQueries: ["seed_media"],
    relevanceScore: 0.95,
    confidenceScore: 0.98,
    duplicateOf: null,
    status: "published",
    raw: { seed: true, featured: true, notes: note || null },
    createdAt: null,
    updatedAt: null,
    featured: true,
  };
}

async function readSeedMediaFallback() {
  const filePath = path.resolve(process.cwd(), "content", "media", "seed-media.json");
  return readJsonFile<any[]>(filePath, []);
}

function ensureTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function markdownInline(input: string) {
  const escaped = String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withImages = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    const cleanAlt = String(alt || "").trim();
    const cleanSrc = String(src || "").trim();
    return `<img src="${cleanSrc}" alt="${cleanAlt}" loading="lazy" />`;
  });

  const withLinks = withImages.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const cleanLabel = String(label || "").trim();
    const cleanHref = String(href || "").trim();
    return `<a href="${cleanHref}" target="_blank" rel="noreferrer">${cleanLabel}</a>`;
  });

  return withLinks;
}

function markdownToHtml(markdown: string) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let inList = false;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${markdownInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!inList) return;
    out.push("</ul>");
    inList = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length;
      const content = markdownInline(headingMatch[2] || "");
      out.push(`<h${level}>${content}</h${level}>`);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${markdownInline(listMatch[1] || "")}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  flushParagraph();
  closeList();

  return out.join("\n");
}

function sanitizeHtml(input: string) {
  return String(input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "");
}

function resolvePostContentHtml(post: {
  contentHtml: string | null;
  contentMarkdown: string | null;
}) {
  const htmlRaw = String(post.contentHtml || "").trim();
  if (htmlRaw) return sanitizeHtml(htmlRaw);
  const markdown = String(post.contentMarkdown || "").trim();
  if (!markdown) return "";
  return markdownToHtml(markdown);
}

async function readJsonFile<T>(absolutePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(absolutePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

router.get("/api/marketing/site", async (_req, res) => {
  const root = process.cwd();
  const site = await readJsonFile(path.resolve(root, "content", "marketing", "site.json"), {});
  const showcase = await readJsonFile(path.resolve(root, "content", "platform", "showcase.json"), { items: [] });
  res.json({ ok: true, site, showcase });
});

router.get("/api/marketing/screenshots", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const limit = parseLimit(req.query?.limit, 24, 200);
    const moduleFilter = String(req.query?.module || "").trim();
    const tagFilter = String(req.query?.tag || "").trim().toLowerCase();

    const conditions = [eq(marketingScreenshots.tenantId, tenant.id), eq(marketingScreenshots.status, "published")];
    if (moduleFilter) conditions.push(eq(marketingScreenshots.module, moduleFilter));

    const rows = await db
      .select()
      .from(marketingScreenshots)
      .where(and(...conditions))
      .orderBy(marketingScreenshots.sortOrder, desc(marketingScreenshots.updatedAt))
      .limit(Math.max(limit * 2, 48));

    let items = rows;
    if (tagFilter) {
      items = items.filter((row: any) =>
        Array.isArray(row.tags) ? row.tags.some((t: any) => String(t || "").trim().toLowerCase() === tagFilter) : false,
      );
    }

    const sliced = items.slice(0, limit);
    if (sliced.length) return res.json({ ok: true, items: sliced });

    const root = process.cwd();
    const fallback = await readJsonFile<{ items?: any[] }>(path.resolve(root, "content", "screenshots", "index.json"), { items: [] });
    const rawItems = Array.isArray(fallback?.items) ? fallback.items : [];
    const mapped = rawItems
      .map((entry: any, index: number) => ({
        id: entry?.id ?? `seed-screenshot-${index + 1}`,
        slug: String(entry?.id ?? `seed-screenshot-${index + 1}`),
        title: String(entry?.title || "Workflow proof").trim(),
        module: String(entry?.module || "platform").trim(),
        caption: String(entry?.caption || "").trim() || null,
        imageLocalPath: String(entry?.imagePath || "").trim(),
        tags: Array.isArray(entry?.tags) ? entry.tags : [],
        status: "published",
        sortOrder: Number(entry?.sortOrder || index) || index,
        createdAt: entry?.createdAt || null,
        updatedAt: entry?.createdAt || null,
      }))
      .filter((item) => item.imageLocalPath);

    res.json({ ok: true, items: mapped.slice(0, limit), fallback: true });
  } catch (error: any) {
    try {
      const root = process.cwd();
      const fallback = await readJsonFile<{ items?: any[] }>(path.resolve(root, "content", "screenshots", "index.json"), { items: [] });
      const rawItems = Array.isArray(fallback?.items) ? fallback.items : [];
      const mapped = rawItems
        .map((entry: any, index: number) => ({
          id: entry?.id ?? `seed-screenshot-${index + 1}`,
          slug: String(entry?.id ?? `seed-screenshot-${index + 1}`),
          title: String(entry?.title || "Workflow proof").trim(),
          module: String(entry?.module || "platform").trim(),
          caption: String(entry?.caption || "").trim() || null,
          imageLocalPath: String(entry?.imagePath || "").trim(),
          tags: Array.isArray(entry?.tags) ? entry.tags : [],
          status: "published",
          sortOrder: Number(entry?.sortOrder || index) || index,
          createdAt: entry?.createdAt || null,
          updatedAt: entry?.createdAt || null,
        }))
        .filter((item) => item.imageLocalPath);
      return res.json({ ok: true, items: mapped.slice(0, 24), fallback: true, note: "db_unavailable" });
    } catch {
      res.status(500).json({ message: error?.message || "Failed to load screenshots" });
    }
  }
});

router.get("/api/marketing/posts", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const limit = parseLimit(req.query?.limit, 24, 100);
    const offset = parseOffset(req.query?.offset);
    const query = String(req.query?.q || "").trim();
    const tag = String(req.query?.tag || "").trim().toLowerCase();

    const conditions = [eq(marketingPosts.tenantId, tenant.id), eq(marketingPosts.status, "published")];
    if (query) {
      conditions.push(
        or(
          ilike(marketingPosts.title, `%${query}%`),
          ilike(marketingPosts.excerpt, `%${query}%`),
          ilike(marketingPosts.slug, `%${query}%`),
        ) as any,
      );
    }

    let items = await db
      .select()
      .from(marketingPosts)
      .where(and(...conditions))
      .orderBy(desc(marketingPosts.publishedAt), desc(marketingPosts.updatedAt))
      .limit(Math.max(limit * 2, 50))
      .offset(offset);

    if (tag) {
      items = items.filter((item) =>
        Array.isArray(item.tags) ? item.tags.some((value) => String(value || "").trim().toLowerCase() === tag) : false,
      );
    }

    const sliced = items.slice(0, limit).map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      excerpt: item.excerpt,
      coverImageLocal: item.coverImageLocal,
      tags: item.tags || [],
      externalUrl: item.externalUrl,
      status: item.status,
      publishedAt: item.publishedAt,
      updatedAt: item.updatedAt,
    }));

    res.json({ ok: true, items: sliced, limit, offset, hasMore: items.length > limit });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load posts" });
  }
});

router.get("/api/marketing/posts/:slug", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const slug = String(req.params?.slug || "").trim();
    if (!slug) return res.status(400).json({ message: "slug required" });

    const row = await db.query.marketingPosts.findFirst({
      where: and(eq(marketingPosts.tenantId, tenant.id), eq(marketingPosts.slug, slug), eq(marketingPosts.status, "published")),
    });
    if (!row) return res.status(404).json({ message: "Post not found" });

    const contentHtml = resolvePostContentHtml(row);

    res.json({
      ok: true,
      item: {
        ...row,
        contentHtml,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load post" });
  }
});

router.get("/api/marketing/press", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const limit = parseLimit(req.query?.limit, 50, 200);
    const query = String(req.query?.q || "").trim();

    const conditions = [eq(marketingPress.tenantId, tenant.id), eq(marketingPress.status, "published")];
    if (query) {
      conditions.push(or(ilike(marketingPress.title, `%${query}%`), ilike(marketingPress.outlet, `%${query}%`)) as any);
    }

    const items = await db
      .select()
      .from(marketingPress)
      .where(and(...conditions))
      .orderBy(desc(marketingPress.publishedAt), marketingPress.sortOrder, desc(marketingPress.updatedAt))
      .limit(limit);

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load press" });
  }
});

router.get("/api/marketing/library", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const limit = parseLimit(req.query?.limit, 100, 300);
    const query = String(req.query?.q || "").trim();
    const category = String(req.query?.category || "").trim();

    const conditions = [eq(marketingLibrary.tenantId, tenant.id), eq(marketingLibrary.status, "published")];
    if (query) {
      conditions.push(or(ilike(marketingLibrary.title, `%${query}%`), ilike(marketingLibrary.description, `%${query}%`)) as any);
    }
    if (category) {
      conditions.push(eq(marketingLibrary.category, category));
    }

    const items = await db
      .select()
      .from(marketingLibrary)
      .where(and(...conditions))
      .orderBy(desc(marketingLibrary.publishedAt), marketingLibrary.sortOrder, desc(marketingLibrary.updatedAt))
      .limit(limit);

    res.json({ ok: true, items });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load library" });
  }
});

router.get("/api/marketing/media", async (req: any, res) => {
  try {
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const limit = parseLimit(req.query?.limit, 60, 200);
    const offset = parseOffset(req.query?.offset);
    const query = String(req.query?.q || "").trim();
    const typeFilters = parseTags(req.query?.type).map((value) => value.toLowerCase());
    const tagFilter = String(req.query?.tag || "").trim().toLowerCase();
    const featuredOnly = parseBoolean(req.query?.featured, false);
    const verify = parseBoolean(req.query?.verify, false);

    const conditions = [
      eq(marketingMediaItems.tenantId, tenant.id),
      eq(marketingMediaItems.status, "published"),
      isNull(marketingMediaItems.duplicateOf),
    ];
    if (query) {
      conditions.push(
        or(
          ilike(marketingMediaItems.title, `%${query}%`),
          ilike(marketingMediaItems.outlet, `%${query}%`),
          ilike(marketingMediaItems.excerpt, `%${query}%`),
        ) as any,
      );
    }

    let items = await db
      .select()
      .from(marketingMediaItems)
      .where(and(...conditions))
      .orderBy(desc(marketingMediaItems.publishedAt), desc(marketingMediaItems.updatedAt))
      .limit(Math.max(limit * 2, 100))
      .offset(offset);

    let mapped = items.map((item: any) => ({
      ...item,
      featured: readFeatured(item.raw),
    }));

    if (typeFilters.length) {
      const set = new Set(typeFilters);
      mapped = mapped.filter((item) => set.has(String(item.type || "").toLowerCase()));
    }
    if (tagFilter) {
      mapped = mapped.filter((item) =>
        Array.isArray(item.tags)
          ? item.tags.some((tag: unknown) => String(tag || "").trim().toLowerCase() === tagFilter)
          : false,
      );
    }
    if (featuredOnly) mapped = mapped.filter((item) => Boolean(item.featured));

    mapped.sort((a: any, b: any) => {
      const aFeatured = a.featured ? 1 : 0;
      const bFeatured = b.featured ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;
      const aPublished = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bPublished = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      if (aPublished !== bPublished) return bPublished - aPublished;
      const aUpdated = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bUpdated = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bUpdated - aUpdated;
    });

    if (!mapped.length) {
      const seeds = await readSeedMediaFallback();
      let fallbackItems = seeds.map((seed, index) => mapSeedItem(seed, index));
      if (query) {
        const q = query.toLowerCase();
        fallbackItems = fallbackItems.filter((item) =>
          [item.title, item.outlet, item.excerpt, item.url].some((value) => String(value || "").toLowerCase().includes(q)),
        );
      }
      if (typeFilters.length) {
        const set = new Set(typeFilters);
        fallbackItems = fallbackItems.filter((item) => set.has(String(item.type || "").toLowerCase()));
      }
      if (tagFilter) {
        fallbackItems = fallbackItems.filter((item) =>
          Array.isArray(item.tags) ? item.tags.some((tag: any) => String(tag || "").toLowerCase() === tagFilter) : false,
        );
      }
      if (featuredOnly) fallbackItems = fallbackItems.filter((item) => Boolean(item.featured));
      const slicedFallback = fallbackItems.slice(0, limit);
      const verifiedFallback = await withVerified(slicedFallback, verify);
      return res.json({ ok: true, items: verifiedFallback, limit, offset, hasMore: fallbackItems.length > limit, fallback: true });
    }

    const sliced = mapped.slice(0, limit);
    const verifiedItems = await withVerified(sliced, verify);
    res.json({ ok: true, items: verifiedItems, limit, offset, hasMore: mapped.length > limit });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load media items" });
  }
});

export default router;
