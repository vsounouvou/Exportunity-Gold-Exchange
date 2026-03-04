#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

const CORE_QUERIES = [
  "Exportunity",
  "Exportunity Group",
  "Exportunity Group LTD",
  "Exportunity group Africa trade platform",
  "Exportunity.net",
  "exportunity",
  "exportunity startup Benin",
  "Vital Sounouvou Exportunity",
  "\"Vital Sounouvou\" interview",
  "\"Vital Sounouvou\" fondateur",
  "XportCARD UBA Exportunity",
  "Exportunity Air Ledger",
  "rayOn by Exportunity",
  "Exportunity Afrique commerce",
  "Exportunity plateforme Afrique",
  "Exportunity startup Benin",
  "Exportunity fintech Afrique",
  "Exportunity commerce transfrontalier",
  "Exportunity plateforme d'exportation",
  "Vital Sounouvou Exportunity Benin",
  "site:tonyelumelufoundation.org Vital Sounouvou Exportunity",
  "site:tonyelumelufoundation.org Exportunity",
  "site:wearetech.africa Exportunity",
  "site:jeuneafrique.com Exportunity",
  "site:cnn.com Exportunity",
  "site:seed.stanford.edu Vital Sounouvou",
  "site:tv5monde.com Exportunity Vital Sounouvou",
  "site:youtube.com Exportunity Sounouvou",
  "site:facebook.com Exportunity plateforme beninoise",
  "site:facebook.com canal+ benin exportunity",
  "site:linkedin.com/in/vitalsounouvou",
  "Exportunity plateforme beninoise",
  "Exportunity commerce Afrique",
  "Vital Sounouvou interview",
];

const YOUTUBE_QUERIES = [
  "Vital Sounouvou Exportunity",
  "Exportunity TV5MONDE",
  "Exportunity Réussite",
  "Canal+ Benin Exportunity",
  "Exportunity interview",
];

const DEFAULT_MANUAL_SEEDS = [
  {
    type: "profile",
    title: "Tony Elumelu Foundation - Vital Sounouvou profile",
    url: "https://www.tonyelumelufoundation.org/member/vital-sounouvou",
    notes: "Profile mentioning Exportunity and operational metrics.",
  },
  {
    type: "article",
    title: "WeAreTech Africa - Exportunity.net",
    url: "https://www.wearetech.africa/en/fils-uk/tech-stars/beninese-born-vital-sounouvou-expands-smes-export-opportunities",
    notes: "Feature article about Exportunity.net.",
  },
  {
    type: "article",
    title: "Jeune Afrique - Start-up de la semaine",
    url: "https://www.jeuneafrique.com/mag/537165/economie/start-up-de-la-semaine-exportunity-un-carnet-dadresses-pour-faciliter-le-business-en-afrique/",
    notes: "Jeune Afrique profile mentioning Exportunity.",
  },
];

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
  const mode = String(argv[2] || "refresh").trim().toLowerCase();
  const options = {};
  for (const token of argv.slice(3)) {
    const match = String(token).match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    options[match[1]] = match[2];
  }
  return {
    mode,
    tenantKey: String(options["tenant-key"] || "exportunity").trim().toLowerCase(),
    limit: Number.parseInt(String(options["limit"] || "120"), 10) || 120,
  };
}

async function loadManualSeeds() {
  const filePath = path.resolve(process.cwd(), "content", "media", "seed-media.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        title: String(item?.title || "").trim(),
        url: normalizeUrl(item?.url || ""),
        snippet: String(item?.notes || "").trim(),
        outlet: String(item?.outlet || "").trim() || extractDomain(item?.url || ""),
        provider: "manual",
        type: inferType(item?.url || ""),
        raw: item,
      }))
      .filter((item) => item.title && item.url);
  } catch {
    return DEFAULT_MANUAL_SEEDS.map((item) => ({
      title: String(item.title || "").trim(),
      url: normalizeUrl(item.url || ""),
      snippet: String(item.notes || "").trim(),
      outlet: extractDomain(item.url || ""),
      provider: "manual",
      type: inferType(item.url || ""),
      raw: item,
    })).filter((item) => item.title && item.url);
  }
}

function normalizeUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""));
    const keysToDelete = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "igshid", "ref"];
    for (const key of keysToDelete) url.searchParams.delete(key);

    if (url.hostname.includes("youtube.com") || url.hostname === "youtu.be") {
      const id = url.hostname === "youtu.be" ? url.pathname.replace(/^\//, "") : url.searchParams.get("v");
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }

    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return String(rawUrl || "").trim();
  }
}

function extractDomain(rawUrl) {
  try {
    return new URL(String(rawUrl || "")).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function inferType(rawUrl) {
  const value = String(rawUrl || "").toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be") || value.includes("facebook.com") || value.includes("watch")) return "video";
  if (value.includes("linkedin.com/in/") || value.includes("profile")) return "profile";
  if (value.includes("podcast")) return "podcast";
  return "article";
}

function detectLanguage(text) {
  const raw = String(text || "").toLowerCase();
  if (/\b(le|la|les|des|dans|pour|avec|afrique|plateforme)\b/.test(raw)) return "fr";
  return "en";
}

function scoreDomain(domain) {
  const top = [
    "tonyelumelufoundation.org",
    "wearetech.africa",
    "jeuneafrique.com",
    "youtube.com",
    "facebook.com",
    "tv5monde.com",
    "cnn.com",
    "seed.stanford.edu",
    "exportunity.com",
  ];
  if (top.some((item) => domain.includes(item))) return 0.2;
  return 0.05;
}

function computeRelevance(input) {
  const text = `${input.title || ""} ${input.snippet || ""} ${input.url || ""}`.toLowerCase();
  let score = 0;
  if (/\b(?:exportunity|exportunity)\b/.test(text)) score += 0.55;
  if (text.includes("vital sounouvou")) score += 0.3;
  if (text.includes("trade") || text.includes("fintech") || text.includes("africa") || text.includes("benin")) score += 0.15;
  score += scoreDomain(extractDomain(input.url));
  if (score > 1) score = 1;
  return score;
}

function summarizeFromMetadata(item) {
  const domain = extractDomain(item.url);
  const outlet = item.outlet || domain || "Source";
  const excerpt = String(item.excerpt || "").trim();

  const bullets = [
    `${outlet} mentions ${item.title}.`,
    item.type === "video" ? "Content format is video/interview coverage." : "Content appears as an article/profile reference.",
  ];

  if (excerpt) bullets.push(excerpt.slice(0, 160));
  if (item.relevanceScore >= 0.65) bullets.push("High confidence match with Exportunity context.");
  else bullets.push("Needs editorial review for confidence.");

  const paragraph = `This item contributes to Exportunity public visibility tracking across media and institutional sources. It should be reviewed for context accuracy before final publication.`;

  const tags = new Set();
  const text = `${item.title} ${item.excerpt || ""}`.toLowerCase();
  if (text.includes("trade")) tags.add("trade");
  if (text.includes("fintech")) tags.add("fintech");
  if (text.includes("benin")) tags.add("Benin");
  if (text.includes("africa")) tags.add("Africa");
  if (text.includes("platform")) tags.add("platform");
  if (text.includes("payment")) tags.add("payments");
  if (!tags.size) tags.add("media");

  return {
    summaryBullets: bullets.slice(0, 5),
    summaryParagraph: paragraph,
    tags: Array.from(tags),
    language: detectLanguage(`${item.title} ${item.excerpt || ""}`),
    summaryQuality: excerpt.length > 80 ? "high" : "low",
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/plain,*/*",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, json, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function searchSerpApi(query, apiKey) {
  const url = `https://serpapi.com/search.json?engine=google&num=10&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetchJson(url);
  if (!response.ok || !response.json) return [];
  const organic = Array.isArray(response.json.organic_results) ? response.json.organic_results : [];
  return organic.map((item) => ({
    title: String(item.title || "").trim(),
    snippet: String(item.snippet || "").trim(),
    url: normalizeUrl(item.link || ""),
    outlet: String(item.source || "").trim() || extractDomain(item.link || ""),
    provider: "serpapi",
    raw: item,
  }));
}

async function searchBing(query, apiKey) {
  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=10&mkt=en-US`;
  const response = await fetchJson(url, { headers: { "Ocp-Apim-Subscription-Key": apiKey } });
  if (!response.ok || !response.json) return [];
  const items = Array.isArray(response.json?.webPages?.value) ? response.json.webPages.value : [];
  return items.map((item) => ({
    title: String(item.name || "").trim(),
    snippet: String(item.snippet || "").trim(),
    url: normalizeUrl(item.url || ""),
    outlet: extractDomain(item.url || ""),
    provider: "bing",
    raw: item,
  }));
}

async function searchGoogleCse(query, apiKey, cx) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&num=10&q=${encodeURIComponent(query)}`;
  const response = await fetchJson(url);
  if (!response.ok || !response.json) return [];
  const items = Array.isArray(response.json.items) ? response.json.items : [];
  return items.map((item) => ({
    title: String(item.title || "").trim(),
    snippet: String(item.snippet || "").trim(),
    url: normalizeUrl(item.link || ""),
    outlet: extractDomain(item.link || ""),
    provider: "gcs",
    raw: item,
  }));
}

async function searchYouTube(query, apiKey) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`;
  const response = await fetchJson(url);
  if (!response.ok || !response.json) return [];
  const items = Array.isArray(response.json.items) ? response.json.items : [];
  return items
    .map((item) => {
      const videoId = String(item?.id?.videoId || "").trim();
      if (!videoId) return null;
      const snippet = item?.snippet || {};
      return {
        title: String(snippet.title || "").trim(),
        snippet: String(snippet.description || "").trim(),
        url: normalizeUrl(`https://www.youtube.com/watch?v=${videoId}`),
        outlet: String(snippet.channelTitle || "YouTube").trim(),
        provider: "youtube",
        publishedAt: String(snippet.publishedAt || "").trim() || null,
        raw: item,
      };
    })
    .filter(Boolean);
}

async function resolveTenantId(client, tenantKey) {
  const candidates = Array.from(new Set([tenantKey, "exportunity", "exportunity"]));
  for (const key of candidates) {
    const row = await client.query(`select id from tenants where lower(key)=lower($1) limit 1`, [key]);
    if (row.rowCount) return Number(row.rows[0].id);
  }
  const fallback = await client.query(`select id from tenants order by id asc limit 1`);
  if (!fallback.rowCount) throw new Error("No tenant found");
  return Number(fallback.rows[0].id);
}

async function ensureMarketingMediaTables(client) {
  const migrationPath = path.resolve(process.cwd(), "db", "migrations", "20270306_marketing_cms_media.sql");
  try {
    const sql = await fs.readFile(migrationPath, "utf8");
    if (sql.trim()) await client.query(sql);
  } catch {
    // optional; if missing, downstream queries will surface the problem.
  }
}

function makeRunId() {
  return `media_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
}

function stableMediaId(url) {
  const hash = crypto.createHash("sha1").update(String(url || "")).digest("hex");
  return `media_${hash.slice(0, 24)}`;
}

async function insertSourceRecord(client, tenantId, payload) {
  await client.query(
    `insert into marketing_media_sources (tenant_id, provider, query, run_id, fetched_at, raw, created_at)
     values ($1,$2,$3,$4,$5,$6::jsonb,$5)`,
    [tenantId, payload.provider, payload.query, payload.runId, new Date(), JSON.stringify(payload.raw || {})],
  );
}

async function upsertMediaCandidate(client, tenantId, candidate) {
  const normalizedUrl = normalizeUrl(candidate.url);
  if (!normalizedUrl) return { created: false, updated: false };

  const relevance = computeRelevance(candidate);
  const confidence = Math.min(1, Math.max(0, relevance + 0.05));
  const status = relevance < 0.35 ? "rejected" : "discovered";
  const sourceQueries = Array.from(new Set((candidate.sourceQueries || []).filter(Boolean)));
  const now = new Date();
  const fromManualSeed = sourceQueries.includes("manual_seed");

  const existing = await client.query(
    `select id, source_queries, status, raw
     from marketing_media_items
     where tenant_id=$1 and url=$2
     limit 1`,
    [tenantId, normalizedUrl],
  );
  if (existing.rowCount) {
    const row = existing.rows[0];
    let mergedSourceQueries = [];
    if (Array.isArray(row.source_queries)) mergedSourceQueries = row.source_queries.map((value) => String(value || "").trim()).filter(Boolean);
    mergedSourceQueries = Array.from(new Set([...mergedSourceQueries, ...sourceQueries]));
    const nextStatus = row.status === "published" ? "published" : status;
    const existingRaw = row.raw && typeof row.raw === "object" ? row.raw : {};
    const candidateRaw = candidate.raw && typeof candidate.raw === "object" ? candidate.raw : {};
    const fromManualSeed = mergedSourceQueries.includes("manual_seed");
    const mergedRaw = {
      ...existingRaw,
      ...candidateRaw,
    };
    if (existingRaw.seed === true || fromManualSeed) mergedRaw.seed = true;
    if (existingRaw.featured === true || fromManualSeed) mergedRaw.featured = true;

    await client.query(
      `update marketing_media_items
       set
         type=$3,
         title=coalesce(nullif($4,''), title),
         outlet=coalesce(nullif($5,''), outlet),
         excerpt=coalesce(nullif($6,''), excerpt),
         source_queries=$7::jsonb,
         relevance_score=$8,
         confidence_score=$9,
         status=$10,
         raw=$11::jsonb,
         updated_at=$12
       where tenant_id=$1 and url=$2`,
      [
        tenantId,
        normalizedUrl,
        inferType(normalizedUrl),
        candidate.title || "",
        candidate.outlet || "",
        candidate.snippet || "",
        JSON.stringify(mergedSourceQueries),
        relevance,
        confidence,
        nextStatus,
        JSON.stringify(mergedRaw),
        now,
      ],
    );
    return { created: false, updated: true };
  }

  await client.query(
    `insert into marketing_media_items (
      id, tenant_id, type, title, outlet, url, canonical_url, published_at,
      language, excerpt, summary_bullets, summary_paragraph, summary_quality,
      tags, thumbnail_remote_url, thumbnail_local_path, media_embed_url, author,
      source_queries, relevance_score, confidence_score, duplicate_of, status,
      raw, created_at, updated_at
    )
    values (
      $1,$2,$3,$4,$5,$6,$7,$8,
      $9,$10,$11::jsonb,$12,$13,
      $14::jsonb,$15,$16,$17,$18,
      $19::jsonb,$20,$21,$22,$23,
      $24::jsonb,$25,$25
    )`,
    [
      stableMediaId(normalizedUrl),
      tenantId,
      inferType(normalizedUrl),
      candidate.title || "Untitled media item",
      candidate.outlet || extractDomain(normalizedUrl) || null,
      normalizedUrl,
      candidate.canonicalUrl || null,
      candidate.publishedAt || null,
      detectLanguage(`${candidate.title || ""} ${candidate.snippet || ""}`),
      candidate.snippet || null,
      JSON.stringify([]),
      null,
      "low",
      JSON.stringify([]),
      null,
      null,
      null,
      null,
      JSON.stringify(sourceQueries),
      relevance,
      confidence,
      null,
      status,
      JSON.stringify(
        fromManualSeed
          ? {
              ...(candidate.raw && typeof candidate.raw === "object" ? candidate.raw : {}),
              seed: true,
              featured: true,
            }
          : candidate.raw || {},
      ),
      now,
    ],
  );

  return { created: true, updated: false };
}

async function runDiscover(client, tenantId) {
  const runId = makeRunId();
  const serpKey = String(process.env.SERPAPI_KEY || "").trim();
  const bingKey = String(process.env.BING_SEARCH_KEY || "").trim();
  const gcsKey = String(process.env.GOOGLE_CSE_KEY || "").trim();
  const gcsCx = String(process.env.GOOGLE_CSE_CX || "").trim();
  const youtubeKey = String(process.env.YOUTUBE_API_KEY || "").trim();

  const hasProviderKeys = Boolean(serpKey || bingKey || (gcsKey && gcsCx) || youtubeKey);

  await client.query(
    `insert into marketing_media_runs (id, tenant_id, status, started_at, limited_mode, stats, errors, created_at, updated_at)
     values ($1,$2,'running',$3,$4,$5::jsonb,$6::jsonb,$3,$3)`,
    [runId, tenantId, new Date(), hasProviderKeys ? "false" : "true", JSON.stringify({}), JSON.stringify([])],
  );

  const discovered = [];
  const errors = [];
  let sourceRows = 0;

  if (hasProviderKeys) {
    for (const query of CORE_QUERIES) {
      if (serpKey) {
        try {
          const results = await searchSerpApi(query, serpKey);
          discovered.push(...results.map((row) => ({ ...row, query })));
          await insertSourceRecord(client, tenantId, { provider: "serpapi", query, runId, raw: { results } });
          sourceRows += 1;
        } catch (error) {
          errors.push({ provider: "serpapi", query, error: String(error?.message || error) });
        }
      }

      if (bingKey) {
        try {
          const results = await searchBing(query, bingKey);
          discovered.push(...results.map((row) => ({ ...row, query })));
          await insertSourceRecord(client, tenantId, { provider: "bing", query, runId, raw: { results } });
          sourceRows += 1;
        } catch (error) {
          errors.push({ provider: "bing", query, error: String(error?.message || error) });
        }
      }

      if (gcsKey && gcsCx) {
        try {
          const results = await searchGoogleCse(query, gcsKey, gcsCx);
          discovered.push(...results.map((row) => ({ ...row, query })));
          await insertSourceRecord(client, tenantId, { provider: "gcs", query, runId, raw: { results } });
          sourceRows += 1;
        } catch (error) {
          errors.push({ provider: "gcs", query, error: String(error?.message || error) });
        }
      }
    }

    if (youtubeKey) {
      for (const query of YOUTUBE_QUERIES) {
        try {
          const results = await searchYouTube(query, youtubeKey);
          discovered.push(...results.map((row) => ({ ...row, query })));
          await insertSourceRecord(client, tenantId, { provider: "youtube", query, runId, raw: { results } });
          sourceRows += 1;
        } catch (error) {
          errors.push({ provider: "youtube", query, error: String(error?.message || error) });
        }
      }
    }
  }

  if (!discovered.length) {
    const manualSeeds = await loadManualSeeds();
    for (const seed of manualSeeds) {
      discovered.push({
        ...seed,
        query: "manual_seed",
        provider: "manual",
        outlet: seed.outlet || extractDomain(seed.url),
        raw: seed,
      });
    }
    await insertSourceRecord(client, tenantId, { provider: "manual", query: "seed", runId, raw: { seeds: manualSeeds } });
    sourceRows += 1;
  }

  const unique = new Map();
  for (const row of discovered) {
    const normalized = normalizeUrl(row.url);
    if (!normalized) continue;
    const existing = unique.get(normalized) || {
      ...row,
      url: normalized,
      sourceQueries: [],
    };
    existing.title = existing.title || row.title || "";
    existing.snippet = existing.snippet || row.snippet || "";
    existing.outlet = existing.outlet || row.outlet || extractDomain(normalized);
    existing.sourceQueries = Array.from(new Set([...(existing.sourceQueries || []), row.query].filter(Boolean)));
    existing.raw = row.raw || existing.raw;
    unique.set(normalized, existing);
  }

  let created = 0;
  let updated = 0;
  for (const candidate of unique.values()) {
    const result = await upsertMediaCandidate(client, tenantId, candidate);
    if (result.created) created += 1;
    if (result.updated) updated += 1;
  }

  const stats = {
    discovered_raw: discovered.length,
    discovered_unique: unique.size,
    created,
    updated,
    sourceRows,
    limited: !hasProviderKeys,
  };

  await client.query(
    `update marketing_media_runs
     set status='completed', finished_at=$2, stats=$3::jsonb, errors=$4::jsonb, updated_at=$2
     where id=$1`,
    [runId, new Date(), JSON.stringify(stats), JSON.stringify(errors)],
  );

  return { runId, stats, errors };
}

function parseMetaTag(html, key) {
  const nameRegex = new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const propRegex = new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return html.match(nameRegex)?.[1] || html.match(propRegex)?.[1] || null;
}

function parseTitle(html) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function parseCanonical(html) {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1] || null;
}

const robotsCache = new Map();

async function isRobotsAllowed(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const origin = `${url.protocol}//${url.host}`;
    if (!robotsCache.has(origin)) {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/plain,*/*" },
      });
      const text = response.ok ? await response.text() : "";
      robotsCache.set(origin, text);
    }
    const robots = String(robotsCache.get(origin) || "").toLowerCase();
    if (!robots) return true;
    const blockAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\//i.test(robots);
    return !blockAll;
  } catch {
    return true;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function extFromContentType(contentType) {
  const value = String(contentType || "").toLowerCase();
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  if (value.includes("png")) return "png";
  if (value.includes("webp")) return "webp";
  if (value.includes("svg")) return "svg";
  if (value.includes("gif")) return "gif";
  return "jpg";
}

async function downloadThumbnail(rawUrl) {
  if (!rawUrl) return null;
  const allowed = await isRobotsAllowed(rawUrl);
  if (!allowed) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14_000);

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

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > 8 * 1024 * 1024) return null;

    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const ext = extFromContentType(contentType);
    const relative = `/assets/media/${hash}.${ext}`;
    const absolute = path.resolve(process.cwd(), "client", "public", relative.replace(/^\//, ""));
    await ensureDir(path.dirname(absolute));
    await fs.writeFile(absolute, buffer);

    return relative;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function runFetch(client, tenantId, limit) {
  const rows = await client.query(
    `select id, url, title, outlet, excerpt, type, relevance_score, raw
     from marketing_media_items
     where tenant_id=$1 and duplicate_of is null and status in ('discovered','reviewed','published')
     order by updated_at desc
     limit $2`,
    [tenantId, limit],
  );

  let processed = 0;
  let withThumbnail = 0;
  let skippedByRobots = 0;
  let failed = 0;

  for (const row of rows.rows) {
    const url = String(row.url || "").trim();
    if (!url) continue;
    const allowed = await isRobotsAllowed(url);
    if (!allowed) {
      skippedByRobots += 1;
      continue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14_000);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,*/*",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        failed += 1;
        continue;
      }

      const html = await response.text();
      const title = parseMetaTag(html, "og:title") || parseTitle(html) || row.title;
      const excerpt =
        parseMetaTag(html, "og:description") ||
        parseMetaTag(html, "description") ||
        row.excerpt ||
        null;
      const canonical = normalizeUrl(parseCanonical(html) || parseMetaTag(html, "og:url") || url);
      const publishedAt = parseMetaTag(html, "article:published_time") || parseMetaTag(html, "datePublished") || null;
      const outlet = parseMetaTag(html, "og:site_name") || row.outlet || extractDomain(url);
      const thumbnailRemote = parseMetaTag(html, "og:image") || parseMetaTag(html, "twitter:image") || null;
      const thumbnailLocal = thumbnailRemote ? await downloadThumbnail(thumbnailRemote) : null;
      if (thumbnailLocal) withThumbnail += 1;

      const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
      const mergedRaw = {
        ...raw,
        metadataFetchedAt: new Date().toISOString(),
        canonical,
        thumbnailRemote,
      };

      await client.query(
        `update marketing_media_items
         set
           title=$3,
           outlet=$4,
           excerpt=$5,
           canonical_url=$6,
           published_at=coalesce($7::timestamptz, published_at),
           thumbnail_remote_url=coalesce($8, thumbnail_remote_url),
           thumbnail_local_path=coalesce($9, thumbnail_local_path),
           raw=$10::jsonb,
           updated_at=$11
         where tenant_id=$1 and id=$2`,
        [tenantId, row.id, title, outlet, excerpt, canonical || null, publishedAt, thumbnailRemote, thumbnailLocal, JSON.stringify(mergedRaw), new Date()],
      );

      processed += 1;
    } catch {
      failed += 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { scanned: rows.rowCount, processed, withThumbnail, skippedByRobots, failed };
}

async function runSummarize(client, tenantId, limit) {
  const rows = await client.query(
    `select id, type, title, outlet, url, excerpt, tags, relevance_score, status
     from marketing_media_items
     where tenant_id=$1 and duplicate_of is null and status in ('discovered','reviewed','published')
       and (summary_paragraph is null or summary_paragraph='')
     order by updated_at desc
     limit $2`,
    [tenantId, limit],
  );

  let updated = 0;

  for (const row of rows.rows) {
    const summary = summarizeFromMetadata({
      type: row.type,
      title: row.title,
      outlet: row.outlet,
      url: row.url,
      excerpt: row.excerpt,
      relevanceScore: Number(row.relevance_score || 0),
    });

    await client.query(
      `update marketing_media_items
       set summary_bullets=$3::jsonb,
           summary_paragraph=$4,
           tags=$5::jsonb,
           language=$6,
           summary_quality=$7,
           updated_at=$8
       where tenant_id=$1 and id=$2`,
      [tenantId, row.id, JSON.stringify(summary.summaryBullets), summary.summaryParagraph, JSON.stringify(summary.tags), summary.language, summary.summaryQuality, new Date()],
    );

    updated += 1;
  }

  return { scanned: rows.rowCount, updated };
}

async function runDedupe(client, tenantId) {
  const rows = await client.query(
    `select id, url, canonical_url, created_at
     from marketing_media_items
     where tenant_id=$1 and duplicate_of is null
     order by created_at asc`,
    [tenantId],
  );

  const seen = new Map();
  let duplicates = 0;

  for (const row of rows.rows) {
    const key = normalizeUrl(row.canonical_url || row.url);
    if (!key) continue;

    const primary = seen.get(key);
    if (!primary) {
      seen.set(key, row.id);
      continue;
    }

    await client.query(
      `update marketing_media_items
       set duplicate_of=$3, updated_at=$4
       where tenant_id=$1 and id=$2`,
      [tenantId, row.id, primary, new Date()],
    );
    duplicates += 1;
  }

  return { scanned: rows.rowCount, duplicates };
}

async function writeRunLog(runId, payload) {
  const dir = path.resolve(process.cwd(), "logs", "media-runs");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${runId}.json`), JSON.stringify(payload, null, 2), "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  await loadLocalEnv();

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await ensureMarketingMediaTables(client);
    const tenantId = await resolveTenantId(client, args.tenantKey);

    if (args.mode === "discover") {
      const result = await runDiscover(client, tenantId);
      await writeRunLog(result.runId, { mode: "discover", tenantId, ...result });
      console.log(`[media] discover run_id=${result.runId} unique=${result.stats.discovered_unique} created=${result.stats.created} updated=${result.stats.updated}`);
      return;
    }

    if (args.mode === "fetch") {
      const result = await runFetch(client, tenantId, args.limit);
      console.log(`[media] fetch scanned=${result.scanned} processed=${result.processed} thumbs=${result.withThumbnail} skipped_robots=${result.skippedByRobots} failed=${result.failed}`);
      return;
    }

    if (args.mode === "summarize") {
      const result = await runSummarize(client, tenantId, args.limit);
      console.log(`[media] summarize scanned=${result.scanned} updated=${result.updated}`);
      return;
    }

    if (args.mode === "dedupe") {
      const result = await runDedupe(client, tenantId);
      console.log(`[media] dedupe scanned=${result.scanned} duplicates=${result.duplicates}`);
      return;
    }

    if (args.mode === "refresh") {
      const discover = await runDiscover(client, tenantId);
      const fetch = await runFetch(client, tenantId, args.limit);
      const summarize = await runSummarize(client, tenantId, args.limit);
      const dedupe = await runDedupe(client, tenantId);

      const report = {
        mode: "refresh",
        tenantId,
        runId: discover.runId,
        discover,
        fetch,
        summarize,
        dedupe,
        finishedAt: new Date().toISOString(),
      };
      await writeRunLog(discover.runId, report);
      console.log(
        `[media] refresh run_id=${discover.runId} discover_unique=${discover.stats.discovered_unique} fetch_processed=${fetch.processed} summarize=${summarize.updated} duplicates=${dedupe.duplicates}`,
      );
      return;
    }

    throw new Error(`Unsupported mode: ${args.mode}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[media] failed:", error?.message || error);
  process.exit(1);
});
