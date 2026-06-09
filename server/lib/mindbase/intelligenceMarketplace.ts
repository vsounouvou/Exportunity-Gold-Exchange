import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@db";
import {
  agents,
  companies,
  departments,
  intelligenceAssets,
  knowledgeDocuments,
  knowledgeSpaces,
  mindbaseBrainEvents,
  mindbaseEvents,
  mindbaseOrgChannels,
  mindbaseOrganizationPlatforms,
  mindbaseOrganizations,
  mindbaseTenantPlatforms,
  organizationAssets,
} from "@db/schema";

import { createGovernedCronJob } from "../intelligence/service";
import { getTenantAgents, getTenantMetrics } from "../tenant-bridge";
import { listMindbaseOrganizationsForUser } from "./organizations";

type MarketplaceAssetType = "agent" | "knowledge" | "automation";
type MarketplaceCategory = "Agents" | "Knowledge" | "Automations" | "Templates";

type MarketplaceAssetSeed = {
  type: MarketplaceAssetType;
  name: string;
  description: string;
  category: MarketplaceCategory;
  tags: string[];
  price: number;
  rating: number;
  visibility?: string;
};

type MarketplaceOrganizationContext = {
  organization: typeof mindbaseOrganizations.$inferSelect;
  primaryPlatform: typeof mindbaseTenantPlatforms.$inferSelect | null;
  platformTenantId: number | null;
  company: typeof companies.$inferSelect | null;
  departments: Array<typeof departments.$inferSelect>;
  channels: Array<typeof mindbaseOrgChannels.$inferSelect>;
  agents: Awaited<ReturnType<typeof getTenantAgents>>;
  metrics: Awaited<ReturnType<typeof getTenantMetrics>>;
  installations: Array<typeof organizationAssets.$inferSelect>;
  installedAssetRows: Array<typeof intelligenceAssets.$inferSelect>;
};

const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = ["Agents", "Knowledge", "Automations", "Templates"];

const DEFAULT_METRICS = {
  activeAgents: 0,
  inboxThreads: 0,
  inboundToday: 0,
  pendingApprovals: 0,
  failedRuns: 0,
  queuedTasks: 0,
  connectedChannels: 0,
};

const DEFAULT_INTELLIGENCE_ASSETS: MarketplaceAssetSeed[] = [
  {
    type: "agent",
    name: "Customer Support Agent",
    description: "Handles customer conversations, triages inbound issues, and maintains consistent service coverage.",
    category: "Agents",
    tags: ["support", "customer service", "inbox", "crm", "whatsapp"],
    price: 299,
    rating: 4.9,
  },
  {
    type: "agent",
    name: "Sales Agent",
    description: "Qualifies leads, follows up on revenue opportunities, and keeps the pipeline moving.",
    category: "Agents",
    tags: ["sales", "crm", "pipeline", "lead follow-up", "revenue"],
    price: 349,
    rating: 4.8,
  },
  {
    type: "agent",
    name: "Operations Manager",
    description: "Coordinates internal workflows, tracks blockers, and keeps teams aligned across departments.",
    category: "Agents",
    tags: ["operations", "management", "workflow", "coordination", "approvals"],
    price: 399,
    rating: 4.7,
  },
  {
    type: "agent",
    name: "Supplier Negotiator",
    description: "Manages supplier communications, price discovery, and vendor-side negotiation loops.",
    category: "Agents",
    tags: ["supplier", "procurement", "negotiation", "trade", "logistics"],
    price: 329,
    rating: 4.6,
  },
  {
    type: "knowledge",
    name: "Company Brain Knowledge Module",
    description: "Seeds a structured company brain module with operating context, SOP placeholders, and retrieval tags.",
    category: "Knowledge",
    tags: ["knowledge", "company brain", "sop", "operations", "memory"],
    price: 149,
    rating: 4.7,
  },
  {
    type: "knowledge",
    name: "Market Intelligence Module",
    description: "Attaches an industry-aware knowledge module for sector signals, competitor monitoring, and field insights.",
    category: "Knowledge",
    tags: ["knowledge", "industry", "market intelligence", "research", "insights"],
    price: 179,
    rating: 4.5,
  },
  {
    type: "automation",
    name: "WhatsApp CRM Automation",
    description: "Registers a workflow for inbound WhatsApp messages, CRM updates, and response routing.",
    category: "Automations",
    tags: ["automation", "whatsapp", "crm", "support", "customer service"],
    price: 219,
    rating: 4.9,
  },
  {
    type: "automation",
    name: "Lead Follow-Up Automation",
    description: "Runs scheduled lead follow-up workflows and keeps sales activity from stalling.",
    category: "Automations",
    tags: ["automation", "sales", "lead follow-up", "crm", "pipeline"],
    price: 199,
    rating: 4.6,
  },
  {
    type: "automation",
    name: "Customer Onboarding Template",
    description: "Deploys a ready-made automation template for onboarding handoffs, reminders, and client activation.",
    category: "Templates",
    tags: ["template", "automation", "onboarding", "customer", "workflow"],
    price: 99,
    rating: 4.4,
  },
  {
    type: "automation",
    name: "Supplier Intake Template",
    description: "Registers a reusable supplier intake workflow for approvals, data collection, and procurement review.",
    category: "Templates",
    tags: ["template", "automation", "supplier", "procurement", "approvals"],
    price: 109,
    rating: 4.3,
  },
];

