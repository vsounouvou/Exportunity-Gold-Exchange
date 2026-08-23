import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  FileSearch,
  Fingerprint,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type DiscoveryStatus =
  | "discovered"
  | "under_review"
  | "verification_pending"
  | "rejected"
  | "promoted";

type Provenance = {
  id: string;
  sourceType: string;
  sourceName: string;
  sourceUrl: string;
  retrievedAt: string;
  contentHash: string;
  evidence: {
    summary?: string;
    excerpt?: string;
    signals?: string[];
    registryNumber?: string;
  };
};

type SupplierPromotion = {
  id: string;
  supplierProfileId: string;
  legalName: string;
  countryCode: string;
  verificationScope: string;
  evidenceIds: string[];
  approvedAt: string;
  outreachAllowed: false;
};

type DiscoveryCandidate = {
  id: string;
  requirementId: string;
  requirementReferenceCode: string;
  requirementTitle: string;
  factoryLeadId: string;
  companyName: string;
  primaryIndustry?: string | null;
  website?: string | null;
  city?: string | null;
  countryCode?: string | null;
  status: DiscoveryStatus;
  relevanceScore: number;
  relevanceRationale: string;
  contactStatus: "not_contacted";
  outreachAllowed: false;
  humanApprovalRequired: true;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  updatedAt: string;
  verificationState: "unverified";
  supplierProfileCreated: boolean;
  identityPublic: false;
  promotion: SupplierPromotion | null;
  provenance: Provenance[];
};

type DiscoveryQueueResponse = {
  ok: boolean;
  items: DiscoveryCandidate[];
  governance: {
    humanApprovalRequired: true;
    identityPublic: false;
    outreachAllowed: false;
    supplierVerificationImplied: false;
  };
};

type IntakeForm = {
  requirementId: string;
  companyName: string;
  website: string;
  countryCode: string;
  city: string;
  primaryIndustry: string;
  relevanceScore: string;
  relevanceRationale: string;
  sourceType: string;
  sourceName: string;
  sourceUrl: string;
  registryNumber: string;
  sourceSummary: string;
  sourceExcerpt: string;
  signals: string;
  sourceSnapshot: string;
};

type PromotionChecklistKey =
  | "legalIdentityConfirmed"
  | "countryOfRegistrationConfirmed"
  | "requirementProductRelevanceConfirmed"
  | "publicBusinessContactConfirmed"
  | "evidenceReviewedByHuman"
  | "noOutreachAuthorized";

type PromotionDraft = {
  legalName: string;
  countryCode: string;
  officialEvidenceId: string;
  contactEvidenceId: string;
  contactType: "email" | "phone" | "website";
  contactValue: string;
  decisionNotes: string;
  checklist: Record<PromotionChecklistKey, boolean>;
};

const PROMOTION_CHECKLIST: Array<{
  key: PromotionChecklistKey;
  label: string;
}> = [
  { key: "legalIdentityConfirmed", label: "Legal identity matches the government registry" },
  { key: "countryOfRegistrationConfirmed", label: "Country of registration is confirmed" },
  { key: "requirementProductRelevanceConfirmed", label: "Evidence matches this requirement product" },
  { key: "publicBusinessContactConfirmed", label: "The contact is an official public business channel" },
  { key: "evidenceReviewedByHuman", label: "I reviewed the selected source snapshots" },
  { key: "noOutreachAuthorized", label: "This decision does not authorize outreach or an RFQ" },
];

const EMPTY_FORM: IntakeForm = {
  requirementId: "",
  companyName: "",
  website: "",
  countryCode: "",
  city: "",
  primaryIndustry: "",
  relevanceScore: "78",
  relevanceRationale: "",
  sourceType: "official_website",
  sourceName: "",
  sourceUrl: "",
  registryNumber: "",
  sourceSummary: "",
  sourceExcerpt: "",
  signals: "",
  sourceSnapshot: "",
};

