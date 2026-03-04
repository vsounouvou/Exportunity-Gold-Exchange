import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type LedgerRow = {
  id: string;
  walletAccountId: string;
  direction: string;
  entryType: string;
  amount: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  createdAt: string;
};

function safeDate(value: unknown) {
  const d = new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function AdminWalletLedgerPage() {
  const [walletId, setWalletId] = useState("");
  const [entryType, setEntryType] = useState<string>("all");
  const [referenceType, setReferenceType] = useState<string>("all");
  const [q, setQ] = useState("");

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (walletId.trim()) params.set("walletId", walletId.trim());
    if (entryType !== "all") params.set("entryType", entryType);
    if (referenceType !== "all") params.set("referenceType", referenceType);
    if (q.trim()) params.set("q", q.trim());
    return params.toString();
  }, [entryType, q, referenceType, walletId]);

  const listQuery = useQuery<{ ok: boolean; items: LedgerRow[] }>({
    queryKey: ["admin_wallet_ledger", qs],
    queryFn: async () => apiRequest(`/api/admin/wallet/ledger?${qs}`),
  });

  const items = listQuery.data?.items ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Wallet Ledger</h1>
          <p className="text-gray-400">Append-only entries (source of truth for balances).</p>
        </div>
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

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            placeholder="walletId (optional)"
            className="bg-gray-950 border-gray-800 text-white placeholder:text-white/30"
          />

          <Select value={entryType} onValueChange={setEntryType}>
            <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
              <SelectValue placeholder="Entry type" />
            </SelectTrigger>
            <SelectContent className="bg-gray-950 border-gray-800 text-white">
              <SelectItem value="all">All entry types</SelectItem>
              {[
                "TOPUP",
                "PURCHASE",
                "TRANSFER",
                "PAYOUT",
                "FEE",
                "COMMISSION",
                "ADJUSTMENT",
                "REVERSAL",
                "VOUCHER_REDEEM",
                "VOUCHER_ISSUE",
                "SELLER_CASHIN",
              ].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={referenceType} onValueChange={setReferenceType}>
            <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
              <SelectValue placeholder="Reference type" />
            </SelectTrigger>
            <SelectContent className="bg-gray-950 border-gray-800 text-white">
              <SelectItem value="all">All reference types</SelectItem>
              {["TOPUP", "ORDER", "TRANSFER", "PAYOUT", "VOUCHER", "ADMIN_ADJ", "SELLER_OP"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search reference id"
            className="bg-gray-950 border-gray-800 text-white placeholder:text-white/30"
          />
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg">Latest entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Time</TableHead>
                  <TableHead className="text-white/60">Wallet</TableHead>
                  <TableHead className="text-white/60">Dir</TableHead>
                  <TableHead className="text-white/60">Type</TableHead>
                  <TableHead className="text-white/60 text-right">Amount</TableHead>
                  <TableHead className="text-white/60 text-right">Balance</TableHead>
                  <TableHead className="text-white/60">Ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const created = safeDate(row.createdAt);
                  return (
                    <TableRow key={row.id} className="border-white/10">
                      <TableCell className="text-xs text-white/70">
                        {created ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(created) : ""}
                      </TableCell>
                      <TableCell className="text-xs text-white/70">{row.walletAccountId.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs text-white">{row.direction}</TableCell>
                      <TableCell className="text-xs text-white">{row.entryType}</TableCell>
                      <TableCell className="text-xs text-amber-300 font-semibold text-right">{row.amount}</TableCell>
                      <TableCell className="text-xs text-white/80 text-right">{row.balanceAfter}</TableCell>
                      <TableCell className="text-[11px] text-white/60 max-w-[260px] truncate">
                        {row.referenceType}:{row.referenceId}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!items.length && !listQuery.isFetching ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={7} className="text-sm text-white/60 py-8 text-center">
                      No entries found.
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

