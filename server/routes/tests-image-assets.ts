import { Router } from "express";
import { db } from "@db";
import { generatedImages, imageAssets } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import { generateAndStoreImage, setActiveImage } from "../lib/imageGen/service";
import { eq } from "drizzle-orm";

const router = Router();

// Protected smoke tests for admins
router.use("/api/admin/image-smoke", ensureTenantAdmin);

router.get("/api/admin/image-smoke/resolver", async (_req, res) => {
  const asset = await db.query.imageAssets.findFirst({
    where: eq(imageAssets.namespace, "bourse"),
  });
  if (!asset?.activeImageId) return res.status(404).json({ message: "no active" });
  const img = await db.query.generatedImages.findFirst({ where: eq(generatedImages.id, asset.activeImageId) });
  if (!img?.storedUrl) return res.status(404).json({ message: "no stored url" });
  res.json({ url: img.storedUrl });
});

router.post("/api/admin/image-smoke/generate", async (req, res) => {
  try {
    const image = await generateAndStoreImage({
      namespace: "bourse",
      assetKey: "landing/role_miner",
      prompt: "documentary realism photo of miners working, institutional tone, neutral lighting, clean composition, modern Africa, adults only, PPE",
      mode: "fast",
      setActive: false,
    });
    res.json({ image });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "gen failed" });
  }
});

router.post("/api/admin/image-smoke/set-active", async (req, res) => {
  const { assetId, imageId } = req.body || {};
  if (!assetId || !imageId) return res.status(400).json({ message: "assetId and imageId required" });
  await setActiveImage(assetId, imageId);
  res.json({ ok: true });
});

export default router;
