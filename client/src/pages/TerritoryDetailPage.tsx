import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { format } from "date-fns";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { Loader2, ArrowLeft, RefreshCw, Activity, ShieldCheck, Zap, Send, Megaphone, BarChart3 } from "lucide-react";

type AiAgent = {
  id: string | number;
  name?: string;
  role?: string;
  status?: string;
  budget?: number | null;
  performanceScore?: number | null;
};

type ActivityItem = {
  id: string | number;
  action?: string;
  entityType?: string;
  createdAt?: string;
};

type TerritoryHierarchy = {
  parent: any;
  children: any[];
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  metadata?: Record<string, any>;
};

type TerritoryDetailResponse = {
  territory: any;
  budgets: any[];
  kpis: any[];
  leaderboards: any[];
  referrers: any[];
  aiTeam?: AiAgent[];
  activity?: ActivityItem[];
  hierarchy?: TerritoryHierarchy;
};

const formatNumber = (val: any, suffix = "") => {
  const num = Number(val);
  if (!Number.isFinite(num)) return "-";
  return `${num.toLocaleString()}${suffix}`;
};

const formatDate = (val: string | Date | undefined) => {
  if (!val) return "N/A";
  try {
    return format(new Date(val), "yyyy-MM-dd HH:mm");
  } catch {
    return String(val);
  }
};

function bboxToBounds(bbox: [number, number, number, number]) {
  // bbox is [minLng, minLat, maxLng, maxLat]
  return [
    [bbox[1], bbox[0]],
    [bbox[3], bbox[2]],
  ] as any;
}

function FitBounds({ bbox }: { bbox: [number, number, number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bbox) return;
    try {
      map.fitBounds(bboxToBounds(bbox), { padding: [22, 22] });
    } catch {
      // ignore
    }
  }, [bbox, map]);
  return null;
}

function styleForTerritoryType(type: string) {
  const t = String(type || "").toLowerCase();
  if (t === "country") return { stroke: "#f59e0b", fill: "#f59e0b" }; // amber
  if (t === "region") return { stroke: "#3b82f6", fill: "#3b82f6" }; // blue
  if (t === "city") return { stroke: "#22c55e", fill: "#22c55e" }; // green
  if (t === "district" || t === "neighborhood") return { stroke: "#a855f7", fill: "#a855f7" }; // purple
  return { stroke: "#94a3b8", fill: "#64748b" };
}

const CARTO_DARK_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function MapAutoResize() {
  const map = useMap();
  useEffect(() => {
    const resize = () => {
      try {
        map.invalidateSize(false);
      } catch {
        // ignore
      }
    };

    const t1 = window.setTimeout(resize, 0);
    const t2 = window.setTimeout(resize, 220);
    window.addEventListener("resize", resize);

    const container = map.getContainer();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(container);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", resize);
      observer?.disconnect();
    };
  }, [map]);
  return null;
}

function ResilientTileLayer({
  onFallbackChange,
}: {
  onFallbackChange: (value: boolean) => void;
}) {
  const [useFallback, setUseFallback] = useState(false);
  const failures = useRef(0);

  useEffect(() => {
    onFallbackChange(useFallback);
  }, [onFallbackChange, useFallback]);

  return (
    <TileLayer
      attribution={
        useFallback
          ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          : "&copy; OpenStreetMap &copy; CARTO"
      }
      url={useFallback ? OSM_TILE_URL : CARTO_DARK_TILE_URL}
      eventHandlers={{
        tileerror: () => {
          failures.current += 1;
          if (!useFallback && failures.current >= 3) {
            setUseFallback(true);
          }
        },
      }}
    />
  );
}

