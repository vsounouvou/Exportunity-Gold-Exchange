import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

import { useScript } from "@/hooks/use-script";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type KkiapayInitResponse = {
  paymentId: string;
  publicKey: string;
  amount: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  mode?: "SANDBOX" | "LIVE";
};

type KkiapayPushInitResponse = {
  paymentId: string;
  status: "PENDING" | "PAID" | "FAILED";
  providerTransactionId?: string | null;
};

function KkiapayWidget(props: { init: KkiapayInitResponse; sandbox: boolean }) {
  const widgetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;

    el.setAttribute("amount", String(props.init.amount));
    el.setAttribute("key", props.init.publicKey);
    el.setAttribute("callback", props.init.callbackUrl);
    el.setAttribute("data", JSON.stringify({ reference: props.init.reference }));

    if (props.sandbox) el.setAttribute("sandbox", "true");
    else el.removeAttribute("sandbox");
  }, [props.init, props.sandbox]);

  return <kkiapay-widget ref={widgetRef} />;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatPhone(value: string) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.startsWith("229") && digits.length > 3) {
    const rest = digits.slice(3);
    const groups = rest.match(/.{1,2}/g) ?? [];
    return `229 ${groups.join(" ")}`.trim();
  }
  const groups = digits.match(/.{1,2}/g) ?? [];
  return groups.join(" ");
}

function paymentCopy(language: string) {
  if (language === "fr") {
    return {
      payNow: "Paiement en ligne",
      title: "Paiement s\u00e9curis\u00e9",
      description: "Choisissez le moyen de paiement disponible pour votre r\u00e9gion.",
      push: "Mobile Money Push",
      widget: "Carte / autre",
      phone: "Num\u00e9ro de t\u00e9l\u00e9phone",
      operator: "Op\u00e9rateur",
      selectOperator: "Choisir un op\u00e9rateur",
      send: "Envoyer la demande de paiement",
      approve: "Validez le paiement sur votre t\u00e9l\u00e9phone. Cela prend g\u00e9n\u00e9ralement quelques secondes.",
      preparing: "Pr\u00e9paration du paiement...",
      loadingWidget: "Chargement du module de paiement...",
      amount: "Montant",
      sandbox: "Sandbox",
      startError: "Impossible de lancer le paiement",
      pushError: "Impossible d'envoyer la demande de paiement",
    };
  }

  if (language === "ar") {
    return {
      payNow: "\u0627\u0644\u062f\u0641\u0639 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a",
      title: "\u062f\u0641\u0639 \u0622\u0645\u0646",
      description: "\u0627\u062e\u062a\u0631 \u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062f\u0641\u0639 \u0627\u0644\u0645\u062a\u0627\u062d\u0629 \u0644\u0645\u0646\u0637\u0642\u062a\u0643.",
      push: "\u062f\u0641\u0639 \u0639\u0628\u0631 \u0627\u0644\u0647\u0627\u062a\u0641",
      widget: "\u0628\u0637\u0627\u0642\u0629 / \u062e\u064a\u0627\u0631 \u0622\u062e\u0631",
      phone: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641",
      operator: "\u0627\u0644\u0645\u0634\u063a\u0644",
      selectOperator: "\u0627\u062e\u062a\u0631 \u0627\u0644\u0645\u0634\u063a\u0644",
      send: "\u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628 \u0627\u0644\u062f\u0641\u0639",
      approve: "\u0623\u0643\u062f \u0627\u0644\u062f\u0641\u0639 \u0639\u0644\u0649 \u0647\u0627\u062a\u0641\u0643. \u064a\u0633\u062a\u063a\u0631\u0642 \u0630\u0644\u0643 \u0639\u0627\u062f\u0629 \u0628\u0636\u0639 \u062b\u0648\u0627\u0646.",
      preparing: "\u062c\u0627\u0631 \u062a\u062d\u0636\u064a\u0631 \u0627\u0644\u062f\u0641\u0639...",
      loadingWidget: "\u062c\u0627\u0631 \u062a\u062d\u0645\u064a\u0644 \u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u062f\u0641\u0639...",
      amount: "\u0627\u0644\u0645\u0628\u0644\u063a",
      sandbox: "\u0648\u0636\u0639 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631",
      startError: "\u062a\u0639\u0630\u0631 \u0628\u062f\u0621 \u0627\u0644\u062f\u0641\u0639",
      pushError: "\u062a\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628 \u0627\u0644\u062f\u0641\u0639",
    };
  }

  return {
    payNow: "Online payment",
    title: "Secure payment",
    description: "Choose the payment method available for your region.",
    push: "Mobile Money Push",
    widget: "Card / Other",
    phone: "Phone number",
    operator: "Operator",
    selectOperator: "Select operator",
    send: "Send payment request",
    approve: "Approve the payment on your phone. This usually takes a few seconds.",
    preparing: "Preparing checkout...",
    loadingWidget: "Loading payment widget...",
    amount: "Amount",
    sandbox: "Sandbox",
    startError: "Failed to start payment",
    pushError: "Failed to send payment request",
  };
}

