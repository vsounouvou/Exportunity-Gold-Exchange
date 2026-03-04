#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  const options = {};
  for (const token of argv.slice(2)) {
    const match = String(token).match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    options[match[1]] = match[2];
  }
  return {
    commit: flags.has("--commit"),
    dryRun: flags.has("--dry-run") || !flags.has("--commit"),
    tenantKey: String(options["tenant-key"] || "exportunity").trim().toLowerCase(),
  };
}

function stripQuotes(input) {
  const value = String(input ?? "").trim();
  if (!value) return "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

async function loadEnvFile(filePath) {
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
    // optional
  }
}

async function loadLocalEnv() {
  const root = process.cwd();
  await loadEnvFile(path.resolve(root, ".env"));
  await loadEnvFile(path.resolve(root, ".env.local"));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function slugify(input, fallback = "item") {
  const normalized = String(input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function htmlToText(input) {
  return String(input ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function scrubLegacyBranding(input) {
  return String(input ?? "")
    .replace(/https?:\/\/(?:www\.)?rayon\.world\/?/gi, "https://exportunity.net/")
    .replace(/(?:www\.)?rayon\.world/gi, "exportunity.net")
    .replace(/\brayOn\b/g, "Exportunity Platform")
    .replace(/\brayon\b/gi, "Exportunity Platform");
}

function deriveTitleFromSlug(slug) {
  return String(slug || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

async function resolveTenantId(client, tenantKey) {
  const candidates = Array.from(new Set([tenantKey, "exportunity", "exportunity"]));
  for (const key of candidates) {
    const result = await client.query(`select id, key from tenants where lower(key) = lower($1) limit 1`, [key]);
    if (result.rowCount) return Number(result.rows[0].id);
  }
  const fallback = await client.query(`select id from tenants order by id asc limit 1`);
  if (!fallback.rowCount) throw new Error("No tenant found in tenants table");
  return Number(fallback.rows[0].id);
}

async function collectPostFiles(rootDir) {
  if (!(await fileExists(rootDir))) return [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".html")) continue;
    out.push(path.join(rootDir, entry.name));
  }
  out.sort();
  return out;
}

async function extractPostPayload(filePath) {
  const html = await fs.readFile(filePath, "utf8");
  const slug = path.basename(filePath, ".html");
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = scrubLegacyBranding(htmlToText(titleMatch?.[1] || h1Match?.[1] || deriveTitleFromSlug(slug))).slice(0, 220);

  const paragraphMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const excerptSource = paragraphMatch ? htmlToText(paragraphMatch[1]) : htmlToText(html);
  const excerpt = scrubLegacyBranding(excerptSource).slice(0, 320) || null;

  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  const coverImageLocal = imgMatch?.[1] ? String(imgMatch[1]).trim() : null;

  return {
    slug,
    title,
    excerpt,
    contentHtml: scrubLegacyBranding(html),
    coverImageLocal,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  await loadLocalEnv();

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const repoRoot = process.cwd();
  const pressPath = path.resolve(repoRoot, "client", "src", "content", "exportunity", "media-press.json");
  const libraryPath = path.resolve(repoRoot, "client", "src", "content", "exportunity", "library.json");
  const postDir = path.resolve(repoRoot, "client", "public", "exportunity", "posts");

  const summary = {
    mode: args.commit ? "commit" : "dry-run",
    tenantId: 0,
    posts: 0,
    press: 0,
    library: 0,
  };

  try {
    const tenantId = await resolveTenantId(client, args.tenantKey);
    summary.tenantId = tenantId;

    const pressJson = await readJsonSafe(pressPath, { items: [] });
    const libraryJson = await readJsonSafe(libraryPath, { items: [] });
    const postFiles = await collectPostFiles(postDir);

    if (!args.commit) {
      summary.posts = postFiles.length;
      summary.press = Array.isArray(pressJson?.items) ? pressJson.items.length : 0;
      summary.library = Array.isArray(libraryJson?.items) ? libraryJson.items.length : 0;
      console.log(`[marketing:migrate] dry-run tenant_id=${tenantId} posts=${summary.posts} press=${summary.press} library=${summary.library}`);
      return;
    }

    await client.query("begin");

    for (const filePath of postFiles) {
      const payload = await extractPostPayload(filePath);
      const now = new Date();
      await client.query(
        `
        insert into marketing_posts (
          tenant_id, slug, title, excerpt, content_html, cover_image_local, tags,
          external_url, status, sort_order, published_at, created_at, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7::jsonb,
          $8, 'published', $9, $10, $11, $11
        )
        on conflict (tenant_id, slug)
        do update set
          title = excluded.title,
          excerpt = excluded.excerpt,
          content_html = excluded.content_html,
          cover_image_local = excluded.cover_image_local,
          tags = excluded.tags,
          external_url = excluded.external_url,
          status = excluded.status,
          sort_order = excluded.sort_order,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at
        `,
        [
          tenantId,
          payload.slug,
          payload.title,
          payload.excerpt,
          payload.contentHtml,
          payload.coverImageLocal,
          JSON.stringify([]),
          `/post/${payload.slug}`,
          0,
          now,
          now,
        ],
      );
      summary.posts += 1;
    }

    const pressItems = Array.isArray(pressJson?.items) ? pressJson.items : [];
    for (let index = 0; index < pressItems.length; index += 1) {
      const item = pressItems[index] || {};
      const href = String(item.href || item.url || "").trim();
      const slug = slugify(href.startsWith("/post/") ? href.slice("/post/".length) : item.slug || item.title || `press-${index + 1}`, `press-${index + 1}`);
      const title = scrubLegacyBranding(String(item.title || deriveTitleFromSlug(slug))).slice(0, 220);
      const excerpt = scrubLegacyBranding(String(item.summary || item.excerpt || "")).slice(0, 500) || null;
      const externalUrl = href || String(item.externalUrl || "").trim() || `/post/${slug}`;
      const thumbnailLocal = String(item.thumbnailLocal || item.thumbnail || "").trim() || null;
      const now = new Date();

      await client.query(
        `
        insert into marketing_press (
          tenant_id, slug, title, outlet, excerpt, external_url,
          thumbnail_local, tags, status, sort_order, published_at, created_at, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6,
          $7, $8::jsonb, 'published', $9, $10, $11, $11
        )
        on conflict (tenant_id, slug)
        do update set
          title = excluded.title,
          outlet = excluded.outlet,
          excerpt = excluded.excerpt,
          external_url = excluded.external_url,
          thumbnail_local = excluded.thumbnail_local,
          tags = excluded.tags,
          status = excluded.status,
          sort_order = excluded.sort_order,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at
        `,
        [
          tenantId,
          slug,
          title,
          String(item.outlet || "Media").trim() || "Media",
          excerpt,
          externalUrl,
          thumbnailLocal,
          JSON.stringify(Array.isArray(item.tags) ? item.tags : []),
          index,
          null,
          now,
        ],
      );
      summary.press += 1;
    }

    const libraryItems = Array.isArray(libraryJson?.items) ? libraryJson.items : [];
    for (let index = 0; index < libraryItems.length; index += 1) {
      const item = libraryItems[index] || {};
      const href = String(item.href || item.externalUrl || "").trim();
      const slug = slugify(href.startsWith("/post/") ? href.slice("/post/".length) : item.slug || item.title || `library-${index + 1}`, `library-${index + 1}`);
      const title = scrubLegacyBranding(String(item.title || deriveTitleFromSlug(slug))).slice(0, 220);
      const description = scrubLegacyBranding(String(item.summary || item.description || "")).slice(0, 600) || null;
      const category = scrubLegacyBranding(String(item.category || "Library")).slice(0, 120) || "Library";
      const language = String(item.language || "").trim() || null;
      const duration = String(item.duration || "").trim() || null;
      const externalUrl = href || null;
      const embedUrl = String(item.embedUrl || "").trim() || null;
      const thumbnailLocal = String(item.thumbnailLocal || item.thumbnail || "").trim() || null;
      const now = new Date();

      await client.query(
        `
        insert into marketing_library (
          tenant_id, slug, title, description, category, language, duration,
          external_url, embed_url, thumbnail_local, tags, status, sort_order,
          published_at, created_at, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11::jsonb, 'published', $12,
          $13, $14, $14
        )
        on conflict (tenant_id, slug)
        do update set
          title = excluded.title,
          description = excluded.description,
          category = excluded.category,
          language = excluded.language,
          duration = excluded.duration,
          external_url = excluded.external_url,
          embed_url = excluded.embed_url,
          thumbnail_local = excluded.thumbnail_local,
          tags = excluded.tags,
          status = excluded.status,
          sort_order = excluded.sort_order,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at
        `,
        [
          tenantId,
          slug,
          title,
          description,
          category,
          language,
          duration,
          externalUrl,
          embedUrl,
          thumbnailLocal,
          JSON.stringify(Array.isArray(item.tags) ? item.tags : [category]),
          index,
          null,
          now,
        ],
      );
      summary.library += 1;
    }

    await client.query("commit");
    console.log(
      `[marketing:migrate] committed tenant_id=${summary.tenantId} posts=${summary.posts} press=${summary.press} library=${summary.library}`,
    );
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[marketing:migrate] failed:", error?.message || error);
  process.exit(1);
});
