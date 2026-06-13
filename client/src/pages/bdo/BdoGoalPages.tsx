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
import { useLocale } from "@/contexts/LocaleContext";

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

function getGoalPageCopy(language: string) {
  if (language === "ar") {
    return {
      market: "العودة إلى السوق",
      goals: "أهدافي",
      coffreTitle: "خزنة الذهب",
      coffreSubtitle: "كوّن ميزانية شراء الذهب المادي تدريجياً. لا يتم شراء الذهب حتى تؤكد الطلب بالسعر المحدث.",
      goalsTitle: "أهداف شراء الذهب",
      goalsSubtitle: "يتابع كل هدف سعراً مرتبطاً بالسوق. أضف الأموال تدريجياً ثم أكد الطلب عندما تصبح الميزانية جاهزة.",
      authTitle: "سجّل الدخول للوصول إلى خزنة الذهب",
      authBody:
        "أهداف الشراء والتقدم مرتبطة بحسابك. سجّل الدخول لإنشاء هدف، إضافة أموال، ثم تأكيد شراء الذهب المادي عندما تكون جاهزاً.",
      signIn: "تسجيل الدخول",
      createAccount: "إنشاء حساب",
      availableFunds: "الأموال المتاحة",
      activeGoals: "الأهداف النشطة",
      lockedPurchases: "طلبات مؤكدة",
      vaultedGold: "ذهب في الخزنة",
      vaultEyebrow: "خزنة الذهب",
      addFundsTitle: "أضف أموالاً وخصصها لأهداف الشراء",
      addFundsBody: "يبقى السعر مرتبطاً بالسوق حتى التأكيد. أنت تبني ميزانية المنتج المختار ثم تثبت السعر عند تأكيد الطلب.",
      addFunds: "إضافة أموال",
      viewGoals: "عرض أهدافي",
      nearestGoal: "أقرب هدف للاكتمال",
      continueGoal: "متابعة هذا الهدف",
      noActiveGoal: "لا يوجد هدف نشط. ابدأ من السوق لتكوين ميزانية شراء الذهب المادي.",
      goalsListTitle: "الأهداف النشطة والسابقة",
      goalsListBody: "تابع الأهداف الجارية أو الجاهزة للتأكيد أو التي تم تحويلها إلى طلب.",
      viewAll: "عرض الكل",
      newGoal: "إنشاء هدف جديد",
      noGoal: "لا يوجد هدف نشط حالياً.",
    };
  }

  if (language === "en") {
    return {
      market: "Back to market",
      goals: "My objectives",
      coffreTitle: "Your gold vault",
      coffreSubtitle:
        "Build your physical gold purchase budget progressively. Your gold is not purchased until you confirm the order at a refreshed price.",
      goalsTitle: "Gold Purchase Objectives",
      goalsSubtitle:
        "Each objective follows a market-linked value. Add funds progressively, then confirm the order when the budget is ready.",
      authTitle: "Sign in to access your gold vault",
      authBody:
        "Your Purchase Objectives and progress are linked to your account. Sign in to create an objective, add funds, and confirm the physical gold purchase when ready.",
      signIn: "Sign in",
      createAccount: "Create account",
      availableFunds: "Available funds",
      activeGoals: "Active objectives",
      lockedPurchases: "Confirmed purchases",
      vaultedGold: "Gold in vault",
      vaultEyebrow: "Gold vault",
      addFundsTitle: "Add funds and allocate them to your Purchase Objectives",
      addFundsBody:
        "The price remains market-linked until confirmation. Build the budget for the selected product, then lock the price when you confirm the order.",
      addFunds: "Add funds",
      viewGoals: "View my objectives",
      nearestGoal: "Most advanced objective",
      continueGoal: "Continue this objective",
      noActiveGoal: "No active objective. Start from the market to build a physical gold purchase budget.",
      goalsListTitle: "Active and historical objectives",
      goalsListBody: "Track active objectives, objectives ready to confirm, and converted purchases.",
      viewAll: "View all",
      newGoal: "Create a new objective",
      noGoal: "No active objective yet.",
    };
  }

  return {
    market: "Retour au marché",
    goals: "Mes objectifs",
    coffreTitle: "Votre coffre d’or",
    coffreSubtitle:
      "Achetez, réservez, accumulez. Vos fonds restent disponibles pour atteindre le lingot visé, puis verrouiller le prix au moment de la confirmation.",
    goalsTitle: "Mes objectifs d’or",
    goalsSubtitle:
      "Chaque objectif suit une valeur de marché dynamique. Vous ajoutez des fonds progressivement, puis vous confirmez l’achat quand le montant est atteint.",
    authTitle: "Connectez-vous pour accéder à votre coffre d’or",
    authBody:
      "Vos objectifs et votre progression sont liés à votre compte. Connectez-vous pour créer un objectif, ajouter des fonds et confirmer l’achat au bon moment.",
    signIn: "Se connecter",
    createAccount: "Créer un compte",
    availableFunds: "Fonds disponibles",
    activeGoals: "Objectifs actifs",
    lockedPurchases: "Achats verrouillés",
    vaultedGold: "Or en coffre",
    vaultEyebrow: "Coffre d’or",
    addFundsTitle: "Ajoutez des fonds et allouez-les à vos objectifs",
    addFundsBody:
      "Le prix reste lié au marché jusqu’à la confirmation. Vous financez progressivement le lingot choisi, puis vous verrouillez le prix au moment opportun.",
    addFunds: "Ajouter des fonds",
    viewGoals: "Voir mes objectifs",
    nearestGoal: "Objectif le plus avancé",
    continueGoal: "Continuer cet objectif",
    noActiveGoal: "Aucun objectif actif. Démarrez un objectif depuis le marché pour commencer votre accumulation.",
    goalsListTitle: "Objectifs actifs et historiques",
    goalsListBody: "Suivez vos objectifs actifs, prêts à confirmer ou déjà convertis.",
    viewAll: "Tout voir",
    newGoal: "Créer un nouvel objectif",
    noGoal: "Aucun objectif actif pour l’instant.",
  };
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
  const { language } = useLocale();
  const copy = useMemo(() => getGoalPageCopy(language), [language]);
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
                <Button className="bg-[#D4AF37] text-black hover:bg-[#E8C873]">{copy.market}</Button>
              </Link>
              <Link href="/mes-objectifs">
                <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                  {copy.goals}
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
  const { language } = useLocale();
  const copy = useMemo(() => getGoalPageCopy(language), [language]);
  return (
    <Card className="border-white/10 bg-[#07101d]/95">
      <CardContent className="p-5">
        <h2 className="text-lg font-semibold text-white">{copy.authTitle}</h2>
        <p className="mt-2 text-sm text-white/65">{copy.authBody}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/login?next=/coffre">
            <Button className="bg-[#D4AF37] text-black hover:bg-[#E8C873]">{copy.signIn}</Button>
          </Link>
          <Link href="/register?next=/coffre">
            <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
              {copy.createAccount}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function BdoCoffrePage() {
  const session = useSession();
  const { language } = useLocale();
  const copy = useMemo(() => getGoalPageCopy(language), [language]);
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
      title={copy.coffreTitle}
      subtitle={copy.coffreSubtitle}
    >
      {!session.token ? (
        <AuthPrompt />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">{copy.availableFunds}</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {formatMoneyMinor(Number(walletSummaryQuery.data?.wallet?.balance || 0), "XOF")}
                </p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">{copy.activeGoals}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{goalsQuery.data?.summary?.activeGoals || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">{copy.lockedPurchases}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{goalsQuery.data?.summary?.lockedPurchases || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">{copy.vaultedGold}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{Number(vaultQuery.data?.totalGrams || 0)} g</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/80">{copy.vaultEyebrow}</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">{copy.addFundsTitle}</h2>
                    <p className="mt-2 text-sm text-white/65">{copy.addFundsBody}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <WalletDepositModal
                      label={copy.addFunds}
                      next="/coffre"
                      buttonClassName="bg-[#D4AF37] hover:bg-[#E8C873] text-black"
                    />
                    <Link href="/mes-objectifs">
                      <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                        {copy.viewGoals}
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-[#07101d]/95">
              <CardContent className="p-5">
                <h2 className="text-lg font-semibold text-white">{copy.nearestGoal}</h2>
                {nearestGoal ? (
                  <div className="mt-3 space-y-3">
                    <GoalSummaryCard goal={nearestGoal} />
                    <Link href={`/objectif/${nearestGoal.id}`}>
                      <Button className="w-full bg-[#D4AF37] text-black hover:bg-[#E8C873]">{copy.continueGoal}</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                    {copy.noActiveGoal}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-white/10 bg-[#07101d]/95">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">{copy.goalsListTitle}</h2>
                  <p className="mt-1 text-sm text-white/60">{copy.goalsListBody}</p>
                </div>
                <Link href="/mes-objectifs">
                  <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                    {copy.viewAll}
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
                    {copy.noGoal}
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
  const { language } = useLocale();
  const copy = useMemo(() => getGoalPageCopy(language), [language]);
  const goalsQuery = useGoals(!!session.token, session.token);

  return (
    <BdoPageShell
      title={copy.goalsTitle}
      subtitle={copy.goalsSubtitle}
    >
      {!session.token ? (
        <AuthPrompt />
      ) : (
        <Card className="border-white/10 bg-[#07101d]/95">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">{copy.goalsListTitle}</h2>
                <p className="mt-1 text-sm text-white/60">{copy.goalsListBody}</p>
              </div>
              <Link href="/store">
                <Button className="bg-[#D4AF37] text-black hover:bg-[#E8C873]">{copy.newGoal}</Button>
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
                  {copy.noGoal}
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
