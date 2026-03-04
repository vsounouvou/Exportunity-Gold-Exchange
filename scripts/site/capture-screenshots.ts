import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

type SeedShot = {
  id: string;
  title: string;
  module: string;
  tags: string[];
  imagePath: string;
  caption: string;
  createdAt: string;
};

const TARGETS = [
  { route: "/platform/agents", id: "auto-agents", title: "Agents hierarchy", module: "Agents", tags: ["agents", "operations"] },
  { route: "/platform/wallet", id: "auto-wallet", title: "Wallet transactions", module: "Wallet", tags: ["wallet", "payments"] },
  { route: "/platform/contracts", id: "auto-contracts", title: "Contract milestone approval", module: "Contracts", tags: ["contract", "approval"] },
  { route: "/platform/invest", id: "auto-invest", title: "Investor reporting", module: "Invest", tags: ["invest", "report"] },
  { route: "/platform/marketplace", id: "auto-marketplace", title: "Marketplace execution", module: "Marketplace", tags: ["marketplace", "procurement"] },
  { route: "/platform/gold", id: "auto-gold", title: "Gold traceability flow", module: "Gold", tags: ["gold", "traceability"] },
];

async function run() {
  const baseUrl = process.env.SCREENSHOT_BASE_URL || process.env.MARKETING_AUDIT_BASE_URL || "http://127.0.0.1:5000";
  const outputDir = path.resolve(process.cwd(), "client", "public", "assets", "screenshots", "auto");
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const nowIso = new Date().toISOString();
  const nextShots: SeedShot[] = [];

  for (const target of TARGETS) {
    const url = new URL(target.route, baseUrl).toString();
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    const filename = `${target.id}-${Date.now()}.png`;
    const absPath = path.join(outputDir, filename);
    await page.screenshot({ path: absPath, fullPage: false });
    const publicPath = `/assets/screenshots/auto/${filename}`;
    nextShots.push({
      id: target.id,
      title: target.title,
      module: target.module,
      tags: target.tags,
      imagePath: publicPath,
      caption: `Auto-captured from ${target.route}`,
      createdAt: nowIso,
    });
    console.log(`captured ${target.route} -> ${publicPath}`);
  }

  await browser.close();

  const indexPath = path.resolve(process.cwd(), "content", "screenshots", "index.json");
  let current: { items: SeedShot[] } = { items: [] };
  try {
    current = JSON.parse(await fs.readFile(indexPath, "utf8")) as { items: SeedShot[] };
  } catch {
    current = { items: [] };
  }

  const items = Array.isArray(current.items) ? current.items : [];
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const shot of nextShots) byId.set(shot.id, shot);

  const merged = { items: Array.from(byId.values()) };
  await fs.writeFile(indexPath, JSON.stringify(merged, null, 2), "utf8");
  console.log(`updated ${indexPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