export function TerritoryDetailPage() {
  const [matchTerritories, paramsTerritories] = useRoute("/territories/:id");
  const [matchAdmin, paramsAdmin] = useRoute("/admin/territories/:id");
  const match = matchTerritories || matchAdmin;
  const params = (paramsTerritories || paramsAdmin) as any;
  const [, setLocation] = useLocation();
  const session = useSession();
  const token = session.token;

  const [data, setData] = useState<TerritoryDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");

  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<any>(null);
  const [mapUsingFallbackTiles, setMapUsingFallbackTiles] = useState(false);

  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token],
  );

  const territoryId = params?.id ? Number(params.id) : null;

  const forceRefreshPage = () => {
    try {
      const next = new URL(window.location.href);
      next.searchParams.set("cb", String(Date.now()));
      next.searchParams.delete("v");
      window.location.assign(next.toString());
    } catch {
      window.location.reload();
    }
  };

  const load = async (opts?: { silent?: boolean }) => {
    if (!territoryId || !headers) return;
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const result = await apiRequest(`/api/territories/${territoryId}`, { headers });
      setData(result);
    } catch (err: any) {
      setError(err?.message || "Failed to load territory");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  const loadChat = async () => {
    if (!territoryId || !headers) return;
    setChatLoading(true);
    setChatError(null);
    try {
      const res = await apiRequest(`/api/territories/${territoryId}/chat/messages?limit=120`, { headers });
      setChatMessages(res?.messages ?? []);
    } catch (err: any) {
      setChatError(err?.message || "Failed to load territory chat");
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [territoryId, token]);

  const sendChatText = async (message: string) => {
    if (!territoryId || !headers) return;
    setChatError(null);
    setChatSending(true);
    try {
      await apiRequest(`/api/territories/${territoryId}/chat/send`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      await Promise.all([loadChat(), load({ silent: true })]);
    } catch (err: any) {
      setChatError(err?.message || "Failed to send message");
    } finally {
      setChatSending(false);
    }
  };

  const sendChat = async () => {
    const message = chatInput.trim();
    if (!message) return;
    setChatInput("");
    await sendChatText(message);
  };

  const runTerritoryAction = async (action: string, params?: Record<string, any>) => {
    if (!territoryId || !headers) return;
    setActionBusy(action);
    setActionResult(null);
    try {
      const res = await apiRequest("/api/agent/actions/run", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          params: { territoryId, ...(params || {}) },
        }),
      });
      setActionResult(res);
      await load({ silent: true });
      return res;
    } catch (err: any) {
      const fallback = { ok: false, message: err?.message || "Action failed" };
      setActionResult(fallback);
      return fallback;
    } finally {
      setActionBusy(null);
    }
  };

  if (!match) return null;

  const territory = data?.territory;
  const latestBudget = data?.budgets?.[0];
  const latestKpi = data?.kpis?.[0];
  const aiTeam = data?.aiTeam ?? [];
  const referrers = data?.referrers ?? [];
  const activities = data?.activity ?? [];
  const hierarchy = data?.hierarchy ?? { parent: null, children: [] };
  const territoryBbox = (territory?.bbox as [number, number, number, number] | null) ?? null;
  const territoryGeometry = territory?.geometryGeojson ?? null;

  const territoryCenter = useMemo(() => {
    const lat = Number(territory?.centerLat);
    const lng = Number(territory?.centerLng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) return [lat, lng] as [number, number];
    if (territoryBbox) return [(territoryBbox[1] + territoryBbox[3]) / 2, (territoryBbox[0] + territoryBbox[2]) / 2] as [number, number];
    return [5.35, -4.02] as [number, number];
  }, [territory?.centerLat, territory?.centerLng, territoryBbox]);

  const kpiActiveBuyers = Number(latestKpi?.activeBuyers);
  const kpiActiveSellers = Number(latestKpi?.activeSellers);
  const kpiOrders7d = Number(latestKpi?.ordersCount);

  const coverageStatus = (() => {
    if (!Number.isFinite(kpiActiveSellers) || kpiActiveSellers <= 0) return "No active sellers";
    if (!Number.isFinite(kpiActiveBuyers) || kpiActiveBuyers <= 0) return "No active buyers";
    if (kpiActiveSellers < 5) return "Low seller coverage";
    if (kpiActiveBuyers < 20) return "Low buyer coverage";
    if (Number.isFinite(kpiOrders7d) && kpiOrders7d < 5) return "Low order velocity (7d)";
    return "Healthy";
  })();

  const suggestedAction = (() => {
    if (coverageStatus === "No active sellers" || coverageStatus === "Low seller coverage") return "Run client acquisition and onboard more sellers.";
    if (coverageStatus === "No active buyers" || coverageStatus === "Low buyer coverage") return "Run marketing outreach and convert buyers in this territory.";
    if (coverageStatus.includes("order")) return "Audit operations: delivery, pricing, and conversion funnel.";
    return "Maintain coverage and monitor KPIs weekly.";
  })();

  const leadAgent = useMemo(() => {
    const candidates = aiTeam.slice();
    const prefer = (agent: AiAgent) => {
      const role = String(agent.role || "").toLowerCase();
      if (role.includes("lead")) return 0;
      if (role.includes("ops") || role.includes("operator")) return 1;
      if (role.includes("marketing")) return 2;
      return 9;
    };
    candidates.sort((a, b) => prefer(a) - prefer(b));
    const chosen = candidates[0];
    return {
      id: chosen?.id ?? null,
      name: chosen?.name || (chosen?.id != null ? `Agent ${chosen.id}` : "Territory assistant"),
      role: chosen?.role || "assistant",
    };
  }, [aiTeam]);

  const agentGoal = territoryId
    ? `Territory ${String(territory?.name || "")} (#${territoryId}) coverage audit.\n\nKPIs (latest):\n- GMV: ${formatNumber(latestKpi?.gmv)}\n- Active buyers: ${formatNumber(latestKpi?.activeBuyers)}\n- Active sellers: ${formatNumber(latestKpi?.activeSellers)}\n- Orders (7d): ${formatNumber(latestKpi?.ordersCount)}\n\nStatus: ${coverageStatus}\nSuggested action: ${suggestedAction}\n\nReturn a short execution plan + next actions within budget.`
    : "";

  const kpiCards = [
    { label: "GMV", value: formatNumber(latestKpi?.gmv) },
    { label: "Platform fees", value: formatNumber(latestKpi?.platformFees) },
    { label: "Active buyers", value: formatNumber(latestKpi?.activeBuyers) },
    { label: "Active sellers", value: formatNumber(latestKpi?.activeSellers) },
    { label: "Orders (7d)", value: formatNumber(latestKpi?.ordersCount) },
    { label: "Dispute rate", value: formatNumber(latestKpi?.disputeRate, "%") },
    { label: "Budget cap", value: formatNumber(latestBudget?.budgetCap) },
    { label: "Funded", value: formatNumber(latestBudget?.fundedAmount) },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/territories")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <div className="text-xl font-semibold text-white">{territory?.name || "Territory"}</div>
            <div className="text-xs text-gray-400">
              {(territory?.territoryType || "territory").toString()} | {territory?.countryCode || "N/A"}
              {territory?.city ? ` | ${territory.city}` : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={forceRefreshPage}
            disabled={!headers}
            title="Reload this page with a cache-buster parameter"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Force refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Zone actions */}
      {territoryId ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="py-4 flex flex-wrap gap-2 items-center">
            <div className="text-sm text-gray-300 mr-2">Zone actions</div>
            <Button size="sm" variant="secondary" onClick={() => setLocation(`/marketplace?territoryId=${territoryId}`)}>
              Marketplace
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setLocation(`/finance?territoryId=${territoryId}`)}>
              Finance
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setLocation(`/tasks?territoryId=${territoryId}`)}>
              Operations
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setLocation(`/actions?territoryId=${territoryId}`)}>
              Marketing
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading territory...
        </div>
      ) : (
        <div className="space-y-4">
          {/* KPI grid above the fold */}
          <div className="grid gap-3 md:grid-cols-4">
            {kpiCards.map((card) => (
              <Card key={card.label} className="bg-gray-900 border-gray-800">
                <CardContent className="p-4">
                  <div className="text-[11px] text-gray-400">{card.label}</div>
                  <div className="text-lg font-semibold text-white">{card.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="bg-gray-900 border-gray-800 overflow-hidden lg:col-span-7">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">Territory map</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[320px] w-full sm:h-[360px] lg:h-[420px]">
                  <MapContainer
                    center={territoryCenter as any}
                    zoom={10}
                    scrollWheelZoom={false}
                    className="h-full w-full"
                    zoomControl={false}
                  >
                    <MapAutoResize />
                    <ResilientTileLayer onFallbackChange={setMapUsingFallbackTiles} />
                    {territoryGeometry ? (
                      <GeoJSON
                        data={territoryGeometry as any}
                        style={() => {
                          const base = styleForTerritoryType(String(territory?.territoryType || ""));
                          return {
                            color: base.stroke,
                            weight: 2,
                            fillColor: base.fill,
                            fillOpacity: 0.12,
                          } as any;
                        }}
                      />
                    ) : null}
                    <FitBounds bbox={territoryBbox} />
                  </MapContainer>
                </div>
                {mapUsingFallbackTiles ? (
                  <div className="border-t border-slate-800 px-3 py-2 text-[11px] text-amber-300 bg-amber-500/5">
                    Primary map tiles unavailable. Using OpenStreetMap fallback.
                  </div>
                ) : null}

                <div className="p-4 border-t border-gray-800 space-y-1">
                  <div className="text-[11px] text-gray-400">Coverage status</div>
                  <div className="text-white font-semibold">{coverageStatus}</div>
                  <div className="text-sm text-gray-300">{suggestedAction}</div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {aiTeam.length} AI agents
                    </Badge>
                    <Badge variant="outline" className="text-xs border-white/15 text-white/70">
                      {referrers.length} referrers
                    </Badge>
                    <div className="flex-1" />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!territoryId) return;
                        setLocation(
                          `/admin/agents?territoryId=${encodeURIComponent(String(territoryId))}&agent=ops&goal=${encodeURIComponent(agentGoal)}`,
                        );
                      }}
                    >
                      Talk to agents
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800 lg:col-span-5">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">What's happening</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <ScrollArea className="h-[360px] pr-2">
                  <div className="space-y-2 text-sm text-gray-200">
                    {activities.length ? (
                      activities.map((act) => (
                        <div
                          key={act.id}
                          className="flex items-start justify-between gap-3 border border-gray-800 rounded-lg p-3"
                        >
                          <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-amber-400" />
                            <div>
                              <div className="font-semibold text-white">{act.action || "Event"}</div>
                              <div className="text-xs text-gray-400">{act.entityType || "entity"}</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-400">{formatDate(act.createdAt)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-gray-400">No recent activity recorded.</div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="bg-gray-900 border-gray-800 lg:col-span-8">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">Territory hub</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 bg-black/30 border border-white/10">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="ops">Ops</TabsTrigger>
                    <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
                    <TabsTrigger value="marketing">Marketing</TabsTrigger>
                    <TabsTrigger value="finance">Finance</TabsTrigger>
                    <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-4 space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                        <div className="text-[11px] text-gray-400">Coverage status</div>
                        <div className="text-white font-semibold">{coverageStatus}</div>
                        <div className="mt-1 text-sm text-gray-300">{suggestedAction}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
                          <span>
                            AI agents: <span className="text-gray-200">{aiTeam.length}</span>
                          </span>
                          <span className="text-gray-600">-</span>
                          <span>
                            Referrers: <span className="text-gray-200">{referrers.length}</span>
                          </span>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                        <div className="text-[11px] text-gray-400">Shortcuts</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => territoryId && setLocation(`/marketplace?territoryId=${territoryId}`)}
                            disabled={!territoryId}
                          >
                            Marketplace
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => territoryId && setLocation(`/tasks?territoryId=${territoryId}`)}
                            disabled={!territoryId}
                          >
                            Operations
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => territoryId && setLocation(`/actions?territoryId=${territoryId}`)}
                            disabled={!territoryId}
                          >
                            Marketing
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => territoryId && setLocation(`/finance?territoryId=${territoryId}`)}
                            disabled={!territoryId}
                          >
                            Finance
                          </Button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="ops" className="mt-4">
                    <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                      <div className="text-sm font-semibold text-white">Operations</div>
                      <div className="mt-1 text-sm text-gray-300">Orders, delivery, incidents, and SLA for this territory.</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => territoryId && setLocation(`/tasks?territoryId=${territoryId}`)}
                          disabled={!territoryId}
                        >
                          Open operations
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="marketplace" className="mt-4">
                    <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                      <div className="text-sm font-semibold text-white">Marketplace</div>
                      <div className="mt-1 text-sm text-gray-300">Sellers, inventory health, and merchandising for this territory.</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => territoryId && setLocation(`/marketplace?territoryId=${territoryId}`)}
                          disabled={!territoryId}
                        >
                          Open marketplace
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="marketing" className="mt-4">
                    <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                      <div className="text-sm font-semibold text-white">Marketing</div>
                      <div className="mt-1 text-sm text-gray-300">Campaigns, creatives, referrers, and territory acquisition.</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => territoryId && setLocation(`/actions?territoryId=${territoryId}`)}
                          disabled={!territoryId}
                        >
                          Open marketing
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="finance" className="mt-4">
                    <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                      <div className="text-sm font-semibold text-white">Finance</div>
                      <div className="mt-1 text-sm text-gray-300">GMV, fees, payouts, and budget burn for this territory.</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => territoryId && setLocation(`/finance?territoryId=${territoryId}`)}
                          disabled={!territoryId}
                        >
                          Open finance
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="hierarchy" className="mt-4">
                    <div className="rounded-lg border border-slate-800 bg-black/20 p-3 space-y-3 text-sm text-gray-200">
                      <div>
                        <div className="text-xs text-gray-400">Parent territory</div>
                        <div className="text-white">
                          {hierarchy.parent ? hierarchy.parent.name || `Territory ${hierarchy.parent.id}` : "None"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Child territories</div>
                        {hierarchy.children?.length ? (
                          <ul className="list-disc list-inside space-y-1">
                            {hierarchy.children.map((child: any) => (
                              <li key={child.id}>
                                <button
                                  type="button"
                                  className="text-amber-300 hover:underline"
                                  onClick={() => setLocation(`/territories/${child.id}`)}
                                >
                                  {child.name || `Territory ${child.id}`}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-gray-400">No children</div>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Created: {formatDate(territory?.createdAt)} | Updated: {formatDate(territory?.updatedAt)}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <div className="lg:col-span-4 space-y-4">
              {/* Territory agents */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2 flex items-center justify-between">
                <CardTitle className="text-white text-lg">Territory agents</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {aiTeam.length} agents
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-200">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => runTerritoryAction("territory.audit.kpis")}
                    disabled={actionBusy !== null}
                  >
                    {actionBusy === "territory.audit.kpis" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <BarChart3 className="h-4 w-4 mr-2" />
                    )}
                    Audit KPIs
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => runTerritoryAction("territory.marketing.launch")}
                    disabled={actionBusy !== null}
                  >
                    {actionBusy === "territory.marketing.launch" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Megaphone className="h-4 w-4 mr-2" />
                    )}
                    Launch marketing
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => runTerritoryAction("territory.marketplace.seedProducts")}
                    disabled={actionBusy !== null}
                  >
                    {actionBusy === "territory.marketplace.seedProducts" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    Seed products
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => runTerritoryAction("territory.audit.navigation")}
                    disabled={actionBusy !== null}
                  >
                    {actionBusy === "territory.audit.navigation" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 mr-2" />
                    )}
                    Navigation audit
                  </Button>
                </div>

                {actionResult && (
                  <div className="rounded-lg border border-slate-800 bg-black/20 p-3 text-xs text-gray-200">
                    <div className="font-semibold text-white">Last result</div>
                    <div className="text-gray-300 mt-1">{actionResult.message || JSON.stringify(actionResult)}</div>
                  </div>
                )}

                {aiTeam.length ? (
                  <div className="space-y-2">
                    {aiTeam.slice(0, 6).map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-start justify-between gap-3 border border-gray-800 rounded-lg p-3"
                      >
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-amber-400" />
                          <div>
                            <div className="font-semibold text-white">{agent.name || `Agent ${agent.id}`}</div>
                            <div className="text-xs text-gray-400">{agent.role || "unassigned role"}</div>
                          </div>
                        </div>
                        <div className="text-right text-xs text-gray-300 space-y-1">
                          <div>Status: {agent.status || "unknown"}</div>
                          <div>Budget: {formatNumber(agent.budget)}</div>
                          <div>Performance: {formatNumber(agent.performanceScore)}</div>
                        </div>
                      </div>
                    ))}
                    {aiTeam.length > 6 ? (
                      <div className="text-xs text-gray-500">Showing 6 of {aiTeam.length} agents.</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-300">
                    <ShieldCheck className="h-4 w-4 text-amber-400" />
                    <span>No agents found.</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Territory chat */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <CardTitle className="text-white text-lg">Territory chat</CardTitle>
                  <Badge variant="outline" className="text-[10px] border-slate-700 text-gray-300 truncate max-w-[220px]">
                    {leadAgent.name}
                  </Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={loadChat} disabled={chatLoading}>
                  <RefreshCw className={`h-4 w-4 ${chatLoading ? "animate-spin" : ""}`} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {chatError && (
                  <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                    {chatError}
                  </div>
                )}

                <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                  <div className="text-[12px] text-gray-200">
                    {leadAgent.name} ready. Coverage: <span className="text-gray-100">{coverageStatus}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">{suggestedAction}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-white/5 hover:bg-white/10 border border-white/10"
                    onClick={() => sendChatText("Audit KPIs")}
                    disabled={actionBusy !== null || chatSending}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Audit KPIs
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-white/5 hover:bg-white/10 border border-white/10"
                    onClick={() => sendChatText("Launch marketing")}
                    disabled={actionBusy !== null || chatSending}
                  >
                    <Megaphone className="h-4 w-4 mr-2" />
                    Launch marketing
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-white/5 hover:bg-white/10 border border-white/10"
                    onClick={() => sendChatText("Seed products")}
                    disabled={actionBusy !== null || chatSending}
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Seed products
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-white/5 hover:bg-white/10 border border-white/10"
                    onClick={() => sendChatText("Navigation audit")}
                    disabled={actionBusy !== null || chatSending}
                  >
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Navigation audit
                  </Button>
                </div>
                </div>

                <ScrollArea className="h-[320px] rounded-md border border-slate-800 bg-black/20 p-3">
                  {chatLoading ? (
                    <div className="flex items-center gap-2 text-gray-300 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading chat...
                    </div>
                  ) : chatMessages.length ? (
                    <div className="space-y-3">
                      {chatMessages.map((m) => (
                        <div key={m.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline" className="text-[10px] border-slate-700 text-gray-300">
                              {m.role}
                            </Badge>
                            <div className="text-[10px] text-gray-500">{formatDate(m.createdAt)}</div>
                          </div>
                          <div className="text-sm text-gray-100 whitespace-pre-wrap">{m.content}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-slate-800 bg-black/25 p-3">
                        <div className="text-sm font-semibold text-white">Welcome to {territory?.name || "this territory"}.</div>
                        <div className="mt-1 text-[12px] text-gray-300">
                          Coverage: <span className="text-gray-100">{coverageStatus}</span>
                        </div>
                        <div className="mt-1 text-[12px] text-gray-400">{suggestedAction}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => sendChatText("Audit KPIs")}
                            disabled={actionBusy !== null || chatSending}
                          >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Audit KPIs
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => sendChatText("Launch marketing")}
                            disabled={actionBusy !== null || chatSending}
                          >
                            <Megaphone className="h-4 w-4 mr-2" />
                            Launch marketing
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => sendChatText("Seed products")}
                            disabled={actionBusy !== null || chatSending}
                          >
                            <Zap className="h-4 w-4 mr-2" />
                            Seed products
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => sendChatText("Navigation audit")}
                            disabled={actionBusy !== null || chatSending}
                          >
                            <ShieldCheck className="h-4 w-4 mr-2" />
                            Navigation audit
                          </Button>
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-400">
                        Tip: ask for anything (e.g. "launch marketing for Abidjan", "audit KPIs", "seed products for retail").
                      </div>
                    </div>
                  )}
                </ScrollArea>

                <div className="flex items-center gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask the territory assistant..."
                    className="bg-slate-950 border-slate-800 text-white"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChat();
                      }
                    }}
                  />
                  <Button onClick={sendChat} disabled={!chatInput.trim() || chatSending}>
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </Button>
                </div>

                <div className="text-[11px] text-gray-500">
                  Messages are saved per territory. AI replies require <span className="text-gray-300">AI_ENABLED=true</span>.
                </div>
              </CardContent>
            </Card>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}


