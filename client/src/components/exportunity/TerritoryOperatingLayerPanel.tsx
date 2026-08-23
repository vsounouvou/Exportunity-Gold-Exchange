import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const COVERAGE_KEYS = ["producer", "buyer", "creator", "carrier", "payment", "language", "content"];

const SCORECARD_METRIC_FIELDS = [
  ["fulfilledGmvMinor", "Fulfilled GMV (minor units)"],
  ["producerIncomeMinor", "Producer income (minor units)"],
  ["contributionMarginMinor", "Contribution margin (minor units)"],
  ["creatorAttributedSalesMinor", "Creator-attributed sales (minor units)"],
  ["mediaSpendMinor", "Media spend (minor units)"],
  ["productPageSessions", "Product-page sessions"],
  ["qualifiedLeads", "Qualified leads"],
  ["acquiredCustomers", "Acquired customers"],
  ["attributableCompletedOrders", "Attributable completed orders"],
  ["groupOrderCampaigns", "Group-order campaigns"],
  ["groupOrderThresholdsReached", "Group thresholds reached"],
  ["paymentAttempts", "Payment attempts"],
  ["paymentSuccesses", "Successful payments"],
  ["deliveryAttempts", "Delivery attempts"],
  ["successfulDeliveries", "Successful deliveries"],
  ["onTimeDeliveries", "On-time deliveries"],
  ["disputes", "Disputes"],
  ["refunds", "Refunds"],
  ["repeatBuyers", "Repeat buyers"],
  ["rightsClearedAssets", "Rights-cleared assets"],
  ["publishedContentAssets", "Published content assets"],
] as const;

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) return { start: "", end: "" };
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function metricValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "unknown";
  if (typeof value === "string" && value.trim().endsWith("%")) return value.trim();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "unknown";
}

function labels(values: unknown) {
  return Array.isArray(values) ? values.map((value) => String(value)).filter(Boolean) : [];
}

