export type WorkspaceEvidenceClassification = {
  disposition: "index" | "review" | "quarantine" | "never_index";
  businessScore: number;
  businessSignals: string[];
  sensitiveSignals: string[];
  reasons: string[];
};

const BUSINESS_TERMS = [
  "exportunity",
  "rayon",
  "xportcard",
  "supplier",
  "sourcing",
  "buyer",
  "customer",
  "client",
  "quotation",
  "quote",
  "rfq",
  "invoice",
  "contract",
  "purchase order",
  "shipment",
  "logistics",
  "freight",
  "manufacturing",
  "factory",
  "industrial",
  "machinery",
  "partnership",
  "proposal",
  "investment",
  "payment",
  "commercial",
  "distribution",
  "wholesale",
  "marketplace",
  "company",
  "business",
  "project",
] as const;

const PERSONAL_SENSITIVE_PATTERNS: Array<[string, RegExp]> = [
  ["medical_or_health", /\b(?:medical|hospital|doctor|diagnosis|prescription|patient|therapy|health record)\b/i],
  ["immigration_or_identity", /\b(?:passport|visa application|residence permit|immigration|birth certificate|national id)\b/i],
  ["family_or_school", /\b(?:family matter|my child|my daughter|my son|school report|tuition)\b/i],
  ["credential_or_secret", /\b(?:password|private key|recovery code|one[- ]time password|otp code|api key)\b/i],
  ["high_risk_financial_identifier", /\b(?:credit card number|card cvv|bank pin|account password)\b/i],
];

function normalize(value: unknown) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesRule(text: string, rule: unknown) {
  const normalizedRule = normalize(rule);
  return Boolean(normalizedRule && text.includes(normalizedRule));
}

export function classifyWorkspaceEvidence(input: {
  subject?: unknown;
  text?: unknown;
  from?: unknown;
  to?: unknown;
  company?: unknown;
  jobTitle?: unknown;
  includeKeywords?: unknown[];
  excludeKeywords?: unknown[];
  includeDomains?: unknown[];
  excludeDomains?: unknown[];
  neverIndex?: unknown[];
  requireBusinessSignal?: boolean;
}) : WorkspaceEvidenceClassification {
  const text = normalize([
    input.subject,
    input.text,
    input.from,
    input.to,
    input.company,
    input.jobTitle,
  ].filter(Boolean).join("\n"));
  const addressText = normalize([input.from, input.to].filter(Boolean).join(" "));
  const reasons: string[] = [];
  const businessSignals: string[] = [];
  const sensitiveSignals = PERSONAL_SENSITIVE_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);

  const neverIndexRule = (input.neverIndex || []).find((rule) => matchesRule(text, rule));
  if (neverIndexRule) {
    return {
      disposition: "never_index",
      businessScore: 0,
      businessSignals,
      sensitiveSignals,
      reasons: [`never_index_rule:${normalize(neverIndexRule)}`],
    };
  }

  const excludedDomain = (input.excludeDomains || []).find((domain) => {
    const normalizedDomain = normalize(domain).replace(/^@/, "");
    return normalizedDomain && addressText.includes(`@${normalizedDomain}`);
  });
  if (excludedDomain) reasons.push(`excluded_domain:${normalize(excludedDomain)}`);

  const excludedKeyword = (input.excludeKeywords || []).find((keyword) => matchesRule(text, keyword));
  if (excludedKeyword) reasons.push(`excluded_keyword:${normalize(excludedKeyword)}`);

  for (const term of BUSINESS_TERMS) {
    if (text.includes(term)) businessSignals.push(`term:${term}`);
  }
  for (const keyword of input.includeKeywords || []) {
    if (matchesRule(text, keyword)) businessSignals.push(`configured_keyword:${normalize(keyword)}`);
  }
  for (const domain of input.includeDomains || []) {
    const normalizedDomain = normalize(domain).replace(/^@/, "");
    if (normalizedDomain && addressText.includes(`@${normalizedDomain}`)) {
      businessSignals.push(`configured_domain:${normalizedDomain}`);
    }
  }
  if (normalize(input.company)) businessSignals.push("organization_present");
  if (normalize(input.jobTitle)) businessSignals.push("job_title_present");

  const score = Math.min(100, businessSignals.length * 18);
  if (sensitiveSignals.length) reasons.push(...sensitiveSignals.map((item) => `sensitive:${item}`));
  if (excludedDomain || excludedKeyword || sensitiveSignals.length) {
    return {
      disposition: "quarantine",
      businessScore: score,
      businessSignals: Array.from(new Set(businessSignals)),
      sensitiveSignals,
      reasons,
    };
  }
  if (!input.requireBusinessSignal || score >= 36) {
    return {
      disposition: "index",
      businessScore: score,
      businessSignals: Array.from(new Set(businessSignals)),
      sensitiveSignals,
      reasons,
    };
  }
  if (score > 0) reasons.push("low_confidence_business_relevance");
  else reasons.push("no_business_signal");
  return {
    disposition: "review",
    businessScore: score,
    businessSignals: Array.from(new Set(businessSignals)),
    sensitiveSignals,
    reasons,
  };
}

