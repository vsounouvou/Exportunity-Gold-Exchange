import { chromium } from "playwright";

const baseURL = process.env.E2E_BASE_URL || "https://boursedelor.com";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "admin@exportunity.local";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "ChangeMe123!";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ baseURL });

  try {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    if (!page.url().includes("/dashboard")) {
      await page.getByLabel("Email").fill(adminEmail);
      await page.getByLabel("Password").fill(adminPassword);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/dashboard|\/admin\/password/, { timeout: 30000 });
    }

    await page.goto("/admin/agents-os?tab=governance", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1:has-text('Agents OS')", { timeout: 15000 });

    const hasAgentsOs = await page.getByRole("heading", { name: /agents os/i }).first().isVisible().catch(() => false);
    const hasGovernance = await page
      .getByText("Governance (Hierarchy)")
      .first()
      .isVisible()
      .catch(() => false);
    const hasErrorCard = await page.getByText("Page failed to load").count();

    const token = await page.evaluate(() => localStorage.getItem("ece_session"));
    if (!token) {
      throw new Error("Missing ece_session token");
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      "x-ece-lang": "en",
      "Content-Type": "application/json",
    };

    const request = page.request;
    const summaryResp = await request.get(`${baseURL}/api/admin/agents-os/summary`, { headers });
    const summaryJson = await summaryResp.json().catch(() => ({}));

    const importResp = await request.post(`${baseURL}/api/admin/agents-os/import-runtime`, {
      headers,
      data: {},
    });
    const importJson = await importResp.json().catch(() => ({}));

    const skusResp = await request.get(`${baseURL}/api/stamped-gold/skus`, { headers });
    const skusJson = await skusResp.json().catch(() => ({}));

    const jewellersResp = await request.get(`${baseURL}/api/stamped-gold/jewellers`, { headers });
    const jewellersJson = await jewellersResp.json().catch(() => ({}));

    const itemsResp = await request.get(`${baseURL}/api/stamped-gold/items?limit=20`, { headers });
    const itemsJson = await itemsResp.json().catch(() => ({}));

    const report = {
      ui: {
        hasAgentsOs,
        hasGovernance,
        hasErrorCard,
      },
      api: {
        summaryStatus: summaryResp.status(),
        importStatus: importResp.status(),
        skusStatus: skusResp.status(),
        jewellersStatus: jewellersResp.status(),
        itemsStatus: itemsResp.status(),
      },
      summary: summaryJson?.summary || null,
      import: importJson?.imported || null,
      counts: {
        skus: Array.isArray(skusJson?.skus) ? skusJson.skus.length : null,
        jewellers: Array.isArray(jewellersJson?.jewellers) ? jewellersJson.jewellers.length : null,
        items: Array.isArray(itemsJson?.items) ? itemsJson.items.length : null,
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[live-smoke-seed-check] failed:", error?.message || error);
  process.exit(1);
});
