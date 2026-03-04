import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowRightLeft, ExternalLink, Monitor, Play, Power, Shield, TerminalSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type Ws = {
  id: string; agent_id: number; agent_name: string | null; agent_role: string | null;
  agent_department_key?: string | null; agent_manager_name?: string | null; status: string;
  network_policy_mode: "DEFAULT_DENY" | "ALLOWLIST" | "FULL_EGRESS";
  active_session_id?: string | null; updated_at: string; failureReason?: string | null;
};
type WsResp = { items: Ws[]; statusCounts?: Record<string, number> };
type WsEvent = { id: string; event_type: string; created_at: string; command?: string | null; event_payload_json?: Record<string, unknown> };
type WsSession = { id: string; session_type: string; started_at: string; ended_at: string | null; ip: string | null };
type WsArtifact = { id: string; type: string; storage_key: string; url: string | null; created_at: string };
type AgentOption = { id: number; name: string; role?: string | null };

const statuses = ["ALL", "RUNNING", "CREATING", "STOPPED", "FAILED", "DESTROYED"] as const;
const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : "-");
const label = (v?: string | null, fb = "Operations") => String(v || fb).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const tone = (s: string) => s === "RUNNING" ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" : s === "FAILED" ? "text-red-300 border-red-500/40 bg-red-500/10" : "text-gray-300 border-gray-700 bg-gray-800/40";

