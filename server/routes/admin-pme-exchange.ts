import { Router } from "express";

import { enrichPmeLeads } from "../lib/google/placeEnrichment";
import { googlePlaceDetails, googlePlacesRuntimeStatus, googleTextSearch } from "../lib/google/placesClient";
import { mapGooglePlacesToPmeLeads, mapGooglePlaceToPmeLead } from "../lib/google/placesMapper";
import { getSavedGooglePlacesSettings, publicGooglePlacesSettings, resolveGoogleSettingsScope, saveGooglePlacesSettings } from "../lib/google/placesSettings";
import {
  approveAndSendPmeOutreachMessage,
  createPmeTestCampaign,
  ensurePmeExchangeSchema,
  ensureSeedPmeLeads,
  getPmeAudit,
  getPmeCampaigns,
  getPmeConversations,
  getPmeProfiles,
  getPmeSummary,
  listPmeLeads,
  previewPmeLeads,
  savePreviewLeads,
} from "../lib/pme-exchange/repository";
import { ensureTenantAdmin } from "./utils/auth";
import { getTwilioConfig } from "../lib/communications/twilio";

const router = Router();
router.use(ensureTenantAdmin);

function tenantIdFromReq(req: any) {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isInteger(tenantId) || tenantId <= 0) throw new Error("Tenant not resolved");
  return tenantId;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function publicGoogleStatus(status: any) {
  return {
    enabled: Boolean(status.enabled),
    provider: status.provider,
    source: status.source,
    apiKeyPresent: Boolean(status.apiKeyPresent),
    browserMapKeyPresent: Boolean(status.browserMapKeyPresent),
    mapIdPresent: Boolean(status.mapIdPresent),
    defaultCountry: status.defaultCountry,
    defaultCity: status.defaultCity,
    defaultLanguage: status.defaultLanguage,
    radiusMeters: status.radiusMeters,
    dailyImportLimit: status.dailyImportLimit,
    rateLimitPerMinute: status.rateLimitPerMinute,
    setupRequired: Boolean(status.setupRequired),
    placesSetupRequired: Boolean(status.placesSetupRequired),
    mapSetupRequired: Boolean(status.mapSetupRequired),
    advancedMapSetupRequired: Boolean(status.advancedMapSetupRequired),
    requiredEnv: status.requiredEnv,
    limits: status.limits,
  };
}

