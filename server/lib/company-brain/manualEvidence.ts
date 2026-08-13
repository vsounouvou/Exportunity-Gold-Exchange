import path from "node:path";

import { db } from "@db";
import { companyBrainAuditEvents } from "@db/schema";
import { sql } from "drizzle-orm";

import { extractAttachmentText, type AttachmentTextExtraction } from "../uploads/extractAttachmentText";
import {
  MANUAL_EVIDENCE_CONFIDENTIALITY,
  MANUAL_EVIDENCE_RELEVANCE,
  mimeTypeForManualEvidenceExtension,
  validateManualEvidenceFile,
} from "./manualEvidencePolicy";
import { secureUntrustedEvidence } from "./security";
import { persistPrivateCompanyBrainEvidence } from "./manualEvidenceStorage";

type ManualEvidenceInput = {
  tenantId: number;
  userId: number;
  file: Express.Multer.File;
  title?: string | null;
  businessRelevance?: string | null;
  confidentiality?: string | null;
  provenanceNotes: string;
};

type PersistedRow = Record<string, unknown>;

function rowsOf(result: any): PersistedRow[] {
  if (Array.isArray(result?.rows)) return result.rows;
  return Array.isArray(result) ? result : [];
}

function safeText(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function governedExtractionStatus(extraction: AttachmentTextExtraction) {
  if (extraction.status === "extracted") return "extracted";
  if (extraction.status === "failed") return "failed";
  return "metadata_only";
}

export async function persistManualCompanyBrainEvidence(input: ManualEvidenceInput) {
  const tenantId = Number(input.tenantId);
  const userId = Number(input.userId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) throw new Error("Tenant not resolved");
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("Administrator identity not resolved");

  const { extension, sourceType } = validateManualEvidenceFile(input.file);
  const fallbackTitle = path.basename(input.file.originalname, extension);
  const title = safeText(input.title || fallbackTitle || "Company evidence", 240);
  const provenanceNotes = safeText(input.provenanceNotes, 2_000);
  const businessRelevance = safeText(input.businessRelevance || "other", 80).toLowerCase();
  const confidentiality = safeText(input.confidentiality || "internal", 40).toLowerCase();
  if (!title) {
    const error = new Error("Evidence title is required.");
    (error as any).status = 400;
    throw error;
  }
  if (!provenanceNotes) {
    const error = new Error("A provenance note is required.");
    (error as any).status = 400;
    throw error;
  }
  if (!MANUAL_EVIDENCE_RELEVANCE.has(businessRelevance)) {
    const error = new Error("Unsupported business relevance classification.");
    (error as any).status = 400;
    throw error;
  }
  if (!MANUAL_EVIDENCE_CONFIDENTIALITY.has(confidentiality)) {
    const error = new Error("Unsupported confidentiality classification.");
    (error as any).status = 400;
    throw error;
  }

  const [extraction, persisted] = await Promise.all([
    extractAttachmentText(input.file, { maxChars: 40_000 }),
    persistPrivateCompanyBrainEvidence({ tenantId, file: input.file }),
  ]);
  const contentHash = persisted.sha256;
  const providerSourceId = `sha256:${contentHash}`;
  const evidenceId = providerSourceId;
  const extractionStatus = governedExtractionStatus(extraction);
  const secured = secureUntrustedEvidence({
    sourceId: providerSourceId,
    title,
    text: extraction.text,
    locator: providerSourceId,
  });
  const securityStatus = secured.securityStatus === "quarantined" ? "quarantined" : "review_required";
  const uploadedAt = new Date().toISOString();
  const mimeType = mimeTypeForManualEvidenceExtension(extension);
  const sourceMetadata = {
    intake: "manual_admin_upload",
    evidenceId,
    originalName: safeText(input.file.originalname, 260),
    size: Number(input.file.size || input.file.buffer.length),
    extension,
    provenanceNotes,
    uploadedByUserId: userId,
    uploadedAt,
    extraction: {
      originalStatus: extraction.status,
      governedStatus: extractionStatus,
      method: extraction.method,
      warning: extraction.warning || null,
    },
    promptInjectionIndicators: secured.indicators,
    truncated: secured.truncated,
  };
  const classification = {
    level: confidentiality,
    categories: [businessRelevance, "manual_upload"],
    humanReviewRequired: true,
    externalPublicationApproved: false,
  };

  return db.transaction(async (tx) => {
    const sourceResult = await tx.execute(sql`
      insert into company_brain_sources (
        tenant_id, company_id, connector_id, connector_type, provider_source_id,
        title, source_url, mime_type, source_type, confidentiality, business_relevance,
        permission_snapshot, metadata, content_hash, status, created_at, updated_at
      ) values (
        ${tenantId}, null, null, 'manual_upload', ${providerSourceId},
        ${title}, null, ${mimeType},
        ${sourceType}, ${confidentiality}, ${businessRelevance},
        ${JSON.stringify({ readOnly: true, tenantScoped: true, uploadedByUserId: userId })}::jsonb,
        ${JSON.stringify(sourceMetadata)}::jsonb, ${contentHash}, 'active', now(), now()
      )
      on conflict (tenant_id, connector_type, provider_source_id)
      do update set
        title = excluded.title,
        source_url = excluded.source_url,
        mime_type = excluded.mime_type,
        source_type = excluded.source_type,
        confidentiality = excluded.confidentiality,
        business_relevance = excluded.business_relevance,
        permission_snapshot = excluded.permission_snapshot,
        metadata = excluded.metadata,
        content_hash = excluded.content_hash,
        status = 'active',
        updated_at = now()
      returning id
    `);
    const sourceId = Number(rowsOf(sourceResult)[0]?.id || 0);
    if (!sourceId) throw new Error("Failed to persist Company Brain evidence source");
    const sourceUrl = `/api/admin/company-brain/sources/${sourceId}/file`;
    await tx.execute(sql`
      update company_brain_sources
      set source_url = ${sourceUrl}, updated_at = now()
      where id = ${sourceId} and tenant_id = ${tenantId}
    `);

    const versionResult = await tx.execute(sql`
      insert into company_brain_source_versions (
        source_id, provider_version_id, content_hash, extracted_text, storage_ref,
        source_modified_at, extraction_status, security_status, classification,
        redactions, metadata, created_at
      ) values (
        ${sourceId}, ${contentHash}, ${contentHash}, ${secured.text || null}, ${persisted.storageKey},
        now(), ${extractionStatus}, ${securityStatus}, ${JSON.stringify(classification)}::jsonb,
        '[]'::jsonb, ${JSON.stringify(sourceMetadata)}::jsonb, now()
      )
      on conflict (source_id, content_hash) do nothing
      returning id, extraction_status, security_status
    `);
    let version = rowsOf(versionResult)[0];
    const createdVersion = Boolean(version?.id);
    if (!version) {
      const existingVersionResult = await tx.execute(sql`
        select id, extraction_status, security_status
        from company_brain_source_versions
        where source_id = ${sourceId} and content_hash = ${contentHash}
        limit 1
      `);
      version = rowsOf(existingVersionResult)[0];
    }
    const versionId = Number(version?.id || 0);
    if (!versionId) throw new Error("Failed to persist Company Brain evidence version");

    await tx.insert(companyBrainAuditEvents).values({
      tenantId,
      actorType: "user",
      actorId: String(userId),
      eventType: createdVersion ? "source_manual_upload_created" : "source_manual_upload_reused",
      entityType: "company_brain_source",
      entityId: String(sourceId),
      payload: {
        sourceId,
        versionId,
        evidenceId,
        createdVersion,
        title,
        businessRelevance,
        confidentiality,
        extractionStatus: String(version.extraction_status || extractionStatus),
        securityStatus: String(version.security_status || securityStatus),
        claimsCreated: 0,
      },
    });

    return {
      sourceId,
      versionId,
      evidenceId,
      sourceUrl,
      createdVersion,
      extractionStatus: String(version.extraction_status || extractionStatus),
      securityStatus: String(version.security_status || securityStatus),
      extractionWarning: extraction.warning || null,
      claimsCreated: 0,
    };
  });
}
