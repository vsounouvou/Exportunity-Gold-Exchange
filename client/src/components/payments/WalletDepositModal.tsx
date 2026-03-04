import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, QrCode, Store } from "lucide-react";

import { useScript } from "@/hooks/use-script";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type KkiapayWidgetInit = {
  paymentId: string;
  publicKey: string;
  amount: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  mode?: "SANDBOX" | "LIVE";
  description?: string;
};

type WalletTopupInitWidgetResponse = {
  ok: true;
  topupId: string;
  paymentId: string;
  method: "WIDGET";
  widget: KkiapayWidgetInit;
};

type FlutterwaveInitResponse = {
  ok: true;
  paymentId: string;
  tx_ref: string;
  checkout: {
    type: "redirect";
    link: string;
  };
};

type QrTokenResponse = {
  ok: true;
  token: string;
  expiresAt: string;
  url: string;
  wallet?: { id: string; shortId?: string };
  user?: { displayName?: string | null };
};

type RecentSeller = {
  sellerUserId: string;
  displayName: string | null;
  lastTopupAt: string;
  lastAmount: number;
};

function toRelativePath(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  if (raw.startsWith("/")) return raw;
  try {
    const url = new URL(raw);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatMoney(amount: number, currency = "XOF") {
  const value = Number(amount || 0);
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value) + " " + currency;
  } catch {
    return `${value} ${currency}`;
  }
}

function looksLikeAuthError(errorMessage: string | null) {
  const value = String(errorMessage || "").trim().toLowerCase();
  if (!value) return false;
  return value.includes("authentication required") || value.includes("session expired") || value.includes("forbidden");
}

function openKkiapayCheckout(opts: { init: KkiapayWidgetInit; topupId?: string | null }) {
  const runtime: any = typeof window !== "undefined" ? (window as any) : null;
  if (!runtime || typeof runtime.openKkiapayWidget !== "function") {
    throw new Error("KKiaPay widget not available (script not loaded)");
  }

  const sandbox = String(opts.init.mode || "").toUpperCase() === "SANDBOX";

  runtime.openKkiapayWidget({
    amount: Number(opts.init.amount || 0),
    key: opts.init.publicKey,
    callback: opts.init.callbackUrl,
    sandbox,
    paymentMethods: ["momo", "card", "direct_debit"],
    data: {
      reference: opts.init.reference,
      paymentId: opts.init.paymentId,
      topupId: opts.topupId || undefined,
    },
    partnerId: opts.init.reference,
  });
}

