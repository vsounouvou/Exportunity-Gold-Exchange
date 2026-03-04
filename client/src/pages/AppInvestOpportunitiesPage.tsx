import { useMemo } from "react";
import { Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

type Opportunity = {
  slug: string;
  type: string;
  title: string;
  summary?: string | null;
  country?: string | null;
  trackRecordBadge?: string | null;
  fundingGoalMin?: string | null;
  fundingGoalMax?: string | null;
  currency?: string | null;
  contractDurationMonths?: number | null;
};

function normalizeType(value: string | null) {
  const t = String(value || "").trim().toLowerCase();
  if (["sme", "machinery", "farm", "factory", "gold", "commodities"].includes(t)) return t;
  return "all";
}

function parseParams(location: string) {
  const idx = location.indexOf("?");
  const params = new URLSearchParams(idx >= 0 ? location.slice(idx + 1) : "");
  const type = normalizeType(params.get("type"));
  const q = String(params.get("q") || "").trim();
  return { type, q };
}

export default function AppInvestOpportunitiesPage() {
  const session = useSession();
  const [location, setLocation] = useLocation();

  if (!session.isAuthenticated || session.isGuest) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  const { type, q } = useMemo(() => parseParams(location), [location]);

  const query = useQuery<{ items: Opportunity[] }>({
    queryKey: ["/api/invest/opportunities", type, q],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("limit", "80");
      if (type !== "all") qs.set("type", type);
      if (q) qs.set("q", q);
      return apiRequest(`/api/invest/opportunities?${qs.toString()}`);
    },
    staleTime: 10_000,
  });

  const items = Array.isArray(query.data?.items) ? query.data!.items : [];

  const setType = (next: string) => {
    const params = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "");
    if (next === "all") params.delete("type");
    else params.set("type", next);
    setLocation(`/app/invest/opportunities${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <div className="min-h-screen bg-gray-950 pb-32 text-white">
      <AppProTopBar subtitle="Invest opportunities" />
      <main className="mx-auto w-full max-w-4xl px-4 pb-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-white/70">Pick a class, then open the real opportunity detail.</div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-white/15 text-white/80 hover:bg-white/10"
              onClick={() => setLocation("/app/invest/onboarding")}
              data-testid="app-invest-start-onboarding"
            >
              Start onboarding
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
              onClick={() => setLocation("/app/raise-capital/apply")}
              data-testid="app-invest-raise-capital"
            >
              Raise capital
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" data-testid="app-invest-type-filters">
          {[
            { key: "all", label: "All" },
            { key: "sme", label: "SMEs" },
            { key: "farm", label: "Farms" },
            { key: "machinery", label: "Machinery" },
            { key: "gold", label: "Gold" },
            { key: "commodities", label: "Commodities" },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              data-testid={`invest-type-${opt.key}`}
              onClick={() => setType(opt.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                type === opt.key
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                  : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <section className="mt-5 space-y-3" data-testid="app-invest-opportunities-list">
          {query.isLoading ? (
            <div className="space-y-2">
              <div className="h-20 animate-pulse rounded-xl border border-white/10 bg-white/5" />
              <div className="h-20 animate-pulse rounded-xl border border-white/10 bg-white/5" />
              <div className="h-20 animate-pulse rounded-xl border border-white/10 bg-white/5" />
            </div>
          ) : null}

          {!query.isLoading && !items.length ? (
            <Card className="border-white/10 bg-white/5">
              <CardContent className="p-5 text-sm text-white/70">No opportunities published yet for this filter.</CardContent>
            </Card>
          ) : null}

          {items.map((item) => (
            <button
              key={item.slug}
              type="button"
              data-testid={`app-invest-opportunity-${item.slug}`}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
              onClick={() => setLocation(`/app/invest/opportunities/${encodeURIComponent(item.slug)}`)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.14em] text-sky-200/70">{item.type}</div>
                {item.trackRecordBadge ? (
                  <div className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100">
                    {item.trackRecordBadge}
                  </div>
                ) : null}
              </div>
              <div className="mt-2 text-base font-semibold text-white">{item.title}</div>
              {item.summary ? <div className="mt-1 text-sm text-white/70">{item.summary}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
                <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">{item.country || "Multi-market"}</span>
                <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">
                  {item.contractDurationMonths ? `${item.contractDurationMonths} months` : "Flexible duration"}
                </span>
                <span className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-amber-100/90">
                  {String(item.currency || "USD").toUpperCase()} {item.fundingGoalMin || "?"} {item.fundingGoalMax ? `- ${item.fundingGoalMax}` : ""}
                </span>
              </div>
            </button>
          ))}
        </section>
      </main>
      <AppProBottomNav activeKey="operations" />
    </div>
  );
}
