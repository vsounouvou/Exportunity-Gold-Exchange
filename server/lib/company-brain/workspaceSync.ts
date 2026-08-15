import crypto from "node:crypto";
import { db } from "@db";
import {
  companyBrainAuditEvents,
  companyBrainSourceConnectors,
  companyBrainSyncCursors,
  companyBrainSyncDeadLetters,
  companyBrainSyncRuns,
  type CompanyBrainWorkspaceService,
} from "@db/schema";
import { and, eq, sql } from "drizzle-orm";
import { ensureTenantContactLink, upsertCanonicalContact } from "../contact/tenantContacts";
import { extractAttachmentText } from "../uploads/extractAttachmentText";
import { secureUntrustedEvidence } from "./security";
import {
  getConnectorWithConnection,
  googleWorkspaceFetch,
  type GoogleWorkspaceConnector,
} from "./googleWorkspace";
import { classifyWorkspaceEvidence, type WorkspaceEvidenceClassification } from "./workspaceClassification";
import { buildWorkspaceEmailMetadata } from "./workspaceEmailMetadata";

type SyncCounters = {
  scanned: number;
  indexed: number;
  unchanged: number;
  deleted: number;
  reviewRequired: number;
  quarantined: number;
  neverIndexed: number;
  contactsCreated: number;
  contactsUpdated: number;
  errors: number;
};

type PersistSourceInput = {
  connector: GoogleWorkspaceConnector;
  connectorType: "google_drive" | "google_gmail";
  providerSourceId: string;
  providerVersionId?: string | null;
  title: string;
  sourceUrl?: string | null;
  mimeType?: string | null;
  sourceType: string;
  modifiedAt?: string | Date | null;
  extractedText?: string | null;
  classification: WorkspaceEvidenceClassification;
  metadata?: Record<string, unknown>;
};

const GOOGLE_DOC_EXPORT_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => asText(item)).filter(Boolean)));
}

function rowsOf(result: any): any[] {
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result)) return result;
  return [];
}

function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown sync error");
}

function errorCode(error: any) {
  return asText(error?.code || error?.status || error?.name) || "sync_item_failed";
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function initialCounters(): SyncCounters {
  return {
    scanned: 0,
    indexed: 0,
    unchanged: 0,
    deleted: 0,
    reviewRequired: 0,
    quarantined: 0,
    neverIndexed: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    errors: 0,
  };
}

async function readJson(response: Response, label: string) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const record = asRecord(data);
    const nested = asRecord(record.error);
    const error = new Error(`${label} failed (${response.status}): ${asText(nested.message || record.message || record.error)}`);
    (error as any).status = response.status;
    (error as any).code = asText(nested.status || record.error) || "google_api_error";
    throw error;
  }
  return asRecord(data);
}

function classificationPolicy(connector: GoogleWorkspaceConnector) {
  return {
    includeKeywords: asStringArray(connector.policy.includeKeywords),
    excludeKeywords: asStringArray(connector.policy.excludeKeywords),
    includeDomains: asStringArray(connector.policy.includeDomains),
    excludeDomains: asStringArray(connector.policy.excludeDomains),
    neverIndex: asStringArray(connector.policy.neverIndex),
    requireBusinessSignal: connector.policy.requireBusinessSignal !== false,
  };
}

async function audit(input: {
  connector: GoogleWorkspaceConnector;
  userId: number;
  eventType: string;
  entityType: string;
  entityId?: string | number | null;
  payload?: Record<string, unknown>;
}) {
  await db.insert(companyBrainAuditEvents).values({
    tenantId: input.connector.tenantId,
    companyId: input.connector.companyId,
    actorType: "user",
    actorId: String(input.userId),
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId == null ? null : String(input.entityId),
    payload: input.payload || {},
  });
}

async function getCursor(connectorId: number, cursorType: string) {
  const row = await db.query.companyBrainSyncCursors.findFirst({
    where: and(
      eq(companyBrainSyncCursors.connectorId, connectorId),
      eq(companyBrainSyncCursors.cursorType, cursorType),
    ),
  });
  return row ? { value: row.cursorValue, metadata: asRecord(row.metadata) } : null;
}

async function saveCursor(
  connectorId: number,
  cursorType: string,
  cursorValue: string | null,
  metadata: Record<string, unknown> = {},
) {
  await db
    .insert(companyBrainSyncCursors)
    .values({ connectorId, cursorType, cursorValue, metadata, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [companyBrainSyncCursors.connectorId, companyBrainSyncCursors.cursorType],
      set: { cursorValue, metadata, updatedAt: new Date() },
    });
}

async function deleteCursor(connectorId: number, cursorType: string) {
  await db
    .delete(companyBrainSyncCursors)
    .where(
      and(
        eq(companyBrainSyncCursors.connectorId, connectorId),
        eq(companyBrainSyncCursors.cursorType, cursorType),
      ),
    );
}

async function addDeadLetter(input: {
  connector: GoogleWorkspaceConnector;
  syncRunId: number;
  providerItemId?: string | null;
  stage: string;
  error: unknown;
  payload?: Record<string, unknown>;
}) {
  await db.insert(companyBrainSyncDeadLetters).values({
    tenantId: input.connector.tenantId,
    connectorId: input.connector.connectorId,
    syncRunId: input.syncRunId,
    providerItemId: input.providerItemId || null,
    stage: input.stage,
    errorCode: errorCode(input.error),
    errorMessage: errorMessage(input.error).slice(0, 2000),
    payload: input.payload || {},
  });
}

