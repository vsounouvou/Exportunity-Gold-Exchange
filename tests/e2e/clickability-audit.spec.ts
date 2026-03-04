import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./utils";

type ClickCandidate = {
  index: number;
  selector: string;
  testId: string | null;
  text: string;
  href: string | null;
  target: string | null;
  role: string | null;
  tag: string;
};

type ClickFailure = {
  route: string;
  selector: string;
  text: string;
  reason: string;
  screenshot: string;
};

type ClickRouteResult = {
  route: string;
  total: number;
  audited: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: ClickFailure[];
};

const MOBILE_ROUTES = ["/app/chats", "/app/chats/general-operations", "/app/actions", "/app/wallet"];
const ADMIN_ROUTES = ["/dashboard", "/ai-team", "/admin/inbox"];
const MAX_ELEMENTS_PER_ROUTE = 24;

function sanitizeName(value: string) {
  return value.replace(/[^a-z0-9-_]/gi, "_").toLowerCase();
}

function shouldSkipClick(candidate: ClickCandidate) {
  const text = candidate.text.toLowerCase().replace(/\s+/g, " ").trim();
  const href = String(candidate.href || "").toLowerCase();
  const target = String(candidate.target || "").toLowerCase();

  if (target === "_blank") return true;
  if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return true;
  if (href === "#" || href === "") return false;
  if (href.startsWith("http://") || href.startsWith("https://")) return true;

  const destructiveTokens = ["logout", "delete", "remove", "reject", "sign out", "clear all", "reset", "sign in", "login"];
  if (destructiveTokens.some((token) => text.includes(token))) return true;
  if (/sign\s*in/.test(text) || /log\s*in/.test(text)) return true;
  return false;
}

async function loginToApp(page: any) {
  const email = process.env.E2E_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "admin@exportunity.local";
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  let authResponse = await page.request.post("/api/ece/auth/login", { data: { email, password } });
  if (!authResponse.ok()) {
    const fallbackEmail = `click-audit-${Date.now()}@exportunity.local`;
    const registerResponse = await page.request.post("/api/ece/auth/register", {
      data: {
        email: fallbackEmail,
        password: "ChangeMe123!",
        displayName: "Click Audit User",
      },
    });
    expect(registerResponse.ok(), "failed to create fallback e2e user").toBeTruthy();
    authResponse = registerResponse;
  }

  const payload = await authResponse.json();
  const token = String(payload?.token || "");
  const user = payload?.user;
  expect(token).toBeTruthy();
  expect(user).toBeTruthy();

  await page.addInitScript(
    ([sessionToken, sessionUser]) => {
      localStorage.setItem("ece_session", sessionToken as string);
      localStorage.setItem("ece_user", JSON.stringify(sessionUser));
    },
    [token, user],
  );

  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app(\/|\?|$)/);
}

async function collectClickCandidates(page: any): Promise<ClickCandidate[]> {
  return page.$$eval("button, a[href], [role='button'], [data-clickable='true']", (nodes) => {
    const toCssPath = (element: Element) => {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
        const html = current as HTMLElement;
        if (html.id) {
          parts.unshift(`#${CSS.escape(html.id)}`);
          break;
        }

        let segment = current.tagName.toLowerCase();
        const className = (html.className || "").split(/\s+/).filter(Boolean)[0];
        if (className) segment += `.${CSS.escape(className)}`;

        const parent = current.parentElement;
        if (parent) {
          const sameTagSiblings = Array.from(parent.children).filter((item) => item.tagName === current!.tagName);
          if (sameTagSiblings.length > 1) {
            segment += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
          }
        }
        parts.unshift(segment);
        current = current.parentElement;
      }
      return parts.join(" > ");
    };

      return nodes
        .map((node, index) => {
          const element = node as HTMLElement;
          const parentClickable = element.parentElement?.closest("button, a[href], [role='button'], [data-clickable='true']");
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const visible = rect.width >= 24 && rect.height >= 24 && style.display !== "none" && style.visibility !== "hidden";
          const disabled =
            (element as HTMLButtonElement).disabled ||
            element.getAttribute("aria-disabled") === "true" ||
            element.getAttribute("data-disabled") === "true";
          const ariaCurrent = element.getAttribute("aria-current");
          const ariaPressed = element.getAttribute("aria-pressed");
          const ariaSelected = element.getAttribute("aria-selected");
          const dataState = element.getAttribute("data-state");
          if (!visible || disabled || ariaCurrent === "page") return null;
          if (ariaPressed === "true" || ariaSelected === "true" || dataState === "active") return null;
          if (parentClickable && parentClickable !== element) return null;
          if (String(element.id || "").startsWith("radix-")) return null;

          const text = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 140);
        return {
          index,
          selector: toCssPath(element),
          testId: element.getAttribute("data-testid"),
          text,
          href: element.getAttribute("href"),
          target: element.getAttribute("target"),
          role: element.getAttribute("role"),
          tag: element.tagName.toLowerCase(),
        };
      })
      .filter(Boolean) as ClickCandidate[];
  });
}

