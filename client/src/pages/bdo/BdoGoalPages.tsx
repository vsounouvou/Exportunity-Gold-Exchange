import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";

import { WalletDepositModal } from "@/components/payments/WalletDepositModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

type GoalItem = {
  id: number;
  productId: number | null;
  selectedWeightGrams: number;
  currentTargetPriceMinor: number;
  amountFundedMinor: number;
  remainingMinor: number;
  progressPercent: number;
  currencyCode: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  metadata: Record<string, any>;
  quote?: {
    spotPricePerGramMinor: number;
    subtotalMinor: number;
    mintFeeMinor: number;
    marginPercent: number;
  } | null;
};

type GoalDetailResponse = {
  ok: boolean;
  item: GoalItem;
  transactions: Array<{
    id: number;
    paymentTxId: string | null;
    amountMinor: number;
    txType: string;
    createdAt: string | null;
    metadata: Record<string, any>;
  }>;
  snapshots: Array<{
    id: number;
    referenceSpotPerGramMinor: number;
    computedTargetPriceMinor: number;
    marginPercent: number;
    createdAt: string | null;
    metadata: Record<string, any>;
  }>;
};

function formatXof(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value || 0)));
}

function formatMoneyMinor(value: number, currency = "XOF") {
  if (String(currency).toUpperCase() === "XOF") {
    return `${formatXof(value)} XOF`;
  }
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: String(currency || "XOF").toUpperCase(),
    maximumFractionDigits: 0,
  }).format(value);
}

function BdoPageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-3 py-5 md:px-5">
        <section className="rounded-3xl border border-[#D4AF37]/20 bg-gradient-to-r from-[#0B0B0D] via-[#0D1B2A] to-[#7A5A18] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">Bourse de l&apos;Or</p>
              <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">{title}</h1>
              <p className="mt-2 text-sm text-[#F5F3EC]/80">{subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/store">
                <Button className="bg-[#D4AF37] text-black hover:bg-[#E8C873]">Retour au marché</Button>
              </Link>
              <Link href="/mes-objectifs">
                <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                  Mes objectifs
                </Button>
              </Link>
            </div>
          </div>
        </section>
        {children}
      </div>
    </div>
  );
}

