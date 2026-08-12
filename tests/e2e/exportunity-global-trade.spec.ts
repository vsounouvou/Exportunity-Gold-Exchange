import { expect, test, type Page } from "@playwright/test";

async function expectNoBrokenImages(page: Page) {
  const broken = await page.locator("img").evaluateAll((images) =>
    images
      .filter((image) => image.complete && image.naturalWidth === 0)
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

async function expectGlobalCore(page: Page) {
  await expect(page.getByTestId("exportunity-global-trade-home")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Trade\. Source\. Expand\. Operate\./i }),
  ).toBeVisible();
  await expect(page.getByText(/Global by default|Global par defaut/i)).toBeVisible();

  const chat = page.getByTestId("exportunity-ai-chat");
  await expect(chat).toBeVisible();
  await expect(chat.locator("textarea")).toHaveCount(1);
  await expect(chat.locator("textarea")).toBeEditable();
  await expect(page.locator("textarea")).toHaveCount(1);

  const map = page.locator(".leaflet-container").first();
  await map.scrollIntoViewIfNeeded();
  await expect(map).toBeVisible();
  await expectNoBrokenImages(page);
  await expectNoPageOverflow(page);
}

test.describe("Exportunity global trade home", () => {
  test("desktop keeps discovery central and Awa in a dedicated right pane", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });
    await expectGlobalCore(page);

    const mapBox = await page.locator(".leaflet-container").first().boundingBox();
    const assistantBox = await page
      .getByRole("complementary", { name: /Exportunity commercial assistant/i })
      .boundingBox();
    expect(mapBox?.width || 0).toBeGreaterThan(700);
    expect(mapBox?.height || 0).toBeGreaterThan(500);
    expect(assistantBox?.x || 0).toBeGreaterThan((mapBox?.x || 0) + (mapBox?.width || 0));

    await page.screenshot({
      path: test.info().outputPath("global-desktop.png"),
      fullPage: true,
    });
  });

  test("tablet preserves one conversation and a full-width map", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto("/", { waitUntil: "networkidle" });
    await expectGlobalCore(page);

    const mapBox = await page.locator(".leaflet-container").first().boundingBox();
    expect(mapBox?.width || 0).toBeGreaterThan(740);
    expect(mapBox?.height || 0).toBeGreaterThan(450);

    await page.screenshot({
      path: test.info().outputPath("global-tablet.png"),
      fullPage: true,
    });
  });

  test("mobile keeps the composer usable without shrinking the map", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await expectGlobalCore(page);

    const composerBox = await page
      .getByTestId("exportunity-ai-chat")
      .locator("textarea")
      .boundingBox();
    const mapBox = await page.locator(".leaflet-container").first().boundingBox();
    expect(composerBox?.width || 0).toBeGreaterThan(170);
    expect(mapBox?.width || 0).toBeGreaterThan(340);
    expect(mapBox?.height || 0).toBeGreaterThan(380);

    await page.screenshot({
      path: test.info().outputPath("global-mobile.png"),
      fullPage: true,
    });
  });
});
