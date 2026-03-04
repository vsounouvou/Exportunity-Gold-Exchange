import { test, expect } from "@playwright/test";
import { loadPageInventory, loginAsAdmin } from "./utils";

test("route smoke test", async ({ browser }) => {
  const routes = loadPageInventory().filter((route: any) => !route.hiddenFromMenu);
  const publicPage = await browser.newPage();
  const adminPage = await browser.newPage();

  await loginAsAdmin(adminPage);

  for (const route of routes) {
    if (String(route.path).includes(":")) continue;
    const target = route.authRequired ? adminPage : publicPage;
    await target.goto(route.path, { waitUntil: "domcontentloaded" });
    await expect(target.locator("text=404 Page Not Found")).toHaveCount(0);
  }
});
