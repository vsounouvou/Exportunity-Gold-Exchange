import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import OpenAI from "openai";
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@db";
import { listTenantContacts, markStaleRunningImportBatchesFailed } from "../lib/contact/tenantContacts";
import { ensureTenantAdmin, ensureTenantStaff, isChairmanAssistantUser } from "./utils/auth";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const contactStatusValues = new Set(["lead", "warm", "customer", "vip", "dnc"]);
const consentStatusValues = new Set(["unknown", "opt_in", "opt_out"]);

const adminContactsRouter = Router();
adminContactsRouter.use(ensureTenantAdmin);

const contactsCaptureRouter = Router();
contactsCaptureRouter.use(ensureTenantStaff);

const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function parseIntSafe(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function parseLimit(value: unknown, fallback = 50, max = 500) {
  const n = parseIntSafe(value, fallback);
  if (n <= 0) return fallback;
  return Math.min(max, n);
}

function parseOffset(value: unknown, fallback = 0) {
  const n = parseIntSafe(value, fallback);
  if (n <= 0) return 0;
  return n;
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function normalizePhoneE164(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (hasPlus) return `+${digits}`;
  return digits;
}

function toArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return value
        .split(/[;,|]/g)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function uniqueStrings(values: unknown[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function splitName(name: unknown) {
  const text = String(name ?? "").trim();
  if (!text) return { givenName: "", familyName: "" };
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { givenName: parts[0] || "", familyName: "" };
  return { givenName: parts[0], familyName: parts.slice(1).join(" ") };
}

function isSuperAdmin(user: any) {
  const roles = Array.isArray(user?.roles) ? user.roles.map((item: any) => String(item || "").toLowerCase()) : [];
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  if (roles.includes("super_admin")) return true;
  if (perms.includes("*")) return true;
  if (isChairmanAssistantUser(user)) return true;
  return false;
}

function getTenant(req: any, res: any) {
  const tenant = req?.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function getRows(result: any): any[] {
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result)) return result;
  return [];
}

function getCount(result: any, field = "count") {
  const rows = getRows(result);
  const raw = rows[0]?.[field];
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  return num;
}

function parseJsonSafe(value: unknown) {
  if (value && typeof value === "object") return value as Record<string, any>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed as Record<string, any>;
    } catch {
      // ignore invalid json text
    }
  }
  return {} as Record<string, any>;
}

function parseArraySafe(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore invalid json text
    }
  }
  return [] as any[];
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toImportBatchView(row: any, nowMs = Date.now()) {
  const stats = parseJsonSafe(row?.stats);
  const errors = parseArraySafe(row?.errors);
  const totalRows = Math.max(0, Math.trunc(toFiniteNumber(stats.totalRows, 0)));
  const processedRows = Math.max(0, Math.trunc(toFiniteNumber(stats.processedRows, 0)));
  const createdContacts = Math.max(0, Math.trunc(toFiniteNumber(stats.createdContacts, 0)));
  const updatedContacts = Math.max(0, Math.trunc(toFiniteNumber(stats.updatedContacts, 0)));
  const linkedExisting = Math.max(0, Math.trunc(toFiniteNumber(stats.linkedExisting, 0)));
  const duplicatesSkipped = Math.max(0, Math.trunc(toFiniteNumber(stats.duplicatesSkipped, 0)));
  const failedRows = Math.max(0, Math.trunc(toFiniteNumber(stats.failedRows, errors.length)));
  const hasTerminalStatus = ["completed", "failed", "rolled_back"].includes(String(row?.status || "").toLowerCase());
  const progressPct = totalRows > 0 ? Math.max(0, Math.min(100, Math.round((processedRows / totalRows) * 100))) : hasTerminalStatus ? 100 : 0;
  const startedAtRaw = row?.started_at || row?.created_at || null;
  const startedAt = startedAtRaw ? new Date(startedAtRaw) : null;
  const runningForSeconds =
    String(row?.status || "").toLowerCase() === "running" && startedAt && Number.isFinite(startedAt.getTime())
      ? Math.max(0, Math.floor((nowMs - startedAt.getTime()) / 1000))
      : null;

  return {
    ...row,
    stats,
    errors,
    totalRows,
    processedRows,
    createdContacts,
    updatedContacts,
    linkedExisting,
    duplicatesSkipped,
    failedRows,
    errorCount: errors.length,
    progressPct,
    runningForSeconds,
    fileName: typeof stats.fileName === "string" ? stats.fileName : null,
  };
}

function statusOrDefault(value: unknown, fallback: string) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (contactStatusValues.has(raw)) return raw;
  return fallback;
}

