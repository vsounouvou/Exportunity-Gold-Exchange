import { useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";

import marketingSiteConfig from "@/content/marketing/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, HeroPanel, MarketingContainer, MarketingKicker, MarketingLead, MarketingTitle } from "@/components/exportunity/marketing-ui";
import { OpportunityCard } from "@/components/exportunity/invest-ui";
import { fetchInvestmentOpportunities } from "@/lib/marketing-api";

type TypeKey = "all" | "sme" | "machinery" | "farm" | "factory" | "gold" | "commodities";

function readParam(name: string) {
  if (typeof window === "undefined") return "";
  try {
    return String(new URLSearchParams(window.location.search).get(name) || "").trim();
  } catch {
    return "";
  }
}

export default function MarketingInvestOpportunitiesPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const initialType = (readParam("type").toLowerCase() as TypeKey) || "all";
  const initialQuery = readParam("q");

  const [type, setType] = useState<TypeKey>(
    ["sme", "machinery", "farm", "factory", "gold", "commodities"].includes(initialType) ? initialType : "all",
  );
  const [query, setQuery] = useState(initialQuery);

  const opportunitiesQuery = useQuery({
    queryKey: ["marketing-invest-opportunities", type, query],
    queryFn: () =>
      fetchInvestmentOpportunities({
        limit: 120,
        type: type === "all" ? undefined : type,
        q: query || undefined,
      }),
  });

  const items = useMemo(() => (Array.isArray(opportunitiesQuery.data?.items) ? opportunitiesQuery.data.items : []), [opportunitiesQuery.data]);

  return (
    <MarketingShell active="invest">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.invest} imageAlt="Investment opportunities">
          <div className="max-w-4xl space-y-4">
            <MarketingKicker>INVEST</MarketingKicker>
            <MarketingTitle className="text-4xl md:text-5xl">Investment opportunities</MarketingTitle>
            <MarketingLead>
              A directory of platform-linked opportunities with contract controls, milestone release gates, and investor-grade reporting.
            </MarketingLead>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link href="/invest">
                <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Back to Invest
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
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-[220px,1fr,auto] md:items-center">
          <select
            value={type}
            onChange={(event) => setType(event.target.value as TypeKey)}
            className="h-10 rounded-md border border-white/20 bg-white/10 px-3 text-sm text-white"
          >
            <option value="all">All types</option>
            <option value="sme">SMEs</option>
            <option value="machinery">Machinery</option>
            <option value="farm">Farms</option>
            <option value="factory">Factories</option>
            <option value="gold">Gold</option>
            <option value="commodities">Commodities</option>
          </select>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, country, or summary"
            className="border-white/20 bg-white/10 text-white"
          />
          <div className="text-xs text-white/60 md:text-right">
            {opportunitiesQuery.isLoading ? "Loading..." : `${items.length} opportunities`}
          </div>
        </div>

        {items.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((item: any) => (
              <OpportunityCard key={item.slug || item.id} opportunity={item} ctaLabel="View details" />
            ))}
          </div>
        ) : (
          <GlassCard className="p-6">
            <div className="text-lg font-semibold">No results</div>
            <p className="mt-2 text-sm text-white/75">
              Try a different type filter or search query. If you want access to private opportunities, start with a short operator chat.
            </p>
            <div className="mt-4">
              <Link href="/talk">
                <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300">Talk to an operator</Button>
              </Link>
            </div>
          </GlassCard>
        )}
      </MarketingContainer>
    </MarketingShell>
  );
}


