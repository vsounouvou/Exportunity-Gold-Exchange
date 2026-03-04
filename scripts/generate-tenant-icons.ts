import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

type Rgba = { r: number; g: number; b: number; a: number };

function hexToRgba(hex: string, alpha = 255): Rgba {
  const value = hex.replace(/^#/, "").trim();
  if (!/^[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const a = Math.max(0, Math.min(255, alpha));
  return { r, g, b, a };
}

function setPixel(png: PNG, x: number, y: number, color: Rgba) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = color.r;
  png.data[idx + 1] = color.g;
  png.data[idx + 2] = color.b;
  png.data[idx + 3] = color.a;
}

function fill(png: PNG, color: Rgba) {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      setPixel(png, x, y, color);
    }
  }
}

function fillRoundedRect(
  png: PNG,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: Rgba,
) {
  const r = Math.max(0, Math.min(radius, Math.floor(Math.min(width, height) / 2)));

  const left = x;
  const top = y;
  const right = x + width - 1;
  const bottom = y + height - 1;

  const r2 = r * r;

  for (let py = top; py <= bottom; py++) {
    for (let px = left; px <= right; px++) {
      const inCore = px >= left + r && px <= right - r && py >= top && py <= bottom;
      const inCoreV = py >= top + r && py <= bottom - r && px >= left && px <= right;
      if (inCore || inCoreV) {
        setPixel(png, px, py, color);
        continue;
      }

      const cx = px < left + r ? left + r : right - r;
      const cy = py < top + r ? top + r : bottom - r;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(png, px, py, color);
      }
    }
  }
}

type IconTheme = {
  background: string;
  bar1: string;
  bar2: string;
  bar3: string;
};

function renderBrandMark(size: number, theme: IconTheme) {
  const png = new PNG({ width: size, height: size });
  fill(png, { r: 0, g: 0, b: 0, a: 0 });

  const scale = size / 24;
  const bgRadius = Math.round(5 * scale);
  fillRoundedRect(png, 0, 0, size, size, bgRadius, hexToRgba(theme.background));

  const barRadius = Math.max(1, Math.round(1.2 * scale));

  fillRoundedRect(
    png,
    Math.round(4 * scale),
    Math.round(11 * scale),
    Math.round(4 * scale),
    Math.round(9 * scale),
    barRadius,
    hexToRgba(theme.bar1),
  );
  fillRoundedRect(
    png,
    Math.round(10 * scale),
    Math.round(7 * scale),
    Math.round(4 * scale),
    Math.round(13 * scale),
    barRadius,
    hexToRgba(theme.bar2),
  );
  fillRoundedRect(
    png,
    Math.round(16 * scale),
    Math.round(4 * scale),
    Math.round(4 * scale),
    Math.round(16 * scale),
    barRadius,
    hexToRgba(theme.bar3),
  );

  return PNG.sync.write(png);
}

function writeFile(targetPath: string, data: Buffer) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, data);
}

function buildIco(images: Array<{ size: number; png: Buffer }>) {
  const count = images.length;
  const headerSize = 6 + 16 * count;
  const header = Buffer.alloc(headerSize);

  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type (icon)
  header.writeUInt16LE(count, 4); // count

  let offset = headerSize;
  for (let i = 0; i < count; i++) {
    const entryOffset = 6 + 16 * i;
    const img = images[i];
    const dim = img.size === 256 ? 0 : img.size;

    header.writeUInt8(dim, entryOffset + 0); // width
    header.writeUInt8(dim, entryOffset + 1); // height
    header.writeUInt8(0, entryOffset + 2); // color count
    header.writeUInt8(0, entryOffset + 3); // reserved
    header.writeUInt16LE(1, entryOffset + 4); // planes
    header.writeUInt16LE(32, entryOffset + 6); // bit count
    header.writeUInt32LE(img.png.length, entryOffset + 8); // bytes in resource
    header.writeUInt32LE(offset, entryOffset + 12); // offset
    offset += img.png.length;
  }

  return Buffer.concat([header, ...images.map((img) => img.png)]);
}

function main() {
  const repoRoot = process.cwd();
  const publicDir = path.join(repoRoot, "client", "public");

  const bdoTheme: IconTheme = {
    background: "#0B0F14",
    bar1: "#D9A441",
    bar2: "#D9A441",
    bar3: "#D9A441",
  };

  const exportunityTheme: IconTheme = {
    background: "#0B0F14",
    bar1: "#0ea5e9",
    bar2: "#22c55e",
    bar3: "#0ea5e9",
  };

  // PWA icons
  writeFile(path.join(publicDir, "pwa", "icon-192.png"), renderBrandMark(192, bdoTheme));
  writeFile(path.join(publicDir, "pwa", "icon-512.png"), renderBrandMark(512, bdoTheme));
  writeFile(path.join(publicDir, "pwa", "apple-touch-icon.png"), renderBrandMark(180, bdoTheme));

  writeFile(path.join(publicDir, "pwa", "exportunity-icon-192.png"), renderBrandMark(192, exportunityTheme));
  writeFile(path.join(publicDir, "pwa", "exportunity-icon-512.png"), renderBrandMark(512, exportunityTheme));
  writeFile(path.join(publicDir, "pwa", "apple-touch-icon-exportunity.png"), renderBrandMark(180, exportunityTheme));

  // Favicons (ICO)
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const bdoIco = buildIco(icoSizes.map((size) => ({ size, png: renderBrandMark(size, bdoTheme) })));
  const exportunityIco = buildIco(icoSizes.map((size) => ({ size, png: renderBrandMark(size, exportunityTheme) })));
  writeFile(path.join(publicDir, "favicon.ico"), bdoIco);
  writeFile(path.join(publicDir, "favicon-exportunity.ico"), exportunityIco);

  console.log("[generate-tenant-icons] updated PWA icons + favicons");
}

main();

