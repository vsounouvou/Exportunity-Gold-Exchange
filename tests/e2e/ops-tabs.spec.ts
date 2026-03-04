import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function loginToApp(page: any) {
  const email = process.env.E2E_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "admin@exportunity.local";
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  let authResponse = await page.request.post("/api/ece/auth/login", { data: { email, password } });
  if (!authResponse.ok()) {
    const fallbackEmail = `ops-tabs-${Date.now()}@exportunity.local`;
    const registerResponse = await page.request.post("/api/ece/auth/register", {
      data: {
        email: fallbackEmail,
        password: "ChangeMe123!",
        displayName: "Ops Tabs E2E",
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

test("mobile app-pro navigation switches core modules", async ({ page }) => {
  await loginToApp(page);
  await page.goto("/app/chats", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("chat-primary-card")).toBeVisible();
  await expect(page).toHaveURL(/\/app\/chats(\?|$)/);

  await page.getByTestId("mobile-nav-actions").click();
  await expect(page).toHaveURL(/\/app\/actions(\?|$)/);
  await expect(page.getByTestId("actions-feed")).toBeVisible();

  await page.getByTestId("actions-filter-approvals").click();
  await expect(page).toHaveURL(/\/app\/actions\?filter=approvals/);
  await expect(page.getByTestId("actions-feed")).toBeVisible();

  await page.getByTestId("mobile-nav-wallet").click();
  await expect(page).toHaveURL(/\/app\/wallet(\?|$)/);
  await expect(page.getByTestId("wallet-home-card")).toBeVisible();

  await page.getByTestId("wallet-receive-button").click();
  await expect(page).toHaveURL(/\/app\/wallet\/receive(\?|$)/);
  await expect(page.getByTestId("wallet-receive-panel")).toBeVisible();

  await page.getByTestId("mobile-nav-chats").click();
  await expect(page).toHaveURL(/\/app\/chats(\?|$)/);
  await expect(page.getByTestId("chat-primary-card")).toBeVisible();
});
