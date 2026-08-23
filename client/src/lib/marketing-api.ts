import { apiRequest } from "@/lib/queryClient";

export type MarketingPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  contentHtml?: string | null;
  contentMarkdown?: string | null;
  coverImageLocal: string | null;
  tags: string[];
  externalUrl: string | null;
  status: "draft" | "published" | "archived";
  sortOrder?: number;
  publishedAt: string | null;
  updatedAt: string;
};

export type MarketingPress = {
  id: number;
  slug: string;
  title: string;
  outlet: string | null;
  excerpt: string | null;
  externalUrl: string | null;
  thumbnailLocal: string | null;
  tags: string[];
  status: "draft" | "published" | "archived";
  sortOrder: number;
  publishedAt: string | null;
  updatedAt: string;
};

export type MarketingLibraryItem = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  language: string | null;
  duration: string | null;
  externalUrl: string | null;
  embedUrl: string | null;
  thumbnailLocal: string | null;
  tags: string[];
  status: "draft" | "published" | "archived";
  sortOrder: number;
  publishedAt: string | null;
  updatedAt: string;
};

export type MarketingMediaItem = {
  id: string;
  type: "article" | "video" | "profile" | "press_release" | "podcast" | "post";
  title: string;
  outlet: string | null;
  url: string;
  canonicalUrl: string | null;
  publishedAt: string | null;
  language: string | null;
  excerpt: string | null;
  summaryBullets: string[];
  summaryParagraph: string | null;
  tags: string[];
  thumbnailRemoteUrl: string | null;
  thumbnailLocalPath: string | null;
  mediaEmbedUrl: string | null;
  author: string | null;
  sourceQueries: string[];
  relevanceScore: number;
  confidenceScore: number;
  duplicateOf: string | null;
  status: "discovered" | "reviewed" | "published" | "rejected";
  featured?: boolean;
  verified?: boolean;
  updatedAt: string;
};

export type InvestmentOpportunity = {
  id: number | string;
  type: "sme" | "machinery" | "farm" | "factory" | "gold" | "commodities";
  slug: string;
  title: string;
  summary: string | null;
  country: string | null;
  trackRecordBadge: string;
  fundingGoalMin: string | null;
  fundingGoalMax: string | null;
  currency: string;
  useOfFunds: string[];
  contractDurationMonths: number | null;
  trackedKpis: string[];
  returnModel: string | null;
  riskNotes: string | null;
  mitigations: string | null;
  narrative: string | null;
  fundingPlan: Record<string, unknown>;
  status: "draft" | "published" | "archived";
  featured: boolean;
  sortOrder: number;
  publishedAt: string | null;
};

export type MarketingScreenshot = {
  id: number | string;
  slug: string;
  title: string;
  module: string;
  caption: string | null;
  imageLocalPath: string;
  tags: string[];
  status?: "draft" | "published" | "archived";
  sortOrder?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export async function fetchMarketingSite() {
  return apiRequest("/api/marketing/site", { method: "GET" });
}

export async function fetchMarketingPosts(params?: { limit?: number; tag?: string; q?: string }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.tag) query.set("tag", params.tag);
  if (params?.q) query.set("q", params.q);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`/api/marketing/posts${suffix}`, { method: "GET" });
}

export async function fetchMarketingPostBySlug(slug: string) {
  return apiRequest(`/api/marketing/posts/${encodeURIComponent(slug)}`, { method: "GET" });
}

export async function fetchMarketingPress(params?: { limit?: number; q?: string }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.q) query.set("q", params.q);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`/api/marketing/press${suffix}`, { method: "GET" });
}

export async function fetchMarketingLibrary(params?: { limit?: number; q?: string; category?: string }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.q) query.set("q", params.q);
  if (params?.category) query.set("category", params.category);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`/api/marketing/library${suffix}`, { method: "GET" });
}

export async function fetchMarketingMedia(params?: { limit?: number; q?: string; type?: string; tag?: string; featured?: boolean; verify?: boolean }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.q) query.set("q", params.q);
  if (params?.type) query.set("type", params.type);
  if (params?.tag) query.set("tag", params.tag);
  if (typeof params?.featured === "boolean") query.set("featured", params.featured ? "true" : "false");
  if (typeof params?.verify === "boolean") query.set("verify", params.verify ? "true" : "false");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`/api/marketing/media${suffix}`, { method: "GET" });
}

export async function fetchMarketingScreenshots(params?: { limit?: number; module?: string; tag?: string }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.module) query.set("module", params.module);
  if (params?.tag) query.set("tag", params.tag);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`/api/marketing/screenshots${suffix}`, { method: "GET" });
}

export async function fetchInvestmentOpportunities(params?: {
  limit?: number;
  q?: string;
  type?: string;
  country?: string;
  featured?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.q) query.set("q", params.q);
  if (params?.type) query.set("type", params.type);
  if (params?.country) query.set("country", params.country);
  if (typeof params?.featured === "boolean") query.set("featured", params.featured ? "true" : "false");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`/api/invest/opportunities${suffix}`, { method: "GET" });
}

export async function fetchInvestmentOpportunityBySlug(slug: string) {
  return apiRequest(`/api/invest/opportunities/${encodeURIComponent(slug)}`, { method: "GET" });
}

export async function submitInvestorLead(payload: {
  name: string;
  email: string;
  phone?: string;
  country?: string;
  investorType?: string;
  interestTags?: string[];
  message?: string;
  sourceUrl?: string;
}) {
  return apiRequest("/api/invest/leads", "POST", payload);
}

