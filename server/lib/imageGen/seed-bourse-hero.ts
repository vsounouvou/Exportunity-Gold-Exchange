import path from "path";
import fs from "fs";
import os from "os";
import { getActiveImage, importLocalAsset, upsertAsset } from "./service";

const NAMESPACE = "bourse";

type SeedSpec = {
  assetKey: string;
  label: string;
  sourcePath: string;
  seedFilename: string;
  upgradeMarkers?: string[];
};

const SEEDS: SeedSpec[] = [
  {
    assetKey: "landing/hero_desktop",
    label: "Bourse hero desktop",
    sourcePath: path.resolve(process.cwd(), "client", "public", "assets", "bdo-gateway-bg.svg"),
    seedFilename: "seed-hero.svg",
    upgradeMarkers: ["/hero-import.", "/seed-hero.", "/bdo-gateway-bg."],
  },
  {
    assetKey: "landing/hero_panel",
    label: "Bourse hero panel",
    sourcePath: path.resolve(process.cwd(), "client", "public", "assets", "gateway-preview.svg"),
    seedFilename: "seed-hero-panel.svg",
    upgradeMarkers: ["/seed-hero-panel.", "/seed-preview."],
  },
  {
    assetKey: "landing/role_miner",
    label: "Bourse role: miner",
    sourcePath: path.resolve(process.cwd(), "client", "public", "assets", "gateway-role-miner.svg"),
    seedFilename: "seed-role-miner.svg",
    upgradeMarkers: ["/seed-role-miner."],
  },
  {
    assetKey: "landing/role_wholesaler",
    label: "Bourse role: wholesaler",
    sourcePath: path.resolve(process.cwd(), "client", "public", "assets", "gateway-role-wholesaler.svg"),
    seedFilename: "seed-role-wholesaler.svg",
    upgradeMarkers: ["/seed-role-wholesaler."],
  },
  {
    assetKey: "landing/role_buyer",
    label: "Bourse role: buyer",
    sourcePath: path.resolve(process.cwd(), "client", "public", "assets", "gateway-role-buyer.svg"),
    seedFilename: "seed-role-buyer.svg",
    upgradeMarkers: ["/seed-role-buyer."],
  },
  {
    assetKey: "landing/role_investor",
    label: "Bourse role: investor",
    sourcePath: path.resolve(process.cwd(), "client", "public", "assets", "gateway-role-investor.svg"),
    seedFilename: "seed-role-investor.svg",
    upgradeMarkers: ["/seed-role-investor."],
  },
  {
    assetKey: "landing/role_explore",
    label: "Bourse role: demo",
    sourcePath: path.resolve(process.cwd(), "client", "public", "assets", "gateway-role-demo.svg"),
    seedFilename: "seed-role-demo.svg",
    upgradeMarkers: ["/seed-role-demo."],
  },
];

function buildNeutralPlaceholderSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="Neutral placeholder">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B1220"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <radialGradient id="glow" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#D4A83B" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#D4A83B" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="900" fill="url(#glow)"/>
</svg>`;
}

async function ensureTempSeedFile(filename: string) {
  const dir = path.join(os.tmpdir(), "bdo-image-seeds");
  await fs.promises.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await fs.promises.writeFile(filePath, buildNeutralPlaceholderSvg(), "utf-8");
  return filePath;
}

async function resolveSeedPath(candidatePath: string, fallbackFilename: string) {
  if (candidatePath && fs.existsSync(candidatePath)) return candidatePath;
  const baseName = candidatePath ? path.basename(candidatePath) : fallbackFilename;
  const distCandidate = path.resolve(process.cwd(), "dist", "public", "assets", baseName);
  if (fs.existsSync(distCandidate)) return distCandidate;
  return await ensureTempSeedFile(baseName);
}

function shouldSeed(activeUrl: string | null | undefined, markers: string[] | undefined) {
  if (!activeUrl) return true;
  if (!markers?.length) return false;
  return markers.some((m) => activeUrl.includes(m));
}

export async function ensureBourseHeroSeed() {
  try {
    for (const spec of SEEDS) {
      await upsertAsset(NAMESPACE, spec.assetKey, spec.label);

      const active = await getActiveImage(NAMESPACE, spec.assetKey);
      const activeUrl = active?.storedUrl || null;
      if (!shouldSeed(activeUrl, spec.upgradeMarkers)) continue;

      const sourcePath = await resolveSeedPath(spec.sourcePath, spec.seedFilename);
      await importLocalAsset({
        namespace: NAMESPACE,
        assetKey: spec.assetKey,
        sourcePath,
        filename: spec.seedFilename,
        label: spec.label,
        setActive: true,
      });
    }
  } catch (err) {
    console.error("Failed to seed bourse hero", err);
  }
}
