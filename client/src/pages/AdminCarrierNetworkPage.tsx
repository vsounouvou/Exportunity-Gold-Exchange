import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  RefreshCw,
  Route,
  ShieldCheck,
  Truck,
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
type ProviderReleaseGate = {
  ready: boolean;
  blockers: string[];
  providerActionExecuted: false;
  externalCommitmentCreated: false;
};
type CarrierNetworkResponse = {
  ok: boolean;
  profiles: Row[];
  coverages: Row[];
  connections: Row[];
  quoteRequests: Row[];
  quotes: Row[];
  bookings: Row[];
  providerReceipts: Row[];
  incidents: Row[];
  readiness: Array<{ carrierProfileId: string; ready: boolean; blockers: string[] }>;
  registeredAdapters: Array<{ provider: string; capabilities: string[] }>;
  providerRelease: {
    featureFlags: Record<string, boolean>;
    providers: Array<{
      provider: string;
      label: string;
      officialDocumentation: string;
      termsReference: string;
      connectionStatus: string;
      adapterRegistered: boolean;
      gates: {
        quoteRequest: ProviderReleaseGate;
        bookingCreate: ProviderReleaseGate;
        trackingRead: ProviderReleaseGate;
        webhookReceipts: ProviderReleaseGate;
      };
    }>;
  };
  controls: {
    providerQuoteRequestsEnabled: boolean;
    providerBookingsEnabled: boolean;
    providerTrackingReadsEnabled: boolean;
    providerTrackingCallbacksEnabled: boolean;
    executionSurfacePresent: false;
    providerActionExecuted: false;
    externalCommitmentCreated: false;
    credentialsExposed: false;
    candidateCarriersArePartners: false;
  };
};

