import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";

import { ActionExecutionError, executeAction } from "../lib/actions/executeAction";
import {
  approveCommercialOfferPricing,
  CommercialOfferPolicyError,
  CommercialOfferServiceError,
  createCommercialOrderFromAcceptedOffer,
  createCommercialOfferDraft,
  issueCommercialOffer,
  listCommercialOffers,
  recordCommercialOfferCustomerResponse,
  rejectCommercialOfferPricing,
  submitCommercialOfferForApproval,
} from "../lib/exportunity/commercialOffer";
import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";

const router = Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveExportunityTenant(req: any, res: Response) {
  const tenant = req.tenant;
  if (!tenant || String(tenant.key || "").trim().toLowerCase() !== "exportunity") {
    res.status(404).json({
      ok: false,
      message: "Exportunity commercial offers are not available for this tenant.",
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

function validOfferId(value: unknown) {
  const offerId = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(offerId) ? offerId : null;
}

function sendCommercialOfferError(res: Response, error: unknown) {
  if (error instanceof CommercialOfferPolicyError) {
    return res.status(422).json({
      ok: false,
      code: error.code,
      message: error.message,
    });
  }
  if (error instanceof CommercialOfferServiceError) {
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
    "[Exportunity commercial offer] request failed",
    error instanceof Error ? error.message : String(error),
  );
  return res.status(500).json({
    ok: false,
    code: "COMMERCIAL_OFFER_REQUEST_FAILED",
    message: "The Exportunity commercial offer request could not be completed.",
  });
}

async function executeCommercialOfferHandler<T>(handler: () => Promise<T>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof CommercialOfferPolicyError) {
      throw new ActionExecutionError(error.message, {
        statusCode: 422,
        code: error.code,
      });
    }
    if (error instanceof CommercialOfferServiceError) {
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
  const requirementId = req.query?.requirementId
    ? validOfferId(req.query.requirementId)
    : null;
  if (req.query?.requirementId && !requirementId) {
    return res.status(400).json({
      ok: false,
      code: "COMMERCIAL_OFFER_REQUIREMENT_ID_INVALID",
      message: "A valid commercial requirement UUID is required.",
    });
  }
  try {
    const result = await listCommercialOffers({
      tenantId: tenant.id,
      tenantKey: tenant.key,
      limit: Number(req.query?.limit || 100),
      requirementId,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return sendCommercialOfferError(res, error);
  }
});

router.post("/", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  const correlationId = `exportunity_offer_draft_${randomUUID()}`;
  try {
    const execution = await executeAction(
      "COMMERCIAL_OFFER_DRAFT_CREATE",
      req.body || {},
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_staff",
        mode: "LIVE",
        correlationId,
        metadata: {
          productBoundary: "exportunity",
          exactMinorUnits: true,
          sourceSupplierQuoteRequired: true,
          sourceSupplierCostPrivate: true,
          currencyConversionPerformed: false,
          externalSideEffect: false,
          customerOfferIssued: false,
          orderCreated: false,
          paymentCreated: false,
        },
      },
      () =>
        executeCommercialOfferHandler(() =>
          createCommercialOfferDraft({
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
    return sendCommercialOfferError(res, error);
  }
});

router.post("/:id/submit", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const offerId = validOfferId(req.params?.id);
  if (!offerId) {
    return res.status(400).json({
      ok: false,
      code: "COMMERCIAL_OFFER_ID_INVALID",
      message: "A valid commercial offer UUID is required.",
    });
  }
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  try {
    const execution = await executeAction(
      "COMMERCIAL_OFFER_SUBMIT_FOR_APPROVAL",
      { ...(req.body || {}), offerId },
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_staff",
        mode: "LIVE",
        metadata: {
          productBoundary: "exportunity",
          pricingHashBound: true,
          externalSideEffect: false,
          customerOfferIssued: false,
          orderCreated: false,
          paymentCreated: false,
        },
      },
      () =>
        executeCommercialOfferHandler(() =>
          submitCommercialOfferForApproval({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            offerId,
            payload: req.body || {},
          }),
        ),
    );
    return res.json({ ok: true, action: execution, ...execution.result });
  } catch (error) {
    return sendCommercialOfferError(res, error);
  }
});

router.post("/:id/approve", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const offerId = validOfferId(req.params?.id);
  if (!offerId) {
    return res.status(400).json({
      ok: false,
      code: "COMMERCIAL_OFFER_ID_INVALID",
      message: "A valid commercial offer UUID is required.",
    });
  }
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  const correlationId = `exportunity_offer_approval_${randomUUID()}`;
  try {
    const execution = await executeAction(
      "COMMERCIAL_OFFER_PRICING_APPROVE",
      { ...(req.body || {}), offerId },
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_admin",
        mode: "LIVE",
        correlationId,
        approvalReason:
          "An Exportunity administrator must approve the exact supplier lineage, cost stack, margin, validity, and customer terms. This approval does not issue the offer.",
        metadata: {
          productBoundary: "exportunity",
          evidenceRequired: true,
          pricingHashBound: true,
          sourceSupplierCostPrivate: true,
          separateIssueActionRequired: true,
          externalSideEffect: false,
          customerOfferIssued: false,
          orderCreated: false,
          paymentCreated: false,
        },
      },
      () =>
        executeCommercialOfferHandler(() =>
          approveCommercialOfferPricing({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            offerId,
            payload: req.body || {},
          }),
        ),
    );
    return res.json({ ok: true, action: execution, ...execution.result });
  } catch (error) {
    return sendCommercialOfferError(res, error);
  }
});

router.post("/:id/reject", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const offerId = validOfferId(req.params?.id);
  if (!offerId) {
    return res.status(400).json({
      ok: false,
      code: "COMMERCIAL_OFFER_ID_INVALID",
      message: "A valid commercial offer UUID is required.",
    });
  }
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  try {
    const execution = await executeAction(
      "COMMERCIAL_OFFER_PRICING_REJECT",
      { ...(req.body || {}), offerId },
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_admin",
        mode: "LIVE",
        metadata: {
          productBoundary: "exportunity",
          pricingHashBound: true,
          externalSideEffect: false,
          customerOfferIssued: false,
          orderCreated: false,
          paymentCreated: false,
        },
      },
      () =>
        executeCommercialOfferHandler(() =>
          rejectCommercialOfferPricing({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            offerId,
            payload: req.body || {},
          }),
        ),
    );
    return res.json({ ok: true, action: execution, ...execution.result });
  } catch (error) {
    return sendCommercialOfferError(res, error);
  }
});

router.post("/:id/issue", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const offerId = validOfferId(req.params?.id);
  if (!offerId) {
    return res.status(400).json({
      ok: false,
      code: "COMMERCIAL_OFFER_ID_INVALID",
      message: "A valid commercial offer UUID is required.",
    });
  }
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  const correlationId = `exportunity_offer_issue_${randomUUID()}`;
  try {
    const execution = await executeAction(
      "COMMERCIAL_OFFER_ISSUE",
      { ...(req.body || {}), offerId },
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_admin",
        mode: "LIVE",
        correlationId,
        approvalReason:
          "An Exportunity administrator must recheck the exact pricing hash, current supplier evidence, customer context, terms, and validity before issuing the customer offer.",
        metadata: {
          productBoundary: "exportunity",
          evidenceRequired: true,
          pricingHashBound: true,
          sourceQualificationRechecked: true,
          sourceSupplierCostPrivate: true,
          customerOfferIssued: true,
          customerMessageSent: false,
          externalSideEffect: false,
          orderCreated: false,
          paymentCreated: false,
        },
      },
      () =>
        executeCommercialOfferHandler(() =>
          issueCommercialOffer({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            offerId,
            payload: req.body || {},
          }),
        ),
    );
    return res.json({ ok: true, action: execution, ...execution.result });
  } catch (error) {
    return sendCommercialOfferError(res, error);
  }
});

