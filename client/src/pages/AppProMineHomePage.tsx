import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, History, Pickaxe, TrendingUp } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { ProSideNav } from "@/components/agentic/ProSideNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

type MineOverview = {
  companyId: number;
  unit: "grams";
  today: string;
  todayTotalGrams: number;
  todayEntries: Array<{
    id: string;
    siteId: string;
    gramsTotal: number;
    purityPercent: number | null;
    shift: "AM" | "PM" | null;
    notes: string | null;
    updatedAt: string | null;
    recordedByUserId: number;
  }>;
  last7Days: Array<{ date: string; gramsTotal: number }>;
  monthToDateGrams: number;
};

type MineHistoryRow = {
  id: string;
  date: string;
  siteId: string;
  gramsTotal: number;
  purityPercent: number | null;
  shift: "AM" | "PM" | null;
  notes: string | null;
  updatedAt: string | null;
};

function parsePositiveNumber(raw: string) {
  const cleaned = raw.trim().replace(",", ".");
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function formatProduction(grams: number) {
  if (!Number.isFinite(grams)) return "0 g";
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(kg)} kg`;
  }
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(grams)} g`;
}

function Sparkline({ series }: { series: Array<{ date: string; gramsTotal: number }> }) {
  const max = Math.max(1, ...series.map((d) => Number(d.gramsTotal || 0)));
  return (
    <div className="flex h-12 items-end gap-1">
      {series.map((d) => {
        const pct = Math.max(0, Math.min(1, Number(d.gramsTotal || 0) / max));
        return (
          <div key={d.date} className="flex-1">
            <div
              className="w-full rounded-md bg-amber-400/70"
              style={{ height: `${Math.max(2, Math.round(pct * 48))}px` }}
              title={`${d.date}: ${formatProduction(Number(d.gramsTotal || 0))}`}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function AppProMineHomePage() {
  const { isAuthenticated, isGuest, user } = useSession();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const roles = useMemo(() => new Set<string>(Array.isArray(user?.roles) ? user!.roles.map(String) : []), [user?.roles]);
  const mode = String(user?.currentMode || "").toLowerCase();
  const isMine = roles.has("mine_operator") || roles.has("mine_owner") || roles.has("gold_miner") || mode === "mine_operator" || mode === "mine_owner";

  const [unit, setUnit] = useState<"g" | "kg">("g");
  const [amount, setAmount] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [purityPercent, setPurityPercent] = useState("");
  const [siteName, setSiteName] = useState("");
  const [shift, setShift] = useState<"AM" | "PM" | "">("");
  const [notes, setNotes] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const overviewQuery = useQuery<MineOverview>({
    queryKey: ["/api/ece/mine/production/overview"],
    staleTime: 8_000,
    refetchInterval: 15_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest && isMine,
  });

  const historyQuery = useQuery<{ rows: MineHistoryRow[] }>({
    queryKey: ["/api/ece/mine/production/history?limit=60"],
    staleTime: 15_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest && isMine && historyOpen,
  });

  const todayDefault = useMemo(() => {
    const entries = overviewQuery.data?.todayEntries || [];
    return entries.find((e) => String(e.siteId || "").toLowerCase() === "default") || null;
  }, [overviewQuery.data?.todayEntries]);

  useEffect(() => {
    if (!todayDefault) return;
    // Only hydrate the form when it is empty, so edits are not overwritten.
    if (amount.trim()) return;
    setUnit("g");
    setAmount(String(todayDefault.gramsTotal ?? ""));
    setPurityPercent(todayDefault.purityPercent === null ? "" : String(todayDefault.purityPercent));
    setSiteName(todayDefault.siteId && todayDefault.siteId !== "default" ? todayDefault.siteId : "");
    setShift(todayDefault.shift || "");
    setNotes(todayDefault.notes || "");
  }, [amount, todayDefault]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const numeric = parsePositiveNumber(amount);
      if (!numeric) throw new Error("Entrez une quantite valide.");
      const grams = unit === "kg" ? numeric * 1000 : numeric;
      const gramsRounded = Math.round(grams * 1000) / 1000;

      const purity = purityPercent.trim() ? Number(purityPercent.trim().replace(",", ".")) : null;
      if (purity !== null && (!Number.isFinite(purity) || purity < 0 || purity > 100)) {
        throw new Error("La purete doit etre entre 0 et 100.");
      }

      return apiRequest("/api/ece/mine/production/today", "POST", {
        gramsTotal: gramsRounded,
        purityPercent: purity,
        siteId: siteName.trim() || undefined,
        shift: shift || undefined,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/ece/mine/production/overview"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/ece/mine/production/history?limit=60"] }),
      ]);
      toast({ title: "Enregistre", description: "Production du jour mise a jour." });
    },
    onError: (error: any) => {
      toast({ title: "Impossible d'enregistrer", description: error?.message || "Erreur", variant: "destructive" });
    },
  });

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  if (!isMine) {
    return <Redirect to="/pro/operations" />;
  }

  const overview = overviewQuery.data;
  const last7Days = overview?.last7Days || [];
  const todayTotal = overview?.todayTotalGrams ?? 0;
  const monthToDate = overview?.monthToDateGrams ?? 0;

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-24 text-slate-950">
      <ProSideNav activeKey="operations" />
      <div className="md:ml-56">
        <AppProTopBar subtitle="Mine" />
        <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
          <Card className="border-[#F5A623]/40 bg-[#FFF7E6] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Pickaxe className="h-5 w-5 text-[#B26F00]" />
                Production Today
              </CardTitle>
              <div className="text-xs text-slate-600">How much did you produce today?</div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                <div>
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Quantity</div>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={unit === "kg" ? "1.25" : "750"}
                    inputMode="decimal"
                    className="mt-2 border-slate-200 bg-white text-slate-950 placeholder:text-slate-400"
                    disabled={saveMutation.isPending}
                    data-testid="mine-production-amount"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    variant={unit === "g" ? "default" : "outline"}
                    className={unit === "g" ? "bg-[#F5A623] text-[#07111F] hover:bg-[#F8C45B]" : "border-slate-300 text-slate-700"}
                    onClick={() => setUnit("g")}
                    disabled={saveMutation.isPending}
                    data-testid="mine-unit-g"
                  >
                    g
                  </Button>
                  <Button
                    type="button"
                    variant={unit === "kg" ? "default" : "outline"}
                    className={unit === "kg" ? "bg-[#F5A623] text-[#07111F] hover:bg-[#F8C45B]" : "border-slate-300 text-slate-700"}
                    onClick={() => setUnit("kg")}
                    disabled={saveMutation.isPending}
                    data-testid="mine-unit-kg"
                  >
                    kg
                  </Button>
                </div>
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setDetailsOpen((v) => !v)}
                data-testid="mine-details-toggle"
              >
                <span>Optional details</span>
                {detailsOpen ? <ChevronUp className="h-4 w-4 text-slate-600" /> : <ChevronDown className="h-4 w-4 text-slate-600" />}
              </button>

              {detailsOpen ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Purity (%)</div>
                      <Input
                        value={purityPercent}
                        onChange={(e) => setPurityPercent(e.target.value)}
                        placeholder="92.5"
                        inputMode="decimal"
                        className="mt-2 border-slate-200 bg-white text-slate-950 placeholder:text-slate-400"
                        disabled={saveMutation.isPending}
                        data-testid="mine-production-purity"
                      />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Site (optional)</div>
                      <Input
                        value={siteName}
                        onChange={(e) => setSiteName(e.target.value)}
                        placeholder="Site A"
                        className="mt-2 border-slate-200 bg-white text-slate-950 placeholder:text-slate-400"
                        disabled={saveMutation.isPending}
                        data-testid="mine-production-site"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Shift</div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        variant={shift === "AM" ? "default" : "outline"}
                        className={shift === "AM" ? "bg-slate-950 text-white hover:bg-slate-800" : "border-slate-300 text-slate-700"}
                        onClick={() => setShift((v) => (v === "AM" ? "" : "AM"))}
                        disabled={saveMutation.isPending}
                        data-testid="mine-shift-am"
                      >
                        AM
                      </Button>
                      <Button
                        type="button"
                        variant={shift === "PM" ? "default" : "outline"}
                        className={shift === "PM" ? "bg-slate-950 text-white hover:bg-slate-800" : "border-slate-300 text-slate-700"}
                        onClick={() => setShift((v) => (v === "PM" ? "" : "PM"))}
                        disabled={saveMutation.isPending}
                        data-testid="mine-shift-pm"
                      >
                        PM
                      </Button>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Notes</div>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Anything to remember about today's output..."
                      className="mt-2 min-h-[90px] border-slate-200 bg-white text-slate-950 placeholder:text-slate-400"
                      disabled={saveMutation.isPending}
                      data-testid="mine-production-notes"
                    />
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Button
                  className="w-full bg-[#F5A623] font-semibold text-[#07111F] hover:bg-[#F8C45B]"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  data-testid="mine-production-save"
                >
                  {saveMutation.isPending ? "Saving..." : "Save today's production"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-slate-300 text-slate-700"
                  onClick={() => setHistoryOpen((v) => !v)}
                  disabled={saveMutation.isPending}
                  data-testid="mine-production-history"
                >
                  <History className="h-4 w-4 mr-2" />
                  View history
                </Button>
              </div>
            </CardContent>
          </Card>

          {overview ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-[#B26F00]" />
                  Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-slate-500">Today</div>
                    <div className="mt-1 text-sm font-semibold">{formatProduction(todayTotal)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-slate-500">Month-to-date</div>
                    <div className="mt-1 text-sm font-semibold">{formatProduction(monthToDate)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-slate-500">Entries today</div>
                    <div className="mt-1 text-sm font-semibold">{overview.todayEntries.length}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Last 7 days</div>
                  <div className="mt-2">
                    <Sparkline series={last7Days} />
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    {last7Days.map((d) => d.date.slice(5)).join("  ")}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : overviewQuery.isLoading ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4 text-sm text-slate-600">Loading overview...</CardContent>
            </Card>
          ) : overviewQuery.error ? (
            <Card className="border-rose-200 bg-rose-50">
              <CardContent className="p-4 text-sm text-rose-700">
                {String((overviewQuery.error as any)?.message || "Could not load overview")}
              </CardContent>
            </Card>
          ) : null}

          {historyOpen ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {historyQuery.isLoading ? (
                  <div className="text-sm text-slate-600">Loading...</div>
                ) : historyQuery.error ? (
                  <div className="text-sm text-rose-700">{String((historyQuery.error as any)?.message || "Could not load history")}</div>
                ) : (
                  <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
                    {(historyQuery.data?.rows || []).slice(0, 30).map((row) => (
                      <div key={row.id} className="flex items-start justify-between gap-3 bg-white px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium">{row.date}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {row.siteId && row.siteId !== "default" ? `Site: ${row.siteId}` : "Site: (default)"}
                            {row.shift ? ` - Shift ${row.shift}` : ""}
                            {row.purityPercent !== null ? ` - Purity ${row.purityPercent}%` : ""}
                          </div>
                          {row.notes ? <div className="mt-1 line-clamp-2 text-xs text-slate-600">{row.notes}</div> : null}
                        </div>
                        <div className="shrink-0 text-right font-semibold text-slate-950">{formatProduction(row.gramsTotal)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </main>
        <AppProBottomNav activeKey="operations" />
      </div>
    </div>
  );
}
