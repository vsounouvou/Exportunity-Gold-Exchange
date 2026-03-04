import { sql } from "drizzle-orm";
import { db } from "@db";

export type TenantContactRow = {
  id: number;
  displayName: string;
  company: string | null;
  jobTitle: string | null;
  phones: string[];
  emails: string[];
  primaryPhoneE164: string | null;
  primaryEmail: string | null;
  tags: string[];
  status: string;
  consentStatus: string;
  isDnc: boolean;
  source: string | null;
  sourceSystem: string | null;
  notes: string | null;
  hasWhatsapp: boolean;
  lastInteractionAt: string | null;
  lastOutreachAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TenantContactsListResponse = {
  ok: true;
  items: TenantContactRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type TenantContactsDiagnostics = {
  ok: true;
  tenantId: number;
  totals: {
    contactsTotal: number;
    tenantContactsTotal: number;
    orphanContactsCreatedByMe: number;
    wrongTenantLinksCreatedByMe: number;
    stagingRowsPending: number;
  };
};

export type CsvImportSummary = {
  ok: true;
  batchId: number;
  totalRows: number;
  createdContacts: number;
  updatedContacts: number;
  linkedExisting: number;
  duplicatesSkipped: number;
  errors: Array<{ row: number; message: string }>;
};

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

const STALE_IMPORT_BATCH_MINUTES_DEFAULT = 45;

export async function markStaleRunningImportBatchesFailed(args: {
  tenantId: number;
  olderThanMinutes?: number;
}) {
  const minutesRaw = Number(args.olderThanMinutes ?? STALE_IMPORT_BATCH_MINUTES_DEFAULT);
  const olderThanMinutes = Number.isFinite(minutesRaw)
    ? Math.max(5, Math.min(24 * 60, Math.trunc(minutesRaw)))
    : STALE_IMPORT_BATCH_MINUTES_DEFAULT;
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);

  const staleError = `Import batch auto-failed after exceeding ${olderThanMinutes} minutes in running state.`;

  const updateResult = await db.execute(sql`
    update contact_import_batches
    set
      status = 'failed'::contact_import_status,
      completed_at = coalesce(completed_at, now()),
      updated_at = now(),
      stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
        'autoFailedStaleMinutes',
        ${olderThanMinutes}::int,
        'autoFailedAt',
        now()
      ),
      errors = coalesce(errors, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'row',
          0,
          'message',
          ${staleError}::text
        )
      )
    where tenant_id = ${args.tenantId}
      and status = 'running'::contact_import_status
      and coalesce(started_at, created_at) <= ${cutoff}
  `);

  const failedCount = Number((updateResult as any)?.rowCount || 0);
  if (failedCount > 0) {
    console.warn("[contacts:import:stale-batches]", {
      tenantId: args.tenantId,
      failedCount,
      olderThanMinutes,
    });
  }
  return failedCount;
}

function toArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  return [];
}

export function normalizeEmail(value: unknown) {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

export function normalizePhone(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

export function uniqueStrings(values: unknown[]) {
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

export function buildDedupeKey(args: { email?: unknown; phone?: unknown }) {
  const email = normalizeEmail(args.email);
  if (email) return `email:${email}`;
  const phone = normalizePhone(args.phone);
  if (phone) return `phone:${phone}`;
  return null;
}

function normalizeHeader(header: unknown) {
  return String(header ?? "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function detectDelimiter(sampleLine: string) {
  const line = String(sampleLine ?? "");
  const counts = [
    { d: ",", c: (line.match(/,/g) || []).length },
    { d: ";", c: (line.match(/;/g) || []).length },
    { d: "\t", c: (line.match(/\t/g) || []).length },
  ].sort((a, b) => b.c - a.c);
  return counts[0]?.c > 0 ? counts[0]!.d : ",";
}

function parseCsv(text: string, delimiter: string) {
  const rows: string[][] = [];
  let value = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushValue = () => {
    row.push(value);
    value = "";
  };

  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      pushValue();
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      pushValue();
      pushRow();
      continue;
    }

    value += ch;
  }

  if (value.length > 0 || row.length > 0) {
    pushValue();
    pushRow();
  }

  return rows.filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""));
}

