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
    <div data-testid="exportunity-admin-notifications" className="min-h-[calc(100vh-var(--admin-header-height,4rem))] bg-[#F7F8FA] text-[#07111F]">
      <div className="container mx-auto space-y-6 px-4 py-6 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8A5700]">GTN delivery evidence</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Notification operations</h1>
            <div className="text-xs font-medium text-slate-500">Workspace: {tenant?.name || tenant?.key || "unknown"}</div>
          </div>
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" onClick={() => queryClient.invalidateQueries({ queryKey: [`/api/admin/notifications${qs}`] })}>
            Refresh
          </Button>
        </div>

        <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-950">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-600">Status</div>
                <Input className="border-slate-200 bg-white text-slate-950" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} placeholder="queued | sent | delivered | failed" />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-600">Channel</div>
                <Input className="border-slate-200 bg-white text-slate-950" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} placeholder="WhatsApp | SMS | email" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-950">Recent delivery records</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[65vh] pr-3">
              <div className="space-y-3">
                {notificationsQuery.isLoading ? (
                  <div className="text-sm text-slate-500">Loading…</div>
                ) : rows.length === 0 ? (
                  <div className="text-sm text-slate-500">No notifications found.</div>
                ) : (
                  rows.map((row) => {
                    const n = row.notification;
                    const last = row.deliveries?.[0] ?? null;
                    return (
                      <div key={n.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-bold text-slate-950">{n.title || n.eventKey}</div>
                              <Badge className="border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-white">{n.status}</Badge>
                              {last?.channel && (
                                <Badge className="border border-sky-200 bg-sky-50 font-semibold text-sky-800 hover:bg-sky-50">{last.channel}</Badge>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{new Date(n.createdAt).toLocaleString()}</div>
                            {n.message && <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{n.message}</div>}
                            {last?.providerMessageId && (
                              <div className="mt-2 text-xs font-medium text-slate-500">Provider ID: {last.providerMessageId}</div>
                            )}
                            {last?.errorMessage && <div className="mt-1 text-xs font-medium text-rose-700">Error: {last.errorMessage}</div>}
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <Link href={`/admin/notifications/${n.id}`}>
                              <Button size="sm" variant="outline" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]">
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

