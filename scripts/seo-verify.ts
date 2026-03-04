import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

import { injectSeoHead, resolveSeoHead } from "../server/lib/seo/runtimeSeo";

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

function isMarketingHost(host: string) {
  return host === "exportunity.com" || host === "www.exportunity.com";
}

function isExportunityStagingHost(host: string) {
  return host === "clone.exportunity.net" || host === "www.clone.exportunity.net";
}

function isExportunityNetHost(host: string) {
  return host === "exportunity.net" || host === "www.exportunity.net";
}

function isExportunityFamilyHost(host: string) {
  return isMarketingHost(host) || isExportunityNetHost(host) || isExportunityStagingHost(host);
}

function extractTag(html: string, re: RegExp) {
  const match = html.match(re);
  return match?.[1] ? String(match[1]) : null;
}

function parseCanonical(html: string) {
  return extractTag(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i);
}

function parseRobots(html: string) {
  return extractTag(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/i);
}

function isHtmlOk(resp: Response) {
  const ct = String(resp.headers.get("content-type") || "").toLowerCase();
  return resp.ok && ct.includes("text/html");
}

async function main() {
  const app = express();

  // Minimal tenant stub to keep SEO logic deterministic without DB reads.
  app.use((req: any, _res, next) => {
    const host = resolveRequestedHost(req);
    req.tenant = isExportunityFamilyHost(host)
      ? { id: 0, key: "exportunity", name: "Exportunity", featureFlags: {} }
      : { id: 0, key: "bdo", name: "Bourse de l'Or", featureFlags: {} };
    next();
  });

  app.get("/robots.txt", (req: any, res) => {
    const host = resolveRequestedHost(req);
    if (isExportunityStagingHost(host) || isExportunityNetHost(host)) {
      res.type("text/plain").send(["User-agent: *", "Disallow: /", ""].join("\n"));
      return;
    }

    const sitemapHost = isMarketingHost(host) ? "exportunity.com" : host || "boursedelor.com";

    const disallow = ["/admin", "/dashboard", "/ai-team", "/tasks", "/goals", "/hierarchy", "/app"];
    const lines = ["User-agent: *", ...disallow.map((p) => `Disallow: ${p}`), "", `Sitemap: https://${sitemapHost}/sitemap.xml`, ""];
    res.type("text/plain").send(lines.join("\n"));
  });

  app.get("/sitemap.xml", (req: any, res) => {
    const host = resolveRequestedHost(req);
    const base = isExportunityFamilyHost(host) ? "https://exportunity.com" : `https://${host || "boursedelor.com"}`;
    const now = new Date().toISOString();

    const paths = isExportunityFamilyHost(host)
      ? ["/", "/our-journey", "/solutions", "/platform", "/media", "/talk", "/invest", "/privacy", "/terms"]
      : ["/zone", "/gateway", "/about", "/how-it-works", "/sellers", "/terms", "/privacy", "/cadre-conformite"];

    const urls = paths
      .map((p) => `<url><loc>${base}${p}</loc><lastmod>${now}</lastmod></url>`)
      .join("");

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + urls + `</urlset>`;
    res.type("application/xml").send(xml);
  });

  const template = `<!doctype html><html><head><title>seo verify</title></head><body><div id="root"></div></body></html>`;

  app.get("*", async (req: any, res) => {
    const host = resolveRequestedHost(req);
    const url = new URL(req.originalUrl || "/", `http://${host || "localhost"}`);

    const head = await resolveSeoHead({
      tenant: req.tenant,
      env: "prod",
      host: host || "localhost",
      pathname: url.pathname,
      search: url.search,
    });
    const page = injectSeoHead(template, head);
    res.status(200).type("text/html").send(page);
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  if (!port) throw new Error("Unable to bind test server");

  const baseUrl = `http://127.0.0.1:${port}`;

  const fetchWithHost = async (pathname: string, host: string) => {
    const resp = await fetch(`${baseUrl}${pathname}`, { headers: { "x-forwarded-host": host } });
    const text = await resp.text();
    return { resp, text };
  };

  const checks: Array<{ host: string; path: string; expectCanonical: string; expectRobots: string }> = [
    { host: "www.exportunity.com", path: "/", expectCanonical: "https://exportunity.com/", expectRobots: "index, follow" },
    { host: "www.exportunity.com", path: "/contact-8", expectCanonical: "https://exportunity.com/talk", expectRobots: "noindex, follow" },
    { host: "exportunity.com", path: "/", expectCanonical: "https://exportunity.com/", expectRobots: "index, follow" },
    { host: "exportunity.com", path: "/contact-8", expectCanonical: "https://exportunity.com/talk", expectRobots: "noindex, follow" },
    { host: "boursedelor.com", path: "/", expectCanonical: "https://boursedelor.com/zone", expectRobots: "noindex, follow" },
    { host: "boursedelor.com", path: "/admin", expectCanonical: "https://boursedelor.com/admin", expectRobots: "noindex, nofollow" },
  ];

  try {
    // robots + sitemap
    {
      const { resp, text } = await fetchWithHost("/robots.txt", "www.exportunity.com");
      assert.equal(resp.ok, true);
      assert.ok(text.includes("Disallow: /admin"));
      assert.ok(text.includes("Sitemap: https://exportunity.com/sitemap.xml"));
    }
    {
      const { resp, text } = await fetchWithHost("/robots.txt", "exportunity.com");
      assert.equal(resp.ok, true);
      assert.ok(text.includes("Sitemap: https://exportunity.com/sitemap.xml"));
    }
    {
      const { resp, text } = await fetchWithHost("/robots.txt", "clone.exportunity.net");
      assert.equal(resp.ok, true);
      assert.ok(text.includes("Disallow: /"));
      assert.ok(!text.includes("Sitemap:"));
    }
    {
      const { resp, text } = await fetchWithHost("/robots.txt", "exportunity.net");
      assert.equal(resp.ok, true);
      assert.ok(text.includes("Disallow: /"));
      assert.ok(!text.includes("Sitemap:"));
    }

    {
      const { resp, text } = await fetchWithHost("/sitemap.xml", "www.exportunity.com");
      assert.equal(resp.ok, true);
      assert.ok(text.includes("<loc>https://exportunity.com/</loc>"));
      assert.ok(text.includes("<loc>https://exportunity.com/talk</loc>"));
      assert.ok(!text.includes("<loc>https://www.exportunity.com/zone</loc>"));
    }
    {
      const { resp, text } = await fetchWithHost("/sitemap.xml", "exportunity.net");
      assert.equal(resp.ok, true);
      assert.ok(text.includes("<loc>https://exportunity.com/</loc>"));
      assert.ok(!text.includes("<loc>https://exportunity.net/zone</loc>"));
    }
    {
      const { resp, text } = await fetchWithHost("/sitemap.xml", "boursedelor.com");
      assert.equal(resp.ok, true);
      assert.ok(text.includes("<loc>https://boursedelor.com/zone</loc>"));
      assert.ok(!text.includes("<loc>https://boursedelor.com/contact-8</loc>"));
    }

    // canonical/robots per host + path
    for (const check of checks) {
      const { resp, text } = await fetchWithHost(check.path, check.host);
      assert.ok(isHtmlOk(resp));

      const canonical = parseCanonical(text);
      const robots = parseRobots(text);

      assert.equal(canonical, check.expectCanonical, `canonical mismatch host=${check.host} path=${check.path}`);
      assert.equal(robots, check.expectRobots, `robots mismatch host=${check.host} path=${check.path}`);
    }

    console.log("[seo:verify] ok");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

main().catch((err: any) => {
  console.error("[seo:verify] failed:", err?.message || err);
  process.exit(1);
});
