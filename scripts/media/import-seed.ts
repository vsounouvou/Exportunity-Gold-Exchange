#!/usr/bin/env tsx
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type SeedItem = {
  type?: string | null;
  title?: string | null;
  outlet?: string | null;
  published_at?: string | null;
  url?: string | null;
  tags?: string[] | null;
  notes?: string | null;
};

type Metadata = {
  title?: string | null;
  excerpt?: string | null;
  outlet?: string | null;
  canonicalUrl?: string | null;
  publishedAt?: string | null;
  thumbnailRemoteUrl?: string | null;
  mediaEmbedUrl?: string | null;
};

type ScriptArgs = {
  tenantKey: string;
  filePath: string;
};

function stripQuotes(input: unknown) {
  const value = String(input ?? "").trim();
  if (!value) return "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

async function loadEnvFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = stripQuotes(trimmed.slice(eq + 1));
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {
    // optional env file
  }
}

async function loadLocalEnv() {
  const root = process.cwd();
  await loadEnvFile(path.resolve(root, ".env"));
  await loadEnvFile(path.resolve(root, ".env.local"));
}

function parseArgs(argv: string[]): ScriptArgs {
  let tenantKey = "exportunity";
  let filePath = "content/media/seed-media.json";
  for (const token of argv.slice(2)) {
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const value = rest.join("=").trim();
    if (!rawKey || !value) continue;
    if (rawKey === "tenant-key") tenantKey = value.toLowerCase();
    if (rawKey === "file") filePath = value;
  }
  return { tenantKey, filePath };
}

function parseMetaTag(html: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const byName = new RegExp(`<meta[^>]+name=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const byProp = new RegExp(`<meta[^>]+property=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return html.match(byName)?.[1] || html.match(byProp)?.[1] || null;
}

function parseTitle(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function parseCanonical(html: string) {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1] || null;
}

function extractDomain(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeUrl(rawUrl: unknown) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    const tracking = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "igshid",
      "ref",
    ];
    for (const key of tracking) url.searchParams.delete(key);

    if (url.hostname.includes("youtube.com") || url.hostname === "youtu.be") {
      const videoId = url.hostname === "youtu.be" ? url.pathname.replace(/^\//, "") : url.searchParams.get("v");
      if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    }

    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return String(rawUrl || "").trim();
  }
}

function toMediaType(raw: unknown) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "video") return "video";
  if (value === "profile") return "profile";
  if (value === "press_release") return "press_release";
  if (value === "podcast") return "podcast";
  if (value === "post") return "post";
  if (value === "document") return "article";
  return "article";
}

function detectLanguage(input: string) {
  const text = String(input || "").toLowerCase();
  if (/\b(le|la|les|des|avec|afrique|plateforme|fondateur|presse|réussite)\b/.test(text)) return "fr";
  return "en";
}

function coerceTags(input: unknown) {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    );
  }
  const raw = String(input || "").trim();
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function stableMediaId(url: string) {
  const hash = crypto.createHash("sha1").update(url).digest("hex");
  return `media_${hash.slice(0, 24)}`;
}

