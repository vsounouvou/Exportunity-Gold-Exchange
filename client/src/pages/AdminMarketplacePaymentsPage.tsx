import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, RefreshCw, RotateCw, Undo2 } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PaymentRow = {
  id: string;
  tenantId: number;
  provider: string;
  purpose: string;
  method: string;
  orderId: number | null;
  amount: number;
  currency: string;
  status: string;
  providerTransactionId: string | null;
  providerTransactionRef?: string | null;
  msisdn: string | null;
  operator: string | null;
  pushStatus: string | null;
  pushRequestedAt: string | null;
  pushConfirmedAt: string | null;
  providerPayload: any | null;
  createdAt: string;
  updatedAt: string;
  order: {
    id: number;
    orderNumber: string;
    status: string | null;
    total: string;
    createdAt: string;
  } | null;
};

function statusBadge(statusRaw: unknown) {
  const status = String(statusRaw ?? "").toLowerCase();
  if (status === "succeeded") return { label: "PAID", className: "bg-emerald-500/70 text-white border-emerald-400/40" };
  if (status === "failed") return { label: "FAILED", className: "bg-rose-500/70 text-white border-rose-400/40" };
  if (status === "cancelled") return { label: "CANCELLED", className: "bg-zinc-500/70 text-white border-zinc-400/40" };
  if (status === "refunded") return { label: "REFUNDED", className: "bg-amber-500/40 text-black border-amber-300/40" };
  if (status === "processing") return { label: "PROCESSING", className: "bg-sky-500/50 text-white border-sky-400/40" };
  return { label: "PENDING", className: "bg-amber-500/70 text-black border-amber-300/60" };
}

function safeDate(value: unknown) {
  const d = new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function AdminMarketplacePaymentsPage() {
  const [status, setStatus] = useState<string>("all");
  const [provider, setProvider] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (status !== "all") params.set("status", status);
    if (provider !== "all") params.set("provider", provider);
    if (type !== "all") params.set("type", type);
    return params.toString();
  }, [provider, status, type]);

  const listQuery = useQuery<{ payments: PaymentRow[] }>({
    queryKey: ["admin_marketplace_payments", status, provider, type],
    queryFn: async () => apiRequest(`/api/admin/marketplace/payments?${qs}`),
  });

  const detailQuery = useQuery<{ payment: any; order: any | null }>({
    queryKey: ["admin_marketplace_payment_detail", selectedPaymentId],
    queryFn: async () => apiRequest(`/api/admin/marketplace/payments/${encodeURIComponent(String(selectedPaymentId))}`),
    enabled: !!selectedPaymentId && detailOpen,
  });

  const payments = listQuery.data?.payments ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Payments</h1>
          <p className="text-gray-400">Order + wallet payment records across gateways.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="w-[170px] bg-gray-900 border-gray-800 text-white">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent className="bg-gray-950 border-gray-800 text-white">
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="kkiapay">KKiaPay</SelectItem>
              <SelectItem value="flutterwave">Flutterwave</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[170px] bg-gray-900 border-gray-800 text-white">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="bg-gray-950 border-gray-800 text-white">
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="ORDER_PAYMENT">Order payment</SelectItem>
              <SelectItem value="WALLET_TOPUP">Wallet top-up</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px] bg-gray-900 border-gray-800 text-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-gray-950 border-gray-800 text-white">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="succeeded">Paid</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
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
          <CardTitle className="text-white text-lg">Recent payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Created</TableHead>
                  <TableHead className="text-white/60">Provider</TableHead>
                  <TableHead className="text-white/60">Type</TableHead>
                  <TableHead className="text-white/60">Order</TableHead>
                  <TableHead className="text-white/60">Amount</TableHead>
                  <TableHead className="text-white/60">Method</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60">Txn</TableHead>
                  <TableHead className="text-white/60 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => {
                  const created = safeDate(payment.createdAt);
                  const createdLabel = created
                    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(created)
                    : "--";
                  const badge = statusBadge(payment.status);
                  return (
                    <TableRow key={payment.id} className="border-white/10">
                      <TableCell className="text-xs text-white/70">{createdLabel}</TableCell>
                      <TableCell className="text-xs text-white/70 uppercase">{payment.provider || "kkiapay"}</TableCell>
                      <TableCell className="text-xs text-white/70">{payment.purpose || "--"}</TableCell>
                      <TableCell className="text-xs text-white">
                        <div className="font-medium">{payment.order?.orderNumber ?? "--"}</div>
                        <div className="text-white/50">{payment.order?.status ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-xs text-amber-300 font-semibold">
                        {payment.amount} {payment.currency}
                      </TableCell>
                      <TableCell className="text-xs text-white/70">
                        <div className="font-medium">{payment.method || ""}</div>
                        {String(payment.method || "").toUpperCase() === "PUSH" ? (
                          <div className="text-[11px] text-white/50">{[payment.msisdn, payment.operator, payment.pushStatus].filter(Boolean).join(" - ")}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-2 py-1 ${badge.className}`}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-[11px] text-white/60 max-w-[220px] truncate">
                        {payment.providerTransactionId || payment.providerTransactionRef || "--"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                            onClick={async () => {
                              await apiRequest(`/api/admin/marketplace/payments/${encodeURIComponent(payment.id)}/recheck`, {
                                method: "POST",
                              });
                              listQuery.refetch();
                              if (selectedPaymentId === payment.id) detailQuery.refetch();
                            }}
                          >
                            <RotateCw className="h-3.5 w-3.5 mr-2" />
                            Recheck
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                            disabled={String(payment.status || "").toLowerCase() === "refunded"}
                            onClick={async () => {
                              const confirmed = window.confirm(
                                `Mark payment ${payment.id} as refunded and apply a wallet reversal if needed?`,
                              );
                              if (!confirmed) return;
                              await apiRequest(`/api/admin/marketplace/payments/${encodeURIComponent(payment.id)}/refund`, {
                                method: "POST",
                                body: JSON.stringify({ reason: "manual_refund_admin" }),
                              });
                              listQuery.refetch();
                              if (selectedPaymentId === payment.id) detailQuery.refetch();
                            }}
                          >
                            <Undo2 className="h-3.5 w-3.5 mr-2" />
                            Mark refunded
                          </Button>
                          <Button
                            size="sm"
                            className="bg-amber-500 hover:bg-amber-400 text-black"
                            onClick={() => {
                              setSelectedPaymentId(payment.id);
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

                {!payments.length && !listQuery.isFetching ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={9} className="text-sm text-white/60 py-8 text-center">
                      No payments found.
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
            <DialogTitle className="text-white">Payment details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="text-sm text-white/60">Loading...</div>
          ) : detailQuery.isError ? (
            <div className="text-sm text-rose-300">Failed to load payment.</div>
          ) : detailQuery.data ? (
            <div className="space-y-3">
              <div className="text-xs text-white/60 break-all">Payment ID: {selectedPaymentId}</div>
              {detailQuery.data?.order?.orderNumber ? <div className="text-xs text-white/60">Order: {detailQuery.data.order.orderNumber}</div> : null}
              <ScrollArea className="h-[420px] rounded-xl border border-white/10 bg-white/5 p-3">
                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap">{JSON.stringify(detailQuery.data, null, 2)}</pre>
              </ScrollArea>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
