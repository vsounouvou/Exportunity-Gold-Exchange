import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

import { PUBLIC_SURFACE_CONTRACTS } from "./public-surface-contracts";

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
  "designed to be synced",
  "proof tiles are not configured",
];

const RETIRED_SURFACE_SIGNATURES = [
  "platforms for trade, gold, machinery, and execution.",
  "tell us what you need. we coordinate the trade.",
  "exportunity group",
];

function parseMode() {
  const raw = process.argv.find((arg) => arg.startsWith("--mode="));
  const mode = raw ? raw.split("=")[1] : "site";
  if (mode === "links" || mode === "ux" || mode === "site") return mode;
  return "site";
}

function normalizeUrl(baseUrl: string, maybePath: string) {
  if (/^https?:\/\//i.test(maybePath)) return maybePath;
  return new URL(maybePath, baseUrl).toString();
}

async function checkInternalLinks(baseUrl: string, links: string[]) {
  const unique = [...new Set(links)];
  const failures: Array<{ href: string; status: number; text: string }> = [];
  for (const href of unique) {
    const target = normalizeUrl(baseUrl, href);
    try {
      const response = await fetch(target, { method: "GET", redirect: "manual" });
      if (response.status >= 400) {
        const responseText = await response.text();
        failures.push({ href, status: response.status, text: responseText.slice(0, 140) });
      }
    } catch (error: any) {
      failures.push({ href, status: 0, text: error?.message || "network error" });
    }
  }
  return failures;
}

async function launchBrowser() {
  const browserCandidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].filter(Boolean) as string[];

  for (const executablePath of browserCandidates) {
    if (!fsSync.existsSync(executablePath)) continue;
    try {
      return await chromium.launch({ headless: true, executablePath });
    } catch {
      // Try the next locally installed browser.
    }
  }

  return chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
}

async function run() {
  const mode = parseMode();
  const baseUrl =
    process.env.PUBLIC_SURFACE_AUDIT_BASE_URL ||
    process.env.AUDIT_BASE_URL ||
    "http://127.0.0.1:5000";
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const routeAudits: RouteAudit[] = [];
  const issues: Issue[] = [];

  try {
    for (const contract of PUBLIC_SURFACE_CONTRACTS) {
      const route = contract.path;
      await page.goto(normalizeUrl(baseUrl, route), { waitUntil: "networkidle", timeout: 60_000 });

      const title = await page.title();
      const metaDescription =
        (await page.locator("meta[name='description']").getAttribute("content").catch(() => "")) || "";
      const bodyText = (await page.locator("body").innerText()).toLowerCase();
      const localIssues: Issue[] = [];

      if (!title.trim()) {
        localIssues.push({ severity: "critical", code: "missing_title", message: "Page title is empty.", route });
      }
      if (!metaDescription.trim()) {
        localIssues.push({
          severity: "critical",
          code: "missing_meta_description",
          message: "Meta description is empty.",
          route,
        });
      }
      const metadataText = `${title} ${metaDescription}`.toLowerCase();
      for (const crossTenantBrand of ["bourse de l'or", "mindbase"]) {
        if (metadataText.includes(crossTenantBrand)) {
          localIssues.push({
            severity: "critical",
            code: "cross_tenant_metadata",
            message: `Cross-tenant metadata found on the GTN surface: ${crossTenantBrand}`,
            route,
          });
        }
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
      for (const signature of RETIRED_SURFACE_SIGNATURES) {
        if (bodyText.includes(signature)) {
          localIssues.push({
            severity: "critical",
            code: "retired_surface_signature",
            message: `Retired interface copy found: "${signature}"`,
            route,
          });
        }
      }

      const deadAnchors = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"))
          .filter((anchor) => {
            const href = (anchor.getAttribute("href") || "").trim();
            if (!href || href.toLowerCase() === "javascript:void(0)") return true;
            if (href !== "#") return false;
            const isWidgetControl =
              anchor.getAttribute("role") === "button" || Boolean(anchor.closest(".leaflet-control"));
            return !isWidgetControl;
          })
          .filter((anchor) => {
            const node = anchor as HTMLElement;
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          })
          .map((anchor) => (anchor.getAttribute("href") || "").trim()),
      );
      if (deadAnchors.length) {
        localIssues.push({
          severity: "critical",
          code: "dead_href",
          message: "Visible anchor with an empty or dead href detected.",
          route,
          detail: deadAnchors.slice(0, 10),
        });
      }

      const ctaCountAboveFold = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a,button,[role='button']")).filter((element) => {
          const rect = (element as HTMLElement).getBoundingClientRect();
          const label = ((element as HTMLElement).innerText || "").trim();
          return Boolean(label) && rect.width >= 40 && rect.height >= 20 && rect.top >= 0 && rect.top < 820;
        }).length,
      );
      if (ctaCountAboveFold < 1) {
        localIssues.push({
          severity: "critical",
          code: "no_primary_cta_above_fold",
          message: "No clickable action detected above the fold.",
          route,
        });
      }

      const primaryFound = await page.evaluate((expectedHref) =>
        Array.from(document.querySelectorAll("a")).some((anchor) =>
          (anchor.getAttribute("href") || "").startsWith(expectedHref),
        ), contract.primaryCTA.href);
      if (!primaryFound) {
        localIssues.push({
          severity: "critical",
          code: "missing_primary_cta_contract",
          message: `Current primary action target not found: ${contract.primaryCTA.href}`,
          route,
        });
      }

      for (const proofLink of contract.proofLinks) {
        const found = await page.evaluate((target) =>
          Array.from(document.querySelectorAll("a")).some((anchor) =>
            (anchor.getAttribute("href") || "").startsWith(target),
          ), proofLink.href);
        if (!found) {
          localIssues.push({
            severity: "warning",
            code: "missing_proof_link",
            message: `Current surface link missing: ${proofLink.href}`,
            route,
          });
        }
      }

      const internalLinks = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a"))
          .map((anchor) => (anchor.getAttribute("href") || "").trim())
          .filter((href) => href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api/")),
      );

      routeAudits.push({
        route,
        title,
        metaDescription,
        ctaCountAboveFold,
        internalLinks: [...new Set(internalLinks)],
        issues: localIssues,
      });
      issues.push(...localIssues);
    }

    if (mode === "site" || mode === "links") {
      const failures = await checkInternalLinks(baseUrl, routeAudits.flatMap((item) => item.internalLinks));
      for (const failure of failures) {
        issues.push({
          severity: "critical",
          code: "broken_internal_link",
          route: "link-check",
          message: `Broken link ${failure.href} returned status ${failure.status}`,
          detail: failure.text,
        });
      }
    }
  } finally {
    await browser.close();
  }

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
  const reportPath = path.join(reportDir, "public-surface-audit.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`wrote ${reportPath}`);

  if (report.summary.criticalIssues > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
