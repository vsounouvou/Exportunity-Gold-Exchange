import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { chatEvents, chatLeads, chatMessages, industrialRequirements } from "@db/schema";
import { getContactNotificationConfig, sendContactNotification } from "../lib/contact/notifier";
import {
  buildCommercialActivationMessage,
  buildCommercialClarificationMessage,
  detectCommercialIntent,
  type CommercialIntentResult,
  type CommercialIntentType,
} from "../lib/commercialIntentEngine";
import {
  retrieveExportunityInternalSupply,
  type CommercialRetrievalResult,
} from "../lib/exportunity/commercialRetrieval";
import {
  syncTalkCommercialCrm,
  type CommercialCrmSyncResult,
} from "../lib/exportunity/commercialCrm";
import { syncCanonicalProductRequirement } from "../lib/exportunity/productRequirement";
import {
  syncQualifiedSourcingTask,
  type QualifiedSourcingTaskSyncResult,
} from "../lib/exportunity/sourcingTask";
import {
  syncVerifiedInternalSupplierCandidates,
  type SupplierCandidateScreeningResult,
} from "../lib/exportunity/supplierCandidateScreening";
import { ensureIndustrialTables } from "../lib/industrial/ensureTables";
import type { IndustrialRequirementType } from "../lib/industrial/workflow";
import { ensureTalkTables } from "../lib/contact/ensureTalkTables";

const router = Router();

type TalkIntent = "demo" | "invest" | "run_business" | "gold" | "partnership" | "support" | "other";

function ensureTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

const TALK_REQUIREMENT_INTENTS = new Set<CommercialIntentType>([
  "source_product",
  "sell_product",
  "find_buyers",
  "find_machinery",
  "find_raw_material",
  "request_quote",
  "compare_suppliers",
  "request_price",
  "request_logistics",
  "place_order",
]);

function shouldCreateRequirement(intent: CommercialIntentType) {
  return TALK_REQUIREMENT_INTENTS.has(intent);
}

