import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, ExternalLink, MapPin, RefreshCw, Search, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type PlacesConfig = {
  provider: "google" | "leaflet";
  enabled: boolean;
  browserApiKey?: string | null;
  mapRenderer?: "google_maps" | "leaflet_openstreetmap";
  businessDataProvider?: "google_places" | "curated_city_data";
  placesImportEnabled?: boolean;
  mapId?: string | null;
  mapIdLight?: string | null;
  mapIdDark?: string | null;
  google?: {
    enabled?: boolean;
    placesApiKeyPresent?: boolean;
    browserApiKeyPresent?: boolean;
    mapIdPresent?: boolean;
    setupRequired?: boolean;
    placesSetupRequired?: boolean;
    mapSetupRequired?: boolean;
    requiredEnv?: string[];
  };
  message?: string;
};

type TestResult = {
  configured?: boolean;
  provider?: string;
  message?: string;
  items?: Array<{ id?: string; name: string; city?: string; category?: string; address?: string; rating?: number | string }>;
  item?: { id?: string; name: string; city?: string; category?: string; address?: string; rating?: number | string };
};

type GoogleSettingsResponse = {
  ok: boolean;
  scope: string;
  saved: {
    enabled: boolean;
    placesApiKeyPresent: boolean;
    browserApiKeyPresent: boolean;
    placesApiKeyMasked?: string | null;
    browserApiKeyMasked?: string | null;
    mapId?: string | null;
    mapIdLight?: string | null;
    mapIdDark?: string | null;
    defaultCountry?: string;
    defaultCity?: string;
    defaultLanguage?: string;
    radiusMeters?: number;
    dailyImportLimit?: number;
    rateLimitPerMinute?: number;
    updatedAt?: string | null;
  };
  runtime: PlacesConfig["google"] & {
    source?: string;
    defaultCountry?: string;
    defaultCity?: string;
    defaultLanguage?: string;
    radiusMeters?: number;
    dailyImportLimit?: number;
    rateLimitPerMinute?: number;
  };
  message?: string;
};

