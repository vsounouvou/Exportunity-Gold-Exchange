export type ModuleStatus = "Live" | "In build" | "Gated" | "Hidden";

export type PlatformModuleDefinition = {
  slug: string;
  title: string;
  status: ModuleStatus;
  outcome: string;
  outcomes: string[];
  howItWorks: string[];
  proofModule?: string;
  proofTag?: string;
  heroImage?: string;
};

export const PLATFORM_MODULES: PlatformModuleDefinition[] = [
  {
    slug: "wallet-payments",
    title: "Wallet & Payments",
    status: "Live",
    outcome: "Control disbursement and settlement with a traceable wallet ledger.",
    outcomes: [
      "Receive and release funds with approval gates.",
      "Track every movement with reference IDs.",
      "Generate investor-ready transaction history.",
    ],
    howItWorks: [
      "Create a wallet account for each execution context.",
      "Apply approval thresholds for high-impact transfers.",
      "Release funds against approved actions or milestones.",
      "Store receipts, counterparties, and payment references.",
      "Export statements for governance and reporting.",
    ],
    proofModule: "Wallet",
    proofTag: "payments",
  },
  {
    slug: "digital-contracts",
    title: "Digital Contracts",
    status: "In build",
    outcome: "Bind capital, milestones, and evidence inside enforceable contract flows.",
    outcomes: [
      "Define milestone release conditions and verifiers.",
      "Attach evidence to each release checkpoint.",
      "Handle disputes and terminations with audit history.",
    ],
    howItWorks: [
      "Draft investor and operator terms per opportunity.",
      "Set milestone amounts and due dates.",
      "Require evidence uploads before release.",
      "Approve or reject each milestone event.",
      "Close with completion, dispute, or termination state.",
    ],
    proofModule: "Contracts",
    proofTag: "contract",
  },
  {
    slug: "action-logs",
    title: "Action Logs & Governance",
    status: "Live",
    outcome: "Know who did what, when, and why across all operator actions.",
    outcomes: [
      "Track correlation IDs from intent to execution.",
      "Record approval decisions and policy blocks.",
      "Audit agent and human actions by tenant.",
    ],
    howItWorks: [
      "Capture every tool action with metadata.",
      "Link action outcomes to conversations and tasks.",
      "Show blocked actions with clear reasons.",
      "Filter by tenant, module, and severity.",
      "Export governance logs for review.",
    ],
    proofModule: "Governance",
    proofTag: "audit",
  },
  {
    slug: "messaging",
    title: "Messaging (Email/SMS/WhatsApp)",
    status: "Live",
    outcome: "Run communications through governed actions, not manual chaos.",
    outcomes: [
      "Launch channel actions from operational threads.",
      "Apply approval policies on external sends.",
      "Keep message outcomes in the same execution context.",
    ],
    howItWorks: [
      "Define sender identity and channel policy.",
      "Queue channel actions with correlation IDs.",
      "Execute with provider-specific adapters.",
      "Capture delivery outcomes and failures.",
      "Post results back to operations threads.",
    ],
    proofModule: "Messaging",
    proofTag: "whatsapp",
  },
  {
    slug: "invest",
    title: "Invest (Trackable Capital)",
    status: "In build",
    outcome: "Deploy capital into verified operations with controlled releases.",
    outcomes: [
      "Tie funding to contract milestones and evidence.",
      "Restrict spend to approved categories and vendors.",
      "Show performance and risk updates over time.",
    ],
    howItWorks: [
      "Select opportunity and define investment contract.",
      "Fund escrow or controlled wallet rails.",
      "Release only against verified milestone evidence.",
      "Track spend against permitted categories.",
      "Publish periodic investor reporting and events.",
    ],
    proofModule: "Invest",
    proofTag: "invest",
  },
  {
    slug: "gold-commodities",
    title: "Gold & Commodities",
    status: "Live",
    outcome: "Execute origin-to-export workflows with traceability and compliance.",
    outcomes: [
      "Track batches across sourcing and buying offices.",
      "Attach compliance evidence through each checkpoint.",
      "Link settlement actions to verified execution events.",
    ],
    howItWorks: [
      "Register source events and batch metadata.",
      "Process checkpoints for compliance and approvals.",
      "Capture documents, photos, and receipts as evidence.",
      "Coordinate export and settlement workflows.",
      "Generate compliance and partner reports.",
    ],
    proofModule: "Gold",
    proofTag: "traceability",
  },
  {
    slug: "exportunity-pro",
    title: "Exportunity Pro (Seller)",
    status: "Gated",
    outcome: "Run sales, payments, operations, and team workflows from one app.",
    outcomes: [
      "Manage products, orders, and clients in one place.",
      "Operate with chat-first workflows and action cards.",
      "Coordinate team execution with status visibility.",
    ],
    howItWorks: [
      "Set up business workspace and role scopes.",
      "Manage products and order flow in operational threads.",
      "Use action cards for requests, approvals, and updates.",
      "Track wallet events tied to operational context.",
      "Review outcomes and performance signals.",
    ],
    proofModule: "Operations",
    proofTag: "seller",
  },
  {
    slug: "ai-agents",
    title: "AI Agents",
    status: "Hidden",
    outcome: "Agent teams create actions, request approvals, and execute tools.",
    outcomes: [
      "Run role-based agent collaboration in thread context.",
      "Create action records from executable intents.",
      "Enforce policy gates, budgets, and audit traces.",
    ],
    howItWorks: [
      "Assign agents to operational conversations.",
      "Parse intents into executable action contracts.",
      "Queue and run actions via worker runtime.",
      "Post success or failure back to thread.",
      "Track spend, retries, and governance logs.",
    ],
    proofModule: "Agents",
    proofTag: "agents",
  },
  {
    slug: "marketplace",
    title: "Marketplace",
    status: "Live",
    outcome: "Move from supplier discovery to executed procurement with evidence.",
    outcomes: [
      "Launch RFQ-to-order workflows with traceability.",
      "Keep delivery checkpoints and issue handling structured.",
      "Connect procurement to contract and payment rails.",
    ],
    howItWorks: [
      "Create RFQ and collect qualified supplier responses.",
      "Convert accepted quote into controlled order flow.",
      "Track delivery updates and exceptions.",
      "Trigger payments based on milestone evidence.",
      "Close with full audit of commercial execution.",
    ],
    proofModule: "Marketplace",
    proofTag: "procurement",
  },
  {
    slug: "compliance",
    title: "Compliance & Traceability",
    status: "Hidden",
    outcome: "Turn compliance into an operational workflow, not a spreadsheet task.",
    outcomes: [
      "Capture KYC/KYB and execution evidence by stage.",
      "Maintain immutable traceability events.",
      "Export auditable reports per process.",
    ],
    howItWorks: [
      "Define required evidence by workflow stage.",
      "Collect structured compliance artifacts.",
      "Validate and approve each compliance checkpoint.",
      "Log exceptions and remediation actions.",
      "Generate regulator and partner report packs.",
    ],
    proofModule: "Compliance",
    proofTag: "evidence",
  },
  {
    slug: "security-tenant-isolation",
    title: "Security & Tenant Isolation",
    status: "Hidden",
    outcome: "Tenant scoping, roles, audits, and safe defaults for collaboration.",
    outcomes: [
      "Tenant isolation across records and tool execution.",
      "Role-aware permissions and approval gates.",
      "Audit trails for sensitive actions and access.",
    ],
    howItWorks: [
      "Resolve tenant + role scope per request.",
      "Validate inputs and enforce policies before actions run.",
      "Log access and execution events with correlation IDs.",
      "Require approvals for high-impact operations.",
      "Expose audits and reports to authorized operators.",
    ],
    proofModule: "Security",
    proofTag: "security",
  },
];

