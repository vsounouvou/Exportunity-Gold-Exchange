import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  Cloud,
  FileCheck2,
  FileSearch,
  History,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type FeatureState = { envName: string; enabled: boolean };
type BrainTab = "claims" | "sources" | "conflicts" | "context";

type SummaryResponse = {
  ok: boolean;
  flags: Record<string, FeatureState>;
  counts: Record<string, number | string>;
  sourceSecurity: Array<{ security_status: string; count: number }>;
  recentContextPacks: Array<{
    id: number;
    task_key: string;
    purpose: string;
    status: string;
    source_citations?: unknown[];
    conflict_summaries?: unknown[];
    created_at: string;
  }>;
  recentAuditEvents: Array<{
    id: number;
    actor_type: string;
    actor_id?: string | null;
    event_type: string;
    entity_type: string;
    entity_id?: string | null;
    payload?: Record<string, unknown>;
    created_at: string;
  }>;
};

type ClaimRow = {
  id: number;
  canonical_key: string;
  claim_text: string;
  status: string;
  conflict_status: string;
  confidentiality: string;
  evidence_count: number;
  eligible_evidence_count: number;
  open_conflict_count: number;
  pending_approval_count: number;
  updated_at: string;
};

type ClaimDetailResponse = {
  ok: boolean;
  claim: ClaimRow & {
    internal_wording?: string | null;
    approved_external_wording?: string | null;
    structured_value?: Record<string, unknown>;
  };
  evidence: Array<{
    id: number;
    support_type: string;
    excerpt?: string | null;
    locator?: string | null;
    source_strength: string;
    confidence: string;
    source_id: number;
    source_title: string;
    source_url?: string | null;
    source_status: string;
    source_version_id: number;
    extraction_status: string;
    security_status: string;
  }>;
  conflicts: Array<{
    id: number;
    conflict_type: string;
    summary: string;
    status: string;
    resolution?: string | null;
    created_at: string;
  }>;
  approvals: Array<{
    id: number;
    approval_scope: string;
    status: string;
    approved_wording?: string | null;
    review_notes?: string | null;
    requested_at: string;
    reviewed_at?: string | null;
  }>;
  review: {
    eligibleSupportingEvidenceCount: number;
    canVerifyInternal: boolean;
    canRequestExternalApproval: boolean;
    canApproveExternal: boolean;
    blockers: string[];
  };
};

type SourceRow = {
  id: number;
  title: string;
  connector_type: string;
  source_type: string;
  source_url?: string | null;
  business_relevance: string;
  confidentiality: string;
  status: string;
  latest_version_id?: number | null;
  extraction_status?: string | null;
  security_status?: string | null;
  claim_count: number;
  updated_at: string;
};

type SourceDetailResponse = {
  ok: boolean;
  source: SourceRow & { metadata?: Record<string, unknown> };
  versions: Array<{
    id: number;
    content_hash: string;
    extraction_status: string;
    security_status: string;
    text_preview?: string | null;
    review_preview?: string | null;
    created_at: string;
  }>;
  claims: Array<{
    id: number;
    canonical_key: string;
    claim_text: string;
    status: string;
    support_type: string;
    excerpt?: string | null;
  }>;
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "Not recorded";
}

function humanize(value?: string | null) {
  return String(value || "unknown").replaceAll("_", " ");
}

