import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Factory,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  UploadCloud,
  Users,
} from "lucide-react";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type ProspectRole =
  | "industrial_buyer"
  | "manufacturer"
  | "inventory_partner"
  | "technical_supplier"
  | "logistics_partner"
  | "institutional_partner";

type Prospect = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  primaryIndustry: string;
  roles: ProspectRole[];
  sourceType: "official_registry" | "industry_directory";
  sourceName: string;
  sourceTitle: string;
  sourceUrl: string;
  evidenceStatus: string;
  evidenceSummary: string;
  checkedAt: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  approvedInvestmentFcfa: number | null;
  opportunityHypotheses: string[];
  importableAsFactoryLead: boolean;
  verificationRequired: boolean;
  outreachAllowed: boolean;
};

type ProspectPreview = {
  ok: boolean;
  checkedAt: string;
  summary: {
    total: number;
    importableFactoryLeads: number;
    gdizApproved: number;
    logisticsPartners: number;
    institutionalPartners: number;
  };
  prospects: Prospect[];
  message: string;
};

type FactoryLead = {
  id: string;
  source: string;
  name: string;
  primaryIndustry: string | null;
  city: string | null;
  leadStatus: string;
  qualificationScore: number;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceStatus: string | null;
  evidenceSummary: string | null;
  roles: string[];
  outreachAllowed: boolean;
};

type FactoryLeadResponse = {
  ok: boolean;
  leads: FactoryLead[];
  total: number;
};

const ROLE_LABELS: Record<ProspectRole, string> = {
  industrial_buyer: "Industrial buyer",
  manufacturer: "Manufacturer",
  inventory_partner: "Inventory partner",
  technical_supplier: "Technical supplier",
  logistics_partner: "Logistics",
  institutional_partner: "Institution",
};

const FILTERS: Array<{ id: "all" | ProspectRole; label: string }> = [
  { id: "all", label: "All actors" },
  { id: "industrial_buyer", label: "Industrial buyers" },
  { id: "manufacturer", label: "Manufacturers" },
  { id: "inventory_partner", label: "Inventory partners" },
  { id: "logistics_partner", label: "Logistics" },
  { id: "institutional_partner", label: "Institutions" },
];

function formatFcfa(value: number | null) {
  if (!value) return null;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;
}

function readableStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function SourceBadge({ prospect }: { prospect: Prospect }) {
  const official = prospect.sourceType === "official_registry";
  return (
    <Badge
      variant="outline"
      className={
        official
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-700"
      }
    >
      {official ? "Official registry" : "Industry source"}
    </Badge>
  );
}

export default function AdminIndustrialNetworkPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | ProspectRole>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const previewQuery = useQuery<ProspectPreview>({
    queryKey: ["/api/industrial/admin/factory-leads/benin-official-preview"],
    staleTime: 60 * 60 * 1000,
  });

  const leadsQuery = useQuery<FactoryLeadResponse>({
    queryKey: ["/api/industrial/admin/factory-leads?limit=100&countryCode=BJ"],
    staleTime: 15_000,
  });

  const importMutation = useMutation({
    mutationFn: async () =>
      apiRequest(
        "/api/industrial/admin/factory-leads/benin-official-import",
        "POST",
        { selectedProspectIds: Array.from(selected) },
      ),
    onSuccess: async (result: any) => {
      setSelected(new Set());
      await queryClient.invalidateQueries({
        queryKey: ["/api/industrial/admin/factory-leads?limit=100&countryCode=BJ"],
      });
      toast({
        title: "Private review queue updated",
        description: `${Number(result?.created || 0)} created, ${Number(result?.refreshed || 0)} refreshed. No outreach was sent.`,
      });
    },
    onError: (error: any) =>
      toast({
        title: "Import could not be completed",
        description: error?.message || "Review the selection and try again.",
        variant: "destructive",
      }),
  });

  const reviewMutation = useMutation({
    mutationFn: async (input: { leadId: string; leadStatus: string }) =>
      apiRequest(
        `/api/industrial/admin/factory-leads/${input.leadId}/review`,
        "PATCH",
        {
          leadStatus: input.leadStatus,
          screeningNotes:
            input.leadStatus === "qualified"
              ? "Qualified from the Industrial Network review workspace. Contact and publication remain separately approval-gated."
              : "Review status updated from the Industrial Network workspace.",
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["/api/industrial/admin/factory-leads?limit=100&countryCode=BJ"],
      });
      toast({
        title: "Review status saved",
        description: "The lead remains private and outreach is still blocked.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Review could not be saved",
        description: error?.message || "Try again.",
        variant: "destructive",
      }),
  });

  const prospects = previewQuery.data?.prospects || [];
  const filteredProspects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return prospects.filter((item) => {
      const matchesRole = roleFilter === "all" || item.roles.includes(roleFilter);
      const matchesQuery =
        !needle ||
        [item.name, item.city, item.district, item.primaryIndustry, item.sourceName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return matchesRole && matchesQuery;
    });
  }, [prospects, query, roleFilter]);

  const importableVisible = filteredProspects.filter(
    (item) => item.importableAsFactoryLead,
  );
  const allVisibleSelected =
    importableVisible.length > 0 &&
    importableVisible.every((item) => selected.has(item.id));

  const toggleVisible = () => {
    const next = new Set(selected);
    if (allVisibleSelected) {
      for (const item of importableVisible) next.delete(item.id);
    } else {
      for (const item of importableVisible) next.add(item.id);
    }
    setSelected(next);
  };

  const summary = previewQuery.data?.summary;
  const leads = leadsQuery.data?.leads || [];

  return (
    <main className="min-h-screen bg-[#F7F8FA] text-slate-950">
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-[#9A6700]">
              <Network className="h-4 w-4" />
              Exportunity Industrial OS
            </div>
            <h1 className="text-3xl font-black tracking-normal text-[#07121F] sm:text-4xl">
              Industrial Network
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Qualify Benin factories, industrial buyers, technical suppliers and
              logistics partners from cited sources before any contact or public
              publication.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-slate-300 bg-white text-slate-800"
              onClick={() => {
                previewQuery.refetch();
                leadsQuery.refetch();
              }}
              disabled={previewQuery.isFetching || leadsQuery.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${previewQuery.isFetching || leadsQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refresh evidence
            </Button>
            <Button asChild variant="outline" className="border-slate-300 bg-white text-slate-800">
              <Link href="/admin/settings/integrations/google-maps">
                <Search className="mr-2 h-4 w-4" />
                Google discovery
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Industrial network coverage">
          {[
            { label: "Sourced actors", value: summary?.total || 0, icon: Building2 },
            { label: "Factory-lead eligible", value: summary?.importableFactoryLeads || 0, icon: Factory },
            { label: "GDIZ approved", value: summary?.gdizApproved || 0, icon: ShieldCheck },
            { label: "Logistics partners", value: summary?.logisticsPartners || 0, icon: Truck },
            { label: "Institutions", value: summary?.institutionalPartners || 0, icon: Users },
          ].map((item) => (
            <Card key={item.label} className="rounded-lg border-slate-200 bg-white shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFF6E2] text-[#9A6700]">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[#07121F]">{item.value}</div>
                  <div className="text-xs font-semibold text-slate-500">{item.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#9A6700]" />
            <div>
              <div className="font-black">Governed discovery, not automatic outreach</div>
              <p className="mt-1 leading-6">
                This is an initial source-backed universe, not a claim of an exhaustive legal registry.
                Import creates a private lead only. Every company still requires contact verification,
                relevance screening and separate approval before email, WhatsApp, publication or sales activity.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-black text-[#07121F]">Sourced prospect universe</h2>
              <p className="mt-1 text-sm text-slate-500">
                Evidence checked {previewQuery.data?.checkedAt || "for this release"}. Open a source before qualification.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search company, city or industry"
                  className="border-slate-300 bg-white pl-9 text-slate-950"
                />
              </div>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={!selected.size || importMutation.isPending}
                className="bg-[#E2A416] font-black text-[#07121F] hover:bg-[#C98F12]"
              >
                <UploadCloud className="mr-2 h-4 w-4" />
                Import selected ({selected.size})
              </Button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 p-3">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setRoleFilter(filter.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  roleFilter === filter.id
                    ? "border-[#E2A416] bg-[#FFF6E2] text-[#704700]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {previewQuery.isLoading ? (
            <div className="flex min-h-56 items-center justify-center gap-3 text-sm font-semibold text-slate-500">
              <RefreshCw className="h-5 w-5 animate-spin" /> Loading cited industrial sources...
            </div>
          ) : previewQuery.isError ? (
            <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
              The sourced prospect universe could not be loaded. Confirm the Exportunity tenant and staff session.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all visible importable prospects"
                        checked={allVisibleSelected}
                        onChange={toggleVisible}
                        className="h-4 w-4 accent-[#E2A416]"
                      />
                    </th>
                    <th className="px-3 py-3">Company and location</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Evidence</th>
                    <th className="px-3 py-3">Commercial hypothesis</th>
                    <th className="px-3 py-3">Governance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProspects.map((item) => {
                    const investment = formatFcfa(item.approvedInvestmentFcfa);
                    return (
                      <tr key={item.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                        <td className="px-4 py-4">
                          {item.importableAsFactoryLead ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${item.name}`}
                              checked={selected.has(item.id)}
                              onChange={() => {
                                const next = new Set(selected);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                setSelected(next);
                              }}
                              className="h-4 w-4 accent-[#E2A416]"
                            />
                          ) : (
                            <span className="block h-4 w-4 rounded-full border border-slate-300 bg-slate-100" title="Planning actor; not a factory lead" />
                          )}
                        </td>
                        <td className="max-w-[270px] px-3 py-4">
                          <div className="font-black text-[#07121F]">{item.name}</div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {item.primaryIndustry}<br />
                            {[item.district, item.city].filter(Boolean).join(" / ")}
                          </div>
                          {investment ? (
                            <div className="mt-2 text-xs font-bold text-[#9A6700]">
                              Approved investment: {investment}
                            </div>
                          ) : null}
                        </td>
                        <td className="max-w-[220px] px-3 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {item.roles.map((role) => (
                              <Badge key={role} variant="outline" className="border-slate-200 bg-white text-slate-700">
                                {ROLE_LABELS[role]}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="max-w-[320px] px-3 py-4">
                          <div className="mb-2 flex items-center gap-2">
                            <SourceBadge prospect={item} />
                            <span className="text-xs font-semibold text-slate-500">
                              {readableStatus(item.evidenceStatus)}
                            </span>
                          </div>
                          <p className="text-xs leading-5 text-slate-600">{item.evidenceSummary}</p>
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#7A5200] hover:underline"
                          >
                            {item.sourceName} <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                        <td className="max-w-[300px] px-3 py-4">
                          <ul className="space-y-1.5 text-xs leading-5 text-slate-600">
                            {item.opportunityHypotheses.slice(0, 3).map((hypothesis) => (
                              <li key={hypothesis} className="flex gap-2">
                                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#E2A416]" />
                                <span>{hypothesis}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="max-w-[190px] px-3 py-4">
                          <div className="flex items-start gap-2 text-xs leading-5 text-slate-600">
                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <span>
                              {item.importableAsFactoryLead
                                ? "Private review eligible"
                                : "Planning relationship only"}
                            </span>
                          </div>
                          <div className="mt-2 text-xs font-bold text-rose-700">Outreach blocked</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!filteredProspects.length ? (
                <div className="p-8 text-center text-sm text-slate-500">No sourced actor matches these filters.</div>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-[#07121F]">Private qualification queue</h2>
              <p className="mt-1 text-sm text-slate-500">
                Imported sources are evidence, not verified inventory. Staff controls each status transition.
              </p>
            </div>
            <Badge variant="outline" className="w-fit border-slate-200 bg-slate-50 text-slate-700">
              {leads.length} Benin leads
            </Badge>
          </div>
          {leadsQuery.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading private queue...
            </div>
          ) : leads.length ? (
            <div className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <div key={lead.id} className="grid gap-3 p-4 lg:grid-cols-[1.5fr_1fr_140px_220px] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-[#07121F]">{lead.name}</span>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        {lead.sourceName || readableStatus(lead.source)}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {lead.primaryIndustry || "Industry review required"} / {lead.city || "Location review required"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500">Qualification score</div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-[#E2A416]" style={{ width: `${Math.min(100, Math.max(0, lead.qualificationScore))}%` }} />
                      </div>
                      <span className="text-sm font-black text-[#07121F]">{lead.qualificationScore}</span>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      lead.leadStatus === "qualified"
                        ? "w-fit border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "w-fit border-amber-200 bg-amber-50 text-amber-800"
                    }
                  >
                    {readableStatus(lead.leadStatus)}
                  </Badge>
                  <select
                    aria-label={`Review status for ${lead.name}`}
                    value={lead.leadStatus === "converted" ? "qualified" : lead.leadStatus}
                    disabled={lead.leadStatus === "converted" || reviewMutation.isPending}
                    onChange={(event) =>
                      reviewMutation.mutate({ leadId: lead.id, leadStatus: event.target.value })
                    }
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#E2A416] focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100"
                  >
                    <option value="new">New</option>
                    <option value="under_review">Under review</option>
                    <option value="qualified">Qualified</option>
                    <option value="contact_ready">Contact ready</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-slate-300" />
              <div className="mt-3 font-black text-[#07121F]">No Benin prospects in review yet</div>
              <p className="mt-1 text-sm text-slate-500">Select sourced companies above and import only the cohort you intend to qualify.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
