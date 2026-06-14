#!/usr/bin/env node
import fs from "node:fs";
import { chromium } from "playwright";

const baseURL = (process.env.E2E_BASE_URL || "https://boursedelor.com").replace(/\/+$/, "");
const now = Date.now();

async function launchBrowser() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);

  for (const executablePath of candidates) {
    if (!fs.existsSync(executablePath)) continue;
    try {
      return {
        browser: await chromium.launch({ headless: true, executablePath }),
        engine: executablePath,
      };
    } catch {
      // Try the next local browser.
    }
  }

  return { browser: await chromium.launch({ channel: "chrome", headless: true }), engine: "chrome-channel" };
}

async function bodyText(page) {
  return page.locator("body").innerText({ timeout: 15_000 }).catch(() => "");
}

async function visible(page, pattern) {
  return page.getByText(pattern).first().isVisible({ timeout: 5000 }).catch(() => false);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const { browser, engine } = await launchBrowser();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  locale: "fr-FR",
});

const report = {
  ok: false,
  baseURL,
  browserEngine: engine,
  orderUrl: "",
  orderNumber: "",
  checks: {},
  consoleIssues: [],
  samples: {},
};

page.on("console", (msg) => {
  const text = msg.text();
  if (msg.type() === "error" && !/status of 401|favicon/i.test(text)) {
    report.consoleIssues.push(`${msg.type()}: ${text.slice(0, 240)}`);
  }
});
page.on("pageerror", (error) => {
  report.consoleIssues.push(`pageerror: ${error.message}`);
});

try {
  await page.goto(`${baseURL}/store?lang=fr&currency=XOF&qa=payment-${now}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const storeText = await bodyText(page);
  report.checks.storeLoaded = /Bourse de l['\u2019]Or|BOURSE DE L['\u2019]OR/i.test(storeText);
  report.checks.productsVisible = /Pi[e\u00e8]ce certifi[e\u00e9]e|Lingot|Acheter/i.test(storeText);
  report.samples.store = compact(storeText).slice(0, 600);

  const buyButton = page.getByRole("button", { name: /^Acheter$/i }).first();
  report.checks.buyButtonVisible = await buyButton.isVisible({ timeout: 8000 }).catch(() => false);
  if (!report.checks.buyButtonVisible) throw new Error("No visible Acheter button on /store");

  await buyButton.click({ timeout: 12_000 });
  await page.waitForURL(/\/orders\//, { timeout: 35_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const orderText = await bodyText(page);
  report.orderUrl = page.url();
  const orderMatch = report.orderUrl.match(/\/orders\/([^?/#]+)/);
  report.orderNumber = orderMatch ? decodeURIComponent(orderMatch[1]) : "";
  report.samples.order = compact(orderText).slice(0, 900);
  report.checks.orderCreated = /\/orders\//.test(report.orderUrl) && Boolean(report.orderNumber);
  report.checks.orderPageLoaded = /Paiement en ligne|Paiement s[e\u00e9]curis[e\u00e9]|Commande enregistr[e\u00e9]e/i.test(
    orderText,
  );
  report.checks.onlinePaymentAreaVisible = await visible(
    page,
    /Paiement en ligne|Paiement s[e\u00e9]curis[e\u00e9]|Mobile Money Push|Carte \/ autre/i,
  );
  report.checks.paymentDialogOpen = await page
    .locator("[role='dialog']")
    .filter({ hasText: /Paiement s[e\u00e9]curis[e\u00e9]|Mobile Money Push|Carte \/ autre/i })
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  report.checks.paymentOptionsVisible =
    (await visible(page, /Mobile Money Push/i)) && (await visible(page, /Carte \/ autre/i));
  report.checks.assistantNotForced = !/payer avec l'assistant|pay with assistant/i.test(orderText);
  report.checks.paymentLayerAboveToasts = await page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog']");
    const toastViewport = document.querySelector("[data-radix-toast-viewport]");
    const dialogZ = dialog ? Number(window.getComputedStyle(dialog).zIndex || 0) : 0;
    const toastZ = toastViewport ? Number(window.getComputedStyle(toastViewport).zIndex || 0) : 0;
    return dialogZ > toastZ;
  });
  report.checks.noBlockingErrorVisible = !/Page failed to load|Application error|Something went wrong/i.test(orderText);

  report.ok =
    Object.values(report.checks).every(Boolean) &&
    report.consoleIssues.length === 0 &&
    report.checks.assistantNotForced === true;
} catch (error) {
  report.error = String(error?.stack || error?.message || error);
} finally {
  await browser.close().catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
