import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Factory,
  Handshake,
  Mail,
  MessageCircle,
  Network,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  UploadCloud,
  UserRoundCog,
  Users,
} from "lucide-react";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  sourceType:
    | "official_registry"
    | "official_operator"
    | "industry_directory";
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
  phone: string | null;
  website: string | null;
  publicEmail: string | null;
  sourceTitle: string | null;
  opportunityHypotheses: string[];
  outreachAllowed: boolean;
  contactPlan: StoredContactPlan | null;
};

type ContactChannel = "email" | "phone" | "whatsapp" | "warm_introduction";
type ContactBasis =
  | "public_b2b_relevance"
  | "existing_business_relationship"
  | "explicit_opt_in"
  | "institutional_introduction";

type ContactPlanForm = {
  contactName: string;
  contactRole: string;
  channel: ContactChannel;
  contactPoint: string;
  contactSourceUrl: string;
  businessReason: string;
  complianceBasis: ContactBasis;
  senderIdentity: string;
  senderVerified: boolean;
  approvalOwner: string;
  language: "fr" | "en";
  draftMessage: string;
  suppressionChecked: boolean;
  quietHoursChecked: boolean;
  whatsappOptInEvidence: string;
};

type StoredContactPlan = ContactPlanForm & {
  readinessStatus: "ready_for_human_approval" | "needs_review";
  approvalStatus: "pending";
  outboundExecutionAllowed: false;
};

type FactoryLeadResponse = {
  ok: boolean;
  leads: FactoryLead[];
  total: number;
};

type OpportunityWorkstream = {
  key: string;
  taskId: number | null;
  agentId: number | null;
  agentName: string;
  role: string;
  title: string;
  status: string;
};

type CommercialOpportunity = {
  id: string;
  referenceCode: string;
  title: string;
  requirementType: string;
  status: string;
  urgency: string;
  quantityText: string | null;
  deliveryCity: string | null;
  deliveryCountryCode: string | null;
  requesterCompany: string | null;
  commercialIntent: string | null;
  commercialActionMode: string | null;
  intentConfidence: number | null;
  nextAction: string | null;
  submittedAt: string | null;
  productRequirement: {
    productName: string | null;
    productCategory: string | null;
    specification: string | null;
    quantityText: string | null;
    unit: string | null;
    origin: string | null;
    destination: string | null;
    frequency: string | null;
    incoterm: string | null;
    missingFields: string[];
  } | null;
  operationsHandoff: {
    taskId: number;
    status: string;
    assignedAgentName: string | null;
    participants: Array<{
      key: string;
      agentId: number | null;
      agentName: string;
      role: string;
    }>;
    workstreams: OpportunityWorkstream[];
    missingSpecialistKeys: string[];
  } | null;
};

type CommercialOpportunityResponse = {
  ok: boolean;
  requirements: CommercialOpportunity[];
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
  const operator = prospect.sourceType === "official_operator";
  return (
    <Badge
      variant="outline"
      className={
        official || operator
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-700"
      }
    >
      {official
        ? "Official registry"
        : operator
          ? "Official operator source"
          : "Industry source"}
    </Badge>
  );
}

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  email: "Work email",
  phone: "Business phone",
  whatsapp: "WhatsApp (explicit opt-in required)",
  warm_introduction: "Warm institutional introduction",
};

const BASIS_LABELS: Record<ContactBasis, string> = {
  public_b2b_relevance: "Public B2B relevance",
  existing_business_relationship: "Existing business relationship",
  explicit_opt_in: "Explicit WhatsApp opt-in",
  institutional_introduction: "Institutional introduction",
};

function ChannelIcon({ channel }: { channel: ContactChannel }) {
  const Icon =
    channel === "email"
      ? Mail
      : channel === "phone"
        ? Phone
        : channel === "whatsapp"
          ? MessageCircle
          : Handshake;
  return <Icon className="h-4 w-4" />;
}

