import { db } from "@db";
import {
  companyBrainClaimConflicts,
  companyBrainClaimEvidence,
  companyBrainClaims,
  companyBrainContextPacks,
  companyBrainSources,
  companyBrainSourceVersions,
  type CompanyBrainCitation,
} from "@db/schema";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { AgentPolicy } from "../agent-os/registry";
import { isCompanyBrainFeatureEnabled } from "./featureFlags";
import { isCompanyBrainEvidenceEligible } from "./governancePolicy";
import { secureUntrustedEvidence, type SecuredEvidence } from "./security";

export { renderCompanyBrainContextPackForModel } from "./contextPackRenderer";

export type ContextPackPurpose = "internal" | "external_draft" | "external_publish";

export type ContextPackClaim = {
  id: number;
  canonicalKey: string;
  subjectType: string;
  subjectId: string | null;
  wording: string;
  status: string;
  conflictStatus: string;
  traceability: "source_backed" | "inference";
  structuredValue: Record<string, unknown>;
  citations: CompanyBrainCitation[];
  evidence: SecuredEvidence[];
};

export type ContextPackConflict = {
  claimId: number;
  canonicalKey: string;
  type: string;
  summary: string;
};

export type ContextPackApproval = {
  action: "external_communication" | "external_publish" | "payment" | "contract_commitment";
  requirement: "recorded_human_approval";
};

export type ContextPackSection =
  | "company_charter"
  | "current_strategy"
  | "verified_facts"
  | "related_entities"
  | "relationship_history"
  | "project_or_opportunity_state";

export type CompanyBrainContextPack = {
  version: "company-brain-context-v1";
  contextPackId: number | null;
  tenantId: number;
  companyId: number | null;
  agentId: number | null;
  task: {
    key: string;
    purpose: ContextPackPurpose;
    conversationId: string | null;
    correlationId: string | null;
  };
  agent_identity: {
    agentId: number | null;
    organizationKey: string | null;
    role: string;
    roleLevel: number | null;
  };
  taskKey: string;
  purpose: ContextPackPurpose;
  authority: {
    role: string;
    decisionAuthority: string | null;
    permissions: string[];
  };
  company_charter: ContextPackClaim[];
  current_strategy: ContextPackClaim[];
  verified_facts: ContextPackClaim[];
  related_entities: ContextPackClaim[];
  relationship_history: ContextPackClaim[];
  project_or_opportunity_state: ContextPackClaim[];
  approved_playbooks: string[];
  applicable_policies: Array<{ id: string; rule: string }>;
  available_tools: string[];
  required_approvals: ContextPackApproval[];
  known_conflicts: ContextPackConflict[];
  open_questions: Array<{
    reason: "conflict" | "missing_evidence" | "security_review";
    claimId: number;
    question: string;
  }>;
  source_citations: CompanyBrainCitation[];
  freshness: {
    assembledAt: string;
    expiresAt: string;
  };
  redactions: Array<{
    sourceId: number;
    sourceVersionId: number;
    items: Record<string, unknown>[];
  }>;
  // Compatibility aliases retained for current Agent OS consumers.
  claims: ContextPackClaim[];
  conflicts: ContextPackConflict[];
  citations: CompanyBrainCitation[];
  assembledAt: string;
  expiresAt: string;
};

export type LoadContextPackInput = {
  tenantId: number;
  companyId?: number | null;
  agentPolicy: AgentPolicy;
  taskKey: string;
  purpose?: ContextPackPurpose;
  canonicalKeys?: string[];
  conversationId?: string | null;
  correlationId?: string | null;
  includeProposedInternalClaims?: boolean;
  persist?: boolean;
};

function uniqueCitations(citations: CompanyBrainCitation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.sourceId}:${citation.sourceVersionId}:${citation.locator || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizedSection(value: unknown): ContextPackSection | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, ContextPackSection> = {
    charter: "company_charter",
    company_charter: "company_charter",
    company_identity: "company_charter",
    strategy: "current_strategy",
    current_strategy: "current_strategy",
    fact: "verified_facts",
    facts: "verified_facts",
    verified_fact: "verified_facts",
    verified_facts: "verified_facts",
    entity: "related_entities",
    entities: "related_entities",
    related_entity: "related_entities",
    related_entities: "related_entities",
    relationship: "relationship_history",
    relationships: "relationship_history",
    relationship_history: "relationship_history",
    project: "project_or_opportunity_state",
    opportunity: "project_or_opportunity_state",
    project_state: "project_or_opportunity_state",
    opportunity_state: "project_or_opportunity_state",
    project_or_opportunity_state: "project_or_opportunity_state",
  };
  return aliases[normalized] || null;
}

