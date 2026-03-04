import { index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const contactMessages = pgTable(
  "contact_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),

    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    company: text("company"),
    message: text("message").notNull(),
    source: text("source"),

    notifyStatus: text("notify_status").notNull().default("pending"), // pending|sent|failed|skipped
    notifyError: text("notify_error"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),

    userAgent: text("user_agent"),
    ip: text("ip"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("contact_messages_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export const contactStatusEnum = pgEnum("contact_status", ["lead", "warm", "customer", "vip", "dnc"]);
export const contactConsentStatusEnum = pgEnum("contact_consent_status", ["unknown", "opt_in", "opt_out"]);
export const contactIdentityKindEnum = pgEnum("contact_identity_kind", ["email", "phone"]);
export const contactImportStatusEnum = pgEnum("contact_import_status", ["queued", "running", "completed", "failed", "rolled_back"]);
export const tenantContactScopeEnum = pgEnum("tenant_contact_scope", ["tenant_shared", "private_to_user", "shared_to_team"]);
export const tenantContactStatusEnum = pgEnum("tenant_contact_status", ["active", "archived"]);

export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),

    displayName: text("display_name"),
    givenName: text("given_name"),
    familyName: text("family_name"),
    company: text("company"),
    jobTitle: text("job_title"),

    phones: jsonb("phones").$type<string[]>().notNull().default([]),
    emails: jsonb("emails").$type<string[]>().notNull().default([]),
    primaryPhoneE164: text("primary_phone_e164"),
    primaryEmail: text("primary_email"),

    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: contactStatusEnum("status").notNull().default("lead"),
    consentStatus: contactConsentStatusEnum("consent_status").notNull().default("unknown"),
    isDnc: boolean("is_dnc").notNull().default(false),

    notes: text("notes"),
    source: text("source"),
    sourceSystem: text("source_system").notNull().default("manual"),
    sourceReferenceId: text("source_reference_id"),
    importedFromWix: boolean("imported_from_wix").notNull().default(false),
    importBatchId: integer("import_batch_id"),
    dedupeKey: text("dedupe_key"),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),

    // Backward-compatible legacy columns used by existing import pipeline and integrations.
    wixContactId: text("wix_contact_id"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    isSubscriber: boolean("is_subscriber").notNull().default(false),
    isMember: boolean("is_member").notNull().default(false),
    memberSince: timestamp("member_since", { withTimezone: true }),
    leadId: integer("lead_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("contacts_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("contacts_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    byTenantPrimaryEmail: index("contacts_tenant_primary_email_idx").on(t.tenantId, t.primaryEmail),
    byTenantPrimaryPhone: index("contacts_tenant_primary_phone_idx").on(t.tenantId, t.primaryPhoneE164),
    byTenantLegacyEmail: index("contacts_tenant_email_idx").on(t.tenantId, t.email),
    byTenantLegacyPhone: index("contacts_tenant_phone_idx").on(t.tenantId, t.phoneNormalized),
    dedupeKeyIdx: uniqueIndex("contacts_dedupe_key_uniq").on(t.dedupeKey),
    createdByUserIdx: index("contacts_created_by_user_idx").on(t.createdByUserId),
  }),
);

export const tenantContacts = pgTable(
  "tenant_contacts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    contactId: integer("contact_id")
      .references(() => contacts.id, { onDelete: "cascade" })
      .notNull(),
    scope: tenantContactScopeEnum("scope").notNull().default("tenant_shared"),
    ownerUserId: integer("owner_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    status: tenantContactStatusEnum("status").notNull().default("active"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    crmStatus: contactStatusEnum("crm_status").notNull().default("lead"),
    consentStatus: contactConsentStatusEnum("consent_status").notNull().default("unknown"),
    isDnc: boolean("is_dnc").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantContact: uniqueIndex("tenant_contacts_tenant_contact_uniq").on(t.tenantId, t.contactId),
    byTenantStatus: index("tenant_contacts_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
    byTenantCrmStatus: index("tenant_contacts_tenant_crm_status_idx").on(t.tenantId, t.crmStatus, t.updatedAt),
    byTenantConsent: index("tenant_contacts_tenant_consent_idx").on(t.tenantId, t.consentStatus, t.updatedAt),
    byContactId: index("tenant_contacts_contact_idx").on(t.contactId),
  }),
);

export const contactIdentities = pgTable(
  "contact_identities",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    contactId: integer("contact_id")
      .references(() => contacts.id, { onDelete: "cascade" })
      .notNull(),
    kind: contactIdentityKindEnum("kind").notNull(),
    value: text("value").notNull(),
    valueNormalized: text("value_normalized").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueIdentity: uniqueIndex("contact_identities_tenant_kind_value_uniq").on(t.tenantId, t.kind, t.valueNormalized),
    byTenantContact: index("contact_identities_tenant_contact_idx").on(t.tenantId, t.contactId),
  }),
);

export const contactTags = pgTable(
  "contact_tags",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    contactId: integer("contact_id")
      .references(() => contacts.id, { onDelete: "cascade" })
      .notNull(),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantContact: index("contact_tags_tenant_contact_idx").on(t.tenantId, t.contactId),
    byTenantTag: index("contact_tags_tenant_tag_idx").on(t.tenantId, t.tag),
  }),
);

export const contactSources = pgTable(
  "contact_sources",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    contactId: integer("contact_id")
      .references(() => contacts.id, { onDelete: "cascade" })
      .notNull(),
    source: text("source").notNull(),
    sourceSystem: text("source_system").notNull().default("manual"),
    sourceReferenceId: text("source_reference_id"),
    formName: text("form_name"),
    pageUrl: text("page_url"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantContact: index("contact_sources_tenant_contact_idx").on(t.tenantId, t.contactId),
    byTenantSource: index("contact_sources_tenant_source_idx").on(t.tenantId, t.source),
  }),
);

export const contactImportBatches = pgTable(
  "contact_import_batches",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    source: text("source").notNull(),
    accountLabel: text("account_label"),
    status: contactImportStatusEnum("status").notNull().default("queued"),
    mode: text("mode").notNull().default("dry_run"),
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
    errors: jsonb("errors").$type<unknown[]>().notNull().default([]),
    createdByUserId: integer("created_by_user_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("contact_import_batches_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("contact_import_batches_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const contactImportRows = pgTable(
  "contact_import_rows",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .references(() => contactImportBatches.id, { onDelete: "cascade" })
      .notNull(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sourceReferenceId: text("source_reference_id"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    result: text("result"),
    error: text("error"),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byBatch: index("contact_import_rows_batch_idx").on(t.batchId, t.id),
    byTenant: index("contact_import_rows_tenant_idx").on(t.tenantId, t.id),
  }),
);

export const contactAttachments = pgTable(
  "contact_attachments",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    type: text("type").notNull().default("business_card"),
    fileUrl: text("file_url").notNull(),
    extractedJson: jsonb("extracted_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("contact_attachments_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantContact: index("contact_attachments_tenant_contact_idx").on(t.tenantId, t.contactId),
  }),
);