function defaultPromotionDraft(candidate: DiscoveryCandidate): PromotionDraft {
  const officialEvidence = candidate.provenance.find(
    (source) => source.sourceType === "government_registry",
  );
  const contactEvidence = candidate.provenance.find(
    (source) =>
      source.id !== officialEvidence?.id &&
      ["official_website", "government_registry"].includes(source.sourceType),
  );
  return {
    legalName: candidate.companyName,
    countryCode: candidate.countryCode || "",
    officialEvidenceId: officialEvidence?.id || "",
    contactEvidenceId: contactEvidence?.id || "",
    contactType: "website",
    contactValue: candidate.website || "",
    decisionNotes: "",
    checklist: {
      legalIdentityConfirmed: false,
      countryOfRegistrationConfirmed: false,
      requirementProductRelevanceConfirmed: false,
      publicBusinessContactConfirmed: false,
      evidenceReviewedByHuman: false,
      noOutreachAuthorized: false,
    },
  };
}

const STATUS_LABELS: Record<DiscoveryStatus, string> = {
  discovered: "Discovered",
  under_review: "Under review",
  verification_pending: "Verification pending",
  rejected: "Rejected",
  promoted: "Promoted",
};

function statusClass(status: DiscoveryStatus) {
  if (status === "promoted") {
    return "border-emerald-300 bg-emerald-100 text-emerald-950";
  }
  if (status === "verification_pending") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (status === "under_review") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }
  if (status === "rejected") {
    return "border-red-200 bg-red-50 text-red-900";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Not recorded";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function AdminExportunitySupplierDiscoveryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DiscoveryStatus | "all">("all");
  const [showIntake, setShowIntake] = useState(false);
  const [form, setForm] = useState<IntakeForm>(EMPTY_FORM);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [promotionDrafts, setPromotionDrafts] = useState<
    Record<string, PromotionDraft>
  >({});
  const queryPath =
    status === "all"
      ? "/api/exportunity/supplier-discovery"
      : `/api/exportunity/supplier-discovery?status=${status}`;
  const queueQuery = useQuery<DiscoveryQueueResponse>({
    queryKey: [queryPath],
    staleTime: 10_000,
  });

  const intakeMutation = useMutation({
    mutationFn: async () => {
      if (form.sourceSnapshot.trim().length < 10) {
        throw new Error(
          "Paste the retrieved source snapshot so its SHA-256 fingerprint can be recorded.",
        );
      }
      const contentHash = await sha256(form.sourceSnapshot.trim());
      return apiRequest("/api/exportunity/supplier-discovery", "POST", {
        requirementId: form.requirementId.trim(),
        company: {
          name: form.companyName.trim(),
          website: form.website.trim() || undefined,
          countryCode: form.countryCode.trim().toUpperCase() || undefined,
          city: form.city.trim() || undefined,
          primaryIndustry: form.primaryIndustry.trim() || undefined,
        },
        relevance: {
          score: Number(form.relevanceScore),
          rationale: form.relevanceRationale.trim(),
        },
        source: {
          type: form.sourceType,
          name: form.sourceName.trim(),
          url: form.sourceUrl.trim(),
          retrievedAt: new Date().toISOString(),
          contentHash,
          evidence: {
            summary: form.sourceSummary.trim(),
            excerpt: form.sourceExcerpt.trim() || undefined,
            registryNumber: form.registryNumber.trim() || undefined,
            signals: form.signals
              .split(",")
              .map((signal) => signal.trim())
              .filter(Boolean),
          },
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          String(query.queryKey[0] || "").startsWith(
            "/api/exportunity/supplier-discovery",
          ),
      });
      setForm(EMPTY_FORM);
      setShowIntake(false);
      toast({
        title: "Discovery evidence recorded",
        description:
          "The company remains unverified and uncontacted in the human review queue.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Discovery evidence was not recorded",
        description: error?.message || "Check the required provenance fields.",
        variant: "destructive",
      });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (input: {
      candidate: DiscoveryCandidate;
      nextStatus: DiscoveryStatus;
    }) => {
      const notes = String(reviewNotes[input.candidate.id] || "").trim();
      if (!notes) throw new Error("Review notes are required.");
      return apiRequest(
        `/api/exportunity/supplier-discovery/${input.candidate.id}/review`,
        "PATCH",
        { status: input.nextStatus, notes },
      );
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          String(query.queryKey[0] || "").startsWith(
            "/api/exportunity/supplier-discovery",
          ),
      });
      setReviewNotes((current) => ({ ...current, [variables.candidate.id]: "" }));
      toast({
        title: "Review state updated",
        description:
          variables.nextStatus === "verification_pending"
            ? "Evidence is queued for verification; this is not a verified supplier yet."
            : `Candidate moved to ${STATUS_LABELS[variables.nextStatus].toLowerCase()}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Review could not be saved",
        description: error?.message || "Reload the queue and try again.",
        variant: "destructive",
      });
    },
  });

  const promotionMutation = useMutation({
    mutationFn: async (candidate: DiscoveryCandidate) => {
      const draft = promotionDrafts[candidate.id] || defaultPromotionDraft(candidate);
      if (candidate.provenance.length < 2) {
        throw new Error("At least two independent evidence snapshots are required.");
      }
      if (!draft.officialEvidenceId || !draft.contactEvidenceId) {
        throw new Error(
          "Select different government-registry and official-contact evidence snapshots.",
        );
      }
      if (draft.officialEvidenceId === draft.contactEvidenceId) {
        throw new Error("Identity and contact evidence must be different snapshots.");
      }
      if (!PROMOTION_CHECKLIST.every(({ key }) => draft.checklist[key])) {
        throw new Error("Every human verification attestation must be confirmed.");
      }
      const selectedEvidenceIds = Array.from(
        new Set([
          draft.officialEvidenceId,
          draft.contactEvidenceId,
          ...candidate.provenance.map((source) => source.id),
        ]),
      )
        .filter(Boolean)
        .slice(0, 10);
      return apiRequest(
        `/api/exportunity/supplier-discovery/${candidate.id}/promote`,
        "POST",
        {
          legalName: draft.legalName.trim(),
          countryCode: draft.countryCode.trim().toUpperCase(),
          selectedEvidenceIds,
          officialEvidenceId: draft.officialEvidenceId,
          contactEvidenceId: draft.contactEvidenceId,
          contact: {
            type: draft.contactType,
            value: draft.contactValue.trim(),
          },
          checklist: draft.checklist,
          decisionNotes: draft.decisionNotes.trim(),
        },
      );
    },
    onSuccess: (_result, candidate) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          String(query.queryKey[0] || "").startsWith(
            "/api/exportunity/supplier-discovery",
          ),
      });
      setPromotionDrafts((current) => {
        const next = { ...current };
        delete next[candidate.id];
        return next;
      });
      toast({
        title: "Supplier profile verified and promoted",
        description:
          "The private profile is eligible for internal matching. Outreach, RFQs, capacity, certifications, and performance remain unapproved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Supplier promotion was blocked",
        description:
          error?.message || "Review the official evidence and attestations.",
        variant: "destructive",
      });
    },
  });

  const counts = useMemo(() => {
    const result = {
      discovered: 0,
      under_review: 0,
      verification_pending: 0,
      rejected: 0,
      promoted: 0,
    };
    for (const item of queueQuery.data?.items || []) result[item.status] += 1;
    return result;
  }, [queueQuery.data?.items]);

  function setField<Key extends keyof IntakeForm>(key: Key, value: IntakeForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updatePromotionDraft(
    candidate: DiscoveryCandidate,
    update: Partial<PromotionDraft>,
  ) {
    setPromotionDrafts((current) => {
      const previous = current[candidate.id] || defaultPromotionDraft(candidate);
      return {
        ...current,
        [candidate.id]: {
          ...previous,
          ...update,
          checklist: update.checklist
            ? { ...previous.checklist, ...update.checklist }
            : previous.checklist,
        },
      };
    });
  }

  return (
    <div className="min-h-screen bg-[#f5f6f3] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,.08)]">
          <div className="border-b border-slate-200 bg-[linear-gradient(120deg,#0f2f26,#174c3a)] p-6 text-white md:p-8">
            <div className="text-xs font-black uppercase tracking-[0.28em] text-[#f5ba4d]">
              Exportunity sourcing governance
            </div>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                  Supplier discovery review
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-50/85">
                  Record externally discovered companies with source provenance.
                  Every record stays unverified, private, and blocked from outreach
                  until a separate governed supplier-onboarding decision.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/admin/exportunity/supplier-rfqs"
                  className="inline-flex items-center rounded-md border border-white/25 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/20"
                >
                  <FileSearch className="mr-2 h-4 w-4" />
                  RFQ approvals
                </a>
                <Button
                  variant="outline"
                  className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => queueQuery.refetch()}
                  disabled={queueQuery.isFetching}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${queueQuery.isFetching ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
                <Button
                  className="bg-[#f5ba4d] font-black text-[#143a2d] hover:bg-[#ffd27a]"
                  onClick={() => setShowIntake((current) => !current)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Record evidence
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-3 md:p-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 font-black text-emerald-950">
                <Fingerprint className="h-5 w-5" />
                Provenance required
              </div>
              <p className="mt-2 text-sm leading-6 text-emerald-900/80">
                Source URL, retrieval time, evidence summary, and SHA-256 snapshot
                fingerprint are mandatory.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <div className="flex items-center gap-2 font-black text-sky-950">
                <ShieldCheck className="h-5 w-5" />
                Human verification queue
              </div>
              <p className="mt-2 text-sm leading-6 text-sky-900/80">
                “Verification pending” is a queue state, never a verified-supplier
                claim.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 font-black text-amber-950">
                <ShieldAlert className="h-5 w-5" />
                No outreach
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-900/80">
                This queue cannot send email, SMS, WhatsApp, RFQs, or create quotes.
              </p>
            </div>
          </div>
        </section>

        {showIntake ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                <FileSearch className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-black">Record a sourced company</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Paste only a concise excerpt for review. The full snapshot is
                  fingerprinted locally and is not stored by this form.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Requirement UUID">
                <input
                  className={inputClass}
                  value={form.requirementId}
                  onChange={(event) => setField("requirementId", event.target.value)}
                  placeholder="Governed requirement ID"
                />
              </Field>
              <Field label="Company name">
                <input
                  className={inputClass}
                  value={form.companyName}
                  onChange={(event) => setField("companyName", event.target.value)}
                />
              </Field>
              <Field label="Company website">
                <input
                  className={inputClass}
                  type="url"
                  value={form.website}
                  onChange={(event) => setField("website", event.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Country code">
                <input
                  className={inputClass}
                  value={form.countryCode}
                  onChange={(event) => setField("countryCode", event.target.value)}
                  maxLength={2}
                  placeholder="CI"
                />
              </Field>
              <Field label="City">
                <input
                  className={inputClass}
                  value={form.city}
                  onChange={(event) => setField("city", event.target.value)}
                />
              </Field>
              <Field label="Primary industry">
                <input
                  className={inputClass}
                  value={form.primaryIndustry}
                  onChange={(event) => setField("primaryIndustry", event.target.value)}
                  placeholder="Exact product or industrial capability"
                />
              </Field>
              <Field label="Relevance score" hint="Minimum 60; evidence must still explicitly match the product.">
                <input
                  className={inputClass}
                  type="number"
                  min={60}
                  max={100}
                  value={form.relevanceScore}
                  onChange={(event) => setField("relevanceScore", event.target.value)}
                />
              </Field>
              <Field label="Source type">
                <select
                  className={inputClass}
                  value={form.sourceType}
                  onChange={(event) => setField("sourceType", event.target.value)}
                >
                  <option value="official_website">Official website</option>
                  <option value="government_registry">Government registry</option>
                  <option value="trade_directory">Trade directory</option>
                  <option value="marketplace">Marketplace</option>
                  <option value="search_result">Search result</option>
                  <option value="manual_research">Manual research</option>
                </select>
              </Field>
              <Field label="Source name">
                <input
                  className={inputClass}
                  value={form.sourceName}
                  onChange={(event) => setField("sourceName", event.target.value)}
                  placeholder="Registry or page title"
                />
              </Field>
              <Field label="Source URL">
                <input
                  className={inputClass}
                  type="url"
                  value={form.sourceUrl}
                  onChange={(event) => setField("sourceUrl", event.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field
                label="Government registry number"
                hint="Required later for supplier verification; leave blank for non-registry sources."
              >
                <input
                  className={inputClass}
                  value={form.registryNumber}
                  onChange={(event) => setField("registryNumber", event.target.value)}
                  placeholder="Official registration identifier"
                />
              </Field>
              <Field label="Evidence signals" hint="Comma-separated exact products or capabilities.">
                <input
                  className={inputClass}
                  value={form.signals}
                  onChange={(event) => setField("signals", event.target.value)}
                  placeholder="RBD palm oil, bulk export"
                />
              </Field>
              <Field label="Relevance rationale">
                <textarea
                  className={`${inputClass} min-h-24 resize-y`}
                  value={form.relevanceRationale}
                  onChange={(event) =>
                    setField("relevanceRationale", event.target.value)
                  }
                />
              </Field>
              <Field label="Evidence summary">
                <textarea
                  className={`${inputClass} min-h-24 resize-y`}
                  value={form.sourceSummary}
                  onChange={(event) => setField("sourceSummary", event.target.value)}
                />
              </Field>
              <Field label="Short source excerpt">
                <textarea
                  className={`${inputClass} min-h-24 resize-y`}
                  value={form.sourceExcerpt}
                  onChange={(event) => setField("sourceExcerpt", event.target.value)}
                />
              </Field>
              <Field
                label="Retrieved source snapshot"
                hint="Used only to calculate SHA-256 in this browser; the snapshot itself is not submitted."
              >
                <textarea
                  className={`${inputClass} min-h-28 resize-y font-mono text-xs`}
                  value={form.sourceSnapshot}
                  onChange={(event) => setField("sourceSnapshot", event.target.value)}
                />
              </Field>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                className="bg-[#146c43] font-black text-white hover:bg-[#105637]"
                disabled={intakeMutation.isPending}
                onClick={() => intakeMutation.mutate()}
              >
                {intakeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Fingerprint className="mr-2 h-4 w-4" />
                )}
                Fingerprint and record
              </Button>
              <Button variant="outline" onClick={() => setShowIntake(false)}>
                Cancel
              </Button>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Human review queue</h2>
              <p className="mt-1 text-sm text-slate-600">
                Company identity and source details are visible only to authorized
                Exportunity staff.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "discovered", "under_review", "verification_pending", "promoted", "rejected"] as const).map(
                (item) => (
                  <Button
                    key={item}
                    size="sm"
                    variant={status === item ? "default" : "outline"}
                    className={status === item ? "bg-[#146c43] hover:bg-[#105637]" : ""}
                    onClick={() => setStatus(item)}
                  >
                    {item === "all" ? "All" : STATUS_LABELS[item]}
                    {item !== "all" && status === "all" ? (
                      <span className="ml-1.5 text-xs opacity-70">{counts[item]}</span>
                    ) : null}
                  </Button>
                ),
              )}
            </div>
          </div>

          {queueQuery.isPending ? (
            <div className="grid min-h-56 place-items-center">
              <Loader2 className="h-7 w-7 animate-spin text-[#146c43]" />
            </div>
          ) : queueQuery.isError ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-950">
              The discovery queue could not be loaded. Refresh after confirming
              your Exportunity staff session.
            </div>
          ) : queueQuery.data?.items.length ? (
            <div className="mt-6 space-y-4">
              {queueQuery.data.items.map((candidate) => {
                const canReview =
                  candidate.status !== "rejected" && !candidate.promotion;
                const promotionDraft =
                  promotionDrafts[candidate.id] || defaultPromotionDraft(candidate);
                const registryEvidence = candidate.provenance.filter(
                  (source) => source.sourceType === "government_registry",
                );
                const contactEvidence = candidate.provenance.filter(
                  (source) =>
                    source.id !== promotionDraft.officialEvidenceId &&
                    ["official_website", "government_registry"].includes(
                      source.sourceType,
                    ),
                );
                const nextPrimaryStatus =
                  candidate.status === "discovered"
                    ? "under_review"
                    : candidate.status === "under_review"
                      ? "verification_pending"
                      : "under_review";
                return (
                  <article
                    key={candidate.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-black">{candidate.companyName}</h3>
                          <Badge className={`border ${statusClass(candidate.status)}`}>
                            {STATUS_LABELS[candidate.status]}
                          </Badge>
                          {candidate.promotion ? (
                            <Badge className="border border-emerald-300 bg-emerald-100 text-emerald-950">
                              Verified supplier profile
                            </Badge>
                          ) : (
                            <Badge className="border border-slate-300 bg-white text-slate-700">
                              Unverified
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {candidate.primaryIndustry || "Industry not recorded"}
                          {candidate.city || candidate.countryCode
                            ? ` • ${[candidate.city, candidate.countryCode].filter(Boolean).join(", ")}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Requirement {candidate.requirementReferenceCode} • {candidate.requirementTitle}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
                        <div className="text-2xl font-black text-emerald-900">
                          {candidate.relevanceScore}
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                          Evidence relevance
                        </div>
                      </div>
                    </div>

                    <p className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
                      {candidate.relevanceRationale}
                    </p>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {candidate.provenance.map((source) => (
                        <div
                          key={source.id}
                          className="rounded-xl border border-slate-200 bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-black">{source.sourceName}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {source.sourceType.replace(/_/g, " ")} • {formatDate(source.retrievedAt)}
                              </div>
                            </div>
                            <a
                              href={source.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                              aria-label="Open source"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-700">
                            {source.evidence.summary || "No summary recorded"}
                          </p>
                          <code className="mt-3 block truncate rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] text-slate-600">
                            sha256:{source.contentHash}
                          </code>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        Contact: not contacted
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        Outreach: blocked
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        Supplier profile: {candidate.promotion ? "private verified profile" : "not created"}
                      </span>
                    </div>

                    {candidate.promotion ? (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                        <div className="flex items-center gap-2 font-black">
                          <ShieldCheck className="h-4 w-4" />
                          Human verification decision recorded
                        </div>
                        <p className="mt-2 leading-6">
                          {candidate.promotion.legalName} was promoted on {formatDate(candidate.promotion.approvedAt)}.
                          The scope is business identity and relevance to this requirement product only.
                        </p>
                        <p className="mt-2 text-xs font-bold text-emerald-800">
                          Private profile {candidate.promotion.supplierProfileId} • outreach and RFQs remain blocked
                        </p>
                      </div>
                    ) : null}

                    {canReview ? (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                        <textarea
                          className={`${inputClass} min-h-20 resize-y`}
                          value={reviewNotes[candidate.id] || ""}
                          onChange={(event) =>
                            setReviewNotes((current) => ({
                              ...current,
                              [candidate.id]: event.target.value,
                            }))
                          }
                          placeholder="Required human review notes"
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="bg-[#146c43] hover:bg-[#105637]"
                            disabled={reviewMutation.isPending}
                            onClick={() =>
                              reviewMutation.mutate({
                                candidate,
                                nextStatus: nextPrimaryStatus,
                              })
                            }
                          >
                            {nextPrimaryStatus === "verification_pending" ? (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            ) : (
                              <Search className="mr-2 h-4 w-4" />
                            )}
                            {nextPrimaryStatus === "verification_pending"
                              ? "Queue verification"
                              : candidate.status === "verification_pending"
                                ? "Return to review"
                                : "Start review"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-800 hover:bg-red-50"
                            disabled={reviewMutation.isPending}
                            onClick={() =>
                              reviewMutation.mutate({
                                candidate,
                                nextStatus: "rejected",
                              })
                            }
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Reject evidence
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {candidate.status === "verification_pending" &&
                    !candidate.promotion ? (
                      <div className="mt-4 rounded-2xl border-2 border-emerald-200 bg-white p-4 md:p-5">
                        <div className="flex items-start gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                            <ShieldCheck className="h-5 w-5" />
                          </span>
                          <div>
                            <h4 className="font-black text-emerald-950">
                              Human supplier verification and promotion
                            </h4>
                            <p className="mt-1 text-sm leading-6 text-slate-600">
                              Requires fresh government-registry identity evidence,
                              separate official contact evidence, and explicit human
                              attestations. Promotion stays private and creates no outreach.
                            </p>
                          </div>
                        </div>

                        {candidate.provenance.length < 2 ||
                        registryEvidence.length === 0 ||
                        contactEvidence.length === 0 ? (
                          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                            Promotion is blocked until this candidate has at least two
                            distinct snapshots: one government registry record with a
                            registry number and one separate official website or registry
                            source supporting the business contact.
                          </div>
                        ) : null}

                        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          <Field label="Confirmed legal name">
                            <input
                              className={inputClass}
                              value={promotionDraft.legalName}
                              onChange={(event) =>
                                updatePromotionDraft(candidate, {
                                  legalName: event.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Registration country">
                            <input
                              className={inputClass}
                              maxLength={2}
                              value={promotionDraft.countryCode}
                              onChange={(event) =>
                                updatePromotionDraft(candidate, {
                                  countryCode: event.target.value.toUpperCase(),
                                })
                              }
                              placeholder="CI"
                            />
                          </Field>
                          <Field
                            label="Government registry evidence"
                            hint="The snapshot must name the legal entity and include a registry number."
                          >
                            <select
                              className={inputClass}
                              value={promotionDraft.officialEvidenceId}
                              onChange={(event) => {
                                const officialEvidenceId = event.target.value;
                                const replacement = candidate.provenance.find(
                                  (source) =>
                                    source.id !== officialEvidenceId &&
                                    ["official_website", "government_registry"].includes(
                                      source.sourceType,
                                    ),
                                );
                                updatePromotionDraft(candidate, {
                                  officialEvidenceId,
                                  contactEvidenceId:
                                    promotionDraft.contactEvidenceId === officialEvidenceId
                                      ? replacement?.id || ""
                                      : promotionDraft.contactEvidenceId,
                                });
                              }}
                            >
                              <option value="">Select registry snapshot</option>
                              {registryEvidence.map((source) => (
                                <option key={source.id} value={source.id}>
                                  {source.sourceName}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Official contact evidence">
                            <select
                              className={inputClass}
                              value={promotionDraft.contactEvidenceId}
                              onChange={(event) =>
                                updatePromotionDraft(candidate, {
                                  contactEvidenceId: event.target.value,
                                })
                              }
                            >
                              <option value="">Select separate contact source</option>
                              {contactEvidence.map((source) => (
                                <option key={source.id} value={source.id}>
                                  {source.sourceName}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Business contact type">
                            <select
                              className={inputClass}
                              value={promotionDraft.contactType}
                              onChange={(event) =>
                                updatePromotionDraft(candidate, {
                                  contactType: event.target.value as PromotionDraft["contactType"],
                                })
                              }
                            >
                              <option value="website">Website</option>
                              <option value="email">Email</option>
                              <option value="phone">Phone</option>
                            </select>
                          </Field>
                          <Field
                            label="Confirmed public business contact"
                            hint="It must appear in the selected official contact evidence."
                          >
                            <input
                              className={inputClass}
                              value={promotionDraft.contactValue}
                              onChange={(event) =>
                                updatePromotionDraft(candidate, {
                                  contactValue: event.target.value,
                                })
                              }
                              placeholder="https://supplier.example"
                            />
                          </Field>
                        </div>

                        <div className="mt-5 grid gap-2 md:grid-cols-2">
                          {PROMOTION_CHECKLIST.map(({ key, label }) => (
                            <label
                              key={key}
                              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-800"
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-emerald-700"
                                checked={promotionDraft.checklist[key]}
                                onChange={(event) =>
                                  updatePromotionDraft(candidate, {
                                    checklist: {
                                      ...promotionDraft.checklist,
                                      [key]: event.target.checked,
                                    },
                                  })
                                }
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>

                        <Field
                          label="Verification decision notes"
                          hint="Minimum 24 characters; state what was checked and any limits."
                        >
                          <textarea
                            className={`${inputClass} min-h-24 resize-y`}
                            value={promotionDraft.decisionNotes}
                            onChange={(event) =>
                              updatePromotionDraft(candidate, {
                                decisionNotes: event.target.value,
                              })
                            }
                            placeholder="Government registry identity and official business contact reviewed against the requirement evidence..."
                          />
                        </Field>

                        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-bold leading-5 text-emerald-900">
                            Result: private active supplier profile + candidate match. No
                            message, RFQ, quote, capacity, certification, or performance
                            approval.
                          </p>
                          <Button
                            className="shrink-0 bg-emerald-800 font-black hover:bg-emerald-900"
                            disabled={promotionMutation.isPending}
                            onClick={() => promotionMutation.mutate(candidate)}
                          >
                            {promotionMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Verify and promote
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <div>
                <FileSearch className="mx-auto h-9 w-9 text-slate-400" />
                <div className="mt-3 font-black">No discovery evidence in this queue</div>
                <p className="mt-1 text-sm text-slate-500">
                  No synthetic supplier records are created to fill an empty state.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
