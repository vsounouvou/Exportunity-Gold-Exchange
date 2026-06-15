import { useMemo } from "react";
import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle, MediaThumb } from "@/components/exportunity/marketing-ui";
import { useMarketingPlatformHref } from "@/components/exportunity/useMarketingLinks";
import { fetchMarketingScreenshots, type MarketingScreenshot } from "@/lib/marketing-api";
import marketingSiteConfig from "@/content/marketing/site";

const DEMO_STEPS = [
  { id: "wallet", title: "Wallet", caption: "Control receive/send flows with references and approvals.", tag: "payments", href: "/platform/wallet" },
  { id: "contracts", title: "Contracts", caption: "Tie milestones to release rules and verifiable evidence.", tag: "contract", href: "/platform/contracts" },
  { id: "evidence", title: "Evidence", caption: "Attach documents and checkpoints before milestone release.", tag: "evidence", href: "/platform/compliance" },
  { id: "logs", title: "Logs", caption: "Review action and approval history with governance context.", tag: "audit", href: "/platform/governance" },
  { id: "reporting", title: "Reporting", caption: "Read execution outcomes and investor-grade summaries.", tag: "report", href: "/platform/invest" },
  { id: "gold", title: "Gold flow", caption: "Trace mine-to-settlement workflows with compliance controls.", tag: "traceability", href: "/platform/gold" },
];

export default function MarketingDemoPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const platformHref = useMarketingPlatformHref();
  const primaryPlatformHref = "https://exportunity.net/app";

  const shotsQuery = useQuery({
    queryKey: ["marketing-demo-shots"],
    queryFn: async () => {
      const res = await fetchMarketingScreenshots({ limit: 80 });
      return Array.isArray(res?.items) ? (res.items as MarketingScreenshot[]) : [];
    },
  });

  const screenshots = shotsQuery.data || [];
  const fallbackShots = screenshots.slice(0, 6);

  const stepScreens = useMemo(
    () =>
      DEMO_STEPS.map((step, index) => {
        const match = screenshots.find((shot: any) =>
          Array.isArray(shot.tags)
            ? shot.tags.some((tag: any) => String(tag || "").toLowerCase() === step.tag.toLowerCase())
            : false,
        );
        const fallback = fallbackShots[index] || fallbackShots[0];
        return {
          ...step,
          image: String((match as any)?.imageLocalPath || (match as any)?.imagePath || (fallback as any)?.imageLocalPath || (fallback as any)?.imagePath || ""),
          shotTitle: String((match as any)?.title || (fallback as any)?.title || step.title),
        };
      }),
    [screenshots, fallbackShots],
  );

  return (
    <MarketingShell active="platform">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.platform} imageAlt="Guided Exportunity demo">
          <div className="max-w-3xl space-y-4">
            <MarketingKicker>DEMO</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">See real workflows in two minutes.</MarketingTitle>
            <MarketingLead>No login needed. Walk the execution flow step by step.</MarketingLead>
            <div className="flex flex-wrap gap-3">
              <a href={primaryPlatformHref} target="_blank" rel="noreferrer">
                <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300">Open Platform</Button>
              </a>
              {platformHref !== primaryPlatformHref ? (
                <a href={platformHref} target="_blank" rel="noreferrer" className="sr-only">
                  Open current platform context
                </a>
              ) : null}
              <Link href="/talk">
                <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                  Request guided demo
                </Button>
              </Link>
              <Link href="/media?tab=screenshots">
                <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  View screenshots
                </Button>
              </Link>
            </div>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <div className="space-y-3">
          <MarketingKicker>GUIDED FLOW</MarketingKicker>
          <h2 className="text-2xl font-semibold md:text-3xl">Click-through execution sequence</h2>
        </div>
        <div className="mt-4 space-y-4">
          {stepScreens.map((step, index) => (
            <div key={step.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_1fr_210px] lg:items-center">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-sky-200/70">Step {index + 1}</div>
                  <div className="mt-1 text-lg font-semibold text-white">{step.title}</div>
                  <div className="mt-2 text-sm text-white/70">{step.caption}</div>
                </div>
                <MediaThumb src={step.image} alt={step.shotTitle} className="rounded-xl" />
                <div className="flex flex-col gap-2">
                  <Link href={step.href}>
                    <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                      Module page
                    </Button>
                  </Link>
                  <Link href={`/proof?tab=screenshots&tag=${encodeURIComponent(step.tag)}`}>
                    <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                      Screenshot proof
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

