import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Factory,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Row = Record<string, any>;
type AdminPayload = {
  ok: boolean;
  campaigns: Row[];
  tiers: Row[];
  commitments: Row[];
  updates: Row[];
  productionBatches: Row[];
  productionBatchAllocations: Row[];
  settlementPlans: Row[];
  settlementAllocations: Row[];
  providerExecutionEnabled: false;
  investmentRailEnabled: false;
};

const API = "/api/group-buying";

function futureLocalDate(days = 30) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseJson(value: string, field: string) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${field} must be valid JSON.`);
  }
}

function formatMinor(value: unknown, currency = "XOF") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0) / 100);
}

function statusBadge(value: unknown) {
  const status = String(value || "unknown").toLowerCase();
  const positive = ["live", "payment_confirmed", "production", "ready_for_pickup", "in_transit", "delivered", "settled", "fulfilled", "approved_submission_ready"].includes(status);
  const blocked = ["failed", "refunding", "refunded", "cancelled"].includes(status);
  return <Badge className={positive ? "bg-emerald-500/15 text-emerald-700" : blocked ? "bg-rose-500/15 text-rose-700" : "bg-amber-500/15 text-amber-800"}>{status.replaceAll("_", " ")}</Badge>;
}

function ConfirmBox({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span>{children}</span>
    </label>
  );
}

function JsonField({ label, value, onChange, rows = 5 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return <div className="space-y-2"><Label>{label}</Label><Textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className="font-mono text-xs" /></div>;
}

export default function AdminGroupBuyingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery<AdminPayload>({ queryKey: [`${API}/admin`] });
  const operation = useMutation({
    mutationFn: (input: { url: string; body: Row; title: string }) => apiRequest(input.url, "POST", input.body).then((result) => ({ result, title: input.title })),
    onSuccess: ({ title }) => {
      toast({ title, description: "The governed local record was updated. No provider API was called." });
      queryClient.invalidateQueries({ queryKey: [`${API}/admin`] });
    },
    onError: (error: Error) => toast({ title: "Governed operation blocked", description: error.message, variant: "destructive" }),
  });

  const [prepareConfirmed, setPrepareConfirmed] = useState(false);
  const [prepare, setPrepare] = useState({
    referenceCode: "",
    slug: "",
    campaignType: "group_order",
    catalogItemId: "",
    producerFactoryId: "",
    supplierProfileId: "",
    territoryId: "",
    campaignMediaItemId: "",
    mediaRightsGrantId: "",
    title: "",
    publicSummary: "",
    unitOfMeasure: "unit",
    minimumQuantity: "100",
    currencyCode: "XOF",
    baseUnitPriceMinor: "0",
    deadline: futureLocalDate(),
    productionLeadTimeDays: "30",
    paymentTerms: "Payment is completed through the canonical industrial order checkout.",
    refundConditions: "Refund handling follows the stated campaign conditions and provider-confirmed reconciliation.",
    deliveryOptions: '[{"id":"standard-delivery","label":"Governed carrier delivery"}]',
    capacityEvidence: '{"verified":true,"sourceReferences":["capacity-document-reference"]}',
    campaignContent: '{"commerceOnly":true}',
    tiers: '[{"minimumQuantity":"100","maximumQuantity":null,"unitPriceMinor":10000,"currencyCode":"XOF","label":"Production tier","evidence":{"verified":true,"sourceReferences":["approved-price-sheet"]}}]',
  });

  const [authorize, setAuthorize] = useState({ campaignId: "", rationale: "", verificationEvidence: '{"sourceReferences":["approval-review"]}' });
  const [authorizeConfirmed, setAuthorizeConfirmed] = useState(false);
  const [binding, setBinding] = useState({ commitmentId: "", industrialOrderId: "", paymentId: "" });
  const [bindingConfirmed, setBindingConfirmed] = useState(false);
  const [update, setUpdate] = useState({ campaignId: "", audience: "buyers", title: "", body: "", evidence: '{"sourceReferences":["operations-evidence"]}' });
  const [updateConfirmed, setUpdateConfirmed] = useState(false);
  const [batch, setBatch] = useState({ campaignId: "", referenceCode: "", commitmentIds: "[]", capacityEvidence: '{"verified":true,"sourceReferences":["capacity-confirmation"]}' });
  const [batchConfirmed, setBatchConfirmed] = useState(false);
  const [transition, setTransition] = useState({
    productionBatchId: "",
    nextStatus: "funded_by_orders",
    quantities: "{}",
    productionEvidence: "[]",
    inspectionEvidence: "[]",
    handoffEvidence: "[]",
    deliveryEvidence: "[]",
    settlementEvidence: "[]",
    carrierBookingAuthorizationId: "",
    publicMessage: "",
    internalNote: "",
  });
  const [transitionFlags, setTransitionFlags] = useState({ production: false, handoff: false, settlement: false, confirmed: false });
  const [settlement, setSettlement] = useState({
    productionBatchId: "",
    refundExposureMinor: "0",
    currencyCode: "XOF",
    allocations: '[{"recipientRole":"producer_proceeds","recipientReference":"producer-contract-reference","amountMinor":0,"currencyCode":"XOF","calculationBasis":"Canonical paid-order gross less documented allocations.","evidence":{"sourceReferences":["settlement-calculation"]}}]',
    calculationEvidence: '{"verified":true,"sourceReferences":["canonical-paid-orders"]}',
  });
  const [settlementConfirmed, setSettlementConfirmed] = useState(false);
  const [settlementApproval, setSettlementApproval] = useState({ settlementPlanId: "", approvalReference: "", rationale: "", approvalEvidence: '{"sourceReferences":["finance-review"]}' });
  const [settlementApprovalConfirmed, setSettlementApprovalConfirmed] = useState(false);

  const campaigns = query.data?.campaigns || [];
  const commitments = query.data?.commitments || [];
  const batches = query.data?.productionBatches || [];
  const settlements = query.data?.settlementPlans || [];
  const bindingCandidates = useMemo(() => commitments.filter((row) => !row.canonicalPaymentVerified), [commitments]);
  const paidCommitments = useMemo(() => commitments.filter((row) => row.canonicalPaymentVerified), [commitments]);

  function run(input: { url: string; body: Row; title: string }) {
    try {
      operation.mutate(input);
    } catch (error: any) {
      toast({ title: "Invalid workbench input", description: error.message, variant: "destructive" });
    }
  }

  if (query.isLoading) return <div className="flex min-h-[60vh] items-center justify-center text-slate-500">Loading group commerce…</div>;
  if (query.isError) return <div className="p-8"><Card><CardContent className="pt-6"><h1 className="font-semibold">Group Commerce could not load</h1><p className="mt-2 text-sm text-slate-500">{(query.error as Error).message}</p></CardContent></Card></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 pb-20 sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-700">Producer Exchange operations</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Group purchase, production batch, and settlement truth</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Prepare product-commerce campaigns, bind only canonical paid industrial orders, and advance production only from evidence. Provider submission remains a separate integration step.</p>
        </div>
        <div className="flex gap-2"><Link href="/producer-exchange"><Button variant="outline">Open Producer Exchange</Button></Link><Button variant="outline" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          [Factory, "Campaigns", campaigns.length],
          [Users, "Interest records", commitments.length],
          [Boxes, "Production batches", batches.length],
          [CircleDollarSign, "Settlement plans", settlements.length],
        ].map(([Icon, label, value]: any) => <Card key={label}><CardContent className="flex items-center gap-4 pt-6"><div className="rounded-xl bg-cyan-50 p-3"><Icon className="h-5 w-5 text-cyan-700" /></div><div><div className="text-2xl font-semibold">{value}</div><div className="text-sm text-slate-500">{label}</div></div></CardContent></Card>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-emerald-200 bg-emerald-50/50"><CardContent className="flex gap-3 pt-6"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" /><div><div className="font-semibold text-emerald-950">Commerce rail only</div><p className="mt-1 text-sm leading-6 text-emerald-900/75">No equity, debt, dividend, yield, revenue-share, tokenized asset, or guaranteed-return object exists in this workspace.</p></div></CardContent></Card>
        <Card className="border-amber-200 bg-amber-50/60"><CardContent className="flex gap-3 pt-6"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" /><div><div className="font-semibold text-amber-950">Provider execution is disabled here</div><p className="mt-1 text-sm leading-6 text-amber-900/75">Campaign Actions do not collect payment, start production, book carriers, submit settlements, or claim provider confirmation without canonical receipts.</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Campaign ledger</CardTitle></CardHeader>
        <CardContent>
          {campaigns.length ? <div className="space-y-3">{campaigns.map((campaign) => (
            <div key={campaign.id} className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><div className="font-semibold">{campaign.title}</div>{statusBadge(campaign.status)}</div><div className="mt-1 text-xs text-slate-500">{campaign.referenceCode} · {campaign.id}</div></div>
              <div className="text-sm"><span className="font-medium">{Number(campaign.committedQuantity).toLocaleString()}</span> / {Number(campaign.minimumQuantity).toLocaleString()} {campaign.unitOfMeasure}</div>
              <Button size="sm" variant="outline" onClick={() => { setAuthorize((value) => ({ ...value, campaignId: campaign.id })); setUpdate((value) => ({ ...value, campaignId: campaign.id })); setBatch((value) => ({ ...value, campaignId: campaign.id })); }}>Use in workbench</Button>
            </div>
          ))}</div> : <p className="text-sm text-slate-500">No group-purchase campaign has been prepared.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>1. Prepare a commerce campaign</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Reference code", "referenceCode"], ["Public slug", "slug"], ["Catalog item UUID", "catalogItemId"], ["Producer factory UUID", "producerFactoryId"], ["Supplier profile UUID (optional)", "supplierProfileId"], ["Territory ID", "territoryId"], ["Title", "title"], ["Unit of measure", "unitOfMeasure"], ["Minimum quantity", "minimumQuantity"], ["Currency", "currencyCode"], ["Base unit price (minor)", "baseUnitPriceMinor"], ["Lead time days", "productionLeadTimeDays"],
              ].map(([label, key]) => <div key={key} className="space-y-2"><Label>{label}</Label><Input value={(prepare as any)[key]} onChange={(event) => setPrepare((value) => ({ ...value, [key]: event.target.value }))} /></div>)}
              <div className="space-y-2"><Label>Campaign type</Label><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={prepare.campaignType} onChange={(event) => setPrepare((value) => ({ ...value, campaignType: event.target.value }))}>{["preorder", "group_order", "buyer_club", "production_batch", "recurring_procurement"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
              <div className="space-y-2"><Label>Interest deadline</Label><Input type="datetime-local" value={prepare.deadline} onChange={(event) => setPrepare((value) => ({ ...value, deadline: event.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Public summary</Label><Textarea value={prepare.publicSummary} onChange={(event) => setPrepare((value) => ({ ...value, publicSummary: event.target.value }))} /></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Payment terms</Label><Textarea value={prepare.paymentTerms} onChange={(event) => setPrepare((value) => ({ ...value, paymentTerms: event.target.value }))} /></div><div className="space-y-2"><Label>Refund conditions</Label><Textarea value={prepare.refundConditions} onChange={(event) => setPrepare((value) => ({ ...value, refundConditions: event.target.value }))} /></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><JsonField label="Delivery options JSON" value={prepare.deliveryOptions} onChange={(deliveryOptions) => setPrepare((value) => ({ ...value, deliveryOptions }))} /><JsonField label="Capacity evidence JSON" value={prepare.capacityEvidence} onChange={(capacityEvidence) => setPrepare((value) => ({ ...value, capacityEvidence }))} /><JsonField label="Verified tiers JSON" value={prepare.tiers} onChange={(tiers) => setPrepare((value) => ({ ...value, tiers }))} /><JsonField label="Campaign content JSON" value={prepare.campaignContent} onChange={(campaignContent) => setPrepare((value) => ({ ...value, campaignContent }))} /></div>
            <ConfirmBox checked={prepareConfirmed} onChange={setPrepareConfirmed}>I confirm that producer, catalog, territory, capacity, pricing, delivery, and any selected media rights have been reviewed. This preparation does not collect money.</ConfirmBox>
            <Button disabled={!prepareConfirmed || operation.isPending} onClick={() => {
              try {
                run({ url: `${API}/admin/campaigns/prepare`, title: "Campaign prepared", body: { ...prepare, territoryId: Number(prepare.territoryId), supplierProfileId: prepare.supplierProfileId || null, baseUnitPriceMinor: Number(prepare.baseUnitPriceMinor), productionLeadTimeDays: Number(prepare.productionLeadTimeDays), deadline: new Date(prepare.deadline).toISOString(), deliveryOptions: parseJson(prepare.deliveryOptions, "Delivery options"), capacityEvidence: parseJson(prepare.capacityEvidence, "Capacity evidence"), campaignContent: parseJson(prepare.campaignContent, "Campaign content"), tiers: parseJson(prepare.tiers, "Tiers"), confirmed: true } });
              } catch (error: any) { toast({ title: "Invalid campaign input", description: error.message, variant: "destructive" }); }
            }}>Prepare verification-required campaign</Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>2. Authorize verified campaign live</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Campaign UUID</Label><Input value={authorize.campaignId} onChange={(event) => setAuthorize((value) => ({ ...value, campaignId: event.target.value }))} /></div>
              <div className="space-y-2"><Label>Approval rationale</Label><Textarea value={authorize.rationale} onChange={(event) => setAuthorize((value) => ({ ...value, rationale: event.target.value }))} /></div>
              <JsonField label="Verification evidence JSON" value={authorize.verificationEvidence} onChange={(verificationEvidence) => setAuthorize((value) => ({ ...value, verificationEvidence }))} />
              <ConfirmBox checked={authorizeConfirmed} onChange={setAuthorizeConfirmed}>I authorize this verified product-commerce campaign to accept non-binding interest. No payment collection is authorized.</ConfirmBox>
              <Button disabled={!authorizeConfirmed || operation.isPending} onClick={() => { try { run({ url: `${API}/admin/campaigns/${authorize.campaignId}/authorize`, title: "Campaign authorized live", body: { rationale: authorize.rationale, verificationEvidence: parseJson(authorize.verificationEvidence, "Verification evidence"), confirmed: true } }); } catch (error: any) { toast({ title: "Invalid authorization input", description: error.message, variant: "destructive" }); } }}>Authorize live</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3. Publish evidence-backed update</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Campaign UUID</Label><Input value={update.campaignId} onChange={(event) => setUpdate((value) => ({ ...value, campaignId: event.target.value }))} /></div><div className="space-y-2"><Label>Audience</Label><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={update.audience} onChange={(event) => setUpdate((value) => ({ ...value, audience: event.target.value }))}>{["buyers", "public", "operations"].map((value) => <option key={value}>{value}</option>)}</select></div></div>
              <div className="space-y-2"><Label>Title</Label><Input value={update.title} onChange={(event) => setUpdate((value) => ({ ...value, title: event.target.value }))} /></div>
              <div className="space-y-2"><Label>Update</Label><Textarea value={update.body} onChange={(event) => setUpdate((value) => ({ ...value, body: event.target.value }))} /></div>
              <JsonField label="Evidence JSON" value={update.evidence} onChange={(evidence) => setUpdate((value) => ({ ...value, evidence }))} />
              <ConfirmBox checked={updateConfirmed} onChange={setUpdateConfirmed}>I approve this factual update for the owned Producer Exchange surface. It will not post to social platforms.</ConfirmBox>
              <Button disabled={!updateConfirmed || operation.isPending} onClick={() => { try { run({ url: `${API}/admin/campaigns/${update.campaignId}/updates/publish`, title: "Campaign update published", body: { idempotencyKey: newKey("campaign-update"), audience: update.audience, title: update.title, body: update.body, evidence: parseJson(update.evidence, "Update evidence"), confirmed: true } }); } catch (error: any) { toast({ title: "Invalid update input", description: error.message, variant: "destructive" }); } }}>Publish owned-surface update</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>4. Bind a provider-confirmed paid order</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-600">{bindingCandidates.length} interest record(s) still non-binding. Binding succeeds only when the order snapshot, paid amount, currency, target, provider reference, and credited timestamp all match.</div>
            {[['Commitment UUID','commitmentId'],['Industrial order UUID','industrialOrderId'],['Payment UUID','paymentId']].map(([label,key]) => <div key={key} className="space-y-2"><Label>{label}</Label><Input value={(binding as any)[key]} onChange={(event) => setBinding((value) => ({ ...value, [key]: event.target.value }))} /></div>)}
            <ConfirmBox checked={bindingConfirmed} onChange={setBindingConfirmed}>I confirm this is an existing canonical industrial order and provider-confirmed payment. This action creates no checkout or charge.</ConfirmBox>
            <Button disabled={!bindingConfirmed || operation.isPending} onClick={() => run({ url: `${API}/admin/commitments/${binding.commitmentId}/bind-paid-order`, title: "Canonical paid order bound", body: { industrialOrderId: binding.industrialOrderId, paymentId: binding.paymentId, confirmed: true } })}>Verify and bind paid order</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>5. Allocate a production batch</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-600">{paidCommitments.length} provider-confirmed paid commitment(s) are eligible, subject to campaign MOQ and exact allocation.</div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Campaign UUID</Label><Input value={batch.campaignId} onChange={(event) => setBatch((value) => ({ ...value, campaignId: event.target.value }))} /></div><div className="space-y-2"><Label>Batch reference</Label><Input value={batch.referenceCode} onChange={(event) => setBatch((value) => ({ ...value, referenceCode: event.target.value }))} /></div></div>
            <JsonField label="Paid commitment UUIDs JSON array" value={batch.commitmentIds} onChange={(commitmentIds) => setBatch((value) => ({ ...value, commitmentIds }))} />
            <JsonField label="Capacity evidence JSON" value={batch.capacityEvidence} onChange={(capacityEvidence) => setBatch((value) => ({ ...value, capacityEvidence }))} />
            <ConfirmBox checked={batchConfirmed} onChange={setBatchConfirmed}>I approve exact allocation to these canonical paid orders. This action records capacity but does not start production.</ConfirmBox>
            <Button disabled={!batchConfirmed || operation.isPending} onClick={() => { try { run({ url: `${API}/admin/production-batches/prepare`, title: "Production batch prepared", body: { campaignId: batch.campaignId, referenceCode: batch.referenceCode, commitmentIds: parseJson(batch.commitmentIds, "Commitment IDs"), capacityEvidence: parseJson(batch.capacityEvidence, "Capacity evidence"), confirmed: true } }); } catch (error: any) { toast({ title: "Invalid batch input", description: error.message, variant: "destructive" }); } }}>Prepare capacity-confirmed batch</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>6. Record an evidenced batch transition</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3"><div className="space-y-2"><Label>Production batch UUID</Label><Input value={transition.productionBatchId} onChange={(event) => setTransition((value) => ({ ...value, productionBatchId: event.target.value }))} /></div><div className="space-y-2"><Label>Next status</Label><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={transition.nextStatus} onChange={(event) => setTransition((value) => ({ ...value, nextStatus: event.target.value }))}>{["funded_by_orders","production","quality_review","ready_for_pickup","in_transit","delivered","settlement_pending","settled","failed"].map((value) => <option key={value}>{value}</option>)}</select></div><div className="space-y-2"><Label>Carrier booking authorization UUID</Label><Input value={transition.carrierBookingAuthorizationId} onChange={(event) => setTransition((value) => ({ ...value, carrierBookingAuthorizationId: event.target.value }))} /></div></div>
          <div className="grid gap-3 md:grid-cols-3"><JsonField label="Quantities JSON" value={transition.quantities} onChange={(quantities) => setTransition((value) => ({ ...value, quantities }))} /><JsonField label="Production evidence JSON array" value={transition.productionEvidence} onChange={(productionEvidence) => setTransition((value) => ({ ...value, productionEvidence }))} /><JsonField label="Inspection evidence JSON array" value={transition.inspectionEvidence} onChange={(inspectionEvidence) => setTransition((value) => ({ ...value, inspectionEvidence }))} /><JsonField label="Carrier handoff evidence JSON array" value={transition.handoffEvidence} onChange={(handoffEvidence) => setTransition((value) => ({ ...value, handoffEvidence }))} /><JsonField label="Delivery evidence JSON array" value={transition.deliveryEvidence} onChange={(deliveryEvidence) => setTransition((value) => ({ ...value, deliveryEvidence }))} /><JsonField label="Settlement evidence JSON array" value={transition.settlementEvidence} onChange={(settlementEvidence) => setTransition((value) => ({ ...value, settlementEvidence }))} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Public message (optional)</Label><Textarea value={transition.publicMessage} onChange={(event) => setTransition((value) => ({ ...value, publicMessage: event.target.value }))} /></div><div className="space-y-2"><Label>Internal note</Label><Textarea value={transition.internalNote} onChange={(event) => setTransition((value) => ({ ...value, internalNote: event.target.value }))} /></div></div>
          <div className="grid gap-3 md:grid-cols-3">{[["production","Record external production as executed"],["handoff","Record carrier handoff as executed"],["settlement","Record external settlement as executed"]].map(([key,label]) => <label key={key} className="flex items-start gap-3 rounded-xl border p-3 text-sm"><Checkbox checked={(transitionFlags as any)[key]} onCheckedChange={(value) => setTransitionFlags((current) => ({ ...current, [key]: value === true }))} /><span>{label}; matching evidence and canonical provider state are required.</span></label>)}</div>
          <ConfirmBox checked={transitionFlags.confirmed} onChange={(confirmed) => setTransitionFlags((value) => ({ ...value, confirmed }))}>I am recording an event that already occurred and is backed by the supplied evidence. This control does not start production, book a carrier, or submit settlement.</ConfirmBox>
          <Button disabled={!transitionFlags.confirmed || operation.isPending} onClick={() => { try { run({ url: `${API}/admin/production-batches/${transition.productionBatchId}/transition`, title: "Production-batch event recorded", body: { nextStatus: transition.nextStatus, quantities: parseJson(transition.quantities, "Quantities"), productionEvidence: parseJson(transition.productionEvidence, "Production evidence"), inspectionEvidence: parseJson(transition.inspectionEvidence, "Inspection evidence"), handoffEvidence: parseJson(transition.handoffEvidence, "Handoff evidence"), deliveryEvidence: parseJson(transition.deliveryEvidence, "Delivery evidence"), settlementEvidence: parseJson(transition.settlementEvidence, "Settlement evidence"), carrierBookingAuthorizationId: transition.carrierBookingAuthorizationId || null, externalProductionExecuted: transitionFlags.production, externalCarrierHandoffExecuted: transitionFlags.handoff, externalSettlementExecuted: transitionFlags.settlement, publicMessage: transition.publicMessage, internalNote: transition.internalNote, confirmed: true } }); } catch (error: any) { toast({ title: "Invalid transition input", description: error.message, variant: "destructive" }); } }}>Record evidence-backed transition</Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>7. Prepare balanced settlement plan</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label>Production batch UUID</Label><Input value={settlement.productionBatchId} onChange={(event) => setSettlement((value) => ({ ...value, productionBatchId: event.target.value }))} /></div><div className="space-y-2"><Label>Refund exposure (minor)</Label><Input value={settlement.refundExposureMinor} onChange={(event) => setSettlement((value) => ({ ...value, refundExposureMinor: event.target.value }))} /></div><div className="space-y-2"><Label>Currency</Label><Input value={settlement.currencyCode} onChange={(event) => setSettlement((value) => ({ ...value, currencyCode: event.target.value }))} /></div></div>
            <JsonField label="Explainable allocations JSON" value={settlement.allocations} onChange={(allocations) => setSettlement((value) => ({ ...value, allocations }))} rows={8} />
            <JsonField label="Calculation evidence JSON" value={settlement.calculationEvidence} onChange={(calculationEvidence) => setSettlement((value) => ({ ...value, calculationEvidence }))} />
            <ConfirmBox checked={settlementConfirmed} onChange={setSettlementConfirmed}>I confirm the allocation total equals canonical provider-confirmed paid-order gross and explicitly includes refund exposure. No settlement submission is authorized.</ConfirmBox>
            <Button disabled={!settlementConfirmed || operation.isPending} onClick={() => { try { run({ url: `${API}/admin/settlements/prepare`, title: "Settlement plan prepared", body: { productionBatchId: settlement.productionBatchId, idempotencyKey: newKey("settlement-plan"), refundExposureMinor: Number(settlement.refundExposureMinor), currencyCode: settlement.currencyCode, allocations: parseJson(settlement.allocations, "Allocations"), calculationEvidence: parseJson(settlement.calculationEvidence, "Calculation evidence"), confirmed: true } }); } catch (error: any) { toast({ title: "Invalid settlement input", description: error.message, variant: "destructive" }); } }}>Prepare approval-required plan</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>8. Approve plan for separate provider submission</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[['Settlement plan UUID','settlementPlanId'],['Approval reference','approvalReference']].map(([label,key]) => <div key={key} className="space-y-2"><Label>{label}</Label><Input value={(settlementApproval as any)[key]} onChange={(event) => setSettlementApproval((value) => ({ ...value, [key]: event.target.value }))} /></div>)}
            <div className="space-y-2"><Label>Approval rationale</Label><Textarea value={settlementApproval.rationale} onChange={(event) => setSettlementApproval((value) => ({ ...value, rationale: event.target.value }))} /></div>
            <JsonField label="Approval evidence JSON" value={settlementApproval.approvalEvidence} onChange={(approvalEvidence) => setSettlementApproval((value) => ({ ...value, approvalEvidence }))} />
            <ConfirmBox checked={settlementApprovalConfirmed} onChange={setSettlementApprovalConfirmed}>I approve this exact explainable plan as submission-ready. This approval does not transmit it or claim provider settlement.</ConfirmBox>
            <Button disabled={!settlementApprovalConfirmed || operation.isPending} onClick={() => { try { run({ url: `${API}/admin/settlements/${settlementApproval.settlementPlanId}/approve`, title: "Settlement plan approved", body: { approvalReference: settlementApproval.approvalReference, rationale: settlementApproval.rationale, approvalEvidence: parseJson(settlementApproval.approvalEvidence, "Approval evidence"), confirmed: true } }); } catch (error: any) { toast({ title: "Invalid approval input", description: error.message, variant: "destructive" }); } }}>Approve submission-ready plan</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Production and settlement status</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3"><div className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4 text-cyan-700" />Production batches</div>{batches.map((row) => <div key={row.id} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><span className="font-medium">{row.referenceCode}</span>{statusBadge(row.status)}</div><div className="mt-1 text-xs text-slate-500">{row.id}</div><div className="mt-2 text-sm">{Number(row.allocatedQuantity).toLocaleString()} allocated · {Number(row.deliveredQuantity).toLocaleString()} delivered</div></div>)}{!batches.length && <p className="text-sm text-slate-500">No production batch exists.</p>}</div>
          <div className="space-y-3"><div className="flex items-center gap-2 font-semibold"><FileCheck2 className="h-4 w-4 text-cyan-700" />Settlement plans</div>{settlements.map((row) => <div key={row.id} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><span className="font-medium">{formatMinor(row.grossCollectedMinor, row.currencyCode)}</span>{statusBadge(row.status)}</div><div className="mt-1 text-xs text-slate-500">{row.id}</div><div className="mt-2 flex items-center gap-2 text-sm">{row.externalSettlementExecuted ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{row.externalSettlementExecuted ? "External execution recorded" : "No provider execution claimed"}</div></div>)}{!settlements.length && <p className="text-sm text-slate-500">No settlement plan exists.</p>}</div>
        </CardContent>
      </Card>
    </div>
  );
}
