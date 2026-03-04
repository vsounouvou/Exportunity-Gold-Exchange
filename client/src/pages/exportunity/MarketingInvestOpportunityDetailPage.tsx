import { useMemo } from "react";
import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import marketingSiteConfig from "@/content/marketing/site";
import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle } from "@/components/exportunity/marketing-ui";
import { MilestoneTimeline } from "@/components/exportunity/invest-ui";
import { InvestmentLeadForm } from "@/components/exportunity/InvestmentLeadForm";
import { fetchInvestmentOpportunityBySlug } from "@/lib/marketing-api";

function coerceMilestones(value: unknown) {
  if (!value || typeof value !== "object") return [];
  const milestones = (value as any)?.milestones;
  if (!Array.isArray(milestones)) return [];
  return milestones
    .map((m: any) => ({
      title: String(m?.title || "").trim(),
      amount: m?.amount != null ? String(m.amount) : null,
      evidence: Array.isArray(m?.evidenceRequired) ? m.evidenceRequired.map((e: any) => String(e || "").trim()).filter(Boolean) : [],
    }))
    .filter((m: any) => Boolean(m.title));
}

export default function MarketingInvestOpportunityDetailPage({ params }: { params?: Record<string, string | undefined> }) {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const slug = useMemo(() => String(params?.slug || "").trim(), [params?.slug]);

  const detailQuery = useQuery({
    queryKey: ["marketing-invest-opportunity", slug],
    enabled: Boolean(slug),
    queryFn: () => fetchInvestmentOpportunityBySlug(slug),
  });

  if (!slug) return <Redirect to="/invest/opportunities" />;

  const item = detailQuery.data?.item;
  const milestones = coerceMilestones(item?.fundingPlan);

  return (
    <MarketingShell active="invest">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.invest} imageAlt="Opportunity detail">
          <div className="max-w-4xl space-y-4">
            <MarketingKicker>OPPORTUNITY</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">{item?.title || "Opportunity detail"}</MarketingTitle>
            <MarketingLead>{item?.summary || "Review the investment narrative, milestones, and reporting logic for this opportunity."}</MarketingLead>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link href="/invest/opportunities">
                <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Back to opportunities
                </Button>
              </Link>
              <Link href="/talk">
                <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300">Request access</Button>
              </Link>
            </div>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr,0.8fr]">
          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.12em] text-white/60">{item?.type || "investment"}</div>
              <div className="rounded-full border border-emerald-300/35 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-100">
                {item?.trackRecordBadge || "Verified on platform"}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-white/50">Country</div>
                <div className="mt-1 text-sm font-semibold">{item?.country || "Multi-market"}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-white/50">Contract duration</div>
                <div className="mt-1 text-sm font-semibold">
                  {item?.contractDurationMonths ? `${item.contractDurationMonths} months` : "Flexible"}
                </div>
              </div>
            </div>

            {item?.narrative ? (
              <div className="mt-5">
                <div className="text-sm font-semibold">Narrative</div>
                <p className="mt-2 text-sm text-white/75">{String(item.narrative)}</p>
              </div>
            ) : null}

            {Array.isArray(item?.trackedKpis) && item.trackedKpis.length ? (
              <div className="mt-5">
                <div className="text-sm font-semibold">Tracked KPIs</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.trackedKpis.map((kpi: any) => (
                    <span key={String(kpi)} className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/75">
                      {String(kpi)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {milestones.length ? (
              <div className="mt-6">
                <div className="text-sm font-semibold">Milestones</div>
                <MilestoneTimeline milestones={milestones} className="mt-3" />
              </div>
            ) : null}

            <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] p-4">
              <div className="text-sm font-semibold text-amber-100">Return model (non-guaranteed)</div>
              <p className="mt-2 text-sm text-white/80">
                {item?.returnModel ||
                  "Return models are scenario-based and linked to verified platform operations. This is not a guarantee of performance."}
              </p>
            </div>
          </GlassCard>

          <GlassCard>
            <h3 className="text-xl font-semibold">Request onboarding</h3>
            <p className="mt-2 text-sm text-white/75">
              Get the full diligence pack: contract controls, milestone evidence requirements, and reporting cadence.
            </p>
            <div className="mt-4">
              <InvestmentLeadForm
                submitLabel="Request access to this opportunity"
                defaultMessage={`I want access to opportunity: ${item?.title || slug}. Please share the contract controls and onboarding steps.`}
                sourceUrl={`/invest/opportunities/${encodeURIComponent(slug)}`}
              />
            </div>
          </GlassCard>
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}