export function WalletDepositModal(props: {
  label?: string;
  next?: string;
  autoOpen?: boolean;
  buttonClassName?: string;
}) {
  const session = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "online" | "seller">("choose");
  const [onlineProvider, setOnlineProvider] = useState<"flutterwave" | "kkiapay">(() => {
    try {
      const saved = String(localStorage.getItem("wallet_online_provider") || "").trim().toLowerCase();
      return saved === "kkiapay" ? "kkiapay" : "flutterwave";
    } catch {
      return "flutterwave";
    }
  });

  const [amount, setAmount] = useState<string>("10000");
  const parsedAmount = useMemo(() => {
    const n = Math.trunc(Number(String(amount || "").trim()));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [amount]);

  const minAmount = 500;
  const amountValid = !!parsedAmount && parsedAmount >= minAmount;

  const [widgetInit, setWidgetInit] = useState<KkiapayWidgetInit | null>(null);
  const [widgetTopupId, setWidgetTopupId] = useState<string | null>(null);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const pendingWidgetOpenRef = useRef<KkiapayWidgetInit | null>(null);

  const [flutterwaveLoading, setFlutterwaveLoading] = useState(false);
  const [flutterwaveError, setFlutterwaveError] = useState<string | null>(null);
  const [flutterwaveStage, setFlutterwaveStage] = useState<"idle" | "securing" | "redirecting">("idle");

  const shouldLoadScript = open && step === "online" && onlineProvider === "kkiapay";
  const { status: scriptStatus, error: scriptError } = useScript(shouldLoadScript ? "https://cdn.kkiapay.me/k.js" : null);
  const sandbox = useMemo(() => String(widgetInit?.mode || "").toUpperCase() === "SANDBOX", [widgetInit?.mode]);

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    if (props.autoOpen) setOpen(true);
  }, [props.autoOpen]);

  useEffect(() => {
    if (!open) return;
    setStep("choose");
    try {
      localStorage.setItem("wallet_online_provider", onlineProvider);
    } catch {
      // ignore
    }
  }, [onlineProvider, open]);

  useEffect(() => {
    if (open) return;
    setWidgetInit(null);
    setWidgetTopupId(null);
    setWidgetError(null);
    setWidgetLoading(false);
    pendingWidgetOpenRef.current = null;
    setFlutterwaveError(null);
    setFlutterwaveLoading(false);
    setFlutterwaveStage("idle");
    setQrUrl(null);
    setQrExpiresAt(null);
    setQrImageUrl(null);
    setQrError(null);
    setQrLoading(false);
  }, [open]);

  const openKkiapayOnlineCheckout = async () => {
    if (!amountValid) {
      toast({ title: "Montant invalide", description: `Minimum: ${minAmount} XOF`, variant: "destructive" });
      return;
    }

    setWidgetError(null);

    try {
      let init = widgetInit;
      let topupId = widgetTopupId;

      if (!init || !topupId) {
        setWidgetLoading(true);
        const headers: Record<string, string> = {};
        if (session.guestSessionId) headers["x-guest-session"] = session.guestSessionId;

        const resp = (await apiRequest("/api/wallet/topups/init", {
          method: "POST",
          headers,
          body: JSON.stringify({ amount: parsedAmount, method: "WIDGET", next: props.next || null }),
        })) as WalletTopupInitWidgetResponse;

        if (resp.method !== "WIDGET") throw new Error("Unexpected response");
        topupId = resp.topupId;
        init = resp.widget;
        setWidgetTopupId(topupId);
        setWidgetInit(init);
      }

      if (scriptStatus !== "ready") {
        pendingWidgetOpenRef.current = init;
        toast({ title: "Chargement...", description: "Chargement du module de paiement. Reessayez dans un instant." });
        return;
      }

      openKkiapayCheckout({ init, topupId });
    } catch (err: any) {
      const message = err?.message || "Impossible d'ouvrir KKiaPay";
      if (looksLikeAuthError(message)) {
        const currentPath = `${window.location.pathname}${window.location.search}`;
        navigate(`/login?next=${encodeURIComponent(currentPath)}`);
        return;
      }
      setWidgetError(message);
    } finally {
      setWidgetLoading(false);
    }
  };

  const openFlutterwaveCheckout = async () => {
    if (!amountValid) {
      toast({ title: "Montant invalide", description: `Minimum: ${minAmount} XOF`, variant: "destructive" });
      return;
    }

    setFlutterwaveError(null);
    setFlutterwaveLoading(true);
    setFlutterwaveStage("securing");
    try {
      const headers: Record<string, string> = {};
      if (session.token) headers["Authorization"] = `Bearer ${session.token}`;

      const resp = (await apiRequest("/api/payments/flutterwave/init", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "WALLET_TOPUP",
          amount: parsedAmount,
          currency: "XOF",
          returnUrl: props.next || null,
        }),
      })) as FlutterwaveInitResponse;

      const checkoutLink = String(resp?.checkout?.link || "").trim();
      if (!checkoutLink) throw new Error("Flutterwave checkout link missing");

      setFlutterwaveStage("redirecting");
      window.location.assign(checkoutLink);
    } catch (err: any) {
      const message = err?.message || "Impossible d'ouvrir Flutterwave";
      if (looksLikeAuthError(message)) {
        const currentPath = `${window.location.pathname}${window.location.search}`;
        navigate(`/login?next=${encodeURIComponent(currentPath)}`);
        return;
      }
      setFlutterwaveError(message);
      setFlutterwaveStage("idle");
    } finally {
      setFlutterwaveLoading(false);
    }
  };

  useEffect(() => {
    if (!open || step !== "online" || onlineProvider !== "kkiapay") return;
    if (scriptStatus !== "ready") return;
    const pending = pendingWidgetOpenRef.current;
    if (!pending) return;
    pendingWidgetOpenRef.current = null;

    try {
      openKkiapayCheckout({ init: pending, topupId: widgetTopupId });
    } catch (err: any) {
      setWidgetError(err?.message || "Impossible d'ouvrir KKiaPay");
    }
  }, [onlineProvider, open, scriptStatus, step, widgetTopupId]);

  const refreshQr = async () => {
    setQrError(null);
    setQrLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (session.guestSessionId) headers["x-guest-session"] = session.guestSessionId;
      const resp = (await apiRequest("/api/wallet/qr-token", { method: "POST", headers })) as QrTokenResponse;
      if (!resp.ok) throw new Error("Unexpected response");
      setQrUrl(resp.url);
      setQrExpiresAt(resp.expiresAt);
    } catch (err: any) {
      setQrError(err?.message || "Impossible de generer le QR");
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (!open || step !== "seller") return;
    if (!qrUrl && !qrLoading) void refreshQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  useEffect(() => {
    if (!qrUrl) {
      setQrImageUrl(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const mod = await import("qrcode");
        const dataUrl = await mod.toDataURL(qrUrl, {
          margin: 1,
          width: 320,
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        if (!cancelled) setQrImageUrl(dataUrl);
      } catch (err: any) {
        if (!cancelled) setQrError(err?.message || "Impossible de generer l'image QR");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [qrUrl]);

  const recentSellersQuery = useQuery<{ ok: boolean; items: RecentSeller[] }>({
    queryKey: ["wallet_recent_sellers"],
    enabled: open && step === "seller",
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (session.guestSessionId) headers["x-guest-session"] = session.guestSessionId;
      return apiRequest("/api/wallet/sellers/recent", { headers });
    },
    staleTime: 20_000,
    retry: 1,
  });

  const recentSellers = recentSellersQuery.data?.items ?? [];

  return (
    <>
      <Button className={props.buttonClassName || "bg-amber-500 hover:bg-amber-400 text-black font-semibold"} onClick={() => setOpen(true)}>
        {props.label ?? "Depositer"}
      </Button>

      <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
        <DialogContent className="max-w-2xl bg-black border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Deposer</DialogTitle>
            <DialogDescription className="text-white/60">
              Choisissez une methode: paiement en ligne (Flutterwave ou KKiaPay) ou depot chez un vendeur (QR).
            </DialogDescription>
          </DialogHeader>

          {step === "choose" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4 text-left"
                onClick={() => setStep("online")}
              >
                <div className="flex items-center gap-2 text-white font-semibold">
                  <CreditCard className="h-4 w-4 text-amber-300" />
                  Payer en ligne
                </div>
                <div className="text-xs text-white/60 mt-1">Carte + Mobile Money (Flutterwave / KKiaPay)</div>
              </button>

              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4 text-left"
                onClick={() => setStep("seller")}
              >
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Store className="h-4 w-4 text-emerald-300" />
                  Chez un vendeur (QR)
                </div>
                <div className="text-xs text-white/60 mt-1">Montrez votre QR, le vendeur saisit le montant.</div>
              </button>
            </div>
          ) : null}

          {step === "online" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">Paiement en ligne</div>
                <Button
                  variant="outline"
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => {
                    setStep("choose");
                    setWidgetInit(null);
                    setWidgetTopupId(null);
                    setWidgetError(null);
                    setFlutterwaveError(null);
                    setFlutterwaveStage("idle");
                  }}
                >
                  Retour
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    onlineProvider === "flutterwave"
                      ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
                  )}
                  onClick={() => setOnlineProvider("flutterwave")}
                >
                  <div className="text-sm font-semibold">Flutterwave</div>
                  <div className="text-[11px] opacity-80">Card / Mobile Money</div>
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    onlineProvider === "kkiapay"
                      ? "border-amber-400/50 bg-amber-500/10 text-amber-200"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
                  )}
                  onClick={() => setOnlineProvider("kkiapay")}
                >
                  <div className="text-sm font-semibold">KKiaPay</div>
                  <div className="text-[11px] opacity-80">Mobile Money / Card</div>
                </button>
              </div>

              <div className="space-y-2">
                <Label className="text-white/80">Montant (XOF)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="10000"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  value={amount}
                  onChange={(e) => setAmount(digitsOnly(e.target.value))}
                />
                <div className={cn("text-xs", amountValid ? "text-white/50" : "text-rose-300")}>Minimum: {minAmount} XOF</div>
              </div>

              {onlineProvider === "flutterwave" && flutterwaveError ? <div className="text-sm text-rose-300">{flutterwaveError}</div> : null}
              {onlineProvider === "kkiapay" && widgetError ? <div className="text-sm text-rose-300">{widgetError}</div> : null}
              {onlineProvider === "kkiapay" && scriptError ? <div className="text-sm text-rose-300">{scriptError}</div> : null}

              {onlineProvider === "flutterwave" && flutterwaveStage !== "idle" ? (
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                  {flutterwaveStage === "securing" ? "Securing payment..." : "Redirecting to payment..."}
                </div>
              ) : null}

              <Button
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                onClick={onlineProvider === "flutterwave" ? openFlutterwaveCheckout : openKkiapayOnlineCheckout}
                disabled={!amountValid || flutterwaveLoading || widgetLoading || (onlineProvider === "kkiapay" && scriptStatus === "loading")}
              >
                {flutterwaveLoading || widgetLoading || (onlineProvider === "kkiapay" && scriptStatus === "loading") ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {onlineProvider === "flutterwave" ? "Payer avec Flutterwave" : "Ouvrir KKiaPay"}
              </Button>

              {onlineProvider === "kkiapay" && scriptStatus !== "ready" ? <div className="text-xs text-white/60">Chargement du module de paiement...</div> : null}

              {onlineProvider === "kkiapay" && widgetTopupId ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/60">
                  <div>
                    Top up: <span className="text-white/80">{widgetTopupId}</span>
                  </div>
                  {widgetInit?.callbackUrl ? (
                    <Button
                      variant="outline"
                      className="border-white/15 bg-white/5 text-white hover:bg-white/10 h-8 px-3"
                      onClick={() => navigate(toRelativePath(widgetInit.callbackUrl))}
                    >
                      Suivre le paiement
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center justify-between text-xs text-white/50">
                <div>Montant: {parsedAmount ? formatMoney(parsedAmount, "XOF") : "--"}</div>
                <div>{onlineProvider === "kkiapay" && sandbox ? "Sandbox" : null}</div>
              </div>
            </div>
          ) : null}

          {step === "seller" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">Chez un vendeur (QR)</div>
                <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => setStep("choose")}>
                  Retour
                </Button>
              </div>

              {qrError ? <div className="text-sm text-rose-300">{qrError}</div> : null}

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <QrCode className="h-4 w-4 text-emerald-300" />
                      Montrez ce code au vendeur
                    </div>
                    <div className="text-xs text-white/60">Le vendeur scanne et saisit le montant.</div>
                    {qrExpiresAt ? <div className="text-[11px] text-white/50">Expire: {new Date(qrExpiresAt).toLocaleTimeString()}</div> : null}
                  </div>
                  <Button
                    variant="secondary"
                    className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
                    disabled={qrLoading}
                    onClick={refreshQr}
                  >
                    {qrLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Regenerer
                  </Button>
                </div>

                <div className="mt-4 flex items-center justify-center">
                  {qrLoading ? (
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generation...
                    </div>
                  ) : qrImageUrl ? (
                    <img src={qrImageUrl} alt="QR topup" className="h-[220px] w-[220px] rounded-lg bg-white p-2" />
                  ) : (
                    <div className="text-sm text-white/60">QR indisponible.</div>
                  )}
                </div>

                {qrUrl ? (
                  <div className="mt-4 text-[11px] text-white/50 break-all">
                    Lien: <span className="text-white/70">{qrUrl}</span>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Mes vendeurs recents</div>
                  <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => navigate("/sellers")}>
                    Trouver un vendeur
                  </Button>
                </div>

                {recentSellersQuery.isLoading ? (
                  <div className="text-sm text-white/60">Chargement...</div>
                ) : recentSellers.length === 0 ? (
                  <div className="text-sm text-white/60">Aucun vendeur recent.</div>
                ) : (
                  <div className="space-y-2">
                    {recentSellers.slice(0, 6).map((seller) => (
                      <div
                        key={seller.sellerUserId}
                        className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-white truncate">{seller.displayName || `Vendeur ${seller.sellerUserId}`}</div>
                          <div className="text-[10px] text-white/50 truncate">
                            Dernier depot: {new Date(seller.lastTopupAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-[12px] font-semibold text-emerald-300">+{formatMoney(seller.lastAmount, "XOF")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end">
                <Button
                  variant="outline"
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["wallet_recent_sellers"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/wallet/summary"] });
                  }}
                >
                  Rafraichir
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
