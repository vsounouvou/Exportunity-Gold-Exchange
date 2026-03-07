#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const stamp = Date.now();
const outDir = path.resolve(process.cwd(), "artifacts", "smoke");
fs.mkdirSync(outDir, { recursive: true });

async function fetchJsonInPage(page, url) {
  return page.evaluate(async (target) => {
    try {
      const res = await fetch(target, {
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        cache: "no-store",
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { ok: res.ok, status: res.status, url: target, json, text };
    } catch (error) {
      return { ok: false, status: 0, url: target, json: null, text: String(error || "") };
    }
  }, url);
}

async function checkDirectRoute(context, url, expectedText) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
    const expected = Array.isArray(expectedText) ? expectedText : [expectedText];
    let visible = false;
    for (const text of expected) {
      if ((await page.locator(`text=${text}`).count()) > 0) {
        visible = true;
        break;
      }
    }
    return { route: new URL(url).pathname, ok: visible, status: visible ? 200 : 0 };
  } finally {
    await page.close();
  }
}

async function checkBdo(page, context) {
  const url = `https://boursedelor.com/store?v=${stamp}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector("text=Or africain certifié, des mines africaines jusqu'à votre porte", { timeout: 30_000 });
  await page.waitForTimeout(1000);

  const tileTexts = await page.locator('button').evaluateAll((buttons) =>
    buttons.map((button) => (button.textContent || "").replace(/\s+/g, " ").trim()),
  );
  const piecesTileText = tileTexts.find((text) => text.includes("Pièces") && text.includes("achat patrimonial"));
  const collectionTileText = tileTexts.find((text) => text.includes("Collection") && text.includes("objets d'exception"));
  const countFromTile = (text) => {
    const matches = String(text || "").match(/\b(\d+)\b/g);
    if (!matches || matches.length === 0) return 0;
    return Number.parseInt(matches[matches.length - 1], 10) || 0;
  };
  const piecesCount = countFromTile(piecesTileText);
  const collectionCount = countFromTile(collectionTileText);

  const checks = {
    hasZoneInterface: (await page.locator('[data-ui="zone-interface"]').count()) > 0,
    hasHeroHeadline:
      (await page.locator("text=Or africain certifié, des mines africaines jusqu'à votre porte").count()) > 0,
    hasHeroTrust:
      (await page.locator("text=Or tracé").count()) > 0 &&
      (await page.locator("text=Conforme").count()) > 0 &&
      (await page.locator("text=Certifié").count()) > 0,
    hasFrenchQuotesHeader: (await page.locator("text=Cours de l'or en direct").count()) > 0,
    hasPrixGramme: (await page.locator("text=Prix au gramme").count()) > 0,
    hasPrixOnce: (await page.locator("text=Prix à l'once").count()) > 0,
    hasReferenceUsd: (await page.locator("text=Référence USD").count()) > 0,
    defaultXofSelected:
      (await page.locator('button:has-text("XOF").bg-amber-500\\/25').count()) > 0,
    hasEspacePro: (await page.locator("text=Espace Pro").count()) > 0,
    noWholesaleLabel: (await page.locator("text=/\\bWholesale\\b/i").count()) === 0,
    hasNewsSecondaryTitle: (await page.locator("text=Actualités & Réglementation").count()) > 0,
    piecesCountPositive: piecesCount > 0,
    collectionCountPositive: collectionCount > 0,
    noDataImages: (await page.locator('img[src^="data:image/"]').count()) === 0,
  };

  const screenshot = path.join(outDir, `${stamp}-bdo-campaign-store.png`);
  await page.screenshot({ path: screenshot, fullPage: true });

  const authority = [];
  authority.push(await checkDirectRoute(context, `https://boursedelor.com/actualites?v=${stamp}`, ["Actualites & Reglementation", "Actualités & Réglementation"]));
  authority.push(await checkDirectRoute(context, `https://boursedelor.com/reglementation?v=${stamp}`, ["Cadre legal de l'or", "Cadre légal de l'or", "Cadre reglementaire"]));
  authority.push(await checkDirectRoute(context, `https://boursedelor.com/industrie-miniere?v=${stamp}`, ["Industrie miniere", "Industrie minière"]));
  authority.push(await checkDirectRoute(context, `https://boursedelor.com/espace-pro?v=${stamp}`, "Espace Pro"));

  return {
    url,
    screenshot: path.relative(process.cwd(), screenshot).replace(/\\/g, "/"),
    checks,
    tiles: {
      pieces: { text: piecesTileText || null, count: piecesCount },
      collection: { text: collectionTileText || null, count: collectionCount },
    },
    authority,
    ok: Object.values(checks).every(Boolean) && authority.every((x) => x.ok),
  };
}

async function checkMet(page) {
  const url = `https://maisonenterre.com/store?v=${stamp}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector("text=Materiaux de construction", { timeout: 30_000 });
  await page.waitForTimeout(1000);

  const checks = {
    hasMarketplaceShell: (await page.locator("text=Materiaux de construction").count()) > 0,
    noMap: (await page.locator(".leaflet-container").count()) === 0,
    noGhostPublished: (await page.locator("text=/\\bpublished\\b/i").count()) === 0,
    noGhostCatalogItem: (await page.locator("text=/catalog item/i").count()) === 0,
    hasMaterialsTitle: (await page.locator("text=Materiaux de construction").count()) > 0,
    hasFcfaPricing: await page.evaluate(() => /CFA/.test(document.body.innerText)),
  };

  const screenshot = path.join(outDir, `${stamp}-met-campaign-store.png`);
  await page.screenshot({ path: screenshot, fullPage: true });

  return {
    url,
    screenshot: path.relative(process.cwd(), screenshot).replace(/\\/g, "/"),
    checks,
    ok: Object.values(checks).every(Boolean),
  };
}

async function run() {
  let browser;
  let browserEngine = "chromium";
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browserEngine = "msedge";
    browser = await chromium.launch({ channel: "msedge", headless: true });
  }
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const bdo = await checkBdo(page, context);
  const met = await checkMet(page);

  const versionBdo = await fetchJsonInPage(page, `https://boursedelor.com/api/system/version?v=${stamp}`);
  const versionMet = await fetchJsonInPage(page, `https://maisonenterre.com/api/system/version?v=${stamp}`);

  await context.close();
  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    browserEngine,
    bdo,
    met,
    version: {
      bdo: versionBdo.json || null,
      met: versionMet.json || null,
    },
    ok: bdo.ok && met.ok,
  };

  const jsonPath = path.join(outDir, `bdo-met-campaign-smoke-${stamp}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, jsonPath: path.relative(process.cwd(), jsonPath).replace(/\\/g, "/") }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
