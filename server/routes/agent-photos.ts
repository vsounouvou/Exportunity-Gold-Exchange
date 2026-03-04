import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "@db";
import { agents, agentPhotoGenerations, generatedImages, imageAssets } from "@db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { ensureTenantAdmin } from "./utils/auth";
import { resolveRuntimeAgentId } from "../lib/agents/resolveRuntimeAgentId";
import {
  deleteGeneratedImage,
  generateAndStoreImage,
  importLocalAsset,
  listGenerated,
  setActiveImage,
  upsertAsset,
} from "../lib/imageGen/service";

const upload = multer({ dest: path.join(process.cwd(), ".tmp_uploads") });

const router = Router();

function toInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function agentPhotoAssetKey(agentId: number) {
  return `agent/${agentId}`;
}

function templatePhotoAssetKey(templateId: number) {
  return `agent-template/${templateId}`;
}

function normalizeAspectRatio(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  const allowed = new Set(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"]);
  if (allowed.has(raw)) return raw;
  return "1:1";
}

function defaultPromptTemplate(agent: any) {
  const name = String(agent?.name || "").trim() || "team member";
  const role = String(agent?.role || "").trim() || "Operations";
  const country = String(agent?.country || "").trim();
  const countryClause = country ? ` from ${country}` : "";
  return `Professional headshot of an African corporate team member named ${name}${countryClause}, role ${role} at a gold trading platform. Clean studio lighting, modern Afro-business aesthetic, confident and friendly, neutral background, high detail, photorealistic, 1:1.`;
}

function safeObject(input: unknown): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) return input as Record<string, any>;
  return {};
}

type ResolvedAgent =
  | {
      mode: "runtime";
      agent: any;
      runtimeAgentId: number;
      templateId: null;
      templateApprovalPolicy: Record<string, any>;
      templateAvatarUrl: string | null;
    }
  | {
      mode: "template";
      agent: any;
      runtimeAgentId: null;
      templateId: number;
      templateApprovalPolicy: Record<string, any>;
      templateAvatarUrl: string | null;
    };

function mapTemplateToAgent(template: any, approvalPolicy: Record<string, any>) {
  return {
    id: Number(template.id),
    name: String(template.title || "").trim() || `Agent ${template.id}`,
    role: String(template.role_title || template.title || "Operations").trim() || "Operations",
    country: null,
    photoPrompt:
      typeof approvalPolicy.photoPrompt === "string"
        ? approvalPolicy.photoPrompt
        : typeof approvalPolicy.photo_prompt === "string"
          ? approvalPolicy.photo_prompt
          : null,
    photoLocked: Boolean(approvalPolicy.photoLocked ?? approvalPolicy.photo_locked ?? false),
    photoAssetId:
      typeof approvalPolicy.photoAssetId === "string"
        ? approvalPolicy.photoAssetId
        : typeof approvalPolicy.photo_asset_id === "string"
          ? approvalPolicy.photo_asset_id
          : null,
  };
}

async function resolveTemplate(req: any, agentId: number) {
  const tenantId = Number((req as any)?.tenant?.id || 0);
  if (!tenantId) return null;
  const rows: any[] = (await db.execute(sql`
    select id, title, role_title, avatar_url, approval_policy
    from ece_agent_templates
    where id = ${agentId} and tenant_id = ${tenantId}
    limit 1
  `)) as any;
  const row = Array.isArray((rows as any)?.rows) ? (rows as any).rows[0] : Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  const approvalPolicy = safeObject(row.approval_policy);
  return {
    mode: "template" as const,
    agent: mapTemplateToAgent(row, approvalPolicy),
    runtimeAgentId: null,
    templateId: Number(row.id),
    templateApprovalPolicy: approvalPolicy,
    templateAvatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
  };
}

async function resolveAgent(req: any, agentId: number): Promise<ResolvedAgent | null> {
  const runtimeAgentId = await resolveRuntimeAgentId({
    agentId,
    tenantId: Number((req as any)?.tenant?.id || 0) || null,
  });
  if (runtimeAgentId) {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, runtimeAgentId) });
    if (agent) {
      return {
        mode: "runtime",
        agent,
        runtimeAgentId,
        templateId: null,
        templateApprovalPolicy: {},
        templateAvatarUrl: null,
      };
    }
  }

  const template = await resolveTemplate(req, agentId);
  if (template) return template;
  return null;
}

