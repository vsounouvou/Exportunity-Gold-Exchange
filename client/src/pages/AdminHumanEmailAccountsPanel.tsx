import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
      if (!domainId) throw new Error("Select a domain");
      if (!localPart.trim()) throw new Error("Local-part is required");
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
      toast({ title: "Mailbox created", description: address || "Created" });
      setLocalPart("");
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/email/domains"] });
      await queryClient.invalidateQueries({ queryKey: [accountsQueryKey] });
    },
    onError: (err: any) => {
      toast({ title: "Create failed", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/admin/email/accounts/${id}/reset-password`, "POST", {}),
    onSuccess: async (res: any) => {
      const address = String(res?.account?.address || "");
      const password = String(res?.tempPassword || "");
      if (address && password) setLastTempPassword({ address, password });
      toast({ title: "Password reset", description: address || "Done" });
      await queryClient.invalidateQueries({ queryKey: [accountsQueryKey] });
    },
    onError: (err: any) => {
      toast({ title: "Reset failed", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async (input: { id: number; status: "active" | "disabled" }) =>
      apiRequest(`/api/admin/email/accounts/${input.id}`, "PATCH", { status: input.status }),
    onSuccess: async (res: any) => {
      const address = String(res?.account?.address || "");
      const password = String(res?.tempPassword || "");
      if (address && password) setLastTempPassword({ address, password });
      toast({ title: "Updated", description: address || "Done" });
      await queryClient.invalidateQueries({ queryKey: [accountsQueryKey] });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const [aliasSource, setAliasSource] = useState("");
  const [aliasDestination, setAliasDestination] = useState("");
  const createAliasMutation = useMutation({
    mutationFn: async () => {
      if (!aliasSource.trim() || !aliasSource.includes("@")) throw new Error("Source email required");
      if (!aliasDestination.trim() || !aliasDestination.includes("@")) throw new Error("Destination email required");
      return apiRequest("/api/admin/email/aliases", "POST", {
        sourceAddress: aliasSource.trim(),
        destination: aliasDestination.trim(),
      });
    },
    onSuccess: async () => {
      toast({ title: "Alias created", description: `${aliasSource.trim()} → ${aliasDestination.trim()}` });
      setAliasSource("");
      setAliasDestination("");
      await queryClient.invalidateQueries({ queryKey: [aliasesQueryKey] });
    },
    onError: (err: any) => {
      toast({ title: "Alias failed", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const accounts = accountsQuery.data?.items ?? [];
  const aliasGroups = aliasesQuery.data?.groups ?? [];
  const total = accountsQuery.data?.pagination?.total ?? accounts.length;
  const canPrev = offset > 0;
  const canNext = offset + 50 < total;

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Domain authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {statusQuery.isError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-200">
              Unable to read mail status.
            </div>
          ) : null}

          <div className="text-xs text-slate-400">
            Domain: <span className="text-slate-200">{statusQuery.data?.mail?.domain || "loading..."}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.inboundDns?.mx?.ok)}>
              MX: {statusQuery.data?.mail?.inboundDns?.mx?.ok ? "cut over" : "not cut over"}
            </Badge>
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.inboundDns?.mailHostA?.ok)}>
              Mail A: {statusQuery.data?.mail?.inboundDns?.mailHostA?.ok ? "ready" : "missing"}
            </Badge>
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.authDiagnostics?.spf?.ok)}>
              SPF: {statusQuery.data?.mail?.authDiagnostics?.spf?.ok ? "pass" : "fail"}
            </Badge>
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.authDiagnostics?.dkim?.ok)}>
              DKIM: {statusQuery.data?.mail?.authDiagnostics?.dkim?.ok ? "pass" : "fail"}
            </Badge>
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.authDiagnostics?.dmarc?.ok, true)}>
              DMARC: {statusQuery.data?.mail?.authDiagnostics?.dmarc?.ok ? "present" : "missing"}
            </Badge>
            <Badge className={dnsBadgeClass(statusQuery.data?.mail?.inboundDns?.readyForInbound)}>
              Inbound mail: {statusQuery.data?.mail?.inboundDns?.readyForInbound ? "ready" : "DNS pending"}
            </Badge>
          </div>

          {statusQuery.data?.mail?.inboundDns ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                <div className="font-medium text-slate-200">Expected DNS</div>
                <div className="mt-2 space-y-1 text-slate-400">
                  <div>
                    MX: <span className="font-mono text-slate-200">10 {statusQuery.data.mail.inboundDns.expectedMxHost}.</span>
                  </div>
                  <div>
                    A:{" "}
                    <span className="font-mono text-slate-200">
                      {statusQuery.data.mail.inboundDns.expectedMailHost} {statusQuery.data.mail.inboundDns.expectedIpv4 || "configured IP"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                <div className="font-medium text-slate-200">Observed DNS</div>
                <div className="mt-2 space-y-1 text-slate-400">
                  <div>
                    MX:{" "}
                    <span className="font-mono text-slate-200">
                      {statusQuery.data.mail.inboundDns.mx.records.length
                        ? statusQuery.data.mail.inboundDns.mx.records.map((record) => `${record.priority} ${record.exchange}`).join(", ")
                        : "none"}
                    </span>
                  </div>
                  <div>
                    A:{" "}
                    <span className="font-mono text-slate-200">
                      {statusQuery.data.mail.inboundDns.mailHostA.records.length
                        ? statusQuery.data.mail.inboundDns.mailHostA.records.join(", ")
                        : "none"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

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
          <CardTitle className="text-white">Human mailboxes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-slate-400">
            Tenant: <span className="text-slate-200">{tenant.name}</span> • Provisioning happens on docker-mailserver (Roundcube).
          </div>

          {lastTempPassword ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-amber-200 font-medium">Temporary password (copy now)</div>
                  <div className="text-xs text-slate-300 mt-1 font-mono break-all">{lastTempPassword.address}</div>
                  <div className="text-xs text-slate-100 mt-2 font-mono break-all">{lastTempPassword.password}</div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const ok = await copyToClipboard(lastTempPassword.password);
                      toast({ title: ok ? "Copied" : "Copy failed", description: ok ? "Password copied to clipboard." : "Clipboard unavailable." });
                    }}
                  >
                    Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLastTempPassword(null)}>
                    Hide
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-200">Domain</Label>
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
                <div className="text-xs text-red-300">Failed to load domains.</div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Local-part</Label>
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
                  Auto-generate from user
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Assign to user (optional)</Label>
              <Input
                value={ownerQuery}
                onChange={(e) => setOwnerQuery(e.target.value)}
                placeholder="Search name or email..."
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
              {ownerUser ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/30 p-2">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-100 truncate">{ownerUser.displayName}</div>
                    <div className="text-xs text-slate-400 truncate">{ownerUser.email}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setOwnerUser(null)}>
                    Clear
                  </Button>
                </div>
              ) : debouncedOwnerQuery ? (
                <div className="rounded-md border border-slate-800 bg-slate-950/30">
                  <ScrollArea className="h-[140px]">
                    <div className="p-2 space-y-1">
                      {(tenantUsersQuery.data?.items ?? []).length === 0 ? (
                        <div className="text-xs text-slate-400">No users.</div>
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
              <div className="text-[11px] text-slate-500">Examples: 2G, 1024M. Default is 2G.</div>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label className="text-slate-200">Password (optional)</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave empty to auto-generate"
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
              <div className="text-[11px] text-slate-500">
                If the mailbox already exists on the mail server, enter a password to import/reset it.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => createAccountMutation.mutate()} disabled={createAccountMutation.isPending}>
              Create mailbox
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
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-200">Search</Label>
              <Input
                value={q}
                onChange={(e) => {
                  setOffset(0);
                  setQ(e.target.value);
                }}
                placeholder="address or user..."
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-200">Status</Label>
              <select
                value={status}
                onChange={(e) => {
                  setOffset(0);
                  setStatus(e.target.value as any);
                }}
                className="w-full rounded-md bg-slate-950/40 border border-slate-800 text-slate-100 px-3 py-2 text-sm"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
                <option value="provision_failed">Provision failed</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="secondary"
                onClick={() => queryClient.invalidateQueries({ queryKey: [accountsQueryKey] })}
              >
                Refresh
              </Button>
              <div className="flex-1" />
              <Button size="sm" variant="ghost" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - 50))}>
                Prev
              </Button>
              <Button size="sm" variant="ghost" disabled={!canNext} onClick={() => setOffset(offset + 50)}>
                Next
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[420px] pr-4">
            <div className="space-y-2">
              {accountsQuery.isLoading ? (
                <div className="text-sm text-slate-400">Loading...</div>
              ) : accountsQuery.isError ? (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                  Failed to load accounts.
                </div>
              ) : accounts.length === 0 ? (
                <div className="text-sm text-slate-400">No accounts.</div>
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
                                Owner: <span className="text-slate-200">{owner.displayName}</span>{" "}
                                <span className="text-slate-500">({owner.email})</span>
                              </>
                            ) : (
                              <span>Unassigned</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Created: {new Date(acct.createdAt).toLocaleString()}
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
                          Reset password
                        </Button>
                        {acct.status === "disabled" ? (
                          <Button
                            size="sm"
                            onClick={() => updateAccountMutation.mutate({ id: acct.id, status: "active" })}
                            disabled={updateAccountMutation.isPending}
                          >
                            Enable
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => updateAccountMutation.mutate({ id: acct.id, status: "disabled" })}
                            disabled={updateAccountMutation.isPending}
                          >
                            Disable
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const ok = await copyToClipboard(acct.address);
                            toast({ title: ok ? "Copied" : "Copy failed", description: ok ? "Address copied." : "Clipboard unavailable." });
                          }}
                        >
                          Copy address
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
          <CardTitle className="text-white">Aliases / Forwarding</CardTitle>
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
              Create alias
            </Button>
            <Button variant="secondary" onClick={() => { setAliasSource(""); setAliasDestination(""); }}>
              Clear
            </Button>
          </div>
          <div className="text-xs text-slate-400">
            Note: alias provisioning calls docker-mailserver `setup alias add`.
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-100">Current alias routes</div>
                <div className="text-xs text-slate-500">
                  Grouped by source address. Shared AGOOJIYE identities should route to approved team mailboxes.
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void aliasesQuery.refetch()}
                disabled={aliasesQuery.isFetching}
              >
                {aliasesQuery.isFetching ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            <ScrollArea className="h-[260px] pr-4">
              <div className="space-y-2">
                {aliasesQuery.isLoading ? (
                  <div className="text-sm text-slate-400">Loading aliases...</div>
                ) : aliasesQuery.isError ? (
                  <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                    Failed to load aliases.
                  </div>
                ) : aliasGroups.length === 0 ? (
                  <div className="text-sm text-slate-400">No aliases.</div>
                ) : (
                  aliasGroups.map((group) => (
                    <div key={group.sourceAddress} className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-mono text-slate-100 break-all">{group.sourceAddress}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {group.count} route{group.count === 1 ? "" : "s"}
                            {group.latestCreatedAt ? ` - updated ${new Date(group.latestCreatedAt).toLocaleString()}` : ""}
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
