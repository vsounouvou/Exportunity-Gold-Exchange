import { Router } from "express";
import multer from "multer";
import { createReadStream } from "node:fs";
import { db } from "@db";
import {
  companyBrainAuditEvents,
  companyBrainClaimApprovals,
  companyBrainClaimConflicts,
  companyBrainClaims,
  companyBrainSourceVersions,
} from "@db/schema";
import { and, eq, sql } from "drizzle-orm";

import { bootstrapFounderAuthorizedCharter } from "../lib/company-brain/founderCharter";
import { getCompanyBrainFeatureStatus, isCompanyBrainFeatureEnabled } from "../lib/company-brain/featureFlags";
import { evaluateCompanyBrainClaimReview } from "../lib/company-brain/governancePolicy";
import { persistManualCompanyBrainEvidence } from "../lib/company-brain/manualEvidence";
import { resolvePrivateCompanyBrainEvidence } from "../lib/company-brain/manualEvidenceStorage";
import { reclassifyCompanyBrainSourceVersion } from "../lib/company-brain/sourceClassification";
import {
  buildRelationshipCandidate,
  RELATIONSHIP_RECONSTRUCTION_MODE,
  summarizeRelationshipCandidates,
  type RelationshipCandidate,
} from "../lib/company-brain/relationshipReconstruction";
import { ensureTenantAdmin } from "./utils/auth";

const router = Router();
const manualEvidenceMaxBytesRaw = Number(process.env.COMPANY_BRAIN_UPLOAD_MAX_BYTES || 40 * 1024 * 1024);
const manualEvidenceMaxBytes = Number.isFinite(manualEvidenceMaxBytesRaw)
  ? Math.max(1 * 1024 * 1024, Math.min(50 * 1024 * 1024, Math.trunc(manualEvidenceMaxBytesRaw)))
  : 40 * 1024 * 1024;
const manualEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: manualEvidenceMaxBytes, files: 1 },
});

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rowsOf(result: any): any[] {
  if (Array.isArray(result?.rows)) return result.rows;
  return Array.isArray(result) ? result : [];
}

function tenantIdFromReq(req: any) {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    const error = new Error("Tenant not resolved");
    (error as any).status = 400;
    throw error;
  }
  return tenantId;
}

function adminUserIdFromReq(req: any) {
  const userId = Number(req?.adminUser?.id || req?.staffUser?.id || 0);
  if (!Number.isInteger(userId) || userId <= 0) {
    const error = new Error("Administrator identity not resolved");
    (error as any).status = 401;
    throw error;
  }
  return userId;
}

function positiveInt(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`${label} must be a positive integer`);
    (error as any).status = 400;
    throw error;
  }
  return parsed;
}

function statusOf(error: any, fallback = 500) {
  const value = Number(error?.status || error?.statusCode || fallback);
  return Number.isInteger(value) && value >= 400 && value <= 599 ? value : fallback;
}

function assertCompanyBrainEnabled() {
  if (!isCompanyBrainFeatureEnabled("companyBrain")) {
    const error = new Error("Company Brain is disabled. Enable FEATURE_COMPANY_BRAIN first.");
    (error as any).status = 503;
    throw error;
  }
}

async function safelyReadRelationshipRows(
  source: string,
  reader: () => Promise<any>,
  warnings: string[],
) {
  try {
    return rowsOf(await reader());
  } catch {
    warnings.push(`${source} records are not available in this environment.`);
    return [];
  }
}

async function audit(input: {
  tenantId: number;
  userId: number;
  eventType: string;
  entityType: string;
  entityId?: string | number | null;
  payload?: Record<string, unknown>;
}, executor: any = db) {
  await executor.insert(companyBrainAuditEvents).values({
    tenantId: input.tenantId,
    actorType: "user",
    actorId: String(input.userId),
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId == null ? null : String(input.entityId),
    payload: input.payload || {},
  });
}

async function claimReviewState(tenantId: number, claimId: number, approvedWording?: string | null) {
  const claimResult = await db.execute(sql`
    select c.id, c.status, c.conflict_status, c.claim_text, c.approved_external_wording
    from company_brain_claims c
    where c.id = ${claimId} and c.tenant_id = ${tenantId}
    limit 1
  `);
  const claim = rowsOf(claimResult)[0];
  if (!claim) {
    const error = new Error("Company Brain claim not found");
    (error as any).status = 404;
    throw error;
  }

  const evidenceResult = await db.execute(sql`
    select
      ce.support_type,
      s.status as source_status,
      sv.security_status,
      sv.extraction_status,
      ce.excerpt,
      sv.extracted_text
    from company_brain_claim_evidence ce
    join company_brain_sources s on s.id = ce.source_id
    join company_brain_source_versions sv on sv.id = ce.source_version_id and sv.source_id = s.id
    where ce.claim_id = ${claimId} and s.tenant_id = ${tenantId}
  `);
  const countsResult = await db.execute(sql`
    select
      count(*) filter (where status = 'open')::int as open_conflict_count,
      (
        select count(*)::int
        from company_brain_claim_approvals a
        where a.claim_id = ${claimId}
          and a.approval_scope = 'external_publication'
          and a.status = 'pending'
      ) as pending_external_approval_count
    from company_brain_claim_conflicts
    where claim_id = ${claimId}
  `);
  const counts = rowsOf(countsResult)[0] || {};
  const evidence = rowsOf(evidenceResult).map((row) => ({
    supportType: row.support_type,
    sourceStatus: row.source_status,
    securityStatus: row.security_status,
    extractionStatus: row.extraction_status,
    excerpt: row.excerpt,
    extractedText: row.extracted_text,
  }));
  const review = evaluateCompanyBrainClaimReview({
    evidence,
    openConflictCount: Number(counts.open_conflict_count || 0),
    pendingExternalApprovalCount: Number(counts.pending_external_approval_count || 0),
    claimStatus: claim.status,
    approvedWording: approvedWording ?? claim.approved_external_wording,
  });
  return { claim, evidence, review };
}

