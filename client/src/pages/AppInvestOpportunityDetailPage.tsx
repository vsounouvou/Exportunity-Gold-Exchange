import { Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

type OpportunityDetail = {
  slug: string;
  type: string;
  title: string;
  summary?: string | null;
  country?: string | null;
  trackRecordBadge?: string | null;
  fundingGoalMin?: string | null;
  fundingGoalMax?: string | null;
  currency?: string | null;
  useOfFunds?: string[];
  trackedKpis?: string[];
  narrative?: string | null;
  riskNotes?: string | null;
  mitigations?: string | null;
  contractDurationMonths?: number | null;
};

export default function AppInvestOpportunityDetailPage({ slug }: { slug: string }) {
  const session = useSession();
  const [location, setLocation] = useLocation();

  if (!session.isAuthenticated || session.isGuest) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  const query = useQuery<{ item: OpportunityDetail }>({
    queryKey: ["/api/invest/opportunities/detail", slug],
    queryFn: async () => apiRequest(`/api/invest/opportunities/${encodeURIComponent(slug)}`),
    staleTime: 10_000,
  });

  const item = (query.data as any)?.item as OpportunityDetail | undefined;

  return (
    <div data-testid="exportunity-invest-opportunity-detail" className="min-h-screen bg-[#F7F8FA] pb-24 text-[#07111F]">
      <AppProTopBar subtitle="Invest opportunity" />
      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5700]">{item?.type || "opportunity"}</div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{item?.title || "Loading..."}</h1>
            {item?.summary ? <div className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{item.summary}</div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
              onClick={() => setLocation("/app/invest/opportunities")}
            >
              Back
            </Button>
            <Button
              className="bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
              onClick={() => setLocation(`/app/invest/onboarding?op=${encodeURIComponent(slug)}`)}
            >
              Start onboarding
            </Button>
          </div>
        </div>

        {query.isLoading ? (
          <div className="mt-5 space-y-2">
            <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white" />
            <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white" />
          </div>
        ) : null}

        {query.error ? (
          <Card className="mt-5 border-rose-200 bg-rose-50">
            <CardContent className="p-5 text-sm font-medium text-rose-800">Failed to load opportunity.</CardContent>
          </Card>
        ) : null}

        {item ? (
          <div className="mt-5 space-y-4">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-2 p-5 text-sm text-slate-700">
                <div>
                  <span className="font-semibold text-slate-500">Country:</span> {item.country || "Multi-market"}
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Funding goal:</span> {String(item.currency || "USD").toUpperCase()}{" "}
                  {item.fundingGoalMin || "?"} {item.fundingGoalMax ? `- ${item.fundingGoalMax}` : ""}
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Duration:</span> {item.contractDurationMonths ? `${item.contractDurationMonths} months` : "Flexible"}
                </div>
              </CardContent>
            </Card>

            {Array.isArray(item.useOfFunds) && item.useOfFunds.length ? (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5">
                  <div className="text-sm font-semibold">Use of funds</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.useOfFunds.map((u) => (
                      <span key={u} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                        {u}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {Array.isArray(item.trackedKpis) && item.trackedKpis.length ? (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5">
                  <div className="text-sm font-semibold">Tracked KPIs</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.trackedKpis.map((k) => (
                      <span key={k} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                        {k}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {item.narrative ? (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="whitespace-pre-line p-5 text-sm leading-6 text-slate-700">{item.narrative}</CardContent>
              </Card>
            ) : null}

            {item.riskNotes ? (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5">
                  <div className="text-sm font-semibold">Risk notes</div>
                  <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{item.riskNotes}</div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </main>
      <AppProBottomNav activeKey="operations" />
    </div>
  );
}
