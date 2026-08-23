import { Router, type Response } from "express";

import {
  ActionExecutionError,
  executeAction,
} from "../lib/actions/executeAction";
import {
  listSupplierDiscoveryCandidates,
  recordSupplierDiscoveryCandidate,
  reviewSupplierDiscoveryCandidate,
  SupplierDiscoveryServiceError,
} from "../lib/exportunity/supplierDiscovery";
import {
  EXPORTUNITY_DISCOVERY_REVIEW_STATUSES,
  SupplierDiscoveryPolicyError,
  type SupplierDiscoveryCandidateStatus,
} from "../lib/exportunity/supplierDiscoveryPolicy";
import {
  promoteVerifiedSupplierCandidate,
  SupplierVerificationServiceError,
} from "../lib/exportunity/supplierVerification";
import { SupplierVerificationPolicyError } from "../lib/exportunity/supplierVerificationPolicy";
import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";

const router = Router();
const ALL_DISCOVERY_STATUSES = new Set<SupplierDiscoveryCandidateStatus>([
  "discovered",
  ...EXPORTUNITY_DISCOVERY_REVIEW_STATUSES,
  "promoted",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveExportunityTenant(req: any, res: Response) {
  const tenant = req.tenant;
  if (!tenant || String(tenant.key || "").trim().toLowerCase() !== "exportunity") {
    res.status(404).json({
      ok: false,
      message: "Exportunity supplier discovery is not available for this tenant.",
    });
    return null;
  }
  return tenant as { id: number; key: string };
}

function resolveActor(req: any) {
  return req.adminUser || req.staffUser || null;
}

function resolveActorId(actor: any) {
  const value = Number(actor?.id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function sendDiscoveryError(res: Response, error: unknown) {
  if (error instanceof SupplierDiscoveryPolicyError) {
    return res.status(422).json({
      ok: false,
      code: error.code,
      message: error.message,
    });
  }
  if (error instanceof SupplierDiscoveryServiceError) {
    return res.status(error.statusCode).json({
      ok: false,
      code: error.code,
      message: error.message,
    });
  }
  if (error instanceof SupplierVerificationPolicyError) {
    return res.status(422).json({
      ok: false,
      code: error.code,
      message: error.message,
    });
  }
  if (error instanceof SupplierVerificationServiceError) {
    return res.status(error.statusCode).json({
      ok: false,
      code: error.code,
      message: error.message,
    });
  }
  if (error instanceof ActionExecutionError) {
    return res.status(error.statusCode).json({
      ok: false,
      code: error.code,
      correlationId: error.correlationId,
      message: error.message,
    });
  }
  console.error(
    "[Exportunity supplier discovery] request failed",
    error instanceof Error ? error.message : String(error),
  );
  return res.status(500).json({
    ok: false,
    code: "DISCOVERY_REQUEST_FAILED",
    message: "The Exportunity supplier discovery request could not be completed.",
  });
}

async function executeDiscoveryHandler<T>(handler: () => Promise<T>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof SupplierDiscoveryPolicyError) {
      throw new ActionExecutionError(error.message, {
        statusCode: 422,
        code: error.code,
      });
    }
    if (error instanceof SupplierDiscoveryServiceError) {
      throw new ActionExecutionError(error.message, {
        statusCode: error.statusCode,
        code: error.code,
      });
    }
    if (error instanceof SupplierVerificationPolicyError) {
      throw new ActionExecutionError(error.message, {
        statusCode: 422,
        code: error.code,
      });
    }
    if (error instanceof SupplierVerificationServiceError) {
      throw new ActionExecutionError(error.message, {
        statusCode: error.statusCode,
        code: error.code,
      });
    }
    throw error;
  }
}

router.get("/", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const requestedStatus = String(req.query?.status || "").trim();
  if (
    requestedStatus &&
    !ALL_DISCOVERY_STATUSES.has(
      requestedStatus as SupplierDiscoveryCandidateStatus,
    )
  ) {
    return res.status(400).json({
      ok: false,
      code: "DISCOVERY_STATUS_INVALID",
      message: "Unknown supplier discovery queue status.",
    });
  }
  try {
    const requirementId = String(req.query?.requirementId || "").trim();
    if (requirementId && !UUID_PATTERN.test(requirementId)) {
      return res.status(400).json({
        ok: false,
        code: "DISCOVERY_REQUIREMENT_ID_INVALID",
        message: "requirementId must be a valid UUID.",
      });
    }
    const result = await listSupplierDiscoveryCandidates({
      tenantId: tenant.id,
      tenantKey: tenant.key,
      status:
        (requestedStatus as SupplierDiscoveryCandidateStatus) || null,
      requirementId: requirementId || null,
      limit: Number(req.query?.limit || 50),
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return sendDiscoveryError(res, error);
  }
});

router.post("/", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  try {
    const execution = await executeAction(
      "SUPPLIER_DISCOVERY_RECORD",
      req.body || {},
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_staff",
        mode: "LIVE",
        metadata: {
          evidenceRequired: true,
          productBoundary: "exportunity",
          externalSideEffect: false,
          outreachAllowed: false,
        },
      },
      () =>
        executeDiscoveryHandler(() =>
          recordSupplierDiscoveryCandidate({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            payload: req.body || {},
          }),
        ),
    );
    const result = execution.result;
    const wasCreated = Boolean(
      result?.created.lead ||
        result?.created.candidate ||
        result?.created.evidence,
    );
    return res.status(wasCreated ? 201 : 200).json({
      ok: true,
      action: {
        actionKey: execution.actionKey,
        correlationId: execution.correlationId,
        status: execution.status,
        resultHash: execution.resultHash,
      },
      ...result,
    });
  } catch (error) {
    return sendDiscoveryError(res, error);
  }
});

router.patch("/:id/review", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const candidateId = String(req.params?.id || "").trim();
  if (!UUID_PATTERN.test(candidateId)) {
    return res.status(400).json({
      ok: false,
      code: "DISCOVERY_CANDIDATE_ID_INVALID",
      message: "A valid discovery candidate UUID is required.",
    });
  }
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  try {
    const execution = await executeAction(
      "SUPPLIER_DISCOVERY_REVIEW",
      {
        candidateId,
        status: req.body?.status,
        notes: req.body?.notes,
      },
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_admin",
        mode: "LIVE",
        metadata: {
          evidenceRequired: true,
          productBoundary: "exportunity",
          supplierVerificationImplied: false,
          outreachAllowed: false,
        },
      },
      () =>
        executeDiscoveryHandler(() =>
          reviewSupplierDiscoveryCandidate({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            candidateId,
            nextStatus: req.body?.status,
            notes: req.body?.notes,
          }),
        ),
    );
    return res.json({
      ok: true,
      action: {
        actionKey: execution.actionKey,
        correlationId: execution.correlationId,
        status: execution.status,
        resultHash: execution.resultHash,
      },
      ...execution.result,
    });
  } catch (error) {
    return sendDiscoveryError(res, error);
  }
});

