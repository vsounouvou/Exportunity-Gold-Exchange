import { Router } from "express";

import {
  approveCarrierBookingAuthorization,
  CarrierNetworkError,
  listCarrierNetwork,
  openCarrierIncident,
  prepareCarrierBookingAuthorization,
  prepareCarrierQuoteRequest,
  recordCarrierCandidate,
  recordCarrierConnectionVerification,
  recordCarrierCoverage,
  recordVerifiedCarrierQuote,
  verifyCarrierProfile,
} from "../lib/industrial/carrierNetwork";
import { ensureTenantAdmin } from "./utils/auth";

const router = Router();
router.use(ensureTenantAdmin);

function tenantFor(req: any, res: any) {
  if (!req.tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return req.tenant;
}

function actorUserId(req: any) {
  return Number(req.user?.id || req.adminUser?.id || 0) || null;
}

function errorResponse(res: any, error: unknown, fallback: string) {
  if (error instanceof CarrierNetworkError) {
    return res.status(error.statusCode).json({
      ok: false,
      code: error.code,
      message: error.message,
      externalProviderActionExecuted: false,
      externalBookingExecuted: false,
    });
  }
  console.error("[carrier-network] governed operation failed", error);
  return res.status(400).json({
    ok: false,
    message: String((error as any)?.message || fallback),
    externalProviderActionExecuted: false,
    externalBookingExecuted: false,
  });
}

router.get("/", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const network = await listCarrierNetwork(tenant.id);
    res.json({ ok: true, ...network });
  } catch (error) {
    errorResponse(res, error, "Failed to load the carrier network");
  }
});

router.post("/profiles", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    if (req.body?.confirmed !== true) {
      return res.status(400).json({ message: "Candidate recording confirmation is required" });
    }
    const result = await recordCarrierCandidate({
      tenantId: tenant.id,
      actorUserId: actorUserId(req),
      referenceCode: req.body?.referenceCode,
      legalName: req.body?.legalName,
      displayName: req.body?.displayName,
      carrierType: req.body?.carrierType,
      providerCode: req.body?.providerCode,
      headquartersCountryCode: req.body?.headquartersCountryCode,
      websiteUrl: req.body?.websiteUrl,
      supportEmail: req.body?.supportEmail,
      supportPhone: req.body?.supportPhone,
      operatingCountryCodes: req.body?.operatingCountryCodes,
      transportModes: req.body?.transportModes,
      capabilities: req.body?.capabilities,
      commodityCategories: req.body?.commodityCategories,
      contactDetails: req.body?.contactDetails,
      sourceProvenance: req.body?.sourceProvenance,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to record the carrier candidate");
  }
});

router.post("/profiles/:carrierProfileId/verify", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await verifyCarrierProfile({
      tenantId: tenant.id,
      actorUserId: actorUserId(req),
      carrierProfileId: String(req.params.carrierProfileId || ""),
      verificationStatus: req.body?.verificationStatus,
      partnershipStatus: req.body?.partnershipStatus,
      verificationExpiresAt: req.body?.verificationExpiresAt,
      insuranceEvidence: req.body?.insuranceEvidence,
      complianceEvidence: req.body?.complianceEvidence,
      verificationEvidence: req.body?.verificationEvidence,
      rationale: req.body?.rationale,
      confirmed: req.body?.confirmed === true,
    });
    res.json({ ok: true, ...result, externalProviderActionExecuted: false });
  } catch (error) {
    errorResponse(res, error, "Failed to verify the carrier profile");
  }
});

router.post("/coverages", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    if (req.body?.confirmed !== true) {
      return res.status(400).json({ message: "Coverage recording confirmation is required" });
    }
    const result = await recordCarrierCoverage({
      tenantId: tenant.id,
      actorUserId: actorUserId(req),
      carrierProfileId: String(req.body?.carrierProfileId || ""),
      idempotencyKey: req.body?.idempotencyKey,
      originTerritoryId: Number(req.body?.originTerritoryId || 0) || null,
      destinationTerritoryId: Number(req.body?.destinationTerritoryId || 0) || null,
      originCountryCode: req.body?.originCountryCode,
      destinationCountryCode: req.body?.destinationCountryCode,
      serviceType: req.body?.serviceType,
      transportMode: req.body?.transportMode,
      serviceLevel: req.body?.serviceLevel,
      productCategory: req.body?.productCategory,
      vehicleTypes: req.body?.vehicleTypes,
      capabilities: req.body?.capabilities,
      maxWeightKg: req.body?.maxWeightKg,
      maxVolumeM3: req.body?.maxVolumeM3,
      minimumTransitDays: req.body?.minimumTransitDays,
      maximumTransitDays: req.body?.maximumTransitDays,
      hazardousGoodsSupported: req.body?.hazardousGoodsSupported === true,
      coldChainSupported: req.body?.coldChainSupported === true,
      customsSupported: req.body?.customsSupported === true,
      insuranceSupported: req.body?.insuranceSupported === true,
      status: req.body?.status,
      evidence: req.body?.evidence,
      sourceReference: req.body?.sourceReference,
      validUntil: req.body?.validUntil,
    });
    res.status(201).json({ ok: true, ...result, externalProviderActionExecuted: false });
  } catch (error) {
    errorResponse(res, error, "Failed to record carrier coverage");
  }
});

