import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type PmeLead = {
  id: string;
  name: string;
  category?: string | null;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  phone?: string | null;
  whatsapp_phone?: string | null;
  whatsappPhone?: string | null;
  website?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  rating?: string | number | null;
  review_count?: number | null;
  reviewCount?: number | null;
  source?: string | null;
  lead_status?: string | null;
  leadStatus?: string | null;
  qualification_score?: number | string | null;
  qualificationScore?: number | string | null;
  investment_potential_score?: number | string | null;
  revenue_visibility_score?: number | string | null;
  contact_status?: string | null;
  contactStatus?: string | null;
  metadata?: Record<string, unknown> | null;
};

type SummaryResponse = {
  ok: boolean;
  counts: Record<string, number | string | null>;
  byCity: Array<{ city: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  campaigns: { count: number };
  messages: { count: number };
};

type StatusResponse = {
  ok: boolean;
  tenant: { key: string; name: string };
  flags: Record<string, boolean>;
  google: {
    enabled: boolean;
    provider: string;
    apiKeyPresent: boolean;
    browserMapKeyPresent: boolean;
    mapIdPresent: boolean;
    setupRequired: boolean;
    placesSetupRequired?: boolean;
    mapSetupRequired?: boolean;
    advancedMapSetupRequired?: boolean;
    requiredEnv: string[];
    limits: { minute: { limit: number; used: number }; day: { limit: number; used: number } };
  };
  twilio: { configured: boolean; whatsappFromPresent: boolean; smsFromPresent: boolean; sandboxMode: boolean };
  compliance: Record<string, unknown>;
};

const tabs = [
  { href: "/admin/pme-exchange", label: "Dashboard", icon: Store },
  { href: "/admin/pme-exchange/map", label: "Map", icon: MapPin },
  { href: "/admin/pme-exchange/leads", label: "Leads", icon: Users },
  { href: "/admin/pme-exchange/import", label: "Import", icon: Search },
  { href: "/admin/pme-exchange/campaigns", label: "Campaigns", icon: MessageSquare },
  { href: "/admin/pme-exchange/conversations", label: "Conversations", icon: FileText },
  { href: "/admin/pme-exchange/profiles", label: "Profiles", icon: ShieldCheck },
  { href: "/admin/pme-exchange/audit", label: "Audit", icon: Clock },
];

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusOf(lead: PmeLead) {
  return String(lead.lead_status || lead.leadStatus || "new").replace(/_/g, " ");
}

function scoreOf(lead: PmeLead) {
  return n(lead.qualification_score ?? lead.qualificationScore);
}

function latLng(lead: PmeLead): [number, number] | null {
  const lat = n(lead.latitude);
  const lng = n(lead.longitude);
  if (!lat || !lng) return null;
  return [lat, lng];
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <Badge className={cn(active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-900 hover:bg-amber-100")}>
      {active ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
      {label}
    </Badge>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="min-h-screen bg-[#F7F8FA] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,.08)] lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-[#F5A623]">Exportunity</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">PME Exchange</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Discover SMEs, enrich public listings, score leads, draft compliant outreach, and prepare internal review profiles before any investment feature is exposed publicly.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = location === tab.href || (tab.href !== "/admin/pme-exchange" && location.startsWith(tab.href));
              return (
                <Link key={tab.href} href={tab.href}>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-10 rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      active && "border-[#F5A623] bg-[#F5A623] text-slate-950 hover:bg-[#F9A800]",
                    )}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {tab.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function PriorityCenter({ status, summary }: { status?: StatusResponse; summary?: SummaryResponse }) {
  const items = [
    {
      title: "Google Maps renderer",
      ok: Boolean(status?.google?.browserMapKeyPresent && !status?.google?.mapSetupRequired),
      body: status?.google?.browserMapKeyPresent
        ? "A browser Maps key is configured. If the public map says GOOGLE KEY REJECTED, fix domain/API restrictions in Google Cloud."
        : "Public maps are using OpenStreetMap until a browser-safe Google Maps key is configured.",
      action: "Open Google settings",
      href: "/admin/settings/integrations/google-maps",
    },
    {
      title: "Google Places API",
      ok: Boolean(status?.google?.enabled),
      body: status?.google?.enabled ? "Live Google business discovery is active." : "Marketplace and PME import are using curated city data until Google Places is configured.",
      action: status?.google?.enabled ? "Open Import" : "Configure Google",
      href: status?.google?.enabled ? "/admin/pme-exchange/import" : "/admin/settings/integrations/google-maps",
    },
    {
      title: "WhatsApp/Twilio",
      ok: Boolean(status?.twilio?.configured && status?.twilio?.whatsappFromPresent),
      body: status?.twilio?.configured ? "Messaging credentials are present. Outreach still requires approval." : "Twilio is not fully configured. Campaigns can draft messages only.",
      action: "Open Twilio settings",
      href: "/admin/settings/communications/twilio",
    },
    {
      title: "Lead coverage",
      ok: n(summary?.counts?.total) >= 100,
      body: `${n(summary?.counts?.total)} PME leads currently available across the exchange engine.`,
      action: "View Map",
      href: "/admin/pme-exchange/map",
    },
    {
      title: "Outreach governance",
      ok: true,
      body: "Test mode, approval-required messages, opt-out keywords, and no-night-contact policy are enabled.",
      action: "Audit",
      href: "/admin/pme-exchange/audit",
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {items.map((item) => (
        <Card key={item.title} className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="font-black text-slate-950">{item.title}</div>
              {item.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
            </div>
            <p className="mt-2 min-h-12 text-sm leading-relaxed text-slate-600">{item.body}</p>
            <Link href={item.href}>
              <Button variant="outline" className="mt-3 h-9 rounded-full border-slate-200 bg-white text-slate-800">
                {item.action}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LeadTable({ leads, selected, onToggle }: { leads: PmeLead[]; selected?: Set<string>; onToggle?: (id: string) => void }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-slate-950">PME leads</CardTitle>
      </CardHeader>
      <CardContent className="overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              {onToggle ? <th className="px-3 py-3">Select</th> : null}
              <th className="px-3 py-3">Business</th>
              <th className="px-3 py-3">City</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Contact</th>
              <th className="px-3 py-3">Score</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => (
              <tr key={lead.id} className="align-top">
                {onToggle ? (
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selected?.has(String(lead.id)) || false} onChange={() => onToggle(String(lead.id))} />
                  </td>
                ) : null}
                <td className="px-3 py-3">
                  <div className="font-black text-slate-950">{lead.name}</div>
                  <div className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{lead.address || lead.website || "Address pending enrichment"}</div>
                </td>
                <td className="px-3 py-3 text-slate-700">{lead.city || "-"}</td>
                <td className="px-3 py-3 text-slate-700">{lead.category || "-"}</td>
                <td className="px-3 py-3 text-slate-700">{lead.whatsapp_phone || lead.whatsappPhone || lead.phone || "Contact required"}</td>
                <td className="px-3 py-3">
                  <span className="rounded-full bg-[#F5A623]/15 px-3 py-1 text-xs font-black text-slate-950">{scoreOf(lead)}</span>
                </td>
                <td className="px-3 py-3">
                  <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{statusOf(lead)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function LeadMap({ leads }: { leads: PmeLead[] }) {
  const points = leads.map((lead) => ({ lead, point: latLng(lead) })).filter((entry): entry is { lead: PmeLead; point: [number, number] } => Boolean(entry.point));
  const center: [number, number] = points[0]?.point || [5.349, -4.017];
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <div className="h-[560px]">
        <MapContainer center={center} zoom={12} className="h-full w-full" zoomControl>
          <TileLayer attribution="&copy; OpenStreetMap &copy; CARTO" url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          {points.map(({ lead, point }) => (
            <CircleMarker
              key={lead.id}
              center={point}
              radius={Math.max(7, Math.min(18, scoreOf(lead) / 6))}
              pathOptions={{ color: "#F5A623", fillColor: scoreOf(lead) >= 78 ? "#10B981" : "#F5A623", fillOpacity: 0.78, weight: 2 }}
            >
              <Popup>
                <div className="w-[230px]">
                  <div className="font-black text-slate-950">{lead.name}</div>
                  <div className="mt-1 text-sm text-slate-600">{lead.category}</div>
                  <div className="mt-2 text-xs text-slate-500">{lead.city} - score {scoreOf(lead)}</div>
                  <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-950">Outreach requires approval. Public listing does not imply inventory or investment eligibility.</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </Card>
  );
}

export function AdminPmeExchangePage() {
  const [location] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const active = location === "/admin/pme-exchange" ? "dashboard" : location.split("/").pop() || "dashboard";
  const [city, setCity] = useState("Abidjan");
  const [query, setQuery] = useState("restaurants bakery cafe grocery pharmacy");
  const [kind, setKind] = useState("marketplace");
  const [previewItems, setPreviewItems] = useState<PmeLead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [campaignName, setCampaignName] = useState("PME intro test");
  const [placeId, setPlaceId] = useState("");

  const statusQuery = useQuery<StatusResponse>({ queryKey: ["/api/admin/pme-exchange/status"], staleTime: 15_000 });
  const summaryQuery = useQuery<SummaryResponse>({ queryKey: ["/api/admin/pme-exchange/summary"], staleTime: 15_000 });
  const leadsQuery = useQuery<{ ok: boolean; items: PmeLead[] }>({ queryKey: ["/api/admin/pme-exchange/leads?limit=160"], staleTime: 20_000 });
  const campaignsQuery = useQuery<{ ok: boolean; items: any[] }>({ queryKey: ["/api/admin/pme-exchange/campaigns"], staleTime: 20_000 });
  const conversationsQuery = useQuery<{ ok: boolean; items: any[] }>({ queryKey: ["/api/admin/pme-exchange/conversations"], staleTime: 20_000 });
  const profilesQuery = useQuery<{ ok: boolean; items: any[] }>({ queryKey: ["/api/admin/pme-exchange/profiles"], staleTime: 20_000 });
  const auditQuery = useQuery<{ ok: boolean; items: any[] }>({ queryKey: ["/api/admin/pme-exchange/audit"], staleTime: 20_000 });

  const leads = leadsQuery.data?.items ?? [];
  const selectedLeads = useMemo(() => leads.filter((lead) => selectedLeadIds.has(String(lead.id))), [leads, selectedLeadIds]);

  const previewMutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/pme-exchange/import/preview", "POST", { city, query, kind, limit: 30 }),
    onSuccess: (data: any) => {
      setPreviewItems(data?.items || []);
      toast({ title: "Preview ready", description: data?.provider === "google_places" ? "Google Places results loaded." : "Curated city results loaded." });
    },
    onError: (err: any) => toast({ title: "Preview failed", description: err?.message || "Unable to preview import", variant: "destructive" }),
  });

  const savePreviewMutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/pme-exchange/import/save", "POST", { items: previewItems }),
    onSuccess: async (data: any) => {
      toast({ title: "Leads saved", description: `${data?.savedCount || 0} PME leads saved.` });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/pme-exchange/leads?limit=160"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/pme-exchange/summary"] });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message || "Unable to save leads", variant: "destructive" }),
  });

  const testSearchMutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/pme-exchange/google/test-search", "POST", { city, query }),
    onSuccess: (data: any) => {
      setPreviewItems(data?.items || []);
      toast({ title: data?.configured ? "Google Places connected" : "Using curated fallback", description: data?.message || "Search completed." });
    },
    onError: (err: any) => toast({ title: "Google test failed", description: err?.message || "Unable to test Google Places", variant: "destructive" }),
  });

  const testDetailsMutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/pme-exchange/google/test-details", "POST", { placeId }),
    onSuccess: (data: any) => {
      setPreviewItems(data?.item ? [data.item] : []);
      toast({ title: "Place details loaded" });
    },
    onError: (err: any) => toast({ title: "Details failed", description: err?.message || "Unable to load Place Details", variant: "destructive" }),
  });

  const campaignMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/pme-exchange/campaigns/test", "POST", {
        name: campaignName,
        leadIds: Array.from(selectedLeadIds).slice(0, 10),
        templateName: "pme_intro_fr",
      }),
    onSuccess: async (data: any) => {
      toast({ title: "Test campaign drafted", description: data?.message || "Messages require approval before sending." });
      setSelectedLeadIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/pme-exchange/campaigns"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/pme-exchange/audit"] });
    },
    onError: (err: any) => toast({ title: "Campaign failed", description: err?.message || "Unable to create campaign", variant: "destructive" }),
  });

  const approveSendMutation = useMutation({
    mutationFn: async (messageId: string) => apiRequest(`/api/admin/pme-exchange/campaigns/messages/${messageId}/approve-send`, "POST", {}),
    onSuccess: async (data: any) => {
      toast({
        title: data?.sent ? "Outreach sent" : "Outreach blocked",
        description: data?.message || (data?.sent ? "WhatsApp delivery was queued." : "Setup or compliance gate blocked delivery."),
        variant: data?.sent ? "default" : "destructive",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/pme-exchange/campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/pme-exchange/audit"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/pme-exchange/conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/pme-exchange/leads?limit=160"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/pme-exchange/summary"] }),
      ]);
    },
    onError: (err: any) => toast({ title: "Approval failed", description: err?.message || "Unable to approve outreach", variant: "destructive" }),
  });

  const toggleLead = (id: string) => {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id);
      return next;
    });
  };

  return (
    <Shell>
      <PriorityCenter status={statusQuery.data} summary={summaryQuery.data} />

      {active === "dashboard" || active === "pme-exchange" ? (
        <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-950">Exchange snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Total leads", summaryQuery.data?.counts?.total],
                ["Qualified", summaryQuery.data?.counts?.qualified],
                ["Contacted", summaryQuery.data?.counts?.contacted],
                ["Interested", summaryQuery.data?.counts?.interested],
                ["Campaigns", summaryQuery.data?.campaigns?.count],
                ["Messages", summaryQuery.data?.messages?.count],
                ["Replies", summaryQuery.data?.counts?.replies],
                ["Onboarded", summaryQuery.data?.counts?.onboarded],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>
                  <div className="mt-2 text-3xl font-black text-slate-950">{n(value)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-950">Google / Twilio status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <StatusBadge active={Boolean(statusQuery.data?.google?.enabled)} label={statusQuery.data?.google?.enabled ? "Google Places live" : "Google setup required"} />
                <StatusBadge active={Boolean(statusQuery.data?.twilio?.configured)} label={statusQuery.data?.twilio?.configured ? "Twilio configured" : "Twilio setup required"} />
                <StatusBadge active label="Approval gates active" />
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">
                Public investment offers remain disabled. PME Exchange profiles are internal review records until legal/compliance approval.
              </div>
            </CardContent>
          </Card>
          <div className="lg:col-span-2">
            <LeadTable leads={leads.slice(0, 12)} />
          </div>
        </div>
      ) : null}

      {active === "map" ? <LeadMap leads={leads} /> : null}

      {active === "leads" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Select up to 10 qualified leads to draft a safe test WhatsApp campaign. Nothing is sent without approval.
          </div>
          <LeadTable leads={leads} selected={selectedLeadIds} onToggle={toggleLead} />
          {selectedLeadIds.size ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-black text-slate-950">{selectedLeadIds.size} selected leads</div>
                  <div className="text-sm text-slate-500">{selectedLeads.map((lead) => lead.name).slice(0, 3).join(", ")}</div>
                </div>
                <div className="flex gap-2">
                  <Input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} className="w-64 border-slate-200 bg-white text-slate-950" />
                  <Button className="bg-[#F5A623] font-black text-slate-950 hover:bg-[#F9A800]" onClick={() => campaignMutation.mutate()} disabled={campaignMutation.isPending}>
                    Draft test campaign
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {active === "import" ? (
        <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-950">Google Places / curated import</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-slate-700">City</Label>
                  <Input value={city} onChange={(event) => setCity(event.target.value)} className="mt-1 border-slate-200 bg-white text-slate-950" />
                </div>
                <div>
                  <Label className="text-slate-700">Layer</Label>
                  <Input value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1 border-slate-200 bg-white text-slate-950" />
                </div>
              </div>
              <div>
                <Label className="text-slate-700">Search query</Label>
                <Textarea value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 min-h-24 border-slate-200 bg-white text-slate-950" />
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input value={placeId} onChange={(event) => setPlaceId(event.target.value)} placeholder="Google place id for details test" className="border-slate-200 bg-white text-slate-950" />
                <Button variant="outline" className="border-slate-200 bg-white text-slate-900" onClick={() => testDetailsMutation.mutate()} disabled={!placeId.trim() || testDetailsMutation.isPending}>
                  Test details
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="bg-[#F5A623] font-black text-slate-950 hover:bg-[#F9A800]" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                  <Search className="mr-2 h-4 w-4" />
                  Preview import
                </Button>
                <Button variant="outline" className="border-slate-200 bg-white text-slate-900" onClick={() => testSearchMutation.mutate()} disabled={testSearchMutation.isPending}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Test Places Search
                </Button>
                <Button variant="outline" className="border-slate-200 bg-white text-slate-900" onClick={() => savePreviewMutation.mutate()} disabled={!previewItems.length || savePreviewMutation.isPending}>
                  Save preview
                </Button>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                Required server env: {(statusQuery.data?.google?.requiredEnv || []).join(", ")}. API keys stay server-side and are never printed in full.
              </div>
            </CardContent>
          </Card>
          <LeadTable leads={previewItems} />
        </div>
      ) : null}

      {active === "campaigns" ? (
        <div className="grid gap-4">
          {(campaignsQuery.data?.items || []).map((campaign) => (
            <Card key={campaign.id} className="border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-black text-slate-950">{campaign.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {campaign.status} - daily limit {campaign.daily_limit || campaign.dailyLimit} - {campaign.messages_count || 0} drafted messages
                    </div>
                  </div>
                  <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Approval required</Badge>
                </div>

                <div className="grid gap-3">
                  {(auditQuery.data?.items || [])
                    .filter((message) => String(message.campaign_id || "") === String(campaign.id))
                    .slice(0, 8)
                    .map((message) => {
                      const canApprove = ["approval_required", "draft", "setup_required", "send_blocked", "send_failed"].includes(String(message.status || ""));
                      return (
                        <div key={message.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="font-bold text-slate-950">{message.lead_name}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {message.channel} - {message.template_name || "pme_intro_fr"} - {message.status}
                              </div>
                              <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-700">{message.message_body}</p>
                              {message.error_message ? (
                                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
                                  {message.error_code ? `${message.error_code}: ` : ""}
                                  {message.error_message}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Badge className={cn(message.status === "sent" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700", "hover:bg-inherit")}>
                                {message.status}
                              </Badge>
                              {canApprove ? (
                                <Button
                                  className="h-9 rounded-full bg-[#F5A623] px-4 font-black text-slate-950 hover:bg-[#F9A800]"
                                  onClick={() => approveSendMutation.mutate(String(message.id))}
                                  disabled={approveSendMutation.isPending}
                                >
                                  Approve/send
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {active === "conversations" ? (
        <div className="grid gap-4">
          {(conversationsQuery.data?.items || []).map((item) => (
            <Card key={item.lead_id} className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-slate-950">{item.name}</div>
                    <div className="mt-1 text-sm text-slate-500">{item.city} - {item.category} - {item.message_count || 0} messages</div>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{item.lead_status}</Badge>
                </div>
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{item.summary || "No inbound conversation yet. First outreach must be approved before sending."}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {active === "profiles" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          {(profilesQuery.data?.items || []).length ? (
            <LeadTable leads={(profilesQuery.data?.items || []).map((profile) => ({ ...profile, id: profile.pme_lead_id, name: profile.company_name || profile.name }))} />
          ) : (
            "No PME Exchange profiles have been promoted to internal review yet. Qualified/onboarded leads will appear here."
          )}
        </div>
      ) : null}

      {active === "audit" ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-950">Outreach audit log</CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">When</th>
                  <th className="px-3 py-3">Lead</th>
                  <th className="px-3 py-3">Campaign</th>
                  <th className="px-3 py-3">Channel</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(auditQuery.data?.items || []).map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3 text-slate-600">{item.created_at ? new Date(item.created_at).toLocaleString() : "-"}</td>
                    <td className="px-3 py-3 font-semibold text-slate-950">{item.lead_name}</td>
                    <td className="px-3 py-3 text-slate-600">{item.campaign_name || "-"}</td>
                    <td className="px-3 py-3 text-slate-600">{item.channel}</td>
                    <td className="px-3 py-3"><Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">{item.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </Shell>
  );
}

export default AdminPmeExchangePage;
