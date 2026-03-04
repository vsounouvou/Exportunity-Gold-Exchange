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
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950">
      <div className="container mx-auto py-8 px-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-white">Notifications</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={!unreadIds.length || markReadMutation.isPending}
              onClick={() => markReadMutation.mutate(unreadIds)}
            >
              Mark all read
            </Button>
            <Button variant="secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] })}>
              Refresh
            </Button>
          </div>
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Inbox</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[70vh] pr-3">
              <div className="space-y-3">
                {notificationsQuery.isLoading ? (
                  <div className="text-sm text-white/70">Loading…</div>
                ) : rows.length === 0 ? (
                  <div className="text-sm text-white/70">No notifications yet.</div>
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
                      <div key={n.id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-medium text-white">
                                {n.title || n.eventKey}
                              </div>
                              {unread && <Badge className="bg-amber-500 text-gray-950">Unread</Badge>}
                            </div>
                            <div className="mt-1 text-xs text-white/60">{new Date(n.createdAt).toLocaleString()}</div>
                            {n.message && <div className="mt-2 text-sm text-white/80 whitespace-pre-wrap">{n.message}</div>}
                            <div className="mt-2 text-xs text-white/60">{summary}</div>
                            {lastDelivery?.errorMessage && (
                              <div className="mt-1 text-xs text-red-300">Error: {lastDelivery.errorMessage}</div>
                            )}
                          </div>
                          <div className="shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
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

