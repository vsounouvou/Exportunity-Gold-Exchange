import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, RefreshCw, ShieldCheck, Wallet } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type WalletAccountRow = { wallet: { status: string } };
type LedgerRow = { id: string; amount: number; createdAt: string };
type PayoutRow = { id: string; status: string; amount: number };
type AlertsPayload = { items?: unknown[] } | unknown[];

function asArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as any).items)) return (value as any).items as T[];
  return [];
}

export default function AdminWalletHubPage() {
  const { toast } = useToast();

  const accountsQuery = useQuery<{ ok: boolean; items: WalletAccountRow[] }>({
    queryKey: ["wallet_hub_accounts"],
    queryFn: async () => apiRequest("/api/admin/wallet/accounts?limit=120"),
    staleTime: 15_000,
  });

  const ledgerQuery = useQuery<{ ok: boolean; items: LedgerRow[] }>({
    queryKey: ["wallet_hub_ledger"],
    queryFn: async () => apiRequest("/api/admin/wallet/ledger?limit=120"),
    staleTime: 15_000,
  });

  const payoutsQuery = useQuery<{ ok: boolean; items: PayoutRow[] }>({
    queryKey: ["wallet_hub_payouts"],
    queryFn: async () => apiRequest("/api/admin/wallet/payouts?limit=120"),
    staleTime: 15_000,
  });

  const alertsQuery = useQuery<AlertsPayload>({
    queryKey: ["wallet_hub_alerts"],
    queryFn: async () => apiRequest("/api/admin/risk/alerts"),
    staleTime: 15_000,
  });

  const recomputeMutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/wallet/recompute-balances", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => toast({ title: "Recompute started", description: "Balance recompute requested successfully." }),
    onError: (error: any) =>
      toast({
        title: "Recompute failed",
        description: String(error?.message || "Unable to start balance recompute"),
        variant: "destructive",
      }),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/wallet/verify-ledger", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => toast({ title: "Ledger verification queued", description: "Verification run created with audit evidence." }),
    onError: (error: any) =>
      toast({
        title: "Verification failed",
        description: String(error?.message || "Unable to verify ledger"),
        variant: "destructive",
      }),
  });

  const accounts = accountsQuery.data?.items || [];
  const ledger = ledgerQuery.data?.items || [];
  const payouts = payoutsQuery.data?.items || [];
  const alerts = asArray(alertsQuery.data);

  const activeAccounts = accounts.filter((row) => String(row?.wallet?.status || "").toUpperCase() === "ACTIVE").length;
  const pendingPayouts = payouts.filter((row) => {
    const status = String(row?.status || "").toUpperCase();
    return status === "REQUESTED" || status === "PROCESSING" || status === "SENT";
  }).length;
  const ledgerVolume = ledger.reduce((sum, row) => sum + Number(row?.amount || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="h-5 w-5 text-amber-300" />
            Wallet Hub
          </h1>
          <p className="text-sm text-gray-400">Accounts, ledger, payouts, risk and controls in one view.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => {
              accountsQuery.refetch();
              ledgerQuery.refetch();
              payoutsQuery.refetch();
              alertsQuery.refetch();
            }}
            disabled={accountsQuery.isFetching || ledgerQuery.isFetching || payoutsQuery.isFetching || alertsQuery.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${
                accountsQuery.isFetching || ledgerQuery.isFetching || payoutsQuery.isFetching || alertsQuery.isFetching
                  ? "animate-spin"
                  : ""
              }`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-300">Wallet accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-white">{accounts.length}</div>
            <div className="text-xs text-gray-500 mt-1">Active: {activeAccounts}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-300">Ledger entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-white">{ledger.length}</div>
            <div className="text-xs text-gray-500 mt-1">Volume sum: {ledgerVolume}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-300">Pending payouts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-white">{pendingPayouts}</div>
            <div className="text-xs text-gray-500 mt-1">Total payouts: {payouts.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-300 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
              Risk alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-white">{alerts.length}</div>
            <div className="text-xs text-gray-500 mt-1">Open alert payloads</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-white">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-amber-500 hover:bg-amber-400 text-black"
                onClick={() => recomputeMutation.mutate()}
                disabled={recomputeMutation.isPending}
              >
                {recomputeMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                Recompute balances
              </Button>
              <Button
                variant="outline"
                className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
              >
                {verifyMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                Verify ledger integrity
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Both actions are audited. Verification must produce evidence rows to pass.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-white">Wallet modules</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { path: "/admin/wallet/accounts", label: "Accounts" },
              { path: "/admin/wallet/ledger", label: "Ledger" },
              { path: "/admin/wallet/payouts", label: "Payouts" },
              { path: "/admin/wallet/topups", label: "Topups" },
              { path: "/admin/wallet/vouchers", label: "Vouchers" },
              { path: "/admin/wallet/sellers", label: "Sellers" },
              { path: "/admin/wallet/risk", label: "Risk" },
              { path: "/admin/wallet/config", label: "Config" },
            ].map((item) => (
              <Link key={item.path} href={item.path}>
                <a className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 hover:border-amber-400/50 hover:text-white inline-flex items-center justify-between">
                  <span>{item.label}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

