import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  KeyRound,
  Loader2,
  LockKeyhole,
  Network,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useSession } from "@/lib/session";
import { getTenantAdminHomeRoute, getTenantDefaultRoute, isTenantRouteAllowed } from "@/lib/tenantPolicy";

type LoginResponse = {
  token: string;
  user: any;
};

type StatusResponse = {
  applicationRef: string;
  status: string;
  aiReviewResult: string | null;
  aiReviewedAt: string | null;
  reviewedAt: string | null;
  adminReviewNote: string | null;
  updatedAt: string | null;
};

const inputClassName =
  "h-11 border-slate-200 bg-white text-[#07111F] shadow-none placeholder:text-slate-400 focus-visible:ring-[#F5A623]";

function useDocumentMeta(title: string, description: string) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = `${title} | Exportunity`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [description, title]);
}

function NetworkPageFrame({
  children,
  backLabel,
}: {
  children: React.ReactNode;
  backLabel: string;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F7F8FA] text-[#07111F]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="pointer-events-none absolute -left-24 top-24 h-80 w-80 rounded-full bg-[#F5A623]/10 blur-3xl" />
      <header className="relative z-20 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3">
            <img
              src="/tenants/exportunity/official/logo-long-light.png"
              alt="Exportunity"
              className="h-9 w-auto max-w-[190px] object-contain"
            />
            <span className="hidden border-l border-slate-200 pl-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 lg:block">
              Global Trade Network
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[#F5A623] hover:text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </div>
      </header>
      <main className="relative z-10">{children}</main>
    </div>
  );
}

function adminCopy(language: string) {
  if (language === "fr") {
    return {
      back: "Retour au réseau",
      eyebrow: "Accès opérations GTN",
      title: "Pilotez le réseau commercial mondial.",
      body: "Accédez aux besoins, fournisseurs, offres, commandes, preuves et intégrations depuis l’espace opérationnel Exportunity.",
      evidence: "Dossiers attribuables",
      evidenceBody: "Chaque besoin, offre et commande conserve son contexte et ses preuves.",
      approval: "Actions gouvernées",
      approvalBody: "Les opérations sensibles restent séparées de leur approbation et exécution.",
      signIn: "Connexion opérations",
      signInBody: "Utilisez votre compte Exportunity autorisé.",
      email: "Adresse e-mail",
      password: "Mot de passe",
      submit: "Ouvrir l’espace opérations",
      pending: "Connexion…",
      success: "Connexion réussie",
      failure: "Connexion impossible",
      passwordHelp: "Gérer le mot de passe",
      setup: "Utiliser un lien d’activation",
      description: "Accès sécurisé aux opérations du Global Trade Network d’Exportunity.",
    };
  }
  return {
    back: "Back to the network",
    eyebrow: "GTN operations access",
    title: "Operate the Global Trade Network.",
    body: "Access requirements, suppliers, offers, orders, evidence, and integrations from the Exportunity operations workspace.",
    evidence: "Attributable records",
    evidenceBody: "Every requirement, offer, and order keeps its context and evidence.",
    approval: "Governed actions",
    approvalBody: "Sensitive operations remain separate from approval and execution.",
    signIn: "Operations sign in",
    signInBody: "Use your authorized Exportunity account.",
    email: "Email address",
    password: "Password",
    submit: "Open operations workspace",
    pending: "Signing in…",
    success: "Signed in",
    failure: "Unable to sign in",
    passwordHelp: "Manage password",
    setup: "Use an activation link",
    description: "Secure access to Exportunity Global Trade Network operations.",
  };
}

export function ExportunityOperationsAccessPage() {
  const { language } = useLocale();
  const copy = adminCopy(language);
  const { toast } = useToast();
  const { login, isAuthenticated, isGuest, user } = useSession();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const defaultRoute = getTenantAdminHomeRoute("exportunity");

  useDocumentMeta(copy.signIn, copy.description);

  useEffect(() => {
    if (isAuthenticated && !isGuest) {
      setLocation(user?.mustChangePassword ? "/admin/password" : defaultRoute);
    }
  }, [defaultRoute, isAuthenticated, isGuest, setLocation, user]);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes("@") || password.length < 6) {
        throw new Error(language === "fr" ? "Saisissez un e-mail valide et votre mot de passe." : "Enter a valid email and password.");
      }
      const response = (await apiRequest("/api/ece/auth/login", "POST", {
        email: normalizedEmail,
        password,
      })) as LoginResponse;
      if (!response?.token || !response?.user) throw new Error(copy.failure);
      return response;
    },
    onSuccess: (response) => {
      login(response.token, response.user);
      toast({ title: copy.success, description: String(response.user?.displayName || response.user?.email || "") });
      setLocation(response.user?.mustChangePassword ? "/admin/password" : defaultRoute);
    },
    onError: (error) => {
      toast({
        title: copy.failure,
        description: error instanceof Error ? error.message : copy.failure,
        variant: "destructive",
      });
    },
  });

  return (
    <NetworkPageFrame backLabel={copy.back}>
      <div
        data-testid="exportunity-operations-access-page"
        className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.75fr)] lg:items-center lg:py-16"
      >
        <section className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F5A623]/35 bg-[#FFF8E8] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[#8A5700]">
            <Network className="h-3.5 w-3.5" />
            {copy.eyebrow}
          </div>
          <h1 className="mt-5 text-4xl font-black leading-[1.04] tracking-[-0.04em] sm:text-5xl lg:text-6xl">{copy.title}</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">{copy.body}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              { icon: ClipboardCheck, title: copy.evidence, body: copy.evidenceBody },
              { icon: ShieldCheck, title: copy.approval, body: copy.approvalBody },
            ].map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <Icon className="h-6 w-6 text-[#B26F00]" />
                <h2 className="mt-4 font-black text-slate-950">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-2 shadow-[0_30px_90px_rgba(15,23,42,0.16)]">
          <form
            className="rounded-[22px] border border-slate-100 bg-white p-6 sm:p-8"
            onSubmit={(event) => {
              event.preventDefault();
              loginMutation.mutate();
            }}
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#07111F] text-[#F5A623]">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <h2 className="mt-5 text-2xl font-black tracking-tight">{copy.signIn}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{copy.signInBody}</p>
            <label className="mt-7 block space-y-2 text-sm font-bold text-slate-700">
              <span>{copy.email}</span>
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                inputMode="email"
                className={inputClassName}
                disabled={loginMutation.isPending}
              />
            </label>
            <label className="mt-4 block space-y-2 text-sm font-bold text-slate-700">
              <span>{copy.password}</span>
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className={inputClassName}
                disabled={loginMutation.isPending}
              />
            </label>
            <Button
              type="submit"
              className="mt-6 h-11 w-full bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              {loginMutation.isPending ? copy.pending : copy.submit}
            </Button>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-bold text-slate-500">
              <Link href="/admin/password" className="hover:text-slate-950">{copy.passwordHelp}</Link>
              <Link href="/setup-password" className="hover:text-slate-950">{copy.setup}</Link>
            </div>
          </form>
        </section>
      </div>
    </NetworkPageFrame>
  );
}

