import fs from "node:fs";
import path from "node:path";

type FileAudit = {
  file: string;
  routes: Array<{ target: string; valid: boolean; matchedRoute: string | null }>;
  apis: Array<{ target: string; valid: boolean; matchedPrefix: string | null }>;
};

const repoRoot = process.cwd();
const reportsDir = path.join(repoRoot, "reports");
const appFile = path.join(repoRoot, "client", "src", "App.tsx");
const routesFile = path.join(repoRoot, "server", "routes.ts");

const targetFiles = [
  "client/src/components/agentic/AppProBottomNav.tsx",
  "client/src/pages/AppProMoneyPage.tsx",
  "client/src/pages/AppProRoomPage.tsx",
  "client/src/pages/AppProShopPage.tsx",
  "client/src/pages/AppProMePage.tsx",
];

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function parseFrontendRoutes(source: string) {
  const out = new Set<string>();
  const rx = /<Route\s+path=\"([^\"]+)\"/g;
  for (const match of source.matchAll(rx)) {
    const value = String(match[1] || "").trim();
    if (value) out.add(value);
  }
  return Array.from(out);
}

function parseApiPrefixes(source: string) {
  const out = new Set<string>();
  const rx = /app\.use\(\s*\"([^\"]+)\"/g;
  for (const match of source.matchAll(rx)) {
    const value = String(match[1] || "").trim();
    if (value.startsWith("/api")) out.add(value);
  }
  return Array.from(out).sort((a, b) => b.length - a.length);
}

function routeMatches(target: string, patterns: string[]) {
  const targetParts = target.replace(/\/+$/g, "").split("/").filter(Boolean);
  for (const pattern of patterns) {
    const patternParts = pattern.replace(/\/+$/g, "").split("/").filter(Boolean);
    let matched = true;
    let i = 0;
    for (; i < patternParts.length; i++) {
      const segment = patternParts[i];
      const targetSegment = targetParts[i];
      if (segment === undefined) {
        matched = false;
        break;
      }
      if (segment.startsWith(":") && segment.endsWith("*")) {
        matched = true;
        i = patternParts.length;
        break;
      }
      if (segment.startsWith(":")) {
        if (!targetSegment) {
          matched = false;
          break;
        }
        continue;
      }
      if (segment !== targetSegment) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    if (i < patternParts.length) continue;
    const hasRestWildcard = patternParts.some((part) => part.startsWith(":") && part.endsWith("*"));
    if (!hasRestWildcard && patternParts.length !== targetParts.length) continue;
    return pattern;
  }
  return null;
}

function extractRouteTargets(source: string) {
  const out = new Set<string>();
  const setLocationRx = /setLocation\(\s*[\"'`]([^\"'`]+)[\"'`]/g;
  const hrefRx = /href=\{?[\"'`]([^\"'`]+)[\"'`]\}?/g;
  const linkRx = /<Link\s+href=\{?[\"'`]([^\"'`]+)[\"'`]\}?/g;

  for (const rx of [setLocationRx, hrefRx, linkRx]) {
    for (const match of source.matchAll(rx)) {
      const value = String(match[1] || "").trim();
      if (value.startsWith("/")) {
        const normalized = (value.split("?")[0] || value).replace(/\$\{[^}]+\}/g, "0");
        out.add(normalized);
      }
    }
  }
  return Array.from(out);
}

function extractApiTargets(source: string) {
  const out = new Set<string>();
  const staticRx = /apiRequest\(\s*[\"'`]([^\"'`$]+)[\"'`]/g;
  const templateRx = /apiRequest\(\s*`([^`]+)`/g;

  for (const match of source.matchAll(staticRx)) {
    const value = String(match[1] || "").trim();
    if (value.startsWith("/api/")) out.add((value.split("?")[0] || value).trim());
  }
  for (const match of source.matchAll(templateRx)) {
    const value = String(match[1] || "").trim();
    const normalized = value.replace(/\$\{[^}]+\}/g, "0");
    if (normalized.startsWith("/api/")) out.add((normalized.split("?")[0] || normalized).trim());
  }
  return Array.from(out);
}

function auditFile(filePath: string, frontendRoutes: string[], apiPrefixes: string[]): FileAudit {
  const abs = path.join(repoRoot, filePath);
  const source = fs.readFileSync(abs, "utf8");
  const routes = extractRouteTargets(source).map((target) => {
    const matchedRoute = routeMatches(target, frontendRoutes);
    return { target, valid: Boolean(matchedRoute), matchedRoute };
  });
  const apis = extractApiTargets(source).map((target) => {
    const matchedPrefix = apiPrefixes.find((prefix) => target === prefix || target.startsWith(`${prefix}/`)) || null;
    return { target, valid: Boolean(matchedPrefix), matchedPrefix };
  });
  return { file: filePath, routes, apis };
}

function main() {
  const appSource = fs.readFileSync(appFile, "utf8");
  const routesSource = fs.readFileSync(routesFile, "utf8");
  const frontendRoutes = parseFrontendRoutes(appSource);
  const apiPrefixes = parseApiPrefixes(routesSource);

  const files = targetFiles.map((file) => auditFile(file, frontendRoutes, apiPrefixes));
  const unresolvedRoutes = files.flatMap((f) => f.routes.filter((r) => !r.valid).map((r) => ({ file: f.file, target: r.target })));
  const unresolvedApis = files.flatMap((f) => f.apis.filter((r) => !r.valid).map((r) => ({ file: f.file, target: r.target })));

  const navSource = fs.readFileSync(path.join(repoRoot, "client/src/components/agentic/AppProBottomNav.tsx"), "utf8");
  const navItemsCount = (navSource.match(/key:\s*\"/g) || []).length;

  const output = {
    generatedAt: new Date().toISOString(),
    navItemsCount,
    checks: {
      noDeadRoutes: unresolvedRoutes.length === 0,
      noDeadApis: unresolvedApis.length === 0,
      threeTabsExact: navItemsCount === 3,
    },
    frontendRoutesCount: frontendRoutes.length,
    apiPrefixCount: apiPrefixes.length,
    files,
    unresolvedRoutes,
    unresolvedApis,
  };

  ensureDir(reportsDir);
  const jsonPath = path.join(reportsDir, "pro-app-tap-audit.json");
  const mdPath = path.join(reportsDir, "pro-app-tap-audit.md");
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), "utf8");

  const md = [
    "# Pro App Dead Tap Audit",
    "",
    `Generated: ${output.generatedAt}`,
    `Bottom nav items: ${output.navItemsCount}`,
    "",
    `- No dead routes: ${output.checks.noDeadRoutes ? "PASS" : "FAIL"}`,
    `- No dead APIs: ${output.checks.noDeadApis ? "PASS" : "FAIL"}`,
    `- Exactly three tabs: ${output.checks.threeTabsExact ? "PASS" : "FAIL"}`,
    "",
    "## Unresolved Routes",
    ...(
      unresolvedRoutes.length
        ? unresolvedRoutes.map((item) => `- ${item.file}: \`${item.target}\``)
        : ["- None"]
    ),
    "",
    "## Unresolved APIs",
    ...(
      unresolvedApis.length
        ? unresolvedApis.map((item) => `- ${item.file}: \`${item.target}\``)
        : ["- None"]
    ),
  ].join("\n");
  fs.writeFileSync(mdPath, md, "utf8");

  console.log(`wrote ${jsonPath}`);
  console.log(`wrote ${mdPath}`);

  if (!output.checks.noDeadRoutes || !output.checks.noDeadApis || !output.checks.threeTabsExact) {
    process.exitCode = 1;
  }
}

main();
