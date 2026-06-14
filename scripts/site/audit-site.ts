import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

import { MARKETING_PAGE_CONTRACTS } from "../../client/src/content/marketing/pageContracts";
import { PLATFORM_MODULES } from "../../client/src/content/platformModules";

type Severity = "critical" | "warning";

type Issue = {
  severity: Severity;
  code: string;
  message: string;
  route: string;
  detail?: unknown;
};

type RouteAudit = {
  route: string;
  title: string;
  metaDescription: string;
  ctaCountAboveFold: number;
  internalLinks: string[];
  issues: Issue[];
};

const PLACEHOLDER_PATTERNS = [
  "coming soon",
  "lorem ipsum",
  "no entries available",
  "no press entries",
  "designed to be synced",
  "this page is",
  "proof tiles are not configured",
];

function parseMode() {
  const raw = process.argv.find((arg) => arg.startsWith("--mode="));
  const mode = raw ? raw.split("=")[1] : "site";
  if (mode === "links" || mode === "ux" || mode === "site") return mode;
  return "site";
}

function parseBool(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function normalizeUrl(baseUrl: string, maybePath: string, options?: { forceMarketingParam?: boolean }) {
  if (/^https?:\/\//i.test(maybePath)) return maybePath;
  const url = new URL(maybePath, baseUrl);
  if (options?.forceMarketingParam) {
    try {
      const base = new URL(baseUrl);
      if (url.origin === base.origin && !url.searchParams.has("marketing")) {
        url.searchParams.set("marketing", "1");
      }
    } catch {
      // ignore
    }
  }
  return url.toString();
}

async function checkInternalLinks(baseUrl: string, links: string[], options?: { forceMarketingParam?: boolean }) {
  const unique = [...new Set(links)];
  const failures: Array<{ href: string; status: number; text: string }> = [];
  for (const href of unique) {
    const target = normalizeUrl(baseUrl, href, options);
    try {
      const response = await fetch(target, { method: "GET", redirect: "manual" });
      const status = response.status;
      if (status >= 400) {
        const text = await response.text();
        failures.push({ href, status, text: text.slice(0, 140) });
      }
    } catch (error: any) {
      failures.push({ href, status: 0, text: error?.message || "network error" });
    }
  }
  return failures;
}

async function run() {
  const mode = parseMode();
  const baseUrl = process.env.MARKETING_AUDIT_BASE_URL || process.env.AUDIT_BASE_URL || "http://127.0.0.1:5000";
  const forceMarketingParam = parseBool(process.env.MARKETING_AUDIT_FORCE_MARKETING);
  const browserCandidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].filter(Boolean) as string[];
  let browser = null as Awaited<ReturnType<typeof chromium.launch>> | null;
  for (const executablePath of browserCandidates) {
    if (!fsSync.existsSync(executablePath)) continue;
    try {
      browser = await chromium.launch({ headless: true, executablePath });
      break;
    } catch {
      // Continue to the next installed browser before trying bundled Chromium.
    }
  }
  browser ??= await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const routeAudits: RouteAudit[] = [];
  const issues: Issue[] = [];

  for (const contract of MARKETING_PAGE_CONTRACTS) {
    const route = contract.path;
    const url = normalizeUrl(baseUrl, route, { forceMarketingParam });
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

    const title = await page.title();
    const metaDescription = await page.locator("meta[name='description']").getAttribute("content").catch(() => "");

    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    const isBdoPage =
      title.toLowerCase().includes("bourse de l'or") ||
      String(metaDescription || "").toLowerCase().includes("bourse de l'or") ||
      bodyText.includes("bourse de l'or");
    const localIssues: Issue[] = [];

    if (!title.trim()) {
      localIssues.push({ severity: "critical", code: "missing_title", message: "Page title is empty.", route });
    }
    if (!String(metaDescription || "").trim()) {
      localIssues.push({ severity: "critical", code: "missing_meta_description", message: "Meta description is empty.", route });
    }

    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (bodyText.includes(pattern)) {
        localIssues.push({
          severity: "critical",
          code: "placeholder_copy",
          message: `Placeholder text found: "${pattern}"`,
          route,
        });
      }
    }

    const deadAnchors = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href]"))
        .filter((anchor) => {
          const href = (anchor.getAttribute("href") || "").trim();
          if (!href || href === "#" || href.toLowerCase() === "javascript:void(0)") return true;
          return false;
        })
        .filter((anchor) => {
          const node = anchor as HTMLElement;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((anchor) => (anchor.getAttribute("href") || "").trim());
    });
    if (deadAnchors.length) {
      localIssues.push({
        severity: "critical",
        code: "dead_href",
        message: "Anchor with empty or dead href detected.",
        route,
        detail: deadAnchors.slice(0, 10),
      });
    }

    const ctaCountAboveFold = await page.evaluate(() => {
      const clickables = Array.from(document.querySelectorAll("a,button,[role='button']"));
      return clickables.filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const text = ((el as HTMLElement).innerText || "").trim();
        if (!text) return false;
        if (rect.width < 40 || rect.height < 20) return false;
        return rect.top >= 0 && rect.top < 820;
      }).length;
    });
    if (ctaCountAboveFold < 1) {
      localIssues.push({
        severity: "critical",
        code: "no_primary_cta_above_fold",
        message: "No clickable CTA detected above the fold.",
        route,
      });
    }

    const contractPrimaryFound = await page.evaluate((expectedHref) => {
      const anchors = Array.from(document.querySelectorAll("a"));
      return anchors.some((anchor) => {
        const href = anchor.getAttribute("href") || "";
        if (!href) return false;
        if (expectedHref.startsWith("http")) {
          return href.includes(expectedHref);
        }
        return href.startsWith(expectedHref);
      });
    }, contract.primaryCTA.href);
    const isCrossTenantMarketingCta =
      isBdoPage && String(contract.primaryCTA.href || "").toLowerCase().includes("exportunity.net");
    if (!contractPrimaryFound && !isBdoPage && !isCrossTenantMarketingCta) {
      localIssues.push({
        severity: "critical",
        code: "missing_primary_cta_contract",
        message: `Primary CTA target not found: ${contract.primaryCTA.href}`,
        route,
      });
    }

    for (const proofLink of contract.proofLinks) {
      if (isBdoPage) continue;
      const found = await page.evaluate((target) => {
        const anchors = Array.from(document.querySelectorAll("a"));
        return anchors.some((anchor) => {
          const href = anchor.getAttribute("href") || "";
          return !!href && href.startsWith(target);
        });
      }, proofLink.href);
      if (!found) {
        localIssues.push({
          severity: "warning",
          code: "missing_proof_link",
          message: `Proof link missing: ${proofLink.href}`,
          route,
        });
      }
    }

    const internalLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map((anchor) => (anchor.getAttribute("href") || "").trim())
        .filter((href) => href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api/"));
    });

    routeAudits.push({
      route,
      title,
      metaDescription: String(metaDescription || ""),
      ctaCountAboveFold,
      internalLinks: [...new Set(internalLinks)],
      issues: localIssues,
    });

    issues.push(...localIssues);
  }

  if (mode === "site" || mode === "links") {
    const allInternalLinks = routeAudits.flatMap((item) => item.internalLinks);
    const linkFailures = await checkInternalLinks(baseUrl, allInternalLinks, { forceMarketingParam });
    for (const failure of linkFailures) {
      issues.push({
        severity: "critical",
        code: "broken_internal_link",
        route: "link-check",
        message: `Broken link ${failure.href} returned status ${failure.status}`,
        detail: failure.text,
      });
    }
  }

  if (mode === "site") {
    const moduleFailures = await checkInternalLinks(
      baseUrl,
      PLATFORM_MODULES.map((module) => `/platform/modules/${module.slug}`),
      { forceMarketingParam },
    );
    for (const failure of moduleFailures) {
      issues.push({
        severity: "critical",
        code: "missing_module_page",
        route: "/platform/modules",
        message: `Module page is not reachable: ${failure.href} (${failure.status})`,
      });
    }
  }

  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    mode,
    routes: routeAudits,
    summary: {
      totalRoutes: routeAudits.length,
      totalIssues: issues.length,
      criticalIssues: issues.filter((issue) => issue.severity === "critical").length,
      warningIssues: issues.filter((issue) => issue.severity === "warning").length,
    },
    issues,
  };

  const reportDir = path.resolve(process.cwd(), "reports");
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "site-audit.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`wrote ${reportPath}`);

  if (report.summary.criticalIssues > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
