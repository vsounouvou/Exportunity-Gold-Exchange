import { Link, Redirect } from "wouter";

import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { HeroPanel, MarketingContainer, MarketingLead, MarketingTitle } from "@/components/exportunity/marketing-ui";
import marketingSiteConfig from "@/content/marketing/site";

const MODULES: Array<{ title: string; text: string; href: string }> = [
  { title: "AI-managed operations", text: "Automated task execution and routing.", href: "/ai-operations" },
  { title: "Multi-tenant structure", text: "Operate multiple entities and roles.", href: "/platform" },
  { title: "Gold & commodities", text: "Commodity trade and settlement workflows.", href: "/trade" },
  { title: "Communications", text: "Messaging and operational notifications.", href: "/communications" },
  { title: "Compliance", text: "Audit trails, identity checks, and controls.", href: "/compliance" },
];

export default function MarketingSolutionsPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  return (
    <MarketingShell active="solutions">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.solutions} imageAlt="Execution modules">
          <div className="max-w-3xl space-y-4">
            <MarketingTitle className="text-4xl md:text-5xl">Execution modules</MarketingTitle>
            <MarketingLead>Functional modules available on the platform.</MarketingLead>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="pb-14 pt-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => (
            <Link key={module.title} href={module.href}>
              <a className="rounded-3xl border border-white/10 bg-black/30 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-white/30">
                <div className="text-lg font-semibold text-white">{module.title}</div>
                <div className="mt-2 text-sm text-white/75">{module.text}</div>
                <div className="mt-4 inline-flex rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950">Open</div>
              </a>
            </Link>
          ))}
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

