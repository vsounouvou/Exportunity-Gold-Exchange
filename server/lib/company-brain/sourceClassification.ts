import { db } from "@db";
import {
  companyBrainAuditEvents,
  companyBrainSources,
  companyBrainSourceVersions,
  type CompanyBrainClassification,
} from "@db/schema";
import { and, eq } from "drizzle-orm";

import { assertCompanyBrainClassificationDoesNotDowngrade } from "./sourceClassificationPolicy";

export * from "./sourceClassificationPolicy";

function badRequest(message: string) {
  const error = new Error(message);
  (error as any).status = 400;
  return error;
}

export async function reclassifyCompanyBrainSourceVersion(input: {
  tenantId: number;
  userId: number;
  sourceId: number;
  versionId: number;
  confidentiality: unknown;
  notes: string;
}) {
  const notes = String(input.notes || "").trim().slice(0, 4_000);
  if (!notes) throw badRequest("Classification notes are required.");

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        sourceId: companyBrainSources.id,
        sourceConfidentiality: companyBrainSources.confidentiality,
        sourceMetadata: companyBrainSources.metadata,
        versionId: companyBrainSourceVersions.id,
        versionClassification: companyBrainSourceVersions.classification,
      })
      .from(companyBrainSourceVersions)
      .innerJoin(companyBrainSources, eq(companyBrainSourceVersions.sourceId, companyBrainSources.id))
      .where(
        and(
          eq(companyBrainSources.tenantId, input.tenantId),
          eq(companyBrainSources.id, input.sourceId),
          eq(companyBrainSourceVersions.id, input.versionId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      const error = new Error("Company Brain source version not found");
      (error as any).status = 404;
      throw error;
    }

    const existingClassification = (row.versionClassification || {}) as CompanyBrainClassification &
      Record<string, unknown>;
    const transition = assertCompanyBrainClassificationDoesNotDowngrade({
      currentSourceLevel: row.sourceConfidentiality,
      currentVersionLevel: existingClassification.level || row.sourceConfidentiality,
      nextLevel: input.confidentiality,
    });
    const changed =
      transition.sourceLevel !== transition.nextLevel || transition.versionLevel !== transition.nextLevel;
    const reviewedAt = new Date().toISOString();
    const classification = {
      ...existingClassification,
      level: transition.nextLevel,
      humanReviewRequired: true,
      externalPublicationApproved: false,
      lastReclassifiedAt: reviewedAt,
      lastReclassifiedByUserId: input.userId,
    } as CompanyBrainClassification;
    const sourceMetadata = {
      ...((row.sourceMetadata || {}) as Record<string, unknown>),
      lastReclassification: {
        at: reviewedAt,
        byUserId: input.userId,
        previousLevel: transition.currentLevel,
        nextLevel: transition.nextLevel,
      },
    };

    await tx
      .update(companyBrainSources)
      .set({
        confidentiality: transition.nextLevel,
        metadata: sourceMetadata,
        updatedAt: new Date(),
      })
      .where(and(eq(companyBrainSources.id, input.sourceId), eq(companyBrainSources.tenantId, input.tenantId)));
    await tx
      .update(companyBrainSourceVersions)
      .set({ classification })
      .where(
        and(
          eq(companyBrainSourceVersions.id, input.versionId),
          eq(companyBrainSourceVersions.sourceId, input.sourceId),
        ),
      );
    await tx.insert(companyBrainAuditEvents).values({
      tenantId: input.tenantId,
      actorType: "user",
      actorId: String(input.userId),
      eventType: changed ? "source_version_confidentiality_tightened" : "source_version_confidentiality_confirmed",
      entityType: "company_brain_source_version",
      entityId: String(input.versionId),
      payload: {
        sourceId: input.sourceId,
        versionId: input.versionId,
        previousSourceLevel: transition.sourceLevel,
        previousVersionLevel: transition.versionLevel,
        previousEffectiveLevel: transition.currentLevel,
        nextLevel: transition.nextLevel,
        changed,
        notes,
        externalPublicationApproved: false,
      },
    });

    return {
      sourceId: input.sourceId,
      versionId: input.versionId,
      confidentiality: transition.nextLevel,
      previousConfidentiality: transition.currentLevel,
      changed,
      externalPublicationApproved: false,
    };
  });
}
