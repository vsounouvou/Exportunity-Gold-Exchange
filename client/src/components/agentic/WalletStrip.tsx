import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

type LedgerEntry = {
  direction?: "CREDIT" | "DEBIT";
  amount?: number;
  createdAt?: string;
};

type WalletSummaryResponse = {
  ok: boolean;
  wallet: {
    id: string;
    currency: string;
    balance: number;
    status: string;
    kycLevel: string;
  };
  recent: LedgerEntry[];
  payout?: {
    minAmount?: number;
    fee?: { fixed?: number; pct?: number };
    methods?: string[];
  };
};

function formatMoney(amount: number, currency: string) {
  const value = Number(amount || 0);
  const cur = currency || "XOF";
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value) + " " + cur;
  } catch {
    return `${value} ${cur}`;
  }
}

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function WalletStrip({
  className,
  href = "/pro/money",
  topOffset = 0,
  sticky = true,
}: {
  className?: string;
  href?: string;
  topOffset?: number;
  sticky?: boolean;
}) {
  const { data, isLoading } = useQuery<WalletSummaryResponse>({
    queryKey: ["/api/wallet/summary"],
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  const computed = useMemo(() => {
    const currency = data?.wallet?.currency || "XOF";
    const balance = Number(data?.wallet?.balance || 0);
    const today = new Date();
    const todayNet = (data?.recent || []).reduce((sum, entry) => {
      if (!entry?.createdAt) return sum;
      const created = new Date(entry.createdAt);
      if (Number.isNaN(created.getTime())) return sum;
      if (!isSameLocalDay(created, today)) return sum;
      const amount = Number(entry.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) return sum;
      if (entry.direction === "DEBIT") return sum - amount;
      return sum + amount;
    }, 0);

    return { currency, balance, todayNet };
  }, [data]);

  return (
    <div
      className={cn(sticky ? "sticky z-40" : "relative z-10", "border-b border-slate-200 bg-white/95 text-[#07111F] backdrop-blur-xl", className)}
      style={sticky ? { top: `${Math.max(0, Number(topOffset) || 0)}px` } : undefined}
      data-testid="wallet-strip"
    >
      <Link href={href}>
        <div className="px-4 py-2 flex items-center justify-between cursor-pointer" data-testid="wallet-strip-link">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs leading-none text-slate-500">Wallet</div>
              <div className="truncate text-sm font-black text-slate-950">
                {isLoading ? "Loading..." : formatMoney(computed.balance, computed.currency)}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] leading-none text-slate-400">Today</div>
            <div
              className={cn(
                "text-xs font-medium",
                computed.todayNet > 0 ? "text-emerald-700" : computed.todayNet < 0 ? "text-red-700" : "text-slate-600",
              )}
            >
              {isLoading ? "—" : (computed.todayNet > 0 ? "+" : "") + formatMoney(computed.todayNet, computed.currency)}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
