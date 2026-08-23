import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Copy, Download, QrCode, Receipt, SendHorizontal, Wallet } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { ProSideNav } from "@/components/agentic/ProSideNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  pendingAmount: number;
  disputeCount: number;
  feesToday: number;
  taxEstimate: number;
  transactions: WalletTx[];
};

type MoneySection = "wallet" | "transactions" | "reports";
type MoneyModal = "receive" | "send" | null;

const MONEY_SECTIONS: MoneySection[] = ["wallet", "transactions", "reports"];
const MONEY_SECTIONS_SET = new Set<string>(MONEY_SECTIONS);

function normalizeMoneySection(value: unknown): MoneySection | null {
  const normalized = String(value || "").trim().toLowerCase();
  return MONEY_SECTIONS_SET.has(normalized) ? (normalized as MoneySection) : null;
}

function parseSectionFromPath(pathname: string): MoneySection | null {
  const match = String(pathname || "").match(/^\/(?:pro|app)\/money\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  return normalizeMoneySection(match[1]);
}

function parseMoneyLocation(pathname: string, search: string): { section: MoneySection; modal: MoneyModal } {
  const fromPath = parseSectionFromPath(pathname);
  try {
    const parsed = new URLSearchParams(search || "");
    const tab = String(parsed.get("tab") || "").trim().toLowerCase();
    const modal = String(parsed.get("modal") || "").trim().toLowerCase();

    const section: MoneySection = fromPath
      ? fromPath
      : tab === "reports" || tab === "tax"
        ? "reports"
        : tab === "transactions"
          ? "transactions"
          : "wallet";

    const resolvedModal: MoneyModal =
      modal === "receive" || tab === "receive"
        ? "receive"
        : modal === "send" || tab === "send"
          ? "send"
          : null;

    return { section, modal: resolvedModal };
  } catch {
    // ignore parse errors
  }
  return { section: fromPath || "wallet", modal: null };
}

function moneyUrl(section: MoneySection, modal: MoneyModal) {
  const params = new URLSearchParams();
  if (modal) params.set("modal", modal);
  const qs = params.toString();
  const base = section === "wallet" ? "/pro/money" : `/pro/money/${section}`;
  return qs ? `${base}?${qs}` : base;
}

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

export default function AppProMoneyPage() {
  const { isAuthenticated, isGuest } = useSession();
  const [location, setLocation] = useLocation();
  const [, proParams] = useRoute("/pro/money/:section");
  const [, appParams] = useRoute("/app/money/:section");
  const { toast } = useToast();
  const [section, setSection] = useState<MoneySection>("wallet");
  const [modal, setModal] = useState<MoneyModal>(null);
  const [receiveAmount, setReceiveAmount] = useState("");
  const [receiveNote, setReceiveNote] = useState("");
  const [receiveDueDate, setReceiveDueDate] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  const overviewQuery = useQuery<MoneyOverview>({
    queryKey: ["/api/ece/money/overview"],
    staleTime: 6_000,
    refetchInterval: 10_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  useEffect(() => {
    const routeSection = normalizeMoneySection((proParams as any)?.section || (appParams as any)?.section);
    const currentSearch = typeof window === "undefined" ? "" : window.location.search;
    const next = parseMoneyLocation(routeSection ? `/pro/money/${routeSection}` : location, currentSearch);
    if (next.section !== section) setSection(next.section);
    if (next.modal !== modal) setModal(next.modal);
  }, [appParams, location, modal, proParams, section]);

  const paymentLink = useMemo(() => {
    const amount = Number(receiveAmount || "0");
    const base = typeof window !== "undefined" ? window.location.origin : "https://boursedelor.com";
    const params = new URLSearchParams();
    if (amount > 0) params.set("amount", String(Math.trunc(amount)));
    if (receiveNote.trim()) params.set("note", receiveNote.trim());
    return `${base}/pro/money?${params.toString()}`;
  }, [receiveAmount, receiveNote]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(paymentLink, { margin: 1, width: 280 })
      .then((data) => {
        if (!cancelled) setQrDataUrl(data);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [paymentLink]);

  const requestMoney = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/ece/inbox/rooms/wallet/cards`, "POST", {
        kind: "request_payment",
        amount: Number.isFinite(Number(receiveAmount)) ? Number(receiveAmount) : undefined,
        currency: overviewQuery.data?.currency || "XOF",
        note: receiveNote || undefined,
        dueDate: receiveDueDate || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/ece/money/overview"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/ece/inbox/rooms/wallet/messages"] });
      toast({ title: "Request created", description: "Payment request posted in Wallet thread." });
      setReceiveAmount("");
      setReceiveNote("");
      setReceiveDueDate("");
      setModal(null);
      setLocation(moneyUrl(section, null), { replace: true });
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
      await queryClient.invalidateQueries({ queryKey: ["/api/ece/inbox/rooms/wallet/messages"] });
      toast({ title: "Transfer queued", description: "Send action posted in Wallet thread." });
      setSendTo("");
      setSendAmount("");
      setSendNote("");
      setModal(null);
      setLocation(moneyUrl(section, null), { replace: true });
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

  const exportStatement = () => {
    if (!transactions.length) return;
    const lines = [
      "id,date,direction,entryType,amount,balanceAfter,reference,note",
      ...transactions.map((tx) =>
        [
          tx.id,
          tx.createdAt,
          tx.direction,
          tx.entryType,
          tx.amount,
          tx.balanceAfter,
          JSON.stringify(tx.reference || ""),
          JSON.stringify(tx.note || ""),
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wallet-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-32 text-[#07111F]">
      <ProSideNav activeKey="money" />
      <div className="md:ml-56">
        <AppProTopBar subtitle="Money" />
        <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="text-[11px] font-bold text-slate-500">Wallet balance</div>
            <div className="mt-2 text-3xl font-black">{formatMoney(overview?.balance ?? 0, currency)}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-bold text-slate-500">Available</div>
                <div className="mt-1 text-sm font-black">{formatMoney(overview?.balance ?? 0, currency)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-bold text-slate-500">Pending</div>
                <div className="mt-1 text-sm font-black">{formatMoney(overview?.pendingAmount ?? 0, currency)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            className="h-11 bg-emerald-500 text-black hover:bg-emerald-400"
            onClick={() => {
              setModal("receive");
              setLocation(moneyUrl(section, "receive"), { replace: true });
            }}
            data-testid="pro-money-receive-button"
          >
            Receive
          </Button>
          <Button
            className="h-11 bg-amber-500 text-black hover:bg-amber-400"
            onClick={() => {
              setModal("send");
              setLocation(moneyUrl(section, "send"), { replace: true });
            }}
            data-testid="pro-money-send-button"
          >
            Send
          </Button>
        </div>

        <Tabs
          value={section}
          onValueChange={(next) => {
            const safe = (next === "transactions" || next === "reports" ? next : "wallet") as MoneySection;
            setSection(safe);
            setLocation(moneyUrl(safe, null), { replace: true });
          }}
          className="mt-4"
        >
          <TabsList className="grid w-full grid-cols-3 border border-slate-200 bg-white">
            <TabsTrigger value="wallet" data-testid="pro-money-tab-wallet">Wallet</TabsTrigger>
            <TabsTrigger value="transactions" data-testid="pro-money-tab-transactions">Transactions</TabsTrigger>
            <TabsTrigger value="reports" data-testid="pro-money-tab-reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="wallet" className="mt-4 space-y-3" data-testid="pro-money-wallet-tab">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Wallet className="h-4 w-4 text-[#9A6200]" />
                  Wallet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Wallet ID</span>
                  <span className="font-bold">{overview?.walletId ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Currency</span>
                  <span className="font-bold">{currency}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="mt-4 space-y-3" data-testid="pro-money-transactions-tab">
            {transactions.map((tx) => (
              <Card key={tx.id} className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black">{tx.entryType || "Transaction"}</div>
                      <div className="mt-1 text-xs text-slate-500">{tx.reference || tx.note || "Wallet operation"}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-black ${tx.direction === "CREDIT" ? "text-emerald-700" : "text-rose-700"}`}>
                        {tx.direction === "CREDIT" ? "+" : "-"}
                        {formatMoney(tx.amount, currency)}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">{formatDateTime(tx.createdAt)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {!overviewQuery.isLoading && !transactions.length ? (
              <Card className="border-slate-200 bg-white">
                <CardContent className="p-5 text-sm text-slate-600">No transactions yet.</CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="reports" className="mt-4 space-y-3" data-testid="pro-money-reports-tab">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Reports</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Fees today</span>
                  <span className="font-bold">{formatMoney(overview?.feesToday ?? 0, currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Tax estimate</span>
                  <span className="font-bold">{formatMoney(overview?.taxEstimate ?? 0, currency)}</span>
                </div>
                <Button
                  variant="outline"
                  className="mt-3 w-full border-slate-200 text-slate-700"
                  onClick={exportStatement}
                  disabled={!transactions.length}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export statement
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog
          open={modal === "receive"}
          onOpenChange={(open) => {
            if (open) return;
            setModal(null);
            setLocation(moneyUrl(section, null), { replace: true });
          }}
        >
          <DialogContent className="border-slate-200 bg-white text-[#07111F]" data-testid="pro-money-receive-modal">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <QrCode className="h-4 w-4 text-[#9A6200]" />
                Receive
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                value={receiveAmount}
                onChange={(event) => setReceiveAmount(event.target.value)}
                placeholder={`Amount (${currency})`}
                className="border-slate-200 bg-white"
              />
              <Input
                value={receiveNote}
                onChange={(event) => setReceiveNote(event.target.value)}
                placeholder="Payment reason"
                className="border-slate-200 bg-white"
              />
              <Input
                value={receiveDueDate}
                onChange={(event) => setReceiveDueDate(event.target.value)}
                placeholder="Due date (optional)"
                className="border-slate-200 bg-white"
              />

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Payment link</div>
                <div className="mt-1 break-all text-xs text-slate-700">{paymentLink}</div>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-200 text-slate-700"
                    onClick={async () => {
                      await navigator.clipboard.writeText(paymentLink);
                      toast({ title: "Copied", description: "Payment link copied." });
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy link
                  </Button>
                </div>
              </div>

              {qrDataUrl ? (
                <div className="flex justify-center">
                  <img src={qrDataUrl} alt="Payment QR code" className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-2" />
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  className="border-slate-200 text-slate-600"
                  onClick={() => {
                    setModal(null);
                    setLocation(moneyUrl(section, null), { replace: true });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-amber-500 text-black hover:bg-amber-400"
                  disabled={requestMoney.isPending}
                  onClick={() => requestMoney.mutate()}
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  Create request
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={modal === "send"}
          onOpenChange={(open) => {
            if (open) return;
            setModal(null);
            setLocation(moneyUrl(section, null), { replace: true });
          }}
        >
          <DialogContent className="border-slate-200 bg-white text-[#07111F]" data-testid="pro-money-send-modal">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <SendHorizontal className="h-4 w-4 text-[#9A6200]" />
                Send
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                value={sendTo}
                onChange={(event) => setSendTo(event.target.value)}
                placeholder="Recipient phone or email"
                className="border-slate-200 bg-white"
              />
              <Input
                value={sendAmount}
                onChange={(event) => setSendAmount(event.target.value)}
                placeholder={`Amount (${currency})`}
                className="border-slate-200 bg-white"
              />
              <Input
                value={sendNote}
                onChange={(event) => setSendNote(event.target.value)}
                placeholder="Transfer note"
                className="border-slate-200 bg-white"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  className="border-slate-200 text-slate-600"
                  onClick={() => {
                    setModal(null);
                    setLocation(moneyUrl(section, null), { replace: true });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-amber-500 text-black hover:bg-amber-400"
                  disabled={sendMoney.isPending}
                  onClick={() => sendMoney.mutate()}
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Queue transfer
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </main>

        <AppProBottomNav activeKey="money" />
      </div>
    </div>
  );
}
