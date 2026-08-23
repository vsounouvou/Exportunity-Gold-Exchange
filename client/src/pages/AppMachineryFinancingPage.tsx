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
  title: string;
  summary?: string | null;
};

export default function AppMachineryFinancingPage() {
  const session = useSession();
  const [location, setLocation] = useLocation();

  if (!session.isAuthenticated || session.isGuest) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  const query = useQuery<{ items: Opportunity[] }>({
    queryKey: ["/api/invest/opportunities", "machinery"],
    queryFn: async () => apiRequest("/api/invest/opportunities?type=machinery&limit=20"),
    staleTime: 10_000,
  });

  const items = Array.isArray(query.data?.items) ? query.data!.items : [];

  return (
    <div data-testid="exportunity-machinery-financing" className="min-h-screen bg-[#F7F8FA] pb-24 text-[#07111F]">
      <AppProTopBar subtitle="Machinery financing" />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-2 p-5 text-sm leading-6 text-slate-700">
            <div className="text-base font-black text-slate-950">Order with investor capital</div>
            <div>
              Financing ties to an investment contract. Releases happen via approvals and milestone evidence, and funds route to procurement only.
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                className="bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
                onClick={() => setLocation("/app/invest/opportunities?type=machinery")}
              >
                View machinery opportunities
              </Button>
              <Button
                variant="outline"
                className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
                onClick={() => setLocation("/app/machinery/catalog")}
              >
                Open machinery catalog
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-sm font-black text-slate-950">Published opportunities</div>
        {query.isLoading ? <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white" /> : null}
        {!query.isLoading && !items.length ? (
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5 text-sm text-slate-600">No machinery opportunities published yet.</CardContent>
          </Card>
        ) : null}
        {items.map((item) => (
          <button
            key={item.slug}
            type="button"
            className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#F5A623]/50 hover:bg-[#FFFCF5]"
            onClick={() => setLocation(`/app/invest/opportunities/${encodeURIComponent(item.slug)}`)}
          >
            <div className="text-base font-black text-slate-950">{item.title}</div>
            {item.summary ? <div className="mt-1 text-sm leading-6 text-slate-600">{item.summary}</div> : null}
          </button>
        ))}
      </main>
      <AppProBottomNav activeKey="operations" />
    </div>
  );
}
