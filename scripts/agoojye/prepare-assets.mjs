import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const logoRoot =
  process.env.AGOOJIYE_LOGO_ROOT ||
  "C:/Users/Sedjro Sounouvou/Downloads/AGOOJIYE_web_brand_pack/AGOOJIYE_web_brand_pack/logo";
const referenceRoot =
  process.env.AGOOJIYE_REFERENCE_ROOT ||
  process.env.AGOOJIYE_ATTACHMENT_ROOT ||
  process.env.AGOOJYE_ATTACHMENT_ROOT ||
  "C:/Users/Sedjro Sounouvou/.codex/attachments/2fc12441-21c7-42f8-afdc-830012cd59f3";

const publicRoot = path.join(repoRoot, "client/public");
const brandRoot = path.join(publicRoot, "brand/agoojiye");
const tenantRoot = path.join(publicRoot, "tenants/agoojye");

const logoFiles = [
  "AGOOJIYE_app_icon_64.png",
  "AGOOJIYE_app_icon_128.png",
  "AGOOJIYE_app_icon_256.png",
  "AGOOJIYE_app_icon_512.png",
  "AGOOJIYE_emblem_automotive_transparent.png",
  "AGOOJIYE_emblem_full_transparent.png",
  "AGOOJIYE_logo_dark_background_transparent.png",
  "AGOOJIYE_logo_primary_transparent.png",
  "AGOOJIYE_logo_horizontal_transparent.png",
  "AGOOJIYE_vehicle_badge_lockup.png",
  "AGOOJIYE_wordmark_gold_transparent.png",
  "AGOOJIYE_wordmark_transparent.png",
];

