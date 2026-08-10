import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Factory,
  MapPin,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Target,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/use-company";

type AgentsSummary = {
  summary?: {
    totalAgents?: number;
    activeAgents?: number;
    draftAgents?: number;
  };
};

type TaskItem = {
  id: number;
  title: string;
  status?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  agent?: { name?: string | null } | null;
};

type GoalItem = {
  id: number;
  title: string;
  status?: string | null;
  priority?: string | null;
  progress?: number | null;
  taskStats?: { total?: number; completed?: number; blocked?: number };
};

type QueueResponse = { ok?: boolean; items?: Array<Record<string, unknown>> };
type MeetingItem = { id: number; title?: string | null; status?: string | null; scheduledStart?: string | null; startTime?: string | null };
type MeetingsResponse = MeetingItem[] | { meetings?: MeetingItem[]; items?: MeetingItem[] };

type PlacesConfig = {
  provider?: "google" | "leaflet";
  placesImportEnabled?: boolean;
  businessDataProvider?: "google_places" | "curated_city_data";
  google?: {
    browserMapKeyPresent?: boolean;
    placesApiKeyPresent?: boolean;
    mapIdPresent?: boolean;
  };
};

type TwilioStatus = {
  twilio?: {
    accountSidPresent?: boolean;
    authTokenPresent?: boolean;
    whatsappFromPresent?: boolean;
    smsFromPresent?: boolean;
  };
};

type AiStatus = {
  config?: { aiEnabled?: boolean; actionsWorkerEnabled?: boolean };
  processes?: { actionsRunner?: { healthy?: boolean; running?: boolean; lastError?: string | null } };
};

type PriorityItem = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  owner: string;
  href: string;
  action: string;
};

const closedTaskStates = new Set(["done", "completed", "cancelled", "canceled", "closed"]);

function statusText(value?: string | null) {
  return String(value || "pending").replaceAll("_", " ");
}