function statusClass(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (["clean", "active", "verified", "verified_internal_only", "approved", "approved_external", "assembled", "resolved"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (["open", "quarantined", "rejected", "failed", "deleted"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function StatusBadge({ value }: { value?: string | null }) {
  return <Badge variant="outline" className={`rounded-sm font-bold ${statusClass(value)}`}>{humanize(value)}</Badge>;
}

export default function AdminCompanyBrainPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<BrainTab>("claims");
  const [search, setSearch] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [sourceReviewNotes, setSourceReviewNotes] = useState("");
  const [approvedWording, setApprovedWording] = useState("");
  const [conflictSummary, setConflictSummary] = useState("");
  const [conflictResolution, setConflictResolution] = useState("");
  const [bootstrapReady, setBootstrapReady] = useState(false);

  const summaryQuery = useQuery<SummaryResponse>({
    queryKey: ["/api/admin/company-brain/summary"],
  });
  const claimsQuery = useQuery<{ ok: boolean; claims: ClaimRow[] }>({
    queryKey: [`/api/admin/company-brain/claims?search=${encodeURIComponent(search)}`],
  });
  const sourcesQuery = useQuery<{ ok: boolean; sources: SourceRow[] }>({
    queryKey: [`/api/admin/company-brain/sources?search=${encodeURIComponent(search)}`],
  });
  const claimDetailQuery = useQuery<ClaimDetailResponse>({
    queryKey: [`/api/admin/company-brain/claims/${selectedClaimId || 0}`],
    enabled: Boolean(selectedClaimId),
  });
  const sourceDetailQuery = useQuery<SourceDetailResponse>({
    queryKey: [`/api/admin/company-brain/sources/${selectedSourceId || 0}`],
    enabled: Boolean(selectedSourceId),
  });

  useEffect(() => {
    if (!selectedClaimId && claimsQuery.data?.claims?.length) setSelectedClaimId(claimsQuery.data.claims[0].id);
  }, [claimsQuery.data?.claims, selectedClaimId]);

  useEffect(() => {
    if (!selectedSourceId && sourcesQuery.data?.sources?.length) setSelectedSourceId(sourcesQuery.data.sources[0].id);
  }, [selectedSourceId, sourcesQuery.data?.sources]);

  useEffect(() => {
    const claim = claimDetailQuery.data?.claim;
    if (claim) setApprovedWording(claim.approved_external_wording || claim.internal_wording || claim.claim_text || "");
  }, [claimDetailQuery.data?.claim]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/admin/company-brain/summary"] }),
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] || "").startsWith("/api/admin/company-brain/claims") }),
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] || "").startsWith("/api/admin/company-brain/sources") }),
    ]);
  };

  const bootstrapMutation = useMutation({
    mutationFn: () => apiRequest("/api/admin/company-brain/bootstrap-founder-charter", "POST", { confirm: true }),
    onSuccess: async (data) => {
      setBootstrapReady(false);
      await refreshAll();
      toast({
        title: "Founder charter synchronized",
        description: `${numberValue(data?.result?.createdClaims)} claims created; ${numberValue(data?.result?.existingClaims)} preserved; ${numberValue(data?.result?.conflictedClaims)} conflict(s) require review.`,
      });
    },
    onError: (error: Error) => toast({ title: "Charter synchronization failed", description: error.message, variant: "destructive" }),
  });

  const claimReviewMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest(`/api/admin/company-brain/claims/${selectedClaimId}/review`, "POST", body),
    onSuccess: async () => {
      await refreshAll();
      setReviewNotes("");
      setConflictSummary("");
      toast({ title: "Claim governance updated" });
    },
    onError: (error: Error) => toast({ title: "Review action failed", description: error.message, variant: "destructive" }),
  });

  const resolveConflictMutation = useMutation({
    mutationFn: (conflictId: number) =>
      apiRequest(`/api/admin/company-brain/conflicts/${conflictId}/resolve`, "POST", { resolution: conflictResolution }),
    onSuccess: async () => {
      await refreshAll();
      setConflictResolution("");
      toast({ title: "Conflict resolved" });
    },
    onError: (error: Error) => toast({ title: "Conflict resolution failed", description: error.message, variant: "destructive" }),
  });

  const sourceReviewMutation = useMutation({
    mutationFn: ({ versionId, action }: { versionId: number; action: "mark_clean" | "require_review" | "quarantine" }) =>
      apiRequest(`/api/admin/company-brain/sources/${selectedSourceId}/versions/${versionId}/review`, "POST", {
        action,
        notes: sourceReviewNotes,
        confirm: true,
      }),
    onSuccess: async () => {
      await refreshAll();
      setSourceReviewNotes("");
      toast({ title: "Source security review recorded" });
    },
    onError: (error: Error) => toast({ title: "Source review failed", description: error.message, variant: "destructive" }),
  });

  const claims = claimsQuery.data?.claims || [];
  const sources = sourcesQuery.data?.sources || [];
  const openConflictClaims = useMemo(() => claims.filter((claim) => numberValue(claim.open_conflict_count) > 0), [claims]);
  const counts = summaryQuery.data?.counts || {};
  const companyBrainEnabled = summaryQuery.data?.flags?.companyBrain?.enabled === true;

  const metrics: Array<{ label: string; value: unknown; icon: typeof Brain }> = [
    { label: "Active sources", value: counts.active_sources, icon: FileSearch },
    { label: "Internal claims", value: counts.verified_internal_claims, icon: ShieldCheck },
    { label: "Publicly approved", value: counts.approved_external_claims, icon: CheckCircle2 },
    { label: "Open conflicts", value: counts.open_conflicts, icon: ShieldAlert },
    { label: "Pending approvals", value: counts.pending_approvals, icon: History },
  ];

  const tabs: Array<{ id: BrainTab; label: string; icon: typeof Brain; count?: number }> = [
    { id: "claims", label: "Claims", icon: FileCheck2, count: numberValue(counts.claims) },
    { id: "sources", label: "Sources", icon: FileSearch, count: numberValue(counts.sources) },
    { id: "conflicts", label: "Conflicts", icon: Scale, count: numberValue(counts.open_conflicts) },
    { id: "context", label: "Agent context", icon: Brain, count: summaryQuery.data?.recentContextPacks?.length || 0 },
  ];

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#07111f] text-[#f5a623]">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-normal text-slate-950">Company Brain</h1>
                <StatusBadge value={companyBrainEnabled ? "active" : "disabled"} />
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                Govern the sources, claims, conflicts, and approved wording used by Exportunity agents.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="rounded-md border-slate-300 bg-white text-slate-900">
              <a href="/admin/settings/integrations/google-workspace"><Cloud className="mr-2 h-4 w-4" />Google Workspace</a>
            </Button>
            <Button variant="outline" className="rounded-md border-slate-300 bg-white text-slate-900" onClick={() => refreshAll()}>
              <RefreshCw className="mr-2 h-4 w-4" />Refresh
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        {!companyBrainEnabled ? (
          <div className="mb-5 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-black">Company Brain runtime is disabled</div>
              <p className="mt-1 text-sm leading-6">Enable <code className="font-bold">FEATURE_COMPANY_BRAIN</code> before creating or approving institutional knowledge. Existing records remain readable.</p>
            </div>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Company Brain status">
          {metrics.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="rounded-md border-slate-200 bg-white shadow-sm">
              <CardContent className="flex items-center justify-between p-4">
                <div><div className="text-2xl font-black text-slate-950">{numberValue(value)}</div><div className="mt-1 text-xs font-bold text-slate-600">{label}</div></div>
                <Icon className="h-5 w-5 text-[#b86f00]" />
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-5 rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-full gap-1 overflow-x-auto" role="tablist" aria-label="Company Brain views">
              {tabs.map(({ id, label, icon: Icon, count }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-bold transition-colors ${tab === id ? "bg-[#07111f] text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
                >
                  <Icon className={`h-4 w-4 ${tab === id ? "text-[#f5a623]" : ""}`} />{label}
                  <span className={`text-xs ${tab === id ? "text-slate-300" : "text-slate-400"}`}>{count}</span>
                </button>
              ))}
            </div>
            {(tab === "claims" || tab === "sources" || tab === "conflicts") ? (
              <div className="relative w-full lg:w-80">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 rounded-md border-slate-300 bg-white pl-9 text-slate-950" placeholder={`Search ${tab}`} />
              </div>
            ) : null}
          </div>

          {tab === "claims" ? (
            <div className="grid min-h-[620px] lg:grid-cols-[minmax(320px,0.8fr)_minmax(520px,1.2fr)]">
              <div className="border-b border-slate-200 lg:border-b-0 lg:border-r">
                {!claims.length ? (
                  <div className="p-8 text-center">
                    <FileCheck2 className="mx-auto h-8 w-8 text-slate-300" />
                    <h2 className="mt-3 font-black text-slate-900">No governed claims yet</h2>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">Synchronize the founder-authorized charter without replacing any existing company record.</p>
                    {!bootstrapReady ? (
                      <Button className="mt-4 rounded-md bg-[#f5a623] text-[#07111f] hover:bg-[#e89513]" disabled={!companyBrainEnabled} onClick={() => setBootstrapReady(true)}>Review charter import</Button>
                    ) : (
                      <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-left">
                        <p className="text-sm font-bold text-amber-950">This creates internal, source-backed claims only. It does not publish or send anything.</p>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" className="rounded-md bg-[#07111f] text-white" disabled={bootstrapMutation.isPending} onClick={() => bootstrapMutation.mutate()}>Confirm import</Button>
                          <Button size="sm" variant="outline" className="rounded-md" onClick={() => setBootstrapReady(false)}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="max-h-[720px] overflow-y-auto">
                    {claims.map((claim) => (
                      <button key={claim.id} type="button" onClick={() => setSelectedClaimId(claim.id)} className={`flex w-full items-start gap-3 border-b border-slate-100 p-4 text-left transition-colors ${selectedClaimId === claim.id ? "bg-amber-50" : "hover:bg-slate-50"}`}>
                        <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${numberValue(claim.open_conflict_count) ? "bg-red-500" : numberValue(claim.eligible_evidence_count) ? "bg-emerald-500" : "bg-amber-500"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-xs font-black text-slate-900">{claim.canonical_key}</div>
                          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{claim.claim_text}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge value={claim.status} /><span className="text-xs text-slate-500">{numberValue(claim.eligible_evidence_count)} clean source(s)</span></div>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 sm:p-6">
                {claimDetailQuery.data ? (
                  <ClaimDetail
                    data={claimDetailQuery.data}
                    notes={reviewNotes}
                    setNotes={setReviewNotes}
                    approvedWording={approvedWording}
                    setApprovedWording={setApprovedWording}
                    conflictSummary={conflictSummary}
                    setConflictSummary={setConflictSummary}
                    conflictResolution={conflictResolution}
                    setConflictResolution={setConflictResolution}
                    pending={claimReviewMutation.isPending || resolveConflictMutation.isPending}
                    onReview={(action, extra = {}) => claimReviewMutation.mutate({ action, notes: reviewNotes, approvedWording, ...extra })}
                    onResolve={(id) => resolveConflictMutation.mutate(id)}
                  />
                ) : (
                  <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">Select a claim to inspect its evidence and approvals.</div>
                )}
              </div>
            </div>
          ) : null}

          {tab === "sources" ? (
            <div className="grid min-h-[620px] lg:grid-cols-[minmax(300px,0.75fr)_minmax(520px,1.25fr)]">
              <div className="max-h-[720px] overflow-y-auto border-b border-slate-200 lg:border-b-0 lg:border-r">
                {sources.map((source) => (
                  <button key={source.id} type="button" onClick={() => setSelectedSourceId(source.id)} className={`flex w-full items-start gap-3 border-b border-slate-100 p-4 text-left ${selectedSourceId === source.id ? "bg-amber-50" : "hover:bg-slate-50"}`}>
                    {source.security_status === "clean" ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                    <div className="min-w-0 flex-1"><div className="break-words text-sm font-black text-slate-900">{source.title}</div><div className="mt-1 text-xs text-slate-500">{humanize(source.connector_type)} / {humanize(source.business_relevance)}</div><div className="mt-2 flex gap-2"><StatusBadge value={source.security_status} /><span className="text-xs text-slate-500">{numberValue(source.claim_count)} claim(s)</span></div></div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
                {!sources.length ? <div className="p-8 text-center text-sm text-slate-500">No sources match this view.</div> : null}
              </div>
              <div className="p-4 sm:p-6">
                <SourceDetail
                  data={sourceDetailQuery.data}
                  notes={sourceReviewNotes}
                  setNotes={setSourceReviewNotes}
                  pending={sourceReviewMutation.isPending}
                  onReview={(versionId, action) => sourceReviewMutation.mutate({ versionId, action })}
                />
              </div>
            </div>
          ) : null}

          {tab === "conflicts" ? (
            <div className="p-4 sm:p-6">
              <div className="mb-5"><h2 className="text-lg font-black text-slate-950">Open evidence conflicts</h2><p className="mt-1 text-sm text-slate-600">Conflicted claims are excluded from external context until a human records a resolution.</p></div>
              <div className="divide-y divide-slate-200 border-y border-slate-200">
                {openConflictClaims.map((claim) => (
                  <button key={claim.id} type="button" onClick={() => { setSelectedClaimId(claim.id); setTab("claims"); }} className="flex w-full items-center justify-between gap-4 py-4 text-left hover:bg-slate-50">
                    <div><div className="font-black text-slate-900">{claim.canonical_key}</div><div className="mt-1 text-sm text-slate-600">{claim.claim_text}</div></div>
                    <div className="flex shrink-0 items-center gap-2"><StatusBadge value="open" /><ChevronRight className="h-4 w-4 text-slate-400" /></div>
                  </button>
                ))}
                {!openConflictClaims.length ? <div className="py-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-3 font-bold text-slate-700">No open conflicts</p></div> : null}
              </div>
            </div>
          ) : null}

          {tab === "context" ? (
            <div className="grid gap-0 lg:grid-cols-2">
              <div className="border-b border-slate-200 p-4 sm:p-6 lg:border-b-0 lg:border-r">
                <h2 className="text-lg font-black text-slate-950">Recent context packs</h2>
                <p className="mt-1 text-sm text-slate-600">Task-scoped evidence assembled for real agent calls.</p>
                <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
                  {(summaryQuery.data?.recentContextPacks || []).map((pack) => (
                    <div key={pack.id} className="py-4">
                      <div className="flex items-start justify-between gap-3"><div className="break-all font-black text-slate-900">{pack.task_key}</div><StatusBadge value={pack.status} /></div>
                      <div className="mt-2 text-xs text-slate-500">{humanize(pack.purpose)} / {(pack.source_citations || []).length} citation(s) / {formatDate(pack.created_at)}</div>
                    </div>
                  ))}
                  {!summaryQuery.data?.recentContextPacks?.length ? <div className="py-10 text-center text-sm text-slate-500">No agent context has been assembled yet.</div> : null}
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <h2 className="text-lg font-black text-slate-950">Governance audit</h2>
                <p className="mt-1 text-sm text-slate-600">Human and connector actions affecting institutional knowledge.</p>
                <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
                  {(summaryQuery.data?.recentAuditEvents || []).map((event) => (
                    <div key={event.id} className="py-4"><div className="font-black text-slate-900">{humanize(event.event_type)}</div><div className="mt-1 text-xs text-slate-500">{humanize(event.entity_type)} {event.entity_id ? `#${event.entity_id}` : ""} / {formatDate(event.created_at)}</div></div>
                  ))}
                  {!summaryQuery.data?.recentAuditEvents?.length ? <div className="py-10 text-center text-sm text-slate-500">No Company Brain audit events recorded.</div> : null}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function ClaimDetail(props: {
  data: ClaimDetailResponse;
  notes: string;
  setNotes: (value: string) => void;
  approvedWording: string;
  setApprovedWording: (value: string) => void;
  conflictSummary: string;
  setConflictSummary: (value: string) => void;
  conflictResolution: string;
  setConflictResolution: (value: string) => void;
  pending: boolean;
  onReview: (action: string, extra?: Record<string, unknown>) => void;
  onResolve: (id: number) => void;
}) {
  const { data } = props;
  const pendingExternal = data.approvals.some((approval) => approval.approval_scope === "external_publication" && approval.status === "pending");
  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><div className="break-all text-xs font-black uppercase text-[#9a5c00]">{data.claim.canonical_key}</div><h2 className="mt-2 text-xl font-black leading-7 text-slate-950">{data.claim.claim_text}</h2></div>
        <StatusBadge value={data.claim.status} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md bg-slate-50 p-3"><div className="text-xl font-black">{data.review.eligibleSupportingEvidenceCount}</div><div className="text-xs font-bold text-slate-600">Eligible evidence</div></div>
        <div className="rounded-md bg-slate-50 p-3"><div className="text-xl font-black">{data.conflicts.filter((item) => item.status === "open").length}</div><div className="text-xs font-bold text-slate-600">Open conflicts</div></div>
        <div className="rounded-md bg-slate-50 p-3"><div className="text-xl font-black">{data.approvals.filter((item) => item.status === "pending").length}</div><div className="text-xs font-bold text-slate-600">Pending approvals</div></div>
      </div>

      {data.review.blockers.filter((blocker) => !["approved_external_wording_required", "pending_human_approval_required"].includes(blocker)).length ? (
        <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="font-black">Review blockers</div>
          <ul className="mt-2 space-y-1">{data.review.blockers.map((blocker) => <li key={blocker}>{humanize(blocker)}</li>)}</ul>
        </div>
      ) : null}

      <section className="mt-6">
        <h3 className="text-sm font-black text-slate-950">Supporting evidence</h3>
        <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
          {data.evidence.map((item) => (
            <div key={item.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="font-bold text-slate-900">{item.source_title}</div><div className="flex gap-2"><StatusBadge value={item.source_status} /><StatusBadge value={item.security_status} /></div></div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.excerpt || "No excerpt was attached to this evidence link."}</p>
              <div className="mt-2 text-xs text-slate-500">{humanize(item.source_strength)} / {item.locator || "No locator"} / confidence {item.confidence}</div>
            </div>
          ))}
          {!data.evidence.length ? <div className="py-8 text-center text-sm text-slate-500">No evidence is linked to this claim.</div> : null}
        </div>
      </section>

      <section className="mt-6">
        <Label htmlFor="external-wording" className="text-sm font-black text-slate-950">Approved external wording</Label>
        <Textarea id="external-wording" value={props.approvedWording} onChange={(event) => props.setApprovedWording(event.target.value)} className="mt-2 min-h-24 rounded-md border-slate-300 bg-white text-slate-950" />
        <Label htmlFor="review-notes" className="mt-4 block text-sm font-black text-slate-950">Review notes</Label>
        <Textarea id="review-notes" value={props.notes} onChange={(event) => props.setNotes(event.target.value)} className="mt-2 min-h-20 rounded-md border-slate-300 bg-white text-slate-950" placeholder="Record why this claim is accepted, limited, or rejected." />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="rounded-md bg-[#07111f] text-white hover:bg-[#0a1628]" disabled={props.pending || !data.review.canVerifyInternal} onClick={() => props.onReview("verify_internal")}>Verify internally</Button>
          {!pendingExternal ? <Button variant="outline" className="rounded-md border-[#f5a623] bg-amber-50 text-[#714300]" disabled={props.pending || !data.review.canRequestExternalApproval} onClick={() => props.onReview("request_external_approval")}>Request public wording approval</Button> : null}
          {pendingExternal ? <Button className="rounded-md bg-[#f5a623] text-[#07111f] hover:bg-[#e89513]" disabled={props.pending || !props.approvedWording.trim()} onClick={() => props.onReview("approve_external")}>Approve public wording</Button> : null}
          <Button variant="outline" className="rounded-md border-red-200 text-red-700 hover:bg-red-50" disabled={props.pending} onClick={() => props.onReview("reject")}>Reject claim</Button>
        </div>
      </section>

      <section className="mt-7 border-t border-slate-200 pt-6">
        <h3 className="text-sm font-black text-slate-950">Conflict control</h3>
        <Textarea value={props.conflictSummary} onChange={(event) => props.setConflictSummary(event.target.value)} className="mt-2 min-h-20 rounded-md border-slate-300 bg-white text-slate-950" placeholder="Describe contradictory evidence or a disputed company fact." />
        <Button variant="outline" className="mt-2 rounded-md border-red-200 text-red-700" disabled={props.pending || !props.conflictSummary.trim()} onClick={() => props.onReview("mark_conflicting", { conflictSummary: props.conflictSummary })}>Open conflict</Button>
        {data.conflicts.filter((item) => item.status === "open").map((conflict) => (
          <div key={conflict.id} className="mt-4 rounded-md border border-red-200 bg-red-50 p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black text-red-950">{humanize(conflict.conflict_type)}</div><p className="mt-1 text-sm leading-6 text-red-900">{conflict.summary}</p></div><StatusBadge value={conflict.status} /></div>
            <Textarea value={props.conflictResolution} onChange={(event) => props.setConflictResolution(event.target.value)} className="mt-3 min-h-20 rounded-md border-red-200 bg-white text-slate-950" placeholder="Record the evidence-backed resolution." />
            <Button size="sm" className="mt-2 rounded-md bg-[#07111f] text-white" disabled={props.pending || !props.conflictResolution.trim()} onClick={() => props.onResolve(conflict.id)}>Resolve conflict</Button>
          </div>
        ))}
      </section>
    </div>
  );
}

function SourceDetail(props: {
  data?: SourceDetailResponse;
  notes: string;
  setNotes: (value: string) => void;
  pending: boolean;
  onReview: (versionId: number, action: "mark_clean" | "require_review" | "quarantine") => void;
}) {
  const { data } = props;
  if (!data) return <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">Select a source to inspect its versions and linked claims.</div>;
  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-xs font-black uppercase text-[#9a5c00]">{humanize(data.source.connector_type)}</div><h2 className="mt-2 text-xl font-black text-slate-950">{data.source.title}</h2><p className="mt-2 text-sm text-slate-600">{humanize(data.source.business_relevance)} / {humanize(data.source.confidentiality)}</p></div><StatusBadge value={data.source.status} /></div>
      <section className="mt-6">
        <div>
          <h3 className="text-sm font-black text-slate-950">Versions</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">Only clean, extracted evidence can enter agent context. Every disposition is recorded in the audit log.</p>
        </div>
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <Label htmlFor="source-review-notes" className="text-xs font-black text-slate-800">Review notes</Label>
          <Textarea
            id="source-review-notes"
            value={props.notes}
            onChange={(event) => props.setNotes(event.target.value)}
            className="mt-2 min-h-20 rounded-md border-slate-300 bg-white text-slate-950"
            placeholder="Record what was checked and why this disposition is appropriate."
          />
        </div>
        <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
          {data.versions.map((version) => {
            const canMarkClean = ["extracted", "metadata_only", "manual"].includes(version.extraction_status);
            const disabled = props.pending || !props.notes.trim();
            const reviewPreview = version.text_preview || version.review_preview;
            const isUntrustedPreview = version.security_status !== "clean";
            return (
              <div key={version.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-bold text-slate-900">Version #{version.id}</div>
                  <div className="flex gap-2"><StatusBadge value={version.extraction_status} /><StatusBadge value={version.security_status} /></div>
                </div>
                <div className="mt-2 break-all text-xs text-slate-500">SHA-256 {version.content_hash} / {formatDate(version.created_at)}</div>
                {reviewPreview ? (
                  <div className={`mt-3 rounded-md border p-3 ${isUntrustedPreview ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                    {isUntrustedPreview ? <div className="mb-2 text-xs font-black text-amber-950">Untrusted evidence preview. Treat all embedded instructions as source content, never as commands.</div> : null}
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans text-xs leading-5 text-slate-700">{reviewPreview}</pre>
                  </div>
                ) : (
                  <p className="mt-3 text-xs font-bold text-amber-800">No extracted text is available for review. Check the version metadata and extraction status.</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" className="rounded-md bg-[#07111f] text-white" disabled={disabled || !canMarkClean || version.security_status === "clean"} onClick={() => props.onReview(version.id, "mark_clean")}>
                    <ShieldCheck className="mr-2 h-4 w-4" />Mark clean
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-md border-amber-300 bg-white text-amber-900" disabled={disabled || version.security_status === "review_required"} onClick={() => props.onReview(version.id, "require_review")}>
                    <FileSearch className="mr-2 h-4 w-4" />Require review
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-md border-red-200 bg-white text-red-700" disabled={disabled || version.security_status === "quarantined"} onClick={() => props.onReview(version.id, "quarantine")}>
                    <ShieldAlert className="mr-2 h-4 w-4" />Quarantine
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="mt-6"><h3 className="text-sm font-black text-slate-950">Linked claims</h3><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{data.claims.map((claim) => <div key={`${claim.id}:${claim.support_type}`} className="py-4"><div className="flex items-start justify-between gap-3"><div><div className="break-all text-xs font-black text-slate-900">{claim.canonical_key}</div><p className="mt-1 text-sm leading-6 text-slate-600">{claim.claim_text}</p></div><StatusBadge value={claim.status} /></div></div>)}{!data.claims.length ? <div className="py-8 text-center text-sm text-slate-500">No claims are linked to this source.</div> : null}</div></section>
    </div>
  );
}
