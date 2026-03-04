import crypto from "crypto";
import { db } from "@db";
import { imageAssets, generatedImages } from "@db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { saveImageBuffer, copyLocalFile, fileExists, getAssetUrl, getAssetPath } from "./storage";
import { createPrediction, getPrediction, ReplicateMode } from "./replicate";
import path from "path";
import fs from "fs";
import { getImageGenStatus } from "./health";
import { defaultNegativePrompt, defaultStyleSuffix } from "./presets";

const MAX_PROMPT_CHARS = 1500;

function normalizeVariant(value: unknown): string {
  const v = String(value ?? "").trim();
  return v || "default";
}

function hashContent(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFilenameBase(value: string): string {
  const base = path.basename(String(value || ""));
  const normalized = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return normalized || "file";
}

function safeExtensionFromFilename(value: string): string {
  const ext = path.extname(String(value || "")).toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp" || ext === ".svg") return ext;
  return ".png";
}

function outputFormatToExtension(outputFormat: unknown): string {
  const raw = String(outputFormat || "")
    .trim()
    .toLowerCase();
  if (raw === "png") return ".png";
  if (raw === "jpg" || raw === "jpeg") return ".jpg";
  if (raw === "webp") return ".webp";
  return ".png";
}

function uniqueSuffix() {
  if (typeof (crypto as any).randomUUID === "function") return (crypto as any).randomUUID();
  return crypto.randomBytes(12).toString("hex");
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadBufferWithRetry(url: string, opts?: { timeoutMs?: number; retries?: number }): Promise<Buffer> {
  const timeoutMs = opts?.timeoutMs ?? 30000;
  const retries = opts?.retries ?? 2;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Download failed: HTTP ${res.status} ${text}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function getActiveImage(namespace: string, assetKey: string, variant?: string) {
  const v = normalizeVariant(variant);
  const asset = await db.query.imageAssets.findFirst({
    where: (fields, { and }) =>
      and(eq(imageAssets.namespace, namespace), eq(imageAssets.assetKey, assetKey), eq(imageAssets.variant, v)),
    with: { activeImage: true } as any,
  });
  return asset?.activeImageId
    ? await db.query.generatedImages.findFirst({ where: eq(generatedImages.id, asset.activeImageId) })
    : null;
}

export async function listAssets(namespace?: string) {
  const rows = await db
    .select({ asset: imageAssets, active: generatedImages })
    .from(imageAssets)
    .leftJoin(generatedImages, eq(imageAssets.activeImageId, generatedImages.id))
    .where(namespace ? eq(imageAssets.namespace, namespace) : undefined)
    .orderBy(asc(imageAssets.assetKey), asc(imageAssets.variant));

  return rows.map((row) => ({ ...row.asset, active: row.active }));
}

export async function setActiveImage(assetId: string, imageId: string) {
  await db
    .update(imageAssets)
    .set({ activeImageId: imageId, updatedAt: new Date() })
    .where(eq(imageAssets.id, assetId));
}

export function hashPrompt(prompt: string, negativePrompt?: string) {
  return crypto.createHash("sha256").update(`${prompt}::${negativePrompt || ""}`).digest("hex");
}

export async function generateAndStoreImage(opts: {
  namespace: string;
  assetKey: string;
  variant?: string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  mode?: ReplicateMode;
  input?: Record<string, any>;
  setActive?: boolean;
  createdBy?: string;
}) {
  const { namespace, assetKey, prompt, negativePrompt, model, mode = "quality", input = {}, setActive = false, createdBy } = opts;
  const variant = normalizeVariant(opts.variant);
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`Prompt required and must be under ${MAX_PROMPT_CHARS} characters`);
  }

  const safePrompt = String(prompt).trim();
  const safeNegative = typeof negativePrompt === "string" ? negativePrompt.trim() : "";

  const finalPrompt = `${safePrompt} ${defaultStyleSuffix}`.trim();
  const finalNegative = safeNegative ? `${safeNegative}, ${defaultNegativePrompt}` : defaultNegativePrompt;
  const promptHash = hashPrompt(finalPrompt, finalNegative);

  const normalizedInput = { ...(input || {}) };
  if (!normalizedInput.output_format) normalizedInput.output_format = "png";

  const existingAsset = await upsertAsset(namespace, assetKey, `${namespace}/${assetKey}`, variant);

  const inserted = await db
    .insert(generatedImages)
    .values({
      namespace,
      assetKey,
      variant,
      model:
        model ||
        (mode === "fast"
          ? process.env.REPLICATE_MODEL_FAST || "black-forest-labs/flux-schnell"
          : process.env.REPLICATE_MODEL_QUALITY || "black-forest-labs/flux-dev"),
      prompt: finalPrompt,
      negativePrompt: finalNegative,
      input: normalizedInput as any,
      promptHash,
      status: "queued",
      ...(createdBy ? { createdBy } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  const record = inserted[0];

  const fail = async (err: unknown) => {
    const message = safeErrorMessage(err);
    await db
      .update(generatedImages)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(generatedImages.id, record.id));
    throw new Error(message);
  };

  const health = getImageGenStatus();
  if (health.status !== "ok") {
    const msg =
      health.status === "missing_token"
        ? "Image generation unavailable: missing REPLICATE_API_TOKEN"
        : `Image generation unavailable: storage not writable (${health.storage.error || "unknown error"})`;
    await fail(msg);
  }

  let prediction: any;
  try {
    prediction = await createPrediction({
      prompt: finalPrompt,
      negative_prompt: finalNegative,
      mode,
      model,
      input: normalizedInput,
    });
  } catch (err) {
    await fail(err);
  }

  await db
    .update(generatedImages)
    .set({ replicatePredictionId: prediction.id, status: "running", updatedAt: new Date() })
    .where(eq(generatedImages.id, record.id));

  let pred = prediction;
  const start = Date.now();
  while (pred.status === "starting" || pred.status === "processing" || pred.status === "queued") {
    if (Date.now() - start > 120000) {
      await fail("Generation timed out");
    }
    await sleep(2000);
    try {
      pred = await getPrediction(pred.id);
    } catch (err) {
      await fail(err);
    }
  }

  if (pred.status !== "succeeded") {
    const predError = pred.error ? String(pred.error) : pred.status;
    await fail(`Generation failed: ${predError}`);
  }

  const outputUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!outputUrl) {
    await fail("No output URL from Replicate");
  }

  let buf: Buffer;
  try {
    buf = await downloadBufferWithRetry(String(outputUrl), { timeoutMs: 30000, retries: 2 });
  } catch (err) {
    await fail(err);
    throw err;
  }

  const filename = `${record.id}${outputFormatToExtension(normalizedInput.output_format)}`;
  const contentHash = hashContent(buf);

  const existingByHash = await db.query.generatedImages.findFirst({
    where: (fields, { and }) =>
      and(
        eq(generatedImages.namespace, namespace),
        eq(generatedImages.assetKey, assetKey),
        eq(generatedImages.variant, variant),
        eq(generatedImages.contentHash, contentHash),
        eq(generatedImages.status, "succeeded")
      ),
  });

  if (existingByHash) {
    await db.delete(generatedImages).where(eq(generatedImages.id, record.id));
    if (setActive) {
      await setActiveImage(existingAsset.id, existingByHash.id);
    }
    return existingByHash;
  }

  let storedUrl: string;
  try {
    storedUrl = await saveImageBuffer(namespace, assetKey, filename, buf, variant);
  } catch (err) {
    await fail(err);
    throw err;
  }

  const [updated] = await db
    .update(generatedImages)
    .set({
      status: "succeeded",
      storedUrl,
      sourceUrl: String(outputUrl),
      contentHash,
      updatedAt: new Date(),
    })
    .where(eq(generatedImages.id, record.id))
    .returning();

  if (setActive) {
    await setActiveImage(existingAsset.id, updated.id);
  }

  return updated;
}

export async function upsertAsset(namespace: string, assetKey: string, label?: string, variant?: string) {
  const v = normalizeVariant(variant);
  const existing = await db.query.imageAssets.findFirst({
    where: (fields, { and }) =>
      and(eq(imageAssets.namespace, namespace), eq(imageAssets.assetKey, assetKey), eq(imageAssets.variant, v)),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(imageAssets)
    .values({
      namespace,
      assetKey,
      variant: v,
      label: label ?? `${namespace}/${assetKey}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function importLocalAsset(opts: {
  namespace: string;
  assetKey: string;
  variant?: string;
  sourcePath: string;
  filename?: string;
  label?: string;
  setActive?: boolean;
}) {
  const { namespace, assetKey, sourcePath, filename = "imported.png", label, setActive } = opts;
  const variant = normalizeVariant(opts.variant);
  const asset = await upsertAsset(namespace, assetKey, label, variant);
  const ext = safeExtensionFromFilename(filename);
  const base = safeFilenameBase(filename).replace(/\.[^/.]+$/, "");
  const uniqueName = `${base}-${Date.now()}-${uniqueSuffix()}${ext}`;
  const buf = await fs.promises.readFile(sourcePath);
  const contentHash = hashContent(buf);
  const existingByHash = await db.query.generatedImages.findFirst({
    where: (fields, { and }) =>
      and(
        eq(generatedImages.namespace, namespace),
        eq(generatedImages.assetKey, assetKey),
        eq(generatedImages.variant, variant),
        eq(generatedImages.contentHash, contentHash),
        eq(generatedImages.status, "succeeded")
      ),
  });
  if (existingByHash) {
    if (setActive) {
      await setActiveImage(asset.id, existingByHash.id);
    }
    return existingByHash;
  }

  const storedUrl = await saveImageBuffer(namespace, assetKey, uniqueName, buf, variant);
  const promptHash = hashPrompt("manual-import");
  const [created] = await db
    .insert(generatedImages)
    .values({
      namespace,
      assetKey,
      variant,
      model: "manual-import",
      prompt: "manual-import",
      negativePrompt: "",
      input: {},
      promptHash,
      contentHash,
      status: "succeeded",
      storedUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  if (setActive) {
    await setActiveImage(asset.id, created.id);
  }
  return created;
}

export async function listGenerated(namespace: string, assetKey: string, variant?: string) {
  const v = normalizeVariant(variant);
  return db.query.generatedImages.findMany({
    where: (fields, { and }) =>
      and(eq(generatedImages.namespace, namespace), eq(generatedImages.assetKey, assetKey), eq(generatedImages.variant, v)),
    orderBy: desc(generatedImages.createdAt),
    limit: 20,
  });
}

export async function listRecentGenerated(namespace: string, limit = 24) {
  const safeLimit = Math.min(Math.max(Number(limit) || 0, 1), 50);
  return db.query.generatedImages.findMany({
    where: eq(generatedImages.namespace, namespace),
    orderBy: desc(generatedImages.createdAt),
    limit: safeLimit,
  });
}

export async function applyImageToAsset(opts: {
  imageId: string;
  namespace: string;
  targetAssetKey: string;
  targetVariant?: string;
  setActive?: boolean;
}) {
  const { imageId, namespace, targetAssetKey, setActive = true } = opts;
  const targetVariant = normalizeVariant(opts.targetVariant);
  const source = await db.query.generatedImages.findFirst({ where: eq(generatedImages.id, imageId) });
  if (!source || !source.storedUrl) throw new Error("Source image not found");

  const filename = path.basename(new URL(source.storedUrl, "http://local").pathname) || `${source.id}.png`;
  let buffer: Buffer | null = null;

  const sourcePath = getAssetPath(source.namespace, source.assetKey, filename, source.variant);
  if (fs.existsSync(sourcePath)) {
    buffer = await fs.promises.readFile(sourcePath);
  }

  if (!buffer) {
    const absoluteUrl = source.storedUrl.startsWith("http")
      ? source.storedUrl
      : `${process.env.ASSET_PUBLIC_BASE || "http://localhost:3000"}${source.storedUrl}`;
    const res = await fetch(absoluteUrl);
    if (!res.ok) throw new Error("Failed to download source image");
    buffer = Buffer.from(await res.arrayBuffer());
  }

  const asset = await upsertAsset(namespace, targetAssetKey, `${namespace}/${targetAssetKey}`, targetVariant);
  const contentHash = hashContent(buffer);
  const existingByHash = await db.query.generatedImages.findFirst({
    where: (fields, { and }) =>
      and(
        eq(generatedImages.namespace, namespace),
        eq(generatedImages.assetKey, targetAssetKey),
        eq(generatedImages.variant, targetVariant),
        eq(generatedImages.contentHash, contentHash),
        eq(generatedImages.status, "succeeded")
      ),
  });
  if (existingByHash) {
    if (setActive) {
      await setActiveImage(asset.id, existingByHash.id);
    }
    return { asset, image: existingByHash };
  }

  const storedUrl = await saveImageBuffer(namespace, targetAssetKey, filename, buffer, targetVariant);

  const [cloned] = await db
    .insert(generatedImages)
    .values({
      namespace,
      assetKey: targetAssetKey,
      variant: targetVariant,
      model: source.model,
      prompt: source.prompt,
      negativePrompt: source.negativePrompt,
      input: source.input,
      promptHash: hashPrompt(source.prompt, source.negativePrompt ?? undefined),
      contentHash,
      status: "succeeded",
      sourceUrl: source.sourceUrl || source.storedUrl,
      storedUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (setActive) {
    await setActiveImage(asset.id, cloned.id);
  }

  return { asset, image: cloned };
}

export async function deleteGeneratedImage(imageId: string) {
  const record = await db.query.generatedImages.findFirst({ where: eq(generatedImages.id, imageId) });
  if (!record) return;

  await db.update(imageAssets).set({ activeImageId: null, updatedAt: new Date() }).where(eq(imageAssets.activeImageId, imageId));
  await db.delete(generatedImages).where(eq(generatedImages.id, imageId));

  if (record.storedUrl) {
    try {
      const filename = path.basename(new URL(record.storedUrl, "http://local").pathname);
      const filePath = getAssetPath(record.namespace, record.assetKey, filename, record.variant);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch {
      // ignore file deletion errors
    }
  }
}
