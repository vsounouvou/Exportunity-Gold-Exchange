import { useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Receipt } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

type WalletTx = {
  id: number;
  direction: "CREDIT" | "DEBIT";
  amount: number;
  balanceAfter: number;
  entryType: string;
  createdAt: string;
  reference?: string | null;
  note?: string | null;
};

type MoneyOverview = {
  walletId: number;
  currency: string;
  balance: number;
  todayReceived: number;
  transactions: WalletTx[];
};

function formatMoney(value: number | string | null | undefined, currency = "XOF") {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return `0 ${currency}`;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

type WalletMode = "home" | "receive" | "send";

function modeFromPath(path: string): WalletMode {
  const normalized = String(path || "").toLowerCase();
  if (normalized.startsWith("/app/wallet/receive")) return "receive";
  if (normalized.startsWith("/app/wallet/send")) return "send";
  return "home";
}

export default function AppProWalletPage() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isGuest } = useSession();
  const { toast } = useToast();
  const [receiveAmount, setReceiveAmount] = useState("");
  const [receiveNote, setReceiveNote] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendNote, setSendNote] = useState("");

  const mode = useMemo(() => modeFromPath(location), [location]);

  const overviewQuery = useQuery<MoneyOverview>({
    queryKey: ["/api/ece/money/overview"],
    staleTime: 6_000,
    refetchInterval: 10_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  const requestMoney = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/ece/inbox/rooms/wallet/cards`, "POST", {
        kind: "request_payment",
        amount: Number.isFinite(Number(receiveAmount)) ? Number(receiveAmount) : undefined,
        currency: overviewQuery.data?.currency || "XOF",
        note: receiveNote || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/ece/money/overview"] });
      toast({ title: "Payment request created" });
      setLocation("/app/wallet");
    },
    onError: (error: any) => {
      toast({ title: "Request failed", description: error?.message || "Could not create request", variant: "destructive" });
    },
  });

  const sendMoney = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/ece/inbox/rooms/wallet/cards`, "POST", {
        kind: "pay_now",
        to: sendTo || undefined,
        amount: Number.isFinite(Number(sendAmount)) ? Number(sendAmount) : undefined,
        currency: overviewQuery.data?.currency || "XOF",
        note: sendNote || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/ece/money/overview"] });
      toast({ title: "Transfer queued" });
      setLocation("/app/wallet");
    },
    onError: (error: any) => {
      toast({ title: "Transfer failed", description: error?.message || "Could not queue transfer", variant: "destructive" });
    },
  });

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  const overview = overviewQuery.data;
  const currency = overview?.currency || "XOF";
  const transactions = overview?.transactions || [];

  return (
    <div className="min-h-screen bg-gray-950 pb-24 text-white">
      <AppProTopBar subtitle="Wallet" />
      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <Card className="border-white/10 bg-white/5" data-testid="wallet-home-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Available balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-semibold">{formatMoney(overview?.balance ?? 0, currency)}</div>
            <div className="text-xs text-white/65">Today received: {formatMoney(overview?.todayReceived ?? 0, currency)}</div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="h-11 bg-emerald-500 text-black hover:bg-emerald-400"
                data-testid="wallet-receive-button"
                onClick={() => setLocation("/app/wallet/receive")}
              >
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                Receive
              </Button>
              <Button
                className="h-11 bg-amber-500 text-black hover:bg-amber-400"
                data-testid="wallet-send-button"
                onClick={() => setLocation("/app/wallet/send")}
              >
                <ArrowUpFromLine className="mr-2 h-4 w-4" />
                Send
              </Button>
            </div>
          </CardContent>
        </Card>

        {mode === "receive" ? (
          <Card className="mt-4 border-white/10 bg-white/5" data-testid="wallet-receive-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Receive payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={receiveAmount}
                onChange={(event) => setReceiveAmount(event.target.value)}
                placeholder={`Amount (${currency})`}
                className="border-white/10 bg-white/5"
              />
              <Input
                value={receiveNote}
                onChange={(event) => setReceiveNote(event.target.value)}
                placeholder="Payment reason"
                className="border-white/10 bg-white/5"
              />
              <div className="flex items-center gap-2">
                <Button
                  className="bg-emerald-500 text-black hover:bg-emerald-400"
                  disabled={requestMoney.isPending}
                  onClick={() => requestMoney.mutate()}
                >
                  Confirm
                </Button>
                <Button variant="outline" className="border-white/20 text-white/90" onClick={() => setLocation("/app/wallet")}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {mode === "send" ? (
          <Card className="mt-4 border-white/10 bg-white/5" data-testid="wallet-send-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Send money</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={sendTo}
                onChange={(event) => setSendTo(event.target.value)}
                placeholder="Recipient (phone or handle)"
                className="border-white/10 bg-white/5"
              />
              <Input
                value={sendAmount}
                onChange={(event) => setSendAmount(event.target.value)}
                placeholder={`Amount (${currency})`}
                className="border-white/10 bg-white/5"
              />
              <Input
                value={sendNote}
                onChange={(event) => setSendNote(event.target.value)}
                placeholder="Note"
                className="border-white/10 bg-white/5"
              />
              <div className="flex items-center gap-2">
                <Button
                  className="bg-amber-500 text-black hover:bg-amber-400"
                  disabled={sendMoney.isPending}
                  onClick={() => sendMoney.mutate()}
                >
                  Confirm
                </Button>
                <Button variant="outline" className="border-white/20 text-white/90" onClick={() => setLocation("/app/wallet")}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <section className="mt-4 space-y-2" data-testid="wallet-transactions-list">
          {transactions.map((tx) => (
            <Card key={tx.id} className="border-white/10 bg-white/5">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Receipt className="h-4 w-4 text-white/65" />
                      <span>{tx.entryType || "Transaction"}</span>
                    </div>
                    <div className="mt-1 text-xs text-white/65">{tx.reference || tx.note || "Wallet operation"}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${tx.direction === "CREDIT" ? "text-emerald-300" : "text-rose-300"}`}>
                      {tx.direction === "CREDIT" ? "+" : "-"}
                      {formatMoney(tx.amount, currency)}
                    </div>
                    <div className="mt-1 text-[11px] text-white/45">{formatDateTime(tx.createdAt)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!overviewQuery.isLoading && !transactions.length ? (
            <Card className="border-white/10 bg-white/5">
              <CardContent className="p-4 text-sm text-white/70">No transactions yet.</CardContent>
            </Card>
          ) : null}
        </section>
      </main>
      <AppProBottomNav activeKey="money" />
    </div>
  );
}
