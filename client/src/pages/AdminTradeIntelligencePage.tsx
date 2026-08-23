import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Database,
  ExternalLink,
  Globe2,
  ListChecks,
  LoaderCircle,
  Network,
  Plus,
  Radar,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  TradeNewsroomAdminPanel,
  type TradeNewsroomQueue,
} from "@/components/exportunity/TradeNewsroomAdminPanel";

type CountRow = { total: number; [key: string]: unknown };
type CoverageCell = {
  id: string;
  countryCode: string;
  dimension: string;
  sectorCode: string;
  status: string;
  coveragePercent: number;
  qualityScore: number;
  entityCount: number;
  factCount: number;
  verifiedFactCount: number;
  sourceCount: number;
  missingFields: string[];
  updatedAt: string;
};
type DemandEvent = {
  id: string;
  eventType: string;
  normalizedProduct: string | null;
  queryText: string | null;
  destinationCountryCode: string | null;
  sectorCode: string | null;
  commercialIntent: string | null;
  resultCount: number | null;
  occurredAt: string;
};
type DemandSignal = {
  product: string;
  destinationCountryCode: string | null;
  sectorCode: string | null;
  eventCount: number;
  zeroResultCount: number;
  commercialEventCount: number;
  demandScore: number;
  averageDifficulty: number;
  estimatedValues: Record<string, number>;
};
type ResearchMission = {
  id: string;
  canonicalTaskId: number | null;
  missionType: string;
  title: string;
  objective: string;
  countryCode: string | null;
  sectorCode: string | null;
  priority: string;
  status: string;
  approvalStatus: string;
  evidenceCount: number;
  resultSummary: string | null;
  recommendedActions: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
};
type Source = {
  id: string;
  name: string;
  sourceType: string;
  status: string;
  countryCode: string | null;
  baseUrl: string;
  domain: string | null;
  trustScore: string;
  robotsPolicy: string;
  lastSucceededAt: string | null;
  lastError: string | null;
};
type SourceSnapshot = {
  id: string;
  sourceId: string;
  entityId: string | null;
  documentKey: string;
  snapshotType: string;
  sourceUrl: string;
  documentTitle: string;
  issuingInstitution: string | null;
  jurisdictionCountryCode: string | null;
  versionLabel: string | null;
  contentHash: string;
  publishedAt: string | null;
  effectiveAt: string | null;
  retrievedAt: string;
};
type SourceComparison = {
  id: string;
  sourceId: string;
  previousSnapshotId: string;
  currentSnapshotId: string;
  canonicalTaskId: number | null;
  documentKey: string;
  changedFields: string[];
  addedPassages: string[];
  removedPassages: string[];
  textSimilarity: string;
  materialityScore: number;
  isSubstantive: boolean;
  deterministicSummary: string;
  status: string;
  createdAt: string;
};
type IntelligenceAlert = {
  id: string;
  comparisonId: string;
  regulatoryChangeId: string | null;
  title: string;
  summary: string;
  consequences: string | null;
  severity: string;
  verificationStatus: string;
  publicationStatus: string;
  deliveryStatus: string;
  affectedProducts: string[];
  affectedCountryCodes: string[];
  affectedRoutes: string[];
  recommendedActions: string[];
  sourceUrl: string;
  sourcePublishedAt: string | null;
  effectiveAt: string | null;
  affectedRequirementCount: number;
  affectedRegisteredUserCount: number;
  impactRecordCount: number;
  createdAt: string;
};
type RegulatoryChange = {
  id: string;
  jurisdictionCountryCode: string;
  title: string;
  severity: string;
  verificationStatus: string;
  publicationStatus: string;
  detectedAt: string;
  sourceUrl: string;
};
type KnowledgeEntity = {
  id: string;
  entityType: string;
  displayName: string;
  countryCode: string | null;
  sectorCode: string | null;
  verificationStatus: string;
  publicationStatus: string;
  publicationEligibilityScore: number;
  lastVerifiedAt: string | null;
  updatedAt: string;
};
type SectorCatalogEntry = {
  id: string;
  code: string;
  name: string;
  nameFr: string | null;
  description: string;
  status: "draft" | "review" | "active" | "retired";
  coverageTier: "priority" | "research_backlog";
  canonicalCategoryCodes: string[];
  rationale: string;
  approvedAt: string | null;
  updatedAt: string;
};
type Dashboard = {
  ok: boolean;
  phaseOne: {
    countries: Array<{ code: string; name: string }>;
    sectors: Array<{ code: string; name: string }>;
  };
  coveragePlan: {
    scope: "africa_54";
    countryCount: number;
    priorityCountryCount: number;
    countries: Array<{ code: string; name: string }>;
    priorityCountries: Array<{ code: string; name: string }>;
    sectors: Array<{ code: string; name: string }>;
    activeSectorCount: number;
    proposedSectorCount: number;
    emptyCoverageIsNotEvidence: boolean;
  };
  graph: {
    sources: CountRow[];
    entities: CountRow[];
    facts: CountRow[];
    relationshipCount: number;
  };
  coverage: CoverageCell[];
  demandRadar: DemandSignal[];
  recentDemand: DemandEvent[];
  missions: ResearchMission[];
  regulatoryChanges: RegulatoryChange[];
  sources: Source[];
  entities: KnowledgeEntity[];
  sourceSnapshots: SourceSnapshot[];
  sourceComparisons: SourceComparison[];
  intelligenceAlerts: IntelligenceAlert[];
  sectorCatalog: SectorCatalogEntry[];
  newsroom: TradeNewsroomQueue;
  governance: {
    publicationRequiresHumanApproval: boolean;
    externalCommunicationAllowed: boolean;
    canonicalMissionExecutionSystem: string;
    publicationEligibilityThreshold: number;
    sourceMonitoringMode: string;
    automaticAlertDelivery: boolean;
  };
};

type SourceForm = {
  name: string;
  sourceType: string;
  baseUrl: string;
  countryCode: string;
  trustScore: string;
};
type EvidenceForm = {
  sourceId: string;
  evidenceType: string;
  title: string;
  sourceUrl: string;
  evidenceExcerpt: string;
  verificationStatus: string;
};
type SnapshotForm = {
  snapshotType: string;
  sourceUrl: string;
  documentTitle: string;
  issuingInstitution: string;
  jurisdictionCountryCode: string;
  versionLabel: string;
  publishedAt: string;
  effectiveAt: string;
  contentText: string;
  affectedProducts: string;
  affectedIndustries: string;
  affectedHsCodes: string;
  affectedCountryCodes: string;
  affectedRoutes: string;
};
type ComparisonReviewForm = {
  action: "confirm" | "dismiss";
  reviewNotes: string;
  consequences: string;
  recommendedActions: string;
  severity: "informational" | "material" | "critical";
  isSubstantive: boolean;
};

