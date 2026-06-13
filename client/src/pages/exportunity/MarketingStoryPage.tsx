import { Redirect } from "wouter";

import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import {
  HeroPanel,
  MarketingContainer,
  MarketingLead,
  MarketingTitle,
  MediaThumb,
} from "@/components/exportunity/marketing-ui";
import marketingSiteConfig from "@/content/marketing/site";

const TIMELINE: Array<{
  year: string;
  location: string;
  title: string;
  emotionalLine: string;
  factualLine: string;
  caption: string;
  source: string;
  image: string;
}> = [
  {
    year: "2012",
    location: "West Africa",
    title: "The first field lessons",
    emotionalLine: "We started where trade is real life: people, trust, and constraints.",
    factualLine: "The mission formed: connect producers to buyers with discipline.",
    caption: "Team moment during early field operations.",
    source: "Internal archive photo",
    image: String(marketingSiteConfig.images?.journey || marketingSiteConfig.images?.hero || ""),
  },
  {
    year: "2014",
    location: "Benin",
    title: "Early networks, early responsibility",
    emotionalLine: "Faces, handshakes, and long days; this is where credibility is earned.",
    factualLine: "First operational relationships and sourcing patterns were mapped.",
    caption: "Partners and stakeholders in an early sourcing cycle.",
    source: "Internal archive photo",
    image: String(marketingSiteConfig.images?.hero || marketingSiteConfig.images?.journey || ""),
  },
  {
    year: "2016",
    location: "West Africa",
    title: "From contacts to systems",
    emotionalLine: "We stopped just connecting people and started building workflows.",
    factualLine: "Marketplace structure moved to listings, verification, and coordination.",
    caption: "Operational review with industry leaders.",
    source: "Internal archive photo",
    image: String(marketingSiteConfig.images?.solutions || marketingSiteConfig.images?.journey || ""),
  },
  {
    year: "2017",
    location: "International",
    title: "Recognition and direction",
    emotionalLine: "A milestone year that brought clarity, confidence, and visibility.",
    factualLine: "Exportunity evolved from project mode into a platform vision.",
    caption: "Program and partner milestone moment.",
    source: "Internal archive photo",
    image: String(marketingSiteConfig.images?.platform || marketingSiteConfig.images?.hero || ""),
  },
  {
    year: "2019",
    location: "Regional",
    title: "Execution becomes the product",
    emotionalLine: "Operations are not slides; execution is the differentiator.",
    factualLine: "Contracts, approvals, and payments were formalized in workflows.",
    caption: "Execution checkpoint with operations teams.",
    source: "Internal archive photo",
    image: String(marketingSiteConfig.images?.platform || marketingSiteConfig.images?.journey || ""),
  },
  {
    year: "2021",
    location: "Multi-commodity",
    title: "Trust infrastructure",
    emotionalLine: "Every deal needs traceability, compliance, and accountability.",
    factualLine: "Workflow hardening introduced role checks and controlled handoffs.",
    caption: "Cross-functional operations and governance review.",
    source: "Internal archive photo",
    image: String(marketingSiteConfig.images?.invest || marketingSiteConfig.images?.platform || ""),
  },
  {
    year: "2023",
    location: "Platform era",
    title: "One stack, many missions",
    emotionalLine: "Not one market, but multiple verticals with one operating core.",
    factualLine: "Tenant surfaces were separated for focus and unified for control.",
    caption: "Architecture planning and deployment milestone.",
    source: "Internal archive photo",
    image: String(marketingSiteConfig.images?.solutions || marketingSiteConfig.images?.platform || ""),
  },
  {
    year: "2024",
    location: "Rollout",
    title: "Wallets, contracts, and routing",
    emotionalLine: "The backbone moved from blueprint to field deployment.",
    factualLine: "Escrow, routing, and operator support entered live operations.",
    caption: "Platform rollout across operations teams.",
    source: "Internal archive photo",
    image: String(marketingSiteConfig.images?.contact || marketingSiteConfig.images?.hero || ""),
  },
  {
    year: "2025",
    location: "Present",
    title: "Scale Africa-first execution",
    emotionalLine: "We keep the focus on access, clarity, and outcomes.",
    factualLine: "Exportunity continues scaling trade, assets, and business operations.",
    caption: "Current team and execution snapshot.",
    source: "Internal archive photo",
    image: String(marketingSiteConfig.images?.hero || marketingSiteConfig.images?.journey || ""),
  },
];

export default function MarketingStoryPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  return (
    <MarketingShell active="journey">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.journey} imageAlt="Exportunity journey timeline hero image">
          <div className="max-w-3xl space-y-4">
            <MarketingTitle className="text-4xl md:text-5xl">Our Journey</MarketingTitle>
            <MarketingLead>A timeline of how execution discipline became the core of the platform.</MarketingLead>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="pb-14 pt-10">
        <div className="grid grid-cols-1 gap-5">
          {TIMELINE.map((item) => (
            <article
              key={`${item.year}-${item.title}`}
              className="grid grid-cols-1 gap-4 rounded-3xl border border-white/10 bg-black/30 p-6 md:grid-cols-[1fr_1.1fr]"
            >
              <div className="space-y-2">
                <MediaThumb src={item.image} alt={`${item.year} ${item.title} photo`} className="rounded-2xl" />
                <figcaption className="text-xs text-white/65">{item.caption}</figcaption>
                <div className="text-[11px] text-white/50">Source: {item.source}</div>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold tracking-[0.16em] text-sky-200/80">
                  {item.year} ? {item.location}
                </div>
                <h2 className="text-xl font-semibold text-white">{item.title}</h2>
                <p className="text-sm text-white/85">{item.emotionalLine}</p>
                <p className="text-sm text-white/70">{item.factualLine}</p>
              </div>
            </article>
          ))}
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}