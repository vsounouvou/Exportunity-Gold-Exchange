import { Router } from "express";
import fs from "fs";
import path from "path";
import { ensureTenantAdmin } from "./utils/auth";

const router = Router();
const serverStartedAt = new Date().toISOString();
let cacheBuster = String(Date.now());

function bumpCacheBuster() {
  cacheBuster = String(Date.now());
  return cacheBuster;
}

function normalizeGitSha(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (/^[0-9a-f]{7,40}$/i.test(value)) return value.slice(0, 12);
  return value;
}

function readGitSha(): string | null {
  const envSha = normalizeGitSha(
    process.env.GIT_SHA ||
      process.env.RENDER_GIT_COMMIT ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.COMMIT_SHA ||
      null,
  );
  if (envSha) return envSha;

  try {
    const repoRoot = process.cwd();
    const headPath = path.join(repoRoot, ".git", "HEAD");
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.replace(/^ref:\s+/, "").trim();
      const refPath = path.join(repoRoot, ".git", ref);
      const sha = fs.readFileSync(refPath, "utf8").trim();
      return normalizeGitSha(sha);
    }
    return normalizeGitSha(head);
  } catch {
    return null;
  }
}

function pickBuildId(): string | null {
  const envBuild =
    process.env.BUILD_ID ||
    process.env.DEPLOYMENT_ID ||
    process.env.RENDER_INSTANCE_ID ||
    null;
  return envBuild ? String(envBuild) : null;
}

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function parseFlag(value: unknown, defaultValue: boolean) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

function findClientPublicDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(process.cwd(), "client", "public"),
    path.resolve(process.cwd(), "public"),
  ];

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "index.html"))) return dir;
    } catch {
      // ignore
    }
  }
  return null;
}

function parseAssetPathFromIndexHtml(html: string, ext: "js" | "css") {
  const re = new RegExp(`(?:\\.\\/|\\/)?assets\\/[^\"']+\\.${ext}`, "i");
  const match = html.match(re);
  if (!match) return null;
  return match[0].replace(/^\//, "").replace(/^\.\//, "");
}

function parseConfigBuildInfo(text: string) {
  const pick = (key: string) => {
    const re = new RegExp(`__EXPORTUNITY_CONFIG__\\.${key}\\s*=\\s*["']([^"']+)["']`);
    const match = text.match(re);
    return match?.[1] ?? null;
  };

  return {
    buildId: pick("buildId"),
    builtAt: pick("builtAt") ?? pick("buildTime"),
    gitSha: pick("gitSha"),
  };
}

function readClientBuildMeta(publicDir: string) {
  try {
    const buildPath = path.join(publicDir, "build.json");
    if (!fs.existsSync(buildPath)) return { ok: false, missing: true };
    const raw = fs.readFileSync(buildPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ok: true, value: parsed };
  } catch (err: any) {
    return { ok: false, missing: false, message: err?.message || "unable to read build.json" };
  }
}

function readClientFingerprint() {
  const enabled = truthyEnv(process.env.SYSTEM_VERSION_INCLUDE_CLIENT || "true");
  if (!enabled) return null;

  const publicDir = findClientPublicDir();
  if (!publicDir) return { ok: false, message: "client public dir not found" };

  try {
    const indexPath = path.join(publicDir, "index.html");
    const indexHtml = fs.readFileSync(indexPath, "utf8");
    const indexStat = fs.statSync(indexPath);

    const mainJsRel = parseAssetPathFromIndexHtml(indexHtml, "js");
    const mainCssRel = parseAssetPathFromIndexHtml(indexHtml, "css");

    const statOrNull = (relativePath: string | null) => {
      if (!relativePath) return null;
      try {
        const stat = fs.statSync(path.join(publicDir, relativePath));
        return { path: relativePath, size: stat.size, mtime: stat.mtime.toISOString() };
      } catch {
        return { path: relativePath, size: null, mtime: null };
      }
    };

    const swInfo = (() => {
      try {
        const swPath = path.join(publicDir, "sw.js");
        const text = fs.readFileSync(swPath, "utf8");
        const stat = fs.statSync(swPath);
        const versionMatch = text.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/);
        return { version: versionMatch?.[1] ?? null, mtime: stat.mtime.toISOString(), size: stat.size };
      } catch {
        return null;
      }
    })();

    const configInfo = (() => {
      try {
        const configPath = path.join(publicDir, "config.js");
        const text = fs.readFileSync(configPath, "utf8");
        const stat = fs.statSync(configPath);
        const build = parseConfigBuildInfo(text);
        return { mtime: stat.mtime.toISOString(), size: stat.size, build };
      } catch {
        return null;
      }
    })();

    const buildInfo = readClientBuildMeta(publicDir);

    return {
      ok: true,
      indexHtml: { size: indexStat.size, mtime: indexStat.mtime.toISOString() },
      mainJs: statOrNull(mainJsRel),
      mainCss: statOrNull(mainCssRel),
      sw: swInfo,
      config: configInfo,
      build: buildInfo,
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || "unable to read client fingerprint" };
  }
}

