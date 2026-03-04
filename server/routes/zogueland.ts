import { Router } from "express";

import { hasTenantModule } from "../../tenants/index";
import { buildZoguelandStory } from "../lib/zoguelandStory";

const router = Router();

router.post("/api/zogueland/story-generator", async (req: any, res) => {
  try {
    const tenantKey = String(req?.tenant?.key || "").toLowerCase();
    const allowed = tenantKey === "zogueland" || hasTenantModule(tenantKey as any, "stories");
    if (!allowed) {
      return res.status(403).json({ ok: false, message: "Story generator is only enabled for compatible tenants." });
    }

    const result = buildZoguelandStory(req.body || {});
    if (!result.ok) {
      const status = result.code === "MISSING_FIELDS" ? 400 : 422;
      return res.status(status).json({ ok: false, code: result.code, message: result.message });
    }

    return res.json({
      ok: true,
      title: result.title,
      story: result.story,
      safetyLabel: result.safetyLabel,
      tokenUsage: result.tokenUsage,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Story generation failed" });
  }
});

export default router;