async function resolveDeadLetters(connectorId: number, providerItemId: string, stage: string) {
  if (!providerItemId) return;
  await db.execute(sql`
    update company_brain_sync_dead_letters
    set status = 'resolved', resolved_at = now()
    where connector_id = ${connectorId}
      and provider_item_id = ${providerItemId}
      and stage = ${stage}
      and status = 'open'
  `);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

function connectorPolicyFingerprint(connector: GoogleWorkspaceConnector) {
  return sha256(JSON.stringify(stableValue({ service: connector.service, policy: connector.policy })));
}

async function markSourceDeleted(input: {
  connector: GoogleWorkspaceConnector;
  connectorType: "google_drive" | "google_gmail";
  providerSourceId: string;
  providerVersionId?: string | null;
  reason: string;
  deletedAt?: string | Date | null;
}) {
  const existingResult = await db.execute(sql`
    select id, status
    from company_brain_sources
    where tenant_id = ${input.connector.tenantId}
      and connector_type = ${input.connectorType}
      and provider_source_id = ${input.providerSourceId}
    limit 1
  `);
  const existing = rowsOf(existingResult)[0];
  if (!existing) return false;
  if (existing.status === "deleted") return false;
  const deletedAt = input.deletedAt ? new Date(input.deletedAt as any) : new Date();
  const contentHash = sha256(
    JSON.stringify({
      tombstone: true,
      providerSourceId: input.providerSourceId,
      providerVersionId: input.providerVersionId || null,
      reason: input.reason,
      deletedAt: deletedAt.toISOString(),
    }),
  );
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update company_brain_sources
      set status = 'deleted',
          metadata = metadata || ${JSON.stringify({
            tombstone: true,
            tombstoneReason: input.reason,
            providerDeletedAt: deletedAt.toISOString(),
          })}::jsonb,
          updated_at = now()
      where id = ${Number(existing.id)}
    `);
    await tx.execute(sql`
      insert into company_brain_source_versions (
        source_id, provider_version_id, content_hash, extracted_text, source_modified_at,
        extraction_status, security_status, classification, redactions, metadata, created_at
      ) values (
        ${Number(existing.id)}, ${input.providerVersionId || null}, ${contentHash}, null, ${deletedAt},
        'tombstone', 'clean',
        ${JSON.stringify({ level: "internal", categories: [input.connector.service, "tombstone"] })}::jsonb,
        '[]'::jsonb,
        ${JSON.stringify({ tombstone: true, reason: input.reason })}::jsonb,
        now()
      )
      on conflict (source_id, content_hash) do nothing
    `);
  });
  return existing.status !== "deleted";
}

async function persistSource(input: PersistSourceInput) {
  const disposition = input.classification.disposition;
  const baseText = asText(input.extractedText);
  const rawFingerprint = JSON.stringify({
    providerVersionId: input.providerVersionId || null,
    text: baseText,
    metadata: input.metadata || {},
    disposition,
  });
  const contentHash = sha256(rawFingerprint);
  const status = disposition === "index" ? "active" : disposition;
  const result = await db.execute(sql`
    insert into company_brain_sources (
      tenant_id, company_id, connector_id, connector_type, provider_source_id,
      title, source_url, mime_type, source_type, confidentiality, business_relevance,
      permission_snapshot, metadata, content_hash, status, created_at, updated_at
    ) values (
      ${input.connector.tenantId}, ${input.connector.companyId}, ${input.connector.connectorId},
      ${input.connectorType}, ${input.providerSourceId}, ${input.title}, ${input.sourceUrl || null},
      ${input.mimeType || null}, ${input.sourceType},
      ${disposition === "index" ? "internal" : "restricted"},
      ${disposition === "index" ? "business" : "review_required"},
      ${JSON.stringify({ readOnly: true, service: input.connector.service, scopes: input.connector.grantedScopes })}::jsonb,
      ${JSON.stringify({
        ...(input.metadata || {}),
        evidenceClassification: input.classification,
        tombstone: false,
        tombstoneReason: null,
        providerDeletedAt: null,
      })}::jsonb,
      ${contentHash}, ${status}, now(), now()
    )
    on conflict (tenant_id, connector_type, provider_source_id)
    do update set
      connector_id = excluded.connector_id,
      company_id = excluded.company_id,
      title = excluded.title,
      source_url = excluded.source_url,
      mime_type = excluded.mime_type,
      source_type = excluded.source_type,
      confidentiality = excluded.confidentiality,
      business_relevance = excluded.business_relevance,
      permission_snapshot = excluded.permission_snapshot,
      metadata = company_brain_sources.metadata || excluded.metadata,
      content_hash = excluded.content_hash,
      status = excluded.status,
      updated_at = now()
    returning id
  `);
  const sourceId = Number(rowsOf(result)[0]?.id || 0);
  if (!sourceId) throw new Error("Failed to persist Company Brain source");

  const secured = secureUntrustedEvidence({
    sourceId,
    title: input.title,
    text: baseText,
    sourceUrl: input.sourceUrl,
    locator: input.providerSourceId,
  });
  const securityDisposition =
    disposition !== "index"
      ? disposition
      : secured.securityStatus === "quarantined"
        ? "quarantined"
        : secured.securityStatus === "review_required"
          ? "review_required"
          : "clean";
  const mayStoreExtractedText = disposition === "index" && securityDisposition === "clean";
  const versionInsert = await db.execute(sql`
    insert into company_brain_source_versions (
      source_id, provider_version_id, content_hash, extracted_text, source_modified_at,
      extraction_status, security_status, classification, redactions, metadata, created_at
    ) values (
      ${sourceId}, ${input.providerVersionId || null}, ${contentHash},
      ${mayStoreExtractedText ? secured.text : null}, ${input.modifiedAt ? new Date(input.modifiedAt as any) : null},
      ${baseText ? "extracted" : "metadata_only"}, ${securityDisposition},
      ${JSON.stringify({
        level: disposition === "index" ? "internal" : "restricted",
        containsPersonalData: disposition !== "index",
        categories: [input.connector.service, disposition],
      })}::jsonb,
      ${JSON.stringify([])}::jsonb,
      ${JSON.stringify({
        evidenceClassification: input.classification,
        promptInjectionIndicators: secured.indicators,
        truncated: secured.truncated,
        textWithheld: !mayStoreExtractedText,
      })}::jsonb,
      now()
    )
    on conflict (source_id, content_hash) do nothing
    returning id
  `);
  return {
    sourceId,
    createdVersion: Boolean(Number(rowsOf(versionInsert)[0]?.id || 0)),
    disposition:
      securityDisposition === "quarantined"
        ? "quarantine"
        : securityDisposition === "review_required"
          ? "review"
          : disposition,
  };
}

function updateCountersForDisposition(counters: SyncCounters, disposition: string, createdVersion: boolean) {
  if (!createdVersion) {
    counters.unchanged += 1;
    return;
  }
  if (disposition === "index") counters.indexed += 1;
  else if (disposition === "review") counters.reviewRequired += 1;
  else if (disposition === "quarantine") counters.quarantined += 1;
  else if (disposition === "never_index") counters.neverIndexed += 1;
}

function quoteDrive(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const DRIVE_FILE_FIELDS =
  "id,name,mimeType,modifiedTime,version,md5Checksum,size,webViewLink,parents,driveId,trashed";

async function fetchDriveMetadata(connector: GoogleWorkspaceConnector, fileId: string) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}&supportsAllDrives=true`;
  return readJson(await googleWorkspaceFetch(connector, url), "Drive file metadata");
}

async function extractDriveFileText(connector: GoogleWorkspaceConnector, file: Record<string, unknown>) {
  const fileId = asText(file.id);
  const name = asText(file.name) || fileId;
  const mimeType = asText(file.mimeType) || "application/octet-stream";
  const maxFileBytes = boundedInt(connector.policy.maxFileBytes, 10_000_000, 100_000, 25_000_000);
  const size = Number(file.size || 0);
  if (Number.isFinite(size) && size > maxFileBytes) {
    return { text: "", status: "metadata_only", warning: `File exceeds ${maxFileBytes} byte import limit` };
  }
  const exportMime = GOOGLE_DOC_EXPORT_MIME[mimeType];
  const url = exportMime
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const response = await googleWorkspaceFetch(connector, url, { headers: { accept: exportMime || mimeType } });
  if (!response.ok) {
    return { text: "", status: "metadata_only", warning: `Content export unavailable (${response.status})` };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) return { text: "", status: "empty", warning: "File has no extractable content" };
  const extraction = await extractAttachmentText(
    { buffer, mimetype: exportMime || mimeType, originalname: name },
    { maxChars: 24_000 },
  );
  return extraction;
}

function driveFileIsAllowlisted(connector: GoogleWorkspaceConnector, file: Record<string, unknown>) {
  const folderIds = asStringArray(connector.policy.allowlistedFolderIds);
  const directFileIds = asStringArray(connector.policy.allowlistedFileIds);
  const fileId = asText(file.id);
  const parents = asStringArray(file.parents);
  return directFileIds.includes(fileId) || parents.some((parent) => folderIds.includes(parent));
}

function assertDriveAllowlist(connector: GoogleWorkspaceConnector) {
  const folderIds = asStringArray(connector.policy.allowlistedFolderIds);
  const directFileIds = asStringArray(connector.policy.allowlistedFileIds);
  if (!folderIds.length && !directFileIds.length) {
    const error = new Error("Drive requires at least one explicitly allowlisted folder or file before sync");
    (error as any).status = 409;
    throw error;
  }
}

async function reconcileDriveApproval(connector: GoogleWorkspaceConnector) {
  const folderIds = asStringArray(connector.policy.allowlistedFolderIds);
  const directFileIds = asStringArray(connector.policy.allowlistedFileIds);
  const result = await db.execute(sql`
    select provider_source_id, metadata
    from company_brain_sources
    where tenant_id = ${connector.tenantId}
      and connector_id = ${connector.connectorId}
      and connector_type = 'google_drive'
      and status <> 'deleted'
  `);
  let deleted = 0;
  for (const row of rowsOf(result)) {
    const providerSourceId = asText(row.provider_source_id);
    const metadata = asRecord(row.metadata);
    const parents = asStringArray(metadata.parents);
    const approved = directFileIds.includes(providerSourceId) || parents.some((parent) => folderIds.includes(parent));
    if (!approved && providerSourceId) {
      if (
        await markSourceDeleted({
          connector,
          connectorType: "google_drive",
          providerSourceId,
          reason: "removed_from_approved_sources",
        })
      ) {
        deleted += 1;
      }
    }
  }
  return deleted;
}

async function processDriveFile(
  connector: GoogleWorkspaceConnector,
  runId: number,
  counters: SyncCounters,
  file: Record<string, unknown>,
) {
  const fileId = asText(file.id);
  if (!fileId) return true;
  counters.scanned += 1;
  try {
    if (file.trashed === true || !driveFileIsAllowlisted(connector, file)) {
      const changed = await markSourceDeleted({
        connector,
        connectorType: "google_drive",
        providerSourceId: fileId,
        providerVersionId: asText(file.version || file.modifiedTime) || null,
        reason: file.trashed === true ? "provider_deleted_or_trashed" : "removed_from_approved_sources",
        deletedAt: asText(file.modifiedTime) || null,
      });
      if (changed) counters.deleted += 1;
      await resolveDeadLetters(connector.connectorId, fileId, "drive_file");
      return true;
    }
    const extraction = await extractDriveFileText(connector, file);
    const title = asText(file.name) || `Drive file ${fileId}`;
    const classification = classifyWorkspaceEvidence({
      subject: title,
      text: extraction.text,
      ...classificationPolicy(connector),
      requireBusinessSignal: false,
    });
    const persisted = await persistSource({
      connector,
      connectorType: "google_drive",
      providerSourceId: fileId,
      providerVersionId: asText(file.version || file.md5Checksum || file.modifiedTime) || null,
      title,
      sourceUrl: asText(file.webViewLink) || null,
      mimeType: asText(file.mimeType) || null,
      sourceType: "document",
      modifiedAt: asText(file.modifiedTime) || null,
      extractedText: extraction.text,
      classification,
      metadata: {
        googleDriveId: asText(file.driveId) || null,
        parents: Array.isArray(file.parents) ? file.parents : [],
        size: Number(file.size || 0) || null,
        extractionStatus: extraction.status,
        extractionMethod: (extraction as any).method || null,
        extractionWarning: extraction.warning || null,
      },
    });
    updateCountersForDisposition(counters, persisted.disposition, persisted.createdVersion);
    await resolveDeadLetters(connector.connectorId, fileId, "drive_file");
    return true;
  } catch (error) {
    counters.errors += 1;
    await addDeadLetter({ connector, syncRunId: runId, providerItemId: fileId, stage: "drive_file", error });
    return false;
  }
}

async function getDriveStartPageToken(connector: GoogleWorkspaceConnector) {
  const url = new URL("https://www.googleapis.com/drive/v3/changes/startPageToken");
  url.searchParams.set("supportsAllDrives", "true");
  const data = await readJson(await googleWorkspaceFetch(connector, url.toString()), "Drive change checkpoint");
  const token = asText(data.startPageToken);
  if (!token) throw new Error("Drive returned no change checkpoint");
  return token;
}

async function syncDriveBackfill(
  connector: GoogleWorkspaceConnector,
  runId: number,
  counters: SyncCounters,
  maxItems: number,
  fingerprint: string,
) {
  const directFileIds = asStringArray(connector.policy.allowlistedFileIds);
  const folderIds = asStringArray(connector.policy.allowlistedFolderIds);
  const saved = await getCursor(connector.connectorId, "drive_backfill_state");
  const prior = saved?.metadata.fingerprint === fingerprint ? saved.metadata : {};
  let directIndex = boundedInt(prior.directIndex, 0, 0, directFileIds.length);
  let folderIndex = boundedInt(prior.folderIndex, 0, 0, folderIds.length);
  let pageToken = asText(prior.pageToken);
  let folderPageSize = boundedInt(prior.folderPageSize, Math.min(100, maxItems), 1, 100);
  let remaining = maxItems;

  while (directIndex < directFileIds.length && remaining > 0) {
    const fileId = directFileIds[directIndex]!;
    let succeeded = false;
    try {
      const file = await fetchDriveMetadata(connector, fileId);
      succeeded = await processDriveFile(connector, runId, counters, file);
    } catch (error: any) {
      counters.scanned += 1;
      if (Number(error?.status || 0) === 404) {
        if (
          await markSourceDeleted({
            connector,
            connectorType: "google_drive",
            providerSourceId: fileId,
            reason: "provider_deleted_or_access_removed",
          })
        ) {
          counters.deleted += 1;
        }
        await resolveDeadLetters(connector.connectorId, fileId, "drive_file");
        succeeded = true;
      } else {
        counters.errors += 1;
        await addDeadLetter({ connector, syncRunId: runId, providerItemId: fileId, stage: "drive_file", error });
      }
    }
    if (!succeeded) break;
    directIndex += 1;
    remaining -= 1;
    await saveCursor(connector.connectorId, "drive_backfill_state", null, {
      fingerprint,
      directIndex,
      folderIndex,
      pageToken,
      folderPageSize,
    });
  }

  while (folderIndex < folderIds.length && remaining > 0) {
    const folderId = folderIds[folderIndex]!;
    if (!pageToken) folderPageSize = Math.min(100, remaining);
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", `'${quoteDrive(folderId)}' in parents and trashed = false`);
    url.searchParams.set("fields", `nextPageToken,files(${DRIVE_FILE_FIELDS})`);
    url.searchParams.set("pageSize", String(folderPageSize));
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await readJson(await googleWorkspaceFetch(connector, url.toString()), "Drive file listing");
    const files = Array.isArray(data.files) ? data.files.map(asRecord) : [];
    let pageSucceeded = true;
    for (const file of files) {
      if (!(await processDriveFile(connector, runId, counters, file))) pageSucceeded = false;
    }
    if (!pageSucceeded) {
      await saveCursor(connector.connectorId, "drive_backfill_state", null, {
        fingerprint,
        directIndex,
        folderIndex,
        pageToken,
        folderPageSize,
      });
      break;
    }
    remaining -= files.length;
    const nextPageToken = asText(data.nextPageToken);
    if (nextPageToken) pageToken = nextPageToken;
    else {
      folderIndex += 1;
      pageToken = "";
      folderPageSize = Math.min(100, Math.max(1, remaining));
    }
    await saveCursor(connector.connectorId, "drive_backfill_state", null, {
      fingerprint,
      directIndex,
      folderIndex,
      pageToken,
      folderPageSize,
    });
    if (!files.length && nextPageToken) break;
  }

  const complete = directIndex >= directFileIds.length && folderIndex >= folderIds.length;
  if (complete) {
    await deleteCursor(connector.connectorId, "drive_backfill_state");
    await saveCursor(connector.connectorId, "drive_backfill_complete", fingerprint, {
      completedAt: new Date().toISOString(),
    });
  }
  return { complete, directIndex, directCount: directFileIds.length, folderIndex, folderCount: folderIds.length };
}

async function syncDriveChanges(
  connector: GoogleWorkspaceConnector,
  runId: number,
  counters: SyncCounters,
  maxItems: number,
) {
  const cursor = await getCursor(connector.connectorId, "drive_change_token");
  if (!cursor?.value) throw new Error("Drive change checkpoint is missing");
  let pageToken = cursor.value;
  const pageSize = boundedInt(cursor.metadata.pageSize, Math.min(100, maxItems), 1, 100);
  let remaining = maxItems;
  let complete = false;
  while (remaining > 0) {
    const url = new URL("https://www.googleapis.com/drive/v3/changes");
    url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("includeRemoved", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set(
      "fields",
      `nextPageToken,newStartPageToken,changes(fileId,removed,time,file(${DRIVE_FILE_FIELDS}))`,
    );
    const data = await readJson(await googleWorkspaceFetch(connector, url.toString()), "Drive changes");
    const changes = Array.isArray(data.changes) ? data.changes.map(asRecord) : [];
    let pageSucceeded = true;
    for (const change of changes) {
      const fileId = asText(change.fileId || asRecord(change.file).id);
      if (change.removed === true || !change.file) {
        counters.scanned += 1;
        const changed = fileId
          ? await markSourceDeleted({
              connector,
              connectorType: "google_drive",
              providerSourceId: fileId,
              providerVersionId: asText(change.time) || null,
              reason: "provider_deleted_or_access_removed",
              deletedAt: asText(change.time) || null,
            })
          : false;
        if (changed) counters.deleted += 1;
      } else {
        if (!(await processDriveFile(connector, runId, counters, asRecord(change.file)))) pageSucceeded = false;
      }
    }
    if (!pageSucceeded) {
      await saveCursor(connector.connectorId, "drive_change_token", pageToken, {
        inProgress: true,
        pageSize,
        blockedByOpenDeadLetter: true,
      });
      break;
    }
    remaining -= changes.length;
    const nextPageToken = asText(data.nextPageToken);
    const newStartPageToken = asText(data.newStartPageToken);
    if (nextPageToken) {
      pageToken = nextPageToken;
      await saveCursor(connector.connectorId, "drive_change_token", pageToken, { inProgress: true, pageSize });
    } else {
      if (!newStartPageToken) throw new Error("Drive changes ended without a new checkpoint");
      pageToken = newStartPageToken;
      await saveCursor(connector.connectorId, "drive_change_token", pageToken, {
        inProgress: false,
        pageSize,
        savedAt: new Date().toISOString(),
      });
      complete = true;
      break;
    }
    if (!changes.length) break;
  }
  return { complete, changeToken: pageToken };
}

async function syncDrive(connector: GoogleWorkspaceConnector, runId: number, counters: SyncCounters, maxItems: number) {
  assertDriveAllowlist(connector);
  counters.deleted += await reconcileDriveApproval(connector);
  const fingerprint = connectorPolicyFingerprint(connector);
  const completeCursor = await getCursor(connector.connectorId, "drive_backfill_complete");
  const backfillRequired = completeCursor?.value !== fingerprint;
  if (backfillRequired) {
    const state = await getCursor(connector.connectorId, "drive_backfill_state");
    if (state?.metadata.fingerprint !== fingerprint) {
      await deleteCursor(connector.connectorId, "drive_backfill_state");
      await deleteCursor(connector.connectorId, "drive_backfill_complete");
      const startToken = await getDriveStartPageToken(connector);
      await saveCursor(connector.connectorId, "drive_change_token", startToken, {
        pendingBackfill: true,
        policyFingerprint: fingerprint,
        pageSize: Math.min(100, maxItems),
      });
    }
    const progress = await syncDriveBackfill(connector, runId, counters, maxItems, fingerprint);
    return { mode: "backfill", ...progress };
  }
  const change = await syncDriveChanges(connector, runId, counters, maxItems);
  return { mode: "changes", ...change };
}

function buildGmailQuery(connector: GoogleWorkspaceConnector, afterEpoch?: string | null) {
  const terms: string[] = [];
  if (afterEpoch) terms.push(`after:${afterEpoch}`);
  else {
    const days = boundedInt(connector.policy.dateDays, 3650, 1, 3650);
    terms.push(`newer_than:${days}d`);
  }
  const includeKeywords = asStringArray(connector.policy.includeKeywords);
  if (includeKeywords.length) terms.push(`{${includeKeywords.slice(0, 20).map((term) => `"${term.replace(/"/g, "")}"`).join(" ")}}`);
  const includeDomains = asStringArray(connector.policy.includeDomains)
    .slice(0, 10)
    .map((domain) => domain.replace(/^@/, ""))
    .filter(Boolean);
  if (includeDomains.length) {
    terms.push(`{${includeDomains.flatMap((domain) => [`from:(@${domain})`, `to:(@${domain})`]).join(" ")}}`);
  }
  for (const domain of asStringArray(connector.policy.excludeDomains).slice(0, 10)) {
    terms.push(`-from:(@${domain.replace(/^@/, "")}) -to:(@${domain.replace(/^@/, "")})`);
  }
  for (const keyword of asStringArray(connector.policy.excludeKeywords).slice(0, 10)) {
    terms.push(`-"${keyword.replace(/"/g, "")}"`);
  }
  return terms.join(" ");
}

function decodeBase64Url(value: unknown) {
  const raw = asText(value);
  if (!raw) return "";
  try {
    return Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function gmailHeaders(payload: Record<string, unknown>) {
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const out: Record<string, string> = {};
  for (const raw of headers) {
    const header = asRecord(raw);
    const name = asText(header.name).toLowerCase();
    if (name && !(name in out)) out[name] = asText(header.value);
  }
  return out;
}

function collectGmailBody(payload: Record<string, unknown>) {
  const plain: string[] = [];
  const html: string[] = [];
  const attachments: Array<Record<string, unknown>> = [];
  const visit = (part: Record<string, unknown>) => {
    const mimeType = asText(part.mimeType).toLowerCase();
    const filename = asText(part.filename);
    const body = asRecord(part.body);
    const data = decodeBase64Url(body.data);
    if (mimeType === "text/plain" && data) plain.push(data);
    else if (mimeType === "text/html" && data) html.push(stripHtml(data));
    if (filename || body.attachmentId) {
      attachments.push({
        filename: filename || null,
        mimeType: mimeType || null,
        size: Number(body.size || 0) || null,
        attachmentId: asText(body.attachmentId) || null,
      });
    }
    for (const child of Array.isArray(part.parts) ? part.parts : []) visit(asRecord(child));
  };
  visit(payload);
  return {
    text: (plain.length ? plain : html).join("\n\n").replace(/\u0000/g, "").trim().slice(0, 24_000),
    attachments,
  };
}

async function listGmailMessagePage(
  connector: GoogleWorkspaceConnector,
  pageSize: number,
  pageToken?: string | null,
) {
  const ids: string[] = [];
  const labels = asStringArray(connector.policy.labelIds);
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", buildGmailQuery(connector));
  url.searchParams.set("maxResults", String(pageSize));
  url.searchParams.set("includeSpamTrash", "false");
  for (const label of labels) url.searchParams.append("labelIds", label);
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const data = await readJson(await googleWorkspaceFetch(connector, url.toString()), "Gmail message listing");
  for (const raw of Array.isArray(data.messages) ? data.messages : []) {
    const id = asText(asRecord(raw).id);
    if (id) ids.push(id);
  }
  return { ids, nextPageToken: asText(data.nextPageToken) };
}

async function fetchGmailMessage(connector: GoogleWorkspaceConnector, messageId: string) {
  const fields = "id,threadId,labelIds,historyId,internalDate,snippet,sizeEstimate,payload(mimeType,filename,headers(name,value),body(attachmentId,size,data),parts(mimeType,filename,headers(name,value),body(attachmentId,size,data),parts(mimeType,filename,headers(name,value),body(attachmentId,size,data))))";
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`);
  url.searchParams.set("format", "full");
  url.searchParams.set("fields", fields);
  return readJson(await googleWorkspaceFetch(connector, url.toString()), "Gmail message read");
}

async function getGmailHistoryCheckpoint(connector: GoogleWorkspaceConnector) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/profile");
  url.searchParams.set("fields", "emailAddress,historyId");
  const data = await readJson(await googleWorkspaceFetch(connector, url.toString()), "Gmail history checkpoint");
  const historyId = asText(data.historyId);
  if (!historyId) throw new Error("Gmail returned no history checkpoint");
  return historyId;
}

async function processGmailMessage(
  connector: GoogleWorkspaceConnector,
  runId: number,
  counters: SyncCounters,
  messageId: string,
) {
  counters.scanned += 1;
  try {
    const message = await fetchGmailMessage(connector, messageId);
    const requiredLabels = asStringArray(connector.policy.labelIds);
    const labels = asStringArray(message.labelIds);
    const cutoff = Date.now() - boundedInt(connector.policy.dateDays, 3650, 1, 3650) * 86_400_000;
    const internalDate = Number(message.internalDate || 0);
    const outsideApprovedFilter =
      (requiredLabels.length > 0 && !requiredLabels.some((label) => labels.includes(label))) ||
      (Number.isFinite(internalDate) && internalDate > 0 && internalDate < cutoff);
    if (outsideApprovedFilter) {
      if (
        await markSourceDeleted({
          connector,
          connectorType: "google_gmail",
          providerSourceId: messageId,
          providerVersionId: asText(message.historyId || message.internalDate) || null,
          reason: "outside_approved_gmail_filter",
          deletedAt: message.internalDate ? new Date(Number(message.internalDate)) : null,
        })
      ) {
        counters.deleted += 1;
      }
      await resolveDeadLetters(connector.connectorId, messageId, "gmail_message");
      return true;
    }
    const payload = asRecord(message.payload);
    const headers = gmailHeaders(payload);
    const body = collectGmailBody(payload);
    const relationshipMetadata = buildWorkspaceEmailMetadata({
      accountEmail: connector.accountLabel,
      from: headers.from,
      to: headers.to,
      cc: headers.cc,
    });
    const classification = classifyWorkspaceEvidence({
      subject: headers.subject,
      text: body.text || message.snippet,
      from: headers.from,
      to: headers.to,
      ...classificationPolicy(connector),
    });
    const persisted = await persistSource({
      connector,
      connectorType: "google_gmail",
      providerSourceId: messageId,
      providerVersionId: asText(message.historyId || message.internalDate) || null,
      title: headers.subject || `Email ${messageId}`,
      sourceUrl: `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(messageId)}`,
      mimeType: "message/rfc822",
      sourceType: "email",
      modifiedAt: message.internalDate ? new Date(Number(message.internalDate)) : null,
      extractedText: [
        headers.from ? `From: ${headers.from}` : "",
        headers.to ? `To: ${headers.to}` : "",
        body.text || asText(message.snippet),
      ]
        .filter(Boolean)
        .join("\n\n"),
      classification,
      metadata: {
        threadId: asText(message.threadId),
        historyId: asText(message.historyId),
        internalDate: asText(message.internalDate),
        labels,
        from: headers.from || null,
        to: headers.to || null,
        cc: headers.cc || null,
        ...relationshipMetadata,
        attachments: body.attachments,
        attachmentPolicy: "metadata_only",
        policyFingerprint: connectorPolicyFingerprint(connector),
      },
    });
    updateCountersForDisposition(counters, persisted.disposition, persisted.createdVersion);
    await resolveDeadLetters(connector.connectorId, messageId, "gmail_message");
    return true;
  } catch (error: any) {
    if (Number(error?.status || 0) === 404) {
      if (
        await markSourceDeleted({
          connector,
          connectorType: "google_gmail",
          providerSourceId: messageId,
          reason: "provider_deleted",
        })
      ) {
        counters.deleted += 1;
      }
      await resolveDeadLetters(connector.connectorId, messageId, "gmail_message");
      return true;
    }
    counters.errors += 1;
    await addDeadLetter({ connector, syncRunId: runId, providerItemId: messageId, stage: "gmail_message", error });
    return false;
  }
}

async function reconcileGmailPolicy(connector: GoogleWorkspaceConnector, fingerprint: string) {
  const result = await db.execute(sql`
    select provider_source_id
    from company_brain_sources
    where tenant_id = ${connector.tenantId}
      and connector_id = ${connector.connectorId}
      and connector_type = 'google_gmail'
      and status <> 'deleted'
      and coalesce(metadata ->> 'policyFingerprint', '') <> ${fingerprint}
  `);
  let deleted = 0;
  for (const row of rowsOf(result)) {
    const providerSourceId = asText(row.provider_source_id);
    if (
      providerSourceId &&
      (await markSourceDeleted({
        connector,
        connectorType: "google_gmail",
        providerSourceId,
        reason: "outside_current_approved_gmail_policy",
      }))
    ) {
      deleted += 1;
    }
  }
  return deleted;
}

async function syncGmailBackfill(
  connector: GoogleWorkspaceConnector,
  runId: number,
  counters: SyncCounters,
  maxItems: number,
  fingerprint: string,
) {
  let state = await getCursor(connector.connectorId, "gmail_backfill_state");
  if (state?.metadata.fingerprint !== fingerprint) {
    await deleteCursor(connector.connectorId, "gmail_backfill_state");
    await deleteCursor(connector.connectorId, "gmail_backfill_complete");
    const checkpointHistoryId = await getGmailHistoryCheckpoint(connector);
    await saveCursor(connector.connectorId, "gmail_backfill_state", null, {
      fingerprint,
      pageToken: null,
      checkpointHistoryId,
      query: buildGmailQuery(connector),
      pageSize: Math.min(100, maxItems),
    });
    state = await getCursor(connector.connectorId, "gmail_backfill_state");
  }
  const pageToken = asText(state?.metadata.pageToken);
  const checkpointHistoryId = asText(state?.metadata.checkpointHistoryId);
  const pageSize = boundedInt(state?.metadata.pageSize, Math.min(100, maxItems), 1, 100);
  if (!checkpointHistoryId) throw new Error("Gmail backfill checkpoint is missing");
  const page = await listGmailMessagePage(connector, pageSize, pageToken);
  let pageSucceeded = true;
  for (const messageId of page.ids) {
    if (!(await processGmailMessage(connector, runId, counters, messageId))) pageSucceeded = false;
  }
  if (!pageSucceeded) {
    await saveCursor(connector.connectorId, "gmail_backfill_state", null, {
      fingerprint,
      pageToken: pageToken || null,
      checkpointHistoryId,
      query: buildGmailQuery(connector),
      pageSize,
      blockedByOpenDeadLetter: true,
    });
    return { complete: false, pageSize: page.ids.length, blockedByOpenDeadLetter: true };
  }
  if (page.nextPageToken) {
    await saveCursor(connector.connectorId, "gmail_backfill_state", null, {
      fingerprint,
      pageToken: page.nextPageToken,
      checkpointHistoryId,
      query: buildGmailQuery(connector),
      pageSize,
    });
    return { complete: false, pageSize: page.ids.length };
  }
  await deleteCursor(connector.connectorId, "gmail_backfill_state");
  await saveCursor(connector.connectorId, "gmail_backfill_complete", fingerprint, {
    completedAt: new Date().toISOString(),
  });
  await saveCursor(connector.connectorId, "gmail_history_id", checkpointHistoryId, {
    inProgress: false,
    savedAt: new Date().toISOString(),
  });
  counters.deleted += await reconcileGmailPolicy(connector, fingerprint);
  return { complete: true, pageSize: page.ids.length, historyId: checkpointHistoryId };
}

type GmailHistoryState = {
  startHistoryId: string;
  pageToken: string;
  pageSize: number;
  pendingAdded: string[];
  pendingDeleted: string[];
  nextPageToken: string;
  responseHistoryId: string;
};

function gmailHistoryState(value: Record<string, unknown>, fallbackHistoryId: string): GmailHistoryState {
  return {
    startHistoryId: asText(value.startHistoryId) || fallbackHistoryId,
    pageToken: asText(value.pageToken),
    pageSize: boundedInt(value.pageSize, 100, 1, 100),
    pendingAdded: asStringArray(value.pendingAdded),
    pendingDeleted: asStringArray(value.pendingDeleted),
    nextPageToken: asText(value.nextPageToken),
    responseHistoryId: asText(value.responseHistoryId),
  };
}

async function fetchGmailHistoryPage(connector: GoogleWorkspaceConnector, state: GmailHistoryState) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
  url.searchParams.set("startHistoryId", state.startHistoryId);
  url.searchParams.set("maxResults", String(state.pageSize));
  if (state.pageToken) url.searchParams.set("pageToken", state.pageToken);
  const response = await googleWorkspaceFetch(connector, url.toString());
  if (response.status === 404) {
    const error = new Error("Gmail history checkpoint expired; a visible full resynchronization is required");
    (error as any).status = 409;
    (error as any).code = "gmail_history_expired";
    throw error;
  }
  const data = await readJson(response, "Gmail history listing");
  const added = new Set<string>();
  const deleted = new Set<string>();
  for (const raw of Array.isArray(data.history) ? data.history : []) {
    const history = asRecord(raw);
    for (const entry of Array.isArray(history.messagesAdded) ? history.messagesAdded : []) {
      const id = asText(asRecord(asRecord(entry).message).id);
      if (id) added.add(id);
    }
    for (const entry of Array.isArray(history.messagesDeleted) ? history.messagesDeleted : []) {
      const id = asText(asRecord(asRecord(entry).message).id);
      if (id) deleted.add(id);
    }
    for (const entry of Array.isArray(history.labelsAdded) ? history.labelsAdded : []) {
      const id = asText(asRecord(asRecord(entry).message).id);
      if (id) added.add(id);
    }
    for (const entry of Array.isArray(history.labelsRemoved) ? history.labelsRemoved : []) {
      const id = asText(asRecord(asRecord(entry).message).id);
      if (id) added.add(id);
    }
  }
  for (const id of deleted) added.delete(id);
  return {
    ...state,
    pendingAdded: Array.from(added),
    pendingDeleted: Array.from(deleted),
    nextPageToken: asText(data.nextPageToken),
    responseHistoryId: asText(data.historyId),
  };
}

async function saveGmailHistoryState(connectorId: number, state: GmailHistoryState) {
  await saveCursor(connectorId, "gmail_history_state", null, state);
}

async function syncGmailHistory(
  connector: GoogleWorkspaceConnector,
  runId: number,
  counters: SyncCounters,
  maxItems: number,
) {
  const historyCursor = await getCursor(connector.connectorId, "gmail_history_id");
  if (!historyCursor?.value) throw new Error("Gmail history checkpoint is missing");
  const savedState = await getCursor(connector.connectorId, "gmail_history_state");
  let state = gmailHistoryState(savedState?.metadata || {}, historyCursor.value);
  let remaining = maxItems;

  while (remaining > 0) {
    if (!state.pendingAdded.length && !state.pendingDeleted.length) {
      state = await fetchGmailHistoryPage(connector, state);
      await saveGmailHistoryState(connector.connectorId, state);
    }
    while (state.pendingDeleted.length && remaining > 0) {
      const messageId = state.pendingDeleted.shift()!;
      counters.scanned += 1;
      const changed = await markSourceDeleted({
        connector,
        connectorType: "google_gmail",
        providerSourceId: messageId,
        providerVersionId: state.responseHistoryId || state.startHistoryId,
        reason: "provider_deleted",
      });
      if (changed) counters.deleted += 1;
      remaining -= 1;
      await saveGmailHistoryState(connector.connectorId, state);
    }
    while (state.pendingAdded.length && remaining > 0) {
      const messageId = state.pendingAdded[0]!;
      const succeeded = await processGmailMessage(connector, runId, counters, messageId);
      if (!succeeded) {
        await saveGmailHistoryState(connector.connectorId, state);
        return {
          complete: false,
          historyId: state.startHistoryId,
          pending: state.pendingAdded.length + state.pendingDeleted.length,
          blockedByOpenDeadLetter: true,
        };
      }
      state.pendingAdded.shift();
      remaining -= 1;
      await saveGmailHistoryState(connector.connectorId, state);
    }
    if (state.pendingAdded.length || state.pendingDeleted.length) break;
    if (state.nextPageToken) {
      state.pageToken = state.nextPageToken;
      state.nextPageToken = "";
      state.responseHistoryId = "";
      await saveGmailHistoryState(connector.connectorId, state);
      continue;
    }
    const nextHistoryId = state.responseHistoryId || state.startHistoryId;
    await saveCursor(connector.connectorId, "gmail_history_id", nextHistoryId, {
      inProgress: false,
      savedAt: new Date().toISOString(),
    });
    await deleteCursor(connector.connectorId, "gmail_history_state");
    return { complete: true, historyId: nextHistoryId };
  }
  return { complete: false, historyId: state.startHistoryId, pending: state.pendingAdded.length + state.pendingDeleted.length };
}

async function syncGmail(connector: GoogleWorkspaceConnector, runId: number, counters: SyncCounters, maxItems: number) {
  const fingerprint = connectorPolicyFingerprint(connector);
  const completeCursor = await getCursor(connector.connectorId, "gmail_backfill_complete");
  if (completeCursor?.value !== fingerprint) {
    await deleteCursor(connector.connectorId, "gmail_history_state");
    await deleteCursor(connector.connectorId, "gmail_history_id");
    const backfill = await syncGmailBackfill(connector, runId, counters, maxItems, fingerprint);
    return { mode: "backfill", ...backfill };
  }
  try {
    const history = await syncGmailHistory(connector, runId, counters, maxItems);
    return { mode: "history", ...history };
  } catch (error: any) {
    if (error?.code !== "gmail_history_expired") throw error;
    await deleteCursor(connector.connectorId, "gmail_backfill_complete");
    await deleteCursor(connector.connectorId, "gmail_backfill_state");
    await deleteCursor(connector.connectorId, "gmail_history_id");
    await deleteCursor(connector.connectorId, "gmail_history_state");
    const backfill = await syncGmailBackfill(connector, runId, counters, maxItems, fingerprint);
    return { mode: "history_expired_full_resync", ...backfill };
  }
}

function personOrganization(person: Record<string, unknown>) {
  const organizations = Array.isArray(person.organizations) ? person.organizations.map(asRecord) : [];
  return organizations.find((org) => org.current === true) || organizations[0] || {};
}

function personValues(person: Record<string, unknown>, key: string) {
  const list = Array.isArray(person[key]) ? (person[key] as unknown[]).map(asRecord) : [];
  return Array.from(new Set(list.map((item) => asText(item.value)).filter(Boolean)));
}

async function mergeGoogleContact(
  connector: GoogleWorkspaceConnector,
  userId: number,
  person: Record<string, unknown>,
) {
  const names = Array.isArray(person.names) ? person.names.map(asRecord) : [];
  const name = names.find((entry) => entry.metadata && asRecord(entry.metadata).primary === true) || names[0] || {};
  const emails = personValues(person, "emailAddresses");
  const phones = personValues(person, "phoneNumbers");
  const organization = personOrganization(person);
  const displayName = asText(name.displayName) || asText(organization.name) || emails[0] || phones[0] || "Unnamed contact";
  const company = asText(organization.name);
  const jobTitle = asText(organization.title);
  const classification = classifyWorkspaceEvidence({
    subject: displayName,
    from: emails.join(" "),
    company,
    jobTitle,
    ...classificationPolicy(connector),
  });
  if (classification.disposition !== "index") return { classification, merged: false, created: false };

  let created = false;
  await db.transaction(async (tx) => {
    const outcome = await upsertCanonicalContact(tx, {
      displayName,
      company: company || null,
      jobTitle: jobTitle || null,
      emails,
      phones,
      source: "Google Contacts",
      sourceSystem: "google_contacts",
      createdByUserId: userId,
    });
    created = Boolean(outcome.created);
    await ensureTenantContactLink(tx, {
      tenantId: connector.tenantId,
      contactId: outcome.contactId,
      createdByUserId: userId,
    });
    await tx.execute(sql`
      insert into contact_sources (
        tenant_id, contact_id, source, source_system, source_reference_id, metadata, created_at
      )
      select ${connector.tenantId}, ${outcome.contactId}, 'Google Contacts', 'google_contacts',
        ${asText(person.resourceName)},
        ${JSON.stringify({ etag: asText(person.etag), connectorId: connector.connectorId, readOnly: true })}::jsonb,
        now()
      where not exists (
        select 1 from contact_sources
        where tenant_id = ${connector.tenantId}
          and contact_id = ${outcome.contactId}
          and source_system = 'google_contacts'
          and source_reference_id = ${asText(person.resourceName)}
      )
    `);
    await tx.execute(sql`
      update contact_sources
      set metadata = metadata || ${JSON.stringify({
        etag: asText(person.etag),
        connectorId: connector.connectorId,
        readOnly: true,
        googleDeleted: false,
        deletedAt: null,
        policyFingerprint: connectorPolicyFingerprint(connector),
      })}::jsonb
      where tenant_id = ${connector.tenantId}
        and contact_id = ${outcome.contactId}
        and source_system = 'google_contacts'
        and source_reference_id = ${asText(person.resourceName)}
    `);
  });
  return { classification, merged: true, created };
}

function isDeletedGoogleContact(person: Record<string, unknown>) {
  return asRecord(person.metadata).deleted === true;
}

async function markGoogleContactDeleted(connector: GoogleWorkspaceConnector, person: Record<string, unknown>) {
  const resourceName = asText(person.resourceName);
  if (!resourceName) return false;
  const result = await db.execute(sql`
    update contact_sources
    set metadata = metadata || ${JSON.stringify({
      googleDeleted: true,
      deletedAt: new Date().toISOString(),
      connectorId: connector.connectorId,
      readOnly: true,
    })}::jsonb
    where tenant_id = ${connector.tenantId}
      and source_system = 'google_contacts'
      and source_reference_id = ${resourceName}
      and coalesce((metadata ->> 'googleDeleted')::boolean, false) = false
    returning id
  `);
  return rowsOf(result).length > 0;
}

async function reconcileGoogleContactPolicy(connector: GoogleWorkspaceConnector, fingerprint: string) {
  const result = await db.execute(sql`
    update contact_sources
    set metadata = metadata || ${JSON.stringify({
      googleDeleted: true,
      deletedAt: new Date().toISOString(),
      deletionReason: "outside_current_approved_contacts_policy",
    })}::jsonb
    where tenant_id = ${connector.tenantId}
      and source_system = 'google_contacts'
      and coalesce((metadata ->> 'connectorId')::int, 0) = ${connector.connectorId}
      and coalesce((metadata ->> 'googleDeleted')::boolean, false) = false
      and coalesce(metadata ->> 'policyFingerprint', '') <> ${fingerprint}
    returning id
  `);
  return rowsOf(result).length;
}

type ContactsPageState = {
  fingerprint: string;
  baseSyncToken: string;
  pageToken: string;
  pageSize: number;
  fullSync: boolean;
};

function contactsPageState(
  value: Record<string, unknown>,
  fingerprint: string,
  syncToken: string,
  requestedPageSize: number,
): ContactsPageState {
  if (value.fingerprint !== fingerprint) {
    return {
      fingerprint,
      baseSyncToken: syncToken,
      pageToken: "",
      pageSize: Math.min(100, requestedPageSize),
      fullSync: !syncToken,
    };
  }
  return {
    fingerprint,
    baseSyncToken: asText(value.baseSyncToken) || syncToken,
    pageToken: asText(value.pageToken),
    pageSize: boundedInt(value.pageSize, Math.min(100, requestedPageSize), 1, 100),
    fullSync: value.fullSync !== false,
  };
}

async function listGoogleContactsPage(
  connector: GoogleWorkspaceConnector,
  state: ContactsPageState,
) {
  const url = new URL("https://people.googleapis.com/v1/people/me/connections");
  url.searchParams.set("personFields", "names,emailAddresses,phoneNumbers,organizations,metadata");
  url.searchParams.set("pageSize", String(state.pageSize));
  url.searchParams.set("requestSyncToken", "true");
  if (state.fullSync) {
    url.searchParams.set("sortOrder", "LAST_MODIFIED_DESCENDING");
  } else if (state.baseSyncToken) {
    url.searchParams.set("syncToken", state.baseSyncToken);
  }
  if (state.pageToken) url.searchParams.set("pageToken", state.pageToken);
  const response = await googleWorkspaceFetch(connector, url.toString());
  if (response.status === 410 && !state.fullSync) {
    const error = new Error("Google Contacts sync token expired; a visible full resynchronization is required");
    (error as any).status = 409;
    (error as any).code = "contacts_sync_token_expired";
    throw error;
  }
  const data = await readJson(response, "Google Contacts listing");
  return {
    people: Array.isArray(data.connections) ? data.connections.map(asRecord) : [],
    nextPageToken: asText(data.nextPageToken),
    nextSyncToken: asText(data.nextSyncToken),
  };
}

async function syncContacts(
  connector: GoogleWorkspaceConnector,
  runId: number,
  userId: number,
  counters: SyncCounters,
  maxItems: number,
) {
  const fingerprint = connectorPolicyFingerprint(connector);
  const syncCursor = await getCursor(connector.connectorId, "contacts_sync_token");
  const savedPage = await getCursor(connector.connectorId, "contacts_page_state");
  const syncFingerprint = asText(syncCursor?.metadata.policyFingerprint);
  const policyChanged = Boolean(syncCursor?.value && syncFingerprint !== fingerprint);
  if (policyChanged) {
    await deleteCursor(connector.connectorId, "contacts_sync_token");
    await deleteCursor(connector.connectorId, "contacts_page_state");
  }
  let state = contactsPageState(
    policyChanged ? {} : savedPage?.metadata || {},
    fingerprint,
    policyChanged ? "" : syncCursor?.value || "",
    maxItems,
  );
  let result: Awaited<ReturnType<typeof listGoogleContactsPage>>;
  try {
    result = await listGoogleContactsPage(connector, state);
  } catch (error: any) {
    if (error?.code !== "contacts_sync_token_expired") throw error;
    await deleteCursor(connector.connectorId, "contacts_sync_token");
    await deleteCursor(connector.connectorId, "contacts_page_state");
    state = {
      fingerprint,
      baseSyncToken: "",
      pageToken: "",
      pageSize: Math.min(100, maxItems),
      fullSync: true,
    };
    result = await listGoogleContactsPage(connector, state);
  }
  let pageSucceeded = true;
  for (const person of result.people) {
    const resourceName = asText(person.resourceName);
    counters.scanned += 1;
    try {
      if (isDeletedGoogleContact(person)) {
        if (await markGoogleContactDeleted(connector, person)) counters.deleted += 1;
      } else {
        const outcome = await mergeGoogleContact(connector, userId, person);
        if (!outcome.merged) {
          if (outcome.classification.disposition === "quarantine") counters.quarantined += 1;
          else if (outcome.classification.disposition === "never_index") counters.neverIndexed += 1;
          else counters.reviewRequired += 1;
        } else if (outcome.created) counters.contactsCreated += 1;
        else counters.contactsUpdated += 1;
      }
      await resolveDeadLetters(connector.connectorId, resourceName, "contacts_person");
    } catch (error) {
      pageSucceeded = false;
      counters.errors += 1;
      await addDeadLetter({ connector, syncRunId: runId, providerItemId: resourceName, stage: "contacts_person", error });
    }
  }
  if (!pageSucceeded) {
    await saveCursor(connector.connectorId, "contacts_page_state", null, {
      ...state,
      blockedByOpenDeadLetter: true,
    });
    return { contactsSyncTokenSaved: false, fullSync: state.fullSync, blockedByOpenDeadLetter: true };
  }
  if (result.nextPageToken) {
    await saveCursor(connector.connectorId, "contacts_page_state", null, {
      ...state,
      pageToken: result.nextPageToken,
      blockedByOpenDeadLetter: false,
    });
    return { contactsSyncTokenSaved: false, fullSync: state.fullSync, pagePending: true };
  }
  if (!result.nextSyncToken) throw new Error("Google Contacts ended without a new sync token");
  await saveCursor(connector.connectorId, "contacts_sync_token", result.nextSyncToken, {
    fullSync: state.fullSync,
    savedAt: new Date().toISOString(),
    policyFingerprint: fingerprint,
  });
  await deleteCursor(connector.connectorId, "contacts_page_state");
  if (state.fullSync) counters.deleted += await reconcileGoogleContactPolicy(connector, fingerprint);
  return { contactsSyncTokenSaved: true, fullSync: state.fullSync, pagePending: false };
}

export async function runManualWorkspaceSync(input: {
  tenantId: number;
  userId: number;
  service: CompanyBrainWorkspaceService;
  maxItems?: unknown;
}) {
  const connector = await getConnectorWithConnection({ tenantId: input.tenantId, service: input.service });
  if (!connector) {
    const error = new Error(`Google ${input.service} is not connected`);
    (error as any).status = 409;
    throw error;
  }
  if (connector.connectorStatus === "paused") {
    const error = new Error(`Google ${input.service} sync is paused`);
    (error as any).status = 409;
    throw error;
  }
  if (connector.connectorStatus === "syncing") {
    const error = new Error(`Google ${input.service} already has a visible sync in progress`);
    (error as any).status = 409;
    throw error;
  }
  const maxItems = boundedInt(
    input.maxItems,
    boundedInt(connector.syncSettings.maxItemsPerRun, 100, 1, 200),
    1,
    200,
  );
  const counters = initialCounters();
  const cursorBeforeRow = await db.execute(sql`
    select cursor_type, cursor_value, metadata
    from company_brain_sync_cursors
    where connector_id = ${connector.connectorId}
  `);
  const cursorBefore = Object.fromEntries(
    rowsOf(cursorBeforeRow).map((row) => [row.cursor_type, { value: row.cursor_value, metadata: row.metadata }]),
  );
  const run = await db.transaction(async (tx) => {
    const lockResult = await tx.execute(sql`
      update company_brain_source_connectors
      set status = 'syncing', last_sync_at = now(), last_error = null, updated_at = now()
      where id = ${connector.connectorId}
        and status in ('connected', 'error')
        and revoked_at is null
      returning id
    `);
    if (!rowsOf(lockResult).length) {
      const error = new Error(`Google ${input.service} already has a visible sync in progress or is paused`);
      (error as any).status = 409;
      throw error;
    }
    const [createdRun] = await tx
      .insert(companyBrainSyncRuns)
      .values({
        tenantId: connector.tenantId,
        connectorId: connector.connectorId,
        service: connector.service,
        trigger: "manual",
        syncMode: Object.keys(cursorBefore).length ? "incremental" : "full",
        status: "running",
        phase: "reading",
        counters,
        cursorBefore,
        createdByUserId: input.userId,
        startedAt: new Date(),
      })
      .returning();
    if (!createdRun) throw new Error("Failed to create visible sync run");
    return createdRun;
  });
  if (!run) throw new Error("Failed to create visible sync run");
  await audit({
    connector,
    userId: input.userId,
    eventType: "workspace_sync_started",
    entityType: "workspace_sync_run",
    entityId: run.id,
    payload: { service: connector.service, maxItems, manual: true },
  });

  try {
    let cursorAfter: Record<string, unknown> = {};
    if (connector.service === "drive") cursorAfter = await syncDrive(connector, run.id, counters, maxItems);
    else if (connector.service === "gmail") cursorAfter = await syncGmail(connector, run.id, counters, maxItems);
    else cursorAfter = await syncContacts(connector, run.id, input.userId, counters, maxItems);
    const now = new Date();
    const completedWithErrors = counters.errors > 0;
    const runStatus = completedWithErrors ? "completed_with_errors" : "completed";
    await db
      .update(companyBrainSyncRuns)
      .set({ status: runStatus, phase: runStatus, counters, cursorAfter, completedAt: now, updatedAt: now })
      .where(eq(companyBrainSyncRuns.id, run.id));
    await db
      .update(companyBrainSourceConnectors)
      .set({
        status: "connected",
        lastSuccessfulSyncAt: completedWithErrors ? connector.lastSuccessfulSyncAt : now,
        lastError: completedWithErrors
          ? `${counters.errors} item(s) remain in the visible dead-letter queue; run Sync now to retry the blocked page.`
          : null,
        updatedAt: now,
      })
      .where(eq(companyBrainSourceConnectors.id, connector.connectorId));
    await audit({
      connector,
      userId: input.userId,
      eventType: completedWithErrors ? "workspace_sync_completed_with_errors" : "workspace_sync_completed",
      entityType: "workspace_sync_run",
      entityId: run.id,
      payload: { service: connector.service, counters, cursorAfter },
    });
    return { runId: run.id, service: connector.service, status: runStatus, counters, cursorAfter };
  } catch (error) {
    const now = new Date();
    counters.errors += 1;
    await addDeadLetter({ connector, syncRunId: run.id, stage: "sync_run", error });
    await db
      .update(companyBrainSyncRuns)
      .set({
        status: "failed",
        phase: "failed",
        counters,
        errorCode: errorCode(error),
        errorMessage: errorMessage(error).slice(0, 2000),
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(companyBrainSyncRuns.id, run.id));
    await db
      .update(companyBrainSourceConnectors)
      .set({ status: "error", lastError: errorMessage(error).slice(0, 2000), updatedAt: now })
      .where(eq(companyBrainSourceConnectors.id, connector.connectorId));
    await audit({
      connector,
      userId: input.userId,
      eventType: "workspace_sync_failed",
      entityType: "workspace_sync_run",
      entityId: run.id,
      payload: { service: connector.service, error: errorMessage(error), code: errorCode(error), counters },
    });
    throw error;
  }
}
