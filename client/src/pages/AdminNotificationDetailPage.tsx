import { useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

type Delivery = {
  id: number;
  channel: string;
  provider: string;
  toAddress: string;
  status: string;
  attempt: number;
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type DetailResponse = {
  ok: boolean;
  notification: any;
  deliveries: Delivery[];
};

export function AdminNotificationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");
  const [, navigate] = useLocation();
  const numericId = useMemo(() => Number(id), [id]);

  const detailQuery = useQuery<DetailResponse>({
    queryKey: [`/api/admin/notifications/${numericId}`],
    queryFn: async () => apiRequest(`/api/admin/notifications/${numericId}`),
    enabled: Number.isFinite(numericId) && numericId > 0,
    staleTime: 3_000,
  });

  const deliveries = detailQuery.data?.deliveries ?? [];

  return (
    <div data-testid="exportunity-admin-notification-detail" className="min-h-[calc(100vh-var(--admin-header-height,4rem))] bg-[#F7F8FA] text-[#07111F]">
      <div className="container mx-auto space-y-6 px-4 py-6 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8A5700]">GTN delivery evidence</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Notification #{id}</h1>
            <div className="text-xs font-medium text-slate-500">Provider delivery record</div>
          </div>
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" onClick={() => navigate("/admin/notifications")}>
            Back
          </Button>
        </div>

        <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-950">Deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[60vh] pr-3">
              <div className="space-y-3">
                {detailQuery.isLoading ? (
                  <div className="text-sm text-slate-500">Loading…</div>
                ) : deliveries.length === 0 ? (
                  <div className="text-sm text-slate-500">No deliveries recorded.</div>
                ) : (
                  deliveries.map((d) => (
                    <div key={d.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge className="border border-sky-200 bg-sky-50 font-semibold text-sky-800 hover:bg-sky-50">{d.channel}</Badge>
                            <Badge className="border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-white">{d.status}</Badge>
                            <div className="text-xs font-medium text-slate-500">attempt {d.attempt}</div>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{new Date(d.createdAt).toLocaleString()}</div>
                          <div className="mt-2 text-xs font-medium text-slate-600">To: {d.toAddress}</div>
                          {d.providerMessageId && (
                            <div className="mt-1 text-xs font-medium text-slate-600">Provider ID: {d.providerMessageId}</div>
                          )}
                          {d.errorMessage && <div className="mt-2 text-xs font-medium text-rose-700">Error: {d.errorMessage}</div>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-950">Notification record</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600">
              {detailQuery.data ? JSON.stringify(detailQuery.data.notification, null, 2) : "—"}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