export default function AdminWorkstationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof statuses)[number]>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [policyMode, setPolicyMode] = useState<"DEFAULT_DENY" | "ALLOWLIST" | "FULL_EGRESS">("DEFAULT_DENY");
  const [allowlistInput, setAllowlistInput] = useState("");
  const [reassignAgentId, setReassignAgentId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const listQ = useQuery<WsResp>({ queryKey: ["/api/admin/workstations", status], queryFn: () => apiRequest(`/api/admin/workstations${status !== "ALL" ? `?status=${status}` : ""}`, { method: "GET" }), refetchInterval: 5000 });
  const healthQ = useQuery<any>({ queryKey: ["/api/workstations/health"], queryFn: () => apiRequest("/api/workstations/health", { method: "GET" }), refetchInterval: 30000 });
  const agentsQ = useQuery<any>({ queryKey: ["/api/agents"], queryFn: () => apiRequest("/api/agents", { method: "GET" }), staleTime: 20000 });
  const selected = useMemo(() => listQ.data?.items.find((x) => x.id === selectedId) || listQ.data?.items[0] || null, [listQ.data?.items, selectedId]);
  const wsId = selected?.id || null;

  useEffect(() => { if (selected) { setPolicyMode(selected.network_policy_mode); setReassignAgentId(String(selected.agent_id)); } }, [selected?.id, selected?.agent_id, selected?.network_policy_mode]);

  const eventsQ = useQuery<{ items: WsEvent[] }>({ queryKey: ["/api/workstations/events", wsId], queryFn: () => apiRequest(`/api/workstations/${wsId}/events?limit=200`, { method: "GET" }), enabled: !!wsId, refetchInterval: 5000 });
  const sessionsQ = useQuery<{ items: WsSession[] }>({ queryKey: ["/api/workstations/sessions", wsId], queryFn: () => apiRequest(`/api/workstations/${wsId}/sessions?limit=200`, { method: "GET" }), enabled: !!wsId, refetchInterval: 5000 });
  const artifactsQ = useQuery<{ items: WsArtifact[] }>({ queryKey: ["/api/workstations/artifacts", wsId], queryFn: () => apiRequest(`/api/workstations/${wsId}/artifacts`, { method: "GET" }), enabled: !!wsId, refetchInterval: 10000 });

  const grouped = useMemo(() => {
    const map = new Map<string, Ws[]>();
    for (const item of listQ.data?.items || []) {
      const dept = label(item.agent_department_key, "Operations");
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(item);
    }
    return Array.from(map.entries()).map(([department, items]) => ({ department, items }));
  }, [listQ.data?.items]);

  const agentOptions = useMemo<AgentOption[]>(() => {
    const rows = Array.isArray(agentsQ.data?.items) ? agentsQ.data.items : Array.isArray(agentsQ.data) ? agentsQ.data : [];
    const fromApi = rows.map((r: any) => ({ id: Number(r.id || 0), name: String(r.name || "").trim(), role: r.role || null }))
      .filter((r: AgentOption) => r.id > 0 && r.name && !r.name.toLowerCase().includes("test") && !r.name.toLowerCase().includes("demo"));
    if (fromApi.length) return fromApi;
    return Array.from(new Map((listQ.data?.items || []).map((w) => [w.agent_id, { id: w.agent_id, name: w.agent_name || `Agent #${w.agent_id}`, role: w.agent_role }])).values());
  }, [agentsQ.data, listQ.data?.items]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["/api/admin/workstations"] });
    if (wsId) {
      await qc.invalidateQueries({ queryKey: ["/api/workstations/events", wsId] });
      await qc.invalidateQueries({ queryKey: ["/api/workstations/sessions", wsId] });
      await qc.invalidateQueries({ queryKey: ["/api/workstations/artifacts", wsId] });
    }
  };

  const controlM = useMutation({ mutationFn: (p: { op: "start" | "stop" | "destroy"; id: string }) => p.op === "destroy" ? apiRequest(`/api/workstations/${p.id}`, { method: "DELETE" }) : apiRequest(`/api/workstations/${p.id}/${p.op}`, { method: "POST" }), onSuccess: async (_r, p) => { toast({ title: `Workstation ${p.op} completed` }); await invalidate(); }, onError: (e: any) => toast({ title: "Operation failed", description: e?.message || "Request failed", variant: "destructive" }) });
  const terminateM = useMutation({ mutationFn: (id: string) => apiRequest(`/api/workstations/${id}/terminate-session`, { method: "POST" }), onSuccess: async () => { toast({ title: "Session terminated" }); await invalidate(); }, onError: (e: any) => toast({ title: "Terminate failed", description: e?.message || "Request failed", variant: "destructive" }) });
  const reassignM = useMutation({ mutationFn: (p: { id: string; agentId: number }) => apiRequest(`/api/workstations/${p.id}/reassign`, { method: "POST", body: JSON.stringify({ agentId: p.agentId }) }), onSuccess: async () => { toast({ title: "Workstation reassigned" }); await invalidate(); }, onError: (e: any) => toast({ title: "Reassign failed", description: e?.message || "Request failed", variant: "destructive" }) });
  const viewM = useMutation({ mutationFn: (p: { id: string; scope: "IDE" | "DESKTOP" }) => apiRequest(`/api/workstations/${p.id}/view-token`, { method: "POST", body: JSON.stringify({ scope: p.scope }) }), onSuccess: (r, p) => { const u = String(r?.url || "").trim(); if (!u) return toast({ title: "No URL returned", variant: "destructive" }); setPreviewUrl(u); window.open(u, "_blank", "noopener,noreferrer"); toast({ title: `${p.scope} opened` }); }, onError: (e: any) => toast({ title: "Open failed", description: e?.message || "Request failed", variant: "destructive" }) });
  const policyM = useMutation({ mutationFn: (p: { id: string; mode: "DEFAULT_DENY" | "ALLOWLIST" | "FULL_EGRESS"; allowedDomains: string[] }) => apiRequest(`/api/workstations/${p.id}/network-policy`, { method: "POST", body: JSON.stringify(p) }), onSuccess: async () => { toast({ title: "Internet policy updated" }); await invalidate(); }, onError: (e: any) => toast({ title: "Policy failed", description: e?.message || "Request failed", variant: "destructive" }) });

  return (
    <div className="space-y-4">
      <Card className="bg-gray-900/40 border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <CardTitle className="text-white flex items-center gap-2"><Monitor className="h-4 w-4 text-blue-300" />Workstations</CardTitle>
              <p className="text-xs text-gray-400 mt-1">Grid view grouped by hierarchy. Click a card to inspect logs, tools, sessions, and changes.</p>
              <div className="mt-2 text-[11px] text-gray-500">provider: <span className={cn(healthQ.data?.provider?.healthy ? "text-emerald-300" : "text-red-300")}>{healthQ.data?.provider?.name || "unknown"} {healthQ.data?.provider?.healthy ? "healthy" : "unhealthy"}</span></div>
            </div>
            <div className="w-full lg:w-44"><Select value={status} onValueChange={(v: any) => setStatus(v)}><SelectTrigger className="bg-gray-900 border-gray-700 text-gray-200"><SelectValue /></SelectTrigger><SelectContent className="bg-gray-900 border-gray-700 text-gray-200">{statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{statuses.map((s) => <Badge key={s} variant="outline" className="text-[10px] border-gray-700 text-gray-300">{s}: {Number(listQ.data?.statusCounts?.[s] || 0)}</Badge>)}</div>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square bg-gray-800" />)}</div> : (listQ.data?.items?.length || 0) === 0 ? <div className="text-sm text-gray-400 py-8 text-center">No workstations found.</div> : (
            <div className="space-y-6">
              {grouped.map((g) => (
                <div key={g.department} className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-gray-300 font-semibold">{g.department}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                    {g.items.map((w) => {
                      const live = Boolean(w.active_session_id) || w.status === "RUNNING";
                      const active = selected?.id === w.id;
                      return (
                        <button key={w.id} onClick={() => setSelectedId(w.id)} className={cn("aspect-square rounded-lg border p-3 text-left flex flex-col justify-between", active ? "border-blue-500/60 bg-blue-500/10 ring-1 ring-blue-500/60" : "border-gray-800 bg-gray-900/30 hover:bg-gray-800/40")}>
                          <div className="flex items-start justify-between"><TerminalSquare className="h-4 w-4 text-blue-300" /><span className={cn("h-2 w-2 rounded-full mt-1", live ? "bg-emerald-400 animate-pulse" : "bg-gray-600")} /></div>
                          <div className="min-w-0"><div className="text-sm font-semibold text-white truncate">{w.agent_name || `Agent #${w.agent_id}`}</div><div className="text-[11px] text-gray-400 truncate">{w.agent_role || "No role"}</div><div className="text-[10px] text-gray-500 truncate">{w.id}</div></div>
                          <div className="flex justify-between gap-2"><Badge variant="outline" className={cn("text-[10px]", tone(w.status))}>{w.status}</Badge><Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-200">{w.network_policy_mode}</Badge></div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected ? <div className="grid grid-cols-1 2xl:grid-cols-3 gap-4">
        <Card className="bg-gray-900/40 border-gray-800 2xl:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-white text-base flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-300" />Workstation Detail</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => viewM.mutate({ id: selected.id, scope: "IDE" })}><ExternalLink className="h-3.5 w-3.5 mr-1" />Open IDE</Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => viewM.mutate({ id: selected.id, scope: "DESKTOP" })}><Monitor className="h-3.5 w-3.5 mr-1" />Open Desktop</Button>
              <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => controlM.mutate({ id: selected.id, op: "start" })}><Play className="h-3.5 w-3.5 mr-1" />Start</Button>
              <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => controlM.mutate({ id: selected.id, op: "stop" })}><Power className="h-3.5 w-3.5 mr-1" />Stop</Button>
              <Button size="sm" variant="outline" className="border-orange-600/40 text-orange-300 hover:bg-orange-900/30" onClick={() => terminateM.mutate(selected.id)}><Activity className="h-3.5 w-3.5 mr-1" />Terminate Session</Button>
              <Button size="sm" variant="outline" className="border-red-600/40 text-red-300 hover:bg-red-900/30" onClick={() => controlM.mutate({ id: selected.id, op: "destroy" })}><Trash2 className="h-3.5 w-3.5 mr-1" />Destroy</Button>
              <Button size="sm" variant="outline" className="border-cyan-600/40 text-cyan-200 hover:bg-cyan-900/20" onClick={() => window.open(`/admin/evidence?workstation_id=${encodeURIComponent(selected.id)}`, "_blank", "noopener,noreferrer")}>View Full Audit Trail</Button>
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-900/30 p-3 space-y-2">
              <div className="text-xs text-gray-300 uppercase tracking-wide">Switch Agent</div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <Select value={reassignAgentId} onValueChange={setReassignAgentId}><SelectTrigger className="bg-gray-900 border-gray-700 text-gray-200"><SelectValue placeholder="Select target agent" /></SelectTrigger><SelectContent className="bg-gray-900 border-gray-700 text-gray-200">{agentOptions.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}{a.role ? ` • ${a.role}` : ""}</SelectItem>)}</SelectContent></Select>
                <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700" onClick={() => reassignM.mutate({ id: selected.id, agentId: Number(reassignAgentId) })} disabled={!reassignAgentId || reassignM.isPending}><ArrowRightLeft className="h-3.5 w-3.5 mr-1" />Switch Agent</Button>
              </div>
            </div>
            {previewUrl ? <div className="rounded-md border border-gray-800 overflow-hidden"><iframe title="Workstation Live Preview" src={previewUrl} className="w-full h-[420px] bg-black" /></div> : <div className="rounded-md border border-gray-800 bg-gray-900/30 p-6 text-sm text-gray-400 text-center">Open IDE or Desktop to preview live session.</div>}
          </CardContent>
        </Card>
        <Card className="bg-gray-900/40 border-gray-800">
          <CardHeader className="pb-3"><CardTitle className="text-white text-base flex items-center gap-2"><Shield className="h-4 w-4 text-amber-300" />Internet Policy</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label className="text-xs text-gray-300">Mode</Label><Select value={policyMode} onValueChange={(v: any) => setPolicyMode(v)}><SelectTrigger className="mt-1 bg-gray-900 border-gray-700 text-gray-200"><SelectValue /></SelectTrigger><SelectContent className="bg-gray-900 border-gray-700 text-gray-200"><SelectItem value="DEFAULT_DENY">DEFAULT_DENY</SelectItem><SelectItem value="ALLOWLIST">ALLOWLIST</SelectItem><SelectItem value="FULL_EGRESS">FULL_EGRESS</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs text-gray-300">Allowed domains (comma/newline)</Label><Input value={allowlistInput} onChange={(e) => setAllowlistInput(e.target.value)} placeholder="github.com, docs.stripe.com" className="mt-1 bg-gray-900 border-gray-700 text-gray-200" /></div>
            <Button size="sm" className="w-full bg-amber-600 hover:bg-amber-700 text-black font-semibold" onClick={() => policyM.mutate({ id: selected.id, mode: policyMode, allowedDomains: allowlistInput.split(/[\s,;\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean) })}>Apply policy</Button>
            <div className="text-xs text-gray-500">Current mode: {selected.network_policy_mode}</div>
          </CardContent>
        </Card>
      </div> : null}

      {selected ? <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="bg-gray-900/40 border-gray-800"><CardHeader className="pb-2"><CardTitle className="text-sm text-white">Live session log / browser API sessions</CardTitle></CardHeader><CardContent className="space-y-2 max-h-[260px] overflow-auto">{(sessionsQ.data?.items || []).map((s) => <div key={s.id} className="rounded-md border border-gray-800 bg-gray-900/30 p-2 text-xs"><div className="text-gray-200">{s.session_type}</div><div className="text-gray-400">{s.ip || "n/a"}</div><div className="text-gray-500">{fmt(s.started_at)} {s.ended_at ? `• ended ${fmt(s.ended_at)}` : "• active"}</div></div>)}</CardContent></Card>
        <Card className="bg-gray-900/40 border-gray-800"><CardHeader className="pb-2"><CardTitle className="text-sm text-white">Tool executions / actions / automation / memory / tasks</CardTitle></CardHeader><CardContent className="space-y-2 max-h-[260px] overflow-auto">{(eventsQ.data?.items || []).map((e) => <div key={e.id} className="rounded-md border border-gray-800 bg-gray-900/30 p-2 text-xs"><div className="text-gray-200">{e.event_type}</div><div className="text-gray-500">{e.command || "-"}</div><div className="text-gray-500">{fmt(e.created_at)}</div></div>)}</CardContent></Card>
        <Card className="bg-gray-900/40 border-gray-800"><CardHeader className="pb-2"><CardTitle className="text-sm text-white">File changes / artifacts / diff history</CardTitle></CardHeader><CardContent className="space-y-2 max-h-[260px] overflow-auto">{(artifactsQ.data?.items || []).map((a) => <div key={a.id} className="rounded-md border border-gray-800 bg-gray-900/30 p-2 text-xs"><div className="text-gray-200">{a.type}</div><div className="text-gray-500 truncate">{a.storage_key}</div><div className="text-gray-500">{fmt(a.created_at)}</div>{a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-300 hover:underline">open</a> : null}</div>)}</CardContent></Card>
      </div> : null}
    </div>
  );
}

