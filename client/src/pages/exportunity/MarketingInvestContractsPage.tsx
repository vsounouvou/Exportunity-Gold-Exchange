import { Link, Redirect } from "wouter";

import marketingSiteConfig from "@/content/marketing/site";
import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { useMarketingPlatformHref } from "@/components/exportunity/useMarketingLinks";
import { ContractSnapshot, MilestoneTimeline } from "@/components/exportunity/invest-ui";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle } from "@/components/exportunity/marketing-ui";

export default function MarketingInvestContractsPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const platformHref = useMarketingPlatformHref();

  const milestones = [
    { title: "Approved procurement", amount: "USD 45,000", evidence: ["Vendor invoice", "Delivery confirmation", "Platform purchase order"] },
    { title: "Deployment evidence", amount: "USD 30,000", evidence: ["Commissioning report", "Photos", "Utilization baseline"] },
    { title: "KPI checkpoint", amount: "USD 15,000", evidence: ["Weekly logs", "Revenue trend", "Exception report"] },
  ];

  return (
    <MarketingShell active="invest">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.platform} imageAlt="Digital contract controls">
          <div className="max-w-4xl space-y-4">
            <MarketingKicker>INVESTMENT CONTRACTS</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Smart Digital Contract controls</MarketingTitle>
            <MarketingLead>
              Investments on Exportunity are governed by digital contracts: escrow, milestone releases, evidence requirements, and reporting tied to real
              platform activity.
            </MarketingLead>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link href="/invest/opportunities">
                <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300">View opportunities</Button>
              </Link>
              <a href={platformHref} target="_blank" rel="noreferrer">
                <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                  Open Platform
                </Button>
              </a>
              <Link href="/talk">
                <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Request demo
                </Button>
              </Link>
            </div>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ContractSnapshot
            amount="USD 90,000"
            purpose="Inventory + machinery + marketing credits"
            milestones="3 release gates with evidence requirements"
            evidenceRequired="Invoices, platform purchase orders, delivery confirmations, KPI logs"
            reportingFrequency="Weekly activity logs + monthly investor report"
            returnLogic="Modeled against platform KPIs (not guaranteed)"
          />
          <GlassCard>
            <h3 className="text-xl font-semibold">How execution works</h3>
            <div className="mt-3 space-y-2 text-sm text-white/75">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                Capital / Orders / Actions â†’ <span className="font-semibold text-white">Contract rules</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                Contract rules â†’ <span className="font-semibold text-white">Approved spend</span> (vendor pay, restricted rails)
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                Approved spend â†’ <span className="font-semibold text-white">Evidence</span> (docs, receipts, platform events)
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                Evidence â†’ <span className="font-semibold text-white">Reporting</span> (logs, KPIs, milestone status)
              </div>
            </div>
            <p className="mt-4 text-sm text-amber-100/90">
              {marketingSiteConfig.invest?.disclaimer || "Returns are modeled, not guaranteed. Investments involve risk."}
            </p>
          </GlassCard>
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-14">
        <div className="mb-4">
          <MarketingKicker>MILESTONES</MarketingKicker>
          <h2 className="mt-3 text-3xl font-semibold">Milestones and evidence unlock release</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/75">
            Releases are tied to verifiable platform activity: purchase orders, delivery proof, and operational KPI checkpoints.
          </p>
        </div>
        <MilestoneTimeline milestones={milestones} />
      </MarketingContainer>
    </MarketingShell>
  );
}

