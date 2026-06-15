#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseURL = (process.env.E2E_BASE_URL || "https://boursedelor.com").replace(/\/+$/, "");
const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";
const now = Date.now();
const outDir = path.resolve(process.cwd(), "artifacts", "bdo-click-audit", String(now));
fs.mkdirSync(outDir, { recursive: true });

const languages = parseCsv("BDO_CLICK_LANGUAGES", ["fr", "en", "ar"]);
const publicRoutes = parseCsv("BDO_CLICK_PUBLIC_ROUTES", [
  "/",
  "/store",
  "/wholesale",
  "/wholesale/machinery",
  "/wholesale/investment-opportunities",
  "/wholesale/apply",
  "/wholesale/membership",
  "/wholesale/counterparties",
  "/pieces",
  "/collections",
  "/cart",
  "/checkout",
  "/marketplace",
  "/marketplace/map",
  "/shop",
  "/actualites",
  "/reglementation",
  "/industrie-miniere",
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
  "/pro/intelligence",
  "/pro/mine",
  "/pro/money",
  "/pro/operations",
  "/pro/chats",
  "/pro/orders",
  "/pro/agents",
  "/pro/account",
  "/espace-pro",
  "/coffre",
  "/mes-objectifs",
  "/orders",
  "/account",
  "/delivery",
  "/stamped-gold",
]);
const adminRoutes = parseCsv("BDO_CLICK_ADMIN_ROUTES", [
  "/admin/dashboard",
  "/admin/orders",
  "/admin/products",
  "/admin/collections",
  "/admin/agents",
  "/admin/wallets",
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
  "/admin/wallet/accounts",
  "/admin/wallet/ledger",
  "/admin/wallet/config",
  "/admin/wallet/topups",
  "/admin/wallet/payouts",
  "/admin/wallet/vouchers",
  "/admin/wallet/sellers",
  "/admin/wallet/risk",
  "/admin/map-icons",
  "/admin/agents-os",
  "/admin/agents/governance",
  "/admin/inbox",
  "/admin/email",
  "/admin/communications/whatsapp",
  "/admin/communications/whatsapp/logs",
  "/admin/communications/twilio",
  "/admin/communications/twilio/logs",
  "/admin/pro-test-accounts",
  "/admin/system/update",
]);

const maxPerRoute = Number(process.env.BDO_CLICK_MAX_PER_ROUTE || 18);
const runAdmin = !/^(0|false|no)$/i.test(String(process.env.BDO_CLICK_ADMIN || "1"));
const runPublic = !/^(0|false|no)$/i.test(String(process.env.BDO_CLICK_PUBLIC || "1"));

