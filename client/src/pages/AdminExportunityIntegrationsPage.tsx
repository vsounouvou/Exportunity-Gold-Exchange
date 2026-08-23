import { useState, type ComponentType } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Facebook,
  HardDrive,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Youtube,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type OAuthIntegration = {
  id: "google_workspace" | "youtube" | "meta_business";
  label: string;
  provider: "google" | "meta";
  configured: boolean;
  connected: boolean;
  ready: boolean;
  operationalReady?: boolean;
  status: string;
  accountLabel?: string | null;
  scopes: string[];
  requestedScopes: string[];
  callbackPath: string;
  missingEnv: string[];
  expiresAt?: string | null;
  reconnectRequired?: boolean;
  providerVerification?: ProviderVerification | null;
  scopeContract: {
    ready: boolean;
    missingScopes: string[];
    unexpectedScopes: string[];
  };
  note: string;
};

type TwilioIntegration = {
  id: "twilio";
  label: string;
  provider: "twilio";
  configured: boolean;
  connected: boolean;
  ready: boolean;
  status: string;
  requiredEnv: string[];
  missingEnv: string[];
  envNamespace: string;
  smsEnabled: boolean;
  smsVerified: boolean;
  whatsappSenderPresent: boolean;
  whatsappVerified: boolean;
  sandboxMode: boolean;
  testRecipients: {
    sms: { configured: boolean; masked: string | null };
    whatsapp: { configured: boolean; masked: string | null };
  };
  warnings: string[];
  note: string;
  providerVerification?: TwilioVerification | null;
};

type IntegrationStatusResponse = {
  ok: boolean;
  tenant: { key: "exportunity" };
  namespace: {
    api: string;
    storage: string;
    credentials: string;
    isolatedProductState: true;
  };
  outreachTest: {
    mode: "owner_only";
    enabled: boolean;
    externalRecipientsAllowed: false;
    channels: {
      email: { enabled: boolean; recipients: string[] };
      sms: { enabled: boolean; recipients: string[] };
      whatsapp: { enabled: boolean; recipients: string[] };
      meta: { enabled: false; recipients: string[]; note: string };
    };
  };
  integrations: {
    google_workspace: OAuthIntegration;
    youtube: OAuthIntegration;
    meta_business: OAuthIntegration;
    twilio: TwilioIntegration;
  };
};

type AuthorizationResponse = {
  ok: boolean;
  integrationId: OAuthIntegration["id"];
  authorizeUrl: string;
  callbackPath: string;
  expiresAt: string;
};

type ProviderVerificationCheck = {
  key: string;
  label: string;
  verified: boolean;
  state: "verified" | "attention" | "provider_error";
  providerStatus: string | null;
  detail: string;
};

type ProviderVerification = {
  integrationId: OAuthIntegration["id"];
  provider: OAuthIntegration["provider"];
  ready: boolean;
  authorizationReady: boolean;
  resourceReady: boolean;
  checkedAt: string;
  mode: "read_only";
  credentialsNamespace: "EXPORTUNITY_";
  providerMutationPerformed: false;
  externalActionPerformed: false;
  tokenRefreshed: boolean;
  requestedScopes: string[];
  grantedScopes: string[];
  missingScopes: string[];
  unexpectedScopes: string[];
  checks: ProviderVerificationCheck[];
  capabilities: Record<string, boolean | number>;
  warnings: string[];
  fresh?: boolean;
  freshUntil?: string;
};

type ProviderVerificationResponse = {
  ok: boolean;
  verification: ProviderVerification;
};

type TwilioVerificationCheck = {
  configured: boolean;
  verified: boolean;
  state: "not_configured" | "verified" | "unverified" | "provider_error";
  identifier: string | null;
  providerStatus: string | null;
  detail: string;
};

type TwilioVerification = {
  ready: boolean;
  checkedAt: string;
  mode: "read_only";
  credentialsNamespace: "EXPORTUNITY_";
  externalActionPerformed: false;
  messageSent: false;
  checks: {
    account: TwilioVerificationCheck;
    sms: TwilioVerificationCheck;
    messagingService: TwilioVerificationCheck;
    whatsapp: TwilioVerificationCheck;
  };
  warnings: string[];
  fresh?: boolean;
  freshUntil?: string;
};

