#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

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

function parseArgs(argv) {
  const options = {};
  for (const token of argv.slice(2)) {
    const match = String(token).match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    options[match[1]] = match[2];
  }
  return {
    tenantKey: String(options["tenant-key"] || "exportunity").trim().toLowerCase(),
  };
}

async function resolveTenantId(client, tenantKey) {
  const candidates = Array.from(new Set([tenantKey, "exportunity", "exportunity"]));
  for (const key of candidates) {
    const result = await client.query(`select id from tenants where lower(key) = lower($1) limit 1`, [key]);
    if (result.rowCount) return Number(result.rows[0].id);
  }
  const fallback = await client.query(`select id from tenants order by id asc limit 1`);
  if (!fallback.rowCount) throw new Error("No tenant found");
  return Number(fallback.rows[0].id);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function hasBlockedLegacy(value) {
  const text = String(value ?? "").toLowerCase();
  return text.includes("rayon.world") || text.includes("rayonhome") || text.includes("rayon-seller");
}

async function verifyAssetPath(repoRoot, value) {
  const raw = String(value ?? "").trim();
  if (!raw || !raw.startsWith("/")) return true;
  const candidates = [
    path.resolve(repoRoot, "client", "public", raw.replace(/^\//, "")),
    path.resolve(repoRoot, "public", raw.replace(/^\//, "")),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return true;
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  await loadLocalEnv();

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const repoRoot = process.cwd();
  const errors = [];

  try {
    const tenantId = await resolveTenantId(client, args.tenantKey);

    const posts = await client.query(
      `select id, slug, title, status, published_at, cover_image_local, external_url from marketing_posts where tenant_id=$1 and status='published' order by id asc`,
      [tenantId],
    );
    const press = await client.query(
      `select id, slug, title, status, external_url, thumbnail_local from marketing_press where tenant_id=$1 and status='published' order by id asc`,
      [tenantId],
    );
    const library = await client.query(
      `select id, slug, title, status, external_url, embed_url, thumbnail_local from marketing_library where tenant_id=$1 and status='published' order by id asc`,
      [tenantId],
    );

    const postSlugs = new Set();
    for (const row of posts.rows) {
      const slug = String(row.slug || "").trim();
      const title = String(row.title || "").trim();
      if (!slug) errors.push(`posts#${row.id}: missing slug`);
      if (!title) errors.push(`posts#${row.id}: missing title`);
      if (postSlugs.has(slug.toLowerCase())) errors.push(`posts duplicate slug: ${slug}`);
      postSlugs.add(slug.toLowerCase());
      if (hasBlockedLegacy(title) || hasBlockedLegacy(row.external_url)) errors.push(`posts#${row.id}: contains blocked legacy branding`);
      if (!(await verifyAssetPath(repoRoot, row.cover_image_local))) {
        errors.push(`posts#${row.id}: missing local asset ${row.cover_image_local}`);
      }
    }

    const pressSlugs = new Set();
    for (const row of press.rows) {
      const slug = String(row.slug || "").trim();
      if (!slug) errors.push(`press#${row.id}: missing slug`);
      if (!String(row.title || "").trim()) errors.push(`press#${row.id}: missing title`);
      if (!String(row.external_url || "").trim()) errors.push(`press#${row.id}: missing external_url`);
      if (!(await verifyAssetPath(repoRoot, row.thumbnail_local))) {
        errors.push(`press#${row.id}: missing local thumbnail ${row.thumbnail_local}`);
      }
      if (pressSlugs.has(slug.toLowerCase())) errors.push(`press duplicate slug: ${slug}`);
      pressSlugs.add(slug.toLowerCase());
      if (hasBlockedLegacy(row.title) || hasBlockedLegacy(row.external_url)) errors.push(`press#${row.id}: contains blocked legacy branding`);
    }

    const librarySlugs = new Set();
    for (const row of library.rows) {
      const slug = String(row.slug || "").trim();
      if (!slug) errors.push(`library#${row.id}: missing slug`);
      if (!String(row.title || "").trim()) errors.push(`library#${row.id}: missing title`);
      if (!String(row.external_url || "").trim() && !String(row.embed_url || "").trim()) {
        errors.push(`library#${row.id}: missing external_url and embed_url`);
      }
      if (!(await verifyAssetPath(repoRoot, row.thumbnail_local))) {
        errors.push(`library#${row.id}: missing local thumbnail ${row.thumbnail_local}`);
      }
      if (librarySlugs.has(slug.toLowerCase())) errors.push(`library duplicate slug: ${slug}`);
      librarySlugs.add(slug.toLowerCase());
      if (hasBlockedLegacy(row.title) || hasBlockedLegacy(row.external_url) || hasBlockedLegacy(row.embed_url)) {
        errors.push(`library#${row.id}: contains blocked legacy branding`);
      }
    }

    if (errors.length) {
      console.error("[validate-marketing-content] FAILED");
      for (const line of errors) console.error(`- ${line}`);
      process.exit(1);
    }

    console.log(
      `[validate-marketing-content] ok tenant_id=${tenantId} published_posts=${posts.rowCount} published_press=${press.rowCount} published_library=${library.rowCount}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[validate-marketing-content] failed:", error?.message || error);
  process.exit(1);
});
