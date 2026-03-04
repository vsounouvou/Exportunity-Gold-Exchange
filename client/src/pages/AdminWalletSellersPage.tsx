import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Plus, RefreshCw } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SellerRow = {
  id: string;
  userId: string;
  role: string;
  status: string;
  limits: any;
  createdAt: string;
  updatedAt: string;
};

function statusBadge(statusRaw: unknown) {
  const status = String(statusRaw ?? "").toUpperCase();
  if (status === "ACTIVE") return { label: "ACTIVE", className: "bg-emerald-500/70 text-white border-emerald-400/40" };
  if (status === "SUSPENDED") return { label: "SUSPENDED", className: "bg-rose-500/70 text-white border-rose-400/40" };
  return { label: status || "UNKNOWN", className: "bg-white/10 text-white border-white/10" };
}

export default function AdminWalletSellersPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [limitsJson, setLimitsJson] = useState('{"dailyLimitXof":500000}');

  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const listQuery = useQuery<{ ok: boolean; items: SellerRow[] }>({
    queryKey: ["admin_wallet_sellers"],
    queryFn: async () => apiRequest("/api/admin/sellers"),
  });

  const detailQuery = useQuery<any>({
    queryKey: ["admin_wallet_seller_detail", selectedSellerId],
    queryFn: async () => apiRequest(`/api/admin/sellers/${encodeURIComponent(String(selectedSellerId))}`),
    enabled: !!selectedSellerId && detailOpen,
  });

  const sellers = listQuery.data?.items ?? [];

  const parsedLimits = useMemo(() => {
    try {
      const obj = JSON.parse(limitsJson);
      if (!obj || typeof obj !== "object") return {};
      return obj;
    } catch {
      return null;
    }
  }, [limitsJson]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Sellers</h1>
          <p className="text-gray-400">Seller/agent roles for voucher distribution and cash-in operations.</p>
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
            Create seller
          </Button>
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg">Seller roles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">User</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60">Limits</TableHead>
                  <TableHead className="text-white/60 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sellers.map((s) => {
                  const badge = statusBadge(s.status);
                  return (
                    <TableRow key={s.id} className="border-white/10">
                      <TableCell className="text-xs text-white/80">{s.userId}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-2 py-1 ${badge.className}`}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-[11px] text-white/60 max-w-[320px] truncate">
                        {JSON.stringify(s.limits || {})}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                            onClick={() => {
                              setSelectedSellerId(s.id);
                              setDetailOpen(true);
                            }}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                            onClick={async () => {
                              await apiRequest(`/api/admin/sellers/${encodeURIComponent(s.id)}/suspend`, { method: "POST" });
                              listQuery.refetch();
                            }}
                          >
                            <Ban className="h-3.5 w-3.5 mr-2" />
                            Suspend
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!sellers.length && !listQuery.isFetching ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={4} className="text-sm text-white/60 py-8 text-center">
                      No sellers found.
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
            <DialogTitle className="text-white">Create seller</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-white/70">User ID (eceUsers.id or custom)</Label>
              <Input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="123"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-white/70">Limits JSON</Label>
              <Input
                value={limitsJson}
                onChange={(e) => setLimitsJson(e.target.value)}
                placeholder='{"dailyLimitXof":500000}'
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            {parsedLimits === null ? <div className="text-sm text-rose-300">Invalid JSON.</div> : null}

            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                disabled={!userId.trim() || parsedLimits === null}
                onClick={async () => {
                  await apiRequest("/api/admin/sellers/create", {
                    method: "POST",
                    body: JSON.stringify({ userId: userId.trim(), limits: parsedLimits || {} }),
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
            <DialogTitle className="text-white">Seller details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="text-sm text-white/60">Loading...</div>
          ) : detailQuery.isError ? (
            <div className="text-sm text-rose-300">Failed to load seller.</div>
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

