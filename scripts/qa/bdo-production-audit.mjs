#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseURL = (process.env.E2E_BASE_URL || "https://boursedelor.com").replace(/\/+$/, "");
const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";
const runMutatingChecks = /^(1|true|yes)$/i.test(String(process.env.BDO_AUDIT_MUTATING || ""));
const now = Date.now();
const outDir = path.resolve(process.cwd(), "artifacts", "bdo-production-audit", String(now));
fs.mkdirSync(outDir, { recursive: true });

const languages = ["fr", "en", "ar"];
const adminLanguages = languages;

const publicRoutes = [
  "/",
  "/store",
  "/wholesale",
  "/certification",
  "/verifier",
  "/login",
  "/register",
  "/pro/login",
  "/pro",
  "/pro/map",
  "/pro/buyers",
  "/pro/counterparties",
  "/pro/bureaux-achat",
  "/pro/exportateurs-verifies",
  "/pro/membership",
  "/pro/mine",
  "/pro/money",
  "/pro/operations",
  "/coffre",
  "/mes-objectifs",
  "/orders",
  "/stamped-gold",
];

const adminRoutes = [
  "/admin/dashboard",
  "/admin/bdo/goals",
  "/admin/bdo/pro-memberships",
  "/admin/bdo/settings",
  "/admin/stamped-gold",
  "/admin/stamped-gold/skus",
  "/admin/stamped-gold/items",
  "/admin/stamped-gold/jewellers",
  "/admin/stamped-gold/minting-studio",
  "/admin/stamped-gold/scans",
  "/admin/stamped-gold/pickup",
  "/admin/marketplace/products",
  "/admin/marketplace/payments",
  "/admin/wallet",
  "/admin/wallet/config",
  "/admin/wallet/topups",
  "/admin/map-icons",
  "/admin/agents-os",
  "/admin/agents/governance",
];

const forbiddenPublicPatterns = [
  /Exportunity Marketplace/i,
  /Maison[s]? en Terre/i,
  /Lorem ipsum/i,
  /\bTODO\b/i,
  /coming soon/i,
  /cash out anywhere/i,
  /gold wallet/i,
  /guaranteed return/i,
  /guaranteed buyback/i,
  /peer-to-peer gold exchange/i,
  /instant liquidity/i,
  /deposit money/i,
  /gold account/i,
  /investment yield/i,
];

const hardErrorPatterns = [
  /Page failed to load/i,
  /Application error/i,
  /Something went wrong/i,
  /Cannot read properties/i,
  /TypeError:/i,
  /ReferenceError:/i,
  /SyntaxError:/i,
  /build mismatch/i,
];

const languageSignals = {
  fr: [/Bourse de l['’]Or/i, /Achetez|March[eé]|Pi[eè]ces|certifi[eé]/i],
  en: [/Buy|Certified|Gold|Order|Professional|Market|Online payment/i],
  ar: [/[\u0600-\u06ff]/],
};

const untranslatedFrenchSignals = [
  "Achetez",
  "Marché de gros",
  "Pièces certifiées",
  "Paramètres",
  "Compte",
  "Objectif d'achat",
  "Espace professionnel",
  "Nos premières",
  "Sélection publique",
  "Mon coffre",
  "Catalogue complet",
  "Voir tout",
  "Actualités",
  "Réglementation",
  "Commande",
  "Paiement",
];

async function firstUsableLocator(locators, timeout = 2000) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    const first = locator.first();
    const visible = await first.isVisible({ timeout }).catch(() => false);
    if (visible) return first;
  }
  return null;
}

