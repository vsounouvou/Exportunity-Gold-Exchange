import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("AGOOJIYE passenger can search, reserve, pay in demo mode and open a QR ticket", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /mobilité électrique du bénin commence ici/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Acheter un billet" }).first()).toBeVisible();

  const search = page.locator("form").filter({ has: page.getByRole("button", { name: "Voir les trajets" }) }).first();
  await search.getByLabel("Départ").fill("Cotonou");
  await search.getByLabel("Destination").fill("Porto-Novo");
  await search.getByLabel("Passagers").fill("1");
  await search.getByRole("button", { name: "Voir les trajets" }).click();
  await page.waitForURL(/\/trajets\?/);

  const trip = page.getByRole("link", { name: /choisir ce trajet/i }).first();
  await expect(trip).toBeVisible();
  await trip.click();
  await page.waitForURL(/\/trajets\/\d+/);
  await page.getByRole("button", { name: "Choisir mes places" }).click();
  await page.waitForURL("**/reservation/sieges");

  const availableSeat = page.getByRole("button", { name: /siège .* disponible/i }).first();
  await expect(availableSeat).toBeVisible();
  await availableSeat.click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForURL("**/reservation/passagers");

  await page.getByLabel("Prénom").fill("Aminata");
  await page.getByLabel("Nom").fill("Test mobilité");
  await page.getByLabel("Téléphone", { exact: true }).first().fill("+2290197000000");
  await page.getByLabel("E-mail du passager principal").fill("mobilite.e2e@agoojiye.com");
  await page.getByLabel("E-mail", { exact: true }).fill("mobilite.e2e@agoojiye.com");
  await page.getByLabel("Téléphone", { exact: true }).last().fill("+2290197000000");
  await page.getByRole("button", { name: "Voir le récapitulatif" }).click();
  await page.waitForURL("**/reservation/paiement");

  await expect(page.getByText("Paiement de démonstration")).toBeVisible();
  await page.getByRole("button", { name: "Simuler le paiement" }).click();
  await page.waitForURL(/\/reservation\/confirmation\/AGJ-/);
  await expect(page.getByRole("heading", { name: "Réservation confirmée" })).toBeVisible();

  const ticketLink = page.getByRole("link", { name: /aminata test mobilité/i }).first();
  await ticketLink.click();
  await page.waitForURL(/\/billet\//);
  await expect(page.getByAltText(/QR code du billet/)).toBeVisible();
  await expect(page.getByText("Paiement").locator("..").getByText("Confirmé")).toBeVisible();
});

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 1000 },
]) {
  test(`3D viewer renders nonblank and stays framed on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/experience-3d");
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Vue extérieure" })).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(Math.min(300, viewport.width - 40));
    expect(box!.height).toBeGreaterThan(350);
    const screenshot = await canvas.screenshot();
    const stats = await sharp(screenshot).stats();
    expect(stats.channels.some((channel) => channel.stdev > 8)).toBeTruthy();
    await page.getByRole("button", { name: "Vue latérale" }).click();
    await page.getByRole("button", { name: "Intérieur" }).click();
  });
}

test("commercial requests persist through public APIs", async ({ request }) => {
  const suffix = Date.now();
  const fullBus = await request.post("/api/agoojye/mobility/requests/full-bus", { data: { customerType: "entreprise", organizationName: "E2E AGOOJIYE", contactName: "Test opérations", email: `e2e.bus.${suffix}@agoojiye.com`, phone: "+2290197000001", origin: "Cotonou", destination: "Ouidah", departureAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), tripType: "one-way", passengerCount: 12, requestAction: "quote" } });
  expect(fullBus.status()).toBe(201);
  expect((await fullBus.json()).reference).toMatch(/^BUS-/);

  const waitlist = await request.post("/api/agoojye/mobility/waitlist", { data: { firstName: "E2E", lastName: "Priorité", email: `e2e.waitlist.${suffix}@agoojiye.com`, phone: "+2290197000002", city: "Cotonou", country: "Bénin", interests: ["first_trips"], consent: true } });
  expect(waitlist.status()).toBe(201);
});
