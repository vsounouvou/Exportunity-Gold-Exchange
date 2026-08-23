import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Row = Record<string, any>;
type GovernanceResponse = {
  ok: boolean;
  accounts: Row[];
  envelopes: Row[];
  plans: Row[];
  campaigns: Row[];
  authorizations: Row[];
  ledger: Row[];
  incidents: Row[];
  conversions: Row[];
  attributions: Row[];
  credentialsExposed: false;
  externalCampaignCreated: false;
  externalSpendPerformed: false;
};

const API = "/api/admin/marketing/ads";

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function commaList(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

function toIsoDate(value: string, endOfDay = false) {
  if (!value) return "";
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`).toISOString();
}

function formatMinor(value: unknown, currency = "XOF") {
  const amount = Number(value || 0) / 100;
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function stateBadge(status: unknown) {
  const normalized = String(status || "unknown").toLowerCase();
  const positive = ["active", "approved", "healthy", "authorized", "business_owned", "tenant_owned", "verified"].includes(normalized);
  const blocked = ["blocked", "restricted", "failed", "revoked", "suspended", "not_business_owned", "not_tenant_owned"].includes(normalized);
  return (
    <Badge className={positive ? "bg-emerald-500/15 text-emerald-100" : blocked ? "bg-rose-500/15 text-rose-100" : "bg-amber-500/15 text-amber-100"}>
      {String(status || "unknown").replace(/_/g, " ")}
    </Badge>
  );
}

export default function AdminAdvertisingGovernancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const governance = useQuery<GovernanceResponse>({ queryKey: [`${API}/governance?limit=200`], staleTime: 0 });

  const action = useMutation({
    mutationFn: async (input: { path: string; body: Record<string, unknown> }) => apiRequest(input.path, "POST", input.body),
    onSuccess: () => {
      toast({ title: "Governance record updated", description: "No provider campaign or spend was executed." });
      void queryClient.invalidateQueries({ queryKey: [`${API}/governance?limit=200`] });
    },
    onError: (error: any) => toast({ title: "Governance action blocked", description: error?.message || "Request failed", variant: "destructive" }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [approvalReference, setApprovalReference] = useState("");
  const [approvalRationale, setApprovalRationale] = useState("");
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);

  const [accountForm, setAccountForm] = useState({
    platform: "facebook",
    provider: "meta",
    externalAdAccountId: "",
    externalAdAccountLabel: "",
    businessOwnerReference: "",
    authorizationStatus: "authorized",
    healthStatus: "healthy",
    restrictionStatus: "none",
    capabilities: "create_advertisement",
    permissions: "ads_management",
    providerReference: "",
    verifiedAt: new Date().toISOString().slice(0, 16),
    confirmed: false,
  });
  const [envelopeForm, setEnvelopeForm] = useState({
    idempotencyKey: newKey("ad-envelope"),
    name: "",
    scopeType: "tenant",
    scopeReferenceId: "",
    adAccountConnectionId: "",
    parentEnvelopeId: "",
    territoryId: "",
    currencyCode: "XOF",
    periodStart: today,
    periodEnd: nextMonth,
    totalCapMinor: "100000",
    dailyCapMinor: "10000",
    weeklyCapMinor: "50000",
    monthlyCapMinor: "100000",
    maximumCacMinor: "2500",
    minimumMarginBps: "1500",
    maximumReallocationBps: "0",
    confirmed: false,
  });
  const [planForm, setPlanForm] = useState({
    idempotencyKey: newKey("ad-plan"),
    envelopeId: "",
    adAccountConnectionId: "",
    territoryId: "",
    mediaItemId: "",
    platform: "facebook",
    title: "",
    objective: "Generate attributable fulfilled orders",
    productId: "",
    productEvidenceRef: "",
    approvedFactRef: "",
    stockEvidenceId: "",
    availableUnits: "1",
    deliveryReference: "",
    landingPageUrl: "",
    landingPageReference: "",
    trackingCode: newKey("tracking"),
    conversionEvent: "fulfilled_order",
    marginBps: "2000",
    maximumCacMinor: "2500",
    requestedBudgetMinor: "10000",
    creativeTitle: "",
    creativeBody: "",
    creativeCta: "Learn more",
    productOrderable: false,
    deliveryServiceable: false,
    policyApproved: false,
    confirmed: false,
  });
  const [authorizationForm, setAuthorizationForm] = useState({
    idempotencyKey: newKey("ad-auth"),
    mediaPlanId: "",
    campaignId: "",
    amountMinor: "",
    validFrom: today,
    validUntil: nextMonth,
    purpose: "Approved bounded campaign test",
    confirmed: false,
  });
  const [attributionForm, setAttributionForm] = useState({
    idempotencyKey: newKey("commerce-attribution"),
    orderId: "",
    paymentId: "",
    fulfillmentPlanId: "",
    sourceKind: "ad_campaign",
    campaignId: "",
    creativeId: "",
    publicationAttemptId: "",
    evidenceType: "tracking_code",
    evidenceReference: "",
    evidenceVerified: false,
    confirmed: false,
  });

  const data = governance.data;
  const readyAccounts = useMemo(
    () =>
      (data?.accounts || []).filter(
        (row) =>
          row.ownershipStatus === "business_owned" &&
          row.billingOwnershipStatus === "tenant_owned" &&
          ["healthy", "active", "verified"].includes(row.healthStatus) &&
          ["none", "clear", "unrestricted"].includes(row.restrictionStatus),
      ).length,
    [data?.accounts],
  );

  const requireApprovalFields = () => {
    if (!approvalConfirmed || !approvalReference.trim() || !approvalRationale.trim()) {
      toast({ title: "Approval evidence required", description: "Confirm the action and enter an authority reference and rationale.", variant: "destructive" });
      return false;
    }
    return true;
  };

  return (
    <div className="p-6 space-y-6 max-w-[1500px] mx-auto text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Advertising Governance</h1>
          <p className="text-sm text-white/60 mt-1">Business-owned accounts, hierarchical envelopes, paid-rights gates, spend authority, reconciliation, and attribution.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/media"><Button variant="outline">Media & rights</Button></Link>
          <Button variant="outline" onClick={() => governance.refetch()} disabled={governance.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${governance.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-4 flex gap-3">
        <ShieldCheck className="h-5 w-5 text-amber-200 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-50/90">
          This surface never asks for passwords or tokens. Internal approval does not create a provider campaign or spend money. Provider submission remains disabled until an official adapter, current account health, paid rights, orderability, delivery, tracking, and an approved spend authorization all pass again.
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ["Ready accounts", readyAccounts],
          ["Active envelopes", (data?.envelopes || []).filter((row) => row.status === "active").length],
          ["Plans", data?.plans?.length || 0],
          ["Campaign records", data?.campaigns?.length || 0],
          ["Spend entries", data?.ledger?.length || 0],
        ].map(([label, value]) => (
          <Card key={String(label)} className="bg-white/5 border-white/10"><CardContent className="p-4"><div className="text-2xl font-bold">{value}</div><div className="text-xs text-white/55">{label}</div></CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="bg-white/5 border-white/10">
          <CardHeader><CardTitle className="text-base">Record verified business ad account</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-white/55">Use only after provider-console/API evidence confirms business ownership, tenant billing, permissions, health, and restrictions. Do not paste credentials.</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Platform</Label><Input value={accountForm.platform} onChange={(e) => setAccountForm({ ...accountForm, platform: e.target.value, provider: e.target.value === "youtube" ? "google" : ["facebook", "instagram"].includes(e.target.value) ? "meta" : e.target.value })} /></div>
              <div><Label>Provider</Label><Input value={accountForm.provider} readOnly /></div>
              <div><Label>External account ID</Label><Input value={accountForm.externalAdAccountId} onChange={(e) => setAccountForm({ ...accountForm, externalAdAccountId: e.target.value })} /></div>
              <div><Label>Account label</Label><Input value={accountForm.externalAdAccountLabel} onChange={(e) => setAccountForm({ ...accountForm, externalAdAccountLabel: e.target.value })} /></div>
              <div><Label>Business owner reference</Label><Input value={accountForm.businessOwnerReference} onChange={(e) => setAccountForm({ ...accountForm, businessOwnerReference: e.target.value })} /></div>
              <div><Label>Provider verification reference</Label><Input value={accountForm.providerReference} onChange={(e) => setAccountForm({ ...accountForm, providerReference: e.target.value })} /></div>
              <div><Label>Capabilities</Label><Input value={accountForm.capabilities} onChange={(e) => setAccountForm({ ...accountForm, capabilities: e.target.value })} /></div>
              <div><Label>Scoped permissions</Label><Input value={accountForm.permissions} onChange={(e) => setAccountForm({ ...accountForm, permissions: e.target.value })} /></div>
              <div><Label>Health</Label><Input value={accountForm.healthStatus} onChange={(e) => setAccountForm({ ...accountForm, healthStatus: e.target.value })} /></div>
              <div><Label>Restriction</Label><Input value={accountForm.restrictionStatus} onChange={(e) => setAccountForm({ ...accountForm, restrictionStatus: e.target.value })} /></div>
            </div>
            <label className="flex items-start gap-2 text-xs text-white/75"><input type="checkbox" checked={accountForm.confirmed} onChange={(e) => setAccountForm({ ...accountForm, confirmed: e.target.checked })} className="mt-0.5" />I confirm the evidence came from the provider, the account and billing belong to this tenant, and no credentials are included.</label>
            <Button
              disabled={action.isPending || !accountForm.confirmed}
              onClick={() => action.mutate({
                path: `${API}/accounts/record-verification`,
                body: {
                  ...accountForm,
                  capabilities: commaList(accountForm.capabilities),
                  permissions: commaList(accountForm.permissions),
                  verificationEvidence: {
                    verified: true,
                    businessOwned: true,
                    billingTenantOwned: true,
                    credentialsExcluded: true,
                    verifiedAt: new Date(accountForm.verifiedAt).toISOString(),
                    providerReference: accountForm.providerReference,
                    businessOwnerReference: accountForm.businessOwnerReference,
                    verificationMethod: "provider_api_or_console_review",
                  },
                },
              })}
            >Record verification</Button>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader><CardTitle className="text-base">Prepare budget envelope</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={envelopeForm.name} onChange={(e) => setEnvelopeForm({ ...envelopeForm, name: e.target.value })} /></div>
              <div><Label>Scope</Label><Input value={envelopeForm.scopeType} onChange={(e) => setEnvelopeForm({ ...envelopeForm, scopeType: e.target.value })} /></div>
              <div><Label>Ad account ID (internal UUID)</Label><Input value={envelopeForm.adAccountConnectionId} onChange={(e) => setEnvelopeForm({ ...envelopeForm, adAccountConnectionId: e.target.value })} /></div>
              <div><Label>Parent envelope UUID</Label><Input value={envelopeForm.parentEnvelopeId} onChange={(e) => setEnvelopeForm({ ...envelopeForm, parentEnvelopeId: e.target.value })} /></div>
              <div><Label>Territory ID</Label><Input value={envelopeForm.territoryId} onChange={(e) => setEnvelopeForm({ ...envelopeForm, territoryId: e.target.value })} /></div>
              <div><Label>Currency</Label><Input value={envelopeForm.currencyCode} onChange={(e) => setEnvelopeForm({ ...envelopeForm, currencyCode: e.target.value.toUpperCase() })} /></div>
              <div><Label>Period start</Label><Input type="date" value={envelopeForm.periodStart} onChange={(e) => setEnvelopeForm({ ...envelopeForm, periodStart: e.target.value })} /></div>
              <div><Label>Period end</Label><Input type="date" value={envelopeForm.periodEnd} onChange={(e) => setEnvelopeForm({ ...envelopeForm, periodEnd: e.target.value })} /></div>
              {(["totalCapMinor", "dailyCapMinor", "weeklyCapMinor", "monthlyCapMinor", "maximumCacMinor", "minimumMarginBps"] as const).map((key) => (
                <div key={key}><Label>{key.replace(/([A-Z])/g, " $1")}</Label><Input type="number" value={envelopeForm[key]} onChange={(e) => setEnvelopeForm({ ...envelopeForm, [key]: e.target.value })} /></div>
              ))}
            </div>
            <label className="flex gap-2 text-xs text-white/75"><input type="checkbox" checked={envelopeForm.confirmed} onChange={(e) => setEnvelopeForm({ ...envelopeForm, confirmed: e.target.checked })} />I confirm these caps are intentional. This prepares an approval request only.</label>
            <Button
              disabled={action.isPending || !envelopeForm.confirmed}
              onClick={() => action.mutate({
                path: `${API}/budget-envelopes`,
                body: {
                  ...envelopeForm,
                  territoryId: Number(envelopeForm.territoryId) || null,
                  totalCapMinor: Number(envelopeForm.totalCapMinor), dailyCapMinor: Number(envelopeForm.dailyCapMinor),
                  weeklyCapMinor: Number(envelopeForm.weeklyCapMinor), monthlyCapMinor: Number(envelopeForm.monthlyCapMinor),
                  maximumCacMinor: Number(envelopeForm.maximumCacMinor), minimumMarginBps: Number(envelopeForm.minimumMarginBps),
                  maximumReallocationBps: Number(envelopeForm.maximumReallocationBps),
                  periodStart: toIsoDate(envelopeForm.periodStart), periodEnd: toIsoDate(envelopeForm.periodEnd, true),
                  stoppingConditions: { pauseOnAccountRestriction: true, pauseWhenProductUnavailable: true, pauseWhenDeliveryUnavailable: true },
                },
              })}
            >Prepare envelope</Button>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/5 border-white/10">
        <CardHeader><CardTitle className="text-base">Prepare evidence-gated media plan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-white/55">The server independently checks paid-ad rights, active neighborhood, account ownership/health, every cap, orderability, stock, delivery, landing page, tracking, margin, CAC, policy, and stop conditions.</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              ["Envelope UUID", "envelopeId"], ["Ad account UUID", "adAccountConnectionId"], ["Territory ID", "territoryId"],
              ["Media item ID", "mediaItemId"], ["Platform", "platform"], ["Plan title", "title"], ["Product ID", "productId"],
              ["Product eligibility evidence", "productEvidenceRef"], ["Approved product fact ref", "approvedFactRef"],
              ["Stock evidence ID", "stockEvidenceId"], ["Available units", "availableUnits"], ["Delivery reference", "deliveryReference"],
              ["Landing page URL", "landingPageUrl"], ["Landing-page check ref", "landingPageReference"], ["Tracking code", "trackingCode"],
              ["Conversion event", "conversionEvent"], ["Margin bps", "marginBps"], ["Max CAC (minor)", "maximumCacMinor"],
              ["Requested budget (minor)", "requestedBudgetMinor"], ["Creative title", "creativeTitle"], ["CTA", "creativeCta"],
            ].map(([label, key]) => (
              <div key={key}><Label>{label}</Label><Input value={(planForm as any)[key]} onChange={(e) => setPlanForm({ ...planForm, [key]: e.target.value })} /></div>
            ))}
          </div>
          <div><Label>Objective</Label><Textarea value={planForm.objective} onChange={(e) => setPlanForm({ ...planForm, objective: e.target.value })} /></div>
          <div><Label>Creative body</Label><Textarea value={planForm.creativeBody} onChange={(e) => setPlanForm({ ...planForm, creativeBody: e.target.value })} /></div>
          <div className="flex flex-wrap gap-5 text-xs text-white/75">
            <label className="flex gap-2"><input type="checkbox" checked={planForm.productOrderable} onChange={(e) => setPlanForm({ ...planForm, productOrderable: e.target.checked })} />Product is orderable</label>
            <label className="flex gap-2"><input type="checkbox" checked={planForm.deliveryServiceable} onChange={(e) => setPlanForm({ ...planForm, deliveryServiceable: e.target.checked })} />Delivery is verified/serviceable</label>
            <label className="flex gap-2"><input type="checkbox" checked={planForm.policyApproved} onChange={(e) => setPlanForm({ ...planForm, policyApproved: e.target.checked })} />Brand/platform policy approved</label>
            <label className="flex gap-2"><input type="checkbox" checked={planForm.confirmed} onChange={(e) => setPlanForm({ ...planForm, confirmed: e.target.checked })} />Prepare only; no provider submission or spend</label>
          </div>
          <Button
            disabled={action.isPending || !planForm.confirmed}
            onClick={() => {
              const evidenceTime = new Date().toISOString();
              action.mutate({
                path: `${API}/media-plans/prepare`,
                body: {
                  idempotencyKey: planForm.idempotencyKey, envelopeId: planForm.envelopeId,
                  adAccountConnectionId: planForm.adAccountConnectionId, territoryId: Number(planForm.territoryId),
                  mediaItemId: planForm.mediaItemId, platform: planForm.platform, title: planForm.title,
                  objective: planForm.objective, confirmed: true,
                  eligibleProducts: [{ productId: planForm.productId, orderable: planForm.productOrderable, evidenceRef: planForm.productEvidenceRef, approvedFactRef: planForm.approvedFactRef }],
                  stockCapacityEvidence: { verified: true, availableUnits: Number(planForm.availableUnits), evidenceId: planForm.stockEvidenceId, verifiedAt: evidenceTime },
                  deliveryCoverageEvidence: { verified: true, serviceable: planForm.deliveryServiceable, providerReference: planForm.deliveryReference, verifiedAt: evidenceTime },
                  landingPageUrl: planForm.landingPageUrl,
                  landingPageEvidence: { referenceId: planForm.landingPageReference, verifiedAt: evidenceTime },
                  trackingPlan: { trackingCode: planForm.trackingCode, conversionEvent: planForm.conversionEvent },
                  marginBps: Number(planForm.marginBps), maximumCacMinor: Number(planForm.maximumCacMinor),
                  requestedBudgetMinor: Number(planForm.requestedBudgetMinor), policyStatus: planForm.policyApproved ? "approved" : "pending",
                  stoppingConditions: {
                    maxSpendMinor: Number(planForm.requestedBudgetMinor), maxCacMinor: Number(planForm.maximumCacMinor),
                    pauseOnAccountRestriction: true, pauseWhenProductUnavailable: true, pauseWhenDeliveryUnavailable: true,
                  },
                  creative: { title: planForm.creativeTitle || planForm.title, body: planForm.creativeBody, callToAction: planForm.creativeCta, destinationUrl: planForm.landingPageUrl, factSnapshot: { approvedFactRef: planForm.approvedFactRef } },
                },
              });
            }}
          >Prepare media plan</Button>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-base">Reconcile a fulfilled order to one canonical media touchpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-white/55">
            This creates one verified conversion and one 100% attribution only after the server rechecks the exact completed order, succeeded payment, delivered fulfillment plan, provider-confirmed campaign or publication, current rights grant, tenant, territory, currency, and amount. It does not call a provider or start a background job.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Industrial order UUID</Label><Input value={attributionForm.orderId} onChange={(e) => setAttributionForm({ ...attributionForm, orderId: e.target.value })} /></div>
            <div><Label>Succeeded payment UUID</Label><Input value={attributionForm.paymentId} onChange={(e) => setAttributionForm({ ...attributionForm, paymentId: e.target.value })} /></div>
            <div><Label>Delivered fulfillment-plan UUID</Label><Input value={attributionForm.fulfillmentPlanId} onChange={(e) => setAttributionForm({ ...attributionForm, fulfillmentPlanId: e.target.value })} /></div>
            <div>
              <Label>Touchpoint kind</Label>
              <select
                value={attributionForm.sourceKind}
                onChange={(e) => setAttributionForm({ ...attributionForm, sourceKind: e.target.value })}
                className="h-10 w-full rounded-md border border-white/10 bg-gray-950 px-3 text-sm"
              >
                <option value="ad_campaign">Provider-confirmed ad campaign</option>
                <option value="social_publication">Provider-confirmed organic publication</option>
              </select>
            </div>
            {attributionForm.sourceKind === "ad_campaign" ? (
              <>
                <div><Label>Campaign UUID</Label><Input value={attributionForm.campaignId} onChange={(e) => setAttributionForm({ ...attributionForm, campaignId: e.target.value })} /></div>
                <div><Label>Approved creative UUID</Label><Input value={attributionForm.creativeId} onChange={(e) => setAttributionForm({ ...attributionForm, creativeId: e.target.value })} /></div>
              </>
            ) : (
              <div><Label>Published attempt UUID</Label><Input value={attributionForm.publicationAttemptId} onChange={(e) => setAttributionForm({ ...attributionForm, publicationAttemptId: e.target.value })} /></div>
            )}
            <div>
              <Label>Attribution evidence type</Label>
              <select
                value={attributionForm.evidenceType}
                onChange={(e) => setAttributionForm({ ...attributionForm, evidenceType: e.target.value })}
                className="h-10 w-full rounded-md border border-white/10 bg-gray-950 px-3 text-sm"
              >
                <option value="tracking_code">Tracking code</option>
                <option value="provider_receipt">Provider receipt</option>
                <option value="approved_manual_review">Approved manual review</option>
              </select>
            </div>
            <div className="md:col-span-2"><Label>Non-secret evidence reference</Label><Input placeholder="Tracking, receipt, or approved review reference—never paste a token" value={attributionForm.evidenceReference} onChange={(e) => setAttributionForm({ ...attributionForm, evidenceReference: e.target.value })} /></div>
          </div>
          <label className="flex items-start gap-2 text-xs text-white/75">
            <input type="checkbox" checked={attributionForm.evidenceVerified} onChange={(e) => setAttributionForm({ ...attributionForm, evidenceVerified: e.target.checked })} className="mt-0.5" />
            I verified the order-to-touchpoint evidence and confirm that its reference contains no token, key, password, cookie, or authorization material.
          </label>
          <label className="flex items-start gap-2 text-xs text-white/75">
            <input type="checkbox" checked={attributionForm.confirmed} onChange={(e) => setAttributionForm({ ...attributionForm, confirmed: e.target.checked })} className="mt-0.5" />
            I am accountable for binding this fulfilled order to this single media touchpoint.
          </label>
          <Button
            disabled={
              action.isPending ||
              !attributionForm.confirmed ||
              !attributionForm.evidenceVerified ||
              !attributionForm.orderId.trim() ||
              !attributionForm.paymentId.trim() ||
              !attributionForm.fulfillmentPlanId.trim() ||
              !attributionForm.evidenceReference.trim() ||
              (attributionForm.sourceKind === "ad_campaign"
                ? !attributionForm.campaignId.trim() || !attributionForm.creativeId.trim()
                : !attributionForm.publicationAttemptId.trim())
            }
            onClick={() => action.mutate({
              path: `${API}/conversions/reconcile-fulfilled-order`,
              body: {
                idempotencyKey: attributionForm.idempotencyKey,
                orderId: attributionForm.orderId,
                paymentId: attributionForm.paymentId,
                fulfillmentPlanId: attributionForm.fulfillmentPlanId,
                sourceKind: attributionForm.sourceKind,
                campaignId: attributionForm.sourceKind === "ad_campaign" ? attributionForm.campaignId : null,
                creativeId: attributionForm.sourceKind === "ad_campaign" ? attributionForm.creativeId : null,
                publicationAttemptId: attributionForm.sourceKind === "social_publication" ? attributionForm.publicationAttemptId : null,
                attributionEvidence: {
                  type: attributionForm.evidenceType,
                  reference: attributionForm.evidenceReference,
                  verified: attributionForm.evidenceVerified,
                  credentialsExcluded: true,
                },
                confirmed: attributionForm.confirmed,
              },
            })}
          >
            Reconcile canonical fulfilled-order attribution
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="bg-white/5 border-white/10 xl:col-span-2">
          <CardHeader><CardTitle className="text-base">Approval evidence</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3"><div><Label>Authority / decision reference</Label><Input value={approvalReference} onChange={(e) => setApprovalReference(e.target.value)} /></div><div><Label>Rationale</Label><Input value={approvalRationale} onChange={(e) => setApprovalRationale(e.target.value)} /></div></div>
            <label className="flex gap-2 text-xs text-white/75"><input type="checkbox" checked={approvalConfirmed} onChange={(e) => setApprovalConfirmed(e.target.checked)} />I am the accountable approver; facts, rights, account health, caps, and stop rules remain current.</label>
            <div className="text-xs text-white/50">These controls approve internal records only. There is deliberately no “Launch campaign” or “Spend now” control.</div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardHeader><CardTitle className="text-base">Prepare spend authorization</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Approved media plan UUID" value={authorizationForm.mediaPlanId} onChange={(e) => setAuthorizationForm({ ...authorizationForm, mediaPlanId: e.target.value })} />
            <Input placeholder="Approved campaign UUID" value={authorizationForm.campaignId} onChange={(e) => setAuthorizationForm({ ...authorizationForm, campaignId: e.target.value })} />
            <Input type="number" placeholder="Amount in minor units" value={authorizationForm.amountMinor} onChange={(e) => setAuthorizationForm({ ...authorizationForm, amountMinor: e.target.value })} />
            <div className="grid grid-cols-2 gap-2"><Input type="date" value={authorizationForm.validFrom} onChange={(e) => setAuthorizationForm({ ...authorizationForm, validFrom: e.target.value })} /><Input type="date" value={authorizationForm.validUntil} onChange={(e) => setAuthorizationForm({ ...authorizationForm, validUntil: e.target.value })} /></div>
            <Input placeholder="Purpose" value={authorizationForm.purpose} onChange={(e) => setAuthorizationForm({ ...authorizationForm, purpose: e.target.value })} />
            <label className="flex gap-2 text-xs"><input type="checkbox" checked={authorizationForm.confirmed} onChange={(e) => setAuthorizationForm({ ...authorizationForm, confirmed: e.target.checked })} />Prepare request only</label>
            <Button size="sm" disabled={action.isPending || !authorizationForm.confirmed} onClick={() => action.mutate({
              path: `${API}/spend-authorizations/prepare`,
              body: {
                ...authorizationForm, amountMinor: Number(authorizationForm.amountMinor),
                validFrom: toIsoDate(authorizationForm.validFrom), validUntil: toIsoDate(authorizationForm.validUntil, true),
                authorityBounds: { mediaPlanId: authorizationForm.mediaPlanId, campaignId: authorizationForm.campaignId, noCrossCampaignUse: true },
              },
            })}>Prepare authorization</Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="bg-white/5 border-white/10">
          <CardHeader><CardTitle className="text-base">Business ad accounts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.accounts || []).length ? data!.accounts.map((row) => (
              <div key={row.id} className="rounded-lg border border-white/10 p-3 grid md:grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-2 text-sm items-center">
                <div><div className="font-medium">{row.externalAdAccountLabel || row.externalAdAccountId}</div><div className="text-xs text-white/45">{row.platform} · {row.provider} · {row.id}</div></div>
                <div>{stateBadge(row.ownershipStatus)}</div><div>{stateBadge(row.billingOwnershipStatus)}</div><div>{stateBadge(row.healthStatus)}</div><div>{stateBadge(row.restrictionStatus)}</div>
              </div>
            )) : <div className="text-sm text-white/50">No verified tenant ad account is recorded. Campaign preparation will fail closed.</div>}
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader><CardTitle className="text-base">Budget envelopes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.envelopes || []).map((row) => (
              <div key={row.id} className="rounded-lg border border-white/10 p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div><div className="font-medium">{row.name}</div><div className="text-xs text-white/45">{row.scopeType} · {row.id}</div></div>
                <div className="text-xs">Cap {formatMinor(row.totalCapMinor, row.currencyCode)} · committed {formatMinor(row.committedMinor, row.currencyCode)} · spent {formatMinor(row.spentMinor, row.currencyCode)}</div>
                {stateBadge(row.status)}
                {row.status === "approval_required" ? <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => requireApprovalFields() && action.mutate({ path: `${API}/budget-envelopes/${row.id}/approve`, body: { confirmed: true, authorityReference: approvalReference, rationale: approvalRationale } })}>Approve internally</Button> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader><CardTitle className="text-base">Media plans and campaign records</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.plans || []).map((plan) => {
              const campaign = (data?.campaigns || []).find((row) => row.mediaPlanId === plan.id);
              return <div key={plan.id} className="rounded-lg border border-white/10 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">{plan.title}</div><div className="text-xs text-white/45">plan {plan.id} · campaign {campaign?.id || "not created"}</div></div><div className="flex gap-2">{stateBadge(plan.status)}{campaign ? stateBadge(campaign.status) : null}</div></div>
                {Array.isArray(plan.blockers) && plan.blockers.length ? <div className="text-xs text-rose-200 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{plan.blockers.join(" · ")}</span></div> : <div className="text-xs text-emerald-200 flex gap-2"><CheckCircle2 className="h-4 w-4" />Pre-spend evidence has no recorded blockers.</div>}
                {plan.status === "approval_required" ? <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => requireApprovalFields() && action.mutate({ path: `${API}/media-plans/${plan.id}/approve`, body: { confirmed: true, factsStillCurrent: true, creativeApproved: true, approvalReference } })}>Approve plan & creative internally</Button> : null}
              </div>;
            })}
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader><CardTitle className="text-base">Spend authorization and immutable reconciliation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(data?.authorizations || []).map((row) => (
              <div key={row.id} className="rounded-lg border border-white/10 p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div><div className="font-medium">{formatMinor(row.amountMinor, row.currencyCode)}</div><div className="text-xs text-white/45">{row.id} · campaign {row.campaignId || "-"}</div></div>
                {stateBadge(row.status)}
                {row.status === "approval_required" ? <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => requireApprovalFields() && action.mutate({ path: `${API}/spend-authorizations/${row.id}/approve`, body: { confirmed: true, approvalReference, rationale: approvalRationale } })}>Reserve internally</Button> : null}
              </div>
            ))}
            <div className="border-t border-white/10 pt-3">
              <div className="text-xs uppercase tracking-wide text-white/45 mb-2 flex items-center gap-2"><WalletCards className="h-4 w-4" />Provider charge reconciliation</div>
              {(data?.ledger || []).length ? data!.ledger.map((row) => <div key={row.id} className="text-xs py-2 border-b border-white/5">{row.occurredAt} · {row.entryType} · {formatMinor(row.amountMinor, row.currencyCode)} · {row.reconciliationStatus}</div>) : <div className="text-sm text-white/50">No provider spend has been recorded or claimed.</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-base">Canonical fulfilled-commerce conversions and attribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.conversions || []).length ? data!.conversions.map((conversion) => {
              const attribution = (data?.attributions || []).find(
                (row) => row.conversionEventId === conversion.id,
              );
              return (
                <div key={conversion.id} className="rounded-lg border border-white/10 p-3 text-sm space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{conversion.orderReference || conversion.eventType}</div>
                      <div className="text-xs text-white/45">
                        conversion {conversion.id} · territory {conversion.territoryId || "legacy/unbound"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {stateBadge(conversion.verificationStatus)}
                      {stateBadge(conversion.canonicalBindingStatus)}
                    </div>
                  </div>
                  <div className="text-xs text-white/65">
                    {conversion.sourceKind || "legacy provider event"} · {Number(conversion.valueMinor || 0).toLocaleString()} {conversion.currencyCode} canonical payment-ledger units · {conversion.occurredAt}
                  </div>
                  {attribution ? (
                    <div className="text-xs text-emerald-200">
                      {attribution.attributionModel} · {attribution.weightBps} bps · {attribution.touchpointReference}
                    </div>
                  ) : (
                    <div className="text-xs text-amber-200">No attribution row is bound to this conversion.</div>
                  )}
                </div>
              );
            }) : (
              <div className="text-sm text-white/50">
                No conversion is claimed. A row appears only after the complete order → payment → delivery → rights-cleared touchpoint chain passes.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