const API = "/api/admin/carrier-network";

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function commaList(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function stateBadge(value: unknown) {
  const status = String(value || "unknown").toLowerCase();
  const positive = [
    "verified",
    "active",
    "contracted",
    "verified_provider",
    "contracted_partner",
    "selected",
    "approved_submission_ready",
  ].includes(status);
  const blocked = [
    "restricted",
    "suspended",
    "rejected",
    "expired",
    "failed",
    "critical",
  ].includes(status);
  return (
    <Badge
      className={
        positive
          ? "bg-emerald-400/15 text-emerald-200"
          : blocked
            ? "bg-rose-400/15 text-rose-200"
            : "bg-amber-400/15 text-amber-100"
      }
    >
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function formatMinor(value: unknown, currency = "XOF") {
  const minor = Number(value || 0);
  if (!Number.isSafeInteger(minor)) return `Invalid amount ${currency}`;
  const exact = BigInt(minor);
  const negative = exact < 0n;
  const magnitude = negative ? -exact : exact;
  const whole = magnitude / 100n;
  const fraction = (magnitude % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toLocaleString()}.${fraction} ${currency}`;
}

function profileName(profiles: Row[], id: unknown) {
  const profile = profiles.find((item) => item.id === id);
  return profile?.displayName || profile?.legalName || String(id || "Unknown carrier");
}

function RequiredConfirmation({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <span className="text-xs leading-5 text-amber-100">{label}</span>
    </div>
  );
}

export default function AdminCarrierNetworkPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const network = useQuery<CarrierNetworkResponse>({
    queryKey: [API],
    staleTime: 0,
  });
  const action = useMutation({
    mutationFn: async (input: { path: string; body: Record<string, unknown> }) =>
      apiRequest(input.path, "POST", input.body),
    onSuccess: () => {
      toast({
        title: "Carrier governance record updated",
        description: "No provider request or carrier booking was executed.",
      });
      void queryClient.invalidateQueries({ queryKey: [API] });
    },
    onError: (error: any) =>
      toast({
        title: "Carrier action blocked",
        description: error?.message || "Request failed",
        variant: "destructive",
      }),
  });

  const [candidate, setCandidate] = useState({
    referenceCode: "",
    legalName: "",
    displayName: "",
    carrierType: "freight_forwarder",
    providerCode: "",
    headquartersCountryCode: "",
    websiteUrl: "",
    operatingCountryCodes: "",
    transportModes: "road",
    capabilities: "quote_request, booking_create, tracking_read",
    commodityCategories: "",
    sourceUrl: "",
    sourceName: "",
    confirmed: false,
  });
  const [verification, setVerification] = useState({
    carrierProfileId: "",
    verificationStatus: "document_verified",
    partnershipStatus: "verified_provider",
    verificationExpiresAt: "",
    authorityReference: "",
    registrationReference: "",
    contractReference: "",
    sourceReferences: "",
    rationale: "",
    confirmed: false,
  });
  const [coverage, setCoverage] = useState({
    carrierProfileId: "",
    idempotencyKey: newKey("coverage"),
    originCountryCode: "",
    destinationCountryCode: "",
    serviceType: "freight",
    transportMode: "road",
    serviceLevel: "",
    productCategory: "",
    capabilities: "",
    maxWeightKg: "",
    maxVolumeM3: "",
    minimumTransitDays: "",
    maximumTransitDays: "",
    status: "candidate",
    sourceReference: "",
    evidenceNote: "",
    validUntil: "",
    hazardousGoodsSupported: false,
    coldChainSupported: false,
    customsSupported: false,
    insuranceSupported: false,
    confirmed: false,
  });
  const [connection, setConnection] = useState({
    carrierProfileId: "",
    provider: "",
    environment: "production",
    externalAccountReference: "",
    credentialReference: "",
    capabilities: "connection_check, quote_request, booking_create, tracking_read",
    scopes: "",
    callbackStatus: "not_configured",
    restrictionStatus: "none",
    authorityReference: "",
    sourceReferences: "",
    confirmed: false,
  });
  const [providerContract, setProviderContract] = useState({
    include: false,
    writtenAgreementExecuted: false,
    agreementReference: "",
    agreementEffectiveAt: "",
    agreementExpiresAt: "",
    termsSnapshotReference: "",
    legalApprovalReference: "",
    legalApprovedAt: "",
    operationsApprovalReference: "",
    operationsApprovedAt: "",
    securityApprovalReference: "",
    securityApprovedAt: "",
    productionUseApproved: false,
    sandboxPilotCompleted: false,
    sandboxReceiptReferences: "",
    accountVerification: false,
    quoteSubmission: false,
    quoteResponsePersistence: false,
    quoteResponseTransformation: false,
    commercialUse: false,
    bookingCreation: false,
    bookingCancellation: false,
    trackingPersistence: false,
    proofOfDeliveryPersistence: false,
    webhookProcessing: false,
  });
  const [quoteRequest, setQuoteRequest] = useState({
    industrialOrderId: new URLSearchParams(window.location.search).get("orderId") || "",
    idempotencyKey: newKey("carrier-quote-request"),
    serviceType: "freight",
    originCountryCode: "",
    originCity: "",
    destinationCountryCode: "",
    destinationCity: "",
    cargoDescription: "",
    productCategory: "",
    weightKg: "",
    volumeM3: "",
    declaredValueMinor: "",
    currencyCode: "XOF",
    incoterm: "",
    transportMode: "road",
    requiredCapabilities: "",
    hazardousGoods: false,
    coldChainRequired: false,
    fragile: false,
    confirmed: false,
  });
  const [quote, setQuote] = useState({
    quoteRequestId: "",
    carrierProfileId: "",
    carrierCoverageId: "",
    adapterConnectionId: "",
    idempotencyKey: newKey("carrier-quote"),
    sourceType: "manual_evidence",
    providerQuoteReference: "",
    totalCostMinor: "",
    customerPriceMinor: "",
    currencyCode: "XOF",
    minimumTransitDays: "",
    maximumTransitDays: "",
    validUntil: "",
    evidenceReference: "",
    terms: "",
    confirmed: false,
  });
  const [selection, setSelection] = useState({
    rationale: "",
    confirmed: false,
  });
  const [bookingApproval, setBookingApproval] = useState({
    approvalReference: "",
    approvalRationale: "",
    confirmed: false,
  });
  const [incident, setIncident] = useState({
    carrierProfileId: "",
    severity: "high",
    incidentType: "account_or_service_restriction",
    title: "",
    description: "",
    evidenceReference: "",
    confirmed: false,
  });

  const data = network.data;
  const profiles = data?.profiles || [];
  const verifiedProfiles = useMemo(
    () =>
      profiles.filter((profile) =>
        ["verified", "contracted", "active"].includes(profile.status),
      ),
    [profiles],
  );
  const openCriticalIncidents = (data?.incidents || []).filter(
    (item) =>
      ["high", "critical"].includes(item.severity) &&
      !["resolved", "dismissed"].includes(item.status),
  );

  const busy = action.isPending;
  const contractEvidenceIncomplete =
    providerContract.include &&
    (!providerContract.agreementReference ||
      !providerContract.agreementEffectiveAt ||
      !providerContract.agreementExpiresAt ||
      !providerContract.termsSnapshotReference ||
      !providerContract.legalApprovalReference ||
      !providerContract.legalApprovedAt ||
      !providerContract.operationsApprovalReference ||
      !providerContract.operationsApprovedAt);
  const profileOptions = profiles.map((profile) => (
    <option key={profile.id} value={profile.id}>
      {profile.displayName || profile.legalName} — {profile.partnershipStatus}
    </option>
  ));

  return (
    <div className="min-h-screen bg-[#06101d] text-slate-100">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.24),_transparent_42%),linear-gradient(135deg,#07121f,#0b1d2f)]">
        <div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
                <Truck className="h-4 w-4" /> Logistics governance
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                Carrier Network & Delivery Authority
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
                Record candidates, prove coverage, structure quotes, and authorize a precise
                booking for official-adapter submission. Candidate, verified provider,
                contracted partner, internally approved, submitted, and provider-confirmed are
                deliberately different states.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-white/15 bg-white/5 text-white"
                onClick={() => void network.refetch()}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
              </Button>
              <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white">
                <Link href="/admin/industrial-network">Industrial Network</Link>
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              ["Candidates / carriers", profiles.length],
              ["Verified profiles", verifiedProfiles.length],
              ["Coverage records", data?.coverages?.length || 0],
              ["Quote requests", data?.quoteRequests?.length || 0],
              ["Verified quotes", (data?.quotes || []).filter((item) => ["verified", "selected"].includes(item.status)).length],
              ["Open high-risk incidents", openCriticalIncidents.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-2xl font-black">{value}</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-emerald-100">
              <ShieldCheck className="mb-2 h-5 w-5" /> No credentials are displayed or stored in
              carrier operations. Only Exportunity-native connection IDs or secret-manager
              reference names are accepted; cross-project connections are rejected.
            </div>
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">
              <AlertTriangle className="mb-2 h-5 w-5" /> There is deliberately no “Book carrier”
              control. Internal approval only produces <strong>approved submission ready</strong>.
            </div>
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4 text-sm text-cyan-100">
              <Link2 className="mb-2 h-5 w-5" /> Registered official adapters: {data?.registeredAdapters?.length || 0}.
              Until one is deployed and verified, packages remain manual or preparation-only.
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-[1500px] gap-6 px-5 py-7 lg:px-8">
        {network.isLoading ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">
            Loading carrier governance…
          </div>
        ) : network.isError ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-5 text-rose-100">
            Carrier governance could not be loaded. The migration/runtime table bootstrap may not
            be applied in this environment.
          </div>
        ) : null}

        <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">
                Provider execution release boundary
              </div>
              <h2 className="mt-2 text-xl font-black">Contract and adapter gates</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-50/80">
                A carrier profile or internal approval never enables a provider call. Every
                provider action also needs an official adapter, an explicit feature flag,
                written data-use rights, legal and operations approval, and controlled pilot
                receipts. The current application has no provider-execution route.
              </p>
            </div>
            <Badge className="bg-rose-400/15 text-rose-100">
              {data?.controls?.providerQuoteRequestsEnabled ||
              data?.controls?.providerBookingsEnabled
                ? "Release review required"
                : "External actions disabled"}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {(data?.providerRelease?.providers || []).map((provider) => {
              const blockers = Array.from(
                new Set([
                  ...provider.gates.quoteRequest.blockers,
                  ...provider.gates.bookingCreate.blockers,
                  ...provider.gates.trackingRead.blockers,
                  ...provider.gates.webhookReceipts.blockers,
                ]),
              );
              return (
                <div
                  key={provider.provider}
                  className="rounded-xl border border-white/10 bg-[#0b1725] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-black">{provider.label}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        Connection: {provider.connectionStatus.replaceAll("_", " ")} · adapter:{" "}
                        {provider.adapterRegistered ? "registered" : "not registered"}
                      </div>
                    </div>
                    <a
                      href={provider.officialDocumentation}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-cyan-300 underline"
                    >
                      Official API terms
                    </a>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {blockers.slice(0, 12).map((blocker) => (
                      <Badge
                        key={blocker}
                        variant="outline"
                        className="border-amber-300/20 text-amber-100"
                      >
                        {blocker.replaceAll("_", " ")}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    No quote request, booking, cancellation, tracking poll, callback projection,
                    payment, or provider commitment is executed by this screen.
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card className="border-white/10 bg-[#0b1725] text-white">
            <CardHeader>
              <CardTitle>1. Record a carrier candidate</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Legal name</Label>
                <Input value={candidate.legalName} onChange={(event) => setCandidate({ ...candidate, legalName: event.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Display name</Label>
                <Input value={candidate.displayName} onChange={(event) => setCandidate({ ...candidate, displayName: event.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Reference code</Label>
                <Input value={candidate.referenceCode} onChange={(event) => setCandidate({ ...candidate, referenceCode: event.target.value })} placeholder="Generated from name if empty" className="mt-1" />
              </div>
              <div>
                <Label>Carrier type</Label>
                <select value={candidate.carrierType} onChange={(event) => setCandidate({ ...candidate, carrierType: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {[
                    "freight_forwarder",
                    "road_carrier",
                    "courier",
                    "air_cargo",
                    "ocean_carrier",
                    "last_mile",
                    "multimodal",
                    "customs_broker",
                    "warehouse",
                  ].map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <Label>Provider code (optional)</Label>
                <Input value={candidate.providerCode} onChange={(event) => setCandidate({ ...candidate, providerCode: event.target.value })} placeholder="e.g. provider slug" className="mt-1" />
              </div>
              <div>
                <Label>Headquarters country</Label>
                <Input value={candidate.headquartersCountryCode} onChange={(event) => setCandidate({ ...candidate, headquartersCountryCode: event.target.value.toUpperCase() })} maxLength={2} placeholder="CI" className="mt-1" />
              </div>
              <div>
                <Label>Website</Label>
                <Input value={candidate.websiteUrl} onChange={(event) => setCandidate({ ...candidate, websiteUrl: event.target.value })} placeholder="https://…" className="mt-1" />
              </div>
              <div>
                <Label>Operating countries</Label>
                <Input value={candidate.operatingCountryCodes} onChange={(event) => setCandidate({ ...candidate, operatingCountryCodes: event.target.value.toUpperCase() })} placeholder="CI, GH, BJ" className="mt-1" />
              </div>
              <div>
                <Label>Transport modes</Label>
                <Input value={candidate.transportModes} onChange={(event) => setCandidate({ ...candidate, transportModes: event.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Capabilities</Label>
                <Input value={candidate.capabilities} onChange={(event) => setCandidate({ ...candidate, capabilities: event.target.value })} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label>Precise discovery source</Label>
                <Input value={candidate.sourceUrl} onChange={(event) => setCandidate({ ...candidate, sourceUrl: event.target.value })} placeholder="Official company/registry URL or precise reference" className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <RequiredConfirmation checked={candidate.confirmed} onCheckedChange={(confirmed) => setCandidate({ ...candidate, confirmed })} label="I confirm this creates only a discovered candidate. It does not verify, contact, contract, or call this carrier a partner." />
              </div>
              <Button
                disabled={busy || !candidate.confirmed || !candidate.legalName || !candidate.sourceUrl}
                onClick={() => action.mutate({
                  path: `${API}/profiles`,
                  body: {
                    ...candidate,
                    operatingCountryCodes: commaList(candidate.operatingCountryCodes),
                    transportModes: commaList(candidate.transportModes),
                    capabilities: commaList(candidate.capabilities),
                    commodityCategories: commaList(candidate.commodityCategories),
                    sourceProvenance: {
                      sourceUrl: candidate.sourceUrl,
                      sourceName: candidate.sourceName || "Recorded source",
                      retrievedAt: new Date().toISOString(),
                    },
                  },
                })}
                className="md:col-span-2"
              >
                Record candidate
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0b1725] text-white">
            <CardHeader>
              <CardTitle>2. Verify identity and partnership truth</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <Label>Carrier candidate</Label>
                <select value={verification.carrierProfileId} onChange={(event) => setVerification({ ...verification, carrierProfileId: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Select carrier</option>
                  {profileOptions}
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Verification level</Label>
                  <select value={verification.verificationStatus} onChange={(event) => setVerification({ ...verification, verificationStatus: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {["source_verified", "contact_verified", "document_verified", "contract_verified", "transaction_verified"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Partnership truth</Label>
                  <select value={verification.partnershipStatus} onChange={(event) => setVerification({ ...verification, partnershipStatus: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {["candidate", "verified_provider", "contracted_partner", "internal_network"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
              </div>
              <Input value={verification.authorityReference} onChange={(event) => setVerification({ ...verification, authorityReference: event.target.value })} placeholder="Authority or registry reference" />
              <Input value={verification.registrationReference} onChange={(event) => setVerification({ ...verification, registrationReference: event.target.value })} placeholder="Business registration reference" />
              <Input value={verification.contractReference} onChange={(event) => setVerification({ ...verification, contractReference: event.target.value })} placeholder="Contract reference (mandatory for contracted partner)" />
              <Input value={verification.sourceReferences} onChange={(event) => setVerification({ ...verification, sourceReferences: event.target.value })} placeholder="Precise source URLs/references, comma separated" />
              <Input type="datetime-local" value={verification.verificationExpiresAt} onChange={(event) => setVerification({ ...verification, verificationExpiresAt: event.target.value })} />
              <Textarea value={verification.rationale} onChange={(event) => setVerification({ ...verification, rationale: event.target.value })} placeholder="Human verification rationale and scope" />
              <RequiredConfirmation checked={verification.confirmed} onCheckedChange={(confirmed) => setVerification({ ...verification, confirmed })} label="I reviewed the carrier evidence and confirm the selected verification and partnership state. No credential value is included." />
              <Button
                disabled={busy || !verification.confirmed || !verification.carrierProfileId || !verification.sourceReferences || !verification.rationale}
                onClick={() => action.mutate({
                  path: `${API}/profiles/${verification.carrierProfileId}/verify`,
                  body: {
                    ...verification,
                    verificationExpiresAt: verification.verificationExpiresAt ? new Date(verification.verificationExpiresAt).toISOString() : null,
                    verificationEvidence: {
                      verified: true,
                      credentialsExcluded: true,
                      verifiedAt: new Date().toISOString(),
                      authorityReference: verification.authorityReference,
                      registrationReference: verification.registrationReference,
                      contractReference: verification.contractReference,
                      sourceReferences: commaList(verification.sourceReferences),
                    },
                  },
                })}
              >
                Verify profile with evidence
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card className="border-white/10 bg-[#0b1725] text-white">
            <CardHeader><CardTitle>3. Record exact route coverage</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <select value={coverage.carrierProfileId} onChange={(event) => setCoverage({ ...coverage, carrierProfileId: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm md:col-span-2">
                <option value="">Select verified carrier</option>
                {profileOptions}
              </select>
              <Input value={coverage.originCountryCode} onChange={(event) => setCoverage({ ...coverage, originCountryCode: event.target.value.toUpperCase() })} maxLength={2} placeholder="Origin country" />
              <Input value={coverage.destinationCountryCode} onChange={(event) => setCoverage({ ...coverage, destinationCountryCode: event.target.value.toUpperCase() })} maxLength={2} placeholder="Destination country" />
              <select value={coverage.serviceType} onChange={(event) => setCoverage({ ...coverage, serviceType: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {["freight", "customs", "last_mile"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <Input value={coverage.transportMode} onChange={(event) => setCoverage({ ...coverage, transportMode: event.target.value })} placeholder="Mode (road, air, sea…)" />
              <Input value={coverage.productCategory} onChange={(event) => setCoverage({ ...coverage, productCategory: event.target.value })} placeholder="Product category (optional)" />
              <Input value={coverage.capabilities} onChange={(event) => setCoverage({ ...coverage, capabilities: event.target.value })} placeholder="Capabilities" />
              <Input type="number" value={coverage.maxWeightKg} onChange={(event) => setCoverage({ ...coverage, maxWeightKg: event.target.value })} placeholder="Max weight kg" />
              <Input type="number" value={coverage.maxVolumeM3} onChange={(event) => setCoverage({ ...coverage, maxVolumeM3: event.target.value })} placeholder="Max volume m³" />
              <Input type="number" value={coverage.minimumTransitDays} onChange={(event) => setCoverage({ ...coverage, minimumTransitDays: event.target.value })} placeholder="Min transit days" />
              <Input type="number" value={coverage.maximumTransitDays} onChange={(event) => setCoverage({ ...coverage, maximumTransitDays: event.target.value })} placeholder="Max transit days" />
              <select value={coverage.status} onChange={(event) => setCoverage({ ...coverage, status: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {["candidate", "evidence_pending", "verified", "active"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <Input type="datetime-local" value={coverage.validUntil} onChange={(event) => setCoverage({ ...coverage, validUntil: event.target.value })} />
              <Input value={coverage.sourceReference} onChange={(event) => setCoverage({ ...coverage, sourceReference: event.target.value })} placeholder="Precise source/contract reference" className="md:col-span-2" />
              <Textarea value={coverage.evidenceNote} onChange={(event) => setCoverage({ ...coverage, evidenceNote: event.target.value })} placeholder="What exactly proves this route/capability?" className="md:col-span-2" />
              <div className="flex flex-wrap gap-4 text-xs md:col-span-2">
                {[
                  ["hazardousGoodsSupported", "Hazardous goods"],
                  ["coldChainSupported", "Cold chain"],
                  ["customsSupported", "Customs"],
                  ["insuranceSupported", "Insurance"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <Checkbox checked={(coverage as any)[key]} onCheckedChange={(value) => setCoverage({ ...coverage, [key]: value === true })} /> {label}
                  </label>
                ))}
              </div>
              <RequiredConfirmation checked={coverage.confirmed} onCheckedChange={(confirmed) => setCoverage({ ...coverage, confirmed })} label="I confirm this coverage state matches the cited evidence. No real-time serviceability check was executed." />
              <Button
                disabled={busy || !coverage.confirmed || !coverage.carrierProfileId || !coverage.originCountryCode || !coverage.destinationCountryCode}
                onClick={() => action.mutate({
                  path: `${API}/coverages`,
                  body: {
                    ...coverage,
                    capabilities: commaList(coverage.capabilities),
                    evidence: coverage.evidenceNote ? [{ reference: coverage.sourceReference, note: coverage.evidenceNote }] : [],
                    validUntil: coverage.validUntil ? new Date(coverage.validUntil).toISOString() : null,
                  },
                })}
                className="md:col-span-2"
              >
                Record coverage
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0b1725] text-white">
            <CardHeader><CardTitle>4. Record non-secret adapter readiness</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <select value={connection.carrierProfileId} onChange={(event) => setConnection({ ...connection, carrierProfileId: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select verified carrier</option>
                {profileOptions}
              </select>
              <div className="grid gap-4 md:grid-cols-2">
                <Input value={connection.provider} onChange={(event) => setConnection({ ...connection, provider: event.target.value })} placeholder="Provider adapter key" />
                <select value={connection.environment} onChange={(event) => setConnection({ ...connection, environment: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {["sandbox", "test", "production"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <Input value={connection.externalAccountReference} onChange={(event) => setConnection({ ...connection, externalAccountReference: event.target.value })} placeholder="Business/account reference (not a token)" />
              <div>
                <Label>Secret-manager reference name only</Label>
                <Input value={connection.credentialReference} onChange={(event) => setConnection({ ...connection, credentialReference: event.target.value })} placeholder="e.g. secrets/carrier/provider-production" className="mt-1" />
                <p className="mt-1 text-xs text-rose-200">Never paste an API key, password, token, cookie, or secret value here.</p>
              </div>
              <Input value={connection.capabilities} onChange={(event) => setConnection({ ...connection, capabilities: event.target.value })} placeholder="Adapter capabilities" />
              <Input value={connection.scopes} onChange={(event) => setConnection({ ...connection, scopes: event.target.value })} placeholder="Provider scopes/permissions" />
              <div className="grid gap-4 md:grid-cols-2">
                <select value={connection.callbackStatus} onChange={(event) => setConnection({ ...connection, callbackStatus: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {["not_configured", "pending", "verified", "failed"].map((item) => <option key={item}>{item}</option>)}
                </select>
                <Input value={connection.restrictionStatus} onChange={(event) => setConnection({ ...connection, restrictionStatus: event.target.value })} placeholder="Restriction status" />
              </div>
              <Input value={connection.authorityReference} onChange={(event) => setConnection({ ...connection, authorityReference: event.target.value })} placeholder="Console/account verification reference" />
              <Input value={connection.sourceReferences} onChange={(event) => setConnection({ ...connection, sourceReferences: event.target.value })} placeholder="Evidence references, comma separated" />
              <details className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <summary className="cursor-pointer text-sm font-black">
                  Written provider-contract evidence (optional, non-executing)
                </summary>
                <div className="mt-4 grid gap-4">
                  <label className="flex items-start gap-2 text-xs leading-5 text-slate-300">
                    <Checkbox
                      checked={providerContract.include}
                      onCheckedChange={(value) =>
                        setProviderContract({
                          ...providerContract,
                          include: value === true,
                        })
                      }
                    />
                    Attach structured contract evidence to this connection. This records evidence
                    only; it does not enable a provider action or feature flag.
                  </label>
                  {providerContract.include ? (
                    <>
                      <label className="flex items-start gap-2 text-xs leading-5 text-slate-300">
                        <Checkbox
                          checked={providerContract.writtenAgreementExecuted}
                          onCheckedChange={(value) =>
                            setProviderContract({
                              ...providerContract,
                              writtenAgreementExecuted: value === true,
                            })
                          }
                        />
                        A written provider agreement has been executed. A console click or public
                        documentation alone is not an executed agreement.
                      </label>
                      <Input
                        value={providerContract.agreementReference}
                        onChange={(event) =>
                          setProviderContract({
                            ...providerContract,
                            agreementReference: event.target.value,
                          })
                        }
                        placeholder="Executed agreement evidence reference"
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>Agreement effective at</Label>
                          <Input
                            type="datetime-local"
                            value={providerContract.agreementEffectiveAt}
                            onChange={(event) =>
                              setProviderContract({
                                ...providerContract,
                                agreementEffectiveAt: event.target.value,
                              })
                            }
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Agreement expires at</Label>
                          <Input
                            type="datetime-local"
                            value={providerContract.agreementExpiresAt}
                            onChange={(event) =>
                              setProviderContract({
                                ...providerContract,
                                agreementExpiresAt: event.target.value,
                              })
                            }
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <Input
                        value={providerContract.termsSnapshotReference}
                        onChange={(event) =>
                          setProviderContract({
                            ...providerContract,
                            termsSnapshotReference: event.target.value,
                          })
                        }
                        placeholder="Immutable terms snapshot or digest reference"
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          value={providerContract.legalApprovalReference}
                          onChange={(event) =>
                            setProviderContract({
                              ...providerContract,
                              legalApprovalReference: event.target.value,
                            })
                          }
                          placeholder="Legal approval reference"
                        />
                        <Input
                          type="datetime-local"
                          value={providerContract.legalApprovedAt}
                          onChange={(event) =>
                            setProviderContract({
                              ...providerContract,
                              legalApprovedAt: event.target.value,
                            })
                          }
                        />
                        <Input
                          value={providerContract.operationsApprovalReference}
                          onChange={(event) =>
                            setProviderContract({
                              ...providerContract,
                              operationsApprovalReference: event.target.value,
                            })
                          }
                          placeholder="Operations approval reference"
                        />
                        <Input
                          type="datetime-local"
                          value={providerContract.operationsApprovedAt}
                          onChange={(event) =>
                            setProviderContract({
                              ...providerContract,
                              operationsApprovedAt: event.target.value,
                            })
                          }
                        />
                        <Input
                          value={providerContract.securityApprovalReference}
                          onChange={(event) =>
                            setProviderContract({
                              ...providerContract,
                              securityApprovalReference: event.target.value,
                            })
                          }
                          placeholder="Security approval reference (callbacks)"
                        />
                        <Input
                          type="datetime-local"
                          value={providerContract.securityApprovedAt}
                          onChange={(event) =>
                            setProviderContract({
                              ...providerContract,
                              securityApprovedAt: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Rights explicitly granted by the agreement
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {[
                            ["accountVerification", "Account verification"],
                            ["quoteSubmission", "Quote submission"],
                            ["quoteResponsePersistence", "Persist quote responses"],
                            ["quoteResponseTransformation", "Transform quote responses"],
                            ["commercialUse", "Commercial use"],
                            ["bookingCreation", "Create bookings"],
                            ["bookingCancellation", "Cancel bookings"],
                            ["trackingPersistence", "Persist tracking"],
                            ["proofOfDeliveryPersistence", "Persist proof of delivery"],
                            ["webhookProcessing", "Process webhooks"],
                          ].map(([key, label]) => (
                            <label key={key} className="flex items-center gap-2 text-xs">
                              <Checkbox
                                checked={(providerContract as any)[key]}
                                onCheckedChange={(value) =>
                                  setProviderContract({
                                    ...providerContract,
                                    [key]: value === true,
                                  })
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <Input
                        value={providerContract.sandboxReceiptReferences}
                        onChange={(event) =>
                          setProviderContract({
                            ...providerContract,
                            sandboxReceiptReferences: event.target.value,
                          })
                        }
                        placeholder="Controlled sandbox receipt references, comma separated"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={providerContract.sandboxPilotCompleted}
                            onCheckedChange={(value) =>
                              setProviderContract({
                                ...providerContract,
                                sandboxPilotCompleted: value === true,
                              })
                            }
                          />
                          Controlled sandbox pilot completed
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={providerContract.productionUseApproved}
                            onCheckedChange={(value) =>
                              setProviderContract({
                                ...providerContract,
                                productionUseApproved: value === true,
                              })
                            }
                          />
                          Production use explicitly approved
                        </label>
                      </div>
                    </>
                  ) : null}
                </div>
              </details>
              <RequiredConfirmation checked={connection.confirmed} onCheckedChange={(confirmed) => setConnection({ ...connection, confirmed })} label="I verified this account/capability state in the private provider console and confirm no credential material is included." />
              <Button
                disabled={busy || !connection.confirmed || !connection.carrierProfileId || !connection.provider || !connection.credentialReference || !connection.sourceReferences || contractEvidenceIncomplete}
                onClick={() => action.mutate({
                  path: `${API}/connections/record-verification`,
                  body: {
                    ...connection,
                    capabilities: commaList(connection.capabilities),
                    scopes: commaList(connection.scopes),
                    verificationEvidence: {
                      verified: true,
                      credentialsExcluded: true,
                      verifiedAt: new Date().toISOString(),
                      authorityReference: connection.authorityReference,
                      externalAccountReference: connection.externalAccountReference,
                      sourceReferences: commaList(connection.sourceReferences),
                      providerContract: providerContract.include
                        ? {
                            provider: connection.provider,
                            writtenAgreementExecuted:
                              providerContract.writtenAgreementExecuted,
                            agreementReference: providerContract.agreementReference,
                            agreementEffectiveAt: new Date(
                              providerContract.agreementEffectiveAt,
                            ).toISOString(),
                            agreementExpiresAt: new Date(
                              providerContract.agreementExpiresAt,
                            ).toISOString(),
                            termsSnapshotReference:
                              providerContract.termsSnapshotReference,
                            legalApprovalReference:
                              providerContract.legalApprovalReference,
                            legalApprovedAt: new Date(
                              providerContract.legalApprovedAt,
                            ).toISOString(),
                            operationsApprovalReference:
                              providerContract.operationsApprovalReference,
                            operationsApprovedAt: new Date(
                              providerContract.operationsApprovedAt,
                            ).toISOString(),
                            securityApprovalReference:
                              providerContract.securityApprovalReference || null,
                            securityApprovedAt: providerContract.securityApprovedAt
                              ? new Date(
                                  providerContract.securityApprovedAt,
                                ).toISOString()
                              : null,
                            productionUseApproved:
                              providerContract.productionUseApproved,
                            dataRights: {
                              accountVerification:
                                providerContract.accountVerification,
                              quoteSubmission: providerContract.quoteSubmission,
                              quoteResponsePersistence:
                                providerContract.quoteResponsePersistence,
                              quoteResponseTransformation:
                                providerContract.quoteResponseTransformation,
                              commercialUse: providerContract.commercialUse,
                              bookingCreation: providerContract.bookingCreation,
                              bookingCancellation:
                                providerContract.bookingCancellation,
                              trackingPersistence:
                                providerContract.trackingPersistence,
                              proofOfDeliveryPersistence:
                                providerContract.proofOfDeliveryPersistence,
                              webhookProcessing:
                                providerContract.webhookProcessing,
                            },
                            sandboxPilot: {
                              completed: providerContract.sandboxPilotCompleted,
                              receiptReferences: commaList(
                                providerContract.sandboxReceiptReferences,
                              ),
                            },
                          }
                        : null,
                    },
                  },
                })}
              >
                Record adapter readiness
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card className="border-white/10 bg-[#0b1725] text-white">
            <CardHeader><CardTitle>5. Prepare an exact carrier quote request</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Input value={quoteRequest.industrialOrderId} onChange={(event) => setQuoteRequest({ ...quoteRequest, industrialOrderId: event.target.value })} placeholder="Paid or confirmed industrial order UUID" className="md:col-span-2" />
              <select value={quoteRequest.serviceType} onChange={(event) => setQuoteRequest({ ...quoteRequest, serviceType: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {["freight", "customs", "last_mile"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <Input value={quoteRequest.transportMode} onChange={(event) => setQuoteRequest({ ...quoteRequest, transportMode: event.target.value })} placeholder="Transport mode" />
              <Input value={quoteRequest.originCountryCode} onChange={(event) => setQuoteRequest({ ...quoteRequest, originCountryCode: event.target.value.toUpperCase() })} maxLength={2} placeholder="Origin country" />
              <Input value={quoteRequest.originCity} onChange={(event) => setQuoteRequest({ ...quoteRequest, originCity: event.target.value })} placeholder="Origin city" />
              <Input value={quoteRequest.destinationCountryCode} onChange={(event) => setQuoteRequest({ ...quoteRequest, destinationCountryCode: event.target.value.toUpperCase() })} maxLength={2} placeholder="Destination country" />
              <Input value={quoteRequest.destinationCity} onChange={(event) => setQuoteRequest({ ...quoteRequest, destinationCity: event.target.value })} placeholder="Destination city" />
              <Textarea value={quoteRequest.cargoDescription} onChange={(event) => setQuoteRequest({ ...quoteRequest, cargoDescription: event.target.value })} placeholder="Cargo/product description" className="md:col-span-2" />
              <Input value={quoteRequest.productCategory} onChange={(event) => setQuoteRequest({ ...quoteRequest, productCategory: event.target.value })} placeholder="Product category" />
              <Input value={quoteRequest.incoterm} onChange={(event) => setQuoteRequest({ ...quoteRequest, incoterm: event.target.value.toUpperCase() })} placeholder="Incoterm" />
              <Input type="number" value={quoteRequest.weightKg} onChange={(event) => setQuoteRequest({ ...quoteRequest, weightKg: event.target.value })} placeholder="Weight kg" />
              <Input type="number" value={quoteRequest.volumeM3} onChange={(event) => setQuoteRequest({ ...quoteRequest, volumeM3: event.target.value })} placeholder="Volume m³" />
              <Input type="number" value={quoteRequest.declaredValueMinor} onChange={(event) => setQuoteRequest({ ...quoteRequest, declaredValueMinor: event.target.value })} placeholder="Declared value, minor units" />
              <Input value={quoteRequest.currencyCode} onChange={(event) => setQuoteRequest({ ...quoteRequest, currencyCode: event.target.value.toUpperCase() })} maxLength={3} />
              <Input value={quoteRequest.requiredCapabilities} onChange={(event) => setQuoteRequest({ ...quoteRequest, requiredCapabilities: event.target.value })} placeholder="Required capabilities" className="md:col-span-2" />
              <div className="flex flex-wrap gap-4 text-xs md:col-span-2">
                {[
                  ["hazardousGoods", "Hazardous goods"],
                  ["coldChainRequired", "Cold chain"],
                  ["fragile", "Fragile"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <Checkbox checked={(quoteRequest as any)[key]} onCheckedChange={(value) => setQuoteRequest({ ...quoteRequest, [key]: value === true })} /> {label}
                  </label>
                ))}
              </div>
              <RequiredConfirmation checked={quoteRequest.confirmed} onCheckedChange={(confirmed) => setQuoteRequest({ ...quoteRequest, confirmed })} label="I confirm this prepares and matches an internal request only. It does not contact any carrier." />
              <Button
                disabled={busy || !quoteRequest.confirmed || !quoteRequest.industrialOrderId || !quoteRequest.originCountryCode || !quoteRequest.destinationCountryCode || !quoteRequest.cargoDescription}
                onClick={() => action.mutate({
                  path: `${API}/quote-requests/prepare`,
                  body: {
                    industrialOrderId: quoteRequest.industrialOrderId,
                    idempotencyKey: quoteRequest.idempotencyKey,
                    serviceType: quoteRequest.serviceType,
                    origin: { countryCode: quoteRequest.originCountryCode, city: quoteRequest.originCity || null },
                    destination: { countryCode: quoteRequest.destinationCountryCode, city: quoteRequest.destinationCity || null },
                    cargo: {
                      description: quoteRequest.cargoDescription,
                      productCategory: quoteRequest.productCategory || null,
                      weightKg: quoteRequest.weightKg ? Number(quoteRequest.weightKg) : null,
                      volumeM3: quoteRequest.volumeM3 ? Number(quoteRequest.volumeM3) : null,
                      declaredValueMinor: quoteRequest.declaredValueMinor ? Number(quoteRequest.declaredValueMinor) : null,
                      currencyCode: quoteRequest.currencyCode,
                      hazardousGoods: quoteRequest.hazardousGoods,
                      coldChainRequired: quoteRequest.coldChainRequired,
                      fragile: quoteRequest.fragile,
                    },
                    incoterm: quoteRequest.incoterm || null,
                    transportMode: quoteRequest.transportMode,
                    requiredCapabilities: commaList(quoteRequest.requiredCapabilities),
                    confirmed: true,
                  },
                })}
                className="md:col-span-2"
              >
                Prepare quote request
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0b1725] text-white">
            <CardHeader><CardTitle>6. Record a provider quote receipt</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <select value={quote.quoteRequestId} onChange={(event) => setQuote({ ...quote, quoteRequestId: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm md:col-span-2">
                <option value="">Select quote request</option>
                {(data?.quoteRequests || []).map((item) => <option key={item.id} value={item.id}>{item.serviceType} — {item.industrialOrderId} — {item.status}</option>)}
              </select>
              <select value={quote.carrierProfileId} onChange={(event) => setQuote({ ...quote, carrierProfileId: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm md:col-span-2">
                <option value="">Select verified carrier</option>
                {profileOptions}
              </select>
              <select value={quote.carrierCoverageId} onChange={(event) => setQuote({ ...quote, carrierCoverageId: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Coverage (optional)</option>
                {(data?.coverages || []).filter((item) => !quote.carrierProfileId || item.carrierProfileId === quote.carrierProfileId).map((item) => <option key={item.id} value={item.id}>{item.originCountryCode} → {item.destinationCountryCode} / {item.status}</option>)}
              </select>
              <select value={quote.adapterConnectionId} onChange={(event) => setQuote({ ...quote, adapterConnectionId: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Adapter connection (optional)</option>
                {(data?.connections || []).filter((item) => !quote.carrierProfileId || item.carrierProfileId === quote.carrierProfileId).map((item) => <option key={item.id} value={item.id}>{item.provider} / {item.status}</option>)}
              </select>
              <select value={quote.sourceType} onChange={(event) => setQuote({ ...quote, sourceType: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {["manual_evidence", "provider_callback", "approved_import"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <Input value={quote.providerQuoteReference} onChange={(event) => setQuote({ ...quote, providerQuoteReference: event.target.value })} placeholder="Provider quote/reference" />
              <Input type="number" value={quote.totalCostMinor} onChange={(event) => setQuote({ ...quote, totalCostMinor: event.target.value })} placeholder="Private carrier cost, minor units" />
              <Input type="number" value={quote.customerPriceMinor} onChange={(event) => setQuote({ ...quote, customerPriceMinor: event.target.value })} placeholder="Customer price, minor units (optional)" />
              <Input value={quote.currencyCode} onChange={(event) => setQuote({ ...quote, currencyCode: event.target.value.toUpperCase() })} maxLength={3} />
              <Input type="datetime-local" value={quote.validUntil} onChange={(event) => setQuote({ ...quote, validUntil: event.target.value })} />
              <Input type="number" value={quote.minimumTransitDays} onChange={(event) => setQuote({ ...quote, minimumTransitDays: event.target.value })} placeholder="Min transit days" />
              <Input type="number" value={quote.maximumTransitDays} onChange={(event) => setQuote({ ...quote, maximumTransitDays: event.target.value })} placeholder="Max transit days" />
              <Input value={quote.evidenceReference} onChange={(event) => setQuote({ ...quote, evidenceReference: event.target.value })} placeholder="Quote document/message receipt reference" className="md:col-span-2" />
              <Textarea value={quote.terms} onChange={(event) => setQuote({ ...quote, terms: event.target.value })} placeholder="Terms, exclusions, insurance, validity notes" className="md:col-span-2" />
              <RequiredConfirmation checked={quote.confirmed} onCheckedChange={(confirmed) => setQuote({ ...quote, confirmed })} label="I inspected the provider/source receipt and confirm this structured quote. Recording it does not book the carrier." />
              <Button
                disabled={busy || !quote.confirmed || !quote.quoteRequestId || !quote.carrierProfileId || !quote.totalCostMinor || !quote.validUntil || !quote.evidenceReference}
                onClick={() => action.mutate({
                  path: `${API}/quotes/record`,
                  body: {
                    ...quote,
                    totalCostMinor: Number(quote.totalCostMinor),
                    customerPriceMinor: quote.customerPriceMinor ? Number(quote.customerPriceMinor) : null,
                    minimumTransitDays: quote.minimumTransitDays ? Number(quote.minimumTransitDays) : null,
                    maximumTransitDays: quote.maximumTransitDays ? Number(quote.maximumTransitDays) : null,
                    validUntil: new Date(quote.validUntil).toISOString(),
                    terms: { notes: quote.terms },
                    evidence: [{ reference: quote.evidenceReference, verifiedByHuman: true }],
                  },
                })}
                className="md:col-span-2"
              >
                Record verified quote
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card className="border-white/10 bg-[#0b1725] text-white">
            <CardHeader><CardTitle>Quote comparison and booking preparation</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Textarea value={selection.rationale} onChange={(event) => setSelection({ ...selection, rationale: event.target.value })} placeholder="Why is this the best commercial and operational quote—not merely the cheapest?" />
              <RequiredConfirmation checked={selection.confirmed} onCheckedChange={(confirmed) => setSelection({ ...selection, confirmed })} label="I confirm the quote selection. A paid order and initialized fulfillment plan are required; no carrier will be booked." />
              {(data?.quotes || []).length ? (
                <div className="grid gap-3">
                  {(data?.quotes || []).map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-black">{profileName(profiles, item.carrierProfileId)}</div>
                          <div className="mt-1 text-sm text-slate-300">{formatMinor(item.totalCostMinor, item.currencyCode)} · valid until {new Date(item.validUntil).toLocaleString()}</div>
                          <div className="mt-1 font-mono text-[11px] text-slate-500">{item.id}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {stateBadge(item.status)}
                          <Button
                            size="sm"
                            disabled={busy || !selection.confirmed || selection.rationale.trim().length < 8 || item.status !== "verified"}
                            onClick={() => action.mutate({
                              path: `${API}/quotes/${item.id}/select`,
                              body: {
                                idempotencyKey: newKey(`booking-${item.id.slice(0, 8)}`),
                                selectionRationale: selection.rationale,
                                confirmed: true,
                              },
                            })}
                          >
                            Select & prepare
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-400">No structured carrier quote has been recorded.</p>}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0b1725] text-white">
            <CardHeader><CardTitle>Internal booking authority</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Input value={bookingApproval.approvalReference} onChange={(event) => setBookingApproval({ ...bookingApproval, approvalReference: event.target.value })} placeholder="Authority/budget/decision reference" />
              <Textarea value={bookingApproval.approvalRationale} onChange={(event) => setBookingApproval({ ...bookingApproval, approvalRationale: event.target.value })} placeholder="Why may this exact paid-order booking be submitted?" />
              <RequiredConfirmation checked={bookingApproval.confirmed} onCheckedChange={(confirmed) => setBookingApproval({ ...bookingApproval, confirmed })} label="I authorize only this exact booking for separate official-adapter submission. I understand this control does not submit or confirm it." />
              {(data?.bookings || []).map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold">{profileName(profiles, item.carrierProfileId)}</div>
                      <div className="text-xs text-slate-400">{formatMinor(item.authorizedCostMinor, item.currencyCode)}</div>
                    </div>
                    {stateBadge(item.status)}
                  </div>
                  <Button
                    className="mt-3 w-full"
                    size="sm"
                    disabled={busy || item.status !== "approval_required" || !bookingApproval.confirmed || !bookingApproval.approvalReference || bookingApproval.approvalRationale.trim().length < 8}
                    onClick={() => action.mutate({
                      path: `${API}/bookings/${item.id}/approve`,
                      body: {
                        ...bookingApproval,
                        confirmed: true,
                      },
                    })}
                  >
                    Approve for submission
                  </Button>
                </div>
              ))}
              <p className="text-xs leading-5 text-amber-100">
                “Approved submission ready” is not “submitted” and not “provider confirmed.”
                Those states require an official adapter operation and provider receipt that this
                page cannot perform.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
          <Card className="border-white/10 bg-[#0b1725] text-white">
            <CardHeader><CardTitle>Open a carrier/account incident</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <select value={incident.carrierProfileId} onChange={(event) => setIncident({ ...incident, carrierProfileId: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select carrier</option>
                {profileOptions}
              </select>
              <select value={incident.severity} onChange={(event) => setIncident({ ...incident, severity: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {["low", "medium", "high", "critical"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <Input value={incident.incidentType} onChange={(event) => setIncident({ ...incident, incidentType: event.target.value })} placeholder="Incident type" />
              <Input value={incident.title} onChange={(event) => setIncident({ ...incident, title: event.target.value })} placeholder="Incident title" />
              <Textarea value={incident.description} onChange={(event) => setIncident({ ...incident, description: event.target.value })} placeholder="What happened and what is affected?" />
              <Input value={incident.evidenceReference} onChange={(event) => setIncident({ ...incident, evidenceReference: event.target.value })} placeholder="Evidence reference" />
              <RequiredConfirmation checked={incident.confirmed} onCheckedChange={(confirmed) => setIncident({ ...incident, confirmed })} label="I confirm this incident is evidence-backed. High and critical incidents restrict the carrier until remediation." />
              <Button
                variant="destructive"
                disabled={busy || !incident.confirmed || !incident.carrierProfileId || !incident.title || !incident.description}
                onClick={() => action.mutate({
                  path: `${API}/incidents`,
                  body: {
                    ...incident,
                    evidence: incident.evidenceReference ? [{ reference: incident.evidenceReference }] : [],
                    operationalImpact: { blockNewBookings: ["high", "critical"].includes(incident.severity) },
                  },
                })}
              >
                Open incident
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0b1725] text-white">
            <CardHeader><CardTitle>Carrier registry truth</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {profiles.length ? profiles.map((profile) => {
                const readiness = data?.readiness?.find((item) => item.carrierProfileId === profile.id);
                const carrierCoverages = (data?.coverages || []).filter((item) => item.carrierProfileId === profile.id);
                const carrierConnections = (data?.connections || []).filter((item) => item.carrierProfileId === profile.id);
                return (
                  <div key={profile.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-black">{profile.displayName || profile.legalName}</div>
                        <div className="mt-1 text-xs text-slate-400">{profile.carrierType} · {profile.referenceCode}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">{stateBadge(profile.status)} {stateBadge(profile.partnershipStatus)}</div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                      <div>{carrierCoverages.length} coverage records</div>
                      <div>{carrierConnections.length} adapter records</div>
                      <div>{readiness?.ready ? "Ready profile evidence" : `${readiness?.blockers?.length || 0} blockers`}</div>
                    </div>
                    {readiness && !readiness.ready ? (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {readiness.blockers.map((blocker) => <Badge key={blocker} variant="outline" className="border-amber-300/20 text-amber-100">{blocker.replaceAll("_", " ")}</Badge>)}
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-2 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Profile evidence is current.</div>
                    )}
                  </div>
                );
              }) : <p className="text-sm text-slate-400">No carrier candidate has been recorded. No provider is implied.</p>}
            </CardContent>
          </Card>
        </section>

        <Card className="border-white/10 bg-[#0b1725] text-white">
          <CardHeader><CardTitle className="flex items-center gap-2"><Route className="h-5 w-5" /> Operational state ledger</CardTitle></CardHeader>
          <CardContent className="grid gap-5 xl:grid-cols-3">
            <div>
              <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Quote requests</h3>
              <div className="space-y-2">
                {(data?.quoteRequests || []).slice(0, 12).map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/10 p-3 text-xs">
                    <div className="flex justify-between gap-2"><span>{item.serviceType}</span>{stateBadge(item.status)}</div>
                    <div className="mt-2 font-mono text-[10px] text-slate-500">{item.industrialOrderId}</div>
                    <div className="mt-1 text-slate-400">Provider request executed: {String(item.providerRequestExecuted)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Booking authority</h3>
              <div className="space-y-2">
                {(data?.bookings || []).slice(0, 12).map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/10 p-3 text-xs">
                    <div className="flex justify-between gap-2"><span>{profileName(profiles, item.carrierProfileId)}</span>{stateBadge(item.status)}</div>
                    <div className="mt-2 text-slate-400">External booking executed: {String(item.externalBookingExecuted)}</div>
                    <div className="text-slate-400">Provider ref: {item.providerBookingReference || "none"}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Account/service incidents</h3>
              <div className="space-y-2">
                {(data?.incidents || []).slice(0, 12).map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/10 p-3 text-xs">
                    <div className="flex justify-between gap-2"><span>{item.title}</span>{stateBadge(item.severity)}</div>
                    <div className="mt-2 text-slate-400">{item.status.replaceAll("_", " ")}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