async function updateTemplatePhotoState(input: {
  templateId: number;
  actorAdminId: number | null;
  currentPolicy: Record<string, any>;
  currentAvatarUrl: string | null;
  patch: {
    photoLocked?: boolean;
    photoPrompt?: string | null;
    photoAssetId?: string | null;
    avatarUrl?: string | null;
  };
}) {
  const nextPolicy = {
    ...safeObject(input.currentPolicy),
    ...(input.patch.photoLocked !== undefined ? { photoLocked: input.patch.photoLocked } : {}),
    ...(input.patch.photoPrompt !== undefined ? { photoPrompt: input.patch.photoPrompt } : {}),
    ...(input.patch.photoAssetId !== undefined ? { photoAssetId: input.patch.photoAssetId } : {}),
  };
  const nextAvatarUrl = input.patch.avatarUrl !== undefined ? input.patch.avatarUrl : input.currentAvatarUrl;
  await db.execute(sql`
    update ece_agent_templates
    set
      approval_policy = ${JSON.stringify(nextPolicy)}::jsonb,
      avatar_url = ${nextAvatarUrl},
      updated_by_user_id = ${input.actorAdminId},
      updated_at = now()
    where id = ${input.templateId}
  `);
}

async function resolveAgentPhotoBundle(req: any, agentId: number) {
  const resolved = await resolveAgent(req, agentId);
  if (!resolved) return null;
  const { agent } = resolved;
  const assetKey = resolved.mode === "runtime" ? agentPhotoAssetKey(resolved.runtimeAgentId) : templatePhotoAssetKey(resolved.templateId);
  const asset =
    (agent as any).photoAssetId
      ? await db.query.imageAssets.findFirst({ where: eq(imageAssets.id, String((agent as any).photoAssetId)) })
      : await db.query.imageAssets.findFirst({
          where: and(eq(imageAssets.namespace, "agents"), eq(imageAssets.assetKey, assetKey), eq(imageAssets.variant, "default")),
        });

  const activeImage =
    asset?.activeImageId
      ? await db.query.generatedImages.findFirst({ where: eq(generatedImages.id, String(asset.activeImageId)) })
      : null;

  const variants = asset
    ? await listGenerated("agents", assetKey, "default")
    : [];

  const tenantId = req.tenant?.id;
  const generations =
    resolved.mode === "runtime" && tenantId && agent
      ? await db.query.agentPhotoGenerations.findMany({
          where: and(eq(agentPhotoGenerations.tenantId, tenantId), eq(agentPhotoGenerations.agentId, resolved.runtimeAgentId)),
          orderBy: desc(agentPhotoGenerations.createdAt),
          limit: 20,
        })
      : [];

  const fallbackTemplateActiveImage =
    !activeImage && resolved.mode === "template" && resolved.templateAvatarUrl
      ? ({
          id: `template-avatar-${resolved.templateId}`,
          status: "succeeded",
          storedUrl: resolved.templateAvatarUrl,
          prompt: typeof (agent as any).photoPrompt === "string" ? String((agent as any).photoPrompt) : null,
          error: null,
          createdAt: null,
        } as any)
      : null;

  return {
    agent,
    asset,
    activeImage: activeImage || fallbackTemplateActiveImage,
    variants: variants.slice(0, 12),
    generations,
  };
}

router.get("/agents/:id/photo", ensureTenantAdmin, async (req: any, res) => {
  try {
    const agentId = toInt(req.params.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });

    const bundle = await resolveAgentPhotoBundle(req, agentId);
    if (!bundle) return res.status(404).json({ message: `Agent not found for id ${agentId}` });
    return res.json({ ok: true, ...bundle });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Failed to load agent photo" });
  }
});