const referenceFiles = {
  charterOverview: "image-3.png",
  charterTypography: "image-4.png",
  charterDigitalUi: "image-5.png",
  shuttleFrontThreeQuarter: "image-6.png",
  shuttleSideStudio: "image-7.png",
  shuttleRearStudio: "image-8.png",
  shuttleFrontBadgeDetail: "image-9.png",
  shuttleFactory: "image-10.png",
  shuttleHeroBanner: "image-11.png",
  shuttleAngleSheet: "image-12.png",
  shuttleReferenceExtra: "image-13.png",
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required asset: ${filePath}`);
  }
}

function copyFile(input, output) {
  requireFile(input);
  ensureDir(path.dirname(output));
  fs.copyFileSync(input, output);
  return output;
}

function referencePath(name) {
  return path.join(referenceRoot, referenceFiles[name]);
}

async function makeRaster(input, outputBase, options) {
  requireFile(input);
  ensureDir(path.dirname(outputBase));
  let image = sharp(input);
  if (options.crop) image = image.extract(options.crop);
  image = image.resize({
    width: options.width,
    height: options.height,
    fit: options.fit || "cover",
    position: options.position || "center",
    withoutEnlargement: options.withoutEnlargement ?? true,
  });

  if (options.avif !== false) {
    await image.clone().avif({ quality: options.avifQuality ?? 55, effort: 4 }).toFile(`${outputBase}.avif`);
  }
  if (options.webp !== false) {
    await image.clone().webp({ quality: options.webpQuality ?? 84, effort: 5 }).toFile(`${outputBase}.webp`);
  }
  if (options.png) {
    await image.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(`${outputBase}.png`);
  }
  if (options.jpeg) {
    await image.clone().jpeg({ quality: options.jpegQuality ?? 84, mozjpeg: true }).toFile(`${outputBase}.jpg`);
  }
}

async function makeIcon(input, output, size) {
  ensureDir(path.dirname(output));
  await sharp(input)
    .resize({ width: size, height: size, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(output);
}

async function main() {
  for (const dir of [
    path.join(brandRoot, "logo"),
    path.join(brandRoot, "vehicle/hero"),
    path.join(brandRoot, "vehicle/mobile"),
    path.join(brandRoot, "vehicle/sections"),
    path.join(brandRoot, "vehicle/details"),
    path.join(brandRoot, "og"),
    tenantRoot,
  ]) {
    ensureDir(dir);
  }

  for (const fileName of logoFiles) {
    copyFile(path.join(logoRoot, fileName), path.join(brandRoot, "logo", fileName));
  }

  copyFile(path.join(logoRoot, "AGOOJIYE_logo_primary_transparent.png"), path.join(brandRoot, "logo/agoojiye-logo-primary.png"));
  copyFile(path.join(logoRoot, "AGOOJIYE_logo_horizontal_transparent.png"), path.join(brandRoot, "logo/agoojiye-logo-horizontal.png"));
  copyFile(path.join(logoRoot, "AGOOJIYE_logo_dark_background_transparent.png"), path.join(brandRoot, "logo/agoojiye-logo-dark-background.png"));
  copyFile(path.join(logoRoot, "AGOOJIYE_emblem_full_transparent.png"), path.join(brandRoot, "logo/agoojiye-emblem-full.png"));
  copyFile(path.join(logoRoot, "AGOOJIYE_emblem_automotive_transparent.png"), path.join(brandRoot, "logo/agoojiye-emblem-automotive.png"));
  copyFile(path.join(logoRoot, "AGOOJIYE_wordmark_transparent.png"), path.join(brandRoot, "logo/agoojiye-wordmark.png"));

  const icon512 = path.join(logoRoot, "AGOOJIYE_app_icon_512.png");
  copyFile(icon512, path.join(tenantRoot, "favicon.png"));
  copyFile(icon512, path.join(tenantRoot, "logo-icon.png"));
  copyFile(path.join(logoRoot, "AGOOJIYE_logo_horizontal_transparent.png"), path.join(tenantRoot, "logo-wordmark.png"));
  copyFile(path.join(logoRoot, "AGOOJIYE_logo_primary_transparent.png"), path.join(tenantRoot, "logo-primary.png"));
  await makeIcon(icon512, path.join(tenantRoot, "apple-touch-icon.png"), 180);
  await makeIcon(icon512, path.join(tenantRoot, "icon-192.png"), 192);
  await makeIcon(icon512, path.join(tenantRoot, "icon-512.png"), 512);

  const heroSource = referencePath("shuttleHeroBanner");
  const sideSource = referencePath("shuttleSideStudio");
  const rearSource = referencePath("shuttleRearStudio");
  const badgeSource = referencePath("shuttleFrontBadgeDetail");
  const factorySource = referencePath("shuttleFactory");

  const heroCrop = { left: 260, top: 50, width: 1656, height: 680 };
  for (const width of [1916, 1600, 1280, 960, 640]) {
    await makeRaster(heroSource, path.join(brandRoot, `vehicle/hero/agoojiye-shuttle-hero-${width}`), {
      crop: heroCrop,
      width,
      avifQuality: 54,
      webpQuality: 84,
      jpeg: width === 1280,
    });
  }

  await makeRaster(heroSource, path.join(brandRoot, "vehicle/mobile/agoojiye-shuttle-hero-mobile-768"), {
    crop: { left: 640, top: 50, width: 1100, height: 680 },
    width: 768,
    avifQuality: 54,
    webpQuality: 84,
  });
  await makeRaster(heroSource, path.join(brandRoot, "og/agoojiye-og-image"), {
    crop: { left: 360, top: 50, width: 1295, height: 680 },
    width: 1200,
    height: 630,
    avif: false,
    webpQuality: 84,
    jpeg: true,
  });

  await makeRaster(sideSource, path.join(brandRoot, "vehicle/sections/agoojiye-shuttle-side-profile-1280"), {
    width: 1280,
    avifQuality: 56,
    webpQuality: 84,
  });
  await makeRaster(rearSource, path.join(brandRoot, "vehicle/sections/agoojiye-shuttle-rear-three-quarter-1280"), {
    width: 1280,
    avifQuality: 56,
    webpQuality: 84,
  });
  await makeRaster(factorySource, path.join(brandRoot, "vehicle/sections/agoojiye-shuttle-factory-1280"), {
    width: 1280,
    avifQuality: 56,
    webpQuality: 84,
  });
  await makeRaster(badgeSource, path.join(brandRoot, "vehicle/details/agoojiye-shuttle-front-badge-detail-960"), {
    width: 960,
    avifQuality: 56,
    webpQuality: 84,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
