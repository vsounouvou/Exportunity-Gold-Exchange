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
    <div className="min-h-screen bg-gray-950 pb-32 text-white">
      <AppProTopBar subtitle="Machinery financing" />
      <main className="mx-auto w-full max-w-3xl px-4 pb-4 pt-6 space-y-4">
        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-5 space-y-2 text-sm text-white/75">
            <div className="text-base font-semibold text-white">Order with investor capital</div>
            <div>
              Financing ties to an investment contract. Releases happen via approvals and milestone evidence, and funds route to procurement only.
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                onClick={() => setLocation("/app/invest/opportunities?type=machinery")}
              >
                View machinery opportunities
              </Button>
              <Button
                variant="outline"
                className="border-white/15 text-white/80 hover:bg-white/10"
                onClick={() => setLocation("/app/machinery/catalog")}
              >
                Open machinery catalog
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-sm font-semibold text-white">Live opportunities</div>
        {query.isLoading ? <div className="h-20 animate-pulse rounded-xl border border-white/10 bg-white/5" /> : null}
        {!query.isLoading && !items.length ? (
          <Card className="border-white/10 bg-white/5">
            <CardContent className="p-5 text-sm text-white/70">No machinery opportunities published yet.</CardContent>
          </Card>
        ) : null}
        {items.map((item) => (
          <button
            key={item.slug}
            type="button"
            className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
            onClick={() => setLocation(`/app/invest/opportunities/${encodeURIComponent(item.slug)}`)}
          >
            <div className="text-base font-semibold">{item.title}</div>
            {item.summary ? <div className="mt-1 text-sm text-white/70">{item.summary}</div> : null}
          </button>
        ))}
      </main>
      <AppProBottomNav activeKey="operations" />
    </div>
  );
}
