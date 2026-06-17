import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import viteConfig from "../vite.config";
import { injectSeoHead, resolveSeoHead } from "./lib/seo/runtimeSeo";
import { requireClientBuild } from "./deployGuard";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        if (
          msg.includes("[TypeScript] Found 0 errors. Watching for file changes")
        ) {
          log("no errors found", "tsc");
          return;
        }

        if (msg.includes("[TypeScript] ")) {
          const [errors, summary] = msg.split("[TypeScript] ", 2);
          log(`${summary} ${errors}\u001b[0m`, "tsc");
          return;
        } else {
          viteLogger.error(msg, options);
          process.exit(1);
        }
      },
    },
    server: {
      middlewareMode: true,
      hmr: { server },
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  const indexHtmlPath = path.resolve(distPath, "index.html");
  let indexTemplate: string | null = null;

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // HARD RULE: Production server must not start without a valid build.json.
  app.locals.clientBuild = requireClientBuild(distPath);

  // Explicit alias for browsers/third-party defaults that request /service-worker.js.
  app.get("/service-worker.js", (_req, res) => {
    const swPath = path.join(distPath, "sw.js");
    if (!fs.existsSync(swPath)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      return res.status(404).type("text/plain").send("service worker missing");
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Service-Worker-Allowed", "/");
    return res.sendFile(swPath);
  });

  app.use(
    express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        const normalized = filePath.replace(/\\/g, "/");

        // Avoid caching the HTML shell so deploys propagate instantly.
        if (normalized.endsWith("/index.html")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
          return;
        }

        // Runtime config must always be fresh (controls API base URL).
        if (normalized.endsWith("/config.js")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
          return;
        }

        // Build metadata must be fresh (used for version parity checks).
        if (normalized.endsWith("/build.json")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          return;
        }

        // SW + manifest should revalidate frequently (they control updates).
        if (normalized.endsWith("/sw.js") || normalized.endsWith("/service-worker.js")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
          res.setHeader("Service-Worker-Allowed", "/");
          return;
        }

        // Favicons should not be aggressively cached (branding must update promptly).
        if (
          normalized.endsWith("/favicon.ico") ||
          normalized.endsWith("/favicon.svg") ||
          normalized.endsWith("/favicon.png") ||
          /\/favicon[^/]*\.(?:ico|png|svg)$/i.test(normalized)
        ) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
          return;
        }

        if (normalized.endsWith(".webmanifest")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
          res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
          return;
        }

        // Hashed build assets can be cached aggressively.
        if (normalized.includes("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }

        // Reasonable default for static files.
        res.setHeader("Cache-Control", "public, max-age=3600");
      },
    }),
  );

  // Backward compatibility for older builds that referenced runtime files via relative paths
  // (e.g. "./config.js" would resolve to "/app/join/config.js" on deep links).
  const redirectNestedRuntimeFiles = (filename: string) => {
    const escaped = filename.replace(/\./g, "\\.");
    app.get(new RegExp(`/.+/${escaped}$`), (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.redirect(302, `/${filename}`);
    });
  };

  redirectNestedRuntimeFiles("config.js");
  redirectNestedRuntimeFiles("build.json");
  redirectNestedRuntimeFiles("sw.js");
  redirectNestedRuntimeFiles("service-worker.js");
  redirectNestedRuntimeFiles("manifest.webmanifest");

  // If a request targets a hashed build asset that no longer exists (common after a deploy),
  // do NOT serve index.html (HTML). That breaks dynamic imports with confusing errors.
  // Instead, return a tiny JS module that forces a cache reset + reload.
  app.use("/assets", (req, res, next) => {
    const pathname = String(req.path || "");
    const ext = path.extname(pathname).toLowerCase();

    // Only intercept JS module chunk requests; let other missing assets return 404.
    if (ext !== ".js" && ext !== ".mjs") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.status(404).type("text/plain").send("asset not found");
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");

    return res.status(200).send(`// Auto-recovery module for missing build chunk: ${pathname}
// This happens when a client has an old cached build after a deploy.
const key = "ece_missing_chunk_attempts";
try {
  const attempts = Number(sessionStorage.getItem(key) || "0");
  if (Number.isFinite(attempts) && attempts < 1) {
    sessionStorage.setItem(key, String(attempts + 1));
    window.location.replace("/api/system/cache-reset?from=missing-chunk");
  }
} catch {}

export default function MissingChunk() { return null; }
`);
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req: any, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

    if (!indexTemplate) {
      try {
        indexTemplate = await fs.promises.readFile(indexHtmlPath, "utf-8");
      } catch {
        return res.status(500).send("index.html missing");
      }
    }

    const env = String(process.env.APP_ENV || process.env.NODE_ENV || "prod").trim().toLowerCase();
    const normalizedEnv = env === "production" ? "prod" : env === "development" ? "dev" : env || "prod";
    const hostHeader = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    const host = hostHeader.split(",")[0]?.trim() || "localhost";
    const url = new URL(req.originalUrl || "/", `http://${host}`);

    // Private routes must not be indexed (defense-in-depth: header + meta).
    if (url.pathname === "/machinery" || url.pathname === "/manufacturing") {
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    }

    const head = await resolveSeoHead({
      tenant: req.tenant
        ? { id: req.tenant.id, key: req.tenant.key, name: req.tenant.name, featureFlags: req.tenant.featureFlags ?? {} }
        : null,
      env: normalizedEnv,
      host,
      pathname: url.pathname,
      search: url.search,
    });

    const page = injectSeoHead(indexTemplate, head);
    res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).end(page);
  });
}
