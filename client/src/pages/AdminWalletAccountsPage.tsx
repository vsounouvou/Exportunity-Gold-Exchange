import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Lock, RefreshCw, Unlock } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

type WalletAccountRow = {
  wallet: {
    id: string;
    userId: string;
    currency: string;
    status: "ACTIVE" | "FROZEN" | "CLOSED";
    kycLevel: string;
    createdAt: string;
    updatedAt: string;
  };
  user: { id: number; email: string; displayName: string } | null;
  balance: number;
};

function statusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return { label: "ACTIVE", className: "bg-emerald-500/70 text-white border-emerald-400/40" };
  if (s === "FROZEN") return { label: "FROZEN", className: "bg-amber-500/70 text-black border-amber-300/60" };
  if (s === "CLOSED") return { label: "CLOSED", className: "bg-zinc-500/70 text-white border-zinc-400/40" };
  return { label: s || "UNKNOWN", className: "bg-white/10 text-white border-white/10" };
}

export default function AdminWalletAccountsPage() {
  const [query, setQuery] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (query.trim()) params.set("query", query.trim());
    return params.toString();
  }, [query]);

  const listQuery = useQuery<{ ok: boolean; items: WalletAccountRow[] }>({
    queryKey: ["admin_wallet_accounts", qs],
    queryFn: async () => apiRequest(`/api/admin/wallet/accounts?${qs}`),
  });

  const detailQuery = useQuery<any>({
    queryKey: ["admin_wallet_account_detail", selectedWalletId],
    queryFn: async () => apiRequest(`/api/admin/wallet/accounts/${encodeURIComponent(String(selectedWalletId))}`),
    enabled: !!selectedWalletId && detailOpen,
  });

  const items = listQuery.data?.items ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Wallet Accounts</h1>
          <p className="text-gray-400">Global wallets across all tenants (tenant-agnostic balances).</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by user id (incl guest:...)"
            className="bg-gray-900 border-gray-800 text-white placeholder:text-white/30 w-full sm:w-[320px]"
          />
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
          <CardTitle className="text-white text-lg">Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Wallet</TableHead>
                  <TableHead className="text-white/60">User</TableHead>
                  <TableHead className="text-white/60">Balance</TableHead>
                  <TableHead className="text-white/60">Currency</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const badge = statusBadge(row.wallet.status);
                  return (
                    <TableRow key={row.wallet.id} className="border-white/10">
                      <TableCell className="text-xs text-white/80">{row.wallet.id.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs text-white">
                        <div className="font-medium">{row.user?.displayName || row.wallet.userId}</div>
                        <div className="text-white/50">{row.user?.email || ""}</div>
                      </TableCell>
                      <TableCell className="text-xs text-amber-300 font-semibold">{row.balance}</TableCell>
                      <TableCell className="text-xs text-white/70">{row.wallet.currency}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-2 py-1 ${badge.className}`}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {row.wallet.status === "ACTIVE" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                              onClick={async () => {
                                await apiRequest(`/api/admin/wallet/accounts/${encodeURIComponent(row.wallet.id)}/freeze`, { method: "POST" });
                                listQuery.refetch();
                              }}
                            >
                              <Lock className="h-3.5 w-3.5 mr-2" />
                              Freeze
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                              onClick={async () => {
                                await apiRequest(`/api/admin/wallet/accounts/${encodeURIComponent(row.wallet.id)}/unfreeze`, { method: "POST" });
                                listQuery.refetch();
                              }}
                            >
                              <Unlock className="h-3.5 w-3.5 mr-2" />
                              Unfreeze
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="bg-amber-500 hover:bg-amber-400 text-black"
                            onClick={() => {
                              setSelectedWalletId(row.wallet.id);
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

                {!items.length && !listQuery.isFetching ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={6} className="text-sm text-white/60 py-8 text-center">
                      No accounts found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl bg-black border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Wallet details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="text-sm text-white/60">Loading...</div>
          ) : detailQuery.isError ? (
            <div className="text-sm text-rose-300">Failed to load wallet.</div>
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