export const FLAGSHIP_MODULE_SLUGS = [
  "wallet-payments",
  "digital-contracts",
  "action-logs",
  "messaging",
  "invest",
  "gold-commodities",
];

export type PlatformRolePath = {
  id: "operator" | "investor" | "seller" | "gold";
  label: string;
  outcomes: string[];
  moduleSlugs: string[];
  ctaLabel: string;
  ctaHref: string;
};

export const PLATFORM_ROLE_PATHS: PlatformRolePath[] = [
  {
    id: "operator",
    label: "Operator",
    outcomes: [
      "Coordinate teams, approvals, and actions from one command layer.",
      "Track execution state live without losing conversation context.",
      "Audit every action and escalation end to end.",
    ],
    moduleSlugs: ["ai-agents", "action-logs", "messaging"],
    ctaLabel: "Open operations center",
    ctaHref: "https://exportunity.net/app",
  },
  {
    id: "investor",
    label: "Investor",
    outcomes: [
      "Deploy capital through milestone-based contract controls.",
      "Monitor disbursement, evidence, and performance in one view.",
      "Review governance events before high-impact releases.",
    ],
    moduleSlugs: ["invest", "digital-contracts", "wallet-payments"],
    ctaLabel: "View investment workflows",
    ctaHref: "/invest/opportunities",
  },
  {
    id: "seller",
    label: "Seller (SME)",
    outcomes: [
      "Run products, clients, orders, and payments from one app.",
      "Use chat-first workflows with agent support where needed.",
      "Keep operations and money tightly linked.",
    ],
    moduleSlugs: ["exportunity-pro", "marketplace", "wallet-payments"],
    ctaLabel: "See Exportunity Pro",
    ctaHref: "/platform/pro",
  },
  {
    id: "gold",
    label: "Gold / Commodities",
    outcomes: [
      "Execute traceable mine-to-export workflows with evidence.",
      "Control releases through compliance and milestone gates.",
      "Generate buyer-ready and investor-ready reporting.",
    ],
    moduleSlugs: ["gold-commodities", "compliance", "digital-contracts"],
    ctaLabel: "Explore gold workflows",
    ctaHref: "/platform/gold",
  },
];

export const PLATFORM_STORY_CHAPTERS = [
  {
    year: "2012",
    title: "Trade and investment foundations",
    summary: "Exportunity started as a trade execution initiative focused on real cross-border outcomes.",
  },
  {
    year: "2015",
    title: "Marketplace and delivery points",
    summary: "Operational distribution and marketplace structures scaled into active tradepoint workflows.",
  },
  {
    year: "2017",
    title: "XportCARD fintech milestone",
    summary: "XportCARD launched with payment rails support, connecting execution and financial access.",
  },
  {
    year: "2019",
    title: "Platform refocus",
    summary: "The operating model shifted from isolated tools to one governed execution stack.",
  },
  {
    year: "Today",
    title: "Exportunity OS",
    summary: "Vertical workflows in commerce, gold, and governed agents run on one operating core.",
  },
];

export function findPlatformModule(slug: string) {
  const normalized = String(slug || "").trim().toLowerCase();
  return PLATFORM_MODULES.find((item) => item.slug === normalized) || null;
}

export function moduleHref(slug: string) {
  return `/platform/modules/${encodeURIComponent(slug)}`;
}