router.post("/agents/:id/photo/lock", ensureTenantAdmin, async (req: any, res) => {
  try {
    const agentId = toInt(req.params.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const resolved = await resolveAgent(req, agentId);
    if (!resolved) return res.status(404).json({ message: `Agent not found for id ${agentId}` });

    const admin = (req as any).adminUser;
    const locked = Boolean(req.body?.locked);

    if (resolved.mode === "runtime") {
      await db
        .update(agents)
        .set({
          photoLocked: locked,
          photoUpdatedAt: new Date(),
          photoUpdatedBy: admin?.id ? `admin:${admin.id}` : "admin:unknown",
          updatedAt: new Date(),
        } as any)
        .where(eq(agents.id, resolved.runtimeAgentId));
    } else {
      await updateTemplatePhotoState({
        templateId: resolved.templateId,
        actorAdminId: admin?.id ? Number(admin.id) : null,
        currentPolicy: resolved.templateApprovalPolicy,
        currentAvatarUrl: resolved.templateAvatarUrl,
        patch: { photoLocked: locked },
      });
    }

    const bundle = await resolveAgentPhotoBundle(req, agentId);
    return res.json({ ok: true, ...(bundle || { agent: resolved.agent }) });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Failed to update lock" });
  }
});

router.post("/agents/:id/photo/upload", ensureTenantAdmin, upload.single("file"), async (req: any, res) => {
  const tmpPath = req.file?.path;
  try {
    const agentId = toInt(req.params.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const resolved = await resolveAgent(req, agentId);
    if (!resolved) return res.status(404).json({ message: `Agent not found for id ${agentId}` });
    const { agent } = resolved;
    if (!tmpPath || !fs.existsSync(tmpPath)) return res.status(400).json({ message: "file is required" });

    const admin = (req as any).adminUser;
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ message: "Tenant not resolved" });

    const entityId = resolved.mode === "runtime" ? resolved.runtimeAgentId : resolved.templateId;
    const assetKey = resolved.mode === "runtime" ? agentPhotoAssetKey(entityId) : templatePhotoAssetKey(entityId);
    const label = resolved.mode === "runtime" ? `agents/${entityId}` : `agent-templates/${entityId}`;
    const asset = await upsertAsset("agents", assetKey, label, "default");

    const record = await importLocalAsset({
      namespace: "agents",
      assetKey,
      variant: "default",
      sourcePath: tmpPath,
      filename: req.file?.originalname || "upload.png",
      label,
      setActive: true,
    });

    if (resolved.mode === "runtime") {
      await db
        .update(agents)
        .set({
          photoAssetId: asset.id,
          photoUpdatedAt: new Date(),
          photoUpdatedBy: admin?.id ? `admin:${admin.id}` : "admin:unknown",
          updatedAt: new Date(),
        } as any)
        .where(eq(agents.id, entityId));

      await db.insert(agentPhotoGenerations).values({
        tenantId,
        agentId: entityId,
        prompt: "manual-upload",
        assetId: asset.id,
        imageId: record.id,
        status: "done",
        provider: "upload",
        createdBy: admin?.id ? `admin:${admin.id}` : undefined,
        createdAt: new Date(),
      } as any);
    } else {
      await updateTemplatePhotoState({
        templateId: entityId,
        actorAdminId: admin?.id ? Number(admin.id) : null,
        currentPolicy: resolved.templateApprovalPolicy,
        currentAvatarUrl: resolved.templateAvatarUrl,
        patch: {
          photoAssetId: asset.id,
          avatarUrl: String((record as any)?.storedUrl || (record as any)?.storageUrl || resolved.templateAvatarUrl || ""),
        },
      });
    }

    const bundle = await resolveAgentPhotoBundle(req, agentId);
    return res.json({ ok: true, ...(bundle || { agent: resolved.agent }) });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Upload failed" });
  } finally {
    if (tmpPath) {
      fs.promises.unlink(tmpPath).catch(() => null);
    }
  }
});