function consentOrDefault(value: unknown, fallback: string) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (consentStatusValues.has(raw)) return raw;
  return fallback;
}

function parseJsonFromText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const fenced = trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(fenced);
  } catch {
    return {};
  }
}

async function syncContactTags(tenantId: number, contactId: number, tags: string[]) {
  await db.execute(sql`
    insert into tenant_contacts (tenant_id, contact_id, scope, status, tags, created_at, updated_at)
    values (${tenantId}, ${contactId}, 'tenant_shared'::tenant_contact_scope, 'active'::tenant_contact_status, ${JSON.stringify(tags)}::jsonb, now(), now())
    on conflict (tenant_id, contact_id) do update
    set tags = excluded.tags, updated_at = now()
  `);
  await db.execute(sql`delete from contact_tags where tenant_id = ${tenantId} and contact_id = ${contactId}`);
  for (const tag of tags) {
    await db.execute(sql`insert into contact_tags (tenant_id, contact_id, tag, created_at) values (${tenantId}, ${contactId}, ${tag}, now())`);
  }
}

async function syncContactIdentities(tenantId: number, contactId: number, emails: string[], phones: string[]) {
  await db.execute(sql`delete from contact_identities where tenant_id = ${tenantId} and contact_id = ${contactId}`);
  const normalizedEmails = uniqueStrings(emails.map((entry) => normalizeEmail(entry)).filter(Boolean));
  const normalizedPhones = uniqueStrings(phones.map((entry) => normalizePhoneE164(entry)).filter(Boolean));

  for (let index = 0; index < normalizedEmails.length; index += 1) {
    const email = normalizedEmails[index];
    await db.execute(sql`
      insert into contact_identities (tenant_id, contact_id, kind, value, value_normalized, is_primary, created_at)
      values (${tenantId}, ${contactId}, 'email', ${email}, ${email}, ${index === 0}, now())
      on conflict (tenant_id, kind, value_normalized) do update
      set contact_id = excluded.contact_id, value = excluded.value, is_primary = excluded.is_primary
    `);
  }

  for (let index = 0; index < normalizedPhones.length; index += 1) {
    const phone = normalizedPhones[index];
    await db.execute(sql`
      insert into contact_identities (tenant_id, contact_id, kind, value, value_normalized, is_primary, created_at)
      values (${tenantId}, ${contactId}, 'phone', ${phone}, ${phone}, ${index === 0}, now())
      on conflict (tenant_id, kind, value_normalized) do update
      set contact_id = excluded.contact_id, value = excluded.value, is_primary = excluded.is_primary
    `);
  }
}

async function claimLegacyContacts(tenantId: number, force: boolean) {
  const tenantRows = await db.execute(sql`select id from tenants limit 2`);
  const tenantCount = getRows(tenantRows).length;
  if (tenantCount > 1 && force) {
    return {
      claimed: 0,
      importedFromLeads: 0,
      blocked: true,
      message: "Multiple tenants detected; force-claim is disabled to prevent cross-tenant leakage.",
    };
  }

  const insertResult = await db.execute(sql`
    insert into tenant_contacts (tenant_id, contact_id, scope, status, tags, notes, crm_status, consent_status, is_dnc, created_at, updated_at)
    select
      ${tenantId},
      c.id,
      'tenant_shared'::tenant_contact_scope,
      'active'::tenant_contact_status,
      coalesce(c.tags, '[]'::jsonb),
      c.notes,
      coalesce(c.status, 'lead'::contact_status),
      coalesce(c.consent_status, 'unknown'::contact_consent_status),
      coalesce(c.is_dnc, false),
      now(),
      now()
    from contacts c
    where not exists (
      select 1 from tenant_contacts tc where tc.tenant_id = ${tenantId} and tc.contact_id = c.id
    )
    and (
      c.tenant_id = ${tenantId}
      or c.created_by_user_id in (select user_id from user_tenant_roles where tenant_id = ${tenantId})
      or exists (select 1 from contact_import_rows r where r.tenant_id = ${tenantId} and r.contact_id = c.id)
      or (coalesce(c.imported_from_wix, false) = true and (c.tenant_id = ${tenantId} or c.tenant_id is null))
      ${force && tenantCount === 1 ? sql`or c.tenant_id is null` : sql``}
    )
  `);
  const claimed = Number((insertResult as any)?.rowCount || 0);

  console.log("[contacts:claim-legacy(admin)]", { tenantId, force, claimed });

  return { claimed, importedFromLeads: 0, blocked: false, message: null };
}

