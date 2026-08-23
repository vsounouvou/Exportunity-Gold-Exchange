import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Factory,
  Globe2,
  PackageCheck,
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

type ProducerExchangeProps = {
  slug?: string;
};

function formatMinor(value: unknown, currency = "XOF") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0) / 100);
}

function formatQuantity(value: unknown, unit: unknown) {
  return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${String(unit || "units")}`;
}

function formatDate(value: unknown) {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";
}

function statusBadge(statusValue: unknown) {
  const status = String(statusValue || "unknown");
  const positive = ["moq_reached", "payment_confirmed", "production", "ready_for_pickup", "in_transit", "delivered", "settled"].includes(status);
  const blocked = ["failed", "refunding", "refunded"].includes(status);
  return (
    <Badge className={positive ? "bg-emerald-400/15 text-emerald-200" : blocked ? "bg-rose-400/15 text-rose-200" : "bg-amber-300/15 text-amber-100"}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function progress(campaign: Row) {
  const minimum = Number(campaign.minimumQuantity || 0);
  const committed = Number(campaign.committedQuantity || 0);
  return minimum > 0 ? Math.max(0, Math.min(100, (committed / minimum) * 100)) : 0;
}

function newIdempotencyKey(campaignId: string) {
  return `interest-${campaignId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function CampaignCard({ row }: { row: Row }) {
  const campaign = row.campaign || {};
  const pct = progress(campaign);
  const firstTier = Array.isArray(row.tiers) ? row.tiers[0] : null;
  return (
    <Card className="border-white/10 bg-slate-950/70 text-white shadow-2xl shadow-black/20">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          {statusBadge(campaign.status)}
          <span className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">{campaign.campaignType?.replaceAll("_", " ")}</span>
        </div>
        <CardTitle className="text-2xl leading-tight">{campaign.title}</CardTitle>
        <p className="line-clamp-3 text-sm leading-6 text-slate-300">{campaign.publicSummary}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <Factory className="mb-2 h-4 w-4 text-cyan-300" />
            <div className="font-medium">{row.factoryName}</div>
            <div className="text-xs text-slate-400">{row.factoryCountryCode}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <Globe2 className="mb-2 h-4 w-4 text-cyan-300" />
            <div className="font-medium">{row.territoryName}</div>
            <div className="text-xs text-slate-400">{row.territoryCountryCode}</div>
          </div>
        </div>
        <div>
          <div className="mb-2 flex justify-between text-xs text-slate-300">
            <span>{formatQuantity(campaign.committedQuantity, campaign.unitOfMeasure)} paid</span>
            <span>{formatQuantity(campaign.minimumQuantity, campaign.unitOfMeasure)} minimum</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Verified tier from</div>
            <div className="font-semibold text-emerald-200">
              {firstTier ? formatMinor(firstTier.unitPriceMinor, firstTier.currencyCode) : "Tier pending"}
            </div>
          </div>
          <Link href={`/producer-exchange/${campaign.slug}`}>
            <Button className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              View campaign <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignDetail({ row }: { row: Row }) {
  const campaign = row.campaign || {};
  const tiers = Array.isArray(row.tiers) ? row.tiers : [];
  const deliveryOptions = Array.isArray(campaign.deliveryOptions) ? campaign.deliveryOptions : [];
  const updates = Array.isArray(row.updates) ? row.updates : [];
  const timeline = Array.isArray(row.timeline) ? row.timeline : [];
  const [quantity, setQuantity] = useState(String(tiers[0]?.minimumQuantity || campaign.minimumQuantity || ""));
  const [deliveryOptionId, setDeliveryOptionId] = useState(String(deliveryOptions[0]?.id || ""));
  const [buyerNotes, setBuyerNotes] = useState("");
  const [accepted, setAccepted] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/group-buying/campaigns/${campaign.id}/interest`, "POST", {
        idempotencyKey: newIdempotencyKey(campaign.id),
        quantity: Number(quantity),
        deliveryOptionId,
        buyerNotes,
        refundConditionsAccepted: accepted,
      }),
    onSuccess: () => {
      toast({
        title: "Buying interest recorded",
        description: "No payment was collected and no inventory was reserved. A paid industrial order is required before quantity becomes binding.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/group-buying/campaigns/${campaign.slug}`] });
    },
    onError: (error: Error) =>
      toast({
        title: "Interest could not be recorded",
        description: /authentication required/i.test(error.message)
          ? "Sign in first, then return to this campaign."
          : error.message,
        variant: "destructive",
      }),
  });
  const selectedTier = useMemo(
    () =>
      [...tiers]
        .sort((a, b) => Number(b.minimumQuantity) - Number(a.minimumQuantity))
        .find((tier) => Number(quantity) >= Number(tier.minimumQuantity) && (tier.maximumQuantity == null || Number(quantity) <= Number(tier.maximumQuantity))),
    [quantity, tiers],
  );
  const estimatedTotal = selectedTier ? Number(quantity || 0) * Number(selectedTier.unitPriceMinor || 0) : null;

  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <Link href="/producer-exchange" className="inline-flex items-center gap-2 text-sm text-cyan-200 hover:text-cyan-100">
          <ArrowLeft className="h-4 w-4" /> All Producer Exchange campaigns
        </Link>
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-8">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-7 shadow-2xl lg:p-10">
              <div className="flex flex-wrap items-center gap-3">
                {statusBadge(campaign.status)}
                <Badge className="bg-cyan-300/10 text-cyan-100">Product commerce only</Badge>
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight lg:text-6xl">{campaign.title}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{campaign.publicSummary}</p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [Factory, "Producer", row.factoryName],
                  [Globe2, "Territory", row.territoryName],
                  [CalendarClock, "Interest closes", formatDate(campaign.deadline)],
                  [PackageCheck, "Lead time", `${campaign.productionLeadTimeDays} days`],
                ].map(([Icon, label, value]: any) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <Icon className="h-5 w-5 text-cyan-300" />
                    <div className="mt-3 text-xs uppercase tracking-wider text-slate-500">{label}</div>
                    <div className="mt-1 font-medium">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <Card className="border-white/10 bg-slate-950/70 text-white">
              <CardHeader><CardTitle>Verified group pricing</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {tiers.map((tier) => (
                  <div key={tier.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="font-semibold text-emerald-200">{formatMinor(tier.unitPriceMinor, tier.currencyCode)} / {campaign.unitOfMeasure}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {formatQuantity(tier.minimumQuantity, campaign.unitOfMeasure)}
                      {tier.maximumQuantity ? ` – ${formatQuantity(tier.maximumQuantity, campaign.unitOfMeasure)}` : " and above"}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-slate-950/70 text-white">
              <CardHeader><CardTitle>Evidence-backed progress</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="mb-2 flex justify-between text-sm text-slate-300">
                    <span>{formatQuantity(campaign.committedQuantity, campaign.unitOfMeasure)} provider-confirmed paid</span>
                    <span>{formatQuantity(campaign.minimumQuantity, campaign.unitOfMeasure)} minimum</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${progress(campaign)}%` }} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-white/[0.03] p-4"><Users className="h-5 w-5 text-cyan-300" /><div className="mt-2 text-xs text-slate-500">Non-binding interest</div><div className="font-semibold">{formatQuantity(campaign.interestQuantity, campaign.unitOfMeasure)}</div></div>
                  <div className="rounded-xl bg-white/[0.03] p-4"><Boxes className="h-5 w-5 text-cyan-300" /><div className="mt-2 text-xs text-slate-500">Canonical paid quantity</div><div className="font-semibold">{formatQuantity(campaign.committedQuantity, campaign.unitOfMeasure)}</div></div>
                  <div className="rounded-xl bg-white/[0.03] p-4"><Truck className="h-5 w-5 text-cyan-300" /><div className="mt-2 text-xs text-slate-500">Fulfilled quantity</div><div className="font-semibold">{formatQuantity(campaign.fulfilledQuantity, campaign.unitOfMeasure)}</div></div>
                </div>
              </CardContent>
            </Card>

            {(updates.length > 0 || timeline.length > 0) && (
              <Card className="border-white/10 bg-slate-950/70 text-white">
                <CardHeader><CardTitle>Campaign updates</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {updates.map((update) => (
                    <article key={update.id} className="rounded-xl border border-white/10 p-4">
                      <div className="text-xs text-cyan-200">{formatDate(update.publishedAt)}</div>
                      <h2 className="mt-1 font-semibold">{update.title}</h2>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{update.body}</p>
                    </article>
                  ))}
                  {updates.length === 0 && timeline.map((event) => (
                    <div key={event.id} className="flex gap-3 border-b border-white/10 pb-4 last:border-0">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                      <div><div className="text-sm text-slate-200">{event.publicMessage}</div><div className="mt-1 text-xs text-slate-500">{formatDate(event.occurredAt)}</div></div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <Card className="border-cyan-300/20 bg-slate-950 text-white shadow-2xl shadow-cyan-950/30">
              <CardHeader>
                <CardTitle>Record buying interest</CardTitle>
                <p className="text-sm leading-6 text-slate-400">This is non-binding. It does not charge you, reserve inventory, or create an order.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="interest-quantity">Quantity ({campaign.unitOfMeasure})</Label>
                  <Input id="interest-quantity" type="number" min="0.0001" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="border-white/15 bg-white/[0.04]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-option">Delivery option</Label>
                  <select id="delivery-option" value={deliveryOptionId} onChange={(event) => setDeliveryOptionId(event.target.value)} className="h-10 w-full rounded-md border border-white/15 bg-slate-900 px-3 text-sm">
                    {deliveryOptions.map((option: Row) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyer-notes">Notes (optional)</Label>
                  <Textarea id="buyer-notes" value={buyerNotes} onChange={(event) => setBuyerNotes(event.target.value)} className="border-white/15 bg-white/[0.04]" placeholder="Packaging, delivery, or procurement context" />
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Current verified tier</div>
                  <div className="mt-1 text-xl font-semibold text-emerald-200">{selectedTier ? formatMinor(selectedTier.unitPriceMinor, selectedTier.currencyCode) : "No tier for this quantity"}</div>
                  {estimatedTotal !== null && <div className="mt-1 text-sm text-slate-400">Indicative product total: {formatMinor(estimatedTotal, campaign.currencyCode)}</div>}
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-slate-300">
                  <Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} />
                  <span>I acknowledge the stated refund conditions and understand this interest record is not a paid or reserved order.</span>
                </label>
                <Button className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200" disabled={!accepted || !selectedTier || !deliveryOptionId || mutation.isPending} onClick={() => mutation.mutate()}>
                  {mutation.isPending ? "Recording…" : "Record non-binding interest"}
                </Button>
                <Link href="/login" className="block text-center text-xs text-slate-500 hover:text-slate-300">Sign in is required to record interest</Link>
                <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-3 text-xs leading-5 text-emerald-100/80">
                  <ShieldCheck className="mb-2 h-4 w-4" />
                  Quantity counts toward the production threshold only after a canonical industrial order is paid and reconciled with provider evidence.
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function ProducerExchangePage({ slug }: ProducerExchangeProps) {
  useEffect(() => {
    document.title = slug
      ? "Producer Campaign | Exportunity"
      : "African Producer Exchange | Exportunity";
    const description = slug
      ? "Review an evidence-backed producer campaign, verified quantity tiers, and governed product-commerce progress."
      : "Discover governed African producer demand, group purchasing, production evidence, and product-commerce campaigns.";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [slug]);

  const endpoint = slug ? `/api/group-buying/campaigns/${slug}` : "/api/group-buying/campaigns";
  const query = useQuery<Row>({ queryKey: [endpoint] });
  if (query.isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#07111f] text-cyan-100">Loading Producer Exchange…</main>;
  }
  if (query.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07111f] p-6 text-white">
        <Card className="max-w-xl border-rose-300/20 bg-slate-950 text-white"><CardContent className="pt-6"><h1 className="text-xl font-semibold">Producer Exchange is unavailable</h1><p className="mt-2 text-sm text-slate-400">{(query.error as Error).message}</p><Link href="/industrial"><Button className="mt-5">Return to Industrial</Button></Link></CardContent></Card>
      </main>
    );
  }
  if (slug) return <CampaignDetail row={query.data?.campaign || {}} />;
  const campaigns = Array.isArray(query.data?.campaigns) ? query.data!.campaigns : [];
  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_left,rgba(16,185,129,0.12),transparent_30%)]">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
          <Badge className="bg-cyan-300/10 text-cyan-100">Producer Exchange · product commerce</Badge>
          <h1 className="mt-6 max-w-5xl text-5xl font-semibold tracking-tight lg:text-7xl">Verified demand becomes an accountable production batch.</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">Join product preorders and group purchases from verified industrial producers. Interest stays non-binding until a canonical industrial order is paid and reconciled.</p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-300">
            {["Verified producer and capacity", "Transparent quantity tiers", "Provider-confirmed paid orders", "Evidence-backed production and delivery"].map((item) => <span key={item} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" />{item}</span>)}
          </div>
          <div className="mt-8 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-50/90">
            <ShieldCheck className="mr-2 inline h-5 w-5" />
            Every campaign is a purchase of products or production output. There are no securities, equity interests, dividends, yields, or guaranteed returns on this rail.
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div><div className="text-sm uppercase tracking-[0.2em] text-cyan-200/70">Open and progressing campaigns</div><h2 className="mt-2 text-3xl font-semibold">Buy together, produce with evidence</h2></div>
          <Link href="/industrial" className="text-sm text-cyan-200 hover:text-cyan-100">Browse the industrial catalog</Link>
        </div>
        {campaigns.length ? <div className="grid gap-6 lg:grid-cols-2">{campaigns.map((row) => <CampaignCard key={row.campaign.id} row={row} />)}</div> : <Card className="border-white/10 bg-slate-950/70 text-white"><CardContent className="flex min-h-56 flex-col items-center justify-center py-10 text-center"><Boxes className="h-10 w-10 text-cyan-300" /><h2 className="mt-4 text-xl font-semibold">No verified campaign is live yet</h2><p className="mt-2 max-w-md text-sm text-slate-400">Campaigns appear only after producer, capacity, pricing, territory, rights, and commerce-language checks pass.</p></CardContent></Card>}
      </section>
    </main>
  );
}
