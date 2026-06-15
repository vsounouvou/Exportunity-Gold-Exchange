export type MarketingPageContract = {
  path: string;
  pageTitle: string;
  pageGoal: string;
  primaryCTA: { label: string; href: string };
  proofLinks: Array<{ label: string; href: string }>;
};

export const MARKETING_PAGE_CONTRACTS: MarketingPageContract[] = [
  {
    path: "/",
    pageTitle: "Exportunity Home",
    pageGoal: "Present Exportunity as a serious public company with trade history, platforms, proof, and operating depth.",
    primaryCTA: { label: "Explore what we do", href: "/what-we-do" },
    proofLinks: [{ label: "Archive", href: "/archive" }, { label: "Platform Access", href: "/platform" }],
  },
  {
    path: "/company",
    pageTitle: "Company",
    pageGoal: "Explain Exportunity history, credibility, leadership, and current platform direction.",
    primaryCTA: { label: "View archive", href: "/archive" },
    proofLinks: [{ label: "Media", href: "/media" }, { label: "Contact", href: "/contact" }],
  },
  {
    path: "/what-we-do",
    pageTitle: "What We Do",
    pageGoal: "Show the company's activity areas: trade, gold, machinery, advisory, payments, and operating systems.",
    primaryCTA: { label: "Work with us", href: "/work-with-us" },
    proofLinks: [{ label: "Gold & Mining", href: "/gold-mining" }, { label: "Operating Stack", href: "/operating-stack" }],
  },
  {
    path: "/platforms",
    pageTitle: "Platforms",
    pageGoal: "List Exportunity platform directions and connected operating roles without leaving blank platform pages.",
    primaryCTA: { label: "Open platform", href: "/platform" },
    proofLinks: [{ label: "Archive", href: "/archive" }, { label: "Operating Stack", href: "/operating-stack" }],
  },
  {
    path: "/gold-mining",
    pageTitle: "Gold & Mining",
    pageGoal: "Explain gold-related workflows with careful language around sourcing, verification, records, and coordination.",
    primaryCTA: { label: "Explore Bourse de l'Or", href: "/gold-mining" },
    proofLinks: [{ label: "Archive", href: "/archive" }, { label: "Request access", href: "/work-with-us" }],
  },
  {
    path: "/machinery",
    pageTitle: "Machinery",
    pageGoal: "Present machinery sourcing, equipment support, financing pathways, and procurement follow-up.",
    primaryCTA: { label: "Request machinery support", href: "/work-with-us" },
    proofLinks: [{ label: "What We Do", href: "/what-we-do" }, { label: "Contact", href: "/contact" }],
  },
  {
    path: "/government-institutions",
    pageTitle: "Government & Institutions",
    pageGoal: "Present advisory, platform strategy, trade execution, and public-private coordination without implying current contracts.",
    primaryCTA: { label: "Contact institutional team", href: "/contact" },
    proofLinks: [{ label: "Archive", href: "/archive" }, { label: "What We Do", href: "/what-we-do" }],
  },
  {
    path: "/archive",
    pageTitle: "Archive",
    pageGoal: "Serve as proof hub for media, records, platforms, company history, and approval status.",
    primaryCTA: { label: "View record", href: "/media" },
    proofLinks: [{ label: "Company", href: "/company" }, { label: "Contact", href: "/contact" }],
  },
  {
    path: "/operating-stack",
    pageTitle: "Operating Stack",
    pageGoal: "Explain workflows behind the public platforms: marketplace, wallet, contracts, messaging, agents, governance, and archive.",
    primaryCTA: { label: "Request access", href: "/work-with-us" },
    proofLinks: [{ label: "Platforms", href: "/platforms" }, { label: "Platform Access", href: "/platform" }],
  },
  {
    path: "/work-with-us",
    pageTitle: "Work With Exportunity",
    pageGoal: "Collect requests for trade, gold, machinery, advisory, platform access, partnerships, and media.",
    primaryCTA: { label: "Send request", href: "#request" },
    proofLinks: [{ label: "Contact", href: "/contact" }, { label: "Platform Access", href: "/platform" }],
  },
  {
    path: "/platform",
    pageTitle: "Platform Architecture",
    pageGoal: "Show role paths, execution flow, modules, and coverage tiles.",
    primaryCTA: { label: "Open platform", href: "https://exportunity.net/app" },
    proofLinks: [
      { label: "Screenshots", href: "/media?tab=screenshots" },
      { label: "Press", href: "/media?tab=press" },
    ],
  },
  {
    path: "/use-cases",
    pageTitle: "Use Cases",
    pageGoal: "Route roles into the platform and show coverage adjacent to each entry.",
    primaryCTA: { label: "Open platform", href: "https://exportunity.net/app" },
    proofLinks: [{ label: "Coverage", href: "/media" }],
  },
  {
    path: "/platform/modules",
    pageTitle: "Platform Modules",
    pageGoal: "Show all module pages and direct paths to module coverage.",
    primaryCTA: { label: "Open platform", href: "https://exportunity.net/app" },
    proofLinks: [{ label: "Module screenshots", href: "/media?tab=screenshots" }],
  },
  {
    path: "/platform/gold",
    pageTitle: "Gold Workflows",
    pageGoal: "Explain mine-to-settlement flow with control gates and coverage.",
    primaryCTA: { label: "Open platform", href: "https://exportunity.net/app" },
    proofLinks: [{ label: "Screenshots", href: "/media?tab=screenshots" }],
  },
  {
    path: "/proof",
    pageTitle: "Coverage",
    pageGoal: "Show press, videos, profiles, and screenshots without duplicates.",
    primaryCTA: { label: "Open platform", href: "https://exportunity.net/app" },
    proofLinks: [{ label: "Platform", href: "/platform" }, { label: "Talk", href: "/talk" }],
  },
  {
    path: "/story",
    pageTitle: "Company Story",
    pageGoal: "Tell the company story with chapters backed by coverage.",
    primaryCTA: { label: "Open platform", href: "https://exportunity.net/app" },
    proofLinks: [{ label: "Founder story", href: "/story/founder" }, { label: "Coverage", href: "/media" }],
  },
  {
    path: "/story/founder",
    pageTitle: "Founder Story",
    pageGoal: "Present founder credibility without mixing with corporate story.",
    primaryCTA: { label: "Open platform", href: "https://exportunity.net/app" },
    proofLinks: [{ label: "Company story", href: "/story" }, { label: "Coverage", href: "/media" }],
  },
  {
    path: "/talk",
    pageTitle: "Talk",
    pageGoal: "Start agent concierge flow and route to the next practical action.",
    primaryCTA: { label: "Open platform", href: "https://exportunity.net/app" },
    proofLinks: [{ label: "Platform", href: "/platform" }, { label: "Coverage", href: "/media" }],
  },
  {
    path: "/demo",
    pageTitle: "Guided Demo",
    pageGoal: "Give public walkthrough without login.",
    primaryCTA: { label: "Open platform", href: "https://exportunity.net/app" },
    proofLinks: [{ label: "Screenshots", href: "/media?tab=screenshots" }],
  },
];