function parseCsv(name, fallback) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallback;
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function appendQuery(route, params) {
  const url = new URL(`${baseURL}${route.startsWith("/") ? route : `/${route}`}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function normalizeName(value) {
  return String(value || "route").replace(/^\/+$/, "home").replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-") || "home";
}

function isIgnorableConsole(text) {
  return (
    /status of 401/i.test(text) ||
    /favicon/i.test(text) ||
    /ERR_BLOCKED_BY_CLIENT/i.test(text) ||
    /ResizeObserver loop/i.test(text) ||
    /Failed to load resource: the server responded with a status of 5\d\d/i.test(text) ||
    /Missing `Description` or `aria-describedby=\{undefined\}` for \{DialogContent\}/i.test(text)
  );
}

function shouldSkip(candidate) {
  const text = `${candidate.text} ${candidate.ariaLabel}`.toLowerCase().replace(/\s+/g, " ").trim();
  const href = String(candidate.href || "").toLowerCase();
  const type = String(candidate.type || "").toLowerCase();
  const destructiveWords = [
    "delete",
    "remove",
    "reject",
    "logout",
    "sign out",
    "deconnexion",
    "deconnexion",
    "supprimer",
    "rejeter",
    "reset",
    "clear",
    "archive",
    "desactiver",
    "disable",
    "finaliser le paiement",
    "pay now",
    "payer maintenant",
    "submit payment",
    "mobile money push",
    "confirmer le paiement",
    "upload",
    "televerser",
    "import",
    "export",
    "refund",
    "refunded",
    "rembourser",
    "recheck",
    "re-check",
    "start live call",
    "open actions",
    "open goals",
    "open agenda",
    "tap mic",
    "message tassi",
    "tassi",
    "chairman assistant",
    "agent front-office",
  ];
  if (candidate.target === "_blank") return true;
  if (type === "file" || type === "submit") return true;
  if (candidate.currentLike) return true;
  if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return true;
  if (/^https?:/.test(href) && !href.startsWith(baseURL.toLowerCase())) return true;
  if (destructiveWords.some((word) => text.includes(word))) return true;
  return false;
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
      return {
        browser: await chromium.launch({ headless: true, executablePath }),
        engine: executablePath,
      };
    } catch {
      // Try next local browser.
    }
  }

  return { browser: await chromium.launch({ headless: true }), engine: "playwright-chromium" };
}

async function setupLocale(page, language) {
  await page.addInitScript((lang) => {
    const currency = "XOF";
    try {
      localStorage.setItem("ece_language", lang);
      localStorage.setItem("ece_currency", currency);
      localStorage.setItem(
        "ece_locale_manual_v1",
        JSON.stringify({ language: lang, currency, updatedAt: new Date().toISOString() }),
      );
    } catch {
      // Some transient browser documents deny storage access; cookies below still cover the app route.
    }
    try {
      document.cookie = `exportunity_pref_lang=${encodeURIComponent(lang)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      document.cookie = `exportunity_pref_currency=${encodeURIComponent(currency)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {
      // Ignore storage-denied transitional documents in QA.
    }
  }, language);
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || "";
    return text.trim().length > 40 && !/Resolving tenant/i.test(text);
  }, null, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function suppressAuditOverlays(page) {
  await page
    .addStyleTag({
      content: `
        div.fixed.z-50.bottom-20.right-5,
        div.fixed.z-50.bottom-20.left-5,
        button.fixed.bottom-5.right-5,
        button.fixed.bottom-5.left-5,
        [data-bdo-click-audit-hidden="true"] {
          display: none !important;
          pointer-events: none !important;
        }
      `,
    })
    .catch(() => {});
  await page
    .evaluate(() => {
      const assistantHints = /tassi|chairman|assistant|start live call|open goals|open agenda|message/i;
      for (const element of Array.from(document.querySelectorAll("div.fixed, button.fixed, [role='dialog']"))) {
        const rect = element.getBoundingClientRect();
        const text = String(element.textContent || element.getAttribute("aria-label") || "");
        const isFloatingAssistant =
          assistantHints.test(text) &&
          rect.width > 40 &&
          rect.height > 40 &&
          (rect.right > window.innerWidth - 500 || rect.left < 80) &&
          (rect.bottom > window.innerHeight - 700 || rect.top < 120);
        if (isFloatingAssistant) element.setAttribute("data-bdo-click-audit-hidden", "true");
      }
    })
    .catch(() => {});
}

async function loginAdmin(context) {
  if (!adminEmail || !adminPassword) return { ok: false, skipped: true, reason: "missing credentials" };
  const page = await context.newPage();
  try {
    await page.goto(appendQuery("/admin", { qa: String(now) }), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitReady(page);
    if (!/\/dashboard|\/admin\/password/.test(page.url())) {
      await page
        .locator("input[type='email'], input[name='email'], input[type='password'], input[name='password']")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => {});
      await page.locator("input[type='email'], input[name='email']").first().fill(adminEmail, { timeout: 12_000 });
      await page.locator("input[type='password'], input[name='password']").first().fill(adminPassword, { timeout: 12_000 });
      const submitByType = page.locator("button[type='submit']").first();
      if (await submitByType.isVisible({ timeout: 4000 }).catch(() => false)) {
        await submitByType.click({ timeout: 12_000 });
      } else {
        await page
          .getByRole("button", { name: /sign in|se connecter|acc[e\u00e9]der|login|connexion|console|\u0627\u0644\u062f\u062e\u0648\u0644|\u062f\u062e\u0648\u0644|\u0627\u0644\u0644\u0648\u062d\u0629/i })
          .first()
          .click({ timeout: 12_000 });
      }
      await page.waitForFunction(() => Boolean(localStorage.getItem("ece_session")), null, { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
    const token = await page.evaluate(() => localStorage.getItem("ece_session")).catch(() => null);
    return { ok: Boolean(token), tokenPresent: Boolean(token), url: page.url() };
  } catch (error) {
    return { ok: false, error: String(error?.message || error), url: page.url() };
  } finally {
    await page.close().catch(() => {});
  }
}

async function collectCandidates(page) {
  return page.$$eval("button, a[href], [role='button'], [data-action], [onclick], select, input[type='checkbox'], input[type='radio']", (nodes) => {
    const openDialog = Array.from(document.querySelectorAll("[role='dialog']")).find((dialog) => {
      const rect = dialog.getBoundingClientRect();
      const style = window.getComputedStyle(dialog);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });

    function cssPath(element) {
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
        if (current.id) {
          parts.unshift(`#${CSS.escape(current.id)}`);
          break;
        }
        let segment = current.tagName.toLowerCase();
        const className = Array.from(current.classList || []).find(Boolean);
        if (className) segment += `.${CSS.escape(className)}`;
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((item) => item.tagName === current.tagName);
          if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(segment);
        current = current.parentElement;
      }
      return parts.join(" > ");
    }

    return nodes
      .map((node, index) => {
        const element = node;
        if (openDialog && !openDialog.contains(element)) return null;
        const parentClickable = element.parentElement?.closest("button, a[href], [role='button'], [data-action], [onclick]");
        if (parentClickable && parentClickable !== element) return null;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const visible =
          rect.width >= 16 &&
          rect.height >= 16 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0;
        const disabled =
          element.disabled ||
          element.getAttribute("aria-disabled") === "true" ||
          element.getAttribute("data-disabled") === "true";
        const currentLike = Boolean(
          element.closest("[aria-current='page'], [data-active='true'], [data-state='active']") ||
          element.getAttribute("aria-current") === "page" ||
          element.getAttribute("aria-selected") === "true" ||
          element.getAttribute("aria-pressed") === "true" ||
          element.getAttribute("data-state") === "active",
        );
        if (!visible || disabled) return null;
        if (String(element.id || "").startsWith("radix-")) return null;
        const text = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160);
        return {
          index,
          selector: cssPath(element),
          testId: element.getAttribute("data-testid") || "",
          text,
          ariaLabel: element.getAttribute("aria-label") || "",
          href: element.getAttribute("href") || "",
          target: element.getAttribute("target") || "",
          type: element.getAttribute("type") || "",
          tag: element.tagName.toLowerCase(),
          currentLike,
        };
      })
      .filter(Boolean);
  });
}

