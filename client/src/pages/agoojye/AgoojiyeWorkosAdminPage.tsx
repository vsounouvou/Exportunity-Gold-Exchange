import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Network,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Upload,
  UserPlus,
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

type AdminOverview = {
  ok: boolean;
  currentUser: { id: number; email: string; displayName: string; superAdmin: boolean };
  metrics: Record<string, number>;
  people: any[];
  teams: any[];
  tasks: any[];
  projects: any[];
  vacancies: any[];
  agents: any[];
  securityEvents: any[];
};

const ADMIN_NAV = [
  ["/admin/command-center", "Command center", LayoutDashboard],
  ["/admin/people", "Collaborateurs", Users],
  ["/admin/people/import", "Import CSV / XLSX", FileSpreadsheet],
  ["/admin/departments", "Départements", Building2],
  ["/admin/org-chart", "Organigramme", Network],
  ["/admin/projects", "Projets", Gauge],
  ["/admin/tasks", "Tâches", ClipboardCheck],
  ["/admin/calendars", "Calendriers", CalendarDays],
  ["/admin/channels", "Canaux", MessageCircle],
  ["/admin/documents", "Documents", FileText],
  ["/admin/howji", "HOWJI", Bot],
  ["/admin/security", "Sécurité", ShieldCheck],
] as const;

function adminSection(pathname: string) {
  if (pathname === "/admin" || pathname === "/admin/command-center") return "command-center";
  return pathname.replace(/^\/admin\/?/, "").split("/")[0] || "command-center";
}

