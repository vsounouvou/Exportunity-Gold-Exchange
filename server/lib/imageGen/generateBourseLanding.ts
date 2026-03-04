import { generateAndStoreImage, upsertAsset, getActiveImage } from "./service";
import { landingAssetPresets } from "./presets";

export async function runBourseLandingBatch() {
  const namespace = "bourse";
  const presets = landingAssetPresets.filter((preset) => preset.namespace === namespace);

  const results: { assetKey: string; status: string; storedUrl?: string; error?: string }[] = [];

  for (const preset of presets) {
    const assetKey = preset.assetKey;
    try {
      await upsertAsset(namespace, assetKey, `${namespace}/${assetKey}`);

      const generated = await generateAndStoreImage({
        namespace,
        assetKey,
        prompt: preset.prompt,
        negativePrompt: preset.negativePrompt,
        mode: preset.modelTier,
        input: { aspect_ratio: preset.aspect, output_format: "png" },
        setActive: true,
      });

      results.push({ assetKey, status: "generated", storedUrl: generated.storedUrl || undefined });
    } catch (err: any) {
      results.push({ assetKey, status: "failed", error: err?.message || String(err) });
    }
  }

  // Add current active URLs
  for (const row of results) {
    if (!row.storedUrl) {
      const active = await getActiveImage(namespace, row.assetKey);
      if (active?.storedUrl) row.storedUrl = active.storedUrl;
    }
  }

  return results;
}

