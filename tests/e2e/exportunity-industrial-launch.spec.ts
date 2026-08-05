import { expect, test, type Page } from "@playwright/test";

async function expectNoBrokenImages(page: Page) {
  const broken = await page.locator("img").evaluateAll((images) =>
    images
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.getAttribute("src")),
  );
  expect(broken).toEqual([]);
}

async function expectNoPageOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
}

test.describe("Exportunity industrial launch experience", () => {
  test("desktop keeps Tassi and the industrial map as the primary actions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/industrial", { waitUntil: "networkidle" });

    const chat = page.getByTestId("exportunity-ai-chat");
    await expect(chat).toBeVisible();
    await expect(chat.locator("textarea")).toHaveCount(1);
    await expect(chat.locator("textarea")).toBeEditable();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.locator('nav a[aria-current="page"]')).toHaveCount(0);
    await expect(
      page.locator('input[placeholder*="Search"], input[placeholder*="Rechercher"]'),
    ).toHaveCount(0);

    const mapBox = await page.locator(".leaflet-container").boundingBox();
    expect(mapBox?.width || 0).toBeGreaterThan(400);
    expect(mapBox?.height || 0).toBeGreaterThan(480);

    await expectNoBrokenImages(page);
    await expectNoPageOverflow(page);
    await page.screenshot({
      path: test.info().outputPath("industrial-desktop.png"),
      fullPage: true,
    });

    const firstRequest = chat
      .getByRole("button")
      .filter({ hasText: /urgent spare part|pi[eè]ce d[eé]tach[eé]e urgente/i })
      .first();
    await firstRequest.click();
    await expect(
      chat.getByText(/open the technical case|ouvrir le dossier technique/i),
    ).toBeVisible();
    await expect(chat.locator('input[type="email"]')).toBeVisible();
  });

  test("mobile preserves a usable composer and a full-width interactive map", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/industrial", { waitUntil: "networkidle" });

    const chat = page.getByTestId("exportunity-ai-chat");
    const composer = chat.locator("textarea");
    await expect(chat).toBeVisible();
    await expect(composer).toBeEditable();
    expect((await composer.boundingBox())?.width || 0).toBeGreaterThan(145);
    await expectNoBrokenImages(page);
    await expectNoPageOverflow(page);

    const map = page.locator(".leaflet-container");
    await map.scrollIntoViewIfNeeded();
    await expect(map).toBeVisible();
    const mapBox = await map.boundingBox();
    expect(mapBox?.width || 0).toBeGreaterThan(340);
    expect(mapBox?.height || 0).toBeGreaterThan(480);

    await page.getByRole("button", { name: "GDIZ" }).first().click();
    await expect(page.getByText(/Glo-Djigb[eé] Industrial Zone/i).last()).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("industrial-mobile.png"),
      fullPage: true,
    });
  });

  test("primary industrial routes render without application errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    for (const route of [
      "/factories",
      "/map",
      "/export-products",
      "/industrial-supply",
      "/machinery",
      "/request-quote",
    ]) {
      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status(), route).toBeLessThan(400);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/application error/i);
    }

    expect(errors).toEqual([]);
  });
});
