#!/usr/bin/env node
import fs from "fs";
import path from "path";

const DEFAULT_HOSTS = [
  "boursedelor.com",
  "maisonenterre.com",
  "houseofzogue.com",
  "vitalsounouvou.com",
  "mindbase.cloud",
  "exportunity.net",
  "rayon1km.com",
  "zogueland.com",
];

function parseArgs(argv) {
  const hosts = [];
  let outDir = "artifacts/smoke";
  for (let i = 2; i < argv.length; i += 1) {
    const token = String(argv[i] || "").trim();
    if (!token) continue;
    if (token === "--host" && argv[i + 1]) {
      hosts.push(String(argv[i + 1]).trim());
      i += 1;
      continue;
    }
    if (token.startsWith("--host=")) {
      hosts.push(token.slice("--host=".length).trim());
      continue;
    }
    if (token === "--out" && argv[i + 1]) {
      outDir = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token.startsWith("--out=")) {
      outDir = token.slice("--out=".length).trim();
      continue;
    }
  }
  return {
    hosts: hosts.length ? hosts : DEFAULT_HOSTS,
    outDir,
  };
}

function headerValue(headers, key) {
  return String(headers.get(key) || "").trim();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    return { ok: false, status: res.status, statusText: res.statusText, url };
  }
  return { ok: true, value: await res.json(), headers: Object.fromEntries(res.headers.entries()) };
}

async function fetchHeaders(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries()),
  };
}

function summarizeHost(host, buildJson, versionJson, indexHeaders, swHeaders, mainJsHeaders) {
  const build = String(buildJson?.value?.build || "").trim();
  const buildId = String(buildJson?.value?.buildId || "").trim();
  const serverBuild = String(versionJson?.value?.build || versionJson?.value?.buildId || "").trim();
  const mainJsPath = String(buildJson?.value?.mainJs?.path || "").trim();

  const indexCacheControl = headerValue(new Headers(indexHeaders.headers || {}), "cache-control");
  const swCacheControl = headerValue(new Headers(swHeaders.headers || {}), "cache-control");
  const mainJsCacheControl = headerValue(new Headers(mainJsHeaders.headers || {}), "cache-control");

  const checks = {
    buildParity: Boolean(build && buildId && serverBuild && build === buildId && build === serverBuild),
    indexNoStore: /no-store/i.test(indexCacheControl),
    swNoStore: /no-store|no-cache/i.test(swCacheControl),
    mainJsImmutable: /immutable/i.test(mainJsCacheControl),
  };

  return {
    host,
    urls: {
      buildJson: `https://${host}/build.json`,
      version: `https://${host}/api/system/version`,
      index: `https://${host}/index.html`,
      sw: `https://${host}/sw.js`,
      mainJs: mainJsPath ? `https://${host}/${mainJsPath.replace(/^\/+/, "")}` : null,
    },
    build: {
      build,
      buildId,
      gitSha: String(buildJson?.value?.gitSha || "").trim() || null,
    },
    server: {
      build: serverBuild || null,
      buildId: String(versionJson?.value?.buildId || "").trim() || null,
      gitSha: String(versionJson?.value?.gitSha || "").trim() || null,
      versionGuardEnabled: versionJson?.value?.versionGuardEnabled ?? null,
    },
    headers: {
      indexCacheControl,
      swCacheControl,
      mainJsCacheControl,
    },
    checks,
    ok: Object.values(checks).every(Boolean),
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push(`# Multi-tenant version smoke (${report.generatedAt})`);
  lines.push("");
  lines.push(`Overall: **${report.ok ? "PASS" : "FAIL"}**`);
  lines.push("");
  for (const host of report.hosts) {
    lines.push(`## ${host.host}`);
    lines.push(`- Result: **${host.ok ? "PASS" : "FAIL"}**`);
    lines.push(`- Build parity: \`${host.build.build}\` / \`${host.build.buildId}\` / server \`${host.server.build}\``);
    lines.push(`- index cache-control: \`${host.headers.indexCacheControl || "-"}\``);
    lines.push(`- sw cache-control: \`${host.headers.swCacheControl || "-"}\``);
    lines.push(`- mainJs cache-control: \`${host.headers.mainJsCacheControl || "-"}\``);
    lines.push("");
  }
  return lines.join("\n");
}

async function run() {
  const { hosts, outDir } = parseArgs(process.argv);
  const generatedAt = new Date().toISOString();
  const results = [];

  for (const host of hosts) {
    const base = `https://${host}`;
    try {
      const buildJson = await fetchJson(`${base}/build.json?v=${Date.now()}`);
      const versionJson = await fetchJson(`${base}/api/system/version?v=${Date.now()}`);
      const indexHeaders = await fetchHeaders(`${base}/index.html?v=${Date.now()}`);
      const swHeaders = await fetchHeaders(`${base}/sw.js?v=${Date.now()}`);

      let mainJsHeaders = { ok: false, status: 0, statusText: "missing mainJs", headers: {} };
      const mainJsPath = String(buildJson?.value?.mainJs?.path || "").trim();
      if (mainJsPath) {
        mainJsHeaders = await fetchHeaders(`${base}/${mainJsPath.replace(/^\/+/, "")}`);
      }

      results.push(summarizeHost(host, buildJson, versionJson, indexHeaders, swHeaders, mainJsHeaders));
    } catch (error) {
      results.push({
        host,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report = {
    generatedAt,
    hosts: results,
    ok: results.every((entry) => entry && entry.ok),
  };

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = String(Date.now());
  const jsonPath = path.join(outDir, `multi-tenant-version-smoke-${stamp}.json`);
  const mdPath = path.join(outDir, `multi-tenant-version-smoke-${stamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, `${toMarkdown(report)}\n`, "utf8");

  console.log(JSON.stringify({ ok: report.ok, jsonPath, mdPath }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
