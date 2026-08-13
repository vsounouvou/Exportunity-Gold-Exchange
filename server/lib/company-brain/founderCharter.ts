import crypto from "node:crypto";
import { db } from "@db";
import {
  companyBrainAuditEvents,
  companyBrainClaimEvidence,
  companyBrainClaimConflicts,
  companyBrainClaims,
  companyBrainSources,
  companyBrainSourceVersions,
} from "@db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

const FOUNDER_DIRECTIVE_SOURCE_ID = "founder-directive:company-brain:2026-08-13";

const FOUNDER_DIRECTIVE_EXCERPT = [
  "Founder-authorized implementation directive for Exportunity AI.",
  "Exportunity helps companies trade, source, manage supply, and expand across markets.",
  "Exportunity is a global trade network operated by an evidence-aware organization of specialized AI agents, supervised through explicit authority, approvals, audit trails, and human control.",
  "Industry, machinery, commodities, precious metals, logistics, payments, and other activities are verticals inside Exportunity; they are not the limit of the company.",
  "Preserve and connect what already exists. Do not rebuild the platform from scratch.",
  "Agents must not invent company history, relationships, capabilities, prices, approvals, or commitments.",
  "External communications are disabled by default. No external message may be sent until a separate explicit activation and approval policy is completed.",
].join("\n");

type CharterClaim = {
  canonicalKey: string;
  claimText: string;
  section: "company_charter" | "current_strategy";
  categories: string[];
};

const CHARTER_CLAIMS: CharterClaim[] = [
  {
    canonicalKey: "company.identity.strategic_proposition",
    claimText: "Exportunity helps companies trade, source, manage supply, and expand across markets.",
    section: "company_charter",
    categories: ["identity", "positioning", "global_trade"],
  },
  {
    canonicalKey: "company.identity.operating_proposition",
    claimText:
      "Exportunity is a global trade network operated by an evidence-aware organization of specialized AI agents, supervised through explicit authority, approvals, audit trails, and human control.",
    section: "company_charter",
    categories: ["identity", "agentic_company", "governance"],
  },
  {
    canonicalKey: "company.scope.verticals_are_not_company_limits",
    claimText:
      "Industry, machinery, commodities, precious metals, logistics, payments, and other activities are verticals inside Exportunity; they are not the limit of the company.",
    section: "company_charter",
    categories: ["scope", "verticals", "global_trade"],
  },
  {
    canonicalKey: "company.architecture.preserve_and_connect",
    claimText: "Preserve and connect what already exists; do not rebuild the platform from scratch.",
    section: "current_strategy",
    categories: ["engineering", "architecture", "data_preservation"],
  },
  {
    canonicalKey: "company.agent_policy.no_invented_company_facts",
    claimText:
      "Agents must not invent company history, relationships, capabilities, prices, approvals, or commitments.",
    section: "company_charter",
    categories: ["agents", "evidence", "truthfulness"],
  },
  {
    canonicalKey: "company.policy.external_communications_default",
    claimText:
      "External communications are disabled by default and require a separate explicit activation plus recorded human approval.",
    section: "company_charter",
    categories: ["external_communications", "approval", "safety"],
  },
];

export type FounderCharterBootstrapResult = {
  sourceId: number;
  sourceVersionId: number;
  createdSource: boolean;
  createdVersion: boolean;
  createdClaims: number;
  existingClaims: number;
  conflictedClaims: number;
  claimIds: number[];
};

