import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import marketingSiteConfig from "@/content/marketing/site";
import { Button } from "@/components/ui/button";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import {
  GlassCard,
  HeroPanel,
  MarketingContainer,
  MarketingKicker,
  MarketingLead,
  MarketingTitle,
} from "@/components/exportunity/marketing-ui";
import { ContractSnapshot, OpportunityCard } from "@/components/exportunity/invest-ui";
import { InvestmentLeadForm } from "@/components/exportunity/InvestmentLeadForm";
import { fetchInvestmentOpportunities } from "@/lib/marketing-api";
import { useLocale } from "@/contexts/LocaleContext";
import { useSession } from "@/lib/session";
import { resolveDeepLinkPath, resolveInvestOpportunityDetailPath } from "@/marketing/deepLinks";
import { DeepLink } from "@/components/marketing/DeepLink";

export default function MarketingInvestPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const { language, currency } = useLocale();
  const session = useSession();
  const country =
    typeof navigator !== "undefined" ? (String(navigator.language || "").split("-")[1]?.toUpperCase() || null) : null;
  const ctx = { isAuthenticated: session.isAuthenticated && !session.isGuest };

  const opportunitiesQuery = useQuery({
    queryKey: ["marketing-invest-opportunities-featured"],
    queryFn: () => fetchInvestmentOpportunities({ limit: 4, featured: true }),
  });

  const opportunities = Array.isArray(opportunitiesQuery.data?.items) ? opportunitiesQuery.data.items : [];

  const investCards = [
    {
      title: "SMEs & Online Shops",
      tracked: "Platform sales velocity, repeat-buyer activity, and order execution.",
      returns: "Revenue-share models linked to verified sales and margin behavior.",
      duration: "6â€“12 months",
      href: resolveDeepLinkPath("os.invest.opportunities", { language, currency, country, query: { type: "sme" } }, ctx),
    },
    {
      title: "Machinery & Equipment",
      tracked: "Vendor purchase proof, deployment status, and utilization.",
      returns: "Asset-backed models with service and usage-linked payout cadence.",
      duration: "12â€“24 months",
      href: resolveDeepLinkPath("os.invest.opportunities", { language, currency, country, query: { type: "machinery" } }, ctx),
    },
    {
      title: "Farms & Production Units",
      tracked: "Input purchases, output logs, delivery and sales evidence.",
      returns: "Seasonal revenue-share based on tracked production and sell-through.",
      duration: "9â€“18 months",
      href: resolveDeepLinkPath("os.invest.opportunities", { language, currency, country, query: { type: "farm" } }, ctx),
    },
    {
      title: "Gold & Commodities Operations",
      tracked: "Purchase orders, compliance evidence, rotation and settlement events.",
      returns: "Rotation economics with documentary controls and event-level reporting.",
      duration: "3â€“9 months",
      href: resolveDeepLinkPath("os.invest.opportunities", { language, currency, country, query: { type: "gold" } }, ctx),
    },
  ];

  const controls = [
    "Escrow and controlled release",
    "Milestones with evidence requirements",
    "Platform-only spending controls",
    "Audit trails and live reporting",
    "Investor communications and governance",
    "Termination, dispute, and refund logic",
  ];

  const trustStrip = marketingSiteConfig.invest?.trustStrip || ["Escrow", "Audit trail", "Milestones", "Verified purchases"];

  return (
    <MarketingShell active="invest">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.invest} imageAlt="Invest with Exportunity">
          <div className="max-w-4xl space-y-5">
            <MarketingKicker>INVEST</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">
              {marketingSiteConfig.invest?.headline || "Invest directly into verified operations â€” with tracked execution."}
            </MarketingTitle>
            <MarketingLead>
              {marketingSiteConfig.invest?.subtext ||
                "Exportunity enables investors to fund real businesses operating on the platform. Capital is tied to a digital contract, released by milestones, and spent through platform-native purchases so execution and returns remain visible."}
            </MarketingLead>

            <div className="rounded-xl border border-white/15 bg-black/35 p-3 text-sm text-white/80">
              <span className="font-semibold text-white">What happens next:</span> Review opportunities, request onboarding, receive
              contract suitability review, and proceed through compliance + contract setup.
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                <DeepLink linkKey="os.invest.opportunities" query={{ entry: "marketing-invest" }}>
                  View investment opportunities
                </DeepLink>
              </Button>
              <Link href="/invest/contracts">
                <Button variant="secondary" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                  How investment contracts work
                </Button>
              </Link>
              <Link href="/talk">
                <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Talk to an operator
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {trustStrip.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-10">
        <div className="mb-4">
          <MarketingKicker>WHAT YOU CAN INVEST IN</MarketingKicker>
          <h2 className="mt-3 text-3xl font-semibold">Platform-native investment classes</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {investCards.map((card) => (
            <GlassCard key={card.title}>
              <h3 className="text-lg font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm text-white/75">
                <span className="font-semibold text-white">What is tracked:</span> {card.tracked}
              </p>
              <p className="mt-1 text-sm text-white/75">
                <span className="font-semibold text-white">Return model:</span> {card.returns}
              </p>
              <p className="mt-1 text-sm text-white/75">
                <span className="font-semibold text-white">Typical duration:</span> {card.duration}
              </p>
              <div className="mt-4">
                <Link href={card.href}>
                  <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                    Explore
                  </Button>
                </Link>
              </div>
            </GlassCard>
          ))}
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-8">
        <div className="mb-4">
          <MarketingKicker>HOW IT WORKS</MarketingKicker>
          <h2 className="mt-3 text-3xl font-semibold">A controlled 3-step investment flow</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <GlassCard>
            <div className="text-xs font-semibold tracking-[0.12em] text-sky-200/80">STEP 1</div>
            <h3 className="mt-2 text-lg font-semibold">Business track record</h3>
            <p className="mt-2 text-sm text-white/75">
              Businesses build data reliability through transactions, execution consistency, and documented operations.
            </p>
          </GlassCard>
          <GlassCard>
            <div className="text-xs font-semibold tracking-[0.12em] text-sky-200/80">STEP 2</div>
            <h3 className="mt-2 text-lg font-semibold">Contract-funded escrow</h3>
            <p className="mt-2 text-sm text-white/75">
              Investor capital enters a digital contract with milestones, permitted spend categories, and governance controls.
            </p>
          </GlassCard>
          <GlassCard>
            <div className="text-xs font-semibold tracking-[0.12em] text-sky-200/80">STEP 3</div>
            <h3 className="mt-2 text-lg font-semibold">Controlled release + reporting</h3>
            <p className="mt-2 text-sm text-white/75">
              Funds release to approved platform actions (procurement, operations, marketing credits) with KPI reporting.
            </p>
          </GlassCard>
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-8">
        <div className="mb-4">
          <MarketingKicker>DIGITAL CONTRACT CONTROLS</MarketingKicker>
          <h2 className="mt-3 text-3xl font-semibold">Governance controls mapped to execution rails</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {controls.map((control) => (
            <GlassCard key={control} className="py-4">
              <div className="text-sm">{control}</div>
            </GlassCard>
          ))}
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ContractSnapshot
            amount="USD 120,000"
            purpose="Equipment acquisition + controlled working capital"
            milestones="3 release gates (procurement, deployment, KPI checkpoint)"
            evidenceRequired="Invoices, delivery proof, platform transaction IDs, milestone verifier notes"
            reportingFrequency="Weekly activity log + monthly investor report"
            returnLogic="Model linked to platform sales/utilization data (not guaranteed)"
          />
          <GlassCard>
            <h3 className="text-xl font-semibold">Returns and transparency</h3>
            <p className="mt-2 text-sm text-white/75">
              Return models are scenario-based and linked to measurable platform events: sales and fulfillment (SMEs),
              utilization and service reliability (machinery), and rotation economics with compliance proofs (commodities).
            </p>
            <p className="mt-3 text-sm text-white/75">
              Investors receive contract-level logs, milestone status, and periodic KPI updates to evaluate execution quality.
            </p>
            <p className="mt-3 text-sm text-amber-100/90">
              {marketingSiteConfig.invest?.disclaimer || "Returns are modeled, not guaranteed. Investments involve risk."}
            </p>
          </GlassCard>
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <MarketingKicker>OPPORTUNITIES</MarketingKicker>
            <h2 className="mt-3 text-3xl font-semibold">
              {marketingSiteConfig.invest?.opportunitiesHeadline || "Investment opportunities"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-white/75">
              {marketingSiteConfig.invest?.opportunitiesLead ||
                "Explore opportunities with milestone controls, spending restrictions, and investor reporting."}
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="border-white/30 bg-transparent text-white hover:bg-white/10"
          >
            <DeepLink linkKey="os.invest.opportunities" query={{ entry: "marketing-invest" }}>
              View all opportunities
            </DeepLink>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(opportunities.length ? opportunities : []).slice(0, 4).map((item: any) => (
            <OpportunityCard
              key={item.slug || item.id}
              opportunity={item}
              ctaLabel="Open in platform"
              ctaHref={resolveInvestOpportunityDetailPath(String(item.slug), { language, currency, country }, ctx)}
            />
          ))}
          {!opportunities.length ? (
            investCards.slice(0, 4).map((card) => (
              <OpportunityCard
                key={card.title}
                opportunity={{
                  slug: card.href.split("=").pop() || card.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                  type: "sme",
                  title: card.title,
                  summary: card.tracked,
                  country: "Multi-country",
                  trackRecordBadge: "Verified on platform",
                  fundingGoalMin: null,
                  fundingGoalMax: null,
                  currency: "USD",
                  contractDurationMonths: null,
                  trackedKpis: [],
                }}
                ctaHref={card.href}
              />
            ))
          ) : null}
        </div>
      </MarketingContainer>

      <MarketingContainer className="pb-14">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GlassCard>
            <h3 className="text-xl font-semibold">Iâ€™m an investor</h3>
            <p className="mt-2 text-sm text-white/75">Request onboarding and receive a structured opportunity pack.</p>
            <div className="mt-4">
              <InvestmentLeadForm
                submitLabel="Start investor onboarding"
                defaultMessage="I want access to current opportunities and contract controls."
                sourceUrl="/invest?path=investor"
              />
            </div>
          </GlassCard>
          <GlassCard>
            <h3 className="text-xl font-semibold">I want to raise capital</h3>
            <p className="mt-2 text-sm text-white/75">
              Submit your business profile and operating data to evaluate eligibility for platform-linked capital.
            </p>
            <div className="mt-4">
              <InvestmentLeadForm
                submitLabel="Apply for capital readiness"
                defaultMessage="I want to raise capital through Exportunity with contract-based controls."
                sourceUrl="/invest?path=raise-capital"
              />
            </div>
          </GlassCard>
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

