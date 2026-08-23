import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const appName = String(
  process.env.APP_NAME ||
    process.env.APP ||
    process.env.DEPLOY_TENANT ||
    process.env.TENANT_DEFAULT ||
    "",
)
  .trim()
  .toLowerCase();

if (appName !== "exportunity") {
  console.log(`[prune-tenant-build] skipped for app=${appName || "shared"}`);
  process.exit(0);
}

const distPublic = path.resolve(root, "dist", "public");
const rootPrefix = `${root}${path.sep}`;
if (!distPublic.startsWith(rootPrefix)) {
  throw new Error("Refusing to prune outside the application root");
}
const distPrefix = `${distPublic}${path.sep}`;

function directoryBytes(directory) {
  if (!fs.existsSync(directory)) return 0;
  const rootStat = fs.lstatSync(directory);
  if (!rootStat.isDirectory()) return rootStat.isFile() ? rootStat.size : 0;
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += directoryBytes(entryPath);
    else if (entry.isFile()) total += fs.statSync(entryPath).size;
  }
  return total;
}

function removeGeneratedPath(relativePath) {
  const target = path.resolve(distPublic, relativePath);
  if (!target.startsWith(distPrefix)) {
    throw new Error(`Refusing to prune outside dist/public: ${relativePath}`);
  }
  if (!fs.existsSync(target)) return { removed: false, bytes: 0 };
  const bytes = directoryBytes(target);
  fs.rmSync(target, { recursive: true, force: true });
  return { removed: true, bytes };
}

const targets = [
  "brand/agoojiye",
  "brand-assets/generated",
  "met",
  "favicon-mindbase.svg",
  "manifest-agoojiye.webmanifest",
  "manifest-bdo.webmanifest",
  "manifest-mindbase.webmanifest",
  "manifest.webmanifest",
  "assets/bdo-gateway-bg.jpg",
  "assets/bdo-gateway-bg.svg",
  "assets/gateway-preview.svg",
  "assets/gateway-role-buyer.svg",
  "assets/gateway-role-demo.svg",
  "assets/gateway-role-investor.svg",
  "assets/gateway-role-miner.svg",
  "assets/gateway-role-wholesaler.svg",
];
const tenantsRoot = path.join(distPublic, "tenants");
if (fs.existsSync(tenantsRoot)) {
  for (const entry of fs.readdirSync(tenantsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.toLowerCase() === "exportunity") continue;
    targets.push(`tenants/${entry.name}`);
  }
}

let removedBytes = 0;
const removedPaths = [];
for (const target of targets) {
  const result = removeGeneratedPath(target);
  if (!result.removed) continue;
  removedBytes += result.bytes;
  removedPaths.push(target);
}

console.log("[prune-tenant-build] Exportunity artifact isolated", {
  removedPaths,
  removedBytes,
});
