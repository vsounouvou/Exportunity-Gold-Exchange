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
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950">
      <div className="container mx-auto py-8 px-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">Notification #{id}</h1>
            <div className="text-xs text-white/60">Admin detail view</div>
          </div>
          <Button variant="secondary" onClick={() => navigate("/admin/notifications")}>
            Back
          </Button>
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[60vh] pr-3">
              <div className="space-y-3">
                {detailQuery.isLoading ? (
                  <div className="text-sm text-white/70">Loading…</div>
                ) : deliveries.length === 0 ? (
                  <div className="text-sm text-white/70">No deliveries recorded.</div>
                ) : (
                  deliveries.map((d) => (
                    <div key={d.id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-blue-500/20 text-blue-200 border-blue-500/20">{d.channel}</Badge>
                            <Badge className="bg-white/10 text-white border-white/10">{d.status}</Badge>
                            <div className="text-xs text-white/60">attempt {d.attempt}</div>
                          </div>
                          <div className="mt-1 text-xs text-white/60">{new Date(d.createdAt).toLocaleString()}</div>
                          <div className="mt-2 text-xs text-white/70">To: {d.toAddress}</div>
                          {d.providerMessageId && (
                            <div className="mt-1 text-xs text-white/70">Provider ID: {d.providerMessageId}</div>
                          )}
                          {d.errorMessage && <div className="mt-2 text-xs text-red-300">Error: {d.errorMessage}</div>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Raw</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-white/70 whitespace-pre-wrap break-words">
              {detailQuery.data ? JSON.stringify(detailQuery.data.notification, null, 2) : "—"}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
