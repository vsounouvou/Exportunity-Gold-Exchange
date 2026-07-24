import { Router } from "express";
import { db } from "@db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  contactMessages,
  eceUsers,
  emailUnsubscribes,
  intellects,
  mindbaseMindbases,
  userTenantRoles,
  walletRoles,
} from "@db/schema";
import { getContactNotificationConfig, sendContactNotification } from "../lib/contact/notifier";
import { readBuildMeta } from "../lib/platform/buildMeta";
import { renderAgentAvatarSvg } from "../lib/avatars/agentAvatar";
import { verifyUnsubscribeToken } from "../lib/mail/unsubscribe";

const router = Router();
const EXPORTUNITY_CANONICAL_HOST = "exportunity.com";

function normalizeHost(host: unknown) {
  if (typeof host !== "string") return "";
  return host.split(",")[0]?.split(":")[0]?.trim().toLowerCase() || "";
}

function resolveRequestedHost(req: any) {
  const forwardedHostHeader = req.headers["x-forwarded-host"];
  const forwardedHost = Array.isArray(forwardedHostHeader) ? forwardedHostHeader[0] : forwardedHostHeader;
  const raw = String(forwardedHost || req.headers.host || "").split(",")[0]?.trim() || "";
  return normalizeHost(raw);
}

function isExportunityPublicMarketingHost(host: string) {
  return (
    host === "exportunity.com" ||
    host === "www.exportunity.com"
  );
}

function isExportunityStagingHost(host: string) {
  return host === "clone.exportunity.net" || host === "www.clone.exportunity.net";
}

function isExportunityNetHost(host: string) {
  return host === "exportunity.net" || host === "www.exportunity.net";
}

function isMindbaseHost(host: string) {
  return host === "mindbase.cloud" || host === "www.mindbase.cloud" || host.endsWith(".mindbase.cloud");
}

function isVsHost(host: string) {
  return host === "vitalsounouvou.com" || host === "www.vitalsounouvou.com" || host.endsWith(".vitalsounouvou.com");
}

function isHozHost(host: string) {
  return host === "houseofzogue.com" || host === "www.houseofzogue.com" || host.endsWith(".houseofzogue.com");
}

function isAgoojyeHost(host: string) {
  return host === "agoojiye.com" || host === "www.agoojiye.com" || host === "app.agoojiye.com" || host === "admin.agoojiye.com";
}

