import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export type DownloadedMedia = {
  bytes: Buffer;
  sha256: string;
  mimeType?: string;
  sizeBytes: number;
  fileName: string;
  storageUrl: string;
};

function graphBase() {
  return process.env.WHATSAPP_GRAPH_BASE_URL || "https://graph.facebook.com/v18.0";
}

export async function downloadWhatsAppMedia(waMediaId: string): Promise<DownloadedMedia | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;

  const metaResp = await fetch(`${graphBase()}/${waMediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta = await metaResp.json().catch(() => ({}));
  if (!metaResp.ok || !meta?.url) return null;

  const contentResp = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const bytes = Buffer.from(await contentResp.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const mimeType = meta?.mime_type || contentResp.headers.get("content-type") || undefined;
  const sizeBytes = bytes.length;

  const ext = mimeType?.includes("jpeg")
    ? "jpg"
    : mimeType?.includes("png")
      ? "png"
      : mimeType?.includes("pdf")
        ? "pdf"
        : mimeType?.includes("mp4")
          ? "mp4"
          : "bin";

  const fileName = `${waMediaId}_${sha256.slice(0, 10)}.${ext}`;
  const folder = path.join(process.cwd(), "attached_assets", "whatsapp-media");
  await fs.mkdir(folder, { recursive: true });
  const fullPath = path.join(folder, fileName);
  await fs.writeFile(fullPath, bytes);
  const storageUrl = `/attached_assets/whatsapp-media/${fileName}`;

  return { bytes, sha256, mimeType, sizeBytes, fileName, storageUrl };
}