function initialContactPlan(lead: FactoryLead): ContactPlanForm {
  if (lead.contactPlan) {
    return {
      ...lead.contactPlan,
      whatsappOptInEvidence: lead.contactPlan.whatsappOptInEvidence || "",
    };
  }

  const channel: ContactChannel = lead.publicEmail
    ? "email"
    : lead.phone
      ? "phone"
      : "warm_introduction";
  const businessReason =
    lead.opportunityHypotheses[0] ||
    `Understand ${lead.name}'s recurring industrial requirements before proposing any service.`;

  return {
    contactName: "",
    contactRole: "",
    channel,
    contactPoint:
      lead.publicEmail ||
      lead.phone ||
      (lead.sourceName ? `Introduction through ${lead.sourceName}` : ""),
    contactSourceUrl: lead.sourceUrl || lead.website || "",
    businessReason,
    complianceBasis:
      channel === "warm_introduction"
        ? "institutional_introduction"
        : "public_b2b_relevance",
    senderIdentity: "Exportunity Machinery",
    senderVerified: false,
    approvalOwner: "",
    language: "fr",
    draftMessage: `Bonjour {{contact_name}},\n\nJe vous contacte au nom d'Exportunity Machinery au sujet de ${lead.name}. Nous souhaitons comprendre vos besoins recurrents en pieces, maintenance ou approvisionnement industriel afin d'evaluer si notre reseau peut reduire les delais ou le cout total.\n\nSeriez-vous la bonne personne pour un court echange ?\n\nCordialement,\n{{approved_sender_name}}\nExportunity Machinery`,
    suppressionChecked: false,
    quietHoursChecked: false,
    whatsappOptInEvidence: "",
  };
}

function contactPlanMissing(form: ContactPlanForm) {
  const missing: string[] = [];
  if (form.contactName.trim().length < 2) missing.push("verified contact name");
  if (form.contactRole.trim().length < 2) missing.push("verified contact role");
  if (form.contactPoint.trim().length < 4) missing.push("contact route");
  if (!/^https:\/\//i.test(form.contactSourceUrl.trim())) missing.push("HTTPS contact source");
  if (form.businessReason.trim().length < 20) missing.push("specific business reason");
  if (form.senderIdentity.trim().length < 3) missing.push("sender identity");
  if (!form.senderVerified) missing.push("verified sender");
  if (form.approvalOwner.trim().length < 2) missing.push("approval owner");
  if (form.draftMessage.trim().length < 40) missing.push("reviewable draft");
  if (!form.suppressionChecked) missing.push("suppression check");
  if (!form.quietHoursChecked) missing.push("quiet-hours check");
  if (form.channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactPoint.trim())) {
    missing.push("valid work email");
  }
  if ((form.channel === "phone" || form.channel === "whatsapp") && form.contactPoint.replace(/\D/g, "").length < 8) {
    missing.push(`valid ${form.channel === "whatsapp" ? "WhatsApp" : "telephone"} number`);
  }
  if (form.channel === "whatsapp") {
    if (form.complianceBasis !== "explicit_opt_in") missing.push("explicit WhatsApp opt-in basis");
    if (form.whatsappOptInEvidence.trim().length < 12) missing.push("WhatsApp opt-in evidence");
  }
  if (
    form.channel === "warm_introduction" &&
    form.complianceBasis !== "institutional_introduction" &&
    form.complianceBasis !== "existing_business_relationship"
  ) {
    missing.push("introduction relationship basis");
  }
  return Array.from(new Set(missing));
}

export default function AdminIndustrialNetworkPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | ProspectRole>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planningLead, setPlanningLead] = useState<FactoryLead | null>(null);
  const [contactPlan, setContactPlan] = useState<ContactPlanForm | null>(null);

  const previewQuery = useQuery<ProspectPreview>({
    queryKey: ["/api/industrial/admin/factory-leads/benin-official-preview"],
    staleTime: 60 * 60 * 1000,
  });

  const leadsQuery = useQuery<FactoryLeadResponse>({
    queryKey: ["/api/industrial/admin/factory-leads?limit=100&countryCode=BJ"],
    staleTime: 15_000,
  });

  const opportunitiesQuery = useQuery<CommercialOpportunityResponse>({
    queryKey: ["/api/industrial/admin/requirements?limit=25"],
    staleTime: 10_000,
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

  const contactPlanMutation = useMutation({
    mutationFn: async (input: {
      leadId: string;
      contactReadiness: ContactPlanForm;
    }) =>
      apiRequest(
        `/api/industrial/admin/factory-leads/${input.leadId}/review`,
        "PATCH",
        {
          leadStatus: "contact_ready",
          screeningNotes:
            "Qualified lead has a documented contact dossier awaiting separate human approval. No outbound execution is authorized.",
          contactReadiness: input.contactReadiness,
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["/api/industrial/admin/factory-leads?limit=100&countryCode=BJ"],
      });
      setPlanningLead(null);
      setContactPlan(null);
      toast({
        title: "Contact dossier saved for approval",
        description:
          "The lead remains private. No email, call or WhatsApp message was sent.",
      });
    },
    onError: (error: any) =>
      toast({
        title: "Contact dossier could not be saved",
        description: error?.message || "Review the required evidence and try again.",
        variant: "destructive",
      }),
  });

  const openContactPlan = (lead: FactoryLead) => {
    setPlanningLead(lead);
    setContactPlan(initialContactPlan(lead));
  };

  const updateContactPlan = <K extends keyof ContactPlanForm>(
    key: K,
    value: ContactPlanForm[K],
  ) => {
    setContactPlan((current) =>
      current ? { ...current, [key]: value } : current,
    );
  };

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
  const opportunities = opportunitiesQuery.data?.requirements || [];
  const openOpportunities = opportunities.filter(
    (item) => !["closed", "cancelled"].includes(item.status),
  );

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
              Manage global industrial demand, specialist execution and source-backed
              partner discovery before any contact or public commitment.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-slate-300 bg-white text-slate-800"
              onClick={() => {
                previewQuery.refetch();
                leadsQuery.refetch();
                opportunitiesQuery.refetch();
              }}
              disabled={previewQuery.isFetching || leadsQuery.isFetching || opportunitiesQuery.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${previewQuery.isFetching || leadsQuery.isFetching || opportunitiesQuery.isFetching ? "animate-spin" : ""}`}
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

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-labelledby="commercial-opportunities-title">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BriefcaseBusiness className="h-5 w-5 text-[#9A6700]" />
                <h2 id="commercial-opportunities-title" className="text-lg font-black text-[#07121F]">
                  Live commercial opportunities
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Every client demand has one accountable lead, visible specialist work and a governed next action.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                {openOpportunities.length} open
              </Badge>
              <Button asChild size="sm" variant="outline" className="border-slate-300 bg-white text-slate-800">
                <Link href="/ai-team">Open Operations Center</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="border-slate-300 bg-white text-slate-800">
                <Link href="/admin/agents-os?tab=workforce">Review staffing</Link>
              </Button>
            </div>
          </div>

          {opportunitiesQuery.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading commercial work...
            </div>
          ) : opportunitiesQuery.isError ? (
            <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              The opportunity queue could not be loaded. Confirm the staff session and database migration status.
            </div>
          ) : opportunities.length ? (
            <div className="divide-y divide-slate-100">
              {opportunities.slice(0, 8).map((opportunity) => {
                const product = opportunity.productRequirement;
                const handoff = opportunity.operationsHandoff;
                const productName = product?.productName || opportunity.title;
                const quantity = product?.quantityText || opportunity.quantityText;
                const destination = product?.destination || [opportunity.deliveryCity, opportunity.deliveryCountryCode].filter(Boolean).join(", ");
                return (
                  <article key={opportunity.id} className="grid gap-4 p-4 hover:bg-slate-50/70 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-[0.08em] text-[#9A6700]">{opportunity.referenceCode}</span>
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                          {readableStatus(opportunity.status)}
                        </Badge>
                        {opportunity.commercialActionMode ? (
                          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                            {opportunity.commercialActionMode}
                          </Badge>
                        ) : null}
                      </div>
                      <h3 className="mt-2 truncate font-black text-[#07121F]">{productName}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {[quantity, destination, product?.incoterm].filter(Boolean).join(" / ") || "Qualification in progress"}
                      </p>
                      <div className="mt-2 text-xs font-semibold text-slate-600">
                        {readableStatus(opportunity.commercialIntent || opportunity.requirementType)}
                        {opportunity.requesterCompany ? ` for ${opportunity.requesterCompany}` : ""}
                      </div>
                    </div>

                    <div className="min-w-0 border-slate-200 xl:border-l xl:pl-4">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
                        <UserRoundCog className="h-4 w-4" /> Accountable team
                      </div>
                      <div className="mt-2 font-bold text-[#07121F]">
                        {handoff?.assignedAgentName || "Commercial assignment required"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(handoff?.workstreams || []).slice(0, 5).map((workstream) => (
                          <Badge key={`${opportunity.id}-${workstream.key}`} variant="outline" className="border-slate-200 bg-white text-slate-600">
                            {workstream.agentName || readableStatus(workstream.key)} · {readableStatus(workstream.status)}
                          </Badge>
                        ))}
                      </div>
                      {handoff?.missingSpecialistKeys?.length ? (
                        <p className="mt-2 text-xs font-semibold text-amber-700">
                          Staffing review: {handoff.missingSpecialistKeys.map(readableStatus).join(", ")}
                        </p>
                      ) : null}
                    </div>

                    <div className="min-w-0 border-slate-200 xl:border-l xl:pl-4">
                      <div className="text-xs font-bold uppercase text-slate-500">Next action</div>
                      <p className="mt-2 text-sm font-semibold leading-5 text-slate-800">
                        {opportunity.nextAction || "Review and qualify the industrial requirement."}
                      </p>
                      {product?.missingFields?.length ? (
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          Missing: {product.missingFields.map(readableStatus).join(", ")}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs font-semibold text-emerald-700">Commercial qualification captured</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <BriefcaseBusiness className="mx-auto h-8 w-8 text-slate-300" />
              <div className="mt-3 font-black text-[#07121F]">No commercial demand has been submitted yet</div>
              <p className="mt-1 text-sm text-slate-500">Qualified client conversations will appear here with their assigned team and workstreams.</p>
            </div>
          )}
        </section>

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
                <div key={lead.id} className="grid gap-3 p-4 lg:grid-cols-[1.45fr_0.8fr_140px_190px_230px] lg:items-center">
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
                      lead.leadStatus === "qualified" || lead.leadStatus === "contact_ready"
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
                    {lead.leadStatus === "contact_ready" ? (
                      <option value="contact_ready">Contact dossier pending approval</option>
                    ) : null}
                    <option value="rejected">Rejected</option>
                  </select>
                  <div className="flex flex-col gap-1.5">
                    {lead.leadStatus === "qualified" || lead.leadStatus === "contact_ready" ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openContactPlan(lead)}
                        className="h-10 justify-start border-[#E2A416] bg-[#FFF8E8] font-black text-[#704700] hover:bg-[#FFF1CC]"
                      >
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        {lead.contactPlan ? "Review contact dossier" : "Prepare contact dossier"}
                      </Button>
                    ) : (
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                        Qualify before planning contact
                      </div>
                    )}
                    {lead.contactPlan ? (
                      <span className="text-xs font-semibold text-amber-700">
                        Human approval pending; sending blocked
                      </span>
                    ) : null}
                  </div>
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

        <Dialog
          open={Boolean(planningLead && contactPlan)}
          onOpenChange={(open) => {
            if (!open) {
              setPlanningLead(null);
              setContactPlan(null);
            }
          }}
        >
          <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-white text-slate-950 shadow-2xl sm:max-w-3xl">
            <DialogHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF6E2] text-[#9A6700]">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <DialogTitle className="text-xl font-black text-[#07121F]">
                Contact dossier{planningLead ? `: ${planningLead.name}` : ""}
              </DialogTitle>
              <DialogDescription className="leading-6 text-slate-600">
                Document the exact recipient, lawful channel, company-specific reason and
                accountable sender. Saving moves this dossier to human approval only.
              </DialogDescription>
            </DialogHeader>

            {contactPlan ? (
              <div className="space-y-5">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950">
                  No email, call or WhatsApp message is sent from this screen. Outbound
                  execution remains blocked until a separate approval and send action.
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact-name" className="font-bold text-slate-800">
                      Verified contact name
                    </Label>
                    <Input
                      id="contact-name"
                      value={contactPlan.contactName}
                      onChange={(event) => updateContactPlan("contactName", event.target.value)}
                      placeholder="Named business contact"
                      className="border-slate-300 bg-white text-slate-950"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-role" className="font-bold text-slate-800">
                      Verified role
                    </Label>
                    <Input
                      id="contact-role"
                      value={contactPlan.contactRole}
                      onChange={(event) => updateContactPlan("contactRole", event.target.value)}
                      placeholder="Maintenance, procurement or operations"
                      className="border-slate-300 bg-white text-slate-950"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact-channel" className="font-bold text-slate-800">
                    Proposed channel
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                      <ChannelIcon channel={contactPlan.channel} />
                    </span>
                    <select
                      id="contact-channel"
                      value={contactPlan.channel}
                      onChange={(event) => {
                        const channel = event.target.value as ContactChannel;
                        setContactPlan((current) =>
                          current
                            ? {
                                ...current,
                                channel,
                                complianceBasis:
                                  channel === "whatsapp"
                                    ? "explicit_opt_in"
                                    : channel === "warm_introduction"
                                      ? "institutional_introduction"
                                      : "public_b2b_relevance",
                              }
                            : current,
                        );
                      }}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#E2A416] focus:ring-2 focus:ring-amber-100"
                    >
                      {(Object.keys(CHANNEL_LABELS) as ContactChannel[]).map((channel) => (
                        <option key={channel} value={channel}>
                          {CHANNEL_LABELS[channel]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact-point" className="font-bold text-slate-800">
                      Exact contact route
                    </Label>
                    <Input
                      id="contact-point"
                      value={contactPlan.contactPoint}
                      onChange={(event) => updateContactPlan("contactPoint", event.target.value)}
                      placeholder={
                        contactPlan.channel === "email"
                          ? "name@company.com"
                          : contactPlan.channel === "warm_introduction"
                            ? "Introduction through APIEx / GDIZ / CIPB"
                            : "+229 ..."
                      }
                      className="border-slate-300 bg-white text-slate-950"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-source" className="font-bold text-slate-800">
                      Public source for contact
                    </Label>
                    <Input
                      id="contact-source"
                      type="url"
                      value={contactPlan.contactSourceUrl}
                      onChange={(event) => updateContactPlan("contactSourceUrl", event.target.value)}
                      placeholder="https://official-source.example"
                      className="border-slate-300 bg-white text-slate-950"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="business-reason" className="font-bold text-slate-800">
                    Company-specific business reason
                  </Label>
                  <Textarea
                    id="business-reason"
                    value={contactPlan.businessReason}
                    onChange={(event) => updateContactPlan("businessReason", event.target.value)}
                    rows={3}
                    className="border-slate-300 bg-white text-slate-950"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact-basis" className="font-bold text-slate-800">
                      Contact basis
                    </Label>
                    <select
                      id="contact-basis"
                      value={contactPlan.complianceBasis}
                      onChange={(event) =>
                        updateContactPlan("complianceBasis", event.target.value as ContactBasis)
                      }
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#E2A416] focus:ring-2 focus:ring-amber-100"
                    >
                      {(Object.keys(BASIS_LABELS) as ContactBasis[]).map((basis) => (
                        <option key={basis} value={basis}>
                          {BASIS_LABELS[basis]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-language" className="font-bold text-slate-800">
                      Message language
                    </Label>
                    <select
                      id="contact-language"
                      value={contactPlan.language}
                      onChange={(event) => updateContactPlan("language", event.target.value as "fr" | "en")}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#E2A416] focus:ring-2 focus:ring-amber-100"
                    >
                      <option value="fr">French</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>

                {contactPlan.channel === "whatsapp" ? (
                  <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <Label htmlFor="whatsapp-consent" className="font-bold text-rose-900">
                      Explicit WhatsApp opt-in evidence
                    </Label>
                    <Textarea
                      id="whatsapp-consent"
                      value={contactPlan.whatsappOptInEvidence}
                      onChange={(event) => updateContactPlan("whatsappOptInEvidence", event.target.value)}
                      placeholder="Record when, where and how this recipient opted in."
                      rows={3}
                      className="border-rose-300 bg-white text-slate-950"
                    />
                    <p className="text-xs leading-5 text-rose-800">
                      A public telephone number is not WhatsApp consent. Without explicit
                      evidence, choose email, phone or a warm introduction instead.
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sender-identity" className="font-bold text-slate-800">
                      Sender identity
                    </Label>
                    <Input
                      id="sender-identity"
                      value={contactPlan.senderIdentity}
                      onChange={(event) => updateContactPlan("senderIdentity", event.target.value)}
                      className="border-slate-300 bg-white text-slate-950"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="approval-owner" className="font-bold text-slate-800">
                      Human approval owner
                    </Label>
                    <Input
                      id="approval-owner"
                      value={contactPlan.approvalOwner}
                      onChange={(event) => updateContactPlan("approvalOwner", event.target.value)}
                      placeholder="Accountable approver"
                      className="border-slate-300 bg-white text-slate-950"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="draft-message" className="font-bold text-slate-800">
                    Draft for human review
                  </Label>
                  <Textarea
                    id="draft-message"
                    value={contactPlan.draftMessage}
                    onChange={(event) => updateContactPlan("draftMessage", event.target.value)}
                    rows={8}
                    className="border-slate-300 bg-white font-mono text-sm leading-6 text-slate-950"
                  />
                </div>

                <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <legend className="px-1 text-sm font-black text-[#07121F]">
                    Required controls
                  </legend>
                  {[
                    {
                      key: "senderVerified" as const,
                      label: "The sender identity and outbound account are verified.",
                    },
                    {
                      key: "suppressionChecked" as const,
                      label: "The recipient is not on the do-not-contact or suppression list.",
                    },
                    {
                      key: "quietHoursChecked" as const,
                      label: "The proposed timing respects local quiet hours and channel rules.",
                    },
                  ].map((control) => (
                    <label key={control.key} className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-700">
                      <input
                        type="checkbox"
                        checked={contactPlan[control.key]}
                        onChange={(event) => updateContactPlan(control.key, event.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#E2A416]"
                      />
                      <span>{control.label}</span>
                    </label>
                  ))}
                </fieldset>

                {contactPlanMissing(contactPlan).length ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs font-black uppercase text-slate-500">
                      Still required
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {contactPlanMissing(contactPlan).map((item) => (
                        <Badge key={item} variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold leading-6 text-emerald-900">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    The dossier is complete enough to enter human approval. Sending remains blocked.
                  </div>
                )}
              </div>
            ) : null}

            <DialogFooter className="gap-2 border-t border-slate-200 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPlanningLead(null);
                  setContactPlan(null);
                }}
                className="border-slate-300 bg-white text-slate-800"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  !planningLead ||
                  !contactPlan ||
                  contactPlanMissing(contactPlan).length > 0 ||
                  contactPlanMutation.isPending
                }
                onClick={() => {
                  if (planningLead && contactPlan) {
                    contactPlanMutation.mutate({
                      leadId: planningLead.id,
                      contactReadiness: contactPlan,
                    });
                  }
                }}
                className="bg-[#E2A416] font-black text-[#07121F] hover:bg-[#C98F12]"
              >
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Save for human approval
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