function maskKey(value?: string | null) {
  if (!value) return "Not configured";
  if (value.length <= 10) return "Configured";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function StatusRow({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div>
        <div className="text-sm font-black text-slate-950">{label}</div>
        <div className="mt-0.5 text-xs text-slate-500">{value}</div>
      </div>
      {ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
    </div>
  );
}

export default function AdminGooglePlacesIntegrationPage() {
  const { toast } = useToast();
  const [city, setCity] = useState("Abidjan");
  const [country, setCountry] = useState("CI");
  const [enabled, setEnabled] = useState(false);
  const [placesApiKey, setPlacesApiKey] = useState("");
  const [browserApiKey, setBrowserApiKey] = useState("");
  const [mapId, setMapId] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("fr");
  const [radiusMeters, setRadiusMeters] = useState("7500");
  const [dailyImportLimit, setDailyImportLimit] = useState("500");
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState("20");
  const [query, setQuery] = useState("restaurants bakery cafe grocery pharmacy");
  const [placeId, setPlaceId] = useState("");
  const [lastResult, setLastResult] = useState<TestResult | null>(null);

  const configQuery = useQuery<PlacesConfig>({
    queryKey: ["/api/places/config"],
    staleTime: 15_000,
  });

  const settingsQuery = useQuery<GoogleSettingsResponse>({
    queryKey: ["/api/admin/pme-exchange/google/settings"],
    staleTime: 15_000,
  });

  useEffect(() => {
    const saved = settingsQuery.data?.saved;
    if (!saved) return;
    setEnabled(Boolean(saved.enabled));
    setCountry(saved.defaultCountry || "CI");
    setCity(saved.defaultCity || "Abidjan");
    setDefaultLanguage(saved.defaultLanguage || "fr");
    setMapId(saved.mapId || saved.mapIdLight || "");
    setRadiusMeters(String(saved.radiusMeters || 7500));
    setDailyImportLimit(String(saved.dailyImportLimit || 500));
    setRateLimitPerMinute(String(saved.rateLimitPerMinute || 20));
  }, [settingsQuery.data?.saved]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/pme-exchange/google/settings", "PUT", {
        enabled,
        placesApiKey,
        browserApiKey,
        mapId,
        mapIdLight: mapId,
        mapIdDark: mapId,
        defaultCountry: country,
        defaultCity: city,
        defaultLanguage,
        radiusMeters: Number(radiusMeters),
        dailyImportLimit: Number(dailyImportLimit),
        rateLimitPerMinute: Number(rateLimitPerMinute),
      }),
    onSuccess: async (data: GoogleSettingsResponse) => {
      setPlacesApiKey("");
      setBrowserApiKey("");
      setLastResult(data as any);
      await Promise.all([settingsQuery.refetch(), configQuery.refetch()]);
      toast({
        title: "Google settings saved",
        description: data?.message || "Runtime status refreshed.",
      });
    },
    onError: (err: any) => toast({ title: "Google settings failed", description: err?.message || "Unable to save Google settings.", variant: "destructive" }),
  });

  const testSearchMutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/pme-exchange/google/test-search", "POST", { city, query }),
    onSuccess: (data: TestResult) => {
      setLastResult(data);
      toast({
        title: data?.configured ? "Google Places connected" : "Using curated fallback",
        description: data?.message || "Search completed.",
      });
    },
    onError: (err: any) => toast({ title: "Google test failed", description: err?.message || "Unable to test Google Places.", variant: "destructive" }),
  });

  const testDetailsMutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/pme-exchange/google/test-details", "POST", { placeId }),
    onSuccess: (data: TestResult) => {
      setLastResult(data);
      toast({ title: "Place details test complete", description: data?.message || data?.item?.name || "Details loaded." });
    },
    onError: (err: any) => toast({ title: "Place details failed", description: err?.message || "Unable to load Place Details.", variant: "destructive" }),
  });

  const config = configQuery.data;
  const google = settingsQuery.data?.runtime || config?.google;
  const saved = settingsQuery.data?.saved;
  const requiredEnv = google?.requiredEnv || [];
  const resultItems = lastResult?.items || (lastResult?.item ? [lastResult.item] : []);

  return (
    <div className="min-h-screen bg-[#F7F8FA] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.28em] text-[#F5A623]">Settings / Integrations</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Google Maps / Places</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                Configure the real Google Maps renderer and official Google Places lead engine for Exportunity marketplace, wholesale, and export-ready seller discovery. Maps rendering and Places import are separate: the map needs a browser key plus map ID; Places import needs a server Places key.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/pme-exchange/import">
                <Button className="bg-[#F5A623] font-black text-slate-950 hover:bg-[#F9A800]">Open lead import</Button>
              </Link>
              <a href="https://developers.google.com/maps/documentation/places/web-service/overview" target="_blank" rel="noreferrer">
                <Button variant="outline" className="border-slate-200 bg-white text-slate-800">
                  Docs <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-slate-950">
                Runtime status
                <Badge className={google?.enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}>
                  {config?.provider === "google" ? "Maps live" : google?.enabled ? "Places live" : "Setup required"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusRow ok={config?.provider === "google"} label="Map renderer" value={config?.provider === "google" ? "Google Maps browser renderer active" : "Leaflet/OpenStreetMap fallback active until browser key + map ID are configured"} />
              <StatusRow ok={Boolean(config?.placesImportEnabled)} label="Business data source" value={config?.placesImportEnabled ? "Google Places import active" : "Curated city data active until server Places key + enable flag are configured"} />
              <StatusRow ok={Boolean(google?.browserApiKeyPresent)} label="Browser Maps key" value={saved?.browserApiKeyMasked || maskKey(config?.browserApiKey)} />
              <StatusRow ok={Boolean(google?.placesApiKeyPresent)} label="Server Places key" value={saved?.placesApiKeyMasked || (google?.placesApiKeyPresent ? "Present in runtime configuration" : "Missing: GOOGLE_PLACES_API_KEY or saved admin key")} />
              <StatusRow ok={Boolean(google?.mapIdPresent)} label="Cloud map ID" value={saved?.mapId || config?.mapId || "Required for Google Advanced Markers"} />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
                {config?.message || "Google configuration status is loading."}
              </div>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-900" onClick={() => configQuery.refetch()} disabled={configQuery.isFetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${configQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh status
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-950">Production setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-slate-700">Default country</Label>
                  <Input value={country} onChange={(event) => setCountry(event.target.value)} className="mt-1 border-slate-200 bg-white text-slate-950" />
                </div>
                <div>
                  <Label className="text-slate-700">Default city</Label>
                  <Input value={city} onChange={(event) => setCity(event.target.value)} className="mt-1 border-slate-200 bg-white text-slate-950" />
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">
                Server Places keys are saved masked and are never returned to the browser. Browser Maps keys are public by design and must be restricted by domain in Google Cloud. A browser key plus map ID can activate Google Maps even before Places import is enabled.
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900">
                  <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                  Enable Google Places
                </label>
                <div>
                  <Label className="text-slate-700">Language</Label>
                  <Input value={defaultLanguage} onChange={(event) => setDefaultLanguage(event.target.value)} className="mt-1 border-slate-200 bg-white text-slate-950" />
                </div>
                <div>
                  <Label className="text-slate-700">Server Places API key</Label>
                  <Input value={placesApiKey} onChange={(event) => setPlacesApiKey(event.target.value)} placeholder={saved?.placesApiKeyMasked || "GOOGLE_PLACES_API_KEY"} className="mt-1 border-slate-200 bg-white text-slate-950" />
                </div>
                <div>
                  <Label className="text-slate-700">Browser Maps API key</Label>
                  <Input value={browserApiKey} onChange={(event) => setBrowserApiKey(event.target.value)} placeholder={saved?.browserApiKeyMasked || "GOOGLE_MAPS_BROWSER_API_KEY"} className="mt-1 border-slate-200 bg-white text-slate-950" />
                </div>
                <div>
                  <Label className="text-slate-700">Google Cloud map ID</Label>
                  <Input value={mapId} onChange={(event) => setMapId(event.target.value)} placeholder="Required for styled Google map markers" className="mt-1 border-slate-200 bg-white text-slate-950" />
                </div>
                <div>
                  <Label className="text-slate-700">Search radius meters</Label>
                  <Input value={radiusMeters} onChange={(event) => setRadiusMeters(event.target.value)} className="mt-1 border-slate-200 bg-white text-slate-950" />
                </div>
                <div>
                  <Label className="text-slate-700">Daily import limit</Label>
                  <Input value={dailyImportLimit} onChange={(event) => setDailyImportLimit(event.target.value)} className="mt-1 border-slate-200 bg-white text-slate-950" />
                </div>
                <div>
                  <Label className="text-slate-700">Rate limit per minute</Label>
                  <Input value={rateLimitPerMinute} onChange={(event) => setRateLimitPerMinute(event.target.value)} className="mt-1 border-slate-200 bg-white text-slate-950" />
                </div>
              </div>
              <Button className="bg-[#F5A623] font-black text-slate-950 hover:bg-[#F9A800]" onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Save Google settings
              </Button>
              <div className="grid gap-2 md:grid-cols-2">
                {requiredEnv.map((key) => (
                  <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{key}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-950">Test official Places search</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-slate-700">Search query</Label>
                <Textarea value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 min-h-24 border-slate-200 bg-white text-slate-950" />
              </div>
              <div>
                <Label className="text-slate-700">Place ID for details test</Label>
                <Input value={placeId} onChange={(event) => setPlaceId(event.target.value)} className="mt-1 border-slate-200 bg-white text-slate-950" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="bg-[#F5A623] font-black text-slate-950 hover:bg-[#F9A800]" onClick={() => testSearchMutation.mutate()} disabled={testSearchMutation.isPending}>
                  <Search className="mr-2 h-4 w-4" />
                  Test Places Search
                </Button>
                <Button variant="outline" className="border-slate-200 bg-white text-slate-900" onClick={() => testDetailsMutation.mutate()} disabled={!placeId.trim() || testDetailsMutation.isPending}>
                  <MapPin className="mr-2 h-4 w-4" />
                  Test Place Details
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <ShieldCheck className="h-5 w-5 text-[#F5A623]" />
                Test result preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lastResult ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
                  Provider: <span className="font-black text-slate-950">{lastResult.provider || (lastResult.configured ? "google_places" : "curated")}</span>. {lastResult.message}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Run a search or details test to preview the business data source.</div>
              )}
              <div className="max-h-[360px] overflow-auto rounded-2xl border border-slate-200">
                {resultItems.length ? (
                  resultItems.slice(0, 12).map((item) => (
                    <div key={item.id || item.name} className="border-b border-slate-100 p-3 last:border-b-0">
                      <div className="font-black text-slate-950">{item.name}</div>
                      <div className="mt-1 text-sm text-slate-600">{item.category || "Category pending"} - {item.city || city}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.address || "Address pending"}</div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-sm text-slate-500">No preview results yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