type TwilioVerificationResponse = {
  ok: boolean;
  verification: TwilioVerification;
};

type OwnerOutreachTestChannel = "email" | "sms" | "whatsapp";

type OwnerOutreachTestResponse = {
  ok: true;
  actionRequestId: number;
  status: string;
  channel: OwnerOutreachTestChannel;
  ownerAllowlistVerified: true;
  externalRecipientAllowed: false;
};

function formatDate(value?: string | null) {
  if (!value) return "Not reported";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Not reported";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StatusBadge({ integration }: { integration: OAuthIntegration }) {
  if (integration.operationalReady) {
    return (
      <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-800">
        Provider verified
      </Badge>
    );
  }
  if (integration.reconnectRequired) {
    return (
      <Badge className="border border-amber-200 bg-amber-50 text-amber-900">
        Reconnect required
      </Badge>
    );
  }
  if (integration.connected) {
    return (
      <Badge className="border border-amber-200 bg-amber-50 text-amber-900">
        Connected · verify
      </Badge>
    );
  }
  return (
    <Badge className="border border-slate-200 bg-slate-100 text-slate-700">
      {integration.configured ? "Authorization required" : "Setup required"}
    </Badge>
  );
}

function ProviderCheckResult({
  check,
  stale = false,
}: {
  check: ProviderVerificationCheck;
  stale?: boolean;
}) {
  const badgeClass = stale
    ? "border border-amber-200 bg-amber-50 text-amber-900"
    : check.verified
      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
      : check.state === "provider_error"
        ? "border border-red-200 bg-red-50 text-red-800"
        : "border border-amber-200 bg-amber-50 text-amber-900";
  const badgeLabel = stale
    ? "Refresh required"
    : check.verified
      ? "Verified"
      : check.state === "provider_error"
        ? "Provider error"
        : "Needs attention";
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="font-bold text-slate-950">{check.label}</div>
        <Badge className={badgeClass}>{badgeLabel}</Badge>
      </div>
      {check.providerStatus ? (
        <code className="mt-2 block text-[11px] text-slate-500">
          {check.providerStatus}
        </code>
      ) : null}
      <p className="mt-2 leading-5 text-slate-600">{check.detail}</p>
    </div>
  );
}

function Capability({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function MissingConfiguration({ keys }: { keys: string[] }) {
  if (!keys.length) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <div className="flex items-center gap-2 font-bold">
        <TriangleAlert className="h-4 w-4" />
        Runtime configuration needed
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {keys.map((key) => (
          <code
            key={key}
            className="rounded-md border border-amber-200 bg-white/70 px-2 py-1 text-[11px]"
          >
            {key}
          </code>
        ))}
      </div>
    </div>
  );
}

function TwilioCheckResult({
  label,
  check,
  stale = false,
}: {
  label: string;
  check: TwilioVerificationCheck;
  stale?: boolean;
}) {
  const badgeClass = stale
    ? "border border-amber-200 bg-amber-50 text-amber-900"
    : check.verified
      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
      : check.state === "provider_error"
        ? "border border-red-200 bg-red-50 text-red-800"
        : check.state === "not_configured"
          ? "border border-slate-200 bg-slate-100 text-slate-700"
          : "border border-amber-200 bg-amber-50 text-amber-900";
  const badgeLabel = stale
    ? "Refresh required"
    : check.verified
      ? "Verified"
      : check.state === "provider_error"
        ? "Provider error"
        : check.state === "not_configured"
          ? "Not configured"
          : "Needs attention";
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <div className="mt-1 font-semibold text-slate-950">
            {check.identifier || "Not configured"}
          </div>
        </div>
        <Badge className={badgeClass}>{badgeLabel}</Badge>
      </div>
      {check.providerStatus ? (
        <code className="mt-2 block text-[11px] text-slate-500">
          {check.providerStatus}
        </code>
      ) : null}
      <p className="mt-2 leading-5 text-slate-600">{check.detail}</p>
    </div>
  );
}

