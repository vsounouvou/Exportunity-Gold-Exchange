export const TRADE_NEWSROOM_ARTICLE_STATUSES = [
  "draft",
  "research_review",
  "editor_review",
  "approved",
  "published",
  "rejected",
  "withdrawn",
] as const;

export const TRADE_NEWSROOM_STORY_TYPES = [
  "news_brief",
  "regulatory_update",
  "market_analysis",
  "trade_opportunity",
  "logistics_update",
  "original_report",
] as const;

export type TradeNewsroomArticleStatus =
  (typeof TRADE_NEWSROOM_ARTICLE_STATUSES)[number];
export type TradeNewsroomStoryType =
  (typeof TRADE_NEWSROOM_STORY_TYPES)[number];

const ALLOWED_TRANSITIONS: Record<
  TradeNewsroomArticleStatus,
  readonly TradeNewsroomArticleStatus[]
> = {
  draft: ["research_review", "rejected"],
  research_review: ["draft", "editor_review", "rejected"],
  editor_review: ["research_review", "approved", "rejected"],
  approved: ["editor_review", "published"],
  published: ["withdrawn"],
  rejected: ["draft"],
  withdrawn: ["editor_review"],
};

export type NewsroomCitationReadinessInput = {
  sourceId: string;
  sourceStatus: string;
  sourceUrl: string;
  sourceTitle: string;
  citedClaim: string;
  verificationStatus: string;
};

export type NewsroomPublicationReadinessInput = {
  title: string;
  dek?: string | null;
  bodyMarkdown: string;
  originalAnalysis?: string | null;
  citations: NewsroomCitationReadinessInput[];
  humanConfirmed: boolean;
};

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
export function canTransitionTradeNewsroomArticle(
  from: TradeNewsroomArticleStatus,
  to: TradeNewsroomArticleStatus,
) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTradeNewsroomTransition(
  from: TradeNewsroomArticleStatus,
  to: TradeNewsroomArticleStatus,
) {
  if (from === to) {
    throw new Error("A newsroom review must change the article status.");
  }
  if (!canTransitionTradeNewsroomArticle(from, to)) {
    throw new Error(`The newsroom transition ${from} -> ${to} is not allowed.`);
  }
}

export function evaluateNewsroomPublicationReadiness(
  input: NewsroomPublicationReadinessInput,
) {
  const citations = input.citations || [];
  const verifiedCitations = citations.filter(
    (citation) => citation.verificationStatus === "verified",
  );
  const distinctVerifiedSources = new Set(
    verifiedCitations
      .filter((citation) => citation.sourceStatus === "active")
      .map((citation) => citation.sourceId),
  );
  const reasons: string[] = [];

  if (input.title.trim().length < 12) {
    reasons.push("The title must contain at least 12 characters.");
  }
  if (String(input.dek || "").trim().length < 30) {
    reasons.push("The article dek must contain at least 30 characters.");
  }
  if (input.bodyMarkdown.trim().length < 300) {
    reasons.push("The article body must contain at least 300 characters.");
  }
  if (String(input.originalAnalysis || "").trim().length < 80) {
    reasons.push("Original analysis must contain at least 80 characters.");
  }
  if (citations.length < 2) {
    reasons.push("At least two citations are required.");
  }
  if (verifiedCitations.length < 2) {
    reasons.push("At least two citations must be independently verified.");
  }
  if (distinctVerifiedSources.size < 2) {
    reasons.push("Verified citations must come from at least two active sources.");
  }
  if (
    citations.some((citation) => citation.verificationStatus !== "verified")
  ) {
    reasons.push("Every attached citation must be verified before approval.");
  }
  if (citations.some((citation) => citation.sourceStatus !== "active")) {
    reasons.push("Every citation must use an active source registry entry.");
  }
  if (
    citations.some(
      (citation) =>
        !isHttpUrl(citation.sourceUrl) ||
        citation.sourceTitle.trim().length < 3 ||
        citation.citedClaim.trim().length < 12,
    )
  ) {
    reasons.push("Every citation needs a precise URL, source title, and cited claim.");
  }
  if (!input.humanConfirmed) {
    reasons.push("An accountable human must confirm the editorial checklist.");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    citationCount: citations.length,
    verifiedCitationCount: verifiedCitations.length,
    distinctSourceCount: distinctVerifiedSources.size,
    checklist: {
      titleReady: input.title.trim().length >= 12,
      dekReady: String(input.dek || "").trim().length >= 30,
      bodyReady: input.bodyMarkdown.trim().length >= 300,
      originalAnalysisReady:
        String(input.originalAnalysis || "").trim().length >= 80,
      hasTwoVerifiedCitations: verifiedCitations.length >= 2,
      hasTwoActiveSources: distinctVerifiedSources.size >= 2,
      allCitationsVerified:
        citations.length >= 2 &&
        citations.every(
          (citation) => citation.verificationStatus === "verified",
        ),
      citationFieldsComplete:
        citations.length >= 2 &&
        citations.every(
          (citation) =>
            isHttpUrl(citation.sourceUrl) &&
            citation.sourceTitle.trim().length >= 3 &&
            citation.citedClaim.trim().length >= 12,
        ),
      humanConfirmed: input.humanConfirmed,
    },
  };
}