function isExportunityFamilyHost(host: string) {
  return isExportunityPublicMarketingHost(host) || isExportunityNetHost(host) || isExportunityStagingHost(host);
}

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function setNoCache(res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function maybeMarketingRedirect(req: any, res: any, destination: string) {
  const host = resolveRequestedHost(req);
  if (!isExportunityPublicMarketingHost(host)) return false;
  res.redirect(301, destination);
  return true;
}

router.get("/about", (req: any, res: any, next: any) => {
  if (maybeMarketingRedirect(req, res, "/our-journey")) return;
  next();
});

router.get("/library", (req: any, res: any, next: any) => {
  if (maybeMarketingRedirect(req, res, "/media/library")) return;
  next();
});

router.get("/copy-of-home", (req: any, res: any, next: any) => {
  if (maybeMarketingRedirect(req, res, "/solutions")) return;
  next();
});

router.get("/contact", (req: any, res: any, next: any) => {
  if (maybeMarketingRedirect(req, res, "/talk")) return;
  next();
});

router.get("/health", (req: any, res) => {
  setNoCache(res);
  const host = resolveRequestedHost(req);
  const meta = readBuildMeta();
  const tenant = req.tenant ? { id: req.tenant.id, key: req.tenant.key, name: req.tenant.name } : null;

  res.json({
    status: "ok",
    serverTime: new Date().toISOString(),
    host,
    tenant,
    marketingHost: isExportunityPublicMarketingHost(host),
    build: {
      ok: meta.ok,
      buildId: meta.buildId,
      gitSha: meta.gitSha,
      builtAt: meta.builtAt,
      source: meta.source,
    },
  });
});

router.get("/status", (req: any, res) => {
  setNoCache(res);
  const host = resolveRequestedHost(req);
  const meta = readBuildMeta();
  const tenant = req.tenant ? { id: req.tenant.id, key: req.tenant.key, name: req.tenant.name } : null;

  const rows = [
    ["Host", host || "(unknown)"],
    ["Tenant", tenant ? `${tenant.key} (id=${tenant.id})` : "(not resolved)"],
    ["Marketing host", String(isExportunityPublicMarketingHost(host))],
    ["Build ID", meta.buildId || "(unknown)"],
    ["Git SHA", meta.gitSha || "(unknown)"],
    ["Built at", meta.builtAt || "(unknown)"],
    ["Server time", new Date().toISOString()],
  ];

  const esc = (value: string) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Status</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:#0b0f16; color:#e5e7eb; margin:0; padding:24px; }
      .card { max-width: 860px; margin: 0 auto; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px 18px; }
      h1 { font-size: 18px; margin: 0 0 12px 0; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 10px 8px; border-top: 1px solid rgba(255,255,255,0.08); vertical-align: top; }
      td:first-child { width: 180px; color: rgba(255,255,255,0.7); }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .hint { margin-top: 12px; color: rgba(255,255,255,0.65); font-size: 13px; }
      a { color: #38bdf8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Service status</h1>
      <table>
        ${rows
          .map(([k, v]) => `<tr><td>${esc(k)}</td><td><code>${esc(v)}</code></td></tr>`)
          .join("")}
      </table>
      <div class="hint">
        JSON health: <a href="/health">/health</a>
      </div>
    </div>
  </body>
</html>`;

  res.type("text/html").send(html);
});

router.get("/robots.txt", (req: any, res) => {
  const host = resolveRequestedHost(req);
  res.type("text/plain");

  if (isVsHost(host)) {
    const lines = [
      "User-agent: *",
      "Disallow: /admin",
      "Disallow: /api",
      "",
      "Sitemap: https://vitalsounouvou.com/sitemap.xml",
      "",
    ];
    return res.send(lines.join("\n"));
  }

  if (isHozHost(host)) {
    const lines = [
      "User-agent: *",
      "Disallow: /admin",
      "Disallow: /api",
      "",
      "Sitemap: https://houseofzogue.com/sitemap.xml",
      "",
    ];
    return res.send(lines.join("\n"));
  }

  if (isMindbaseHost(host)) {
    const lines = [
      "User-agent: *",
      "Disallow: /admin",
      "Disallow: /dashboard",
      "Disallow: /api",
      "",
      `Sitemap: https://${host || "mindbase.cloud"}/sitemap.xml`,
      "",
    ];
    return res.send(lines.join("\n"));
  }

  if (isAgoojyeHost(host)) {
    return res.send([
      "User-agent: *",
      "Disallow: /admin",
      "Disallow: /controle",
      "Disallow: /api",
      "Disallow: /reservation/",
      "Disallow: /billet/",
      "",
      "Sitemap: https://agoojiye.com/sitemap.xml",
      "",
    ].join("\n"));
  }

  if (isExportunityStagingHost(host) || isExportunityNetHost(host)) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    return res.send(["User-agent: *", "Disallow: /", ""].join("\n"));
  }

  const disallow = [
    "/admin",
    "/dashboard",
    "/ai-team",
    "/tasks",
    "/goals",
    "/hierarchy",
    "/app",
    "/machinery",
    "/manufacturing",
    "/engineering",
  ];

  const sitemapHost = isExportunityPublicMarketingHost(host)
    ? EXPORTUNITY_CANONICAL_HOST
    : host || "boursedelor.com";

  const lines = [
    "User-agent: *",
    ...disallow.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: https://${sitemapHost}/sitemap.xml`,
    "",
  ];
  return res.send(lines.join("\n"));
});