router.post("/connections/record-verification", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await recordCarrierConnectionVerification({
      tenantId: tenant.id,
      actorUserId: actorUserId(req),
      carrierProfileId: String(req.body?.carrierProfileId || ""),
      exportunityIntegrationConnectionId:
        req.body?.exportunityIntegrationConnectionId || null,
      provider: req.body?.provider,
      environment: req.body?.environment,
      externalAccountReference: req.body?.externalAccountReference,
      credentialReference: req.body?.credentialReference,
      capabilities: req.body?.capabilities,
      scopes: req.body?.scopes,
      callbackStatus: req.body?.callbackStatus,
      restrictionStatus: req.body?.restrictionStatus,
      verificationEvidence: req.body?.verificationEvidence,
      confirmed: req.body?.confirmed === true,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to record carrier adapter verification");
  }
});

router.post("/quote-requests/prepare", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    if (req.body?.confirmed !== true) {
      return res.status(400).json({ message: "Quote-request preparation confirmation is required" });
    }
    const result = await prepareCarrierQuoteRequest({
      tenantId: tenant.id,
      actorUserId: actorUserId(req),
      industrialOrderId: String(req.body?.industrialOrderId || ""),
      idempotencyKey: req.body?.idempotencyKey,
      serviceType: req.body?.serviceType,
      origin: req.body?.origin,
      destination: req.body?.destination,
      cargo: req.body?.cargo,
      incoterm: req.body?.incoterm,
      requestedPickupAt: req.body?.requestedPickupAt,
      requiredDeliveryAt: req.body?.requiredDeliveryAt,
      requiredCapabilities: req.body?.requiredCapabilities,
      transportMode: req.body?.transportMode,
    });
    res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to prepare carrier quote request");
  }
});

router.post("/quotes/record", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await recordVerifiedCarrierQuote({
      tenantId: tenant.id,
      actorUserId: actorUserId(req),
      quoteRequestId: String(req.body?.quoteRequestId || ""),
      carrierProfileId: String(req.body?.carrierProfileId || ""),
      carrierCoverageId: req.body?.carrierCoverageId || null,
      adapterConnectionId: req.body?.adapterConnectionId || null,
      idempotencyKey: req.body?.idempotencyKey,
      sourceType: req.body?.sourceType,
      providerQuoteReference: req.body?.providerQuoteReference,
      totalCostMinor: req.body?.totalCostMinor,
      customerPriceMinor: req.body?.customerPriceMinor,
      currencyCode: req.body?.currencyCode,
      costBreakdown: req.body?.costBreakdown,
      minimumTransitDays: req.body?.minimumTransitDays,
      maximumTransitDays: req.body?.maximumTransitDays,
      pickupWindowStart: req.body?.pickupWindowStart,
      pickupWindowEnd: req.body?.pickupWindowEnd,
      estimatedDeliveryAt: req.body?.estimatedDeliveryAt,
      validUntil: req.body?.validUntil,
      terms: req.body?.terms,
      evidence: req.body?.evidence,
      confirmed: req.body?.confirmed === true,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to record the verified carrier quote");
  }
});

router.post("/quotes/:deliveryQuoteId/select", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await prepareCarrierBookingAuthorization({
      tenantId: tenant.id,
      actorUserId: actorUserId(req),
      deliveryQuoteId: String(req.params.deliveryQuoteId || ""),
      idempotencyKey: req.body?.idempotencyKey,
      selectionRationale: req.body?.selectionRationale,
      confirmed: req.body?.confirmed === true,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to prepare the carrier booking authorization");
  }
});

router.post("/bookings/:bookingAuthorizationId/approve", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    const result = await approveCarrierBookingAuthorization({
      tenantId: tenant.id,
      actorUserId: actorUserId(req),
      bookingAuthorizationId: String(req.params.bookingAuthorizationId || ""),
      approvalReference: req.body?.approvalReference,
      approvalRationale: req.body?.approvalRationale,
      confirmed: req.body?.confirmed === true,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    errorResponse(res, error, "Failed to authorize the carrier booking");
  }
});

router.post("/incidents", async (req: any, res) => {
  const tenant = tenantFor(req, res);
  if (!tenant) return;
  try {
    if (req.body?.confirmed !== true) {
      return res.status(400).json({ message: "Incident recording confirmation is required" });
    }
    const result = await openCarrierIncident({
      tenantId: tenant.id,
      actorUserId: actorUserId(req),
      carrierProfileId: String(req.body?.carrierProfileId || ""),
      adapterConnectionId: req.body?.adapterConnectionId || null,
      bookingAuthorizationId: req.body?.bookingAuthorizationId || null,
      severity: req.body?.severity,
      incidentType: req.body?.incidentType,
      title: req.body?.title,
      description: req.body?.description,
      operationalImpact: req.body?.operationalImpact,
      evidence: req.body?.evidence,
    });
    res.status(201).json({
      ok: true,
      ...result,
      externalProviderActionExecuted: false,
      externalBookingExecuted: false,
    });
  } catch (error) {
    errorResponse(res, error, "Failed to open the carrier incident");
  }
});

export default router;