function twilioSummaryStatus(
  verification: TwilioVerification | null,
  check: TwilioVerificationCheck | undefined,
  fallback: string,
) {
  if (!verification || !check) return fallback;
  if (verification.fresh === false) return "Verification refresh required";
  return check.verified ? "Provider verified" : "Provider attention required";
}

export default function AdminExportunityIntegrationsPage() {
  const { toast } = useToast();
  const [connectingId, setConnectingId] = useState<OAuthIntegration["id"] | null>(
    null,
  );
  const [verifyingId, setVerifyingId] = useState<OAuthIntegration["id"] | null>(
    null,
  );
  const [queuingOwnerTarget, setQueuingOwnerTarget] = useState<string | null>(
    null,
  );
  const statusQuery = useQuery<IntegrationStatusResponse>({
    queryKey: ["/api/exportunity/integrations/status"],
    staleTime: 10_000,
  });

  const authorizeMutation = useMutation({
    mutationFn: async (integrationId: OAuthIntegration["id"]) => {
      setConnectingId(integrationId);
      return apiRequest(
        `/api/exportunity/integrations/${integrationId}/authorize`,
        "POST",
        { returnTo: "/admin/exportunity/integrations" },
      ) as Promise<AuthorizationResponse>;
    },
    onSuccess: (result) => {
      if (!result.authorizeUrl) {
        throw new Error("The provider authorization URL was not returned.");
      }
      window.location.assign(result.authorizeUrl);
    },
    onError: (error: any) => {
      setConnectingId(null);
      toast({
        title: "Connection could not start",
        description:
          error?.message || "The provider authorization could not be started.",
        variant: "destructive",
      });
    },
  });

  const providerVerificationMutation = useMutation({
    mutationFn: async (integrationId: OAuthIntegration["id"]) => {
      setVerifyingId(integrationId);
      return apiRequest(
        `/api/exportunity/integrations/${integrationId}/verify`,
        "POST",
        {},
      ) as Promise<ProviderVerificationResponse>;
    },
    onSuccess: (result) => {
      void statusQuery.refetch();
      toast({
        title: result.verification.ready
          ? `${result.verification.provider === "google" ? "Google" : "Meta"} provider evidence verified`
          : "Provider verification completed",
        description: result.verification.ready
          ? "The connected company authorization and required provider resources passed read-only checks."
          : "No provider content was changed. Review the evidence and warnings shown below.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Provider verification could not complete",
        description:
          error?.message || "The read-only provider check could not be completed.",
        variant: "destructive",
      });
    },
    onSettled: () => setVerifyingId(null),
  });

  const twilioVerificationMutation = useMutation({
    mutationFn: () =>
      apiRequest(
        "/api/exportunity/integrations/twilio/verify",
        "POST",
        {},
      ) as Promise<TwilioVerificationResponse>,
    onSuccess: (result) => {
      void statusQuery.refetch();
      toast({
        title: result.verification.ready
          ? "Twilio provider evidence verified"
          : "Twilio verification completed",
        description: result.verification.ready
          ? "The required account, SMS route, and WhatsApp sender passed read-only checks."
          : "No message was sent. Review the provider evidence shown below.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Twilio verification could not complete",
        description:
          error?.message || "The read-only provider check could not be completed.",
        variant: "destructive",
      });
    },
  });

  const ownerOutreachTestMutation = useMutation({
    mutationFn: async (input: {
      channel: OwnerOutreachTestChannel;
      recipientIndex: number;
      targetKey: string;
    }) => {
      setQueuingOwnerTarget(input.targetKey);
      return apiRequest(
        "/api/exportunity/integrations/outreach-test/queue",
        "POST",
        {
          channel: input.channel,
          recipientIndex: input.recipientIndex,
        },
      ) as Promise<OwnerOutreachTestResponse>;
    },
    onSuccess: (result) => {
      toast({
        title: `${result.channel.toUpperCase()} owner test queued`,
        description: `Governed action ${result.actionRequestId} is ${String(result.status).toLowerCase()}. No non-owner destination was permitted.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Owner-only test could not be queued",
        description:
          error?.message ||
          "The governed outreach action rejected this test destination.",
        variant: "destructive",
      });
    },
    onSettled: () => setQueuingOwnerTarget(null),
  });

  const data = statusQuery.data;
  const twilioVerification =
    twilioVerificationMutation.data?.verification ||
    data?.integrations.twilio.providerVerification ||
    null;
  const twilioVerificationFresh = twilioVerification?.fresh !== false;
  const twilioProviderReady = Boolean(
    twilioVerification?.ready && twilioVerificationFresh,
  );
  const oauthCards = data
    ? [
        data.integrations.google_workspace,
        data.integrations.youtube,
        data.integrations.meta_business,
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#f5f6f3] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,.08)]">
          <div className="border-b border-slate-200 bg-[linear-gradient(120deg,#0f2f26,#174c3a)] p-6 text-white md:p-8">
            <div className="text-xs font-black uppercase tracking-[0.28em] text-[#f5ba4d]">
              Exportunity Operations
            </div>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                  Provider connections
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-50/85">
                  Connect Exportunity&apos;s company-owned Google Workspace,
                  YouTube, and Meta Business accounts, and verify Twilio
                  readiness. Tokens, audit history, and authorization state
                  remain inside the Exportunity tenant boundary.
                </p>
              </div>
              <Button
                variant="outline"
                className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => {
                  providerVerificationMutation.reset();
                  twilioVerificationMutation.reset();
                  statusQuery.refetch();
                }}
                disabled={statusQuery.isFetching}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${statusQuery.isFetching ? "animate-spin" : ""}`}
                />
                Refresh status
              </Button>
            </div>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-3 md:p-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 font-bold text-emerald-950">
                <ShieldCheck className="h-5 w-5" />
                Exportunity-owned
              </div>
              <p className="mt-2 text-sm leading-6 text-emerald-900/80">
                Tenant-owned connections and dedicated encrypted token storage.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <div className="flex items-center gap-2 font-bold text-sky-950">
                <CheckCircle2 className="h-5 w-5" />
                Approval governed
              </div>
              <p className="mt-2 text-sm leading-6 text-sky-900/80">
                A connection does not bypass Exportunity action approvals or budgets.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-bold text-slate-950">Product boundary</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This control plane does not reuse another product&apos;s workspaces,
                credentials, tokens, or connection records.
              </p>
            </div>
          </div>
        </section>

        {statusQuery.isPending ? (
          <div className="flex min-h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-[#146c43]" />
          </div>
        ) : statusQuery.isError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-950">
            <div className="flex items-center gap-2 font-black">
              <TriangleAlert className="h-5 w-5" />
              Connection status could not be loaded
            </div>
            <p className="mt-2 text-sm">
              {(statusQuery.error as Error)?.message || "Try refreshing the page."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-3">
              {oauthCards.map((integration) => {
                const isWorkspace = integration.id === "google_workspace";
                const isYouTube = integration.id === "youtube";
                const isGoogle = isWorkspace || isYouTube;
                const isConnecting =
                  authorizeMutation.isPending && connectingId === integration.id;
                const isVerifying =
                  providerVerificationMutation.isPending &&
                  verifyingId === integration.id;
                const providerVerification =
                  providerVerificationMutation.data?.verification.integrationId ===
                  integration.id
                    ? providerVerificationMutation.data.verification
                    : integration.providerVerification || null;
                const providerVerificationFresh =
                  providerVerification?.fresh !== false;
                return (
                  <section
                    key={integration.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid h-12 w-12 place-items-center rounded-2xl ${
                            isGoogle
                              ? "bg-sky-50 text-sky-700"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                            {isWorkspace ? (
                              <Mail className="h-6 w-6" />
                            ) : isYouTube ? (
                              <Youtube className="h-6 w-6" />
                            ) : (
                              <Facebook className="h-6 w-6" />
                          )}
                        </span>
                        <div>
                          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                            Company account
                          </div>
                          <h2 className="mt-1 text-xl font-black">
                            {integration.label}
                          </h2>
                        </div>
                      </div>
                      <StatusBadge integration={integration} />
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {isWorkspace ? (
                        <>
                          <Capability icon={Mail} label="Gmail" />
                          <Capability icon={CalendarDays} label="Calendar" />
                          <Capability icon={HardDrive} label="Drive" />
                        </>
                      ) : isYouTube ? (
                        <Capability icon={Youtube} label="Owned channels" />
                      ) : (
                        <>
                          <Capability icon={Facebook} label="Facebook Pages" />
                          <Capability icon={MessageSquare} label="Instagram comments" />
                        </>
                      )}
                    </div>

                    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Connected account
                        </dt>
                        <dd className="mt-1 break-words font-semibold text-slate-900">
                          {integration.accountLabel || "Not connected"}
                        </dd>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Token expiry
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                          {formatDate(integration.expiresAt)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Exportunity callback
                      </div>
                      <code className="mt-1 block break-all text-xs text-slate-800">
                        {integration.callbackPath}
                      </code>
                    </div>

                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                        Exact requested scopes — read only
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {integration.requestedScopes.map((scope) => (
                          <code
                            key={scope}
                            className="max-w-full break-all rounded-lg bg-white px-2 py-1 text-[11px] text-emerald-950"
                          >
                            {scope}
                          </code>
                        ))}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-emerald-900/80">
                        Google grants are kept separate and are not accumulated
                        across Workspace and YouTube. Write or upload scopes make
                        the connection fail closed.
                      </p>
                    </div>

                    {!integration.scopeContract.ready && integration.reconnectRequired ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                        The stored grant does not match this exact read-only
                        contract and must be replaced before it can become
                        operational.
                        {integration.scopeContract.unexpectedScopes.length ? (
                          <div className="mt-2 break-words text-xs">
                            Outside contract: {integration.scopeContract.unexpectedScopes.join(", ")}
                          </div>
                        ) : null}
                        {integration.scopeContract.missingScopes.length ? (
                          <div className="mt-1 break-words text-xs">
                            Missing: {integration.scopeContract.missingScopes.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <p className="mt-4 text-sm leading-6 text-slate-600">
                      {integration.note}
                    </p>
                    <div className="mt-4">
                      <MissingConfiguration keys={integration.missingEnv} />
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <Button
                        className="bg-[#146c43] font-bold text-white hover:bg-[#105637]"
                        disabled={!integration.configured || authorizeMutation.isPending}
                        onClick={() => authorizeMutation.mutate(integration.id)}
                      >
                        {isConnecting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="mr-2 h-4 w-4" />
                        )}
                        {integration.connected || integration.reconnectRequired
                          ? "Reconnect account"
                          : "Connect account"}
                      </Button>
                      <Button
                        variant="outline"
                        className="border-slate-300 bg-white"
                        disabled={
                          !integration.connected ||
                          providerVerificationMutation.isPending
                        }
                        onClick={() =>
                          providerVerificationMutation.mutate(integration.id)
                        }
                      >
                        {isVerifying ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="mr-2 h-4 w-4" />
                        )}
                        Verify provider access — read only
                      </Button>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Reads authorization and provider resource status only. It
                      does not send email, change a calendar or file, publish a
                      post, upload a video, create an ad, or modify an account.
                    </p>

                    {providerVerification ? (
                      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="font-black text-slate-950">
                            Latest read-only provider evidence
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatDate(providerVerification.checkedAt)}
                          </div>
                        </div>
                        {!providerVerificationFresh ? (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                            This evidence is older than seven days. Run the
                            read-only check again before treating the provider
                            as ready.
                          </div>
                        ) : null}
                        {providerVerification.tokenRefreshed ? (
                          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                            The expired Google access token was refreshed from
                            the existing Exportunity authorization before the
                            checks ran.
                          </div>
                        ) : null}
                        {providerVerification.missingScopes.length ? (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                            Missing provider scopes: {providerVerification.missingScopes.join(", ")}
                          </div>
                        ) : null}
                        {providerVerification.unexpectedScopes.length ? (
                          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950">
                            Outside the exact scope contract: {providerVerification.unexpectedScopes.join(", ")}
                          </div>
                        ) : null}
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {providerVerification.checks.map((check) => (
                            <ProviderCheckResult
                              key={check.key}
                              check={check}
                              stale={!providerVerificationFresh}
                            />
                          ))}
                        </div>
                        {providerVerification.warnings.length ? (
                          <ul className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                            {providerVerification.warnings.map((warning) => (
                              <li key={warning}>• {warning}</li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="mt-3 text-xs font-semibold text-slate-500">
                          Evidence contract: mode {providerVerification.mode};
                          provider mutation {String(providerVerification.providerMutationPerformed)};
                          external action {String(providerVerification.externalActionPerformed)}.
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>

            {data?.integrations.twilio ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-700">
                      <MessageSquare className="h-6 w-6" />
                    </span>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                        Messaging infrastructure
                      </div>
                      <h2 className="mt-1 text-xl font-black">Twilio Messaging</h2>
                    </div>
                  </div>
                  <Badge
                    className={
                      (twilioVerification
                        ? twilioProviderReady
                        : data.integrations.twilio.ready)
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border border-amber-200 bg-amber-50 text-amber-900"
                    }
                  >
                    {twilioVerification
                      ? twilioProviderReady
                        ? "Provider verified"
                        : twilioVerificationFresh
                          ? "Provider attention required"
                          : "Verification refresh required"
                      : data.integrations.twilio.ready
                        ? "Production verified"
                        : data.integrations.twilio.status === "configured_unverified"
                          ? "Verification required"
                          : "Sender setup required"}
                  </Badge>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Core credentials
                    </div>
                    <div className="mt-1 font-semibold">
                      {twilioSummaryStatus(
                        twilioVerification,
                        twilioVerification?.checks.account,
                        data.integrations.twilio.configured
                          ? "Configured"
                          : "Missing",
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      SMS sender
                    </div>
                    <div className="mt-1 font-semibold">
                      {twilioSummaryStatus(
                        twilioVerification,
                        twilioVerification?.checks.sms,
                        data.integrations.twilio.smsVerified
                          ? "Operationally verified"
                          : data.integrations.twilio.smsEnabled
                            ? "Configured, unverified"
                            : "Not configured",
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      WhatsApp sender
                    </div>
                    <div className="mt-1 font-semibold">
                      {twilioSummaryStatus(
                        twilioVerification,
                        twilioVerification?.checks.whatsapp,
                        data.integrations.twilio.whatsappVerified
                          ? "Operationally verified"
                          : data.integrations.twilio.whatsappSenderPresent
                            ? data.integrations.twilio.sandboxMode
                              ? "Sandbox, unverified"
                              : "Configured, unverified"
                            : "Not configured",
                      )}
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {data.integrations.twilio.note}
                </p>
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Owner-only internal test recipients
                  </div>
                  <div className="mt-1 font-semibold">
                    SMS {data.integrations.twilio.testRecipients.sms.masked || "not configured"}
                    {" · "}
                    WhatsApp {data.integrations.twilio.testRecipients.whatsapp.masked || "not configured"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Agents can test only these server-side allowlisted destinations. General external outreach remains disabled.
                  </div>
                </div>
                <div className="mt-4">
                  <MissingConfiguration keys={data.integrations.twilio.missingEnv} />
                </div>
                {(twilioVerification?.warnings ||
                  data.integrations.twilio.warnings
                ).length ? (
                  <ul className="mt-4 space-y-1 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    {(
                      twilioVerification?.warnings ||
                      data.integrations.twilio.warnings
                    ).map((warning) => (
                      <li key={warning}>• {warning}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    className="border-slate-300 bg-white"
                    disabled={
                      !data.integrations.twilio.configured ||
                      twilioVerificationMutation.isPending
                    }
                    onClick={() => twilioVerificationMutation.mutate()}
                  >
                    {twilioVerificationMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="mr-2 h-4 w-4" />
                    )}
                    Verify with Twilio — read only
                  </Button>
                  <span className="text-xs text-slate-500">
                    Fetches provider status only. Sends no SMS, WhatsApp message,
                    call, or verification code.
                  </span>
                </div>

                {twilioVerification ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="font-black text-slate-950">
                        Latest read-only provider evidence
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDate(twilioVerification.checkedAt)}
                      </div>
                    </div>
                    {!twilioVerificationFresh ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                        This evidence is older than seven days. Run the read-only
                        check again before treating the provider as ready.
                      </div>
                    ) : null}
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <TwilioCheckResult
                        label="Account"
                        check={twilioVerification.checks.account}
                        stale={!twilioVerificationFresh}
                      />
                      <TwilioCheckResult
                        label="SMS sender"
                        check={twilioVerification.checks.sms}
                        stale={!twilioVerificationFresh}
                      />
                      <TwilioCheckResult
                        label="Messaging Service"
                        check={twilioVerification.checks.messagingService}
                        stale={!twilioVerificationFresh}
                      />
                      <TwilioCheckResult
                        label="WhatsApp sender"
                        check={twilioVerification.checks.whatsapp}
                        stale={!twilioVerificationFresh}
                      />
                    </div>
                    <div className="mt-3 text-xs font-semibold text-slate-500">
                      Evidence contract: mode {twilioVerification.mode}; external
                      action {String(twilioVerification.externalActionPerformed)};
                      message sent {String(twilioVerification.messageSent)}.
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {data?.outreachTest ? (
              <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
                      Internal channel proving ground
                    </div>
                    <h2 className="mt-1 text-xl font-black text-sky-950">
                      Owner-only outreach tests
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-900/80">
                      Agent tests are rejected unless every destination matches the
                      server-side owner allowlist. This lane does not activate supplier,
                      buyer, lead, or public outreach.
                    </p>
                  </div>
                  <Badge
                    className={
                      data.outreachTest.enabled
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border border-slate-200 bg-white text-slate-700"
                    }
                  >
                    {data.outreachTest.enabled ? "Owner-only mode" : "Disabled"}
                  </Badge>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {(["email", "sms", "whatsapp"] as const).map((channel) => {
                    const item = data.outreachTest.channels[channel];
                    return (
                      <div
                        key={channel}
                        className="rounded-2xl border border-sky-200 bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-black uppercase text-sky-950">
                            {channel}
                          </div>
                          <Badge
                            className={
                              item.enabled
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border border-slate-200 bg-slate-100 text-slate-700"
                            }
                          >
                            {item.enabled ? "Test enabled" : "Held"}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
                          {item.recipients.length
                            ? item.recipients.map((recipient, recipientIndex) => {
                                const targetKey = `${channel}:${recipientIndex}`;
                                const isPending =
                                  ownerOutreachTestMutation.isPending &&
                                  queuingOwnerTarget === targetKey;
                                return (
                                  <div
                                    key={targetKey}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                                  >
                                    <span>{recipient}</span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-sky-200 bg-white text-sky-950"
                                      disabled={
                                        !item.enabled ||
                                        ownerOutreachTestMutation.isPending
                                      }
                                      onClick={() =>
                                        ownerOutreachTestMutation.mutate({
                                          channel,
                                          recipientIndex,
                                          targetKey,
                                        })
                                      }
                                    >
                                      {isPending ? (
                                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <MessageSquare className="mr-2 h-3.5 w-3.5" />
                                      )}
                                      Queue owner test
                                    </Button>
                                  </div>
                                );
                              })
                            : "No owner destination configured"}
                        </div>
                        {!item.enabled && item.recipients.length ? (
                          <p className="mt-3 text-xs leading-5 text-slate-500">
                            The provider sender must be verified before this test
                            can be queued.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 text-xs leading-5 text-sky-900/75">
                  Each control queues one canonical, audited action for the selected
                  masked owner destination. The server resolves the real address from
                  its allowlist; it is never embedded in this page.
                </p>
                <div className="mt-4 rounded-2xl border border-sky-200 bg-white p-4 text-sm leading-6 text-slate-600">
                  <span className="font-black text-slate-950">Meta personal account: </span>
                  {data.outreachTest.channels.meta.note}
                </div>
              </section>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm md:p-6">
              <div className="font-black text-slate-950">Native boundary evidence</div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <code className="rounded-xl bg-slate-100 px-3 py-2">
                  API: {data?.namespace.api}
                </code>
                <code className="rounded-xl bg-slate-100 px-3 py-2">
                  Storage: {data?.namespace.storage}
                </code>
                <code className="rounded-xl bg-slate-100 px-3 py-2">
                  Credentials: {data?.namespace.credentials}
                </code>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