router.post(
  "/:id/customer-response",
  ensureTenantAdmin,
  async (req: any, res) => {
    const tenant = resolveExportunityTenant(req, res);
    if (!tenant) return;
    const offerId = validOfferId(req.params?.id);
    if (!offerId) {
      return res.status(400).json({
        ok: false,
        code: "COMMERCIAL_OFFER_ID_INVALID",
        message: "A valid commercial offer UUID is required.",
      });
    }
    const actor = resolveActor(req);
    const actorUserId = resolveActorId(actor);
    const correlationId = `exportunity_offer_response_${randomUUID()}`;
    try {
      const execution = await executeAction(
        "COMMERCIAL_OFFER_CUSTOMER_RESPONSE_RECORD",
        { ...(req.body || {}), offerId },
        {
          tenantId: tenant.id,
          actorUserId,
          actor,
          actorRole: "exportunity_admin",
          mode: "LIVE",
          correlationId,
          approvalReason:
            "An Exportunity administrator must bind the evidenced customer response to the exact issued pricing hash. This action sends no message and creates no order.",
          metadata: {
            productBoundary: "exportunity",
            evidenceRequired: true,
            pricingHashBound: true,
            customerIdentityConfirmed: true,
            externalSideEffect: false,
            customerMessageSent: false,
            customerResponseRecorded: true,
            orderCreated: false,
            paymentCreated: false,
          },
        },
        () =>
          executeCommercialOfferHandler(() =>
            recordCommercialOfferCustomerResponse({
              tenantId: tenant.id,
              tenantKey: tenant.key,
              actorUserId,
              offerId,
              payload: req.body || {},
            }),
          ),
      );
      return res.json({ ok: true, action: execution, ...execution.result });
    } catch (error) {
      return sendCommercialOfferError(res, error);
    }
  },
);

router.post("/:id/order", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const offerId = validOfferId(req.params?.id);
  if (!offerId) {
    return res.status(400).json({
      ok: false,
      code: "COMMERCIAL_OFFER_ID_INVALID",
      message: "A valid commercial offer UUID is required.",
    });
  }
  const actor = resolveActor(req);
  const actorUserId = resolveActorId(actor);
  const correlationId = `exportunity_order_create_${randomUUID()}`;
  try {
    const execution = await executeAction(
      "COMMERCIAL_ORDER_CREATE_FROM_ACCEPTED_OFFER",
      { ...(req.body || {}), offerId },
      {
        tenantId: tenant.id,
        actorUserId,
        actor,
        actorRole: "exportunity_admin",
        mode: "LIVE",
        correlationId,
        approvalReason:
          "An Exportunity administrator must recheck the accepted pricing hash, customer-response evidence, exact amount, and separation from payment, procurement, and fulfilment before creating the order record.",
        metadata: {
          productBoundary: "exportunity",
          evidenceRequired: true,
          pricingHashBound: true,
          customerResponseHashBound: true,
          exactMinorUnits: true,
          externalSideEffect: false,
          orderCreated: true,
          paymentCreated: false,
          procurementStarted: false,
          fulfillmentInitialized: false,
        },
      },
      () =>
        executeCommercialOfferHandler(() =>
          createCommercialOrderFromAcceptedOffer({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            actorUserId,
            offerId,
            payload: req.body || {},
          }),
        ),
    );
    return res.status(execution.result?.created ? 201 : 200).json({
      ok: true,
      action: execution,
      ...execution.result,
    });
  } catch (error) {
    return sendCommercialOfferError(res, error);
  }
});

export default router;