const ADDITIONAL_MINDBASE_AGENT_ASSETS: MarketplaceAssetSeed[] = ([
  ["Executive Assistant", "Keeps priorities, decisions, calendars, and follow-up moving.", ["executive", "calendar", "decisions", "follow-up"]],
  ["Marketing Agent", "Plans campaigns, content, customer research, and launch calendars.", ["marketing", "campaigns", "content", "customers"]],
  ["Accounting Agent", "Tracks invoices, expenses, cashflow, and finance setup needs.", ["accounting", "invoices", "cashflow", "finance"]],
  ["Product Strategist", "Turns market signals and user needs into product priorities.", ["product", "strategy", "roadmap", "research"]],
  ["HR and People Agent", "Organizes hiring, onboarding, team policies, and employee records.", ["people", "hiring", "onboarding", "policies"]],
  ["Legal Ops Agent", "Tracks contracts, policy requests, and compliance handoffs.", ["legal", "contracts", "compliance", "policy"]],
  ["Procurement Agent", "Manages supplier intake, pricing, purchase requests, and vendor follow-up.", ["procurement", "suppliers", "purchasing", "vendors"]],
  ["Project Manager", "Turns goals into milestones, owners, due dates, and execution status.", ["projects", "milestones", "tasks", "delivery"]],
  ["CRM Agent", "Keeps contacts, deals, notes, and customer follow-ups organized.", ["crm", "contacts", "deals", "follow-up"]],
  ["Research Agent", "Collects market, competitor, and customer intelligence for decisions.", ["research", "market", "competitors", "customers"]],
  ["Data Analyst", "Builds operating metrics, dashboards, and weekly insight briefs.", ["analytics", "metrics", "dashboards", "reporting"]],
  ["Finance Controller", "Prepares budget views, cashflow checks, and finance controls.", ["finance", "budget", "controls", "cashflow"]],
  ["Content Planner", "Builds channel calendars, post ideas, and campaign briefs.", ["content", "calendar", "campaigns", "briefs"]],
  ["SEO Agent", "Plans search content, keyword clusters, and technical SEO checks.", ["seo", "search", "keywords", "content"]],
  ["Ads Manager", "Drafts ad campaigns, audience tests, and performance reviews.", ["ads", "campaigns", "audiences", "performance"]],
  ["Community Manager", "Plans community engagement, replies, and member feedback loops.", ["community", "engagement", "feedback", "support"]],
  ["Partnerships Agent", "Finds partner targets and manages outreach follow-up.", ["partnerships", "outreach", "pipeline", "sales"]],
  ["Customer Success Agent", "Guides onboarding, retention, account health, and renewal actions.", ["success", "retention", "onboarding", "renewals"]],
  ["Implementation Agent", "Turns new customer setup into a repeatable delivery checklist.", ["implementation", "delivery", "onboarding", "checklists"]],
  ["Quality Assurance Agent", "Reviews work output, checks acceptance criteria, and flags risk.", ["quality", "qa", "review", "risk"]],
  ["SOP Builder", "Turns repeated work into operating procedures and training checklists.", ["sop", "training", "process", "knowledge"]],
  ["Company Brain Librarian", "Organizes documents, tags knowledge, and keeps retrieval clean.", ["knowledge", "documents", "retrieval", "company brain"]],
  ["Meeting Brief Agent", "Prepares agendas, summaries, decisions, and next actions.", ["meetings", "agenda", "summary", "actions"]],
  ["Inbox Triage Agent", "Sorts incoming messages by urgency, owner, and next step.", ["inbox", "triage", "support", "routing"]],
  ["WhatsApp Agent", "Handles mobile-first customer intake, reminders, and follow-up.", ["whatsapp", "mobile", "intake", "follow-up"]],
  ["Gmail Agent", "Organizes email threads, labels, drafts, and follow-up queues.", ["gmail", "email", "drafts", "follow-up"]],
  ["Google Drive Agent", "Connects documents, folders, and company knowledge suggestions.", ["google drive", "documents", "folders", "knowledge"]],
  ["Notion Agent", "Maintains docs, project pages, and lightweight operating systems.", ["notion", "docs", "projects", "knowledge"]],
  ["Slack Agent", "Summarizes channels, routes decisions, and catches missed action items.", ["slack", "channels", "decisions", "actions"]],
  ["Microsoft 365 Agent", "Coordinates Outlook, Teams, files, and enterprise workspace setup.", ["microsoft", "outlook", "teams", "files"]],
  ["Billing Agent", "Prepares billing runs, subscription checks, and invoice follow-up.", ["billing", "subscriptions", "invoices", "finance"]],
  ["Payroll Agent", "Tracks payroll inputs, approvals, and employee payment readiness.", ["payroll", "approvals", "people", "finance"]],
  ["Tax Prep Agent", "Organizes tax documents, deadlines, and accountant handoffs.", ["tax", "documents", "deadlines", "finance"]],
  ["Inventory Agent", "Tracks stock, reorder points, vendor notes, and fulfillment issues.", ["inventory", "stock", "vendors", "fulfillment"]],
  ["Logistics Agent", "Coordinates deliveries, shipment status, and exception handling.", ["logistics", "delivery", "shipments", "exceptions"]],
  ["Field Ops Agent", "Manages territory work, site visits, reports, and field evidence.", ["field ops", "territory", "reports", "evidence"]],
  ["Training Agent", "Creates onboarding lessons, knowledge checks, and team enablement.", ["training", "onboarding", "enablement", "people"]],
  ["Compliance Agent", "Tracks compliance tasks, evidence, audits, and approvals.", ["compliance", "audits", "evidence", "approvals"]],
  ["Risk Agent", "Monitors operational risks, incidents, and mitigation plans.", ["risk", "incidents", "mitigation", "operations"]],
  ["Investor Relations Agent", "Prepares investor updates, metrics, and diligence material.", ["investors", "updates", "metrics", "diligence"]],
  ["Fundraising Agent", "Organizes target lists, pitch follow-ups, and fundraising rooms.", ["fundraising", "pitch", "investors", "follow-up"]],
  ["Grant Agent", "Finds grants, drafts applications, and tracks submission deadlines.", ["grants", "applications", "deadlines", "funding"]],
  ["Pricing Agent", "Tests packaging, pricing, discount rules, and margin implications.", ["pricing", "packaging", "margins", "product"]],
  ["Onboarding Agent", "Creates first-run setup flows for customers, teams, and partners.", ["onboarding", "customers", "teams", "setup"]],
  ["Agent Builder", "Designs custom role agents from your company structure and needs.", ["agents", "custom", "roles", "builder"]],
  ["Command Center Agent", "Summarizes updates, pending decisions, and recommended actions.", ["command center", "updates", "decisions", "actions"]],
] as Array<[string, string, string[]]>).map(([name, description, tags], index) => ({
  type: "agent" as const,
  name,
  description,
  category: "Agents" as const,
  tags,
  price: 249 + (index % 5) * 20,
  rating: 4.4 + (index % 6) * 0.08,
}));

