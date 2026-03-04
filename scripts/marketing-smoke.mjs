#!/usr/bin/env node
import assert from "node:assert/strict";

const BANNED = ["wixstatic", "wiximage", "rayon.world"];

async function runFetchFallback(baseUrl) {
  const pages = ["/", "/platform", "/proof", "/story"];
  for (const page of pages) {
    const url = `${baseUrl.replace(/\/+$/, "")}${page}`;
    const res = await fetch(url, { cache: "no-store" });
    assert(res.ok, `[smoke:fallback] ${url} status=${res.status}`);
    const html = await res.text();
    const lower = html.toLowerCase();
    for (const token of BANNED) {
      assert(!lower.includes(token), `[smoke:fallback] found blocked token "${token}" in ${url}`);
    }
  }
  console.log("[smoke:fallback] ok");
}

async function runPlaywright(baseUrl) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const origin = baseUrl.replace(/\/+$/, "");

  try {
    await page.goto(`${origin}/`, { waitUntil: "networkidle", timeout: 90_000 });
    const homeText = (await page.content()).toLowerCase();
    for (const token of BANNED) {
      assert(!homeText.includes(token), `[smoke] found blocked token "${token}" on /`);
    }
    const homeLocalImgs = await page.locator('img[src^="/assets/"]').count();
    assert(homeLocalImgs >= 1, `[smoke] expected at least 1 local image on /, got ${homeLocalImgs}`);

    await page.goto(`${origin}/platform`, { waitUntil: "networkidle", timeout: 90_000 });
    const platformText = (await page.content()).toLowerCase();
    for (const token of BANNED) {
      assert(!platformText.includes(token), `[smoke] found blocked token "${token}" on /platform`);
    }
    const platformLocalImgs = await page.locator('img[src^="/assets/"]').count();
    assert(platformLocalImgs >= 1, `[smoke] expected at least 1 local image on /platform, got ${platformLocalImgs}`);

    await page.goto(`${origin}/proof`, { waitUntil: "networkidle", timeout: 90_000 });
    const proofText = (await page.content()).toLowerCase();
    for (const token of BANNED) {
      assert(!proofText.includes(token), `[smoke] found blocked token "${token}" on /proof`);
    }

    await page.goto(`${origin}/story`, { waitUntil: "networkidle", timeout: 90_000 });
    const storyText = (await page.content()).toLowerCase();
    for (const token of BANNED) {
      assert(!storyText.includes(token), `[smoke] found blocked token "${token}" on /story`);
    }
    const storyLocalImgs = await page.locator('img[src^="/assets/"]').count();
    assert(storyLocalImgs >= 1, `[smoke] expected at least 1 local image on /story, got ${storyLocalImgs}`);

    console.log(
      `[smoke] ok home_local_images=${homeLocalImgs} platform_local_images=${platformLocalImgs} story_local_images=${storyLocalImgs}`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const baseUrl = String(process.env.MARKETING_SMOKE_BASE_URL || "https://clone.exportunity.net").trim();
  try {
    await runPlaywright(baseUrl);
  } catch (error) {
    const message = String(error?.message || error);
    if (!/EPERM|playwright|browser|chromium|executable/i.test(message)) {
      throw error;
    }
    console.warn(`[smoke] playwright unavailable, falling back to fetch checks: ${message}`);
    await runFetchFallback(baseUrl);
  }
}

main().catch((error) => {
  console.error("[smoke] failed:", error?.message || error);
  process.exit(1);
});
