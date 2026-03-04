import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type StatusResponse = {
  paymentId: string;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
  providerTransactionId?: string | null;
  orderNumber?: string | null;
};

export function KkiapayReturnPage() {
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const paymentId = params.get("paymentId") || "";
  const transactionId = params.get("transactionId") || params.get("transaction_id") || "";

  const startedAtRef = useRef<number>(Date.now());
  const [status, setStatus] = useState<StatusResponse["status"]>("PENDING");
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const elapsedMs = Date.now() - startedAtRef.current;
  const progress = Math.min(100, Math.round((elapsedMs / 60000) * 100));

  const fetchStatus = useCallback(async () => {
    if (!paymentId) return;
    try {
      const qs = new URLSearchParams({ paymentId });
      if (transactionId) qs.set("transactionId", transactionId);
      const resp = (await apiRequest(`/api/payments/kkiapay/status?${qs.toString()}`)) as StatusResponse;
      setStatus(resp.status);
      setOrderNumber(resp.orderNumber ?? null);
      setError(null);
      setLoading(false);

      if (resp.status === "PAID") {
        setDone(true);
        navigate(resp.orderNumber ? `/orders/${encodeURIComponent(resp.orderNumber)}` : "/orders");
      }
      if (resp.status === "FAILED" || resp.status === "CANCELLED" || resp.status === "REFUNDED") {
        setDone(true);
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || "Failed to confirm payment");
    }
  }, [navigate, paymentId, transactionId]);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, [paymentId]);

  useEffect(() => {
    if (!paymentId) {
      setLoading(false);
      setError("Missing paymentId.");
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
  }, [done, fetchStatus, paymentId]);

  const meta = useMemo(() => {
    if (status === "PAID") return { title: "Payment confirmed", icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" /> };
    if (status === "FAILED") return { title: "Payment failed", icon: <XCircle className="h-5 w-5 text-rose-400" /> };
    if (status === "CANCELLED") return { title: "Payment cancelled", icon: <XCircle className="h-5 w-5 text-rose-400" /> };
    if (status === "REFUNDED") return { title: "Payment refunded", icon: <XCircle className="h-5 w-5 text-rose-300" /> };
    return { title: "Confirming payment...", icon: <Loader2 className="h-5 w-5 animate-spin text-amber-400" /> };
  }, [status]);

  const isPending = status === "PENDING" && !done;

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
            {orderNumber ? <div>Order: {orderNumber}</div> : null}
            <div className="break-all">Payment: {paymentId || "--"}</div>
          </div>

          {isPending ? (
            <div className="space-y-2">
              <Progress value={progress} className="h-2 bg-white/10" />
              <div className="text-xs text-white/50">
                Waiting for confirmation... ({Math.max(0, 60 - Math.floor(elapsedMs / 1000))}s)
              </div>
            </div>
          ) : null}

          {error ? <div className="text-sm text-rose-300">{error}</div> : null}

          {done && status === "PENDING" ? (
            <div className="text-sm text-white/60">
              Payment is still pending. It may take a moment to confirm. You can refresh this page or check your orders.
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={() => navigate(orderNumber ? `/orders/${encodeURIComponent(orderNumber)}` : "/orders")}
            >
              View order
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
              onClick={fetchStatus}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