router.get("/sitemap.xml", async (req: any, res) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const host = resolveRequestedHost(req);
  const now = new Date().toISOString();

  if (isVsHost(host)) {
    const base = "https://vitalsounouvou.com";
    const paths = ["/", "/about", "/press", "/portfolio", "/contact", "/insights"];
    const urls = paths
      .map((p) => ["<url>", `<loc>${base}${p}</loc>`, `<lastmod>${now}</lastmod>`, "</url>"].join(""))
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
      urls +
      `</urlset>`;

    res.type("application/xml");
    return res.send(xml);
  }

  if (isHozHost(host)) {
    const base = "https://houseofzogue.com";
    const paths = ["/", "/books", "/jewelry", "/media", "/about", "/contact"];
    const urls = paths
      .map((p) => ["<url>", `<loc>${base}${p}</loc>`, `<lastmod>${now}</lastmod>`, "</url>"].join(""))
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
      urls +
      `</urlset>`;

    res.type("application/xml");
    return res.send(xml);
  }

  if (isMindbaseHost(host)) {
    try {
      const base = `https://${host || "mindbase.cloud"}`;
      const staticEntries = [
        { path: "/", lastmod: now },
        { path: "/explore", lastmod: now },
      ];

      const publishedIntellects = await db.query.intellects.findMany({
        where: and(eq(intellects.tenantId, tenant.id), eq(intellects.isPublished, true)),
        columns: { slug: true, updatedAt: true },
        orderBy: desc(intellects.updatedAt),
        limit: 1000,
      });

      const publishedMindbases = await db.query.mindbaseMindbases.findMany({
        where: and(eq(mindbaseMindbases.tenantId, tenant.id), eq(mindbaseMindbases.isPublished, true)),
        columns: { slug: true, updatedAt: true },
        orderBy: desc(mindbaseMindbases.updatedAt),
        limit: 1000,
      });

      const dynamicEntries = [
        ...publishedIntellects
          .map((entry) => ({
            path: `/i/${String(entry.slug || "").trim()}`,
            lastmod: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : now,
          }))
          .filter((entry) => entry.path !== "/i/"),
        ...publishedMindbases
          .map((entry) => ({
            path: `/c/${String(entry.slug || "").trim()}`,
            lastmod: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : now,
          }))
          .filter((entry) => entry.path !== "/c/"),
      ];

      const entries = [...staticEntries, ...dynamicEntries];
      const urls = entries
        .map((entry) =>
          [
            "<url>",
            `<loc>${base}${entry.path}</loc>`,
            `<lastmod>${entry.lastmod}</lastmod>`,
            "</url>",
          ].join(""),
        )
        .join("");

      const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
        urls +
        `</urlset>`;

      res.type("application/xml");
      return res.send(xml);
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to build MindBase sitemap" });
    }
  }

  if (isAgoojyeHost(host)) {
    const base = "https://agoojiye.com";
    const paths = [
      "/",
      "/reserver",
      "/trajets",
      "/bus",
      "/experience-3d",
      "/reserver-un-bus",
      "/demonstration",
      "/commander",
      "/liste-prioritaire",
      "/a-propos",
      "/contact",
      "/faq",
      "/retrouver-ma-reservation",
    ];
    const urls = paths.map((path) => ["<url>", `<loc>${base}${path}</loc>`, `<lastmod>${now}</lastmod>`, "</url>"].join("")).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>` + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + urls + `</urlset>`;
    res.type("application/xml");
    return res.send(xml);
  }

  const base = isExportunityFamilyHost(host) ? `https://${EXPORTUNITY_CANONICAL_HOST}` : `https://${host || "boursedelor.com"}`;

  const paths = isExportunityFamilyHost(host)
    ? [
        "/",
        "/our-journey",
        "/solutions",
        "/platform",
        "/platform/gold",
        "/platform/agents",
        "/platform/marketplace",
        "/media",
        "/media/press",
        "/media/library",
        "/invest",
        "/talk",
        "/privacy",
        "/terms",
      ]
    : ["/zone", "/gateway", "/about", "/how-it-works", "/sellers", "/terms", "/privacy", "/cadre-conformite"];

  const urls = paths
    .map((p) => {
      const loc = `${base}${p}`;
      return ["<url>", `<loc>${loc}</loc>`, `<lastmod>${now}</lastmod>`, "</url>"].join("");
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls +
    `</urlset>`;

  res.type("application/xml");
  res.send(xml);
});

router.get("/api/public/agent-avatar/:agentKey.svg", (req: any, res) => {
  const agentKeyRaw = String(req.params?.agentKey || "").trim();
  const agentKey = agentKeyRaw.replace(/\.svg$/i, "").trim();
  if (!agentKey) return res.status(400).type("text/plain").send("agentKey required");

  const sizeRaw = Number(req.query?.size ?? 128);
  const size = Number.isFinite(sizeRaw) ? Math.max(64, Math.min(512, Math.trunc(sizeRaw))) : 128;
  const label = typeof req.query?.label === "string" ? req.query.label : null;
  const svg = renderAgentAvatarSvg({ agentKey, size, label });

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.send(svg);
});

router.get("/public/verify/:qrToken", async (req: any, res) => {
  try {
    const qrToken = String(req.params?.qrToken || "").trim();
    if (!qrToken) {
      return res.status(400).json({ valid: false, message: "qrToken is required" });
    }
    const normalizedLookup = qrToken.toUpperCase();

    const tenantId = Number(req?.tenant?.id || 0);
    const scopedByTenant = Number.isInteger(tenantId) && tenantId > 0;

    const result = scopedByTenant
      ? await db.execute(sql`
          select
            i.id,
            i.tenant_id,
            i.serial_code,
            i.status,
            i.current_location_type,
            c.pdf_url,
            c.sha256_hash,
            c.qr_link,
            c.issued_at,
            s.sku_code,
            s.stamped_type,
            s.weight_grams,
            s.purity,
            s.karat,
            s.metal
          from stamped_gold_items i
          left join stamped_gold_skus s on s.id = i.sku_id
          left join stamped_gold_certificates c on c.item_id = i.id
          where (
            i.qr_token = ${qrToken}
            or upper(coalesce(i.serial_code, '')) = ${normalizedLookup}
            or upper(coalesce(i.serial, '')) = ${normalizedLookup}
          )
            and i.tenant_id = ${tenantId}
          limit 1
        `)
      : await db.execute(sql`
          select
            i.id,
            i.tenant_id,
            i.serial_code,
            i.status,
            i.current_location_type,
            c.pdf_url,
            c.sha256_hash,
            c.qr_link,
            c.issued_at,
            s.sku_code,
            s.stamped_type,
            s.weight_grams,
            s.purity,
            s.karat,
            s.metal
          from stamped_gold_items i
          left join stamped_gold_skus s on s.id = i.sku_id
          left join stamped_gold_certificates c on c.item_id = i.id
          where (
            i.qr_token = ${qrToken}
            or upper(coalesce(i.serial_code, '')) = ${normalizedLookup}
            or upper(coalesce(i.serial, '')) = ${normalizedLookup}
          )
          order by i.created_at desc
          limit 1
        `);

    const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
    if (!row) return res.status(404).json({ valid: false, message: "Not found" });

    return res.json({
      valid: true,
      item: {
        id: row.id,
        serialCode: row.serial_code,
        status: row.status,
        currentLocationType: row.current_location_type,
        tenantId: Number(row.tenant_id || 0),
      },
      certificate: row.pdf_url
        ? {
            pdfUrl: row.pdf_url,
            sha256Hash: row.sha256_hash,
            qrLink: row.qr_link,
            issuedAt: row.issued_at,
          }
        : null,
      sku: row.sku_code
        ? {
            skuCode: row.sku_code,
            stampedType: row.stamped_type,
            weightGrams: Number(row.weight_grams || 0),
            purity: row.purity,
            karat: row.karat == null ? null : Number(row.karat),
            metal: row.metal,
          }
        : null,
    });
  } catch (error) {
    console.error("[Public Verify] failed:", error);
    return res.status(500).json({ valid: false, message: "Verification failed" });
  }
});

router.all("/api/public/email/unsubscribe", async (req: any, res) => {
  const token = String(req.query?.token || req.body?.token || "").trim();
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    res.status(400);
    if (String(req.headers.accept || "").includes("text/html")) {
      return res.type("text/html").send("<h2>Invalid unsubscribe link</h2>");
    }
    return res.json({ ok: false, message: "invalid_unsubscribe_token" });
  }

  const now = new Date();
  try {
    await db
      .insert(emailUnsubscribes)
      .values({
        tenantId: payload.tenantId,
        email: payload.email,
        scope: payload.scope,
        metadata: { source: "list-unsubscribe", exp: payload.exp },
        createdAt: now,
      })
      .onConflictDoNothing();
  } catch (err: any) {
    res.status(500);
    if (String(req.headers.accept || "").includes("text/html")) {
      return res.type("text/html").send("<h2>Unsubscribe failed</h2>");
    }
    return res.json({ ok: false, message: err?.message || "unsubscribe_failed" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (String(req.headers.accept || "").includes("text/html")) {
    return res
      .type("text/html")
      .send("<!doctype html><html><head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><title>Unsubscribed</title></head><body style=\"font-family:Arial,Helvetica,sans-serif;padding:24px;\"><h2>You're unsubscribed.</h2><p>You will no longer receive marketing emails from us.</p></body></html>");
  }

  return res.json({ ok: true, status: "unsubscribed" });
});

router.get("/api/public/sellers", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const roles = await db.query.walletRoles.findMany({
      where: eq(walletRoles.role, "SELLER"),
      orderBy: desc(walletRoles.updatedAt),
      limit: 250,
    });

    const active = roles.filter((r) => String(r.status).toUpperCase() === "ACTIVE");
    const ids = active
      .map((r) => Number(String(r.userId)))
      .filter((n) => Number.isFinite(n) && n > 0) as number[];

    if (!ids.length) return res.json({ ok: true, sellers: [] });

    const enabled = await db.query.userTenantRoles.findMany({
      where: and(eq(userTenantRoles.tenantId, tenant.id), inArray(userTenantRoles.userId, ids)),
      columns: { userId: true },
      limit: 500,
    });
    const enabledSet = new Set(enabled.map((r) => Number(r.userId)));

    const filtered = ids.filter((id) => enabledSet.has(id));
    if (!filtered.length) return res.json({ ok: true, sellers: [] });

    const users = await db.query.eceUsers.findMany({
      where: inArray(eceUsers.id, filtered),
      columns: { id: true, displayName: true, country: true, primaryTerritoryId: true },
      limit: 500,
    });
    const userMap = new Map<number, (typeof users)[number]>();
    for (const u of users) userMap.set(Number(u.id), u);

    const sellers = active
      .map((r) => {
        const id = Number(String(r.userId));
        if (!Number.isFinite(id) || !enabledSet.has(id)) return null;
        const u = userMap.get(id);
        if (!u) return null;
        return {
          sellerUserId: String(u.id),
          displayName: u.displayName,
          country: u.country ?? null,
          primaryTerritoryId: u.primaryTerritoryId ?? null,
        };
      })
      .filter(Boolean);

    res.json({ ok: true, sellers });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load sellers" });
  }
});

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

router.post("/api/contact", async (req: any, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const firstName = String(req.body?.firstName ?? req.body?.first_name ?? "").trim();
    const lastName = String(req.body?.lastName ?? req.body?.last_name ?? "").trim();
    const email = normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone ?? "").trim() || null;
    const company = String(req.body?.company ?? "").trim() || null;
    const message = String(req.body?.message ?? "").trim();
    const source = String(req.body?.source ?? "").trim() || null;

    if (!firstName || !lastName) return res.status(400).json({ message: "First and last name are required" });
    if (!email) return res.status(400).json({ message: "Valid email is required" });
    if (!message) return res.status(400).json({ message: "Message is required" });

    const now = new Date();
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0]?.trim() || null;
    const userAgent = String(req.headers["user-agent"] || "").trim() || null;

    const [row] = await db
      .insert(contactMessages)
      .values({
        tenantId: tenant.id,
        firstName,
        lastName,
        email,
        phone,
        company,
        message,
        source,
        notifyStatus: "pending",
        notifyError: null,
        notifiedAt: null,
        userAgent,
        ip,
        createdAt: now,
      })
      .returning();

    const cfg = getContactNotificationConfig();
    if (!cfg.enabled || !cfg.from) {
      await db
        .update(contactMessages)
        .set({ notifyStatus: "skipped", notifyError: "contact_notify_not_configured" })
        .where(eq(contactMessages.id, row.id));
      return res.status(201).json({ ok: true, id: row.id, notify: { status: "skipped" } });
    }

    const subject = `${cfg.subjectPrefix} ${firstName} ${lastName} <${email}>`;
    const lines = [
      `New contact message (tenant=${tenant.key})`,
      "",
      `Name: ${firstName} ${lastName}`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : null,
      company ? `Company: ${company}` : null,
      "",
      "Message:",
      message,
      "",
      `Source: ${source || "unknown"}`,
      `IP: ${ip || "unknown"}`,
      `User-Agent: ${userAgent || "unknown"}`,
      `Time: ${now.toISOString()}`,
    ].filter(Boolean);

    try {
      await sendContactNotification({ to: cfg.to, from: cfg.from, subject, text: lines.join("\n") });
      await db
        .update(contactMessages)
        .set({ notifyStatus: "sent", notifiedAt: new Date(), notifyError: null })
        .where(eq(contactMessages.id, row.id));
      return res.status(201).json({ ok: true, id: row.id, notify: { status: "sent" } });
    } catch (err: any) {
      await db
        .update(contactMessages)
        .set({ notifyStatus: "failed", notifyError: String(err?.message || "notify_failed") })
        .where(eq(contactMessages.id, row.id));
      return res.status(201).json({ ok: true, id: row.id, notify: { status: "failed" } });
    }
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to submit contact form" });
  }
});

export default router;