function adminFetch(path: string, input: RequestInit = {}) {
  const token = localStorage.getItem("ece_session");
  const headers = new Headers(input.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (input.body && !(input.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(resolveApiUrl(path), { ...input, headers, credentials: "include", cache: "no-store" }).then(async (response) => {
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || "La demande a échoué.");
    return payload;
  });
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Non définie";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Non définie";
  return new Intl.DateTimeFormat("fr-BJ", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Status({ value }: { value: string }) {
  const normalized = String(value || "").toLowerCase();
  const tone = normalized.includes("active") || normalized.includes("completed") || normalized.includes("success")
    ? "bg-emerald-100 text-emerald-800"
    : normalized.includes("denied") || normalized.includes("blocked") || normalized.includes("ancien")
      ? "bg-red-100 text-red-800"
      : "bg-amber-100 text-amber-800";
  return <span className={`${tone} inline-flex px-2 py-1 text-[10px] font-bold uppercase`}>{String(value || "—").replaceAll("_", " ")}</span>;
}

function Metric({ label, value, tone = "dark" }: { label: string; value: number; tone?: "dark" | "gold" | "green" }) {
  const colors = tone === "gold" ? "bg-[#d8ad3d] text-[#17140c]" : tone === "green" ? "bg-[#18563b] text-white" : "bg-[#151816] text-white";
  return <div className={`${colors} min-h-28 p-4`}><p className="text-[10px] font-bold uppercase opacity-60">{label}</p><p className="mt-5 text-3xl font-semibold">{value}</p></div>;
}

function OverviewPanel({ data }: { data: AdminOverview }) {
  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-bold uppercase text-[#805f12]">Salle administrative AGOOJIYE</p>
        <h1 className="mt-2 text-3xl font-semibold">Vue de commandement</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">Organisation, opérations, risques et décisions nécessitant une intervention.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Collaborateurs actifs" value={data.metrics.activePeople || 0} tone="gold" />
        <Metric label="Projets actifs" value={data.metrics.activeProjects || 0} tone="green" />
        <Metric label="Tâches en retard" value={data.metrics.overdueTasks || 0} />
        <Metric label="Blocages" value={data.metrics.blockers || 0} />
      </div>
      <div className="grid gap-6 2xl:grid-cols-[1.25fr_0.75fr]">
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Travail nécessitant une attention</h2><a href="/admin/tasks" className="text-xs font-bold text-[#805f12]">Toutes les tâches</a></div>
          <div className="divide-y divide-black/10 border-y border-black/10 bg-white">
            {data.tasks.filter((task) => task.status !== "done").slice(0, 10).map((task) => (
              <div key={task.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div><p className="font-medium">{task.title}</p><p className="mt-1 text-xs text-black/45">{task.blocker || (task.dueDate ? `Échéance ${formatDate(task.dueDate)}` : "Sans échéance")}</p></div>
                <Status value={task.status} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Postes et onboarding</h2><a href="/admin/people" className="text-xs font-bold text-[#805f12]">Gérer</a></div>
          <div className="space-y-2">
            {data.vacancies.slice(0, 8).map((vacancy) => (
              <div key={vacancy.id} className="border-l-4 border-[#d8ad3d] bg-white p-4"><p className="font-medium">{vacancy.title}</p><p className="mt-1 text-xs text-black/45">{vacancy.candidateName || "À réattribuer"}</p><div className="mt-3"><Status value={vacancy.status} /></div></div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PeoplePanel({ data, refetch }: { data: AdminOverview; refetch: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [offboardId, setOffboardId] = useState<number | null>(null);
  const [offboardReason, setOffboardReason] = useState("");
  const invite = useMutation({
    mutationFn: () => apiRequest("/api/admin/agoojye/workos/people/olivier/invite", { method: "POST", body: JSON.stringify({ email }) }),
    onSuccess: () => { toast({ title: "Invitation d’Olivier créée" }); setEmail(""); refetch(); },
    onError: (error: any) => toast({ title: "Invitation impossible", description: error?.message, variant: "destructive" }),
  });
  const offboard = useMutation({
    mutationFn: () => apiRequest(`/api/admin/agoojye/workos/people/${offboardId}/offboard`, { method: "POST", body: JSON.stringify({ reason: offboardReason }) }),
    onSuccess: () => { toast({ title: "Départ enregistré" }); setOffboardId(null); setOffboardReason(""); refetch(); },
    onError: (error: any) => toast({ title: "Départ impossible", description: error?.message, variant: "destructive" }),
  });
  const olivierVacancy = data.vacancies.find((vacancy) => vacancy.candidateName === "Olivier");
  return (
    <div className="space-y-7">
      <div><p className="text-xs font-bold uppercase text-[#805f12]">Organisation</p><h1 className="mt-2 text-3xl font-semibold">Collaborateurs et accès</h1></div>
      {olivierVacancy && !olivierVacancy.candidateEmail ? (
        <form className="border-l-4 border-[#d8ad3d] bg-white p-5" onSubmit={(event) => { event.preventDefault(); invite.mutate(); }}>
          <div className="flex items-start gap-4"><UserPlus className="mt-1 h-6 w-6 text-[#805f12]" /><div><h2 className="font-semibold">Olivier · Gestion</h2><p className="mt-1 text-sm text-black/50">Renseignez son adresse exacte avant de créer l’invitation. Les accès juridiques, financiers, techniques et confidentiels restent bloqués.</p></div></div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="adresse.exacte@agoojiye.com" className="h-11 max-w-lg" /><Button type="submit" disabled={invite.isPending} className="h-11 bg-[#171a18]">Créer l’invitation</Button></div>
        </form>
      ) : null}
      <div className="overflow-x-auto border border-black/10 bg-white">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-[#ebe9e2] text-[11px] uppercase text-black/50"><tr><th className="px-4 py-3">Collaborateur</th><th className="px-4 py-3">Rôle</th><th className="px-4 py-3">Département</th><th className="px-4 py-3">Accès</th><th className="px-4 py-3">Onboarding</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3"></th></tr></thead>
          <tbody className="divide-y divide-black/10">
            {data.people.map((person) => {
              const team = data.teams.find((entry) => entry.id === person.teamId);
              return <tr key={person.id}><td className="px-4 py-4"><strong>{person.displayName}</strong><span className="mt-1 block text-xs text-black/45">{person.email}</span></td><td className="px-4 py-4">{person.role}</td><td className="px-4 py-4">{team?.name || "À définir"}</td><td className="px-4 py-4">Niveau {person.accessLevel}</td><td className="px-4 py-4">{person.onboardingProgress}%</td><td className="px-4 py-4"><Status value={person.status} /></td><td className="px-4 py-4">{data.currentUser.superAdmin && person.status === "Active" && person.email !== data.currentUser.email ? <button type="button" onClick={() => setOffboardId(person.id)} className="text-xs font-semibold text-red-700">Retirer</button> : null}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
      {offboardId ? (
        <form className="border border-red-200 bg-red-50 p-5" onSubmit={(event) => { event.preventDefault(); offboard.mutate(); }}>
          <h2 className="font-semibold text-red-900">Confirmer le départ</h2>
          <p className="mt-1 text-sm text-red-800/70">Les sessions et rôles seront révoqués. L’historique sera conservé et les tâches passeront à « À réattribuer ».</p>
          <Textarea className="mt-4 bg-white" value={offboardReason} onChange={(event) => setOffboardReason(event.target.value)} required minLength={10} placeholder="Motif opérationnel du retrait" />
          <div className="mt-3 flex gap-2"><Button type="submit" disabled={offboard.isPending} className="bg-red-700 hover:bg-red-800">Confirmer</Button><Button type="button" variant="outline" onClick={() => setOffboardId(null)}>Annuler</Button></div>
        </form>
      ) : null}
    </div>
  );
}

function ImportPanel({ refetch }: { refetch: () => void }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Sélectionnez un fichier.");
      const body = new FormData();
      body.set("file", file);
      return adminFetch("/api/admin/agoojye/workos/people/import/preview", { method: "POST", body });
    },
    onSuccess: (payload) => { setPreview(payload); setResult(null); },
    onError: (error: any) => toast({ title: "Prévisualisation impossible", description: error?.message, variant: "destructive" }),
  });
  const commitMutation = useMutation({
    mutationFn: () => apiRequest(`/api/admin/agoojye/workos/people/import/${preview.importId}/commit`, { method: "POST", body: "{}" }),
    onSuccess: (payload) => { setResult(payload); refetch(); toast({ title: "Import terminé" }); },
    onError: (error: any) => toast({ title: "Import impossible", description: error?.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-7">
      <div><p className="text-xs font-bold uppercase text-[#805f12]">Onboarding en volume</p><h1 className="mt-2 text-3xl font-semibold">Importer des collaborateurs</h1><p className="mt-2 text-sm text-black/50">CSV et XLSX · validation · doublons · prévisualisation · confirmation.</p></div>
      <section className="border border-dashed border-black/25 bg-white p-6">
        <Label htmlFor="worker-import">Fichier source</Label>
        <Input id="worker-import" type="file" accept=".csv,.xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-2 h-12 max-w-2xl" />
        <Button type="button" onClick={() => previewMutation.mutate()} disabled={!file || previewMutation.isPending} className="mt-4 bg-[#171a18]"><Upload className="mr-2 h-4 w-4" /> Prévisualiser</Button>
      </section>
      {preview ? (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{preview.sourceName}</h2><p className="mt-1 text-xs text-black/45">{preview.summary.valid} valide(s) · {preview.summary.invalid} invalide(s) · {preview.summary.duplicates} doublon(s)</p></div><Button type="button" onClick={() => commitMutation.mutate()} disabled={!preview.summary.valid || commitMutation.isPending || Boolean(result)} className="bg-[#18563b]"><ShieldCheck className="mr-2 h-4 w-4" /> Confirmer l’import</Button></div>
          <div className="max-h-[520px] overflow-auto border border-black/10 bg-white">
            <table className="w-full min-w-[900px] text-left text-xs"><thead className="sticky top-0 bg-[#ebe9e2]"><tr><th className="px-3 py-3">Ligne</th><th className="px-3 py-3">Nom</th><th className="px-3 py-3">Email</th><th className="px-3 py-3">Département</th><th className="px-3 py-3">Rôle</th><th className="px-3 py-3">Validation</th></tr></thead><tbody className="divide-y divide-black/10">{preview.rows.map((row: any) => <tr key={row.rowNumber}><td className="px-3 py-3">{row.rowNumber}</td><td className="px-3 py-3">{row.firstName} {row.lastName}</td><td className="px-3 py-3">{row.email}</td><td className="px-3 py-3">{row.department}</td><td className="px-3 py-3">{row.role}</td><td className="px-3 py-3">{row.errors.length ? <span className="text-red-700">{row.errors.join(" · ")}</span> : <span className="text-emerald-700">Prêt</span>}</td></tr>)}</tbody></table>
          </div>
        </section>
      ) : null}
      {result ? <div className="border-l-4 border-emerald-600 bg-emerald-50 p-5"><h2 className="font-semibold text-emerald-900">Import confirmé</h2><p className="mt-1 text-sm text-emerald-900/70">{result.results.filter((item: any) => item.status === "created").length} compte(s) préparé(s). Les liens d’activation sont disponibles dans l’export sécurisé.</p><a href={result.resultsDownload} className="mt-4 inline-flex min-h-10 items-center font-semibold text-emerald-800">Télécharger les résultats <ChevronRight className="ml-1 h-4 w-4" /></a></div> : null}
    </div>
  );
}

function HowjiPanel({ data, refetch }: { data: AdminOverview; refetch: () => void }) {
  const { toast } = useToast();
  const howji = data.agents.find((agent) => agent.key === "howji");
  const howjiQuery = useQuery<any>({ queryKey: ["/api/admin/agoojye/workos/howji"], queryFn: () => adminFetch("/api/admin/agoojye/workos/howji"), enabled: Boolean(howji), retry: false });
  const run = useMutation({
    mutationFn: () => apiRequest("/api/admin/agoojye/workos/howji/run", { method: "POST", body: "{}" }),
    onSuccess: () => { howjiQuery.refetch(); refetch(); toast({ title: "Synthèse HOWJI actualisée" }); },
    onError: (error: any) => toast({ title: "HOWJI indisponible", description: error?.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase text-[#805f12]">Coordination assistée</p><h1 className="mt-2 text-3xl font-semibold">HOWJI</h1><p className="mt-2 text-sm text-black/50">Agent IA de coordination et de relance · Africa/Porto-Novo.</p></div><Button type="button" onClick={() => run.mutate()} disabled={run.isPending} className="h-11 bg-[#171a18]"><RefreshCcw className="mr-2 h-4 w-4" /> Générer la synthèse</Button></div>
      {howji ? <section className="grid gap-px bg-black/10 md:grid-cols-3"><div className="bg-white p-5"><p className="text-xs text-black/45">Statut</p><div className="mt-3"><Status value={howji.status} /></div></div><div className="bg-white p-5"><p className="text-xs text-black/45">Fuseau</p><p className="mt-3 font-semibold">{howji.timezone}</p></div><div className="bg-white p-5"><p className="text-xs text-black/45">Actions sensibles</p><p className="mt-3 font-semibold">Approbation obligatoire</p></div></section> : null}
      <section><h2 className="mb-3 text-lg font-semibold">Journal des synthèses et actions</h2><div className="space-y-3">{howjiQuery.data?.actions?.map((action: any) => <article key={action.id} className="border border-black/10 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{action.actionType.replaceAll("_", " ")}</p><Status value={action.status} /></div><p className="mt-2 text-sm leading-6 text-black/55">{action.output?.summary || (action.requiresApproval ? "Exécution bloquée jusqu’à approbation." : "Action interne enregistrée.")}</p><p className="mt-3 text-xs text-black/40">{formatDate(action.createdAt)}</p></article>)}</div></section>
    </div>
  );
}

function SecurityPanel({ data }: { data: AdminOverview }) {
  const security = useQuery<any>({ queryKey: ["/api/admin/agoojye/workos/security/events"], queryFn: () => adminFetch("/api/admin/agoojye/workos/security/events"), retry: false });
  return (
    <div className="space-y-7">
      <div><p className="text-xs font-bold uppercase text-[#805f12]">Traçabilité</p><h1 className="mt-2 text-3xl font-semibold">Sécurité et audit</h1><p className="mt-2 text-sm text-black/50">MFA, sessions, accès refusés et actions administratives sensibles.</p></div>
      <div className="grid gap-2 sm:grid-cols-3"><Metric label="Événements sur 7 jours" value={data.metrics.securityEvents7d || 0} /><Metric label="Postes ouverts" value={data.metrics.vacancies || 0} tone="gold" /><Metric label="Administrateur principal" value={data.currentUser.superAdmin ? 1 : 0} tone="green" /></div>
      <div className="overflow-x-auto border border-black/10 bg-white"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-[#ebe9e2] uppercase text-black/50"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Événement</th><th className="px-4 py-3">Résultat</th><th className="px-4 py-3">Motif</th><th className="px-4 py-3">IP</th></tr></thead><tbody className="divide-y divide-black/10">{security.data?.items?.map((event: any) => <tr key={event.id}><td className="px-4 py-4">{formatDate(event.createdAt)}</td><td className="px-4 py-4 font-medium">{event.eventType.replaceAll("_", " ")}</td><td className="px-4 py-4"><Status value={event.result} /></td><td className="px-4 py-4">{event.reason || "—"}</td><td className="px-4 py-4">{event.ipAddress || "—"}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function GenericPanel({ section, data }: { section: string; data: AdminOverview }) {
  const labels: Record<string, string> = {
    departments: "Départements",
    "org-chart": "Organigramme",
    projects: "Projets",
    tasks: "Tâches",
    calendars: "Calendriers",
    channels: "Canaux",
    documents: "Documents",
    crm: "CRM",
    meetings: "Réunions",
    decisions: "Décisions",
    agents: "Agents IA",
    notifications: "Notifications",
    settings: "Paramètres",
    roles: "Rôles et permissions",
    audit: "Journal d’audit",
  };
  const title = labels[section] || section.replaceAll("-", " ");
  const source = section === "projects" ? data.projects : section === "tasks" ? data.tasks : section === "departments" || section === "org-chart" ? data.teams : [];
  return (
    <div className="space-y-7">
      <div><p className="text-xs font-bold uppercase text-[#805f12]">Administration AGOOJIYE</p><h1 className="mt-2 text-3xl font-semibold">{title}</h1><p className="mt-2 text-sm text-black/50">Vue tenant-isolée selon vos autorisations administratives.</p></div>
      {source.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{source.map((item: any) => <article key={item.id} className="border border-black/10 bg-white p-5"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{item.name || item.title}</h2><Status value={item.status || "active"} /></div><p className="mt-2 text-sm leading-6 text-black/50">{item.objective || item.mission || item.description || "Informations opérationnelles AGOOJIYE."}</p></article>)}</div> : <div className="border border-dashed border-black/20 bg-white px-5 py-12 text-center"><p className="font-semibold">Module prêt</p><p className="mt-2 text-sm text-black/45">Les éléments autorisés apparaîtront ici.</p></div>}
    </div>
  );
}

export default function AgoojiyeWorkosAdminPage() {
  const { isAuthenticated, isGuest, logout } = useSession();
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  const section = useMemo(() => adminSection(location), [location]);
  useEffect(() => {
    document.title = "Salle administrative | AGOOJIYE WorkOS";
  }, []);
  const overview = useQuery<AdminOverview>({
    queryKey: ["/api/admin/agoojye/workos/overview"],
    queryFn: () => adminFetch("/api/admin/agoojye/workos/overview"),
    enabled: isAuthenticated && !isGuest,
    retry: false,
    refetchInterval: 30_000,
  });
  if (!isAuthenticated || isGuest) return <Redirect to="/workspace/connexion" />;
  if (overview.isLoading) return <div className="grid min-h-screen place-items-center bg-[#101311] text-white"><div className="text-center"><img src="/tenants/agoojye/app-icon-128.png" alt="" className="mx-auto h-20 w-20 animate-pulse" /><p className="mt-4 text-sm text-white/55">Ouverture de la salle administrative…</p></div></div>;
  if (overview.isError || !overview.data) return <div className="grid min-h-screen place-items-center bg-[#101311] p-5 text-white"><div className="max-w-lg border border-red-400/30 p-7"><ShieldCheck className="text-red-300" /><h1 className="mt-4 text-2xl font-semibold">Accès administratif refusé</h1><p className="mt-3 text-sm leading-6 text-white/60">Une session AGOOJIYE vérifiée par MFA et un rôle administratif sont requis.</p><Button onClick={logout} className="mt-5">Revenir à la connexion</Button></div></div>;
  const data = overview.data;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/agoojye/workos/overview"] });
    overview.refetch();
  };
  let content = <GenericPanel section={section} data={data} />;
  if (section === "command-center") content = <OverviewPanel data={data} />;
  else if (location.startsWith("/admin/people/import")) content = <ImportPanel refetch={refresh} />;
  else if (section === "people") content = <PeoplePanel data={data} refetch={refresh} />;
  else if (section === "howji") content = <HowjiPanel data={data} refetch={refresh} />;
  else if (section === "security" || section === "audit") content = <SecurityPanel data={data} />;
  return (
    <div className="min-h-screen bg-[#f4f2ec] text-[#151816]">
      <aside className={`fixed inset-y-0 left-0 z-50 w-[280px] overflow-y-auto bg-[#101311] px-4 py-5 text-white transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between"><a href="/admin/command-center" className="flex items-center gap-3"><img src="/tenants/agoojye/app-icon-128.png" alt="" className="h-10 w-10" /><span><img src="/brand/agoojiye/logo/AGOOJIYE_wordmark_gold_transparent.png" alt="AGOOJIYE" className="h-5 w-auto" /><span className="mt-1 block text-[9px] font-bold uppercase text-white/40">Salle administrative</span></span></a><button type="button" onClick={() => setMenuOpen(false)} className="grid h-10 w-10 place-items-center lg:hidden" aria-label="Fermer"><X className="h-5 w-5" /></button></div>
        <div className="mt-6 border-y border-white/10 py-4"><p className="truncate text-sm font-semibold">{data.currentUser.displayName}</p><p className="mt-1 truncate text-xs text-white/40">{data.currentUser.superAdmin ? "Super-administrateur" : "Administrateur AGOOJIYE"}</p></div>
        <nav className="mt-5 grid gap-1" aria-label="Administration AGOOJIYE">{ADMIN_NAV.map(([href, label, Icon]) => <a key={href} href={href} onClick={() => setMenuOpen(false)} className={`flex min-h-10 items-center gap-3 px-3 text-xs font-medium ${location === href || (href !== "/admin/command-center" && location.startsWith(href)) ? "bg-[#d8ad3d] text-[#17140c]" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}><Icon className="h-4 w-4" />{label}</a>)}</nav>
        <div className="mt-7 border-t border-white/10 pt-4"><a href="/workspace" className="flex min-h-10 items-center gap-3 px-3 text-xs text-white/50 hover:text-white"><ChevronRight className="h-4 w-4 rotate-180" /> Espace de travail</a><button type="button" onClick={logout} className="flex min-h-10 w-full items-center gap-3 px-3 text-xs text-white/50 hover:text-white"><LogOut className="h-4 w-4" /> Déconnexion</button></div>
      </aside>
      <div className="lg:pl-[280px]">
        <header className="sticky top-0 z-40 flex h-16 items-center border-b border-black/10 bg-[#f4f2ec]/95 px-4 backdrop-blur sm:px-6"><button type="button" onClick={() => setMenuOpen(true)} className="grid h-11 w-11 place-items-center border border-black/10 lg:hidden" aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button><p className="ml-3 text-sm font-semibold lg:ml-0">Administration AGOOJIYE</p><div className="ml-auto flex items-center gap-2"><button type="button" onClick={refresh} className="grid h-10 w-10 place-items-center border border-black/10" title="Actualiser"><RefreshCcw className="h-4 w-4" /></button><span className="hidden h-10 items-center bg-[#171a18] px-3 text-xs font-semibold text-[#d8ad3d] sm:inline-flex">{data.currentUser.superAdmin ? "SUPER ADMIN" : "ADMIN"}</span></div></header>
        <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:py-9">{content}</main>
      </div>
    </div>
  );
}