router.get("/status", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const scope = resolveGoogleSettingsScope(req);
    await ensurePmeExchangeSchema();
    const seed = await ensureSeedPmeLeads(tenantId);
    const google = await googlePlacesRuntimeStatus(scope);
    const twilio = getTwilioConfig();
    res.json({
      ok: true,
      tenant: { id: req.tenant.id, key: req.tenant.key, name: req.tenant.name },
      flags: {
        pmeExchangeEnabled: String(process.env.PME_EXCHANGE_ENABLED || "true").toLowerCase() !== "false",
        googlePlacesImportEnabled: String(process.env.GOOGLE_PLACES_IMPORT_ENABLED || process.env.GOOGLE_PLACES_ENABLED || "false").toLowerCase() === "true",
        pmeOutreachEnabled: String(process.env.PME_OUTREACH_ENABLED || "false").toLowerCase() === "true",
        pmeOutreachTestMode: String(process.env.PME_OUTREACH_TEST_MODE || "true").toLowerCase() !== "false",
        pmeInvestmentFeaturesEnabled: String(process.env.PME_INVESTMENT_FEATURES_ENABLED || "false").toLowerCase() === "true",
      },
      google: publicGoogleStatus(google),
      twilio: {
        configured: Boolean(twilio.accountSid && twilio.authTokenPresent),
        whatsappFromPresent: Boolean(twilio.whatsappFrom),
        smsFromPresent: Boolean(twilio.smsFrom || twilio.messagingServiceSid),
        sandboxMode: Boolean((twilio as any).sandboxMode),
      },
      seed,
      compliance: {
        outreachRequiresApproval: true,
        optOutKeywords: ["STOP", "NON", "ARRET", "DESINSCRIPTION"],
        noDuplicateOutreachDays: 30,
        noNightMessages: true,
        publicInvestmentDisabled: true,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load PME Exchange status" });
  }
});

router.get("/google/settings", async (req: any, res) => {
  try {
    const scope = resolveGoogleSettingsScope(req);
    const [saved, runtime] = await Promise.all([getSavedGooglePlacesSettings(scope), googlePlacesRuntimeStatus(scope)]);
    res.json({
      ok: true,
      scope,
      saved: publicGooglePlacesSettings(saved),
      runtime: publicGoogleStatus(runtime),
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load Google Places settings" });
  }
});

router.put("/google/settings", async (req: any, res) => {
  try {
    const scope = resolveGoogleSettingsScope(req);
    const saved = await saveGooglePlacesSettings(scope, req.body || {}, req?.adminUser?.email || "admin");
    const runtime = await googlePlacesRuntimeStatus(scope);
    res.json({
      ok: true,
      scope,
      saved: publicGooglePlacesSettings(saved),
      runtime: publicGoogleStatus(runtime),
      message: runtime.enabled
        ? "Google Places settings saved. Use Test Places Search before syncing real leads."
        : "Google Places settings saved, but setup is still incomplete.",
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to save Google Places settings" });
  }
});

router.get("/summary", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const summary = await getPmeSummary(tenantId);
    res.json({ ok: true, ...summary });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load PME Exchange summary" });
  }
});

router.get("/leads", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const items = await listPmeLeads(tenantId, {
      city: String(req.query.city || "").trim(),
      status: String(req.query.status || "").trim(),
      category: String(req.query.category || "").trim(),
      q: String(req.query.q || "").trim(),
      limit: Number(req.query.limit || 120),
    });
    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load PME leads" });
  }
});

router.get("/map", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const items = await listPmeLeads(tenantId, {
      city: String(req.query.city || "").trim(),
      status: String(req.query.status || "").trim(),
      category: String(req.query.category || "").trim(),
      q: String(req.query.q || "").trim(),
      limit: Number(req.query.limit || 200),
    });
    res.json({
      ok: true,
      items: items.map((lead: any) => ({
        id: lead.id,
        name: lead.name,
        category: lead.category,
        city: lead.city,
        country: lead.country,
        latitude: Number(lead.latitude),
        longitude: Number(lead.longitude),
        rating: Number(lead.rating || 0),
        reviewCount: Number(lead.review_count || lead.reviewCount || 0),
        leadStatus: lead.lead_status || lead.leadStatus,
        qualificationScore: Number(lead.qualification_score || lead.qualificationScore || 0),
        source: lead.source,
        contactStatus: lead.contact_status || lead.contactStatus,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load PME map" });
  }
});

router.post("/import/preview", async (req: any, res) => {
  try {
    const city = String(req.body?.city || req.query.city || "Abidjan").trim();
    const kind = String(req.body?.kind || req.body?.type || req.query.type || "marketplace").trim();
    const query = String(req.body?.query || req.query.q || "").trim();
    const limit = Math.min(Math.max(Number(req.body?.limit || 30), 1), 80);
    const scope = resolveGoogleSettingsScope(req);
    const google = await googlePlacesRuntimeStatus(scope);

    if (google.enabled) {
      const places = await googleTextSearch({
        scope,
        query: query || (kind === "wholesale" ? "wholesale supplier distributor warehouse logistics" : "restaurants bakery cafe grocery pharmacy"),
        city,
        country: google.defaultCountry,
        limit: Math.min(limit, 20),
      });
      const items = enrichPmeLeads(mapGooglePlacesToPmeLeads(places, { city, country: google.defaultCountry }));
      return res.json({
        ok: true,
        provider: "google_places",
        items,
        message: "Preview only. Save selected leads before outreach.",
      });
    }

    const items = await previewPmeLeads({ city, kind, query, limit });
    res.json({
      ok: true,
      provider: "curated",
      items,
      message: "Google Places is not configured. Curated city data is available for workflow testing.",
      setupRequired: true,
      requiredEnv: google.requiredEnv,
    });
  } catch (err: any) {
    res.status(err?.statusCode || 500).json({ message: err?.message || "Failed to preview PME import" });
  }
});

router.post("/import/save", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const saved = await savePreviewLeads(tenantId, enrichPmeLeads(rawItems));
    res.status(201).json({ ok: true, savedCount: saved.length, items: saved });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to save PME leads" });
  }
});

router.post("/google/test-search", async (req: any, res) => {
  try {
    const scope = resolveGoogleSettingsScope(req);
    const google = await googlePlacesRuntimeStatus(scope);
    const city = String(req.body?.city || google.defaultCity || "Abidjan").trim();
    const query = String(req.body?.query || "restaurants").trim();
    if (!google.enabled) {
      return res.json({
        ok: true,
        provider: "curated",
        configured: false,
        items: await previewPmeLeads({ city, query, kind: "marketplace", limit: 10 }),
        message: "Google Places is disabled or missing a server API key. Curated preview returned instead.",
      });
    }
    const places = await googleTextSearch({ scope, query, city, country: google.defaultCountry, limit: 10 });
    res.json({ ok: true, provider: "google_places", configured: true, items: mapGooglePlacesToPmeLeads(places, { city, country: google.defaultCountry }) });
  } catch (err: any) {
    res.status(err?.statusCode || 500).json({ message: err?.message || "Google Places test failed" });
  }
});

router.post("/google/test-details", async (req: any, res) => {
  try {
    const placeId = String(req.body?.placeId || "").trim();
    if (!placeId) return res.status(400).json({ message: "placeId is required" });
    const place = await googlePlaceDetails(placeId, resolveGoogleSettingsScope(req));
    res.json({ ok: true, item: mapGooglePlaceToPmeLead(place) });
  } catch (err: any) {
    res.status(err?.statusCode || 500).json({ message: err?.message || "Google Place Details test failed" });
  }
});

router.get("/campaigns", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    res.json({ ok: true, items: await getPmeCampaigns(tenantId) });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load PME campaigns" });
  }
});