router.use(ensureTenantAdmin);

router.get("/summary", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const [summaryResult, sourceSecurityResult, recentContextResult, recentAuditResult] = await Promise.all([
      db.execute(sql`
        select
          (select count(*)::int from company_brain_sources where tenant_id = ${tenantId}) as sources,
          (select count(*)::int from company_brain_sources where tenant_id = ${tenantId} and status = 'active') as active_sources,
          (select count(*)::int from company_brain_claims where tenant_id = ${tenantId}) as claims,
          (select count(*)::int from company_brain_claims where tenant_id = ${tenantId} and status in ('verified', 'verified_internal_only')) as verified_internal_claims,
          (select count(*)::int from company_brain_claims where tenant_id = ${tenantId} and status = 'approved_external') as approved_external_claims,
          (select count(*)::int from company_brain_claim_conflicts cc join company_brain_claims c on c.id = cc.claim_id where c.tenant_id = ${tenantId} and cc.status = 'open') as open_conflicts,
          (select count(*)::int from company_brain_claim_approvals a join company_brain_claims c on c.id = a.claim_id where c.tenant_id = ${tenantId} and a.status = 'pending') as pending_approvals
      `),
      db.execute(sql`
        select sv.security_status, count(*)::int as count
        from company_brain_source_versions sv
        join company_brain_sources s on s.id = sv.source_id
        where s.tenant_id = ${tenantId}
        group by sv.security_status
        order by sv.security_status
      `),
      db.execute(sql`
        select id, task_key, purpose, status, source_citations, conflict_summaries, created_at, expires_at
        from company_brain_context_packs
        where tenant_id = ${tenantId}
        order by created_at desc
        limit 12
      `),
      db.execute(sql`
        select id, actor_type, actor_id, event_type, entity_type, entity_id, payload, created_at
        from company_brain_audit_events
        where tenant_id = ${tenantId}
        order by created_at desc
        limit 20
      `),
    ]);
    res.json({
      ok: true,
      flags: getCompanyBrainFeatureStatus(),
      counts: rowsOf(summaryResult)[0] || {},
      sourceSecurity: rowsOf(sourceSecurityResult),
      recentContextPacks: rowsOf(recentContextResult),
      recentAuditEvents: rowsOf(recentAuditResult),
    });
  } catch (error) {
    res.status(statusOf(error)).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/relationship-reconstruction", async (req: any, res) => {
  try {
    assertCompanyBrainEnabled();
    const tenantId = tenantIdFromReq(req);
    const search = asText(req.query.search).slice(0, 160).toLowerCase();
    const requestedLimit = Number(req.query.limit || 100);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(200, Math.trunc(requestedLimit)))
      : 100;
    const sourceLimit = Math.min(250, Math.max(limit * 2, 50));
    const warnings: string[] = [];

    const [requirementRows, factoryRows, emailRows, workspaceEmailRows, conversationRows] = await Promise.all([
      safelyReadRelationshipRows("Industrial requirement", () => db.execute(sql`
        select
          ir.id::text as entity_id,
          ir.reference_code,
          ir.title,
          ir.requester_company,
          ir.requester_name,
          ir.customer_contact_id,
          ir.status::text,
          ir.next_action,
          ir.next_action_at,
          ir.updated_at,
          ir.source_conversation_id,
          ipr.product_name,
          ipr.quantity_text as product_quantity,
          ipr.destination,
          coalesce(tc.consent_status::text, c.consent_status::text, 'unknown') as consent_status,
          coalesce(tc.is_dnc, c.is_dnc, false) as is_dnc,
          (select count(*)::int from industrial_quotes iq where iq.requirement_id = ir.id and iq.tenant_id = ir.tenant_id) as quote_count,
          (select count(*)::int from industrial_commercial_offers ico where ico.requirement_id = ir.id and ico.tenant_id = ir.tenant_id) as offer_count
        from industrial_requirements ir
        left join industrial_product_requirements ipr
          on ipr.requirement_id = ir.id and ipr.tenant_id = ir.tenant_id
        left join contacts c on c.id = ir.customer_contact_id
        left join tenant_contacts tc
          on tc.tenant_id = ir.tenant_id and tc.contact_id = ir.customer_contact_id
        where ir.tenant_id = ${tenantId}
          and ir.status not in ('closed'::industrial_requirement_status, 'cancelled'::industrial_requirement_status)
          and (
            (ir.next_action_at is not null and ir.next_action_at <= now())
            or ir.updated_at <= now() - interval '14 days'
          )
        order by ir.next_action_at asc nulls last, ir.updated_at asc
        limit ${sourceLimit}
      `), warnings),
      safelyReadRelationshipRows("Factory relationship", () => db.execute(sql`
        select
          rel.id::text as entity_id,
          rel.factory_id::text,
          rel.stage::text,
          rel.next_action,
          rel.next_review_at,
          rel.last_contacted_at,
          rel.updated_at,
          f.display_name,
          f.legal_name,
          f.city,
          f.country_code,
          f.primary_industry
        from industrial_factory_relationships rel
        join industrial_factories f
          on f.id = rel.factory_id and f.tenant_id = rel.tenant_id
        where rel.tenant_id = ${tenantId}
          and rel.stage <> 'disqualified'::industrial_factory_relationship_stage
          and (
            rel.stage = 'dormant'::industrial_factory_relationship_stage
            or (rel.next_review_at is not null and rel.next_review_at <= now())
            or (
              rel.last_contacted_at is not null
              and rel.last_contacted_at <= now() - interval '90 days'
            )
          )
        order by rel.next_review_at asc nulls last, rel.last_contacted_at asc nulls last
        limit ${sourceLimit}
      `), warnings),
      safelyReadRelationshipRows("Email thread", () => db.execute(sql`
        with latest_message as (
          select distinct on (em.thread_id)
            em.thread_id,
            em.id,
            em.direction,
            em.status,
            em.from_email,
            em.to_json,
            em.subject,
            em.created_at
          from email_messages em
          where em.tenant_id = ${tenantId} and em.thread_id is not null
          order by em.thread_id, em.created_at desc, em.id desc
        )
        select
          et.id::text as entity_id,
          coalesce(lm.subject, et.subject, 'Email conversation') as subject,
          lm.created_at as last_message_at,
          coalesce(lm.to_json ->> 0, '') as peer_email,
          c.id as contact_id,
          coalesce(c.display_name, trim(concat_ws(' ', c.given_name, c.family_name)), trim(concat_ws(' ', c.first_name, c.last_name))) as contact_name,
          c.company as contact_company,
          coalesce(tc.consent_status::text, c.consent_status::text, 'unknown') as consent_status,
          coalesce(tc.is_dnc, c.is_dnc, false) as is_dnc
        from email_threads et
        join latest_message lm on lm.thread_id = et.id
        left join lateral (
          select person.*
          from contacts person
          join tenant_contacts tenant_person
            on tenant_person.contact_id = person.id and tenant_person.tenant_id = ${tenantId}
          where lower(coalesce(person.primary_email, person.email, '')) = lower(coalesce(lm.to_json ->> 0, ''))
          order by person.updated_at desc
          limit 1
        ) c on true
        left join tenant_contacts tc on tc.tenant_id = ${tenantId} and tc.contact_id = c.id
        where et.tenant_id = ${tenantId}
          and lm.direction = 'outbound'
          and lm.status = 'sent'
          and lm.created_at <= now() - interval '7 days'
        order by lm.created_at asc
        limit ${sourceLimit}
      `), warnings),
      safelyReadRelationshipRows("Google Workspace email evidence", () => db.execute(sql`
        with workspace_gmail_messages as (
          select
            s.id::text as source_id,
            coalesce(nullif(s.metadata ->> 'threadId', ''), s.provider_source_id) as thread_id,
            s.title as subject,
            s.source_url,
            coalesce(latest.source_modified_at, s.updated_at) as last_message_at,
            coalesce(nullif(s.metadata ->> 'direction', ''), 'unknown') as direction,
            coalesce(s.metadata -> 'correspondentEmails' ->> 0, '') as peer_email,
            s.metadata -> 'evidenceClassification' -> 'businessSignals' as business_signals,
            count(*) over (
              partition by coalesce(nullif(s.metadata ->> 'threadId', ''), s.provider_source_id)
            )::int as message_count,
            row_number() over (
              partition by coalesce(nullif(s.metadata ->> 'threadId', ''), s.provider_source_id)
              order by coalesce(latest.source_modified_at, s.updated_at) desc, s.id desc
            ) as latest_rank
          from company_brain_sources s
          join lateral (
            select sv.source_modified_at, sv.security_status
            from company_brain_source_versions sv
            where sv.source_id = s.id
            order by sv.created_at desc, sv.id desc
            limit 1
          ) latest on latest.security_status = 'clean'
          where s.tenant_id = ${tenantId}
            and s.connector_type = 'google_gmail'
            and s.status = 'active'
        )
        select
          wm.*,
          c.id as contact_id,
          coalesce(c.display_name, trim(concat_ws(' ', c.given_name, c.family_name)), trim(concat_ws(' ', c.first_name, c.last_name))) as contact_name,
          c.company as contact_company,
          coalesce(tc.consent_status::text, c.consent_status::text, 'unknown') as consent_status,
          coalesce(tc.is_dnc, c.is_dnc, false) as is_dnc
        from workspace_gmail_messages wm
        left join lateral (
          select person.*
          from contacts person
          join tenant_contacts tenant_person
            on tenant_person.contact_id = person.id and tenant_person.tenant_id = ${tenantId}
          where wm.peer_email <> ''
            and lower(coalesce(person.primary_email, person.email, '')) = lower(wm.peer_email)
          order by person.updated_at desc
          limit 1
        ) c on true
        left join tenant_contacts tc on tc.tenant_id = ${tenantId} and tc.contact_id = c.id
        where wm.latest_rank = 1
        order by wm.last_message_at desc
        limit ${sourceLimit}
      `), warnings),
      safelyReadRelationshipRows("Website conversation", () => db.execute(sql`
        select
          lead.id::text as entity_id,
          lead.intent,
          lead.name,
          lead.email,
          lead.country,
          lead.summary,
          lead.status::text,
          lead.updated_at,
          c.id as contact_id,
          c.company as contact_company,
          coalesce(tc.consent_status::text, c.consent_status::text, 'unknown') as consent_status,
          coalesce(tc.is_dnc, c.is_dnc, false) as is_dnc
        from chat_leads lead
        left join lateral (
          select person.*
          from contacts person
          join tenant_contacts tenant_person
            on tenant_person.contact_id = person.id and tenant_person.tenant_id = ${tenantId}
          where lead.email is not null
            and lower(coalesce(person.primary_email, person.email, '')) = lower(lead.email)
          order by person.updated_at desc
          limit 1
        ) c on true
        left join tenant_contacts tc on tc.tenant_id = ${tenantId} and tc.contact_id = c.id
        where lead.tenant_id = ${tenantId}
          and lead.status in ('new'::chat_lead_status, 'triaged'::chat_lead_status)
          and lead.updated_at <= now() - interval '1 day'
        order by lead.updated_at asc
        limit ${sourceLimit}
      `), warnings),
    ]);

    const candidates: RelationshipCandidate[] = [];
    for (const row of requirementRows) {
      const quoteCount = Number(row.quote_count || 0);
      const offerCount = Number(row.offer_count || 0);
      const facts = [
        `The requirement ${row.reference_code} remains in ${String(row.status || "open").replaceAll("_", " ")} status.`,
        quoteCount ? `${quoteCount} customer quote record(s) are linked.` : "",
        offerCount ? `${offerCount} internal commercial offer record(s) are linked.` : "",
      ].filter(Boolean);
      candidates.push(buildRelationshipCandidate({
        id: `requirement:${row.entity_id}`,
        kind: "stalled_requirement",
        title: row.product_name || row.title || `Requirement ${row.reference_code}`,
        organization: row.requester_company,
        person: row.requester_name,
        stage: row.status,
        lastActivityAt: row.updated_at,
        dueAt: row.next_action_at,
        nextAction: row.next_action,
        facts,
        evidence: [
          { entityType: "industrial_requirement", entityId: String(row.entity_id), label: String(row.reference_code) },
          ...(row.customer_contact_id
            ? [{ entityType: "contact", entityId: String(row.customer_contact_id), label: "Canonical contact" }]
            : []),
          ...(row.source_conversation_id
            ? [{ entityType: "conversation", entityId: String(row.source_conversation_id), label: "Source conversation" }]
            : []),
        ],
        consentStatus: row.consent_status,
        isDnc: row.is_dnc,
        commercialEvidenceCount: quoteCount + offerCount,
        openPath: `/admin/industrial-network?requirement=${encodeURIComponent(String(row.entity_id))}`,
      }));
    }

    for (const row of factoryRows) {
      const location = [row.city, row.country_code].filter(Boolean).join(", ");
      candidates.push(buildRelationshipCandidate({
        id: `factory-relationship:${row.entity_id}`,
        kind: "dormant_factory_relationship",
        title: `${row.display_name || row.legal_name || "Factory"} relationship review`,
        organization: row.display_name || row.legal_name,
        stage: row.stage,
        lastActivityAt: row.last_contacted_at || row.updated_at,
        dueAt: row.next_review_at,
        nextAction: row.next_action,
        facts: [
          `The recorded factory relationship is ${String(row.stage || "unreviewed").replaceAll("_", " ")}.`,
          location ? `The factory record is located in ${location}.` : "",
          row.primary_industry ? `Its recorded industry is ${row.primary_industry}.` : "",
        ].filter(Boolean),
        evidence: [
          { entityType: "industrial_factory_relationship", entityId: String(row.entity_id), label: "Relationship record" },
          { entityType: "industrial_factory", entityId: String(row.factory_id), label: "Factory record" },
        ],
        consentStatus: "unknown",
        isDnc: false,
        openPath: "/admin/industrial-network",
      }));
    }

    for (const row of emailRows) {
      candidates.push(buildRelationshipCandidate({
        id: `email-thread:${row.entity_id}`,
        kind: "awaiting_email_reply",
        title: row.subject || "Email conversation",
        organization: row.contact_company,
        person: row.contact_name || row.peer_email,
        stage: "awaiting_review",
        lastActivityAt: row.last_message_at,
        facts: [
          "The latest stored message in this thread is a sent outbound email, and no later inbound message is recorded in the thread.",
        ],
        evidence: [
          { entityType: "email_thread", entityId: String(row.entity_id), label: "Recorded email thread" },
          ...(row.contact_id
            ? [{ entityType: "contact", entityId: String(row.contact_id), label: "Matched canonical contact" }]
            : []),
        ],
        consentStatus: row.consent_status,
        isDnc: row.is_dnc,
      }));
    }

    for (const row of workspaceEmailRows) {
      const businessSignals = Array.isArray(row.business_signals)
        ? row.business_signals.map((value: unknown) => asText(value)).filter(Boolean).slice(0, 4)
        : [];
      const direction = ["inbound", "outbound"].includes(asText(row.direction))
        ? asText(row.direction)
        : "unknown";
      const messageCount = Math.max(1, Number(row.message_count || 1));
      candidates.push(buildRelationshipCandidate({
        id: `workspace-email-thread:${row.thread_id}`,
        kind: "workspace_email_thread",
        title: row.subject || "Imported business email thread",
        organization: row.contact_company,
        person: row.contact_name || row.peer_email,
        stage: `latest_${direction}`,
        lastActivityAt: row.last_message_at,
        facts: [
          `${messageCount} read-only Google Workspace message${messageCount === 1 ? " is" : "s are"} indexed in this business thread.`,
          `The latest safely indexed message direction is ${direction}.`,
          businessSignals.length ? `Recorded business signals: ${businessSignals.join(", ")}.` : "",
          "The relationship meaning and next step have not been confirmed by a person.",
        ].filter(Boolean),
        evidence: [
          { entityType: "company_brain_source", entityId: String(row.source_id), label: "Read-only Gmail evidence" },
          ...(row.contact_id
            ? [{ entityType: "contact", entityId: String(row.contact_id), label: "Matched canonical contact" }]
            : []),
        ],
        consentStatus: row.consent_status,
        isDnc: row.is_dnc,
        openPath: row.source_url || "/admin/company-brain",
      }));
    }

    for (const row of conversationRows) {
      candidates.push(buildRelationshipCandidate({
        id: `conversation:${row.entity_id}`,
        kind: "unresolved_conversation",
        title: row.intent || "Unresolved website conversation",
        organization: row.contact_company,
        person: row.name || row.email,
        stage: row.status,
        lastActivityAt: row.updated_at,
        facts: [
          `The website conversation remains ${String(row.status || "open").replaceAll("_", " ")} and has no recorded closure.`,
          row.country ? `The visitor recorded ${row.country} as the market context.` : "",
        ].filter(Boolean),
        evidence: [
          { entityType: "chat_lead", entityId: String(row.entity_id), label: "Website conversation" },
          ...(row.contact_id
            ? [{ entityType: "contact", entityId: String(row.contact_id), label: "Matched canonical contact" }]
            : []),
        ],
        consentStatus: row.consent_status,
        isDnc: row.is_dnc,
      }));
    }

    const priorityOrder: Record<RelationshipCandidate["priority"], number> = {
      high: 0,
      medium: 1,
      low: 2,
      restricted: 3,
    };
    const filtered = candidates
      .filter((candidate) => {
        if (!search) return true;
        return [candidate.title, candidate.organization, candidate.person, candidate.reason, candidate.stage]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .sort((left, right) =>
        priorityOrder[left.priority] - priorityOrder[right.priority]
        || right.relevanceScore - left.relevanceScore
        || String(left.lastActivityAt || "").localeCompare(String(right.lastActivityAt || "")),
      )
      .slice(0, limit);

    return res.json({
      ok: true,
      mode: RELATIONSHIP_RECONSTRUCTION_MODE,
      externalCommunicationAllowed: false,
      candidates: filtered,
      summary: summarizeRelationshipCandidates(filtered),
      warnings,
    });
  } catch (error) {
    return res.status(statusOf(error)).json({
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/sources", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const search = asText(req.query.search).slice(0, 160);
    const status = asText(req.query.status).slice(0, 40);
    const result = await db.execute(sql`
      select
        s.id, s.title, s.connector_type, s.source_type, s.source_url, s.confidentiality,
        s.business_relevance, s.status, s.metadata, s.created_at, s.updated_at,
        latest.id as latest_version_id, latest.extraction_status, latest.security_status,
        latest.content_hash, latest.created_at as version_created_at,
        coalesce(claim_counts.claim_count, 0)::int as claim_count
      from company_brain_sources s
      left join lateral (
        select sv.id, sv.extraction_status, sv.security_status, sv.content_hash, sv.created_at
        from company_brain_source_versions sv
        where sv.source_id = s.id
        order by sv.created_at desc
        limit 1
      ) latest on true
      left join lateral (
        select count(distinct ce.claim_id)::int as claim_count
        from company_brain_claim_evidence ce
        where ce.source_id = s.id
      ) claim_counts on true
      where s.tenant_id = ${tenantId}
        and (${status} = '' or s.status = ${status})
        and (${search} = '' or s.title ilike ${`%${search}%`} or s.business_relevance ilike ${`%${search}%`})
      order by s.updated_at desc
      limit 200
    `);
    res.json({ ok: true, sources: rowsOf(result) });
  } catch (error) {
    res.status(statusOf(error)).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/sources/upload", manualEvidenceUpload.single("file"), async (req: any, res) => {
  try {
    assertCompanyBrainEnabled();
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "Upload one evidence file under multipart field `file`." });
    if (asText(req.body?.confirm).toLowerCase() !== "true") {
      return res.status(400).json({ message: "Explicit confirmation is required." });
    }
    const result = await persistManualCompanyBrainEvidence({
      tenantId: tenantIdFromReq(req),
      userId: adminUserIdFromReq(req),
      file,
      title: req.body?.title,
      businessRelevance: req.body?.businessRelevance,
      confidentiality: req.body?.confidentiality,
      provenanceNotes: asText(req.body?.provenanceNotes),
    });
    res.status(result.createdVersion ? 201 : 200).json({ ok: true, result });
  } catch (error) {
    res.status(statusOf(error)).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/sources/:sourceId/file", async (req: any, res) => {
  try {
    assertCompanyBrainEnabled();
    const tenantId = tenantIdFromReq(req);
    const userId = adminUserIdFromReq(req);
    const sourceId = positiveInt(req.params.sourceId, "sourceId");
    const result = await db.execute(sql`
      select s.id, s.title, s.mime_type, s.metadata ->> 'originalName' as original_name,
        sv.id as version_id, sv.storage_ref
      from company_brain_sources s
      join lateral (
        select id, storage_ref
        from company_brain_source_versions
        where source_id = s.id and storage_ref is not null
        order by created_at desc
        limit 1
      ) sv on true
      where s.id = ${sourceId} and s.tenant_id = ${tenantId} and s.connector_type = 'manual_upload'
      limit 1
    `);
    const source = rowsOf(result)[0];
    if (!source?.storage_ref) return res.status(404).json({ message: "Company Brain evidence file not found" });
    const file = await resolvePrivateCompanyBrainEvidence(String(source.storage_ref));
    const originalFileName = asText(source.original_name || source.title || "company-evidence").slice(0, 220);
    const safeFileName = originalFileName.replace(/[^a-z0-9._-]+/gi, "_") || "company-evidence";
    const encodedFileName = encodeURIComponent(originalFileName).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    await audit({
      tenantId,
      userId,
      eventType: "source_manual_file_viewed",
      entityType: "company_brain_source_version",
      entityId: source.version_id,
      payload: { sourceId },
    });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", asText(source.mime_type) || "application/octet-stream");
    res.setHeader("Content-Length", String(file.sizeBytes));
    res.setHeader("Content-Disposition", `inline; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`);
    const stream = createReadStream(file.absolutePath);
    stream.on("error", () => {
      if (!res.headersSent) res.status(404).json({ message: "Company Brain evidence file is unavailable" });
      else res.end();
    });
    stream.pipe(res);
  } catch (error) {
    res.status(statusOf(error, 404)).json({ message: "Company Brain evidence file is unavailable" });
  }
});

router.get("/sources/:sourceId", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const sourceId = positiveInt(req.params.sourceId, "sourceId");
    const sourceResult = await db.execute(sql`
      select * from company_brain_sources where id = ${sourceId} and tenant_id = ${tenantId} limit 1
    `);
    const source = rowsOf(sourceResult)[0];
    if (!source) return res.status(404).json({ message: "Company Brain source not found" });
    const [versionsResult, claimsResult] = await Promise.all([
      db.execute(sql`
        select id, provider_version_id, content_hash, extraction_status, security_status,
          classification, redactions, metadata, source_modified_at, created_at,
          case when security_status = 'clean' then left(coalesce(extracted_text, ''), 4000) else null end as text_preview,
          left(coalesce(extracted_text, ''), 4000) as review_preview
        from company_brain_source_versions
        where source_id = ${sourceId}
        order by created_at desc
        limit 30
      `),
      db.execute(sql`
        select c.id, c.canonical_key, c.claim_text, c.status, c.conflict_status,
          ce.support_type, ce.excerpt, ce.locator, ce.source_strength, ce.confidence
        from company_brain_claim_evidence ce
        join company_brain_claims c on c.id = ce.claim_id
        where ce.source_id = ${sourceId} and c.tenant_id = ${tenantId}
        order by c.updated_at desc
      `),
    ]);
    res.json({ ok: true, source, versions: rowsOf(versionsResult), claims: rowsOf(claimsResult) });
  } catch (error) {
    res.status(statusOf(error)).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/sources/:sourceId/versions/:versionId/review", async (req: any, res) => {
  try {
    assertCompanyBrainEnabled();
    const tenantId = tenantIdFromReq(req);
    const userId = adminUserIdFromReq(req);
    const sourceId = positiveInt(req.params.sourceId, "sourceId");
    const versionId = positiveInt(req.params.versionId, "versionId");
    const body = asRecord(req.body);
    const action = asText(body.action);
    const notes = asText(body.notes).slice(0, 4000);
    const nextStatusByAction: Record<string, string> = {
      mark_clean: "clean",
      require_review: "review_required",
      quarantine: "quarantined",
    };
    const nextStatus = nextStatusByAction[action];
    if (!nextStatus) return res.status(400).json({ message: "Unsupported source review action" });
    if (body.confirm !== true) return res.status(400).json({ message: "Explicit confirmation is required" });
    if (!notes) return res.status(400).json({ message: "Review notes are required" });

    const versionResult = await db.execute(sql`
      select sv.id, sv.extraction_status, sv.security_status
      from company_brain_source_versions sv
      join company_brain_sources s on s.id = sv.source_id
      where sv.id = ${versionId} and sv.source_id = ${sourceId} and s.tenant_id = ${tenantId}
      limit 1
    `);
    const version = rowsOf(versionResult)[0];
    if (!version) return res.status(404).json({ message: "Company Brain source version not found" });
    if (action === "mark_clean" && !["extracted", "metadata_only", "manual"].includes(String(version.extraction_status))) {
      return res.status(409).json({ message: "Only extracted, metadata-only, or manual versions can be marked clean" });
    }

    await db.transaction(async (tx) => {
      await tx.update(companyBrainSourceVersions).set({ securityStatus: nextStatus }).where(
        and(eq(companyBrainSourceVersions.id, versionId), eq(companyBrainSourceVersions.sourceId, sourceId)),
      );
      await audit({
        tenantId,
        userId,
        eventType: `source_version_${nextStatus}`,
        entityType: "company_brain_source_version",
        entityId: versionId,
        payload: { sourceId, previousStatus: version.security_status, nextStatus, notes },
      }, tx);
    });
    res.json({ ok: true, sourceId, versionId, securityStatus: nextStatus });
  } catch (error) {
    res.status(statusOf(error)).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/sources/:sourceId/versions/:versionId/classification", async (req: any, res) => {
  try {
    assertCompanyBrainEnabled();
    const body = asRecord(req.body);
    if (body.confirm !== true) return res.status(400).json({ message: "Explicit confirmation is required" });
    const result = await reclassifyCompanyBrainSourceVersion({
      tenantId: tenantIdFromReq(req),
      userId: adminUserIdFromReq(req),
      sourceId: positiveInt(req.params.sourceId, "sourceId"),
      versionId: positiveInt(req.params.versionId, "versionId"),
      confidentiality: body.confidentiality,
      notes: asText(body.notes),
    });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(statusOf(error)).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/claims", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const search = asText(req.query.search).slice(0, 160);
    const status = asText(req.query.status).slice(0, 50);
    const result = await db.execute(sql`
      select
        c.id, c.canonical_key, c.subject_type, c.subject_id, c.claim_text,
        c.internal_wording, c.approved_external_wording, c.structured_value,
        c.status, c.conflict_status, c.confidentiality, c.updated_at,
        count(distinct ce.id)::int as evidence_count,
        count(distinct ce.id) filter (
          where ce.support_type = 'supports' and s.status = 'active'
            and sv.security_status = 'clean'
            and sv.extraction_status in ('extracted', 'metadata_only', 'manual')
            and length(trim(coalesce(ce.excerpt, sv.extracted_text, ''))) > 0
        )::int as eligible_evidence_count,
        count(distinct cc.id) filter (where cc.status = 'open')::int as open_conflict_count,
        count(distinct ca.id) filter (where ca.status = 'pending')::int as pending_approval_count
      from company_brain_claims c
      left join company_brain_claim_evidence ce on ce.claim_id = c.id
      left join company_brain_sources s on s.id = ce.source_id and s.tenant_id = c.tenant_id
      left join company_brain_source_versions sv on sv.id = ce.source_version_id and sv.source_id = s.id
      left join company_brain_claim_conflicts cc on cc.claim_id = c.id
      left join company_brain_claim_approvals ca on ca.claim_id = c.id
      where c.tenant_id = ${tenantId}
        and (${status} = '' or c.status = ${status})
        and (${search} = '' or c.canonical_key ilike ${`%${search}%`} or c.claim_text ilike ${`%${search}%`})
      group by c.id
      order by c.updated_at desc
      limit 300
    `);
    res.json({ ok: true, claims: rowsOf(result) });
  } catch (error) {
    res.status(statusOf(error)).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/claims/:claimId", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const claimId = positiveInt(req.params.claimId, "claimId");
    const claimResult = await db.execute(sql`
      select * from company_brain_claims where id = ${claimId} and tenant_id = ${tenantId} limit 1
    `);
    const claim = rowsOf(claimResult)[0];
    if (!claim) return res.status(404).json({ message: "Company Brain claim not found" });
    const [evidenceResult, conflictsResult, approvalsResult] = await Promise.all([
      db.execute(sql`
        select ce.id, ce.support_type, ce.excerpt, ce.locator, ce.source_strength, ce.confidence,
          s.id as source_id, s.title as source_title, s.source_url, s.status as source_status,
          sv.id as source_version_id, sv.content_hash, sv.extraction_status, sv.security_status
        from company_brain_claim_evidence ce
        join company_brain_sources s on s.id = ce.source_id
        join company_brain_source_versions sv on sv.id = ce.source_version_id and sv.source_id = s.id
        where ce.claim_id = ${claimId} and s.tenant_id = ${tenantId}
        order by ce.created_at desc
      `),
      db.execute(sql`
        select * from company_brain_claim_conflicts where claim_id = ${claimId} order by created_at desc
      `),
      db.execute(sql`
        select * from company_brain_claim_approvals where claim_id = ${claimId} order by requested_at desc
      `),
    ]);
    const { review } = await claimReviewState(tenantId, claimId);
    res.json({
      ok: true,
      claim,
      evidence: rowsOf(evidenceResult),
      conflicts: rowsOf(conflictsResult),
      approvals: rowsOf(approvalsResult),
      review,
    });
  } catch (error) {
    res.status(statusOf(error)).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/bootstrap-founder-charter", async (req: any, res) => {
  try {
    assertCompanyBrainEnabled();
    if (req.body?.confirm !== true) return res.status(400).json({ message: "Explicit confirmation is required" });
    const result = await bootstrapFounderAuthorizedCharter({
      tenantId: tenantIdFromReq(req),
      userId: adminUserIdFromReq(req),
    });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(statusOf(error)).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/claims/:claimId/review", async (req: any, res) => {
  try {
    assertCompanyBrainEnabled();
    const tenantId = tenantIdFromReq(req);
    const userId = adminUserIdFromReq(req);
    const claimId = positiveInt(req.params.claimId, "claimId");
    const body = asRecord(req.body);
    const action = asText(body.action);
    const notes = asText(body.notes).slice(0, 4000);
    const approvedWording = asText(body.approvedWording).slice(0, 8000);
    const state = await claimReviewState(tenantId, claimId, approvedWording || null);

    if (action === "verify_internal") {
      if (!state.review.canVerifyInternal) {
        return res.status(409).json({ message: "Claim is not ready for internal verification", review: state.review });
      }
      await db.transaction(async (tx) => {
        await tx.update(companyBrainClaims).set({ status: "verified_internal_only", updatedAt: new Date() }).where(
          and(eq(companyBrainClaims.id, claimId), eq(companyBrainClaims.tenantId, tenantId)),
        );
        await audit({ tenantId, userId, eventType: "claim_verified_internal", entityType: "company_brain_claim", entityId: claimId, payload: { notes } }, tx);
      });
      return res.json({ ok: true, status: "verified_internal_only" });
    }

    if (action === "request_external_approval") {
      if (!state.review.canRequestExternalApproval) {
        return res.status(409).json({ message: "Claim is not ready for external wording review", review: state.review });
      }
      const approval = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('company_brain_external_approval'), ${claimId})`);
        const existingPending = await tx.query.companyBrainClaimApprovals.findFirst({
          where: and(
            eq(companyBrainClaimApprovals.claimId, claimId),
            eq(companyBrainClaimApprovals.approvalScope, "external_publication"),
            eq(companyBrainClaimApprovals.status, "pending"),
          ),
        });
        const nextApproval = existingPending || (await tx.insert(companyBrainClaimApprovals).values({
          claimId,
          approvalScope: "external_publication",
          status: "pending",
          requestedByUserId: userId,
          approvedWording: approvedWording || state.claim.approved_external_wording || state.claim.claim_text,
          reviewNotes: notes || null,
        }).returning())[0];
        await audit({ tenantId, userId, eventType: "claim_external_approval_requested", entityType: "company_brain_claim", entityId: claimId, payload: { approvalId: nextApproval.id } }, tx);
        return nextApproval;
      });
      return res.json({ ok: true, approval });
    }

    if (action === "approve_external") {
      const pending = await db.query.companyBrainClaimApprovals.findFirst({
        where: and(
          eq(companyBrainClaimApprovals.claimId, claimId),
          eq(companyBrainClaimApprovals.approvalScope, "external_publication"),
          eq(companyBrainClaimApprovals.status, "pending"),
        ),
      });
      const reviewState = await claimReviewState(tenantId, claimId, approvedWording || pending?.approvedWording || null);
      if (!pending || !reviewState.review.canApproveExternal) {
        return res.status(409).json({ message: "Claim is not ready for external approval", review: reviewState.review });
      }
      const wording = approvedWording || asText(pending.approvedWording);
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('company_brain_external_approval'), ${claimId})`);
        const [reviewedApproval] = await tx.update(companyBrainClaimApprovals).set({
          status: "approved",
          reviewedByUserId: userId,
          approvedWording: wording,
          reviewNotes: notes || pending.reviewNotes,
          reviewedAt: new Date(),
        }).where(and(
          eq(companyBrainClaimApprovals.id, pending.id),
          eq(companyBrainClaimApprovals.status, "pending"),
        )).returning();
        if (!reviewedApproval) {
          const error = new Error("External approval was already reviewed");
          (error as any).status = 409;
          throw error;
        }
        await tx.update(companyBrainClaims).set({
          status: "approved_external",
          approvedExternalWording: wording,
          updatedAt: new Date(),
        }).where(and(eq(companyBrainClaims.id, claimId), eq(companyBrainClaims.tenantId, tenantId)));
        await audit({ tenantId, userId, eventType: "claim_approved_external", entityType: "company_brain_claim", entityId: claimId, payload: { approvalId: pending.id, notes } }, tx);
      });
      return res.json({ ok: true, status: "approved_external", approvalId: pending.id });
    }

    if (action === "reject") {
      await db.transaction(async (tx) => {
        await tx.update(companyBrainClaims).set({ status: "rejected", updatedAt: new Date() }).where(
          and(eq(companyBrainClaims.id, claimId), eq(companyBrainClaims.tenantId, tenantId)),
        );
        await tx.update(companyBrainClaimApprovals).set({
          status: "rejected",
          reviewedByUserId: userId,
          reviewNotes: notes || "Claim rejected by administrator",
          reviewedAt: new Date(),
        }).where(and(eq(companyBrainClaimApprovals.claimId, claimId), eq(companyBrainClaimApprovals.status, "pending")));
        await audit({ tenantId, userId, eventType: "claim_rejected", entityType: "company_brain_claim", entityId: claimId, payload: { notes } }, tx);
      });
      return res.json({ ok: true, status: "rejected" });
    }

    if (action === "mark_conflicting") {
      const summary = asText(body.conflictSummary).slice(0, 4000);
      if (!summary) return res.status(400).json({ message: "Conflict summary is required" });
      const [conflict] = await db.transaction(async (tx) => {
        const created = await tx.insert(companyBrainClaimConflicts).values({
          claimId,
          conflictType: asText(body.conflictType).slice(0, 80) || "value_mismatch",
          summary,
          status: "open",
        }).returning();
        await tx.update(companyBrainClaims).set({ conflictStatus: "open", updatedAt: new Date() }).where(
          and(eq(companyBrainClaims.id, claimId), eq(companyBrainClaims.tenantId, tenantId)),
        );
        await audit({ tenantId, userId, eventType: "claim_conflict_opened", entityType: "company_brain_claim", entityId: claimId, payload: { conflictId: created[0].id, summary } }, tx);
        return created;
      });
      return res.json({ ok: true, conflict });
    }

    return res.status(400).json({ message: "Unsupported review action" });
  } catch (error) {
    res.status(statusOf(error)).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/conflicts/:conflictId/resolve", async (req: any, res) => {
  try {
    assertCompanyBrainEnabled();
    const tenantId = tenantIdFromReq(req);
    const userId = adminUserIdFromReq(req);
    const conflictId = positiveInt(req.params.conflictId, "conflictId");
    const resolution = asText(req.body?.resolution).slice(0, 5000);
    if (!resolution) return res.status(400).json({ message: "Resolution is required" });
    const result = await db.execute(sql`
      select cc.id, cc.claim_id
      from company_brain_claim_conflicts cc
      join company_brain_claims c on c.id = cc.claim_id
      where cc.id = ${conflictId} and c.tenant_id = ${tenantId}
      limit 1
    `);
    const conflict = rowsOf(result)[0];
    if (!conflict) return res.status(404).json({ message: "Company Brain conflict not found" });
    const claimId = Number(conflict.claim_id);
    await db.transaction(async (tx) => {
      await tx.update(companyBrainClaimConflicts).set({
        status: "resolved",
        resolution,
        resolvedByUserId: userId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(companyBrainClaimConflicts.id, conflictId));
      const open = await tx.query.companyBrainClaimConflicts.findFirst({
        where: and(eq(companyBrainClaimConflicts.claimId, claimId), eq(companyBrainClaimConflicts.status, "open")),
      });
      if (!open) {
        await tx.update(companyBrainClaims).set({ conflictStatus: "clear", updatedAt: new Date() }).where(
          and(eq(companyBrainClaims.id, claimId), eq(companyBrainClaims.tenantId, tenantId)),
        );
      }
      await audit({ tenantId, userId, eventType: "claim_conflict_resolved", entityType: "company_brain_conflict", entityId: conflictId, payload: { claimId, resolution } }, tx);
    });
    res.json({ ok: true, conflictId, claimId });
  } catch (error) {
    res.status(statusOf(error)).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
