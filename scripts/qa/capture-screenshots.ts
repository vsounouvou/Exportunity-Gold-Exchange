import { chromium, request, type APIRequestContext } from "@playwright/test";
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { adminEmail, adminPassword, loginAsAdmin } from "../../tests/e2e/utils";

const port = process.env.E2E_PORT || process.env.PORT || "5000";
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${port}`;
const webServerCommand = process.env.E2E_WEB_SERVER_COMMAND || "npm run dev";
const shouldStartServer = !process.env.E2E_BASE_URL;
const screenshotDir = path.join(process.cwd(), "docs", "qa", "screenshots");

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ignore until timeout
    }
    await delay(1000);
  }
  throw new Error(`Server did not become ready at ${url}`);
}

async function seedMessages(api: APIRequestContext, conversationId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await api.post(`/api/conversations/${conversationId}/messages`, {
      data: {
        content: `Scroll seed ${i + 1}`,
        senderType: "system",
        senderName: "System",
      },
    });
  }
}

async function main() {
  fs.mkdirSync(screenshotDir, { recursive: true });

  let serverProcess: ReturnType<typeof spawn> | null = null;
  if (shouldStartServer) {
    serverProcess = spawn(webServerCommand, {
      shell: true,
      env: {
        ...process.env,
        PORT: port,
        NODE_ENV: "development",
        AUTO_SEED: "true",
        SEED_ADMIN_EMAIL: adminEmail,
        SEED_ADMIN_PASSWORD: adminPassword,
      },
      stdio: "inherit",
    });
  }

  try {
    await waitForServer(new URL("/api/whoami", baseURL).toString(), 120000);

    const api = await request.newContext({ baseURL });
    const todayResp = await api.get("/api/conversations/chairman/today");
    const today = await todayResp.json();
    await seedMessages(api, today.id, 40);
    const imageGenResp = await api.post(`/api/conversations/${today.id}/messages`, {
      data: {
        content: "generate homepage miner image",
        senderType: "chairman",
        senderName: "Chairman",
      },
      timeout: 240000,
    });
    if (!imageGenResp.ok()) {
      throw new Error("Image generation failed");
    }
    const imageGenPayload = await imageGenResp.json();
    const assistantContent = imageGenPayload?.assistantMessage?.content || "";
    if (!assistantContent.startsWith("Done.")) {
      throw new Error(`Image generation failed: ${assistantContent || "Unknown error"}`);
    }

    const browser = await chromium.launch();
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);

    await loginAsAdmin(page);

    await page.goto("/admin/assets/images");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(screenshotDir, "admin-image-studio-nav.png"), fullPage: true });

    const homepagePanel = page.getByRole("heading", { name: "Homepage (Bourse)" }).locator("..").locator("..");
    await homepagePanel.scrollIntoViewIfNeeded();
    await homepagePanel.screenshot({ path: path.join(screenshotDir, "homepage-images-panel.png") });

    let openDockButton = page.locator("button.fixed.rounded-full");
    if ((await openDockButton.count()) === 0) {
      openDockButton = page.locator('button[class*="bg-gradient-to-br"]');
    }
    await openDockButton.first().waitFor({ state: "visible" });
    await openDockButton.first().click();
    await page.getByPlaceholder("Ask your assistant...").waitFor();

    const chatDock = page.locator("div.fixed.z-50.bg-gray-900").first();
    await page.getByText(assistantContent, { exact: false }).waitFor({ timeout: 60000 });

    await chatDock.screenshot({ path: path.join(screenshotDir, "assistant-image-generation.png") });

    const scrollContainer = chatDock.locator("div.overflow-y-auto").first();
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 0;
    });
    await chatDock.getByRole("button", { name: "Jump to latest" }).waitFor();
    await chatDock.screenshot({ path: path.join(screenshotDir, "chat-jump-to-latest.png") });

    await browser.close();
    await api.dispose();
  } finally {
    if (serverProcess?.pid) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", serverProcess.pid.toString(), "/T", "/F"]);
      } else {
        serverProcess.kill("SIGTERM");
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
