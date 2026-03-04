import { Router } from "express";
import fsSync from "fs";
import fs from "fs/promises";
import path from "path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { fabricationJobs, machineEditActions, machineRevisions, machines, previewArtifacts } from "@db/schema";
import { ensureTenantStaff, isChairmanAssistantUser } from "./utils/auth";
import { compileEngineeringRequest, createEngineeringRequest, regenerateMachineRevision } from "../lib/engineering/kernel";
import { executeMachineRevision } from "../lib/engineering/executor";
import { ensureRevisionPreviewArtifacts, readPreviewArtifactFile } from "../lib/engineering/previewArtifacts";

const router = Router();
router.use(ensureTenantStaff);

function truthy(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function isAdminUser(user: any) {
  if (!user) return false;
  const currentMode = (user as any).currentMode;
  const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
  const perms = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
  return (
    currentMode === "admin" ||
    roles.includes("admin") ||
    perms.includes("*") ||
    perms.includes("admin:*") ||
    isChairmanAssistantUser(user)
  );
}

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ ok: false, message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function requireEngineeringKernelUi(req: any, res: any) {
  const enabled = truthy(process.env.ENGINEERING_KERNEL_UI_ENABLED);
  if (!enabled) {
    // Hide existence (private route + feature-flag gated).
    res.status(404).json({ ok: false, message: "Not found" });
    return false;
  }

  const internalKey = String(process.env.ENGINEERING_KERNEL_INTERNAL_KEY || "").trim();
  if (!internalKey) {
    res.status(503).json({ ok: false, message: "Engineering kernel internal key not configured" });
    return false;
  }

  const staffUser = (req as any).staffUser;
  if (!isAdminUser(staffUser)) {
    res.status(403).json({ ok: false, message: "Admin access required" });
    return false;
  }

  return true;
}

function sanitizeInput(input: any) {
  const allowed = new Set([
    "throughputTph",
    "geology",
    "geography",
    "budgetUsd",
    "timelineDays",
    "logistics",
    "availableNodes",
  ]);

  const raw = input && typeof input === "object" ? input : {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) continue;
    out[key] = (raw as any)[key];
  }
  return out;
}

async function listArtifacts(dir: string) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
    return { ok: true as const, files };
  } catch (err: any) {
    return { ok: false as const, error: String(err?.message || "failed_to_list_artifacts") };
  }
}

function asInt(value: unknown) {
  const n = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function isSafeFilename(name: string) {
  if (!name) return false;
  if (name.includes("..")) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) return false;
  return /^[a-z0-9][a-z0-9._-]{0,160}$/i.test(name);
}

function contentTypeForFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".gltf")) return "model/gltf+json";
  if (lower.endsWith(".stl")) return "model/stl";
  if (lower.endsWith(".step") || lower.endsWith(".stp")) return "model/step";
  if (lower.endsWith(".dxf")) return "application/dxf";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  return "application/octet-stream";
}

async function requireRevisionTenant(args: { tenantId: number; revisionId: number }) {
  const rows = await db
    .select({
      revisionId: machineRevisions.id,
      revision: machineRevisions.revision,
      recipe: machineRevisions.recipe,
      machineId: machines.id,
      machineFamily: machines.machineFamily,
      parametersHash: machineRevisions.parametersHash,
      createdAt: machineRevisions.createdAt,
    })
    .from(machineRevisions)
    .innerJoin(machines, eq(machineRevisions.machineId, machines.id))
    .where(and(eq(machineRevisions.id, args.revisionId), eq(machines.tenantId, args.tenantId)));
  return rows[0] ?? null;
}

router.get("/ui-access", async (req: any, res) => {
  if (!requireEngineeringKernelUi(req, res)) return;
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  res.json({
    ok: true,
    enabled: true,
    tenant: { id: tenant.id, key: tenant.key, name: tenant.name },
    user: { id: req.staffUser?.id ?? null, displayName: req.staffUser?.displayName ?? null },
  });
});

router.post("/intent", async (req: any, res) => {
  if (!requireEngineeringKernelUi(req, res)) return;
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const projectIdRaw = req.body?.project_id ?? req.body?.projectId ?? null;
  const projectId = projectIdRaw ? String(projectIdRaw).trim() : null;
  const intent = String(req.body?.intent ?? req.body?.inferred_intent ?? req.body?.description ?? "").trim();
  if (!intent) return res.status(400).json({ ok: false, message: "intent required" });

  const input = sanitizeInput(req.body?.input);
  const created = await createEngineeringRequest({ tenantId: tenant.id, projectId, intent, input });
  return res.status(201).json({ ok: true, request_id: created.id });
});