function inferExt(mimeType: string, originalName: string) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  return path.extname(originalName || "") || ".bin";
}

async function persistCaptureFile(file: Express.Multer.File) {
  const assetRoot = process.env.ASSET_BASE_PATH || process.env.ASSET_ROOT || path.resolve(process.cwd(), "uploads");
  const publicPath = process.env.ASSET_PUBLIC_PATH || "/assets";
  const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const ext = inferExt(file.mimetype, file.originalname);
  const fileName = `${hash}${ext}`;
  const dir = path.join(assetRoot, "contact-cards");
  const abs = path.join(dir, fileName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(abs, file.buffer);
  const url = `${publicPath.replace(/\/+$/, "")}/contact-cards/${fileName}`.replace(/\\/g, "/");
  return { fileUrl: url };
}

async function extractBusinessCard(file: Express.Multer.File) {
  const fallback = {
    name: "",
    company: "",
    jobTitle: "",
    phones: [] as string[],
    emails: [] as string[],
    website: "",
    address: "",
    notes: "",
    confidence: 0.25,
    engine: "fallback",
  };
  if (!openaiClient) return fallback;

  try {
    const content = await openaiClient.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: "Extract structured contact data from business-card images. Return JSON only." },
        {
          role: "user",
          content: [
            { type: "text", text: "Return JSON: {name,company,jobTitle,phones[],emails[],website,address,notes,confidence}." },
            { type: "image_url", image_url: { url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}` } },
          ],
        },
      ] as any,
    } as any);
    const parsed = parseJsonFromText(String(content?.choices?.[0]?.message?.content || ""));
    return {
      name: String((parsed as any)?.name || "").trim(),
      company: String((parsed as any)?.company || "").trim(),
      jobTitle: String((parsed as any)?.jobTitle || "").trim(),
      phones: uniqueStrings(toArray((parsed as any)?.phones).map((entry) => normalizePhoneE164(entry)).filter(Boolean)),
      emails: uniqueStrings(toArray((parsed as any)?.emails).map((entry) => normalizeEmail(entry)).filter(Boolean)),
      website: String((parsed as any)?.website || "").trim(),
      address: String((parsed as any)?.address || "").trim(),
      notes: String((parsed as any)?.notes || "").trim(),
      confidence: Math.max(0, Math.min(1, Number((parsed as any)?.confidence || 0.6))),
      engine: "openai_vision",
    };
  } catch (error: any) {
    return { ...fallback, notes: `Vision fallback: ${error?.message || "failed"}` };
  }
}

async function upsertContactFromCapture(tenantId: number, extracted: any, attachmentUrl: string, tags: string[], createdByUserId: number | null) {
  const email = normalizeEmail(extracted?.emails?.[0] || "");
  const phone = normalizePhoneE164(extracted?.phones?.[0] || "");
  const nameParts = splitName(extracted?.name || "");

  const existingResult = await db.execute(sql`
    select c.*, tc.tags as tenant_tags, tc.notes as tenant_notes
    from tenant_contacts tc
    join contacts c on c.id = tc.contact_id
    where tc.tenant_id = ${tenantId}
      and (
        (${email} <> '' and lower(coalesce(c.primary_email, c.email, '')) = ${email})
        or (${phone} <> '' and coalesce(c.primary_phone_e164, c.phone_normalized, '') = ${phone})
      )
    order by c.created_at asc nulls last, c.id asc
    limit 1
  `);
  const existing = getRows(existingResult)[0];
  const emails = uniqueStrings([...(toArray(existing?.emails) as any[]), ...(toArray(extracted?.emails) as any[]), existing?.email, email].filter(Boolean).map(normalizeEmail).filter(Boolean));
  const phones = uniqueStrings([...(toArray(existing?.phones) as any[]), ...(toArray(extracted?.phones) as any[]), existing?.phone_normalized, phone].filter(Boolean).map(normalizePhoneE164).filter(Boolean));
  const mergedTags = uniqueStrings([...(toArray(existing?.tenant_tags ?? existing?.tags) as any[]), ...tags, "business_card"]);
  const notes = uniqueStrings([String(existing?.tenant_notes || existing?.notes || ""), String(extracted?.notes || ""), `Capture attachment: ${attachmentUrl}`]).join("\n");

  if (existing) {
    await db.execute(sql`
      update contacts
      set
        display_name = ${String(existing.display_name || extracted?.name || "").trim() || null},
        given_name = ${String(existing.given_name || nameParts.givenName || "").trim() || null},
        family_name = ${String(existing.family_name || nameParts.familyName || "").trim() || null},
        first_name = ${String(existing.first_name || nameParts.givenName || "").trim() || null},
        last_name = ${String(existing.last_name || nameParts.familyName || "").trim() || null},
        company = ${String(existing.company || extracted?.company || "").trim() || null},
        job_title = ${String(existing.job_title || extracted?.jobTitle || "").trim() || null},
        emails = ${JSON.stringify(emails)}::jsonb,
        phones = ${JSON.stringify(phones)}::jsonb,
        primary_email = ${email || String(existing.primary_email || existing.email || "").trim() || null},
        primary_phone_e164 = ${phone || String(existing.primary_phone_e164 || existing.phone_normalized || "").trim() || null},
        email = ${email || String(existing.email || "").trim() || null},
        phone = ${String(existing.phone || extracted?.phones?.[0] || "").trim() || null},
        phone_normalized = ${phone || String(existing.phone_normalized || "").trim() || null},
        created_by_user_id = ${createdByUserId || existing.created_by_user_id || null},
        updated_at = now()
      where id = ${existing.id}
    `);
    await syncContactTags(tenantId, Number(existing.id), mergedTags);
    await db.execute(sql`
      update tenant_contacts
      set notes = ${notes || null}, updated_at = now()
      where tenant_id = ${tenantId} and contact_id = ${Number(existing.id)}
    `);
    await syncContactIdentities(tenantId, Number(existing.id), emails, phones);
    return { contactId: Number(existing.id), created: false };
  }

  const insertResult = await db.execute(sql`
    insert into contacts (
      display_name, given_name, family_name, first_name, last_name, company, job_title,
      emails, phones, primary_email, primary_phone_e164, email, phone, phone_normalized,
      source, source_system, metadata, created_by_user_id, created_at, updated_at
    ) values (
      ${String(extracted?.name || "").trim() || null}, ${nameParts.givenName || null}, ${nameParts.familyName || null},
      ${nameParts.givenName || null}, ${nameParts.familyName || null}, ${String(extracted?.company || "").trim() || null},
      ${String(extracted?.jobTitle || "").trim() || null},
      ${JSON.stringify(emails)}::jsonb, ${JSON.stringify(phones)}::jsonb, ${email || null}, ${phone || null},
      ${email || null}, ${String(extracted?.phones?.[0] || "").trim() || null}, ${phone || null},
      'capture', 'manual', jsonb_build_object('capture_attachment', ${attachmentUrl}), ${createdByUserId || null}, now(), now()
    )
    returning id
  `);
  const contactId = Number(getRows(insertResult)[0]?.id || 0);
  if (contactId) {
    await syncContactTags(tenantId, contactId, mergedTags);
    await db.execute(sql`
      update tenant_contacts
      set notes = ${notes || null}, updated_at = now()
      where tenant_id = ${tenantId} and contact_id = ${contactId}
    `);
    await syncContactIdentities(tenantId, contactId, emails, phones);
  }
  return { contactId, created: true };
}

async function runCapture(req: any, res: any) {
  const tenant = getTenant(req, res);
  if (!tenant) return;
  const files = Array.isArray(req.files) ? req.files : [];
  const file = files[0] as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ message: "Upload one image under `file`." });

  const { fileUrl } = await persistCaptureFile(file);
  const extracted = await extractBusinessCard(file);
  const tags = uniqueStrings([...toArray(req.body?.tags), "business_card"]);
  const save = String(req.body?.save || "").toLowerCase() === "true";

  let contactId: number | null = null;
  let created = false;
  if (save) {
    const actorId = Number(req.staffUser?.id || req.adminUser?.id || 0);
    const upsert = await upsertContactFromCapture(tenant.id, extracted, fileUrl, tags, Number.isFinite(actorId) && actorId > 0 ? actorId : null);
    contactId = upsert.contactId;
    created = upsert.created;
  }

  const attachmentResult = await db.execute(sql`
    insert into contact_attachments (tenant_id, contact_id, type, file_url, extracted_json, created_at)
    values (${tenant.id}, ${contactId}, 'business_card', ${fileUrl}, ${JSON.stringify(extracted)}::jsonb, now())
    returning id
  `);

  return res.json({
    ok: true,
    attachmentId: Number(getRows(attachmentResult)[0]?.id || 0),
    fileUrl,
    extracted,
    saved: save,
    created,
    contactId,
  });
}

adminContactsRouter.get("/contacts/diagnostics", async (req: any, res) => {
  try {
    if (!isSuperAdmin(req.adminUser)) {
      return res.status(403).json({ message: "Super-admin diagnostics access required." });
    }
    const tenant = getTenant(req, res);
    if (!tenant) return;

    const total = await db.execute(sql`select count(*)::int as count from contacts`);
    const byTenant = await db.execute(sql`
      select tc.tenant_id, t.key as tenant_key, t.name as tenant_name, count(*)::int as count
      from tenant_contacts tc
      left join tenants t on t.id = tc.tenant_id
      group by tc.tenant_id, t.key, t.name
      order by count desc, tc.tenant_id asc nulls first
    `);
    const bySource = await db.execute(sql`
      select coalesce(source_system, 'unknown') as source_system, coalesce(source, 'unknown') as source, count(*)::int as count
      from contacts
      group by coalesce(source_system, 'unknown'), coalesce(source, 'unknown')
      order by count desc
    `);
    const byBatch = await db.execute(sql`
      select r.batch_id as import_batch_id, count(distinct r.contact_id)::int as count
      from contact_import_rows r
      where r.contact_id is not null
      group by r.batch_id
      order by count desc, r.batch_id desc
      limit 20
    `);
    const currentTenantCount = await db.execute(sql`select count(*)::int as count from tenant_contacts where tenant_id = ${tenant.id}`);
    const unscopedCount = await db.execute(sql`
      select count(*)::int as count
      from contacts c
      where not exists (select 1 from tenant_contacts tc where tc.contact_id = c.id)
    `);
    const wixLeadsCount = await db.execute(sql`select count(*)::int as count from leads where coalesce(metadata->>'imported_from_wix', 'false') = 'true'`);
    const timeBounds = await db.execute(sql`select min(created_at) as earliest_created_at, max(created_at) as latest_created_at from contacts`);
    const sampleRows = await db.execute(sql`
      select
        c.id,
        c.tenant_id,
        coalesce(c.display_name, trim(concat_ws(' ', c.given_name, c.family_name)), trim(concat_ws(' ', c.first_name, c.last_name))) as name,
        coalesce(c.primary_email, c.email) as email,
        coalesce(c.primary_phone_e164, c.phone_normalized, c.phone) as phone,
        c.source_system,
        c.source,
        c.status,
        c.consent_status,
        c.imported_from_wix,
        c.import_batch_id,
        c.created_at
      from contacts c
      order by c.created_at desc nulls last
      limit 20
    `);

    const hint =
      getCount(currentTenantCount) === 0 && (getCount(unscopedCount) > 0 || getCount(wixLeadsCount) > 0)
        ? "No contacts are currently scoped to this tenant; run claim-legacy migration."
        : null;

    return res.json({
      ok: true,
      currentTenantId: tenant.id,
      totals: {
        allContacts: getCount(total),
        currentTenantContacts: getCount(currentTenantCount),
        unscopedContacts: getCount(unscopedCount),
        wixLeadsLegacy: getCount(wixLeadsCount),
        earliestCreatedAt: getRows(timeBounds)[0]?.earliest_created_at || null,
        latestCreatedAt: getRows(timeBounds)[0]?.latest_created_at || null,
      },
      byTenant: getRows(byTenant),
      bySource: getRows(bySource),
      byBatch: getRows(byBatch),
      sample: getRows(sampleRows),
      hint,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to run diagnostics" });
  }
});

adminContactsRouter.post("/contacts/migrations/claim-legacy", async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const force = String(req.body?.force || "").toLowerCase() === "true";
    const result = await claimLegacyContacts(tenant.id, force);
    if (result.blocked) return res.status(409).json({ ok: false, requiresForce: true, message: result.message });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to claim legacy contacts" });
  }
});

adminContactsRouter.get("/contacts/imports", async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const staleFailed = await markStaleRunningImportBatchesFailed({ tenantId: tenant.id });
    const limit = parseLimit(req.query?.limit, 50, 200);
    const rows = await db.execute(sql`
      select * from contact_import_batches
      where tenant_id = ${tenant.id}
      order by created_at desc
      limit ${limit}
    `);
    const nowMs = Date.now();
    return res.json({ ok: true, staleFailed, items: getRows(rows).map((row) => toImportBatchView(row, nowMs)) });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to list import batches" });
  }
});

adminContactsRouter.post("/contacts/imports/:batchId/rollback", async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const batchId = parseIntSafe(req.params?.batchId, 0);
    if (!batchId) return res.status(400).json({ message: "Invalid batchId" });

    const batch = getRows(
      await db.execute(sql`select id from contact_import_batches where id = ${batchId} and tenant_id = ${tenant.id} limit 1`),
    )[0];
    if (!batch) return res.status(404).json({ message: "Import batch not found" });

    const contactIdRows = getRows(
      await db.execute(sql`
        select distinct contact_id
        from contact_import_rows
        where batch_id = ${batchId} and tenant_id = ${tenant.id} and contact_id is not null
      `),
    );
    const contactIds = contactIdRows.map((row) => Number(row.contact_id)).filter((id) => Number.isFinite(id) && id > 0);

    let unlinked = 0;
    if (contactIds.length) {
      const deleteResult = await db.execute(sql`
        delete from tenant_contacts
        where tenant_id = ${tenant.id}
          and contact_id in (${sql.join(contactIds.map((id) => sql`${id}`), sql`, `)})
      `);
      unlinked = Number((deleteResult as any)?.rowCount || 0);
    }

    await db.execute(sql`
      update contact_import_batches
      set status = 'rolled_back'::contact_import_status,
          updated_at = now(),
          completed_at = now(),
          stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('rolledBackTenantLinks', ${unlinked})
      where id = ${batchId} and tenant_id = ${tenant.id}
    `);

    return res.json({ ok: true, batchId, unlinkedContacts: unlinked });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to rollback import batch" });
  }
});

adminContactsRouter.get("/contacts", async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;

    const q = String(req.query?.q || "").trim();
    const source = String(req.query?.source || "").trim();
    const status = statusOrDefault(req.query?.status, "");
    const consent = consentOrDefault(req.query?.consent, "");
    const tag = String(req.query?.tag || "").trim();
    const hasWhatsapp = String(req.query?.hasWhatsapp || "").trim().toLowerCase();
    const limit = parseLimit(req.query?.limit, 50, 250);
    const offset = parseOffset(req.query?.offset, 0);

    const result = await listTenantContacts({
      tenantId: tenant.id,
      q,
      source,
      status,
      consent,
      tag,
      hasWhatsapp,
      limit,
      offset,
      includeArchived: false,
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to list contacts" });
  }
});

adminContactsRouter.patch("/contacts/:id", async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const id = parseIntSafe(req.params?.id, 0);
    if (!id) return res.status(400).json({ message: "Invalid contact id" });
    const current = getRows(await db.execute(sql`
      select
        c.*,
        tc.tags as tenant_tags,
        tc.notes as tenant_notes,
        tc.crm_status as tenant_crm_status,
        tc.consent_status as tenant_consent_status,
        tc.is_dnc as tenant_is_dnc
      from tenant_contacts tc
      join contacts c on c.id = tc.contact_id
      where tc.tenant_id = ${tenant.id} and tc.contact_id = ${id}
      limit 1
    `))[0];
    if (!current) return res.status(404).json({ message: "Contact not found" });

    const displayName = String(req.body?.displayName ?? current.display_name ?? "").trim();
    const givenName = String(req.body?.givenName ?? current.given_name ?? current.first_name ?? "").trim();
    const familyName = String(req.body?.familyName ?? current.family_name ?? current.last_name ?? "").trim();
    const company = String(req.body?.company ?? current.company ?? "").trim();
    const jobTitle = String(req.body?.jobTitle ?? current.job_title ?? "").trim();
    const emails = uniqueStrings(toArray(req.body?.emails ?? current.emails).map((item) => normalizeEmail(item)).filter(Boolean));
    const phones = uniqueStrings(toArray(req.body?.phones ?? current.phones).map((item) => normalizePhoneE164(item)).filter(Boolean));
    const primaryEmail = normalizeEmail(req.body?.primaryEmail ?? emails[0] ?? current.primary_email ?? current.email ?? "");
    const primaryPhone = normalizePhoneE164(req.body?.primaryPhoneE164 ?? phones[0] ?? current.primary_phone_e164 ?? current.phone_normalized ?? "");
    const tags = uniqueStrings(toArray(req.body?.tags ?? current.tenant_tags ?? current.tags));
    const status = statusOrDefault(req.body?.status, String(current.tenant_crm_status || current.status || "lead"));
    const consent = consentOrDefault(req.body?.consentStatus, String(current.tenant_consent_status || current.consent_status || "unknown"));
    const notes = String(req.body?.notes ?? current.tenant_notes ?? current.notes ?? "").trim();
    const source = String(req.body?.source ?? current.source ?? "").trim();
    const sourceSystem = String(req.body?.sourceSystem ?? current.source_system ?? "").trim() || "manual";
    const isDnc = Boolean(req.body?.isDnc ?? current.tenant_is_dnc ?? current.is_dnc ?? status === "dnc");

    await db.execute(sql`
      update contacts
      set
        display_name = ${displayName || null},
        given_name = ${givenName || null},
        family_name = ${familyName || null},
        first_name = ${givenName || null},
        last_name = ${familyName || null},
        company = ${company || null},
        job_title = ${jobTitle || null},
        emails = ${JSON.stringify(emails)}::jsonb,
        phones = ${JSON.stringify(phones)}::jsonb,
        primary_email = ${primaryEmail || null},
        primary_phone_e164 = ${primaryPhone || null},
        email = ${primaryEmail || null},
        phone = ${phones[0] || null},
        phone_normalized = ${primaryPhone || null},
        source = ${source || null},
        source_system = ${sourceSystem},
        updated_at = now()
      where id = ${id}
    `);

    await db.execute(sql`
      update tenant_contacts
      set
        notes = ${notes || null},
        crm_status = ${status}::contact_status,
        consent_status = ${consent}::contact_consent_status,
        is_dnc = ${isDnc},
        updated_at = now()
      where tenant_id = ${tenant.id} and contact_id = ${id}
    `);
    await syncContactTags(tenant.id, id, tags);
    await syncContactIdentities(tenant.id, id, emails, phones);
    return res.json({ ok: true, id });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to update contact" });
  }
});

adminContactsRouter.get("/contacts/:id/merge-suggestions", async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const id = parseIntSafe(req.params?.id, 0);
    if (!id) return res.status(400).json({ message: "Invalid contact id" });
    const current = getRows(await db.execute(sql`
      select c.id, lower(coalesce(c.primary_email, c.email, '')) as email_key, coalesce(c.primary_phone_e164, c.phone_normalized, '') as phone_key
      from tenant_contacts tc
      join contacts c on c.id = tc.contact_id
      where tc.tenant_id = ${tenant.id} and tc.contact_id = ${id}
      limit 1
    `))[0];
    if (!current) return res.status(404).json({ message: "Contact not found" });
    const items = getRows(await db.execute(sql`
      select c.id,
             coalesce(c.display_name, trim(concat_ws(' ', c.given_name, c.family_name)), trim(concat_ws(' ', c.first_name, c.last_name)), 'Unnamed Contact') as display_name,
             coalesce(c.primary_email, c.email) as primary_email,
             coalesce(c.primary_phone_e164, c.phone_normalized, c.phone) as primary_phone_e164,
             tc.crm_status as status,
             tc.updated_at
      from tenant_contacts tc
      join contacts c on c.id = tc.contact_id
      where tc.tenant_id = ${tenant.id} and tc.contact_id <> ${id} and tc.status <> 'archived'::tenant_contact_status
        and (
          (${String(current.email_key || "")} <> '' and lower(coalesce(c.primary_email, c.email, '')) = ${String(current.email_key || "")})
          or (${String(current.phone_key || "")} <> '' and coalesce(c.primary_phone_e164, c.phone_normalized, '') = ${String(current.phone_key || "")})
        )
      order by tc.updated_at desc nulls last, c.id desc
      limit 20
    `));
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch merge suggestions" });
  }
});

adminContactsRouter.post("/contacts/:id/merge", async (req: any, res) => {
  try {
    const tenant = getTenant(req, res);
    if (!tenant) return;
    const primaryId = parseIntSafe(req.params?.id, 0);
    const secondaryId = parseIntSafe(req.body?.secondaryContactId, 0);
    if (!primaryId || !secondaryId || primaryId === secondaryId) return res.status(400).json({ message: "Invalid merge ids" });

    const sharedLinks = getRows(await db.execute(sql`
      select contact_id, count(*)::int as other_count
      from tenant_contacts
      where contact_id in (${primaryId}, ${secondaryId}) and tenant_id <> ${tenant.id}
      group by contact_id
    `));
    if (sharedLinks.length > 0) {
      return res.status(409).json({ message: "Cannot merge contacts linked to other tenants. Unlink or archive the duplicate instead." });
    }

    const rows = getRows(await db.execute(sql`
      select
        c.*,
        tc.tags as tenant_tags,
        tc.notes as tenant_notes,
        tc.crm_status as tenant_crm_status,
        tc.consent_status as tenant_consent_status,
        tc.is_dnc as tenant_is_dnc
      from tenant_contacts tc
      join contacts c on c.id = tc.contact_id
      where tc.tenant_id = ${tenant.id} and tc.contact_id in (${primaryId}, ${secondaryId})
    `));
    const primary = rows.find((row) => Number(row.id) === primaryId);
    const secondary = rows.find((row) => Number(row.id) === secondaryId);
    if (!primary || !secondary) return res.status(404).json({ message: "Contact(s) not found" });

    const emails = uniqueStrings([...toArray(primary.emails), ...toArray(secondary.emails), primary.primary_email, primary.email, secondary.primary_email, secondary.email].filter(Boolean)).map(normalizeEmail).filter(Boolean);
    const phones = uniqueStrings([...toArray(primary.phones), ...toArray(secondary.phones), primary.primary_phone_e164, primary.phone_normalized, primary.phone, secondary.primary_phone_e164, secondary.phone_normalized, secondary.phone].filter(Boolean)).map(normalizePhoneE164).filter(Boolean);
    const tags = uniqueStrings([...toArray(primary.tenant_tags ?? primary.tags), ...toArray(secondary.tenant_tags ?? secondary.tags)]);
    const notes = uniqueStrings([String(primary.tenant_notes || primary.notes || ""), String(secondary.tenant_notes || secondary.notes || "")]).join("\n\n");
    const mergedStatus = statusOrDefault(primary.tenant_crm_status || secondary.tenant_crm_status, "lead");
    const mergedConsent = consentOrDefault(primary.tenant_consent_status || secondary.tenant_consent_status, "unknown");
    const mergedIsDnc = Boolean(primary.tenant_is_dnc || secondary.tenant_is_dnc || mergedStatus === "dnc");

    await db.execute(sql`
      update contacts
      set
        display_name = ${String(primary.display_name || secondary.display_name || "").trim() || null},
        given_name = ${String(primary.given_name || primary.first_name || secondary.given_name || secondary.first_name || "").trim() || null},
        family_name = ${String(primary.family_name || primary.last_name || secondary.family_name || secondary.last_name || "").trim() || null},
        first_name = ${String(primary.first_name || primary.given_name || secondary.first_name || secondary.given_name || "").trim() || null},
        last_name = ${String(primary.last_name || primary.family_name || secondary.last_name || secondary.family_name || "").trim() || null},
        emails = ${JSON.stringify(emails)}::jsonb,
        phones = ${JSON.stringify(phones)}::jsonb,
        primary_email = ${normalizeEmail(primary.primary_email || primary.email || emails[0] || secondary.primary_email || secondary.email || "") || null},
        primary_phone_e164 = ${normalizePhoneE164(primary.primary_phone_e164 || primary.phone_normalized || phones[0] || secondary.primary_phone_e164 || secondary.phone_normalized || "") || null},
        email = ${normalizeEmail(primary.email || emails[0] || secondary.email || "") || null},
        phone = ${String(primary.phone || phones[0] || secondary.phone || "").trim() || null},
        phone_normalized = ${normalizePhoneE164(primary.phone_normalized || phones[0] || secondary.phone_normalized || "") || null},
        source = ${String(primary.source || secondary.source || "").trim() || null},
        source_system = ${String(primary.source_system || secondary.source_system || "manual")},
        metadata = coalesce(contacts.metadata, '{}'::jsonb) || jsonb_build_object('merged_from_contact_id', ${secondaryId}, 'merged_at', now()),
        updated_at = now()
      where id = ${primaryId}
    `);

    await db.execute(sql`
      update tenant_contacts
      set
        notes = ${notes || null},
        crm_status = ${mergedStatus}::contact_status,
        consent_status = ${mergedConsent}::contact_consent_status,
        is_dnc = ${mergedIsDnc},
        updated_at = now()
      where tenant_id = ${tenant.id} and contact_id = ${primaryId}
    `);

    await db.execute(sql`update contact_sources set contact_id = ${primaryId}, tenant_id = ${tenant.id} where contact_id = ${secondaryId} and (tenant_id = ${tenant.id} or tenant_id is null)`);
    await db.execute(sql`update contact_tags set contact_id = ${primaryId}, tenant_id = ${tenant.id} where contact_id = ${secondaryId} and (tenant_id = ${tenant.id} or tenant_id is null)`);
    await db.execute(sql`update contact_attachments set contact_id = ${primaryId} where tenant_id = ${tenant.id} and contact_id = ${secondaryId}`);
    await db.execute(sql`delete from tenant_contacts where tenant_id = ${tenant.id} and contact_id = ${secondaryId}`);
    await db.execute(sql`delete from contacts where id = ${secondaryId}`);
    await syncContactTags(tenant.id, primaryId, tags);
    await syncContactIdentities(tenant.id, primaryId, emails, phones);

    return res.json({ ok: true, primaryId, mergedFrom: secondaryId });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to merge contacts" });
  }
});

adminContactsRouter.post("/contacts/capture", upload.any(), runCapture);
contactsCaptureRouter.post("/capture", upload.any(), runCapture);

export { contactsCaptureRouter };
export default adminContactsRouter;
