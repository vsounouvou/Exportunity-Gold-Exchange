import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const publicRoutes = [
  "/",
  "/reserver",
  "/trajets",
  "/retrouver-ma-reservation",
  "/bus",
  "/experience-3d",
  "/reserver-un-bus",
  "/demonstration",
  "/commander",
  "/liste-prioritaire",
  "/a-propos",
  "/contact",
  "/faq",
];

async function expectUsablePublicPage(page: Page, path: string) {
  const pageErrors: string[] = [];
  const recordPageError = (error: Error) => pageErrors.push(error.message);
  page.on("pageerror", recordPageError);

  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${path} doit répondre sans erreur HTTP`).toBeLessThan(400);
  await expect(page.locator("html")).toHaveAttribute("lang", /^fr(?:-|$)/);
  await expect(page.locator("h1").first(), `${path} doit annoncer clairement la page`).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Internal Server Error|Cannot GET|Page introuvable/i);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    `${path} ne doit pas déborder horizontalement`,
  ).toBeTruthy();
  expect(pageErrors, `${path} ne doit pas déclencher d'erreur JavaScript`).toEqual([]);

  page.off("pageerror", recordPageError);
}

for (const path of publicRoutes) {
  test(`surface publique utilisable sur bureau: ${path}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expectUsablePublicPage(page, path);

    if (path === "/") {
      await expect(page.getByRole("link", { name: "Acheter un billet" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Voir les trajets" })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("accueil-desktop.png"), fullPage: false });
    }
  });
}

for (const path of ["/", "/reserver", "/reserver-un-bus", "/commander", "/liste-prioritaire"]) {
  test(`parcours prioritaire utilisable sur mobile: ${path}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectUsablePublicPage(page, path);

    if (path === "/") {
      await expect(page.getByRole("link", { name: "Acheter un billet" }).first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("accueil-mobile.png"), fullPage: false });
    }
  });
}
