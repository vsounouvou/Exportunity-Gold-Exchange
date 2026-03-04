import { test, expect } from "@playwright/test";

async function otpLogin(page: any, testInfo: any) {
  const phone = process.env.E2E_OTP_PHONE || "+22997000000";

  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app\/login/);

  await page.getByTestId("app-pro-phone").fill(phone);

  const [startResp] = await Promise.all([
    page.waitForResponse((r: any) => r.url().includes("/api/ece/auth/otp/start") && r.request().method() === "POST"),
    page.getByRole("button", { name: /envoyer le code/i }).click(),
  ]);

  const startJson = await startResp.json();
  const otp = String(startJson?.debugOtp || "");
  expect(otp, "server must return debugOtp when E2E_OTP_DEBUG is enabled").toMatch(/^\d{6}$/);

  // input-otp uses a hidden input; click then type.
  await page.getByTestId("app-pro-otp").click();
  await page.keyboard.type(otp);

  await Promise.all([
    page.waitForResponse((r: any) => r.url().includes("/api/ece/auth/otp/verify") && r.request().method() === "POST"),
    page.getByRole("button", { name: /valider/i }).click(),
  ]);

  await expect(page).toHaveURL(/\/app(\/|\?|$)/);

  await page.screenshot({ path: testInfo.outputPath("screenshots/app-pro-inbox.png"), fullPage: true });
}

test("pro app: /app inbox + wallet + join seller", async ({ page, baseURL }, testInfo) => {
  await otpLogin(page, testInfo);

  // Wallet strip visible.
  await expect(page.getByText("Wallet", { exact: true })).toBeVisible();

  // Open wallet chat via WalletStrip.
  await page.getByText("Wallet", { exact: true }).first().click();
  await expect(page).toHaveURL(/\/app\/room\/wallet/);
  await page.screenshot({ path: testInfo.outputPath("screenshots/app-pro-wallet-room.png"), fullPage: true });

  // Join link should activate seller role and redirect to Sales room.
  await page.goto("/app/join/seller", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app\/room\/sales/);
  await page.screenshot({ path: testInfo.outputPath("screenshots/app-pro-join-seller.png"), fullPage: true });

  // Inbox should now include Sales room.
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Sales", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("screenshots/app-pro-inbox-after-join.png"), fullPage: true });

  // Attach baseURL for debugging (useful when running against prod with E2E_BASE_URL).
  await testInfo.attach("baseURL.txt", {
    body: Buffer.from(String(baseURL || "")),
    contentType: "text/plain",
  });
});

