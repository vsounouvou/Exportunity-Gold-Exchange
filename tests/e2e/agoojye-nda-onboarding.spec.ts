import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const tenant = {
  id: 3162,
  key: "agoojye",
  name: "AGOOJIYE",
  domains: ["agoojiye.com"],
  themeConfig: { brand: "agoojye" },
  featureFlags: {},
};

test("le membre dépose son NDA avant tout accès au travail", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("ece_session", "nda-limited-session");
    localStorage.setItem(
      "ece_user",
      JSON.stringify({
        id: 501,
        email: "membre@agoojiye.com",
        displayName: "Awa Équipe",
        roles: ["buyer"],
        permissions: [],
        currentMode: "buyer",
        sessionScope: "agoojye_nda",
      }),
    );
  });
  await page.route("**/api/tenant", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tenant),
    }),
  );
  await page.route("**/api/agoojye/onboarding/nda", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          ndaAccessState: "submitted",
          accessAllowed: true,
          redirect: "/workspace/connexion",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        displayName: "Awa Équipe",
        corporateEmail: "membre@agoojiye.com",
        ndaRegistered: true,
        ndaAccessState: "required",
        accessAllowed: false,
        document: null,
        upload: {
          acceptedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
          maxBytes: 10 * 1024 * 1024,
        },
      }),
    });
  });

  await page.goto("/workspace/onboarding/nda");
  await expect(
    page.getByRole("heading", {
      name: "Ajoutez votre NDA signé avant d’ouvrir votre espace.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Awa Équipe · membre@agoojiye.com")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Déposer le NDA signé" }),
  ).toBeDisabled();

  await page.locator("#nda-file").setInputFiles({
    name: "nda-signe.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nsigned test\n%%EOF", "utf8"),
  });
  await page
    .getByRole("checkbox", {
      name: /Je confirme que ce fichier est mon NDA signé/,
    })
    .check();
  await page.screenshot({
    path: testInfo.outputPath("nda-onboarding-mobile.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "Déposer le NDA signé" }).click();
  await expect(page).toHaveURL(/\/workspace\/connexion$/);
  await expect(page.getByText("NDA reçu", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
});