function normalizeForMatch(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function pickRequirementType(intent: CommercialIntentType, product?: CommercialIntentResult["product"]): IndustrialRequirementType {
  if (intent === "find_machinery") return "machinery";
  if (intent === "find_raw_material") return "raw_material";
  if (intent === "sell_product" || intent === "request_quote" || intent === "compare_suppliers") return "export_quotation";
  if (intent === "request_price") return "industrial_input";
  if (intent === "request_logistics") return "industrial_service";
  if (intent === "place_order") return "export_quotation";
  if (intent === "find_buyers") return "export_quotation";

  const text = normalizeForMatch(`${product?.name || ""} ${product?.category || ""} ${product?.specification || ""}`);
  if (/(machine|machinery|truck|pompe|generator|excavator|compressor|press)/.test(text)) return "machinery";
  if (/(bearing|roulement|belt|gear|shaft|pump|joint|spare|component|part|piece|pi[eè]ce|couple|equipement|equipment)/.test(text))
    return "spare_part";
  return "raw_material";
}

function resolveRequirementCategoryCode(requirementType: IndustrialRequirementType) {
  if (requirementType === "machinery") return "machinery_and_production_equipment";
  if (requirementType === "raw_material") return "raw_materials";
  if (requirementType === "industrial_input") return "industrial_inputs_and_consumables";
  if (requirementType === "spare_part") return "spare_parts_and_components";
  if (requirementType === "industrial_service") return "industrial_services";
  if (requirementType === "custom_manufacturing") return "industrial_inputs_and_consumables";
  return "export_ready_factory_products";
}

function makeReference(prefix: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const nonce = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${date}-${nonce}`;
}

function fallbackTalkEmail(leadId: string) {
  const safe = String(leadId || "lead").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "lead";
  return `${safe}@talk.exportunity.local`;
}

function splitDeliveryDestination(destination?: string) {
  const result = {
    deliveryCity: null as string | null,
    deliveryCountryCode: null as string | null,
  };
  if (!destination) return result;
  const parts = destination
    .split(/[,;|]/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (parts.length === 0) return result;
  result.deliveryCity = parts.length > 1 ? parts[0] : parts[0];
  const maybeCountry = parts[parts.length - 1];
  const countryLike = normalizeForMatch(maybeCountry).toUpperCase();
  if (/^[A-Z]{2}$/.test(countryLike)) result.deliveryCountryCode = countryLike;
  return result;
}

function makeRequirementDraft(input: {
  leadId: string;
  tenantId: number;
  message: string;
  commercial: CommercialIntentResult;
  name: string | null;
  email: string | null;
  phone: string | null;
}) {
  const requirementType = pickRequirementType(input.commercial.intent, input.commercial.product);
  const categoryCode = resolveRequirementCategoryCode(requirementType);
  if (!requirementType || !categoryCode) return null;

  const productName = input.commercial.product?.name || "Sourcing request";
  const parts: string[] = [productName];
  if (input.commercial.product?.specification) parts.push(input.commercial.product.specification);
  if (input.commercial.origin) parts.push(`from ${input.commercial.origin}`);
  if (input.commercial.destination) parts.push(`to ${input.commercial.destination}`);
  if (input.commercial.product?.quantity && input.commercial.product.unit) {
    parts.push(`quantity ${input.commercial.product.quantity} ${input.commercial.product.unit}`);
  }
  if (input.commercial.targetPrice) {
    const currency = input.commercial.currency
      ? ` ${input.commercial.currency}`
      : " (currency unspecified)";
    parts.push(`target price ${input.commercial.targetPrice}${currency}`);
  }
  if (input.commercial.frequency) parts.push(`frequency ${input.commercial.frequency}`);
  if (input.commercial.incoterm) parts.push(`incoterm ${input.commercial.incoterm}`);
  if (input.commercial.deadline) parts.push(`deadline ${input.commercial.deadline}`);
  if (input.commercial.orderReference) parts.push(`order ref ${input.commercial.orderReference}`);
  if (input.commercial.customerType) parts.push(`customer type ${input.commercial.customerType}`);

  const title = `Talk commercial request • ${productName}`;
  const details = parts.join(" | ");
  const quantityText = input.commercial.product?.quantity
    ? `${input.commercial.product.quantity}${input.commercial.product.unit || "unit"}`
    : null;
  const { deliveryCity, deliveryCountryCode } = splitDeliveryDestination(input.commercial.destination);

  const fallbackName = input.name || "Talk lead";
  const fallbackEmail = input.email || fallbackTalkEmail(input.leadId);

  return {
    tenantId: input.tenantId,
    referenceCode: makeReference("TREQ"),
    requirementType,
    categoryCode,
    title,
    details,
    quantityText,
    deliveryCountryCode,
    deliveryCity,
    urgency: "standard",
    requesterCompany: null,
    requesterName: fallbackName,
    requesterEmail: fallbackEmail,
    requesterPhone: input.phone || null,
    metadata: {
      commercialIntent: {
        intent: input.commercial.intent,
        confidence: input.commercial.confidence,
        language: input.commercial.language,
        product: input.commercial.product || null,
        destination: input.commercial.destination || null,
        origin: input.commercial.origin || null,
        targetPrice: input.commercial.targetPrice || null,
        currency: input.commercial.currency || null,
        deadline: input.commercial.deadline || null,
        frequency: input.commercial.frequency || null,
        incoterm: input.commercial.incoterm || null,
        customerType: input.commercial.customerType || null,
      },
      intake: "talk_intake",
      source: "talk_route",
      contactStatus: input.email || input.phone ? "provided" : "pending",
      messageSample: input.message.slice(0, 300),
    },
  };
}

function normalizeIntent(raw: unknown): TalkIntent {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "demo") return "demo";
  if (value === "invest") return "invest";
  if (value === "run_business" || value === "run-business" || value === "business") return "run_business";
  if (value === "gold" || value === "commodities") return "gold";
  if (value === "partnership" || value === "partner") return "partnership";
  if (value === "support") return "support";
  if (value) return "other";
  return "other";
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function extractEmail(text: string) {
  const m = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return normalizeEmail(m?.[0] || "");
}

function extractPhone(text: string) {
  const raw = String(text || "");
  const m = raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  if (!m?.[0]) return null;
  const cleaned = m[0].replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  // Keep as-is; E.164 normalization is handled elsewhere in the platform.
  return cleaned.length > 4 ? cleaned : null;
}

function getClientIp(req: any) {
  return String(req.headers["x-forwarded-for"] || req.ip || "")
    .split(",")[0]
    ?.trim() || null;
}

function buildFirstAssistantMessage(intent: TalkIntent) {
  const openPlatform = "/platform";
  const investLink = "/invest/opportunities";
  const goldLink = "/platform/gold";

  if (intent === "invest") {
    return `Understood. Quick question: what are you looking to invest in (SME, machinery, farm, gold/commodities), and what ticket size? You can also browse ${investLink}.`;
  }
  if (intent === "gold") {
    return `Understood. Quick question: what role are you (mine, buying office, exporter, buyer), and which country? Proof and flows: ${goldLink}.`;
  }
  if (intent === "run_business") {
    return `Understood. Quick question: what do you sell or operate, and which country/currency? Platform overview: ${openPlatform}.`;
  }
  if (intent === "demo") {
    return `Understood. Quick question: what should we demo first (platform, agents, contracts, wallet, gold)? Start here: ${openPlatform}.`;
  }
  if (intent === "partnership") {
    return `Understood. Quick question: what partnership type (distribution, payments, compliance, data, operations)? Share one paragraph and we will route it.`;
  }
  if (intent === "support") {
    return `Understood. Quick question: what is blocked right now (login, OTP, actions, emails, WhatsApp, performance)? Include any error text and the page URL.`;
  }
  return `Understood. Quick question: what are you trying to achieve, and in which country? Start here: ${openPlatform}.`;
}

function buildFollowupAssistantMessage(params: {
  intent: TalkIntent;
  hasContact: boolean;
  needsContact: boolean;
}) {
  const openPlatform = "/platform";
  const talkLink = "/talk";
  const investLink = "/invest/opportunities";

  if (params.needsContact) {
    return "What is the best WhatsApp number or email to reach you? (We will reply with a concrete next step.)";
  }

  if (params.intent === "invest") {
    return `Thanks. Next step: browse ${investLink} and tell us which opportunity type you prefer. If you want a call, reply with your timezone and preferred time window.`;
  }

  if (params.intent === "gold") {
    return `Thanks. Next step: share your volume (monthly), origin route, and compliance requirements. You can also review the workflow here: ${openPlatform}.`;
  }

  if (params.intent === "support") {
    return `Thanks. Next step: paste the exact error message (or a screenshot), plus the time it happened. We will reproduce and respond with a fix path.`;
  }

  if (!params.hasContact) {
    return `Next step: share your WhatsApp or email so we can send a demo link and a short execution plan. You can continue here: ${talkLink}.`;
  }

  return `Thanks. Next step: open ${openPlatform} and tell us which module you want to start with. We will route you to the right operator flow.`;
}

function buildCommercialContactPrompt(result: CommercialIntentResult) {
  return result.language === "fr"
    ? "Comment souhaitez-vous recevoir les prochaines offres: WhatsApp ou email ?"
    : "How would you like to receive the next offers: WhatsApp or email?";
}

function buildCommercialCrmMessage(
  result: CommercialIntentResult,
  crm: CommercialCrmSyncResult | null,
) {
  if (crm?.status !== "opportunity_opened") return "";
  const reference = String(crm.opportunityReferenceCode || "").trim();
  if (!reference) return "";
  return result.language === "fr"
    ? `Votre demande est enregistrée sous la référence ${reference}. La recherche fournisseur et l’examen commercial restent à effectuer.`
    : `Your request is saved under reference ${reference}. Supplier research and commercial review are still pending.`;
}

type TalkSourcingTaskResult = QualifiedSourcingTaskSyncResult | {
  status: "sync_deferred";
  taskId: null;
  publicTaskId: null;
  state: null;
  requiresHumanApproval: true;
  outboundActionsAllowed: false;
};

type TalkSupplierCandidateScreeningResult =
  | SupplierCandidateScreeningResult
  | {
      status: "sync_deferred";
      screeningState: "not_run";
      source: "verified_internal_supplier_registry";
      threshold: number;
      candidateCount: 0;
      newCandidateCount: 0;
      existingCandidateCount: 0;
      topScore: null;
      sourcingTaskId: number | null;
      sourcingTaskPublicId: string | null;
      requiresHumanApproval: true;
      supplierIdentityPublic: false;
      outboundActionsAllowed: false;
      externalDiscoveryStarted: false;
      quoteCreated: false;
      screenedAt: string;
    };

function buildSourcingReviewTaskMessage(
  result: CommercialIntentResult,
  sourcingTask: TalkSourcingTaskResult | null,
) {
  if (sourcingTask?.status !== "review_task_ready") return "";
  const taskReference = String(sourcingTask.publicTaskId || "").trim();
  const reference = taskReference ? ` ${taskReference}` : "";
  return result.language === "fr"
    ? `La tâche de sourcing encadrée${reference} est enregistrée et attend l’approbation humaine; aucun fournisseur n’a été contacté.`
    : `Governed sourcing task${reference} is recorded and awaiting human approval; no supplier has been contacted.`;
}

function buildSupplierCandidateScreeningMessage(
  result: CommercialIntentResult,
  screening: TalkSupplierCandidateScreeningResult | null,
) {
  if (screening?.screeningState !== "completed") return "";
  const isFrench = result.language === "fr";
  if (screening.status === "candidates_ready") {
    return isFrench
      ? `Le registre fournisseur interne vérifié a été examiné : ${screening.candidateCount} candidat${screening.candidateCount > 1 ? "s pertinents sont enregistrés" : " pertinent est enregistré"} pour revue humaine. Aucune identité ni coordonnée fournisseur n’est divulguée et aucun contact n’a été lancé.`
      : `The verified internal supplier registry was screened: ${screening.candidateCount} relevant candidate${screening.candidateCount > 1 ? "s are" : " is"} recorded for human review. No supplier identity or contact details are disclosed, and no outreach has started.`;
  }
  if (screening.status === "no_verified_candidate") {
    return isFrench
      ? "Le registre fournisseur interne vérifié a été examiné sans candidat dépassant le seuil de pertinence. La recherche externe n’a pas commencé et nécessite une approbation humaine."
      : "The verified internal supplier registry was screened without a candidate meeting the relevance threshold. External discovery has not started and requires human approval.";
  }
  return "";
}

function buildCommercialRetrievalMessage(
  result: CommercialIntentResult,
  retrieval: CommercialRetrievalResult | null,
) {
  if (!retrieval?.searched) return "";
  const isFrench = result.language === "fr";
  if (retrieval.status === "verified_matches") {
    return isFrench
      ? `J’ai trouvé ${retrieval.publicMatchCount} option${retrieval.publicMatchCount > 1 ? "s" : ""} de catalogue vérifiée${retrieval.publicMatchCount > 1 ? "s" : ""} correspondant à la demande. La disponibilité et les conditions doivent encore être confirmées.`
      : `I found ${retrieval.publicMatchCount} verified catalog option${retrieval.publicMatchCount > 1 ? "s" : ""} matching the requirement. Availability and terms still need confirmation.`;
  }
  if (retrieval.status === "internal_matches_require_review") {
    return isFrench
      ? "J’ai trouvé des enregistrements internes pertinents, mais ils doivent être examinés avant que des détails puissent être partagés."
      : "I found relevant internal records, but they require commercial review before details can be shared.";
  }
  if (retrieval.status === "no_verified_match") {
    return isFrench
      ? "Nous n’avons pas actuellement d’offre vérifiée correspondant exactement à cette demande."
      : "We do not currently have a verified offer that exactly matches this requirement.";
  }
  return "";
}

async function maybeNotifyLead(tenant: any, leadId: string) {
  const cfg = getContactNotificationConfig();
  if (!cfg.enabled || !cfg.from) {
    await db
      .update(chatLeads)
      .set({ notifyStatus: "skipped", notifyError: "contact_notify_not_configured" })
      .where(and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)));
    return { status: "skipped" as const };
  }

  const lead = await db.query.chatLeads.findFirst({
    where: and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)),
  });
  if (!lead) return { status: "failed" as const, error: "lead_not_found" };

  const messages = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.tenantId, tenant.id), eq(chatMessages.leadId, leadId)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(20);
  const ordered = [...messages].reverse();

  const subject = `${cfg.subjectPrefix} Website lead (${tenant.key}) intent=${lead.intent}`;
  const lines = [
    `New website chat lead (tenant=${tenant.key})`,
    "",
    `Intent: ${lead.intent}`,
    lead.name ? `Name: ${lead.name}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.country ? `Country: ${lead.country}` : null,
    lead.sourceUrl ? `Source URL: ${lead.sourceUrl}` : null,
    "",
    "Transcript:",
    ...ordered.map((m) => `[${String(m.role).toUpperCase()}] ${m.content}`),
    "",
    `Lead ID: ${lead.id}`,
  ].filter(Boolean) as string[];

  try {
    await sendContactNotification({ to: cfg.to, from: cfg.from, subject, text: lines.join("\n") });
    await db
      .update(chatLeads)
      .set({ notifyStatus: "sent", notifiedAt: new Date(), notifyError: null, updatedAt: new Date() })
      .where(and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)));
    await db.insert(chatEvents).values({
      tenantId: tenant.id,
      leadId,
      eventType: "handoff",
      payload: { channel: "email", to: cfg.to },
      createdAt: new Date(),
    });
    return { status: "sent" as const };
  } catch (err: any) {
    await db
      .update(chatLeads)
      .set({ notifyStatus: "failed", notifyError: String(err?.message || "notify_failed"), updatedAt: new Date() })
      .where(and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)));
    return { status: "failed" as const, error: String(err?.message || "notify_failed") };
  }
}