function normalizeLabel(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function toDecimalString(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

async function seedMarketplaceAssets() {
  for (const asset of [...DEFAULT_INTELLIGENCE_ASSETS, ...ADDITIONAL_MINDBASE_AGENT_ASSETS]) {
    await db
      .insert(intelligenceAssets)
      .values({
        type: asset.type,
        name: asset.name,
        description: asset.description,
        category: asset.category,
        tags: asset.tags,
        creatorUserId: null,
        price: toDecimalString(asset.price),
        rating: toDecimalString(asset.rating),
        installCount: 0,
        visibility: asset.visibility || "public",
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [intelligenceAssets.type, intelligenceAssets.name],
        set: {
          description: asset.description,
          category: asset.category,
          tags: asset.tags,
          price: toDecimalString(asset.price),
          rating: toDecimalString(asset.rating),
          visibility: asset.visibility || "public",
        },
      });
  }
}

export async function listPublicMindbaseMarketplaceAssets(input?: {
  q?: string | null;
  category?: string | null;
  type?: MarketplaceAssetType | null;
  limit?: number;
}) {
  await seedMarketplaceAssets();

  const filters: any[] = [eq(intelligenceAssets.visibility, "public")];
  if (input?.type) filters.push(eq(intelligenceAssets.type, input.type));
  if (input?.category) filters.push(eq(intelligenceAssets.category, input.category));
  if (input?.q) {
    const q = `%${input.q}%`;
    filters.push(
      or(
        ilike(intelligenceAssets.name, q),
        ilike(intelligenceAssets.description, q),
        ilike(intelligenceAssets.category, q),
      ),
    );
  }

  return db.query.intelligenceAssets.findMany({
    where: and(...filters),
    orderBy: [desc(intelligenceAssets.installCount), desc(intelligenceAssets.createdAt)],
    limit: Math.max(1, Math.min(input?.limit || 120, 500)),
  });
}

async function getOrganizationMarketplaceContext(input: {
  tenantId: number;
  organizationId: string;
}): Promise<MarketplaceOrganizationContext | null> {
  const organization = await db.query.mindbaseOrganizations.findFirst({
    where: and(eq(mindbaseOrganizations.tenantId, input.tenantId), eq(mindbaseOrganizations.id, input.organizationId)),
  });
  if (!organization) return null;

  const [platformLinks, channels, installations] = await Promise.all([
    db.query.mindbaseOrganizationPlatforms.findMany({
      where: and(
        eq(mindbaseOrganizationPlatforms.tenantId, input.tenantId),
        eq(mindbaseOrganizationPlatforms.organizationId, input.organizationId),
      ),
      orderBy: [desc(mindbaseOrganizationPlatforms.isPrimary), desc(mindbaseOrganizationPlatforms.updatedAt)],
    }),
    db.query.mindbaseOrgChannels.findMany({
      where: and(eq(mindbaseOrgChannels.tenantId, input.tenantId), eq(mindbaseOrgChannels.organizationId, input.organizationId)),
      orderBy: [asc(mindbaseOrgChannels.channelType)],
    }),
    db.query.organizationAssets.findMany({
      where: eq(organizationAssets.orgId, input.organizationId),
      orderBy: [desc(organizationAssets.installedAt)],
    }),
  ]);

  const primaryLink = platformLinks.find((item) => item.isPrimary) || platformLinks[0] || null;
  const primaryPlatform = primaryLink
    ? await db.query.mindbaseTenantPlatforms.findFirst({
        where: and(
          eq(mindbaseTenantPlatforms.tenantId, input.tenantId),
          eq(mindbaseTenantPlatforms.id, primaryLink.tenantPlatformId),
        ),
      })
    : null;
  const platformTenantId = primaryPlatform?.platformTenantId ? Number(primaryPlatform.platformTenantId) : null;

  const company = platformTenantId
    ? await db.query.companies.findFirst({
        where: eq(companies.tenantId, platformTenantId),
        orderBy: [desc(companies.createdAt)],
      })
    : null;

  const [departmentRows, tenantAgents, metrics, installedAssetRows] = await Promise.all([
    company
      ? db.query.departments.findMany({
          where: eq(departments.companyId, company.id),
          orderBy: [asc(departments.order), asc(departments.name)],
        })
      : Promise.resolve([]),
    platformTenantId ? getTenantAgents(platformTenantId) : Promise.resolve([]),
    platformTenantId ? getTenantMetrics(platformTenantId) : Promise.resolve(DEFAULT_METRICS),
    installations.length
      ? db.query.intelligenceAssets.findMany({
          where: inArray(
            intelligenceAssets.id,
            installations.map((item) => item.assetId) as string[],
          ),
        })
      : Promise.resolve([]),
  ]);

  return {
    organization,
    primaryPlatform: primaryPlatform || null,
    platformTenantId,
    company: company || null,
    departments: departmentRows,
    channels,
    agents: tenantAgents,
    metrics,
    installations,
    installedAssetRows,
  };
}

function buildRecommendationSignals(context: MarketplaceOrganizationContext) {
  const industryTokens = [
    normalizeLabel(context.company?.primarySector),
    normalizeLabel(context.company?.secondarySector),
    ...(Array.isArray(context.company?.industryTags) ? (context.company?.industryTags as string[]).map(normalizeLabel) : []),
  ].filter(Boolean);
  const agentTokens = context.agents
    .map((agent) => normalizeLabel(`${agent.displayName || ""} ${agent.name || ""} ${agent.role || ""}`))
    .filter(Boolean);
  const installedTokens = context.installedAssetRows
    .map((asset) => normalizeLabel(`${asset.name} ${asset.description || ""} ${asset.category} ${(asset.tags || []).join(" ")}`))
    .filter(Boolean);
  const channelTokens = context.channels.map((channel) => normalizeLabel(channel.channelType)).filter(Boolean);
  const customerSupportTerms = ["support", "customer service", "crm", "whatsapp"];
  const salesTerms = ["sales", "lead", "pipeline", "revenue"];
  const operationsTerms = ["operations", "workflow", "coordination", "approvals"];
  const supplierTerms = ["supplier", "procurement", "vendor", "negotiation", "trade"];

  const hasInstalledToken = (terms: string[]) => installedTokens.some((token) => includesAny(token, terms));
  const hasAgentToken = (terms: string[]) => agentTokens.some((token) => includesAny(token, terms));

  return {
    industryTokens,
    agentTokens,
    installedTokens,
    channelTokens,
    inboundToday: Number(context.metrics.inboundToday || 0),
    inboxThreads: Number(context.metrics.inboxThreads || 0),
    connectedChannels: Number(context.metrics.connectedChannels || context.channels.length || 0),
    activeAgents: Number(context.metrics.activeAgents || context.agents.length || 0),
    hasCustomerSupportAgent: hasAgentToken(customerSupportTerms),
    hasSalesAgent: hasAgentToken(salesTerms),
    hasOperationsAgent: hasAgentToken(operationsTerms),
    hasSupplierAgent: hasAgentToken(supplierTerms),
    hasCustomerSupportAutomation: hasInstalledToken(customerSupportTerms),
    hasSalesAutomation: hasInstalledToken(salesTerms),
    hasKnowledgeModule: context.installedAssetRows.some((asset) => asset.type === "knowledge"),
    hasWhatsappChannel: channelTokens.includes("whatsapp"),
    isSupplierHeavyIndustry: industryTokens.some((token) =>
      includesAny(token, ["trade export", "gold metals", "logistics", "supplier", "procurement"]),
    ),
  };
}

function scoreMarketplaceAsset(
  asset: typeof intelligenceAssets.$inferSelect,
  installedAssetIds: Set<string>,
  signals: ReturnType<typeof buildRecommendationSignals>,
) {
  if (installedAssetIds.has(asset.id)) return -1000;
  const descriptor = normalizeLabel(`${asset.name} ${asset.description || ""} ${asset.category} ${(asset.tags || []).join(" ")}`);
  let score = 0;

  score += Math.min(10, Number(asset.installCount || 0) / 20);
  score += Math.min(10, Number(asset.rating || 0) * 1.8);

  if (asset.category === "Templates") score += 3;
  if (asset.category === "Knowledge" && !signals.hasKnowledgeModule) score += 12;

  if (signals.hasWhatsappChannel && includesAny(descriptor, ["whatsapp", "crm"])) score += 20;
  if (signals.inboundToday > 0 && includesAny(descriptor, ["support", "customer service", "automation", "crm"])) score += 16;
  if (signals.inboxThreads > 4 && includesAny(descriptor, ["support", "workflow", "operations", "automation"])) score += 12;
  if (signals.connectedChannels > 1 && includesAny(descriptor, ["crm", "multichannel", "support", "inbox"])) score += 8;

  if (!signals.hasCustomerSupportAgent && asset.type === "agent" && includesAny(descriptor, ["support", "customer service"])) score += 24;
  if (!signals.hasCustomerSupportAutomation && asset.type === "automation" && includesAny(descriptor, ["support", "customer service", "whatsapp", "crm"])) score += 28;
  if (!signals.hasSalesAgent && asset.type === "agent" && includesAny(descriptor, ["sales", "lead", "pipeline"])) score += 18;
  if (!signals.hasSalesAutomation && asset.type === "automation" && includesAny(descriptor, ["sales", "lead", "pipeline"])) score += 16;
  if (!signals.hasOperationsAgent && asset.type === "agent" && includesAny(descriptor, ["operations", "workflow", "coordination"])) score += 17;
  if (!signals.hasSupplierAgent && includesAny(descriptor, ["supplier", "procurement", "negotiation"])) score += signals.isSupplierHeavyIndustry ? 22 : 8;

  if (signals.activeAgents <= 1 && asset.type === "agent") score += 6;
  if (signals.industryTokens.some((token) => token && descriptor.includes(token))) score += 10;
  if (signals.isSupplierHeavyIndustry && includesAny(descriptor, ["supplier", "trade", "procurement", "logistics"])) score += 12;

  return score;
}

function buildChairmanRecommendationMessage(
  recommendations: Array<typeof intelligenceAssets.$inferSelect>,
  signals: ReturnType<typeof buildRecommendationSignals>,
) {
  if (!recommendations.length) return null;
  if (!signals.hasCustomerSupportAutomation) {
    const supportRecommendations = recommendations.filter((asset) =>
      includesAny(normalizeLabel(asset.name), ["customer support", "whatsapp crm"]),
    );
    const picks = (supportRecommendations.length ? supportRecommendations : recommendations).slice(0, 2);
    return `You currently have no customer support automation. Recommended installs: ${picks.map((item) => item.name).join(", ")}`;
  }
  return `Recommended installs: ${recommendations.slice(0, 2).map((item) => item.name).join(", ")}`;
}

function buildEmptyStateRecommendations(allAssets: Array<typeof intelligenceAssets.$inferSelect>) {
  const preferredNames = [
    "Customer Support Agent",
    "Sales Agent",
    "Operations Manager",
    "Supplier Negotiator",
  ];
  return preferredNames
    .map((name) => allAssets.find((asset) => asset.name === name))
    .filter(Boolean) as Array<typeof intelligenceAssets.$inferSelect>;
}

async function insertMindbaseEventTx(
  tx: any,
  input: {
    tenantId: number;
    organizationId: string;
    actorUserId?: number | null;
    eventType: string;
    payload?: Record<string, unknown>;
  },
) {
  await tx.insert(mindbaseEvents).values({
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    workspaceId: null,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    status: "pending",
    payload: input.payload ?? {},
    createdAt: new Date(),
  });
}

async function insertMindbaseBrainEventTx(
  tx: any,
  input: {
    tenantId: number;
    organizationId: string;
    eventType: string;
    entityType?: string | null;
    entityId?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  await tx.insert(mindbaseBrainEvents).values({
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    eventType: input.eventType,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    payload: input.payload ?? {},
    createdAt: new Date(),
  });
}

function buildAgentProfile(
  asset: typeof intelligenceAssets.$inferSelect,
  context: MarketplaceOrganizationContext,
  departmentId: number | null,
) {
  const normalized = normalizeLabel(asset.name);
  const industryFocus = [
    context.company?.primarySector,
    context.company?.secondarySector,
    ...(Array.isArray(context.company?.industryTags) ? (context.company?.industryTags as string[]) : []),
  ].filter(Boolean) as string[];

  return {
    tenantId: context.platformTenantId,
    companyId: context.company?.id ?? null,
    departmentId,
    name: asset.name,
    displayName: asset.name,
    role: slugify(asset.name).toUpperCase().replace(/-/g, "_"),
    hierarchyLevel: normalized.includes("manager") ? "manager" : "executor",
    intelligenceCap: normalized.includes("manager") ? "HIGH" : "MEDIUM",
    status: "active",
    skills: asset.tags,
    industryFocus,
    mission: asset.description || `Execute the ${asset.name} marketplace deployment for the company runtime.`,
    responsibilities: [
      `Operate as the ${asset.name} deployment for ${context.organization.name}.`,
      "Keep outputs aligned with the linked company objectives.",
      "Capture actionable outcomes back into the organization memory layer.",
    ],
    capabilities: asset.tags,
    permissions: {
      crm: includesAny(normalizeLabel(asset.tags.join(" ")), ["crm", "sales", "support"]),
      knowledge: true,
      webResearch: includesAny(normalizeLabel(asset.tags.join(" ")), ["research", "market intelligence"]),
    },
    metadata: {
      source: "mindbase_marketplace",
      deploymentType: "organization_agent",
      marketplaceAssetId: asset.id,
      marketplaceCategory: asset.category,
      organizationId: context.organization.id,
      linkedPlatformId: context.primaryPlatform?.id ?? null,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;
}

async function installAgentAsset(
  tx: any,
  asset: typeof intelligenceAssets.$inferSelect,
  context: MarketplaceOrganizationContext,
  departmentId: number | null,
) {
  if (!context.platformTenantId || !context.company?.id) {
    throw new Error("A linked company platform is required before installing an agent asset.");
  }

  const [created] = await tx.insert(agents).values(buildAgentProfile(asset, context, departmentId)).returning();
  return {
    entityType: "agent",
    entityId: String(created.id),
    eventType: "agent.created",
    resource: created,
  };
}

async function ensureCompanyBrainSpace(tx: any, companyId: number) {
  const [existing] = await tx
    .select()
    .from(knowledgeSpaces)
    .where(and(eq(knowledgeSpaces.companyId, companyId), eq(knowledgeSpaces.name, "Company Brain")))
    .limit(1);

  if (existing) return existing;

  const [created] = await tx
    .insert(knowledgeSpaces)
    .values({
      companyId,
      name: "Company Brain",
      description: "MindBase deployment memory for organization installs.",
      color: "indigo",
      icon: "brain",
      metadata: {
        source: "mindbase_marketplace",
      },
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

async function installKnowledgeAsset(
  tx: any,
  asset: typeof intelligenceAssets.$inferSelect,
  context: MarketplaceOrganizationContext,
  departmentId: number | null,
) {
  if (!context.company?.id) {
    throw new Error("A linked company is required before attaching a knowledge module.");
  }

  const space = await ensureCompanyBrainSpace(tx, context.company.id);
  const content = [
    `${asset.name}`,
    asset.description || "",
    `Installed for organization: ${context.organization.name}.`,
    context.company?.name ? `Company: ${context.company.name}.` : "",
    departmentId ? `Department id: ${departmentId}.` : "",
    asset.tags.length ? `Tags: ${asset.tags.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const [created] = await tx
    .insert(knowledgeDocuments)
    .values({
      companyId: context.company.id,
      spaceId: space.id,
      title: asset.name,
      type: "ai_doc",
      content,
      tags: asset.tags,
      metadata: {
        source: "mindbase_marketplace",
        organizationId: context.organization.id,
        marketplaceAssetId: asset.id,
        departmentId,
      },
      preview: content.slice(0, 180),
      createdBy: null,
      createdByType: "agent",
      sourceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return {
    entityType: "knowledge_module",
    entityId: String(created.id),
    eventType: "knowledge.module.attached",
    resource: created,
  };
}

function buildAutomationRegistration(
  asset: typeof intelligenceAssets.$inferSelect,
  context: MarketplaceOrganizationContext,
  departmentId: number | null,
) {
  const normalized = normalizeLabel(asset.name);
  const eventDriven = normalized.includes("whatsapp");
  const moduleId = `mindbase.marketplace.${slugify(asset.name) || "automation"}`;

  return {
    tenantId: context.platformTenantId || context.organization.tenantId,
    name: asset.name,
    cronKind: eventDriven ? ("EVENT" as const) : ("TIME" as const),
    triggerMode: eventDriven ? ("EVENT" as const) : ("SCHEDULE" as const),
    scheduleCron: eventDriven ? null : "0 */4 * * *",
    eventKey: eventDriven ? "mindbase.marketplace.whatsapp-crm" : null,
    moduleId,
    policyTier: "EXECUTION" as const,
    workflowTemplate: {
      title: asset.name,
      instruction: asset.description,
      objective: `Run ${asset.name} for organization ${context.organization.name}.`,
      priority: normalized.includes("crm") ? 30 : 10,
      metadata: {
        source: "mindbase_marketplace",
        marketplaceAssetId: asset.id,
        organizationId: context.organization.id,
        companyId: context.company?.id ?? null,
        departmentId,
      },
    },
    metadata: {
      source: "mindbase_marketplace",
      marketplaceAssetId: asset.id,
      organizationId: context.organization.id,
      companyId: context.company?.id ?? null,
      departmentId,
      linkedPlatformId: context.primaryPlatform?.id ?? null,
    },
  };
}

async function installAutomationAsset(
  asset: typeof intelligenceAssets.$inferSelect,
  context: MarketplaceOrganizationContext,
  actorUserId: number,
  departmentId: number | null,
) {
  if (!context.platformTenantId) {
    throw new Error("A linked company platform is required before registering an automation workflow.");
  }

  const created = await createGovernedCronJob({
    ...buildAutomationRegistration(asset, context, departmentId),
    createdByUserId: actorUserId,
  });

  return {
    entityType: "automation",
    entityId: String(created.id),
    eventType: "automation.registered",
    resource: created,
  };
}

function projectAsset(
  asset: typeof intelligenceAssets.$inferSelect,
  currentInstallations: Array<typeof organizationAssets.$inferSelect>,
  recommendedIds: Set<string>,
) {
  const installation = currentInstallations.find((item) => item.assetId === asset.id) || null;
  return {
    id: asset.id,
    type: asset.type,
    name: asset.name,
    description: asset.description,
    category: asset.category,
    tags: asset.tags || [],
    price: asset.price,
    rating: Number(asset.rating || 0),
    installCount: Number(asset.installCount || 0),
    visibility: asset.visibility,
    createdAt: asset.createdAt,
    isInstalled: Boolean(installation),
    installStatus: installation?.status || null,
    isRecommended: recommendedIds.has(asset.id),
  };
}

export async function getMindbaseMarketplaceSnapshot(input: {
  tenantId: number;
  userId: number;
  organizationId: string;
}) {
  await seedMarketplaceAssets();

  const [context, organizations, visibleAssets] = await Promise.all([
    getOrganizationMarketplaceContext({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    }),
    listMindbaseOrganizationsForUser(input.tenantId, input.userId),
    db.query.intelligenceAssets.findMany({
      where: eq(intelligenceAssets.visibility, "public"),
      orderBy: [desc(intelligenceAssets.installCount), desc(intelligenceAssets.createdAt)],
    }),
  ]);

  if (!context) {
    throw new Error("Organization not found for marketplace.");
  }

  const installedAssetIds = new Set<string>(context.installations.map((item) => String(item.assetId || "")));
  const signals = buildRecommendationSignals(context);
  const recommendedAssets = [...visibleAssets]
    .map((asset) => ({
      asset,
      score: scoreMarketplaceAsset(asset, installedAssetIds, signals),
    }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.asset)
    .filter((asset, index) => index < 4 && !installedAssetIds.has(asset.id));

  const fallbackRecommendations = buildEmptyStateRecommendations(visibleAssets);
  const finalRecommendations = recommendedAssets.length ? recommendedAssets : fallbackRecommendations;
  const recommendedIds = new Set<string>(finalRecommendations.map((asset) => String(asset.id || "")));
  const chairmanMessage = buildChairmanRecommendationMessage(finalRecommendations, signals);

  const organizationOptions = await Promise.all(
    organizations.map(async (organization) => {
      const organizationContext = await getOrganizationMarketplaceContext({
        tenantId: input.tenantId,
        organizationId: organization.id,
      });
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        membershipRole: organization.membershipRole,
        departments: (organizationContext?.departments || []).map((department) => ({
          id: department.id,
          name: department.name,
          description: department.description,
        })),
      };
    }),
  );

  const assets = [...visibleAssets]
    .sort((left, right) => {
      const leftRecommended = recommendedIds.has(left.id) ? 1 : 0;
      const rightRecommended = recommendedIds.has(right.id) ? 1 : 0;
      if (leftRecommended !== rightRecommended) return rightRecommended - leftRecommended;
      return Number(right.installCount || 0) - Number(left.installCount || 0);
    })
    .map((asset) => projectAsset(asset, context.installations, recommendedIds));

  return {
    organization: {
      id: context.organization.id,
      name: context.organization.name,
      slug: context.organization.slug,
      companyName: context.company?.name || null,
      primaryPlatformName: context.primaryPlatform?.name || null,
    },
    categories: MARKETPLACE_CATEGORIES,
    organizations: organizationOptions,
    assets,
    recommendedAssets: finalRecommendations.map((asset) => projectAsset(asset, context.installations, recommendedIds)),
    emptyStateRecommendations: fallbackRecommendations.map((asset) => ({
      id: asset.id,
      name: asset.name,
      category: asset.category,
    })),
    chairmanMessage,
  };
}

export async function getMindbaseMarketplaceChairmanBriefing(input: {
  tenantId: number;
  organizationId: string;
}) {
  await seedMarketplaceAssets();

  const [context, visibleAssets] = await Promise.all([
    getOrganizationMarketplaceContext({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    }),
    db.query.intelligenceAssets.findMany({
      where: eq(intelligenceAssets.visibility, "public"),
      orderBy: [desc(intelligenceAssets.installCount), desc(intelligenceAssets.createdAt)],
    }),
  ]);

  if (!context) return { recommendations: [], message: null };

  const installedAssetIds = new Set<string>(context.installations.map((item) => String(item.assetId || "")));
  const signals = buildRecommendationSignals(context);
  const recommendations = [...visibleAssets]
    .map((asset) => ({
      asset,
      score: scoreMarketplaceAsset(asset, installedAssetIds, signals),
    }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.asset)
    .filter((asset, index) => index < 4 && !installedAssetIds.has(asset.id));
  const fallbackRecommendations = buildEmptyStateRecommendations(visibleAssets);
  const finalRecommendations = recommendations.length ? recommendations : fallbackRecommendations;

  return {
    recommendations: finalRecommendations.map((asset) => ({
      id: asset.id,
      name: asset.name,
      category: asset.category,
      type: asset.type,
    })),
    message: buildChairmanRecommendationMessage(finalRecommendations, signals),
  };
}

export async function installMindbaseMarketplaceAsset(input: {
  tenantId: number;
  userId: number;
  organizationId: string;
  assetId: string;
  departmentId?: number | null;
}) {
  await seedMarketplaceAssets();

  const [organizationMemberships, asset] = await Promise.all([
    listMindbaseOrganizationsForUser(input.tenantId, input.userId),
    db.query.intelligenceAssets.findFirst({
      where: eq(intelligenceAssets.id, input.assetId),
    }),
  ]);

  if (!asset) throw new Error("Marketplace asset not found.");

  const targetOrganization = organizationMemberships.find((item) => item.id === input.organizationId) || null;
  if (!targetOrganization) {
    throw new Error("Selected organization is not available to the current user.");
  }

  const context = await getOrganizationMarketplaceContext({
    tenantId: input.tenantId,
    organizationId: input.organizationId,
  });
  if (!context) throw new Error("Selected organization was not found.");

  const departmentId =
    input.departmentId && Number.isFinite(input.departmentId)
      ? Math.trunc(Number(input.departmentId))
      : null;
  const selectedDepartment =
    departmentId != null ? context.departments.find((department) => department.id === departmentId) || null : null;

  if (context.departments.length && !selectedDepartment) {
    throw new Error("A valid department must be selected for the install.");
  }

  const existingInstallation = context.installations.find((item) => item.assetId === asset.id) || null;
  if (existingInstallation && normalizeLabel(existingInstallation.status) === "installed") {
    return {
      alreadyInstalled: true,
      organization: {
        id: context.organization.id,
        slug: context.organization.slug,
        name: context.organization.name,
      },
      asset: {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        category: asset.category,
      },
      installation: existingInstallation,
    };
  }

  const departmentRef = selectedDepartment?.id ?? null;
  const installAt = new Date();
  const resourceResult =
    asset.type === "automation"
      ? await installAutomationAsset(asset, context, input.userId, departmentRef)
      : await db.transaction(async (tx) => {
          if (asset.type === "agent") {
            return installAgentAsset(tx, asset, context, departmentRef);
          }
          return installKnowledgeAsset(tx, asset, context, departmentRef);
        });

  const installationPayload = {
    marketplaceAssetId: asset.id,
    assetName: asset.name,
    assetType: asset.type,
    category: asset.category,
    organizationId: context.organization.id,
    organizationName: context.organization.name,
    companyId: context.company?.id ?? null,
    companyName: context.company?.name ?? null,
    departmentId: departmentRef,
    departmentName: selectedDepartment?.name ?? null,
    entityId: resourceResult.entityId,
    entityType: resourceResult.entityType,
  };

  const installation = await db.transaction(async (tx) => {
    const [storedInstallation] = await tx
      .insert(organizationAssets)
      .values({
        orgId: context.organization.id,
        assetId: asset.id,
        installedBy: input.userId,
        installedAt: installAt,
        status: "installed",
      })
      .onConflictDoUpdate({
        target: [organizationAssets.orgId, organizationAssets.assetId],
        set: {
          installedBy: input.userId,
          installedAt: installAt,
          status: "installed",
        },
      })
      .returning();

    if (!existingInstallation) {
      await tx
        .update(intelligenceAssets)
        .set({
          installCount: sql`${intelligenceAssets.installCount} + 1`,
        })
        .where(eq(intelligenceAssets.id, asset.id));
    }

    await insertMindbaseEventTx(tx, {
      tenantId: input.tenantId,
      organizationId: context.organization.id,
      actorUserId: input.userId,
      eventType: "asset.installed",
      payload: installationPayload,
    });
    await insertMindbaseBrainEventTx(tx, {
      tenantId: input.tenantId,
      organizationId: context.organization.id,
      eventType: "asset.installed",
      entityType: "asset",
      entityId: asset.id,
      payload: installationPayload,
    });
    await insertMindbaseEventTx(tx, {
      tenantId: input.tenantId,
      organizationId: context.organization.id,
      actorUserId: input.userId,
      eventType: resourceResult.eventType,
      payload: installationPayload,
    });
    await insertMindbaseBrainEventTx(tx, {
      tenantId: input.tenantId,
      organizationId: context.organization.id,
      eventType: resourceResult.eventType,
      entityType: resourceResult.entityType,
      entityId: resourceResult.entityId,
      payload: installationPayload,
    });

    return storedInstallation;
  });

  return {
    alreadyInstalled: false,
    organization: {
      id: context.organization.id,
      slug: context.organization.slug,
      name: context.organization.name,
    },
    asset: {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      category: asset.category,
    },
    installation,
    resource: resourceResult.resource,
  };
}
