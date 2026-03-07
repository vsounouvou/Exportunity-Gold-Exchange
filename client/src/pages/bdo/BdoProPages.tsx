import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/lib/session";
import { apiRequest } from "@/lib/queryClient";

type ProProfile = {
  id: string;
  role: string;
  membershipTier: string;
  verificationStatus: string;
  companyName: string | null;
  country: string | null;
  canAccessMap: boolean;
  canViewSupplyContacts: boolean;
  canViewMineLayer: boolean;
  canViewBureauLayer: boolean;
  canViewExportLayer: boolean;
};

type ProSummaryResponse = {
  ok: boolean;
  profile: ProProfile;
  map: {
    variant: "buyer" | "source";
    title: string;
    subtitle: string;
    defaultTypes: string[];
    locked: boolean;
    lockedMessage: string | null;
  };
  stats: {
    verifiedBureaux: number;
    verifiedExporters: number;
    activeRegions: number;
    sourcingNodes: number;
    totalVisibleNodes: number;
  };
};

type ProMapNode = {
  id: string;
  nodeType: string;
  layers: string[];
  name: string;
  slug: string | null;
  description: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  verificationStatus: string;
  companyName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  wholesaleReady: boolean;
  metadata: Record<string, unknown>;
};

type ProMapResponse = {
  ok: boolean;
  map: ProSummaryResponse["map"];
  stats: ProSummaryResponse["stats"];
  items: ProMapNode[];
};

type DirectoryItem = {
  id: string;
  companyName: string;
  verified: boolean;
  region: string | null;
  country: string | null;
  city: string | null;
  type: string;
  wholesaleReady: boolean;
  services?: string[];
  activeOffers?: number;
  totalWeightKg?: number;
  contactPhone?: string | null;
  contactEmail?: string | null;
  mapLink: string;
};

type DirectoryResponse = {
  ok: boolean;
  items: DirectoryItem[];
};

type LeafletDeps = {
  MapContainer: any;
  TileLayer: any;
  CircleMarker: any;
  Popup: any;
};

const tierLabels: Record<string, string> = {
  free: "Public",
  pro_basic: "Pro Basic",
  pro_buyer: "Pro Buyer",
  pro_source: "Pro Source",
  admin_internal: "Admin interne",
};

const tierRank: Record<string, number> = {
  free: 0,
  pro_basic: 1,
  pro_buyer: 2,
  pro_source: 3,
  admin_internal: 4,
};

function statusTone(verified: boolean) {
  return verified
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
    : "border-amber-500/25 bg-amber-500/10 text-amber-100";
}

function mapNodeTone(nodeType: string) {
  if (nodeType === "bureau_achat") return "#f59e0b";
  if (nodeType === "exporter" || nodeType === "export_hub") return "#22c55e";
  if (nodeType === "mine" || nodeType === "artisanal_zone") return "#38bdf8";
  if (nodeType === "association" || nodeType === "regional_supply_node") return "#a855f7";
  return "#facc15";
}

function directoryUnlocked(summary: ProSummaryResponse | null) {
  if (!summary) return false;
  return (tierRank[summary.profile.membershipTier] || 0) >= tierRank.pro_basic || summary.profile.role === "admin_internal";
}

function useProSummary(enabled: boolean) {
  return useQuery<ProSummaryResponse>({
    queryKey: ["/api/v2/pro/map/summary"],
    enabled,
    staleTime: 30_000,
    queryFn: () => apiRequest("/api/v2/pro/map/summary"),
  });
}

function useDirectory(path: string, enabled: boolean) {
  return useQuery<DirectoryResponse>({
    queryKey: [path],
    enabled,
    staleTime: 30_000,
    queryFn: () => apiRequest(path),
  });
}

function useLeafletDeps(enabled: boolean) {
  const [deps, setDeps] = useState<LeafletDeps | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const [, reactLeaflet] = await Promise.all([import("leaflet/dist/leaflet.css"), import("react-leaflet")]);
      if (cancelled) return;
      setDeps({
        MapContainer: (reactLeaflet as any).MapContainer,
        TileLayer: (reactLeaflet as any).TileLayer,
        CircleMarker: (reactLeaflet as any).CircleMarker,
        Popup: (reactLeaflet as any).Popup,
      });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return deps;
}

function ProShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-4 px-3 py-5 md:px-5">
        <section className="rounded-3xl border border-amber-500/20 bg-gradient-to-r from-[#170c04] via-[#3b240c] to-[#6b4d18] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.26em] text-amber-200/85">Bourse de l'Or</p>
              <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">{title}</h1>
              <p className="mt-2 text-sm text-amber-50/80 md:text-base">{subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/store">
                <Button className="bg-amber-500 text-black hover:bg-amber-400">Or Estampille</Button>
              </Link>
              <Link href="/pro/map">
                <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                  Ouvrir la carte
                </Button>
              </Link>
            </div>
          </div>
        </section>
        {children}
      </div>
    </div>
  );
}

function AccessLock({ message = "Acces reserve aux membres Pro verifies" }: { message?: string }) {
  return (
    <Card className="border-amber-500/25 bg-[#0a1221]/95">
      <CardContent className="p-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/80">Carte professionnelle</p>
        <h2 className="mt-2 text-lg font-semibold text-white">Debloquez l'acces Pro</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/65">{message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/admin">
            <Button className="bg-amber-500 text-black hover:bg-amber-400">Se connecter</Button>
          </Link>
          <Link href="/espace-pro">
            <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
              Voir l'espace Pro
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ProStats({ summary }: { summary: ProSummaryResponse }) {
  const stats = [
    { label: "Bureaux verifies", value: summary.stats.verifiedBureaux },
    { label: "Exportateurs verifies", value: summary.stats.verifiedExporters },
    { label: "Regions actives", value: summary.stats.activeRegions },
    { label: "Noeuds sourcing", value: summary.stats.sourcingNodes },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((item) => (
        <Card key={item.label} className="border-white/10 bg-[#07101d]/95">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DirectoryList({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: DirectoryItem[];
}) {
  return (
    <Card className="border-white/10 bg-[#07101d]/95">
      <CardContent className="p-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-white/60">{description}</p>
        </div>
        <div className="mt-4 space-y-3">
          {items.length ? (
            items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-white">{item.companyName}</h3>
                      <Badge className={`border ${statusTone(item.verified)}`}>{item.verified ? "Verifie" : "En cours"}</Badge>
                      {item.wholesaleReady ? (
                        <Badge className="border border-emerald-500/25 bg-emerald-500/10 text-emerald-100">Pret pour le gros</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[12px] text-white/55">{[item.type, item.region, item.country].filter(Boolean).join(" - ")}</p>
                    {(item.activeOffers || item.totalWeightKg) ? (
                      <p className="mt-1 text-[11px] text-amber-200/80">
                        {item.activeOffers ? `${item.activeOffers} offres actives` : null}
                        {item.activeOffers && item.totalWeightKg ? " - " : null}
                        {item.totalWeightKg ? `${item.totalWeightKg.toFixed(2)} kg visibles` : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={item.mapLink}>
                      <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                        Voir sur la carte
                      </Button>
                    </Link>
                    <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                      Contacter
                    </Button>
                    <Button className="bg-amber-500 text-black hover:bg-amber-400">Demander une offre</Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
              Aucune contrepartie disponible pour cette vue.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MapCard({
  nodes,
  summary,
  interactive = false,
  heightClass = "h-[340px]",
}: {
  nodes: ProMapNode[];
  summary: ProSummaryResponse | null;
  interactive?: boolean;
  heightClass?: string;
}) {
  const deps = useLeafletDeps(nodes.length > 0);
  const center = useMemo<[number, number]>(() => {
    if (!nodes.length) return [7.54, -5.55];
    const total = nodes.reduce(
      (acc, node) => {
        acc.lat += Number(node.latitude || 0);
        acc.lng += Number(node.longitude || 0);
        return acc;
      },
      { lat: 0, lng: 0 },
    );
    return [total.lat / nodes.length, total.lng / nodes.length];
  }, [nodes]);

  return (
    <Card className="overflow-hidden border-white/10 bg-[#07101d]/95">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/80">Carte professionnelle</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{summary?.map.title || "Carte des contreparties auriferes verifiees"}</h2>
            <p className="mt-1 text-sm text-white/60">{summary?.map.subtitle || "Cartographie des acteurs auriferes verifies."}</p>
          </div>
          {summary ? (
            <div className="hidden grid-cols-3 gap-2 md:grid">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Bureaux</p>
                <p className="mt-1 text-sm font-semibold text-white">{summary.stats.verifiedBureaux}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Export</p>
                <p className="mt-1 text-sm font-semibold text-white">{summary.stats.verifiedExporters}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Regions</p>
                <p className="mt-1 text-sm font-semibold text-white">{summary.stats.activeRegions}</p>
              </div>
            </div>
          ) : null}
        </div>
        <div className={`relative ${heightClass}`}>
          {!deps ? (
            <div className="flex h-full items-center justify-center text-sm text-white/55">Chargement de la carte...</div>
          ) : (
            (() => {
              const { MapContainer, TileLayer, CircleMarker, Popup } = deps;
              return (
                <MapContainer center={center} zoom={6} className="h-full w-full" zoomControl={interactive}>
                  <TileLayer
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  />
                  {nodes.map((node) => (
                    <CircleMarker
                      key={node.id}
                      center={[node.latitude, node.longitude]}
                      radius={interactive ? 8 : 6}
                      pathOptions={{
                        color: mapNodeTone(node.nodeType),
                        fillColor: mapNodeTone(node.nodeType),
                        fillOpacity: 0.85,
                        weight: 1,
                      }}
                    >
                      <Popup>
                        <div className="min-w-[220px] text-sm text-slate-900">
                          <div className="font-semibold">{node.name}</div>
                          <div className="mt-1 text-xs text-slate-600">{[node.nodeType, node.region, node.country].filter(Boolean).join(" - ")}</div>
                          {node.description ? <div className="mt-2 text-xs text-slate-700">{node.description}</div> : null}
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              );
            })()
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProDashboardContent() {
  const { isAuthenticated } = useSession();
  const [, navigate] = useLocation();
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;

  const previewParams = useMemo(() => {
    if (!summary?.map.defaultTypes?.length) return "verifiedOnly=1";
    const qs = new URLSearchParams();
    qs.set("types", summary.map.defaultTypes.join(","));
    qs.set("verifiedOnly", "1");
    return qs.toString();
  }, [summary?.map.defaultTypes]);

  const previewQuery = useQuery<ProMapResponse>({
    queryKey: ["/api/v2/pro/map/nodes", "preview", previewParams],
    enabled: Boolean(isAuthenticated && summary && !summary.map.locked),
    staleTime: 30_000,
    queryFn: () => apiRequest(`/api/v2/pro/map/nodes?${previewParams}`),
  });

  const bureauxQuery = useDirectory(
    "/api/v2/pro/directory/bureaux-achat",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewBureauLayer),
  );
  const exportersQuery = useDirectory(
    "/api/v2/pro/directory/exporters",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewExportLayer),
  );

  if (!isAuthenticated) {
    return <AccessLock message="Accedez a la cartographie des bureaux d'achat verifies, exportateurs et zones de sourcing via votre compte Pro." />;
  }
  if (!summary) {
    return <AccessLock message="Chargement du profil Pro..." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <ProStats summary={summary} />
          {summary.map.locked ? (
            <AccessLock message={summary.map.lockedMessage || "Acces reserve aux membres Pro verifies"} />
          ) : (
            <MapCard nodes={previewQuery.data?.items || []} summary={summary} heightClass="h-[340px]" />
          )}
        </div>

        <div className="space-y-4">
          <Card className="border-white/10 bg-[#07101d]/95">
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/80">Profil Pro</p>
              <h2 className="mt-1 text-lg font-semibold text-white">{summary.profile.companyName || "Compte professionnel"}</h2>
              <div className="mt-4 space-y-3 text-sm text-white/65">
                <div className="flex items-center justify-between">
                  <span>Role</span>
                  <span className="font-medium text-white">{summary.profile.role.replace(/_/g, " ")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Verification</span>
                  <span className="font-medium text-white">{summary.profile.verificationStatus}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Acces carte</span>
                  <span className="font-medium text-white">{summary.profile.canAccessMap ? "Oui" : "Non"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Membership</span>
                  <span className="font-medium text-white">{tierLabels[summary.profile.membershipTier] || summary.profile.membershipTier}</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {summary.map.defaultTypes.map((type) => (
                  <Badge key={type} variant="outline" className="border-white/10 bg-white/5 text-white/75">
                    {type.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <Link href="/pro/map">
                  <Button className="w-full bg-amber-500 text-black hover:bg-amber-400">Ouvrir la carte complete</Button>
                </Link>
                <Link href="/pro/bureaux-achat">
                  <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/10">
                    Voir les bureaux d'achat
                  </Button>
                </Link>
                <Link href="/pro/exportateurs-verifies">
                  <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/10">
                    Voir les exportateurs
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#07101d]/95">
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-blue-300/80">Carte professionnelle</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Acces reserve aux membres Pro verifies</h2>
              <p className="mt-2 text-sm text-white/60">
                Debloquez la cartographie des bureaux d'achat verifies, exportateurs et zones de sourcing aurifere.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DirectoryList
          title="Contreparties verifiees"
          description="Bureaux d'achat verifies et contreparties pretes pour les operations en gros."
          items={(bureauxQuery.data?.items || []).slice(0, 4)}
        />
        <DirectoryList
          title="Exportateurs verifies"
          description="Acteurs capables de structurer les flux export et la conformite documentaire."
          items={(exportersQuery.data?.items || []).slice(0, 4)}
        />
      </div>
    </div>
  );
}

export function BdoEspaceProDashboardPage() {
  return (
    <ProShell
      title="Espace Pro"
      subtitle="Accedez a la cartographie des bureaux d'achat verifies, exportateurs et zones de sourcing aurifere."
    >
      <ProDashboardContent />
    </ProShell>
  );
}

export function BdoProMapPage() {
  const { isAuthenticated } = useSession();
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;
  const [types, setTypes] = useState<string[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [contactAvailable, setContactAvailable] = useState(false);
  const [wholesaleReady, setWholesaleReady] = useState(false);

  useEffect(() => {
    if (!summary?.map.defaultTypes?.length) return;
    const url = new URL(window.location.href);
    const requestedType = String(url.searchParams.get("type") || "").trim();
    if (requestedType) {
      setTypes((current) => (current.includes(requestedType) ? current : [requestedType]));
      return;
    }
    setTypes(summary.map.defaultTypes);
  }, [summary?.map.defaultTypes]);

  const params = useMemo(() => {
    const qs = new URLSearchParams();
    if (types.length) qs.set("types", types.join(","));
    if (verifiedOnly) qs.set("verifiedOnly", "1");
    if (contactAvailable) qs.set("contactAvailable", "1");
    if (wholesaleReady) qs.set("wholesaleReady", "1");
    return qs.toString();
  }, [contactAvailable, types, verifiedOnly, wholesaleReady]);

  const nodesQuery = useQuery<ProMapResponse>({
    queryKey: ["/api/v2/pro/map/nodes", params],
    enabled: Boolean(isAuthenticated && summary && !summary.map.locked),
    staleTime: 30_000,
    queryFn: () => apiRequest(`/api/v2/pro/map/nodes?${params}`),
  });

  return (
    <ProShell
      title={summary?.map.title || "Carte professionnelle"}
      subtitle={summary?.map.subtitle || "Visualisez les bureaux d'achat verifies, exportateurs et zones de sourcing."}
    >
      {!isAuthenticated ? (
        <AccessLock />
      ) : summary?.map.locked ? (
        <AccessLock message={summary.map.lockedMessage || "Acces reserve aux membres Pro verifies"} />
      ) : (
        <div className="space-y-4">
          {summary ? <ProStats summary={summary} /> : null}
          <Card className="border-white/10 bg-[#07101d]/95">
            <CardContent className="flex flex-wrap gap-2 p-4">
              {(summary?.map.defaultTypes || ["bureau_achat", "exporter", "mine", "association"]).map((type) => {
                const active = types.includes(type);
                return (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className={active ? "bg-amber-500 text-black hover:bg-amber-400" : "border-white/15 text-white hover:bg-white/10"}
                    onClick={() =>
                      setTypes((current) => (current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type]))
                    }
                  >
                    {type.replace(/_/g, " ")}
                  </Button>
                );
              })}
              <Button
                type="button"
                size="sm"
                variant={verifiedOnly ? "default" : "outline"}
                className={verifiedOnly ? "bg-emerald-500 text-black hover:bg-emerald-400" : "border-white/15 text-white hover:bg-white/10"}
                onClick={() => setVerifiedOnly((value) => !value)}
              >
                Verifies seulement
              </Button>
              <Button
                type="button"
                size="sm"
                variant={contactAvailable ? "default" : "outline"}
                className={contactAvailable ? "bg-sky-500 text-black hover:bg-sky-400" : "border-white/15 text-white hover:bg-white/10"}
                onClick={() => setContactAvailable((value) => !value)}
              >
                Contact disponible
              </Button>
              <Button
                type="button"
                size="sm"
                variant={wholesaleReady ? "default" : "outline"}
                className={wholesaleReady ? "bg-purple-500 text-black hover:bg-purple-400" : "border-white/15 text-white hover:bg-white/10"}
                onClick={() => setWholesaleReady((value) => !value)}
              >
                Pret pour le gros
              </Button>
            </CardContent>
          </Card>
          <MapCard nodes={nodesQuery.data?.items || []} summary={summary} interactive heightClass="h-[520px]" />
        </div>
      )}
    </ProShell>
  );
}

export function BdoProIntelligencePage() {
  const { isAuthenticated } = useSession();
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;

  return (
    <ProShell
      title="Intelligence Pro"
      subtitle="Marches, contreparties, zones actives et chaine export pour les acteurs auriferes verifies."
    >
      {!isAuthenticated ? (
        <AccessLock />
      ) : (
        <div className="space-y-4">
          {summary ? <ProStats summary={summary} /> : null}
          <div className="grid gap-4 xl:grid-cols-[1.3fr_minmax(0,1fr)]">
            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/80">Flux et contreparties</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Lecture rapide du reseau aurifere Pro</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    "Bureaux d'achat verifies accessibles via carte et annuaire.",
                    "Exportateurs et hubs logistiques relies aux parcours wholesale.",
                    "Visibilite graduelle des zones de sourcing selon le tier Pro.",
                    "Passerelle directe vers demandes d'offre et contacts verifies.",
                  ].map((item) => (
                    <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                      {item}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-blue-300/80">Conformite & sourcing</p>
                <div className="mt-4 space-y-3">
                  {[
                    "Regles de tracabilite pour les lots professionnels.",
                    "Acces graduel aux couches sensibles selon le tier Pro.",
                    "Cartographie des hubs export, logistique et contreparties verifiees.",
                    "Passerelle entre sourcing regional et execution wholesale.",
                  ].map((item) => (
                    <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                      {item}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </ProShell>
  );
}

export function BdoProBureauxPage() {
  const { isAuthenticated } = useSession();
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;
  const query = useDirectory(
    "/api/v2/pro/directory/bureaux-achat",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewBureauLayer),
  );

  return (
    <ProShell
      title="Bureaux d'achat verifies"
      subtitle="Identifiez des bureaux d'achat structures pour vos operations d'approvisionnement ou d'execution."
    >
      {!isAuthenticated ? (
        <AccessLock />
      ) : !summary ? (
        <AccessLock message="Chargement du profil Pro..." />
      ) : !directoryUnlocked(summary) || !summary.profile.canViewBureauLayer ? (
        <AccessLock message="Debloquez l'acces Pro pour consulter les bureaux d'achat verifies." />
      ) : (
        <DirectoryList
          title="Bureaux d'achat"
          description="Annuaire structure des contreparties professionnelles avec lien direct vers la carte."
          items={query.data?.items || []}
        />
      )}
    </ProShell>
  );
}

export function BdoProExportersPage() {
  const { isAuthenticated } = useSession();
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;
  const query = useDirectory(
    "/api/v2/pro/directory/exporters",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewExportLayer),
  );

  return (
    <ProShell
      title="Exportateurs verifies"
      subtitle="Consultez les acteurs verifies capables de structurer la conformite et l'expedition des flux professionnels."
    >
      {!isAuthenticated ? (
        <AccessLock />
      ) : !summary ? (
        <AccessLock message="Chargement du profil Pro..." />
      ) : !directoryUnlocked(summary) || !summary.profile.canViewExportLayer ? (
        <AccessLock message="Debloquez l'acces Pro pour consulter les exportateurs verifies." />
      ) : (
        <DirectoryList
          title="Exportateurs et hubs"
          description="Vue liste des exportateurs verifies et hubs export disponibles dans le reseau Pro."
          items={query.data?.items || []}
        />
      )}
    </ProShell>
  );
}

export function BdoProBuyersPage() {
  const { isAuthenticated } = useSession();
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;
  const bureauxQuery = useDirectory(
    "/api/v2/pro/directory/bureaux-achat",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewBureauLayer),
  );
  const exportersQuery = useDirectory(
    "/api/v2/pro/directory/exporters",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewExportLayer),
  );

  return (
    <ProShell
      title="Acheteurs internationaux"
      subtitle="Reperez les contreparties verifiees, comparez les hubs regionaux et ouvrez des demandes wholesale."
    >
      {!isAuthenticated ? (
        <AccessLock />
      ) : !summary ? (
        <AccessLock message="Chargement du profil Pro..." />
      ) : !directoryUnlocked(summary) ? (
        <AccessLock message="Debloquez l'acces Pro pour consulter les contreparties et les hubs export." />
      ) : (
        <div className="space-y-4">
          <ProStats summary={summary} />
          <div className="grid gap-4 xl:grid-cols-2">
            <DirectoryList
              title="Bureaux d'achat"
              description="Contreparties verifiees pour les flux d'approvisionnement en gros."
              items={(bureauxQuery.data?.items || []).slice(0, 8)}
            />
            <DirectoryList
              title="Exportateurs"
              description="Acteurs verifies pour la structuration des parcours export."
              items={(exportersQuery.data?.items || []).slice(0, 8)}
            />
          </div>
        </div>
      )}
    </ProShell>
  );
}