function readCsvObjects(raw: string): Array<Record<string, string>> {
  const firstLine = raw.split(/\r?\n/, 1)[0] || "";
  const delimiter = detectDelimiter(firstLine);
  const parsed = parseCsv(raw, delimiter);
  if (!parsed.length) return [];

  const headerRaw = parsed[0] || [];
  const headers: string[] = [];
  const seen = new Map<string, number>();
  for (const header of headerRaw) {
    const base = normalizeHeader(header);
    const index = (seen.get(base) || 0) + 1;
    seen.set(base, index);
    headers.push(index > 1 ? `${base}_${index}` : base);
  }

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < parsed.length; i += 1) {
    const source = parsed[i]!;
    const out: Record<string, string> = {};
    for (let h = 0; h < headers.length; h += 1) {
      const key = headers[h]!;
      out[key] = String(source[h] ?? "").trim();
    }
    rows.push(out);
  }
  return rows;
}

function collectValues(row: Record<string, string>, keys: string[]) {
  const out: string[] = [];
  for (const [rawKey, rawValue] of Object.entries(row || {})) {
    const value = String(rawValue ?? "").trim();
    if (!value) continue;
    for (const key of keys) {
      if (rawKey === key || rawKey.startsWith(`${key}_`) || rawKey.startsWith(key)) {
        out.push(value);
        break;
      }
    }
  }
  return uniqueStrings(out);
}

function firstValue(row: Record<string, string>, keys: string[]) {
  return collectValues(row, keys)[0] || "";
}

function splitName(name: unknown) {
  const text = String(name ?? "").trim();
  if (!text) return { givenName: "", familyName: "" };
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { givenName: parts[0] || "", familyName: "" };
  return { givenName: parts[0]!, familyName: parts.slice(1).join(" ") };
}

function asNullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