const EMPTY_SOURCE: SourceForm = {
  name: "",
  sourceType: "official_registry",
  baseUrl: "",
  countryCode: "",
  trustScore: "0.75",
};
const EMPTY_EVIDENCE: EvidenceForm = {
  sourceId: "",
  evidenceType: "source_document",
  title: "",
  sourceUrl: "",
  evidenceExcerpt: "",
  verificationStatus: "under_review",
};
const EMPTY_SNAPSHOT: SnapshotForm = {
  snapshotType: "regulatory",
  sourceUrl: "",
  documentTitle: "",
  issuingInstitution: "",
  jurisdictionCountryCode: "",
  versionLabel: "",
  publishedAt: "",
  effectiveAt: "",
  contentText: "",
  affectedProducts: "",
  affectedIndustries: "",
  affectedHsCodes: "",
  affectedCountryCodes: "",
  affectedRoutes: "",
};
const EMPTY_COMPARISON_REVIEW: ComparisonReviewForm = {
  action: "confirm",
  reviewNotes: "",
  consequences: "",
  recommendedActions: "",
  severity: "informational",
  isSubstantive: false,
};

function readable(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sumCounts(rows: CountRow[]) {
  return rows.reduce((total, row) => total + Number(row.total || 0), 0);
}

function statusClass(status: string) {
  if (["verified", "active", "completed", "approved", "confirmed"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (["partial", "awaiting_review", "proposed", "pending", "review_pending", "review", "withheld"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (["blocked", "disputed", "degraded", "stale"].includes(status)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function splitList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function asIsoOrNull(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

export default function AdminTradeIntelligencePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceForm, setSourceForm] = useState<SourceForm>(EMPTY_SOURCE);
  const [evidenceMission, setEvidenceMission] = useState<ResearchMission | null>(null);
  const [evidenceForm, setEvidenceForm] = useState<EvidenceForm>(EMPTY_EVIDENCE);
  const [snapshotSource, setSnapshotSource] = useState<Source | null>(null);
  const [snapshotForm, setSnapshotForm] = useState<SnapshotForm>(EMPTY_SNAPSHOT);
  const [comparisonReview, setComparisonReview] = useState<SourceComparison | null>(null);
  const [comparisonReviewForm, setComparisonReviewForm] = useState<ComparisonReviewForm>(EMPTY_COMPARISON_REVIEW);
  const [coverageCountryScope, setCoverageCountryScope] = useState("priority");
  const dashboardQuery = useQuery<Dashboard>({
    queryKey: ["/api/trade/admin/dashboard"],
  });
  const dashboard = dashboardQuery.data;

  const registerSource = useMutation({
    mutationFn: async () =>
      apiRequest("/api/trade/admin/sources", "POST", {
        ...sourceForm,
        countryCode: sourceForm.countryCode || null,
        trustScore: Number(sourceForm.trustScore),
        accessPolicy: "public",
        robotsPolicy: "unknown",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade/admin/dashboard"] });
      setSourceForm(EMPTY_SOURCE);
      setSourceOpen(false);
      toast({ title: "Source registered", description: "The registry now tracks this provenance source." });
    },
    onError: (error: Error) =>
      toast({ title: "Source not registered", description: error.message, variant: "destructive" }),
  });
  const proposeMission = useMutation({
    mutationFn: async (eventId: string) =>
      apiRequest(`/api/trade/admin/demand-events/${eventId}/propose-mission`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade/admin/dashboard"] });
      toast({ title: "Research mission proposed", description: "A canonical approval-pending task was created in Agent OS." });
    },
    onError: (error: Error) =>
      toast({ title: "Mission not proposed", description: error.message, variant: "destructive" }),
  });
  const queueSectorProposal = useMutation({
    mutationFn: async (eventId: string) =>
      apiRequest(
        `/api/trade/admin/demand-events/${eventId}/queue-sector-proposal`,
        "POST",
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade/admin/dashboard"] });
      toast({
        title: "Data-intelligence employee assigned",
        description:
          "A visible governed sector-draft task was queued. Outreach and activation remain off.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Sector proposal not queued",
        description: error.message,
        variant: "destructive",
      }),
  });
  const updateMission = useMutation({
    mutationFn: async (input: { missionId: string; status: string; approvalStatus: string }) =>
      apiRequest(`/api/trade/admin/missions/${input.missionId}`, "PATCH", {
        status: input.status,
        approvalStatus: input.approvalStatus,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade/admin/dashboard"] });
      toast({ title: "Mission updated", description: "The linked Agent OS task was synchronized." });
    },
    onError: (error: Error) =>
      toast({ title: "Mission not updated", description: error.message, variant: "destructive" }),
  });
  const reviewEntity = useMutation({
    mutationFn: async (input: {
      entityId: string;
      action: "request_review" | "approve" | "publish" | "withdraw";
    }) =>
      apiRequest(`/api/trade/admin/entities/${input.entityId}/review`, "PATCH", {
        action: input.action,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade/admin/dashboard"] });
      toast({ title: "Entity review completed", description: "Publication state and evidence eligibility were rechecked." });
    },
    onError: (error: Error) =>
      toast({ title: "Entity not advanced", description: error.message, variant: "destructive" }),
  });
  const refreshCoverage = useMutation({
    mutationFn: async (coverageCellId: string) =>
      apiRequest(`/api/trade/admin/coverage/${coverageCellId}/refresh`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade/admin/dashboard"] });
    },
    onError: (error: Error) =>
      toast({ title: "Coverage not refreshed", description: error.message, variant: "destructive" }),
  });
  const recordEvidence = useMutation({
    mutationFn: async () => {
      if (!evidenceMission) throw new Error("Select a research mission.");
      return apiRequest(
        `/api/trade/admin/missions/${evidenceMission.id}/evidence`,
        "POST",
        {
          ...evidenceForm,
          evidenceExcerpt: evidenceForm.evidenceExcerpt || null,
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade/admin/dashboard"] });
      setEvidenceMission(null);
      setEvidenceForm(EMPTY_EVIDENCE);
      toast({ title: "Mission evidence recorded", description: "The verified-evidence count was recomputed from persisted citations." });
    },
    onError: (error: Error) =>
      toast({ title: "Evidence not recorded", description: error.message, variant: "destructive" }),
  });
  const captureSnapshot = useMutation({
    mutationFn: async () => {
      if (!snapshotSource) throw new Error("Select a registered source.");
      return apiRequest(
        `/api/trade/admin/sources/${snapshotSource.id}/snapshots`,
        "POST",
        {
          snapshotType: snapshotForm.snapshotType,
          sourceUrl: snapshotForm.sourceUrl,
          documentTitle: snapshotForm.documentTitle,
          issuingInstitution: snapshotForm.issuingInstitution || null,
          jurisdictionCountryCode:
            snapshotForm.jurisdictionCountryCode || null,
          versionLabel: snapshotForm.versionLabel || null,
          contentText: snapshotForm.contentText,
          structuredData: {},
          publishedAt: asIsoOrNull(snapshotForm.publishedAt),
          effectiveAt: asIsoOrNull(snapshotForm.effectiveAt),
          affectedProducts: splitList(snapshotForm.affectedProducts),
          affectedIndustries: splitList(snapshotForm.affectedIndustries),
          affectedHsCodes: splitList(snapshotForm.affectedHsCodes),
          affectedCountryCodes: splitList(
            snapshotForm.affectedCountryCodes,
          ),
          affectedRoutes: splitList(snapshotForm.affectedRoutes),
          metadata: { submittedFrom: "trade_command_center" },
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/trade/admin/dashboard"],
      });
      setSnapshotSource(null);
      setSnapshotForm(EMPTY_SNAPSHOT);
      toast({
        title: "Source version captured",
        description:
          "The baseline or comparison was persisted. No alert was delivered and no page was published.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Source version not captured",
        description: error.message,
        variant: "destructive",
      }),
  });
  const reviewComparison = useMutation({
    mutationFn: async () => {
      if (!comparisonReview) throw new Error("Select a source comparison.");
      return apiRequest(
        `/api/trade/admin/source-comparisons/${comparisonReview.id}/review`,
        "PATCH",
        {
          action: comparisonReviewForm.action,
          reviewNotes: comparisonReviewForm.reviewNotes,
          isSubstantive: comparisonReviewForm.isSubstantive,
          consequences: comparisonReviewForm.consequences || null,
          recommendedActions: splitList(
            comparisonReviewForm.recommendedActions,
          ),
          severity: comparisonReviewForm.severity,
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/trade/admin/dashboard"],
      });
      setComparisonReview(null);
      setComparisonReviewForm(EMPTY_COMPARISON_REVIEW);
      toast({
        title: "Source comparison reviewed",
        description:
          "The canonical task and draft intelligence records were synchronized. Delivery remains gated.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Comparison not reviewed",
        description: error.message,
        variant: "destructive",
      }),
  });

  const metrics = {
    sources: sumCounts(dashboard?.graph.sources || []),
    entities: sumCounts(dashboard?.graph.entities || []),
    facts: sumCounts(dashboard?.graph.facts || []),
    missions: dashboard?.missions.length || 0,
  };
  const countryCoverage = useMemo(() => {
    return (dashboard?.phaseOne.countries || []).map((country) => {
      const cells = (dashboard?.coverage || []).filter(
        (cell) => cell.countryCode === country.code,
      );
      const average = cells.length
        ? Math.round(cells.reduce((sum, cell) => sum + cell.coveragePercent, 0) / cells.length)
        : 0;
      const quality = cells.length
        ? Math.round(cells.reduce((sum, cell) => sum + cell.qualityScore, 0) / cells.length)
        : 0;
      return { ...country, cells, average, quality };
    });
  }, [dashboard?.coverage, dashboard?.phaseOne.countries]);
  const zeroResultEvents = (dashboard?.recentDemand || []).filter(
    (event) => event.eventType === "zero_result" || event.resultCount === 0,
  );
  const priorityCountryCodes = useMemo(
    () => new Set((dashboard?.phaseOne.countries || []).map((country) => country.code)),
    [dashboard?.phaseOne.countries],
  );
  const visibleCoverage = useMemo(
    () =>
      (dashboard?.coverage || []).filter((cell) =>
        coverageCountryScope === "priority"
          ? priorityCountryCodes.has(cell.countryCode)
          : cell.countryCode === coverageCountryScope,
      ),
    [coverageCountryScope, dashboard?.coverage, priorityCountryCodes],
  );

  const openSnapshotCapture = (source: Source) => {
    setSnapshotSource(source);
    setSnapshotForm({
      ...EMPTY_SNAPSHOT,
      sourceUrl: source.baseUrl,
      issuingInstitution: source.name,
      jurisdictionCountryCode: source.countryCode || "",
      affectedCountryCodes: source.countryCode || "",
    });
  };

  const openComparisonReview = (
    comparison: SourceComparison,
    action: "confirm" | "dismiss",
  ) => {
    setComparisonReview(comparison);
    setComparisonReviewForm({
      ...EMPTY_COMPARISON_REVIEW,
      action,
      isSubstantive: comparison.isSubstantive,
      severity:
        comparison.materialityScore >= 75
          ? "critical"
          : comparison.materialityScore >= 45
            ? "material"
            : "informational",
    });
  };

  const submitSource = (event: FormEvent) => {
    event.preventDefault();
    registerSource.mutate();
  };

  return (
    <main className="min-h-screen bg-[#F7F8FA] text-slate-950">
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-[#9A6700]">
              <Radar className="h-4 w-4" />
              Exportunity Trade Intelligence
            </div>
            <h1 className="text-3xl font-black tracking-tight text-[#07121F] sm:text-4xl">Intelligence Command Center</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Govern the evidence graph, demand radar, Africa-wide coverage, regulatory changes, and research missions without launching unapproved outreach or invisible agents.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/trade"><Globe2 className="mr-2 h-4 w-4" />Public trade hub</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/industrial-network"><Network className="mr-2 h-4 w-4" />Industrial network</Link>
            </Button>
            <Button variant="outline" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${dashboardQuery.isFetching ? "animate-spin" : ""}`} />Refresh
            </Button>
            <Button className="bg-[#0B3D32] text-white hover:bg-[#155849]" onClick={() => setSourceOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Register source
            </Button>
          </div>
        </header>

        {dashboardQuery.isLoading ? (
          <div className="grid min-h-[420px] place-items-center rounded-2xl border border-slate-200 bg-white">
            <div className="text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-3 h-8 w-8 animate-spin text-[#0B3D32]" />Loading cited intelligence…</div>
          </div>
        ) : dashboardQuery.isError || !dashboard ? (
          <Card className="border-rose-200 bg-rose-50"><CardContent className="flex items-start gap-3 p-6"><AlertTriangle className="mt-0.5 h-5 w-5 text-rose-700" /><div><h2 className="font-bold text-rose-950">Command center unavailable</h2><p className="mt-1 text-sm text-rose-800">The trade-intelligence schema or service could not be reached.</p></div></CardContent></Card>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Registered sources", value: metrics.sources, icon: Database },
                { label: "Knowledge entities", value: metrics.entities, icon: Network },
                { label: "Cited facts", value: metrics.facts, icon: BookOpenCheck },
                { label: "Research missions", value: metrics.missions, icon: ListChecks },
              ].map(({ label, value, icon: Icon }) => (
                <Card key={label} className="border-slate-200 bg-white shadow-sm">
                  <CardContent className="flex items-center justify-between p-5">
                    <div><div className="text-3xl font-black text-[#07121F]">{value}</div><div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div></div>
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#E7F2EE] text-[#0B3D32]"><Icon className="h-5 w-5" /></div>
                  </CardContent>
                </Card>
              ))}
            </section>

            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-800" />
                  <div><h2 className="font-black text-amber-950">Evidence and execution guardrails are active</h2><p className="mt-1 text-sm leading-6 text-amber-900/75">Publication needs a score of {dashboard.governance.publicationEligibilityThreshold}, verified multi-source evidence, and human approval. Research missions write to <strong>{dashboard.governance.canonicalMissionExecutionSystem}</strong>; external communication remains disabled.</p></div>
                </div>
                <Badge variant="outline" className="w-fit border-amber-300 bg-white text-amber-900">No automatic outreach</Badge>
              </CardContent>
            </Card>

            <Tabs defaultValue="coverage" className="space-y-5">
              <TabsList className="h-auto flex-wrap justify-start bg-white p-1 shadow-sm">
                <TabsTrigger value="coverage">Coverage matrix</TabsTrigger>
                <TabsTrigger value="graph">Knowledge graph</TabsTrigger>
                <TabsTrigger value="demand">Demand radar</TabsTrigger>
                <TabsTrigger value="missions">Work queue</TabsTrigger>
                <TabsTrigger value="sources">Source registry</TabsTrigger>
                <TabsTrigger value="newsroom">Newsroom</TabsTrigger>
                <TabsTrigger value="regulations">Regulatory changes</TabsTrigger>
              </TabsList>

              <TabsContent value="coverage" className="space-y-5">
                <Card className="border-[#0B3D32]/20 bg-[#E7F2EE]">
                  <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[.16em] text-[#0B3D32]">Africa completion plan</div>
                      <h2 className="mt-1 text-xl font-black text-[#07121F]">{dashboard.coveragePlan.countryCount} countries · {dashboard.coveragePlan.priorityCountryCount} launch priorities · {dashboard.coveragePlan.sectors.length} sectors</h2>
                      <p className="mt-1 text-sm text-slate-600">Every catalog row begins empty. A target becomes coverage only through cited evidence, verification, and accountable approval.</p>
                    </div>
                    <Badge variant="outline" className="w-fit border-[#0B3D32]/30 bg-white text-[#0B3D32]">Empty is not evidence</Badge>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 bg-white">
                  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">Governed industry-sector catalog</CardTitle>
                      <p className="mt-1 text-xs text-slate-500">{dashboard.coveragePlan.activeSectorCount} active · {dashboard.coveragePlan.proposedSectorCount} awaiting governance</p>
                    </div>
                    <Badge variant="outline" className="w-fit border-slate-300">Retirement preserves evidence</Badge>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {dashboard.sectorCatalog.map((sector) => (
                      <div key={sector.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-black uppercase tracking-wide text-[#9A6700]">{sector.code}</div>
                            <h3 className="mt-1 font-black text-[#07121F]">{sector.name}</h3>
                          </div>
                          <Badge variant="outline" className={statusClass(sector.status)}>{readable(sector.status)}</Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{sector.description}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {sector.canonicalCategoryCodes.map((code) => (
                            <Badge key={code} variant="outline" className="text-[10px]">{readable(code)}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <div className="grid gap-4 lg:grid-cols-5">
                  {countryCoverage.map((country) => (
                    <Card key={country.code} className="border-slate-200 bg-white">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between"><span className="text-xs font-black text-[#9A6700]">{country.code}</span><Badge variant="outline" className={statusClass(country.average === 100 ? "verified" : country.average ? "partial" : "empty")}>{country.average}%</Badge></div>
                        <h3 className="mt-4 font-black">{country.name}</h3>
                        <Progress value={country.average} className="mt-4 h-2" />
                        <div className="mt-3 flex justify-between text-xs text-slate-500"><span>Evidence coverage</span><span>Quality {country.quality}</span></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card className="border-slate-200 bg-white">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">Country × sector and evidence dimensions</CardTitle>
                      <p className="mt-1 text-xs text-slate-500">Showing {visibleCoverage.length} governed targets.</p>
                    </div>
                    <Select value={coverageCountryScope} onValueChange={setCoverageCountryScope}>
                      <SelectTrigger className="w-full bg-white sm:w-72">
                        <SelectValue placeholder="Choose coverage scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="priority">Priority markets ({dashboard.coveragePlan.priorityCountryCount})</SelectItem>
                        {dashboard.coveragePlan.countries.map((country) => (
                          <SelectItem key={country.code} value={country.code}>{country.code} · {country.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Scope</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Coverage</th><th className="px-5 py-3">Evidence</th><th className="px-5 py-3">Missing</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleCoverage.map((cell) => (
                          <tr key={cell.id} className="hover:bg-slate-50/60">
                            <td className="px-5 py-4"><div className="font-bold">{cell.countryCode} · {cell.sectorCode === "__all__" ? readable(cell.dimension) : readable(cell.sectorCode)}</div>{cell.sectorCode !== "__all__" && <div className="mt-1 text-xs text-slate-500">Sector profile</div>}</td>
                            <td className="px-5 py-4"><Badge variant="outline" className={statusClass(cell.status)}>{readable(cell.status)}</Badge></td>
                            <td className="px-5 py-4"><div className="flex min-w-32 items-center gap-3"><Progress value={cell.coveragePercent} className="h-1.5" /><span className="text-xs font-bold">{cell.coveragePercent}%</span></div></td>
                            <td className="px-5 py-4 text-xs text-slate-600">{cell.verifiedFactCount}/{cell.factCount} facts · {cell.sourceCount} sources</td>
                            <td className="max-w-xs px-5 py-4 text-xs text-slate-500">{cell.missingFields.length ? cell.missingFields.map(readable).join(", ") : "—"}</td>
                            <td className="px-5 py-4 text-right"><Button size="sm" variant="ghost" disabled={refreshCoverage.isPending} onClick={() => refreshCoverage.mutate(cell.id)}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Recompute</Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="graph">
                <Card className="border-slate-200 bg-white">
                  <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Network className="h-5 w-5 text-[#0B3D32]" />Entity publication queue</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {dashboard.entities.length ? dashboard.entities.map((entity) => (
                      <div key={entity.id} className="grid gap-4 rounded-xl border border-slate-200 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-black">{entity.displayName}</h3>
                            <Badge variant="outline">{readable(entity.entityType)}</Badge>
                            <Badge variant="outline" className={statusClass(entity.verificationStatus)}>{readable(entity.verificationStatus)}</Badge>
                            <Badge variant="outline" className={statusClass(entity.publicationStatus)}>{readable(entity.publicationStatus)}</Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>{entity.countryCode || "global"}</span>
                            <span>{entity.sectorCode ? readable(entity.sectorCode) : "all sectors"}</span>
                            <span>Eligibility {entity.publicationEligibilityScore}/100</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {entity.publicationStatus === "draft" && (
                            <Button size="sm" variant="outline" disabled={reviewEntity.isPending} onClick={() => reviewEntity.mutate({ entityId: entity.id, action: "request_review" })}>Request review</Button>
                          )}
                          {["review", "approved"].includes(entity.publicationStatus) && (
                            <Button size="sm" className="bg-[#0B3D32] text-white hover:bg-[#155849]" disabled={reviewEntity.isPending || entity.publicationEligibilityScore < 75} onClick={() => reviewEntity.mutate({ entityId: entity.id, action: "publish" })}>Publish verified</Button>
                          )}
                          {entity.publicationStatus === "published" && (
                            <Button size="sm" variant="outline" disabled={reviewEntity.isPending} onClick={() => reviewEntity.mutate({ entityId: entity.id, action: "withdraw" })}>Withdraw</Button>
                          )}
                        </div>
                      </div>
                    )) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No knowledge entities exist. Register sources, entities, and cited facts before publication review.</div>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="demand" className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
                <Card className="border-slate-200 bg-white">
                  <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-[#0B3D32]" />Ranked demand clusters</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {dashboard.demandRadar.length ? dashboard.demandRadar.slice(0, 20).map((signal, index) => (
                      <div key={`${signal.product}-${signal.destinationCountryCode}-${index}`} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-4"><div><div className="font-black">{readable(signal.product)}</div><div className="mt-1 text-xs text-slate-500">{signal.destinationCountryCode || "Unknown destination"} · {signal.sectorCode ? readable(signal.sectorCode) : "Unclassified sector"}</div></div><Badge className="bg-[#0B3D32] text-white hover:bg-[#0B3D32]">Score {signal.demandScore.toFixed(0)}</Badge></div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs"><Badge variant="outline">{signal.eventCount} signals</Badge><Badge variant="outline">{signal.commercialEventCount} commercial</Badge><Badge variant="outline">{signal.zeroResultCount} unmet</Badge><Badge variant="outline">Difficulty {signal.averageDifficulty}</Badge></div>
                      </div>
                    )) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Demand signals will appear after public searches or industrial requirements are recorded.</div>}
                  </CardContent>
                </Card>
                <Card className="border-slate-200 bg-white">
                  <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><SearchCheck className="h-5 w-5 text-[#9A6700]" />Unmet-demand review</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {zeroResultEvents.length ? zeroResultEvents.slice(0, 25).map((event) => (
                      <div key={event.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <div className="font-bold text-amber-950">{readable(event.normalizedProduct || event.queryText || "unclassified demand")}</div>
                        <div className="mt-1 text-xs text-amber-900/65">{event.destinationCountryCode || "Destination missing"} · {new Date(event.occurredAt).toLocaleString()}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {!event.sectorCode ? <Button size="sm" className="bg-[#0B3D32] text-white hover:bg-[#155849]" disabled={queueSectorProposal.isPending} onClick={() => queueSectorProposal.mutate(event.id)}><Network className="mr-1.5 h-3.5 w-3.5" />Assign sector draft</Button> : null}
                          <Button size="sm" variant="outline" className="border-amber-900/30 text-amber-950" disabled={proposeMission.isPending} onClick={() => proposeMission.mutate(event.id)}><Plus className="mr-1.5 h-3.5 w-3.5" />Propose research mission</Button>
                        </div>
                      </div>
                    )) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No zero-result signal currently needs review.</div>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="missions">
                <Card className="border-slate-200 bg-white">
                  <CardHeader><CardTitle className="text-lg">Persistent Agent OS research queue</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {dashboard.missions.length ? dashboard.missions.map((mission) => (
                      <div key={mission.id} className="grid gap-4 rounded-xl border border-slate-200 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                        <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{mission.title}</h3><Badge variant="outline" className={statusClass(mission.status)}>{readable(mission.status)}</Badge><Badge variant="outline" className={statusClass(mission.approvalStatus)}>{readable(mission.approvalStatus)}</Badge>{mission.missionType === "sector_taxonomy_proposal" ? <Badge variant="outline" className="border-[#0B3D32]/30 bg-[#E7F2EE] text-[#0B3D32]">Agent sector draft</Badge> : null}</div><p className="mt-2 text-sm leading-6 text-slate-600">{mission.objective}</p>{mission.resultSummary ? <div className="mt-3 whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">{mission.resultSummary}</div> : null}<div className="mt-2 text-xs text-slate-500">Canonical task #{mission.canonicalTaskId || "not linked"} · {mission.countryCode || "global"} · {mission.sectorCode ? readable(mission.sectorCode) : "all sectors"} · {mission.evidenceCount} verified evidence</div></div>
                        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setEvidenceMission(mission); setEvidenceForm((current) => ({ ...current, sourceId: current.sourceId || dashboard.sources[0]?.id || "" })); }}><BookOpenCheck className="mr-1.5 h-3.5 w-3.5" />Add evidence</Button>{mission.approvalStatus === "pending" && <><Button size="sm" className="bg-[#0B3D32] text-white hover:bg-[#155849]" onClick={() => updateMission.mutate({ missionId: mission.id, status: "queued", approvalStatus: "approved" })}>Approve queue</Button><Button size="sm" variant="outline" onClick={() => updateMission.mutate({ missionId: mission.id, status: "cancelled", approvalStatus: "rejected" })}>Reject</Button></>}{mission.approvalStatus === "approved" && mission.status === "queued" && <Button size="sm" className="bg-[#0B3D32] text-white hover:bg-[#155849]" onClick={() => updateMission.mutate({ missionId: mission.id, status: "in_progress", approvalStatus: "approved" })}>Start research</Button>}{mission.approvalStatus === "approved" && mission.status === "in_progress" && <Button size="sm" className="bg-[#0B3D32] text-white hover:bg-[#155849]" onClick={() => updateMission.mutate({ missionId: mission.id, status: "awaiting_review", approvalStatus: "approved" })}>Send to review</Button>}</div>
                      </div>
                    )) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No research mission has been proposed.</div>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="sources">
                <Card className="border-slate-200 bg-white">
                  <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-lg">Provenance source registry</CardTitle><Button size="sm" onClick={() => setSourceOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />Add source</Button></CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {dashboard.sources.length ? dashboard.sources.map((source) => (
                      <div key={source.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3"><div><div className="font-black">{source.name}</div><div className="mt-1 text-xs text-slate-500">{readable(source.sourceType)} · {source.countryCode || "global"}</div></div><Badge variant="outline" className={statusClass(source.status)}>{source.status}</Badge></div>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Trust</span><div className="mt-1 font-bold">{Math.round(Number(source.trustScore || 0) * 100)}%</div></div><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Robots</span><div className="mt-1 font-bold">{readable(source.robotsPolicy)}</div></div></div>
                        <div className="mt-3 text-xs leading-5 text-slate-500">{dashboard.sourceSnapshots.filter((snapshot) => snapshot.sourceId === source.id).length} persisted version(s) · {source.lastSucceededAt ? `last checked ${new Date(source.lastSucceededAt).toLocaleString()}` : "never checked"}</div>
                        <div className="mt-4 flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => openSnapshotCapture(source)}>Capture source version</Button><a href={source.baseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs font-bold text-[#0B3D32] hover:underline">{source.domain || "Open source"}<ExternalLink className="ml-1 h-3 w-3" /></a></div>
                      </div>
                    )) : <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No source is registered. Evidence cannot become publishable until sources exist.</div>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="newsroom">
                <TradeNewsroomAdminPanel
                  newsroom={dashboard.newsroom}
                  sources={dashboard.sources}
                  dashboardQueryKey="/api/trade/admin/dashboard"
                />
              </TabsContent>

              <TabsContent value="regulations" className="space-y-5">
                <Card className="border-slate-200 bg-white">
                  <CardHeader><CardTitle className="text-lg">Previous-versus-current source comparisons</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {dashboard.sourceComparisons.length ? dashboard.sourceComparisons.map((comparison) => {
                      const snapshot = dashboard.sourceSnapshots.find((item) => item.id === comparison.currentSnapshotId);
                      return (
                        <div key={comparison.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2"><span className="font-black">{snapshot?.jurisdictionCountryCode || "Global"} · {snapshot?.documentTitle || readable(comparison.documentKey)}</span><Badge variant="outline" className={statusClass(comparison.status)}>{readable(comparison.status)}</Badge><Badge variant="outline" className={comparison.isSubstantive ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-700"}>{comparison.isSubstantive ? "Potentially substantive" : "Review difference"}</Badge></div>
                              <p className="mt-2 text-sm leading-6 text-slate-600">{comparison.deterministicSummary}</p>
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500"><span>Materiality {comparison.materialityScore}/100</span><span>Similarity {Math.round(Number(comparison.textSimilarity || 0) * 100)}%</span><span>{comparison.changedFields.length} changed fields</span><span>{comparison.addedPassages.length} added / {comparison.removedPassages.length} removed passages</span><span>Task #{comparison.canonicalTaskId || "unlinked"}</span></div>
                              {comparison.changedFields.length ? <div className="mt-3 text-xs leading-5 text-slate-500"><span className="font-bold text-slate-700">Changed fields: </span>{comparison.changedFields.slice(0, 8).map(readable).join(", ")}{comparison.changedFields.length > 8 ? "…" : ""}</div> : null}
                            </div>
                            {comparison.status === "review_pending" ? <div className="flex shrink-0 flex-wrap gap-2"><Button size="sm" className="bg-[#0B3D32] text-white hover:bg-[#155849]" onClick={() => openComparisonReview(comparison, "confirm")}>Review and confirm</Button><Button size="sm" variant="outline" onClick={() => openComparisonReview(comparison, "dismiss")}>Dismiss candidate</Button></div> : null}
                          </div>
                        </div>
                      );
                    }) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No source comparison exists. Capture a baseline and then a later version of the same registered document.</div>}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white">
                  <CardHeader><CardTitle className="text-lg">Draft intelligence alerts and affected requirements</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {dashboard.intelligenceAlerts.length ? dashboard.intelligenceAlerts.map((alert) => (
                      <div key={alert.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-black">{alert.title}</span><Badge variant="outline" className={statusClass(alert.verificationStatus)}>{readable(alert.verificationStatus)}</Badge><Badge variant="outline" className={statusClass(alert.deliveryStatus)}>{readable(alert.deliveryStatus)}</Badge></div><p className="mt-2 text-sm leading-6 text-slate-600">{alert.summary}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500"><span>{readable(alert.severity)}</span><span>{alert.affectedRequirementCount} requirement(s)</span><span>{alert.affectedRegisteredUserCount} registered user(s)</span><span>{alert.impactRecordCount} impact record(s)</span><span>Published {alert.sourcePublishedAt ? new Date(alert.sourcePublishedAt).toLocaleDateString() : "unknown"}</span><span>Effective {alert.effectiveAt ? new Date(alert.effectiveAt).toLocaleDateString() : "unknown"}</span></div>{alert.affectedProducts.length || alert.affectedCountryCodes.length || alert.affectedRoutes.length ? <div className="mt-3 text-xs leading-5 text-slate-500">Scope: {[...alert.affectedProducts, ...alert.affectedCountryCodes, ...alert.affectedRoutes].slice(0, 10).join(" · ")}</div> : null}</div><a href={alert.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center text-xs font-bold text-[#0B3D32]">Original source<ExternalLink className="ml-1 h-3.5 w-3.5" /></a></div>
                      </div>
                    )) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No draft intelligence alert exists. A regulatory comparison creates one with delivery withheld until review.</div>}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white">
                  <CardHeader><CardTitle className="text-lg">Regulatory change evidence records</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {dashboard.regulatoryChanges.length ? dashboard.regulatoryChanges.map((change) => (
                      <div key={change.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-black">{change.jurisdictionCountryCode} · {change.title}</span><Badge variant="outline" className={statusClass(change.verificationStatus)}>{readable(change.verificationStatus)}</Badge></div><div className="mt-1 text-xs text-slate-500">Detected {new Date(change.detectedAt).toLocaleString()} · {readable(change.severity)}</div></div><a href={change.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs font-bold text-[#0B3D32]">Evidence<ExternalLink className="ml-1 h-3.5 w-3.5" /></a></div>
                    )) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No regulatory change has been detected or entered. This is an empty queue, not a claim that regulations are unchanged.</div>}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={submitSource}>
            <DialogHeader><DialogTitle>Register evidence source</DialogTitle><DialogDescription>Add provenance and access policy before collecting facts. Registration does not start a crawler.</DialogDescription></DialogHeader>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="source-name">Source name</Label><Input id="source-name" required value={sourceForm.name} onChange={(event) => setSourceForm((current) => ({ ...current, name: event.target.value }))} placeholder="Customs authority or industry registry" /></div>
              <div className="space-y-2"><Label>Source type</Label><Select value={sourceForm.sourceType} onValueChange={(value) => setSourceForm((current) => ({ ...current, sourceType: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["official_registry", "customs_authority", "statistics_authority", "ministry", "standards_body", "port_authority", "logistics_operator", "chamber_of_commerce", "development_institution", "company_website", "industry_directory", "news_media", "research_publication", "manual_evidence"].map((value) => <SelectItem key={value} value={value}>{readable(value)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="source-country">Country code</Label><Input id="source-country" maxLength={2} value={sourceForm.countryCode} onChange={(event) => setSourceForm((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))} placeholder="BJ" /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="source-url">Base URL</Label><Input id="source-url" type="url" required value={sourceForm.baseUrl} onChange={(event) => setSourceForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://authority.example/" /></div>
              <div className="space-y-2"><Label htmlFor="source-trust">Initial trust score (0–1)</Label><Input id="source-trust" type="number" min="0" max="1" step="0.05" required value={sourceForm.trustScore} onChange={(event) => setSourceForm((current) => ({ ...current, trustScore: event.target.value }))} /></div>
            </div>
            <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setSourceOpen(false)}>Cancel</Button><Button type="submit" disabled={registerSource.isPending} className="bg-[#0B3D32] text-white hover:bg-[#155849]">{registerSource.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Register source</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(snapshotSource)} onOpenChange={(open) => !open && setSnapshotSource(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <form onSubmit={(event) => { event.preventDefault(); captureSnapshot.mutate(); }}>
            <DialogHeader><DialogTitle>Capture registered source version</DialogTitle><DialogDescription>{snapshotSource?.name}. Store an observed version and precise dates; the first version is only a baseline. A later difference creates a visible review task, never an automatic publication or notification.</DialogDescription></DialogHeader>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Snapshot type</Label><Select value={snapshotForm.snapshotType} onValueChange={(value) => setSnapshotForm((current) => ({ ...current, snapshotType: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["regulatory", "tariff", "standard", "logistics", "company", "market", "news", "other"].map((value) => <SelectItem key={value} value={value}>{readable(value)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="snapshot-country">Jurisdiction country</Label><Input id="snapshot-country" maxLength={2} required={["regulatory", "tariff", "standard"].includes(snapshotForm.snapshotType)} value={snapshotForm.jurisdictionCountryCode} onChange={(event) => setSnapshotForm((current) => ({ ...current, jurisdictionCountryCode: event.target.value.toUpperCase(), affectedCountryCodes: current.affectedCountryCodes || event.target.value.toUpperCase() }))} placeholder="GH" /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="snapshot-title">Original document title</Label><Input id="snapshot-title" required value={snapshotForm.documentTitle} onChange={(event) => setSnapshotForm((current) => ({ ...current, documentTitle: event.target.value }))} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="snapshot-url">Precise source URL</Label><Input id="snapshot-url" type="url" required value={snapshotForm.sourceUrl} onChange={(event) => setSnapshotForm((current) => ({ ...current, sourceUrl: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="snapshot-issuer">Issuing institution</Label><Input id="snapshot-issuer" value={snapshotForm.issuingInstitution} onChange={(event) => setSnapshotForm((current) => ({ ...current, issuingInstitution: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="snapshot-version">Version label</Label><Input id="snapshot-version" value={snapshotForm.versionLabel} onChange={(event) => setSnapshotForm((current) => ({ ...current, versionLabel: event.target.value }))} placeholder="Gazette 2026-08 or v2" /></div>
              <div className="space-y-2"><Label htmlFor="snapshot-published">Published date</Label><Input id="snapshot-published" type="datetime-local" value={snapshotForm.publishedAt} onChange={(event) => setSnapshotForm((current) => ({ ...current, publishedAt: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="snapshot-effective">Effective date</Label><Input id="snapshot-effective" type="datetime-local" value={snapshotForm.effectiveAt} onChange={(event) => setSnapshotForm((current) => ({ ...current, effectiveAt: event.target.value }))} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="snapshot-content">Extracted or transcribed source text</Label><Textarea id="snapshot-content" required minLength={10} maxLength={200000} rows={9} value={snapshotForm.contentText} onChange={(event) => setSnapshotForm((current) => ({ ...current, contentText: event.target.value }))} placeholder="Paste the accountable text extracted from the original source. Do not add unsupported conclusions." /></div>
              <div className="space-y-2"><Label htmlFor="snapshot-products">Affected products</Label><Textarea id="snapshot-products" rows={3} value={snapshotForm.affectedProducts} onChange={(event) => setSnapshotForm((current) => ({ ...current, affectedProducts: event.target.value }))} placeholder="One per line or comma-separated" /></div>
              <div className="space-y-2"><Label htmlFor="snapshot-industries">Affected industries</Label><Textarea id="snapshot-industries" rows={3} value={snapshotForm.affectedIndustries} onChange={(event) => setSnapshotForm((current) => ({ ...current, affectedIndustries: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="snapshot-hs">Affected HS codes</Label><Textarea id="snapshot-hs" rows={3} value={snapshotForm.affectedHsCodes} onChange={(event) => setSnapshotForm((current) => ({ ...current, affectedHsCodes: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="snapshot-countries">Affected countries</Label><Textarea id="snapshot-countries" rows={3} value={snapshotForm.affectedCountryCodes} onChange={(event) => setSnapshotForm((current) => ({ ...current, affectedCountryCodes: event.target.value }))} placeholder="GH, CI" /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="snapshot-routes">Affected trade routes</Label><Textarea id="snapshot-routes" rows={3} value={snapshotForm.affectedRoutes} onChange={(event) => setSnapshotForm((current) => ({ ...current, affectedRoutes: event.target.value }))} placeholder="Tema to Abidjan" /></div>
            </div>
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">This action records a visible source observation. It does not start a crawler, invoke an invisible agent, update a public page, or deliver an alert.</div>
            <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setSnapshotSource(null)}>Cancel</Button><Button type="submit" disabled={captureSnapshot.isPending} className="bg-[#0B3D32] text-white hover:bg-[#155849]">{captureSnapshot.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Store version</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(comparisonReview)} onOpenChange={(open) => !open && setComparisonReview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={(event) => { event.preventDefault(); reviewComparison.mutate(); }}>
            <DialogHeader><DialogTitle>{comparisonReviewForm.action === "confirm" ? "Confirm source change" : "Dismiss source change candidate"}</DialogTitle><DialogDescription>{comparisonReview?.deterministicSummary} Human review is the authority for substantive meaning. Confirmation creates only reviewed internal intelligence; publication and delivery remain separately gated.</DialogDescription></DialogHeader>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Substantive assessment</Label><Select value={comparisonReviewForm.isSubstantive ? "yes" : "no"} onValueChange={(value) => setComparisonReviewForm((current) => ({ ...current, isSubstantive: value === "yes" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Substantive change</SelectItem><SelectItem value="no">Non-substantive difference</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Severity</Label><Select value={comparisonReviewForm.severity} onValueChange={(value) => setComparisonReviewForm((current) => ({ ...current, severity: value as ComparisonReviewForm["severity"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="informational">Informational</SelectItem><SelectItem value="material">Material</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="comparison-notes">Review evidence and decision</Label><Textarea id="comparison-notes" required minLength={10} rows={5} value={comparisonReviewForm.reviewNotes} onChange={(event) => setComparisonReviewForm((current) => ({ ...current, reviewNotes: event.target.value }))} placeholder="Explain what changed, how the source proves it, and why the candidate is confirmed or dismissed." /></div>
              {comparisonReviewForm.action === "confirm" ? <><div className="space-y-2 sm:col-span-2"><Label htmlFor="comparison-consequences">Who or what is affected</Label><Textarea id="comparison-consequences" rows={4} value={comparisonReviewForm.consequences} onChange={(event) => setComparisonReviewForm((current) => ({ ...current, consequences: event.target.value }))} placeholder="Products, routes, importers, deadlines, or compliance consequences." /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="comparison-actions">Recommended actions</Label><Textarea id="comparison-actions" rows={4} value={comparisonReviewForm.recommendedActions} onChange={(event) => setComparisonReviewForm((current) => ({ ...current, recommendedActions: event.target.value }))} placeholder="One action per line" /></div></> : null}
            </div>
            <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setComparisonReview(null)}>Cancel</Button><Button type="submit" disabled={reviewComparison.isPending} variant={comparisonReviewForm.action === "dismiss" ? "destructive" : "default"} className={comparisonReviewForm.action === "confirm" ? "bg-[#0B3D32] text-white hover:bg-[#155849]" : ""}>{reviewComparison.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{comparisonReviewForm.action === "confirm" ? "Confirm reviewed change" : "Dismiss candidate"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(evidenceMission)} onOpenChange={(open) => !open && setEvidenceMission(null)}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={(event) => { event.preventDefault(); recordEvidence.mutate(); }}>
            <DialogHeader><DialogTitle>Add research evidence</DialogTitle><DialogDescription>{evidenceMission?.title}. Evidence must identify a registered source and a precise URL; the verified count is derived from these records.</DialogDescription></DialogHeader>
            <div className="mt-5 grid gap-4">
              <div className="space-y-2"><Label>Registered source</Label><Select value={evidenceForm.sourceId} onValueChange={(value) => setEvidenceForm((current) => ({ ...current, sourceId: value }))}><SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger><SelectContent>{dashboard?.sources.map((source) => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="evidence-type">Evidence type</Label><Input id="evidence-type" required value={evidenceForm.evidenceType} onChange={(event) => setEvidenceForm((current) => ({ ...current, evidenceType: event.target.value }))} /></div><div className="space-y-2"><Label>Review status</Label><Select value={evidenceForm.verificationStatus} onValueChange={(value) => setEvidenceForm((current) => ({ ...current, verificationStatus: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="under_review">Under review</SelectItem><SelectItem value="verified">Verified</SelectItem><SelectItem value="disputed">Disputed</SelectItem></SelectContent></Select></div></div>
              <div className="space-y-2"><Label htmlFor="evidence-title">Evidence title</Label><Input id="evidence-title" required value={evidenceForm.title} onChange={(event) => setEvidenceForm((current) => ({ ...current, title: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="evidence-url">Precise source URL</Label><Input id="evidence-url" type="url" required value={evidenceForm.sourceUrl} onChange={(event) => setEvidenceForm((current) => ({ ...current, sourceUrl: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="evidence-excerpt">Evidence note or short excerpt</Label><Textarea id="evidence-excerpt" value={evidenceForm.evidenceExcerpt} onChange={(event) => setEvidenceForm((current) => ({ ...current, evidenceExcerpt: event.target.value }))} rows={4} /></div>
            </div>
            <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setEvidenceMission(null)}>Cancel</Button><Button type="submit" disabled={recordEvidence.isPending || !evidenceForm.sourceId} className="bg-[#0B3D32] text-white hover:bg-[#155849]">{recordEvidence.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Record evidence</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
