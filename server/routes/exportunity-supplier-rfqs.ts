import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";

import { ActionExecutionError, executeAction } from "../lib/actions/executeAction";
import {
  approveSupplierRfqOutreach,
  createSupplierRfqDraft,
  listSupplierRfqs,
  rejectSupplierRfq,
  submitSupplierRfqForApproval,
  SupplierRfqServiceError,
} from "../lib/exportunity/supplierRfq";
import {
  SupplierRfqPolicyError,
  type SupplierRfqStatus,
} from "../lib/exportunity/supplierRfqPolicy";
import {
  dispatchSupplierRfq,
  listSupplierRfqDispatchGovernance,
  setSupplierRfqContactControl,
  SupplierRfqDispatchServiceError,
} from "../lib/exportunity/supplierRfqDispatch";
import {
  SupplierRfqDispatchPolicyError,
} from "../lib/exportunity/supplierRfqDispatchPolicy";
import {
  listSupplierQuoteIntakes,
  reviewSupplierQuoteIntake,
  SupplierQuoteIntakePolicyError,
  SupplierQuoteIntakeServiceError,
} from "../lib/exportunity/supplierQuoteIntake";
import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";

const router = Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFQ_STATUSES = new Set<SupplierRfqStatus>([
  "draft",
  "approval_pending",
  "approved_for_outreach",
  "rejected",
  "cancelled",
]);

