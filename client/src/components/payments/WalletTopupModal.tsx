import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

import { useScript } from "@/hooks/use-script";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

type WalletTopupInitPushResponse = {
  ok: true;
  topupId: string;
  paymentId: string;
  method: "PUSH";
  status: "PENDING" | "PAID" | "FAILED";
  providerTransactionId?: string | null;
  callbackUrl: string;
};

type WalletTopupInitResponse = WalletTopupInitWidgetResponse | WalletTopupInitPushResponse;

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

function KkiapayWidget(props: { init: KkiapayWidgetInit; sandbox: boolean }) {
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

export function WalletTopupModal(props: {
  label?: string;
  defaultAmount?: number;
  next?: string;
  autoOpen?: boolean;
  buttonClassName?: string;
}) {
  const session = useSession();
  const [, navigate] = useLocation();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"push" | "widget">(() => {
    try {
      const stored = String(localStorage.getItem("wallet_topup_preferred_method") || "").trim().toUpperCase();
      if (stored === "WIDGET") return "widget";
      if (stored === "PUSH") return "push";
    } catch {
      // ignore
    }
    return "push";
  });

  const [amount, setAmount] = useState(() => String(props.defaultAmount ?? ""));
  const [widgetInit, setWidgetInit] = useState<KkiapayWidgetInit | null>(null);
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
    if (props.autoOpen) setOpen(true);
  }, [props.autoOpen]);

  useEffect(() => {
    setAmount(String(props.defaultAmount ?? ""));
  }, [props.defaultAmount]);

  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem("wallet_topup_preferred_method", tab.toUpperCase());
    } catch {
      // ignore
    }
  }, [open, tab]);

  const parsedAmount = useMemo(() => {
    const n = Math.trunc(Number(String(amount || "").trim()));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [amount]);

  useEffect(() => {
    setWidgetInit(null);
  }, [parsedAmount, tab]);

  const startWidget = async () => {
    if (!parsedAmount) return;
    setWidgetError(null);
    setWidgetLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (session.guestSessionId) headers["x-guest-session"] = session.guestSessionId;

      const resp = (await apiRequest("/api/wallet/topups/init", {
        method: "POST",
        headers,
        body: JSON.stringify({ amount: parsedAmount, method: "WIDGET", next: props.next || null }),
      })) as WalletTopupInitResponse;

      if (resp.method !== "WIDGET") throw new Error("Unexpected response");
      setWidgetInit(resp.widget);
    } catch (err: any) {
      setWidgetError(err?.message || "Failed to start top up");
    } finally {
      setWidgetLoading(false);
    }
  };

  useEffect(() => {
    if (open && tab === "widget" && !widgetInit && !widgetLoading) {
      void startWidget();
    }
  }, [open, tab, widgetInit, widgetLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitPush = async () => {
    if (!parsedAmount) return;
    setPushError(null);
    setPushLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (session.guestSessionId) headers["x-guest-session"] = session.guestSessionId;

      const resp = (await apiRequest("/api/wallet/topups/init", {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: parsedAmount,
          method: "PUSH",
          phone: pushPhone,
          operator: pushOperator,
          next: props.next || null,
        }),
      })) as WalletTopupInitResponse;

      if (resp.method !== "PUSH") throw new Error("Unexpected response");
      setOpen(false);
      navigate(toRelativePath(resp.callbackUrl));
    } catch (err: any) {
      setPushError(err?.message || "Failed to send top up request");
    } finally {
      setPushLoading(false);
    }
  };

  const loading = widgetLoading || pushLoading;

  return (
    <>
      <Button
        className={props.buttonClassName || "bg-amber-500 hover:bg-amber-400 text-black font-semibold"}
        onClick={() => setOpen(true)}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        {props.label ?? "Top up wallet"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setWidgetError(null);
            setPushError(null);
            setWidgetInit(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl bg-black border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Top up wallet</DialogTitle>
            <DialogDescription className="text-white/60">Add credit securely (Mobile Money Push recommended).</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label className="text-white/80">Amount (XOF)</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="10000"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v === "widget" ? "widget" : "push")} className="w-full">
            <TabsList className="w-full bg-white/5 border border-white/10">
              <TabsTrigger
                value="push"
                className="flex-1 text-xs sm:text-sm data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300"
              >
                Mobile Money Push
              </TabsTrigger>
              <TabsTrigger
                value="widget"
                className="flex-1 text-xs sm:text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white"
              >
                Card / Other
              </TabsTrigger>
            </TabsList>

            <TabsContent value="push" className="mt-4 space-y-4">
              {pushError ? <div className="text-sm text-rose-300">{pushError}</div> : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-white/80">Phone number</Label>
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
                  <Label className="text-white/80">Operator</Label>
                  <Select value={pushOperator} onValueChange={setPushOperator}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select operator" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/10 text-white">
                      <SelectItem value="MTN_BJ">MTN</SelectItem>
                      <SelectItem value="MOOV_BJ">Moov</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                onClick={submitPush}
                disabled={!parsedAmount || !pushPhone || !pushOperator || pushLoading}
              >
                {pushLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Send top up request
              </Button>

              <div className="text-xs text-white/50">
                Approve the payment on your phone. This usually takes a few seconds.
              </div>
            </TabsContent>

            <TabsContent value="widget" className="mt-4 space-y-4">
              {widgetError ? <div className="text-sm text-rose-300">{widgetError}</div> : null}

              {!parsedAmount ? (
                <div className="text-sm text-white/60">Enter an amount to continue.</div>
              ) : !widgetInit ? (
                <div className="flex items-center gap-3 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing checkout...
                </div>
              ) : scriptStatus !== "ready" ? (
                <div className="flex items-center gap-3 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading payment widget...
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <KkiapayWidget init={widgetInit} sandbox={sandbox} />
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-white/50">
                <div>Amount: {parsedAmount ? `${parsedAmount} XOF` : "--"}</div>
                <div>{sandbox ? "Sandbox" : null}</div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
