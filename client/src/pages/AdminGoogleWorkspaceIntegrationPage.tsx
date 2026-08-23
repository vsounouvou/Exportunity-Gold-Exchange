import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  ContactRound,
  ExternalLink,
  FileText,
  HeartPulse,
  LockKeyhole,
  Mail,
  Pause,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Unplug,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { EXPORTUNITY_COMPANY_IDENTITY } from "@tenants/exportunity/companyIdentity";

type Service = "drive" | "gmail" | "contacts";

type ConnectorStatus = {
  service: Service;
  connected: boolean;
  connectorId?: number;
  status: string;
  readOnly?: boolean;
  verifiedEmail?: string;
  googleAccountId?: string;
  accountType?: string;
  displayName?: string | null;
  hostedDomain?: string | null;
  grantedScopes?: string[];
  policy?: Record<string, unknown>;
  connectionHealth?: string;
  connectedAt?: string | null;
  lastSyncAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastError?: string | null;
  pausedAt?: string | null;
  syncState?: Array<{
    type: string;
    updatedAt?: string | null;
    inProgress?: boolean;
    blockedByOpenDeadLetter?: boolean;
    pendingBackfill?: boolean;
  }>;
  sourceCounts?: Record<string, number>;
  openDeadLetters?: number;
};

type FeatureState = { envName: string; enabled: boolean };

type StatusResponse = {
  ok: boolean;
  flags: Record<string, FeatureState>;
  oauth: {
    configured: boolean;
    redirectUri: string;
    credentialSource: string;
    missing: string[];
  };
  governance: {
    readOnly: boolean;
    manualSyncOnly: boolean;
    backgroundSyncEnabled: boolean;
    emailSendingEnabled: boolean;
    contactWritesToGoogleEnabled: boolean;
    driveWritesEnabled: boolean;
    externalCommunicationsEnabled: boolean;
  };
  connectors: ConnectorStatus[];
  runs: Array<{
    id: number;
    service: Service;
    sync_mode: string;
    status: string;
    phase: string;
    counters?: Record<string, number>;
    error_message?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    created_at: string;
  }>;
  deadLetters: Array<{
    id: number;
    service: Service;
    stage: string;
    error_message: string;
    created_at: string;
  }>;
};

type PolicyDraft = {
  allowlistedFolderIds: string;
  allowlistedFileIds: string;
  dateDays: string;
  includeKeywords: string;
  excludeKeywords: string;
  includeDomains: string;
  excludeDomains: string;
  labelIds: string;
  neverIndex: string;
};

const SERVICE_META: Record<Service, { title: string; description: string; icon: typeof Cloud; feature: string }> = {
  drive: {
    title: "Google Drive",
    description: "Read only the explicitly allowlisted company archive files and folders.",
    icon: Cloud,
    feature: "driveRead",
  },
  gmail: {
    title: "Gmail",
    description: "Read business-relevant history with sensitive mail quarantined and attachments kept metadata-only.",
    icon: Mail,
    feature: "gmailRead",
  },
  contacts: {
    title: "Google Contacts",
    description: "Merge qualified business contacts into the existing Exportunity CRM without writing back to Google.",
    icon: ContactRound,
    feature: "contactsRead",
  },
};

const EMPTY_DRAFT: PolicyDraft = {
  allowlistedFolderIds: "",
  allowlistedFileIds: "",
  dateDays: "3650",
  includeKeywords: "",
  excludeKeywords: "",
  includeDomains: "",
  excludeDomains: "",
  labelIds: "",
  neverIndex: "",
};

function listValue(value: unknown) {
  return Array.isArray(value) ? value.map(String).join("\n") : "";
}

