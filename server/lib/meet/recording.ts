import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Express } from "express";
import { addMeetArtifact, recordMeetEvent } from "./service";

function inferExt(mimeType: string, originalName: string) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("ogg")) return ".ogg";
  return path.extname(originalName || "") || ".bin";
}

function getAssetRoots() {
  const root = process.env.ASSET_BASE_PATH || process.env.ASSET_ROOT || path.resolve(process.cwd(), "uploads");
  const publicPath = process.env.ASSET_PUBLIC_PATH || "/assets";
  return { root, publicPath };
}

export async function persistMeetingRecording(input: {
  tenantId: number;
  meetingId: string;
  file: Express.Multer.File;
  metadata?: Record<string, unknown>;
}) {
  const { root, publicPath } = getAssetRoots();
  const hash = crypto.createHash("sha256").update(input.file.buffer).digest("hex");
  const ext = inferExt(input.file.mimetype, input.file.originalname);
  const fileName = `${input.meetingId}-${hash.slice(0, 24)}${ext}`;
  const dir = path.join(root, "meet-recordings", `tenant-${input.tenantId}`);
  const abs = path.join(dir, fileName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(abs, input.file.buffer);
  const storageUrl = `${publicPath.replace(/\/+$/, "")}/meet-recordings/tenant-${input.tenantId}/${fileName}`.replace(/\\/g, "/");

  const artifact = await addMeetArtifact({
    tenantId: input.tenantId,
    meetingId: input.meetingId,
    type: "recording",
    storageUrl,
    metadata: {
      mimeType: input.file.mimetype,
      sizeBytes: input.file.size,
      originalName: input.file.originalname,
      ...input.metadata,
    },
  });

  await recordMeetEvent({
    tenantId: input.tenantId,
    meetingId: input.meetingId,
    eventType: "recording_uploaded",
    payload: {
      artifactId: artifact.id,
      storageUrl,
      sizeBytes: input.file.size,
    },
  });

  return artifact;
}