function statusCopy(language: string) {
  if (language === "fr") {
    return {
      back: "Retour au réseau",
      eyebrow: "Suivi de demande d’accès",
      title: "Votre demande reste liée au dossier GTN.",
      body: "Consultez l’état enregistré sans créer une nouvelle demande ni déclencher d’action externe.",
      reference: "Référence",
      missing: "Ajoutez la référence reçue après votre demande d’accès.",
      loading: "Chargement du statut…",
      retry: "Réessayer",
      notFound: "Aucun statut n’a été trouvé pour cette référence.",
      review: "Évaluation",
      note: "Note de suivi",
      updated: "Dernière mise à jour",
      copy: "Copier la référence",
      copied: "Référence copiée",
      copyFailed: "Copie impossible",
      request: "Demander un accès",
      access: "Ouvrir la connexion",
      contact: "Exportunity vous contactera par les coordonnées fournies si des informations complémentaires sont nécessaires.",
      description: "Suivez une demande d’accès au Global Trade Network d’Exportunity à partir de sa référence.",
    };
  }
  return {
    back: "Back to the network",
    eyebrow: "Access-request tracking",
    title: "Your request stays linked to the GTN record.",
    body: "Review the recorded status without creating a new request or triggering an external action.",
    reference: "Reference",
    missing: "Add the reference received after your access request.",
    loading: "Loading status…",
    retry: "Try again",
    notFound: "No status was found for this reference.",
    review: "Review",
    note: "Follow-up note",
    updated: "Last updated",
    copy: "Copy reference",
    copied: "Reference copied",
    copyFailed: "Unable to copy",
    request: "Request access",
    access: "Open sign in",
    contact: "Exportunity will use the contact details supplied with the request if more information is needed.",
    description: "Track an Exportunity Global Trade Network access request by its reference.",
  };
}