async function uiSignature(page: any) {
  try {
    return await page.evaluate(() => {
      const activeControls = document.querySelectorAll("[aria-pressed='true'], [aria-selected='true'], [data-state='active'], [data-state='open']").length;
      const dialogs = document.querySelectorAll("dialog, [role='dialog']").length;
      const bodyTextLen = (document.body?.innerText || "").slice(0, 3000).length;
      const activeOpsPanel = document.querySelector(
        "[data-testid='chat-primary-card'], [data-testid='actions-feed'], [data-testid='wallet-home-card'], [data-testid='wallet-receive-panel'], [data-testid='wallet-send-panel']",
      );
      const activePanelKey = activeOpsPanel?.getAttribute("data-testid") || "";
      return `${activeControls}|${dialogs}|${bodyTextLen}|${activePanelKey}`;
    });
  } catch {
    return "navigation-in-progress";
  }
}

async function hitTestLocator(locator: any) {
  return locator.evaluate((node: Element) => {
    const describe = (element: Element | null | undefined) => {
      if (!element) return "none";
      const html = element as HTMLElement;
      const tag = html.tagName.toLowerCase();
      const id = html.id ? `#${html.id}` : "";
      const cls = html.className ? `.${String(html.className).trim().split(/\s+/).slice(0, 2).join(".")}` : "";
      return `${tag}${id}${cls}`;
    };

    const rect = node.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    const top = document.elementFromPoint(x, y);
    const ok = !!top && (top === node || node.contains(top) || (top instanceof Element && top.contains(node)));
    return {
      ok,
      top: describe(top),
      point: { x, y },
    };
  });
}

async function auditRoutes(page: any, routes: string[], scope: string, testInfo: any) {
  const results: ClickRouteResult[] = [];

  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(350);

    const candidates = (await collectClickCandidates(page)).slice(0, MAX_ELEMENTS_PER_ROUTE);
    const routeResult: ClickRouteResult = {
      route,
      total: candidates.length,
      audited: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
    };

    for (const candidate of candidates) {
      if (shouldSkipClick(candidate)) {
        routeResult.skipped += 1;
        continue;
      }

      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(250);

      const locator = candidate.testId
        ? page.locator(`[data-testid="${candidate.testId}"]`).first()
        : page.locator(candidate.selector).first();

      if ((await locator.count()) === 0) {
        routeResult.skipped += 1;
        continue;
      }

      await locator.scrollIntoViewIfNeeded();
      const hit = await hitTestLocator(locator);

      const beforeUrl = page.url();
      const beforeDialogs = await page.locator("dialog, [role='dialog'], [data-state='open']").count();
      const beforeSignature = await uiSignature(page);
      let requestCount = 0;
      const onRequest = () => {
        requestCount += 1;
      };
      page.on("request", onRequest);

      let clickError = "";
      try {
        await locator.click({ timeout: 4500 });
        await page.waitForTimeout(350);
      } catch (error: any) {
        clickError = String(error?.message || error || "click_failed");
      } finally {
        page.off("request", onRequest);
      }

      const afterUrl = page.url();
      const afterDialogs = await page.locator("dialog, [role='dialog'], [data-state='open']").count();
      const afterSignature = await uiSignature(page);
      const wasResponsive =
        !clickError &&
        (afterUrl !== beforeUrl || afterDialogs !== beforeDialogs || requestCount > 0 || afterSignature !== beforeSignature);

      routeResult.audited += 1;
      if (wasResponsive) {
        routeResult.passed += 1;
      } else {
        const screenshot = `${scope}-${sanitizeName(route)}-${candidate.index}-dead.png`;
        await page.screenshot({ path: testInfo.outputPath(screenshot), fullPage: true });
        routeResult.failed += 1;
        routeResult.failures.push({
          route,
          selector: candidate.selector,
          text: candidate.text,
          reason: hit.ok ? clickError || "no_route_change_no_ui_change_no_request" : `blocked_by_${hit.top}_at_${hit.point.x}_${hit.point.y}`,
          screenshot,
        });
      }
    }

    results.push(routeResult);
  }

  return results;
}

test.describe("clickability audit mobile routes", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("mobile clickable controls respond", async ({ page }, testInfo) => {
    await loginToApp(page);
    const results = await auditRoutes(page, MOBILE_ROUTES, "mobile", testInfo);
    const failed = results.reduce((sum, item) => sum + item.failed, 0);

    const reportPath = path.join(process.cwd(), "reports", "clickability-audit-mobile.json");
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          mode: "mobile",
          routes: results,
          totals: {
            failed,
            audited: results.reduce((sum, item) => sum + item.audited, 0),
            skipped: results.reduce((sum, item) => sum + item.skipped, 0),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    expect(failed, "dead clickable elements found in mobile routes").toBe(0);
  });
});

test.describe("clickability audit admin routes", () => {
  test("admin clickable controls respond", async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    const results = await auditRoutes(page, ADMIN_ROUTES, "admin", testInfo);
    const failed = results.reduce((sum, item) => sum + item.failed, 0);

    const reportPath = path.join(process.cwd(), "reports", "clickability-audit-admin.json");
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          mode: "admin",
          routes: results,
          totals: {
            failed,
            audited: results.reduce((sum, item) => sum + item.audited, 0),
            skipped: results.reduce((sum, item) => sum + item.skipped, 0),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    expect(failed, "dead clickable elements found in admin routes").toBe(0);
  });
});
