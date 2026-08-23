import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe2,
  KeyRound,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, Redirect, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";
import { getCountryOptions, getSuggestedCountryCode } from "@/lib/countries";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type AccessMode = "login" | "request";
type ApplicationRole = "buyer" | "supplier" | "shareholder";

type ApplicationForm = {
  displayName: string;
  email: string;
  phone: string;
  roleKey: ApplicationRole;
  country: string;
  city: string;
  address: string;
};

type LoginResponse = {
  token: string;
  user: any;
};

const inputClassName =
  "h-11 border-slate-200 bg-white text-[#07111F] shadow-none placeholder:text-slate-400 focus-visible:ring-[#F5A623]";

function normalizedNext(location: string) {
  try {
    const parsed = new URL(location, "https://app.local");
    const value = String(parsed.searchParams.get("next") || "").trim();
    if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return null;
    return value;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function copyFor(language: string) {
  if (language === "fr") {
    return {
      network: "Réseau commercial mondial",
      back: "Retour au réseau",
      eyebrow: "Accès Exportunity",
      title: "Continuez le commerce avec Awa.",
      description:
        "Retrouvez vos demandes, fournisseurs, offres, commandes et équipes dans le même espace opérationnel que le réseau GTN.",
      recordTitle: "Un dossier commercial continu",
      recordBody: "De la demande initiale à l’offre, la commande et le suivi.",
      awaTitle: "Awa reste votre point d’entrée",
      awaBody: "La conversation qualifie le besoin avant toute action externe.",
      networkTitle: "Réseau industriel vérifiable",
      networkBody: "GDIZ, usines, fournisseurs et corridors restent liés à leurs preuves.",
      loginTab: "Se connecter",
      requestTab: "Demander un accès",
      loginTitle: "Ouvrir votre espace",
      loginBody: "Utilisez les identifiants de votre compte Exportunity.",
      email: "Adresse e-mail",
      password: "Mot de passe",
      loginAction: "Se connecter",
      loggingIn: "Connexion…",
      requestTitle: "Créer une demande d’accès",
      requestBody: "Le formulaire crée un dossier à examiner; il n’active pas automatiquement un compte.",
      fullName: "Nom complet",
      phone: "Téléphone professionnel",
      optional: "facultatif si un e-mail est renseigné",
      role: "Votre rôle principal",
      buyer: "Acheteur ou importateur",
      buyerBody: "Sourcer, comparer et acheter pour une entreprise.",
      supplier: "Fournisseur ou exportateur",
      supplierBody: "Présenter une capacité et répondre à des demandes qualifiées.",
      partner: "Partenaire stratégique",
      partnerBody: "Développer un corridor, une industrie ou un programme commercial.",
      country: "Pays",
      countryPlaceholder: "Sélectionner un pays",
      city: "Ville",
      address: "Adresse professionnelle",
      requestAction: "Transmettre la demande",
      requesting: "Transmission…",
      required: "Renseignez tous les champs obligatoires.",
      contactRequired: "Renseignez un e-mail valide ou un numéro de téléphone.",
      loginFailure: "Connexion impossible",
      requestFailure: "Demande non transmise",
      submitted: "Demande enregistrée",
      submittedBody:
        "Votre dossier est enregistré pour examen. Aucune publication, prise de contact fournisseur ou transaction n’a été déclenchée.",
      reference: "Référence du dossier",
      trackStatus: "Suivre cette demande",
      signInInstead: "Se connecter à un compte existant",
      homeAction: "Retourner au réseau GTN",
      humanReview: "Examen humain lorsque requis",
      noAutomaticAction: "Aucune action externe automatique",
    };
  }

  return {
    network: "Global Trade Network",
    back: "Back to the network",
    eyebrow: "Exportunity access",
    title: "Continue the trade with Awa.",
    description:
      "Return to your requirements, suppliers, offers, orders, and teams in the same operating space as the GTN network.",
    recordTitle: "One continuous commercial record",
    recordBody: "From the first requirement through offer, order, and follow-up.",
    awaTitle: "Awa remains your entry point",
    awaBody: "The conversation qualifies the requirement before any external action.",
    networkTitle: "Verifiable industrial network",
    networkBody: "GDIZ, factories, suppliers, and corridors remain linked to evidence.",
    loginTab: "Sign in",
    requestTab: "Request access",
    loginTitle: "Open your workspace",
    loginBody: "Use the credentials for your Exportunity account.",
    email: "Email address",
    password: "Password",
    loginAction: "Sign in",
    loggingIn: "Signing in…",
    requestTitle: "Create an access request",
    requestBody: "This creates a file for review; it does not automatically activate an account.",
    fullName: "Full name",
    phone: "Business phone",
    optional: "optional when an email is provided",
    role: "Your primary role",
    buyer: "Buyer or importer",
    buyerBody: "Source, compare, and buy for an organization.",
    supplier: "Supplier or exporter",
    supplierBody: "Present capabilities and respond to qualified requirements.",
    partner: "Strategic partner",
    partnerBody: "Develop a corridor, industry, or commercial program.",
    country: "Country",
    countryPlaceholder: "Select a country",
    city: "City",
    address: "Business address",
    requestAction: "Submit access request",
    requesting: "Submitting…",
    required: "Complete every required field.",
    contactRequired: "Provide a valid email address or phone number.",
    loginFailure: "Sign-in failed",
    requestFailure: "Request not submitted",
    submitted: "Request recorded",
    submittedBody:
      "Your file is recorded for review. No publication, supplier contact, or transaction was triggered.",
    reference: "File reference",
    trackStatus: "Track this request",
    signInInstead: "Sign in to an existing account",
    homeAction: "Return to the GTN network",
    humanReview: "Human review when required",
    noAutomaticAction: "No automatic external action",
  };
}

export default function AccessPage() {
  const [location, setLocation] = useLocation();
  const session = useSession();
  const { language, setLanguage } = useLocale();
  const { toast } = useToast();
  const copy = useMemo(() => copyFor(language), [language]);
  const countries = useMemo(() => getCountryOptions(language === "fr" ? "fr" : "en"), [language]);
  const defaultMode: AccessMode = location.split("?")[0] === "/register" ? "request" : "login";
  const [mode, setMode] = useState<AccessMode>(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [applicationRef, setApplicationRef] = useState("");
  const [application, setApplication] = useState<ApplicationForm>(() => ({
    displayName: "",
    email: "",
    phone: "",
    roleKey: "buyer",
    country: getSuggestedCountryCode() || "",
    city: "",
    address: "",
  }));
  const next = useMemo(() => normalizedNext(location) || "/pro/operations", [location]);

  useEffect(() => {
    document.title =
      language === "fr"
        ? "Accès au réseau commercial | Exportunity"
        : "Global Trade Network Access | Exportunity";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content =
      language === "fr"
        ? "Connectez-vous ou demandez un accès au réseau GTN d’Exportunity pour suivre demandes, fournisseurs, offres et commandes."
        : "Sign in or request access to Exportunity's GTN network for tracked requirements, suppliers, offers, and orders.";
  }, [language]);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes("@") || !password) {
        throw new Error(copy.contactRequired);
      }
      const response = (await apiRequest("/api/ece/auth/login", "POST", {
        email: normalizedEmail,
        password,
      })) as LoginResponse;
      if (!response?.token || !response?.user) throw new Error(copy.loginFailure);
      return response;
    },
    onSuccess: (response) => {
      session.login(response.token, response.user);
      setLocation(response.user?.mustChangePassword ? "/admin/password" : next);
    },
    onError: (error) => {
      toast({
        title: copy.loginFailure,
        description: errorMessage(error, copy.loginFailure),
        variant: "destructive",
      });
    },
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const cleaned = {
        ...application,
        displayName: application.displayName.trim(),
        email: application.email.trim().toLowerCase(),
        phone: application.phone.trim(),
        city: application.city.trim(),
        address: application.address.trim(),
      };
      if (!cleaned.displayName || !cleaned.country || !cleaned.city || !cleaned.address) {
        throw new Error(copy.required);
      }
      const phoneDigits = cleaned.phone.replace(/[^\d]/g, "");
      const validEmail = cleaned.email.includes("@") && cleaned.email.includes(".");
      const validPhone = phoneDigits.length >= 7;
      if (!validEmail && !validPhone) throw new Error(copy.contactRequired);

      const formData = new FormData();
      formData.append("contact", validEmail ? cleaned.email : cleaned.phone);
      formData.append("displayName", cleaned.displayName);
      formData.append("roleKey", cleaned.roleKey);
      formData.append("country", cleaned.country);
      formData.append("city", cleaned.city);
      formData.append("address", cleaned.address);
      if (validEmail) formData.append("email", cleaned.email);
      if (validPhone) formData.append("phone", cleaned.phone);

      return (await apiRequest("/api/ece/applications/submit", {
        method: "POST",
        body: formData,
      })) as { applicationRef?: string };
    },
    onSuccess: (response) => {
      setApplicationRef(String(response?.applicationRef || ""));
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (error) => {
      toast({
        title: copy.requestFailure,
        description: errorMessage(error, copy.requestFailure),
        variant: "destructive",
      });
    },
  });

  if (session.isAuthenticated && !session.isGuest && mode === "login") {
    return <Redirect to={next} />;
  }

  const roles: Array<{
    value: ApplicationRole;
    title: string;
    description: string;
    icon: typeof Building2;
  }> = [
    { value: "buyer", title: copy.buyer, description: copy.buyerBody, icon: Globe2 },
    { value: "supplier", title: copy.supplier, description: copy.supplierBody, icon: Building2 },
    { value: "shareholder", title: copy.partner, description: copy.partnerBody, icon: ShieldCheck },
  ];

  return (
    <div
      data-testid="exportunity-access-page"
      className="relative min-h-screen overflow-hidden bg-[#F7F8FA] text-[#07111F]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="pointer-events-none absolute -left-40 top-24 h-96 w-96 rounded-full bg-[#F5A623]/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-sky-300/15 blur-3xl" />

      <header className="relative z-10 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3">
            <img
              src="/tenants/exportunity/official/logo-long-light.png"
              alt="Exportunity"
              className="h-9 w-auto max-w-[190px] object-contain"
            />
            <span className="hidden border-l border-slate-200 pl-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 lg:block">
              {copy.network}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-slate-200 bg-slate-50 p-1" aria-label="Language">
              {(["en", "fr"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLanguage(value)}
                  className={cn(
                    "rounded px-2.5 py-1 text-[11px] font-bold uppercase transition",
                    language === value ? "bg-[#07111F] text-white" : "text-slate-500 hover:text-slate-950",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <Link
              href="/"
              className="hidden items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#F5A623] hover:text-slate-950 sm:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" />
              {copy.back}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)] lg:py-16">
        <section className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F5A623]/35 bg-[#FFF8E8] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[#8A5700]">
            <Globe2 className="h-3.5 w-3.5" />
            {copy.eyebrow}
          </div>
          <h1 className="mt-6 max-w-xl text-4xl font-black leading-[1.05] tracking-[-0.04em] text-[#07111F] sm:text-5xl lg:text-6xl">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            {copy.description}
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { icon: KeyRound, title: copy.recordTitle, body: copy.recordBody },
              { icon: MessageSquareText, title: copy.awaTitle, body: copy.awaBody },
              { icon: MapPin, title: copy.networkTitle, body: copy.networkBody },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#07111F] text-[#F5A623]">
                  <Icon className="h-4 w-4" />
                </span>
                <h2 className="mt-4 text-sm font-black leading-5 text-slate-950">{title}</h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-2 shadow-[0_30px_90px_rgba(15,23,42,0.16)]">
          <div className="rounded-[22px] border border-slate-100 bg-white p-5 sm:p-7">
            {applicationRef ? (
              <div className="py-5 text-center" data-testid="exportunity-access-request-success">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="h-8 w-8" />
                </span>
                <h2 className="mt-5 text-2xl font-black tracking-tight">{copy.submitted}</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">{copy.submittedBody}</p>
                <div className="mt-6 rounded-xl border border-[#F5A623]/30 bg-[#FFF8E8] px-4 py-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8A5700]">{copy.reference}</div>
                  <div className="mt-2 break-all font-mono text-lg font-black text-[#07111F]">{applicationRef}</div>
                </div>
                <div className="mt-6 grid gap-2">
                  <Button asChild type="button" className="h-11 bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]">
                    <Link href={`/application-status?ref=${encodeURIComponent(applicationRef)}`}>{copy.trackStatus}</Link>
                  </Button>
                  <Button
                    type="button"
                    className="h-11 bg-[#07111F] font-bold text-white hover:bg-[#14243B]"
                    onClick={() => {
                      setApplicationRef("");
                      setMode("login");
                    }}
                  >
                    {copy.signInInstead}
                  </Button>
                  <Button asChild type="button" variant="outline" className="h-11 border-slate-200 font-bold">
                    <Link href="/">{copy.homeAction}</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                  {([
                    ["login", copy.loginTab],
                    ["request", copy.requestTab],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMode(value)}
                      className={cn(
                        "min-h-10 rounded-lg px-3 text-sm font-bold transition",
                        mode === value ? "bg-white text-[#07111F] shadow-sm" : "text-slate-500 hover:text-slate-900",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {mode === "login" ? (
                  <form
                    className="mt-7 space-y-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      loginMutation.mutate();
                    }}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <UserRound className="h-5 w-5 text-[#B26F00]" />
                        <h2 className="text-xl font-black">{copy.loginTitle}</h2>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{copy.loginBody}</p>
                    </div>
                    <label className="block space-y-2 text-sm font-bold text-slate-700">
                      <span>{copy.email}</span>
                      <Input
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        className={inputClassName}
                        disabled={loginMutation.isPending}
                        data-testid="exportunity-access-email"
                      />
                    </label>
                    <label className="block space-y-2 text-sm font-bold text-slate-700">
                      <span>{copy.password}</span>
                      <Input
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        type="password"
                        autoComplete="current-password"
                        className={inputClassName}
                        disabled={loginMutation.isPending}
                        data-testid="exportunity-access-password"
                      />
                    </label>
                    <Button
                      type="submit"
                      className="h-12 w-full bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
                      disabled={loginMutation.isPending}
                      data-testid="exportunity-access-submit"
                    >
                      {loginMutation.isPending ? copy.loggingIn : copy.loginAction}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </form>
                ) : (
                  <form
                    className="mt-7 space-y-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      requestMutation.mutate();
                    }}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-[#B26F00]" />
                        <h2 className="text-xl font-black">{copy.requestTitle}</h2>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{copy.requestBody}</p>
                    </div>

                    <label className="block space-y-2 text-sm font-bold text-slate-700">
                      <span>{copy.fullName}</span>
                      <Input
                        value={application.displayName}
                        onChange={(event) => setApplication((current) => ({ ...current, displayName: event.target.value }))}
                        autoComplete="name"
                        className={inputClassName}
                        disabled={requestMutation.isPending}
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-2 text-sm font-bold text-slate-700">
                        <span>{copy.email}</span>
                        <Input
                          value={application.email}
                          onChange={(event) => setApplication((current) => ({ ...current, email: event.target.value }))}
                          type="email"
                          autoComplete="email"
                          inputMode="email"
                          className={inputClassName}
                          disabled={requestMutation.isPending}
                        />
                      </label>
                      <label className="block space-y-2 text-sm font-bold text-slate-700">
                        <span>{copy.phone}</span>
                        <Input
                          value={application.phone}
                          onChange={(event) => setApplication((current) => ({ ...current, phone: event.target.value }))}
                          type="tel"
                          autoComplete="tel"
                          inputMode="tel"
                          placeholder={copy.optional}
                          className={inputClassName}
                          disabled={requestMutation.isPending}
                        />
                      </label>
                    </div>

                    <fieldset className="space-y-2">
                      <legend className="text-sm font-bold text-slate-700">{copy.role}</legend>
                      <div className="grid gap-2">
                        {roles.map(({ value, title, description, icon: Icon }) => {
                          const active = application.roleKey === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setApplication((current) => ({ ...current, roleKey: value }))}
                              className={cn(
                                "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                                active
                                  ? "border-[#F5A623] bg-[#FFF8E8] shadow-sm"
                                  : "border-slate-200 bg-white hover:border-[#F5A623]/60",
                              )}
                              disabled={requestMutation.isPending}
                            >
                              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", active ? "bg-[#07111F] text-[#F5A623]" : "bg-slate-100 text-slate-500")}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <span>
                                <span className="block text-sm font-black text-slate-950">{title}</span>
                                <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-2 text-sm font-bold text-slate-700">
                        <span>{copy.country}</span>
                        <select
                          value={application.country}
                          onChange={(event) => setApplication((current) => ({ ...current, country: event.target.value }))}
                          className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-[#07111F] outline-none focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/25"
                          disabled={requestMutation.isPending}
                        >
                          <option value="">{copy.countryPlaceholder}</option>
                          {countries.map((country) => (
                            <option key={country.code} value={country.code}>
                              {country.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-2 text-sm font-bold text-slate-700">
                        <span>{copy.city}</span>
                        <Input
                          value={application.city}
                          onChange={(event) => setApplication((current) => ({ ...current, city: event.target.value }))}
                          autoComplete="address-level2"
                          className={inputClassName}
                          disabled={requestMutation.isPending}
                        />
                      </label>
                    </div>

                    <label className="block space-y-2 text-sm font-bold text-slate-700">
                      <span>{copy.address}</span>
                      <Input
                        value={application.address}
                        onChange={(event) => setApplication((current) => ({ ...current, address: event.target.value }))}
                        autoComplete="street-address"
                        className={inputClassName}
                        disabled={requestMutation.isPending}
                      />
                    </label>

                    <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600 sm:grid-cols-2">
                      <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-700" />{copy.humanReview}</span>
                      <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-700" />{copy.noAutomaticAction}</span>
                    </div>

                    <Button
                      type="submit"
                      className="h-12 w-full bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
                      disabled={requestMutation.isPending}
                      data-testid="exportunity-access-request-submit"
                    >
                      {requestMutation.isPending ? copy.requesting : copy.requestAction}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