export type TalkMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
};

export type TalkCommercialIntent = {
  intent: string;
  confidence: number;
  commercial: boolean;
  language: "en" | "fr" | "auto";
  product?: {
    name?: string;
    category?: string;
    specification?: string;
    quantity?: number;
    unit?: string;
  };
  origin?: string;
  destination?: string;
  targetPrice?: number;
  currency?: string;
  deadline?: string;
  frequency?: string;
  incoterm?: string;
  customerType?: string;
  orderReference?: string;
  requirementId?: string;
  requirementReferenceCode?: string;
  productRequirementId?: string;
  missingFields: string[];
  suggestedAction: "ANSWER" | "ASK" | "ACT" | "ESCALATE";
  rationale: string[];
};

export type TalkTimelineEvent = {
  id: number;
  eventType:
    | "commercial_intent"
    | "commercial_retrieval"
    | "commercial_action"
    | "commercial_crm"
    | "sourcing_review_task"
    | "supplier_candidate_screening"
    | "handoff";
  payload: Record<string, unknown>;
  createdAt: string;
};

export type TalkCommercialCrm = {
  status:
    | "lead_captured"
    | "opportunity_opened"
    | "operator_company_missing"
    | "sync_deferred";
  leadId: number | null;
  opportunityId: number | null;
  opportunityReferenceCode: string | null;
  stage: string | null;
  createdLead: boolean;
  createdOpportunity: boolean;
};

export type TalkSourcingReviewTask = {
  status:
    | "not_eligible"
    | "agent_assignment_missing"
    | "review_task_ready"
    | "sync_deferred";
  taskId: number | null;
  publicTaskId: string | null;
  state: string | null;
  requiresHumanApproval: boolean;
  outboundActionsAllowed: boolean;
};

export type TalkSupplierCandidateScreening = {
  status:
    | "not_eligible"
    | "requirement_not_found"
    | "no_verified_candidate"
    | "candidates_ready"
    | "sync_deferred";
  screeningState: "not_run" | "completed";
  source: "verified_internal_supplier_registry";
  threshold: number;
  candidateCount: number;
  newCandidateCount: number;
  existingCandidateCount: number;
  topScore: number | null;
  sourcingTaskId: number | null;
  sourcingTaskPublicId: string | null;
  requiresHumanApproval: boolean;
  supplierIdentityPublic: boolean;
  outboundActionsAllowed: boolean;
  externalDiscoveryStarted: boolean;
  quoteCreated: boolean;
  screenedAt: string;
};

export type TalkCommercialRetrieval = {
  status:
    | "not_applicable"
    | "clarification_required"
    | "verified_matches"
    | "internal_matches_require_review"
    | "no_verified_match";
  searched: boolean;
  searchedAt: string;
  source: "industrial_catalog";
  threshold: number;
  query: {
    productName: string | null;
    category: string | null;
    specification: string | null;
    classifications: string[];
  };
  verifiedMatchCount: number;
  publicMatchCount: number;
  matches: Array<{
    id: string;
    name: string;
    classification: string;
    relevanceScore: number;
    availabilityStatus: string | null;
    countryOfOrigin: string | null;
    unitOfMeasure: string | null;
    minimumOrderQuantity: string | null;
    availableQuantityText: string | null;
    leadTimeText: string | null;
    priceMode: string | null;
    priceText: string | null;
    currencyCode: string | null;
    certifications: string[];
    freshnessAt: string | null;
  }>;
};

export async function startTalkSession(payload: { intent?: string; sourceUrl?: string }) {
  return apiRequest("/api/talk/start", "POST", payload);
}

export async function fetchTalkLead(leadId: string, params?: { limit?: number; eventLimit?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.eventLimit) query.set("eventLimit", String(params.eventLimit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`/api/talk/leads/${encodeURIComponent(leadId)}${suffix}`, { method: "GET" });
}

export type TalkLeadPayload = {
  id: string;
  intent: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  commercial?: TalkCommercialIntent | null;
  crm?: TalkCommercialCrm | null;
  sourcingTask?: TalkSourcingReviewTask | null;
  supplierCandidateScreening?: TalkSupplierCandidateScreening | null;
  retrieval?: TalkCommercialRetrieval | null;
  events?: TalkTimelineEvent[];
  requirement?: {
    id: string | null;
    referenceCode?: string | null;
    productRequirementId?: string | null;
  } | null;
};

export async function sendTalkMessage(payload: {
  leadId: string;
  message: string;
  intent?: string;
  name?: string;
  email?: string;
  phone?: string;
}): Promise<{
  ok: true;
  leadId: string;
  messages: TalkMessage[];
  notify?: unknown;
  lead: { intent: string; hasContact: boolean; hadContact: boolean };
  requirement?: {
    id: string | null;
    referenceCode?: string | null;
    productRequirementId?: string | null;
  } | null;
  commercial?: TalkCommercialIntent | null;
  crm?: TalkCommercialCrm | null;
  sourcingTask?: TalkSourcingReviewTask | null;
  supplierCandidateScreening?: TalkSupplierCandidateScreening | null;
  retrieval?: TalkCommercialRetrieval | null;
  events?: TalkTimelineEvent[];
}> {
  return apiRequest("/api/talk/message", "POST", payload);
}
