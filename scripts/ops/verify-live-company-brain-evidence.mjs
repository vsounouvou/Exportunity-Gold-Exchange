import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

const { Pool } = pg;

const baseUrl = String(process.env.ACCEPTANCE_BASE_URL || "https://exportunity.net").replace(/\/$/, "");
const userId = Number.parseInt(String(process.env.ACCEPTANCE_USER_ID || "58"), 10);
const tenantKey = String(process.env.ACCEPTANCE_TENANT_KEY || "exportunity").trim().toLowerCase();
const evidenceFilePath = path.resolve(String(process.env.EVIDENCE_FILE_PATH || ""));

if (process.env.ALLOW_LIVE_COMPANY_BRAIN_EVIDENCE !== "true") {
  throw new Error(
    "Set ALLOW_LIVE_COMPANY_BRAIN_EVIDENCE=true to run this governed internal evidence acceptance.",
  );
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!process.env.EVIDENCE_FILE_PATH) throw new Error("EVIDENCE_FILE_PATH is required.");
if (!Number.isInteger(userId) || userId <= 0) {
  throw new Error("ACCEPTANCE_USER_ID must be a positive integer.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const token = `brain-evidence-acceptance-${randomUUID()}`;
let sessionCreated = false;

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function parseResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function api(pathname, { method = "GET", body, authenticated = true } = {}) {
  const headers = {};
  if (authenticated) headers.authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const payload = await parseResponse(response);
  return { response, payload };
}

async function main() {
  const fileInfo = await stat(evidenceFilePath);
  expect(fileInfo.isFile() && fileInfo.size > 0, "The evidence path must reference a non-empty file.");
  expect(path.extname(evidenceFilePath).toLowerCase() === ".docx", "This acceptance expects the founder DOCX plan.");

  const tenantResult = await pool.query(
    "select id, key from tenants where lower(key) = $1 limit 1",
    [tenantKey],
  );
  const tenant = tenantResult.rows[0];
  expect(tenant?.id, `Tenant ${tenantKey} was not found.`);

  const userResult = await pool.query(
    `select id, role, roles, permissions, current_mode, is_active
       from ece_users
      where id = $1
      limit 1`,
    [userId],
  );
  const user = userResult.rows[0];
  expect(user?.id, `Staff user ${userId} was not found.`);
  expect(user.is_active !== false, `Staff user ${userId} is inactive.`);
  const roles = Array.isArray(user.roles) ? user.roles.map((value) => String(value).toLowerCase()) : [];
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  expect(
    user.current_mode === "admin" || roles.includes("admin") || permissions.includes("*") || permissions.includes("admin:*"),
    `Staff user ${userId} is not an administrator.`,
  );

  await pool.query(
    `insert into ece_sessions (user_id, token, expires_at, created_at)
     values ($1, $2, now() + interval '30 minutes', now())`,
    [userId, token],
  );
  sessionCreated = true;

  const fileBuffer = await readFile(evidenceFilePath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([fileBuffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    path.basename(evidenceFilePath),
  );
  form.append("title", "Exportunity Machinery historical business plan v4");
  form.append("businessRelevance", "company_history");
  form.append("confidentiality", "internal");
  form.append(
    "provenanceNotes",
    "Founder-provided internal historical project document. Machinery-specific evidence; it does not define Exportunity's complete current public company scope. No external publication, outreach, commitment, or communication is authorized by this upload.",
  );
  form.append("confirm", "true");

  const uploaded = await api("/api/admin/company-brain/sources/upload", {
    method: "POST",
    body: form,
  });
  expect(
    uploaded.response.status === 200 || uploaded.response.status === 201,
    `Evidence upload failed (${uploaded.response.status}): ${JSON.stringify(uploaded.payload)}`,
  );

  const result = uploaded.payload?.result || {};
  const sourceId = Number(result.sourceId || 0);
  const versionId = Number(result.versionId || 0);
  expect(sourceId > 0 && versionId > 0, "Evidence upload did not return canonical source/version identifiers.");
  expect(result.extractionStatus === "extracted", `Expected extracted text, got ${result.extractionStatus || "none"}.`);
  expect(
    result.securityStatus === "review_required" || result.securityStatus === "quarantined",
    `Unexpected evidence security state: ${result.securityStatus || "none"}.`,
  );
  expect(Number(result.claimsCreated) === 0, "Manual evidence intake created claims automatically.");

  const detail = await api(`/api/admin/company-brain/sources/${sourceId}`);
  expect(detail.response.ok, `Source detail failed (${detail.response.status}): ${JSON.stringify(detail.payload)}`);
  const source = detail.payload?.source || {};
  const version = Array.isArray(detail.payload?.versions)
    ? detail.payload.versions.find((item) => Number(item?.id) === versionId)
    : null;
  expect(source.connector_type === "manual_upload", "Evidence source is not governed as a manual upload.");
  expect(source.business_relevance === "company_history", "Evidence business relevance was not preserved.");
  expect(source.confidentiality === "internal", "Evidence confidentiality was not preserved.");
  expect(source.status === "active", "Evidence source is not active.");
  expect(version, "Canonical evidence version was not returned by the source detail endpoint.");
  expect(version.extraction_status === "extracted", "Canonical evidence version is not extracted.");
  expect(
    version.security_status === "review_required" || version.security_status === "quarantined",
    "Canonical evidence version bypassed human review.",
  );
  expect(String(version.review_preview || "").trim().length > 200, "Evidence review preview is unexpectedly empty.");
  expect(/exportunity/i.test(String(version.review_preview)), "Evidence extraction does not identify Exportunity.");
  expect(/machinery/i.test(String(version.review_preview)), "Evidence extraction does not identify the machinery project.");
  expect(!Array.isArray(detail.payload?.claims) || detail.payload.claims.length === 0, "Evidence is linked to claims before review.");

  const unauthenticated = await api(`/api/admin/company-brain/sources/${sourceId}/file`, {
    authenticated: false,
  });
  expect(
    unauthenticated.response.status === 401 || unauthenticated.response.status === 403,
    `Private evidence endpoint is reachable without admin authentication (${unauthenticated.response.status}).`,
  );

  const databaseState = await pool.query(
    `select
       s.source_url,
       sv.storage_ref,
       sv.security_status,
       (select count(*)::int from company_brain_claim_evidence ce where ce.source_id = s.id) as linked_claims,
       (select count(*)::int
          from company_brain_audit_events ae
         where ae.tenant_id = s.tenant_id
           and ae.entity_type = 'company_brain_source'
           and ae.entity_id = s.id::text
           and ae.event_type in ('source_manual_upload_created', 'source_manual_upload_reused')) as intake_audits
      from company_brain_sources s
      join company_brain_source_versions sv on sv.id = $1 and sv.source_id = s.id
     where s.id = $2 and s.tenant_id = $3
     limit 1`,
    [versionId, sourceId, Number(tenant.id)],
  );
  const state = databaseState.rows[0];
  expect(state?.storage_ref, "Private evidence storage reference is missing.");
  expect(
    state.source_url === `/api/admin/company-brain/sources/${sourceId}/file`,
    "Evidence source URL is not an admin-only endpoint.",
  );
  expect(Number(state.linked_claims || 0) === 0, "Manual evidence has claim links before human review.");
  expect(Number(state.intake_audits || 0) >= 1, "Manual evidence intake audit was not recorded.");

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant: tenant.key,
        sourceId,
        versionId,
        createdVersion: Boolean(result.createdVersion),
        extractionStatus: result.extractionStatus,
        securityStatus: result.securityStatus,
        confidentiality: source.confidentiality,
        businessRelevance: source.business_relevance,
        reviewPreviewCharacters: String(version.review_preview || "").length,
        linkedClaims: Number(state.linked_claims || 0),
        intakeAudits: Number(state.intake_audits || 0),
        publicAccessBlocked: true,
        humanReviewStillRequired: true,
        externalPublicationAuthorized: false,
        outboundCommunicationAuthorized: false,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  if (sessionCreated) await pool.query("delete from ece_sessions where token = $1", [token]);
  await pool.end();
}