function GoalSummaryCard({ goal }: { goal: GoalItem }) {
  const title = goal.metadata?.productName || `Lingot ${goal.selectedWeightGrams}g`;
  return (
    <Card className="border-white/10 bg-[#07101d]/95">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-white">{title}</h3>
              <Badge className="border border-white/10 bg-white/5 text-white/70">{goal.selectedWeightGrams}g</Badge>
              <Badge
                className={`border ${
                  goal.status === "ready_to_confirm"
                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
                    : goal.status === "converted"
                      ? "border-[#D4AF37]/30 bg-[#D4AF37]/15 text-[#F5F3EC]"
                      : "border-[#0D1B2A]/60 bg-[#0D1B2A]/55 text-[#F5F3EC]"
                }`}
              >
                {goal.status === "ready_to_confirm"
                  ? "Prêt à confirmer"
                  : goal.status === "converted"
                    ? "Achat confirmé"
                    : goal.status === "refunded"
                      ? "Remboursé"
                      : goal.status === "cancelled"
                        ? "Annulé"
                        : "En accumulation"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-white/60">Prix indicatif ajusté au cours actuel jusqu&apos;à confirmation finale.</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-[#E8C873]">{formatMoneyMinor(goal.currentTargetPriceMinor, goal.currencyCode)}</p>
            <p className="text-[11px] text-white/50">Cible actuelle</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-[12px] text-white/65">
            <span>Financé</span>
            <span>{formatMoneyMinor(goal.amountFundedMinor, goal.currencyCode)}</span>
          </div>
          <Progress value={goal.progressPercent} className="h-2 bg-white/10" />
          <div className="flex items-center justify-between text-[12px] text-white/65">
            <span>Reste à financer</span>
            <span>{formatMoneyMinor(goal.remainingMinor, goal.currencyCode)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function useGoals(enabled: boolean, token?: string | null) {
  return useQuery<{ ok: boolean; items: GoalItem[]; summary: Record<string, number> }>({
    queryKey: ["/api/gold-exchange/bdo/goals", token],
    enabled,
    staleTime: 10_000,
    queryFn: () =>
      apiRequest("/api/gold-exchange/bdo/goals", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }),
  });
}

function AuthPrompt() {
  return (
    <Card className="border-white/10 bg-[#07101d]/95">
      <CardContent className="p-5">
        <h2 className="text-lg font-semibold text-white">Connectez-vous pour accéder à votre coffre d&apos;or</h2>
        <p className="mt-2 text-sm text-white/65">
          Vos objectifs et votre progression sont liés à votre compte. Connectez-vous pour créer un objectif, ajouter des
          fonds et confirmer l&apos;achat au bon moment.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/login?next=/coffre">
            <Button className="bg-[#D4AF37] text-black hover:bg-[#E8C873]">Se connecter</Button>
          </Link>
          <Link href="/register?next=/coffre">
            <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
              Créer un compte
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function BdoCoffrePage() {
  const session = useSession();
  const goalsQuery = useGoals(!!session.token, session.token);
  const walletSummaryQuery = useQuery<any>({
    queryKey: ["/api/wallet/summary", session.token],
    enabled: !!session.token,
    staleTime: 10_000,
    queryFn: () =>
      apiRequest("/api/wallet/summary", {
        headers: session.token ? { Authorization: `Bearer ${session.token}` } : undefined,
      }),
  });
  const vaultQuery = useQuery<any>({
    queryKey: ["/api/gold-exchange/bdo/vault", session.token],
    enabled: !!session.token,
    staleTime: 10_000,
    queryFn: () =>
      apiRequest("/api/gold-exchange/bdo/vault", {
        headers: session.token ? { Authorization: `Bearer ${session.token}` } : undefined,
      }),
  });

  const nearestGoal = useMemo(() => {
    const goals = goalsQuery.data?.items || [];
    return goals
      .filter((goal) => goal.status === "accumulating" || goal.status === "ready_to_confirm")
      .sort((a, b) => b.progressPercent - a.progressPercent)[0];
  }, [goalsQuery.data?.items]);

  return (
    <BdoPageShell
      title="Votre coffre d’or"
      subtitle="Achetez, réservez, accumulez. Vos fonds restent disponibles pour atteindre le lingot visé, puis verrouiller le prix au moment de la confirmation."
    >
      {!session.token ? (
        <AuthPrompt />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Fonds disponibles</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {formatMoneyMinor(Number(walletSummaryQuery.data?.wallet?.balance || 0), "XOF")}
                </p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Objectifs actifs</p>
                <p className="mt-2 text-2xl font-semibold text-white">{goalsQuery.data?.summary?.activeGoals || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Achats verrouillés</p>
                <p className="mt-2 text-2xl font-semibold text-white">{goalsQuery.data?.summary?.lockedPurchases || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Or en coffre</p>
                <p className="mt-2 text-2xl font-semibold text-white">{Number(vaultQuery.data?.totalGrams || 0)} g</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/80">Coffre d&apos;or</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">Ajoutez des fonds et allouez-les à vos objectifs</h2>
                    <p className="mt-2 text-sm text-white/65">
                      Le prix reste lié au marché jusqu&apos;à la confirmation. Vous financez progressivement le lingot choisi,
                      puis vous verrouillez le prix au moment opportun.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <WalletDepositModal
                      label="Ajouter des fonds"
                      next="/coffre"
                      buttonClassName="bg-[#D4AF37] hover:bg-[#E8C873] text-black"
                    />
                    <Link href="/mes-objectifs">
                      <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                        Voir mes objectifs
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-5">
                <h2 className="text-lg font-semibold text-white">Objectif le plus avancé</h2>
                {nearestGoal ? (
                  <div className="mt-3 space-y-3">
                    <GoalSummaryCard goal={nearestGoal} />
                    <Link href={`/objectif/${nearestGoal.id}`}>
                      <Button className="w-full bg-[#D4AF37] text-black hover:bg-[#E8C873]">Continuer cet objectif</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                    Aucun objectif actif. Démarrez un objectif depuis le marché pour commencer votre accumulation.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-white/10 bg-[#07101d]/95">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Mes objectifs</h2>
                  <p className="mt-1 text-sm text-white/60">Suivez vos objectifs actifs, prêts à confirmer ou déjà convertis.</p>
                </div>
                <Link href="/mes-objectifs">
                  <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                    Tout voir
                  </Button>
                </Link>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {(goalsQuery.data?.items || []).slice(0, 4).map((goal) => (
                  <Link key={goal.id} href={`/objectif/${goal.id}`}>
                    <div className="cursor-pointer">
                      <GoalSummaryCard goal={goal} />
                    </div>
                  </Link>
                ))}
                {!(goalsQuery.data?.items || []).length ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                    Aucun objectif enregistré pour le moment.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </BdoPageShell>
  );
}

export function BdoGoalsPage() {
  const session = useSession();
  const goalsQuery = useGoals(!!session.token, session.token);

  return (
    <BdoPageShell
      title="Mes objectifs d’or"
      subtitle="Chaque objectif suit une valeur de marché dynamique. Vous ajoutez des fonds progressivement, puis vous confirmez l’achat quand le montant est atteint."
    >
      {!session.token ? (
        <AuthPrompt />
      ) : (
        <Card className="border-white/10 bg-[#07101d]/95">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Objectifs actifs et historiques</h2>
                <p className="mt-1 text-sm text-white/60">Le prix final reste flottant jusqu’au moment de la confirmation.</p>
              </div>
              <Link href="/store">
                <Button className="bg-[#D4AF37] text-black hover:bg-[#E8C873]">Créer un nouvel objectif</Button>
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {(goalsQuery.data?.items || []).length ? (
                (goalsQuery.data?.items || []).map((goal) => (
                  <div key={goal.id} className="space-y-2">
                    <GoalSummaryCard goal={goal} />
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/objectif/${goal.id}`}>
                        <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                          Voir l’objectif
                        </Button>
                      </Link>
                      {goal.status === "ready_to_confirm" ? (
                        <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-emerald-100">
                          Prêt à confirmer
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                  Aucun objectif actif pour l’instant.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </BdoPageShell>
  );
}

export function BdoGoalDetailPage({ goalId }: { goalId: string }) {
  const session = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [fundAmount, setFundAmount] = useState("");

  const detailQuery = useQuery<GoalDetailResponse>({
    queryKey: ["/api/gold-exchange/bdo/goals/detail", goalId, session.token],
    enabled: !!session.token && !!goalId,
    staleTime: 5_000,
    queryFn: () =>
      apiRequest(`/api/gold-exchange/bdo/goals/${goalId}`, {
        headers: session.token ? { Authorization: `Bearer ${session.token}` } : undefined,
      }),
  });

  const walletSummaryQuery = useQuery<any>({
    queryKey: ["/api/wallet/summary", session.token],
    enabled: !!session.token,
    staleTime: 10_000,
    queryFn: () =>
      apiRequest("/api/wallet/summary", {
        headers: session.token ? { Authorization: `Bearer ${session.token}` } : undefined,
      }),
  });

  const fundMutation = useMutation({
    mutationFn: async (amountMinor: number) =>
      apiRequest(`/api/gold-exchange/bdo/goals/${goalId}/fund`, {
        method: "POST",
        headers: session.token ? { Authorization: `Bearer ${session.token}` } : undefined,
        body: JSON.stringify({ amountMinor }),
      }),
    onSuccess: async () => {
      setFundAmount("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/goals", session.token] }),
        queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/goals/detail", goalId, session.token] }),
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/summary", session.token] }),
      ]);
      toast({ title: "Objectif alimenté", description: "Les fonds ont été ajoutés à votre objectif." });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error?.message || "Impossible d’ajouter des fonds.", variant: "destructive" });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/gold-exchange/bdo/goals/${goalId}/confirm`, {
        method: "POST",
        headers: session.token ? { Authorization: `Bearer ${session.token}` } : undefined,
        body: JSON.stringify({ fulfillmentChoice: "store" }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/goals", session.token] }),
        queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/goals/detail", goalId, session.token] }),
        queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/vault", session.token] }),
      ]);
      toast({ title: "Achat confirmé", description: "Le prix a été verrouillé et l’unité a été créée dans votre coffre." });
      navigate("/coffre");
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error?.message || "Impossible de confirmer cet achat.", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/gold-exchange/bdo/goals/${goalId}/cancel`, {
        method: "POST",
        headers: session.token ? { Authorization: `Bearer ${session.token}` } : undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/goals", session.token] }),
        queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/goals/detail", goalId, session.token] }),
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/summary", session.token] }),
      ]);
      toast({ title: "Objectif annulé", description: "Les fonds alloués ont été remboursés quand c’était nécessaire." });
      navigate("/mes-objectifs");
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error?.message || "Impossible d’annuler cet objectif.", variant: "destructive" });
    },
  });

  const goal = detailQuery.data?.item || null;
  const quickAmounts = goal
    ? [10_000, 25_000, 50_000, goal.remainingMinor].filter((value, index, list) => value > 0 && list.indexOf(value) === index)
    : [];

  return (
    <BdoPageShell
      title={goal ? `Objectif Or — Lingot ${goal.selectedWeightGrams}g` : "Objectif d’or"}
      subtitle="Le cours évolue avec le marché jusqu’à confirmation. Le prix final est verrouillé uniquement le jour où vous confirmez l’achat."
    >
      {!session.token ? (
        <AuthPrompt />
      ) : !goal ? (
        <Card className="border-white/10 bg-[#07101d]/95">
          <CardContent className="p-5 text-sm text-white/60">Chargement de l’objectif…</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <GoalSummaryCard goal={goal} />

            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-5">
                <h2 className="text-lg font-semibold text-white">Progression et conditions</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Montant financé</p>
                    <p className="mt-2 text-xl font-semibold text-white">{formatMoneyMinor(goal.amountFundedMinor, goal.currencyCode)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Montant restant</p>
                    <p className="mt-2 text-xl font-semibold text-white">{formatMoneyMinor(goal.remainingMinor, goal.currencyCode)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Cours spot / g</p>
                    <p className="mt-2 text-xl font-semibold text-white">{formatMoneyMinor(goal.quote?.spotPricePerGramMinor || 0, goal.currencyCode)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Marge + frappe</p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {Math.round(Number(goal.quote?.marginPercent || 0) * 100)}% + {formatMoneyMinor(goal.quote?.mintFeeMinor || 0, goal.currencyCode)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 p-4 text-sm text-[#F5F3EC]/85">
                  <p>Le prix évolue avec le marché jusqu’à confirmation.</p>
                  <p className="mt-2">Le prix final est verrouillé le jour de la confirmation et déclenche la création de l’unité dans votre coffre.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-5">
                <h2 className="text-lg font-semibold text-white">Historique</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">Transactions</p>
                    <ScrollArea className="mt-3 h-[260px] pr-2">
                      <div className="space-y-2">
                        {(detailQuery.data?.transactions || []).map((tx) => (
                          <div key={tx.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-white">{tx.txType}</p>
                              <p className="text-sm text-[#E8C873]">{formatMoneyMinor(tx.amountMinor, goal.currencyCode)}</p>
                            </div>
                            <p className="mt-1 text-[11px] text-white/50">
                              {tx.createdAt ? new Date(tx.createdAt).toLocaleString("fr-FR") : ""}
                            </p>
                          </div>
                        ))}
                        {!detailQuery.data?.transactions?.length ? (
                          <p className="text-sm text-white/60">Aucun mouvement pour le moment.</p>
                        ) : null}
                      </div>
                    </ScrollArea>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">Snapshots de prix</p>
                    <ScrollArea className="mt-3 h-[260px] pr-2">
                      <div className="space-y-2">
                        {(detailQuery.data?.snapshots || []).map((snapshot) => (
                          <div key={snapshot.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-white">{formatMoneyMinor(snapshot.computedTargetPriceMinor, goal.currencyCode)}</p>
                              <p className="text-[11px] text-white/55">{Math.round(snapshot.marginPercent * 100)}%</p>
                            </div>
                            <p className="mt-1 text-[11px] text-white/50">
                              Spot: {formatMoneyMinor(snapshot.referenceSpotPerGramMinor, goal.currencyCode)} / g
                            </p>
                          </div>
                        ))}
                        {!detailQuery.data?.snapshots?.length ? (
                          <p className="text-sm text-white/60">Aucun snapshot enregistré pour le moment.</p>
                        ) : null}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-5">
                <h2 className="text-lg font-semibold text-white">Ajouter des fonds à cet objectif</h2>
                <p className="mt-2 text-sm text-white/65">Le coffre reste disponible pour de nouveaux versements avant la confirmation.</p>
                <p className="mt-4 text-sm text-white/55">Fonds disponibles: {formatMoneyMinor(Number(walletSummaryQuery.data?.wallet?.balance || 0), "XOF")}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {quickAmounts.map((amount) => (
                    <Button
                      key={amount}
                      variant="outline"
                      className="h-8 border-white/15 text-white hover:bg-white/10"
                      onClick={() => fundMutation.mutate(amount)}
                      disabled={fundMutation.isPending || goal.status === "converted" || goal.status === "cancelled"}
                    >
                      {formatMoneyMinor(amount, "XOF")}
                    </Button>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Input
                    value={fundAmount}
                    onChange={(event) => setFundAmount(event.target.value)}
                    placeholder="Montant XOF"
                    className="border-white/10 bg-black/30 text-white"
                  />
                  <Button
                    className="bg-[#D4AF37] text-black hover:bg-[#E8C873]"
                    disabled={fundMutation.isPending || !Number(fundAmount)}
                    onClick={() => fundMutation.mutate(Math.max(0, Math.round(Number(fundAmount))))}
                  >
                    Ajouter
                  </Button>
                </div>
                <div className="mt-4">
                  <WalletDepositModal
                    label="Recharger mon coffre"
                    next={`/objectif/${goal.id}`}
                    buttonClassName="w-full bg-white/10 hover:bg-white/15 text-white"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-5">
                <h2 className="text-lg font-semibold text-white">Actions</h2>
                <div className="mt-4 space-y-2">
                  <Button
                    className="w-full bg-[#D4AF37] text-black hover:bg-[#E8C873]"
                    disabled={confirmMutation.isPending || goal.status !== "ready_to_confirm"}
                    onClick={() => confirmMutation.mutate()}
                  >
                    Confirmer l’achat
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full border-white/15 text-white hover:bg-white/10"
                    onClick={() => navigate("/store")}
                  >
                    Changer de lingot
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full border-rose-500/25 text-rose-200 hover:bg-rose-500/10"
                    disabled={cancelMutation.isPending || goal.status === "converted"}
                    onClick={() => cancelMutation.mutate()}
                  >
                    Annuler l’objectif
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </BdoPageShell>
  );
}