function policyDraft(connector?: ConnectorStatus): PolicyDraft {
  const policy = connector?.policy || {};
  return {
    allowlistedFolderIds: listValue(policy.allowlistedFolderIds),
    allowlistedFileIds: listValue(policy.allowlistedFileIds),
    dateDays: String(policy.dateDays || 3650),
    includeKeywords: listValue(policy.includeKeywords),
    excludeKeywords: listValue(policy.excludeKeywords),
    includeDomains: listValue(policy.includeDomains),
    excludeDomains: listValue(policy.excludeDomains),
    labelIds: listValue(policy.labelIds),
    neverIndex: listValue(policy.neverIndex),
  };
}

function lines(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />;
}

function GovernanceRow({ icon: Icon, label, enabled }: { icon: typeof ShieldCheck; label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-800">
        <Icon className="h-4 w-4 text-slate-500" />
        {label}
      </div>
      <Badge className={enabled ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>
        {enabled ? "Enabled" : "Disabled"}
      </Badge>
    </div>
  );
}

export default function AdminGoogleWorkspaceIntegrationPage() {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<Service, PolicyDraft>>({
    drive: { ...EMPTY_DRAFT },
    gmail: { ...EMPTY_DRAFT },
    contacts: { ...EMPTY_DRAFT },
  });

  const statusQuery = useQuery<StatusResponse>({
    queryKey: ["/api/admin/company-brain/workspace/status"],
    staleTime: 10_000,
  });

  const connectors = useMemo(() => {
    const byService = new Map((statusQuery.data?.connectors || []).map((connector) => [connector.service, connector]));
    return (Object.keys(SERVICE_META) as Service[]).map((service) =>
      byService.get(service) || ({ service, connected: false, status: "not_connected" } as ConnectorStatus),
    );
  }, [statusQuery.data?.connectors]);

  useEffect(() => {
    const next = { ...drafts };
    for (const connector of connectors) next[connector.service] = policyDraft(connector);
    setDrafts(next);
    // Connector payload changes are the only source of policy hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQuery.data?.connectors]);

  const refetch = async () => {
    await statusQuery.refetch();
  };

  const actionMutation = useMutation({
    mutationFn: async (input: { service: Service; action: "sync" | "health" | "pause" | "resume" | "revoke"; maxItems?: number }) => {
      if (input.action === "revoke") {
        return apiRequest(`/api/admin/company-brain/workspace/connectors/${input.service}`, "DELETE");
      }
      if (input.action === "pause" || input.action === "resume") {
        return apiRequest(`/api/admin/company-brain/workspace/connectors/${input.service}/pause`, "POST", {
          paused: input.action === "pause",
        });
      }
      return apiRequest(`/api/admin/company-brain/workspace/connectors/${input.service}/${input.action}`, "POST", {
        maxItems: input.maxItems || 100,
      });
    },
    onSuccess: async (_data, variables) => {
      await refetch();
      toast({
        title: variables.action === "sync" ? "Visible sync completed" : "Connector updated",
        description: `${SERVICE_META[variables.service].title}: ${variables.action}.`,
      });
    },
    onError: (error: any) => toast({ title: "Workspace action failed", description: error?.message || "Try again.", variant: "destructive" }),
  });

  const policyMutation = useMutation({
    mutationFn: async (service: Service) => {
      const draft = drafts[service];
      return apiRequest(`/api/admin/company-brain/workspace/connectors/${service}/policy`, "PUT", {
        policy: {
          allowlistedFolderIds: lines(draft.allowlistedFolderIds),
          allowlistedFileIds: lines(draft.allowlistedFileIds),
          dateDays: Number(draft.dateDays),
          includeKeywords: lines(draft.includeKeywords),
          excludeKeywords: lines(draft.excludeKeywords),
          includeDomains: lines(draft.includeDomains),
          excludeDomains: lines(draft.excludeDomains),
          labelIds: lines(draft.labelIds),
          neverIndex: lines(draft.neverIndex),
        },
      });
    },
    onSuccess: async (_data, service) => {
      await refetch();
      toast({ title: "Read policy saved", description: `${SERVICE_META[service].title} remains read-only.` });
    },
    onError: (error: any) => toast({ title: "Policy save failed", description: error?.message || "Try again.", variant: "destructive" }),
  });

  const connectMutation = useMutation({
    mutationFn: async (service: Service) =>
      apiRequest(`/api/admin/company-brain/workspace/connect/${service}`, "POST", {
        returnTo: "/admin/settings/integrations/google-workspace",
      }),
    onSuccess: (data: { authorizationUrl: string }) => {
      window.location.assign(data.authorizationUrl);
    },
    onError: (error: any) => toast({ title: "Google connection unavailable", description: error?.message || "Check setup.", variant: "destructive" }),
  });

  const updateDraft = (service: Service, field: keyof PolicyDraft, value: string) => {
    setDrafts((current) => ({ ...current, [service]: { ...current[service], [field]: value } }));
  };

  const flags = statusQuery.data?.flags || {};
  const oauth = statusQuery.data?.oauth;
  const governance = statusQuery.data?.governance;
  const baseFeaturesEnabled = Boolean(flags.companyBrain?.enabled && flags.workspaceConnectors?.enabled);

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <div className="mx-auto max-w-[1480px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#b76f00]">
              <LockKeyhole className="h-4 w-4" />
              Company Brain
            </div>
            <h1 className="text-3xl font-black tracking-normal text-slate-950">Google Workspace evidence</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Connect the exact Exportunity Google identity to read approved business evidence. Each service is authorized separately and every sync is started visibly by an administrator.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={statusQuery.isFetching} className="border-slate-300 bg-white text-slate-800">
            <RefreshCw className={`mr-2 h-4 w-4 ${statusQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh status
          </Button>
        </header>

        {statusQuery.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Workspace status could not be loaded. Check administrator authentication and the Company Brain schema.
          </div>
        ) : null}

        {oauth && (!oauth.configured || !baseFeaturesEnabled) ? (
          <section className="rounded-md border border-amber-300 bg-amber-50 p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="min-w-0">
                  <h2 className="font-black text-amber-950">Setup required before account authorization</h2>
                  <p className="mt-1 text-sm leading-6 text-amber-900">
                    {!oauth.configured ? `Missing OAuth configuration: ${oauth.missing.join(", ") || "unknown"}. ` : ""}
                    {!baseFeaturesEnabled ? "Company Brain and Workspace connector flags are currently off. " : ""}
                    No background sync or external communication will start when these settings are enabled.
                  </p>
                  {oauth.redirectUri ? (
                    <code className="mt-3 block break-all rounded border border-amber-200 bg-white px-3 py-2 text-xs text-amber-950">
                      Redirect URI: {oauth.redirectUri}
                    </code>
                  ) : null}
                  <ol className="mt-4 grid gap-2 text-sm leading-6 text-amber-950 sm:grid-cols-2">
                    <li>
                      <strong>1.</strong> Sign in to Google Cloud with the Exportunity company administrator: {" "}
                      <strong>{EXPORTUNITY_COMPANY_IDENTITY.adminEmail}</strong>.
                    </li>
                    <li><strong>2.</strong> Create an OAuth client for a Web application.</li>
                    <li><strong>3.</strong> Register the redirect URI above exactly, then store the client ID and secret on the server.</li>
                    <li><strong>4.</strong> Return here and authorize Drive first with a small approved source set.</li>
                  </ol>
                  <p className="mt-3 text-xs font-bold text-amber-900">
                    Enter the Google password yourself. Never paste a password or OAuth client secret into chat.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                <Button asChild className="bg-[#07111f] text-white hover:bg-[#0a1628]">
                  <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
                    Open Google Cloud
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button asChild variant="outline" className="border-amber-400 bg-white text-amber-950 hover:bg-amber-100">
                  <a href="https://developers.google.com/identity/protocols/oauth2/web-server" target="_blank" rel="noreferrer">
                    OAuth setup guide
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <main className="space-y-5">
            {connectors.map((connector) => {
              const meta = SERVICE_META[connector.service];
              const Icon = meta.icon;
              const draft = drafts[connector.service];
              const serviceEnabled = Boolean(flags[meta.feature]?.enabled);
              const canConnect = Boolean(oauth?.configured && baseFeaturesEnabled && serviceEnabled);
              const busy = actionMutation.isPending || policyMutation.isPending || connectMutation.isPending;

              return (
                <Card key={connector.service} className="overflow-hidden rounded-md border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.07)]">
                  <CardHeader className="border-b border-slate-100 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#07111f] text-[#f5a623]">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg font-black tracking-normal text-slate-950">{meta.title}</CardTitle>
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">Read only</Badge>
                            {connector.connected ? (
                            <Badge className={connector.status === "paused" ? "bg-amber-100 text-amber-800" : connector.lastError ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}>
                                {connector.status}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{meta.description}</p>
                        </div>
                      </div>
                      {!connector.connected ? (
                        <Button
                          onClick={() => connectMutation.mutate(connector.service)}
                          disabled={!canConnect || busy}
                          className="bg-[#f5a623] font-black text-[#07111f] hover:bg-[#e59516]"
                        >
                          Connect {meta.title}
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-5 p-5">
                    {connector.connected ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs font-bold uppercase text-slate-500">Verified account</div>
                            <div className="mt-1 break-all text-sm font-black text-slate-950">{connector.verifiedEmail}</div>
                            <div className="mt-1 text-xs text-slate-500">{connector.accountType}{connector.hostedDomain ? ` · ${connector.hostedDomain}` : ""}</div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs font-bold uppercase text-slate-500">Google account ID</div>
                            <div className="mt-1 break-all font-mono text-xs text-slate-800">{connector.googleAccountId}</div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs font-bold uppercase text-slate-500">Connected</div>
                            <div className="mt-1 text-sm font-semibold text-slate-800">{formatDate(connector.connectedAt)}</div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs font-bold uppercase text-slate-500">Last successful sync</div>
                            <div className="mt-1 text-sm font-semibold text-slate-800">{formatDate(connector.lastSuccessfulSyncAt)}</div>
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs font-black uppercase text-slate-600">Exact granted scopes</Label>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(connector.grantedScopes || []).map((scope) => (
                              <code key={scope} className="break-all rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700">{scope}</code>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-md border border-slate-200 bg-white p-3">
                            <div className="text-xs font-bold uppercase text-slate-500">Indexed sources</div>
                            <div className="mt-1 text-xl font-black text-slate-950">{connector.sourceCounts?.active || 0}</div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-white p-3">
                            <div className="text-xs font-bold uppercase text-slate-500">Quarantined / review</div>
                            <div className="mt-1 text-xl font-black text-slate-950">{(connector.sourceCounts?.quarantine || 0) + (connector.sourceCounts?.review || 0)}</div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-white p-3">
                            <div className="text-xs font-bold uppercase text-slate-500">Open sync errors</div>
                            <div className={`mt-1 text-xl font-black ${connector.openDeadLetters ? "text-red-700" : "text-emerald-700"}`}>{connector.openDeadLetters || 0}</div>
                          </div>
                        </div>

                        {(connector.syncState || []).some((state) => state.inProgress || state.pendingBackfill) ? (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            A resumable synchronization is in progress. Use <strong>Sync now</strong> to continue the visible backfill or retry the blocked provider page.
                          </div>
                        ) : null}

                        {connector.service === "drive" ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <Label htmlFor="drive-folders">Allowlisted folder IDs</Label>
                              <Textarea id="drive-folders" value={draft.allowlistedFolderIds} onChange={(event) => updateDraft("drive", "allowlistedFolderIds", event.target.value)} className="mt-2 min-h-28 border-slate-300 bg-white text-slate-950" placeholder="One Google Drive folder ID per line" />
                            </div>
                            <div>
                              <Label htmlFor="drive-files">Allowlisted file IDs</Label>
                              <Textarea id="drive-files" value={draft.allowlistedFileIds} onChange={(event) => updateDraft("drive", "allowlistedFileIds", event.target.value)} className="mt-2 min-h-28 border-slate-300 bg-white text-slate-950" placeholder="One Google Drive file ID per line" />
                            </div>
                          </div>
                        ) : null}

                        {connector.service === "gmail" ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <Label htmlFor="gmail-keywords">Business keywords</Label>
                              <Textarea id="gmail-keywords" value={draft.includeKeywords} onChange={(event) => updateDraft("gmail", "includeKeywords", event.target.value)} className="mt-2 min-h-28 border-slate-300 bg-white text-slate-950" placeholder="supplier, RFQ, contract, shipment" />
                            </div>
                            <div>
                              <Label htmlFor="gmail-domains">Included business domains</Label>
                              <Textarea id="gmail-domains" value={draft.includeDomains} onChange={(event) => updateDraft("gmail", "includeDomains", event.target.value)} className="mt-2 min-h-28 border-slate-300 bg-white text-slate-950" placeholder="company.com" />
                            </div>
                            <div>
                              <Label htmlFor="gmail-exclude">Exclude keywords or private topics</Label>
                              <Textarea id="gmail-exclude" value={draft.excludeKeywords} onChange={(event) => updateDraft("gmail", "excludeKeywords", event.target.value)} className="mt-2 min-h-24 border-slate-300 bg-white text-slate-950" />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <Label htmlFor="gmail-days">History window (days)</Label>
                                <Input id="gmail-days" type="number" min={1} max={3650} value={draft.dateDays} onChange={(event) => updateDraft("gmail", "dateDays", event.target.value)} className="mt-2 border-slate-300 bg-white text-slate-950" />
                              </div>
                              <div>
                                <Label htmlFor="gmail-labels">Optional label IDs</Label>
                                <Input id="gmail-labels" value={draft.labelIds} onChange={(event) => updateDraft("gmail", "labelIds", event.target.value)} className="mt-2 border-slate-300 bg-white text-slate-950" />
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {connector.service === "contacts" ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <Label htmlFor="contacts-domains">Priority business domains</Label>
                              <Textarea id="contacts-domains" value={draft.includeDomains} onChange={(event) => updateDraft("contacts", "includeDomains", event.target.value)} className="mt-2 min-h-24 border-slate-300 bg-white text-slate-950" placeholder="supplier.com" />
                            </div>
                            <div>
                              <Label htmlFor="contacts-exclude">Never import domains</Label>
                              <Textarea id="contacts-exclude" value={draft.excludeDomains} onChange={(event) => updateDraft("contacts", "excludeDomains", event.target.value)} className="mt-2 min-h-24 border-slate-300 bg-white text-slate-950" placeholder="personal.example" />
                            </div>
                          </div>
                        ) : null}

                        <div>
                          <Label htmlFor={`${connector.service}-never`}>Never index terms</Label>
                          <Input id={`${connector.service}-never`} value={draft.neverIndex} onChange={(event) => updateDraft(connector.service, "neverIndex", event.target.value)} className="mt-2 border-slate-300 bg-white text-slate-950" placeholder="Private project or exact term, separated by commas" />
                        </div>

                        {connector.lastError ? (
                          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{connector.lastError}</div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                          <Button onClick={() => policyMutation.mutate(connector.service)} disabled={busy} className="bg-[#07111f] text-white hover:bg-[#0a1628]">
                            <Save className="mr-2 h-4 w-4" />Save read policy
                          </Button>
                          <Button variant="outline" onClick={() => actionMutation.mutate({ service: connector.service, action: "sync" })} disabled={busy || connector.status === "paused"} className="border-slate-300 bg-white text-slate-800">
                            <RefreshCw className="mr-2 h-4 w-4" />Sync now
                          </Button>
                          <Button variant="outline" onClick={() => actionMutation.mutate({ service: connector.service, action: "health" })} disabled={busy} className="border-slate-300 bg-white text-slate-800">
                            <HeartPulse className="mr-2 h-4 w-4" />Check health
                          </Button>
                          <Button variant="outline" onClick={() => actionMutation.mutate({ service: connector.service, action: connector.status === "paused" ? "resume" : "pause" })} disabled={busy} className="border-slate-300 bg-white text-slate-800">
                            {connector.status === "paused" ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
                            {connector.status === "paused" ? "Resume" : "Pause"}
                          </Button>
                          <Button variant="outline" onClick={() => window.confirm(`Revoke ${meta.title} and erase stored tokens?`) && actionMutation.mutate({ service: connector.service, action: "revoke" })} disabled={busy} className="ml-auto border-red-200 bg-white text-red-700 hover:bg-red-50">
                            <Unplug className="mr-2 h-4 w-4" />Revoke
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
                        <div className="flex items-center gap-3">
                          <StatusDot ok={canConnect} />
                          <div>
                            <div className="text-sm font-black text-slate-900">{canConnect ? "Ready for read-only authorization" : "Connection unavailable until setup is complete"}</div>
                            <div className="mt-1 text-xs text-slate-500">Required flag: {flags[meta.feature]?.envName || meta.feature}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </main>

          <aside className="space-y-5">
            <Card className="rounded-md border-slate-200 bg-white shadow-sm">
              <CardHeader><CardTitle className="text-base font-black tracking-normal">Governance boundary</CardTitle></CardHeader>
              <CardContent>
                <GovernanceRow icon={ShieldCheck} label="Read-only connectors" enabled={Boolean(governance?.readOnly)} />
                <GovernanceRow icon={RefreshCw} label="Manual sync only" enabled={Boolean(governance?.manualSyncOnly)} />
                <GovernanceRow icon={Mail} label="Email sending" enabled={Boolean(governance?.emailSendingEnabled)} />
                <GovernanceRow icon={ContactRound} label="Write contacts to Google" enabled={Boolean(governance?.contactWritesToGoogleEnabled)} />
                <GovernanceRow icon={FileText} label="Write files to Drive" enabled={Boolean(governance?.driveWritesEnabled)} />
                <p className="mt-4 text-xs leading-5 text-slate-500">External communications remain disabled. This page cannot send, reply, label, delete, or modify Google content.</p>
              </CardContent>
            </Card>

            <Card className="rounded-md border-slate-200 bg-white shadow-sm">
              <CardHeader><CardTitle className="text-base font-black tracking-normal">Recent visible syncs</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(statusQuery.data?.runs || []).slice(0, 8).map((run) => (
                  <div key={run.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-black capitalize text-slate-900">{run.service}</div>
                      <Badge className={run.status === "completed" ? "bg-emerald-100 text-emerald-800" : run.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}>{String(run.status || "unknown").replaceAll("_", " ")}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{run.sync_mode} · {formatDate(run.started_at || run.created_at)}</div>
                    {run.counters ? <div className="mt-2 text-xs text-slate-700">Scanned {run.counters.scanned || 0} · Indexed {run.counters.indexed || 0} · Review {run.counters.reviewRequired || 0} · Deleted {run.counters.deleted || 0} · Failed {run.counters.errors || 0}</div> : null}
                  </div>
                ))}
                {!statusQuery.data?.runs?.length ? <p className="text-sm text-slate-500">No sync has been started.</p> : null}
              </CardContent>
            </Card>

            {(statusQuery.data?.deadLetters || []).length ? (
              <Card className="rounded-md border-red-200 bg-white shadow-sm">
                <CardHeader><CardTitle className="text-base font-black tracking-normal text-red-900">Items needing attention</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {statusQuery.data!.deadLetters.slice(0, 6).map((item) => (
                    <div key={item.id} className="rounded-md bg-red-50 p-3 text-xs text-red-900">
                      <div className="font-black capitalize">{item.service} · {item.stage}</div>
                      <div className="mt-1 leading-5">{item.error_message}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
