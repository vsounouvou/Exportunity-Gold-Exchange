import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const investmentOpportunityTypeEnum = pgEnum("investment_opportunity_type", [
  "sme",
  "machinery",
  "farm",
  "factory",
  "gold",
  "commodities",
]);

export const investmentOpportunityStatusEnum = pgEnum("investment_opportunity_status", ["draft", "published", "archived"]);

export const investmentContractStatusEnum = pgEnum("investment_contract_status", [
  "draft",
  "proposed",
  "signed",
  "funded",
  "active",
  "completed",
  "terminated",
  "disputed",
]);

export const investmentMilestoneStatusEnum = pgEnum("investment_milestone_status", [
  "pending",
  "submitted",
  "approved",
  "rejected",
  "released",
  "overdue",
]);

export const investmentTransactionTypeEnum = pgEnum("investment_transaction_type", [
  "fund",
  "escrow_hold",
  "vendor_payment",
  "wallet_release",
  "refund",
  "payout",
  "fee",
  "marketing_credit_purchase",
  "marketing_credit_spend",
]);

export const investorLeadStatusEnum = pgEnum("investor_lead_status", ["new", "qualified", "onboarding", "closed_lost", "closed_won"]);

export const investmentOpportunities = pgTable(
  "investment_opportunities",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    type: investmentOpportunityTypeEnum("type").notNull().default("sme"),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    country: text("country"),
    trackRecordBadge: text("track_record_badge").notNull().default("Verified on platform"),
    fundingGoalMin: decimal("funding_goal_min", { precision: 20, scale: 2 }),
    fundingGoalMax: decimal("funding_goal_max", { precision: 20, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    useOfFunds: jsonb("use_of_funds").$type<string[]>().notNull().default([]),
    contractDurationMonths: integer("contract_duration_months"),
    trackedKpis: jsonb("tracked_kpis").$type<string[]>().notNull().default([]),
    returnModel: text("return_model"),
    riskNotes: text("risk_notes"),
    mitigations: text("mitigations"),
    narrative: text("narrative"),
    fundingPlan: jsonb("funding_plan").$type<Record<string, unknown>>().notNull().default({}),
    status: investmentOpportunityStatusEnum("status").notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("investment_opportunities_tenant_status_idx").on(t.tenantId, t.status, t.sortOrder),
    byTenantType: index("investment_opportunities_tenant_type_idx").on(t.tenantId, t.type, t.sortOrder),
    byTenantPublished: index("investment_opportunities_tenant_published_idx").on(t.tenantId, t.publishedAt),
    tenantSlugUnique: uniqueIndex("investment_opportunities_tenant_slug_uniq").on(t.tenantId, t.slug),
  }),
);

export const investmentContracts = pgTable(
  "investment_contracts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    opportunityId: integer("opportunity_id").references(() => investmentOpportunities.id, { onDelete: "set null" }),
    contractCode: text("contract_code").notNull(),
    parties: jsonb("parties").$type<Record<string, unknown>>().notNull().default({}),
    amount: decimal("amount", { precision: 20, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    terms: jsonb("terms").$type<Record<string, unknown>>().notNull().default({}),
    status: investmentContractStatusEnum("status").notNull().default("draft"),
    escrowWalletRef: text("escrow_wallet_ref"),
    spendRestrictionMode: text("spend_restriction_mode").notNull().default("vendor_direct"),
    reportingCadence: text("reporting_cadence").notNull().default("monthly"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    fundedAt: timestamp("funded_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    terminatedAt: timestamp("terminated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("investment_contracts_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    byTenantOpportunity: index("investment_contracts_tenant_opportunity_idx").on(t.tenantId, t.opportunityId),
    contractCodeUnique: uniqueIndex("investment_contracts_contract_code_uniq").on(t.contractCode),
  }),
);

export const investmentMilestones = pgTable(
  "investment_milestones",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    contractId: integer("contract_id")
      .references(() => investmentContracts.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    description: text("description"),
    amountToRelease: decimal("amount_to_release", { precision: 20, scale: 2 }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    evidenceSchema: jsonb("evidence_schema").$type<Record<string, unknown>>().notNull().default({}),
    evidenceSubmitted: jsonb("evidence_submitted").$type<Record<string, unknown>>().notNull().default({}),
    verifier: text("verifier"),
    status: investmentMilestoneStatusEnum("status").notNull().default("pending"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantContract: index("investment_milestones_tenant_contract_idx").on(t.tenantId, t.contractId, t.dueDate),
    byTenantStatus: index("investment_milestones_tenant_status_idx").on(t.tenantId, t.status, t.dueDate),
  }),
);

export const investmentTransactions = pgTable(
  "investment_transactions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    contractId: integer("contract_id")
      .references(() => investmentContracts.id, { onDelete: "cascade" })
      .notNull(),
    milestoneId: integer("milestone_id").references(() => investmentMilestones.id, { onDelete: "set null" }),
    txType: investmentTransactionTypeEnum("tx_type").notNull(),
    amount: decimal("amount", { precision: 20, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    fromWallet: text("from_wallet"),
    toWallet: text("to_wallet"),
    externalRef: text("external_ref"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantContract: index("investment_transactions_tenant_contract_idx").on(t.tenantId, t.contractId, t.createdAt),
    byTenantType: index("investment_transactions_tenant_type_idx").on(t.tenantId, t.txType, t.createdAt),
  }),
);

export const investmentReports = pgTable(
  "investment_reports",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    contractId: integer("contract_id")
      .references(() => investmentContracts.id, { onDelete: "cascade" })
      .notNull(),
    period: text("period").notNull(),
    kpis: jsonb("kpis").$type<Record<string, unknown>>().notNull().default({}),
    narrative: text("narrative"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantContract: index("investment_reports_tenant_contract_idx").on(t.tenantId, t.contractId, t.createdAt),
    byTenantPeriod: index("investment_reports_tenant_period_idx").on(t.tenantId, t.period),
  }),
);

export const marketingCredits = pgTable(
  "marketing_credits",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    contractId: integer("contract_id").references(() => investmentContracts.id, { onDelete: "set null" }),
    credits: integer("credits").notNull().default(0),
    spent: integer("spent").notNull().default(0),
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("marketing_credits_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantContract: index("marketing_credits_tenant_contract_idx").on(t.tenantId, t.contractId),
  }),
);

export const investorLeads = pgTable(
  "investor_leads",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    country: text("country"),
    investorType: text("investor_type"),
    interestTags: jsonb("interest_tags").$type<string[]>().notNull().default([]),
    message: text("message"),
    status: investorLeadStatusEnum("status").notNull().default("new"),
    notifyStatus: text("notify_status").notNull().default("pending"),
    notifyError: text("notify_error"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    sourceUrl: text("source_url"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("investor_leads_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("investor_leads_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    byTenantEmail: index("investor_leads_tenant_email_idx").on(t.tenantId, t.email),
  }),
);