export async function bootstrapFounderAuthorizedCharter(input: {
  tenantId: number;
  userId: number;
}): Promise<FounderCharterBootstrapResult> {
  const contentHash = crypto.createHash("sha256").update(FOUNDER_DIRECTIVE_EXCERPT).digest("hex");

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select pg_advisory_xact_lock(hashtext('company_brain_founder_charter'), ${input.tenantId})
    `);
    const existingSource = await tx.query.companyBrainSources.findFirst({
      where: and(
        eq(companyBrainSources.tenantId, input.tenantId),
        eq(companyBrainSources.connectorType, "manual"),
        eq(companyBrainSources.providerSourceId, FOUNDER_DIRECTIVE_SOURCE_ID),
      ),
    });
    const createdSource = !existingSource;
    const [source] = existingSource
      ? [existingSource]
      : await tx
          .insert(companyBrainSources)
          .values({
            tenantId: input.tenantId,
            companyId: null,
            connectorType: "manual",
            providerSourceId: FOUNDER_DIRECTIVE_SOURCE_ID,
            title: "Founder-authorized Exportunity Company Brain directive",
            sourceType: "founder_directive",
            mimeType: "text/plain",
            confidentiality: "internal",
            businessRelevance: "corporate_charter",
            permissionSnapshot: {
              readOnly: true,
              authority: "founder_authorized",
            },
            metadata: {
              directiveDate: "2026-08-13",
              documentStatus: "founder_authorized_implementation_directive",
              curatedExcerpt: true,
            },
            contentHash,
            status: "active",
          })
          .returning();
    if (!source?.id) throw new Error("Unable to create the founder-authorized Company Brain source.");

    const existingVersion = await tx.query.companyBrainSourceVersions.findFirst({
      where: and(
        eq(companyBrainSourceVersions.sourceId, source.id),
        eq(companyBrainSourceVersions.contentHash, contentHash),
      ),
    });
    const createdVersion = !existingVersion;
    const [sourceVersion] = existingVersion
      ? [existingVersion]
      : await tx
          .insert(companyBrainSourceVersions)
          .values({
            sourceId: source.id,
            providerVersionId: "founder-directive-2026-08-13",
            contentHash,
            extractedText: FOUNDER_DIRECTIVE_EXCERPT,
            extractionStatus: "manual",
            securityStatus: "clean",
            classification: {
              level: "internal",
              categories: ["company_charter", "strategy", "governance"],
              containsPersonalData: false,
              containsFinancialData: false,
            },
            metadata: {
              curatedBy: "founder_directive_bootstrap",
              sourceIdentity: FOUNDER_DIRECTIVE_SOURCE_ID,
            },
          })
          .returning();
    if (!sourceVersion?.id) throw new Error("Unable to create the founder-authorized source version.");

    let createdClaims = 0;
    let existingClaims = 0;
    let conflictedClaims = 0;
    const claimIds: number[] = [];

    for (const claimDefinition of CHARTER_CLAIMS) {
      const existingClaim = await tx.query.companyBrainClaims.findFirst({
        where: and(
          eq(companyBrainClaims.tenantId, input.tenantId),
          isNull(companyBrainClaims.companyId),
          eq(companyBrainClaims.canonicalKey, claimDefinition.canonicalKey),
        ),
      });
      const [claim] = existingClaim
        ? [existingClaim]
        : await tx
            .insert(companyBrainClaims)
            .values({
              tenantId: input.tenantId,
              companyId: null,
              canonicalKey: claimDefinition.canonicalKey,
              subjectType: "company",
              subjectId: "exportunity",
              claimText: claimDefinition.claimText,
              internalWording: claimDefinition.claimText,
              structuredValue: {
                contextSection: claimDefinition.section,
                categories: claimDefinition.categories,
                provenance: FOUNDER_DIRECTIVE_SOURCE_ID,
              },
              status: "verified_internal_only",
              conflictStatus: "clear",
              confidentiality: "internal",
              createdByUserId: input.userId,
              effectiveAt: new Date("2026-08-13T00:00:00.000Z"),
            })
            .returning();
      if (!claim?.id) throw new Error(`Unable to create Company Brain claim ${claimDefinition.canonicalKey}.`);
      claimIds.push(claim.id);
      if (existingClaim) existingClaims += 1;
      else createdClaims += 1;

      if (existingClaim && existingClaim.claimText.trim() !== claimDefinition.claimText.trim()) {
        await tx
          .insert(companyBrainClaimEvidence)
          .values({
            claimId: claim.id,
            sourceId: source.id,
            sourceVersionId: sourceVersion.id,
            supportType: "contradicts",
            excerpt: claimDefinition.claimText,
            locator: `founder-directive:${claimDefinition.canonicalKey}`,
            sourceStrength: "founder_directive",
            confidence: "1.000",
          })
          .onConflictDoNothing();
        const existingConflict = await tx.query.companyBrainClaimConflicts.findFirst({
          where: and(
            eq(companyBrainClaimConflicts.claimId, claim.id),
            eq(companyBrainClaimConflicts.conflictType, "founder_directive_mismatch"),
            eq(companyBrainClaimConflicts.status, "open"),
          ),
        });
        if (!existingConflict) {
          await tx.insert(companyBrainClaimConflicts).values({
            claimId: claim.id,
            conflictType: "founder_directive_mismatch",
            summary: `Existing wording for ${claimDefinition.canonicalKey} differs from the founder-authorized charter. Review both versions before changing the canonical claim.`,
            status: "open",
          });
        }
        await tx.update(companyBrainClaims).set({ conflictStatus: "open", updatedAt: new Date() }).where(
          and(eq(companyBrainClaims.id, claim.id), eq(companyBrainClaims.tenantId, input.tenantId)),
        );
        conflictedClaims += 1;
        continue;
      }

      await tx
        .insert(companyBrainClaimEvidence)
        .values({
          claimId: claim.id,
          sourceId: source.id,
          sourceVersionId: sourceVersion.id,
          supportType: "supports",
          excerpt: claimDefinition.claimText,
          locator: `founder-directive:${claimDefinition.canonicalKey}`,
          sourceStrength: "founder_directive",
          confidence: "1.000",
        })
        .onConflictDoNothing();
    }

    await tx.insert(companyBrainAuditEvents).values({
      tenantId: input.tenantId,
      companyId: null,
      actorType: "user",
      actorId: String(input.userId),
      eventType: "founder_charter_bootstrapped",
      entityType: "company_brain_source",
      entityId: String(source.id),
      payload: {
        sourceVersionId: sourceVersion.id,
        createdSource,
        createdVersion,
        createdClaims,
        existingClaims,
        conflictedClaims,
        externalPublication: false,
      },
    });

    return {
      sourceId: source.id,
      sourceVersionId: sourceVersion.id,
      createdSource,
      createdVersion,
      createdClaims,
      existingClaims,
      conflictedClaims,
      claimIds,
    };
  });
}

export const FOUNDER_CHARTER_CLAIM_KEYS = CHARTER_CLAIMS.map((claim) => claim.canonicalKey);
