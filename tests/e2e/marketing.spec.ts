import { test, expect } from "@playwright/test";

const marketingRoutes = [
  "/",
  "/platform",
  "/solutions",
  "/journey",
  "/media",
  "/talk",
];

test("marketing routes smoke test", async ({ page }) => {
  for (const route of marketingRoutes) {
    const url = route === "/" ? "/?marketing=1" : `${route}?marketing=1`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=404 Page Not Found")).toHaveCount(0);
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.locator("footer")).toHaveCount(1);
    await expect(page.locator("h1").first()).toBeVisible();
  }
});

test("marketing module shortcuts resolve to platform selector", async ({ page }) => {
  const moduleCases: Array<{ path: string; key: string; name: string }> = [
    { path: "/wallet", key: "wallet", name: "Wallet" },
    { path: "/trade", key: "trade", name: "Trade execution" },
    { path: "/contracts", key: "contracts", name: "Contracts" },
    { path: "/business", key: "business", name: "Business operations" },
    { path: "/machinery", key: "machinery", name: "Machinery" },
    { path: "/invest", key: "invest", name: "Invest" },
    { path: "/compliance", key: "compliance", name: "Compliance" },
  ];

  for (const item of moduleCases) {
    await page.goto(`${item.path}?marketing=1`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/platform\\?module=${item.key}(&marketing=1)?`));
    await expect(page.getByText(item.name).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Open" }).first()).toBeVisible();
  }
});
