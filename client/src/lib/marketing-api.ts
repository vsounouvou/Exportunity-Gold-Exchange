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

export async function startTalkSession(payload: { intent?: string; sourceUrl?: string }) {
  return apiRequest("/api/talk/start", "POST", payload);
}

export async function fetchTalkLead(leadId: string, params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`/api/talk/leads/${encodeURIComponent(leadId)}${suffix}`, { method: "GET" });
}

export async function sendTalkMessage(payload: {
  leadId: string;
  message: string;
  intent?: string;
  name?: string;
  email?: string;
  phone?: string;
}) {
  return apiRequest("/api/talk/message", "POST", payload);
}