export function KkiapayCheckoutButton(props: {
  orderId: number;
  buyerEmail: string;
  label?: string;
  autoOpen?: boolean;
  onPaymentCreated?: (paymentId: string) => void;
}) {
  const [, navigate] = useLocation();
  const session = useSession();
  const { language } = useLocale();
  const copy = useMemo(() => paymentCopy(language), [language]);
  const isGuestBuyer = String(props.buyerEmail || "").trim().toLowerCase().startsWith("guest:");

  const buildPaymentHeaders = () => {
    const headers: Record<string, string> = {};
    if (isGuestBuyer) {
      headers["Authorization"] = "";
      const guestIdFromOrder = String(props.buyerEmail || "").trim().slice("guest:".length);
      const guestId = guestIdFromOrder || session.guestSessionId;
      if (guestId) headers["x-guest-session"] = guestId;
      return headers;
    }

    if (session.guestSessionId) headers["x-guest-session"] = session.guestSessionId;
    return headers;
  };

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"push" | "widget">(() => {
    try {
      const stored = String(localStorage.getItem("kkiapay_preferred_method") || "").trim().toUpperCase();
      if (stored === "WIDGET") return "widget";
      if (stored === "PUSH") return "push";
    } catch {
      // ignore
    }
    return "push";
  });

  const [widgetInit, setWidgetInit] = useState<KkiapayInitResponse | null>(null);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);

  const [pushPhone, setPushPhone] = useState("");
  const [pushOperator, setPushOperator] = useState<string>("MTN_BJ");
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const shouldLoadScript = open && tab === "widget";
  const { status: scriptStatus } = useScript(shouldLoadScript ? "https://cdn.kkiapay.me/k.js" : null);

  const sandbox = useMemo(() => String(widgetInit?.mode || "").toUpperCase() === "SANDBOX", [widgetInit?.mode]);

  useEffect(() => {
    if (!props.autoOpen) return;
    setTab("widget");
    setOpen(true);
  }, [props.autoOpen]);

  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem("kkiapay_preferred_method", tab.toUpperCase());
    } catch {
      // ignore
    }
  }, [open, tab]);

  const startWidget = async () => {
    setWidgetError(null);
    setWidgetLoading(true);
    try {
      const headers = buildPaymentHeaders();
      const resp = await apiRequest("/api/payments/kkiapay/init", {
        method: "POST",
        headers,
        body: JSON.stringify({ orderId: props.orderId, buyerEmail: props.buyerEmail }),
      });
      setWidgetInit(resp);
      props.onPaymentCreated?.(resp.paymentId);
    } catch (err: any) {
      setWidgetError(err?.message || copy.startError);
    } finally {
      setWidgetLoading(false);
    }
  };

  useEffect(() => {
    if (open && tab === "widget" && !widgetInit && !widgetLoading) {
      void startWidget();
    }
  }, [open, tab, widgetInit, widgetLoading]);

  const submitPush = async () => {
    setPushError(null);
    setPushLoading(true);
    try {
      const headers = buildPaymentHeaders();

      const resp = (await apiRequest("/api/payments/kkiapay/push/init", {
        method: "POST",
        headers,
        body: JSON.stringify({
          orderId: props.orderId,
          buyerEmail: props.buyerEmail,
          phone: pushPhone,
          operator: pushOperator,
        }),
      })) as KkiapayPushInitResponse;

      props.onPaymentCreated?.(resp.paymentId);

      try {
        localStorage.setItem("kkiapay_preferred_method", "PUSH");
      } catch {
        // ignore
      }

      setOpen(false);
      navigate(`/pay/kkiapay/return?paymentId=${encodeURIComponent(String(resp.paymentId))}`);
    } catch (err: any) {
      setPushError(err?.message || copy.pushError);
    } finally {
      setPushLoading(false);
    }
  };

  const loading = widgetLoading || pushLoading;

  return (
    <>
      <Button
        className="border border-[#F5F3EC]/18 bg-[linear-gradient(135deg,#E8C873_0%,#D4AF37_52%,#A77C1E_100%)] text-[#0B0B0D] shadow-[0_12px_28px_rgba(212,175,55,0.22)] hover:brightness-110 hover:text-[#0B0B0D] font-semibold"
        onClick={() => setOpen(true)}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        {props.label ?? copy.payNow}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setWidgetError(null);
            setPushError(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl bg-black border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">{copy.title}</DialogTitle>
            <DialogDescription className="text-white/60">{copy.description}</DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v === "widget" ? "widget" : "push")} className="w-full">
            <TabsList className="w-full bg-white/5 border border-white/10">
              <TabsTrigger
                value="push"
                className="flex-1 text-xs sm:text-sm data-[state=active]:bg-[#D4AF37]/20 data-[state=active]:text-[#E8C873]"
              >
                {copy.push}
              </TabsTrigger>
              <TabsTrigger
                value="widget"
                className="flex-1 text-xs sm:text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white"
              >
                {copy.widget}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="push" className="mt-4 space-y-4">
              {pushError ? <div className="text-sm text-rose-300">{pushError}</div> : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-white/80">{copy.phone}</Label>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="229 61 00 00 00"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                    value={formatPhone(pushPhone)}
                    onChange={(e) => setPushPhone(digitsOnly(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white/80">{copy.operator}</Label>
                  <Select value={pushOperator} onValueChange={setPushOperator}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder={copy.selectOperator} />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/10 text-white">
                      <SelectItem value="MTN_BJ">MTN</SelectItem>
                      <SelectItem value="MOOV_BJ">Moov</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                className="w-full bg-[#D4AF37] hover:bg-[#E8C873] text-[#0B0B0D] font-semibold"
                onClick={submitPush}
                disabled={!pushPhone || !pushOperator || pushLoading}
              >
                {pushLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {copy.send}
              </Button>

              <div className="text-xs text-white/50">
                {copy.approve}
              </div>
            </TabsContent>

            <TabsContent value="widget" className="mt-4 space-y-4">
              {widgetError ? <div className="text-sm text-rose-300">{widgetError}</div> : null}

              {!widgetInit ? (
                <div className="flex items-center gap-3 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {copy.preparing}
                </div>
              ) : scriptStatus !== "ready" ? (
                <div className="flex items-center gap-3 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {copy.loadingWidget}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <KkiapayWidget init={widgetInit} sandbox={sandbox} />
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-white/50">
                <div>{copy.amount}: {widgetInit ? `${widgetInit.amount} ${widgetInit.currency}` : "--"}</div>
                <div>{sandbox ? copy.sandbox : null}</div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
