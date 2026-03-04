import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { getCadastreRiskColor, getCadastreStatusColor, getCadastreTypeColor } from "@/ui/cadastre/colors";

type DemoCadastreMapItem = {
  id: string;
  cadastre_name: string | null;
  permit_number: string | null;
  region: string | null;
  status: "VERIFIED" | "PENDING" | "INACTIVE" | string;
  site_type: "ARTISANAL" | "SEMI_INDUSTRIAL" | "INDUSTRIAL" | "UNKNOWN" | string;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | string;
  lat: number | null;
  lng: number | null;
  production_30d_g?: number | null;
  last_report_date?: string | null;
};

type DemoCadastreOpportunity = {
  id: string;
  cadastre_name: string | null;
  permit_number: string | null;
  region: string | null;
  status: "VERIFIED" | "PENDING" | "INACTIVE" | string;
  current_capacity_kg_month?: number | null;
  capital_required_usd?: number | null;
  duration_months?: number | null;
  production_30d_g?: number | null;
  lat?: number | null;
  lng?: number | null;
};

type LeafletDeps = {
  L: any;
  MapContainer: any;
  TileLayer: any;
  Circle: any;
  Popup: any;
};

function asText(value: unknown) {
  return String(value || "").trim();
}

function parseQuery(location: string) {
  const idx = location.indexOf("?");
  const params = new URLSearchParams(idx >= 0 ? location.slice(idx + 1) : "");
  return {
    token: asText(params.get("token")),
    expiresAt: asText(params.get("exp")),
  };
}

function statusLabel(status: string) {
  const normalized = asText(status).toUpperCase();
  if (normalized === "VERIFIED") return "Verified";
  if (normalized === "PENDING") return "Pending";
  if (normalized === "INACTIVE") return "Inactive";
  return normalized || "Pending";
}

