import { AgentPerformanceDashboard } from "@/components/AgentPerformanceDashboard";
import { PredictiveAnalytics } from "@/components/PredictiveAnalytics";
import { TokenDashboard } from "@/components/TokenDashboard";
import { HeatmapVisualization } from "@/components/HeatmapVisualization";
import { ErrorVisualization } from "@/components/ErrorVisualization";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bell, TrendingUp, Coins, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { resolveApiUrl } from "@/lib/runtimeConfig";

interface Notification {
  id: number;
  title: string;
  message: string;
  priority: string;
  status: string;
  createdAt: string;
}

type NotificationsApiItem = {
  notification: {
    id: number;
    title: string | null;
    message: string | null;
    eventKey: string;
    status: string;
    readAt: string | null;
    createdAt: string;
  };
  deliveries: any[];
};

type NotificationsApiResponse = {
  ok: boolean;
  items: NotificationsApiItem[];
};

export function PerformanceDiagnosticsPage() {
  const queryClient = useQueryClient();
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  const { data: agents } = useQuery<{ id: number }[]>({
    queryKey: ["/api/agents"],
  });

  const { data: notificationsData } = useQuery<NotificationsApiResponse>({
    queryKey: ["/api/notifications"],
  });

  const notifications: Notification[] =
    notificationsData?.items?.map((row) => ({
      id: row.notification.id,
      title: row.notification.title || row.notification.eventKey,
      message: row.notification.message || "",
      priority: "normal",
      status: row.notification.readAt ? "read" : "unread",
      createdAt: row.notification.createdAt,
    })) ?? [];

  const { mutate: markAsRead } = useMutation({
    mutationFn: async (notificationIds: number[]) => {
      await fetch(resolveApiUrl("/api/notifications/read"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationIds,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const handleAgentSelect = (agentId: number) => {
    setSelectedAgentId(agentId);
  };

  const unreadNotifications = notifications?.filter(n => n.status === 'unread') ?? [];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950">
      <div className="container mx-auto py-8 px-6 space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Performance & Diagnostics</h1>
          {unreadNotifications.length > 0 && (
            <div className="relative">
              <Bell className="h-6 w-6 text-gray-400" />
              <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full text-xs px-2">
                {unreadNotifications.length}
              </span>
            </div>
          )}
        </div>

        <Tabs defaultValue="performance" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-gray-900 border border-gray-800">
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="tokens" className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              Token Economy
            </TabsTrigger>
            <TabsTrigger value="errors" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Error Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <AgentPerformanceDashboard onAgentSelect={handleAgentSelect} />
                {selectedAgentId && (
                  <PredictiveAnalytics key={selectedAgentId} agentId={selectedAgentId} />
                )}
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 text-white">Performance Notifications</h2>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {notifications && notifications.length > 0 ? (
                      notifications.map((notification) => (
                        <Alert 
                          key={notification.id}
                          variant="default"
                          className="relative bg-gray-900 border-gray-800"
                        >
                          <AlertTitle className="flex items-center gap-2 text-white">
                            {notification.title}
                            {notification.status === 'unread' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => markAsRead([notification.id])}
                                className="ml-auto"
                              >
                                Mark as read
                              </Button>
                            )}
                          </AlertTitle>
                          <AlertDescription className="text-gray-400">
                            {notification.message}
                            <div className="text-sm text-gray-500 mt-2">
                              {new Date(notification.createdAt).toLocaleString()}
                            </div>
                          </AlertDescription>
                        </Alert>
                      ))
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        {selectedAgentId ? "No notifications available" : "Select an agent to view notifications"}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tokens" className="mt-6 space-y-8">
            <TokenDashboard />
            <HeatmapVisualization />
          </TabsContent>

          <TabsContent value="errors" className="mt-6">
            <ErrorVisualization />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default PerformanceDiagnosticsPage;