async function findContactIdByDedupeKey(tx: any, dedupeKey: string) {
  const row = getRows(await tx.execute(sql`select id from contacts where dedupe_key = ${dedupeKey} limit 1`))[0];
  const id = Number(row?.id || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function findContactIdByPrimaryIdentity(tx: any, args: { email?: string; phone?: string }) {
  const email = normalizeEmail(args.email);
  const phone = normalizePhone(args.phone);

  if (email) {
    const row = getRows(
      await tx.execute(sql`
        select id
        from contacts
        where lower(coalesce(primary_email, email, '')) = ${email}
        order by created_at asc nulls last, id asc
        limit 1
      `),
    )[0];
    const id = Number(row?.id || 0);
    if (Number.isFinite(id) && id > 0) return id;
  }

  if (phone) {
    const row = getRows(
      await tx.execute(sql`
        select id
        from contacts
        where coalesce(primary_phone_e164, phone_normalized, '') = ${phone}
        order by created_at asc nulls last, id asc
        limit 1
      `),
    )[0];
    const id = Number(row?.id || 0);
    if (Number.isFinite(id) && id > 0) return id;
  }

  return null;
}

export async function upsertCanonicalContact(tx: any, input: {
  displayName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  emails?: string[];
  phones?: string[];
  source?: string | null;
  sourceSystem?: string | null;
  createdByUserId?: number | null;
}): Promise<{ contactId: number; created: boolean; updated: boolean; dedupeKey: string | null }> {
  const emails = uniqueStrings((input.emails || []).map((item) => normalizeEmail(item)).filter(Boolean));
  const phones = uniqueStrings((input.phones || []).map((item) => normalizePhone(item)).filter(Boolean));
  const primaryEmail = normalizeEmail(emails[0] || "");
  const primaryPhone = normalizePhone(phones[0] || "");
  const dedupeKey = buildDedupeKey({ email: primaryEmail, phone: primaryPhone });

  const displayName = asNullableText(input.displayName);
  const company = asNullableText(input.company);
  const jobTitle = asNullableText(input.jobTitle);
  const source = asNullableText(input.source);
  const sourceSystem = asNullableText(input.sourceSystem) || "manual";
  const createdByUserId = input.createdByUserId && Number.isFinite(input.createdByUserId) ? input.createdByUserId : null;

  let contactId: number | null = null;
  if (dedupeKey) {
    contactId = await findContactIdByDedupeKey(tx, dedupeKey);
  }
  if (!contactId) {
    contactId = await findContactIdByPrimaryIdentity(tx, { email: primaryEmail, phone: primaryPhone });
  }

  if (contactId) {
    const existing = getRows(await tx.execute(sql`select * from contacts where id = ${contactId} limit 1`))[0] || {};
    const mergedEmails = uniqueStrings([...(toArray(existing.emails) as any[]), ...emails, existing.primary_email, existing.email].filter(Boolean))
      .map(normalizeEmail)
      .filter(Boolean);
    const mergedPhones = uniqueStrings([...(toArray(existing.phones) as any[]), ...phones, existing.primary_phone_e164, existing.phone_normalized, existing.phone].filter(Boolean))
      .map(normalizePhone)
      .filter(Boolean);

    const nextDisplayName = existing.display_name || displayName;
    const nameParts = splitName(nextDisplayName || "");
    const nextCompany = existing.company || company;
    const nextJobTitle = existing.job_title || jobTitle;
    const nextPrimaryEmail = normalizeEmail(existing.primary_email || existing.email || primaryEmail || mergedEmails[0] || "") || null;
    const nextPrimaryPhone = normalizePhone(existing.primary_phone_e164 || existing.phone_normalized || primaryPhone || mergedPhones[0] || "") || null;
    const nextDedupeKey = existing.dedupe_key || dedupeKey;
    const nextCreatedBy = existing.created_by_user_id || createdByUserId;

    await tx.execute(sql`
      update contacts
      set
        display_name = ${nextDisplayName || null},
        given_name = ${asNullableText(existing.given_name) || asNullableText(nameParts.givenName)},
        family_name = ${asNullableText(existing.family_name) || asNullableText(nameParts.familyName)},
        first_name = ${asNullableText(existing.first_name) || asNullableText(nameParts.givenName)},
        last_name = ${asNullableText(existing.last_name) || asNullableText(nameParts.familyName)},
        company = ${nextCompany || null},
        job_title = ${nextJobTitle || null},
        emails = ${JSON.stringify(mergedEmails)}::jsonb,
        phones = ${JSON.stringify(mergedPhones)}::jsonb,
        primary_email = ${nextPrimaryEmail},
        primary_phone_e164 = ${nextPrimaryPhone},
        email = ${nextPrimaryEmail},
        phone = ${mergedPhones[0] || null},
        phone_normalized = ${nextPrimaryPhone},
        source = ${source || existing.source || null},
        source_system = ${sourceSystem || existing.source_system || "manual"},
        dedupe_key = ${nextDedupeKey},
        created_by_user_id = ${nextCreatedBy},
        updated_at = now()
      where id = ${contactId}
    `);

    return { contactId, created: false, updated: true, dedupeKey: nextDedupeKey || null };
  }

  const nameParts = splitName(displayName || "");
  const insertResult = await tx.execute(sql`
    insert into contacts (
      display_name, given_name, family_name, first_name, last_name, company, job_title,
      emails, phones, primary_email, primary_phone_e164,
      source, source_system, dedupe_key, created_by_user_id,
      created_at, updated_at
    ) values (
      ${displayName || null},
      ${asNullableText(nameParts.givenName)},
      ${asNullableText(nameParts.familyName)},
      ${asNullableText(nameParts.givenName)},
      ${asNullableText(nameParts.familyName)},
      ${company || null},
      ${jobTitle || null},
      ${JSON.stringify(emails)}::jsonb,
      ${JSON.stringify(phones)}::jsonb,
      ${primaryEmail || null},
      ${primaryPhone || null},
      ${source || null},
      ${sourceSystem || "manual"},
      ${dedupeKey},
      ${createdByUserId},
      now(),
      now()
    )
    returning id
  `);
  const insertedId = Number(getRows(insertResult)[0]?.id || 0);
  if (!Number.isFinite(insertedId) || insertedId <= 0) {
    throw new Error("Failed to create contact");
  }

  return { contactId: insertedId, created: true, updated: false, dedupeKey };
}

export async function ensureTenantContactLink(tx: any, args: {
  tenantId: number;
  contactId: number;
  createdByUserId?: number | null;
}) {
  const tenantId = args.tenantId;
  const contactId = args.contactId;
  const ownerUserId = args.createdByUserId && Number.isFinite(args.createdByUserId) ? args.createdByUserId : null;

  await tx.execute(sql`
    insert into tenant_contacts (tenant_id, contact_id, scope, status, tags, notes, crm_status, consent_status, is_dnc, owner_user_id, created_at, updated_at)
    values (${tenantId}, ${contactId}, 'tenant_shared'::tenant_contact_scope, 'active'::tenant_contact_status, '[]'::jsonb, null, 'lead'::contact_status, 'unknown'::contact_consent_status, false, ${ownerUserId}, now(), now())
    on conflict (tenant_id, contact_id) do update set updated_at = now()
  `);
}

export async function updateTenantContact(tx: any, args: {
  tenantId: number;
  contactId: number;
  tags?: string[] | null;
  notes?: string | null;
  crmStatus?: string | null;
  consentStatus?: string | null;
  isDnc?: boolean | null;
}) {
  const tenantId = args.tenantId;
  const contactId = args.contactId;
  const tags = Array.isArray(args.tags) ? uniqueStrings(args.tags) : null;
  const notes = args.notes !== undefined ? asNullableText(args.notes) : undefined;
  const crmStatus = args.crmStatus !== undefined ? asNullableText(args.crmStatus)?.toLowerCase() : undefined;
  const consentStatus = args.consentStatus !== undefined ? asNullableText(args.consentStatus)?.toLowerCase() : undefined;
  const isDnc = args.isDnc !== undefined && args.isDnc !== null ? Boolean(args.isDnc) : undefined;

  const updates: any[] = [];
  if (tags !== null) updates.push(sql`tags = ${JSON.stringify(tags)}::jsonb`);
  if (notes !== undefined) updates.push(sql`notes = ${notes}`);
  if (crmStatus !== undefined) updates.push(sql`crm_status = ${crmStatus}::contact_status`);
  if (consentStatus !== undefined) updates.push(sql`consent_status = ${consentStatus}::contact_consent_status`);
  if (isDnc !== undefined) updates.push(sql`is_dnc = ${isDnc}`);

  if (!updates.length) return;

  await tx.execute(sql`
    update tenant_contacts
    set ${sql.join([...updates, sql`updated_at = now()`], sql`, `)}
    where tenant_id = ${tenantId} and contact_id = ${contactId}
  `);
}

export async function listTenantContacts(args: {
  tenantId: number;
  q?: string;
  status?: string;
  consent?: string;
  source?: string;
  tag?: string;
  hasWhatsapp?: string;
  limit: number;
  offset: number;
  includeArchived?: boolean;
}): Promise<TenantContactsListResponse> {
  const conditions: any[] = [sql`tc.tenant_id = ${args.tenantId}`];
  if (!args.includeArchived) conditions.push(sql`tc.status <> 'archived'::tenant_contact_status`);

  const q = String(args.q || "").trim();
  if (q) {
    const term = `%${q}%`;
    conditions.push(sql`(
      coalesce(c.display_name, '') ilike ${term}
      or coalesce(c.given_name, '') ilike ${term}
      or coalesce(c.family_name, '') ilike ${term}
      or coalesce(c.first_name, '') ilike ${term}
      or coalesce(c.last_name, '') ilike ${term}
      or coalesce(c.primary_email, c.email, '') ilike ${term}
      or coalesce(c.primary_phone_e164, c.phone_normalized, c.phone, '') ilike ${term}
    )`);
  }

  const source = String(args.source || "").trim();
  if (source) conditions.push(sql`(coalesce(c.source_system, '') = ${source} or coalesce(c.source, '') = ${source})`);

  const status = String(args.status || "").trim().toLowerCase();
  if (status && status !== "all") conditions.push(sql`tc.crm_status = ${status}::contact_status`);

  const consent = String(args.consent || "").trim().toLowerCase();
  if (consent && consent !== "all") conditions.push(sql`tc.consent_status = ${consent}::contact_consent_status`);

  const hasWhatsapp = String(args.hasWhatsapp || "").trim().toLowerCase();
  if (hasWhatsapp === "yes" || hasWhatsapp === "true") conditions.push(sql`coalesce(c.primary_phone_e164, c.phone_normalized, c.phone, '') <> ''`);
  if (hasWhatsapp === "no" || hasWhatsapp === "false") conditions.push(sql`coalesce(c.primary_phone_e164, c.phone_normalized, c.phone, '') = ''`);

  const tag = String(args.tag || "").trim();
  if (tag) {
    conditions.push(sql`
      exists (
        select 1
        from jsonb_array_elements_text(coalesce(tc.tags, '[]'::jsonb)) as elem(value)
        where lower(elem.value) = lower(${tag})
      )
    `);
  }

  const whereClause = sql.join(conditions, sql` and `);
  const total = getCount(await db.execute(sql`select count(*)::int as count from tenant_contacts tc join contacts c on c.id = tc.contact_id where ${whereClause}`));
  const rows = getRows(
    await db.execute(sql`
      select
        c.id,
        coalesce(c.display_name, trim(concat_ws(' ', c.given_name, c.family_name)), trim(concat_ws(' ', c.first_name, c.last_name)), 'Unnamed Contact') as display_name,
        c.company,
        c.job_title,
        coalesce(c.phones, '[]'::jsonb) as phones,
        coalesce(c.emails, '[]'::jsonb) as emails,
        coalesce(c.primary_phone_e164, c.phone_normalized, c.phone) as primary_phone_e164,
        coalesce(c.primary_email, c.email) as primary_email,
        coalesce(tc.tags, '[]'::jsonb) as tags,
        tc.crm_status,
        tc.consent_status,
        tc.is_dnc,
        tc.notes,
        c.source,
        c.source_system,
        c.created_at,
        c.updated_at,
        (select max(lm.created_at) from lead_messages lm where c.lead_id is not null and lm.lead_id = c.lead_id) as last_interaction_at,
        (select max(coalesce(lm.sent_at, lm.created_at)) from lead_messages lm where c.lead_id is not null and lm.lead_id = c.lead_id and lm.direction = 'outbound') as last_outreach_at
      from tenant_contacts tc
      join contacts c on c.id = tc.contact_id
      where ${whereClause}
      order by tc.updated_at desc nulls last, c.updated_at desc nulls last, c.created_at desc, c.id desc
      limit ${args.limit}
      offset ${args.offset}
    `),
  ).map((row: any) => ({
    id: Number(row.id),
    displayName: row.display_name,
    company: row.company,
    jobTitle: row.job_title,
    phones: uniqueStrings(toArray(row.phones).map((item) => normalizePhone(item)).filter(Boolean)),
    emails: uniqueStrings(toArray(row.emails).map((item) => normalizeEmail(item)).filter(Boolean)),
    primaryPhoneE164: row.primary_phone_e164 || null,
    primaryEmail: row.primary_email || null,
    tags: uniqueStrings(toArray(row.tags)),
    status: String(row.crm_status || "lead"),
    consentStatus: String(row.consent_status || "unknown"),
    isDnc: Boolean(row.is_dnc),
    source: row.source,
    sourceSystem: row.source_system,
    notes: row.notes || null,
    hasWhatsapp: Boolean(row.primary_phone_e164),
    lastInteractionAt: row.last_interaction_at || null,
    lastOutreachAt: row.last_outreach_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }));

  return {
    ok: true,
    items: rows,
    total,
    limit: args.limit,
    offset: args.offset,
    hasMore: args.offset + rows.length < total,
  };
}

export async function importTenantContactsCsv(args: {
  tenantId: number;
  userId: number;
  fileName: string;
  fileBuffer: Buffer;
}): Promise<CsvImportSummary> {
  await markStaleRunningImportBatchesFailed({ tenantId: args.tenantId });

  const raw = args.fileBuffer.toString("utf8");
  const records = readCsvObjects(raw);
  const errors: Array<{ row: number; message: string }> = [];

  const counters = {
    processedRows: 0,
    createdContacts: 0,
    updatedContacts: 0,
    linkedExisting: 0,
    duplicatesSkipped: 0,
    failedRows: 0,
  };

  const toStats = () => ({
    totalRows: records.length,
    processedRows: counters.processedRows,
    createdContacts: counters.createdContacts,
    updatedContacts: counters.updatedContacts,
    linkedExisting: counters.linkedExisting,
    duplicatesSkipped: counters.duplicatesSkipped,
    failedRows: counters.failedRows,
    fileName: args.fileName,
  });

  const batchResult = await db.execute(sql`
    insert into contact_import_batches (tenant_id, source, status, mode, stats, errors, created_by_user_id, started_at, created_at, updated_at)
    values (${args.tenantId}, 'csv', 'running'::contact_import_status, 'commit', ${JSON.stringify(toStats())}::jsonb, '[]'::jsonb, ${args.userId}, now(), now(), now())
    returning id
  `);
  const batchId = Number(getRows(batchResult)[0]?.id || 0);
  if (!Number.isFinite(batchId) || batchId <= 0) throw new Error("Failed to create import batch");

  const progressFlushInterval = 25;
  const flushProgress = async () => {
    await db.execute(sql`
      update contact_import_batches
      set
        stats = ${JSON.stringify(toStats())}::jsonb,
        updated_at = now()
      where id = ${batchId} and tenant_id = ${args.tenantId}
    `);
  };

  let fatalError: string | null = null;

  try {
    for (let i = 0; i < records.length; i += 1) {
      const rowNo = i + 2; // header + 1-based
      const row = records[i]!;

      try {
        await db.transaction(async (tx) => {
          const displayName =
            firstValue(row, ["name", "fullname", "displayname", "contactname"]) ||
            `${firstValue(row, ["firstname", "prenom", "first"])} ${firstValue(row, ["lastname", "nom", "last"])}`.trim();
          const company = firstValue(row, ["company", "organisation", "organization"]);
          const jobTitle = firstValue(row, ["jobtitle", "title", "role", "position"]);

          const emails = collectValues(row, ["email", "mail"]).map(normalizeEmail).filter(Boolean);
          const phones = collectValues(row, ["phone", "mobile", "tel", "whatsapp"]).map(normalizePhone).filter(Boolean);

          if (!emails.length && !phones.length && !displayName) {
            counters.duplicatesSkipped += 1;
            await tx.execute(sql`
              insert into contact_import_rows (batch_id, tenant_id, raw, result, created_at)
              values (${batchId}, ${args.tenantId}, ${JSON.stringify(row)}::jsonb, 'skipped_empty', now())
            `);
            return;
          }

          const upsert = await upsertCanonicalContact(tx, {
            displayName: displayName || null,
            company: company || null,
            jobTitle: jobTitle || null,
            emails,
            phones,
            source: "csv",
            sourceSystem: "csv",
            createdByUserId: args.userId,
          });

          if (upsert.created) counters.createdContacts += 1;
          if (upsert.updated) counters.updatedContacts += 1;

          const linkExists = getRows(
            await tx.execute(sql`select id from tenant_contacts where tenant_id = ${args.tenantId} and contact_id = ${upsert.contactId} limit 1`),
          )[0];
          if (linkExists) {
            counters.duplicatesSkipped += 1;
          } else {
            counters.linkedExisting += 1;
          }

          await ensureTenantContactLink(tx, { tenantId: args.tenantId, contactId: upsert.contactId, createdByUserId: args.userId });

          await tx.execute(sql`
            insert into contact_import_rows (batch_id, tenant_id, raw, result, contact_id, created_at)
            values (${batchId}, ${args.tenantId}, ${JSON.stringify(row)}::jsonb, 'ok', ${upsert.contactId}, now())
          `);
        });
      } catch (err: any) {
        const message = String(err?.message || err || "Unknown error");
        errors.push({ row: rowNo, message });
        counters.failedRows += 1;
        await db.execute(sql`
          insert into contact_import_rows (batch_id, tenant_id, raw, result, error, created_at)
          values (${batchId}, ${args.tenantId}, ${JSON.stringify(row)}::jsonb, 'failed', ${message}, now())
        `);
      } finally {
        counters.processedRows += 1;
        if (
          counters.processedRows === 1 ||
          counters.processedRows === records.length ||
          counters.processedRows % progressFlushInterval === 0
        ) {
          await flushProgress();
        }
      }
    }
  } catch (error: any) {
    fatalError = String(error?.message || error || "Import transaction failed");
    errors.push({ row: 0, message: fatalError });
  }

  const finalStatus = errors.length || fatalError ? sql`'failed'::contact_import_status` : sql`'completed'::contact_import_status`;

  await db.execute(sql`
    update contact_import_batches
    set
      status = ${finalStatus},
      stats = ${JSON.stringify(toStats())}::jsonb,
      errors = ${JSON.stringify(errors)}::jsonb,
      completed_at = now(),
      updated_at = now()
    where id = ${batchId} and tenant_id = ${args.tenantId}
  `);

  console.log("[contacts:import:csv]", { tenantId: args.tenantId, batchId, totalRows: records.length, ...counters, errors: errors.length });

  if (fatalError) {
    throw new Error(fatalError);
  }

  return {
    ok: true,
    batchId,
    totalRows: records.length,
    createdContacts: counters.createdContacts,
    updatedContacts: counters.updatedContacts,
    linkedExisting: counters.linkedExisting,
    duplicatesSkipped: counters.duplicatesSkipped,
    errors,
  };
}

export async function diagnosticsTenantContacts(args: {
  tenantId: number;
  userId: number;
}): Promise<TenantContactsDiagnostics> {
  await markStaleRunningImportBatchesFailed({ tenantId: args.tenantId });

  const contactsTotal = getCount(await db.execute(sql`select count(*)::int as count from contacts`));
  const tenantContactsTotal = getCount(await db.execute(sql`select count(*)::int as count from tenant_contacts where tenant_id = ${args.tenantId}`));

  const orphanContactsCreatedByMe = getCount(await db.execute(sql`
    select count(*)::int as count
    from contacts c
    where c.created_by_user_id = ${args.userId}
      and not exists (
        select 1 from tenant_contacts tc where tc.tenant_id = ${args.tenantId} and tc.contact_id = c.id
      )
  `));

  const wrongTenantLinksCreatedByMe = getCount(await db.execute(sql`
    select count(distinct c.id)::int as count
    from contacts c
    join tenant_contacts tc on tc.contact_id = c.id
    where c.created_by_user_id = ${args.userId}
      and tc.tenant_id <> ${args.tenantId}
      and not exists (
        select 1 from tenant_contacts tc2 where tc2.tenant_id = ${args.tenantId} and tc2.contact_id = c.id
      )
  `));

  const stagingRowsPending = getCount(await db.execute(sql`
    select count(*)::int as count
    from contact_import_rows cir
    join contact_import_batches cb on cb.id = cir.batch_id
    where cir.tenant_id = ${args.tenantId}
      and cb.status in ('queued'::contact_import_status, 'running'::contact_import_status)
  `));

  return {
    ok: true,
    tenantId: args.tenantId,
    totals: {
      contactsTotal,
      tenantContactsTotal,
      orphanContactsCreatedByMe,
      wrongTenantLinksCreatedByMe,
      stagingRowsPending,
    },
  };
}

export async function claimLegacyTenantContacts(args: {
  tenantId: number;
  userId: number;
  force: boolean;
}): Promise<{ ok: true; claimed: number }> {
  const tenantUserIds = sql`(select user_id from user_tenant_roles where tenant_id = ${args.tenantId})`;
  const insertResult = await db.execute(sql`
    insert into tenant_contacts (tenant_id, contact_id, scope, status, tags, notes, crm_status, consent_status, is_dnc, owner_user_id, created_at, updated_at)
    select
      ${args.tenantId},
      c.id,
      'tenant_shared'::tenant_contact_scope,
      'active'::tenant_contact_status,
      coalesce(c.tags, '[]'::jsonb),
      c.notes,
      coalesce(c.status, 'lead'::contact_status),
      coalesce(c.consent_status, 'unknown'::contact_consent_status),
      coalesce(c.is_dnc, false),
      ${args.userId},
      now(),
      now()
    from contacts c
    where not exists (
      select 1 from tenant_contacts tc where tc.tenant_id = ${args.tenantId} and tc.contact_id = c.id
    )
    and (
      c.tenant_id = ${args.tenantId}
      or c.created_by_user_id in ${tenantUserIds}
      or exists (select 1 from contact_import_rows r where r.tenant_id = ${args.tenantId} and r.contact_id = c.id)
      ${args.force ? sql`or c.tenant_id is null` : sql``}
    )
  `);
  const claimed = Number((insertResult as any)?.rowCount || 0);

  console.log("[contacts:claim-legacy]", { tenantId: args.tenantId, userId: args.userId, force: args.force, claimed });

  return { ok: true, claimed };
}

export async function forceClaimTenantContacts(args: {
  tenantId: number;
  userId: number;
}): Promise<{ ok: true; claimed: number }> {
  const tenantUserIds = sql`(select user_id from user_tenant_roles where tenant_id = ${args.tenantId})`;
  const insertResult = await db.execute(sql`
    insert into tenant_contacts (tenant_id, contact_id, scope, status, tags, notes, crm_status, consent_status, is_dnc, owner_user_id, created_at, updated_at)
    select
      ${args.tenantId},
      c.id,
      'tenant_shared'::tenant_contact_scope,
      'active'::tenant_contact_status,
      coalesce(c.tags, '[]'::jsonb),
      c.notes,
      coalesce(c.status, 'lead'::contact_status),
      coalesce(c.consent_status, 'unknown'::contact_consent_status),
      coalesce(c.is_dnc, false),
      ${args.userId},
      now(),
      now()
    from contacts c
    where not exists (
      select 1 from tenant_contacts tc where tc.tenant_id = ${args.tenantId} and tc.contact_id = c.id
    )
    and (
      c.created_by_user_id in ${tenantUserIds}
      or c.tenant_id = ${args.tenantId}
      or exists (select 1 from contact_import_rows r where r.tenant_id = ${args.tenantId} and r.contact_id = c.id)
    )
  `);
  const claimed = Number((insertResult as any)?.rowCount || 0);

  console.log("[contacts:force-claim]", { tenantId: args.tenantId, userId: args.userId, claimed });

  return { ok: true, claimed };
}
