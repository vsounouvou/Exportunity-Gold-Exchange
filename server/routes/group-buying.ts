import { Router } from "express";

import {
  approveGroupSettlementPlan,
  authorizeGroupBuyingCampaign,
  bindPaidIndustrialOrderToCommitment,
  getPublicGroupBuyingCampaign,
  GroupBuyingError,
  listGroupBuyingAdministration,
  listPublicGroupBuyingCampaigns,
  prepareGroupBuyingCampaign,
  prepareGroupSettlementPlan,
  prepareProductionBatch,
  publishGroupBuyingUpdate,
  recordGroupBuyingInterest,
  transitionProductionBatch,
} from "../lib/group-buying/service";
import { ensureTenantAdmin, ensureTenantUser } from "./utils/auth";

const router = Router();

function tenantFor(req: any, res: any) {
  if (!req.tenant) {
    res.status(500).json({ ok: false, message: "Tenant not resolved" });
    return null;
  }
  return req.tenant;
}

function adminActorId(req: any) {
  return Number(req.adminUser?.id || req.staffUser?.id || 0) || null;
}

function buyerActorId(req: any) {
  return Number(req.tenantUser?.id || 0) || null;
}

function errorResponse(res: any, error: unknown, fallback: string) {
  if (error instanceof GroupBuyingError) {
    return res.status(error.statusCode).json({
      ok: false,
      code: error.code,
      message: error.message,
      blockers: error.blockers,
      externalPaymentCollectionExecuted: false,
      externalProviderActionExecuted: false,
      externalSettlementExecuted: false,
    });
  }
  console.error("[group-buying] governed operation failed", error);
  return res.status(400).json({
    ok: false,
    message: String((error as any)?.message || fallback),
    externalPaymentCollectionExecuted: false,
    externalProviderActionExecuted: false,
    externalSettlementExecuted: false,
  });
}

router.get("/campaigns", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const territoryId = Number(req.query?.territoryId || 0) || null;
    const campaigns = await listPublicGroupBuyingCampaigns({
      tenantId: tenant.id,
      territoryId,
      limit: Number(req.query?.limit || 50),
    });
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({
      ok: true,
      campaigns,
      commerceDisclosure:
        "Producer Exchange campaigns are product preorders or group purchases, never investments, securities, equity interests, or guaranteed-return products.",
    });
  } catch (error) {
    errorResponse(res, error, "Failed to load group-purchase campaigns");
  }
});

router.get("/campaigns/:slug", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const campaign = await getPublicGroupBuyingCampaign({
      tenantId: tenant.id,
      slug: String(req.params.slug || "").trim().toLowerCase(),
    });
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({ ok: true, campaign });
  } catch (error) {
    errorResponse(res, error, "Failed to load the group-purchase campaign");
  }
});

router.post("/campaigns/:campaignId/interest", ensureTenantUser, async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  const buyerUserId = buyerActorId(req);
  if (!buyerUserId) return res.status(401).json({ ok: false, message: "Authentication required" });
  try {
    const result = await recordGroupBuyingInterest({
      tenantId: tenant.id,
      buyerUserId,
      campaignId: String(req.params.campaignId || ""),
      idempotencyKey: req.body?.idempotencyKey,
      quantity: req.body?.quantity,
      deliveryOptionId: req.body?.deliveryOptionId,
      buyerNotes: req.body?.buyerNotes,
      refundConditionsAccepted: req.body?.refundConditionsAccepted === true,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to record non-binding buying interest");
  }
});

router.get("/admin", ensureTenantAdmin, async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    res.json({ ok: true, ...(await listGroupBuyingAdministration(tenant.id)) });
  } catch (error) {
    errorResponse(res, error, "Failed to load group-commerce administration");
  }
});

router.post("/admin/campaigns/prepare", ensureTenantAdmin, async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await prepareGroupBuyingCampaign({
      tenantId: tenant.id,
      actorUserId: adminActorId(req),
      referenceCode: req.body?.referenceCode,
      slug: req.body?.slug,
      campaignType: req.body?.campaignType,
      catalogItemId: req.body?.catalogItemId,
      producerFactoryId: req.body?.producerFactoryId,
      supplierProfileId: req.body?.supplierProfileId,
      territoryId: req.body?.territoryId,
      campaignMediaItemId: req.body?.campaignMediaItemId,
      mediaRightsGrantId: req.body?.mediaRightsGrantId,
      title: req.body?.title,
      publicSummary: req.body?.publicSummary,
      unitOfMeasure: req.body?.unitOfMeasure,
      minimumQuantity: req.body?.minimumQuantity,
      currencyCode: req.body?.currencyCode,
      baseUnitPriceMinor: req.body?.baseUnitPriceMinor,
      deadline: req.body?.deadline,
      productionLeadTimeDays: req.body?.productionLeadTimeDays,
      estimatedReadyAt: req.body?.estimatedReadyAt,
      deliveryOptions: req.body?.deliveryOptions,
      paymentTerms: req.body?.paymentTerms,
      refundConditions: req.body?.refundConditions,
      capacityEvidence: req.body?.capacityEvidence,
      campaignContent: req.body?.campaignContent,
      tiers: req.body?.tiers,
      confirmed: req.body?.confirmed === true,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to prepare the group-purchase campaign");
  }
});

