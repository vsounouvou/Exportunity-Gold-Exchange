import { expect, test } from "@playwright/test";

async function loginToPro(page: any) {
  const email = process.env.E2E_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "admin@exportunity.local";
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  let authResponse = await page.request.post("/api/ece/auth/login", { data: { email, password } });
  if (!authResponse.ok()) {
    const fallbackEmail = `pro-p0-${Date.now()}@exportunity.local`;
    const registerResponse = await page.request.post("/api/ece/auth/register", {
      data: {
        email: fallbackEmail,
        password: "ChangeMe123!",
        displayName: "Pro P0 E2E",
      },
    });
    expect(registerResponse.ok(), "failed to create fallback pro user").toBeTruthy();
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
}

test("pro agents tabs route and render", async ({ page }, testInfo) => {
  await loginToPro(page);
  await page.goto("/pro/agents", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pro-agents-tab-team")).toBeVisible();

  await page.getByTestId("pro-agents-tab-trigger-store").click();
  await expect(page).toHaveURL(/\/pro\/agents\/store(\?|$)/);
  await expect(page.getByTestId("pro-agents-tab-store")).toBeVisible();

  await page.getByTestId("pro-agents-tab-trigger-inbox").click();
  await expect(page).toHaveURL(/\/pro\/agents\/inbox(\?|$)/);
  await expect(page.getByTestId("pro-agents-tab-inbox")).toBeVisible();

  await page.getByTestId("pro-agents-tab-trigger-tasks").click();
  await expect(page).toHaveURL(/\/pro\/agents\/tasks(\?|$)/);
  await expect(page.getByTestId("pro-agents-tab-tasks")).toBeVisible();

  await page.getByTestId("pro-agents-tab-trigger-billing").click();
  await expect(page).toHaveURL(/\/pro\/agents\/billing(\?|$)/);
  await expect(page.getByTestId("pro-agents-tab-billing")).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("pro-web-agents.png"),
    fullPage: true,
  });
});

test("pro money tabs and actions open correctly", async ({ page }, testInfo) => {
  await loginToPro(page);
  await page.goto("/pro/money", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pro-money-wallet-tab")).toBeVisible();

  await page.getByTestId("pro-money-tab-transactions").click();
  await expect(page).toHaveURL(/\/pro\/money\/transactions(\?|$)/);
  await expect(page.getByTestId("pro-money-transactions-tab")).toBeVisible();

  await page.getByTestId("pro-money-tab-reports").click();
  await expect(page).toHaveURL(/\/pro\/money\/reports(\?|$)/);
  await expect(page.getByTestId("pro-money-reports-tab")).toBeVisible();

  await page.getByTestId("pro-money-receive-button").click();
  await expect(page.getByTestId("pro-money-receive-modal")).toBeVisible();
  await page.getByTestId("pro-money-receive-modal").getByRole("button", { name: /cancel/i }).click();

  await page.getByTestId("pro-money-send-button").click();
  await expect(page.getByTestId("pro-money-send-modal")).toBeVisible();
  await page.getByTestId("pro-money-send-modal").getByRole("button", { name: /cancel/i }).click();

  await page.screenshot({
    path: testInfo.outputPath("pro-web-money.png"),
    fullPage: true,
  });
});

test("space switch fallback does not hard-fail on missing token", async ({ page }) => {
  await loginToPro(page);
  await page.goto("/switch", { waitUntil: "domcontentloaded" });

  await page.waitForTimeout(1200);
  await expect(page.getByText("Missing space switch token.")).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/switch(\?|$)/);
});

test("mobile operations snapshot", async ({ page }, testInfo) => {
  await loginToPro(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pro/operations/general-operations", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pro-side-nav")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("pro-mobile-operations.png"),
    fullPage: true,
  });
});
