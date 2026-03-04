import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { db } from "@db";
import { sql } from "drizzle-orm";
import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";
import {
  countForgeRequestsToday,
  createActionForgeRequest,
  isDevAgentActor,
  isFeatureEnabled,
  normalizeActionKey,
  resolveProtectedTables,
  updateForgeRequestStatus,
  type ForgeRequestRow,
} from "../lib/actions/forge";

const router = Router();

function rows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function tenantIdFromReq(req: any) {
  const value = Number(req?.tenant?.id || 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function getForgeRequest(tenantId: number, requestId: string) {
  const result = await db.execute(sql`
    select *
    from action_forge_requests
    where tenant_id = ${tenantId}
      and id = ${requestId}
    limit 1
  `);
  return rows<ForgeRequestRow>(result)[0] || null;
}

function parseSpecPath(actionKey: string) {
  return path.resolve(process.cwd(), "server", "src", "actions", "specs", `${normalizeActionKey(actionKey).toLowerCase()}.json`);
}

function parseHandlerPath(actionKey: string) {
  return path.resolve(process.cwd(), "server", "lib", "actions", "generated", `${normalizeActionKey(actionKey).toLowerCase()}.ts`);
}

function parseTestPath(actionKey: string) {
  return path.resolve(process.cwd(), "tests", "actions", `${normalizeActionKey(actionKey).toLowerCase()}.test.ts`);
}

function forgeEnabled() {
  return isFeatureEnabled("FEATURE_ACTION_FORGE", true);
}

function canManageForge(staffUser: any) {
  if (isDevAgentActor(staffUser)) return true;
  const currentMode = String(staffUser?.currentMode || "").toLowerCase();
  const roles = Array.isArray(staffUser?.roles) ? staffUser.roles.map((r: any) => String(r || "").toLowerCase()) : [];
  const perms = Array.isArray(staffUser?.permissions) ? staffUser.permissions.map((p: any) => String(p || "").toLowerCase()) : [];
  return currentMode === "admin" || roles.includes("admin") || perms.includes("*") || perms.includes("admin:*");
}

router.use(ensureTenantStaff);

router.get("/requests", async (req: any, res) => {
  try {
    if (!forgeEnabled()) return res.status(404).json({ message: "Action Forge disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const status = String(req.query?.status || "").trim().toUpperCase();
    const result = await db.execute(sql`
      select *
      from action_forge_requests
      where tenant_id = ${tenantId}
        and (${status ? sql`status = ${status}` : sql`true`})
      order by created_at desc
      limit 200
    `);
    return res.json({ ok: true, items: rows(result) });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to list forge requests" });
  }
});

router.get("/requests/:id", async (req: any, res) => {
  try {
    if (!forgeEnabled()) return res.status(404).json({ message: "Action Forge disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const request = await getForgeRequest(tenantId, String(req.params?.id || ""));
    if (!request) return res.status(404).json({ message: "Forge request not found" });
    const eventsResult = await db.execute(sql`
      select *
      from action_forge_events
      where request_id = ${request.id}
      order by created_at desc
      limit 200
    `);
    return res.json({ ok: true, request, events: rows(eventsResult) });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch forge request" });
  }
});

router.post("/requests", async (req: any, res) => {
  try {
    if (!forgeEnabled()) return res.status(404).json({ message: "Action Forge disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const staffUser = req.staffUser;
    if (!canManageForge(staffUser)) {
      return res.status(403).json({ message: "DEV_AGENT or admin role required" });
    }

    const desiredActionKey = normalizeActionKey(String(req.body?.desiredActionKey || req.body?.key || ""));
    if (!desiredActionKey) return res.status(400).json({ message: "desiredActionKey required" });

    const perTenantLimit = Number.parseInt(String(process.env.ACTION_FORGE_DAILY_LIMIT || "20"), 10) || 20;
    const countToday = await countForgeRequestsToday(tenantId);
    if (countToday >= perTenantLimit) {
      return res.status(429).json({
        message: `Daily forge limit reached (${perTenantLimit}/tenant/day)`,
        code: "FORGE_RATE_LIMIT",
      });
    }

    const row = await createActionForgeRequest({
      tenantId,
      requestedByUserId: staffUser?.id ? Number(staffUser.id) : null,
      desiredActionKey,
      desiredDescription: String(req.body?.desiredDescription || req.body?.description || "").trim() || null,
      desiredEntity: String(req.body?.desiredEntity || req.body?.entity || "").trim() || null,
      metadata: {
        source: "manual_request",
      },
    });
    return res.status(201).json({ ok: true, request: row });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to create forge request" });
  }
});

router.post("/:id/draft-spec", async (req: any, res) => {
  try {
    if (!forgeEnabled()) return res.status(404).json({ message: "Action Forge disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    if (!canManageForge(req.staffUser)) return res.status(403).json({ message: "DEV_AGENT or admin role required" });

    const request = await getForgeRequest(tenantId, String(req.params?.id || ""));
    if (!request) return res.status(404).json({ message: "Forge request not found" });

    const actionKey = normalizeActionKey(request.desired_action_key);
    const specPath = parseSpecPath(actionKey);
    await fs.mkdir(path.dirname(specPath), { recursive: true });

    const requiredParams = Array.isArray(req.body?.requiredParams) ? req.body.requiredParams.map(String) : [];
    const optionalParams = Array.isArray(req.body?.optionalParams) ? req.body.optionalParams.map(String) : [];
    const allowedRoles = Array.isArray(req.body?.allowedRoles) ? req.body.allowedRoles.map(String) : ["admin", "dev_agent"];
    const category = String(req.body?.category || "SYSTEM").toUpperCase();
    const entity = String(req.body?.entity || request.desired_entity || "system");
    const spec = {
      key: actionKey,
      entity,
      category: ["DB_MUTATION", "WORKSTATION", "SYSTEM", "READ"].includes(category) ? category : "SYSTEM",
      requiredParams,
      optionalParams,
      allowedRoles,
      description: request.desired_description || `Forged action: ${actionKey}`,
      sideEffects: {
        tablesTouched: Array.isArray(req.body?.tablesTouched) ? req.body.tablesTouched.map(String) : [],
        externalCalls: Array.isArray(req.body?.externalCalls) ? req.body.externalCalls.map(String) : [],
      },
      validationRules: {
        paramSchemas: req.body?.paramSchemas && typeof req.body.paramSchemas === "object" ? req.body.paramSchemas : {},
      },
      receipts: {
        required: Array.isArray(req.body?.requiredReceipts) ? req.body.requiredReceipts.map(String) : ["DB_MUTATION"],
      },
    };

    await fs.writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

    const protectedTables = new Set(resolveProtectedTables());
    const touched = (spec.sideEffects.tablesTouched || []).map((x: string) => x.toLowerCase());
    const touchesProtected = touched.some((table: string) => protectedTables.has(table));

    const updated = await updateForgeRequestStatus({
      requestId: request.id,
      statusTo: "SPEC_DRAFTED",
      notes: "Spec drafted",
      patch: {
        specPath,
        touchesProtectedTables: touchesProtected,
        protectedTablesHit: touched.filter((table: string) => protectedTables.has(table)),
      },
    });

    return res.json({
      ok: true,
      request: updated,
      specPath,
      touchesProtectedTables: touchesProtected,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to draft spec" });
  }
});

router.post("/:id/generate-implementation", async (req: any, res) => {
  try {
    if (!forgeEnabled()) return res.status(404).json({ message: "Action Forge disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    if (!canManageForge(req.staffUser)) return res.status(403).json({ message: "DEV_AGENT or admin role required" });

    const request = await getForgeRequest(tenantId, String(req.params?.id || ""));
    if (!request) return res.status(404).json({ message: "Forge request not found" });

    const actionKey = normalizeActionKey(request.desired_action_key);
    const handlerPath = parseHandlerPath(actionKey);
    await fs.mkdir(path.dirname(handlerPath), { recursive: true });

    const handlerSource = `import type { ActionReceiptInput } from "../worker";

export async function run${actionKey.replace(/_([a-z])/gi, (_, c) => c.toUpperCase())}(_: Record<string, unknown>) {
  // TODO(Action Forge): implement handler logic and return concrete result.
  const receipts: ActionReceiptInput[] = [
    {
      receiptType: "DB_MUTATION",
      entityType: "${String(request.desired_entity || "entity")}",
      entityIds: [],
      affectedRows: 0,
    },
  ];
  return {
    ok: false,
    message: "UNIMPLEMENTED_FORGED_ACTION",
    receipts,
  };
}
`;

    await fs.writeFile(handlerPath, handlerSource, "utf8");
    const updated = await updateForgeRequestStatus({
      requestId: request.id,
      statusTo: "IMPLEMENTED",
      notes: "Implementation stub generated",
      patch: { handlerPath },
    });
    return res.json({ ok: true, request: updated, handlerPath });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to generate implementation" });
  }
});

router.post("/:id/generate-tests", async (req: any, res) => {
  try {
    if (!forgeEnabled()) return res.status(404).json({ message: "Action Forge disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    if (!canManageForge(req.staffUser)) return res.status(403).json({ message: "DEV_AGENT or admin role required" });

    const request = await getForgeRequest(tenantId, String(req.params?.id || ""));
    if (!request) return res.status(404).json({ message: "Forge request not found" });

    const actionKey = normalizeActionKey(request.desired_action_key);
    const testPath = parseTestPath(actionKey);
    await fs.mkdir(path.dirname(testPath), { recursive: true });

    const testSource = `import { describe, it, expect } from "vitest";

describe("forged action: ${actionKey}", () => {
  it("requires explicit receipts contract", () => {
    const required = ["DB_MUTATION", "WORKSTATION_EVENT", "HTTP_CALL", "FILE_ARTIFACT"];
    expect(Array.isArray(required)).toBe(true);
  });
});
`;
    await fs.writeFile(testPath, testSource, "utf8");
    const updated = await updateForgeRequestStatus({
      requestId: request.id,
      statusTo: "TESTED",
      notes: "Test stubs generated",
      patch: { testPath },
    });
    return res.json({ ok: true, request: updated, testPath });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to generate tests" });
  }
});

router.post("/:id/open-pr", async (req: any, res) => {
  try {
    if (!forgeEnabled()) return res.status(404).json({ message: "Action Forge disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    if (!canManageForge(req.staffUser)) return res.status(403).json({ message: "DEV_AGENT or admin role required" });

    const request = await getForgeRequest(tenantId, String(req.params?.id || ""));
    if (!request) return res.status(404).json({ message: "Forge request not found" });

    const artifactPath = path.resolve(process.cwd(), "docs", "debug", `ACTION_FORGE_${request.id}.md`);
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    const content = [
      `# Action Forge Request ${request.id}`,
      ``,
      `- action_key: ${request.desired_action_key}`,
      `- entity: ${request.desired_entity || "n/a"}`,
      `- status: ${request.status}`,
      `- generated_at: ${new Date().toISOString()}`,
      ``,
      `## Notes`,
      `${request.desired_description || "No description provided."}`,
    ].join("\n");
    await fs.writeFile(artifactPath, `${content}\n`, "utf8");

    const updated = await updateForgeRequestStatus({
      requestId: request.id,
      statusTo: request.status === "TESTED" ? "TESTED" : request.status,
      notes: "PR artifact generated",
      prUrl: artifactPath,
      patch: { prArtifactPath: artifactPath },
    });
    return res.json({ ok: true, request: updated, prUrl: artifactPath });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to open PR artifact" });
  }
});

router.post("/:id/mark-ready", async (req: any, res) => {
  try {
    if (!forgeEnabled()) return res.status(404).json({ message: "Action Forge disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    if (!canManageForge(req.staffUser)) return res.status(403).json({ message: "DEV_AGENT or admin role required" });

    const request = await getForgeRequest(tenantId, String(req.params?.id || ""));
    if (!request) return res.status(404).json({ message: "Forge request not found" });
    const updated = await updateForgeRequestStatus({
      requestId: request.id,
      statusTo: "NEEDS_REVIEW",
      notes: String(req.body?.notes || "Ready for admin review"),
    });
    return res.json({ ok: true, request: updated });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to mark ready" });
  }
});

router.post("/:id/approve", ensureTenantAdmin, async (req: any, res) => {
  try {
    if (!forgeEnabled()) return res.status(404).json({ message: "Action Forge disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const request = await getForgeRequest(tenantId, String(req.params?.id || ""));
    if (!request) return res.status(404).json({ message: "Forge request not found" });
    const updated = await updateForgeRequestStatus({
      requestId: request.id,
      statusTo: "APPROVED",
      notes: String(req.body?.notes || "Approved by admin"),
    });
    return res.json({ ok: true, request: updated });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to approve request" });
  }
});

router.post("/:id/reject", ensureTenantAdmin, async (req: any, res) => {
  try {
    if (!forgeEnabled()) return res.status(404).json({ message: "Action Forge disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const request = await getForgeRequest(tenantId, String(req.params?.id || ""));
    if (!request) return res.status(404).json({ message: "Forge request not found" });
    const reason = String(req.body?.reason || req.body?.notes || "Rejected by admin");
    const updated = await updateForgeRequestStatus({
      requestId: request.id,
      statusTo: "REJECTED",
      notes: reason,
      errorLog: reason,
    });
    return res.json({ ok: true, request: updated });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to reject request" });
  }
});

router.post("/:id/publish", ensureTenantAdmin, async (req: any, res) => {
  try {
    if (!forgeEnabled()) return res.status(404).json({ message: "Action Forge disabled" });
    const tenantId = tenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });
    const request = await getForgeRequest(tenantId, String(req.params?.id || ""));
    if (!request) return res.status(404).json({ message: "Forge request not found" });
    if (!["APPROVED", "NEEDS_REVIEW"].includes(String(request.status || "").toUpperCase())) {
      return res.status(409).json({ message: "Request must be approved before publish" });
    }

    const actionKey = normalizeActionKey(request.desired_action_key);
    const registryPath = path.resolve(process.cwd(), "actions_registry.json");
    let registry: any = [];
    try {
      const raw = await fs.readFile(registryPath, "utf8");
      registry = JSON.parse(raw);
    } catch {
      registry = [];
    }

    const nextRegistry = Array.isArray(registry)
      ? Array.from(new Set([...registry.map((x) => String(x)), actionKey]))
      : Array.isArray(registry?.actions)
        ? { ...registry, actions: Array.from(new Set([...registry.actions.map((x: any) => String(x)), actionKey])) }
        : { actions: [actionKey] };

    await fs.writeFile(registryPath, `${JSON.stringify(nextRegistry, null, 2)}\n`, "utf8");

    const updated = await updateForgeRequestStatus({
      requestId: request.id,
      statusTo: "PUBLISHED",
      notes: "Published to action registry",
      patch: { publishedAt: new Date().toISOString(), publishedActionKey: actionKey },
    });
    return res.json({ ok: true, request: updated, actionKey });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to publish request" });
  }
});

export default router;
