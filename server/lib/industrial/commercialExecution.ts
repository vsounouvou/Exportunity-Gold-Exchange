import { and, desc, eq } from "drizzle-orm";

import { db } from "@db";
import {
  industrialAuditLogs,
  industrialProductRequirements,
  industrialRequirementSupplierMatches,
  industrialRequirements,
  industrialSupplierProfiles,
} from "@db/schema";
import {
  ensureTenantContactLink,
  upsertCanonicalContact,
} from "../contact/tenantContacts";
import { scoreIndustrialSupplierCapabilityMatch } from "./supplierCapabilities";

export async function ensureIndustrialCustomerContact(input: {
  tenantId: number;
  requesterName: string;
  requesterCompany?: string | null;
  requesterEmail: string;
  requesterPhone?: string | null;
}) {
  return db.transaction(async (tx) => {
    const contact = await upsertCanonicalContact(tx, {
      displayName: input.requesterName,
      company: input.requesterCompany || null,
      emails: [input.requesterEmail],
      phones: input.requesterPhone ? [input.requesterPhone] : [],
      source: "Exportunity industrial conversation",
      sourceSystem: "exportunity_industrial_intake",
    });
    await ensureTenantContactLink(tx, {
      tenantId: input.tenantId,
      contactId: contact.contactId,
    });
    return contact;
  });
}

function matchReason(input: {
  matchedCategory: boolean;
  matchedMaterial: boolean;
  matchedCapability: boolean;
  matchedIndustry: boolean;
}) {
  const reasons = [
    input.matchedCategory ? "product category" : null,
    input.matchedMaterial ? "material handled" : null,
    input.matchedCapability ? "production capability" : null,
    input.matchedIndustry ? "industry served" : null,
  ].filter(Boolean);
  return reasons.length
    ? `Verified internal supplier matched on ${reasons.join(", ")}.`
    : "No verified capability overlap.";
}

export type CommercialSupplierCandidate = {
  matchId: string;
  supplierProfileId: string;
  displayName: string;
  countryCode: string;
  city: string | null;
  score: number;
  relevanceScore: number;
  verificationScore: number;
  contactabilityScore: number;
  matchReason: string;
};

export async function discoverVerifiedCommercialSuppliers(input: {
  tenantId: number;
  requirementId: string;
  discoveryAgentId?: number | null;
  createdByUserId?: number | null;
  limit?: number;
}): Promise<{
  status: "matched" | "research_required";
  nextAction: string;
  candidates: CommercialSupplierCandidate[];
}> {
  const [requirement, productRequirement, suppliers] = await Promise.all([
    db.query.industrialRequirements.findFirst({
      where: and(
        eq(industrialRequirements.id, input.requirementId),
        eq(industrialRequirements.tenantId, input.tenantId),
      ),
    }),
    db.query.industrialProductRequirements.findFirst({
      where: and(
        eq(industrialProductRequirements.requirementId, input.requirementId),
        eq(industrialProductRequirements.tenantId, input.tenantId),
      ),
      orderBy: [desc(industrialProductRequirements.updatedAt)],
    }),
    db
      .select()
      .from(industrialSupplierProfiles)
      .where(
        and(
          eq(industrialSupplierProfiles.tenantId, input.tenantId),
          eq(industrialSupplierProfiles.supplierStatus, "active"),
          eq(industrialSupplierProfiles.verificationStatus, "verified"),
          eq(industrialSupplierProfiles.visibility, "exportunity_internal"),
        ),
      ),
  ]);

  if (!requirement) throw new Error("Industrial requirement not found");

  const ranked = suppliers
    .map((supplier) => ({
      supplier,
      result: scoreIndustrialSupplierCapabilityMatch(supplier, {
        categoryCode: requirement.categoryCode,
        requirementType: requirement.requirementType,
        title: requirement.title,
        details: requirement.details,
        productName: productRequirement?.productName,
        productCategory: productRequirement?.productCategory,
        specification: productRequirement?.specification,
      }),
    }))
    .filter(
      ({ result }) =>
        result.eligible &&
        (result.matchedCategory ||
          result.matchedMaterial ||
          result.matchedCapability ||
          result.matchedIndustry),
    )
    .sort((left, right) => right.result.score - left.result.score)
    .slice(0, Math.max(1, Math.min(25, input.limit || 12)));

  const candidates: CommercialSupplierCandidate[] = [];
  for (const { supplier, result } of ranked) {
    const reason = matchReason(result);
    const [match] = await db
      .insert(industrialRequirementSupplierMatches)
      .values({
        tenantId: input.tenantId,
        requirementId: input.requirementId,
        supplierProfileId: supplier.id,
        status: "candidate",
        matchScore: result.score,
        matchReason: reason,
        source: "internal_supplier_network",
        discoveryAgentId: input.discoveryAgentId || null,
        verificationScore: result.verificationScore,
        relevanceScore: result.relevanceScore,
        contactabilityScore: result.contactabilityScore,
        lastVerifiedAt: supplier.verifiedAt || null,
        createdByUserId: input.createdByUserId || null,
      })
      .onConflictDoUpdate({
        target: [
          industrialRequirementSupplierMatches.requirementId,
          industrialRequirementSupplierMatches.supplierProfileId,
        ],
        set: {
          matchScore: result.score,
          matchReason: reason,
          source: "internal_supplier_network",
          discoveryAgentId: input.discoveryAgentId || null,
          verificationScore: result.verificationScore,
          relevanceScore: result.relevanceScore,
          contactabilityScore: result.contactabilityScore,
          lastVerifiedAt: supplier.verifiedAt || null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: industrialRequirementSupplierMatches.id });

    candidates.push({
      matchId: match.id,
      supplierProfileId: supplier.id,
      displayName: supplier.displayName,
      countryCode: supplier.countryCode,
      city: supplier.city || null,
      score: result.score,
      relevanceScore: result.relevanceScore,
      verificationScore: result.verificationScore,
      contactabilityScore: result.contactabilityScore,
      matchReason: reason,
    });
  }

  const nextAction = candidates.length
    ? `Review ${candidates.length} verified supplier candidate${
        candidates.length === 1 ? "" : "s"
      } and prepare approval-gated RFQs.`
    : "No verified internal supplier match. Assign the Sourcing Agent to documented external research before any outreach.";
  const status = candidates.length ? "matched" : "research_required";

  await db
    .update(industrialRequirements)
    .set({
      status: candidates.length ? "supplier_matching" : "under_review",
      nextAction,
      nextActionAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(industrialRequirements.id, input.requirementId),
        eq(industrialRequirements.tenantId, input.tenantId),
      ),
    );

  await db.insert(industrialAuditLogs).values({
    tenantId: input.tenantId,
    actorUserId: input.createdByUserId || null,
    action: candidates.length
      ? "industrial_requirement.verified_suppliers_ranked"
      : "industrial_requirement.external_supplier_research_required",
    entityType: "industrial_requirement",
    entityId: input.requirementId,
    nextValue: {
      status: candidates.length ? "supplier_matching" : "under_review",
      nextAction,
    },
    metadata: {
      source: "internal_supplier_network",
      discoveryAgentId: input.discoveryAgentId || null,
      outreachCreated: 0,
      candidateCount: candidates.length,
      candidates: candidates.map((candidate) => ({
        matchId: candidate.matchId,
        supplierProfileId: candidate.supplierProfileId,
        score: candidate.score,
      })),
    },
  });

  return { status, nextAction, candidates };
}
