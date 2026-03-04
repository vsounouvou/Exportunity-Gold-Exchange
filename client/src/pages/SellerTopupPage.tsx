import { useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, QrCode } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type ResolveResponse = {
  ok: boolean;
  customer: { userId: string; displayName: string; walletShortId: string; walletAccountId: string };
  expiresAt: string;
};

type TopupResponse = {
  ok: boolean;
  amount: number;
  currency: string;
  transferId: string;
  customer: { userId: string; displayName: string; walletShortId: string };
};

function normalizeAmount(value: string) {
  const n = Math.trunc(Number(String(value || "").trim()));
  return Number.isFinite(n) ? n : 0;
}

function extractToken(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes("token=")) {
    try {
      const url = new URL(raw);
      return url.searchParams.get("token") || "";
    } catch {
      const qs = raw.split("token=")[1] || "";
      return decodeURIComponent(qs.split("&")[0] || "");
    }
  }
  return raw;
}

export default function SellerTopupPage() {
  const session = useSession();
  const { toast } = useToast();
  const [location, navigate] = useLocation();

  const params = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const tokenFromUrl = params.get("token") || "";

  const [tokenInput, setTokenInput] = useState(tokenFromUrl);
  const token = extractToken(tokenInput || tokenFromUrl);

  const [amount, setAmount] = useState("1000");
  const amountInt = normalizeAmount(amount);
  const amountValid = amountInt >= 500;

  const resolveQuery = useQuery<ResolveResponse>({
    queryKey: ["seller_topup_resolve", token],
    enabled: session.isAuthenticated && !session.isGuest && !!token,
    queryFn: async () =>
      apiRequest("/api/seller/topup/resolve", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    retry: 1,
  });

  const recentClientsQuery = useQuery<{ ok: boolean; items: Array<{ userId: string; displayName: string; lastTopupAt: string; lastAmount: number }> }>({
    queryKey: ["seller_recent_clients"],
    enabled: session.isAuthenticated && !session.isGuest,
    queryFn: async () => apiRequest("/api/seller/clients/recent", { method: "GET" }),
    staleTime: 15_000,
    retry: 1,
  });

  const topupMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/seller/topup", {
        method: "POST",
        body: JSON.stringify({ token, amount: amountInt }),
      }) as Promise<TopupResponse>,
    onSuccess: (resp) => {
      toast({
        title: "Dépôt effectué",
        description: `+${resp.amount} ${resp.currency} → ${resp.customer.displayName}`,
      });
      recentClientsQuery.refetch();
      navigate(`/seller/topup?done=1`);
    },
    onError: (err: any) => {
      toast({
        title: "Échec",
        description: err?.message || "Impossible d’effectuer le dépôt",
        variant: "destructive",
      });
    },
  });

  if (!session.isAuthenticated || session.isGuest) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  const resolved = resolveQuery.data?.customer;

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Top up client</h1>
            <p className="text-xs text-white/60 mt-1">Scan the customer QR (or open the link) then confirm the amount.</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <QrCode className="h-5 w-5 text-white/70" />
          </div>
        </div>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Customer token</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label className="text-white/70">Token or URL</Label>
            <Input
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste token or URL from QR"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />

            {token ? (
              resolveQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resolving...
                </div>
              ) : resolveQuery.isError ? (
                <div className="text-sm text-rose-300">Invalid / expired token.</div>
              ) : resolved ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                    <CheckCircle2 className="h-4 w-4" />
                    {resolved.displayName}
                  </div>
                  <div className="text-[11px] text-emerald-200/70 mt-1">
                    Wallet: {resolved.walletShortId} • Expires: {new Date(resolveQuery.data!.expiresAt).toLocaleTimeString()}
                  </div>
                </div>
              ) : null
            ) : (
              <div className="text-sm text-white/60">
                No token yet. Ask the customer to show the QR code (it opens this page with a token).
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Amount</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label className="text-white/70">Amount (XOF)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />
            <div className={`text-xs ${amountValid ? "text-white/50" : "text-rose-300"}`}>Minimum: 500 XOF</div>

            <Button
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold"
              disabled={!token || !amountValid || topupMutation.isPending || resolveQuery.isLoading || resolveQuery.isError}
              onClick={() => topupMutation.mutate()}
            >
              {topupMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm top up
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Recent clients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentClientsQuery.isLoading ? (
              <div className="text-sm text-white/60">Loading...</div>
            ) : recentClientsQuery.isError ? (
              <div className="text-sm text-rose-300">Failed to load clients.</div>
            ) : (recentClientsQuery.data?.items || []).length === 0 ? (
              <div className="text-sm text-white/60">No recent clients.</div>
            ) : (
              (recentClientsQuery.data?.items || []).slice(0, 8).map((c) => (
                <button
                  key={c.userId}
                  type="button"
                  className="w-full text-left rounded-lg border border-white/10 bg-black/30 px-3 py-2 hover:bg-white/5 transition-colors"
                  onClick={() => {
                    toast({
                      title: "Client sélectionné",
                      description: c.displayName,
                    });
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-white truncate">{c.displayName}</div>
                      <div className="text-[10px] text-white/50 truncate">
                        Last: {new Date(c.lastTopupAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-[12px] font-semibold text-emerald-300">+{c.lastAmount} XOF</div>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

