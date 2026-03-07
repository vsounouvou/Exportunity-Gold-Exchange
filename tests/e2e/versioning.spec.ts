import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./utils";

type BuildJson = {
  build?: string | null;
  buildId?: string | null;
  gitSha?: string | null;
  builtAt?: string | null;
  buildTime?: string | null;
  mainJs?: { path?: string | null };
  mainCss?: { path?: string | null };
};

type VersionJson = {
  ok?: boolean;
  build?: string | null;
  buildId?: string | null;
  gitSha?: string | null;
  cacheBuster?: string | null;
  clientBuild?: { buildId?: string | null; gitSha?: string | null; builtAt?: string | null } | null;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function getJson<T>(request: any, url: string): Promise<T> {
  const startedAt = Date.now();
  const timeoutMs = 60_000;
  let lastStatus: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await request.get(url, {
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });

      if (res.ok()) {
        return (await res.json()) as T;
      }

      lastStatus = `${res.status()} ${res.statusText()}`;
    } catch (err) {
      lastStatus = String(err);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`${url} did not return 200 within ${timeoutMs}ms (last=${lastStatus ?? "unknown"})`);
}

test("versioning forever: parity + cache headers + critical routes", async ({ request, browser, baseURL }, testInfo) => {
  const now = Date.now();
  const base = baseURL || "";

  const version = await getJson<VersionJson>(request, `/api/system/version?v=${now}`);
  const build = await getJson<BuildJson>(request, `/build.json?v=${now}`);

  expect(version.ok).toBeTruthy();
  expect(isNonEmptyString(version.build), "server build must be non-null").toBeTruthy();
  expect(isNonEmptyString(version.buildId), "server buildId must be non-null").toBeTruthy();
  expect(isNonEmptyString(version.gitSha), "server gitSha must be non-null").toBeTruthy();
  expect(version.clientBuild, "server must expose clientBuild").toBeTruthy();
  expect(isNonEmptyString(version.clientBuild?.buildId), "clientBuild.buildId must be non-null").toBeTruthy();
  expect(isNonEmptyString(version.clientBuild?.gitSha), "clientBuild.gitSha must be non-null").toBeTruthy();

  expect(version.build).toBe(version.buildId);
  expect(version.buildId).toBe(version.clientBuild?.buildId);
  expect(version.gitSha).toBe(version.clientBuild?.gitSha);
  expect(build.build).toBe(version.build);
  expect(build.buildId).toBe(version.buildId);
  expect(build.gitSha).toBe(version.gitSha);

  // Cache header sanity
  const indexRes = await request.get(`/?v=${now}`, { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } });
  expect(indexRes.ok()).toBeTruthy();
  expect(String(indexRes.headers()["cache-control"] || "")).toMatch(/no-store/i);

  const swRes = await request.get(`/sw.js?v=${now}`, { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } });
  expect(swRes.ok()).toBeTruthy();
  expect(String(swRes.headers()["cache-control"] || "")).toMatch(/no-store|no-cache/i);

  const mainJsPath = build.mainJs?.path ? String(build.mainJs.path).replace(/^\/+/, "") : null;
  if (mainJsPath) {
    const assetRes = await request.get(`/${mainJsPath}`, { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } });
    expect(assetRes.ok()).toBeTruthy();
    expect(String(assetRes.headers()["cache-control"] || "")).toMatch(/immutable/i);
  }

  const expectedBrandName = (() => {
    try {
      const host = new URL(base || "http://localhost").hostname.toLowerCase();
      return host === "exportunity.net" || host.endsWith(".exportunity.net") ? "Exportunity" : "Bourse de l'Or";
    } catch {
      return "Bourse de l'Or";
    }
  })();

  // Route checks + screenshots
  const publicPage = await browser.newPage();
  const adminPage = await browser.newPage();

  await publicPage.goto(`/admin?v=${now}`, { waitUntil: "domcontentloaded" });
  await expect(publicPage.locator("text=404 Page Not Found")).toHaveCount(0);
  const brandCandidates = publicPage.locator("#root").locator(`text=${expectedBrandName}`);
  await expect
    .poll(
      async () => {
        const count = await brandCandidates.count();
        for (let i = 0; i < count; i += 1) {
          if (await brandCandidates.nth(i).isVisible()) return true;
        }
        return false;
      },
      { timeout: 15000 },
    )
    .toBe(true);

  const shot = async (page: any, name: string) => {
    await page.screenshot({ path: testInfo.outputPath(`screenshots/${name}.png`), fullPage: true });
  };

  await shot(publicPage, "admin-login-branding");

  // Pro App routes must exist publicly (even if they redirect to login).
  await publicPage.goto(`/app?v=${now}`, { waitUntil: "domcontentloaded" });
  await expect(publicPage.locator("text=404 Page Not Found")).toHaveCount(0);
  await expect(publicPage.getByPlaceholder("you@company.com")).toBeVisible({ timeout: 15000 });
  await shot(publicPage, "app-login");

  await publicPage.goto(`/app/join/seller?v=${now}`, { waitUntil: "domcontentloaded" });
  await expect(publicPage.locator("text=404 Page Not Found")).toHaveCount(0);
  await expect(publicPage).toHaveURL(/\/login\?next=/);
  await shot(publicPage, "app-join-seller-login");

  let adminLoggedIn = false;
  try {
    await loginAsAdmin(adminPage);
    adminLoggedIn = true;
  } catch (err) {
    await testInfo.attach("admin-login-error.txt", {
      body: Buffer.from(String(err instanceof Error ? err.message : err)),
      contentType: "text/plain",
    });
  }

  await publicPage.goto(`/retail?v=${now}`, { waitUntil: "domcontentloaded" });
  await expect(publicPage.locator("text=404 Page Not Found")).toHaveCount(0);
  // BDO must show the signature line under the lockup.
  if (expectedBrandName !== "Exportunity") {
    const signatureCandidates = publicPage.locator("#root").locator("text=By Exportunity");
    await expect
      .poll(
        async () => {
          const count = await signatureCandidates.count();
          for (let i = 0; i < count; i += 1) {
            if (await signatureCandidates.nth(i).isVisible()) return true;
          }
          return false;
        },
        { timeout: 15000 },
      )
      .toBe(true);
  }
  await shot(publicPage, "retail");

  // Stale UI guardrails on canonical storefront.
  await publicPage.goto(`/store?v=${now}`, { waitUntil: "domcontentloaded" });
  await expect(publicPage.locator("text=404 Page Not Found")).toHaveCount(0);
  await expect(publicPage.locator('img[src^="data:image/"]')).toHaveCount(0);
  await expect(publicPage.getByText(/catalog item/i)).toHaveCount(0);
  await expect(publicPage.getByText(/published/i)).toHaveCount(0);
  await shot(publicPage, "store-stale-guards");

  await publicPage.goto(`/debug/location?v=${now}`, { waitUntil: "domcontentloaded" });
  await expect(publicPage.locator("text=404 Page Not Found")).toHaveCount(0);
  await shot(publicPage, "debug-location");

  const pageForProtectedRoutes = adminLoggedIn ? adminPage : publicPage;

  await pageForProtectedRoutes.goto(`/marketplace/sellers/269?v=${now}`, { waitUntil: "domcontentloaded" });
  await expect(pageForProtectedRoutes.locator("text=404 Page Not Found")).toHaveCount(0);
  await shot(pageForProtectedRoutes, "marketplace-seller-269");

  await pageForProtectedRoutes.goto(`/territories?fresh=1&v=${now}`, { waitUntil: "domcontentloaded" });
  await expect(pageForProtectedRoutes.locator("text=404 Page Not Found")).toHaveCount(0);
  if (adminLoggedIn) {
    await expect(adminPage.getByRole("button", { name: "Africa" })).toBeVisible();
    // Auto-focus when only one country exists (expected: Benin).
    await expect(adminPage.getByRole("button", { name: /benin/i })).toBeVisible({ timeout: 15000 });
  }
  await shot(pageForProtectedRoutes, "territories");

  // Attach key metadata for the deploy report.
  await testInfo.attach("system-version.json", {
    body: Buffer.from(JSON.stringify(version, null, 2)),
    contentType: "application/json",
  });
  await testInfo.attach("build.json", {
    body: Buffer.from(JSON.stringify(build, null, 2)),
    contentType: "application/json",
  });
  await testInfo.attach("baseURL.txt", {
    body: Buffer.from(base),
    contentType: "text/plain",
  });
});