router.post("/agents/:id/photo/generate", ensureTenantAdmin, async (req: any, res) => {
  try {
    const agentId = toInt(req.params.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const resolved = await resolveAgent(req, agentId);
    if (!resolved) return res.status(404).json({ message: `Agent not found for id ${agentId}` });
    const { agent } = resolved;
    if ((agent as any).photoLocked && req.body?.force !== true) {
      return res.status(423).json({ message: "Photo is locked. Unlock to regenerate." });
    }

    const admin = (req as any).adminUser;
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ message: "Tenant not resolved" });

    const requestedPrompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const prompt = requestedPrompt || String((agent as any).photoPrompt || "").trim() || defaultPromptTemplate(agent);

    const aspectRatio = normalizeAspectRatio(req.body?.aspect_ratio ?? req.body?.aspectRatio);
    const n = Math.min(Math.max(toInt(req.body?.n) ?? 4, 1), 8);
    const seedRaw = req.body?.seed;
    const seed = seedRaw == null || seedRaw === "" ? null : toInt(seedRaw);

    const entityId = resolved.mode === "runtime" ? resolved.runtimeAgentId : resolved.templateId;
    const assetKey = resolved.mode === "runtime" ? agentPhotoAssetKey(entityId) : templatePhotoAssetKey(entityId);
    const label = resolved.mode === "runtime" ? `agents/${entityId}` : `agent-templates/${entityId}`;
    const asset = await upsertAsset("agents", assetKey, label, "default");

    if (resolved.mode === "runtime") {
      await db
        .update(agents)
        .set({
          photoAssetId: asset.id,
          photoPrompt: prompt,
          photoUpdatedAt: new Date(),
          photoUpdatedBy: admin?.id ? `admin:${admin.id}` : "admin:unknown",
          updatedAt: new Date(),
        } as any)
        .where(eq(agents.id, entityId));
    } else {
      await updateTemplatePhotoState({
        templateId: entityId,
        actorAdminId: admin?.id ? Number(admin.id) : null,
        currentPolicy: resolved.templateApprovalPolicy,
        currentAvatarUrl: resolved.templateAvatarUrl,
        patch: { photoAssetId: asset.id, photoPrompt: prompt },
      });
    }

    const shouldSetActiveFirst = Boolean(req.body?.setActive) || !asset.activeImageId;

    const images: any[] = [];
    const runs: any[] = [];
    for (let i = 0; i < n; i += 1) {
      const run =
        resolved.mode === "runtime"
          ? (
              await db
                .insert(agentPhotoGenerations)
                .values({
                  tenantId,
                  agentId: entityId,
                  prompt,
                  assetId: asset.id,
                  status: "queued",
                  provider: "replicate",
                  createdBy: admin?.id ? `admin:${admin.id}` : undefined,
                  createdAt: new Date(),
                } as any)
                .returning()
            )[0]
          : ({ id: `template-${entityId}-${Date.now()}-${i + 1}`, status: "queued" } as any);

      if (resolved.mode === "runtime") {
        await db
          .update(agentPhotoGenerations)
          .set({ status: "running" } as any)
          .where(eq(agentPhotoGenerations.id, run.id));
      }

      try {
        const input: Record<string, any> = { aspect_ratio: aspectRatio, output_format: "png" };
        if (seed != null) input.seed = seed;

        const record = await generateAndStoreImage({
          namespace: "agents",
          assetKey,
          variant: "default",
          prompt,
          mode: (req.body?.mode as any) || "quality",
          input,
          setActive: i === 0 && shouldSetActiveFirst,
          createdBy: admin?.id ? `admin:${admin.id}` : undefined,
        });

        images.push(record);
        runs.push({ ...run, status: "done", imageId: record.id });

        if (resolved.mode === "runtime") {
          await db
            .update(agentPhotoGenerations)
            .set({ status: "done", imageId: record.id, error: null } as any)
            .where(eq(agentPhotoGenerations.id, run.id));
        } else if (i === 0) {
          await updateTemplatePhotoState({
            templateId: entityId,
            actorAdminId: admin?.id ? Number(admin.id) : null,
            currentPolicy: resolved.templateApprovalPolicy,
            currentAvatarUrl: resolved.templateAvatarUrl,
            patch: {
              avatarUrl: String((record as any)?.storedUrl || (record as any)?.storageUrl || resolved.templateAvatarUrl || ""),
              photoAssetId: asset.id,
              photoPrompt: prompt,
            },
          });
        }
      } catch (err: any) {
        const message = String(err?.message || "Generation failed");
        runs.push({ ...run, status: "failed", error: message });
        if (resolved.mode === "runtime") {
          await db
            .update(agentPhotoGenerations)
            .set({ status: "failed", error: message } as any)
            .where(eq(agentPhotoGenerations.id, run.id));
        }
      }
    }

    if (!images.length) {
      return res.status(500).json({ message: "All generations failed" });
    }

    const bundle = await resolveAgentPhotoBundle(req, agentId);
    return res.json({ ok: true, images, runs, ...(bundle || { agent: resolved.agent }) });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Generate failed" });
  }
});