export default function PublicCadastreDemoPage() {
  const [location] = useLocation();
  const query = useMemo(() => parseQuery(location), [location]);
  const [leafletDeps, setLeafletDeps] = useState<LeafletDeps | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [, leafletModule, reactLeaflet] = await Promise.all([
        import("leaflet/dist/leaflet.css"),
        import("leaflet"),
        import("react-leaflet"),
      ]);

      if (cancelled) return;
      const L = (leafletModule as any)?.default ?? leafletModule;
      try {
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
          iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
          shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
        });
      } catch {
        // no-op
      }

      setLeafletDeps({
        L,
        MapContainer: (reactLeaflet as any).MapContainer,
        TileLayer: (reactLeaflet as any).TileLayer,
        Circle: (reactLeaflet as any).Circle,
        Popup: (reactLeaflet as any).Popup,
      });
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const mapQuery = useQuery<{ ok?: boolean; items?: DemoCadastreMapItem[] }>({
    queryKey: ["/api/demo/cadastre/map", query.token],
    enabled: Boolean(query.token),
    staleTime: 60_000,
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("token", query.token);
      qs.set("country", "CI");
      qs.set("status", "VERIFIED,PENDING");
      qs.set("limit", "1000");
      return apiRequest(`/api/demo/cadastre/map?${qs.toString()}`);
    },
  });

  const opportunitiesQuery = useQuery<{ ok?: boolean; items?: DemoCadastreOpportunity[] }>({
    queryKey: ["/api/demo/cadastre/opportunities", query.token],
    enabled: Boolean(query.token),
    staleTime: 60_000,
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("token", query.token);
      qs.set("country", "CI");
      qs.set("status", "VERIFIED,PENDING");
      qs.set("limit", "300");
      return apiRequest(`/api/demo/cadastre/opportunities?${qs.toString()}`);
    },
  });

  const mapItems = useMemo(() => {
    const items = Array.isArray(mapQuery.data?.items) ? mapQuery.data!.items : [];
    return items.filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)));
  }, [mapQuery.data]);

  const opportunities = useMemo(
    () => (Array.isArray(opportunitiesQuery.data?.items) ? opportunitiesQuery.data!.items : []),
    [opportunitiesQuery.data],
  );

  const mapCenter = useMemo<[number, number]>(() => {
    if (!mapItems.length) return [7.54, -5.55];
    const sum = mapItems.reduce(
      (acc, item) => {
        acc.lat += Number(item.lat || 0);
        acc.lng += Number(item.lng || 0);
        return acc;
      },
      { lat: 0, lng: 0 },
    );
    return [sum.lat / mapItems.length, sum.lng / mapItems.length];
  }, [mapItems]);

  const isLoading = mapQuery.isLoading || opportunitiesQuery.isLoading;
  const hasError = mapQuery.isError || opportunitiesQuery.isError;
  const expiresLabel = query.expiresAt ? new Date(query.expiresAt).toLocaleString() : null;

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Investment Opportunities</h1>
            <p className="text-xs text-white/60">Cadastre-verified permits for Cote d'Ivoire (read-only demo)</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="border border-cyan-400/40 bg-cyan-500/10 text-cyan-100">Demo</Badge>
            {expiresLabel ? (
              <span className="text-[11px] text-white/55">Expires: {expiresLabel}</span>
            ) : null}
          </div>
        </div>

        {!query.token ? (
          <Card className="border-rose-500/30 bg-rose-500/10">
            <CardContent className="p-4 text-sm text-rose-100">
              Missing demo token. Use a valid URL like <span className="font-mono">/public/demo/cadastre?token=...</span>.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
            <div className="relative h-[72vh] overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              {!leafletDeps ? (
                <div className="flex h-full items-center justify-center text-sm text-white/60">Loading map...</div>
              ) : (
                (() => {
                  const { MapContainer, TileLayer, Circle, Popup } = leafletDeps;
                  return (
                    <MapContainer center={mapCenter} zoom={7} className="h-full w-full" zoomControl={false}>
                      <TileLayer
                        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      />
                      {mapItems.map((item) => {
                        const statusColor = getCadastreStatusColor(item.status);
                        const typeColor = getCadastreTypeColor(item.site_type);
                        const riskColor = getCadastreRiskColor(item.risk_level);
                        const lat = Number(item.lat || 0);
                        const lng = Number(item.lng || 0);
                        return (
                          <Fragment key={item.id}>
                            <Circle
                              center={[lat, lng]}
                              radius={4200}
                              pathOptions={{
                                color: riskColor,
                                weight: 0,
                                opacity: 1,
                                fillColor: riskColor,
                                fillOpacity: 0.3,
                              }}
                            />
                            <Circle
                              center={[lat, lng]}
                              radius={2200}
                              pathOptions={{
                                color: typeColor,
                                weight: 2,
                                opacity: 1,
                                fillColor: statusColor,
                                fillOpacity: 1,
                              }}
                            >
                              <Popup>
                                <div className="min-w-[260px] rounded-lg bg-slate-900 p-3 text-white">
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <strong className="text-sm">
                                      {asText(item.cadastre_name) || "MISSING CADASTRE NAME - FIX"}
                                    </strong>
                                    <Badge
                                      className="border border-white/20 text-[10px]"
                                      style={{ backgroundColor: statusColor, color: "#0b1020" }}
                                    >
                                      {statusLabel(item.status)}
                                    </Badge>
                                  </div>
                                  <div className="space-y-1 text-[11px] text-white/80">
                                    <div>Permit: {asText(item.permit_number) || "-"}</div>
                                    <div>Region: {asText(item.region) || "-"}</div>
                                    <div>Type: {asText(item.site_type) || "-"}</div>
                                    <div>Risk: {asText(item.risk_level) || "-"}</div>
                                  </div>
                                </div>
                              </Popup>
                            </Circle>
                          </Fragment>
                        );
                      })}
                    </MapContainer>
                  );
                })()
              )}

              <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/15 bg-black/55 px-3 py-2 text-[11px]">
                <div className="mb-1 font-medium text-white/85">Legend</div>
                <div className="space-y-1 text-white/70">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#16a34a" }} />
                    Verified
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
                    Pending
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#6b7280" }} />
                    Inactive
                  </div>
                </div>
              </div>
            </div>

            <Card className="h-[72vh] border-white/10 bg-black/45">
              <CardContent className="flex h-full flex-col p-0">
                <div className="border-b border-white/10 px-4 py-3">
                  <h2 className="text-sm font-semibold">Cadastre verified permits</h2>
                  <p className="mt-0.5 text-[11px] text-white/60">Investment opportunities from CI cadastre data.</p>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-2 p-3">
                    {isLoading ? (
                      <div className="text-sm text-white/60">Loading opportunities...</div>
                    ) : null}
                    {hasError ? (
                      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                        Failed to load demo data. Verify token or cadastre API health.
                      </div>
                    ) : null}
                    {!isLoading && !hasError && !opportunities.length ? (
                      <div className="text-sm text-white/60">No opportunities found for the current filters.</div>
                    ) : null}
                    {opportunities.map((op) => (
                      <div key={op.id} className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                        <div className="mb-1 text-sm font-semibold text-white">
                          {asText(op.cadastre_name) || "MISSING CADASTRE NAME - FIX"}
                        </div>
                        <div className="text-[11px] text-white/70">
                          <div>Permit: {asText(op.permit_number) || "-"}</div>
                          <div>Region: {asText(op.region) || "-"}</div>
                          <div>Status: {statusLabel(op.status)}</div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <div className="text-white/45">Current capacity</div>
                            <div className="font-medium text-white">
                              {op.current_capacity_kg_month != null ? `${Number(op.current_capacity_kg_month)} kg/month` : "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-white/45">Duration</div>
                            <div className="font-medium text-white">
                              {op.duration_months != null ? `${Number(op.duration_months)} months` : "-"}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-white/45">Capital required</div>
                            <div className="font-medium text-amber-300">
                              {op.capital_required_usd != null
                                ? `$${Number(op.capital_required_usd).toLocaleString()}`
                                : "-"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
