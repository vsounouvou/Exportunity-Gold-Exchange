import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Gauge,
  Home,
  Download,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  Users,
  X,
} from "lucide-react";
import { Redirect, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useSession } from "@/lib/session";

type OsBootstrap = {
  ok: boolean;
  member: any;
  navigation: { crm: boolean; mobility: boolean; administration: boolean; ai: boolean };
  attention: {
    dueToday: number;
    overdue: number;
    unreadNotifications: number;
    pendingDecisions: number;
    documentsForReview: number;
  };
  teams: any[];
  directory: any[];
  channels: any[];
  messages: any[];
  tasks: any[];
  projects: any[];
  documents: any[];
  partners: any[];
  meetings: any[];
  decisions: any[];
  notifications: any[];
  mobility: {
    trips: number;
    bookings: number;
    tickets: number;
    revenueXof: number;
    pendingBusRequests: number;
    pendingDemos: number;
    pendingOrders: number;
  };
  agents: any[];
};

type SectionKey =
  | "chat"
  | "accueil"
  | "messages"
  | "equipes"
  | "travail"
  | "crm"
  | "mobilite"
  | "documents"
  | "reunions"
  | "decisions"
  | "agents"
  | "plus";

const sectionNames: Record<SectionKey, string> = {
  chat: "Assistant de travail",
  accueil: "Command Center",
  messages: "Messages",
  equipes: "Équipes",
  travail: "Travail",
  crm: "CRM",
  mobilite: "Opérations mobilité",
  documents: "Documents",
  reunions: "Réunions",
  decisions: "Décisions",
  agents: "AGOOJIYE AI",
  plus: "Plus",
};

const navItems: Array<{ key: SectionKey; label: string; icon: typeof Home }> = [
  { key: "chat", label: "Assistant IA", icon: Sparkles },
  { key: "accueil", label: "Command Center", icon: LayoutDashboard },
  { key: "messages", label: "Messages", icon: MessageCircle },
  { key: "equipes", label: "Équipes", icon: Users },
  { key: "travail", label: "Projets & tâches", icon: ClipboardCheck },
  { key: "crm", label: "CRM", icon: BriefcaseBusiness },
  { key: "mobilite", label: "Mobilité", icon: TicketCheck },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "reunions", label: "Réunions", icon: CalendarDays },
  { key: "decisions", label: "Décisions", icon: ShieldCheck },
  { key: "agents", label: "Agents IA", icon: Bot },
  { key: "plus", label: "Plus", icon: Menu },
];

