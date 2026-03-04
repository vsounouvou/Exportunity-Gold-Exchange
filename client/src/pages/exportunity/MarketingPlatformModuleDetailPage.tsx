import { useMemo } from "react";
import { Link, Redirect } from "wouter";

import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle } from "@/components/exportunity/marketing-ui";
import { useMarketingPlatformHref } from "@/components/exportunity/useMarketingLinks";
import { findPlatformModule } from "@/content/platformModules";
import { PlatformProofGrid } from "@/components/exportunity/PlatformProofGrid";
import marketingSiteConfig from "@/content/marketing/site";

export default function MarketingPlatformModuleDetailPage({ params }: { params?: Record<string, string | undefined> }) {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const platformHref = useMarketingPlatformHref();
  const slug = useMemo(() => String(params?.slug || "").trim().toLowerCase(), [params?.slug]);
  const module = findPlatformModule(slug);

  if (!module) return <Redirect to="/platform/modules" />;
  if (module.status === "Hidden") return <Redirect to="/platform" />;

  return (
    <MarketingShell active="platform">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={module.heroImage || marketingSiteConfig.images?.platform} imageAlt={module.title}>
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>PLATFORM / MODULE</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">{module.title}</MarketingTitle>
            <MarketingLead>{module.outcome}</MarketingLead>
            <div className="flex flex-wrap gap-3">
              <a href={platformHref} target="_blank" rel="noreferrer">
                <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300">Open Platform</Button>
              </a>
              <Link href="/talk">
                <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                  Request demo
                </Button>
              </Link>
              <Link href="#proof">
                <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  See real workflows
                </Button>
              </Link>
            </div>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GlassCard className="space-y-4">
            <div className="text-xs font-semibold tracking-[0.2em] text-sky-200/70">WHAT YOU CAN DO</div>
            {module.outcomes.slice(0, 5).map((outcome) => (
              <div key={outcome} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/80">
                {outcome}
              </div>
            ))}
          </GlassCard>
          <GlassCard className="space-y-4">
            <div className="text-xs font-semibold tracking-[0.2em] text-sky-200/70">HOW IT WORKS</div>
            {module.howItWorks.slice(0, 5).map((step, index) => (
              <div key={step} className="flex gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/80">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/20 text-[11px] font-semibold">
                  {index + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </GlassCard>
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-10">
        <PlatformProofGrid
          title={`${module.title} proof`}
          description="Live screenshots and operational proof tied to this module."
          module={module.proofModule}
          tag={module.proofTag}
          limit={6}
          ctaHref="/proof?tab=screenshots"
          ctaLabel="Screenshot proof"
        />
      </MarketingContainer>

      <MarketingContainer className="pb-14">
        <div className="flex flex-wrap gap-3">
          <Link href="/platform/modules">
            <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
              View all modules
            </Button>
          </Link>
          <Link href="/platform">
            <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
              Back to platform
            </Button>
          </Link>
          <Link href="/demo">
            <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
              Open guided demo
            </Button>
          </Link>
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