export function classifyCompanyBrainClaimSection(claim: {
  canonicalKey: string;
  subjectType?: string | null;
  structuredValue?: Record<string, unknown> | null;
}): ContextPackSection {
  const structured = claim.structuredValue || {};
  const explicit = normalizedSection(
    structured.contextSection ?? structured.context_section ?? structured.category ?? structured.section,
  );
  if (explicit) return explicit;

  const key = String(claim.canonicalKey || "").trim().toLowerCase();
  if (/^(?:company\.)?(?:charter|identity|mission|purpose|scope|history|operating_model)(?:\.|$)/.test(key)) {
    return "company_charter";
  }
  if (/^(?:company\.)?(?:strategy|priority|roadmap|objective)(?:\.|$)/.test(key)) {
    return "current_strategy";
  }
  if (/^(?:relationship|interaction|crm|contact_history)(?:\.|$)/.test(key)) {
    return "relationship_history";
  }
  if (/^(?:project|opportunity|mission|quote|deal|order)(?:\.|$)/.test(key)) {
    return "project_or_opportunity_state";
  }
  if (/^(?:entity|person|organization|company_entity|supplier|buyer|partner|contact)(?:\.|$)/.test(key)) {
    return "related_entities";
  }
  if (claim.subjectType && claim.subjectType !== "company") return "related_entities";
  return "verified_facts";
}

function availableToolsForPack(permissions: string[]) {
  const externalTools = new Set(["send_message", "send_email", "send_whatsapp", "make_call", "external_publish"]);
  return Array.from(new Set(permissions)).filter(
    (tool) => isCompanyBrainFeatureEnabled("externalCommunications") || !externalTools.has(tool),
  );
}

function requiredApprovalsForPurpose(purpose: ContextPackPurpose): ContextPackApproval[] {
  const approvals: ContextPackApproval[] = [
    { action: "external_communication", requirement: "recorded_human_approval" },
    { action: "payment", requirement: "recorded_human_approval" },
    { action: "contract_commitment", requirement: "recorded_human_approval" },
  ];
  if (purpose === "external_publish") {
    approvals.push({ action: "external_publish", requirement: "recorded_human_approval" });
  }
  return approvals;
}

