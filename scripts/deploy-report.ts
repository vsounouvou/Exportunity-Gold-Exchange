import fs from "fs";
import path from "path";

type VersionJson = {
  ok?: boolean;
  serverTime?: string;
  nodeEnv?: string;
  gitSha?: string | null;
  buildId?: string | null;
  cacheBuster?: string | null;
  clientBuild?: { buildId?: string | null; gitSha?: string | null; builtAt?: string | null } | null;
  clientBuildMissing?: boolean;
  buildMismatch?: boolean;
};

type BuildJson = {
  buildId?: string | null;
  gitSha?: string | null;
  builtAt?: string | null;
  mainJs?: { path?: string | null };
  mainCss?: { path?: string | null };
  sw?: string | null;
};

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

async function fetchJson<T>(baseUrl: string, pathname: string): Promise<T> {
  const url = new URL(pathname, baseUrl);
  url.searchParams.set("v", String(Date.now()));
  const res = await fetch(url.toString(), {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) {
    throw new Error(`${pathname} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

async function fetchCacheControl(baseUrl: string, pathname: string): Promise<string> {
  const url = new URL(pathname, baseUrl);
  url.searchParams.set("v", String(Date.now()));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) return `ERROR ${res.status}`;
  return res.headers.get("cache-control") || "";
}

async function main() {
  const baseUrl = argValue("--baseUrl") || process.env.E2E_BASE_URL || "https://boursedelor.com";
  const resultsDir = argValue("--resultsDir") || process.env.E2E_OUTPUT_DIR || "test-results";
  const outFile = argValue("--out") || `deploy-report-${Date.now()}.md`;

  const version = await fetchJson<VersionJson>(baseUrl, "/api/system/version");
  const build = await fetchJson<BuildJson>(baseUrl, "/build.json");

  const parityOk =
    !!version.ok &&
    nonEmpty(version.buildId) &&
    nonEmpty(version.gitSha) &&
    !!version.clientBuild &&
    nonEmpty(version.clientBuild.buildId) &&
    nonEmpty(version.clientBuild.gitSha) &&
    String(version.buildId) === String(version.clientBuild.buildId) &&
    String(version.gitSha) === String(version.clientBuild.gitSha) &&
    String(build.buildId) === String(version.buildId) &&
    String(build.gitSha) === String(version.gitSha);

  const indexCache = await fetchCacheControl(baseUrl, "/");
  const swCache = await fetchCacheControl(baseUrl, "/sw.js");
  const buildCache = await fetchCacheControl(baseUrl, "/build.json");
  const mainJsPath = build.mainJs?.path ? `/${String(build.mainJs.path).replace(/^\/+/, "")}` : null;
  const mainJsCache = mainJsPath ? await fetchCacheControl(baseUrl, mainJsPath) : "";

  const files = walkFiles(resultsDir);
  const screenshots = files
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b));

  const routesTested = [
    "/admin",
    "/zone",
    "/app",
    "/app/join/seller",
    "/debug/location",
    "/marketplace/sellers/269",
    "/territories?fresh=1",
  ];

  const lines: string[] = [];
  lines.push("# Deployment Proof");
  lines.push("");
  lines.push(`- Base URL: \`${baseUrl}\``);
  lines.push(`- Generated at: \`${new Date().toISOString()}\``);
  lines.push("");
  lines.push("## Build Parity");
  lines.push("");
  lines.push(`- Status: **${parityOk ? "PASS" : "FAIL"}**`);
  lines.push(`- Server build: \`${version.gitSha ?? "null"}\` / \`${version.buildId ?? "null"}\``);
  lines.push(
    `- Client build (server): \`${version.clientBuild?.gitSha ?? "null"}\` / \`${version.clientBuild?.buildId ?? "null"}\``,
  );
  lines.push(`- Client build.json: \`${build.gitSha ?? "null"}\` / \`${build.buildId ?? "null"}\``);
  lines.push(`- cacheBuster: \`${version.cacheBuster ?? "null"}\``);
  lines.push(`- clientBuildMissing: \`${String((version as any).clientBuildMissing ?? false)}\``);
  lines.push(`- buildMismatch: \`${String((version as any).buildMismatch ?? false)}\``);
  lines.push("");
  lines.push("## Cache Headers");
  lines.push("");
  lines.push(`- / (index.html): \`${indexCache}\``);
  lines.push(`- /sw.js: \`${swCache}\``);
  lines.push(`- /build.json: \`${buildCache}\``);
  if (mainJsPath) lines.push(`- ${mainJsPath}: \`${mainJsCache}\``);
  lines.push("");
  lines.push("## Routes Tested");
  lines.push("");
  for (const r of routesTested) lines.push(`- \`${r}\``);
  lines.push("");
  lines.push("## Screenshots");
  lines.push("");
  if (screenshots.length === 0) {
    lines.push("- (none found)");
  } else {
    for (const p of screenshots) lines.push(`- \`${path.relative(process.cwd(), p)}\``);
  }
  lines.push("");
  lines.push("## Raw JSON");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify({ version, build }, null, 2));
  lines.push("```");
  lines.push("");

  ensureDir(path.dirname(outFile) === "." ? process.cwd() : path.dirname(outFile));
  fs.writeFileSync(outFile, lines.join("\n"), "utf8");
  console.log(`[deploy-report] wrote ${outFile}`);
  if (!parityOk) process.exitCode = 2;
}

main().catch((err) => {
  console.error("[deploy-report] failed:", err);
  process.exit(1);
});