function readableStatus(status: string, language: string) {
  const normalized = String(status || "pending").trim().toLowerCase();
  const labels: Record<string, { en: string; fr: string }> = {
    approved: { en: "Approved", fr: "Approuvée" },
    rejected: { en: "Not approved", fr: "Non approuvée" },
    pending: { en: "Pending review", fr: "En cours d’examen" },
    under_review: { en: "Under review", fr: "En cours d’examen" },
    needs_information: { en: "Information requested", fr: "Informations demandées" },
  };
  const locale = language === "fr" ? "fr" : "en";
  return labels[normalized]?.[locale] || normalized.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle2 className="h-6 w-6 text-emerald-600" />;
  if (status === "rejected") return <XCircle className="h-6 w-6 text-red-600" />;
  return <Clock3 className="h-6 w-6 text-[#B26F00]" />;
}

export function ExportunityApplicationStatusPage() {
  const { language } = useLocale();
  const copy = statusCopy(language);
  const { toast } = useToast();
  const [location] = useLocation();
  const ref = useMemo(() => {
    try {
      return String(new URL(location, "https://app.local").searchParams.get("ref") || "").trim();
    } catch {
      return "";
    }
  }, [location]);

  useDocumentMeta(copy.eyebrow, copy.description);

  const query = useQuery<StatusResponse>({
    queryKey: ["exportunity-application-status", ref],
    enabled: Boolean(ref),
    retry: false,
    queryFn: async () => {
      const response = await fetch(resolveApiUrl(`/api/ece/applications/status?ref=${encodeURIComponent(ref)}`));
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.message || "Failed to fetch status");
      }
      return response.json();
    },
  });

  return (
    <NetworkPageFrame backLabel={copy.back}>
      <div data-testid="exportunity-application-status-page" className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center px-4 py-10 sm:px-6 lg:py-16">
        <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.75fr)] lg:items-center">
          <section>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F5A623]/35 bg-[#FFF8E8] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[#8A5700]">
              <ClipboardCheck className="h-3.5 w-3.5" />
              {copy.eyebrow}
            </div>
            <h1 className="mt-5 text-4xl font-black leading-[1.04] tracking-[-0.04em] sm:text-5xl">{copy.title}</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">{copy.body}</p>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-2 shadow-[0_30px_90px_rgba(15,23,42,0.16)]">
            <div className="rounded-[22px] border border-slate-100 bg-white p-6 sm:p-8">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{copy.reference}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="min-w-0 flex-1 break-all font-mono text-lg font-black text-[#07111F]">{ref || "—"}</div>
                {ref ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 border-slate-200"
                    aria-label={copy.copy}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(ref);
                        toast({ title: copy.copied });
                      } catch {
                        toast({ title: copy.copyFailed, variant: "destructive" });
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>

              <div className="mt-6 border-t border-slate-100 pt-6">
                {!ref ? (
                  <div className="rounded-2xl border border-[#F5A623]/30 bg-[#FFF8E8] p-4 text-sm leading-6 text-slate-700">{copy.missing}</div>
                ) : query.isLoading ? (
                  <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
                    <Loader2 className="h-5 w-5 animate-spin text-[#B26F00]" />
                    {copy.loading}
                  </div>
                ) : query.isError ? (
                  <div className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                      <span>{query.error instanceof Error ? query.error.message : copy.notFound}</span>
                    </div>
                    <Button type="button" variant="outline" className="border-red-200 bg-white font-bold" onClick={() => void query.refetch()}>{copy.retry}</Button>
                  </div>
                ) : query.data ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-3">
                      <StatusIcon status={query.data.status} />
                      <div>
                        <div className="font-black text-slate-950">{readableStatus(query.data.status, language)}</div>
                        {query.data.updatedAt ? (
                          <div className="mt-1 text-xs text-slate-500">{copy.updated}: {new Date(query.data.updatedAt).toLocaleDateString(language === "fr" ? "fr-FR" : "en-US")}</div>
                        ) : null}
                      </div>
                    </div>
                    {query.data.aiReviewResult ? <p className="mt-4 text-sm leading-6 text-slate-600"><strong className="text-slate-800">{copy.review}:</strong> {query.data.aiReviewResult}</p> : null}
                    {query.data.adminReviewNote ? <p className="mt-3 text-sm leading-6 text-slate-600"><strong className="text-slate-800">{copy.note}:</strong> {query.data.adminReviewNote}</p> : null}
                    <p className="mt-4 text-xs leading-5 text-slate-500">{copy.contact}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{copy.notFound}</div>
                )}
              </div>

              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <Button asChild className="bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"><Link href="/register">{copy.request}</Link></Button>
                <Button asChild variant="outline" className="border-slate-200 font-bold"><Link href="/login">{copy.access}</Link></Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </NetworkPageFrame>
  );
}

