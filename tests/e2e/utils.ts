import fs from "fs";
import path from "path";
import { Page } from "@playwright/test";

export const adminEmail =
  process.env.E2E_ADMIN_EMAIL ||
  process.env.SEED_ADMIN_EMAIL ||
  "admin@exportunity.local";

export const adminPassword =
  process.env.E2E_ADMIN_PASSWORD ||
  process.env.SEED_ADMIN_PASSWORD ||
  "ChangeMe123!";

export async function loginAsAdmin(page: Page) {
  await page.goto("/admin");

  if (page.url().includes("/dashboard")) {
    return;
  }

  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/admin\/password/);

  if (page.url().includes("/admin/password")) {
    throw new Error("Admin account requires password change; disable for E2E.");
  }
}

export function loadPageInventory() {
  const inventoryPath = path.join(process.cwd(), "docs", "qa", "page-inventory.json");
  if (!fs.existsSync(inventoryPath)) {
    throw new Error("Missing page inventory. Run `npm run qa:inventory` first.");
  }
  const payload = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  return payload.routes || [];
}

export function loadMenuInventory() {
  const inventoryPath = path.join(process.cwd(), "docs", "qa", "menu-inventory.json");
  if (!fs.existsSync(inventoryPath)) {
    throw new Error("Missing menu inventory. Run `npm run qa:inventory` first.");
  }
  const payload = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  return payload.items || [];
}
