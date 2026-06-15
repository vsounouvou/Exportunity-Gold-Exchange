import { boolean, decimal, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { agentsProduction } from "./agents-production";
import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const pmeLeadSourceEnum = pgEnum("pme_lead_source", ["google_places", "manual", "import", "facebook", "referral", "seeded"]);
export const pmeLeadStatusEnum = pgEnum("pme_lead_status", [
  "new",
  "enriched",
  "qualified",
  "contact_ready",
  "contacted",
  "replied",
  "interested",
  "not_interested",
  "onboarded",
  "rejected",
  "suppressed",
]);
export const pmeCampaignStatusEnum = pgEnum("pme_campaign_status", ["draft", "test", "running", "paused", "completed"]);
export const pmeOutreachChannelEnum = pgEnum("pme_outreach_channel", ["whatsapp", "sms", "email", "call"]);
export const pmeMessageDirectionEnum = pgEnum("pme_message_direction", ["in", "out"]);
export const pmeInvestmentReadinessEnum = pgEnum("pme_investment_readiness", ["none", "early", "review_ready", "approved", "listed"]);

export const pmeLeads = pgTable(
  "pme_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    source: pmeLeadSourceEnum("source").notNull().default("manual"),
    googlePlaceId: text("google_place_id"),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description"),
    category: text("category"),
    primaryType: text("primary_type"),
    types: jsonb("types").$type<string[]>().default([]),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    phone: text("phone"),
    whatsappPhone: text("whatsapp_phone"),
    website: text("website"),
    googleMapsUrl: text("google_maps_url"),
    rating: decimal("rating", { precision: 3, scale: 2 }),
    reviewCount: integer("review_count"),
    businessStatus: text("business_status"),
    openingHours: jsonb("opening_hours").$type<Record<string, unknown>>().default({}),
    leadStatus: pmeLeadStatusEnum("lead_status").notNull().default("new"),
    qualificationScore: integer("qualification_score").notNull().default(0),
    investmentPotentialScore: integer("investment_potential_score").notNull().default(0),
    revenueVisibilityScore: integer("revenue_visibility_score").notNull().default(0),
    contactStatus: text("contact_status").default("not_contacted"),
    lastContactedAt: timestamp("last_contacted_at"),
    lastEnrichedAt: timestamp("last_enriched_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    googlePlaceUnique: uniqueIndex("pme_leads_tenant_google_place_unique").on(t.tenantId, t.googlePlaceId),
    byTenantCityStatus: index("pme_leads_tenant_city_status_idx").on(t.tenantId, t.city, t.leadStatus),
    byTenantScore: index("pme_leads_tenant_score_idx").on(t.tenantId, t.qualificationScore),
    byTenantName: index("pme_leads_tenant_normalized_name_idx").on(t.tenantId, t.normalizedName),
  }),
);

export const pmeOutreachCampaigns = pgTable(
  "pme_outreach_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    targetCity: text("target_city"),
    targetCategories: jsonb("target_categories").$type<string[]>().default([]),
    messageTemplateId: text("message_template_id"),
    status: pmeCampaignStatusEnum("status").notNull().default("draft"),
    dailyLimit: integer("daily_limit").notNull().default(10),
    agentId: integer("agent_id").references(() => agentsProduction.id, { onDelete: "set null" }),
    createdBy: integer("created_by").references(() => eceUsers.id, { onDelete: "set null" }),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("pme_campaigns_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const pmeOutreachMessages = pgTable(
  "pme_outreach_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").references(() => pmeOutreachCampaigns.id, { onDelete: "cascade" }),
    pmeLeadId: uuid("pme_lead_id").references(() => pmeLeads.id, { onDelete: "cascade" }).notNull(),
    channel: pmeOutreachChannelEnum("channel").notNull(),
    direction: pmeMessageDirectionEnum("direction").notNull().default("out"),
    twilioSid: text("twilio_sid"),
    templateName: text("template_name"),
    messageBody: text("message_body").notNull(),
    status: text("status").notNull().default("draft"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at"),
    deliveredAt: timestamp("delivered_at"),
    repliedAt: timestamp("replied_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    byLeadCreated: index("pme_outreach_messages_lead_created_idx").on(t.pmeLeadId, t.createdAt),
    byCampaignStatus: index("pme_outreach_messages_campaign_status_idx").on(t.campaignId, t.status),
  }),
);

export const pmeAgentConversations = pgTable(
  "pme_agent_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pmeLeadId: uuid("pme_lead_id").references(() => pmeLeads.id, { onDelete: "cascade" }).notNull(),
    agentId: integer("agent_id").references(() => agentsProduction.id, { onDelete: "set null" }),
    threadId: text("thread_id"),
    summary: text("summary"),
    nextStep: text("next_step"),
    sentiment: text("sentiment"),
    qualificationResult: jsonb("qualification_result").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    byLead: index("pme_agent_conversations_lead_idx").on(t.pmeLeadId),
    byThread: index("pme_agent_conversations_thread_idx").on(t.threadId),
  }),
);

export const pmeExchangeProfiles = pgTable(
  "pme_exchange_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pmeLeadId: uuid("pme_lead_id").references(() => pmeLeads.id, { onDelete: "cascade" }).notNull(),
    companyName: text("company_name").notNull(),
    verifiedStatus: text("verified_status").notNull().default("unverified"),
    onboardingStatus: text("onboarding_status").notNull().default("not_started"),
    productsCount: integer("products_count").notNull().default(0),
    monthlyRevenueEstimate: decimal("monthly_revenue_estimate", { precision: 14, scale: 2 }),
    verifiedMonthlyRevenue: decimal("verified_monthly_revenue", { precision: 14, scale: 2 }),
    financingNeed: decimal("financing_need", { precision: 14, scale: 2 }),
    royaltyPossible: boolean("royalty_possible").notNull().default(false),
    investmentReadiness: pmeInvestmentReadinessEnum("investment_readiness").notNull().default("none"),
    documents: jsonb("documents").$type<Record<string, unknown>[]>().default([]),
    riskScore: integer("risk_score").notNull().default(0),
    agentNotes: text("agent_notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    byLeadUnique: uniqueIndex("pme_exchange_profiles_lead_unique").on(t.pmeLeadId),
    byReadiness: index("pme_exchange_profiles_readiness_idx").on(t.investmentReadiness),
  }),
);