async function collectCandidatesStable(page) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await collectCandidates(page);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      if (!/Execution context was destroyed|navigation/i.test(message)) throw error;
      await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
      await waitReady(page);
    }
  }
  throw lastError;
}

async function hitTest(locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const x = Math.max(0, Math.min(window.innerWidth - 1, Math.round(rect.left + rect.width / 2)));
    const y = Math.max(0, Math.min(window.innerHeight - 1, Math.round(rect.top + rect.height / 2)));
    const top = document.elementFromPoint(x, y);
    const ok = top === node || node.contains(top) || top?.contains(node);
    const describe = (element) => {
      if (!element) return "none";
      const id = element.id ? `#${element.id}` : "";
      const cls = element.className ? `.${String(element.className).trim().split(/\s+/).slice(0, 2).join(".")}` : "";
      return `${element.tagName.toLowerCase()}${id}${cls}`;
    };
    return { ok, top: describe(top), x, y };
  });
}

async function signature(page) {
  return page.evaluate(() => {
    const open = document.querySelectorAll("[role='dialog'], [role='menu'], [data-state='open']").length;
    const active = document.querySelectorAll("[aria-expanded='true'], [aria-pressed='true'], [aria-selected='true']").length;
    const url = location.href;
    const textLen = (document.body?.innerText || "").slice(0, 4000).length;
    const focused = document.activeElement?.tagName || "";
    return `${url}|${open}|${active}|${textLen}|${focused}`;
  }).catch(() => "signature-error");
}

async function auditRoute(context, route, language, scope) {
  const page = await context.newPage();
  await setupLocale(page, language);
  const consoleIssues = [];
  const pageErrors = [];
  const serverErrors = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type()) && !isIgnorableConsole(msg.text())) {
      consoleIssues.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push({
        status: response.status(),
        method: response.request().method(),
        url: response.url(),
      });
    }
  });

  const routeResult = {
    scope,
    route,
    language,
    url: "",
    total: 0,
    audited: 0,
    passed: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    consoleIssues,
    pageErrors,
    serverErrors,
  };

  try {
    await page.goto(appendQuery(route, { lang: language, currency: "XOF", qa: String(now) }), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await waitReady(page);
    await suppressAuditOverlays(page);
    routeResult.url = page.url();
    const candidates = (await collectCandidatesStable(page)).slice(0, maxPerRoute);
    routeResult.total = candidates.length;

    for (const candidate of candidates) {
      if (shouldSkip(candidate)) {
        routeResult.skipped += 1;
        continue;
      }

      await page.goto(appendQuery(route, { lang: language, currency: "XOF", qa: String(now) }), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await waitReady(page);
      await suppressAuditOverlays(page);
      const locator = candidate.testId
        ? page.locator(`[data-testid="${candidate.testId}"]`).first()
        : page.locator(candidate.selector).first();
      if ((await locator.count().catch(() => 0)) === 0) {
        routeResult.skipped += 1;
        continue;
      }
      await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      const hit = await hitTest(locator).catch((error) => ({ ok: false, top: String(error?.message || error), x: 0, y: 0 }));
      const before = await signature(page);
      let requestCount = 0;
      const onRequest = () => { requestCount += 1; };
      page.on("request", onRequest);
      let clickError = "";
      try {
        await locator.click({ timeout: 5000 });
        await page.waitForTimeout(500);
      } catch (error) {
        clickError = String(error?.message || error);
      } finally {
        page.off("request", onRequest);
      }
      const after = await signature(page);
      const responsive = !clickError && (before !== after || requestCount > 0);
      routeResult.audited += 1;
      if (responsive) {
        routeResult.passed += 1;
      } else {
        const screenshot = `${scope}-${language}-${normalizeName(route)}-${candidate.index}.png`;
        await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true }).catch(() => {});
        routeResult.failed += 1;
        routeResult.failures.push({
          selector: candidate.selector,
          text: candidate.text || candidate.ariaLabel || candidate.href || candidate.tag,
          reason: clickError || (hit.ok ? "no_navigation_no_modal_no_state_change_no_request" : `blocked_by_${hit.top}_at_${hit.x}_${hit.y}`),
          screenshot,
        });
      }
    }
  } catch (error) {
    routeResult.failed += 1;
    routeResult.failures.push({ selector: "route", text: route, reason: String(error?.message || error), screenshot: "" });
  } finally {
    await page.close().catch(() => {});
  }

  return routeResult;
}

