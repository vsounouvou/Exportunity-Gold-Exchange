import { test, expect } from "@playwright/test";
import { loginAsAdmin, loadMenuInventory } from "./utils";

test("admin menu click-through", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  await loginAsAdmin(page);

  const sectionNav = page.locator("header nav").first();

  const menuItems = loadMenuInventory().filter((item: any) => item.source === "AdminLayout");
  const sectionOrder: string[] = [];
  const bySection: Record<string, any[]> = {};
  menuItems.forEach((item: any) => {
    if (!bySection[item.section]) {
      bySection[item.section] = [];
      sectionOrder.push(item.section);
    }
    bySection[item.section].push(item);
  });

  for (const section of sectionOrder) {
    for (const item of bySection[section]) {
      await sectionNav.getByRole("button", { name: section, exact: true }).click();
      await page.getByRole("menuitem", { name: item.label, exact: true }).click();
      await page.waitForURL(`**${item.route}`);
      await expect(page.locator("text=404 Page Not Found")).toHaveCount(0);
      await expect(page.locator("header")).toBeVisible();
    }
  }

  expect(consoleErrors).toEqual([]);
});