function formatDate(value: string | Date | null | undefined, withTime = true) {
  if (!value) return "Non définie";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Non définie";
  return new Intl.DateTimeFormat("fr-BJ", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}

function formatXof(value: number) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value || 0)} FCFA`;
}

function useOsMeta(title: string) {
  useEffect(() => {
    document.title = `${title} | AGOOJIYE OS`;
    let manifest = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!manifest) {
      manifest = document.createElement("link");
      manifest.rel = "manifest";
      document.head.appendChild(manifest);
    }
    manifest.href = "/manifest-agoojiye-os.webmanifest";
    const theme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (theme) theme.content = "#101311";
  }, [title]);
}

function authFetch(path: string, input: RequestInit = {}) {
  const token = localStorage.getItem("ece_session");
  const headers = new Headers(input.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(resolveApiUrl(path), { ...input, headers, credentials: "include", cache: "no-store" });
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/tenants/agoojye/app-icon-128.png"
        alt=""
        width={128}
        height={128}
        className={compact ? "h-9 w-9 object-contain" : "h-12 w-12 object-contain"}
      />
      <div>
        <img
          src="/brand/agoojiye/logo/AGOOJIYE_wordmark_gold_transparent.png"
          alt="AGOOJIYE"
          width={1109}
          height={201}
          className={compact ? "h-5 w-auto" : "h-6 w-auto"}
        />
        <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Operating System</span>
      </div>
    </div>
  );
}

function AccessPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#101311] text-white">
      <div className="grid min-h-screen lg:grid-cols-[minmax(360px,0.8fr)_minmax(560px,1.2fr)]">
        <section className="relative hidden overflow-hidden border-r border-white/10 lg:block">
          <img
            src="/brand/agoojiye/vehicle/hero/agoojiye-shuttle-hero-1280.webp"
            alt="Bus électrique AGOOJIYE"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[#0c100e]/75" />
          <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
            <BrandMark />
            <div className="max-w-xl">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#d8ad3d]">Espace privé de l'équipe</p>
              <h1 className="mt-4 text-5xl font-semibold leading-[1.05]">Le travail AGOOJIYE, réuni au même endroit.</h1>
              <p className="mt-5 max-w-lg text-lg leading-8 text-white/70">
                Messages, priorités, projets, documents, décisions, opérations mobilité et agents IA, selon vos autorisations.
              </p>
            </div>
            <p className="text-xs text-white/45">Accès confidentiel · Activité auditée · Données AGOOJIYE</p>
          </div>
        </section>
        <section className="flex items-center justify-center px-5 py-10 sm:px-10">{children}</section>
      </div>
    </main>
  );
}

export function AgoojiyeOsJoinPage({ token }: { token: string }) {
  useOsMeta("Rejoindre l'équipe");
  const { toast } = useToast();
  const { login } = useSession();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const inviteQuery = useQuery<any>({
    queryKey: [`/api/agoojye/os/invitations/${encodeURIComponent(token)}`],
    enabled: Boolean(token),
    retry: false,
  });
  const acceptMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/agoojye/os/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: JSON.stringify({ email, phone, password }),
      }),
    onSuccess: (payload: any) => {
      login(payload.token, payload.user);
      toast({ title: "Compte activé", description: "Bienvenue dans AGOOJIYE OS." });
      setLocation("/workspace");
    },
    onError: (error: any) =>
      toast({ title: "Activation impossible", description: error?.message || "Vérifiez vos informations.", variant: "destructive" }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      toast({ title: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    acceptMutation.mutate();
  };

  return (
    <AccessPageShell>
      <div className="w-full max-w-xl">
        <div className="mb-8 lg:hidden"><BrandMark /></div>
        {inviteQuery.isLoading ? (
          <div className="border border-white/10 bg-white/[0.04] p-8 text-white/65">Vérification de l'invitation…</div>
        ) : inviteQuery.isError ? (
          <div className="border border-red-500/30 bg-red-950/30 p-7">
            <ShieldCheck className="text-red-300" />
            <h1 className="mt-5 text-3xl font-semibold">Invitation non disponible</h1>
            <p className="mt-3 leading-7 text-white/65">Ce lien est invalide, expiré ou déjà entièrement utilisé.</p>
            <a href="/workspace/connexion" className="mt-6 inline-flex min-h-11 items-center bg-white px-4 font-semibold text-[#111]">Se connecter</a>
          </div>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#d8ad3d]">Invitation équipe</p>
            <h1 className="mt-3 text-4xl font-semibold">Activez votre espace AGOOJIYE</h1>
            <p className="mt-3 leading-7 text-white/60">
              Utilisez l'adresse <strong className="text-white">@agoojiye.com</strong> prévue pour vous. Il reste {inviteQuery.data?.remainingPlaces || 0} activation(s).
            </p>
            <form className="mt-8 grid gap-5" onSubmit={submit}>
              <div>
                <Label htmlFor="join-email" className="text-white">Adresse professionnelle</Label>
                <Input id="join-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="prenom@agoojiye.com" className="mt-2 h-12 border-white/15 bg-white/[0.06] text-white" />
              </div>
              <div>
                <Label htmlFor="join-phone" className="text-white">Téléphone <span className="text-white/45">(facultatif)</span></Label>
                <Input id="join-phone" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="+229…" className="mt-2 h-12 border-white/15 bg-white/[0.06] text-white" />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="join-password" className="text-white">Mot de passe</Label>
                  <Input id="join-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} autoComplete="new-password" className="mt-2 h-12 border-white/15 bg-white/[0.06] text-white" />
                </div>
                <div>
                  <Label htmlFor="join-confirm" className="text-white">Confirmation</Label>
                  <Input id="join-confirm" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={10} autoComplete="new-password" className="mt-2 h-12 border-white/15 bg-white/[0.06] text-white" />
                </div>
              </div>
              <p className="text-xs leading-5 text-white/45">Au moins 10 caractères. L'accès est personnel et l'activité sensible est enregistrée dans le journal d'audit.</p>
              <Button type="submit" disabled={acceptMutation.isPending} className="h-12 bg-[#d8ad3d] font-bold text-[#14120b] hover:bg-[#ebc75e]">
                {acceptMutation.isPending ? "Activation…" : "Rejoindre AGOOJIYE OS"} <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
            <p className="mt-7 text-sm text-white/50">Compte déjà activé ? <a href="/workspace/connexion" className="font-semibold text-[#e5be56]">Se connecter</a></p>
          </>
        )}
      </div>
    </AccessPageShell>
  );
}

export function AgoojiyeOsLoginPage() {
  useOsMeta("Connexion");
  const { login, isAuthenticated, isGuest } = useSession();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"credentials" | "enroll" | "verify" | "recovery" | "recovery-codes">("credentials");
  const [challengeToken, setChallengeToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [enrollment, setEnrollment] = useState<any>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [pendingSession, setPendingSession] = useState<any>(null);

  const completeLogin = (payload: any) => {
    if (Array.isArray(payload?.recoveryCodes) && payload.recoveryCodes.length) {
      setRecoveryCodes(payload.recoveryCodes);
      setPendingSession(payload);
      setStage("recovery-codes");
      return;
    }
    login(payload.token, payload.user);
    localStorage.setItem("ece_session", payload.token);
    setLocation(payload.redirect || "/workspace");
  };

  const loginMutation = useMutation({
    mutationFn: () => apiRequest("/api/agoojye/workos/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    onSuccess: (payload: any) => {
      if (payload?.status === "mfa_enrollment_required") {
        setChallengeToken(payload.challengeToken);
        setEnrollment(payload);
        setStage("enroll");
        return;
      }
      if (payload?.status === "mfa_required") {
        setChallengeToken(payload.challengeToken);
        setStage("verify");
        return;
      }
      completeLogin(payload);
    },
    onError: (error: any) =>
      toast({ title: "Connexion impossible", description: error?.message || "Adresse ou mot de passe incorrect.", variant: "destructive" }),
  });

  const mfaMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/agoojye/workos/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ challengeToken, code: mfaCode }),
      }),
    onSuccess: completeLogin,
    onError: (error: any) =>
      toast({ title: "Vérification impossible", description: error?.message || "Code incorrect.", variant: "destructive" }),
  });

  const recoveryMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/agoojye/workos/auth/mfa/recovery", {
        method: "POST",
        body: JSON.stringify({ challengeToken, recoveryCode }),
      }),
    onSuccess: completeLogin,
    onError: (error: any) =>
      toast({ title: "Récupération impossible", description: error?.message || "Code incorrect.", variant: "destructive" }),
  });

  if (isAuthenticated && !isGuest) return <Redirect to="/workspace" />;
  return (
    <AccessPageShell>
      <div className="w-full max-w-lg">
        <div className="mb-8 lg:hidden"><BrandMark /></div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#d8ad3d]">AGOOJIYE WorkOS</p>
        <h1 className="mt-3 text-4xl font-semibold">
          {stage === "credentials" ? "Connexion équipe" : stage === "enroll" ? "Activer la double authentification" : stage === "recovery-codes" ? "Codes de récupération" : "Vérification de sécurité"}
        </h1>
        <p className="mt-3 leading-7 text-white/60">
          {stage === "credentials"
            ? "Accédez à votre espace de travail ou à la salle administrative selon vos autorisations."
            : stage === "enroll"
              ? "Scannez ce QR code avec votre application d’authentification, puis saisissez le code à six chiffres."
              : stage === "recovery-codes"
                ? "Conservez ces codes hors ligne. Chacun ne peut être utilisé qu’une seule fois."
                : "Saisissez le code généré par votre application d’authentification."}
        </p>

        {stage === "credentials" ? (
          <form className="mt-8 grid gap-5" onSubmit={(event) => { event.preventDefault(); loginMutation.mutate(); }}>
            <div>
              <Label htmlFor="login-email" className="text-white">Adresse professionnelle</Label>
              <Input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="prenom@agoojiye.com" className="mt-2 h-12 border-white/15 bg-white/[0.06] text-white" />
            </div>
            <div>
              <Label htmlFor="login-password" className="text-white">Mot de passe</Label>
              <Input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" className="mt-2 h-12 border-white/15 bg-white/[0.06] text-white" />
            </div>
            <Button type="submit" disabled={loginMutation.isPending} className="h-12 bg-[#d8ad3d] font-bold text-[#14120b] hover:bg-[#ebc75e]">
              <LogIn className="mr-2 h-4 w-4" /> {loginMutation.isPending ? "Connexion…" : "Continuer"}
            </Button>
          </form>
        ) : null}

        {stage === "enroll" ? (
          <div className="mt-7">
            {enrollment?.qrDataUrl ? <img src={enrollment.qrDataUrl} alt="QR code de configuration MFA" className="h-52 w-52 bg-white p-2" /> : null}
            <p className="mt-4 break-all border border-white/10 bg-white/[0.04] p-3 font-mono text-xs text-white/65">{enrollment?.secret}</p>
            <form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); mfaMutation.mutate(); }}>
              <Label htmlFor="mfa-enroll-code" className="text-white">Code à six chiffres</Label>
              <Input id="mfa-enroll-code" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} maxLength={8} required className="h-12 border-white/15 bg-white/[0.06] text-xl text-white" />
              <Button type="submit" disabled={mfaMutation.isPending} className="h-12 bg-[#d8ad3d] font-bold text-[#14120b] hover:bg-[#ebc75e]">{mfaMutation.isPending ? "Vérification…" : "Activer et continuer"}</Button>
            </form>
          </div>
        ) : null}

        {stage === "verify" ? (
          <form className="mt-8 grid gap-4" onSubmit={(event) => { event.preventDefault(); mfaMutation.mutate(); }}>
            <Label htmlFor="mfa-login-code" className="text-white">Code à six chiffres</Label>
            <Input id="mfa-login-code" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} maxLength={8} required autoFocus className="h-12 border-white/15 bg-white/[0.06] text-xl text-white" />
            <Button type="submit" disabled={mfaMutation.isPending} className="h-12 bg-[#d8ad3d] font-bold text-[#14120b] hover:bg-[#ebc75e]">{mfaMutation.isPending ? "Vérification…" : "Ouvrir mon espace"}</Button>
            <button type="button" onClick={() => setStage("recovery")} className="min-h-11 text-left text-sm text-white/55 hover:text-white">Utiliser un code de récupération</button>
          </form>
        ) : null}

        {stage === "recovery" ? (
          <form className="mt-8 grid gap-4" onSubmit={(event) => { event.preventDefault(); recoveryMutation.mutate(); }}>
            <Label htmlFor="mfa-recovery-code" className="text-white">Code de récupération</Label>
            <Input id="mfa-recovery-code" autoComplete="one-time-code" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} required autoFocus className="h-12 border-white/15 bg-white/[0.06] font-mono text-white" />
            <Button type="submit" disabled={recoveryMutation.isPending} className="h-12 bg-[#d8ad3d] font-bold text-[#14120b] hover:bg-[#ebc75e]">{recoveryMutation.isPending ? "Vérification…" : "Continuer"}</Button>
            <button type="button" onClick={() => setStage("verify")} className="min-h-11 text-left text-sm text-white/55 hover:text-white">Revenir au code MFA</button>
          </form>
        ) : null}

        {stage === "recovery-codes" ? (
          <div className="mt-7">
            <div className="grid grid-cols-2 gap-2 border border-amber-300/25 bg-amber-950/20 p-4 font-mono text-sm text-amber-100">
              {recoveryCodes.map((code) => <span key={code}>{code}</span>)}
            </div>
            <Button
              type="button"
              onClick={() => {
                if (!pendingSession) return;
                login(pendingSession.token, pendingSession.user);
                localStorage.setItem("ece_session", pendingSession.token);
                setLocation(pendingSession.redirect || "/workspace");
              }}
              className="mt-5 h-12 w-full bg-[#d8ad3d] font-bold text-[#14120b] hover:bg-[#ebc75e]"
            >
              J’ai conservé mes codes
            </Button>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 border-t border-white/10 pt-6 text-sm text-white/55">
          <a href="https://mail.agoojiye.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-white"><Mail className="h-4 w-4" /> Webmail AGOOJIYE</a>
          <a href="/" className="inline-flex items-center gap-2 hover:text-white"><Home className="h-4 w-4" /> Site public</a>
        </div>
      </div>
    </AccessPageShell>
  );
}

function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-black/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#8a6615]">{eyebrow}</p> : null}
        <h1 className="mt-1 text-3xl font-semibold text-[#151816]">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function Stat({ label, value, detail, icon: Icon, tone = "dark" }: { label: string; value: string | number; detail?: string; icon: typeof Home; tone?: "dark" | "gold" | "green" }) {
  const colors = tone === "gold" ? "bg-[#d8ad3d] text-[#17140c]" : tone === "green" ? "bg-[#174e36] text-white" : "bg-[#171a18] text-white";
  return (
    <div className={`${colors} min-h-[136px] p-5`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.1em] opacity-65">{label}</p>
        <Icon className="h-5 w-5 opacity-70" />
      </div>
      <p className="mt-5 text-3xl font-semibold">{value}</p>
      {detail ? <p className="mt-2 text-xs opacity-60">{detail}</p> : null}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="border border-dashed border-black/20 bg-white/60 px-5 py-10 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm text-black/50">{description}</p>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const normalized = String(value || "").toLowerCase();
  const style =
    normalized.includes("done") || normalized.includes("active") || normalized.includes("approved") || normalized.includes("recorded")
      ? "bg-emerald-100 text-emerald-800"
      : normalized.includes("block") || normalized.includes("critical") || normalized.includes("overdue")
        ? "bg-red-100 text-red-800"
        : normalized.includes("review") || normalized.includes("pending") || normalized.includes("invited")
          ? "bg-amber-100 text-amber-800"
          : "bg-black/[0.06] text-black/65";
  return <span className={`${style} inline-flex min-h-6 items-center px-2 text-[11px] font-bold uppercase`}>{value.replaceAll("_", " ")}</span>;
}

function DashboardSection({ data }: { data: OsBootstrap }) {
  const firstName = data.member?.firstName || String(data.member?.displayName || "").split(" ")[0] || "membre";
  const highPriority = data.tasks.filter((task) => ["high", "critical"].includes(task.priority) && !["done", "cancelled"].includes(task.status)).slice(0, 5);
  const nextMeetings = data.meetings.slice(0, 3);
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="AGOOJIYE Command Center"
        title={`Bonjour ${firstName} — voici ce qui nécessite votre attention.`}
        description={`${data.member?.role || "Membre AGOOJIYE"} · ${data.member?.team?.name || "Équipe AGOOJIYE"}`}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="À traiter aujourd'hui" value={data.attention.dueToday} detail={`${data.attention.overdue} en retard`} icon={ClipboardCheck} tone="gold" />
        <Stat label="Notifications" value={data.attention.unreadNotifications} detail="Non lues" icon={Bell} />
        <Stat label="Documents" value={data.attention.documentsForReview} detail="En validation" icon={FileText} tone="green" />
        <Stat label="Décisions" value={data.attention.pendingDecisions} detail="À approuver" icon={ShieldCheck} />
        <Stat label="Projets actifs" value={data.projects.filter((project) => project.status === "active").length} detail="Selon vos accès" icon={Gauge} tone="green" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Mes priorités</h2><a href="/os/travail" className="text-xs font-bold text-[#805f12]">Voir le travail</a></div>
          <div className="divide-y divide-black/10 border-y border-black/10 bg-white">
            {highPriority.length ? highPriority.map((task) => (
              <div key={task.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div><p className="font-medium">{task.title}</p><p className="mt-1 text-xs text-black/45">{task.dueDate ? `Échéance ${formatDate(task.dueDate)}` : "Sans échéance"}</p></div>
                <StatusPill value={task.priority} />
              </div>
            )) : <EmptyState title="Aucune priorité critique" description="Les tâches urgentes apparaîtront ici." />}
          </div>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Prochaines réunions</h2><a href="/os/reunions" className="text-xs font-bold text-[#805f12]">Calendrier</a></div>
          <div className="space-y-2">
            {nextMeetings.length ? nextMeetings.map((meeting) => (
              <a key={meeting.id} href={meeting.videoUrl || "/os/reunions"} className="flex items-start gap-4 border border-black/10 bg-white p-4 hover:border-[#b58a24]">
                <CalendarDays className="mt-1 h-5 w-5 text-[#8a6615]" />
                <div><p className="font-medium">{meeting.title}</p><p className="mt-1 text-xs text-black/50">{formatDate(meeting.startsAt)}</p></div>
              </a>
            )) : <EmptyState title="Aucune réunion à venir" description="Créez une réunion depuis le module Réunions." />}
          </div>
        </section>
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Projets stratégiques</h2><a href="/os/travail" className="text-xs font-bold text-[#805f12]">Tous les projets</a></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.projects.slice(0, 6).map((project) => (
            <div key={project.id} className="border border-black/10 bg-white p-5">
              <div className="flex items-center justify-between gap-3"><StatusPill value={project.status} /><span className="text-sm font-semibold">{project.progress}%</span></div>
              <h3 className="mt-4 text-lg font-semibold">{project.name}</h3>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-black/55">{project.objective}</p>
              <div className="mt-5 h-1.5 bg-black/[0.08]"><div className="h-full bg-[#19724c]" style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
      {data.navigation.mobility ? (
        <section className="bg-[#101311] p-6 text-white">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.1em] text-[#d8ad3d]">Opérations mobilité</p><h2 className="mt-2 text-2xl font-semibold">Activité de la plateforme publique</h2></div>
            <a href="/admin/mobilite" className="inline-flex min-h-11 items-center justify-center border border-white/20 px-4 text-sm font-semibold hover:border-[#d8ad3d]">Ouvrir les opérations <ChevronRight className="ml-2 h-4 w-4" /></a>
          </div>
          <div className="mt-6 grid gap-px bg-white/10 sm:grid-cols-4">
            {[
              ["Voyages", data.mobility.trips],
              ["Réservations", data.mobility.bookings],
              ["Billets", data.mobility.tickets],
              ["Revenus confirmés", formatXof(data.mobility.revenueXof)],
            ].map(([label, value]) => <div key={label} className="bg-[#171a18] p-4"><p className="text-xs text-white/50">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MessagesSection({ data, refresh }: { data: OsBootstrap; refresh: () => void }) {
  const { toast } = useToast();
  const [channelId, setChannelId] = useState<number>(() => Number(new URLSearchParams(window.location.search).get("channel") || data.channels[0]?.id || 0));
  const [handledDm, setHandledDm] = useState(false);
  const [body, setBody] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const messagesQuery = useQuery<any>({
    queryKey: [`/api/agoojye/os/member/channels/${channelId}/messages`],
    enabled: channelId > 0,
    refetchInterval: 10_000,
  });
  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/agoojye/os/member/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body,
          messageType: attachmentUrl ? "document" : "text",
          attachments: attachmentUrl ? [{ name: "Pièce jointe", url: attachmentUrl }] : [],
        }),
      }),
    onSuccess: () => {
      setBody("");
      setAttachmentUrl("");
      messagesQuery.refetch();
      refresh();
    },
    onError: (error: any) => toast({ title: "Message non envoyé", description: error?.message, variant: "destructive" }),
  });
  const directMutation = useMutation({
    mutationFn: (userId: number) => apiRequest(`/api/agoojye/os/member/direct/${userId}`, { method: "POST" }),
    onSuccess: (payload: any) => {
      setChannelId(Number(payload.item.id));
      refresh();
    },
  });
  useEffect(() => {
    const dmId = Number(new URLSearchParams(window.location.search).get("dm") || 0);
    if (!handledDm && dmId > 0) {
      setHandledDm(true);
      directMutation.mutate(dmId);
    }
  }, [handledDm]);
  const messageAction = useMutation({
    mutationFn: ({ id, action, body }: { id: number; action: "reaction" | "to-task" | "to-decision"; body?: Record<string, unknown> }) =>
      apiRequest(`/api/agoojye/os/member/messages/${id}/${action}`, {
        method: action === "reaction" ? "PATCH" : "POST",
        body: JSON.stringify(body || {}),
      }),
    onSuccess: (_payload, input) => {
      messagesQuery.refetch();
      refresh();
      toast({ title: input.action === "to-task" ? "Tâche créée" : input.action === "to-decision" ? "Décision enregistrée" : "Réaction ajoutée" });
    },
  });
  const selected = data.channels.find((channel) => Number(channel.id) === channelId);
  const items = messagesQuery.data?.items || data.messages.filter((message) => Number(message.channelId) === channelId);
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Communication interne" title="Messages" description="Les échanges utiles deviennent des éléments de travail durables et consultables." />
      <div className="grid min-h-[620px] border border-black/10 bg-white lg:grid-cols-[260px_1fr_230px]">
        <aside className="border-b border-black/10 p-3 lg:border-b-0 lg:border-r">
          <p className="px-2 py-2 text-xs font-bold uppercase text-black/40">Canaux</p>
          <div className="flex gap-2 overflow-x-auto lg:grid lg:overflow-visible">
            {data.channels.map((channel) => (
              <button key={channel.id} type="button" onClick={() => setChannelId(Number(channel.id))} className={`min-h-11 shrink-0 px-3 text-left text-sm font-medium lg:w-full ${Number(channel.id) === channelId ? "bg-[#171a18] text-white" : "hover:bg-black/[0.04]"}`}>
                {channel.channelType === "direct" ? <MessageCircle className="mr-2 inline h-4 w-4" /> : "#"} {channel.name}
              </button>
            ))}
          </div>
        </aside>
        <section className="flex min-h-[520px] flex-col">
          <header className="border-b border-black/10 px-5 py-4"><h2 className="font-semibold">{selected ? `# ${selected.name}` : "Choisissez un canal"}</h2><p className="mt-1 text-xs text-black/45">{selected?.description}</p></header>
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {items.length ? items.map((message: any) => (
              <article key={message.id} className={`max-w-2xl ${Number(message.senderUserId) === Number(data.member.id) ? "ml-auto" : ""}`}>
                <div className="mb-1 flex items-center gap-2 text-xs text-black/45"><strong className="text-black/65">{message.senderName || "AGOOJIYE"}</strong><span>{formatDate(message.createdAt)}</span></div>
                <div className={`${Number(message.senderUserId) === Number(data.member.id) ? "bg-[#174e36] text-white" : "bg-[#f0f1ee]"} px-4 py-3 text-sm leading-6`}>
                  {message.body}
                  {Array.isArray(message.attachments) && message.attachments.length ? <div className="mt-3">{message.attachments.map((attachment: any) => <a key={attachment.url} href={attachment.url} target="_blank" rel="noreferrer" className="underline">{attachment.name}</a>)}</div> : null}
                  <div className={`mt-3 flex flex-wrap gap-2 border-t pt-2 text-[11px] ${Number(message.senderUserId) === Number(data.member.id) ? "border-white/15" : "border-black/10"}`}>
                    <button type="button" onClick={() => messageAction.mutate({ id: Number(message.id), action: "reaction", body: { emoji: "👍" } })} className="min-h-7 px-2 hover:bg-black/10">👍 {Number(message.reactions?.["👍"]?.length || 0) || ""}</button>
                    <button type="button" onClick={() => messageAction.mutate({ id: Number(message.id), action: "to-task" })} className="min-h-7 px-2 font-semibold hover:bg-black/10">Créer une tâche</button>
                    <button type="button" onClick={() => messageAction.mutate({ id: Number(message.id), action: "to-decision" })} className="min-h-7 px-2 font-semibold hover:bg-black/10">Enregistrer une décision</button>
                  </div>
                </div>
              </article>
            )) : <EmptyState title="Aucun message" description="Commencez la conversation dans ce canal." />}
          </div>
          <form className="border-t border-black/10 p-3" onSubmit={(event) => { event.preventDefault(); if (body.trim()) sendMutation.mutate(); }}>
            <div className="flex items-end gap-2">
              <div className="flex-1"><Label htmlFor="message-body" className="sr-only">Message</Label><Textarea id="message-body" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Écrire un message…" rows={2} className="min-h-12 resize-none border-black/15" /></div>
              <Button type="submit" disabled={!body.trim() || sendMutation.isPending || !channelId} size="icon" className="h-12 w-12 bg-[#171a18]"><Send className="h-5 w-5" /></Button>
            </div>
            <Input value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} type="url" placeholder="Lien de document ou média (facultatif)" className="mt-2 h-9 border-black/10 text-xs" />
          </form>
        </section>
        <aside className="hidden border-l border-black/10 p-3 lg:block">
          <p className="px-2 py-2 text-xs font-bold uppercase text-black/40">Messages directs</p>
          <div className="grid gap-1">
            {data.directory.filter((person) => !person.isCurrentUser && person.status === "Active").map((person) => (
              <button key={person.id} type="button" onClick={() => directMutation.mutate(Number(person.id))} className="flex min-h-11 items-center gap-3 px-2 text-left hover:bg-black/[0.04]">
                <span className="grid h-8 w-8 place-items-center bg-[#e9e4d6] text-xs font-bold">{String(person.displayName).slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{person.displayName}</span><span className="block truncate text-[11px] text-black/45">{person.role}</span></span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function TeamsSection({ data }: { data: OsBootstrap }) {
  const grouped = useMemo(
    () => data.teams.map((team) => ({ team, people: data.directory.filter((person) => Number(person.teamId) === Number(team.id)) })).filter((group) => group.people.length),
    [data.directory, data.teams],
  );
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Organisation" title="Équipes & organigramme" description="Rôles, rattachements, disponibilité et progression d'accueil de l'équipe AGOOJIYE." />
      <div className="space-y-5">
        {grouped.map(({ team, people }) => (
          <section key={team.id} className="border border-black/10 bg-white">
            <header className="border-b border-black/10 bg-[#f0eee7] px-5 py-4"><p className="text-xs font-bold uppercase text-[#805f12]">Département</p><h2 className="mt-1 text-xl font-semibold">{team.name}</h2><p className="mt-1 text-sm text-black/50">{team.mission}</p></header>
            <div className="grid md:grid-cols-2 xl:grid-cols-3">
              {people.map((person) => (
                <article key={person.id} className="border-b border-black/10 p-5 md:border-r">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center bg-[#171a18] font-bold text-[#e2b84d]">{String(person.displayName).slice(0, 2).toUpperCase()}</span><div><h3 className="font-semibold">{person.displayName}</h3><p className="text-xs text-black/50">{person.role}</p></div></div>
                    <StatusPill value={person.status} />
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-black/40">Type</dt><dd className="mt-1 font-medium">{person.employmentType}</dd></div><div><dt className="text-black/40">Disponibilité</dt><dd className="mt-1 font-medium">{person.availability}</dd></div></dl>
                  <div className="mt-4"><div className="flex justify-between text-[11px] text-black/45"><span>Accueil</span><span>{person.onboardingProgress}%</span></div><div className="mt-1 h-1.5 bg-black/[0.08]"><div className="h-full bg-[#19724c]" style={{ width: `${person.onboardingProgress}%` }} /></div></div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function TaskForm({ data, onDone }: { data: OsBootstrap; onDone: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignedTo, setAssignedTo] = useState(String(data.member.id));
  const [dueDate, setDueDate] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/agoojye/os/member/tasks", {
        method: "POST",
        body: JSON.stringify({ title, priority, assignedTo: Number(assignedTo), dueDate: dueDate ? new Date(dueDate).toISOString() : undefined }),
      }),
    onSuccess: () => { setTitle(""); onDone(); },
    onError: (error: any) => toast({ title: "Tâche non créée", description: error?.message, variant: "destructive" }),
  });
  return (
    <form className="grid gap-3 border border-black/10 bg-white p-4 md:grid-cols-[1fr_150px_180px_190px_auto]" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <Input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Nouvelle tâche…" />
      <select value={priority} onChange={(event) => setPriority(event.target.value)} className="h-10 border border-black/15 bg-white px-3 text-sm"><option value="low">Basse</option><option value="medium">Moyenne</option><option value="high">Haute</option><option value="critical">Critique</option></select>
      <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="h-10 border border-black/15 bg-white px-3 text-sm">{data.directory.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select>
      <Input type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      <Button type="submit" disabled={!title.trim() || mutation.isPending} className="bg-[#171a18]"><Plus className="mr-1 h-4 w-4" /> Ajouter</Button>
    </form>
  );
}

function WorkSection({ data, refresh }: { data: OsBootstrap; refresh: () => void }) {
  const { toast } = useToast();
  const [showProject, setShowProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [objective, setObjective] = useState("");
  const projectMutation = useMutation({
    mutationFn: () => apiRequest("/api/agoojye/os/member/projects", { method: "POST", body: JSON.stringify({ name: projectName, objective }) }),
    onSuccess: () => { setProjectName(""); setObjective(""); setShowProject(false); refresh(); },
    onError: (error: any) => toast({ title: "Projet non créé", description: error?.message, variant: "destructive" }),
  });
  const taskMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest(`/api/agoojye/os/member/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: refresh,
  });
  const columns = [
    ["todo", "À faire"],
    ["in_progress", "En cours"],
    ["blocked", "Bloqué"],
    ["review", "En validation"],
    ["done", "Terminé"],
  ] as const;
  return (
    <div className="space-y-7">
      <SectionHeader eyebrow="Exécution" title="Projets & tâches" description="Chaque travail attendu doit avoir un responsable, un statut et une échéance." action={<Button onClick={() => setShowProject((value) => !value)} variant="outline"><Plus className="mr-2 h-4 w-4" /> Nouveau projet</Button>} />
      {showProject ? (
        <form className="grid gap-4 border-l-4 border-[#d8ad3d] bg-white p-5" onSubmit={(event) => { event.preventDefault(); projectMutation.mutate(); }}>
          <h2 className="font-semibold">Créer un projet</h2>
          <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} required placeholder="Nom du projet" />
          <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} required placeholder="Objectif concret du projet" />
          <Button type="submit" className="w-fit bg-[#171a18]">Créer le projet</Button>
        </form>
      ) : null}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Projets actifs</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.projects.map((project) => (
            <article key={project.id} className="border border-black/10 bg-white p-5">
              <div className="flex items-center justify-between"><StatusPill value={project.status} /><span className="text-sm font-bold">{project.progress}%</span></div>
              <h3 className="mt-4 text-lg font-semibold">{project.name}</h3>
              <p className="mt-2 text-sm leading-6 text-black/55">{project.objective}</p>
              <p className="mt-4 text-xs text-black/40">{project.deadline ? `Échéance ${formatDate(project.deadline, false)}` : "Échéance à définir"}</p>
            </article>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Tableau des tâches</h2><span className="text-xs text-black/45">{data.tasks.length} tâche(s)</span></div>
        <TaskForm data={data} onDone={refresh} />
        <div className="mt-4 grid gap-3 overflow-x-auto xl:grid-cols-5">
          {columns.map(([status, label]) => (
            <div key={status} className="min-w-[250px] bg-[#e9eae6] p-3">
              <div className="flex items-center justify-between px-1 py-2"><h3 className="text-sm font-bold">{label}</h3><span className="text-xs text-black/40">{data.tasks.filter((task) => task.status === status).length}</span></div>
              <div className="space-y-2">
                {data.tasks.filter((task) => task.status === status).map((task) => (
                  <article key={task.id} className="border border-black/10 bg-white p-4">
                    <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold">{task.title}</p><StatusPill value={task.priority} /></div>
                    <p className="mt-2 text-xs text-black/45">{task.dueDate ? formatDate(task.dueDate) : "Sans échéance"}</p>
                    <select value={task.status} onChange={(event) => taskMutation.mutate({ id: Number(task.id), status: event.target.value })} className="mt-3 h-8 w-full border border-black/10 bg-white px-2 text-xs">
                      {columns.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                    </select>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DocumentsSection({ data, refresh }: { data: OsBootstrap; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Interne");
  const [fileUrl, setFileUrl] = useState("");
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/agoojye/os/member/documents", { method: "POST", body: JSON.stringify({ title, category, fileUrl, status: "draft", visibility: "team_only" }) }),
    onSuccess: () => { setTitle(""); setFileUrl(""); setOpen(false); refresh(); },
  });
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Centre de connaissances" title="Documents" description="Versions, statuts, propriétaires et niveaux d'accès restent attachés aux documents de l'entreprise." action={<Button variant="outline" onClick={() => setOpen((value) => !value)}><Plus className="mr-2 h-4 w-4" /> Ajouter</Button>} />
      {open ? <form className="grid gap-3 border-l-4 border-[#d8ad3d] bg-white p-5 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><Input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Titre du document" /><Input value={category} onChange={(event) => setCategory(event.target.value)} required placeholder="Catégorie" /><Input value={fileUrl} onChange={(event) => setFileUrl(event.target.value)} type="url" placeholder="Lien sécurisé (facultatif)" /><Button type="submit" className="w-fit bg-[#171a18]">Enregistrer</Button></form> : null}
      <div className="overflow-x-auto border border-black/10 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#ebe9e2] text-xs uppercase text-black/55"><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Catégorie</th><th className="px-4 py-3">Version</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3">Accès</th><th className="px-4 py-3"></th></tr></thead>
          <tbody className="divide-y divide-black/10">
            {data.documents.map((document) => <tr key={document.id}><td className="px-4 py-4 font-medium">{document.title}<p className="mt-1 max-w-md text-xs font-normal text-black/45">{document.description}</p></td><td className="px-4 py-4">{document.category}</td><td className="px-4 py-4">{document.version}</td><td className="px-4 py-4"><StatusPill value={document.status} /></td><td className="px-4 py-4">{document.visibility}</td><td className="px-4 py-4">{document.fileUrl ? <a href={document.fileUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#805f12]">Ouvrir</a> : "—"}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CrmSection({ data, refresh }: { data: OsBootstrap; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Partenaire");
  const [contactPerson, setContactPerson] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/agoojye/os/member/crm/partners", { method: "POST", body: JSON.stringify({ name, category, contactPerson, contactEmail, status: "In discussion" }) }),
    onSuccess: () => { setName(""); setContactPerson(""); setContactEmail(""); setOpen(false); refresh(); },
  });
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Relations externes" title="CRM AGOOJIYE" description="L'historique institutionnel des partenaires et prochaines actions reste centralisé." action={<Button variant="outline" onClick={() => setOpen((value) => !value)}><Plus className="mr-2 h-4 w-4" /> Nouveau contact</Button>} />
      {open ? <form className="grid gap-3 border-l-4 border-[#d8ad3d] bg-white p-5 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><Input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Organisation" /><Input value={category} onChange={(event) => setCategory(event.target.value)} required placeholder="Catégorie" /><Input value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} placeholder="Contact principal" /><Input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} type="email" placeholder="Email" /><Button type="submit" className="w-fit bg-[#171a18]">Enregistrer</Button></form> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.partners.map((partner) => (
          <article key={partner.id} className="border border-black/10 bg-white p-5">
            <div className="flex items-start justify-between gap-3"><div className="grid h-10 w-10 place-items-center bg-[#171a18] text-[#d8ad3d]"><Building2 className="h-5 w-5" /></div><StatusPill value={partner.status} /></div>
            <h2 className="mt-5 text-xl font-semibold">{partner.name}</h2><p className="mt-1 text-sm text-[#805f12]">{partner.category}</p>
            <div className="mt-5 border-t border-black/10 pt-4 text-sm text-black/55"><p>{partner.contactPerson || "Contact à identifier"}</p><p className="mt-1">{partner.contactEmail || "Aucun email enregistré"}</p></div>
          </article>
        ))}
      </div>
    </div>
  );
}

function MobilitySection({ data }: { data: OsBootstrap }) {
  return (
    <div className="space-y-7">
      <SectionHeader eyebrow="Source de données partagée" title="Opérations mobilité" description="Les ventes publiques, billets et demandes commerciales remontent dans le même système." action={<a href="/admin/mobilite" className="inline-flex min-h-10 items-center bg-[#171a18] px-4 text-sm font-semibold text-white">Ouvrir l'administration</a>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Voyages" value={data.mobility.trips} icon={Activity} tone="green" /><Stat label="Réservations" value={data.mobility.bookings} icon={ClipboardCheck} /><Stat label="Billets émis" value={data.mobility.tickets} icon={TicketCheck} tone="gold" /><Stat label="Revenu confirmé" value={formatXof(data.mobility.revenueXof)} icon={Gauge} /></div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["/admin/reservations-bus", "Réservations de bus", data.mobility.pendingBusRequests],
          ["/admin/demonstrations", "Démonstrations", data.mobility.pendingDemos],
          ["/admin/commandes-bus", "Commandes de bus", data.mobility.pendingOrders],
        ].map(([href, label, count]) => <a key={href} href={String(href)} className="flex min-h-24 items-center justify-between border border-black/10 bg-white p-5 hover:border-[#b58a24]"><div><p className="font-semibold">{label}</p><p className="mt-1 text-xs text-black/45">Demandes nouvelles</p></div><span className="text-3xl font-semibold">{count}</span></a>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["/admin/voyages", "Voyages"],
          ["/admin/reservations", "Réservations"],
          ["/admin/billets", "Billets"],
          ["/controle", "Contrôle embarquement"],
        ].map(([href, label]) => <a key={href} href={href} className="flex min-h-12 items-center justify-between bg-[#ecebe6] px-4 text-sm font-semibold hover:bg-[#dedbd1]">{label}<ChevronRight className="h-4 w-4" /></a>)}
      </div>
    </div>
  );
}

function MeetingsSection({ data, refresh }: { data: OsBootstrap; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/agoojye/os/member/meetings", { method: "POST", body: JSON.stringify({ title, agenda, startsAt: new Date(startsAt).toISOString(), participantUserIds: data.directory.map((person) => Number(person.id)) }) }),
    onSuccess: () => { setTitle(""); setAgenda(""); setStartsAt(""); setOpen(false); refresh(); },
  });
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Cadence d'équipe" title="Réunions" description="Agendas, participants, notes, décisions et suites restent associés." action={<Button variant="outline" onClick={() => setOpen((value) => !value)}><Plus className="mr-2 h-4 w-4" /> Planifier</Button>} />
      {open ? <form className="grid gap-3 border-l-4 border-[#d8ad3d] bg-white p-5 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><Input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Titre de la réunion" /><Input value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required type="datetime-local" /><Input value={agenda} onChange={(event) => setAgenda(event.target.value)} placeholder="Ordre du jour" /><Button type="submit" className="w-fit bg-[#171a18]">Planifier</Button></form> : null}
      <div className="space-y-3">
        {data.meetings.map((meeting) => (
          <article key={meeting.id} className="grid gap-4 border border-black/10 bg-white p-5 md:grid-cols-[180px_1fr_auto] md:items-center">
            <div><p className="text-sm font-bold text-[#805f12]">{formatDate(meeting.startsAt, false)}</p><p className="mt-1 text-xs text-black/45">{new Intl.DateTimeFormat("fr-BJ", { timeStyle: "short" }).format(new Date(meeting.startsAt))}</p></div>
            <div><h2 className="text-lg font-semibold">{meeting.title}</h2><p className="mt-1 text-sm text-black/50">{meeting.agenda || "Ordre du jour à compléter"}</p></div>
            <a href={meeting.videoUrl || "/meetings"} className="inline-flex min-h-10 items-center justify-center bg-[#174e36] px-4 text-sm font-semibold text-white">Rejoindre</a>
          </article>
        ))}
      </div>
    </div>
  );
}

function DecisionsSection({ data, refresh }: { data: OsBootstrap; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState("");
  const [context, setContext] = useState("");
  const [consequences, setConsequences] = useState("");
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/agoojye/os/member/decisions", { method: "POST", body: JSON.stringify({ decision, context, consequences }) }),
    onSuccess: () => { setDecision(""); setContext(""); setConsequences(""); setOpen(false); refresh(); },
  });
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Mémoire institutionnelle" title="Registre des décisions" description="Une décision importante est enregistrée avec son contexte, ses conséquences et ses actions." action={<Button variant="outline" onClick={() => setOpen((value) => !value)}><Plus className="mr-2 h-4 w-4" /> Enregistrer</Button>} />
      {open ? <form className="grid gap-3 border-l-4 border-[#d8ad3d] bg-white p-5" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><Input value={decision} onChange={(event) => setDecision(event.target.value)} required placeholder="Décision prise ou proposée" /><Textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder="Contexte et options considérées" /><Textarea value={consequences} onChange={(event) => setConsequences(event.target.value)} placeholder="Conséquences et prochaines actions" /><Button type="submit" className="w-fit bg-[#171a18]">Enregistrer</Button></form> : null}
      <div className="space-y-3">
        {data.decisions.map((item) => (
          <article key={item.id} className="border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><StatusPill value={item.status} /><span className="text-xs text-black/40">{formatDate(item.createdAt)}</span></div>
            <h2 className="mt-4 text-lg font-semibold">{item.decision}</h2>
            {item.context ? <p className="mt-2 text-sm leading-6 text-black/55"><strong>Contexte :</strong> {item.context}</p> : null}
            {item.consequences ? <p className="mt-2 text-sm leading-6 text-black/55"><strong>Conséquences :</strong> {item.consequences}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function AiSection({ data }: { data: OsBootstrap }) {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<Array<{ query: string; response: any }>>([]);
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/agoojye/os/member/assistant", { method: "POST", body: JSON.stringify({ query }) }),
    onSuccess: (response: any) => { setHistory((current) => [...current, { query, response }]); setQuery(""); },
  });
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Intelligence gouvernée" title="AGOOJIYE AI" description="Les agents sont identifiés, limités par vos autorisations et leurs actions restent auditables." />
      <section className="border border-black/10 bg-[#101311] p-5 text-white sm:p-7">
        <div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center bg-[#d8ad3d] text-[#111]"><Sparkles className="h-6 w-6" /></span><div><h2 className="text-xl font-semibold">Falovè</h2><p className="text-sm text-white/50">Assistante de l'entreprise · IA niveau 1 · Lecture et recommandation</p></div></div>
        <form className="mt-6 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (query.trim()) mutation.mutate(); }}>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Falovè, que dois-je traiter aujourd'hui ?" className="h-12 border-white/15 bg-white/[0.06] text-white" />
          <Button type="submit" size="icon" className="h-12 w-12 bg-[#d8ad3d] text-[#111] hover:bg-[#ebc75e]"><Send className="h-5 w-5" /></Button>
        </form>
        <p className="mt-3 text-xs text-white/40">Falovè recherche uniquement les données que vous êtes autorisé à consulter. Elle ne modifie rien depuis cet écran.</p>
      </section>
      {history.length ? <div className="space-y-4">{history.map((entry, index) => (
        <article key={`${entry.query}-${index}`} className="border border-black/10 bg-white p-5">
          <p className="text-sm font-semibold">Vous : {entry.query}</p>
          <div className="mt-4 border-l-2 border-[#d8ad3d] pl-4"><p className="text-sm leading-6">{entry.response.answer}</p><div className="mt-4 grid gap-2">{entry.response.matches?.map((match: any, matchIndex: number) => <a key={`${match.title}-${matchIndex}`} href={match.href} className="flex items-center justify-between gap-3 bg-[#f0f1ee] px-3 py-2 text-sm"><span><strong>{match.type}</strong> · {match.title}</span><span className="text-xs text-black/45">{match.detail}</span></a>)}</div><p className="mt-4 text-xs text-black/40">{entry.response.governance}</p></div>
        </article>
      ))}</div> : null}
      <section><h2 className="mb-3 text-lg font-semibold">Collègues numériques</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.agents.map((agent) => <article key={agent.key} className="border border-black/10 bg-white p-5"><div className="flex items-center justify-between"><Bot className="h-5 w-5 text-[#19724c]" /><span className="bg-[#171a18] px-2 py-1 text-[10px] font-bold text-white">IA · NIVEAU {agent.level}</span></div><h3 className="mt-4 font-semibold">{agent.name}</h3><p className="mt-1 text-sm text-black/50">{agent.role}</p><p className="mt-3 text-xs text-[#805f12]">{agent.department}</p></article>)}</div></section>
    </div>
  );
}

function MoreSection({ data, refresh, logout }: { data: OsBootstrap; refresh: () => void; logout: () => void }) {
  const { toast } = useToast();
  const [pushState, setPushState] = useState<"idle" | "loading" | "enabled" | "unavailable">("idle");
  const installPush = async () => {
    setPushState("loading");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("unsupported");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("denied");
      const config = await apiRequest("/api/agoojye/os/member/push/public-key");
      if (!config.enabled || !config.publicKey) throw new Error("unavailable");
      const registration = await navigator.serviceWorker.ready;
      const padding = "=".repeat((4 - (config.publicKey.length % 4)) % 4);
      const bytes = Uint8Array.from(atob((config.publicKey + padding).replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      await apiRequest("/api/agoojye/os/member/push/subscribe", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
      setPushState("enabled");
      toast({ title: "Notifications activées" });
    } catch {
      setPushState("unavailable");
      toast({ title: "Notifications non activées", description: "Vérifiez les autorisations du navigateur ou réessayez plus tard.", variant: "destructive" });
    }
  };
  const installPwa = async () => {
    const prompt = (window as any).__agoojiyeInstallPrompt;
    if (prompt) {
      await prompt.prompt();
      return;
    }
    toast({ title: "Installer l'application", description: "Utilisez « Ajouter à l'écran d'accueil » dans le menu de votre navigateur." });
  };
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Compte & outils" title="Plus" description="Votre profil, les notifications et les accès complémentaires AGOOJIYE." />
      <section className="border border-black/10 bg-white p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xl font-semibold">{data.member.displayName}</p><p className="mt-1 text-sm text-black/50">{data.member.email} · {data.member.role}</p></div>
          <StatusPill value={data.member.status} />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="bg-[#f0f1ee] p-4"><p className="text-xs text-black/40">Département</p><p className="mt-1 font-medium">{data.member.team?.name || "À définir"}</p></div><div className="bg-[#f0f1ee] p-4"><p className="text-xs text-black/40">Niveau d'accès</p><p className="mt-1 font-medium">{data.member.accessLevel} / 6</p></div><div className="bg-[#f0f1ee] p-4"><p className="text-xs text-black/40">Accueil</p><p className="mt-1 font-medium">{data.member.onboardingProgress}%</p></div></div>
      </section>
      <div className="grid gap-3 md:grid-cols-2">
        <button type="button" onClick={installPwa} className="flex min-h-24 items-center gap-4 border border-black/10 bg-white p-5 text-left hover:border-[#b58a24]"><Download className="h-6 w-6 text-[#805f12]" /><span><strong className="block">Installer AGOOJIYE OS</strong><span className="mt-1 block text-sm text-black/50">Ajouter l'application à l'écran d'accueil.</span></span></button>
        <button type="button" onClick={installPush} disabled={pushState === "loading" || pushState === "enabled"} className="flex min-h-24 items-center gap-4 border border-black/10 bg-white p-5 text-left hover:border-[#b58a24] disabled:opacity-60"><Bell className="h-6 w-6 text-[#19724c]" /><span><strong className="block">{pushState === "enabled" ? "Notifications activées" : "Activer les notifications"}</strong><span className="mt-1 block text-sm text-black/50">Mentions, tâches, réunions et alertes importantes.</span></span></button>
        <a href="https://mail.agoojiye.com/" target="_blank" rel="noreferrer" className="flex min-h-24 items-center gap-4 border border-black/10 bg-white p-5 hover:border-[#b58a24]"><Mail className="h-6 w-6 text-[#805f12]" /><span><strong className="block">Webmail AGOOJIYE</strong><span className="mt-1 block text-sm text-black/50">Accéder à votre boîte @agoojiye.com.</span></span></a>
        <button type="button" onClick={() => { refresh(); toast({ title: "Données actualisées" }); }} className="flex min-h-24 items-center gap-4 border border-black/10 bg-white p-5 text-left hover:border-[#b58a24]"><Activity className="h-6 w-6 text-[#19724c]" /><span><strong className="block">Actualiser</strong><span className="mt-1 block text-sm text-black/50">Recharger les priorités et messages.</span></span></button>
      </div>
      <section><h2 className="mb-3 text-lg font-semibold">Notifications récentes</h2><div className="divide-y divide-black/10 border-y border-black/10 bg-white">{data.notifications.slice(0, 20).map((notification) => <div key={notification.id} className="flex items-start gap-3 px-4 py-4"><Bell className={`mt-0.5 h-4 w-4 ${notification.readAt ? "text-black/30" : "text-[#19724c]"}`} /><div><p className="text-sm font-medium">{notification.title}</p><p className="mt-1 text-xs text-black/45">{notification.body} · {formatDate(notification.createdAt)}</p></div></div>)}</div></section>
      <Button variant="outline" onClick={logout} className="border-red-200 text-red-700 hover:bg-red-50"><LogOut className="mr-2 h-4 w-4" /> Se déconnecter</Button>
    </div>
  );
}

function ContextRail({ data }: { data: OsBootstrap }) {
  const activeTasks = data.tasks
    .filter((task) => !["done", "cancelled"].includes(String(task.status || "").toLowerCase()))
    .sort((a, b) => new Date(a.dueDate || "2999-01-01").getTime() - new Date(b.dueDate || "2999-01-01").getTime());
  const blockers = activeTasks.filter((task) => task.status === "blocked" || task.blocker);
  return (
    <aside className="fixed inset-y-0 right-0 z-30 hidden w-[320px] overflow-y-auto border-l border-black/10 bg-[#eeece5] xl:block">
      <div className="border-b border-black/10 px-5 py-5">
        <p className="text-xs font-bold uppercase text-[#805f12]">Contexte de travail</p>
        <p className="mt-2 text-lg font-semibold">{new Intl.DateTimeFormat("fr-BJ", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
        <p className="mt-1 text-xs text-black/45">Fuseau Africa/Porto-Novo</p>
      </div>
      <section className="border-b border-black/10 px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">À traiter</h2>
          <a href="/workspace/tasks" className="text-xs font-bold text-[#805f12]">Tout voir</a>
        </div>
        <div className="mt-3 divide-y divide-black/10">
          {activeTasks.slice(0, 5).map((task) => (
            <a key={task.id} href="/workspace/tasks" className="block py-3">
              <p className="text-sm font-medium leading-5">{task.title}</p>
              <p className="mt-1 text-[11px] text-black/45">{task.dueDate ? formatDate(task.dueDate) : "Sans échéance"} · {task.priority}</p>
            </a>
          ))}
          {!activeTasks.length ? <p className="py-4 text-sm text-black/45">Aucune tâche active.</p> : null}
        </div>
      </section>
      <section className="border-b border-black/10 px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Agenda</h2>
          <a href="/workspace/calendar" className="text-xs font-bold text-[#805f12]">Calendrier</a>
        </div>
        <div className="mt-3 space-y-3">
          {data.meetings.slice(0, 4).map((meeting) => (
            <a key={meeting.id} href="/workspace/calendar" className="flex gap-3">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#19724c]" />
              <span><strong className="block text-sm font-medium">{meeting.title}</strong><span className="mt-1 block text-[11px] text-black/45">{formatDate(meeting.startsAt)}</span></span>
            </a>
          ))}
          {!data.meetings.length ? <p className="text-sm text-black/45">Aucun rendez-vous à venir.</p> : null}
        </div>
      </section>
      <section className="border-b border-black/10 px-5 py-5">
        <h2 className="text-sm font-semibold">Blocages et approbations</h2>
        <div className="mt-3 grid grid-cols-2 gap-px bg-black/10">
          <a href="/workspace/tasks" className="bg-[#f7f5ef] p-3"><span className="block text-2xl font-semibold text-red-700">{blockers.length}</span><span className="text-[11px] text-black/45">Blocages</span></a>
          <a href="/workspace/decisions" className="bg-[#f7f5ef] p-3"><span className="block text-2xl font-semibold">{data.attention.pendingDecisions}</span><span className="text-[11px] text-black/45">Décisions</span></a>
        </div>
      </section>
      <section className="px-5 py-5">
        <h2 className="text-sm font-semibold">HOWJI</h2>
        <p className="mt-2 text-xs leading-5 text-black/50">Relances internes, synthèse des retards et remontée des blocages. Toute action sensible attend une approbation.</p>
        {data.navigation.administration ? <a href="/admin/howji" className="mt-3 inline-flex min-h-10 items-center text-xs font-bold text-[#805f12]">Ouvrir la coordination <ChevronRight className="ml-1 h-4 w-4" /></a> : null}
      </section>
    </aside>
  );
}

function OsShell({ data, section, children, logout }: { data: OsBootstrap; section: SectionKey; children: ReactNode; logout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleNav = navItems.filter((item) => {
    if (item.key === "crm") return data.navigation.crm;
    if (item.key === "mobilite") return data.navigation.mobility;
    return true;
  });
  const mobileNav = [
    { key: "chat" as SectionKey, label: "Assistant", icon: Sparkles },
    { key: "messages" as SectionKey, label: "Messages", icon: MessageCircle },
    { key: "travail" as SectionKey, label: "Travail", icon: ClipboardCheck },
    { key: "accueil" as SectionKey, label: "Contexte", icon: LayoutDashboard },
    { key: "plus" as SectionKey, label: "Plus", icon: Menu },
  ];
  return (
    <div className="min-h-screen bg-[#f5f4ef] text-[#151816]">
      <aside className={`fixed inset-y-0 left-0 z-50 w-[300px] overflow-y-auto bg-[#101311] px-4 py-5 text-white transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between"><BrandMark compact /><button type="button" onClick={() => setMenuOpen(false)} className="grid h-10 w-10 place-items-center lg:hidden" aria-label="Fermer"><X className="h-5 w-5" /></button></div>
        <div className="mt-7 border-y border-white/10 py-4">
          <p className="truncate text-sm font-semibold">{data.member.displayName}</p>
          <p className="mt-1 truncate text-xs text-white/45">{data.member.role}</p>
        </div>
        <a href="/workspace/chat" className="mt-5 flex min-h-11 items-center justify-center gap-2 bg-[#d8ad3d] px-3 text-sm font-bold text-[#16130c]">
          <Plus className="h-4 w-4" /> Nouvelle conversation IA
        </a>
        <div className="mt-5">
          <p className="px-3 text-[10px] font-bold uppercase text-white/35">Conversations récentes</p>
          <a href="/workspace/chat" className="mt-2 flex min-h-10 items-center gap-3 px-3 text-xs text-white/70 hover:bg-white/[0.06]"><Sparkles className="h-4 w-4 text-[#d8ad3d]" /><span><strong className="block">Falovè</strong><span className="text-white/35">Assistant personnel</span></span></a>
          {data.navigation.administration ? <a href="/admin/howji" className="flex min-h-10 items-center gap-3 px-3 text-xs text-white/70 hover:bg-white/[0.06]"><Bot className="h-4 w-4 text-[#4db684]" /><span><strong className="block">HOWJI</strong><span className="text-white/35">Coordination épinglée</span></span></a> : null}
        </div>
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="px-3 text-[10px] font-bold uppercase text-white/35">Canaux</p>
          {data.channels.slice(0, 6).map((channel) => <a key={channel.id} href={`/workspace/messages?channel=${channel.id}`} className="flex min-h-9 items-center gap-2 px-3 text-xs text-white/55 hover:bg-white/[0.06] hover:text-white"><span className="text-white/25">#</span><span className="truncate">{channel.name}</span></a>)}
        </div>
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="px-3 text-[10px] font-bold uppercase text-white/35">Messages directs</p>
          {data.directory.filter((person) => person.id !== data.member.id).slice(0, 5).map((person) => <a key={person.id} href={`/workspace/messages?dm=${person.id}`} className="flex min-h-9 items-center gap-2 px-3 text-xs text-white/55 hover:bg-white/[0.06] hover:text-white"><span className="grid h-5 w-5 place-items-center bg-white/10 text-[9px]">{String(person.displayName).slice(0, 1)}</span><span className="truncate">{person.displayName}</span></a>)}
        </div>
        <nav className="mt-5 grid gap-1" aria-label="Navigation AGOOJIYE OS">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase text-white/35">Modules</p>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return <a key={item.key} href={item.key === "chat" ? "/workspace/chat" : item.key === "accueil" ? "/workspace/dashboard" : `/workspace/${item.key}`} onClick={() => setMenuOpen(false)} className={`flex min-h-10 items-center gap-3 px-3 text-xs font-medium ${section === item.key ? "bg-[#d8ad3d] text-[#16130c]" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}><Icon className="h-[17px] w-[17px]" />{item.label}{item.key === "messages" && data.attention.unreadNotifications > 0 ? <span className="ml-auto bg-white/10 px-2 py-0.5 text-[10px]">{data.attention.unreadNotifications}</span> : null}</a>;
          })}
        </nav>
        <div className="mt-7 border-t border-white/10 pt-4"><a href="/" className="flex min-h-10 items-center gap-3 px-3 text-xs text-white/50 hover:text-white"><Home className="h-4 w-4" /> Site public</a><a href="https://mail.agoojiye.com/" target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-3 px-3 text-xs text-white/50 hover:text-white"><Mail className="h-4 w-4" /> Webmail</a><button type="button" onClick={logout} className="flex min-h-10 w-full items-center gap-3 px-3 text-xs text-white/50 hover:text-white"><LogOut className="h-4 w-4" /> Déconnexion</button></div>
      </aside>
      <div className="lg:pl-[300px] xl:pr-[320px]">
        <header className="sticky top-0 z-40 flex h-16 items-center border-b border-black/10 bg-[#f5f4ef]/95 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setMenuOpen(true)} className="grid h-11 w-11 place-items-center border border-black/10 lg:hidden" aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button>
          <p className="ml-3 text-sm font-semibold lg:ml-0">{sectionNames[section]}</p>
          <div className="ml-auto flex items-center gap-3">{data.navigation.administration ? <a href="/admin/command-center" className="hidden min-h-9 items-center border border-black/15 px-3 text-xs font-semibold md:inline-flex">Salle administrative</a> : null}<span className="hidden text-right sm:block"><span className="block text-xs font-medium">{data.member.displayName}</span><span className="block text-[10px] text-black/40">{data.member.team?.name || "AGOOJIYE"}</span></span><span className="grid h-9 w-9 place-items-center bg-[#171a18] text-xs font-bold text-[#d8ad3d]">{String(data.member.displayName).slice(0, 2).toUpperCase()}</span></div>
        </header>
        <main className="mx-auto max-w-[1240px] px-4 pb-28 pt-7 sm:px-6 lg:pb-10 lg:pt-9">{children}</main>
      </div>
      <ContextRail data={data} />
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-black/10 bg-white lg:hidden" aria-label="Navigation mobile">
        {mobileNav.map((item) => { const Icon = item.icon; return <a key={item.key} href={item.key === "chat" ? "/workspace/chat" : item.key === "accueil" ? "/workspace/dashboard" : `/workspace/${item.key}`} className={`flex min-h-[68px] flex-col items-center justify-center gap-1 text-[10px] font-medium ${section === item.key ? "text-[#805f12]" : "text-black/50"}`}><Icon className="h-5 w-5" />{item.label}</a>; })}
      </nav>
    </div>
  );
}

function sectionFromLocation(location: string): SectionKey {
  const segments = location.split("?")[0].split("/").filter(Boolean);
  const segment = segments[1] || (segments[0] === "workspace" ? "chat" : "accueil");
  const aliases: Record<string, SectionKey> = {
    chat: "chat",
    dashboard: "accueil",
    messages: "messages",
    channels: "messages",
    tasks: "travail",
    projects: "travail",
    calendar: "reunions",
    files: "documents",
    meetings: "reunions",
    notifications: "plus",
    settings: "plus",
    search: "plus",
  };
  return aliases[segment] || (Object.prototype.hasOwnProperty.call(sectionNames, segment) ? (segment as SectionKey) : "chat");
}

export function AgoojiyeOsAppPage() {
  const { isAuthenticated, isGuest, logout } = useSession();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const section = sectionFromLocation(location);
  useOsMeta(sectionNames[section]);
  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault();
      (window as any).__agoojiyeInstallPrompt = event;
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);
  const bootstrap = useQuery<OsBootstrap>({
    queryKey: ["/api/agoojye/os/member/bootstrap"],
    enabled: isAuthenticated && !isGuest,
    refetchInterval: 30_000,
    retry: false,
  });
  if (!isAuthenticated || isGuest) return <Redirect to="/workspace/connexion" />;
  if (bootstrap.isLoading) return <div className="grid min-h-screen place-items-center bg-[#101311] text-white"><div className="text-center"><img src="/tenants/agoojye/app-icon-128.png" alt="" className="mx-auto h-20 w-20 animate-pulse" /><p className="mt-4 text-sm text-white/60">Ouverture de votre Command Center…</p></div></div>;
  if (bootstrap.isError || !bootstrap.data) return <div className="grid min-h-screen place-items-center bg-[#101311] p-5 text-white"><div className="max-w-md border border-red-500/30 bg-red-950/20 p-7"><ShieldCheck className="text-red-300" /><h1 className="mt-4 text-2xl font-semibold">Accès AGOOJIYE OS refusé</h1><p className="mt-3 text-sm leading-6 text-white/60">Votre session n'est pas rattachée à un profil d'équipe actif.</p><div className="mt-6 flex gap-3"><Button onClick={() => bootstrap.refetch()}>Réessayer</Button><Button variant="outline" onClick={logout} className="border-white/20 bg-transparent text-white">Déconnexion</Button></div></div></div>;
  const data = bootstrap.data;
  if (section === "crm" && !data.navigation.crm) return <Redirect to="/workspace" />;
  if (section === "mobilite" && !data.navigation.mobility) return <Redirect to="/workspace" />;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/agoojye/os/member/bootstrap"] });
    bootstrap.refetch();
  };
  let content: ReactNode;
  if (section === "chat") content = <AiSection data={data} />;
  else if (section === "messages") content = <MessagesSection data={data} refresh={refresh} />;
  else if (section === "equipes") content = <TeamsSection data={data} />;
  else if (section === "travail") content = <WorkSection data={data} refresh={refresh} />;
  else if (section === "crm") content = <CrmSection data={data} refresh={refresh} />;
  else if (section === "mobilite") content = <MobilitySection data={data} />;
  else if (section === "documents") content = <DocumentsSection data={data} refresh={refresh} />;
  else if (section === "reunions") content = <MeetingsSection data={data} refresh={refresh} />;
  else if (section === "decisions") content = <DecisionsSection data={data} refresh={refresh} />;
  else if (section === "agents") content = <AiSection data={data} />;
  else if (section === "plus") content = <MoreSection data={data} refresh={refresh} logout={logout} />;
  else content = <DashboardSection data={data} />;
  return <OsShell data={data} section={section} logout={logout}>{content}</OsShell>;
}
