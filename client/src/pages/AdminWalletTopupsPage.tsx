import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, RotateCw } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TopupRow = {
  id: string;
  walletAccountId: string;
  amount: number;
  currency: string;
  status: string;
  gateway: string;
  externalRef: string | null;
  gatewayPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
};

function safeDate(value: unknown) {
  const d = new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

function statusBadge(statusRaw: unknown) {
  const status = String(statusRaw ?? "").toUpperCase();
  if (status === "PAID") return { label: "PAID", className: "bg-emerald-500/70 text-white border-emerald-400/40" };
  if (status === "FAILED") return { label: "FAILED", className: "bg-rose-500/70 text-white border-rose-400/40" };
  if (status === "CANCELLED") return { label: "CANCELLED", className: "bg-zinc-500/70 text-white border-zinc-400/40" };
  if (status === "EXPIRED") return { label: "EXPIRED", className: "bg-zinc-500/70 text-white border-zinc-400/40" };
  return { label: status || "PENDING", className: "bg-amber-500/70 text-black border-amber-300/60" };
}

export default function AdminWalletTopupsPage() {
  const [status, setStatus] = useState<string>("all");
  const [gateway, setGateway] = useState<string>("all");

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (status !== "all") params.set("status", status);
    if (gateway !== "all") params.set("gateway", gateway);
    return params.toString();
  }, [gateway, status]);

  const listQuery = useQuery<{ ok: boolean; items: TopupRow[] }>({
    queryKey: ["admin_wallet_topups", qs],
    queryFn: async () => apiRequest(`/api/admin/wallet/topups?${qs}`),
  });

  const items = listQuery.data?.items ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Wallet Topups</h1>
          <p className="text-gray-400">Cash-in via KKiaPay and Flutterwave.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px] bg-gray-900 border-gray-800 text-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-gray-950 border-gray-800 text-white">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="INITIATED">Initiated</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={gateway} onValueChange={setGateway}>
            <SelectTrigger className="w-[170px] bg-gray-900 border-gray-800 text-white">
              <SelectValue placeholder="Gateway" />
            </SelectTrigger>
            <SelectContent className="bg-gray-950 border-gray-800 text-white">
              <SelectItem value="all">All gateways</SelectItem>
              <SelectItem value="kkiapay">KKiaPay</SelectItem>
              <SelectItem value="flutterwave">Flutterwave</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${listQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg">Recent topups</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Time</TableHead>
                  <TableHead className="text-white/60">Wallet</TableHead>
                  <TableHead className="text-white/60">Gateway</TableHead>
                  <TableHead className="text-white/60 text-right">Amount</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60">External</TableHead>
                  <TableHead className="text-white/60 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((topup) => {
                  const created = safeDate(topup.createdAt);
                  const badge = statusBadge(topup.status);
                  return (
                    <TableRow key={topup.id} className="border-white/10">
                      <TableCell className="text-xs text-white/70">
                        {created ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(created) : ""}
                      </TableCell>
                      <TableCell className="text-xs text-white/70">{topup.walletAccountId.slice(0, 8)}...</TableCell>
                      <TableCell className="text-xs text-white/70 uppercase">{topup.gateway || "kkiapay"}</TableCell>
                      <TableCell className="text-xs text-amber-300 font-semibold text-right">
                        {topup.amount} {topup.currency}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-2 py-1 ${badge.className}`}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-[11px] text-white/60 max-w-[220px] truncate">{topup.externalRef || ""}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                          onClick={async () => {
                            await apiRequest(`/api/admin/wallet/topups/${encodeURIComponent(topup.id)}/recheck`, { method: "POST" });
                            listQuery.refetch();
                          }}
                        >
                          <RotateCw className="h-3.5 w-3.5 mr-2" />
                          Recheck
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!items.length && !listQuery.isFetching ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={7} className="text-sm text-white/60 py-8 text-center">
                      No topups found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
