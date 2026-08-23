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
    <div data-testid="exportunity-invest-opportunities" className="min-h-screen bg-[#F7F8FA] pb-24 text-[#07111F]">
      <AppProTopBar subtitle="Invest opportunities" />
      <main className="mx-auto w-full max-w-4xl px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium text-slate-600">Review published opportunities and their governed operating records.</div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
              onClick={() => setLocation("/app/invest/onboarding")}
              data-testid="app-invest-start-onboarding"
            >
              Start onboarding
            </Button>
            <Button
              className="bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
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
                  ? "border-[#F5A623]/45 bg-[#FFF8E8] text-[#8A5700]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-[#F5A623]/45 hover:bg-[#FFF8E8]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <section className="mt-5 space-y-3" data-testid="app-invest-opportunities-list">
          {query.isLoading ? (
            <div className="space-y-2">
              <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white" />
              <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white" />
              <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white" />
            </div>
          ) : null}

          {!query.isLoading && !items.length ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5 text-sm text-slate-600">No opportunities published yet for this filter.</CardContent>
            </Card>
          ) : null}

          {items.map((item) => (
            <button
              key={item.slug}
              type="button"
              data-testid={`app-invest-opportunity-${item.slug}`}
              className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#F5A623]/50 hover:bg-[#FFFCF5]"
              onClick={() => setLocation(`/app/invest/opportunities/${encodeURIComponent(item.slug)}`)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5700]">{item.type}</div>
                {item.trackRecordBadge ? (
                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800">
                    {item.trackRecordBadge}
                  </div>
                ) : null}
              </div>
              <div className="mt-2 text-base font-black text-slate-950">{item.title}</div>
              {item.summary ? <div className="mt-1 text-sm leading-6 text-slate-600">{item.summary}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">{item.country || "Multi-market"}</span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                  {item.contractDurationMonths ? `${item.contractDurationMonths} months` : "Flexible duration"}
                </span>
                <span className="rounded-lg border border-[#F5A623]/35 bg-[#FFF8E8] px-2 py-1 font-bold text-[#8A5700]">
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