router.post("/campaigns/test", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const leadIds = parseStringArray(req.body?.leadIds || req.body?.lead_ids);
    if (leadIds.length > 20) return res.status(400).json({ message: "Test campaigns are limited to 20 leads" });
    const createdBy = Number(req?.adminUser?.id || 0) || null;
    const result = await createPmeTestCampaign({
      tenantId,
      createdBy,
      leadIds,
      name: String(req.body?.name || "").trim() || undefined,
      templateName: String(req.body?.templateName || req.body?.template_name || "pme_intro_fr").trim(),
    });
    res.status(201).json({
      ok: true,
      ...result,
      message: "Campaign created in test mode. Messages are drafted only and require approval before Twilio/WhatsApp delivery.",
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create PME test campaign" });
  }
});

router.post("/campaigns/messages/:messageId/approve-send", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const messageId = String(req.params.messageId || "").trim();
    const approvedBy = Number(req?.adminUser?.id || 0) || null;
    const result = await approveAndSendPmeOutreachMessage({
      tenantId,
      messageId,
      approvedBy,
      forceContactWindow: Boolean(req.body?.forceContactWindow || req.body?.force_contact_window),
    });
    res.json(result);
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to approve PME outreach message" });
  }
});

router.get("/conversations", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    res.json({ ok: true, items: await getPmeConversations(tenantId) });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load PME conversations" });
  }
});

router.get("/profiles", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    res.json({ ok: true, items: await getPmeProfiles(tenantId) });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load PME profiles" });
  }
});

router.get("/audit", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    res.json({ ok: true, items: await getPmeAudit(tenantId) });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load PME audit" });
  }
});

export default router;
