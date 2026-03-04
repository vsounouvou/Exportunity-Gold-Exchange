import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminWalletRiskPage() {
  const alertsQuery = useQuery<any>({
    queryKey: ["admin_wallet_risk_alerts"],
    queryFn: async () => apiRequest("/api/admin/risk/alerts"),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Risk Alerts</h1>
          <p className="text-gray-400">Fraud/limits signals (MVP placeholder).</p>
        </div>
        <Button
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          onClick={() => alertsQuery.refetch()}
          disabled={alertsQuery.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${alertsQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alertsQuery.isLoading ? (
            <div className="text-sm text-white/60">Loading...</div>
          ) : alertsQuery.isError ? (
            <div className="text-sm text-rose-300">Failed to load alerts.</div>
          ) : (
            <ScrollArea className="h-[520px] rounded-xl border border-white/10 bg-white/5 p-3">
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap">{JSON.stringify(alertsQuery.data, null, 2)}</pre>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

