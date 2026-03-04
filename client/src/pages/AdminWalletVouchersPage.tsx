import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Plus, RefreshCw, Send } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type VoucherBatchRow = {
  id: string;
  issuerWalletAccountId: string;
  currency: string;
  totalValue: number;
  voucherCount: number;
  voucherValue: number;
  status: string;
  commissionScheme: any;
  createdAt: string;
  updatedAt: string;
};

function safeDate(value: unknown) {
  const d = new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

function statusBadge(statusRaw: unknown) {
  const status = String(statusRaw ?? "").toUpperCase();
  if (status === "ISSUED") return { label: "ISSUED", className: "bg-sky-500/50 text-white border-sky-400/40" };
  if (status === "FULLY_REDEEMED") return { label: "FULLY_REDEEMED", className: "bg-emerald-500/70 text-white border-emerald-400/40" };
  if (status === "PARTIALLY_REDEEMED") return { label: "PARTIALLY_REDEEMED", className: "bg-emerald-500/30 text-white border-emerald-400/20" };
  if (status === "CANCELLED") return { label: "CANCELLED", className: "bg-zinc-500/70 text-white border-zinc-400/40" };
  return { label: status || "DRAFT", className: "bg-amber-500/70 text-black border-amber-300/60" };
}

export default function AdminWalletVouchersPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [issuerWalletAccountId, setIssuerWalletAccountId] = useState("");
  const [voucherCount, setVoucherCount] = useState("100");
  const [voucherValue, setVoucherValue] = useState("1000");
  const [sellerPct, setSellerPct] = useState("0.01");
  const [masterPct, setMasterPct] = useState("0.01");

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const listQuery = useQuery<{ ok: boolean; items: VoucherBatchRow[] }>({
    queryKey: ["admin_voucher_batches"],
    queryFn: async () => apiRequest("/api/admin/vouchers/batches"),
  });

  const detailQuery = useQuery<any>({
    queryKey: ["admin_voucher_batch_detail", selectedBatchId],
    queryFn: async () => apiRequest(`/api/admin/vouchers/batches/${encodeURIComponent(String(selectedBatchId))}`),
    enabled: !!selectedBatchId && detailOpen,
  });

  const batches = listQuery.data?.items ?? [];

  const canCreate = useMemo(() => {
    const count = Math.trunc(Number(voucherCount));
    const value = Math.trunc(Number(voucherValue));
    return issuerWalletAccountId.trim() && Number.isFinite(count) && count > 0 && Number.isFinite(value) && value > 0;
  }, [issuerWalletAccountId, voucherCount, voucherValue]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Vouchers</h1>
          <p className="text-gray-400">Voucher batches + codes (redeem to wallet).</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${listQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button className="bg-amber-500 hover:bg-amber-400 text-black font-semibold" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create batch
          </Button>
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg">Batches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Time</TableHead>
                  <TableHead className="text-white/60">Batch</TableHead>
                  <TableHead className="text-white/60">Issuer</TableHead>
                  <TableHead className="text-white/60">Value</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => {
                  const created = safeDate(b.createdAt);
                  const badge = statusBadge(b.status);
                  return (
                    <TableRow key={b.id} className="border-white/10">
                      <TableCell className="text-xs text-white/70">
                        {created ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(created) : ""}
                      </TableCell>
                      <TableCell className="text-xs text-white/80">{b.id.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs text-white/70">{b.issuerWalletAccountId.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs text-amber-300 font-semibold">
                        {b.voucherCount} × {b.voucherValue} {b.currency}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-2 py-1 ${badge.className}`}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                            onClick={async () => {
                              await apiRequest(`/api/admin/vouchers/batches/${encodeURIComponent(b.id)}/issue`, { method: "POST" });
                              listQuery.refetch();
                            }}
                          >
                            <Send className="h-3.5 w-3.5 mr-2" />
                            Issue
                          </Button>
                          <Button
                            size="sm"
                            className="bg-amber-500 hover:bg-amber-400 text-black"
                            onClick={() => {
                              setSelectedBatchId(b.id);
                              setDetailOpen(true);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5 mr-2" />
                            View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!batches.length && !listQuery.isFetching ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={6} className="text-sm text-white/60 py-8 text-center">
                      No batches found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg bg-black border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Create voucher batch</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-white/70">Issuer walletAccountId</Label>
              <Input
                value={issuerWalletAccountId}
                onChange={(e) => setIssuerWalletAccountId(e.target.value)}
                placeholder="wallet UUID"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-white/70">Voucher count</Label>
                <Input
                  value={voucherCount}
                  onChange={(e) => setVoucherCount(e.target.value)}
                  type="number"
                  inputMode="numeric"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70">Voucher value (XOF)</Label>
                <Input
                  value={voucherValue}
                  onChange={(e) => setVoucherValue(e.target.value)}
                  type="number"
                  inputMode="numeric"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-white/70">Seller commission pct</Label>
                <Input
                  value={sellerPct}
                  onChange={(e) => setSellerPct(e.target.value)}
                  placeholder="0.01"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70">Master commission pct</Label>
                <Input
                  value={masterPct}
                  onChange={(e) => setMasterPct(e.target.value)}
                  placeholder="0.01"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                disabled={!canCreate}
                onClick={async () => {
                  await apiRequest("/api/admin/vouchers/batches/create", {
                    method: "POST",
                    body: JSON.stringify({
                      issuerWalletAccountId: issuerWalletAccountId.trim(),
                      voucherCount: Math.trunc(Number(voucherCount)),
                      voucherValue: Math.trunc(Number(voucherValue)),
                      commissionScheme: {
                        sellerPct: Number(sellerPct) || 0,
                        masterPct: Number(masterPct) || 0,
                      },
                    }),
                  });
                  setCreateOpen(false);
                  listQuery.refetch();
                }}
              >
                Create
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-white/15 text-white hover:bg-white/10"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl bg-black border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Batch details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="text-sm text-white/60">Loading...</div>
          ) : detailQuery.isError ? (
            <div className="text-sm text-rose-300">Failed to load batch.</div>
          ) : detailQuery.data ? (
            <ScrollArea className="h-[520px] rounded-xl border border-white/10 bg-white/5 p-3">
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap">{JSON.stringify(detailQuery.data, null, 2)}</pre>
            </ScrollArea>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

