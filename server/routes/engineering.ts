import { Router } from "express";
import { compileEngineeringRequest, createEngineeringRequest } from "../lib/engineering/kernel";
import { executeMachineRevision } from "../lib/engineering/executor";

const router = Router();

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ ok: false, message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function requireInternalKey(req: any, res: any) {
  const expected = String(process.env.ENGINEERING_KERNEL_INTERNAL_KEY || "").trim();
  if (!expected) {
    res.status(503).json({ ok: false, message: "Engineering kernel internal key not configured" });
    return false;
  }

  const provided = String(req.headers["x-engineering-kernel-key"] || "").trim();
  if (!provided || provided !== expected) {
    res.status(403).json({ ok: false, message: "Forbidden" });
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
    out[key] = raw[key];
  }
  return out;
}

router.post("/intent", async (req: any, res) => {
  if (!requireInternalKey(req, res)) return;
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
  if (!requireInternalKey(req, res)) return;
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
  if (!requireInternalKey(req, res)) return;
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
  return res.json(result);
});

export default router;