function writeReport(report) {
  const jsonPath = path.join(outDir, "bdo-click-audit.json");
  const mdPath = path.join(outDir, "bdo-click-audit.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const lines = [
    "# BOURSE DE L'OR Click Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Base URL: ${report.baseURL}`,
    `Overall: **${report.summary.ok ? "PASS" : "FAIL"}**`,
    `Routes checked: ${report.summary.routeCount}`,
    `Audited controls: ${report.summary.audited}`,
    `Failed controls: ${report.summary.failed}`,
    `Skipped controls: ${report.summary.skipped}`,
    "",
  ];
  for (const route of report.routes.filter((item) => item.failed > 0 || item.consoleIssues.length || item.pageErrors.length || item.serverErrors.length)) {
    lines.push(`## ${route.scope} ${route.language} ${route.route}`);
    lines.push(`URL: ${route.url}`);
    for (const failure of route.failures) {
      lines.push(`- ${failure.text || failure.selector}: ${failure.reason}${failure.screenshot ? ` (${failure.screenshot})` : ""}`);
    }
    for (const issue of route.consoleIssues.slice(0, 6)) lines.push(`- Console: \`${issue.slice(0, 240)}\``);
    for (const issue of route.pageErrors.slice(0, 6)) lines.push(`- Page error: \`${issue.slice(0, 240)}\``);
    for (const issue of route.serverErrors.slice(0, 6)) lines.push(`- HTTP ${issue.status}: \`${issue.method} ${issue.url.slice(0, 240)}\``);
    lines.push("");
  }
  if (!report.routes.some((item) => item.failed > 0 || item.consoleIssues.length || item.pageErrors.length || item.serverErrors.length)) {
    lines.push("No dead controls or critical console errors found.");
  }
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return {
    jsonPath: path.relative(process.cwd(), jsonPath).replace(/\\/g, "/"),
    mdPath: path.relative(process.cwd(), mdPath).replace(/\\/g, "/"),
  };
}

async function main() {
  const { browser, engine } = await launchBrowser();
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
    locale: "fr-FR",
  });

  const adminLogin = runAdmin ? await loginAdmin(context) : { ok: false, skipped: true, reason: "disabled" };
  const routes = [];

  if (runPublic) {
    for (const route of publicRoutes) {
      for (const language of languages) routes.push(await auditRoute(context, route, language, "public"));
    }
  }

  if (runAdmin && adminLogin.ok) {
    for (const route of adminRoutes) {
      for (const language of languages) routes.push(await auditRoute(context, route, language, "admin"));
    }
  }

  await browser.close();

  const summary = {
    ok:
      routes.every(
        (item) =>
          item.failed === 0 &&
          item.consoleIssues.length === 0 &&
          item.pageErrors.length === 0 &&
          item.serverErrors.length === 0,
      ) && (adminLogin.ok || adminLogin.skipped),
    routeCount: routes.length,
    audited: routes.reduce((sum, item) => sum + item.audited, 0),
    passed: routes.reduce((sum, item) => sum + item.passed, 0),
    failed: routes.reduce((sum, item) => sum + item.failed, 0),
    skipped: routes.reduce((sum, item) => sum + item.skipped, 0),
    adminLogin,
  };
  const report = {
    generatedAt: new Date().toISOString(),
    baseURL,
    browserEngine: engine,
    languages,
    maxPerRoute,
    summary,
    routes,
  };
  const paths = writeReport(report);
  console.log(JSON.stringify({ ...summary, ...paths }, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[bdo-click-audit] failed:", error?.stack || error?.message || error);
  process.exit(1);
});
