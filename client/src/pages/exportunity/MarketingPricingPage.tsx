import { Link, Redirect } from "wouter";

import marketingSiteConfig from "@/content/marketing/site";
import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle } from "@/components/exportunity/marketing-ui";
import { useMarketingPlatformHref } from "@/components/exportunity/useMarketingLinks";

export default function MarketingPricingPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const platformHref = useMarketingPlatformHref();

  return (
    <MarketingShell>
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.platform} imageAlt="Exportunity plans">
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>PLANS</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Membership & platform access</MarketingTitle>
            <MarketingLead>Plans and operational modules are managed in the live Exportunity platform. Use the links below for current tiers and onboarding.</MarketingLead>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10 pb-14">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <GlassCard>
            <h3 className="text-lg font-semibold">Member login</h3>
            <p className="mt-2 text-sm text-white/75">Access your current workspace, agents, and trade operations.</p>
            <a href={marketingSiteConfig.memberLoginLink} target="_blank" rel="noreferrer" className="mt-4 inline-flex">
              <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300">Log in</Button>
            </a>
          </GlassCard>
          <GlassCard>
            <h3 className="text-lg font-semibold">Platform access</h3>
            <p className="mt-2 text-sm text-white/75">Open Exportunity OS and review enabled modules for your tenant.</p>
            <a href={platformHref} target="_blank" rel="noreferrer" className="mt-4 inline-flex">
              <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">Open Platform</Button>
            </a>
          </GlassCard>
          <GlassCard>
            <h3 className="text-lg font-semibold">Sales advisory</h3>
            <p className="mt-2 text-sm text-white/75">Need a tailored configuration? Talk to our team for deployment scope and pricing.</p>
            <div className="mt-4 inline-flex">
              <Link href="/talk">
                <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">Contact sales</Button>
              </Link>
            </div>
          </GlassCard>
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