function readServerBundleFingerprint() {
  const candidates = [
    path.resolve(process.cwd(), "dist", "index.js"),
    path.resolve(process.cwd(), "server", "index.ts"),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      return { ok: true, size: stat.size, mtime: stat.mtime.toISOString(), file: path.basename(filePath) };
    } catch {
      // ignore
    }
  }
  return null;
}

router.get("/version", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  const client = readClientFingerprint();
  const clientBuild =
    (client as any)?.build?.ok && (client as any)?.build?.value
      ? (client as any).build.value
      : null;

  // Use the deployed client build.json as a fallback so prod can still report
  // build metadata even when .git is not present in the container build context.
  const serverGitSha = String(readGitSha() || clientBuild?.gitSha || "unknown");
  const serverBuildId = String(pickBuildId() || clientBuild?.buildId || "unknown");
  const versionGuardEnabled = parseFlag(process.env.VERSION_GUARD_ENABLED, true);
  const serverBundle = readServerBundleFingerprint();
  const buildTime =
    (serverBundle as any)?.ok && (serverBundle as any)?.mtime
      ? String((serverBundle as any).mtime)
      : clientBuild?.builtAt ?? clientBuild?.buildTime ?? null;

  res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    serverStartedAt,
    nodeEnv: process.env.NODE_ENV || "unknown",
    nodeVersion: process.version,
    gitSha: serverGitSha,
    build: serverBuildId,
    buildId: serverBuildId,
    versionGuardEnabled,
    cacheBuster,
    serverBundle,
    client,
    clientBuild: clientBuild
      ? {
          buildId: clientBuild.buildId ?? null,
          gitSha: clientBuild.gitSha ?? null,
          builtAt: clientBuild.builtAt ?? clientBuild.buildTime ?? null,
        }
      : null,
    clientBuildMissing: (client as any)?.build?.missing === true,
    buildMismatch:
      !!clientBuild &&
      (String(clientBuild.buildId ?? "") !== serverBuildId || String(clientBuild.gitSha ?? "") !== serverGitSha),
    // Compatibility for runbooks / external monitors
    commit: serverGitSha,
    build_time: buildTime,
    env: process.env.NODE_ENV || "unknown",
  });
});

router.get("/env-check", ensureTenantAdmin, (_req, res) => {
  const present = (key: string) => !!String(process.env[key] || "").trim();
  const sandboxModeRaw = String(process.env.TWILIO_SANDBOX_MODE || "").trim().toLowerCase();
  const sandboxMode = ["1", "true", "yes", "y", "on"].includes(sandboxModeRaw);

  const statusCallbackBaseUrlPresent =
    present("TWILIO_STATUS_CALLBACK_BASE_URL") || present("PUBLIC_BASE_URL") || present("TWILIO_APP_BASE_URL");

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.json({
    ok: true,
    twilio: {
      account_sid_present: present("TWILIO_ACCOUNT_SID"),
      auth_token_present: present("TWILIO_AUTH_TOKEN"),
      whatsapp_from_present: present("TWILIO_WHATSAPP_FROM"),
      sms_from_present: present("TWILIO_SMS_FROM"),
      messaging_service_sid_present: present("TWILIO_MESSAGING_SERVICE_SID"),
      voice_from_present: present("TWILIO_VOICE_FROM"),
      verify_service_sid_present: present("TWILIO_VERIFY_SERVICE_SID"),
      status_callback_base_url_present: statusCallbackBaseUrlPresent,
      webhook_path_present: present("TWILIO_WEBHOOK_PATH"),
      sandbox_mode: sandboxMode,
      webhook_signing_secret_present:
        present("TWILIO_WEBHOOK_SIGNING_SECRET") || present("TWILIO_WEBHOOK_SECRET") || present("TWILIO_AUTH_TOKEN"),
    },
  });
});