function appendQuery(route, params) {
  const url = new URL(`${baseURL}${route.startsWith("/") ? route : `/${route}`}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function normalizeRouteName(route) {
  return route.replace(/^\/+$/, "home").replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-") || "home";
}

function isIgnoredConsoleIssue(text) {
  const value = String(text || "");
  return (
    /status of 401/i.test(value) ||
    /favicon/i.test(value) ||
    /Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/i.test(value) ||
    /ResizeObserver loop/i.test(value)
  );
}

async function launchBrowser() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].filter(Boolean);

  for (const executablePath of candidates) {
    if (!fs.existsSync(executablePath)) continue;
    try {
      const browser = await chromium.launch({ headless: true, executablePath });
      return { browser, engine: executablePath };
    } catch {
      // Try the next local browser.
    }
  }

  try {
    const browser = await chromium.launch({ headless: true });
    return { browser, engine: "playwright-chromium" };
  } catch (error) {
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    return { browser, engine: "msedge-channel", fallbackReason: String(error?.message || error) };
  }
}

async function setupLocale(page, language) {
  await page.addInitScript((lang) => {
    const currency = "XOF";
    localStorage.setItem("ece_language", lang);
    localStorage.setItem("ece_currency", currency);
    localStorage.setItem(
      "ece_locale_manual_v1",
      JSON.stringify({ language: lang, currency, updatedAt: new Date().toISOString() }),
    );
    document.cookie = `exportunity_pref_lang=${encodeURIComponent(lang)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.cookie = `exportunity_pref_currency=${encodeURIComponent(currency)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, language);
}

async function collectPageDiagnostics(page, options) {
  const bodyText = await page.locator("body").innerText({ timeout: 12_000 }).catch(() => "");
  const title = await page.title().catch(() => "");
  const htmlLang = await page.evaluate(() => document.documentElement.lang || "").catch(() => "");
  const htmlDir = await page.evaluate(() => document.documentElement.dir || "").catch(() => "");
  const url = page.url();

  const brokenImages = await page
    .evaluate(() =>
      Array.from(document.images)
        .filter((img) => {
          const rect = img.getBoundingClientRect();
          const visible = rect.width > 3 && rect.height > 3;
          return visible && img.complete && img.naturalWidth === 0;
        })
        .slice(0, 20)
        .map((img) => ({
          src: img.currentSrc || img.src || "",
          alt: img.alt || "",
        })),
    )
    .catch(() => []);

  const emptyActions = await page
    .evaluate(() =>
      Array.from(document.querySelectorAll("button,a,[role='button']"))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (rect.width < 8 || rect.height < 8) return false;
          if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
          const label = [
            el.textContent || "",
            el.getAttribute("aria-label") || "",
            el.getAttribute("title") || "",
            el.querySelector("img")?.getAttribute("alt") || "",
            el.querySelector(".sr-only")?.textContent || "",
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          return !label;
        })
        .slice(0, 20)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          className: String(el.getAttribute("class") || "").slice(0, 140),
          href: el.getAttribute("href") || "",
        })),
    )
    .catch(() => []);

  const forbiddenMatches = options.scope === "public"
    ? forbiddenPublicPatterns.filter((pattern) => pattern.test(bodyText)).map((pattern) => String(pattern))
    : [];
  const hardErrors = hardErrorPatterns.filter((pattern) => pattern.test(bodyText)).map((pattern) => String(pattern));
  const languageOk = (languageSignals[options.language] || []).some((pattern) => pattern.test(bodyText));
  const untranslatedSignals =
    options.language === "fr"
      ? []
      : untranslatedFrenchSignals.filter((phrase) => bodyText.toLowerCase().includes(phrase.toLowerCase()));

  const checks = {
    loadedText: bodyText.trim().length > 80,
    brandVisible: options.scope === "admin" || /Bourse de l['’]Or|BOURSE DE L['’]OR/i.test(bodyText),
    noForbiddenPublicCopy: forbiddenMatches.length === 0,
    noHardErrorCopy: hardErrors.length === 0,
    noBrokenImages: brokenImages.length === 0,
    noEmptyActions: emptyActions.length === 0,
    languageSignal: languageOk,
    htmlDirection: options.language === "ar" ? htmlDir === "rtl" : htmlDir !== "rtl",
    translationCoverage: untranslatedSignals.length <= (options.scope === "admin" ? 10 : 5),
  };

  return {
    route: options.route,
    scope: options.scope,
    language: options.language,
    url,
    title,
    htmlLang,
    htmlDir,
    checks,
    forbiddenMatches,
    hardErrors,
    brokenImages,
    emptyActions,
    untranslatedSignals,
    textSample: bodyText.slice(0, 1400),
  };
}

function routeOk(result) {
  return (
    Object.values(result.checks || {}).every(Boolean) &&
    (result.responseStatus == null || result.responseStatus < 400) &&
    (result.criticalConsoleIssues || []).length === 0
  );
}

async function auditRoute(context, route, language, scope) {
  const page = await context.newPage();
  await setupLocale(page, language);
  const consoleIssues = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) consoleIssues.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const targetUrl = appendQuery(route, {
    lang: language,
    currency: "XOF",
    qa: String(now),
  });

  let responseStatus = null;
  let navigationError = null;
  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 75_000 });
    responseStatus = response?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1200);
  } catch (error) {
    navigationError = String(error?.message || error);
  }

  const result = await collectPageDiagnostics(page, { route, language, scope }).catch((error) => ({
    route,
    scope,
    language,
    url: page.url(),
    checks: {
      loadedText: false,
      brandVisible: false,
      noForbiddenPublicCopy: false,
      noHardErrorCopy: false,
      noBrokenImages: false,
      noEmptyActions: false,
      languageSignal: false,
      htmlDirection: false,
      translationCoverage: false,
    },
    collectError: String(error?.message || error),
  }));

  result.responseStatus = responseStatus;
  result.navigationError = navigationError;
  result.consoleIssues = consoleIssues.slice(-20);
  result.criticalConsoleIssues = [...consoleIssues.filter((issue) => !isIgnoredConsoleIssue(issue)), ...pageErrors].slice(-20);
  result.ok = !navigationError && routeOk(result);

  if (!result.ok) {
    const screenshotName = `${scope}-${language}-${normalizeRouteName(route)}.png`;
    const screenshotPath = path.join(outDir, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    result.screenshot = path.relative(process.cwd(), screenshotPath).replace(/\\/g, "/");
  }

  await page.close();
  return result;
}

async function loginAdmin(context) {
  if (!adminEmail || !adminPassword) {
    return { ok: false, skipped: true, reason: "E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD not set" };
  }

  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) errors.push(msg.text());
  });

  try {
    await page.goto(appendQuery("/admin", { qa: String(now) }), { waitUntil: "domcontentloaded", timeout: 75_000 });
    await page.waitForTimeout(1200);

    if (!/\/dashboard|\/admin\/password/.test(page.url())) {
      const emailInput = await firstUsableLocator([
        page.getByLabel(/email/i),
        page.locator("input[type='email']"),
        page.locator("input[name='email']"),
      ]);
      const passwordInput = await firstUsableLocator([
        page.getByLabel(/password|mot de passe/i),
        page.locator("input[type='password']"),
        page.locator("input[name='password']"),
      ]);
      if (!emailInput || !passwordInput) throw new Error("Admin login fields not found");
      await emailInput.fill(adminEmail, { timeout: 15_000 });
      await passwordInput.fill(adminPassword, { timeout: 15_000 });
      const submit = page.getByRole("button", { name: /sign in|se connecter|login|connexion/i }).first();
      await submit.click({ timeout: 15_000 });
      await page.waitForFunction(() => Boolean(localStorage.getItem("ece_session")), null, { timeout: 40_000 }).catch(() => {});
      await page.waitForURL(/\/dashboard|\/admin\/password|\/admin\/email|\/admin|\/store|\/$/, { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    const token = await page.evaluate(() => localStorage.getItem("ece_session")).catch(() => null);
    const body = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
    const ok = Boolean(token);
    return { ok, tokenPresent: Boolean(token), url: page.url(), errors: errors.filter((issue) => !isIgnoredConsoleIssue(issue)).slice(-10) };
  } catch (error) {
    const screenshotPath = path.join(outDir, "admin-login-failure.png");
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    return {
      ok: false,
      error: String(error?.message || error),
      url: page.url(),
      screenshot: path.relative(process.cwd(), screenshotPath).replace(/\\/g, "/"),
      errors: errors.slice(-10),
    };
  } finally {
    await page.close();
  }
}

async function runNonDestructiveActionChecks(context) {
  const checks = [];
  const page = await context.newPage();
  try {
    await page.goto(appendQuery("/", { lang: "fr", currency: "XOF", qa: String(now) }), {
      waitUntil: "domcontentloaded",
      timeout: 75_000,
    });
    await page.waitForTimeout(2000);
    const wholesale = await firstUsableLocator([
      page.getByRole("link", { name: /march[eé] de gros|wholesale/i }),
      page.getByRole("button", { name: /march[eé] de gros|wholesale/i }),
      page.getByText(/march[eé] de gros|wholesale/i),
    ], 5000);
    const wholesaleVisible = Boolean(wholesale) && await wholesale.isVisible({ timeout: 5000 }).catch(() => false);
    if (wholesaleVisible) {
      await wholesale.click();
      await page.waitForTimeout(1800);
    }
    const wholesaleText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
    checks.push({
      name: "home-wholesale-entry",
      ok: wholesaleVisible && /march[eé] de gros|wholesale|cartographie|sourcing|bureau|acheteur/i.test(wholesaleText),
      url: page.url(),
    });

    await page.goto(appendQuery("/verifier", { lang: "fr", currency: "XOF", qa: String(now) }), {
      waitUntil: "domcontentloaded",
      timeout: 75_000,
    });
    await page.waitForTimeout(1200);
    const verifierText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
    checks.push({
      name: "verifier-page-has-certificate-flow",
      ok: /v[eé]rifier|verify|certificat|certificate|num[eé]ro|QR/i.test(verifierText),
      url: page.url(),
    });
  } catch (error) {
    checks.push({ name: "non-destructive-actions", ok: false, error: String(error?.message || error), url: page.url() });
  } finally {
    await page.close();
  }

  if (!runMutatingChecks) return checks;

  const checkoutPage = await context.newPage();
  try {
    await checkoutPage.goto(appendQuery("/store", { lang: "fr", currency: "XOF", qa: String(now) }), {
      waitUntil: "domcontentloaded",
      timeout: 75_000,
    });
    await checkoutPage.waitForTimeout(3000);
    const buyButton = checkoutPage.getByRole("button", { name: /^acheter$/i }).first();
    const buyVisible = await buyButton.isVisible({ timeout: 8000 }).catch(() => false);
    if (buyVisible) {
      await buyButton.click();
      await checkoutPage.waitForTimeout(1200);
      const onlineButton = checkoutPage.getByRole("button", { name: /continuer vers le paiement en ligne/i }).first();
      await onlineButton.click({ timeout: 10_000 });
      await checkoutPage.waitForTimeout(3500);
    }
    const checkoutText = await checkoutPage.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
    checks.push({
      name: "mutating-buy-to-online-payment",
      ok: buyVisible && /Paiement en ligne|Ouvrir KKiaPay|Flutterwave|Mobile Money/i.test(checkoutText),
      url: checkoutPage.url(),
    });
  } catch (error) {
    checks.push({ name: "mutating-buy-to-online-payment", ok: false, error: String(error?.message || error), url: checkoutPage.url() });
  } finally {
    await checkoutPage.close();
  }

  return checks;
}

function summarize(results, actionChecks, adminLogin) {
  const failedRoutes = results.filter((item) => !item.ok);
  const failedActions = actionChecks.filter((item) => !item.ok);
  return {
    ok: failedRoutes.length === 0 && failedActions.length === 0 && (adminLogin.skipped || adminLogin.ok),
    failedRouteCount: failedRoutes.length,
    failedActionCount: failedActions.length,
    routeCount: results.length,
    adminLogin,
  };
}

function writeReports(report) {
  const jsonPath = path.join(outDir, "bdo-production-audit.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const lines = [];
  lines.push(`# BOURSE DE L'OR Production Audit`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Base URL: ${report.baseURL}`);
  lines.push(`Browser: ${report.browserEngine}`);
  lines.push(`Overall: **${report.summary.ok ? "PASS" : "FAIL"}**`);
  lines.push("");
  lines.push(`Routes checked: ${report.summary.routeCount}`);
  lines.push(`Failed routes: ${report.summary.failedRouteCount}`);
  lines.push(`Failed actions: ${report.summary.failedActionCount}`);
  lines.push(`Admin login: ${report.summary.adminLogin.ok ? "OK" : report.summary.adminLogin.skipped ? "SKIPPED" : "FAIL"}`);
  lines.push("");

  for (const action of report.actionChecks) {
    lines.push(`- Action ${action.name}: **${action.ok ? "PASS" : "FAIL"}** (${action.url || ""})`);
    if (action.error) lines.push(`  Error: \`${action.error}\``);
  }
  lines.push("");

  const failed = report.routes.filter((item) => !item.ok);
  if (failed.length) {
    lines.push("## Failed Routes");
    for (const item of failed) {
      lines.push(`### ${item.scope} ${item.language} ${item.route}`);
      lines.push(`- URL: ${item.url}`);
      lines.push(`- Status: ${item.responseStatus ?? "n/a"}`);
      if (item.screenshot) lines.push(`- Screenshot: \`${item.screenshot}\``);
      for (const [key, value] of Object.entries(item.checks || {})) {
        if (!value) lines.push(`- Failed check: \`${key}\``);
      }
      if (item.navigationError) lines.push(`- Navigation: \`${item.navigationError}\``);
      if (item.hardErrors?.length) lines.push(`- Hard errors: ${item.hardErrors.join(", ")}`);
      if (item.forbiddenMatches?.length) lines.push(`- Forbidden copy: ${item.forbiddenMatches.join(", ")}`);
      if (item.untranslatedSignals?.length) lines.push(`- Untranslated signals: ${item.untranslatedSignals.join(", ")}`);
      if (item.criticalConsoleIssues?.length) {
        lines.push("- Console:");
        item.criticalConsoleIssues.slice(0, 8).forEach((issue) => lines.push(`  - \`${issue.slice(0, 240)}\``));
      }
      lines.push("");
    }
  } else {
    lines.push("No failed routes.");
  }

  const mdPath = path.join(outDir, "bdo-production-audit.md");
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return {
    jsonPath: path.relative(process.cwd(), jsonPath).replace(/\\/g, "/"),
    mdPath: path.relative(process.cwd(), mdPath).replace(/\\/g, "/"),
  };
}

async function main() {
  const { browser, engine, fallbackReason } = await launchBrowser();
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
    locale: "fr-FR",
  });

  const routes = [];

  for (const route of publicRoutes) {
    for (const language of languages) {
      routes.push(await auditRoute(context, route, language, "public"));
    }
  }

  const adminLogin = await loginAdmin(context);
  if (adminLogin.ok) {
    for (const route of adminRoutes) {
      for (const language of adminLanguages) {
        routes.push(await auditRoute(context, route, language, "admin"));
      }
    }
  }

  const actionChecks = await runNonDestructiveActionChecks(context);

  await context.close();
  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    baseURL,
    browserEngine: engine,
    fallbackReason,
    mutatingChecks: runMutatingChecks,
    summary: summarize(routes, actionChecks, adminLogin),
    actionChecks,
    routes,
  };
  const paths = writeReports(report);

  console.log(JSON.stringify({ ...report.summary, ...paths }, null, 2));
  if (!report.summary.ok) process.exit(2);
}

main().catch((error) => {
  console.error("[bdo-production-audit] failed:", error?.stack || error?.message || error);
  process.exit(1);
});
