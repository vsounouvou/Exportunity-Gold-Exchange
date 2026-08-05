import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT || process.env.PORT || "5000";
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${port}`;
const seedAdminEmail =
  process.env.E2E_ADMIN_EMAIL ||
  process.env.SEED_ADMIN_EMAIL ||
  "admin@exportunity.local";
const seedAdminPassword =
  process.env.E2E_ADMIN_PASSWORD ||
  process.env.SEED_ADMIN_PASSWORD ||
  "ChangeMe123!";

const shouldStartServer = !process.env.E2E_BASE_URL;
const webServerCommand =
  process.env.E2E_WEB_SERVER_COMMAND || "npm run dev";
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: process.env.E2E_OUTPUT_DIR || "test-results",
  timeout: 120000,
  expect: {
    timeout: 15000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        ...(chromiumExecutablePath
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {}),
      },
    },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: shouldStartServer
    ? {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240000,
        env: {
          PORT: port,
          NODE_ENV: "development",
          AUTO_SEED: "true",
          SEED_ADMIN_EMAIL: seedAdminEmail,
          SEED_ADMIN_PASSWORD: seedAdminPassword,
          E2E_OTP_DEBUG: "true",
          TWILIO_ACCOUNT_SID: "AC11111111111111111111111111111111",
          TWILIO_AUTH_TOKEN: "11111111111111111111111111111111",
          TWILIO_VERIFY_SERVICE_SID: "VA11111111111111111111111111111111",
          TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
        },
      }
    : undefined,
});
