import path from "path";
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./utils";

test("homepage hero upload updates gateway", async ({ page, request }) => {
  await loginAsAdmin(page);

  const resolverUrl = "/api/assets/image?namespace=bourse&assetKey=landing/hero_desktop";
  let beforeUpdatedAt: string | null = null;

  const beforeResp = await request.get(resolverUrl);
  if (beforeResp.ok()) {
    const before = await beforeResp.json();
    beforeUpdatedAt = before.updatedAt || null;
  }

  await page.goto("/admin/media/images");

  await expect(page.getByRole("heading", { name: /image studio/i })).toBeVisible();

  const heroCard = page
    .locator("text=landing/hero_desktop")
    .first()
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")]')
    .first();
  const uploadInput = heroCard.locator('input[type="file"]').first();
  const filePath = path.join(process.cwd(), "client", "public", "assets", "bdo-gateway-bg.svg");

  const uploadResponse = page.waitForResponse(
    (resp) => resp.url().includes("/api/admin/assets/images/upload") && resp.status() === 200
  );

  await uploadInput.setInputFiles(filePath);
  await uploadResponse;

  const afterResp = await request.get(resolverUrl);
  expect(afterResp.ok()).toBeTruthy();
  const after = await afterResp.json();

  if (beforeUpdatedAt) {
    expect(after.updatedAt).not.toBe(beforeUpdatedAt);
  }

  await page.goto("/gateway?forceGateway=1");
  const heroImg = page.locator('img[fetchpriority="high"]').first();
  await expect(heroImg).toBeVisible();
  await expect
    .poll(() => heroImg.getAttribute("src"), { timeout: 60000 })
    .toContain(after.url);

  const assetResp = await request.get(after.url);
  expect(assetResp.ok()).toBeTruthy();
});