router.post("/agents/:id/photo/select", ensureTenantAdmin, async (req: any, res) => {
  try {
    const agentId = toInt(req.params.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const resolved = await resolveAgent(req, agentId);
    if (!resolved) return res.status(404).json({ message: `Agent not found for id ${agentId}` });
    const { agent } = resolved;

    const admin = (req as any).adminUser;
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ message: "Tenant not resolved" });

    const imageId =
      typeof req.body?.imageId === "string"
        ? req.body.imageId
        : typeof req.body?.image_id === "string"
          ? req.body.image_id
          : typeof req.body?.asset_id === "string"
            ? req.body.asset_id
            : "";
    if (!imageId) return res.status(400).json({ message: "imageId is required" });

    const entityId = resolved.mode === "runtime" ? resolved.runtimeAgentId : resolved.templateId;
    const assetKey = resolved.mode === "runtime" ? agentPhotoAssetKey(entityId) : templatePhotoAssetKey(entityId);
    const asset =
      (agent as any).photoAssetId
        ? await db.query.imageAssets.findFirst({ where: eq(imageAssets.id, String((agent as any).photoAssetId)) })
        : await upsertAsset("agents", assetKey, resolved.mode === "runtime" ? `agents/${entityId}` : `agent-templates/${entityId}`, "default");
    if (!asset) return res.status(409).json({ message: "Missing asset for agent photo" });

    const belongs = await db.query.generatedImages.findFirst({
      where: and(eq(generatedImages.id, imageId), eq(generatedImages.namespace, "agents"), eq(generatedImages.assetKey, assetKey)),
    });
    if (!belongs) return res.status(409).json({ message: "Image does not belong to this agent" });

    await setActiveImage(asset.id, imageId);

    if (resolved.mode === "runtime") {
      await db
        .update(agents)
        .set({
          photoAssetId: asset.id,
          photoUpdatedAt: new Date(),
          photoUpdatedBy: admin?.id ? `admin:${admin.id}` : "admin:unknown",
          updatedAt: new Date(),
        } as any)
        .where(eq(agents.id, entityId));
    } else {
      await updateTemplatePhotoState({
        templateId: entityId,
        actorAdminId: admin?.id ? Number(admin.id) : null,
        currentPolicy: resolved.templateApprovalPolicy,
        currentAvatarUrl: resolved.templateAvatarUrl,
        patch: { photoAssetId: asset.id, avatarUrl: String(belongs?.storedUrl || resolved.templateAvatarUrl || "") },
      });
    }

    const bundle = await resolveAgentPhotoBundle(req, agentId);
    return res.json({ ok: true, ...(bundle || { agent: resolved.agent }) });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Select failed" });
  }
});

router.delete("/agents/:id/photo/variant/:imageId", ensureTenantAdmin, async (req: any, res) => {
  try {
    const agentId = toInt(req.params.id);
    if (!agentId) return res.status(400).json({ message: "Invalid agent id" });
    const resolved = await resolveAgent(req, agentId);
    if (!resolved) return res.status(404).json({ message: `Agent not found for id ${agentId}` });
    const entityId = resolved.mode === "runtime" ? resolved.runtimeAgentId : resolved.templateId;

    const imageId = String(req.params.imageId || "").trim();
    if (!imageId) return res.status(400).json({ message: "imageId required" });

    const assetKey = resolved.mode === "runtime" ? agentPhotoAssetKey(entityId) : templatePhotoAssetKey(entityId);
    const belongs = await db.query.generatedImages.findFirst({
      where: and(eq(generatedImages.id, imageId), eq(generatedImages.namespace, "agents"), eq(generatedImages.assetKey, assetKey)),
    });
    if (!belongs) return res.status(409).json({ message: "Image does not belong to this agent" });

    await deleteGeneratedImage(imageId);

    const bundle = await resolveAgentPhotoBundle(req, agentId);
    return res.json({ ok: true, ...(bundle || { agent: resolved.agent }) });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Delete failed" });
  }
});

export default router;
