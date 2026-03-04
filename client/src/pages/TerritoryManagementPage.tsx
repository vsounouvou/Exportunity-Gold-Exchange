import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { useSession } from "@/lib/session";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MapPin, RefreshCw, Search, ChevronDown, ChevronRight, Plus } from "lucide-react";

type Territory = {
  id: number;
  parentTerritoryId?: number | null;
  name: string;
  city: string | null;
  countryCode: string;
  territoryType: "country" | "region" | "city" | "district" | "neighborhood" | string;
  status: string;
  centerLat: string;
  centerLng: string;
  geometryType?: string | null;
  geometryGeojson?: any | null;
  bbox?: [number, number, number, number] | null;
  latestBudget?: any;
  latestKpi?: any;
};

type BoundaryCandidate = {
  osmType: string | null;
  osmId: number | null;
  osmRef: string | null;
  name: string;
  displayName: string | null;
  territoryType: string;
  countryCode: string | null;
  city: string | null;
  bbox: [number, number, number, number] | null;
  center: { lat: number; lng: number };
  geometry: any | null;
};

type TreeNode = Territory & { children: TreeNode[] };
const CARTO_DARK_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

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
      map.fitBounds(bboxToBounds(bbox), { padding: [30, 30] });
    } catch {
      // ignore
    }
  }, [bbox, map]);
  return null;
}

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

function styleForTerritory(input: { territory: Territory; selectedId: number | null }) {
  const { territory, selectedId } = input;
  const selected = selectedId === territory.id;
  const inactive = territory.status !== "active";

  const type = String(territory.territoryType || "").toLowerCase();
  const palette = (() => {
    if (type === "country") return { stroke: "#f59e0b", fill: "#f59e0b" }; // amber
    if (type === "region") return { stroke: "#14b8a6", fill: "#14b8a6" }; // teal
    if (type === "city") return { stroke: "#f97316", fill: "#f97316" }; // orange
    if (type === "district" || type === "neighborhood") return { stroke: "#a855f7", fill: "#a855f7" }; // purple
    return { stroke: "#1e3a8a", fill: "#0b1220" };
  })();

  const base = {
    color: selected ? palette.stroke : palette.stroke,
    weight: selected ? 4 : 2,
    opacity: inactive ? 0.55 : 0.9,
    fillColor: selected ? palette.fill : palette.fill,
    fillOpacity: selected ? 0.12 : 0.06,
    dashArray: inactive ? "6 6" : undefined,
    className: selected ? "territory-selected-glow" : undefined,
  } as any;

  if (type === "country") base.fillOpacity = selected ? 0.12 : 0.08;
  else if (type === "region") base.fillOpacity = selected ? 0.14 : 0.1;
  else if (type === "city") base.fillOpacity = selected ? 0.16 : 0.12;
  else if (type === "district" || type === "neighborhood") base.fillOpacity = selected ? 0.18 : 0.14;

  return base;
}