export async function loadCompanyBrainContextPack(input: LoadContextPackInput): Promise<CompanyBrainContextPack> {
  if (!isCompanyBrainFeatureEnabled("companyBrain") || !isCompanyBrainFeatureEnabled("contextPacks")) {
    throw new Error("Company Brain context packs are disabled.");
  }

  const purpose = input.purpose || "internal";
  const isExternalPurpose = purpose !== "internal";
  const allowedStatuses = isExternalPurpose
    ? ["approved_external"]
    : input.includeProposedInternalClaims
      ? ["verified", "verified_internal_only", "approved_external", "proposed", "inference"]
      : ["verified", "verified_internal_only", "approved_external", "inference"];
  const filters = [
    eq(companyBrainClaims.tenantId, input.tenantId),
    inArray(companyBrainClaims.status, allowedStatuses),
    input.companyId == null
      ? isNull(companyBrainClaims.companyId)
      : or(eq(companyBrainClaims.companyId, input.companyId), isNull(companyBrainClaims.companyId)),
  ];
  if (input.canonicalKeys?.length) {
    filters.push(inArray(companyBrainClaims.canonicalKey, input.canonicalKeys));
  }

  const claims = await db
    .select()
    .from(companyBrainClaims)
    .where(and(...filters))
    .orderBy(desc(companyBrainClaims.updatedAt));

  const claimIds = claims.map((claim) => claim.id);
  const evidenceRows = claimIds.length
    ? await db
        .select({
          claimId: companyBrainClaimEvidence.claimId,
          excerpt: companyBrainClaimEvidence.excerpt,
          locator: companyBrainClaimEvidence.locator,
          supportType: companyBrainClaimEvidence.supportType,
          sourceId: companyBrainSources.id,
          sourceTitle: companyBrainSources.title,
          sourceUrl: companyBrainSources.sourceUrl,
          sourceStatus: companyBrainSources.status,
          sourceVersionId: companyBrainSourceVersions.id,
          contentHash: companyBrainSourceVersions.contentHash,
          extractedText: companyBrainSourceVersions.extractedText,
          extractionStatus: companyBrainSourceVersions.extractionStatus,
          securityStatus: companyBrainSourceVersions.securityStatus,
          redactions: companyBrainSourceVersions.redactions,
        })
        .from(companyBrainClaimEvidence)
        .innerJoin(companyBrainSources, eq(companyBrainClaimEvidence.sourceId, companyBrainSources.id))
        .innerJoin(
          companyBrainSourceVersions,
          and(
            eq(companyBrainClaimEvidence.sourceVersionId, companyBrainSourceVersions.id),
            eq(companyBrainSourceVersions.sourceId, companyBrainSources.id),
          ),
        )
        .where(and(
          inArray(companyBrainClaimEvidence.claimId, claimIds),
          eq(companyBrainSources.tenantId, input.tenantId),
        ))
    : [];
  const conflictRows = claimIds.length
    ? await db
        .select({
          claimId: companyBrainClaimConflicts.claimId,
          type: companyBrainClaimConflicts.conflictType,
          summary: companyBrainClaimConflicts.summary,
        })
        .from(companyBrainClaimConflicts)
        .where(and(inArray(companyBrainClaimConflicts.claimId, claimIds), eq(companyBrainClaimConflicts.status, "open")))
    : [];

  const contextClaims: ContextPackClaim[] = claims
    .filter((claim) => !isExternalPurpose || claim.conflictStatus === "clear")
    .filter((claim) => !isExternalPurpose || Boolean(claim.approvedExternalWording?.trim()))
    .map((claim) => {
      const rows = evidenceRows
        .filter((row) => row.claimId === claim.id)
        .filter(isCompanyBrainEvidenceEligible);
      const citations = uniqueCitations(
        rows.map((row) => ({
          sourceId: row.sourceId,
          sourceVersionId: row.sourceVersionId,
          title: row.sourceTitle,
          locator: row.locator || undefined,
          sourceUrl: row.sourceUrl || undefined,
          contentHash: row.contentHash,
        })),
      );
      const evidence = rows.map((row) => {
        const secured = secureUntrustedEvidence({
          sourceId: row.sourceId,
          sourceVersionId: row.sourceVersionId,
          title: row.sourceTitle,
          text: row.excerpt || row.extractedText || "",
          locator: row.locator,
          sourceUrl: row.sourceUrl,
        });
        return secured;
      });

      return {
        id: claim.id,
        canonicalKey: claim.canonicalKey,
        subjectType: claim.subjectType,
        subjectId: claim.subjectId || null,
        wording:
          isExternalPurpose
            ? String(claim.approvedExternalWording || "")
            : String(claim.internalWording || claim.claimText),
        status: claim.status,
        conflictStatus: claim.conflictStatus,
        traceability: claim.status === "inference" ? "inference" : "source_backed",
        structuredValue: (claim.structuredValue || {}) as Record<string, unknown>,
        citations,
        evidence,
      };
    });

  const supportedClaims = contextClaims.filter(
    (claim) => claim.traceability === "inference" || claim.citations.length > 0,
  );
  const unsupportedClaims = contextClaims.filter(
    (claim) => claim.traceability !== "inference" && claim.citations.length === 0,
  );
  const claimsBlockedBySecurity = unsupportedClaims.filter((claim) =>
    evidenceRows.some(
      (row) =>
        row.claimId === claim.id &&
        (row.securityStatus !== "clean" || row.sourceStatus !== "active"),
    ),
  );
  const claimsMissingEvidence = unsupportedClaims.filter(
    (claim) => !claimsBlockedBySecurity.some((blocked) => blocked.id === claim.id),
  );

  const assembledAt = new Date();
  const expiresAt = new Date(assembledAt.getTime() + 15 * 60 * 1000);
  const citations = uniqueCitations(supportedClaims.flatMap((claim) => claim.citations));
  const sectioned = supportedClaims.reduce<Record<ContextPackSection, ContextPackClaim[]>>(
    (result, claim) => {
      result[classifyCompanyBrainClaimSection(claim)].push(claim);
      return result;
    },
    {
      company_charter: [],
      current_strategy: [],
      verified_facts: [],
      related_entities: [],
      relationship_history: [],
      project_or_opportunity_state: [],
    },
  );
  const claimById = new Map(contextClaims.map((claim) => [claim.id, claim]));
  const conflicts: ContextPackConflict[] = conflictRows.map((conflict) => ({
    ...conflict,
    canonicalKey: claimById.get(conflict.claimId)?.canonicalKey || `claim:${conflict.claimId}`,
  }));
  const openQuestions: CompanyBrainContextPack["open_questions"] = [
    ...conflicts.map((conflict) => ({
      reason: "conflict" as const,
      claimId: conflict.claimId,
      question: `Resolve the open conflict for ${conflict.canonicalKey}: ${conflict.summary}`,
    })),
    ...claimsBlockedBySecurity.map((claim) => ({
      reason: "security_review" as const,
      claimId: claim.id,
      question: `Clear a supporting source through security review before relying on ${claim.canonicalKey}.`,
    })),
    ...claimsMissingEvidence.map((claim) => ({
      reason: "missing_evidence" as const,
      claimId: claim.id,
      question: `Attach a source before relying on ${claim.canonicalKey}.`,
    })),
  ];
  const redactions = Array.from(
    new Map(
      evidenceRows
        .filter(isCompanyBrainEvidenceEligible)
        .filter((row) => Array.isArray(row.redactions) && row.redactions.length > 0)
        .map((row) => [
          `${row.sourceId}:${row.sourceVersionId}`,
          {
            sourceId: row.sourceId,
            sourceVersionId: row.sourceVersionId,
            items: row.redactions as Record<string, unknown>[],
          },
        ]),
    ).values(),
  );
  const availableTools = availableToolsForPack(input.agentPolicy.permissions);
  const pack: CompanyBrainContextPack = {
    version: "company-brain-context-v1",
    contextPackId: null,
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    agentId: input.agentPolicy.agentId ?? null,
    task: {
      key: input.taskKey,
      purpose,
      conversationId: input.conversationId || null,
      correlationId: input.correlationId || null,
    },
    agent_identity: {
      agentId: input.agentPolicy.agentId ?? null,
      organizationKey: input.agentPolicy.organizationKey,
      role: input.agentPolicy.role,
      roleLevel: input.agentPolicy.roleLevel,
    },
    taskKey: input.taskKey,
    purpose,
    authority: {
      role: input.agentPolicy.role,
      decisionAuthority: input.agentPolicy.decisionAuthority,
      permissions: availableTools,
    },
    company_charter: sectioned.company_charter,
    current_strategy: sectioned.current_strategy,
    verified_facts: sectioned.verified_facts,
    related_entities: sectioned.related_entities,
    relationship_history: sectioned.relationship_history,
    project_or_opportunity_state: sectioned.project_or_opportunity_state,
    approved_playbooks: [...input.agentPolicy.defaultPlaybooks],
    applicable_policies: [
      { id: "company_brain.evidence_required", rule: "Use only source-backed facts or explicitly labelled inferences." },
      { id: "company_brain.conflict_preservation", rule: "Preserve open conflicts and escalate before relying on them." },
      { id: "agent_os.task_scoped_context", rule: "Use this pack only for the visible task identified in task.key." },
      { id: "agent_os.external_approval", rule: "External communications, commitments and public claims require recorded human approval." },
    ],
    available_tools: availableTools,
    required_approvals: requiredApprovalsForPurpose(purpose),
    known_conflicts: conflicts,
    open_questions: openQuestions,
    source_citations: citations,
    freshness: {
      assembledAt: assembledAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
    redactions,
    claims: supportedClaims,
    conflicts,
    citations,
    assembledAt: assembledAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  if (input.persist !== false) {
    const [created] = await db
      .insert(companyBrainContextPacks)
      .values({
        tenantId: input.tenantId,
        companyId: input.companyId ?? null,
        agentId: input.agentPolicy.agentId ?? null,
        conversationId: input.conversationId || null,
        correlationId: input.correlationId || null,
        taskKey: input.taskKey,
        purpose,
        authoritySnapshot: pack.authority,
        payload: pack,
        sourceCitations: pack.citations,
        conflictSummaries: pack.conflicts,
        freshness: pack.freshness,
        redactions: pack.redactions,
        status: "assembled",
        createdAt: assembledAt,
        expiresAt,
      })
      .returning({ id: companyBrainContextPacks.id });
    pack.contextPackId = created?.id ?? null;
    if (pack.contextPackId) {
      await db
        .update(companyBrainContextPacks)
        .set({ payload: pack })
        .where(eq(companyBrainContextPacks.id, pack.contextPackId));
    }
  }

  return pack;
}
