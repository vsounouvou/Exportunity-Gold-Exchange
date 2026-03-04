import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, RotateCcw } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PayoutRow = {
  id: string;
  walletAccountId: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  currency: string;
  status: string;
  payoutMethod: string;
  externalRef: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

function safeDate(value: unknown) {
  const d = new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

function statusBadge(statusRaw: unknown) {
  const status = String(statusRaw ?? "").toUpperCase();
  if (status === "COMPLETED") return { label: "COMPLETED", className: "bg-emerald-500/70 text-white border-emerald-400/40" };
  if (status === "FAILED") return { label: "FAILED", className: "bg-rose-500/70 text-white border-rose-400/40" };
  if (status === "REVERSED") return { label: "REVERSED", className: "bg-zinc-500/70 text-white border-zinc-400/40" };
  if (status === "REQUESTED") return { label: "REQUESTED", className: "bg-amber-500/70 text-black border-amber-300/60" };
  return { label: status || "PROCESSING", className: "bg-sky-500/50 text-white border-sky-400/40" };
}

export default function AdminWalletPayoutsPage() {
  const [status, setStatus] = useState<string>("all");

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (status !== "all") params.set("status", status);
    return params.toString();
  }, [status]);

  const listQuery = useQuery<{ ok: boolean; items: PayoutRow[] }>({
    queryKey: ["admin_wallet_payouts", qs],
    queryFn: async () => apiRequest(`/api/admin/wallet/payouts?${qs}`),
  });

  const items = listQuery.data?.items ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Wallet Payouts</h1>
          <p className="text-gray-400">Cash-out requests (automatic via KKiaPay payout).</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px] bg-gray-900 border-gray-800 text-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-gray-950 border-gray-800 text-white">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="REQUESTED">Requested</SelectItem>
              <SelectItem value="PROCESSING">Processing</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="REVERSED">Reversed</SelectItem>
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
          <CardTitle className="text-white text-lg">Recent payouts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Time</TableHead>
                  <TableHead className="text-white/60">Wallet</TableHead>
                  <TableHead className="text-white/60">Method</TableHead>
                  <TableHead className="text-white/60 text-right">Amount</TableHead>
                  <TableHead className="text-white/60 text-right">Fee</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => {
                  const created = safeDate(p.createdAt);
                  const badge = statusBadge(p.status);
                  return (
                    <TableRow key={p.id} className="border-white/10">
                      <TableCell className="text-xs text-white/70">
                        {created ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(created) : ""}
                      </TableCell>
                      <TableCell className="text-xs text-white/70">{p.walletAccountId.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs text-white/70">{p.payoutMethod}</TableCell>
                      <TableCell className="text-xs text-amber-300 font-semibold text-right">
                        {p.amount} {p.currency}
                      </TableCell>
                      <TableCell className="text-xs text-white/70 text-right">{p.feeAmount}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-2 py-1 ${badge.className}`}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                          onClick={async () => {
                            const reason = window.prompt("Reverse reason (admin only):", "admin_reverse") || "admin_reverse";
                            await apiRequest(`/api/admin/wallet/payouts/${encodeURIComponent(p.id)}/reverse`, {
                              method: "POST",
                              body: JSON.stringify({ reason }),
                            });
                            listQuery.refetch();
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-2" />
                          Reverse
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!items.length && !listQuery.isFetching ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={7} className="text-sm text-white/60 py-8 text-center">
                      No payouts found.
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

