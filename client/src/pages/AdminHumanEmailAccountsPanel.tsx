import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

type DomainRow = {
  id: number;
  tenantId: number;
  domain: string;
  type: string;
  isVerified: boolean;
};

type DomainsResponse = { ok: boolean; items: DomainRow[] };

type EmailStatusResponse = {
  ok: boolean;
  mail: {
    domain: string;
    authDiagnostics?: {
      checkedAtIso?: string;
      trustedForOutbound: boolean;
      warnings: string[];
      spf: { ok: boolean; records: string[] };
      dkim: { ok: boolean; selector: string | null; records: string[] };
      dmarc: { ok: boolean; policy: string | null; records: string[] };
    };
    inboundDns?: {
      expectedMxHost: string;
      expectedMailHost: string;
      expectedIpv4: string | null;
      readyForInbound: boolean;
      warnings: string[];
      mx: { ok: boolean; records: Array<{ exchange: string; priority: number }> };
      mailHostA: { ok: boolean; records: string[] };
    };
  };
};

type AgoojiyeMailDnsStatusResponse = {
  ok: boolean;
  checkedAt: string;
  expected: {
    domain: string;
    mailHost: string;
    ipv4: string;
    mxHost: string;
    mxPriority: number;
    spf: string;
    dmarc: string;
    dkimHost: string;
    dkimSelector: string;
  };
  records: {
    mx: Array<{ exchange: string; priority: number }>;
    mailA: string[];
    spf: string[];
    dmarc: string[];
    dkim: { host: string; selector: string; present: boolean; recordCount: number };
  };
  checks: {
    mailAOk: boolean;
    mxOk: boolean;
    legacyOvhMxPresent: boolean;
    spfOk: boolean;
    legacyOvhSpfPresent: boolean;
    dmarcOk: boolean;
    dkimOk: boolean;
    cutoverReady: boolean;
  };
  warnings: string[];
};

type AccountRow = {
  id: number;
  tenantId: number;
  companyId: number | null;
  ownerUserId: number | null;
  address: string;
  localPart: string;
  domainId: number;
  status: string;
  quotaMb: number | null;
  createdAt: string;
  updatedAt: string;
};

type AccountsResponse = {
  ok: boolean;
  items: Array<{
    account: AccountRow;
    domain: { id: number; domain: string };
    owner: { id: number; displayName: string; email: string } | null;
  }>;
  pagination?: { total: number; limit: number; offset: number };
};

type AliasRow = {
  id: number;
  tenantId: number;
  sourceAccountId: number | null;
  sourceAddress: string;
  destination: string;
  createdAt: string;
};

type AliasGroup = {
  sourceAddress: string;
  destinations: string[];
  count: number;
  latestCreatedAt: string | null;
};

type AliasesResponse = {
  ok: boolean;
  items: AliasRow[];
  groups: AliasGroup[];
  pagination?: { total: number; limit: number };
};

type TenantUser = { id: number; displayName: string; email: string };
type TenantUsersResponse = { ok: boolean; items: TenantUser[] };

