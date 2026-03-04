import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

function inferExt(mimeType: string, originalName: string) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return ".m4a";
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("pdf")) return ".pdf";
  if (mime.includes("json")) return ".json";
  if (mime.includes("text")) return ".txt";
  const ext = path.extname(originalName || "");
  if (ext && ext.length <= 12) return ext;
  return ".bin";
}

function normalizeTenantKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "tenant";
}

export async function persistChatAttachment(input: { tenantKey: string; file: Express.Multer.File }) {
  const assetRoot =
    process.env.ASSET_BASE_PATH || process.env.ASSET_ROOT || "/data/assets";
  const publicPath = process.env.ASSET_PUBLIC_PATH || "/assets";

  const tenantKey = normalizeTenantKey(input.tenantKey);
  const file = input.file;
  const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const ext = inferExt(file.mimetype, file.originalname);
  const fileName = `${hash}${ext}`;

  const dir = path.join(assetRoot, "chat-attachments", tenantKey);
  const abs = path.join(dir, fileName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(abs, file.buffer);

  const url = `${publicPath.replace(/\/+$/, "")}/chat-attachments/${tenantKey}/${fileName}`.replace(/\\/g, "/");
  return { fileUrl: url, sha256: hash, fileName, tenantKey, absolutePath: abs };
}
