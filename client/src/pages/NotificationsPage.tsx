import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

type NotificationRow = {
  notification: {
    id: number;
    eventKey: string;
    status: string;
    title: string | null;
    message: string | null;
    readAt: string | null;
    createdAt: string;
  };
  deliveries: Delivery[];
};

type NotificationsResponse = { ok: boolean; items: NotificationRow[] };

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const notificationsQuery = useQuery<NotificationsResponse>({
    queryKey: ["/api/notifications"],
    staleTime: 5_000,
  });

  const rows = notificationsQuery.data?.items ?? [];

  const unreadIds = useMemo(
    () => rows.map((r) => r.notification).filter((n) => !n.readAt).map((n) => n.id),
    [rows],
  );

  const markReadMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("/api/notifications/read", "POST", { notificationIds: ids });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: String(err?.message || err), variant: "destructive" });
    },
  });

  return (
    <div data-testid="exportunity-notifications" className="min-h-[calc(100vh-var(--admin-header-height,4rem))] bg-[#F7F8FA] text-[#07111F]">
      <div className="container mx-auto space-y-6 px-4 py-6 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8A5700]">GTN account activity</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Notifications</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
              disabled={!unreadIds.length || markReadMutation.isPending}
              onClick={() => markReadMutation.mutate(unreadIds)}
            >
              Mark all read
            </Button>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] })}>
              Refresh
            </Button>
          </div>
        </div>

        <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-950">Activity inbox</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[70vh] pr-3">
              <div className="space-y-3">
                {notificationsQuery.isLoading ? (
                  <div className="text-sm text-slate-500">Loading…</div>
                ) : rows.length === 0 ? (
                  <div className="text-sm text-slate-500">No notifications yet.</div>
                ) : (
                  rows.map((row) => {
                    const n = row.notification;
                    const unread = !n.readAt;
                    const lastDelivery = row.deliveries?.[0] ?? null;
                    const summary =
                      lastDelivery
                        ? `${String(lastDelivery.channel).toUpperCase()} • ${lastDelivery.status}${lastDelivery.providerMessageId ? ` • ${lastDelivery.providerMessageId}` : ""}`
                        : n.status;

                    return (
                      <div key={n.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-bold text-slate-950">
                                {n.title || n.eventKey}
                              </div>
                              {unread && <Badge className="border border-[#F5A623]/35 bg-[#FFF0C7] font-bold text-[#8A5700] hover:bg-[#FFF0C7]">Unread</Badge>}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{new Date(n.createdAt).toLocaleString()}</div>
                            {n.message && <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{n.message}</div>}
                            <div className="mt-2 text-xs font-medium text-slate-500">{summary}</div>
                            {lastDelivery?.errorMessage && (
                              <div className="mt-1 text-xs font-medium text-rose-700">Error: {lastDelivery.errorMessage}</div>
                            )}
                          </div>
                          <div className="shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-700 hover:bg-white hover:text-slate-950"
                              disabled={!unread || markReadMutation.isPending}
                              onClick={() => markReadMutation.mutate([n.id])}
                            >
                              Mark read
                            </Button>
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

