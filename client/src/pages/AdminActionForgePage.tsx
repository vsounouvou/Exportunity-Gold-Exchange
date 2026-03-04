import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type ForgeRequest = {
  id: string;
  desired_action_key: string;
  desired_entity: string | null;
  desired_description: string | null;
  status: string;
  pr_url: string | null;
  created_at: string;
};

export default function AdminActionForgePage() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newActionKey, setNewActionKey] = useState("");

  const requestsQuery = useQuery<{ ok: boolean; items: ForgeRequest[] }>({
    queryKey: ["/api/action-forge/requests"],
    staleTime: 8_000,
  });

  const detailQuery = useQuery<{ ok: boolean; request: ForgeRequest; events: any[] }>({
    queryKey: selectedId ? [`/api/action-forge/requests/${selectedId}`] : ["__no_forge_detail__"],
    enabled: Boolean(selectedId),
    staleTime: 8_000,
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/action-forge/requests", "POST", {
        desiredActionKey: newActionKey,
      }),
    onSuccess: () => {
      toast({ title: "Forge request created", description: "Action Forge request opened." });
      setNewActionKey("");
      queryClient.invalidateQueries({ queryKey: ["/api/action-forge/requests"] });
    },
    onError: (error: any) => {
      toast({ title: "Request failed", description: error?.message || "Unable to create request", variant: "destructive" });
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async (payload: { id: string; action: "approve" | "reject" | "publish" }) =>
      apiRequest(`/api/action-forge/${payload.id}/${payload.action}`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/action-forge/requests"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: [`/api/action-forge/requests/${selectedId}`] });
    },
    onError: (error: any) => {
      toast({ title: "Transition failed", description: error?.message || "Unable to transition request", variant: "destructive" });
    },
  });

  const requests = requestsQuery.data?.items || [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Action Forge</h1>
        <p className="text-xs text-gray-400">Safe pipeline for creating missing actions (spec to review to publish).</p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-4 flex flex-col md:flex-row gap-2">
          <Input
            value={newActionKey}
            onChange={(e) => setNewActionKey(e.target.value)}
            placeholder="missing.action_key"
            className="bg-gray-800 border-gray-700"
          />
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!newActionKey.trim() || createMutation.isPending}
            className="bg-amber-500 text-black hover:bg-amber-400"
          >
            Create Forge Request
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader><CardTitle className="text-sm text-white">Requests</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {requests.length === 0 ? <div className="text-xs text-gray-500">No forge requests.</div> : null}
            {requests.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full text-left rounded border p-2 transition-colors ${selectedId === item.id ? "border-amber-500/50 bg-amber-500/10" : "border-gray-800 bg-gray-950/40 hover:border-gray-700"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-white truncate">{item.desired_action_key}</div>
                  <Badge variant="outline" className="text-[10px]">{item.status}</Badge>
                </div>
                <div className="text-[11px] text-gray-400 truncate">{item.desired_entity || "system"}</div>
                <div className="text-[10px] text-gray-500">{new Date(item.created_at).toLocaleString()}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader><CardTitle className="text-sm text-white">Detail</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-xs">
            {!selectedId ? <div className="text-gray-500">Select a request.</div> : null}
            {selectedId && !detailQuery.data ? <div className="text-gray-500">Loading detail...</div> : null}
            {detailQuery.data?.request ? (
              <>
                <div>
                  <div className="text-gray-400">Action key</div>
                  <div className="text-white">{detailQuery.data.request.desired_action_key}</div>
                </div>
                <div>
                  <div className="text-gray-400">Description</div>
                  <div className="text-gray-200">{detailQuery.data.request.desired_description || "-"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => selectedId && transitionMutation.mutate({ id: selectedId, action: "approve" })}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => selectedId && transitionMutation.mutate({ id: selectedId, action: "reject" })}>Reject</Button>
                  <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-400" onClick={() => selectedId && transitionMutation.mutate({ id: selectedId, action: "publish" })}>Publish</Button>
                </div>
                <div>
                  <div className="text-gray-400">Events</div>
                  <div className="space-y-1 mt-1">
                    {(detailQuery.data.events || []).map((evt: any) => (
                      <div key={evt.id} className="rounded border border-gray-800 bg-gray-950/50 p-2">
                        <div className="text-gray-200">{evt.status_from || "-"}{" -> "}{evt.status_to}</div>
                        <div className="text-gray-500">{evt.notes || "-"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
