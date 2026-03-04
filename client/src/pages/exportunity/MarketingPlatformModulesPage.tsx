import { Link, Redirect } from "wouter";

import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle } from "@/components/exportunity/marketing-ui";
import { useMarketingPlatformHref } from "@/components/exportunity/useMarketingLinks";
import { PLATFORM_MODULES, moduleHref } from "@/content/platformModules";
import marketingSiteConfig from "@/content/marketing/site";

export default function MarketingPlatformModulesPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const platformHref = useMarketingPlatformHref();
  const visibleModules = PLATFORM_MODULES.filter((module) => module.status !== "Hidden");

  return (
    <MarketingShell active="platform">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.platform} imageAlt="Exportunity module directory">
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>PLATFORM / MODULES</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Module directory, linked to real pages.</MarketingTitle>
            <MarketingLead>Each module page shows outcomes, flow, proof tiles, and direct next steps.</MarketingLead>
            <div className="flex flex-wrap gap-3">
              <a href={platformHref} target="_blank" rel="noreferrer">
                <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300">Open Platform</Button>
              </a>
              <Link href="/proof?tab=screenshots">
                <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Screenshot proof
                </Button>
              </Link>
              <Link href="/talk">
                <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                  Request demo
                </Button>
              </Link>
            </div>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleModules.map((module) => (
            <Link key={module.slug} href={moduleHref(module.slug)}>
              <a className="rounded-2xl border border-white/10 bg-black/30 p-5 transition-all hover:-translate-y-0.5 hover:border-white/25">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white">{module.title}</h2>
                  <span className="rounded-full border border-white/15 bg-white/[0.03] px-2 py-1 text-xs text-white/70">{module.status}</span>
                </div>
                <p className="mt-2 text-sm text-white/75">{module.outcome}</p>
                <div className="mt-4 text-sm font-medium text-amber-200">View module details</div>
              </a>
            </Link>
          ))}
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

