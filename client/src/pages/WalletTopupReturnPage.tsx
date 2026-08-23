import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type TopupStatus = "INITIATED" | "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED";

type LegacyTopupStatusResponse = {
  ok: boolean;
  topup: { id: string; status: TopupStatus; amount: number; currency: string } | null;
  payment: { id: string; status: string; providerTransactionId: string | null } | null;
};

type FlutterwaveStatusResponse = {
  ok: boolean;
  payment: {
    id: string;
    status: string;
    rawStatus: string;
    amount: number;
    currency: string;
    providerTransactionId: string | null;
    providerTxRef: string | null;
    purpose: string;
    targetType: string;
    targetId: string;
    creditedAt: string | null;
  } | null;
  topup: {
    id: string;
    status: TopupStatus;
    amount: number;
    currency: string;
  } | null;
  industrialOrder: {
    id: string;
    referenceCode: string;
    status: string;
    paymentStatus: string;
    paidAmount: number | null;
    paidCurrencyCode: string | null;
    paidAt: string | null;
  } | null;
};

function normalizeNext(value: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("://")) return null;
  return raw;
}

function mapPaymentStatusToTopupStatus(statusRaw: unknown): TopupStatus {
  const normalized = String(statusRaw || "").trim().toLowerCase();
  if (normalized === "paid" || normalized === "success" || normalized === "succeeded") return "PAID";
  if (normalized === "failed") return "FAILED";
  if (normalized === "cancelled" || normalized === "canceled") return "CANCELLED";
  if (normalized === "expired") return "EXPIRED";
  return "PENDING";
}

function looksLikeAuthError(errorMessage: string | null) {
  const value = String(errorMessage || "").trim().toLowerCase();
  if (!value) return false;
  return value.includes("authentication required") || value.includes("session expired") || value.includes("forbidden");
}