export function TerritoryOperatingLayerPanel({ territoryId }: { territoryId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [operatingMode, setOperatingMode] = useState("research_only");
  const [primaryLanguage, setPrimaryLanguage] = useState("");
  const [prioritySectors, setPrioritySectors] = useState("");
  const [geographyEvidenceReference, setGeographyEvidenceReference] = useState("");
  const [confirmGeographyEvidence, setConfirmGeographyEvidence] = useState(false);
  const [approvalNote, setApprovalNote] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [scorecardMonth, setScorecardMonth] = useState(currentMonth);
  const [scorecardCurrency, setScorecardCurrency] = useState("");
  const initialScorecardBounds = monthBounds(currentMonth());
  const [scorecardWindowStart, setScorecardWindowStart] = useState(initialScorecardBounds.start);
  const [scorecardWindowEnd, setScorecardWindowEnd] = useState(initialScorecardBounds.end);
  const [scorecardEvidenceType, setScorecardEvidenceType] = useState("canonical_ledger");
  const [scorecardEvidenceReference, setScorecardEvidenceReference] = useState("");
  const [scorecardEvidenceVerified, setScorecardEvidenceVerified] = useState(false);
  const [scorecardConfirmed, setScorecardConfirmed] = useState(false);
  const [canonicalScorecardConfirmed, setCanonicalScorecardConfirmed] = useState(false);
  const [scorecardMetrics, setScorecardMetrics] = useState<Record<string, string>>({});
  const [scorecardIdempotencyKey, setScorecardIdempotencyKey] = useState(
    () => `scorecard:${globalThis.crypto?.randomUUID?.() || Date.now()}`,
  );
  const [canonicalScorecardIdempotencyKey, setCanonicalScorecardIdempotencyKey] = useState(
    () => `canonical-scorecard:${globalThis.crypto?.randomUUID?.() || Date.now()}`,
  );
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => `prepare:${globalThis.crypto?.randomUUID?.() || Date.now()}`,
  );

  const query = useQuery({
    queryKey: ["territory-operating-layer", territoryId],
    queryFn: async () => {
      const response = await apiRequest(`/api/territories/${territoryId}/operating-layer`, {
        method: "GET",
      });
      return response?.operatingLayer || null;
    },
    enabled: Number.isFinite(territoryId) && territoryId > 0,
  });

  const canonicalPreviewQuery = useQuery({
    queryKey: ["territory-canonical-scorecard-preview", territoryId, scorecardMonth],
    queryFn: async () => {
      const response = await apiRequest(
        `/api/territories/${territoryId}/operating-layer/scorecards/canonical-preview?month=${encodeURIComponent(scorecardMonth)}`,
        { method: "GET" },
      );
      return response?.projection || null;
    },
    enabled:
      Number.isFinite(territoryId) &&
      territoryId > 0 &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(scorecardMonth),
  });

  const layer: any = query.data;
  const latestActivation = layer?.latestActivation || null;
  const readiness = layer?.readiness || latestActivation?.readinessSnapshot || null;
  const latestCoverage = layer?.latestCoverage?.dimensions || {};

  useEffect(() => {
    if (!layer) return;
    const profile = layer.profile || {};
    setOperatingMode(String(profile.operatingMode || "research_only"));
    setPrimaryLanguage(String(profile.primaryLanguage || layer.territory?.language || ""));
    setPrioritySectors(labels(profile.prioritySectors).join(", "));
    const evidence = profile.geographyEvidence || {};
    setGeographyEvidenceReference(String(evidence.reference || evidence.sourceRef || ""));
    setConfirmGeographyEvidence(evidence.confirmed === true);
    setScorecardCurrency(String(layer.territory?.currency || "XOF").toUpperCase());
  }, [layer?.profile?.id, layer?.territory?.id]);

  useEffect(() => {
    const bounds = monthBounds(scorecardMonth);
    setScorecardWindowStart(bounds.start);
    setScorecardWindowEnd(bounds.end);
  }, [scorecardMonth]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["territory-operating-layer", territoryId] });
    await queryClient.invalidateQueries({ queryKey: ["territory", String(territoryId)] });
    await queryClient.invalidateQueries({ queryKey: ["territory-canonical-scorecard-preview", territoryId] });
  };

  const prepareMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/territories/${territoryId}/operating-layer/prepare`, "POST", {
        idempotencyKey,
        profile: {
          operatingMode,
          primaryLanguage,
          prioritySectors: prioritySectors
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          geographyEvidenceReference,
          confirmGeographyEvidence,
        },
        coverage: latestCoverage,
        activationScope: {
          channels: ["web", "facebook", "instagram", "tiktok"],
          socialAccountModel: "central_or_country_accounts_with_territory_attribution",
        },
      }),
    onSuccess: async (response: any) => {
      toast({
        title: response?.activation?.status === "blocked" ? "Activation package blocked" : "Activation package prepared",
        description:
          response?.activation?.status === "blocked"
            ? "Evidence gaps were recorded. No work was started."
            : "The operating profile, coverage snapshot, team plan, and paused work items were recorded.",
      });
      if (!response?.idempotentReplay) {
        setIdempotencyKey(`prepare:${globalThis.crypto?.randomUUID?.() || Date.now()}`);
      }
      await refresh();
    },
    onError: (error: any) =>
      toast({
        title: "Preparation failed",
        description: error?.message || "Unable to prepare territory activation.",
        variant: "destructive",
      }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!latestActivation?.id) throw new Error("No activation package selected");
      return apiRequest(
        `/api/territories/${territoryId}/operating-layer/activations/${latestActivation.id}/approve`,
        "POST",
        { approvalNote },
      );
    },
    onSuccess: async () => {
      toast({
        title: "Territory operating layer activated",
        description: "Activation is recorded. All generated work items remain paused until separately authorized.",
      });
      await refresh();
    },
    onError: (error: any) =>
      toast({
        title: "Activation blocked",
        description: error?.message || "Readiness evidence or approval is incomplete.",
        variant: "destructive",
      }),
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      if (!latestActivation?.id) throw new Error("No activation selected");
      return apiRequest(
        `/api/territories/${territoryId}/operating-layer/activations/${latestActivation.id}/pause`,
        "POST",
        { reason: pauseReason },
      );
    },
    onSuccess: async () => {
      toast({ title: "Territory activation paused", description: "The emergency state change was audited." });
      await refresh();
    },
    onError: (error: any) =>
      toast({
        title: "Pause failed",
        description: error?.message || "Unable to pause activation.",
        variant: "destructive",
      }),
  });

  const scorecardMutation = useMutation({
    mutationFn: async () => {
      const metrics = Object.fromEntries(
        Object.entries(scorecardMetrics)
          .filter(([, value]) => String(value).trim() !== "")
          .map(([key, value]) => [key, Number(value)]),
      );
      return apiRequest(`/api/territories/${territoryId}/operating-layer/scorecards`, "POST", {
        idempotencyKey: scorecardIdempotencyKey,
        month: scorecardMonth,
        currencyCode: scorecardCurrency,
        sourceWindowStart: `${scorecardWindowStart}T00:00:00.000Z`,
        sourceWindowEnd: `${scorecardWindowEnd}T23:59:59.999Z`,
        metrics,
        evidence: {
          sourceType: scorecardEvidenceType,
          sourceReference: scorecardEvidenceReference,
          observedAt: `${scorecardWindowEnd}T23:59:59.999Z`,
          verified: scorecardEvidenceVerified,
          credentialsExcluded: true,
        },
        confirmed: scorecardConfirmed,
      });
    },
    onSuccess: async (response: any) => {
      setScorecardConfirmed(false);
      setScorecardEvidenceVerified(false);
      if (!response?.idempotentReplay) {
        setScorecardIdempotencyKey(
          `scorecard:${globalThis.crypto?.randomUUID?.() || Date.now()}`,
        );
      }
      toast({
        title: response?.idempotentReplay ? "Scorecard evidence already recorded" : "Scorecard evidence recorded",
        description: "The canonical territory KPI row and central Action receipt were updated. No external action or background job ran.",
      });
      await refresh();
    },
    onError: (error: any) =>
      toast({
        title: "Scorecard evidence rejected",
        description: error?.message || "The metric bounds, source evidence, or confirmation is incomplete.",
        variant: "destructive",
      }),
  });

  const canonicalScorecardMutation = useMutation({
    mutationFn: async () => {
      const projection = canonicalPreviewQuery.data;
      if (!projection?.projectionChecksum) throw new Error("Refresh the canonical preview first");
      return apiRequest(
        `/api/territories/${territoryId}/operating-layer/scorecards/canonical`,
        "POST",
        {
          idempotencyKey: canonicalScorecardIdempotencyKey,
          month: scorecardMonth,
          projectionChecksum: projection.projectionChecksum,
          confirmed: canonicalScorecardConfirmed,
        },
      );
    },
    onSuccess: async (response: any) => {
      setCanonicalScorecardConfirmed(false);
      if (!response?.idempotentReplay) {
        setCanonicalScorecardIdempotencyKey(
          `canonical-scorecard:${globalThis.crypto?.randomUUID?.() || Date.now()}`,
        );
      }
      toast({
        title: response?.idempotentReplay
          ? "Canonical scorecard projection already recorded"
          : "Canonical scorecard projection recorded",
        description:
          "Only verified internal ledgers were projected. Unknown metrics stayed unknown; no provider call or background job ran.",
      });
      await refresh();
    },
    onError: (error: any) =>
      toast({
        title: "Canonical scorecard projection rejected",
        description:
          error?.message || "Refresh the projection and resolve its canonical ledger blockers.",
        variant: "destructive",
      }),
  });

  if (query.isLoading) {
    return <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-300">Loading operating truth…</div>;
  }
  if (query.isError) {
    return <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">Unable to load the operating layer.</div>;
  }

  const blockers = labels(readiness?.blockers);
  const dataGaps = labels(readiness?.dataGaps);
  const canApprove = latestActivation?.status === "approval_required" && blockers.length === 0;
  const latestScorecard = Array.isArray(layer?.scorecards) ? layer.scorecards[0] || null : null;
  const derivedMetrics = latestScorecard?.derivedMetrics || {};
  const canonicalPreview: any = canonicalPreviewQuery.data || null;
  const canonicalPreviewMetrics = canonicalPreview?.metrics || {};
  const advertisingBudgetEnvelopes = Array.isArray(layer?.advertisingBudgetEnvelopes)
    ? layer.advertisingBudgetEnvelopes
    : [];
  const hasScorecardMetrics = Object.values(scorecardMetrics).some(
    (value) => String(value).trim() !== "",
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {[
          ["Canonical geography", layer?.territory?.territoryType || "unknown"],
          ["Operating status", layer?.profile?.operationalStatus || "not prepared"],
          ["Activation", latestActivation?.status || "none"],
          ["Readiness", readiness?.readinessStatus || "unknown"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
            <div className="mt-1 text-sm font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="border-white/10 bg-black/20 text-white">
          <CardHeader>
            <CardTitle className="text-base">Media-to-commerce scorecard</CardTitle>
            <p className="text-xs text-gray-400">
              Extends the canonical <code>territory_kpis</code> row. Missing evidence remains unknown rather than becoming a fabricated zero.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-gray-300">
                {latestScorecard?.month || "No evidence month"} · {latestScorecard?.currencyCode || layer?.territory?.currency || "currency unknown"}
              </span>
              <span className={latestScorecard?.evidenceStatus === "verified" ? "text-emerald-300" : "text-amber-300"}>
                Evidence {latestScorecard?.evidenceStatus || "unknown"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
              {[
                ["Fulfilled GMV", latestScorecard?.fulfilledGmvMinor],
                ["Producer income", latestScorecard?.producerIncomeMinor],
                ["Rights-cleared assets", latestScorecard?.rightsClearedAssets],
                ["Qualified leads", latestScorecard?.qualifiedLeads],
                ["Completed orders", latestScorecard?.attributableCompletedOrders],
                ["Delivery success", derivedMetrics.deliverySuccessRate == null ? null : `${derivedMetrics.deliverySuccessRate}%`],
                ["Payment success", derivedMetrics.paymentSuccessRate == null ? null : `${derivedMetrics.paymentSuccessRate}%`],
                ["CAC (minor units)", derivedMetrics.customerAcquisitionCostMinor],
                ["Cost/order (minor units)", derivedMetrics.costPerCompletedOrderMinor],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded border border-white/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
                  <div className="mt-1 font-medium text-white">{metricValue(value)}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-3 space-y-3">
              <div>
                <div className="text-sm font-semibold text-emerald-100">Canonical ledger projection · {scorecardMonth}</div>
                <div className="mt-1 text-xs text-gray-400">
                  Read-only recomputation from verified fulfilled-order attribution, reconciled media spend, group buying, social leads, rights, and provider-confirmed publications. Absence never becomes an invented value.
                </div>
              </div>
              {canonicalPreviewQuery.isLoading ? (
                <div className="text-xs text-gray-400">Computing the read-only canonical projection…</div>
              ) : canonicalPreviewQuery.isError ? (
                <div className="rounded border border-red-500/30 bg-red-950/20 p-2 text-xs text-red-200">
                  {(canonicalPreviewQuery.error as any)?.message || "Unable to compute the canonical projection."}
                </div>
              ) : canonicalPreview ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                    {[
                      ["Fulfilled GMV", canonicalPreviewMetrics.fulfilledGmvMinor],
                      ["Creator-attributed sales", canonicalPreviewMetrics.creatorAttributedSalesMinor],
                      ["Completed orders", canonicalPreviewMetrics.attributableCompletedOrders],
                      ["Verified media spend", canonicalPreviewMetrics.mediaSpendMinor],
                      ["Qualified social leads", canonicalPreviewMetrics.qualifiedLeads],
                      ["Rights-cleared assets", canonicalPreviewMetrics.rightsClearedAssets],
                      ["Published assets", canonicalPreviewMetrics.publishedContentAssets],
                      ["Group campaigns", canonicalPreviewMetrics.groupOrderCampaigns],
                      ["Thresholds reached", canonicalPreviewMetrics.groupOrderThresholdsReached],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded border border-white/10 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
                        <div className="mt-1 font-medium text-white">{metricValue(value)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400">
                    Unknown by design: {labels(canonicalPreview.unknownMetrics).join(", ") || "none"}.
                  </div>
                  {labels(canonicalPreview.limitations).map((limitation) => (
                    <div key={limitation} className="text-[11px] text-gray-500">• {limitation}</div>
                  ))}
                  {labels(canonicalPreview.blockers).length ? (
                    <div className="rounded border border-amber-500/30 bg-amber-950/20 p-2 text-xs text-amber-100">
                      Projection blockers: {labels(canonicalPreview.blockers).join(", ")}
                    </div>
                  ) : null}
                  <label className="flex items-start gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={canonicalScorecardConfirmed}
                      onChange={(event) => setCanonicalScorecardConfirmed(event.target.checked)}
                    />
                    I reviewed this checksum-bound projection and authorize recording it into the canonical territory KPI row. Unknown metrics must remain unknown.
                  </label>
                  <Button
                    type="button"
                    onClick={() => canonicalScorecardMutation.mutate()}
                    disabled={
                      canonicalScorecardMutation.isPending ||
                      !canonicalScorecardConfirmed ||
                      !canonicalPreview.readyToRecord ||
                      !canonicalPreview.projectionChecksum
                    }
                  >
                    {canonicalScorecardMutation.isPending ? "Recording canonical projection…" : "Record canonical ledger projection"}
                  </Button>
                  <div className="text-[11px] text-gray-500">
                    Checksum {String(canonicalPreview.projectionChecksum || "").slice(0, 20)}… · no provider call, spend, publication, or background execution.
                  </div>
                </>
              ) : null}
            </div>

            <details className="rounded-lg border border-white/10 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-white">Record an accountable evidence bundle</summary>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-xs text-gray-300">
                    Scorecard month
                    <Input type="month" value={scorecardMonth} onChange={(event) => setScorecardMonth(event.target.value)} className="border-white/10 bg-gray-950" />
                  </label>
                  <label className="space-y-1 text-xs text-gray-300">
                    Currency
                    <Input value={scorecardCurrency} onChange={(event) => setScorecardCurrency(event.target.value.toUpperCase())} maxLength={3} className="border-white/10 bg-gray-950" />
                  </label>
                  <label className="space-y-1 text-xs text-gray-300">
                    Evidence window start
                    <Input type="date" value={scorecardWindowStart} onChange={(event) => setScorecardWindowStart(event.target.value)} className="border-white/10 bg-gray-950" />
                  </label>
                  <label className="space-y-1 text-xs text-gray-300">
                    Evidence window end
                    <Input type="date" value={scorecardWindowEnd} onChange={(event) => setScorecardWindowEnd(event.target.value)} className="border-white/10 bg-gray-950" />
                  </label>
                  <label className="space-y-1 text-xs text-gray-300">
                    Source type
                    <select value={scorecardEvidenceType} onChange={(event) => setScorecardEvidenceType(event.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-gray-950 px-3 text-sm text-white">
                      <option value="canonical_ledger">canonical_ledger</option>
                      <option value="provider_receipt">provider_receipt</option>
                      <option value="approved_report">approved_report</option>
                      <option value="manual_review">manual_review</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-gray-300">
                    Non-secret evidence reference
                    <Input value={scorecardEvidenceReference} onChange={(event) => setScorecardEvidenceReference(event.target.value)} placeholder="Report, ledger query, or provider receipt reference" className="border-white/10 bg-gray-950" />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {SCORECARD_METRIC_FIELDS.map(([key, label]) => (
                    <label key={key} className="space-y-1 text-xs text-gray-300">
                      {label}
                      <Input
                        type="number"
                        step="1"
                        value={scorecardMetrics[key] || ""}
                        onChange={(event) => setScorecardMetrics((current) => ({ ...current, [key]: event.target.value }))}
                        placeholder="Leave blank when unknown"
                        className="border-white/10 bg-gray-950"
                      />
                    </label>
                  ))}
                </div>
                <label className="flex items-start gap-2 text-xs text-gray-300">
                  <input type="checkbox" checked={scorecardEvidenceVerified} onChange={(event) => setScorecardEvidenceVerified(event.target.checked)} />
                  I verified this source bundle. Leave unchecked to record it transparently as partial evidence.
                </label>
                <label className="flex items-start gap-2 text-xs text-gray-300">
                  <input type="checkbox" checked={scorecardConfirmed} onChange={(event) => setScorecardConfirmed(event.target.checked)} />
                  I am accountable for these values and confirm that the reference contains no token, key, password, or other credential.
                </label>
                <Button
                  type="button"
                  onClick={() => scorecardMutation.mutate()}
                  disabled={
                    scorecardMutation.isPending ||
                    !scorecardConfirmed ||
                    !hasScorecardMetrics ||
                    !scorecardEvidenceReference.trim() ||
                    !scorecardWindowStart ||
                    !scorecardWindowEnd ||
                    !/^[A-Z]{3}$/.test(scorecardCurrency)
                  }
                >
                  {scorecardMutation.isPending ? "Recording…" : "Record scorecard evidence"}
                </Button>
                <div className="text-xs text-gray-500">No external action, provider call, spend, publication, or background execution occurs.</div>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/20 text-white">
          <CardHeader>
            <CardTitle className="text-base">Territory advertising envelopes</CardTitle>
            <p className="text-xs text-gray-400">
              Reuses the governed <code>ad_budget_envelopes</code> hierarchy. This view cannot approve an envelope or spend funds.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {advertisingBudgetEnvelopes.map((envelope: any) => (
              <div key={envelope.id} className="rounded-lg border border-white/10 p-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{envelope.name}</div>
                    <div className="mt-1 text-gray-400">{envelope.scopeType} · {envelope.status} · {envelope.currencyCode}</div>
                  </div>
                  <div className="text-right text-gray-300">
                    <div>Cap {metricValue(envelope.totalCapMinor)}</div>
                    <div>Committed {metricValue(envelope.committedMinor)} · spent {metricValue(envelope.spentMinor)}</div>
                  </div>
                </div>
                <div className="mt-2 text-gray-500">
                  Daily {metricValue(envelope.dailyCapMinor)} · weekly {metricValue(envelope.weeklyCapMinor)} · monthly {metricValue(envelope.monthlyCapMinor)} · agent reallocation {envelope.agentReallocationAllowed ? `bounded to ${envelope.maximumReallocationBps} bps` : "off"}
                </div>
              </div>
            ))}
            {!advertisingBudgetEnvelopes.length ? (
              <div className="text-sm text-gray-400">No governed advertising envelope is bound to this territory.</div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-black/20 text-white">
        <CardHeader>
          <CardTitle className="text-base">Prepare the neighborhood operating package</CardTitle>
          <p className="text-xs text-gray-400">
            This records evidence and creates paused work items. It does not start agents, publish content, spend money, or contact providers.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-gray-300">
              Operating mode
              <select
                value={operatingMode}
                onChange={(event) => setOperatingMode(event.target.value)}
                className="h-10 w-full rounded-md border border-white/10 bg-gray-950 px-3 text-sm text-white"
              >
                <option value="research_only">research_only</option>
                <option value="media_pilot">media_pilot</option>
                <option value="commerce">commerce</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-gray-300">
              Primary language
              <Input value={primaryLanguage} onChange={(event) => setPrimaryLanguage(event.target.value)} placeholder="fr" className="border-white/10 bg-gray-950" />
            </label>
            <label className="space-y-1 text-xs text-gray-300 md:col-span-2">
              Priority sectors
              <Input value={prioritySectors} onChange={(event) => setPrioritySectors(event.target.value)} placeholder="agro-processing, logistics" className="border-white/10 bg-gray-950" />
            </label>
            <label className="space-y-1 text-xs text-gray-300 md:col-span-2">
              Geography evidence reference
              <Input
                value={geographyEvidenceReference}
                onChange={(event) => setGeographyEvidenceReference(event.target.value)}
                placeholder="Only needed when the canonical territory has no OSM/source reference"
                className="border-white/10 bg-gray-950"
              />
            </label>
          </div>
          <label className="flex items-start gap-2 text-xs text-gray-300">
            <input type="checkbox" checked={confirmGeographyEvidence} onChange={(event) => setConfirmGeographyEvidence(event.target.checked)} />
            I verified the manual geography evidence reference; no coordinates were invented.
          </label>
          <Button onClick={() => prepareMutation.mutate()} disabled={prepareMutation.isPending || !primaryLanguage.trim() || !prioritySectors.trim()}>
            {prepareMutation.isPending ? "Preparing…" : "Prepare activation package"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-white/10 bg-black/20 text-white">
          <CardHeader><CardTitle className="text-base">Coverage evidence</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {COVERAGE_KEYS.map((key) => {
              const value = latestCoverage?.[key] || { status: "unknown" };
              return (
                <div key={key} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
                  <span className="capitalize text-gray-300">{key}</span>
                  <span className={value.status === "verified" || value.status === "working" ? "text-emerald-300" : "text-amber-300"}>
                    {value.status || "unknown"}{Number.isFinite(Number(value.count)) ? ` · ${value.count}` : ""}
                  </span>
                </div>
              );
            })}
            {dataGaps.length ? <div className="pt-2 text-xs text-amber-200">Gaps: {dataGaps.join(", ")}</div> : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/20 text-white">
          <CardHeader><CardTitle className="text-base">Approval gate</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {blockers.length ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-100">
                {blockers.map((blocker) => <div key={blocker}>• {blocker}</div>)}
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-100">
                The current package is eligible for accountable approval.
              </div>
            )}
            <Textarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Approval basis and scope" className="min-h-[84px] border-white/10 bg-gray-950" />
            <Button onClick={() => approveMutation.mutate()} disabled={!canApprove || !approvalNote.trim() || approveMutation.isPending}>
              {approveMutation.isPending ? "Activating…" : "Approve activation"}
            </Button>
            {latestActivation?.status === "active" ? (
              <>
                <Textarea value={pauseReason} onChange={(event) => setPauseReason(event.target.value)} placeholder="Emergency pause reason" className="min-h-[70px] border-white/10 bg-gray-950" />
                <Button variant="destructive" onClick={() => pauseMutation.mutate()} disabled={!pauseReason.trim() || pauseMutation.isPending}>Pause territory</Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-black/20 text-white">
        <CardHeader>
          <CardTitle className="text-base">Generated work package</CardTitle>
          <p className="text-xs text-gray-400">Every item is paused, zero-budget, provenance-required, and forbidden from external action until separately authorized.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {(Array.isArray(layer?.workItems) ? layer.workItems : []).map((item: any) => (
            <div key={item.id} className="rounded-lg border border-white/10 p-3">
              <div className="text-sm font-medium text-white">{String(item.taskType || "").split(":").slice(-1)[0]}</div>
              <div className="mt-1 text-xs text-gray-400">{item.agent} · {item.status} · ${item.budgetUsdCap || "0.00"}</div>
            </div>
          ))}
          {!layer?.workItems?.length ? <div className="text-sm text-gray-400">Prepare an activation package to create the bounded queues.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