function Stat({ label, value, note, icon: Icon }: { label: string; value: number; note: string; icon: typeof Bot }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{note}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SystemState({ ok, title, detail, href }: { ok: boolean; title: string; detail: string; href: string }) {
  return (
    <Link href={href}>
      <a className="flex min-h-20 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-amber-300 hover:bg-amber-50/40">
        {ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-950">{title}</div>
          <div className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
      </a>
    </Link>
  );
}

export default function ExportunityAdminDashboardPage() {
  const { selectedCompanyId } = useCompany();

  const agentsQuery = useQuery<AgentsSummary>({ queryKey: ["/api/admin/agents-os/summary"], staleTime: 30_000 });
  const tasksQuery = useQuery<TaskItem[]>({
    queryKey: [`/api/task-lifecycle/company/${selectedCompanyId}`],
    enabled: Boolean(selectedCompanyId),
    staleTime: 15_000,
  });
  const goalsQuery = useQuery<GoalItem[]>({
    queryKey: [`/api/goals/company/${selectedCompanyId}`],
    enabled: Boolean(selectedCompanyId),
    staleTime: 15_000,
  });
  const actionsQuery = useQuery<QueueResponse>({ queryKey: ["/api/actions/queue?limit=200"], staleTime: 10_000 });
  const decisionsQuery = useQuery<QueueResponse>({ queryKey: ["/api/actions/decisions?limit=200"], staleTime: 10_000 });
  const meetingsQuery = useQuery<MeetingsResponse>({ queryKey: ["/api/meetings"], staleTime: 15_000 });
  const placesQuery = useQuery<PlacesConfig>({ queryKey: ["/api/places/config"], staleTime: 30_000 });
  const twilioQuery = useQuery<TwilioStatus>({ queryKey: ["/api/admin/twilio/status"], staleTime: 30_000 });
  const aiQuery = useQuery<AiStatus>({ queryKey: ["/api/ai/status"], staleTime: 15_000 });

  const tasks = Array.isArray(tasksQuery.data) ? tasksQuery.data : [];
  const goals = Array.isArray(goalsQuery.data) ? goalsQuery.data : [];
  const openTasks = tasks.filter((task) => !closedTaskStates.has(String(task.status || "").toLowerCase()));
  const blockedTasks = openTasks.filter((task) => String(task.status || "").toLowerCase() === "blocked");
  const actionItems = Array.isArray(actionsQuery.data?.items) ? actionsQuery.data.items : [];
  const decisionItems = Array.isArray(decisionsQuery.data?.items) ? decisionsQuery.data.items : [];
  const meetingData = meetingsQuery.data;
  const meetings = Array.isArray(meetingData) ? meetingData : meetingData?.meetings || meetingData?.items || [];
  const activeAgents = Number(agentsQuery.data?.summary?.activeAgents || 0);
  const totalAgents = Number(agentsQuery.data?.summary?.totalAgents || 0);

  const mapsReady = Boolean(placesQuery.data?.google?.browserMapKeyPresent || placesQuery.data?.provider === "leaflet");
  const placesReady = Boolean(placesQuery.data?.google?.placesApiKeyPresent && placesQuery.data?.placesImportEnabled);
  const twilioReady = Boolean(twilioQuery.data?.twilio?.accountSidPresent && twilioQuery.data?.twilio?.authTokenPresent);
  const whatsappReady = Boolean(twilioReady && twilioQuery.data?.twilio?.whatsappFromPresent);
  const actionsReady = Boolean(aiQuery.data?.config?.actionsWorkerEnabled && aiQuery.data?.processes?.actionsRunner?.healthy);

  const priorities = useMemo<PriorityItem[]>(() => {
    const items: PriorityItem[] = [];
    if (blockedTasks.length > 0) {
      items.push({
        id: "blocked-tasks",
        severity: "high",
        title: `${blockedTasks.length} blocked task${blockedTasks.length === 1 ? "" : "s"}`,
        description: "Execution is waiting for a decision, input, integration, or human approval.",
        owner: "Operations",
        href: "/tasks",
        action: "Review tasks",
      });
    }
    if (decisionItems.length > 0) {
      items.push({
        id: "decisions",
        severity: "high",
        title: `${decisionItems.length} decision${decisionItems.length === 1 ? "" : "s"} awaiting review`,
        description: "Agents have prepared work that still requires a responsible human decision.",
        owner: "Chairman / Owner",
        href: "/actions",
        action: "Review decisions",
      });
    }
    if (!placesReady) {
      items.push({
        id: "places",
        severity: "medium",
        title: "Google Places discovery is not live",
        description: "The industrial map can render, but supplier and factory discovery is using curated records until the server Places key is enabled.",
        owner: "Platform Operations",
        href: "/admin/settings/integrations/google-maps",
        action: "Open Google setup",
      });
    }
    if (!whatsappReady) {
      items.push({
        id: "whatsapp",
        severity: "medium",
        title: "WhatsApp outreach needs configuration",
        description: "Approved supplier and client outreach cannot run until the Twilio account and WhatsApp sender are ready.",
        owner: "Communications",
        href: "/admin/settings/communications/twilio",
        action: "Open Twilio setup",
      });
    }
    if (!actionsReady) {
      items.push({
        id: "actions-runner",
        severity: "high",
        title: "Agent action runner needs attention",
        description: aiQuery.data?.processes?.actionsRunner?.lastError || "Agents can converse, but executable actions are not reporting a healthy runtime.",
        owner: "AI Operations",
        href: "/actions",
        action: "Inspect actions",
      });
    }
    if (activeAgents === 0) {
      items.push({
        id: "agents",
        severity: "high",
        title: "No active operating agents",
        description: "Activate the Exportunity team before assigning industrial sourcing, engineering, export, or commercial work.",
        owner: "Agent Governance",
        href: "/operations/agents",
        action: "Manage agents",
      });
    }
    return items;
  }, [activeAgents, actionsReady, aiQuery.data?.processes?.actionsRunner?.lastError, blockedTasks.length, decisionItems.length, placesReady, whatsappReady]);

  const sortedTasks = [...openTasks]
    .sort((a, b) => {
      const priorityWeight: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const byPriority = (priorityWeight[String(a.priority || "medium")] ?? 2) - (priorityWeight[String(b.priority || "medium")] ?? 2);
      if (byPriority !== 0) return byPriority;
      return String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"));
    })
    .slice(0, 6);

  const refresh = () => {
    void Promise.all([
      agentsQuery.refetch(),
      tasksQuery.refetch(),
      goalsQuery.refetch(),
      actionsQuery.refetch(),
      decisionsQuery.refetch(),
      meetingsQuery.refetch(),
      placesQuery.refetch(),
      twilioQuery.refetch(),
      aiQuery.refetch(),
    ]);
  };

  return (
    <div className="min-h-full bg-[#F7F8FA] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-[#D78C00]">Exportunity Industrial OS</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Operations priority center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Manage industrial demand, supplier execution, agent work, decisions, and integrations from one live operating view.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={refresh} className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Link href="/ai-team">
              <Button className="bg-[#F5A623] font-black text-slate-950 hover:bg-[#F9A800]">
                <MessageSquare className="mr-2 h-4 w-4" /> Open Operations Center
              </Button>
            </Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Active agents" value={activeAgents} note={`${totalAgents} configured`} icon={Bot} />
          <Stat label="Open tasks" value={openTasks.length} note={`${blockedTasks.length} blocked`} icon={Wrench} />
          <Stat label="Objectives" value={goals.filter((goal) => !closedTaskStates.has(String(goal.status || "").toLowerCase())).length} note={`${goals.length} total`} icon={Target} />
          <Stat label="Decisions" value={decisionItems.length} note="Awaiting review" icon={ShieldCheck} />
          <Stat label="Meetings" value={meetings.length} note="Recorded in the workspace" icon={Clock} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">What needs attention now</h2>
              <p className="mt-1 text-sm text-slate-500">Live blockers and setup gaps, ordered before routine work.</p>
            </div>
            <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold ${priorities.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
              {priorities.length ? `${priorities.length} item${priorities.length === 1 ? "" : "s"}` : "No urgent blockers"}
            </span>
          </div>
          <div className="divide-y divide-slate-200">
            {priorities.length ? priorities.map((item) => (
              <div key={item.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[auto_1fr_auto] lg:items-center">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.severity === "high" ? "bg-red-50 text-red-700" : item.severity === "medium" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-950">{item.title}</h3>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{item.owner}</span>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p>
                </div>
                <Link href={item.href}>
                  <Button variant="outline" className="w-full border-slate-300 bg-white text-slate-800 hover:border-amber-400 hover:bg-amber-50 lg:w-auto">
                    {item.action}<ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )) : (
              <div className="flex items-center gap-3 px-5 py-6 text-sm text-slate-600">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Core operations report no urgent blocker.
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">Execution queue</h2>
                <p className="mt-1 text-xs text-slate-500">Highest-priority work from the real task system.</p>
              </div>
              <Link href="/tasks"><Button variant="ghost" className="text-slate-700">All tasks<ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
            </div>
            <div className="divide-y divide-slate-200">
              {sortedTasks.length ? sortedTasks.map((task) => (
                <Link key={task.id} href="/tasks">
                  <a className="grid gap-2 px-5 py-4 transition-colors hover:bg-slate-50 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <div className="font-bold text-slate-950">{task.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{task.agent?.name || "Unassigned"}{task.dueDate ? ` · due ${new Date(task.dueDate).toLocaleDateString()}` : ""}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold capitalize text-slate-700">{statusText(task.status)}</span>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold capitalize text-amber-900">{statusText(task.priority)}</span>
                    </div>
                  </a>
                </Link>
              )) : (
                <div className="px-5 py-8 text-sm text-slate-500">No open task is currently assigned. Create work from the Operations Center or Tasks.</div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Operating systems</h2>
                <p className="mt-1 text-xs text-slate-500">Configuration and runtime readiness.</p>
              </div>
              <Activity className="h-5 w-5 text-[#D78C00]" />
            </div>
            <div className="mt-4 space-y-3">
              <SystemState ok={mapsReady} title="Industrial map" detail={mapsReady ? `Renderer ready (${placesQuery.data?.provider || "configured"})` : "Map renderer needs configuration"} href="/admin/settings/integrations/google-maps" />
              <SystemState ok={placesReady} title="Factory and supplier discovery" detail={placesReady ? "Official Google Places import enabled" : "Curated data active; Google Places import not enabled"} href="/admin/settings/integrations/google-maps" />
              <SystemState ok={whatsappReady} title="Approved WhatsApp outreach" detail={whatsappReady ? "Twilio account and sender ready" : "Sender configuration or credentials required"} href="/admin/settings/communications/twilio" />
              <SystemState ok={actionsReady} title="Agent action runner" detail={actionsReady ? `${actionItems.length} action records available` : "Runtime is not reporting healthy execution"} href="/actions" />
              <SystemState ok={activeAgents > 0} title="Industrial agent team" detail={`${activeAgents} active of ${totalAgents} configured`} href="/operations/agents" />
            </div>
          </section>
        </div>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { href: "/factories", label: "Industrial network", detail: "Factories, zones, products, and suppliers", icon: Factory },
            { href: "/agenda", label: "Agenda", detail: "Meetings tied to objectives and agents", icon: Clock },
            { href: "/goals", label: "Objectives", detail: "Company priorities and measurable progress", icon: Target },
            { href: "/admin/settings/integrations/google-maps", label: "Territory data", detail: "Map and official business discovery status", icon: MapPin },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <a className="flex min-h-24 items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50/40">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-[#F5A623]"><item.icon className="h-5 w-5" /></div>
                <div><div className="font-bold text-slate-950">{item.label}</div><div className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</div></div>
              </a>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