router.post("/compile", async (req: any, res) => {
  if (!requireEngineeringKernelUi(req, res)) return;
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const requestIdRaw = req.body?.request_id ?? req.body?.requestId;
  const requestId = Number(requestIdRaw);
  if (!Number.isFinite(requestId) || requestId <= 0) {
    return res.status(400).json({ ok: false, message: "request_id required" });
  }

  const result = await compileEngineeringRequest({ tenantId: tenant.id, requestId });
  if (!result.ok && result.status === "rejected") return res.status(422).json(result);
  if (!result.ok) return res.status(500).json(result);
  return res.json(result);
});

router.post("/execute", async (req: any, res) => {
  if (!requireEngineeringKernelUi(req, res)) return;
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const revisionIdRaw = req.body?.revision_id ?? req.body?.revisionId;
  const revisionId = Number(revisionIdRaw);
  if (!Number.isFinite(revisionId) || revisionId <= 0) {
    return res.status(400).json({ ok: false, message: "revision_id required" });
  }

  const nodeIdRaw = req.body?.node_id ?? req.body?.nodeId ?? null;
  const nodeId = nodeIdRaw ? String(nodeIdRaw).trim() : null;

  const result = await executeMachineRevision({ tenantId: tenant.id, revisionId, nodeId });
  if (!result.ok && result.reason === "not_found") return res.status(404).json(result);
  if (!result.ok) return res.status(500).json(result);

  const artifacts = result.artifactsLocation ? await listArtifacts(result.artifactsLocation) : null;
  const artifactsRel =
    result.artifactsLocation && process.env.ENGINEERING_ARTIFACTS_ROOT
      ? path.relative(process.env.ENGINEERING_ARTIFACTS_ROOT, result.artifactsLocation)
      : null;

  return res.json({
    ...result,
    artifacts: artifacts?.ok ? artifacts.files : [],
    artifactsLocationRelative: artifactsRel,
  });
});

router.get("/machines/:machineId/revisions", async (req: any, res) => {
  if (!requireEngineeringKernelUi(req, res)) return;
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const machineId = asInt(req.params?.machineId);
  if (!machineId) return res.status(400).json({ ok: false, message: "machineId required" });

  const machine = await db.query.machines.findFirst({
    where: and(eq(machines.id, machineId), eq(machines.tenantId, tenant.id)),
  });
  if (!machine) return res.status(404).json({ ok: false, message: "not_found" });

  const revisions = await db.query.machineRevisions.findMany({
    where: eq(machineRevisions.machineId, machineId),
    orderBy: [desc(machineRevisions.revision)],
    limit: 200,
  });

  res.json({
    ok: true,
    machine: { id: machine.id, machineFamily: machine.machineFamily, status: machine.status },
    revisions: revisions.map((r) => ({
      id: r.id,
      revision: r.revision,
      parametersHash: r.parametersHash,
      createdAt: r.createdAt,
    })),
  });
});

router.get("/revisions/:revisionId", async (req: any, res) => {
  if (!requireEngineeringKernelUi(req, res)) return;
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const revisionId = asInt(req.params?.revisionId);
  if (!revisionId) return res.status(400).json({ ok: false, message: "revisionId required" });

  const row = await requireRevisionTenant({ tenantId: tenant.id, revisionId });
  if (!row) return res.status(404).json({ ok: false, message: "not_found" });

  try {
    await ensureRevisionPreviewArtifacts({ tenantId: tenant.id, revisionId });
  } catch {
    // best-effort
  }

  const previews = await db.query.previewArtifacts.findMany({
    where: eq(previewArtifacts.revisionId, revisionId),
    orderBy: [desc(previewArtifacts.createdAt)],
    limit: 10,
  });

  const actions = await db.query.machineEditActions.findMany({
    where: eq(machineEditActions.revisionId, revisionId),
    orderBy: [desc(machineEditActions.createdAt)],
    limit: 200,
  });

  const latestJob = await db.query.fabricationJobs.findFirst({
    where: and(eq(fabricationJobs.revisionId, revisionId), eq(fabricationJobs.status, "completed")),
    orderBy: [desc(fabricationJobs.updatedAt)],
  });

  res.json({
    ok: true,
    revision: {
      id: row.revisionId,
      revision: row.revision,
      machineId: row.machineId,
      machineFamily: row.machineFamily,
      parametersHash: row.parametersHash,
      createdAt: row.createdAt,
      recipe: (row.recipe as any) ?? {},
      previewArtifacts: previews.map((p) => ({
        kind: p.kind,
        sha256: p.sha256 ?? null,
        url: `/api/internal/engineering/revisions/${revisionId}/preview?kind=${encodeURIComponent(String(p.kind))}`,
      })),
      latestExecution: latestJob
        ? {
            jobId: latestJob.id,
            nodeId: latestJob.nodeId,
            artifactsLocation: latestJob.artifactsLocation,
            updatedAt: latestJob.updatedAt,
          }
        : null,
      actions: actions.map((a) => ({ id: a.id, createdAt: a.createdAt, action: a.action })),
    },
  });
});

