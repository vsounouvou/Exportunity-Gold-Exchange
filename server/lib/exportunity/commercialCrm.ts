import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { companies, deals, salesLeads } from "@db/schema";

import type { CommercialIntentResult } from "../commercialIntentEngine";
import { ensureCommercialCrmTables } from "./ensureCommercialCrmTables";
import { projectCommercialCrmState } from "./commercialCrmPolicy";

export type CommercialCrmSyncStatus =
  | "lead_captured"
  | "opportunity_opened"
  | "operator_company_missing";

export interface CommercialCrmSyncResult {
  status: CommercialCrmSyncStatus;
  leadId: number | null;
  opportunityId: number | null;
  opportunityReferenceCode: string | null;
  stage: "new" | "warm" | "qualified" | string;
  createdLead: boolean;
  createdOpportunity: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textOrNull(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function intentSnapshot(commercial: CommercialIntentResult) {
  return {
    intent: commercial.intent,
    confidence: commercial.confidence,
    language: commercial.language,
    product: commercial.product || null,
    origin: commercial.origin || null,
    destination: commercial.destination || null,
    targetPrice: commercial.targetPrice ?? null,
    currency: commercial.currency || null,
    deadline: commercial.deadline || null,
    frequency: commercial.frequency || null,
    incoterm: commercial.incoterm || null,
    customerType: commercial.customerType || null,
    missingFields: commercial.missingFields,
    suggestedAction: commercial.suggestedAction,
  };
}

export async function syncTalkCommercialCrm(input: {
  tenantId: number;
  chatLeadId: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  commercial: CommercialIntentResult;
  requirementId?: string | null;
  requirementReferenceCode?: string | null;
}): Promise<CommercialCrmSyncResult> {
  await ensureCommercialCrmTables();

  const hasContact = Boolean(textOrNull(input.email) || textOrNull(input.phone));
  const projection = projectCommercialCrmState({
    commercial: input.commercial,
    contactName: input.contactName,
    hasContact,
    requirementId: input.requirementId,
    requirementReferenceCode: input.requirementReferenceCode,
  });
  const now = new Date();
  const commercialIntent = intentSnapshot(input.commercial);

  return db.transaction(async (tx) => {
    const [operatorCompany] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.tenantId, input.tenantId))
      .orderBy(companies.id)
      .limit(1);

    if (!operatorCompany) {
      return {
        status: "operator_company_missing",
        leadId: null,
        opportunityId: null,
        opportunityReferenceCode: null,
        stage: projection.leadStatus,
        createdLead: false,
        createdOpportunity: false,
      };
    }

    const leadWhere = and(
      eq(salesLeads.tenantId, input.tenantId),
      eq(salesLeads.sourceChatLeadId, input.chatLeadId),
    );
    let [existingLead] = await tx
      .select({
        id: salesLeads.id,
        name: salesLeads.name,
        email: salesLeads.email,
        phone: salesLeads.phone,
        tags: salesLeads.tags,
        customFields: salesLeads.customFields,
        metadata: salesLeads.metadata,
      })
      .from(salesLeads)
      .where(leadWhere)
      .limit(1);

    const leadMetadata = {
      ...record(existingLead?.metadata),
      tenantId: input.tenantId,
      source: "exportunity_talk",
      sourceChatLeadId: input.chatLeadId,
      commercialIntent,
      requirementId: input.requirementId || null,
      requirementReferenceCode: input.requirementReferenceCode || null,
      qualificationLastSyncedAt: now.toISOString(),
    };
    const customFields = {
      ...record(existingLead?.customFields),
      commercialIntent,
    };
    const tags = Array.from(
      new Set([
        ...(Array.isArray(existingLead?.tags) ? existingLead.tags.map(String) : []),
        "exportunity",
        "talk-intake",
        input.commercial.intent,
      ]),
    );
    const leadName =
      textOrNull(input.contactName) || existingLead?.name || projection.leadName;
    const email = textOrNull(input.email) || existingLead?.email || null;
    const phone = textOrNull(input.phone) || existingLead?.phone || null;
    let createdLead = false;

    if (existingLead) {
      await tx
        .update(salesLeads)
        .set({
          name: leadName,
          email,
          phone,
          status: projection.leadStatus,
          tags,
          customFields,
          metadata: leadMetadata,
          updatedAt: now,
        })
        .where(
          and(
            eq(salesLeads.id, existingLead.id),
            eq(salesLeads.tenantId, input.tenantId),
          ),
        );
    } else {
      const [insertedLead] = await tx
        .insert(salesLeads)
        .values({
          tenantId: input.tenantId,
          companyId: operatorCompany.id,
          sourceChatLeadId: input.chatLeadId,
          name: leadName,
          email,
          phone,
          source: "website",
          status: projection.leadStatus,
          score: 0,
          tags,
          customFields,
          metadata: leadMetadata,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({
          id: salesLeads.id,
          name: salesLeads.name,
          email: salesLeads.email,
          phone: salesLeads.phone,
          tags: salesLeads.tags,
          customFields: salesLeads.customFields,
          metadata: salesLeads.metadata,
        });
      createdLead = Boolean(insertedLead);
      existingLead = insertedLead;
      if (!existingLead) {
        [existingLead] = await tx
          .select({
            id: salesLeads.id,
            name: salesLeads.name,
            email: salesLeads.email,
            phone: salesLeads.phone,
            tags: salesLeads.tags,
            customFields: salesLeads.customFields,
            metadata: salesLeads.metadata,
          })
          .from(salesLeads)
          .where(leadWhere)
          .limit(1);
      }
    }

    if (!existingLead || !projection.shouldOpenOpportunity || !input.requirementId) {
      return {
        status: "lead_captured",
        leadId: existingLead?.id || null,
        opportunityId: null,
        opportunityReferenceCode: null,
        stage: projection.leadStatus,
        createdLead,
        createdOpportunity: false,
      };
    }

    const opportunityWhere = and(
      eq(deals.tenantId, input.tenantId),
      eq(deals.industrialRequirementId, input.requirementId),
    );
    let [existingOpportunity] = await tx
      .select({
        id: deals.id,
        stage: deals.stage,
        referenceCode: deals.referenceCode,
        history: deals.history,
        metadata: deals.metadata,
      })
      .from(deals)
      .where(opportunityWhere)
      .limit(1);
    let createdOpportunity = false;

    const currentStage = String(existingOpportunity?.stage || "lead");
    const nextStage = currentStage === "lead" ? "qualified" : currentStage;
    const priorHistory = Array.isArray(existingOpportunity?.history)
      ? existingOpportunity.history
      : [];
    const history = existingOpportunity && nextStage === currentStage
      ? priorHistory
      : [
          ...priorHistory,
          {
            stage: "qualified",
            changedAt: now.toISOString(),
            changedBy: "exportunity_talk_intake",
            notes: "Contact and a reviewable industrial requirement were captured.",
          },
        ];
    const opportunityMetadata = {
      ...record(existingOpportunity?.metadata),
      tenantId: input.tenantId,
      source: "exportunity_talk",
      sourceChatLeadId: input.chatLeadId,
      industrialRequirementId: input.requirementId,
      industrialRequirementReferenceCode:
        input.requirementReferenceCode || null,
      commercialIntent,
      qualificationLastSyncedAt: now.toISOString(),
      valueStatus: "unknown_until_quote_or_explicit_budget",
    };

    if (existingOpportunity) {
      await tx
        .update(deals)
        .set({
          leadId: existingLead.id,
          sourceChatLeadId: input.chatLeadId,
          name: projection.opportunityName,
          stage: nextStage as any,
          history,
          metadata: opportunityMetadata,
          updatedAt: now,
        })
        .where(
          and(
            eq(deals.id, existingOpportunity.id),
            eq(deals.tenantId, input.tenantId),
          ),
        );
    } else {
      const [insertedOpportunity] = await tx
        .insert(deals)
        .values({
          tenantId: input.tenantId,
          companyId: operatorCompany.id,
          leadId: existingLead.id,
          sourceChatLeadId: input.chatLeadId,
          industrialRequirementId: input.requirementId,
          referenceCode: projection.opportunityReferenceCode,
          name: projection.opportunityName,
          // Do not infer total value or currency from a target unit price.
          value: projection.value,
          currency: projection.currency,
          stage: "qualified",
          probability: 0,
          history,
          metadata: opportunityMetadata,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({
          id: deals.id,
          stage: deals.stage,
          referenceCode: deals.referenceCode,
          history: deals.history,
          metadata: deals.metadata,
        });
      createdOpportunity = Boolean(insertedOpportunity);
      existingOpportunity = insertedOpportunity;
      if (!existingOpportunity) {
        [existingOpportunity] = await tx
          .select({
            id: deals.id,
            stage: deals.stage,
            referenceCode: deals.referenceCode,
            history: deals.history,
            metadata: deals.metadata,
          })
          .from(deals)
          .where(opportunityWhere)
          .limit(1);
      }
    }

    return {
      status: "opportunity_opened",
      leadId: existingLead.id,
      opportunityId: existingOpportunity?.id || null,
      opportunityReferenceCode:
        existingOpportunity?.referenceCode || projection.opportunityReferenceCode,
      stage: String(existingOpportunity?.stage || nextStage),
      createdLead,
      createdOpportunity,
    };
  });
}