function parsePublishedAt(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function inferEmbedUrl(rawUrl: string) {
  const normalized = normalizeUrl(rawUrl);
  try {
    const url = new URL(normalized);
    if (url.hostname.includes("youtube.com")) {
      const videoId = url.searchParams.get("v");
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    }
    if (url.hostname === "youtu.be") {
      const videoId = url.pathname.replace(/^\//, "");
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    }
    return null;
  } catch {
    return null;
  }
}

const robotsCache = new Map<string, string>();

async function isRobotsAllowed(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const origin = `${url.protocol}//${url.host}`;
    if (!robotsCache.has(origin)) {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/plain,*/*" },
      });
      robotsCache.set(origin, response.ok ? await response.text() : "");
    }
    const robots = String(robotsCache.get(origin) || "");
    if (!robots) return true;
    return !/User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*$/im.test(robots);
  } catch {
    return true;
  }
}

function extFromContentType(contentType: string) {
  const value = contentType.toLowerCase();
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  if (value.includes("png")) return "png";
  if (value.includes("webp")) return "webp";
  if (value.includes("svg")) return "svg";
  if (value.includes("gif")) return "gif";
  return "jpg";
}

async function downloadThumbnail(rawUrl: string | null) {
  if (!rawUrl) return null;
  const allowed = await isRobotsAllowed(rawUrl);
  if (!allowed) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16_000);
  try {
    const response = await fetch(rawUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "image/*,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return null;
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const ext = extFromContentType(contentType);
    const relativePath = `/assets/media/${hash}.${ext}`;
    const absolutePath = path.resolve(process.cwd(), "client", "public", relativePath.replace(/^\//, ""));
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    return relativePath;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMetadata(rawUrl: string): Promise<Metadata> {
  const normalized = normalizeUrl(rawUrl);
  const embed = inferEmbedUrl(normalized);
  if (/\.pdf(?:$|\?)/i.test(normalized)) {
    return {
      mediaEmbedUrl: embed,
      canonicalUrl: normalized,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16_000);

  try {
    const response = await fetch(normalized, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      return { mediaEmbedUrl: embed, canonicalUrl: normalized };
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("html")) {
      return { mediaEmbedUrl: embed, canonicalUrl: normalized };
    }

    const html = await response.text();
    return {
      title: parseMetaTag(html, "og:title") || parseTitle(html),
      excerpt: parseMetaTag(html, "og:description") || parseMetaTag(html, "description"),
      outlet: parseMetaTag(html, "og:site_name") || extractDomain(normalized),
      canonicalUrl: normalizeUrl(parseCanonical(html) || parseMetaTag(html, "og:url") || normalized),
      publishedAt: parseMetaTag(html, "article:published_time") || parseMetaTag(html, "datePublished"),
      thumbnailRemoteUrl: parseMetaTag(html, "og:image") || parseMetaTag(html, "twitter:image"),
      mediaEmbedUrl: embed,
    };
  } catch {
    return { mediaEmbedUrl: embed, canonicalUrl: normalized };
  } finally {
    clearTimeout(timeout);
  }
}

function buildSummary(seed: SeedItem, metadata: Metadata) {
  const note = String(seed.notes || "").trim();
  const snippet = String(metadata.excerpt || "").trim();
  const bullets = [
    `${seed.outlet || metadata.outlet || extractDomain(String(seed.url || "")) || "Source"} coverage linked to Exportunity/Vital Sounouvou.`,
    note || snippet || "Referenced as part of Exportunity’s public media footprint.",
    "Included in featured media baseline for credibility and continuity.",
  ];
  const summaryParagraph =
    note ||
    "This item strengthens the verified public narrative around Exportunity and founder visibility across institutional, press, and media channels.";
  return {
    bullets: bullets.filter(Boolean).slice(0, 5),
    paragraph: summaryParagraph,
    quality: note.length > 40 || snippet.length > 80 ? "high" : "low",
  };
}

async function resolveTenantId(client: pg.Client, tenantKey: string) {
  const candidates = Array.from(new Set([tenantKey, "exportunity"]));
  for (const key of candidates) {
    const row = await client.query(`select id from tenants where lower(key)=lower($1) limit 1`, [key]);
    if (row.rowCount) return Number(row.rows[0].id);
  }
  const fallback = await client.query(`select id from tenants order by id asc limit 1`);
  if (!fallback.rowCount) throw new Error("No tenant found");
  return Number(fallback.rows[0].id);
}

async function ensureMarketingMediaTables(client: pg.Client) {
  const migrationPath = path.resolve(process.cwd(), "db", "migrations", "20270306_marketing_cms_media.sql");
  try {
    const sql = await fs.readFile(migrationPath, "utf8");
    if (sql.trim()) await client.query(sql);
  } catch {
    // If migration file is missing, continue and let SQL errors surface naturally.
  }
}

async function main() {
  const args = parseArgs(process.argv);
  await loadLocalEnv();

  const dbUrl = String(process.env.DATABASE_URL || "").trim();
  if (!dbUrl) throw new Error("DATABASE_URL is required");

  const seedAbsolute = path.resolve(process.cwd(), args.filePath);
  const raw = await fs.readFile(seedAbsolute, "utf8");
  const seeds = JSON.parse(raw) as SeedItem[];
  if (!Array.isArray(seeds) || !seeds.length) throw new Error("Seed file is empty");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  let created = 0;
  let updated = 0;
  let thumbnailLocalCount = 0;
  let thumbnailRemoteCount = 0;
  let failed = 0;

  try {
    await ensureMarketingMediaTables(client);
    const tenantId = await resolveTenantId(client, args.tenantKey);

    for (const seed of seeds) {
      const url = normalizeUrl(seed.url || "");
      if (!url) {
        failed += 1;
        continue;
      }

      const metadata = await fetchMetadata(url);
      const canonicalUrl = normalizeUrl(metadata.canonicalUrl || url);
      const mergedTags = Array.from(new Set([...coerceTags(seed.tags), "seed", "featured"]));
      const summary = buildSummary(seed, metadata);

      let thumbnailLocalPath: string | null = null;
      if (metadata.thumbnailRemoteUrl) {
        thumbnailLocalPath = await downloadThumbnail(metadata.thumbnailRemoteUrl);
      }
      if (thumbnailLocalPath) thumbnailLocalCount += 1;
      else if (metadata.thumbnailRemoteUrl) thumbnailRemoteCount += 1;

      const row = await client.query(
        `select id, raw from marketing_media_items
         where tenant_id=$1 and (canonical_url=$2 or url=$3)
         limit 1`,
        [tenantId, canonicalUrl, url],
      );

      const rawPayload = {
        seed: true,
        featured: true,
        notes: String(seed.notes || "").trim() || null,
        seedImportedAt: new Date().toISOString(),
      };

      const values = {
        id: stableMediaId(canonicalUrl || url),
        type: toMediaType(seed.type),
        title: String(seed.title || metadata.title || "Untitled media item").trim(),
        outlet: String(seed.outlet || metadata.outlet || extractDomain(url) || "").trim() || null,
        url,
        canonicalUrl: canonicalUrl || null,
        publishedAt: parsePublishedAt(seed.published_at || metadata.publishedAt || null),
        language: detectLanguage(`${seed.title || ""} ${seed.notes || ""}`),
        excerpt: String(metadata.excerpt || seed.notes || "").trim() || null,
        summaryBullets: summary.bullets,
        summaryParagraph: summary.paragraph,
        summaryQuality: summary.quality,
        tags: mergedTags,
        thumbnailRemoteUrl: metadata.thumbnailRemoteUrl || null,
        thumbnailLocalPath,
        mediaEmbedUrl: metadata.mediaEmbedUrl || null,
        sourceQueries: ["seed_media"],
        relevanceScore: 0.95,
        confidenceScore: 0.98,
        status: "published",
      };

      if (row.rowCount) {
        const existing = row.rows[0];
        const mergedRaw = {
          ...(existing.raw && typeof existing.raw === "object" ? existing.raw : {}),
          ...rawPayload,
        };
        await client.query(
          `update marketing_media_items
           set
             type=$3,
             title=$4,
             outlet=$5,
             url=$6,
             canonical_url=$7,
             published_at=coalesce($8::timestamptz, published_at),
             language=coalesce($9, language),
             excerpt=coalesce($10, excerpt),
             summary_bullets=$11::jsonb,
             summary_paragraph=$12,
             summary_quality=$13,
             tags=$14::jsonb,
             thumbnail_remote_url=coalesce($15, thumbnail_remote_url),
             thumbnail_local_path=coalesce($16, thumbnail_local_path),
             media_embed_url=coalesce($17, media_embed_url),
             source_queries=$18::jsonb,
             relevance_score=$19,
             confidence_score=$20,
             status='published',
             raw=$21::jsonb,
             updated_at=$22
           where tenant_id=$1 and id=$2`,
          [
            tenantId,
            String(existing.id),
            values.type,
            values.title,
            values.outlet,
            values.url,
            values.canonicalUrl,
            values.publishedAt,
            values.language,
            values.excerpt,
            JSON.stringify(values.summaryBullets),
            values.summaryParagraph,
            values.summaryQuality,
            JSON.stringify(values.tags),
            values.thumbnailRemoteUrl,
            values.thumbnailLocalPath,
            values.mediaEmbedUrl,
            JSON.stringify(values.sourceQueries),
            values.relevanceScore,
            values.confidenceScore,
            JSON.stringify(mergedRaw),
            new Date(),
          ],
        );
        updated += 1;
      } else {
        await client.query(
          `insert into marketing_media_items (
            id, tenant_id, type, title, outlet, url, canonical_url, published_at,
            language, excerpt, summary_bullets, summary_paragraph, summary_quality,
            tags, thumbnail_remote_url, thumbnail_local_path, media_embed_url, author,
            source_queries, relevance_score, confidence_score, duplicate_of, status,
            raw, created_at, updated_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,
            $9,$10,$11::jsonb,$12,$13,
            $14::jsonb,$15,$16,$17,$18,
            $19::jsonb,$20,$21,$22,$23,
            $24::jsonb,$25,$25
          )`,
          [
            values.id,
            tenantId,
            values.type,
            values.title,
            values.outlet,
            values.url,
            values.canonicalUrl,
            values.publishedAt,
            values.language,
            values.excerpt,
            JSON.stringify(values.summaryBullets),
            values.summaryParagraph,
            values.summaryQuality,
            JSON.stringify(values.tags),
            values.thumbnailRemoteUrl,
            values.thumbnailLocalPath,
            values.mediaEmbedUrl,
            null,
            JSON.stringify(values.sourceQueries),
            values.relevanceScore,
            values.confidenceScore,
            null,
            values.status,
            JSON.stringify(rawPayload),
            new Date(),
          ],
        );
        created += 1;
      }
    }

    console.log(
      `[media:seed] tenant=${args.tenantKey} created=${created} updated=${updated} thumbnails_local=${thumbnailLocalCount} thumbnails_remote=${thumbnailRemoteCount} failed=${failed}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: any) => {
  console.error("[media:seed] failed:", error?.message || error);
  process.exit(1);
});
