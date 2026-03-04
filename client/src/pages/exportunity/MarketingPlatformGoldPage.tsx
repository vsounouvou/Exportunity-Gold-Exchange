import { useMemo } from "react";
import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle, MediaThumb } from "@/components/exportunity/marketing-ui";
import { DeepLink } from "@/components/marketing/DeepLink";
import { fetchMarketingScreenshots, type MarketingScreenshot } from "@/lib/marketing-api";
import marketingSiteConfig from "@/content/marketing/site";

const GOLD_FLOW = [
  { id: "mine", label: "Mine", note: "Register origin events and source metadata.", gate: "Evidence capture" },
  { id: "office", label: "Buying Office", note: "Validate lots and commercial intent.", gate: "Approval + contract checks" },
  { id: "compliance", label: "Compliance", note: "Attach KYC/KYB and shipping evidence.", gate: "Compliance verifier sign-off" },
  { id: "export", label: "Export", note: "Execute shipment and documentation milestones.", gate: "Milestone release" },
  { id: "settlement", label: "Settlement", note: "Finalize payment and reporting.", gate: "Wallet + action logs" },
];

export default function MarketingPlatformGoldPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const shotsQuery = useQuery({
    queryKey: ["marketing-gold-shots"],
    queryFn: async () => {
      const res = await fetchMarketingScreenshots({ limit: 40, module: "Gold" });
      return Array.isArray(res?.items) ? (res.items as MarketingScreenshot[]) : [];
    },
  });

  const screenshots = shotsQuery.data || [];
  const carouselItems = useMemo(() => (screenshots.length ? screenshots : []).slice(0, 6), [screenshots]);

  return (
    <MarketingShell active="platform">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.invest} imageAlt="Gold and commodities execution">
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>PLATFORM / GOLD</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Gold execution with governed traceability.</MarketingTitle>
            <MarketingLead>Mine to settlement flows with wallet controls, contract gates, approvals, and evidence.</MarketingLead>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                <DeepLink linkKey="os.gold.home">Open Platform</DeepLink>
              </Button>
              <Link href="/demo">
                <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                  Open 1-minute guided demo
                </Button>
              </Link>
              <Link href="/talk">
                <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Talk to an agent
                </Button>
              </Link>
              <Link href="/proof?tab=screenshots&tag=traceability">
                <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Screenshot proof
                </Button>
              </Link>
            </div>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <GlassCard className="space-y-4">
          <div className="space-y-2">
            <MarketingKicker>FLOW</MarketingKicker>
            <h2 className="text-2xl font-semibold md:text-3xl">Mine to settlement with control gates</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {GOLD_FLOW.map((step, index) => (
              <div key={step.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-sky-200/70">Step {index + 1}</div>
                <div className="mt-1 text-base font-semibold text-white">{step.label}</div>
                <div className="mt-2 text-sm text-white/75">{step.note}</div>
                <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">{step.gate}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      </MarketingContainer>

      <MarketingContainer className="pb-10">
        <div className="space-y-3">
          <MarketingKicker>PROOF</MarketingKicker>
          <h2 className="text-2xl font-semibold md:text-3xl">Gold workflow proof carousel</h2>
        </div>
        <div className="mt-4 flex snap-x gap-4 overflow-x-auto pb-1">
          {carouselItems.map((item: any) => (
            <a
              key={String(item.id)}
              href={`/platform/screenshots?module=${encodeURIComponent(String(item.module || "Gold"))}`}
              className="min-w-[290px] snap-start rounded-2xl border border-white/10 bg-black/30 p-3 md:min-w-[360px]"
            >
              <MediaThumb src={String(item.imageLocalPath || item.imagePath || "")} alt={String(item.title || "Gold proof")} className="rounded-xl" />
              <div className="pt-3 text-sm font-semibold text-white">{item.title}</div>
            </a>
          ))}
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

