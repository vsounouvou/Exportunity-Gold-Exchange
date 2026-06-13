import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

function AdminShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-6">
        <section className="rounded-3xl border border-[#D4AF37]/20 bg-gradient-to-r from-[#0B0B0D] via-[#0D1B2A] to-[#7A5A18] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">Bourse de l&apos;Or Admin</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
          <p className="mt-2 text-sm text-[#F5F3EC]/80">{subtitle}</p>
        </section>
        {children}
      </div>
    </div>
  );
}

type CommerceSettings = {
  defaultCurrency: string;
  defaultLanguage: string;
  platformGoldMarginPercent: number;
  stampedGoldMintFeeFixed: number;
  jewelryDesignFeeFixed: number;
  dynamicPricingEnabled: boolean;
  accumulationModeEnabled: boolean;
  proMapPaywallEnabled: boolean;
  associationFreeAccessEnabled: boolean;
  minerFreeAccessEnabled: boolean;
  bureauAchatPartnerAccessEnabled: boolean;
};

function formatXof(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value || 0)));
}

export function BdoAdminSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery<{ ok: boolean; scope: string; settings: CommerceSettings }>({
    queryKey: ["/api/admin/bdo/settings/commerce"],
    staleTime: 10_000,
  });
  const [draft, setDraft] = useState<CommerceSettings | null>(null);

  useEffect(() => {
    if (settingsQuery.data?.settings) setDraft(settingsQuery.data.settings);
  }, [settingsQuery.data?.settings]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/bdo/settings/commerce", {
        method: "PUT",
        body: JSON.stringify(draft || {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/bdo/settings/commerce"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/pricing/gold-margin"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/marketplace/gold-price"] }),
      ]);
      toast({ title: "Paramètres enregistrés", description: "Les réglages Pricing & Commerce ont été mis à jour." });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error?.message || "Impossible d’enregistrer les paramètres.", variant: "destructive" });
    },
  });

  const current = draft;

  return (
    <AdminShell
      title="Pricing & Commerce"
      subtitle="Définissez les règles de prix, le mode accumulation, les frais de frappe et les politiques d’accès Pro."
    >
      {!current ? (
        <Card className="border-white/10 bg-[#07101d]/95">
          <CardContent className="p-5 text-sm text-white/60">Chargement des paramètres…</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-white/10 bg-[#07101d]/95">
            <CardContent className="space-y-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Langue par défaut</Label>
                  <Select value={current.defaultLanguage} onValueChange={(value) => setDraft({ ...current, defaultLanguage: value })}>
                    <SelectTrigger className="border-white/10 bg-black/30 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Devise par défaut</Label>
                  <Select value={current.defaultCurrency} onValueChange={(value) => setDraft({ ...current, defaultCurrency: value })}>
                    <SelectTrigger className="border-white/10 bg-black/30 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="XOF">XOF</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Marge plateforme (%)</Label>
                  <Input
                    value={String(Math.round(current.platformGoldMarginPercent * 10000) / 100)}
                    onChange={(event) =>
                      setDraft({ ...current, platformGoldMarginPercent: Number(event.target.value || 0) / 100 })
                    }
                    className="border-white/10 bg-black/30 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Frais fixes de frappe (XOF)</Label>
                  <Input
                    value={String(current.stampedGoldMintFeeFixed)}
                    onChange={(event) => setDraft({ ...current, stampedGoldMintFeeFixed: Number(event.target.value || 0) })}
                    className="border-white/10 bg-black/30 text-white"
                  />
                </div>
              </div>

              {[
                ["dynamicPricingEnabled", "Tarification dynamique activée"],
                ["accumulationModeEnabled", "Mode accumulation activé"],
                ["proMapPaywallEnabled", "Paywall Pro / carte professionnelle"],
                ["associationFreeAccessEnabled", "Accès gratuit vérifié pour associations"],
                ["minerFreeAccessEnabled", "Accès gratuit vérifié pour mineurs"],
                ["bureauAchatPartnerAccessEnabled", "Accès partenaire / vérifié pour bureaux d’achat"],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">{label}</p>
                  </div>
                  <Switch
                    checked={Boolean((current as any)[key])}
                    onCheckedChange={(checked) => setDraft({ ...current, [key]: checked } as CommerceSettings)}
                  />
                </div>
              ))}

              <Button className="bg-[#D4AF37] text-black hover:bg-[#E8C873]" onClick={() => saveMutation.mutate()}>
                Enregistrer
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#07101d]/95">
            <CardContent className="space-y-4 p-5">
              <h2 className="text-lg font-semibold text-white">Résumé runtime</h2>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                <p>Marge active: {Math.round(current.platformGoldMarginPercent * 10000) / 100}%</p>
                <p className="mt-2">Frais de frappe: {formatXof(current.stampedGoldMintFeeFixed)} XOF</p>
                <p className="mt-2">Accumulation: {current.accumulationModeEnabled ? "activée" : "désactivée"}</p>
                <p className="mt-2">Pricing dynamique: {current.dynamicPricingEnabled ? "activé" : "désactivé"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}

export function BdoAdminGoalsPage() {
  const goalsQuery = useQuery<any>({
    queryKey: ["/api/gold-exchange/bdo/goals/admin"],
    staleTime: 10_000,
  });

  return (
    <AdminShell
      title="Gold Goals"
      subtitle="Suivez les objectifs, les confirmations verrouillées et les fonds alloués au parcours d’accumulation."
    >
      <Card className="border-white/10 bg-[#07101d]/95">
        <CardContent className="p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Total</p>
              <p className="mt-2 text-2xl font-semibold text-white">{goalsQuery.data?.stats?.total || 0}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">En accumulation</p>
              <p className="mt-2 text-2xl font-semibold text-white">{goalsQuery.data?.stats?.accumulating || 0}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Prêts à confirmer</p>
              <p className="mt-2 text-2xl font-semibold text-white">{goalsQuery.data?.stats?.ready_to_confirm || 0}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Achats verrouillés</p>
              <p className="mt-2 text-2xl font-semibold text-white">{goalsQuery.data?.stats?.lockedPurchases || 0}</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {(goalsQuery.data?.items || []).map((goal: any) => (
              <div key={goal.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{goal.metadata?.productName || `Lingot ${goal.selectedWeightGrams}g`}</p>
                    <p className="mt-1 text-[12px] text-white/55">
                      {goal.userDisplayName || goal.userEmail || `Utilisateur ${goal.userId}`} • {goal.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#E8C873]">{formatXof(goal.currentTargetPriceMinor)} XOF</p>
                    <p className="text-[11px] text-white/55">Financé: {formatXof(goal.amountFundedMinor)} XOF</p>
                  </div>
                </div>
              </div>
            ))}
            {!goalsQuery.data?.items?.length ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">Aucun objectif enregistré.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}

export function BdoAdminProMembershipsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const membershipsQuery = useQuery<any>({
    queryKey: ["/api/v2/pro/admin/memberships"],
    staleTime: 10_000,
  });
  const [drafts, setDrafts] = useState<Record<string, { membershipTier: string; subscriptionStatus: string }>>({});

  useEffect(() => {
    const next: Record<string, { membershipTier: string; subscriptionStatus: string }> = {};
    for (const item of membershipsQuery.data?.items || []) {
      next[item.id] = {
        membershipTier: item.membershipTier,
        subscriptionStatus: item.subscriptionStatus,
      };
    }
    setDrafts(next);
  }, [membershipsQuery.data?.items]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: { membershipTier: string; subscriptionStatus: string } }) =>
      apiRequest(`/api/v2/pro/admin/memberships/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/v2/pro/admin/memberships"] });
      toast({ title: "Adhésion mise à jour" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error?.message || "Impossible de mettre à jour l’adhésion.", variant: "destructive" });
    },
  });

  return (
    <AdminShell
      title="Pro Memberships"
      subtitle="Gérez les rôles, les tiers et les statuts d’abonnement Pro des contreparties et acheteurs."
    >
      <Card className="border-white/10 bg-[#07101d]/95">
        <CardContent className="space-y-3 p-5">
          {(membershipsQuery.data?.items || []).map((item: any) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.5fr_0.5fr_auto] lg:items-center">
                <div>
                  <p className="text-sm font-semibold text-white">{item.companyName || `Utilisateur ${item.userId}`}</p>
                  <p className="mt-1 text-[12px] text-white/55">{item.role} • {item.verificationStatus}</p>
                </div>
                <Select
                  value={drafts[item.id]?.membershipTier || item.membershipTier}
                  onValueChange={(value) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.id]: { ...(current[item.id] || {}), membershipTier: value, subscriptionStatus: current[item.id]?.subscriptionStatus || item.subscriptionStatus },
                    }))
                  }
                >
                  <SelectTrigger className="border-white/10 bg-black/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="pro_basic">Pro Basic</SelectItem>
                    <SelectItem value="pro_buyer">Pro Buyer</SelectItem>
                    <SelectItem value="pro_source">Pro Source</SelectItem>
                    <SelectItem value="admin_internal">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={drafts[item.id]?.subscriptionStatus || item.subscriptionStatus}
                  onValueChange={(value) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.id]: { membershipTier: current[item.id]?.membershipTier || item.membershipTier, subscriptionStatus: value },
                    }))
                  }
                >
                  <SelectTrigger className="border-white/10 bg-black/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="past_due">Past due</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="bg-[#D4AF37] text-black hover:bg-[#E8C873]"
                  onClick={() =>
                    saveMutation.mutate({
                      id: item.id,
                      payload: drafts[item.id] || { membershipTier: item.membershipTier, subscriptionStatus: item.subscriptionStatus },
                    })
                  }
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          ))}
          {!membershipsQuery.data?.items?.length ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
              Aucun profil Pro enregistré pour le moment.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