function generateLocalPartFromUser(user: TenantUser) {
  const name = String(user.displayName || user.email || "").trim().toLowerCase();
  const base = name
    .replace(/[^a-z0-9\\s._-]/g, "")
    .replace(/\\s+/g, ".")
    .replace(/\\.{2,}/g, ".")
    .replace(/^\\.+|\\.+$/g, "");
  return base || String(user.email || "").split("@")[0] || "";
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function dnsBadgeClass(ok: boolean | null | undefined, warnWhenMissing = false) {
  if (ok) return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
  if (warnWhenMissing) return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
  return "bg-red-500/15 text-red-300 border border-red-500/30";
}

const AGOOJIYE_DNS_WARNING_LABELS: Record<string, string> = {
  mail_a_missing_or_mismatch: "Créer ou corriger mail A vers 51.254.143.30.",
  mx_not_cut_over: "Remplacer les MX racine par mail.agoojiye.com priorité 10.",
  legacy_ovh_mx_present: "Supprimer les MX OVH encore présents.",
  spf_missing_or_mismatch: "Remplacer le SPF par la valeur AGOOJIYE attendue.",
  legacy_ovh_spf_present: "Supprimer le SPF OVH include:mx.ovh.com.",
  dmarc_missing_or_mismatch: "Publier le DMARC AGOOJIYE.",
  dkim_missing: "Publier la clé DKIM mail._domainkey.",
};

function formatDnsWarning(code: string) {
  return AGOOJIYE_DNS_WARNING_LABELS[code] || code;
}

const AGOOJIYE_DKIM_VALUE =
  "v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2sc5bNVbO7Z6xXGrtXXA2FP65BU7GgVc7oliHOI5N/HTP1RE2HOSCS71FRVB6ceTRMD/KnbPP4Y0pSdR9GUCMkCPH0COJf6HegEj9QAny+kczV/Xgy1XYi2AZiVZ6R7qZflKTIHvPwL1/KeQ8FoZp3ykfXkGkav0kyx4zovc5mau5NjLKG9RpsFzVa9FTKrXbb1uBEQwHFKv4HMVwaWjCn+GJrxuIL1O4UfqaMkcHdso1lLPjy/i8Rg6mN4D1dmRT3p1UB3GUTiFuZGJVMz7CN1GXymDRbd4hqcoIjzqAbx5/rMZU7nO3U1Ev2rR8C68V1OmpIs3LtYlBXUTJohfgwIDAQAB";
const AGOOJIYE_WEBMAIL_URL = "https://mail.exportunity.net/";
const AGOOJIYE_PASSWORD_CHANGE_URL = "https://agoojiye.com/mail/password";
const AGOOJIYE_IMAP_HOST = "mail.exportunity.net";
const AGOOJIYE_SMTP_HOST = "mail.exportunity.net";

function buildMailboxAccessInstructions() {
  return [
    "Accès email AGOOJIYE",
    "",
    `Webmail Roundcube : ${AGOOJIYE_WEBMAIL_URL}`,
    `Changement de mot de passe : ${AGOOJIYE_PASSWORD_CHANGE_URL}`,
    "",
    "Paramètres client mail :",
    `IMAP : ${AGOOJIYE_IMAP_HOST}, port 993, TLS`,
    `SMTP : ${AGOOJIYE_SMTP_HOST}, port 587, STARTTLS`,
  ].join("\n");
}

function buildMailboxHandoffNote(input: { address: string; password: string }) {
  return [
    "Bonjour,",
    "",
    "Votre boîte email AGOOJIYE est prête.",
    "",
    `Adresse : ${input.address}`,
    `Mot de passe initial : ${input.password}`,
    "",
    `1. Connectez-vous au webmail Roundcube : ${AGOOJIYE_WEBMAIL_URL}`,
    `2. Changez ce mot de passe ici : ${AGOOJIYE_PASSWORD_CHANGE_URL}`,
    "3. Utilisez ensuite votre nouveau mot de passe pour le webmail et vos applications mail.",
    "",
    "Paramètres client mail :",
    `IMAP : ${AGOOJIYE_IMAP_HOST}, port 993, TLS`,
    `SMTP : ${AGOOJIYE_SMTP_HOST}, port 587, STARTTLS`,
    "",
    "Ne partagez pas ce mot de passe en dehors de la remise initiale.",
  ].join("\n");
}

export function AdminHumanEmailAccountsPanel() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "disabled" | "provision_failed">("all");
  const [offset, setOffset] = useState(0);

  const [domainId, setDomainId] = useState<number | null>(null);
  const [localPart, setLocalPart] = useState("");
  const [password, setPassword] = useState("");
  const [quota, setQuota] = useState("2G");
  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerUser, setOwnerUser] = useState<TenantUser | null>(null);

  const [lastTempPassword, setLastTempPassword] = useState<{ address: string; password: string } | null>(null);

  const statusQuery = useQuery<EmailStatusResponse>({
    queryKey: ["/api/admin/email/status"],
    retry: false,
    staleTime: 30_000,
  });

  const agoojyeDnsQuery = useQuery<AgoojiyeMailDnsStatusResponse>({
    queryKey: ["/api/admin/agoojye/email-dns-status"],
    retry: false,
    staleTime: 15_000,
  });

  const domainsQuery = useQuery<DomainsResponse>({
    queryKey: ["/api/admin/email/domains"],
    retry: false,
  });

  const domains = domainsQuery.data?.items ?? [];

  useEffect(() => {
    if (domainId) return;
    const first = domains[0]?.id ?? null;
    if (first) setDomainId(first);
  }, [domains, domainId]);

  const accountsQueryKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "50");
    params.set("offset", String(offset));
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    return `/api/admin/email/accounts?${params.toString()}`;
  }, [offset, q, status]);

  const accountsQuery = useQuery<AccountsResponse>({
    queryKey: [accountsQueryKey],
    retry: false,
    staleTime: 5_000,
  });

  const aliasesQueryKey = "/api/admin/email/aliases?limit=500";
  const aliasesQuery = useQuery<AliasesResponse>({
    queryKey: [aliasesQueryKey],
    retry: false,
    staleTime: 10_000,
  });

  // Debounced tenant user search.
  const [debouncedOwnerQuery, setDebouncedOwnerQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedOwnerQuery(ownerQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [ownerQuery]);

  const tenantUsersQuery = useQuery<TenantUsersResponse>({
    queryKey: [debouncedOwnerQuery ? `/api/admin/email/users?q=${encodeURIComponent(debouncedOwnerQuery)}` : "__no_user_q__"],
    enabled: !!debouncedOwnerQuery,
    retry: false,
  });

  const createAccountMutation = useMutation({
    mutationFn: async () => {
      if (!domainId) throw new Error("Sélectionner un domaine");
      if (!localPart.trim()) throw new Error("Le préfixe email est requis");
      return apiRequest("/api/admin/email/accounts", "POST", {
        domainId,
        localPart: localPart.trim(),
        ownerUserId: ownerUser?.id ?? null,
        password: password.trim() || undefined,
        quota: quota.trim() || undefined,
      });
    },
    onSuccess: async (res: any) => {
      const address = String(res?.account?.address || "");
      const tempPassword = typeof res?.tempPassword === "string" ? res.tempPassword.trim() : "";
      if (address && tempPassword) setLastTempPassword({ address, password: tempPassword });
      toast({ title: "Boîte email créée", description: address || "Créée" });
      setLocalPart("");
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/email/domains"] });
      await queryClient.invalidateQueries({ queryKey: [accountsQueryKey] });
    },
    onError: (err: any) => {
      toast({ title: "Création impossible", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/admin/email/accounts/${id}/reset-password`, "POST", {}),
    onSuccess: async (res: any) => {
      const address = String(res?.account?.address || "");
      const password = String(res?.tempPassword || "");
      if (address && password) setLastTempPassword({ address, password });
      toast({ title: "Mot de passe réinitialisé", description: address || "Terminé" });
      await queryClient.invalidateQueries({ queryKey: [accountsQueryKey] });
    },
    onError: (err: any) => {
      toast({ title: "Réinitialisation impossible", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async (input: { id: number; status: "active" | "disabled" }) =>
      apiRequest(`/api/admin/email/accounts/${input.id}`, "PATCH", { status: input.status }),
    onSuccess: async (res: any) => {
      const address = String(res?.account?.address || "");
      const password = String(res?.tempPassword || "");
      if (address && password) setLastTempPassword({ address, password });
      toast({ title: "Mis à jour", description: address || "Terminé" });
      await queryClient.invalidateQueries({ queryKey: [accountsQueryKey] });
    },
    onError: (err: any) => {
      toast({ title: "Mise à jour impossible", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const [aliasSource, setAliasSource] = useState("");
  const [aliasDestination, setAliasDestination] = useState("");
  const createAliasMutation = useMutation({
    mutationFn: async () => {
      if (!aliasSource.trim() || !aliasSource.includes("@")) throw new Error("Email source requis");
      if (!aliasDestination.trim() || !aliasDestination.includes("@")) throw new Error("Email destination requis");
      return apiRequest("/api/admin/email/aliases", "POST", {
        sourceAddress: aliasSource.trim(),
        destination: aliasDestination.trim(),
      });
    },
    onSuccess: async () => {
      toast({ title: "Alias créé", description: `${aliasSource.trim()} -> ${aliasDestination.trim()}` });
      setAliasSource("");
      setAliasDestination("");
      await queryClient.invalidateQueries({ queryKey: [aliasesQueryKey] });
    },
    onError: (err: any) => {
      toast({ title: "Alias impossible", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const accounts = accountsQuery.data?.items ?? [];
  const aliasGroups = aliasesQuery.data?.groups ?? [];
  const total = accountsQuery.data?.pagination?.total ?? accounts.length;
  const canPrev = offset > 0;
  const canNext = offset + 50 < total;
  const liveDns = agoojyeDnsQuery.data;
  const mailDomain = liveDns?.expected.domain || statusQuery.data?.mail?.domain || "agoojiye.com";
  const inboundDns = statusQuery.data?.mail?.inboundDns;
  const expectedMailHost = liveDns?.expected.mailHost || inboundDns?.expectedMailHost || `mail.${mailDomain}`;
  const expectedIpv4 = liveDns?.expected.ipv4 || inboundDns?.expectedIpv4 || "51.254.143.30";
  const expectedSpf = liveDns?.expected.spf || `v=spf1 mx ip4:${expectedIpv4} -all`;
  const expectedDmarc =
    liveDns?.expected.dmarc || "v=DMARC1; p=none; rua=mailto:dmarc@agoojiye.com; adkim=s; aspf=s";
  const expectedDkimHost = liveDns?.expected.dkimHost || "mail._domainkey.agoojiye.com";
  const dnsRemoveRecords = [
    "@  MX   1    mx1.mail.ovh.net.",
    "@  MX   5    mx2.mail.ovh.net.",
    "@  MX   100  mx3.mail.ovh.net.",
    "@  TXT       v=spf1 include:mx.ovh.com -all",
  ];
  const dnsAddRecords = [
    `mail  A    ${expectedIpv4}`,
    `@     MX   10 ${expectedMailHost}.`,
    `@     TXT  ${expectedSpf}`,
    `_dmarc TXT  ${expectedDmarc}`,
    `${expectedDkimHost.replace(`.${mailDomain}`, "")} TXT  ${AGOOJIYE_DKIM_VALUE}`,
  ];
  const dnsCutoverPlan = [
    "AGOOJIYE - DNS OVH pour activer la reception email",
    "",
    "Supprimer :",
    ...dnsRemoveRecords,
    "",
    "Ajouter / remplacer :",
    ...dnsAddRecords,
  ].join("\n");
  const mailboxAccessInstructions = buildMailboxAccessInstructions();

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-white">Authentification du domaine</CardTitle>
          <Button
            size="sm"
            variant="secondary"
            className="gap-2"
            onClick={() => void agoojyeDnsQuery.refetch()}
            disabled={agoojyeDnsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${agoojyeDnsQuery.isFetching ? "animate-spin" : ""}`} />
            Actualiser DNS
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {statusQuery.isError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-200">
              Impossible de lire le statut email.
            </div>
          ) : null}

          {agoojyeDnsQuery.isError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-200">
              Impossible de lire le statut DNS AGOOJIYE.
            </div>
          ) : null}

          <div className="text-xs text-slate-400">
            Domaine : <span className="text-slate-200">{statusQuery.data?.mail?.domain || "chargement..."}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.inboundDns?.mx?.ok)}>
              MX : {statusQuery.data?.mail?.inboundDns?.mx?.ok ? "basculé" : "non basculé"}
            </Badge>
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.inboundDns?.mailHostA?.ok)}>
              A mail : {statusQuery.data?.mail?.inboundDns?.mailHostA?.ok ? "prêt" : "manquant"}
            </Badge>
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.authDiagnostics?.spf?.ok)}>
              SPF : {statusQuery.data?.mail?.authDiagnostics?.spf?.ok ? "valide" : "échec"}
            </Badge>
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.authDiagnostics?.dkim?.ok)}>
              DKIM : {statusQuery.data?.mail?.authDiagnostics?.dkim?.ok ? "valide" : "échec"}
            </Badge>
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.authDiagnostics?.dmarc?.ok, true)}>
              DMARC : {statusQuery.data?.mail?.authDiagnostics?.dmarc?.ok ? "présent" : "manquant"}
            </Badge>
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.inboundDns?.readyForInbound)}>
              Réception : {statusQuery.data?.mail?.inboundDns?.readyForInbound ? "prête" : "DNS en attente"}
            </Badge>
          </div>

          {liveDns ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-xs">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-medium text-slate-200">Statut DNS mail AGOOJIYE en direct</div>
                  <div className="mt-1 text-slate-400">
                    Dernier contrôle : <span className="text-slate-200">{new Date(liveDns.checkedAt).toLocaleString()}</span>
                  </div>
                </div>
                <Badge className={dnsBadgeClass(liveDns.checks.cutoverReady)}>
                  Bascule mail : {liveDns.checks.cutoverReady ? "prête" : "en attente"}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className={dnsBadgeClass(liveDns.checks.mailAOk)}>A mail : {liveDns.checks.mailAOk ? "ok" : "manquant"}</Badge>
                <Badge className={dnsBadgeClass(liveDns.checks.mxOk)}>MX : {liveDns.checks.mxOk ? "ok" : "à basculer"}</Badge>
                <Badge className={dnsBadgeClass(!liveDns.checks.legacyOvhMxPresent)}>
                  MX OVH : {liveDns.checks.legacyOvhMxPresent ? "encore présents" : "retirés"}
                </Badge>
                <Badge className={dnsBadgeClass(liveDns.checks.spfOk)}>SPF : {liveDns.checks.spfOk ? "ok" : "à corriger"}</Badge>
                <Badge className={dnsBadgeClass(!liveDns.checks.legacyOvhSpfPresent)}>
                  SPF OVH : {liveDns.checks.legacyOvhSpfPresent ? "encore présent" : "retiré"}
                </Badge>
                <Badge className={dnsBadgeClass(liveDns.checks.dkimOk)}>DKIM : {liveDns.checks.dkimOk ? "ok" : "manquant"}</Badge>
                <Badge className={dnsBadgeClass(liveDns.checks.dmarcOk)}>DMARC : {liveDns.checks.dmarcOk ? "ok" : "manquant"}</Badge>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="font-medium text-slate-200">Observé maintenant</div>
                  <div className="mt-2 space-y-1 text-slate-400">
                    <div>
                      MX :{" "}
                      <span className="font-mono text-slate-200">
                        {liveDns.records.mx.length
                          ? liveDns.records.mx.map((record) => `${record.priority} ${record.exchange}`).join(", ")
                          : "aucun"}
                      </span>
                    </div>
                    <div>
                      A mail :{" "}
                      <span className="font-mono text-slate-200">
                        {liveDns.records.mailA.length ? liveDns.records.mailA.join(", ") : "aucun"}
                      </span>
                    </div>
                    <div>
                      SPF : <span className="font-mono text-slate-200">{liveDns.records.spf.length ? liveDns.records.spf.join(", ") : "aucun"}</span>
                    </div>
                    <div>
                      DKIM :{" "}
                      <span className="font-mono text-slate-200">
                        {liveDns.records.dkim.present ? `${liveDns.records.dkim.recordCount} enregistrement publié` : "aucun"}
                      </span>
                    </div>
                    <div>
                      DMARC :{" "}
                      <span className="font-mono text-slate-200">
                        {liveDns.records.dmarc.length ? liveDns.records.dmarc.join(", ") : "aucun"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="font-medium text-slate-200">Corrections restantes</div>
                  <div className="mt-2 space-y-1 text-slate-400">
                    {liveDns.warnings.length ? (
                      liveDns.warnings.map((warning) => (
                        <div key={warning} className="text-amber-100">
                          {formatDnsWarning(warning)}
                        </div>
                      ))
                    ) : (
                      <div className="text-emerald-300">Aucune correction restante.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {statusQuery.data?.mail?.inboundDns ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                <div className="font-medium text-slate-200">DNS attendu</div>
                <div className="mt-2 space-y-1 text-slate-400">
                  <div>
                    MX: <span className="font-mono text-slate-200">10 {statusQuery.data.mail.inboundDns.expectedMxHost}.</span>
                  </div>
                  <div>
                    A:{" "}
                    <span className="font-mono text-slate-200">
                      {statusQuery.data.mail.inboundDns.expectedMailHost} {statusQuery.data.mail.inboundDns.expectedIpv4 || "IP configurée"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                <div className="font-medium text-slate-200">DNS observé</div>
                <div className="mt-2 space-y-1 text-slate-400">
                  <div>
                    MX:{" "}
                    <span className="font-mono text-slate-200">
                      {statusQuery.data.mail.inboundDns.mx.records.length
                        ? statusQuery.data.mail.inboundDns.mx.records.map((record) => `${record.priority} ${record.exchange}`).join(", ")
                        : "aucun"}
                    </span>
                  </div>
                  <div>
                    A:{" "}
                    <span className="font-mono text-slate-200">
                      {statusQuery.data.mail.inboundDns.mailHostA.records.length
                        ? statusQuery.data.mail.inboundDns.mailHostA.records.join(", ")
                        : "aucun"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="font-medium text-amber-100">Plan OVH pour activer la réception email</div>
                <div className="mt-1 text-amber-100/80">
                  Les boîtes AGOOJIYE peuvent se connecter, mais les messages externes arrivent encore chez OVH tant que
                  ces enregistrements ne sont pas publiés.
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const ok = await copyToClipboard(dnsCutoverPlan);
                  toast({
                    title: ok ? "Plan DNS copié" : "Copie impossible",
                    description: ok ? "Les enregistrements OVH sont dans le presse-papiers." : "Presse-papiers indisponible.",
                  });
                }}
              >
                Copier le plan DNS
              </Button>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <div className="font-medium text-amber-100">Supprimer</div>
                <pre className="mt-2 overflow-x-auto rounded border border-amber-500/20 bg-slate-950/60 p-2 font-mono text-[11px] leading-relaxed text-amber-50">
                  {dnsRemoveRecords.join("\n")}
                </pre>
              </div>
              <div>
                <div className="font-medium text-amber-100">Ajouter / remplacer</div>
                <pre className="mt-2 max-h-40 overflow-auto rounded border border-amber-500/20 bg-slate-950/60 p-2 font-mono text-[11px] leading-relaxed text-amber-50">
                  {dnsAddRecords.join("\n")}
                </pre>
              </div>
            </div>
          </div>

          {((statusQuery.data?.mail?.inboundDns?.warnings?.length ?? 0) > 0 ||
            (statusQuery.data?.mail?.authDiagnostics?.warnings?.length ?? 0) > 0) ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
              {[...(statusQuery.data?.mail?.inboundDns?.warnings ?? []), ...(statusQuery.data?.mail?.authDiagnostics?.warnings ?? [])].join(", ")}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Boîtes email humaines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-slate-400">
            Tenant : <span className="text-slate-200">{tenant.name}</span> - provisioning sur docker-mailserver (Roundcube).
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-xs">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1 text-slate-400">
                <div className="font-medium text-slate-200">Accès à remettre aux membres</div>
                <div>
                  Webmail : <span className="font-mono text-slate-100">{AGOOJIYE_WEBMAIL_URL}</span>
                </div>
                <div>
                  Changement de mot de passe : <span className="font-mono text-slate-100">{AGOOJIYE_PASSWORD_CHANGE_URL}</span>
                </div>
                <div>
                  IMAP : <span className="font-mono text-slate-100">{AGOOJIYE_IMAP_HOST}:993 TLS</span> - SMTP :{" "}
                  <span className="font-mono text-slate-100">{AGOOJIYE_SMTP_HOST}:587 STARTTLS</span>
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const ok = await copyToClipboard(mailboxAccessInstructions);
                  toast({
                    title: ok ? "Accès email copiés" : "Copie impossible",
                    description: ok ? "Les informations Roundcube et client mail sont dans le presse-papiers." : "Presse-papiers indisponible.",
                  });
                }}
              >
                Copier les accès
              </Button>
            </div>
          </div>

          {lastTempPassword ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-amber-200 font-medium">Mot de passe temporaire (à copier maintenant)</div>
                  <div className="text-xs text-slate-300 mt-1 font-mono break-all">{lastTempPassword.address}</div>
                  <div className="text-xs text-slate-100 mt-2 font-mono break-all">{lastTempPassword.password}</div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const ok = await copyToClipboard(lastTempPassword.password);
                      toast({ title: ok ? "Copié" : "Copie impossible", description: ok ? "Mot de passe copié." : "Presse-papiers indisponible." });
                    }}
                  >
                    Copier
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const ok = await copyToClipboard(buildMailboxHandoffNote(lastTempPassword));
                      toast({
                        title: ok ? "Fiche de remise copiée" : "Copie impossible",
                        description: ok ? "Adresse, mot de passe initial et liens sont dans le presse-papiers." : "Presse-papiers indisponible.",
                      });
                    }}
                  >
                    Copier la fiche
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLastTempPassword(null)}>
                    Masquer
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-200">Domaine</Label>
              <select
                value={domainId ?? ""}
                onChange={(e) => setDomainId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-md bg-slate-950/40 border border-slate-800 text-slate-100 px-3 py-2 text-sm"
              >
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.domain}
                  </option>
                ))}
              </select>
              {domainsQuery.isError ? (
                <div className="text-xs text-red-300">Chargement des domaines impossible.</div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Préfixe email</Label>
              <Input
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                placeholder="first.last"
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
              {ownerUser ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setLocalPart(generateLocalPartFromUser(ownerUser))}
                >
                  Générer depuis l'utilisateur
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Assigner à un utilisateur (optionnel)</Label>
              <Input
                value={ownerQuery}
                onChange={(e) => setOwnerQuery(e.target.value)}
                placeholder="Rechercher nom ou email..."
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
              {ownerUser ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/30 p-2">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-100 truncate">{ownerUser.displayName}</div>
                    <div className="text-xs text-slate-400 truncate">{ownerUser.email}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setOwnerUser(null)}>
                    Effacer
                  </Button>
                </div>
              ) : debouncedOwnerQuery ? (
                <div className="rounded-md border border-slate-800 bg-slate-950/30">
                  <ScrollArea className="h-[140px]">
                    <div className="p-2 space-y-1">
                      {(tenantUsersQuery.data?.items ?? []).length === 0 ? (
                        <div className="text-xs text-slate-400">Aucun utilisateur.</div>
                      ) : (
                        (tenantUsersQuery.data?.items ?? []).map((u) => (
                          <button
                            key={u.id}
                            className="w-full text-left rounded-md px-2 py-1 hover:bg-slate-900/40"
                            onClick={() => {
                              setOwnerUser(u);
                              setOwnerQuery("");
                            }}
                          >
                            <div className="text-sm text-slate-100 truncate">{u.displayName}</div>
                            <div className="text-xs text-slate-400 truncate">{u.email}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-200">Quota</Label>
              <Input
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                placeholder="2G"
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
              <div className="text-[11px] text-slate-500">Exemples : 2G, 1024M. Valeur par défaut : 2G.</div>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label className="text-slate-200">Mot de passe (optionnel)</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Laisser vide pour générer automatiquement"
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
              <div className="text-[11px] text-slate-500">
                Si la boîte existe déjà sur le serveur mail, saisir un mot de passe pour l'importer ou la réinitialiser.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => createAccountMutation.mutate()} disabled={createAccountMutation.isPending}>
              Créer la boîte
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setLocalPart("");
                setOwnerQuery("");
                setOwnerUser(null);
                setPassword("");
                setQuota("2G");
              }}
            >
              Effacer
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Comptes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-200">Recherche</Label>
              <Input
                value={q}
                onChange={(e) => {
                  setOffset(0);
                  setQ(e.target.value);
                }}
                placeholder="adresse ou utilisateur..."
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-200">Statut</Label>
              <select
                value={status}
                onChange={(e) => {
                  setOffset(0);
                  setStatus(e.target.value as any);
                }}
                className="w-full rounded-md bg-slate-950/40 border border-slate-800 text-slate-100 px-3 py-2 text-sm"
              >
                <option value="all">Tous</option>
                <option value="active">Actif</option>
                <option value="disabled">Désactivé</option>
                <option value="provision_failed">Provisioning échoué</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="secondary"
                onClick={() => queryClient.invalidateQueries({ queryKey: [accountsQueryKey] })}
              >
                Actualiser
              </Button>
              <div className="flex-1" />
              <Button size="sm" variant="ghost" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - 50))}>
                Préc.
              </Button>
              <Button size="sm" variant="ghost" disabled={!canNext} onClick={() => setOffset(offset + 50)}>
                Suiv.
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[420px] pr-4">
            <div className="space-y-2">
              {accountsQuery.isLoading ? (
                <div className="text-sm text-slate-400">Chargement...</div>
              ) : accountsQuery.isError ? (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                  Chargement des comptes impossible.
                </div>
              ) : accounts.length === 0 ? (
                <div className="text-sm text-slate-400">Aucun compte.</div>
              ) : (
                accounts.map((row) => {
                  const acct = row.account;
                  const owner = row.owner;
                  const statusLabel = String(acct.status || "unknown");
                  const statusBadge =
                    statusLabel === "active"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : statusLabel === "disabled"
                        ? "bg-slate-500/15 text-slate-200 border border-slate-500/30"
                        : "bg-red-500/15 text-red-300 border border-red-500/30";

                  return (
                    <div key={acct.id} className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-slate-100 font-mono break-all">{acct.address}</div>
                          <div className="text-xs text-slate-400 mt-1">
                            {owner ? (
                              <>
                                Propriétaire : <span className="text-slate-200">{owner.displayName}</span>{" "}
                                <span className="text-slate-500">({owner.email})</span>
                              </>
                            ) : (
                              <span>Non assigné</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Créé : {new Date(acct.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <Badge className={statusBadge}>{statusLabel}</Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => resetPasswordMutation.mutate(acct.id)}
                          disabled={resetPasswordMutation.isPending}
                        >
                          Réinitialiser le mot de passe
                        </Button>
                        {acct.status === "disabled" ? (
                          <Button
                            size="sm"
                            onClick={() => updateAccountMutation.mutate({ id: acct.id, status: "active" })}
                            disabled={updateAccountMutation.isPending}
                          >
                            Activer
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => updateAccountMutation.mutate({ id: acct.id, status: "disabled" })}
                            disabled={updateAccountMutation.isPending}
                          >
                            Désactiver
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const ok = await copyToClipboard(acct.address);
                            toast({ title: ok ? "Copié" : "Copie impossible", description: ok ? "Adresse copiée." : "Presse-papiers indisponible." });
                          }}
                        >
                          Copier l'adresse
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Alias / redirection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-200">Source (alias)</Label>
              <Input
                value={aliasSource}
                onChange={(e) => setAliasSource(e.target.value)}
                placeholder="support@exportunity.net"
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-200">Destination</Label>
              <Input
                value={aliasDestination}
                onChange={(e) => setAliasDestination(e.target.value)}
                placeholder="first.last@exportunity.net"
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => createAliasMutation.mutate()} disabled={createAliasMutation.isPending}>
              Créer l'alias
            </Button>
            <Button variant="secondary" onClick={() => { setAliasSource(""); setAliasDestination(""); }}>
              Effacer
            </Button>
          </div>
          <div className="text-xs text-slate-400">
            Note : le provisioning d'alias appelle docker-mailserver `setup alias add`.
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-100">Routes d'alias actuelles</div>
                <div className="text-xs text-slate-500">
                  Groupées par adresse source. Les identités partagées AGOOJIYE doivent router vers les boîtes validées.
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void aliasesQuery.refetch()}
                disabled={aliasesQuery.isFetching}
              >
                {aliasesQuery.isFetching ? "Actualisation..." : "Actualiser"}
              </Button>
            </div>

            <ScrollArea className="h-[260px] pr-4">
              <div className="space-y-2">
                {aliasesQuery.isLoading ? (
                  <div className="text-sm text-slate-400">Chargement des alias...</div>
                ) : aliasesQuery.isError ? (
                  <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                    Chargement des alias impossible.
                  </div>
                ) : aliasGroups.length === 0 ? (
                  <div className="text-sm text-slate-400">Aucun alias.</div>
                ) : (
                  aliasGroups.map((group) => (
                    <div key={group.sourceAddress} className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-mono text-slate-100 break-all">{group.sourceAddress}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {group.count} route{group.count === 1 ? "" : "s"}
                            {group.latestCreatedAt ? ` - mis à jour ${new Date(group.latestCreatedAt).toLocaleString()}` : ""}
                          </div>
                        </div>
                        <Badge className="bg-slate-500/15 text-slate-200 border border-slate-500/30">
                          {group.destinations.length} destination{group.destinations.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.destinations.map((destination) => (
                          <span
                            key={destination}
                            className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs font-mono text-slate-300"
                          >
                            {destination}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