function inferExistingRequirementIdFromMetadata(metadata: Record<string, unknown>) {
  const commercialIntent = metadata.commercialIntent;
  if (commercialIntent && typeof commercialIntent === "object" && commercialIntent !== null) {
    const raw = commercialIntent as Record<string, unknown>;
    const candidate = raw.requirementId || raw.opportunityId;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

function normalizeCommercialIntentFromMetadata(metadata: Record<string, unknown>): CommercialIntentResult | null {
  const candidate = metadata.commercialIntent;
  if (!candidate || typeof candidate !== "object") return null;
  const raw = candidate as Record<string, unknown>;
  const intent = String(raw.intent || "").trim();
  const confidence = Number.parseFloat(String(raw.confidence || ""));
  const commercial = String(raw.commercial || "").toLowerCase() === "true";
  const language = raw.language === "fr" || raw.language === "en" || raw.language === "auto" ? raw.language : "auto";
  const missingFields = Array.isArray(raw.missingFields) ? raw.missingFields.map(String) : [];
  const suggestedAction = ["ANSWER", "ASK", "ACT", "ESCALATE"].includes(String(raw.suggestedAction))
    ? (raw.suggestedAction as "ANSWER" | "ASK" | "ACT" | "ESCALATE")
    : "ANSWER";
  const rationale = Array.isArray(raw.rationale) ? raw.rationale.map(String) : [];
  const legacyRequirementId =
    typeof raw.opportunityId === "string" && raw.opportunityId.trim().length > 0
      ? raw.opportunityId.trim()
      : undefined;
  const requirementId =
    typeof raw.requirementId === "string" && raw.requirementId.trim().length > 0
      ? raw.requirementId.trim()
      : legacyRequirementId;
  const legacyRequirementReferenceCode =
    typeof raw.opportunityReferenceCode === "string" &&
    raw.opportunityReferenceCode.trim().length > 0
      ? raw.opportunityReferenceCode.trim()
      : undefined;
  const requirementReferenceCode =
    typeof raw.requirementReferenceCode === "string" && raw.requirementReferenceCode.trim().length > 0
      ? raw.requirementReferenceCode.trim()
      : legacyRequirementReferenceCode;
  const productRequirementId =
    typeof raw.productRequirementId === "string" &&
    raw.productRequirementId.trim().length > 0
      ? raw.productRequirementId.trim()
      : undefined;
  const productRaw = raw.product;
  const product =
    productRaw && typeof productRaw === "object"
      ? {
          name: typeof (productRaw as Record<string, unknown>).name === "string" ? String((productRaw as Record<string, unknown>).name) : undefined,
          category:
            typeof (productRaw as Record<string, unknown>).category === "string"
              ? String((productRaw as Record<string, unknown>).category)
              : undefined,
          specification:
            typeof (productRaw as Record<string, unknown>).specification === "string"
              ? String((productRaw as Record<string, unknown>).specification)
              : undefined,
          quantity: Number.isFinite(Number((productRaw as Record<string, unknown>).quantity))
            ? Number((productRaw as Record<string, unknown>).quantity)
            : undefined,
          unit: typeof (productRaw as Record<string, unknown>).unit === "string" ? String((productRaw as Record<string, unknown>).unit) : undefined,
        }
      : undefined;
  const parsedQuantity = Number.parseFloat(String(raw.targetPrice || ""));
  const targetPrice = Number.isFinite(parsedQuantity) ? parsedQuantity : undefined;
  const parsedDate = String(raw.deadline || "").trim() || undefined;

  if (!intent) return null;

  return {
    intent: intent as CommercialIntentType,
    confidence: Number.isFinite(confidence) ? confidence : 0.45,
    commercial,
    language: language as "en" | "fr" | "auto",
    product: product as CommercialIntentResult["product"] | undefined,
    origin: typeof raw.origin === "string" ? raw.origin : undefined,
    destination: typeof raw.destination === "string" ? raw.destination : undefined,
    targetPrice: targetPrice,
    currency: typeof raw.currency === "string" ? raw.currency : undefined,
    deadline: parsedDate,
    frequency: typeof raw.frequency === "string" ? raw.frequency : undefined,
    incoterm: typeof raw.incoterm === "string" ? raw.incoterm : undefined,
    customerType: typeof raw.customerType === "string" ? raw.customerType : undefined,
    orderReference: typeof raw.orderReference === "string" ? raw.orderReference : undefined,
    requirementId,
    requirementReferenceCode,
    productRequirementId,
    missingFields,
    suggestedAction,
    rationale,
  };
}

function normalizeEventPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

function toTimelineEvents(rows: Array<{ id: number; eventType: string; payload: unknown; createdAt: Date | null }>) {
  return rows
    .map((row) => ({
      id: row.id,
      eventType: row.eventType,
      payload: normalizeEventPayload(row.payload),
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    }))
    .reverse();
}

async function upsertTalkRequirement(params: {
  tenantId: number;
  leadId: string;
  sourceMessageId: number;
  message: string;
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  commercialResult: CommercialIntentResult;
  existingRequirementId: string | null;
  existingMetadata: Record<string, unknown>;
}) {
  if (!shouldCreateRequirement(params.commercialResult.intent) || params.commercialResult.suggestedAction !== "ACT") {
    return {
      requirementId: params.existingRequirementId,
      requirementReferenceCode: undefined,
      productRequirementId: params.commercialResult.productRequirementId,
      eventPayload: undefined,
    };
  }
  if (params.commercialResult.missingFields.length > 0) {
    return {
      requirementId: params.existingRequirementId,
      requirementReferenceCode: undefined,
      productRequirementId: params.commercialResult.productRequirementId,
      eventPayload: undefined,
    };
  }

  const draft = makeRequirementDraft({
    leadId: params.leadId,
    tenantId: params.tenantId,
    message: params.message,
    commercial: params.commercialResult,
    name: params.leadName,
    email: params.leadEmail,
    phone: params.leadPhone,
  });
  if (!draft) {
    return {
      requirementId: null,
      requirementReferenceCode: undefined,
      productRequirementId: undefined,
      eventPayload: undefined,
    };
  }

  const now = new Date();
  if (params.existingRequirementId) {
    const existing = await db.query.industrialRequirements.findFirst({
      where: and(eq(industrialRequirements.id, params.existingRequirementId), eq(industrialRequirements.tenantId, params.tenantId)),
      columns: { id: true, referenceCode: true, metadata: true },
    });
    if (existing) {
      const existingRequirementMetadata =
        existing.metadata && typeof existing.metadata === "object"
          ? (existing.metadata as Record<string, unknown>)
          : {};
      await db
        .update(industrialRequirements)
        .set({
          requirementType: draft.requirementType,
          categoryCode: draft.categoryCode,
          title: draft.title,
          details: draft.details,
          quantityText: draft.quantityText,
          deliveryCountryCode: draft.deliveryCountryCode,
          deliveryCity: draft.deliveryCity,
          requesterName: draft.requesterName,
          requesterEmail: draft.requesterEmail,
          requesterPhone: draft.requesterPhone,
          metadata: {
            ...existingRequirementMetadata,
            ...draft.metadata,
            leadId: params.leadId,
            qualificationUpdatedAt: now.toISOString(),
          },
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialRequirements.id, existing.id),
            eq(industrialRequirements.tenantId, params.tenantId),
          ),
        );
      const productRequirement = await syncCanonicalProductRequirement({
        tenantId: params.tenantId,
        requirementId: existing.id,
        requirementReferenceCode: existing.referenceCode,
        sourceChatLeadId: params.leadId,
        sourceMessageId: params.sourceMessageId,
        commercial: params.commercialResult,
      });
      params.existingMetadata.commercialIntent = {
        ...(params.existingMetadata.commercialIntent as Record<string, unknown>),
        requirementId: existing.id,
        requirementReferenceCode: existing.referenceCode,
        productRequirementId: productRequirement.id,
      };
      return {
        requirementId: existing.id,
        requirementReferenceCode: existing.referenceCode,
        productRequirementId: productRequirement.id,
        eventPayload: {
          action: "UPDATE_REQUIREMENT",
          intent: params.commercialResult.intent,
          requirementId: existing.id,
          requirementReferenceCode: existing.referenceCode,
          productRequirementId: productRequirement.id,
          executionStatus: "recorded",
          nextStage: "supplier_research_review",
          requiresHumanReview: true,
          fromExisting: true,
        },
      };
    }
  }
  const [requirement] = await db
    .insert(industrialRequirements)
    .values({
      tenantId: draft.tenantId,
      referenceCode: draft.referenceCode,
      requirementType: draft.requirementType,
      categoryCode: draft.categoryCode,
      title: draft.title,
      details: draft.details,
      quantityText: draft.quantityText,
      deliveryCountryCode: draft.deliveryCountryCode,
      deliveryCity: draft.deliveryCity,
      urgency: draft.urgency,
      requesterCompany: draft.requesterCompany,
      requesterName: draft.requesterName,
      requesterEmail: draft.requesterEmail,
      requesterPhone: draft.requesterPhone,
      status: "submitted",
      visibility: "exportunity_internal",
      metadata: {
        ...draft.metadata,
        leadId: params.leadId,
        createdFrom: "talk_route",
        workflow: {
          nextStage: "supplier_research_review",
          requiresHumanReview: true,
        },
        requirementSeed: {
          tenantId: params.tenantId,
          leadId: params.leadId,
          message: params.message.slice(0, 260),
        },
      },
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: industrialRequirements.id, referenceCode: industrialRequirements.referenceCode });

  const productRequirement = await syncCanonicalProductRequirement({
    tenantId: params.tenantId,
    requirementId: requirement.id,
    requirementReferenceCode: requirement.referenceCode,
    sourceChatLeadId: params.leadId,
    sourceMessageId: params.sourceMessageId,
    commercial: params.commercialResult,
  });

  params.existingMetadata.commercialIntent = {
    ...(params.existingMetadata.commercialIntent as Record<string, unknown>),
    requirementId: requirement.id,
    requirementReferenceCode: requirement.referenceCode,
    productRequirementId: productRequirement.id,
  };

  return {
    requirementId: requirement.id,
    requirementReferenceCode: requirement.referenceCode,
    productRequirementId: productRequirement.id,
    eventPayload: {
      action: "CREATE_REQUIREMENT",
      intent: params.commercialResult.intent,
      requirementId: requirement.id,
      requirementReferenceCode: requirement.referenceCode,
      productRequirementId: productRequirement.id,
      executionStatus: "recorded",
      nextStage: "supplier_research_review",
      requiresHumanReview: true,
    },
  };
}

router.post("/api/talk/start", async (req: any, res) => {
  try {
    await ensureTalkTables();
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const intent = normalizeIntent(req.body?.intent);
    const now = new Date();
    const sourceUrl = String(req.body?.sourceUrl || req.headers?.referer || "").trim() || null;
    const userAgent = String(req.headers["user-agent"] || "").trim() || null;
    const ip = getClientIp(req);

    const [lead] = await db
      .insert(chatLeads)
      .values({
        tenantId: tenant.id,
        intent,
        status: "new",
        sourceUrl,
        userAgent,
        ip,
        notifyStatus: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const assistantText = buildFirstAssistantMessage(intent);
    const [assistant] = await db
      .insert(chatMessages)
      .values({
        tenantId: tenant.id,
        leadId: lead.id,
        role: "assistant",
        content: assistantText,
        createdAt: now,
      })
      .returning();

    res.status(201).json({
      ok: true,
      leadId: lead.id,
      messages: [{ role: assistant.role, content: assistant.content, createdAt: assistant.createdAt }],
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to start talk session" });
  }
});

router.post("/api/talk/message", async (req: any, res) => {
  try {
    await ensureTalkTables();
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const leadId = String(req.body?.leadId || "").trim();
    const message = String(req.body?.message || "").trim();
    const name = String(req.body?.name || "").trim() || null;
    const email = normalizeEmail(req.body?.email) || null;
    const phone = String(req.body?.phone || "").trim() || null;
    const intentOverride = normalizeIntent(req.body?.intent);

    if (!leadId) return res.status(400).json({ message: "leadId is required" });
    if (!message) return res.status(400).json({ message: "message is required" });

    const lead = await db.query.chatLeads.findFirst({
      where: and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)),
    });
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const inferredEmail = extractEmail(message);
    const inferredPhone = extractPhone(message);
    const nextEmail = email || inferredEmail || lead.email || null;
    const nextPhone = phone || inferredPhone || lead.phone || null;
    const nextName = name || lead.name || null;

    const now = new Date();
    const [userMessage] = await db
      .insert(chatMessages)
      .values({
        tenantId: tenant.id,
        leadId,
        role: "user",
        content: message,
        createdAt: now,
      })
      .returning({ id: chatMessages.id });

    const nextIntent = (lead.intent ? normalizeIntent(lead.intent) : "other") as TalkIntent;
    const intent = (intentOverride !== "other" ? intentOverride : nextIntent) as TalkIntent;
    const leadMetadata =
      typeof lead.metadata === "object" && lead.metadata !== null
        ? { ...(lead.metadata as Record<string, unknown>) }
        : {};
    const priorCommercialResult = normalizeCommercialIntentFromMetadata(leadMetadata);
    const commercialResult = detectCommercialIntent(message, {
      message,
      priorIntent: priorCommercialResult?.intent || lead.intent || nextIntent,
      priorResult: priorCommercialResult,
    });
    const commercialMode =
      commercialResult.commercial &&
      (commercialResult.intent !== "other" || commercialResult.confidence >= 0.45) &&
      intent !== "support";

    const hadContact = Boolean(lead.email || lead.phone);
    const hasContact = Boolean(nextEmail || nextPhone);
    const needsContact = !hasContact && (lead.notifyStatus === "pending" || lead.notifyStatus === "failed");

    const shouldNotify = hasContact && lead.notifyStatus === "pending";

    if (commercialMode) {
      leadMetadata.commercialIntent = {
        ...commercialResult,
        message: message.substring(0, 180),
        intentSource: intent,
      };
    }

    let commercialRetrieval: CommercialRetrievalResult | null = null;
    if (commercialMode && shouldCreateRequirement(commercialResult.intent)) {
      await ensureIndustrialTables();
      commercialRetrieval = await retrieveExportunityInternalSupply({
        tenantId: tenant.id,
        intent: commercialResult,
      });
      leadMetadata.commercialRetrieval = commercialRetrieval;
    }

    const existingRequirementId = inferExistingRequirementIdFromMetadata(leadMetadata);
    let requirementUpsertResult:
      | {
          requirementId: string | null;
          requirementReferenceCode: string | undefined;
          productRequirementId: string | undefined;
          eventPayload: Record<string, unknown> | undefined;
        }
      | null = null;

    if (commercialMode && shouldCreateRequirement(commercialResult.intent)) {
      await ensureIndustrialTables();
      requirementUpsertResult = await upsertTalkRequirement({
        tenantId: tenant.id,
        leadId,
        sourceMessageId: userMessage.id,
        message,
        leadName: nextName,
        leadEmail: nextEmail,
        leadPhone: nextPhone,
        commercialResult,
        existingRequirementId,
        existingMetadata: leadMetadata,
      });
    }

    const resolvedRequirementId =
      requirementUpsertResult?.requirementId ||
      commercialResult.requirementId ||
      null;
    const resolvedRequirementReferenceCode =
      requirementUpsertResult?.requirementReferenceCode ||
      commercialResult.requirementReferenceCode ||
      null;
    const resolvedProductRequirementId =
      requirementUpsertResult?.productRequirementId ||
      commercialResult.productRequirementId ||
      null;
    let commercialCrm: CommercialCrmSyncResult | null = null;
    if (commercialMode) {
      try {
        await ensureIndustrialTables();
        commercialCrm = await syncTalkCommercialCrm({
          tenantId: tenant.id,
          chatLeadId: leadId,
          contactName: nextName,
          email: nextEmail,
          phone: nextPhone,
          commercial: commercialResult,
          requirementId: resolvedRequirementId,
          requirementReferenceCode: resolvedRequirementReferenceCode,
        });
        leadMetadata.commercialCrm = commercialCrm;
      } catch (error: any) {
        console.warn("[talk] Commercial CRM sync deferred", {
          tenantId: tenant.id,
          leadId,
          error: String(error?.message || "crm_sync_failed"),
        });
        leadMetadata.commercialCrm = {
          status: "sync_deferred",
          leadId: null,
          opportunityId: null,
          opportunityReferenceCode: null,
          stage: null,
          createdLead: false,
          createdOpportunity: false,
        };
      }
    }

    let sourcingReviewTask: TalkSourcingTaskResult | null = null;
    if (
      String(tenant.key || "").trim().toLowerCase() === "exportunity" &&
      commercialCrm?.status === "opportunity_opened"
    ) {
      try {
        sourcingReviewTask = await syncQualifiedSourcingTask({
          tenantId: tenant.id,
          tenantKey: tenant.key,
          crmStatus: commercialCrm.status,
          crmStage: commercialCrm.stage,
          chatLeadId: leadId,
          commercialLeadId: commercialCrm.leadId,
          opportunityId: commercialCrm.opportunityId,
          opportunityReferenceCode: commercialCrm.opportunityReferenceCode,
          requirementId: resolvedRequirementId,
          requirementReferenceCode: resolvedRequirementReferenceCode,
        });
        leadMetadata.sourcingReviewTask = sourcingReviewTask;
      } catch (error: any) {
        console.warn("[talk] Governed sourcing task sync deferred", {
          tenantId: tenant.id,
          leadId,
          error: String(error?.message || "sourcing_task_sync_failed"),
        });
        sourcingReviewTask = {
          status: "sync_deferred",
          taskId: null,
          publicTaskId: null,
          state: null,
          requiresHumanApproval: true,
          outboundActionsAllowed: false,
        };
        leadMetadata.sourcingReviewTask = sourcingReviewTask;
      }
    }

    let supplierCandidateScreening: TalkSupplierCandidateScreeningResult | null =
      null;
    if (
      String(tenant.key || "").trim().toLowerCase() === "exportunity" &&
      commercialCrm?.status === "opportunity_opened"
    ) {
      try {
        supplierCandidateScreening =
          await syncVerifiedInternalSupplierCandidates({
            tenantId: tenant.id,
            tenantKey: tenant.key,
            crmStatus: commercialCrm.status,
            crmStage: commercialCrm.stage,
            requirementId: resolvedRequirementId,
            commercial: commercialResult,
            sourcingTask:
              sourcingReviewTask?.status === "sync_deferred"
                ? null
                : sourcingReviewTask,
          });
        leadMetadata.supplierCandidateScreening = supplierCandidateScreening;
      } catch (error: any) {
        console.warn("[talk] Internal supplier candidate screening deferred", {
          tenantId: tenant.id,
          leadId,
          error: String(error?.message || "supplier_candidate_screening_failed"),
        });
        supplierCandidateScreening = {
          status: "sync_deferred",
          screeningState: "not_run",
          source: "verified_internal_supplier_registry",
          threshold: 0.78,
          candidateCount: 0,
          newCandidateCount: 0,
          existingCandidateCount: 0,
          topScore: null,
          sourcingTaskId: null,
          sourcingTaskPublicId: null,
          requiresHumanApproval: true,
          supplierIdentityPublic: false,
          outboundActionsAllowed: false,
          externalDiscoveryStarted: false,
          quoteCreated: false,
          screenedAt: new Date().toISOString(),
        };
        leadMetadata.supplierCandidateScreening = supplierCandidateScreening;
      }
    }

    const assistantText = commercialMode
      ? commercialResult.suggestedAction === "ESCALATE"
        ? commercialResult.language === "fr"
          ? "Je transmets cette demande commerciale pour examen et je reviendrai avec la prochaine étape."
          : "I’m escalating this commercial request for review and will return with the next step."
        : commercialResult.suggestedAction === "ACT"
          ? [
              buildCommercialRetrievalMessage(
                commercialResult,
                commercialRetrieval,
              ),
              buildCommercialActivationMessage(commercialResult),
              buildCommercialCrmMessage(commercialResult, commercialCrm),
              buildSourcingReviewTaskMessage(
                commercialResult,
                sourcingReviewTask,
              ),
              buildSupplierCandidateScreeningMessage(
                commercialResult,
                supplierCandidateScreening,
              ),
              ...(needsContact
                ? [buildCommercialContactPrompt(commercialResult)]
                : []),
            ]
              .filter(Boolean)
              .join(" ")
          : buildCommercialClarificationMessage(commercialResult)
      : buildFollowupAssistantMessage({ intent, hasContact, needsContact });

    const [assistant] = await db
      .insert(chatMessages)
      .values({
        tenantId: tenant.id,
        leadId,
        role: "assistant",
        content: assistantText,
        createdAt: new Date(),
      })
      .returning();

    await db
      .update(chatLeads)
      .set({
        intent,
        name: nextName,
        email: nextEmail,
        phone: nextPhone,
        status: hasContact ? "triaged" : lead.status,
        metadata: leadMetadata,
        updatedAt: new Date(),
      })
      .where(and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)));

    if (commercialMode) {
      await db.insert(chatEvents).values({
        tenantId: tenant.id,
        leadId,
        eventType: "commercial_intent",
        payload: {
          intent: commercialResult.intent,
          confidence: commercialResult.confidence,
          language: commercialResult.language,
          missingFields: commercialResult.missingFields,
          suggestedAction: commercialResult.suggestedAction,
          commercialMode,
          requirementId: resolvedRequirementId,
          productRequirementId: resolvedProductRequirementId,
        },
        createdAt: new Date(),
      });

      if (commercialRetrieval) {
        await db.insert(chatEvents).values({
          tenantId: tenant.id,
          leadId,
          eventType: "commercial_retrieval",
          payload: {
            status: commercialRetrieval.status,
            source: commercialRetrieval.source,
            searched: commercialRetrieval.searched,
            searchedAt: commercialRetrieval.searchedAt,
            threshold: commercialRetrieval.threshold,
            query: commercialRetrieval.query,
            verifiedMatchCount: commercialRetrieval.verifiedMatchCount,
            publicMatchCount: commercialRetrieval.publicMatchCount,
          },
          createdAt: new Date(),
        });
      }

      if (commercialResult.suggestedAction === "ACT") {
        const actionPayload = requirementUpsertResult?.eventPayload || {
          action: "ACTIVATE_FLOW",
          intent: commercialResult.intent,
          product: commercialResult.product,
          destination: commercialResult.destination,
          targetPrice: commercialResult.targetPrice,
        };
        await db.insert(chatEvents).values({
          tenantId: tenant.id,
          leadId,
          eventType: "commercial_action",
          payload: actionPayload,
          createdAt: new Date(),
        });
      }

      const crmPayload = normalizeEventPayload(leadMetadata.commercialCrm);
      if (Object.keys(crmPayload).length > 0) {
        await db.insert(chatEvents).values({
          tenantId: tenant.id,
          leadId,
          eventType: "commercial_crm",
          payload: crmPayload,
          createdAt: new Date(),
        });
      }

      const sourcingTaskPayload = normalizeEventPayload(
        leadMetadata.sourcingReviewTask,
      );
      if (Object.keys(sourcingTaskPayload).length > 0) {
        await db.insert(chatEvents).values({
          tenantId: tenant.id,
          leadId,
          eventType: "sourcing_review_task",
          payload: sourcingTaskPayload,
          createdAt: new Date(),
        });
      }

      const supplierScreeningPayload = normalizeEventPayload(
        leadMetadata.supplierCandidateScreening,
      );
      if (Object.keys(supplierScreeningPayload).length > 0) {
        await db.insert(chatEvents).values({
          tenantId: tenant.id,
          leadId,
          eventType: "supplier_candidate_screening",
          payload: supplierScreeningPayload,
          createdAt: new Date(),
        });
      }
    }

    let notify: any = null;
    if (shouldNotify) notify = await maybeNotifyLead(tenant, leadId);

    const responseCommercial =
      commercialMode && commercialResult
        ? {
            ...commercialResult,
            requirementId: requirementUpsertResult?.requirementId || commercialResult.requirementId,
            requirementReferenceCode:
              requirementUpsertResult?.requirementReferenceCode || commercialResult.requirementReferenceCode,
            productRequirementId:
              requirementUpsertResult?.productRequirementId || commercialResult.productRequirementId,
          }
        : null;

    let eventRows: Array<{ id: number; eventType: string; payload: unknown; createdAt: Date | null }> = [];
    if (commercialMode) {
      eventRows = await db
        .select()
        .from(chatEvents)
        .where(and(eq(chatEvents.tenantId, tenant.id), eq(chatEvents.leadId, leadId)))
        .orderBy(desc(chatEvents.createdAt))
        .limit(60);
    }

    const responseEvents = toTimelineEvents(eventRows);

    res.json({
      ok: true,
      leadId,
      messages: [{ role: assistant.role, content: assistant.content, createdAt: assistant.createdAt }],
      notify,
      lead: { intent, hasContact, hadContact },
      requirement: requirementUpsertResult?.requirementId
        ? {
            id: requirementUpsertResult.requirementId,
            referenceCode: requirementUpsertResult.requirementReferenceCode,
            productRequirementId:
              requirementUpsertResult.productRequirementId || null,
          }
        : null,
      commercial: responseCommercial,
      crm: normalizeEventPayload(leadMetadata.commercialCrm),
      sourcingTask: normalizeEventPayload(leadMetadata.sourcingReviewTask),
      supplierCandidateScreening: normalizeEventPayload(
        leadMetadata.supplierCandidateScreening,
      ),
      retrieval: commercialRetrieval,
      events: responseEvents,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to send message" });
  }
});

router.get("/api/talk/health", (req: any, res) => {
  const tenant = req.tenant ? { id: req.tenant.id, key: req.tenant.key } : null;
  res.json({ ok: true, tenant });
});

router.get("/api/talk/leads/:id", async (req: any, res) => {
  try {
    await ensureTalkTables();
    const tenant = ensureTenant(req, res);
    if (!tenant) return;

    const leadId = String(req.params?.id || "").trim();
    if (!leadId) return res.status(400).json({ message: "lead id required" });

    const lead = await db.query.chatLeads.findFirst({
      where: and(eq(chatLeads.tenantId, tenant.id), eq(chatLeads.id, leadId)),
    });
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const limit = Math.min(Math.max(parseInt(String(req.query?.limit || "80"), 10) || 80, 1), 200);
    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.tenantId, tenant.id), eq(chatMessages.leadId, leadId)))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);

    const messages = [...rows]
      .reverse()
      .map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt }));
    const eventLimit = Math.min(Math.max(parseInt(String(req.query?.eventLimit || "120"), 10) || 120, 1), 400);
    const eventRows = await db
      .select()
      .from(chatEvents)
      .where(and(eq(chatEvents.tenantId, tenant.id), eq(chatEvents.leadId, leadId)))
      .orderBy(desc(chatEvents.createdAt))
      .limit(eventLimit);
    const events = toTimelineEvents(eventRows);
    const leadMetadata =
      typeof lead.metadata === "object" && lead.metadata !== null
        ? (lead.metadata as Record<string, unknown>)
        : {};
    const commercial = normalizeCommercialIntentFromMetadata(leadMetadata);
    const retrieval =
      leadMetadata.commercialRetrieval &&
      typeof leadMetadata.commercialRetrieval === "object"
        ? leadMetadata.commercialRetrieval
        : null;
    const crm =
      leadMetadata.commercialCrm &&
      typeof leadMetadata.commercialCrm === "object"
        ? leadMetadata.commercialCrm
        : null;
    const sourcingTask =
      leadMetadata.sourcingReviewTask &&
      typeof leadMetadata.sourcingReviewTask === "object"
        ? leadMetadata.sourcingReviewTask
        : null;
    const supplierCandidateScreening =
      leadMetadata.supplierCandidateScreening &&
      typeof leadMetadata.supplierCandidateScreening === "object"
        ? leadMetadata.supplierCandidateScreening
        : null;
    const requirementId = commercial?.requirementId || null;
    const requirementReferenceCode = commercial?.requirementReferenceCode || null;
    const productRequirementId = commercial?.productRequirementId || null;

    res.json({
      ok: true,
      lead: {
        id: lead.id,
        intent: lead.intent,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        commercial,
        crm,
        sourcingTask,
        supplierCandidateScreening,
        retrieval,
        requirement: requirementId
          ? {
              id: requirementId,
              referenceCode: requirementReferenceCode,
              productRequirementId,
            }
          : null,
      },
      messages,
      events,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load lead" });
  }
});

export default router;
