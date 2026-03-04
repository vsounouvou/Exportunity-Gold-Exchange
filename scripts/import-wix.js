#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const IMPORT_ROOT = path.resolve(process.cwd(), "imports", "wix");
const FORMS_ROOT = path.join(IMPORT_ROOT, "forms");
const REPORT_PATH = path.join(IMPORT_ROOT, "import-report.md");

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  const options = {};
  for (const token of argv.slice(2)) {
    const match = String(token).match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    options[match[1]] = match[2];
  }
  const hasDryRun = flags.has("--dry-run");
  const hasCommit = flags.has("--commit");
  if (hasDryRun && hasCommit) {
    throw new Error("Use only one mode: --dry-run or --commit");
  }
  const maxRowsRaw = Number.parseInt(String(options["max-rows"] || ""), 10);
  const tenantIdRaw = Number.parseInt(String(options["tenant-id"] || ""), 10);
  return {
    dryRun: hasDryRun || !hasCommit,
    commit: hasCommit,
    contactsFile: String(options["contacts-file"] || "contacts.csv").trim(),
    subscribersFile: String(options["subscribers-file"] || "subscribers.csv").trim(),
    membersFile: String(options["members-file"] || "members.csv").trim(),
    formsDir: String(options["forms-dir"] || "forms").trim(),
    maxRowsPerFile: Number.isFinite(maxRowsRaw) && maxRowsRaw > 0 ? maxRowsRaw : null,
    tenantId: Number.isFinite(tenantIdRaw) && tenantIdRaw > 0 ? tenantIdRaw : null,
    accountLabel: String(options["account-label"] || "wix-import").trim(),
  };
}

function stripQuotes(input) {
  const value = String(input ?? "").trim();
  if (!value) return "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = stripQuotes(trimmed.slice(eq + 1));
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {
    // optional file
  }
}