function sanitizeReturnPath(value: string | null | undefined) {
  const fallback = getTenantDefaultRoute("exportunity");
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return fallback;
  return isTenantRouteAllowed(raw, "exportunity") ? raw : fallback;
}

export function ExportunitySpaceExchangePage() {
  const { language } = useLocale();
  const { login } = useSession();
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const copy = language === "fr"
    ? {
        back: "Retour au réseau",
        eyebrow: "Accès sécurisé GTN",
        title: "Connexion à votre espace Exportunity.",
        body: "Le jeton d’accès est vérifié avant d’ouvrir le dossier autorisé.",
        waiting: "Vérification de l’accès…",
        failed: "La connexion à l’espace a échoué",
        signIn: "Ouvrir la connexion",
        home: "Retour au réseau",
        description: "Échange sécurisé d’un accès vers l’espace Global Trade Network d’Exportunity.",
      }
    : {
        back: "Back to the network",
        eyebrow: "Secure GTN access",
        title: "Connecting to your Exportunity workspace.",
        body: "The access token is verified before the authorized record is opened.",
        waiting: "Verifying access…",
        failed: "Workspace access failed",
        signIn: "Open sign in",
        home: "Back to the network",
        description: "Secure access exchange for an Exportunity Global Trade Network workspace.",
      };

  useDocumentMeta(copy.eyebrow, copy.description);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const returnPath = sanitizeReturnPath(params.get("return"));
      let exchangeToken = String(params.get("token") || "").trim();
      if (!exchangeToken) {
        try {
          exchangeToken = String(localStorage.getItem("ece_space_switch_token") || "").trim();
        } catch {
          // Browser storage can be unavailable in hardened contexts.
        }
      }

      try {
        if (!exchangeToken) {
          const refreshed = await apiRequest("/api/ece/auth/switch-space/refresh", {
            method: "POST",
            body: JSON.stringify({ targetTenant: "exportunity" }),
          });
          exchangeToken = String(refreshed?.token || "").trim();
        }
        if (!exchangeToken) throw new Error(language === "fr" ? "Jeton d’accès manquant." : "Missing access token.");

        const result = await apiRequest("/api/ece/auth/exchange-space", {
          method: "POST",
          body: JSON.stringify({ token: exchangeToken }),
        });
        if (!mounted) return;
        try {
          localStorage.removeItem("ece_space_switch_token");
        } catch {
          // Browser storage can be unavailable in hardened contexts.
        }
        login(result.token, result.user);
        setLocation(returnPath);
      } catch (caught) {
        if (!mounted) return;
        setError(caught instanceof Error ? caught.message : copy.failed);
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [copy.failed, language, login, setLocation]);

  return (
    <NetworkPageFrame backLabel={copy.back}>
      <div data-testid="exportunity-space-exchange-page" className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center px-4 py-10 sm:px-6">
        <section className="w-full rounded-[28px] border border-slate-200 bg-white p-2 shadow-[0_30px_90px_rgba(15,23,42,0.16)]">
          <div className="rounded-[22px] border border-slate-100 bg-white p-7 text-center sm:p-10">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#07111F] text-[#F5A623]">
              {error ? <AlertCircle className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
            </span>
            <div className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-[#9A6200]">{copy.eyebrow}</div>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.03em]">{error ? copy.failed : copy.title}</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">{error || copy.body}</p>
            {!error ? <p className="mt-5 text-xs font-bold text-slate-400">{copy.waiting}</p> : (
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button asChild className="bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"><Link href="/login">{copy.signIn}</Link></Button>
                <Button asChild variant="outline" className="border-slate-200 font-bold"><Link href="/">{copy.home}</Link></Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </NetworkPageFrame>
  );
}
