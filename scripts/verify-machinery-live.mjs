const BASE_URL = (process.env.LIVE_BASE_URL || "https://exportunity.net").replace(/\/+$/, "");

async function fetchText(path, init) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, init);
  const text = await res.text();
  return { url, res, text };
}

function head(text, max = 140) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max) + "…";
}

function push(checks, name, ok, detail) {
  checks.push({ name, ok, detail: detail ?? "" });
}

function print(check) {
  const prefix = check.ok ? "OK " : "BAD";
  console.log(`${prefix} ${check.name}: ${check.detail}`);
}

async function main() {
  const checks = [];

  // Version (proves deploy/commit)
  {
    const { url, res, text } = await fetchText("/api/system/version", { headers: { accept: "application/json" } });
    push(checks, "/api/system/version status", res.status === 200, `${res.status} ${url}`);

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      push(checks, "/api/system/version json", false, head(text));
    }

    if (json) {
      push(checks, "/api/system/version ok", json.ok === true, head(text));
      push(
        checks,
        "/api/system/version buildId",
        Boolean(json.buildId),
        `buildId=${json.buildId ?? "?"} gitSha=${json.gitSha ?? "?"} startedAt=${json.serverStartedAt ?? "?"}`,
      );
    }
  }

  // /machinery is reachable and noindex is enforced (header + meta)
  {
    const { url, res, text } = await fetchText("/machinery", { headers: { accept: "text/html" } });
    const xRobots = res.headers.get("x-robots-tag") || "";
    const robotsMeta = text.match(/<meta[^>]+name="robots"[^>]+>/i)?.[0] ?? "";

    push(checks, "/machinery status", res.status === 200, `${res.status} ${url}`);
    push(checks, "/machinery X-Robots-Tag", /noindex/i.test(xRobots), xRobots || "(missing)");
    push(checks, "/machinery meta robots", /noindex/i.test(robotsMeta), robotsMeta || "(missing)");
  }

  // robots.txt disallows /machinery and /manufacturing
  {
    const { url, res, text } = await fetchText("/robots.txt", { headers: { accept: "text/plain" } });
    push(checks, "/robots.txt status", res.status === 200, `${res.status} ${url}`);
    push(checks, "/robots.txt disallow /machinery", /Disallow:\s*\/machinery/i.test(text), head(text));
    push(checks, "/robots.txt disallow /manufacturing", /Disallow:\s*\/manufacturing/i.test(text), head(text));
  }

  // sitemap.xml should not include private routes
  {
    const { url, res, text } = await fetchText("/sitemap.xml", { headers: { accept: "application/xml" } });
    push(checks, "/sitemap.xml status", res.status === 200, `${res.status} ${url}`);
    push(checks, "/sitemap.xml excludes /machinery", !/\/machinery\b/i.test(text), head(text));
    push(checks, "/sitemap.xml excludes /manufacturing", !/\/manufacturing\b/i.test(text), head(text));
  }

  // Proxies are auth-gated (without token should be 401/403/404)
  {
    const { url, res, text } = await fetchText("/api/internal/engineering/ui-access", {
      headers: { accept: "application/json" },
    });
    const ok = res.status === 401 || res.status === 403 || res.status === 404;
    push(checks, "/api/internal/engineering/ui-access unauth", ok, `${res.status} ${url} ${head(text)}`);
  }

  // Internal endpoints remain key-gated (no key => 403; if key missing => 503)
  {
    const { url, res, text } = await fetchText("/engineering/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    push(checks, "/engineering/intent without key", res.status === 403 || res.status === 503, `${res.status} ${url} ${head(text)}`);
  }

  for (const c of checks) print(c);

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error(`FAILED: ${failed.length} checks`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

