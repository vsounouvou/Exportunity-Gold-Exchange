import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type NotificationRow = {
  notification: {
    id: number;
    eventKey: string;
    status: string;
    title: string | null;
    message: string | null;
    recipientUserId: number | null;
    createdAt: string;
  };
  deliveries: Delivery[];
};

type NotificationsResponse = { ok: boolean; items: NotificationRow[] };

export function AdminNotificationsPage() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string>("");

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter.trim()) params.set("status", statusFilter.trim());
    if (channelFilter.trim()) params.set("channel", channelFilter.trim());
    params.set("limit", "200");
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [statusFilter, channelFilter]);

  const notificationsQuery = useQuery<NotificationsResponse>({
    queryKey: [`/api/admin/notifications${qs}`],
    queryFn: async () => apiRequest(`/api/admin/notifications${qs}`),
    staleTime: 3_000,
  });

  const rows = notificationsQuery.data?.items ?? [];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950">
      <div className="container mx-auto py-8 px-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">Admin Notifications</h1>
            <div className="text-xs text-white/60">Tenant: {tenant?.name || tenant?.key || "unknown"}</div>
          </div>
          <Button variant="secondary" onClick={() => queryClient.invalidateQueries({ queryKey: [`/api/admin/notifications${qs}`] })}>
            Refresh
          </Button>
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-white/70 mb-1">Status</div>
                <Input value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} placeholder="queued|sent|delivered|failed" />
              </div>
              <div>
                <div className="text-xs text-white/70 mb-1">Channel</div>
                <Input value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} placeholder="whatsapp|sms|email" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Recent</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[65vh] pr-3">
              <div className="space-y-3">
                {notificationsQuery.isLoading ? (
                  <div className="text-sm text-white/70">Loading…</div>
                ) : rows.length === 0 ? (
                  <div className="text-sm text-white/70">No notifications found.</div>
                ) : (
                  rows.map((row) => {
                    const n = row.notification;
                    const last = row.deliveries?.[0] ?? null;
                    return (
                      <div key={n.id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-medium text-white">{n.title || n.eventKey}</div>
                              <Badge className="bg-white/10 text-white border-white/10">{n.status}</Badge>
                              {last?.channel && (
                                <Badge className="bg-blue-500/20 text-blue-200 border-blue-500/20">{last.channel}</Badge>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-white/60">{new Date(n.createdAt).toLocaleString()}</div>
                            {n.message && <div className="mt-2 text-sm text-white/80 whitespace-pre-wrap">{n.message}</div>}
                            {last?.providerMessageId && (
                              <div className="mt-2 text-xs text-white/60">Provider ID: {last.providerMessageId}</div>
                            )}
                            {last?.errorMessage && <div className="mt-1 text-xs text-red-300">Error: {last.errorMessage}</div>}
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <Link href={`/admin/notifications/${n.id}`}>
                              <Button size="sm" variant="secondary">
                                Details
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

