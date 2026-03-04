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
    <div className="min-h-screen bg-gray-950 pb-32 text-white">
      <AppProTopBar subtitle="Invest opportunity" />
      <main className="mx-auto w-full max-w-3xl px-4 pb-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-sky-200/70">{item?.type || "opportunity"}</div>
            <h1 className="mt-2 text-2xl font-semibold">{item?.title || "Loading..."}</h1>
            {item?.summary ? <div className="mt-2 text-sm text-white/70">{item.summary}</div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-white/15 text-white/80 hover:bg-white/10"
              onClick={() => setLocation("/app/invest/opportunities")}
            >
              Back
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
              onClick={() => setLocation(`/app/invest/onboarding?op=${encodeURIComponent(slug)}`)}
            >
              Start onboarding
            </Button>
          </div>
        </div>

        {query.isLoading ? (
          <div className="mt-5 space-y-2">
            <div className="h-20 animate-pulse rounded-xl border border-white/10 bg-white/5" />
            <div className="h-20 animate-pulse rounded-xl border border-white/10 bg-white/5" />
          </div>
        ) : null}

        {query.error ? (
          <Card className="mt-5 border-red-500/30 bg-red-500/10">
            <CardContent className="p-5 text-sm text-red-100">Failed to load opportunity.</CardContent>
          </Card>
        ) : null}

        {item ? (
          <div className="mt-5 space-y-4">
            <Card className="border-white/10 bg-white/5">
              <CardContent className="p-5 space-y-2 text-sm text-white/75">
                <div>
                  <span className="text-white/55">Country:</span> {item.country || "Multi-market"}
                </div>
                <div>
                  <span className="text-white/55">Funding goal:</span> {String(item.currency || "USD").toUpperCase()}{" "}
                  {item.fundingGoalMin || "?"} {item.fundingGoalMax ? `- ${item.fundingGoalMax}` : ""}
                </div>
                <div>
                  <span className="text-white/55">Duration:</span> {item.contractDurationMonths ? `${item.contractDurationMonths} months` : "Flexible"}
                </div>
              </CardContent>
            </Card>

            {Array.isArray(item.useOfFunds) && item.useOfFunds.length ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-5">
                  <div className="text-sm font-semibold">Use of funds</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.useOfFunds.map((u) => (
                      <span key={u} className="rounded-full border border-white/15 bg-black/20 px-2 py-1 text-xs text-white/75">
                        {u}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {Array.isArray(item.trackedKpis) && item.trackedKpis.length ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-5">
                  <div className="text-sm font-semibold">Tracked KPIs</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.trackedKpis.map((k) => (
                      <span key={k} className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100">
                        {k}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {item.narrative ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-5 text-sm text-white/75 whitespace-pre-line">{item.narrative}</CardContent>
              </Card>
            ) : null}

            {item.riskNotes ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-5">
                  <div className="text-sm font-semibold">Risk notes</div>
                  <div className="mt-2 text-sm text-white/75 whitespace-pre-line">{item.riskNotes}</div>
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
