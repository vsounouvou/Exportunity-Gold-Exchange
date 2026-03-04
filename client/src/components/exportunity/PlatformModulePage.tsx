import { Link } from "wouter";

import marketingSiteConfig from "@/content/marketing/site";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/exportunity/MarketingShell";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle } from "@/components/exportunity/marketing-ui";
import { PlatformProofGrid } from "@/components/exportunity/PlatformProofGrid";
import type { DeepLinkKey } from "@/marketing/deepLinks";
import { DeepLink } from "@/components/marketing/DeepLink";

export function PlatformModulePage({
  kicker,
  title,
  lead,
  heroImage,
  heroAlt,
  purpose,
  capabilities,
  howItWorks,
  proofModule,
  proofTag,
  backHref = "/platform",
  primaryLinkKey = "os.home",
}: {
  kicker: string;
  title: string;
  lead: string;
  heroImage?: string | null;
  heroAlt?: string;
  purpose?: string;
  capabilities: string[];
  howItWorks: string[];
  proofModule?: string;
  proofTag?: string;
  backHref?: string;
  primaryLinkKey?: DeepLinkKey;
}) {
  return (
    <MarketingShell active="platform">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={heroImage || marketingSiteConfig.images?.platform} imageAlt={heroAlt || title}>
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>{kicker}</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">{title}</MarketingTitle>
            <MarketingLead>{lead}</MarketingLead>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <GlassCard className="space-y-4">
            <div className="text-xs font-semibold tracking-[0.24em] text-sky-200/70">WHAT IT IS</div>
            <div className="text-lg font-semibold text-white">{purpose || lead}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {capabilities.slice(0, 6).map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/80">
                  {item}
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="space-y-4">
            <div className="text-xs font-semibold tracking-[0.24em] text-sky-200/70">HOW IT WORKS</div>
            <ol className="space-y-3 text-sm text-white/75">
              {howItWorks.slice(0, 6).map((step, index) => (
                <li key={`${index}-${step}`} className="flex gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/40 text-xs font-semibold text-white/80">
                    {index + 1}
                  </div>
                  <div>{step}</div>
                </li>
              ))}
            </ol>
          </GlassCard>
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-14">
        <PlatformProofGrid
          title="Proof"
          description="These are real screenshots from the live platform surface (upload more in /admin/screenshots)."
          module={proofModule}
          tag={proofTag}
          limit={6}
        />

        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild className="bg-amber-400 text-slate-950 hover:bg-amber-300">
            <DeepLink linkKey={primaryLinkKey}>Open Platform</DeepLink>
          </Button>
          <Link href="/talk">
            <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
              Request demo
            </Button>
          </Link>
          <Link href={`${backHref}#modules`}>
            <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
              Explore modules
            </Button>
          </Link>
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}
