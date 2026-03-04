#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "htmlparser2";
import render from "dom-serializer";

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function walk(node, fn) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, fn);
    return;
  }
  if (node.type === "tag") fn(node);
  if (node.children && node.children.length) walk(node.children, fn);
}

function extractRichText(html) {
  const doc = parseDocument(String(html || ""));
  const blocks = [];

  walk(doc, (el) => {
    const testId = String(el.attribs?.["data-testid"] || "");
    if (testId === "richTextElement") blocks.push(el);
  });

  const parts = [];
  for (const block of blocks) {
    const children = Array.isArray(block.children) ? block.children : [];
    for (const child of children) {
      parts.push(render(child, { encodeEntities: false }));
    }
  }

  return parts.join("\n").trim();
}

async function main() {
  const mirrorRoot = String(process.env.MIRROR_PAGES_DIR || "mirror/www.exportunity.com").trim();
  const outDir = String(process.env.LEGAL_OUT_DIR || "client/public/exportunity/legal").trim();
  const timeoutMs = clampInt(process.env.LEGAL_SYNC_TIMEOUT_MS, 2_000, 120_000, 30_000);

  const entries = [
    { route: "privacypolicy", out: "privacypolicy.html" },
    { route: "termsofservice", out: "termsofservice.html" },
  ];

  const absMirror = path.resolve(process.cwd(), mirrorRoot);
  const absOut = path.resolve(process.cwd(), outDir);
  await fs.mkdir(absOut, { recursive: true });

  for (const item of entries) {
    const inputPath = path.join(absMirror, item.route, "index.html");
    const outputPath = path.join(absOut, item.out);

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const html = await fs.readFile(inputPath, "utf8");
      const extracted = extractRichText(html);
      if (!extracted) {
        console.warn(`[sync-legal] missing rich text blocks: ${inputPath}`);
        continue;
      }
      await fs.writeFile(outputPath, extracted + "\n", "utf8");
      console.log(`[sync-legal] wrote ${path.relative(process.cwd(), outputPath)}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

main().catch((err) => {
  console.error("[sync-legal] failed:", err?.message || err);
  process.exit(1);
});