router.get("/cache-reset", (req, res) => {
  const fetchSite = String(req.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site") {
    return res.status(400).json({ ok: false, message: "cross-site not allowed" });
  }

  const nextBuster = bumpCacheBuster();
  const mode = String(req.query?.mode || "").trim().toLowerCase();
  const from = String(req.query?.from || "").trim().toLowerCase();
  const preserveStorage = mode === "soft" || from === "version-guard";

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const accept = String(req.get("accept") || "").toLowerCase();
  const wantsHtml = accept.includes("text/html") && !accept.includes("application/json");
  if (!wantsHtml) {
    return res.json({
      ok: true,
      mode: preserveStorage ? "soft" : "hard",
      cacheBuster: nextBuster,
      serverTime: new Date().toISOString(),
    });
  }

  if (preserveStorage) {
    res.setHeader("Clear-Site-Data", "\"cache\"");
  } else {
    res.setHeader("Clear-Site-Data", "\"cache\", \"cookies\", \"storage\"");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Resetting…</title>
    <style>
      body{margin:0;background:#0b1117;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}
      .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
      .card{width:100%;max-width:720px;border:1px solid rgba(255,255,255,.12);background:rgba(17,24,39,.65);backdrop-filter:blur(14px);border-radius:16px;padding:18px}
      h1{margin:0 0 8px 0;font-size:18px;color:#fff}
      p{margin:0 0 10px 0;font-size:13px;color:rgba(255,255,255,.72)}
      pre{margin:0;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.35);border-radius:12px;padding:10px;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.35;max-height:44vh;overflow:auto}
      .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
      button,a{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;border-radius:12px;padding:10px 12px;font-size:13px;text-decoration:none;cursor:pointer}
      button.primary{background:#f59e0b;border-color:#f59e0b;color:#111827;font-weight:700}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Resetting cache…</h1>
        <p>This clears service worker + cached assets and reloads the app. If your updates are stuck, this fixes it.</p>
        <pre id="log">starting…</pre>
        <div class="row">
          <button id="go" class="primary" style="display:none">Open app</button>
          <a href="/qa-mobile" target="_blank" rel="noreferrer">QA diagnostics</a>
        </div>
      </div>
    </div>
    <script>
      (function(){
        const preserveStorage = ${preserveStorage ? "true" : "false"};
        const logEl = document.getElementById("log");
        const log = (msg) => {
          try { logEl.textContent += "\\n" + msg; } catch {}
        };
        const done = () => {
          const go = document.getElementById("go");
          go.style.display = "";
          go.onclick = () => location.replace("/?v=${nextBuster}");
          setTimeout(() => location.replace("/?v=${nextBuster}"), 700);
        };
        (async () => {
          try {
            if (preserveStorage) {
              log("preserve local/session storage (soft mode)");
            } else {
              log("clear local/session storage");
              try { localStorage.clear(); } catch {}
              try { sessionStorage.clear(); } catch {}
            }

            log("unregister service workers");
            try {
              if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
              }
            } catch {}

            log("delete cache storage");
            try {
              if ("caches" in window && caches.keys) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
            } catch {}

            log("cacheBuster=${nextBuster}");
            log("done");
          } catch (e) {
            log("reset failed: " + (e && e.message ? e.message : String(e)));
          } finally {
            done();
          }
        })();
      })();
    </script>
  </body>
</html>`);
});

export default router;