router.post("/:id/promote", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const candidateId = String(req.params?.id || "").trim();
  if (!UUID_PATTERN.test(candidateId)) {
    return res.status(400).json({
      ok: false,
      code: "SUPPLIER_VERIFICATION_CANDIDATE_ID_INVALID",
      message: "A valid discovery candidate UUID is required.",
    });
  }
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  try {
    const execution = await executeAction(
      "SUPPLIER_VERIFICATION_APPROVE",
      { candidateId, ...(req.body || {}) },
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_admin",
        mode: "LIVE",
        approvalReason:
          "Human approval promotes a provenance-backed candidate into the private verified supplier registry.",
        metadata: {
          evidenceRequired: true,
          productBoundary: "exportunity",
          verificationScope:
            "business_identity_and_requirement_product_relevance",
          identityPublic: false,
          externalSideEffect: false,
          outreachAllowed: false,
        },
      },
      () =>
        executeDiscoveryHandler(() =>
          promoteVerifiedSupplierCandidate({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            candidateId,
            payload: req.body || {},
          }),
        ),
    );
    const result = execution.result;
    return res.status(result?.created.promotion ? 201 : 200).json({
      ok: true,
      action: {
        actionKey: execution.actionKey,
        correlationId: execution.correlationId,
        status: execution.status,
        resultHash: execution.resultHash,
      },
      ...result,
    });
  } catch (error) {
    return sendDiscoveryError(res, error);
  }
});

export default router;
