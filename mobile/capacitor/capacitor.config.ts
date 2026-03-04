import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.boursedelor.app",
  appName: "Bourse de l'Or",
  webDir: "www",
  bundledWebRuntime: false,

  // Fastest path: load the production web app.
  // For store builds you can remove this and bundle into `webDir`.
  server: {
    url: "https://boursedelor.com",
    cleartext: false,
  },
};

export default config;