export function WalletTopupReturnPage() {
  const session = useSession();
  const [, navigate] = useLocation();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const topupId = params.get("topupId") || "";
  const paymentId = params.get("paymentId") || "";
  const next = normalizeNext(params.get("next"));
  const transactionId =
    params.get("transactionId") || params.get("transaction_id") || params.get("transaction") || params.get("id") || "";
  const txRef = params.get("tx_ref") || params.get("txRef") || "";

  const startedAtRef = useRef<number>(Date.now());
  const sentTxnRef = useRef(false);
  const [status, setStatus] = useState<TopupStatus>("PENDING");
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountLabel, setAmountLabel] = useState<string | null>(null);
  const [paymentPurpose, setPaymentPurpose] = useState<string | null>(null);
  const [industrialOrderReference, setIndustrialOrderReference] = useState<string | null>(null);

  const elapsedMs = Date.now() - startedAtRef.current;
  const progress = Math.min(100, Math.round((elapsedMs / 60000) * 100));

  const fetchStatus = useCallback(async () => {
    if (!topupId && !paymentId) return;
    try {
      const headers: Record<string, string> = {};
      if (session.guestSessionId) headers["x-guest-session"] = session.guestSessionId;
      if (session.token) headers["Authorization"] = `Bearer ${session.token}`;

      if (paymentId) {
        const qs = new URLSearchParams({ paymentId });
        if (transactionId && !sentTxnRef.current) {
          qs.set("transactionId", transactionId);
          sentTxnRef.current = true;
        }
        if (txRef) qs.set("tx_ref", txRef);

        const resp = (await apiRequest(`/api/payments/flutterwave/status?${qs.toString()}`, { headers })) as FlutterwaveStatusResponse;
        const topupStatus = resp.topup?.status ?? mapPaymentStatusToTopupStatus(resp.payment?.rawStatus || resp.payment?.status);
        const amount = resp.topup?.amount ?? resp.payment?.amount ?? 0;
        const currency = resp.topup?.currency ?? resp.payment?.currency ?? "XOF";

        setStatus(topupStatus);
        setAmountLabel(`${amount} ${currency}`);
        setPaymentPurpose(resp.payment?.purpose || null);
        setIndustrialOrderReference(resp.industrialOrder?.referenceCode || null);
        setError(null);
        setLoading(false);

        if (topupStatus === "PAID") {
          queryClient.invalidateQueries({ queryKey: ["/api/wallet/summary"] });
          queryClient.invalidateQueries({ queryKey: ["/api/wallet/ledger"] });
          if (resp.payment?.purpose === "INDUSTRIAL_ORDER_PAYMENT") {
            queryClient.invalidateQueries({ queryKey: ["/api/industrial/orders"] });
          }
          setDone(true);
          if (next) navigate(next);
          return;
        }

        if (topupStatus === "FAILED" || topupStatus === "CANCELLED" || topupStatus === "EXPIRED") {
          setDone(true);
        }
        return;
      }

      const qs = new URLSearchParams({ topupId });
      if (transactionId && !sentTxnRef.current) {
        qs.set("transactionId", transactionId);
        sentTxnRef.current = true;
      }
      const resp = (await apiRequest(`/api/wallet/topups/status?${qs.toString()}`, { headers })) as LegacyTopupStatusResponse;
      const topup = resp.topup;
      if (!topup) throw new Error("Top up not found");

      setStatus(topup.status);
      setAmountLabel(`${topup.amount} ${topup.currency || "XOF"}`);
      setError(null);
      setLoading(false);

      if (topup.status === "PAID") {
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/summary"] });
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/ledger"] });
        setDone(true);
        if (next) navigate(next);
      }
      if (topup.status === "FAILED" || topup.status === "CANCELLED" || topup.status === "EXPIRED") {
        setDone(true);
      }
    } catch (err: any) {
      const message = err?.message || "Failed to confirm top up";
      if (looksLikeAuthError(message)) {
        const currentPath = `${window.location.pathname}${window.location.search}`;
        navigate(`/login?next=${encodeURIComponent(currentPath)}`);
        return;
      }
      setLoading(false);
      setError(message);
    }
  }, [navigate, next, paymentId, session.guestSessionId, session.token, topupId, transactionId, txRef]);

  useEffect(() => {
    startedAtRef.current = Date.now();
    sentTxnRef.current = false;
  }, [topupId, paymentId]);

  useEffect(() => {
    if (!topupId && !paymentId) {
      setLoading(false);
      setError("Missing topupId/paymentId.");
      return;
    }

    let cancelled = false;
    let interval: number | null = null;

    const tick = async () => {
      if (cancelled || done) return;
      await fetchStatus();
      if (Date.now() - startedAtRef.current > 60000) {
        setLoading(false);
        setDone(true);
      }
    };

    tick();
    interval = window.setInterval(tick, 2000);

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [done, fetchStatus, paymentId, topupId]);

  const isIndustrialPayment = paymentPurpose === "INDUSTRIAL_ORDER_PAYMENT";
  const meta = useMemo(() => {
    const subject = isIndustrialPayment ? "Payment" : "Top up";
    if (status === "PAID") return { title: `${subject} confirmed`, icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" /> };
    if (status === "FAILED") return { title: `${subject} failed`, icon: <XCircle className="h-5 w-5 text-rose-400" /> };
    if (status === "CANCELLED") return { title: `${subject} cancelled`, icon: <XCircle className="h-5 w-5 text-rose-400" /> };
    if (status === "EXPIRED") return { title: `${subject} expired`, icon: <XCircle className="h-5 w-5 text-rose-300" /> };
    return { title: `Confirming ${subject.toLowerCase()}...`, icon: <Loader2 className="h-5 w-5 animate-spin text-amber-400" /> };
  }, [isIndustrialPayment, status]);

  const isPending = status !== "PAID" && status !== "FAILED" && status !== "CANCELLED" && status !== "EXPIRED" && !done;
  const backTarget = next || "/orders";

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <Card className="w-full max-w-lg bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {meta.icon}
            <span>{meta.title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-white/60">
            {topupId ? <div className="break-all">Top up: {topupId}</div> : null}
            {paymentId ? <div className="break-all">Payment: {paymentId}</div> : null}
            {industrialOrderReference ? <div>Order: {industrialOrderReference}</div> : null}
            {amountLabel ? <div>Amount: {amountLabel}</div> : null}
          </div>

          {isPending ? (
            <div className="space-y-2">
              <Progress value={progress} className="h-2 bg-white/10" />
              <div className="text-xs text-white/50">Waiting for confirmation ({Math.max(0, 60 - Math.floor(elapsedMs / 1000))}s)</div>
            </div>
          ) : null}

          {error ? <div className="text-sm text-rose-300">{error}</div> : null}

          {done && status === "PENDING" ? (
            <div className="text-sm text-white/60">
              {isIndustrialPayment ? "Your payment" : "Your top up"} is still pending. It may take a moment to confirm. You can refresh this page or keep checking later.
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => navigate(backTarget)}>
              Back
            </Button>
            <Button className="bg-amber-500 hover:bg-amber-400 text-black font-semibold" onClick={fetchStatus} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
