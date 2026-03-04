import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

type ClickableDescriptor = {
  index: number;
  tag: string;
  text: string;
  href: string | null;
  role: string | null;
  ariaLabel: string | null;
  testId: string | null;
  selector: string;
  bounds: { x: number; y: number; width: number; height: number };
};

type ClickAuditFailure = {
  route: string;
  selector: string;
  text: string;
  reason: string;
  screenshot: string;
};

type ClickAuditResult = {
  route: string;
  total: number;
  passed: number;
  failed: number;
  failures: ClickAuditFailure[];
};

const ROUTES = ["/app/chats", "/app/chats/general-operations", "/app/actions", "/app/wallet"];
const MAX_ELEMENTS_PER_ROUTE = 40;

function sanitizeName(value: string) {
  return value.replace(/[^a-z0-9-_]/gi, "_").toLowerCase();
}

async function appLogin(page: any) {
  const email =
    process.env.E2E_ADMIN_EMAIL ||
    process.env.SEED_ADMIN_EMAIL ||
    "admin@exportunity.local";
  const password =
    process.env.E2E_ADMIN_PASSWORD ||
    process.env.SEED_ADMIN_PASSWORD ||
    "ChangeMe123!";

  await page.goto("/app/login", { waitUntil: "domcontentloaded" });

  let authResp = await page.request.post("/api/ece/auth/login", {
    data: { email, password },
  });

  if (!authResp.ok()) {
    const fallbackEmail = `click-audit-${Date.now()}@exportunity.local`;
    const registerResp = await page.request.post("/api/ece/auth/register", {
      data: {
        email: fallbackEmail,
        password: "ChangeMe123!",
        displayName: "Click Audit User",
      },
    });
    expect(registerResp.ok(), "failed to create fallback e2e user").toBeTruthy();
    authResp = registerResp;
  }

  const payload = await authResp.json();
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

async function dismissBuildMismatchBanner(page: any) {
  const banner = page.locator("[data-testid='build-mismatch-banner']");
  if ((await banner.count()) === 0) return;
  const dismissButton = banner.getByRole("button", { name: /dismiss/i }).first();
  if ((await dismissButton.count()) === 0) return;
  await dismissButton.click({ timeout: 3000 });
  await expect(banner).toHaveCount(0);
}

async function collectClickables(page: any): Promise<ClickableDescriptor[]> {
  return page.$$eval(
    "button, a[href], [role='button'], [data-action], [onclick]",
    (nodes) => {
      function cssPath(element: Element) {
        const parts: string[] = [];
        let current: Element | null = element;
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
          const id = (current as HTMLElement).id;
          if (id) {
            parts.unshift(`#${CSS.escape(id)}`);
            break;
          }

          let segment = current.tagName.toLowerCase();
          const classList = Array.from((current as HTMLElement).classList || []).filter(Boolean);
          if (classList.length > 0) {
            segment += `.${CSS.escape(classList[0])}`;
          }

          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter((sib) => sib.tagName === current!.tagName);
            if (siblings.length > 1) {
              const idx = siblings.indexOf(current) + 1;
              segment += `:nth-of-type(${idx})`;
            }
          }

          parts.unshift(segment);
          current = current.parentElement;
        }
        return parts.join(" > ");
      }

      return nodes
        .map((node, index) => {
          const element = node as HTMLElement;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const visible = rect.width >= 24 && rect.height >= 24 && style.visibility !== "hidden" && style.display !== "none";
          const disabled = (element as HTMLButtonElement).disabled || element.getAttribute("aria-disabled") === "true";
          const current = element.getAttribute("aria-current");
          const selected = element.getAttribute("aria-selected");
          const pressed = element.getAttribute("aria-pressed");
          const dataState = element.getAttribute("data-state");
          const testId = element.getAttribute("data-testid") || "";
          if (!visible || disabled || current === "page") return null;
          if (testId.startsWith("tap-trace")) return null;
          if ((element.getAttribute("role") || "").toLowerCase() === "tab" && selected === "true") return null;
          if (pressed === "true" || dataState === "active") return null;

          const text = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 140);
          return {
            index,
            tag: element.tagName.toLowerCase(),
            text,
            href: element.getAttribute("href"),
            role: element.getAttribute("role"),
            ariaLabel: element.getAttribute("aria-label"),
            testId: testId || null,
            selector: cssPath(element),
            bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          };
        })
        .filter(Boolean) as ClickableDescriptor[];
    },
  );
}