function resolveExportunityTenant(req: any, res: Response) {
  const tenant = req.tenant;
  if (!tenant || String(tenant.key || "").trim().toLowerCase() !== "exportunity") {
    res.status(404).json({
      ok: false,
      message: "Exportunity supplier RFQs are not available for this tenant.",
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

function validDraftId(value: unknown) {
  const draftId = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(draftId) ? draftId : null;
}

function sendRfqError(res: Response, error: unknown) {
  if (
    error instanceof SupplierRfqPolicyError ||
    error instanceof SupplierRfqDispatchPolicyError ||
    error instanceof SupplierQuoteIntakePolicyError
  ) {
    return res.status(422).json({ ok: false, code: error.code, message: error.message });
  }
  if (
    error instanceof SupplierRfqServiceError ||
    error instanceof SupplierRfqDispatchServiceError ||
    error instanceof SupplierQuoteIntakeServiceError
  ) {
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
    "[Exportunity supplier RFQ] request failed",
    error instanceof Error ? error.message : String(error),
  );
  return res.status(500).json({
    ok: false,
    code: "SUPPLIER_RFQ_REQUEST_FAILED",
    message: "The Exportunity supplier RFQ request could not be completed.",
  });
}

async function executeRfqHandler<T>(handler: () => Promise<T>) {
  try {
    return await handler();
  } catch (error) {
    if (
      error instanceof SupplierRfqPolicyError ||
      error instanceof SupplierRfqDispatchPolicyError ||
      error instanceof SupplierQuoteIntakePolicyError
    ) {
      throw new ActionExecutionError(error.message, {
        statusCode: 422,
        code: error.code,
      });
    }
    if (
      error instanceof SupplierRfqServiceError ||
      error instanceof SupplierRfqDispatchServiceError ||
      error instanceof SupplierQuoteIntakeServiceError
    ) {
      throw new ActionExecutionError(error.message, {
        statusCode: error.statusCode,
        code: error.code,
      });
    }
    throw error;
  }
}

router.get("/dispatch-governance", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  try {
    const result = await listSupplierRfqDispatchGovernance({
      tenantId: tenant.id,
      tenantKey: tenant.key,
      limit: Number(req.query?.limit || 100),
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return sendRfqError(res, error);
  }
});

router.get("/quote-intakes", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  try {
    const result = await listSupplierQuoteIntakes({
      tenantId: tenant.id,
      tenantKey: tenant.key,
      limit: Number(req.query?.limit || 100),
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return sendRfqError(res, error);
  }
});

router.get("/", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const requestedStatus = String(req.query?.status || "").trim();
  if (requestedStatus && !RFQ_STATUSES.has(requestedStatus as SupplierRfqStatus)) {
    return res.status(400).json({
      ok: false,
      code: "SUPPLIER_RFQ_STATUS_INVALID",
      message: "Unknown supplier RFQ status.",
    });
  }
  try {
    const result = await listSupplierRfqs({
      tenantId: tenant.id,
      tenantKey: tenant.key,
      status: (requestedStatus as SupplierRfqStatus) || null,
      limit: Number(req.query?.limit || 50),
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return sendRfqError(res, error);
  }
});

router.post("/contact-controls", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  const correlationId = `exportunity_rfq_contact_${randomUUID()}`;
  try {
    const execution = await executeAction(
      "SUPPLIER_RFQ_CONTACT_CONTROL_SET",
      req.body || {},
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_admin",
        mode: "LIVE",
        correlationId,
        approvalReason:
          "An Exportunity administrator must record an evidence-backed authorization or suppression for this exact verified contact and channel.",
        metadata: {
          productBoundary: "exportunity",
          evidenceRequired: true,
          verifiedContactIsNotPermission: true,
          externalSideEffect: false,
          rawContactStored: false,
        },
      },
      () =>
        executeRfqHandler(() =>
          setSupplierRfqContactControl({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            payload: req.body || {},
          }),
        ),
    );
    return res.status(execution.result?.updated ? 200 : 201).json({
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
    return sendRfqError(res, error);
  }
});

router.post(
  "/quote-intakes/:quoteIntakeId/review",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const quoteIntakeId = validDraftId(req.params?.quoteIntakeId);
    if (!quoteIntakeId) {
      return res.status(400).json({
        ok: false,
        code: "SUPPLIER_QUOTE_ID_INVALID",
        message: "A valid supplier quote intake UUID is required.",
      });
    }
    const actor = resolveActor(req);
    const actorUserId = resolveActorId(actor);
    const correlationId = `exportunity_supplier_quote_review_${randomUUID()}`;
    try {
      const execution = await executeAction(
        "SUPPLIER_QUOTE_INTAKE_REVIEW",
        { quoteIntakeId, ...(req.body || {}) },
        {
          tenantId: tenant.id,
          actorUserId,
          actor,
          actorRole: "exportunity_admin",
          mode: "LIVE",
          correlationId,
          approvalReason:
            "An Exportunity administrator must review the native source, RFQ correlation, missing fields, and normalization evidence before promoting a canonical supplier quote.",
          metadata: {
            productBoundary: "exportunity",
            evidenceRequired: true,
            externalSideEffect: false,
            deterministicNormalization: true,
            inventedFields: false,
            humanQualificationRequired: true,
            canonicalSupplierQuotePromotion: true,
            customerOfferCreated: false,
          },
        },
        () =>
          executeRfqHandler(() =>
            reviewSupplierQuoteIntake({
              tenantId: tenant.id,
              tenantKey: tenant.key,
              actorUserId,
              quoteIntakeId,
              payload: req.body || {},
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
      return sendRfqError(res, error);
    }
  },
);

router.post("/", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  try {
    const execution = await executeAction(
      "SUPPLIER_RFQ_DRAFT_CREATE",
      req.body || {},
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_staff",
        mode: "LIVE",
        metadata: {
          productBoundary: "exportunity",
          evidenceRequired: true,
          externalSideEffect: false,
          outreachAuthorized: false,
          deliveryCreated: false,
        },
      },
      () =>
        executeRfqHandler(() =>
          createSupplierRfqDraft({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            payload: req.body || {},
          }),
        ),
    );
    return res.status(execution.result?.created ? 201 : 200).json({
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
    return sendRfqError(res, error);
  }
});

router.post("/:id/dispatch", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const draftId = validDraftId(req.params?.id);
  if (!draftId) {
    return res.status(400).json({
      ok: false,
      code: "SUPPLIER_RFQ_DRAFT_ID_INVALID",
      message: "A valid supplier RFQ draft UUID is required.",
    });
  }
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  const correlationId = `exportunity_rfq_dispatch_${randomUUID()}`;
  try {
    const execution = await executeAction(
      "SUPPLIER_RFQ_DISPATCH_ONCE",
      { draftId, ...(req.body || {}) },
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_admin",
        mode: "LIVE",
        correlationId,
        approvalReason:
          "An Exportunity administrator must consume the exact RFQ approval for one recipient and one provider attempt.",
        metadata: {
          productBoundary: "exportunity",
          evidenceRequired: true,
          externalSideEffect: true,
          contentHashBound: true,
          recipientHashBound: true,
          suppressionRegistryRequired: true,
          maximumProviderAttempts: 1,
          automaticRetry: false,
          acceptedIsNotDelivered: true,
          rawContactStored: false,
        },
      },
      () =>
        executeRfqHandler(() =>
          dispatchSupplierRfq({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            draftId,
            payload: req.body || {},
            correlationId,
          }),
        ),
    );
    return res.status(execution.result?.created ? 201 : 200).json({
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
    return sendRfqError(res, error);
  }
});

router.post("/:id/submit", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const draftId = validDraftId(req.params?.id);
  if (!draftId) {
    return res.status(400).json({
      ok: false,
      code: "SUPPLIER_RFQ_DRAFT_ID_INVALID",
      message: "A valid supplier RFQ draft UUID is required.",
    });
  }
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  try {
    const execution = await executeAction(
      "SUPPLIER_RFQ_SUBMIT_FOR_APPROVAL",
      { draftId },
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_staff",
        mode: "LIVE",
        metadata: {
          productBoundary: "exportunity",
          contentFrozen: true,
          externalSideEffect: false,
          outreachAuthorized: false,
          deliveryCreated: false,
        },
      },
      () =>
        executeRfqHandler(() =>
          submitSupplierRfqForApproval({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            draftId,
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
    return sendRfqError(res, error);
  }
});

router.post("/:id/approve", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const draftId = validDraftId(req.params?.id);
  if (!draftId) {
    return res.status(400).json({
      ok: false,
      code: "SUPPLIER_RFQ_DRAFT_ID_INVALID",
      message: "A valid supplier RFQ draft UUID is required.",
    });
  }
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  try {
    const execution = await executeAction(
      "SUPPLIER_RFQ_APPROVE_OUTREACH",
      { draftId, ...(req.body || {}) },
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_admin",
        mode: "LIVE",
        approvalReason:
          "Human approval binds a time-limited outreach authorization to one exact RFQ content hash and confirmed supplier contact.",
        metadata: {
          productBoundary: "exportunity",
          evidenceRequired: true,
          contentHashBound: true,
          externalSideEffect: false,
          deliveryCreated: false,
          dispatchCreated: false,
          separateDispatchRequired: true,
        },
      },
      () =>
        executeRfqHandler(() =>
          approveSupplierRfqOutreach({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            draftId,
            payload: req.body || {},
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
    return sendRfqError(res, error);
  }
});

router.post("/:id/reject", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const draftId = validDraftId(req.params?.id);
  if (!draftId) {
    return res.status(400).json({
      ok: false,
      code: "SUPPLIER_RFQ_DRAFT_ID_INVALID",
      message: "A valid supplier RFQ draft UUID is required.",
    });
  }
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  try {
    const execution = await executeAction(
      "SUPPLIER_RFQ_REJECT",
      { draftId, ...(req.body || {}) },
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_admin",
        mode: "LIVE",
        metadata: {
          productBoundary: "exportunity",
          externalSideEffect: false,
          outreachAuthorized: false,
          deliveryCreated: false,
        },
      },
      () =>
        executeRfqHandler(() =>
          rejectSupplierRfq({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            draftId,
            payload: req.body || {},
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
    return sendRfqError(res, error);
  }
});

export default router;