router.post("/admin/campaigns/:campaignId/authorize", ensureTenantAdmin, async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await authorizeGroupBuyingCampaign({
      tenantId: tenant.id,
      actorUserId: adminActorId(req),
      campaignId: String(req.params.campaignId || ""),
      verificationEvidence: req.body?.verificationEvidence,
      rationale: req.body?.rationale,
      confirmed: req.body?.confirmed === true,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to authorize the group-purchase campaign");
  }
});

router.post("/admin/commitments/:commitmentId/bind-paid-order", ensureTenantAdmin, async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await bindPaidIndustrialOrderToCommitment({
      tenantId: tenant.id,
      actorUserId: adminActorId(req),
      commitmentId: String(req.params.commitmentId || ""),
      industrialOrderId: String(req.body?.industrialOrderId || ""),
      paymentId: String(req.body?.paymentId || ""),
      confirmed: req.body?.confirmed === true,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to bind the canonical paid industrial order");
  }
});

router.post("/admin/campaigns/:campaignId/updates/publish", ensureTenantAdmin, async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await publishGroupBuyingUpdate({
      tenantId: tenant.id,
      actorUserId: adminActorId(req),
      campaignId: String(req.params.campaignId || ""),
      idempotencyKey: req.body?.idempotencyKey,
      audience: req.body?.audience,
      title: req.body?.title,
      body: req.body?.body,
      evidence: req.body?.evidence,
      confirmed: req.body?.confirmed === true,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to publish the campaign update");
  }
});

router.post("/admin/production-batches/prepare", ensureTenantAdmin, async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await prepareProductionBatch({
      tenantId: tenant.id,
      actorUserId: adminActorId(req),
      campaignId: String(req.body?.campaignId || ""),
      referenceCode: req.body?.referenceCode,
      commitmentIds: req.body?.commitmentIds,
      capacityEvidence: req.body?.capacityEvidence,
      confirmed: req.body?.confirmed === true,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to prepare the production batch");
  }
});

router.post("/admin/production-batches/:productionBatchId/transition", ensureTenantAdmin, async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await transitionProductionBatch({
      tenantId: tenant.id,
      actorUserId: adminActorId(req),
      productionBatchId: String(req.params.productionBatchId || ""),
      nextStatus: req.body?.nextStatus,
      quantities: req.body?.quantities,
      capacityEvidence: req.body?.capacityEvidence,
      productionEvidence: req.body?.productionEvidence,
      inspectionEvidence: req.body?.inspectionEvidence,
      handoffEvidence: req.body?.handoffEvidence,
      deliveryEvidence: req.body?.deliveryEvidence,
      settlementEvidence: req.body?.settlementEvidence,
      carrierBookingAuthorizationId: req.body?.carrierBookingAuthorizationId,
      externalProductionExecuted: req.body?.externalProductionExecuted === true,
      externalCarrierHandoffExecuted: req.body?.externalCarrierHandoffExecuted === true,
      externalSettlementExecuted: req.body?.externalSettlementExecuted === true,
      publicMessage: req.body?.publicMessage,
      internalNote: req.body?.internalNote,
      confirmed: req.body?.confirmed === true,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to record the production-batch transition");
  }
});

router.post("/admin/settlements/prepare", ensureTenantAdmin, async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await prepareGroupSettlementPlan({
      tenantId: tenant.id,
      actorUserId: adminActorId(req),
      productionBatchId: String(req.body?.productionBatchId || ""),
      idempotencyKey: req.body?.idempotencyKey,
      refundExposureMinor: req.body?.refundExposureMinor,
      currencyCode: req.body?.currencyCode,
      allocations: req.body?.allocations,
      calculationEvidence: req.body?.calculationEvidence,
      confirmed: req.body?.confirmed === true,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to prepare the settlement plan");
  }
});

router.post("/admin/settlements/:settlementPlanId/approve", ensureTenantAdmin, async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await approveGroupSettlementPlan({
      tenantId: tenant.id,
      actorUserId: adminActorId(req),
      settlementPlanId: String(req.params.settlementPlanId || ""),
      approvalReference: req.body?.approvalReference,
      rationale: req.body?.rationale,
      approvalEvidence: req.body?.approvalEvidence,
      confirmed: req.body?.confirmed === true,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to approve the settlement plan");
  }
});

export default router;
