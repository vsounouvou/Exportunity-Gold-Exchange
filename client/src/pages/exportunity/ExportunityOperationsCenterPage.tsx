import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  ListChecks,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type AgentListItem = {
  id: number;
  name: string;
  role: string;
  department_key?: string | null;
  department_name?: string | null;
  statusV2?: "ACTIVE" | "PAUSED" | "ARCHIVED";
};

type AgentListResponse = {
  ok?: boolean;
  items?: AgentListItem[];
};

type ActionItem = {
  id: number;
  publicActionId?: string | null;
  actionType?: string | null;
  status?: string | null;
  state?: string | null;
  requestedByAgentKey?: string | null;
  createdAt?: string | null;
};

type ActionListResponse = {
  ok?: boolean;
  items?: ActionItem[];
};

type OperationsRoom = {
  id: string | number;
  name?: string | null;
  type?: string | null;
  conversationId?: string | null;
  status?: string | null;
  isActive?: boolean | null;
  agents?: Array<{ id?: number; name?: string | null; role?: string | null }>;
};

type WorkspaceCard = {
  href: string;
  title: string;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
};

function normalizeState(value: unknown) {
  return String(value || "PENDING").trim().toUpperCase();
}

function readableActionType(value: unknown) {
  return String(value || "Operational action")
    .trim()
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stateClasses(state: string) {
  if (["SUCCEEDED", "DONE", "APPROVED"].includes(state)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (["FAILED", "DENIED", "REJECTED"].includes(state)) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (["REQUIRES_APPROVAL", "PENDING", "CREATED", "QUEUED"].includes(state)) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: number;
  note: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-[#07111F]">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-200 bg-[#FFF8E8] text-[#A56600]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function WorkspaceLink({ item }: { item: WorkspaceCard }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="group flex min-h-44 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#F5A623] hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#07111F] text-white">
            <Icon className="h-5 w-5" />
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#A56600]" />
        </div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#8A5700]">{item.eyebrow}</p>
        <h3 className="mt-1 text-base font-black text-[#07111F]">{item.title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
    </Link>
  );
}

function CompactSystemLink({
  href,
  label,
  detail,
  icon: Icon,
}: {
  href: string;
  label: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 last:border-b-0 hover:bg-amber-50/50"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 group-hover:border-amber-200 group-hover:bg-white group-hover:text-[#9A6200]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-950">{label}</p>
        <p className="truncate text-xs text-slate-500">{detail}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-[#9A6200]" />
    </Link>
  );
}

export default function ExportunityOperationsCenterPage() {
  const { language } = useLocale();
  const isFr = language !== "en";
  const tr = (fr: string, en: string) => (isFr ? fr : en);

  const agentsQuery = useQuery<AgentListResponse>({
    queryKey: ["/api/v2/agents?domain=INTERNAL"],
    queryFn: () => apiRequest("/api/v2/agents?domain=INTERNAL", "GET"),
    staleTime: 15_000,
  });
  const roomsQuery = useQuery<OperationsRoom[]>({
    queryKey: ["/api/chatrooms"],
    queryFn: () => apiRequest("/api/chatrooms", "GET"),
    staleTime: 15_000,
  });
  const actionsQuery = useQuery<ActionListResponse>({
    queryKey: ["/api/actions/queue?limit=12"],
    queryFn: () => apiRequest("/api/actions/queue?limit=12", "GET"),
    staleTime: 10_000,
  });
  const decisionsQuery = useQuery<ActionListResponse>({
    queryKey: ["/api/actions/decisions?limit=12"],
    queryFn: () => apiRequest("/api/actions/decisions?limit=12", "GET"),
    staleTime: 10_000,
  });

  const agents = Array.isArray(agentsQuery.data?.items) ? agentsQuery.data.items : [];
  const rooms = Array.isArray(roomsQuery.data) ? roomsQuery.data : [];
  const actions = Array.isArray(actionsQuery.data?.items) ? actionsQuery.data.items : [];
  const decisions = Array.isArray(decisionsQuery.data?.items) ? decisionsQuery.data.items : [];
  const activeAgents = agents.filter((agent) => agent.statusV2 === "ACTIVE");
  const openRooms = rooms.filter((room) => {
    const state = normalizeState(room.status || (room.isActive === false ? "CLOSED" : "ACTIVE"));
    return room.isActive !== false && !["CLOSED", "ENDED", "ARCHIVED", "COMPLETED"].includes(state);
  });

  const requestedConversationId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("conversation")?.trim() || "";
  }, []);
  const requestedRoom = requestedConversationId
    ? rooms.find((room) => String(room.conversationId || "") === requestedConversationId)
    : undefined;

  const workspaceCards: WorkspaceCard[] = [
    {
      href: "/pro/operations/general-operations",
      eyebrow: tr("Conversation d'équipe", "Team conversation"),
      title: tr("Opérations générales", "General operations"),
      description: tr(
        "Poursuivez le travail avec Awa et les spécialistes dans l'espace de conversation actuel.",
        "Continue work with Awa and the specialist team in the current conversation workspace.",
      ),
      icon: MessageSquareText,
    },
    {
      href: "/meetings",
      eyebrow: tr("Coordination", "Coordination"),
      title: tr("Réunions", "Meetings"),
      description: tr(
        "Planifiez, rejoignez et consultez les réunions opérationnelles enregistrées.",
        "Schedule, join, and review recorded operational meetings.",
      ),
      icon: CalendarDays,
    },
    {
      href: "/agenda",
      eyebrow: tr("Plan d'exécution", "Execution plan"),
      title: tr("Agenda et objectifs", "Agenda & objectives"),
      description: tr(
        "Reliez chaque réunion à un objectif, une équipe et un suivi vérifiable.",
        "Connect each meeting to an objective, accountable team, and traceable follow-up.",
      ),
      icon: Target,
    },
    {
      href: "/actions",
      eyebrow: tr("Approbations", "Approvals"),
      title: tr("Registre des actions", "Action ledger"),
      description: tr(
        "Examinez les décisions et les preuves avant toute exécution à impact.",
        "Review decisions and evidence before any consequential execution.",
      ),
      icon: ClipboardCheck,
    },
  ];

  const hasReadError = [agentsQuery, roomsQuery, actionsQuery, decisionsQuery].some((query) => query.isError);
  const isRefreshing = [agentsQuery, roomsQuery, actionsQuery, decisionsQuery].some((query) => query.isFetching);
  const refresh = () => {
    void Promise.all([
      agentsQuery.refetch(),
      roomsQuery.refetch(),
      actionsQuery.refetch(),
      decisionsQuery.refetch(),
    ]);
  };

  return (
    <div data-testid="exportunity-operations-center" className="min-h-full bg-[#F7F8FA] p-4 text-[#07111F] md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
          <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-7">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-[#F5A623]/35 bg-[#FFF8E8] text-[10px] font-black uppercase tracking-[0.16em] text-[#8A5700] hover:bg-[#FFF8E8]">
                  Exportunity · Global Trade Network
                </Badge>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-800">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" /> {tr("Accès gouverné", "Governed access")}
                </Badge>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                {tr("Centre des opérations", "Operations Center")}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                {tr(
                  "Pilotez les dossiers qualifiés par Awa, le sourcing GDIZ, l'équipe interne, les réunions et les décisions depuis une seule interface Exportunity.",
                  "Run Awa-qualified cases, GDIZ sourcing, the internal team, meetings, and decisions from one Exportunity interface.",
                )}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={refresh}
              disabled={isRefreshing}
              className="border-slate-200 bg-white font-bold text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
              {tr("Actualiser", "Refresh")}
            </Button>
          </div>
          <div className="grid border-t border-slate-200 bg-[#07111F] text-white sm:grid-cols-3">
            <div className="border-b border-white/10 px-5 py-3 sm:border-b-0 sm:border-r">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F8C45B]">Awa</p>
              <p className="mt-1 text-xs text-slate-300">{tr("Qualification commerciale", "Commercial qualification")}</p>
            </div>
            <div className="border-b border-white/10 px-5 py-3 sm:border-b-0 sm:border-r">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F8C45B]">GDIZ</p>
              <p className="mt-1 text-xs text-slate-300">{tr("Réseau industriel documenté", "Documented industrial network")}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F8C45B]">Control</p>
              <p className="mt-1 text-xs text-slate-300">{tr("Approbations et preuves", "Approvals and evidence")}</p>
            </div>
          </div>
        </header>

        {hasReadError ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {tr(
                "Certaines données en direct sont momentanément indisponibles. Les espaces opérationnels restent accessibles et aucune donnée n'a été modifiée.",
                "Some live counts are temporarily unavailable. Operational workspaces remain accessible and no data was changed.",
              )}
            </p>
          </div>
        ) : null}

        {requestedConversationId ? (
          <section data-testid="exportunity-requested-operation-room" className="rounded-2xl border border-[#F5A623]/45 bg-[#FFF8E8] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8A5700]">
                  {tr("Contexte de réunion conservé", "Meeting context preserved")}
                </p>
                <h2 className="mt-1 truncate text-lg font-black text-[#07111F]">
                  {requestedRoom?.name || tr("Conversation opérationnelle", "Operations conversation")}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {requestedRoom
                    ? tr(
                        "Le dossier et ses participants restent enregistrés. Continuez dans les espaces actuels ci-dessous.",
                        "The record and its participants remain stored. Continue through the current workspaces below.",
                      )
                    : tr(
                        "Le lien a été conservé, mais cette conversation n'est pas disponible dans la réponse actuelle.",
                        "The link was preserved, but this conversation is not present in the current response.",
                      )}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild className="bg-[#07111F] font-bold text-white hover:bg-slate-800">
                  <Link href="/agenda">{tr("Voir l'agenda", "Open agenda")}</Link>
                </Button>
                <Button asChild variant="outline" className="border-amber-300 bg-white font-bold text-slate-800 hover:bg-white">
                  <Link href="/actions">{tr("Voir les décisions", "Review decisions")}</Link>
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        <section aria-label={tr("État opérationnel", "Operational status")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={tr("Agents actifs", "Active agents")} value={activeAgents.length} note={tr("Équipe Exportunity", "Exportunity team")} icon={Users} />
          <Metric label={tr("Salles ouvertes", "Open rooms")} value={openRooms.length} note={tr("Conversations enregistrées", "Recorded conversations")} icon={MessageSquareText} />
          <Metric label={tr("Actions en file", "Queued actions")} value={actions.length} note={tr("Registre opérationnel", "Operational ledger")} icon={ListChecks} />
          <Metric label={tr("Décisions", "Decisions")} value={decisions.length} note={tr("Revue humaine requise", "Human review required")} icon={ShieldCheck} />
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8A5700]">{tr("Continuer le travail", "Continue work")}</p>
              <h2 className="mt-1 text-xl font-black text-[#07111F]">{tr("Espaces opérationnels", "Operational workspaces")}</h2>
            </div>
            <p className="max-w-xl text-xs leading-5 text-slate-500">
              {tr(
                "Cette page coordonne les données. Toute écriture reste dans l'espace spécialisé, avec ses contrôles et sa piste d'audit.",
                "This page coordinates live records. Every write remains inside its specialist workspace with controls and an audit trail.",
              )}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {workspaceCards.map((item) => <WorkspaceLink key={item.href} item={item} />)}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8A5700]">{tr("Équipe en direct", "Live team")}</p>
                <h2 className="mt-1 text-base font-black text-slate-950">{tr("Agents internes", "Internal agents")}</h2>
              </div>
              <Button asChild size="sm" variant="outline" className="border-slate-200 bg-white font-bold">
                <Link href="/operations/agents">{tr("Toute l'équipe", "Full team")}</Link>
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {activeAgents.slice(0, 6).map((agent) => (
                <Link key={agent.id} href={`/operations/agents/${agent.id}`} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-amber-50/50">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#07111F] text-white">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-950">{agent.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[agent.role, agent.department_name || agent.department_key].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-[#9A6200]" />
                </Link>
              ))}
              {!agentsQuery.isLoading && activeAgents.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-500">
                  {tr("Aucun agent actif n'est disponible dans cette vue.", "No active agent is available in this view.")}
                </div>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8A5700]">{tr("Contrôle", "Control")}</p>
                <h2 className="mt-1 text-base font-black text-slate-950">{tr("À examiner", "Needs review")}</h2>
              </div>
              <Button asChild size="sm" variant="outline" className="border-slate-200 bg-white font-bold">
                <Link href="/actions">{tr("Ouvrir le registre", "Open ledger")}</Link>
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {[...decisions, ...actions].slice(0, 6).map((item) => {
                const state = normalizeState(item.state || item.status);
                return (
                  <Link key={`${item.publicActionId || item.id}-${state}`} href="/actions" className="group flex items-center gap-3 px-5 py-3.5 hover:bg-amber-50/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-950">{readableActionType(item.actionType)}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {item.publicActionId || `ACT-${item.id}`}{item.requestedByAgentKey ? ` · ${item.requestedByAgentKey}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn("shrink-0 text-[9px] font-black", stateClasses(state))}>
                      {state.replaceAll("_", " ")}
                    </Badge>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-[#9A6200]" />
                  </Link>
                );
              })}
              {!actionsQuery.isLoading && !decisionsQuery.isLoading && actions.length + decisions.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-500">
                  {tr("Aucune action ni décision n'attend dans cette vue.", "No action or decision is waiting in this view.")}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8A5700]">{tr("Système de travail", "Work system")}</p>
            <h2 className="mt-1 text-base font-black text-slate-950">{tr("Outils reliés", "Connected workspaces")}</h2>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3">
            <CompactSystemLink href="/tasks" label={tr("Tâches", "Tasks")} detail={tr("Affectation et suivi", "Assignment and follow-up")} icon={ListChecks} />
            <CompactSystemLink href="/goals" label={tr("Objectifs", "Objectives")} detail={tr("Résultats et progression", "Outcomes and progress")} icon={Target} />
            <CompactSystemLink href="/admin/workstations" label={tr("Postes de travail", "Workstations")} detail={tr("Exécution visible des agents", "Visible agent execution")} icon={Wrench} />
            <CompactSystemLink href="/admin/evidence" label={tr("Preuves", "Evidence")} detail={tr("Documents et reçus attribuables", "Attributable documents and receipts")} icon={FileCheck2} />
            <CompactSystemLink href="/admin/inbox" label={tr("Boîte opérations", "Operations inbox")} detail={tr("Communications centralisées", "Centralized communications")} icon={MessageSquareText} />
            <CompactSystemLink href="/knowledge" label={tr("Connaissances", "Knowledge")} detail={tr("Contexte institutionnel", "Institutional context")} icon={ClipboardCheck} />
          </div>
        </section>
      </div>
    </div>
  );
}