function buildTree(territories: Territory[]) {
  const nodes = new Map<number, TreeNode>();
  for (const t of territories) {
    nodes.set(t.id, { ...(t as any), children: [] });
  }

  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.parentTerritoryId ?? null;
    if (parentId && nodes.has(parentId)) {
      nodes.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sort = (arr: TreeNode[]) => {
    arr.sort((a, b) => {
      const type = String(a.territoryType).localeCompare(String(b.territoryType));
      if (type !== 0) return type;
      return String(a.name).localeCompare(String(b.name));
    });
    for (const item of arr) sort(item.children);
  };
  sort(roots);

  return roots;
}

function truthySearchParam(value: string | null) {
  if (value === null) return false;
  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

export function TerritoryManagementPage() {
  const { token } = useSession();
  const [location, setLocation] = useLocation();

  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [mapUsingFallbackTiles, setMapUsingFallbackTiles] = useState(false);

  const [typeFilter, setTypeFilter] = useState<Record<string, boolean>>({
    country: true,
    region: true,
    city: true,
    district: true,
    neighborhood: true,
  });

  const [drillMode, setDrillMode] = useState(true);

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<number | null>(null);
  const didAutoFocusRef = useRef(false);

  const [boundaryQuery, setBoundaryQuery] = useState("");
  const [boundaryResults, setBoundaryResults] = useState<BoundaryCandidate[]>([]);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [boundaryHasSearched, setBoundaryHasSearched] = useState(false);
  const [selectedBoundary, setSelectedBoundary] = useState<BoundaryCandidate | null>(null);
  const [importing, setImporting] = useState(false);

  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token]);

  const search = location.includes("?") ? location.split("?")[1] : "";
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const useFreshLink = useMemo(() => {
    if (truthySearchParam(searchParams.get("fresh"))) return true;
    if (truthySearchParam(searchParams.get("nocache"))) return true;
    if (truthySearchParam(searchParams.get("force"))) return true;
    return searchParams.has("cb") || searchParams.has("v");
  }, [searchParams]);

  const linkCacheBust = useMemo(() => {
    const cb = searchParams.get("cb");
    if (cb) return cb;
    const v = searchParams.get("v");
    if (v) return v;
    if (useFreshLink) return String(Date.now());
    return null;
  }, [searchParams, useFreshLink]);

  const withCacheBust = (url: string, force: boolean) => {
    const v = force ? String(Date.now()) : linkCacheBust;
    if (!v) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}cb=${encodeURIComponent(v)}`;
  };

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

  const loadTerritories = async (opts?: { force?: boolean }) => {
    if (!headers) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(withCacheBust("/api/territories", Boolean(opts?.force)), { headers, cache: "no-store" });
      setTerritories(res?.territories ?? []);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      setError(err?.message || "Unable to load territories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTerritories({ force: useFreshLink });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, linkCacheBust]);

  const visibleTerritories = useMemo(() => {
    return territories.filter((t) => typeFilter[String(t.territoryType)] !== false);
  }, [territories, typeFilter]);

  const tree = useMemo(() => buildTree(visibleTerritories), [visibleTerritories]);

  const territoriesById = useMemo(() => new Map<number, Territory>(territories.map((t) => [t.id, t])), [territories]);
  const childrenByParentId = useMemo(() => {
    const map = new Map<number, Territory[]>();
    for (const t of territories) {
      const parentId = t.parentTerritoryId ?? null;
      if (parentId == null) continue;
      if (!map.has(parentId)) map.set(parentId, []);
      map.get(parentId)!.push(t);
    }
    return map;
  }, [territories]);

  const focusTerritory = selectedTerritoryId ? territoriesById.get(selectedTerritoryId) ?? null : null;

  const descendantsByType = (rootId: number, type: string) => {
    const want = String(type || "").toLowerCase();
    const out: Territory[] = [];
    const queue = [rootId];
    const seen = new Set<number>(queue);
    while (queue.length) {
      const id = queue.shift() as number;
      const kids = childrenByParentId.get(id) || [];
      for (const child of kids) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        if (String(child.territoryType || "").toLowerCase() === want) out.push(child);
        queue.push(child.id);
      }
    }
    return out;
  };

  const countryTerritories = useMemo(
    () => territories.filter((t) => String(t.territoryType || "").toLowerCase() === "country"),
    [territories],
  );

  useEffect(() => {
    if (didAutoFocusRef.current) return;
    if (loading) return;
    if (selectedTerritoryId !== null) return;

    if (countryTerritories.length === 1) {
      didAutoFocusRef.current = true;
      const onlyCountry = countryTerritories[0];
      setSelectedTerritoryId(onlyCountry.id);
      setExpanded((prev) => ({ ...prev, [onlyCountry.id]: true }));
      return;
    }

    // Don't auto-select when multiple countries exist (Africa view remains).
    if (countryTerritories.length > 1) {
      didAutoFocusRef.current = true;
    }
  }, [countryTerritories, loading, selectedTerritoryId]);

  const nextLevelTerritories = useMemo(() => {
    if (!focusTerritory) return countryTerritories;

    const type = String(focusTerritory.territoryType || "").toLowerCase();
    const children = childrenByParentId.get(focusTerritory.id) || [];

    const by = (wanted: string) => children.filter((t) => String(t.territoryType || "").toLowerCase() === wanted);

    if (type === "country") {
      const regions = by("region");
      if (regions.length) return regions;
      const cities = by("city");
      if (cities.length) return cities;
      return children;
    }

    if (type === "region") {
      const cities = by("city");
      if (cities.length) return cities;
      return children;
    }

    if (type === "city") {
      const neighborhoods = descendantsByType(focusTerritory.id, "neighborhood");
      if (neighborhoods.length) return neighborhoods;
      const districts = descendantsByType(focusTerritory.id, "district");
      if (districts.length) return districts;
      return children;
    }

    if (type === "district") {
      const neighborhoods = descendantsByType(focusTerritory.id, "neighborhood");
      if (neighborhoods.length) return neighborhoods;
      return children;
    }

    return children;
  }, [childrenByParentId, countryTerritories, focusTerritory]);

  const mapTerritories = useMemo(() => {
    const list = focusTerritory ? [focusTerritory, ...nextLevelTerritories] : nextLevelTerritories;
    const byId = new Map<number, Territory>();
    for (const t of list) byId.set(t.id, t);
    return Array.from(byId.values());
  }, [focusTerritory, nextLevelTerritories]);

  const breadcrumb = useMemo(() => {
    const chain: Territory[] = [];
    let cur = focusTerritory;
    const seen = new Set<number>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.push(cur);
      const parentId = cur.parentTerritoryId ?? null;
      cur = parentId ? territoriesById.get(parentId) ?? null : null;
    }
    return chain.reverse();
  }, [focusTerritory, territoriesById]);

  const breadcrumbIds = useMemo(() => new Set(breadcrumb.map((t) => t.id)), [breadcrumb]);
  const sortedCountries = useMemo(() => [...countryTerritories].sort((a, b) => String(a.name).localeCompare(String(b.name))), [countryTerritories]);
  const sortedNextLevel = useMemo(() => [...nextLevelTerritories].sort((a, b) => String(a.name).localeCompare(String(b.name))), [nextLevelTerritories]);

  const defaultBbox = useMemo(() => {
    const bboxes = mapTerritories
      .map((t) => t.bbox)
      .filter(Boolean) as Array<[number, number, number, number]>;
    if (!bboxes.length) return null;

    let minLng = bboxes[0][0];
    let minLat = bboxes[0][1];
    let maxLng = bboxes[0][2];
    let maxLat = bboxes[0][3];

    for (const b of bboxes.slice(1)) {
      minLng = Math.min(minLng, b[0]);
      minLat = Math.min(minLat, b[1]);
      maxLng = Math.max(maxLng, b[2]);
      maxLat = Math.max(maxLat, b[3]);
    }

    return [minLng, minLat, maxLng, maxLat] as [number, number, number, number];
  }, [mapTerritories]);

  const focusBbox = useMemo(() => {
    if (selectedBoundary?.bbox) return selectedBoundary.bbox;
    const match = selectedTerritoryId ? territoriesById.get(selectedTerritoryId) ?? null : null;
    return match?.bbox ?? defaultBbox;
  }, [defaultBbox, selectedBoundary?.bbox, selectedTerritoryId, territoriesById]);

  const toggleExpanded = (id: number) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const pickTerritory = (t: Territory) => {
    setSelectedBoundary(null);
    setSelectedTerritoryId(t.id);
    const children = childrenByParentId.get(t.id) || [];
    if (children.length) {
      setExpanded((prev) => ({ ...prev, [t.id]: true }));
    }
  };

  const runBoundarySearch = async (overrideQuery?: string) => {
    if (!headers) return;
    const q = String(overrideQuery ?? boundaryQuery).trim();
    if (q.length < 2) {
      setBoundaryResults([]);
      setSelectedBoundary(null);
      setBoundaryHasSearched(false);
      return;
    }
    setBoundaryLoading(true);
    setBoundaryHasSearched(true);
    setError(null);
    try {
      const res = await apiRequest(
        withCacheBust(`/api/territories/boundaries/search?q=${encodeURIComponent(q)}&limit=10`, useFreshLink),
        { headers, cache: "no-store" },
      );
      setBoundaryResults(res?.items ?? []);
    } catch (err: any) {
      setError(err?.message || "Boundary search failed");
    } finally {
      setBoundaryLoading(false);
    }
  };

  const importBoundary = async () => {
    if (!headers || !selectedBoundary?.osmType || !selectedBoundary?.osmId) return;
    setImporting(true);
    setError(null);
    try {
      const res = await apiRequest("/api/territories/boundaries/import", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ osmType: selectedBoundary.osmType, osmId: selectedBoundary.osmId }),
        cache: "no-store",
      });
      const id = Number(res?.territory?.id);
      await loadTerritories({ force: true });
      if (Number.isFinite(id)) {
        setSelectedTerritoryId(id);
        setSelectedBoundary(null);
      }
    } catch (err: any) {
      setError(err?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = Boolean(expanded[node.id]);
    const isSelected = selectedTerritoryId === node.id;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer ${
            isSelected ? "bg-amber-500/15 border border-amber-500/30" : "hover:bg-slate-800/50"
          }`}
          style={{ marginLeft: depth * 12 }}
          onClick={() => {
            pickTerritory(node);
          }}
        >
          <button
            type="button"
            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-slate-800/70"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpanded(node.id);
            }}
            aria-label={hasChildren ? (isExpanded ? "Collapse" : "Expand") : "No children"}
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-300" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-300" />
              )
            ) : (
              <span className="h-4 w-4" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-white truncate">{node.name}</div>
              <Badge variant="outline" className="text-[10px] border-slate-700 text-gray-300">
                {node.territoryType}
              </Badge>
            </div>
            <div className="text-[11px] text-gray-500 truncate">
              {node.city ? `${node.city}, ` : null}
              {node.countryCode}
            </div>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 pb-[calc(var(--bottom-stack-height)+16px)]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
            <MapPin className="h-5 w-5 text-amber-400" />
            Territories
          </h1>
          <p className="text-sm text-gray-400">Map-first territory hub with real administrative boundaries.</p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshedAt && (
            <div className="text-[11px] text-gray-500 hidden md:block">
              Data refreshed: <span className="text-gray-300">{lastRefreshedAt.toLocaleTimeString()}</span>
            </div>
          )}
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadTerritories({ force: true })}
            disabled={!headers || loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>}

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <button
              type="button"
              className={`text-sm ${!focusTerritory ? "text-amber-300" : "text-gray-300 hover:text-white"}`}
              onClick={() => setSelectedTerritoryId(null)}
            >
              Africa
            </button>
            {breadcrumb.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-gray-600" />
                <button
                  type="button"
                  className={`text-sm ${focusTerritory?.id === t.id ? "text-amber-300" : "text-gray-300 hover:text-white"}`}
                  onClick={() => {
                    setSelectedTerritoryId(t.id);
                  }}
                >
                  {t.name}
                </button>
              </div>
            ))}
          </div>

          {focusTerritory ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setLocation(`/territories/${focusTerritory.id}`)}>
                Open hub
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[360px,minmax(0,1fr)] 2xl:grid-cols-[360px,minmax(0,1fr),320px] gap-4">
        <Card className="order-2 lg:order-1 bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-lg">Search & import boundaries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={boundaryQuery}
                onChange={(e) => setBoundaryQuery(e.target.value)}
                placeholder="Search country / city / neighborhood"
                className="bg-slate-950 border-slate-800 text-white"
                onKeyDown={(e) => {
                  if (e.key === "Enter") runBoundarySearch();
                }}
              />
              <Button variant="secondary" onClick={() => runBoundarySearch()} disabled={!headers || boundaryLoading}>
                {boundaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            <div className="text-[11px] text-gray-500">
              Tip: use spaces (e.g. <span className="text-gray-300">Cote d&apos;Ivoire</span>,{" "}
              <span className="text-gray-300">Cotonou, Benin</span>).
            </div>

            {boundaryHasSearched && !boundaryLoading && boundaryQuery.trim().length >= 2 && boundaryResults.length === 0 && (
              <div className="text-xs text-gray-400 border border-slate-800 bg-black/20 rounded-md p-3">
                No results. Try a shorter query or use one of the suggested searches below.
              </div>
            )}

            {boundaryResults.length === 0 && !boundaryLoading && !loading && (tree.length === 0 || boundaryHasSearched) && (
              <div className="rounded-md border border-slate-800 bg-black/20 p-3 space-y-2">
                <div className="text-xs text-gray-300">Suggested searches</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Benin", q: "Benin" },
                    { label: "Cote d'Ivoire", q: "Cote d'Ivoire" },
                    { label: "Senegal", q: "Senegal" },
                    { label: "Ghana", q: "Ghana" },
                  ].map((item) => (
                    <Button
                      key={item.label}
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setBoundaryQuery(item.q);
                        runBoundarySearch(item.q);
                      }}
                      disabled={!headers || boundaryLoading}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
                <div className="text-[11px] text-gray-500">
                  Pick a result, preview it on the map, then click <span className="text-gray-300">Import as Territory</span>.
                </div>
              </div>
            )}

            {boundaryResults.length > 0 && (
              <div className="rounded-md border border-slate-800 bg-black/20">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="text-xs text-gray-300">Results</div>
                  <div className="text-[11px] text-gray-500">{boundaryResults.length}</div>
                </div>
                <ScrollArea className="h-44">
                  <div className="p-2 space-y-1">
                    {boundaryResults.map((item) => {
                      const active = selectedBoundary?.osmRef && item.osmRef === selectedBoundary.osmRef;
                      return (
                        <button
                          key={`${item.osmRef || item.displayName}`}
                          className={`w-full text-left px-2 py-2 rounded-md border ${
                            active ? "border-amber-500/40 bg-amber-500/10" : "border-transparent hover:bg-slate-800/40"
                          }`}
                          onClick={() => setSelectedBoundary(item)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm text-white truncate">{item.name}</div>
                            <Badge variant="outline" className="text-[10px] border-slate-700 text-gray-300">
                              {item.territoryType}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">{item.displayName}</div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                onClick={importBoundary}
                disabled={!headers || importing || !selectedBoundary?.osmType || !selectedBoundary?.osmId}
              >
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Import as Territory
              </Button>
              {selectedBoundary?.countryCode && (
                <Badge variant="secondary" className="text-xs">
                  {selectedBoundary.countryCode}
                </Badge>
              )}
            </div>

            <div className="h-px bg-slate-800" />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-white font-semibold">Hierarchy Browser</div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant={drillMode ? "secondary" : "ghost"} onClick={() => setDrillMode(true)}>
                    Drill
                  </Button>
                  <Button size="sm" variant={!drillMode ? "secondary" : "ghost"} onClick={() => setDrillMode(false)}>
                    Tree
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-gray-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading territories...
                </div>
              ) : drillMode ? (
                tree.length === 0 ? (
                  <div className="text-sm text-gray-400">
                    No territories yet. Use the boundary import above to add a country, then drill down on the map.
                  </div>
                ) : (
                  <ScrollArea className="h-[360px] pr-2">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-gray-400">
                          <span>Countries</span>
                          <span className="text-gray-500">{sortedCountries.length}</span>
                        </div>
                        <div className="space-y-1">
                          {sortedCountries.map((item) => {
                            const active = breadcrumbIds.has(item.id);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={`w-full text-left px-2 py-2 rounded-md border transition-colors ${
                                  active ? "border-amber-500/40 bg-amber-500/10" : "border-transparent hover:bg-slate-800/40"
                                }`}
                                onClick={() => pickTerritory(item)}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm text-white truncate">{item.name}</div>
                                  <Badge variant="outline" className="text-[10px] border-slate-700 text-gray-300">
                                    {item.territoryType}
                                  </Badge>
                                </div>
                                <div className="text-[11px] text-gray-500 truncate">{item.countryCode}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {focusTerritory ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-gray-400">
                            <span>
                              {(() => {
                                const type = String(focusTerritory.territoryType || "").toLowerCase();
                                if (type === "country") return "Regions";
                                if (type === "region") return "Cities";
                                if (type === "city" || type === "district") return "Neighborhoods";
                                return "Children";
                              })()}
                            </span>
                            <span className="text-gray-500">{sortedNextLevel.length}</span>
                          </div>
                          {sortedNextLevel.length ? (
                            <div className="space-y-1">
                              {sortedNextLevel.map((item) => {
                                const active = selectedTerritoryId === item.id;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    className={`w-full text-left px-2 py-2 rounded-md border transition-colors ${
                                      active
                                        ? "border-amber-500/40 bg-amber-500/10"
                                        : "border-transparent hover:bg-slate-800/40"
                                    }`}
                                    onClick={() => pickTerritory(item)}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-sm text-white truncate">{item.name}</div>
                                      <Badge variant="outline" className="text-[10px] border-slate-700 text-gray-300">
                                        {item.territoryType}
                                      </Badge>
                                    </div>
                                    <div className="text-[11px] text-gray-500 truncate">
                                      {item.city ? `${item.city}, ` : null}
                                      {item.countryCode}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-400">No child territories found.</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-gray-500">
                          Tip: click a country (or a polygon on the map) to drill down.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )
              ) : tree.length === 0 ? (
                <div className="text-sm text-gray-400">
                  No territories yet. Search a boundary above and click "Import as Territory".
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {(["country", "region", "city", "district", "neighborhood"] as const).map((t) => {
                      const enabled = typeFilter[t] !== false;
                      return (
                        <Button
                          key={t}
                          size="sm"
                          variant={enabled ? "secondary" : "ghost"}
                          onClick={() => setTypeFilter((prev) => ({ ...prev, [t]: !enabled }))}
                        >
                          {t}
                        </Button>
                      );
                    })}
                  </div>
                  <ScrollArea className="h-[320px] pr-2">
                    <div className="space-y-1">{tree.map((node) => renderNode(node, 0))}</div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="order-1 lg:order-2 bg-gray-950 border-gray-800 overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-white text-lg">Map</CardTitle>
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-gray-400">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                  Country
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-teal-500" aria-hidden="true" />
                  Region
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-500" aria-hidden="true" />
                  City
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-purple-500" aria-hidden="true" />
                  Neighborhood
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[52vh] min-h-[320px] max-h-[760px] w-full sm:h-[58vh] lg:h-[64vh]">
              <MapContainer center={[7, 0]} zoom={2} className="h-full w-full" zoomControl={false}>
                <MapAutoResize />
                <ResilientTileLayer onFallbackChange={setMapUsingFallbackTiles} />

                {focusBbox && <FitBounds bbox={focusBbox} />}

                {selectedBoundary?.geometry && (
                  <GeoJSON
                    data={selectedBoundary.geometry}
                    style={() => ({
                      color: "#f59e0b",
                      weight: 3,
                      fillColor: "#f59e0b",
                      fillOpacity: 0.08,
                      dashArray: "8 6",
                    })}
                  />
                )}

                {mapTerritories.map((t) => {
                  if (!t.geometryGeojson) return null;
                  return (
                    <GeoJSON
                      key={t.id}
                      data={t.geometryGeojson}
                      style={() => styleForTerritory({ territory: t, selectedId: selectedTerritoryId })}
                      eventHandlers={{
                        click: () => {
                          pickTerritory(t);
                        },
                      }}
                    />
                  );
                })}
              </MapContainer>
            </div>
            {mapUsingFallbackTiles ? (
              <div className="border-t border-slate-800 px-3 py-2 text-[11px] text-amber-300 bg-amber-500/5">
                Primary map tiles unavailable. Using OpenStreetMap fallback.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="order-3 lg:col-span-2 2xl:col-span-1 bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-lg">Territory KPIs</CardTitle>
            <div className="text-[11px] text-gray-500">Click a polygon to drill down and view KPIs.</div>
          </CardHeader>
          <CardContent className="space-y-3">
            {focusTerritory ? (
              <>
                <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                  <div className="text-[11px] text-gray-400">Selected</div>
                  <div className="text-white font-semibold">{focusTerritory.name}</div>
                  <div className="text-[11px] text-gray-500">
                    {focusTerritory.territoryType} - {focusTerritory.countryCode}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                    <div className="text-[11px] text-gray-400">Active sellers</div>
                    <div className="text-white font-semibold">{focusTerritory.latestKpi?.activeSellers ?? "-"}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                    <div className="text-[11px] text-gray-400">Orders (7/30d)</div>
                    <div className="text-white font-semibold">{focusTerritory.latestKpi?.ordersCount ?? "-"}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                    <div className="text-[11px] text-gray-400">Active buyers</div>
                    <div className="text-white font-semibold">{focusTerritory.latestKpi?.activeBuyers ?? "-"}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-black/20 p-3">
                    <div className="text-[11px] text-gray-400">Agents</div>
                    <div className="text-white font-semibold">-</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Button size="sm" variant="secondary" onClick={() => setLocation(`/territories/${focusTerritory.id}`)}>
                    Open territory hub
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                    onClick={() => setLocation(`/territories/${focusTerritory.id}`)}
                  >
                    Open territory agent chat
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                    onClick={() => setLocation(`/admin/agents?territoryId=${focusTerritory.id}`)}
                  >
                    Open agent command center
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-400">Select a country/region/city to view KPIs and actions.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

