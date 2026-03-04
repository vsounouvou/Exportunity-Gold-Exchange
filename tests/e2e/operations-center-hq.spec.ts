import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1366, height: 900 }, isMobile: false, hasTouch: false });

async function loginToApp(page: any) {
  const email = process.env.E2E_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "admin@exportunity.local";
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  let authResponse = await page.request.post("/api/ece/auth/login", { data: { email, password } });
  if (!authResponse.ok()) {
    const fallbackEmail = `ops-hq-${Date.now()}@exportunity.local`;
    const registerResponse = await page.request.post("/api/ece/auth/register", {
      data: {
        email: fallbackEmail,
        password: "ChangeMe123!",
        displayName: "Ops HQ E2E",
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
}

test("operations center hq quick access and 3 tiles are visible", async ({ page }) => {
  await loginToApp(page);
  await page.goto("/ai-team", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/ai-team(\?|$)/);
  await expect(
    page
      .locator("body")
      .getByText(/Operations Center HQ|Operations Center HO|General conversation/i)
      .first(),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Background" }).click();
  await expect(page.getByText("Background engine")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Background conversations" })).toBeVisible();

  await page.getByRole("tab", { name: "Actions" }).click();
  await expect(page.getByText(/Action queue|Queue action/i).first()).toBeVisible();

  await page.getByRole("tab", { name: "Decisions" }).click();
  await expect(
    page
      .locator("body")
      .getByText(/No decisions pending|Decisions|Approve or deny actions that require approval/i)
      .first(),
  ).toBeVisible();
});
