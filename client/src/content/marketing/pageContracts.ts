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
    pageGoal: "Introduce the operating model and route users to platform or concierge.",
    primaryCTA: { label: "Open platform", href: "https://exportunity.net/app" },
    proofLinks: [{ label: "Demo", href: "/demo" }, { label: "Coverage", href: "/media" }],
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
