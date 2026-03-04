import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ClipboardList, FileSignature, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

import { useSession } from "@/lib/session";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMineById } from "@/lib/miningModules";

type DigitalContract = {
  id: number;
  contractId: string;
  contractType: string;
  mineId: string;
  bureauAchatId: number | null;
  principalAmount: string;
  currency: string;
  startDate: string;
  endDate: string | null;
  payoutFrequency: string;
  returnModel: any;
  status: string;
  documents: any;
  metadata: any;
  bureau?: any | null;
  signatures?: Array<{ party: string; userId: number; signedAt: string }>;
  partyBUserId: number;
};

type PurchaseOrder = {
  id: number;
  orderId: string;
  bureauAchatId: number;
  mineId: string;
  goldType: string;
  quantityKg: string;
  status: string;
  linkedContractDbId: number | null;
  submittedAt: string | null;
  acceptedAt: string | null;
  executedAt: string | null;
  settledAt: string | null;
};

type Payout = {
  payoutId: string;
  contractDbId: number;
  amount: string;
  currency: string;
  status: string;
  dueAt: string | null;
  paidAt: string | null;
};

function safeDate(value: unknown) {
  const d = new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeClock(start: Date | null, end: Date | null) {
  if (!start || !end) return { day: null as number | null, total: null as number | null, progress: null as number | null };
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return { day: 0, total: 0, progress: 100 };
  const total = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  const elapsed = Math.max(0, Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const day = Math.min(total, elapsed + 1);
  const progress = Math.max(0, Math.min(100, (elapsed / total) * 100));
  return { day, total, progress };
}

function returnModelLabel(model: any) {
  if (!model || typeof model !== "object") return "-";
  if (model.type === "revenue_share_percent") return `Revenue share (${Number(model.revenueSharePercent ?? 0)}%)`;
  if (model.type === "premium_per_rotation") return `Return per rotation (indicative) (${Number(model.premiumPerRotationPercent ?? 0)}%)`;
  return "-";
}

function nextPayoutHint(contract: Pick<DigitalContract, "payoutFrequency" | "startDate" | "endDate">) {
  const freq = String(contract.payoutFrequency || "");
  if (freq === "per_sale") return "Next payout: on next confirmed sale";
  if (freq === "per_rotation") return "Next payout: on next rotation event";
  if (freq === "monthly") {
    const start = safeDate(contract.startDate);
    const end = safeDate(contract.endDate);
    if (!start) return "Next payout: monthly";
    let next = new Date(start);
    while (next.getTime() <= Date.now()) {
      next = new Date(next.getFullYear(), next.getMonth() + 1, next.getDate());
      if (end && next.getTime() > end.getTime()) break;
    }
    return `Next payout: ${next.toISOString().slice(0, 10)}`;
  }
  return "Next payout: -";
}

export default function ContractDetailPage() {
  const session = useSession();
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/contracts/:contractId");
  const contractId = (params as any)?.contractId ? String((params as any).contractId) : null;

  const contractsQuery = useQuery<DigitalContract[]>({
    queryKey: ["/api/digital-contracts/contracts", session.token],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/digital-contracts/contracts"), {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: session.isAuthenticated && !!session.token,
  });

  const purchaseOrdersQuery = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/digital-contracts/purchase-orders", session.token],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/digital-contracts/purchase-orders"), {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: session.isAuthenticated && !!session.token,
  });

  const payoutsQuery = useQuery<Payout[]>({
    queryKey: ["/api/digital-contracts/payouts", session.token],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/digital-contracts/payouts"), {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: session.isAuthenticated && !!session.token,
  });

  const contract = useMemo(() => {
    if (!contractId) return null;
    return (contractsQuery.data || []).find((c) => String(c.contractId) === contractId) ?? null;
  }, [contractsQuery.data, contractId]);

  const mine = contract ? getMineById(contract.mineId) : null;
  const bureauName = contract?.bureau?.legalName || contract?.bureau?.name || (contract?.bureauAchatId ? `Bureau #${contract.bureauAchatId}` : null);

  const canCreateOrders = session.hasRole("bureau_achat_user" as any) || session.hasRole("admin" as any);
  const contractCanExecuteOrders = Boolean(contract?.bureauAchatId && contract?.mineId);

  const [orderForm, setOrderForm] = useState(() => ({
    goldType: "dore",
    quantityKg: "",
    pricingReference: "LBMA spot + formula (optional)",
  }));

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!contractId) throw new Error("contractId required");
      return apiRequest(`/api/digital-contracts/contracts/${encodeURIComponent(contractId)}/sign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/digital-contracts/contracts"] });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!contract) throw new Error("Contract not loaded");
      const bureauAchatId = Number(contract.bureauAchatId);
      const quantityKg = Number(orderForm.quantityKg);
      if (!Number.isFinite(bureauAchatId) || bureauAchatId <= 0) throw new Error("Contract has no bureauAchatId");
      if (!contract.mineId) throw new Error("Contract has no mineId");
      if (!Number.isFinite(quantityKg) || quantityKg <= 0) throw new Error("quantityKg required");
      return apiRequest("/api/digital-contracts/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          bureauAchatId,
          mineId: contract.mineId,
          goldType: orderForm.goldType,
          quantityKg,
          pricingReference: orderForm.pricingReference,
          linkedContractId: contract.contractId,
        }),
        headers: { Authorization: `Bearer ${session.token}` },
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/digital-contracts/purchase-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/digital-contracts/payouts"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/digital-contracts/contracts"] }),
      ]);
      setOrderForm((prev) => ({ ...prev, quantityKg: "" }));
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async (payload: { orderId: string; status: string; grossRevenue?: number; netRevenue?: number }) => {
      const { orderId, ...body } = payload;
      return apiRequest(`/api/digital-contracts/purchase-orders/${encodeURIComponent(orderId)}/status`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { Authorization: `Bearer ${session.token}` },
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/digital-contracts/purchase-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/digital-contracts/payouts"] }),
      ]);
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (payoutId: string) => {
      return apiRequest(`/api/digital-contracts/payouts/${encodeURIComponent(payoutId)}/mark-paid`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/digital-contracts/payouts"] });
    },
  });

  if (!match) return null;

  const contractLoading = contractsQuery.isLoading;
  const hasError = Boolean(contractsQuery.error);

  const start = contract ? safeDate(contract.startDate) : null;
  const end = contract ? safeDate(contract.endDate) : null;
  const clock = computeClock(start, end);

  const contractOrders = useMemo(() => {
    if (!contract) return [];
    const rows = purchaseOrdersQuery.data || [];
    return rows.filter((o) => o.linkedContractDbId === contract.id);
  }, [purchaseOrdersQuery.data, contract]);

  const contractPayouts = useMemo(() => {
    if (!contract) return [];
    const rows = payoutsQuery.data || [];
    return rows.filter((p) => p.contractDbId === contract.id);
  }, [payoutsQuery.data, contract]);

  return (
    <div className="p-4 md:p-6 text-white">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/contracts")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-amber-300" />
                Contract
              </h1>
              <p className="text-xs text-white/60 truncate">
                {contractId || "—"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-white/15 text-white/80 hover:bg-white/10 gap-2"
              onClick={() => {
                contractsQuery.refetch();
                purchaseOrdersQuery.refetch();
                payoutsQuery.refetch();
              }}
            >
              <RefreshCw className={`h-4 w-4 ${contractsQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              className="border-white/15 text-white/80 hover:bg-white/10"
              onClick={() => navigate("/bureaus")}
            >
              Bureau directory
            </Button>
          </div>
        </div>

        {contractLoading ? (
          <div className="flex items-center gap-2 text-sm text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading contract…
          </div>
        ) : hasError ? (
          <div className="text-sm text-red-300">{String(contractsQuery.error)}</div>
        ) : !contract ? (
          <Card className="bg-gray-900/60 border-white/10">
            <CardContent className="py-6 text-sm text-white/70">
              Contract not found.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Card className="bg-gray-900/60 border-white/10 lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between gap-3">
                    <span className="truncate">{mine?.legalName || mine?.id || contract.mineId}</span>
                    <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/30">{String(contract.status).toUpperCase()}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-white/70">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] text-white/50">Bureau d&apos;Achat (Party C)</div>
                      <div className="mt-1 text-sm text-white">{bureauName || "Not set"}</div>
                      {contract.bureauAchatId ? (
                        <div className="mt-1 text-[11px] text-white/50">ID {contract.bureauAchatId}</div>
                      ) : null}
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] text-white/50">Participation</div>
                      <div className="mt-1 text-sm text-white">
                        {contract.principalAmount} {contract.currency}
                      </div>
                      <div className="mt-1 text-[11px] text-white/50">{returnModelLabel(contract.returnModel)}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span>{String(contract.payoutFrequency).replace("_", " ")}</span>
                    <span>{nextPayoutHint(contract)}</span>
                  </div>

                  {clock.total != null ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-white/60">
                        <span>
                          Day {clock.day} of {clock.total}
                        </span>
                        <span>{start?.toISOString().slice(0, 10)} → {end?.toISOString().slice(0, 10)}</span>
                      </div>
                      <Progress value={clock.progress ?? 0} />
                    </div>
                  ) : (
                    <p className="text-[11px] text-white/60">
                      Time window: {contract.startDate?.slice(0, 10)} → {contract.endDate?.slice(0, 10) || "-"}
                    </p>
                  )}

                  {contract.documents?.previewText ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/15 text-white/80 hover:bg-white/10"
                      onClick={() => {
                        const text = String(contract.documents?.previewText || "");
                        navigator.clipboard?.writeText?.(text);
                      }}
                    >
                      Copy preview
                    </Button>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="bg-gray-900/60 border-white/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Contract actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-white/70">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] text-white/50">Investor signature</div>
                    <div className="mt-2">
                      <Button
                        size="sm"
                        className="bg-emerald-500 text-black hover:bg-emerald-600 gap-2"
                        disabled={signMutation.isPending}
                        onClick={() => signMutation.mutate()}
                      >
                        <FileSignature className="h-4 w-4" />
                        Sign (Investor)
                      </Button>
                    </div>
                    {signMutation.isError ? (
                      <div className="mt-2 text-[11px] text-red-300">{String((signMutation.error as any)?.message || signMutation.error)}</div>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] text-white/50">Compliance</div>
                    <div className="mt-1 text-[12px] text-white/70">
                      Bureau licensing is validated from territorial registries — not from this contract screen.
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 border-white/15 text-white/80 hover:bg-white/10"
                      onClick={() => navigate("/bureaus")}
                    >
                      View Bureau d&apos;Achat registry
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-gray-900/60 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-300" />
                  Transactions (inside this contract)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {canCreateOrders ? (
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-sm font-semibold text-white">Create purchase order</div>
                    <div className="mt-1 text-[11px] text-white/60">
                      Bureau and mine are derived from the contract (no manual IDs).
                    </div>
                    {!contractCanExecuteOrders ? (
                      <div className="mt-3 text-[12px] text-white/70">
                        This contract is missing <span className="text-white">bureauAchatId</span> or <span className="text-white">mineId</span>. Add/assign parties before executing.
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <Input
                          placeholder="Gold type (dore / dust / …)"
                          value={orderForm.goldType}
                          onChange={(e) => setOrderForm((p) => ({ ...p, goldType: e.target.value }))}
                        />
                        <Input
                          placeholder="Quantity (kg)"
                          value={orderForm.quantityKg}
                          onChange={(e) => setOrderForm((p) => ({ ...p, quantityKg: e.target.value }))}
                        />
                        <Input
                          placeholder="Pricing reference"
                          value={orderForm.pricingReference}
                          onChange={(e) => setOrderForm((p) => ({ ...p, pricingReference: e.target.value }))}
                        />
                        <div className="md:col-span-3 flex items-center justify-end">
                          <Button
                            className="bg-amber-500 text-black hover:bg-amber-600"
                            disabled={createOrderMutation.isPending || !orderForm.quantityKg.trim()}
                            onClick={() => createOrderMutation.mutate()}
                          >
                            {createOrderMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Submitting…
                              </>
                            ) : (
                              "Submit purchase order"
                            )}
                          </Button>
                        </div>
                        {createOrderMutation.isError ? (
                          <div className="md:col-span-3 text-[11px] text-red-300">
                            {String((createOrderMutation.error as any)?.message || createOrderMutation.error)}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}

                <Tabs defaultValue="orders">
                  <TabsList className="bg-black/30 border border-white/10">
                    <TabsTrigger value="orders">Purchase orders</TabsTrigger>
                    <TabsTrigger value="payouts">Payouts</TabsTrigger>
                  </TabsList>
                  <TabsContent value="orders" className="mt-3">
                    <div className="space-y-2">
                      {contractOrders.map((o) => (
                        <div key={o.orderId} className="rounded-lg border border-white/10 bg-white/5 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{o.orderId}</p>
                              <p className="text-[11px] text-white/60 truncate">
                                Bureau #{o.bureauAchatId} → {o.mineId}
                              </p>
                            </div>
                            <Badge className="bg-sky-500/15 text-sky-200 border-sky-500/30">
                              {String(o.status).toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-white/60 mt-2">
                            {o.quantityKg} kg | {o.goldType}
                          </p>
                          {(session.hasRole("bureau_achat_user" as any) || session.hasRole("admin" as any)) ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-white/15 text-white/80 hover:bg-white/10"
                                onClick={() => updateOrderMutation.mutate({ orderId: o.orderId, status: "executed" })}
                                disabled={updateOrderMutation.isPending}
                              >
                                Mark executed
                              </Button>
                              <Button
                                size="sm"
                                className="bg-emerald-500 text-black hover:bg-emerald-600"
                                onClick={() => {
                                  const grossStr = window.prompt("Gross revenue (number)", "0");
                                  if (!grossStr) return;
                                  const gross = Number(grossStr);
                                  if (!Number.isFinite(gross) || gross <= 0) return;
                                  updateOrderMutation.mutate({ orderId: o.orderId, status: "settled", grossRevenue: gross });
                                }}
                                disabled={updateOrderMutation.isPending}
                              >
                                Settle (creates revenue)
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {!contractOrders.length ? (
                        <p className="text-sm text-white/60">No purchase orders for this contract yet.</p>
                      ) : null}
                    </div>
                  </TabsContent>
                  <TabsContent value="payouts" className="mt-3">
                    <div className="space-y-2">
                      {contractPayouts.map((p) => (
                        <div key={p.payoutId} className="rounded-lg border border-white/10 bg-white/5 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">
                                {p.amount} {p.currency}
                              </p>
                              <p className="text-[11px] text-white/60 truncate">{p.payoutId}</p>
                            </div>
                            <Badge className="bg-purple-500/15 text-purple-200 border-purple-500/30">
                              {String(p.status).toUpperCase()}
                            </Badge>
                          </div>
                          <div className="mt-2 text-[11px] text-white/60">
                            Due: {p.dueAt ? String(p.dueAt).slice(0, 10) : "-"} | Paid: {p.paidAt ? String(p.paidAt).slice(0, 10) : "-"}
                          </div>
                          {(session.hasRole("operator" as any) || session.hasRole("admin" as any)) && p.status !== "paid" ? (
                            <div className="mt-2">
                              <Button
                                size="sm"
                                className="bg-amber-500 text-black hover:bg-amber-600"
                                disabled={markPaidMutation.isPending}
                                onClick={() => markPaidMutation.mutate(p.payoutId)}
                              >
                                Mark paid
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {!contractPayouts.length ? (
                        <p className="text-sm text-white/60">No payouts for this contract yet.</p>
                      ) : null}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