test("ui clickability audit (mobile app-pro routes)", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await appLogin(page);

  const results: ClickAuditResult[] = [];

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await dismissBuildMismatchBanner(page);
    await page.waitForTimeout(120);

    const candidates = (await collectClickables(page)).slice(0, MAX_ELEMENTS_PER_ROUTE);
    const routeResult: ClickAuditResult = { route, total: candidates.length, passed: 0, failed: 0, failures: [] };

    for (const candidate of candidates) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(250);
      await dismissBuildMismatchBanner(page);
      await page.waitForTimeout(120);

      const locator = candidate.testId
        ? page.locator(`[data-testid="${candidate.testId}"]`).first()
        : page.locator(candidate.selector).first();

      const exists = await locator.count();
      if (!exists) {
        // Dynamic lists can reorder between scans; treat missing-on-revisit as non-actionable.
        continue;
      }

      const beforeUrl = page.url();
      const beforeDialogCount = await page.locator("[role='dialog'], [role='menu'], [data-state='open']").count();
      const beforeState = await locator.evaluate((node) => ({
        ariaSelected: node.getAttribute("aria-selected"),
        ariaExpanded: node.getAttribute("aria-expanded"),
        ariaPressed: node.getAttribute("aria-pressed"),
        dataState: node.getAttribute("data-state"),
      }));
      let requestCount = 0;
      const onRequest = () => {
        requestCount += 1;
      };
      page.on("request", onRequest);

      let clickError = "";
      try {
        await locator.scrollIntoViewIfNeeded();
        await locator.click({ timeout: 4000 });
        await page.waitForTimeout(350);
      } catch (error: any) {
        clickError = String(error?.message || error || "click_failed");
      } finally {
        page.off("request", onRequest);
      }

      const afterUrl = page.url();
      const afterDialogCount = await page.locator("[role='dialog'], [role='menu'], [data-state='open']").count();
      const afterExists = (await locator.count()) > 0;
      const afterState = afterExists
        ? await locator.evaluate((node) => ({
            ariaSelected: node.getAttribute("aria-selected"),
            ariaExpanded: node.getAttribute("aria-expanded"),
            ariaPressed: node.getAttribute("aria-pressed"),
            dataState: node.getAttribute("data-state"),
          }))
        : null;
      const controlStateChanged = afterExists ? JSON.stringify(beforeState) !== JSON.stringify(afterState) : true;
      const success =
        !clickError &&
        (afterUrl !== beforeUrl ||
          afterDialogCount > beforeDialogCount ||
          requestCount > 0 ||
          !afterExists ||
          controlStateChanged);

      if (success) {
        routeResult.passed += 1;
        continue;
      }

      const screenshot = `failed-${sanitizeName(route)}-${candidate.index}.png`;
      await page.screenshot({ path: testInfo.outputPath(screenshot), fullPage: true });
      routeResult.failed += 1;
      routeResult.failures.push({
        route,
        selector: candidate.selector,
        text: candidate.text,
        reason: clickError || "no_navigation_no_modal_no_network",
        screenshot,
      });
    }

    results.push(routeResult);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseURL: testInfo.project.use.baseURL,
    routes: results,
    totals: {
      routes: results.length,
      elements: results.reduce((sum, item) => sum + item.total, 0),
      passed: results.reduce((sum, item) => sum + item.passed, 0),
      failed: results.reduce((sum, item) => sum + item.failed, 0),
    },
  };

  const reportPath = path.join(process.cwd(), "reports", "ui_click_audit_report.json");
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  expect(report.totals.failed, "dead interactive elements found; check reports/ui_click_audit_report.json").toBe(0);
});