router.post("/revisions/:revisionId/regenerate", async (req: any, res) => {
  if (!requireEngineeringKernelUi(req, res)) return;
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const revisionId = asInt(req.params?.revisionId);
  if (!revisionId) return res.status(400).json({ ok: false, message: "revisionId required" });

  const patch = req.body?.parameters ?? req.body?.parametersPatch ?? req.body?.patch ?? {};
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return res.status(400).json({ ok: false, message: "parameters patch required" });
  }

  const action = req.body?.action && typeof req.body.action === "object" && !Array.isArray(req.body.action) ? req.body.action : null;

  const result = await regenerateMachineRevision({
    tenantId: tenant.id,
    baseRevisionId: revisionId,
    parametersPatch: patch as any,
    action: action ? (action as any) : undefined,
    user: req.staffUser ?? null,
  });

  if (!result.ok) return res.status(422).json(result);
  return res.status(201).json(result);
});

router.get("/revisions/:revisionId/preview", async (req: any, res) => {
  if (!requireEngineeringKernelUi(req, res)) return;
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const revisionId = asInt(req.params?.revisionId);
  if (!revisionId) return res.status(400).json({ ok: false, message: "revisionId required" });

  const kindRaw = String(req.query?.kind || "glb").trim().toLowerCase();
  const kind = kindRaw === "stl" ? "stl" : "glb";

  let file = await readPreviewArtifactFile({ tenantId: tenant.id, revisionId, kind });
  if (!file.ok && file.reason === "missing_preview") {
    try {
      await ensureRevisionPreviewArtifacts({ tenantId: tenant.id, revisionId, force: true });
    } catch {
      // ignore
    }
    file = await readPreviewArtifactFile({ tenantId: tenant.id, revisionId, kind });
  }

  if (!file.ok) return res.status(404).json({ ok: false, message: file.reason });

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", kind === "glb" ? "model/gltf-binary" : "model/stl");
  const stream = fsSync.createReadStream(file.absolutePath);
  stream.on("error", () => res.status(404).end());
  stream.pipe(res);
});

router.get("/revisions/:revisionId/artifacts", async (req: any, res) => {
  if (!requireEngineeringKernelUi(req, res)) return;
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const revisionId = asInt(req.params?.revisionId);
  if (!revisionId) return res.status(400).json({ ok: false, message: "revisionId required" });

  const row = await requireRevisionTenant({ tenantId: tenant.id, revisionId });
  if (!row) return res.status(404).json({ ok: false, message: "not_found" });

  const latestJob = await db.query.fabricationJobs.findFirst({
    where: and(eq(fabricationJobs.revisionId, revisionId), eq(fabricationJobs.status, "completed")),
    orderBy: [desc(fabricationJobs.updatedAt)],
  });

  if (!latestJob?.artifactsLocation) {
    return res.json({ ok: true, artifactsLocation: null, files: [] });
  }

  const artifacts = await listArtifacts(latestJob.artifactsLocation);
  const files = artifacts.ok ? artifacts.files : [];

  res.json({
    ok: true,
    artifactsLocation: latestJob.artifactsLocation,
    files: files.map((name) => ({
      name,
      kind: name.split(".").pop() || null,
      contentType: contentTypeForFilename(name),
      url: `/api/internal/engineering/revisions/${revisionId}/artifacts/${encodeURIComponent(name)}`,
    })),
  });
});

router.get("/revisions/:revisionId/artifacts/:filename", async (req: any, res) => {
  if (!requireEngineeringKernelUi(req, res)) return;
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const revisionId = asInt(req.params?.revisionId);
  if (!revisionId) return res.status(400).json({ ok: false, message: "revisionId required" });

  const filename = String(req.params?.filename || "").trim();
  if (!isSafeFilename(filename)) return res.status(400).json({ ok: false, message: "invalid filename" });

  const row = await requireRevisionTenant({ tenantId: tenant.id, revisionId });
  if (!row) return res.status(404).json({ ok: false, message: "not_found" });

  const latestJob = await db.query.fabricationJobs.findFirst({
    where: and(eq(fabricationJobs.revisionId, revisionId), eq(fabricationJobs.status, "completed")),
    orderBy: [desc(fabricationJobs.updatedAt)],
  });
  if (!latestJob?.artifactsLocation) return res.status(404).json({ ok: false, message: "missing_artifacts" });

  const base = path.resolve(latestJob.artifactsLocation);
  const abs = path.resolve(base, filename);
  if (!(abs === base || abs.startsWith(base + path.sep))) return res.status(400).json({ ok: false, message: "invalid path" });

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", contentTypeForFilename(filename));
  res.setHeader("Content-Disposition", `inline; filename=\"${filename}\"`);

  const stream = fsSync.createReadStream(abs);
  stream.on("error", () => res.status(404).end());
  stream.pipe(res);
});

export default router;
