#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const HOSTS = [
  "boursedelor.com",
  "maisonenterre.com",
  "houseofzogue.com",
  "vitalsounouvou.com",
  "mindbase.cloud",
  "exportunity.net",
  "rayon1km.com",
  "zogueland.com",
];

const now = Date.now();
const outDir = path.resolve(process.cwd(), "artifacts", "smoke");
fs.mkdirSync(outDir, { recursive: true });

function normalizeHost(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-");
}

async function run() {
  let browser = null;
  let browserEngine = "chromium";
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    browserEngine = "msedge";
    browser = await chromium.launch({ channel: "msedge", headless: true });
    console.warn(
      `[ui-smoke] default Chromium failed (${String(error?.message || error)}), using ${browserEngine} channel fallback`,
    );
  }
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    ignoreHTTPSErrors: true,
  });

  const results = [];
  for (const host of HOSTS) {
    const page = await context.newPage();
    const url = `https://${host}/store?v=${now}`;
    const safeHost = normalizeHost(host);
    const shotPath = path.join(outDir, `${now}-${safeHost}-store-ui.png`);

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
      try {
        await page.waitForSelector('[data-ui="zone-interface"]', { timeout: 30_000 });
      } catch {
        // keep collecting diagnostics even if the marker is missing.
      }
      await page.waitForTimeout(3500);

      const hasZoneInterface = (await page.locator('[data-ui="zone-interface"]').count()) > 0;
      const dataImageCount = await page.locator('img[src^="data:image/"]').count();
      const staleCatalogCount = await page.locator("text=/catalog item/i").count();
      const stalePublishedCount = await page.locator("text=/published/i").count();
      const leafletContainers = await page.locator(".leaflet-container").count();

      const bdoHasQuotes =
        host === "boursedelor.com"
          ? (await page.locator("text=/Cours de l'or en direct|Live Gold Quotes/i").count()) > 0
          : null;
      const bdoHasNewsTagline =
        host === "boursedelor.com"
          ? (await page.locator("text=/Des mines africaines aux coffres des Emirats|From African mines to UAE vaults/i").count()) > 0
          : null;
      const metHasMap =
        host === "maisonenterre.com" ? leafletContainers > 0 : null;

      await page.screenshot({ path: shotPath, fullPage: true });

      const checks = {
        hasZoneInterface,
        noDataImage: dataImageCount === 0,
        noStaleCatalogItem: staleCatalogCount === 0,
        noStalePublishedText: stalePublishedCount === 0,
        bdoHasQuotes: bdoHasQuotes == null ? true : bdoHasQuotes,
        bdoHasNewsTagline: bdoHasNewsTagline == null ? true : bdoHasNewsTagline,
        metNoMap: metHasMap == null ? true : !metHasMap,
      };

      results.push({
        host,
        url,
        screenshot: path.relative(process.cwd(), shotPath).replace(/\\/g, "/"),
        metrics: {
          dataImageCount,
          staleCatalogCount,
          stalePublishedCount,
          leafletContainers,
        },
        checks,
        ok: Object.values(checks).every(Boolean),
      });
    } catch (error) {
      results.push({
        host,
        url,
        screenshot: path.relative(process.cwd(), shotPath).replace(/\\/g, "/"),
        error: String(error?.message || error),
        ok: false,
      });
      try {
        await page.screenshot({ path: shotPath, fullPage: true });
      } catch {
        // ignore
      }
    } finally {
      await page.close();
    }
  }

  await context.close();
  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    browserEngine,
    ok: results.every((item) => item.ok),
    results,
  };
  const jsonPath = path.join(outDir, `multi-tenant-ui-smoke-${now}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const lines = [];
  lines.push(`# Multi-tenant UI smoke (${report.generatedAt})`);
  lines.push("");
  lines.push(`Overall: **${report.ok ? "PASS" : "FAIL"}**`);
  lines.push("");
  for (const item of results) {
    lines.push(`## ${item.host}`);
    lines.push(`- Result: **${item.ok ? "PASS" : "FAIL"}**`);
    lines.push(`- URL: ${item.url}`);
    lines.push(`- Screenshot: \`${item.screenshot}\``);
    if (item.error) {
      lines.push(`- Error: \`${item.error}\``);
    } else {
      for (const [key, value] of Object.entries(item.checks || {})) {
        lines.push(`- ${key}: \`${value}\``);
      }
      for (const [key, value] of Object.entries(item.metrics || {})) {
        lines.push(`- ${key}: \`${value}\``);
      }
    }
    lines.push("");
  }
  const mdPath = path.join(outDir, `multi-tenant-ui-smoke-${now}.md`);
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        jsonPath: path.relative(process.cwd(), jsonPath).replace(/\\/g, "/"),
        mdPath: path.relative(process.cwd(), mdPath).replace(/\\/g, "/"),
      },
      null,
      2,
    ),
  );

  if (!report.ok) process.exit(2);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