async function loadLocalEnv() {
  await loadEnvFile(path.resolve(process.cwd(), ".env"));
  await loadEnvFile(path.resolve(process.cwd(), ".env.local"));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeHeader(header) {
  return String(header ?? "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function detectDelimiter(sampleLine) {
  const line = String(sampleLine ?? "");
  const counts = [
    { d: ",", c: (line.match(/,/g) || []).length },
    { d: ";", c: (line.match(/;/g) || []).length },
    { d: "\t", c: (line.match(/\t/g) || []).length },
  ].sort((a, b) => b.c - a.c);
  return counts[0].c > 0 ? counts[0].d : ",";
}

function parseCsv(text, delimiter) {
  const rows = [];
  let value = "";
  let row = [];
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
    const ch = text[i];
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

async function readCsvAsRows(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const firstLine = raw.split(/\r?\n/, 1)[0] || "";
  const delimiter = detectDelimiter(firstLine);
  const parsed = parseCsv(raw, delimiter);
  if (parsed.length === 0) return [];

  const headerRaw = parsed[0] || [];
  const headers = [];
  const seen = new Map();
  for (const header of headerRaw) {
    const base = normalizeHeader(header);
    const index = (seen.get(base) || 0) + 1;
    seen.set(base, index);
    headers.push(index > 1 ? `${base}_${index}` : base);
  }

  const rows = [];
  for (let i = 1; i < parsed.length; i += 1) {
    const source = parsed[i];
    const out = {};
    for (let h = 0; h < headers.length; h += 1) {
      out[headers[h]] = String(source[h] ?? "").trim();
    }
    rows.push(out);
  }
  return rows;
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const v of values || []) {
    const value = String(v ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function collectValues(row, keys) {
  const out = [];
  const all = Object.entries(row || {});
  for (const [rawKey, rawValue] of all) {
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

function firstValue(row, keys) {
  return collectValues(row, keys)[0] || "";
}

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function normalizePhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const keepPlus = raw.startsWith("+") ? "+" : "";
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (keepPlus) return `+${digits}`;
  return digits;
}

function parseTimestamp(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const utcLike = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(:\d{2})?$/);
  let date = null;
  if (utcLike) {
    date = new Date(`${utcLike[1]}T${utcLike[2]}${utcLike[3] || ":00"}Z`);
  } else {
    date = new Date(raw);
  }
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function earliestTimestamp(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function splitName(fullName) {
  const text = String(fullName ?? "").trim();
  if (!text) return { firstName: "", lastName: "" };
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function preferString(current, candidate) {
  const currentValue = String(current ?? "").trim();
  const candidateValue = String(candidate ?? "").trim();
  if (!currentValue) return candidateValue;
  if (!candidateValue) return currentValue;
  return currentValue.length >= candidateValue.length ? currentValue : candidateValue;
}

function splitTags(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return uniqueStrings(raw.split(/[;,|]/g).map((part) => part.trim()));
}

function createAggregateStore() {
  const contactsById = new Map();
  const aliasToId = new Map();
  let seq = 0;
  let anonymousSeq = 0;
  let merged = 0;

  function createContact() {
    const id = `c${++seq}`;
    const record = {
      id,
      aliases: new Set(),
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      phoneNormalized: "",
      tags: new Set(),
      notes: new Set(),
      createdAt: null,
      source: "",
      sourceReferenceId: "",
      wixContactId: "",
      isSubscriber: false,
      isMember: false,
      memberSince: null,
      sources: [],
      messages: [],
    };
    contactsById.set(id, record);
    return record;
  }

  function mergeRecords(targetId, sourceId) {
    if (!targetId || !sourceId || targetId === sourceId) return;
    const target = contactsById.get(targetId);
    const source = contactsById.get(sourceId);
    if (!target || !source) return;

    for (const alias of source.aliases) {
      aliasToId.set(alias, targetId);
      target.aliases.add(alias);
    }

    target.firstName = preferString(target.firstName, source.firstName);
    target.lastName = preferString(target.lastName, source.lastName);
    target.email = preferString(target.email, source.email);
    target.phone = preferString(target.phone, source.phone);
    target.phoneNormalized = preferString(target.phoneNormalized, source.phoneNormalized);
    target.wixContactId = preferString(target.wixContactId, source.wixContactId);
    target.source = preferString(target.source, source.source);
    target.sourceReferenceId = preferString(target.sourceReferenceId, source.sourceReferenceId);
    target.createdAt = earliestTimestamp(target.createdAt, source.createdAt);
    target.memberSince = earliestTimestamp(target.memberSince, source.memberSince);
    target.isSubscriber = target.isSubscriber || source.isSubscriber;
    target.isMember = target.isMember || source.isMember;

    for (const tag of source.tags) target.tags.add(tag);
    for (const note of source.notes) target.notes.add(note);
    for (const entry of source.sources) target.sources.push(entry);
    for (const msg of source.messages) target.messages.push(msg);

    contactsById.delete(sourceId);
    merged += 1;
  }

  function getOrCreate(email, phoneNormalized) {
    const aliases = [];
    if (email) aliases.push(`e:${email}`);
    if (phoneNormalized) aliases.push(`p:${phoneNormalized}`);

    const existingIds = uniqueStrings(aliases.map((alias) => aliasToId.get(alias)).filter(Boolean));
    let record = null;

    if (existingIds.length === 0) {
      if (aliases.length === 0) {
        const alias = `x:${++anonymousSeq}`;
        record = createContact();
        aliasToId.set(alias, record.id);
        record.aliases.add(alias);
        return record;
      }
      record = createContact();
    } else {
      record = contactsById.get(existingIds[0]) || createContact();
      for (let i = 1; i < existingIds.length; i += 1) {
        mergeRecords(record.id, existingIds[i]);
      }
    }

    for (const alias of aliases) {
      aliasToId.set(alias, record.id);
      record.aliases.add(alias);
    }
    return record;
  }

  function absorb(input) {
    const email = normalizeEmail(input.email);
    const phoneNormalized = normalizePhone(input.phone);
    const record = getOrCreate(email, phoneNormalized);

    record.firstName = preferString(record.firstName, input.firstName);
    record.lastName = preferString(record.lastName, input.lastName);
    record.email = preferString(record.email, email || input.email);
    record.phone = preferString(record.phone, input.phone);
    record.phoneNormalized = preferString(record.phoneNormalized, phoneNormalized);
    record.wixContactId = preferString(record.wixContactId, input.wixContactId);
    record.source = preferString(record.source, input.source);
    record.sourceReferenceId = preferString(record.sourceReferenceId, input.sourceReferenceId || input.wixContactId);
    record.createdAt = earliestTimestamp(record.createdAt, parseTimestamp(input.createdAt));
    record.memberSince = earliestTimestamp(record.memberSince, parseTimestamp(input.memberSince));
    record.isSubscriber = record.isSubscriber || Boolean(input.isSubscriber);
    record.isMember = record.isMember || Boolean(input.isMember);

    for (const tag of splitTags(input.tags || "")) record.tags.add(tag);
    record.tags.add("imported_from_wix");

    const note = String(input.notes ?? "").trim();
    if (note) record.notes.add(note);

    if (input.source) {
      record.sources.push({
        source: input.source,
        sourceReferenceId: input.sourceReferenceId || input.wixContactId || null,
        formName: input.formName || null,
        pageUrl: input.pageUrl || null,
        createdAt: parseTimestamp(input.createdAt || input.submittedAt) || null,
        metadata: input.sourceMetadata || {},
      });
    }

    const message = String(input.message ?? "").trim();
    if (message) {
      record.messages.push({
        message,
        formName: input.formName || null,
        pageUrl: input.pageUrl || null,
        submittedAt: parseTimestamp(input.submittedAt || input.createdAt) || null,
        sourceReferenceId: input.sourceReferenceId || null,
        metadata: input.messageMetadata || {},
      });
    }
  }

  return {
    absorb,
    list: () => Array.from(contactsById.values()),
    mergedCount: () => merged,
  };
}

function buildCommonRowIdentity(row) {
  const possibleId = firstValue(row, [
    "wixcontactid",
    "contactid",
    "rayonid",
    "id",
    "submissionid",
    "entryid",
  ]);
  const possibleSource = firstValue(row, ["source", "originsource", "leadsource"]);
  return {
    sourceReferenceId: possibleId || "",
    sourceLabel: possibleSource || "",
  };
}

function extractNameParts(row) {
  const firstName = firstValue(row, ["firstname", "first", "givenname"]);
  const lastName = firstValue(row, ["lastname", "last", "surname", "familyname"]);
  if (firstName || lastName) return { firstName, lastName };
  const fullName = firstValue(row, ["fullname", "name", "contactname"]);
  return splitName(fullName);
}

function extractEmail(row) {
  const emails = collectValues(row, ["email", "emailaddress", "email1", "email2", "mail"]);
  for (const value of emails) {
    const normalized = normalizeEmail(value);
    if (normalized) return normalized;
  }
  return "";
}

function extractPhone(row) {
  const phones = collectValues(row, [
    "phone",
    "phonenumber",
    "phone1",
    "phone2",
    "mobile",
    "mobilephone",
    "telephone",
    "tel",
    "cellphone",
  ]);
  return phones[0] || "";
}

function parseContactsCsvRows(rows, store, stats) {
  for (const row of rows) {
    stats.contactsRows += 1;
    const names = extractNameParts(row);
    const email = extractEmail(row);
    const phone = extractPhone(row);
    const identity = buildCommonRowIdentity(row);
    const createdAt = firstValue(row, [
      "createdatutc0",
      "createdat",
      "createddate",
      "datecreated",
      "created",
      "dateadded",
    ]);
    const tags = firstValue(row, ["tags", "labels", "segments"]);
    const notes = uniqueStrings(
      [
        firstValue(row, ["notes", "note"]),
        firstValue(row, ["enteralonganswer"]),
        firstValue(row, ["enterashortanswer"]),
        firstValue(row, ["position"]),
      ].filter(Boolean),
    ).join(" | ");

    store.absorb({
      firstName: names.firstName,
      lastName: names.lastName,
      email,
      phone,
      tags,
      notes,
      createdAt,
      wixContactId: identity.sourceReferenceId || firstValue(row, ["rayonid"]),
      source: "wix_contact",
      sourceReferenceId: identity.sourceReferenceId,
      sourceMetadata: {
        wix_source_label: identity.sourceLabel || null,
      },
    });
  }
}

function parseFormsCsvRows(formName, rows, store, stats) {
  for (const row of rows) {
    stats.formsRows += 1;
    const names = extractNameParts(row);
    const email = extractEmail(row);
    const phone = extractPhone(row);
    const submittedAt = firstValue(row, [
      "submittedat",
      "submissiondate",
      "date",
      "timestamp",
      "createdat",
      "created",
    ]);
    const message = firstValue(row, [
      "message",
      "inquiry",
      "enquiry",
      "comment",
      "comments",
      "details",
      "question",
      "questions",
      "description",
      "enteralonganswer",
      "notes",
    ]);
    const pageUrl = firstValue(row, ["pageurl", "page", "url", "sourceurl", "pagepath", "landingpage"]);
    const identity = buildCommonRowIdentity(row);

    store.absorb({
      firstName: names.firstName,
      lastName: names.lastName,
      email,
      phone,
      source: "wix_form",
      sourceReferenceId: identity.sourceReferenceId,
      formName,
      pageUrl,
      submittedAt,
      message,
      sourceMetadata: {
        form_name: formName,
        wix_source_label: identity.sourceLabel || null,
      },
      messageMetadata: {
        imported_from_form: formName,
      },
    });
    if (message) stats.messagesPrepared += 1;
  }
}

function parseSubscribersRows(rows, store, stats) {
  for (const row of rows) {
    stats.subscribersRows += 1;
    const names = extractNameParts(row);
    const email = extractEmail(row);
    const phone = extractPhone(row);
    const identity = buildCommonRowIdentity(row);
    const createdAt = firstValue(row, ["createdat", "subscribedat", "date", "timestamp", "created"]);

    store.absorb({
      firstName: names.firstName,
      lastName: names.lastName,
      email,
      phone,
      createdAt,
      isSubscriber: true,
      source: "wix_subscriber",
      sourceReferenceId: identity.sourceReferenceId,
      sourceMetadata: {
        wix_source_label: identity.sourceLabel || null,
      },
    });
  }
}

function parseMembersRows(rows, store, stats) {
  for (const row of rows) {
    stats.membersRows += 1;
    const names = extractNameParts(row);
    const email = extractEmail(row);
    const phone = extractPhone(row);
    const identity = buildCommonRowIdentity(row);
    const memberSince = firstValue(row, [
      "membersince",
      "joined",
      "joinedat",
      "datejoined",
      "createdat",
      "created",
    ]);

    store.absorb({
      firstName: names.firstName,
      lastName: names.lastName,
      email,
      phone,
      memberSince,
      isMember: true,
      source: "wix_member",
      sourceReferenceId: identity.sourceReferenceId,
      sourceMetadata: {
        wix_source_label: identity.sourceLabel || null,
      },
    });
  }
}

async function listFormCsvFiles(formsDir) {
  try {
    const entries = await fs.readdir(formsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
      .map((entry) => path.join(formsDir, entry.name));
  } catch {
    return [];
  }
}

async function loadWixInputFiles(stats, options) {
  const store = createAggregateStore();
  const contactsPath = path.join(IMPORT_ROOT, options.contactsFile || "contacts.csv");
  const subscribersPath = path.join(IMPORT_ROOT, options.subscribersFile || "subscribers.csv");
  const membersPath = path.join(IMPORT_ROOT, options.membersFile || "members.csv");
  const formsDir = path.join(IMPORT_ROOT, options.formsDir || "forms");
  const limit = options.maxRowsPerFile;

  if (await fileExists(contactsPath)) {
    const rows = await readCsvAsRows(contactsPath);
    const sliced = limit ? rows.slice(0, limit) : rows;
    if (limit && rows.length > sliced.length) stats.notes = `max_rows_per_file=${limit}`;
    parseContactsCsvRows(sliced, store, stats);
  }

  if (await fileExists(subscribersPath)) {
    const rows = await readCsvAsRows(subscribersPath);
    parseSubscribersRows(limit ? rows.slice(0, limit) : rows, store, stats);
  }

  if (await fileExists(membersPath)) {
    const rows = await readCsvAsRows(membersPath);
    parseMembersRows(limit ? rows.slice(0, limit) : rows, store, stats);
  }

  const formFiles = await listFormCsvFiles(formsDir);
  stats.formFiles = formFiles.length;
  for (const filePath of formFiles) {
    const formName = path.basename(filePath, path.extname(filePath));
    const rows = await readCsvAsRows(filePath);
    parseFormsCsvRows(formName, limit ? rows.slice(0, limit) : rows, store, stats);
  }

  return {
    contacts: store.list(),
    dedupeMergedInInput: store.mergedCount(),
  };
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = $1
      ) as ok
    `,
    [tableName],
  );
  return Boolean(rows[0]?.ok);
}

async function tableColumns(client, tableName) {
  const { rows } = await client.query(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
    `,
    [tableName],
  );
  return new Set(rows.map((row) => String(row.column_name)));
}

function isLockTimeoutError(error) {
  return String(error?.code || "") === "55P03";
}

async function detectExistingLeadMessagesMode(client) {
  const exists = await tableExists(client, "lead_messages");
  if (!exists) {
    throw new Error("lead_messages table is missing; cannot run leads-only import fallback");
  }
  const columns = await tableColumns(client, "lead_messages");
  if (columns.has("lead_id") && columns.has("content")) {
    return { mode: "lead_crm", messageColumn: "content" };
  }
  throw new Error("lead_messages table does not match expected CRM shape (requires lead_id + content)");
}

async function ensureContactsModel(client) {
  await client.query("create table if not exists contacts (id serial primary key)");
  await client.query("alter table contacts add column if not exists tenant_id int references tenants(id) on delete cascade");
  await client.query("alter table contacts add column if not exists wix_contact_id text");
  await client.query("alter table contacts add column if not exists first_name text");
  await client.query("alter table contacts add column if not exists last_name text");
  await client.query("alter table contacts add column if not exists email text");
  await client.query("alter table contacts add column if not exists phone text");
  await client.query("alter table contacts add column if not exists phone_normalized text");
  await client.query("alter table contacts add column if not exists source text");
  await client.query("alter table contacts add column if not exists source_system text");
  await client.query("alter table contacts add column if not exists source_reference_id text");
  await client.query("alter table contacts add column if not exists notes text");
  await client.query("alter table contacts add column if not exists tags jsonb not null default '[]'::jsonb");
  await client.query("alter table contacts add column if not exists is_subscriber boolean not null default false");
  await client.query("alter table contacts add column if not exists is_member boolean not null default false");
  await client.query("alter table contacts add column if not exists member_since timestamptz");
  await client.query("alter table contacts add column if not exists imported_from_wix boolean not null default false");
  await client.query("alter table contacts add column if not exists import_batch_id int");
  await client.query("alter table contacts add column if not exists lead_id integer");
  await client.query("alter table contacts add column if not exists metadata jsonb not null default '{}'::jsonb");
  await client.query("alter table contacts add column if not exists created_at timestamptz not null default now()");
  await client.query("alter table contacts add column if not exists updated_at timestamptz not null default now()");
  await client.query("create index if not exists contacts_email_ci_idx on contacts ((lower(email)))");
  await client.query("create index if not exists contacts_phone_normalized_idx on contacts (phone_normalized)");
  await client.query("create index if not exists contacts_imported_from_wix_idx on contacts (imported_from_wix)");
  await client.query("create index if not exists contacts_tenant_idx on contacts (tenant_id)");

  await client.query(`
    create table if not exists contact_tags (
      id serial primary key,
      tenant_id int references tenants(id) on delete cascade,
      contact_id int not null references contacts(id) on delete cascade,
      tag text not null,
      created_at timestamptz not null default now()
    )
  `);
  await client.query("alter table contact_tags add column if not exists tenant_id int references tenants(id) on delete cascade");
  await client.query("create index if not exists contact_tags_contact_idx on contact_tags (contact_id)");
  await client.query("create index if not exists contact_tags_tenant_contact_idx on contact_tags (tenant_id, contact_id)");
  await client.query("create index if not exists contact_tags_tag_ci_idx on contact_tags ((lower(tag)))");

  await client.query(`
    create table if not exists contact_sources (
      id serial primary key,
      tenant_id int references tenants(id) on delete cascade,
      contact_id int not null references contacts(id) on delete cascade,
      source text not null,
      source_system text not null default 'wix',
      source_reference_id text,
      form_name text,
      page_url text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);
  await client.query("alter table contact_sources add column if not exists tenant_id int references tenants(id) on delete cascade");
  await client.query("create index if not exists contact_sources_contact_idx on contact_sources (contact_id)");
  await client.query("create index if not exists contact_sources_tenant_contact_idx on contact_sources (tenant_id, contact_id)");
  await client.query("create index if not exists contact_sources_source_idx on contact_sources (source)");

  await client.query(`
    create table if not exists contact_import_batches (
      id serial primary key,
      tenant_id int references tenants(id) on delete cascade,
      source text not null default 'wix',
      account_label text,
      status text not null default 'running',
      mode text not null default 'dry_run',
      stats jsonb not null default '{}'::jsonb,
      errors jsonb not null default '[]'::jsonb,
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await client.query("create index if not exists contact_import_batches_tenant_created_idx on contact_import_batches (tenant_id, created_at desc)");
}

async function ensureLeadMessagesModel(client) {
  const exists = await tableExists(client, "lead_messages");
  if (!exists) {
    await client.query(`
      create table lead_messages (
        id serial primary key,
        contact_id int not null references contacts(id) on delete cascade,
        message text not null,
        form_name text,
        page_url text,
        submitted_at timestamptz,
        source_system text not null default 'wix',
        source_reference_id text,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `);
    await client.query("create index if not exists lead_messages_contact_idx on lead_messages (contact_id, created_at desc)");
    return { mode: "contact", messageColumn: "message" };
  }

  const columns = await tableColumns(client, "lead_messages");
  if (columns.has("lead_id") && columns.has("content")) {
    return { mode: "lead_crm", messageColumn: "content" };
  }
  if (columns.has("contact_id") && (columns.has("message") || columns.has("content"))) {
    return { mode: "contact", messageColumn: columns.has("message") ? "message" : "content" };
  }

  await client.query("alter table lead_messages add column if not exists contact_id int references contacts(id) on delete cascade");
  await client.query("alter table lead_messages add column if not exists message text");
  await client.query("alter table lead_messages add column if not exists form_name text");
  await client.query("alter table lead_messages add column if not exists page_url text");
  await client.query("alter table lead_messages add column if not exists submitted_at timestamptz");
  await client.query("alter table lead_messages add column if not exists source_system text");
  await client.query("alter table lead_messages add column if not exists source_reference_id text");
  await client.query("alter table lead_messages add column if not exists metadata jsonb not null default '{}'::jsonb");
  await client.query("alter table lead_messages add column if not exists created_at timestamptz not null default now()");
  await client.query("create index if not exists lead_messages_contact_idx on lead_messages (contact_id, created_at desc)");

  const secondPass = await tableColumns(client, "lead_messages");
  if (secondPass.has("contact_id") && (secondPass.has("message") || secondPass.has("content"))) {
    return { mode: "contact", messageColumn: secondPass.has("message") ? "message" : "content" };
  }

  throw new Error("Unable to ensure lead_messages table shape for import");
}

function sortRowsByCreatedAt(rows) {
  return [...rows].sort((a, b) => {
    const at = a?.created_at ? new Date(a.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b?.created_at ? new Date(b.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return splitTags(value);
    }
  }
  return [];
}

function combineNotes(existingNotes, incomingNotesSet) {
  const parts = uniqueStrings([
    ...String(existingNotes || "")
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean),
    ...Array.from(incomingNotesSet || []).map((p) => String(p || "").trim()).filter(Boolean),
  ]);
  return parts.join("\n\n");
}

function mergeTags(existingTags, incomingTagsSet) {
  return uniqueStrings([
    ...jsonArray(existingTags).map((t) => String(t || "").trim()),
    ...Array.from(incomingTagsSet || []).map((t) => String(t || "").trim()),
    "imported_from_wix",
  ]);
}

function fullName(firstName, lastName) {
  const f = String(firstName || "").trim();
  const l = String(lastName || "").trim();
  return `${f} ${l}`.trim();
}

async function preloadExistingContacts(client, contacts, tenantId = null) {
  const emails = uniqueStrings(contacts.map((contact) => normalizeEmail(contact.email))).map((v) => v.toLowerCase());
  const phones = uniqueStrings(contacts.map((contact) => normalizePhone(contact.phoneNormalized || contact.phone)));

  if (emails.length === 0 && phones.length === 0) {
    return { byEmail: new Map(), byPhone: new Map() };
  }

  const params = [];
  const where = [];
  if (emails.length > 0) {
    params.push(emails);
    where.push(`lower(email) = any($${params.length}::text[])`);
  }
  if (phones.length > 0) {
    params.push(phones);
    where.push(`phone_normalized = any($${params.length}::text[])`);
  }

  const whereSql = tenantId
    ? `(tenant_id = $${params.length + 1}) and (${where.join(" or ")})`
    : where.join(" or ");
  if (tenantId) params.push(tenantId);

  const { rows } = await client.query(
    `
      select *
      from contacts
      where ${whereSql}
    `,
    params,
  );

  const byEmail = new Map();
  const byPhone = new Map();

  for (const row of rows) {
    const email = normalizeEmail(row.email);
    const phone = normalizePhone(row.phone_normalized || row.phone);
    if (email) {
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(row);
    }
    if (phone) {
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone).push(row);
    }
  }

  for (const list of byEmail.values()) {
    list.splice(0, list.length, ...sortRowsByCreatedAt(list));
  }
  for (const list of byPhone.values()) {
    list.splice(0, list.length, ...sortRowsByCreatedAt(list));
  }

  return { byEmail, byPhone };
}

function candidateRowsForContact(importContact, mapByEmail, mapByPhone) {
  const bucket = new Map();
  const email = normalizeEmail(importContact.email);
  const phone = normalizePhone(importContact.phoneNormalized || importContact.phone);
  for (const row of mapByEmail.get(email) || []) bucket.set(row.id, row);
  for (const row of mapByPhone.get(phone) || []) bucket.set(row.id, row);
  return sortRowsByCreatedAt(Array.from(bucket.values()));
}

function updateMapsWithContact(row, mapByEmail, mapByPhone) {
  const email = normalizeEmail(row.email);
  const phone = normalizePhone(row.phone_normalized || row.phone);
  if (email) {
    if (!mapByEmail.has(email)) mapByEmail.set(email, []);
    const list = mapByEmail.get(email);
    const without = list.filter((item) => Number(item.id) !== Number(row.id));
    without.push(row);
    mapByEmail.set(email, sortRowsByCreatedAt(without));
  }
  if (phone) {
    if (!mapByPhone.has(phone)) mapByPhone.set(phone, []);
    const list = mapByPhone.get(phone);
    const without = list.filter((item) => Number(item.id) !== Number(row.id));
    without.push(row);
    mapByPhone.set(phone, sortRowsByCreatedAt(without));
  }
}

function removeFromMaps(row, mapByEmail, mapByPhone) {
  const email = normalizeEmail(row.email);
  const phone = normalizePhone(row.phone_normalized || row.phone);
  if (email && mapByEmail.has(email)) {
    mapByEmail.set(
      email,
      mapByEmail.get(email).filter((item) => Number(item.id) !== Number(row.id)),
    );
  }
  if (phone && mapByPhone.has(phone)) {
    mapByPhone.set(
      phone,
      mapByPhone.get(phone).filter((item) => Number(item.id) !== Number(row.id)),
    );
  }
}

async function mergeDuplicateExistingContacts(client, primary, secondary, leadMessagesMode, stats) {
  if (!primary || !secondary || Number(primary.id) === Number(secondary.id)) return primary;

  await client.query(
    `
      insert into contact_tags (tenant_id, contact_id, tag, created_at)
      select coalesce($3, tenant_id), $1, tag, created_at
      from contact_tags
      where contact_id = $2
        and not exists (
          select 1
          from contact_tags ct
          where ct.contact_id = $1
            and coalesce(ct.tenant_id, $3) = coalesce($3, ct.tenant_id)
            and lower(ct.tag) = lower(contact_tags.tag)
        )
    `,
    [primary.id, secondary.id, primary.tenant_id || secondary.tenant_id || null],
  );

  await client.query(
    `
      insert into contact_sources
      (tenant_id, contact_id, source, source_system, source_reference_id, form_name, page_url, metadata, created_at)
      select
        coalesce($3, tenant_id),
        $1,
        source,
        source_system,
        source_reference_id,
        form_name,
        page_url,
        metadata,
        created_at
      from contact_sources
      where contact_id = $2
    `,
    [primary.id, secondary.id, primary.tenant_id || secondary.tenant_id || null],
  );

  if (leadMessagesMode.mode === "contact") {
    await client.query("update lead_messages set contact_id = $1 where contact_id = $2", [primary.id, secondary.id]);
  }

  const primaryLeadId = primary.lead_id ? Number(primary.lead_id) : null;
  const secondaryLeadId = secondary.lead_id ? Number(secondary.lead_id) : null;
  if (leadMessagesMode.mode === "lead_crm" && primaryLeadId && secondaryLeadId && primaryLeadId !== secondaryLeadId) {
    await client.query("update lead_messages set lead_id = $1 where lead_id = $2", [primaryLeadId, secondaryLeadId]);
  }

  const mergedTags = mergeTags(primary.tags, new Set(jsonArray(secondary.tags)));
  const mergedNotes = combineNotes(primary.notes, new Set(String(secondary.notes || "").split(/\n+/).filter(Boolean)));
  const mergedCreatedAt = earliestTimestamp(primary.created_at, secondary.created_at);
  const mergedMemberSince = earliestTimestamp(primary.member_since, secondary.member_since);

  const updatePrimary = await client.query(
    `
      update contacts
      set
        first_name = $1,
        last_name = $2,
        email = $3,
        phone = $4,
        phone_normalized = $5,
        wix_contact_id = $6,
        source = $7,
        source_system = $8,
        source_reference_id = $9,
        notes = $10,
        tags = $11::jsonb,
        is_subscriber = $12,
        is_member = $13,
        member_since = $14,
        imported_from_wix = true,
        lead_id = $15,
        metadata = coalesce(metadata, '{}'::jsonb) || $16::jsonb,
        created_at = $17,
        updated_at = now()
      where id = $18
      returning *
    `,
    [
      preferString(primary.first_name, secondary.first_name) || null,
      preferString(primary.last_name, secondary.last_name) || null,
      preferString(primary.email, secondary.email) || null,
      preferString(primary.phone, secondary.phone) || null,
      preferString(primary.phone_normalized, secondary.phone_normalized) || null,
      preferString(primary.wix_contact_id, secondary.wix_contact_id) || null,
      preferString(primary.source, secondary.source) || "wix_contact",
      "wix",
      preferString(primary.source_reference_id, secondary.source_reference_id) || null,
      mergedNotes || null,
      JSON.stringify(mergedTags),
      Boolean(primary.is_subscriber) || Boolean(secondary.is_subscriber),
      Boolean(primary.is_member) || Boolean(secondary.is_member),
      mergedMemberSince,
      primaryLeadId || secondaryLeadId,
      JSON.stringify({
        imported_from_wix: true,
        merged_duplicate_contact_id: Number(secondary.id),
        merged_at: new Date().toISOString(),
      }),
      mergedCreatedAt || new Date().toISOString(),
      Number(primary.id),
    ],
  );

  await client.query("delete from contact_tags where contact_id = $1", [secondary.id]);
  await client.query("delete from contact_sources where contact_id = $1", [secondary.id]);
  await client.query("delete from contacts where id = $1", [secondary.id]);

  stats.duplicatesMerged += 1;
  return updatePrimary.rows[0];
}

async function insertContactTag(client, tenantId, contactId, tag) {
  const value = String(tag || "").trim();
  if (!value) return false;
  const { rowCount } = await client.query(
    `
      insert into contact_tags (tenant_id, contact_id, tag)
      select $1, $2, $3
      where not exists (
        select 1
        from contact_tags
        where contact_id = $2
          and coalesce(tenant_id, $1) = $1
          and lower(tag) = lower($3)
      )
    `,
    [tenantId, contactId, value],
  );
  return rowCount > 0;
}

async function insertContactSource(client, tenantId, contactId, source) {
  const src = String(source?.source || "").trim();
  if (!src) return false;
  const sourceReferenceId = String(source?.sourceReferenceId || "").trim() || null;
  const formName = String(source?.formName || "").trim() || null;
  const pageUrl = String(source?.pageUrl || "").trim() || null;
  const createdAt = parseTimestamp(source?.createdAt) || null;

  const { rowCount } = await client.query(
    `
      insert into contact_sources
      (tenant_id, contact_id, source, source_system, source_reference_id, form_name, page_url, metadata, created_at)
      select
        $1,
        $2,
        $3,
        'wix',
        $4,
        $5,
        $6,
        $7::jsonb,
        coalesce($8, now())
      where not exists (
        select 1
        from contact_sources
        where contact_id = $2
          and coalesce(tenant_id, $1) = $1
          and source = $3
          and coalesce(source_reference_id, '') = coalesce($4, '')
          and coalesce(form_name, '') = coalesce($5, '')
          and coalesce(page_url, '') = coalesce($6, '')
      )
    `,
    [tenantId, contactId, src, sourceReferenceId, formName, pageUrl, JSON.stringify(source?.metadata || {}), createdAt],
  );
  return rowCount > 0;
}

async function createImportBatch(client, tenantId, args) {
  if (!tenantId) return null;
  const { rows } = await client.query(
    `
      insert into contact_import_batches
      (tenant_id, source, account_label, status, mode, started_at, created_at, updated_at)
      values ($1, 'wix', $2, 'running', $3, now(), now(), now())
      returning id
    `,
    [tenantId, args.accountLabel || "wix-import", args.commit ? "commit" : "dry_run"],
  );
  return rows[0]?.id ? Number(rows[0].id) : null;
}

async function finishImportBatch(client, batchId, status, stats) {
  if (!batchId) return;
  await client.query(
    `
      update contact_import_batches
      set
        status = $1,
        stats = $2::jsonb,
        errors = $3::jsonb,
        completed_at = now(),
        updated_at = now()
      where id = $4
    `,
    [status, JSON.stringify(stats || {}), JSON.stringify(stats?.errors || []), batchId],
  );
}

async function insertContactSourceLegacy(client, contactId, source) {
  const src = String(source?.source || "").trim();
  if (!src) return false;
  const sourceReferenceId = String(source?.sourceReferenceId || "").trim() || null;
  const formName = String(source?.formName || "").trim() || null;
  const pageUrl = String(source?.pageUrl || "").trim() || null;
  const createdAt = parseTimestamp(source?.createdAt) || null;

  const { rowCount } = await client.query(
    `
      insert into contact_sources
      (contact_id, source, source_system, source_reference_id, form_name, page_url, metadata, created_at)
      select
        $1,
        $2,
        'wix',
        $3,
        $4,
        $5,
        $6::jsonb,
        coalesce($7, now())
      where not exists (
        select 1
        from contact_sources
        where contact_id = $1
          and source = $2
          and coalesce(source_reference_id, '') = coalesce($3, '')
          and coalesce(form_name, '') = coalesce($4, '')
          and coalesce(page_url, '') = coalesce($5, '')
      )
    `,
    [contactId, src, sourceReferenceId, formName, pageUrl, JSON.stringify(source?.metadata || {}), createdAt],
  );
  return rowCount > 0;
}

async function ensureLeadForContact(client, contactRow, importContact) {
  if (contactRow?.lead_id) return Number(contactRow.lead_id);

  const email = normalizeEmail(contactRow?.email || importContact.email);
  const phone = normalizePhone(contactRow?.phone_normalized || contactRow?.phone || importContact.phoneNormalized || importContact.phone);

  const matches = await client.query(
    `
      select *
      from leads
      where ($1::text is not null and lower(contact_email) = $1)
         or ($2::text is not null and contact_phone = $2)
      order by created_at asc nulls last, id asc
      limit 1
    `,
    [email || null, phone || null],
  );

  let leadId = matches.rows[0]?.id ? Number(matches.rows[0].id) : null;
  if (!leadId) {
    const name = fullName(contactRow?.first_name, contactRow?.last_name) || email || phone || "Wix Contact";
    const nowIso = new Date().toISOString();
    const insertLead = await client.query(
      `
        insert into leads
        (source, company_name, contact_name, contact_email, contact_phone, notes, tags, metadata, created_at, updated_at)
        values
        ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, coalesce($9, now()), $10)
        returning id
      `,
      [
        "website",
        null,
        name,
        email || null,
        phone || null,
        contactRow?.notes || null,
        JSON.stringify(mergeTags(contactRow?.tags, importContact.tags)),
        JSON.stringify({
          source_system: "wix",
          source_reference_id: importContact.sourceReferenceId || contactRow?.source_reference_id || null,
          imported_from_wix: true,
        }),
        importContact.createdAt || null,
        nowIso,
      ],
    );
    leadId = Number(insertLead.rows[0].id);
  }

  await client.query("update contacts set lead_id = $1, updated_at = now() where id = $2", [leadId, contactRow.id]);
  return leadId;
}

async function insertLeadMessage(client, leadMessagesMode, contactRow, importContact, message) {
  const submittedAt = parseTimestamp(message.submittedAt) || null;
  const createdAt = submittedAt || importContact.createdAt || new Date().toISOString();
  const metadata = {
    source_system: "wix",
    source_reference_id: message.sourceReferenceId || importContact.sourceReferenceId || null,
    form_name: message.formName || null,
    page_url: message.pageUrl || null,
    imported_from_wix: true,
    imported_from_wix_tag: true,
    ...message.metadata,
  };

  if (leadMessagesMode.mode === "contact") {
    if (leadMessagesMode.messageColumn === "message") {
      await client.query(
        `
          insert into lead_messages
          (contact_id, message, form_name, page_url, submitted_at, source_system, source_reference_id, metadata, created_at)
          values ($1, $2, $3, $4, $5, 'wix', $6, $7::jsonb, $8)
        `,
        [
          contactRow.id,
          message.message,
          message.formName || null,
          message.pageUrl || null,
          submittedAt,
          message.sourceReferenceId || importContact.sourceReferenceId || null,
          JSON.stringify(metadata),
          createdAt,
        ],
      );
      return;
    }

    await client.query(
      `
        insert into lead_messages
        (contact_id, content, form_name, page_url, submitted_at, source_system, source_reference_id, metadata, created_at)
        values ($1, $2, $3, $4, $5, 'wix', $6, $7::jsonb, $8)
      `,
      [
        contactRow.id,
        message.message,
        message.formName || null,
        message.pageUrl || null,
        submittedAt,
        message.sourceReferenceId || importContact.sourceReferenceId || null,
        JSON.stringify(metadata),
        createdAt,
      ],
    );
    return;
  }

  const leadId = await ensureLeadForContact(client, contactRow, importContact);
  await client.query(
    `
      insert into lead_messages
      (lead_id, channel, direction, subject, content, sent_by, status, sent_at, metadata, created_at)
      values ($1, 'in_app', 'inbound', $2, $3, 'system', 'sent', $4, $5::jsonb, $6)
    `,
    [leadId, message.formName ? `Wix Form: ${message.formName}` : "Wix Import", message.message, submittedAt, JSON.stringify(metadata), createdAt],
  );
}

async function insertLeadMessageForLead(client, leadId, importContact, message) {
  const submittedAt = parseTimestamp(message.submittedAt) || null;
  const createdAt = submittedAt || importContact.createdAt || new Date().toISOString();
  const metadata = {
    source_system: "wix",
    source_reference_id: message.sourceReferenceId || importContact.sourceReferenceId || null,
    form_name: message.formName || null,
    page_url: message.pageUrl || null,
    imported_from_wix: true,
    imported_from_wix_tag: true,
    ...message.metadata,
  };
  await client.query(
    `
      insert into lead_messages
      (lead_id, channel, direction, subject, content, sent_by, status, sent_at, metadata, created_at)
      values ($1, 'in_app', 'inbound', $2, $3, 'system', 'sent', $4, $5::jsonb, $6)
    `,
    [leadId, message.formName ? `Wix Form: ${message.formName}` : "Wix Import", message.message, submittedAt, JSON.stringify(metadata), createdAt],
  );
}

async function upsertLeadOnly(client, importContact, stats) {
  const email = normalizeEmail(importContact.email) || null;
  const phone = normalizePhone(importContact.phoneNormalized || importContact.phone) || null;

  const existingResult = await client.query(
    `
      select *
      from leads
      where ($1::text is not null and lower(contact_email) = $1)
         or ($2::text is not null and contact_phone = $2)
      order by created_at asc nulls last, id asc
      limit 1
    `,
    [email, phone],
  );

  const existing = existingResult.rows[0] || null;
  const name = fullName(importContact.firstName, importContact.lastName) || email || phone || "Wix Contact";
  const createdAt = earliestTimestamp(existing?.created_at, importContact.createdAt) || new Date().toISOString();
  const tagsArray = mergeTags(existing?.tags, importContact.tags);
  const notes = combineNotes(existing?.notes, importContact.notes);

  const baseMetadata = existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  const sourceRecords = Array.isArray(baseMetadata?.source_records) ? baseMetadata.source_records : [];
  for (const source of importContact.sources) {
    sourceRecords.push({
      source: source.source || null,
      source_reference_id: source.sourceReferenceId || null,
      form_name: source.formName || null,
      page_url: source.pageUrl || null,
      created_at: source.createdAt || null,
    });
  }

  const metadata = {
    ...baseMetadata,
    source_system: "wix",
    source_reference_id: importContact.sourceReferenceId || baseMetadata?.source_reference_id || null,
    imported_from_wix: true,
    imported_at: new Date().toISOString(),
    is_subscriber: Boolean(importContact.isSubscriber) || Boolean(baseMetadata?.is_subscriber),
    is_member: Boolean(importContact.isMember) || Boolean(baseMetadata?.is_member),
    member_since: earliestTimestamp(importContact.memberSince, baseMetadata?.member_since || null),
    source_records: sourceRecords,
  };

  let leadId = null;
  if (!existing) {
    const inserted = await client.query(
      `
        insert into leads
        (source, company_name, contact_name, contact_email, contact_phone, notes, tags, metadata, created_at, updated_at)
        values
        ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, now())
        returning id
      `,
      ["website", null, name, email, phone, notes || null, JSON.stringify(tagsArray), JSON.stringify(metadata), createdAt],
    );
    leadId = Number(inserted.rows[0].id);
    stats.contactsCreated += 1;
  } else {
    const updated = await client.query(
      `
        update leads
        set
          source = $1,
          contact_name = $2,
          contact_email = $3,
          contact_phone = $4,
          notes = $5,
          tags = $6::jsonb,
          metadata = coalesce(metadata, '{}'::jsonb) || $7::jsonb,
          created_at = $8,
          updated_at = now()
        where id = $9
        returning id
      `,
      [
        existing.source || "website",
        preferString(existing.contact_name, name) || null,
        preferString(existing.contact_email, email) || null,
        preferString(existing.contact_phone, phone) || null,
        notes || null,
        JSON.stringify(tagsArray),
        JSON.stringify(metadata),
        createdAt,
        existing.id,
      ],
    );
    leadId = Number(updated.rows[0].id);
    stats.contactsUpdated += 1;
  }

  stats.tagsLinked += tagsArray.length;
  stats.sourcesLinked += importContact.sources.length;

  for (const message of importContact.messages) {
    await insertLeadMessageForLead(client, leadId, importContact, message);
    stats.messagesInserted += 1;
  }
}

async function upsertContact(client, importContact, leadMessagesMode, maps, stats, tenantId = null, importBatchId = null) {
  const candidates = candidateRowsForContact(importContact, maps.byEmail, maps.byPhone);
  let existing = candidates[0] || null;

  if (candidates.length > 1) {
    for (let i = 1; i < candidates.length; i += 1) {
      existing = await mergeDuplicateExistingContacts(client, existing, candidates[i], leadMessagesMode, stats);
      removeFromMaps(candidates[i], maps.byEmail, maps.byPhone);
    }
  }

  const email = normalizeEmail(importContact.email) || null;
  const phoneNormalized = normalizePhone(importContact.phoneNormalized || importContact.phone) || null;
  const tagsArray = mergeTags(existing?.tags, importContact.tags);
  const notes = combineNotes(existing?.notes, importContact.notes);
  const createdAt = earliestTimestamp(existing?.created_at, importContact.createdAt) || new Date().toISOString();
  const memberSince = earliestTimestamp(existing?.member_since, importContact.memberSince);
  const metadata = {
    ...(existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {}),
    source_system: "wix",
    source_reference_id: importContact.sourceReferenceId || existing?.source_reference_id || null,
    imported_from_wix: true,
    imported_at: new Date().toISOString(),
  };

  let contactRow = null;
  if (!existing) {
    const insertRes = await client.query(
      `
        insert into contacts
        (
          tenant_id,
          wix_contact_id,
          first_name,
          last_name,
          email,
          phone,
          phone_normalized,
          source,
          source_system,
          source_reference_id,
          notes,
          tags,
          is_subscriber,
          is_member,
          member_since,
          imported_from_wix,
          import_batch_id,
          metadata,
          created_at,
          updated_at
        )
        values
        ($1, $2, $3, $4, $5, $6, $7, $8, 'wix', $9, $10, $11::jsonb, $12, $13, $14, true, $15, $16::jsonb, $17, now())
        returning *
      `,
      [
        tenantId,
        importContact.wixContactId || null,
        importContact.firstName || null,
        importContact.lastName || null,
        email,
        importContact.phone || null,
        phoneNormalized,
        importContact.source || "wix_contact",
        importContact.sourceReferenceId || null,
        notes || null,
        JSON.stringify(tagsArray),
        Boolean(importContact.isSubscriber),
        Boolean(importContact.isMember),
        memberSince,
        importBatchId,
        JSON.stringify(metadata),
        createdAt,
      ],
    );
    contactRow = insertRes.rows[0];
    stats.contactsCreated += 1;
  } else {
    const updateRes = await client.query(
      `
        update contacts
        set
          tenant_id = coalesce(tenant_id, $1),
          import_batch_id = coalesce($2, import_batch_id),
          wix_contact_id = $3,
          first_name = $4,
          last_name = $5,
          email = $6,
          phone = $7,
          phone_normalized = $8,
          source = $9,
          source_system = 'wix',
          source_reference_id = $10,
          notes = $11,
          tags = $12::jsonb,
          is_subscriber = $13,
          is_member = $14,
          member_since = $15,
          imported_from_wix = true,
          metadata = coalesce(metadata, '{}'::jsonb) || $16::jsonb,
          created_at = $17,
          updated_at = now()
        where id = $18
        returning *
      `,
      [
        tenantId,
        importBatchId,
        preferString(existing.wix_contact_id, importContact.wixContactId) || null,
        preferString(existing.first_name, importContact.firstName) || null,
        preferString(existing.last_name, importContact.lastName) || null,
        preferString(existing.email, email) || null,
        preferString(existing.phone, importContact.phone) || null,
        preferString(existing.phone_normalized, phoneNormalized) || null,
        preferString(existing.source, importContact.source) || "wix_contact",
        preferString(existing.source_reference_id, importContact.sourceReferenceId) || null,
        notes || null,
        JSON.stringify(tagsArray),
        Boolean(existing.is_subscriber) || Boolean(importContact.isSubscriber),
        Boolean(existing.is_member) || Boolean(importContact.isMember),
        memberSince,
        JSON.stringify(metadata),
        createdAt,
        existing.id,
      ],
    );
    contactRow = updateRes.rows[0];
    stats.contactsUpdated += 1;
  }

  updateMapsWithContact(contactRow, maps.byEmail, maps.byPhone);

  const allTags = new Set(tagsArray);
  allTags.add("imported_from_wix");
  for (const tag of allTags) {
    if (await insertContactTag(client, tenantId, contactRow.id, tag)) stats.tagsLinked += 1;
  }

  for (const source of importContact.sources) {
    if (await insertContactSource(client, tenantId, contactRow.id, source)) stats.sourcesLinked += 1;
  }

  for (const message of importContact.messages) {
    await insertLeadMessage(client, leadMessagesMode, contactRow, importContact, message);
    stats.messagesInserted += 1;
  }
}

async function sampleImportedContacts(client, limit = 5, storageMode = "contacts", tenantId = null) {
  if (storageMode === "leads_only") {
    const { rows } = await client.query(
      `
        select
          l.id,
          split_part(coalesce(l.contact_name, ''), ' ', 1) as first_name,
          nullif(substring(coalesce(l.contact_name, '') from '[^ ]+$'), '') as last_name,
          l.contact_email as email,
          l.contact_phone as phone,
          coalesce(l.metadata->>'source_system', 'wix') as source_system,
          (coalesce(l.metadata, '{}'::jsonb) @> '{"imported_from_wix": true}'::jsonb) as imported_from_wix,
          coalesce(count(lm.id), 0) as messages_count
        from leads l
        left join lead_messages lm on lm.lead_id = l.id
        where (coalesce(l.metadata, '{}'::jsonb) @> '{"imported_from_wix": true}'::jsonb)
        group by l.id
        order by l.updated_at desc nulls last, l.id desc
        limit $1
      `,
      [limit],
    );
    return rows;
  }

  const { rows } = await client.query(
    `
      select
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        c.source_system,
        c.imported_from_wix,
        coalesce(count(lm.id), 0) as messages_count
      from contacts c
      left join lead_messages lm
        on (
          (lm.contact_id = c.id)
          or (c.lead_id is not null and lm.lead_id = c.lead_id)
        )
      where c.imported_from_wix = true
        and ($2::int is null or c.tenant_id = $2)
      group by c.id
      order by c.updated_at desc nulls last, c.id desc
      limit $1
    `,
    [limit, tenantId],
  );
  return rows;
}

function buildReportMarkdown(stats, mode, sampleRows) {
  const lines = [];
  lines.push("# Wix CRM Import Report");
  lines.push("");
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Mode: ${mode}`);
  lines.push(`- Source folder: \`imports/wix\``);
  if (stats.notes) lines.push(`- Notes: ${stats.notes}`);
  lines.push("");
  lines.push("## Input Summary");
  lines.push("");
  lines.push(`- contacts.csv rows: ${stats.contactsRows}`);
  lines.push(`- forms/*.csv files: ${stats.formFiles}`);
  lines.push(`- forms/*.csv rows: ${stats.formsRows}`);
  lines.push(`- subscribers.csv rows: ${stats.subscribersRows}`);
  lines.push(`- members.csv rows: ${stats.membersRows}`);
  lines.push(`- contacts prepared from all sources: ${stats.contactsPrepared}`);
  lines.push(`- lead messages prepared: ${stats.messagesPrepared}`);
  lines.push(`- input duplicates merged: ${stats.inputDuplicatesMerged}`);
  lines.push("");
  lines.push("## Import Results");
  lines.push("");
  lines.push(`- contacts created: ${stats.contactsCreated}`);
  lines.push(`- contacts updated: ${stats.contactsUpdated}`);
  lines.push(`- duplicates merged (database): ${stats.duplicatesMerged}`);
  lines.push(`- tags linked: ${stats.tagsLinked}`);
  lines.push(`- sources linked: ${stats.sourcesLinked}`);
  lines.push(`- lead messages inserted: ${stats.messagesInserted}`);
  lines.push(`- errors: ${stats.errors.length}`);
  lines.push("");

  lines.push("## Sample Check");
  lines.push("");
  if (!sampleRows.length) {
    lines.push("- No imported contacts found in current transaction scope.");
  } else {
    for (const row of sampleRows) {
      const name = fullName(row.first_name, row.last_name) || "(no name)";
      lines.push(
        `- id=${row.id} | ${name} | ${row.email || row.phone || "(no direct contact)"} | source_system=${row.source_system || "n/a"} | imported_from_wix=${row.imported_from_wix} | messages=${row.messages_count}`,
      );
    }
  }
  lines.push("");

  lines.push("## Errors");
  lines.push("");
  if (stats.errors.length === 0) {
    lines.push("- None");
  } else {
    for (const err of stats.errors.slice(0, 200)) {
      lines.push(`- ${err}`);
    }
    if (stats.errors.length > 200) {
      lines.push(`- ... ${stats.errors.length - 200} more`);
    }
  }
  lines.push("");
  if (Array.isArray(stats.warnings) && stats.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const warning of stats.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function ensureImportScaffold() {
  await fs.mkdir(IMPORT_ROOT, { recursive: true });
  await fs.mkdir(FORMS_ROOT, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv);
  await loadLocalEnv();
  await ensureImportScaffold();

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Set it in environment or .env before running import.");
  }

  const stats = {
    contactsRows: 0,
    formsRows: 0,
    subscribersRows: 0,
    membersRows: 0,
    formFiles: 0,
    contactsPrepared: 0,
    messagesPrepared: 0,
    inputDuplicatesMerged: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    duplicatesMerged: 0,
    tagsLinked: 0,
    sourcesLinked: 0,
    messagesInserted: 0,
    warnings: [],
    notes: "",
    errors: [],
  };

  const loaded = await loadWixInputFiles(stats, args);
  stats.contactsPrepared = loaded.contacts.length;
  stats.inputDuplicatesMerged = loaded.dedupeMergedInInput;

  const client = new Client({ connectionString: databaseUrl });
  let clientAsyncError = null;
  client.on("error", (error) => {
    clientAsyncError = error;
  });
  try {
    await client.connect();
    await client.query("begin");

    await client.query("set local lock_timeout = '3000ms'");
    let resolvedTenantId =
      args.tenantId ||
      (Number.parseInt(String(process.env.TENANT_ID || process.env.DEFAULT_TENANT_ID || ""), 10) || null);
    if (!resolvedTenantId) {
      const tenantProbe = await client.query("select id from tenants order by id asc limit 2");
      if (tenantProbe.rows.length === 1) {
        resolvedTenantId = Number(tenantProbe.rows[0].id);
      } else {
        stats.warnings.push("tenant_id was not provided and multiple tenants exist; imported contacts may remain unscoped.");
      }
    }
    if (resolvedTenantId) {
      stats.notes = stats.notes ? `${stats.notes}; tenant_id=${resolvedTenantId}` : `tenant_id=${resolvedTenantId}`;
    }

    let storageMode = "contacts";
    let leadMessagesMode = null;
    let maps = null;
    let importBatchId = null;

    try {
      await ensureContactsModel(client);
      leadMessagesMode = await ensureLeadMessagesModel(client);
      maps = await preloadExistingContacts(client, loaded.contacts, resolvedTenantId);
      importBatchId = await createImportBatch(client, resolvedTenantId, args);
    } catch (error) {
      if (!isLockTimeoutError(error)) throw error;
      await client.query("rollback");
      await client.query("begin");
      storageMode = "leads_only";
      leadMessagesMode = await detectExistingLeadMessagesMode(client);
      stats.warnings.push(
        "Schema lock timeout detected while ensuring contacts/contact_sources/contact_tags; fallback mode imported into existing leads + lead_messages only.",
      );
    }

    for (const contact of loaded.contacts) {
      try {
        if (storageMode === "contacts") {
          await upsertContact(client, contact, leadMessagesMode, maps, stats, resolvedTenantId, importBatchId);
        } else {
          await upsertLeadOnly(client, contact, stats);
        }
      } catch (error) {
        stats.errors.push(
          `${fullName(contact.firstName, contact.lastName) || contact.email || contact.phone || contact.id}: ${
            error?.message || String(error)
          }`,
        );
      }
    }

    if (storageMode === "contacts" && importBatchId) {
      await finishImportBatch(client, importBatchId, stats.errors.length > 0 ? "failed" : "completed", stats);
    }

    const modeForReport = `${args.commit ? "commit" : "dry-run"} (${storageMode})`;
    const reportSample = await sampleImportedContacts(client, 8, storageMode, resolvedTenantId);
    const report = buildReportMarkdown(stats, modeForReport, reportSample);
    await fs.writeFile(REPORT_PATH, report, "utf8");

    if (args.commit) {
      await client.query("commit");
    } else {
      await client.query("rollback");
    }

    const modeLabel = args.commit ? "COMMIT" : "DRY-RUN";
    console.log(`[import-wix] mode=${modeLabel} storage=${storageMode}`);
    console.log(
      `[import-wix] contacts prepared=${stats.contactsPrepared} created=${stats.contactsCreated} updated=${stats.contactsUpdated} merged=${stats.duplicatesMerged}`,
    );
    console.log(
      `[import-wix] messages prepared=${stats.messagesPrepared} inserted=${stats.messagesInserted} tags=${stats.tagsLinked} sources=${stats.sourcesLinked}`,
    );
    console.log(`[import-wix] errors=${stats.errors.length}`);
    console.log(`[import-wix] report=${path.relative(process.cwd(), REPORT_PATH)}`);
    if (clientAsyncError) {
      console.warn(`[import-wix] warning=client-error ${clientAsyncError.message || clientAsyncError}`);
    }
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // noop
    }
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[import-wix] failed:", error?.message || error);
  process.exit(1);
});
