export type PublicSurfaceContract = {
  path: string;
  pageTitle: string;
  primaryCTA: { label: string; href: string };
  proofLinks: Array<{ label: string; href: string }>;
};

export const PUBLIC_SURFACE_CONTRACTS: PublicSurfaceContract[] = [
  {
    path: "/",
    pageTitle: "Exportunity proximity-first Marketplace",
    primaryCTA: { label: "Sell on the Marketplace", href: "/apply/shop" },
    proofLinks: [
      { label: "Industrial sourcing", href: "/industrial" },
      { label: "Trade intelligence", href: "/trade" },
    ],
  },
  {
    path: "/marketplace",
    pageTitle: "Exportunity proximity-first Marketplace",
    primaryCTA: { label: "Sell on the Marketplace", href: "/apply/shop" },
    proofLinks: [
      { label: "Industrial sourcing", href: "/industrial" },
      { label: "Global Trade Network", href: "/source" },
    ],
  },
  {
    path: "/trade",
    pageTitle: "Trade intelligence",
    primaryCTA: { label: "Submit a requirement", href: "/request-quote" },
    proofLinks: [{ label: "Industrial network", href: "/industrial" }],
  },
  {
    path: "/industrial",
    pageTitle: "Industrial sourcing network",
    primaryCTA: { label: "Request a quote", href: "/request-quote" },
    proofLinks: [{ label: "Factory network", href: "/factories" }],
  },
  {
    path: "/industrial-map",
    pageTitle: "Industrial network map",
    primaryCTA: { label: "Request a quote", href: "/request-quote" },
    proofLinks: [{ label: "Factory network", href: "/factories" }],
  },
  {
    path: "/producer-exchange",
    pageTitle: "Producer exchange",
    primaryCTA: { label: "Browse industrial sourcing", href: "/industrial" },
    proofLinks: [],
  },
  {
    path: "/login",
    pageTitle: "Exportunity access",
    primaryCTA: { label: "Back to the network", href: "/" },
    proofLinks: [],
  },
  {
    path: "/orders",
    pageTitle: "Protected GTN order records",
    primaryCTA: { label: "Back to the network", href: "/" },
    proofLinks: [],
  },
  {
    path: "/privacy",
    pageTitle: "GTN privacy",
    primaryCTA: { label: "Open account access", href: "/login" },
    proofLinks: [{ label: "Compliance", href: "/cadre-conformite" }],
  },
  {
    path: "/terms",
    pageTitle: "GTN terms",
    primaryCTA: { label: "Open account access", href: "/login" },
    proofLinks: [{ label: "Privacy", href: "/privacy" }],
  },
  {
    path: "/cadre-conformite",
    pageTitle: "GTN governance",
    primaryCTA: { label: "Open account access", href: "/login" },
    proofLinks: [{ label: "Terms", href: "/terms" }],
  },
  {
    path: "/application-status",
    pageTitle: "GTN access-request status",
    primaryCTA: { label: "Request access", href: "/register" },
    proofLinks: [{ label: "Open sign in", href: "/login" }],
  },
];
