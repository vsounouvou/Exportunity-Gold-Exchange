import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const buildAppName = String(
  process.env.APP_NAME || process.env.DEPLOY_TENANT || process.env.TENANT_DEFAULT || "",
)
  .trim()
  .toLowerCase();

function exportunityIndexIsolationPlugin() {
  return {
    name: "exportunity-index-isolation",
    enforce: "post" as const,
    transformIndexHtml(html: string) {
      if (buildAppName !== "exportunity") return html;

      const description =
        "Exportunity connects industrial demand to verified sourcing, manufacturing, quality control, logistics, and export readiness across Africa.";
      const replacements: Array<[RegExp, string]> = [
        [/<html lang="fr">/, '<html lang="en">'],
        [/<title>Platform<\/title>/, "<title>Exportunity | Global Trade Network</title>"],
        [
          /<meta\s+name="description"\s+content="Tenant platform\."\s*\/>/,
          `<meta name="description" content="${description}" />`,
        ],
        [/<meta id="theme-color" name="theme-color" content="#0B0B0D"\s*\/>/, '<meta id="theme-color" name="theme-color" content="#07111F" />'],
        [/<meta name="apple-mobile-web-app-title" content="Platform"\s*\/>/, '<meta name="apple-mobile-web-app-title" content="Exportunity" />'],
        [/<link id="manifest-link" rel="manifest" href="\/manifest\.webmanifest"\s*\/>/, '<link id="manifest-link" rel="manifest" href="/manifest-exportunity.webmanifest" />'],
        [/<link id="apple-touch-icon" rel="apple-touch-icon" href="\/favicon\.svg"\s*\/>/, '<link id="apple-touch-icon" rel="apple-touch-icon" href="/tenants/exportunity/official/favicon-256.png" />'],
        [/<link id="favicon-32" rel="icon" type="image\/svg\+xml" sizes="32x32" href="\/favicon\.svg"\s*\/>/, '<link id="favicon-32" rel="icon" type="image/png" sizes="32x32" href="/tenants/exportunity/official/favicon-64.png" />'],
        [/<link id="favicon-16" rel="icon" type="image\/svg\+xml" sizes="16x16" href="\/favicon\.svg"\s*\/>/, '<link id="favicon-16" rel="icon" type="image/png" sizes="16x16" href="/tenants/exportunity/official/favicon-64.png" />'],
        [/<link id="favicon-ico" rel="icon" href="\/favicon\.ico" sizes="any"\s*\/>/, '<link id="favicon-ico" rel="icon" href="/tenants/exportunity/official/favicon.ico" sizes="any" />'],
        [/<link id="favicon-svg" rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"\s*\/>/, '<link id="favicon-svg" rel="icon" href="/tenants/exportunity/official/favicon-64.png" type="image/png" />'],
        [/<meta property="og:title" content="Platform"\s*\/>/, '<meta property="og:title" content="Exportunity | Global Trade Network" />'],
        [/<meta property="og:description" content="Tenant platform\."\s*\/>/, `<meta property="og:description" content="${description}" />`],
        [/<meta property="og:image" content="\/favicon\.svg"\s*\/>/, '<meta property="og:image" content="/tenants/exportunity/industrial/machinery-team.png" />'],
        [/<meta name="twitter:title" content="Platform"\s*\/>/, '<meta name="twitter:title" content="Exportunity | Global Trade Network" />'],
        [/<meta name="twitter:description" content="Tenant platform\."\s*\/>/, `<meta name="twitter:description" content="${description}" />`],
        [/<meta name="twitter:image" content="\/favicon\.svg"\s*\/>/, '<meta name="twitter:image" content="/tenants/exportunity/industrial/machinery-team.png" />'],
        [/<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>/, ""],
      ];

      let isolated = html;
      for (const [pattern, replacement] of replacements) {
        if (!pattern.test(isolated)) {
          throw new Error(`Exportunity index isolation could not match ${pattern}`);
        }
        isolated = isolated.replace(pattern, replacement);
      }
      return isolated;
    },
  };
}

export default defineConfig({
  plugins: [react(), runtimeErrorOverlay(), themePlugin(), exportunityIndexIsolationPlugin()],
  define: {
    __BUILD_APP_NAME__: JSON.stringify(buildAppName),
    __BUILD_INCLUDE_SHARED_STOREFRONT__: JSON.stringify(buildAppName !== "exportunity"),
    __BUILD_INCLUDE_MINDBASE__: JSON.stringify(buildAppName === "" || buildAppName === "mindbase"),
    __BUILD_INCLUDE_OTHER_TENANT_UI__: JSON.stringify(buildAppName !== "exportunity"),
  },
  resolve: {
    alias: {
      "@db": path.resolve(__dirname, "db"),
      "@": path.resolve(__dirname, "client", "src"),
      "@tenants": path.resolve(__dirname, "tenants"),
      "@platform": path.resolve(__dirname, "client", "src", "platform"),
      "@pkg/ui": path.resolve(__dirname, "client", "src", "components", "ui"),
      "@pkg/branding": path.resolve(__dirname, "client", "src", "components", "branding"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
