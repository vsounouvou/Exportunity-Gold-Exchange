import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Bot, BrainCircuit, Building2, CheckCircle2, CopyPlus, Globe, Library, Link2, MoreHorizontal, Network, Pencil, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAgentAvatarUrl } from "@/lib/agentAvatar";

type AgentsOsTab = "registry" | "organization" | "workforce" | "studio" | "knowledge" | "marketplace" | "analytics" | "governance";

type SummaryPayload = {
  summary: {
    totalAgents: number;
    marketplaceVisible: number;
    activeAgents: number;
    draftAgents: number;
    visibleMonthlyRevenue: number;
  };
};

type AgentRow = {
  id: number;
  display_name: string;
  role_title: string;
  category: string;
  status: string;
  short_pitch: string | null;
  base_model?: string | null;
  autonomy_level?: number | null;
  marketplace_visible?: boolean;
  price_monthly?: number | string;
  currency?: string | null;
  is_featured?: boolean;
  sort_rank?: number;
  availability?: string;
  avatar_url?: string | null;
  runtime_agent_id?: number | null;
};

type ListResponse = { ok: boolean; total: number; page: number; pageSize: number; items: AgentRow[] };
type RuntimeImportResponse = {
  ok: boolean;
  imported: {
    runtimeCount: number;
    created: number;
    updated: number;
    skipped: number;
    throttled?: boolean;
  };
};
type SeedResponse = {
  ok: boolean;
  seeded: { created: number; updated: number };
  imported: RuntimeImportResponse["imported"];
};
type GovernanceNode = {
  id: number;
  displayName: string;
  roleTitle: string;
  category: string;
  status: string;
  runtimeAgentId: number | null;
  runtimeManagerId: number | null;
  managerId: number | null;
  managerName: string | null;
  isDepartmentHead: boolean;
};
type GovernanceResponse = {
  ok: boolean;
  total: number;
  roots: number;
  orphans: number;
  nodes: GovernanceNode[];
};

type RoleSeatProfile = {
  immutableAgentId?: string;
  description?: string;
  languages?: string[];
  geographicCompetencies?: string[];
  sectorCompetencies?: string[];
  roleLevel?: number;
  decisionAuthority?: string;
  permittedTools?: string[];
  prohibitedTools?: string[];
  activationStatus?: string;
  managerOrganizationKey?: string;
  source?: string;
  dynamicRoleSeat?: boolean;
  staffingRequestId?: number;
  demandCount?: number;
  demandThreshold?: number;
  evidenceRequirementIds?: string[];
};

type RoleSeat = {
  id: number;
  code: string;
  display_name: string;
  role_title: string;
  department_key: string;
  seat_status: "available" | "provisioned" | string;
  role_profile: RoleSeatProfile | null;
  avatar_url: string | null;
  runtime_agent_id: number | null;
  runtime_status: string | null;
  runtime_display_name: string | null;
  runtime_role: string | null;
  runtime_avatar_url: string | null;
  runtime_manager_id: number | null;
  runtime_manager_name: string | null;
  production_enabled: boolean;
};

type RoleSeatDepartment = {
  key: string;
  name: string;
  mission: string;
  baseCapacity: number;
  capacity: number;
  demandCreated: number;
  seats: RoleSeat[];
};

type RoleSeatsResponse = {
  ok: boolean;
  organizationVersion: string | null;
  summary: {
    total: number;
    baseline: number;
    demandCreated: number;
    available: number;
    provisioned: number;
    activeRuntime: number;
    productionEnabled: number;
  };
  departments: RoleSeatDepartment[];
};

type CoreTeamReconciliationItem = {
  organizationKey: string;
  rationale: string;
  status: "ready" | "already_linked" | "employee_missing" | "role_seat_missing" | "seat_occupied" | "employee_assigned_elsewhere";
  blockingReason: string | null;
  employee: {
    id: number;
    displayName: string;
    role: string;
    status: string;
    productionEnabled: boolean;
  } | null;
  roleSeat: {
    id: number | null;
    code: string;
    title: string;
    roleTitle: string;
    departmentKey: string | null;
    runtimeAgentId: number | null;
  };
};

type CoreTeamReconciliationResponse = {
  ok: boolean;
  mode: "preview" | "applied";
  summary: { total: number; ready: number; linked: number; blocked: number };
  items: CoreTeamReconciliationItem[];
  linkedNow?: number;
  permissionsChanged: false;
  lifecycleChanged: false;
  externalActionsStarted: false;
};

type WorkforceRequest = {
  id: number;
  requirement_id: string | null;
  role_template_id: number | null;
  role_code: string;
  role_title: string;
  department_key: string;
  reason: string;
  evidence: Record<string, unknown> | null;
  evidence_items: Array<Record<string, unknown>> | null;
  company_brain_context_pack_id: number | null;
  governance_status: "pending" | "ready" | "review_required" | "unavailable" | string;
  governance_snapshot: {
    reason?: string;
    citationCount?: number;
    knownConflicts?: Array<Record<string, unknown>>;
    openQuestions?: Array<Record<string, unknown>>;
    assembledAt?: string;
    expiresAt?: string | null;
  } | null;
  demand_count: number;
  demand_threshold: number;
  signal_type: string;
  last_signal_at: string | null;
  priority: string;
  status: string;
  review_note: string | null;
  provisioned_agent_id: number | null;
  role_seat_status: string | null;
  role_seat_organization_version: string | null;
  role_profile: RoleSeatProfile | null;
  dynamic_role_seat: boolean;
  runtime_status: string | null;
  runtime_display_name: string | null;
  manager_id: number | null;
  manager_display_name: string | null;
  production_enabled: boolean;
  reference_code: string | null;
  requirement_title: string | null;
  commercial_intent: string | null;
  created_at: string;
};

type WorkforceResponse = {
  ok: boolean;
  summary: {
    total: number;
    monitoring: number;
    proposed: number;
    approved: number;
    provisioned: number;
    active: number;
    paused: number;
  };
  items: WorkforceRequest[];
};

type WorkforceEvaluationResponse = {
  ok: boolean;
  requirementsEvaluated: number;
  requirementsWithSignals: number;
  signalsObserved: number;
  roles: Array<{
    roleTitle: string;
    status: string;
    demandCount: number;
    demandThreshold: number;
    reviewReady: boolean;
  }>;
  reviewReady: number;
  runtimeAgentsStarted: 0;
  employeesCreated: 0;
  employeesActivated: 0;
  externalActionsStarted: false;
  nextStep: string;
};

function useDebouncedValue<T>(value: T, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function fmtMoney(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount);
}

function parseTab(search: string): AgentsOsTab {
  try {
    const value = String(new URLSearchParams(search).get("tab") || "").toLowerCase();
    if (value === "registry" || value === "organization" || value === "workforce" || value === "studio" || value === "knowledge" || value === "marketplace" || value === "analytics" || value === "governance") {
      return value;
    }
  } catch {
    // noop
  }
  return "registry";
}

export default function AdminAgentsOsPage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const activeTab = parseTab(search);

  const [q, setQ] = useState("");
  const [organizationQuery, setOrganizationQuery] = useState("");
  const [editingRoleSeat, setEditingRoleSeat] = useState<RoleSeat | null>(null);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [activationRequest, setActivationRequest] = useState<WorkforceRequest | null>(null);
  const [workforceReviewRequest, setWorkforceReviewRequest] = useState<WorkforceRequest | null>(null);
  const [workforceReviewDecision, setWorkforceReviewDecision] = useState<"approve" | "reject">("approve");
  const [workforceReviewNote, setWorkforceReviewNote] = useState("");
  const [roleSeatDraft, setRoleSeatDraft] = useState({
    displayName: "",
    roleTitle: "",
    avatarUrl: "",
    description: "",
    languages: "",
    geographies: "",
    sectors: "",
    decisionAuthority: "low",
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createRoleTitle, setCreateRoleTitle] = useState("");
  const [createCategory, setCreateCategory] = useState("operations");
  const [createShortPitch, setCreateShortPitch] = useState("");
  const [createLongDescription, setCreateLongDescription] = useState("");
  const [createPrice, setCreatePrice] = useState("220");
  const qDebounced = useDebouncedValue(q, 250);
  const needsAgentsList = activeTab === "registry" || activeTab === "knowledge" || activeTab === "studio";
  const needsMarketplaceList = activeTab === "marketplace" || activeTab === "analytics";

  const summaryQuery = useQuery<SummaryPayload>({
    queryKey: ["/api/admin/agents-os/summary"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const agentsQuery = useQuery<ListResponse>({
    queryKey: ["/api/admin/agents", qDebounced, statusFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "40");
      if (qDebounced.trim()) params.set("q", qDebounced.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      return apiRequest(`/api/admin/agents?${params.toString()}`, "GET");
    },
    enabled: needsAgentsList,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const marketplaceQuery = useQuery<ListResponse>({
    queryKey: ["/api/admin/marketplace/agents", qDebounced, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "80");
      if (qDebounced.trim()) params.set("q", qDebounced.trim());
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      return apiRequest(`/api/admin/marketplace/agents?${params.toString()}`, "GET");
    },
    enabled: needsMarketplaceList,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const governanceQuery = useQuery<GovernanceResponse>({
    queryKey: ["/api/admin/agents-os/governance"],
    queryFn: async () => apiRequest("/api/admin/agents-os/governance", "GET"),
    enabled: activeTab === "governance",
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const roleSeatsQuery = useQuery<RoleSeatsResponse>({
    queryKey: ["/api/admin/agents-os/role-seats"],
    queryFn: async () => apiRequest("/api/admin/agents-os/role-seats", "GET"),
    enabled: activeTab === "organization",
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const coreTeamReconciliationQuery = useQuery<CoreTeamReconciliationResponse>({
    queryKey: ["/api/admin/agents-os/core-team-reconciliation"],
    queryFn: async () => apiRequest("/api/admin/agents-os/core-team-reconciliation", "GET"),
    enabled: activeTab === "organization",
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const workforceQuery = useQuery<WorkforceResponse>({
    queryKey: ["/api/admin/agents-os/workforce-requests"],
    queryFn: async () => apiRequest("/api/admin/agents-os/workforce-requests", "GET"),
    enabled: activeTab === "workforce",
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const filteredRoleSeatDepartments = useMemo(() => {
    const needle = organizationQuery.trim().toLowerCase();
    if (!needle) return roleSeatsQuery.data?.departments || [];
    return (roleSeatsQuery.data?.departments || [])
      .map((department) => ({
        ...department,
        seats: department.seats.filter((seat) => {
          const profile = seat.role_profile || {};
          return [
            seat.display_name,
            seat.role_title,
            seat.code,
            department.name,
            profile.description,
            ...(profile.languages || []),
            ...(profile.geographicCompetencies || []),
            ...(profile.sectorCompetencies || []),
          ].some((value) => String(value || "").toLowerCase().includes(needle));
        }),
      }))
      .filter((department) => department.seats.length > 0);
  }, [organizationQuery, roleSeatsQuery.data?.departments]);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    for (const row of agentsQuery.data?.items || []) {
      const c = String(row.category || "").trim();
      if (c) unique.add(c);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [agentsQuery.data?.items]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/summary"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/marketplace/agents"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/agents"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/role-seats"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/core-team-reconciliation"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/workforce-requests"] }),
    ]);
  };

  const provisionRoleSeat = useMutation({
    mutationFn: async ({ templateId, staffingRequestId }: { templateId: number; staffingRequestId?: number }) =>
      apiRequest(`/api/admin/agents/${templateId}/provision`, "POST", { staffingRequestId }),
    onSuccess: async (payload: { runtimeAgentId: number; alreadyProvisioned?: boolean; manager?: { name?: string } }) => {
      await refreshAll();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/governance"] });
      toast({
        title: payload.alreadyProvisioned ? "Role seat already provisioned" : "Role seat provisioned inactive",
        description: `${payload.manager?.name ? `Reports to ${payload.manager.name}. ` : ""}No production access or external communication was enabled. Edit the employee before activation.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Provisioning failed", description: error?.message || "Could not provision role seat", variant: "destructive" });
    },
  });

  const updateEmployeeLifecycle = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "activate" | "pause" }) =>
      apiRequest(`/api/admin/agents-os/workforce-requests/${id}/lifecycle`, "POST", {
        action,
        confirmActivation: action === "activate",
      }),
    onSuccess: async (payload: { status: string; externalCommunicationEnabled: boolean }) => {
      setActivationRequest(null);
      await refreshAll();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/governance"] });
      toast({
        title: payload.status === "active" ? "Employee activated" : "Employee paused",
        description: payload.status === "active"
          ? "The employee can accept event-driven internal work. External messages, payments, and contracts still require separate approval."
          : "Production execution is paused. The employee profile and evidence remain available.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Lifecycle update failed", description: error?.message || "Could not update this employee", variant: "destructive" });
    },
  });

  const reviewWorkforceRequest = useMutation({
    mutationFn: async ({ id, decision, reviewNote }: { id: number; decision: "approve" | "reject"; reviewNote: string }) =>
      apiRequest(`/api/admin/agents-os/workforce-requests/${id}/review`, "POST", { decision, reviewNote }),
    onSuccess: async (payload: any) => {
      setWorkforceReviewRequest(null);
      setWorkforceReviewNote("");
      await refreshAll();
      toast({
        title: payload?.item?.status === "approved" ? "Staffing need approved" : "Staffing need rejected",
        description: payload?.nextStep || "The governed workforce record was updated.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Review failed", description: error?.message || "Could not review staffing need", variant: "destructive" });
    },
  });

  const evaluateCurrentDemand = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/agents-os/workforce-requests/evaluate-current-demand", "POST", {}),
    onSuccess: async (payload: WorkforceEvaluationResponse) => {
      await refreshAll();
      toast({
        title: "Current demand evaluated",
        description: `${payload.requirementsEvaluated} opportunities reviewed. ${payload.roles.length} governed role signal${payload.roles.length === 1 ? " is" : "s are"} now visible. No employee was created or activated.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Demand evaluation failed",
        description: error?.message || "Current industrial opportunities could not be evaluated.",
        variant: "destructive",
      });
    },
  });

  const reconcileCoreTeam = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/agents-os/core-team-reconciliation/apply", "POST", { confirm: true }),
    onSuccess: async (payload: CoreTeamReconciliationResponse) => {
      setReconciliationOpen(false);
      await refreshAll();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/governance"] });
      toast({
        title: "Current team linked to the organization",
        description: `${payload.linkedNow || 0} employee${payload.linkedNow === 1 ? " was" : "s were"} linked to governed role seats. No permissions, lifecycle state, or external action changed.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reconciliation stopped",
        description: error?.message || "The current team could not be linked safely.",
        variant: "destructive",
      });
    },
  });

  const openRoleSeatEditor = (seat: RoleSeat) => {
    const profile = seat.role_profile || {};
    setEditingRoleSeat(seat);
    setRoleSeatDraft({
      displayName: seat.display_name || "",
      roleTitle: seat.role_title || "",
      avatarUrl: seat.avatar_url || "",
      description: profile.description || "",
      languages: (profile.languages || []).join(", "),
      geographies: (profile.geographicCompetencies || []).join(", "),
      sectors: (profile.sectorCompetencies || []).join(", "),
      decisionAuthority: profile.decisionAuthority || "low",
    });
  };

  const updateRoleSeat = useMutation({
    mutationFn: async () => {
      if (!editingRoleSeat) throw new Error("No role seat selected");
      const toList = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
      return apiRequest(`/api/admin/agents/${editingRoleSeat.id}`, "PATCH", {
        displayName: roleSeatDraft.displayName,
        roleTitle: roleSeatDraft.roleTitle,
        avatarUrl: roleSeatDraft.avatarUrl,
        shortPitch: roleSeatDraft.description,
        longDescription: roleSeatDraft.description,
        roleProfile: {
          ...(editingRoleSeat.role_profile || {}),
          description: roleSeatDraft.description,
          languages: toList(roleSeatDraft.languages),
          geographicCompetencies: toList(roleSeatDraft.geographies),
          sectorCompetencies: toList(roleSeatDraft.sectors),
          decisionAuthority: roleSeatDraft.decisionAuthority,
        },
      });
    },
    onSuccess: async () => {
      setEditingRoleSeat(null);
      await refreshAll();
      toast({
        title: "Role seat updated",
        description: "The role blueprint was saved. Runtime status and production permissions were not changed.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error?.message || "Could not update role seat", variant: "destructive" });
    },
  });

  const createAgent = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/agents", "POST", {
        displayName: createDisplayName,
        roleTitle: createRoleTitle || createDisplayName,
        category: createCategory,
        shortPitch: createShortPitch,
        longDescription: createLongDescription,
        priceMonthly: Number(createPrice || 0),
        status: "draft",
      }),
    onSuccess: async () => {
      toast({ title: "Agent created", description: "New draft agent added to Registry." });
      setCreateDisplayName("");
      setCreateRoleTitle("");
      setCreateShortPitch("");
      setCreateLongDescription("");
      await refreshAll();
      setLocation("/agents-os?tab=registry");
    },
    onError: (error: any) => {
      toast({ title: "Create failed", description: error?.message || "Failed to create agent", variant: "destructive" });
    },
  });
  const importRuntimeAgents = useMutation({
    mutationFn: async () => apiRequest("/api/admin/agents-os/import-runtime", "POST", {}),
    onSuccess: async (payload: RuntimeImportResponse) => {
      toast({
        title: "Runtime agents imported",
        description: `${payload?.imported?.created ?? 0} created, ${payload?.imported?.updated ?? 0} updated.`,
      });
      await refreshAll();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/governance"] });
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error?.message || "Could not import runtime agents", variant: "destructive" });
    },
  });

  const seedAgents = useMutation({
    mutationFn: async () => apiRequest("/api/admin/agents-os/seed", "POST", { preset: "boursedelor_core" }),
    onSuccess: async (payload: SeedResponse) => {
      toast({
        title: "Agents generated",
        description: `${payload?.seeded?.created ?? 0} generated, ${payload?.imported?.updated ?? 0} runtime agents refreshed.`,
      });
      await refreshAll();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/governance"] });
      setLocation("/agents-os?tab=registry");
    },
    onError: (error: any) => {
      toast({ title: "Generation failed", description: error?.message || "Could not generate agents", variant: "destructive" });
    },
  });

  const setMarketplace = useMutation({
    mutationFn: async (payload: {
      id: number;
      isVisible: boolean;
      priceMonthly: number;
      currency: string;
      isFeatured: boolean;
      availability: string;
      sortRank: number;
    }) =>
      apiRequest(`/api/admin/agents/${payload.id}/marketplace`, "PUT", {
        isVisible: payload.isVisible,
        priceMonthly: payload.priceMonthly,
        currency: payload.currency,
        isFeatured: payload.isFeatured,
        availability: payload.availability,
        sortRank: payload.sortRank,
      }),
    onSuccess: async () => {
      await refreshAll();
    },
    onError: (error: any) => {
      toast({ title: "Marketplace update failed", description: error?.message || "Update failed", variant: "destructive" });
    },
  });

  const setAgentStatus = useMutation({
    mutationFn: async (payload: { id: number; action: "activate" | "retire" }) =>
      apiRequest(`/api/admin/agents/${payload.id}/${payload.action}`, "POST", {}),
    onSuccess: async () => {
      await refreshAll();
    },
    onError: (error: any) => {
      toast({ title: "Status update failed", description: error?.message || "Update failed", variant: "destructive" });
    },
  });

  const cloneAgent = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/admin/agents/${id}/clone`, "POST", { cloneReason: "studio_clone" }),
    onSuccess: async () => {
      toast({ title: "Agent cloned", description: "Clone created as draft." });
      await refreshAll();
    },
    onError: (error: any) => {
      toast({ title: "Clone failed", description: error?.message || "Could not clone agent", variant: "destructive" });
    },
  });

  const snapshotAgent = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/admin/agents/${id}/version`, "POST", { changeNote: "Manual snapshot" }),
    onSuccess: async () => {
      toast({ title: "Snapshot created", description: "Version saved." });
      await refreshAll();
    },
    onError: (error: any) => {
      toast({ title: "Snapshot failed", description: error?.message || "Could not snapshot agent", variant: "destructive" });
    },
  });

  const navigateTab = (tab: string) => {
    const safe = (tab || "registry").toLowerCase();
    setLocation(`/agents-os?tab=${safe}`, { replace: true });
  };

  return (
    <div className="agents-os-light min-h-screen space-y-4 p-4 lg:p-6">
      <style>{`
        .agents-os-light {
          background: #f7f8fa;
          color: #111827;
        }
        .agents-os-light .bg-gray-900,
        .agents-os-light .bg-gray-900\\/50,
        .agents-os-light .bg-gray-900\\/60,
        .agents-os-light .bg-gray-900\\/70,
        .agents-os-light .bg-gray-900\\/80,
        .agents-os-light .bg-gray-950,
        .agents-os-light .bg-gray-950\\/30,
        .agents-os-light .bg-gray-950\\/40,
        .agents-os-light .bg-gray-950\\/50,
        .agents-os-light .bg-gray-950\\/70 {
          background: #ffffff !important;
        }
        .agents-os-light .border-gray-800,
        .agents-os-light .border-gray-800\\/70,
        .agents-os-light .border-gray-800\\/80,
        .agents-os-light .border-gray-700 {
          border-color: rgba(15, 23, 42, 0.12) !important;
        }
        .agents-os-light .text-white,
        .agents-os-light .text-gray-100,
        .agents-os-light .text-gray-200,
        .agents-os-light .text-gray-300 {
          color: #111827 !important;
        }
        .agents-os-light .text-gray-400,
        .agents-os-light .text-gray-500 {
          color: #4b5563 !important;
        }
        .agents-os-light input,
        .agents-os-light textarea,
        .agents-os-light [role="combobox"] {
          background: #ffffff !important;
          color: #111827 !important;
          border-color: rgba(15, 23, 42, 0.16) !important;
        }
        .agents-os-light [role="tablist"] {
          background: #ffffff !important;
          border-color: rgba(15, 23, 42, 0.12) !important;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
        }
        .agents-os-light [role="tab"] {
          color: #334155 !important;
        }
        .agents-os-light [role="tab"][data-state="active"] {
          background: #f5a623 !important;
          color: #07111f !important;
        }
        .agents-os-light .bg-amber-500,
        .agents-os-light .hover\\:bg-amber-600:hover {
          background: #f5a623 !important;
          color: #07111f !important;
        }
        .agents-os-light .bg-emerald-600\\/20 {
          background: rgba(22, 163, 74, 0.12) !important;
        }
        .agents-os-light .agents-os-secondary-action {
          background: #ffffff !important;
          border-color: rgba(15, 23, 42, 0.14) !important;
          color: #334155 !important;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
        }
        .agents-os-light .agents-os-secondary-action:hover {
          background: #f8fafc !important;
          color: #07111f !important;
        }
      `}</style>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white">Agents OS</h1>
          <p className="text-xs text-gray-400">Advanced registry, versions, marketplace controls, analytics, and governance.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="agents-os-secondary-action"
            onClick={() => setLocation("/operations/agents")}
          >
            <UsersRound className="h-4 w-4 mr-2" />
            Team &amp; identity
          </Button>
          <Button
            variant="outline"
            className="agents-os-secondary-action"
            disabled={importRuntimeAgents.isPending}
            onClick={() => importRuntimeAgents.mutate()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Import runtime agents
          </Button>
          <Button className="bg-amber-500 hover:bg-amber-600 text-black" disabled={seedAgents.isPending} onClick={() => seedAgents.mutate()}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate agents
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="bg-gray-900 border-gray-800"><CardContent className="p-4"><div className="text-xs text-gray-400">Total Agents</div><div className="text-xl font-semibold text-white">{summaryQuery.data?.summary.totalAgents ?? 0}</div></CardContent></Card>
        <Card className="bg-gray-900 border-gray-800"><CardContent className="p-4"><div className="text-xs text-gray-400">Marketplace Visible</div><div className="text-xl font-semibold text-white">{summaryQuery.data?.summary.marketplaceVisible ?? 0}</div></CardContent></Card>
        <Card className="bg-gray-900 border-gray-800"><CardContent className="p-4"><div className="text-xs text-gray-400">Active</div><div className="text-xl font-semibold text-white">{summaryQuery.data?.summary.activeAgents ?? 0}</div></CardContent></Card>
        <Card className="bg-gray-900 border-gray-800"><CardContent className="p-4"><div className="text-xs text-gray-400">Draft</div><div className="text-xl font-semibold text-white">{summaryQuery.data?.summary.draftAgents ?? 0}</div></CardContent></Card>
        <Card className="bg-gray-900 border-gray-800"><CardContent className="p-4"><div className="text-xs text-gray-400">Visible Revenue</div><div className="text-xl font-semibold text-white">${fmtMoney(summaryQuery.data?.summary.visibleMonthlyRevenue ?? 0)}</div></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={navigateTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-8 bg-gray-900 border border-gray-800">
          <TabsTrigger value="registry"><Bot className="h-4 w-4 mr-1" />Registry</TabsTrigger>
          <TabsTrigger value="organization"><Building2 className="h-4 w-4 mr-1" />Organization</TabsTrigger>
          <TabsTrigger value="workforce"><UsersRound className="h-4 w-4 mr-1" />Workforce</TabsTrigger>
          <TabsTrigger value="studio"><Plus className="h-4 w-4 mr-1" />Studio</TabsTrigger>
          <TabsTrigger value="knowledge"><Library className="h-4 w-4 mr-1" />Knowledge</TabsTrigger>
          <TabsTrigger value="marketplace"><Globe className="h-4 w-4 mr-1" />Marketplace</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
          <TabsTrigger value="governance"><ShieldCheck className="h-4 w-4 mr-1" />Governance</TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-amber-600" />
                  <h2 className="text-lg font-semibold text-slate-950">Exportunity global organization</h2>
                  {roleSeatsQuery.data?.organizationVersion ? (
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      {roleSeatsQuery.data.organizationVersion}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  Role seats define the company structure. They do not run, spend, contact anyone, or use production tools until a human provisions and separately enables them.
                </p>
              </div>
              <div className="relative w-full lg:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={organizationQuery}
                  onChange={(event) => setOrganizationQuery(event.target.value)}
                  placeholder="Search role, market, sector..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 lg:grid-cols-6">
              {[
                ["Role seats", roleSeatsQuery.data?.summary.total ?? 0],
                ["Demand-created", roleSeatsQuery.data?.summary.demandCreated ?? 0],
                ["Available", roleSeatsQuery.data?.summary.available ?? 0],
                ["Provisioned inactive", roleSeatsQuery.data?.summary.provisioned ?? 0],
                ["Active runtimes", roleSeatsQuery.data?.summary.activeRuntime ?? 0],
                ["Production enabled", roleSeatsQuery.data?.summary.productionEnabled ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-white px-4 py-3">
                  <div className="text-xs font-medium text-slate-500">{label}</div>
                  <div className="mt-1 text-xl font-semibold text-slate-950">{value}</div>
                </div>
              ))}
            </div>

            {coreTeamReconciliationQuery.data?.summary.ready || coreTeamReconciliationQuery.data?.summary.blocked ? (
              <div className="border-b border-slate-200 bg-amber-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    {coreTeamReconciliationQuery.data.summary.blocked > 0 ? (
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                    ) : (
                      <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    )}
                    <div>
                      <div className="text-sm font-semibold text-slate-950">Connect the current team to this organization</div>
                      <p className="mt-0.5 text-xs leading-5 text-slate-600">
                        {coreTeamReconciliationQuery.data.summary.ready} existing employee{coreTeamReconciliationQuery.data.summary.ready === 1 ? " has" : "s have"} a governed role-seat match based on stable organization identity. Review every link before applying it; identity, permissions, lifecycle, and production access remain unchanged.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="agents-os-secondary-action shrink-0"
                    onClick={() => setReconciliationOpen(true)}
                  >
                    Review {coreTeamReconciliationQuery.data.summary.total} matches
                  </Button>
                </div>
              </div>
            ) : coreTeamReconciliationQuery.data?.summary.linked ? (
              <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {coreTeamReconciliationQuery.data.summary.linked} current employees are linked to governed role seats.
              </div>
            ) : null}

            {roleSeatsQuery.isLoading ? (
              <div className="p-6 text-sm text-slate-600">Loading the global organization...</div>
            ) : roleSeatsQuery.isError ? (
              <div className="p-6">
                <div className="text-sm font-medium text-rose-700">The organization could not be loaded.</div>
                <Button className="mt-3" variant="outline" onClick={() => roleSeatsQuery.refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />Retry
                </Button>
              </div>
            ) : filteredRoleSeatDepartments.length ? (
              <div className="divide-y divide-slate-200">
                {filteredRoleSeatDepartments.map((department) => (
                  <section key={department.key} className="p-4">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-950">{department.name}</h3>
                        <p className="text-xs text-slate-600">{department.mission}</p>
                      </div>
                      <div className="text-xs font-medium text-slate-500">
                        {department.seats.length}{organizationQuery.trim() ? ` of ${department.capacity}` : ""} seats
                        {department.demandCreated > 0 ? ` · ${department.demandCreated} demand-created` : ""}
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                      {department.seats.map((seat) => {
                        const runtimeAgentId = Number(seat.runtime_agent_id || 0);
                        const runtimeActive = seat.runtime_status === "active" && seat.production_enabled;
                        const profile = seat.role_profile || {};
                        const employeeDisplayName = seat.runtime_display_name || seat.display_name;
                        const avatarUrl = String(seat.runtime_avatar_url || seat.avatar_url || "").trim() || getAgentAvatarUrl({
                          id: runtimeAgentId || seat.id,
                          name: employeeDisplayName,
                          label: employeeDisplayName,
                          size: 80,
                        });
                        return (
                          <div key={seat.id} className="flex flex-col gap-3 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <img
                                src={avatarUrl}
                                alt={`${employeeDisplayName} profile`}
                                loading="lazy"
                                className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-slate-100 object-cover"
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="truncate text-sm font-semibold text-slate-950">{employeeDisplayName}</div>
                                  <Badge
                                    variant="outline"
                                    className={runtimeActive
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : runtimeAgentId > 0
                                        ? "border-amber-200 bg-amber-50 text-amber-800"
                                        : "border-slate-200 bg-slate-50 text-slate-600"}
                                  >
                                    {runtimeActive ? "active employee" : runtimeAgentId > 0 ? `${seat.runtime_status || "inactive"} employee` : "available seat"}
                                  </Badge>
                                  {profile.dynamicRoleSeat ? (
                                    <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">
                                      demand-created role
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="mt-0.5 truncate text-xs text-slate-600">
                                  {seat.runtime_role || seat.role_title}
                                  {seat.runtime_role && seat.runtime_role !== seat.role_title ? ` · governed seat: ${seat.role_title}` : ""}
                                </div>
                                {seat.runtime_manager_name ? (
                                  <div className="mt-0.5 text-xs text-slate-500">Reports to {seat.runtime_manager_name}</div>
                                ) : profile.managerOrganizationKey ? (
                                  <div className="mt-0.5 text-xs text-slate-500">
                                    Planned manager: {profile.managerOrganizationKey.replace(/-/g, " ")}
                                  </div>
                                ) : null}
                                <div className="mt-1 line-clamp-1 text-xs text-slate-500">{profile.description || "Task-scoped role in the Exportunity operating model."}</div>
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                              <div className="hidden max-w-56 text-right text-[11px] text-slate-500 xl:block">
                                {(profile.languages || []).slice(0, 2).join(" / ") || "English / French"}
                                <br />Authority: {profile.decisionAuthority || "low"}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="agents-os-secondary-action"
                                onClick={() => openRoleSeatEditor(seat)}
                              >
                                <Pencil className="mr-1.5 h-3.5 w-3.5" />Edit role
                              </Button>
                              {runtimeAgentId > 0 ? (
                                <Button
                                  size="sm"
                                  className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                                  onClick={() => setLocation(`/operations/agents/${runtimeAgentId}?edit=1`)}
                                >
                                  Edit identity &amp; face
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className="bg-slate-950 text-white hover:bg-slate-800"
                                  disabled={provisionRoleSeat.isPending}
                                  onClick={() => provisionRoleSeat.mutate({ templateId: seat.id })}
                                >
                                  Provision inactive
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="p-6 text-sm text-slate-600">No role seats match this search.</div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="workforce" className="space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Demand-driven workforce</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  Commercial demand can propose missing capacity. Approval, provisioning, production access, and external communication remain separate human-controlled gates.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                  disabled={evaluateCurrentDemand.isPending}
                  onClick={() => evaluateCurrentDemand.mutate()}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {evaluateCurrentDemand.isPending ? "Evaluating demand..." : "Evaluate current demand"}
                </Button>
                <Button variant="outline" className="agents-os-secondary-action" onClick={() => workforceQuery.refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />Refresh
                </Button>
              </div>
            </div>
            <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["1", "Evaluate real demand", "Read current industrial opportunities and deduplicate evidence."],
                ["2", "Approve the need", "A human reviews the role, threshold, and linked commercial cases."],
                ["3", "Create and edit", "Provision inactive, then set the employee's identity, face, manager, and limits."],
                ["4", "Activate separately", "Enable internal work only after review; outreach and spending stay gated."],
              ].map(([step, title, description]) => (
                <div key={step} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">{step}</span>
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{title}</div>
                    <div className="mt-0.5 text-xs leading-5 text-slate-600">{description}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 lg:grid-cols-6">
              {[
                ["Demand signals", workforceQuery.data?.summary.monitoring ?? 0],
                ["Ready for review", workforceQuery.data?.summary.proposed ?? 0],
                ["Approved", workforceQuery.data?.summary.approved ?? 0],
                ["Created inactive", workforceQuery.data?.summary.provisioned ?? 0],
                ["Active employees", workforceQuery.data?.summary.active ?? 0],
                ["Paused", workforceQuery.data?.summary.paused ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-white px-4 py-3">
                  <div className="text-xs font-medium text-slate-500">{label}</div>
                  <div className="mt-1 text-xl font-semibold text-slate-950">{value}</div>
                </div>
              ))}
            </div>
            <div className="divide-y divide-slate-200">
              {workforceQuery.isLoading ? (
                <div className="p-6 text-sm text-slate-600">Loading workforce demand...</div>
              ) : workforceQuery.isError ? (
                <div className="p-6 text-sm text-rose-700">Workforce demand could not be loaded.</div>
              ) : workforceQuery.data?.items?.length ? (
                workforceQuery.data.items.map((item) => (
                  <article key={item.id} className="p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-950">{item.role_title}</h3>
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">{item.priority}</Badge>
                        {item.dynamic_role_seat || Boolean(item.evidence?.dynamicRoleSeat) ? (
                            <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">demand-created role</Badge>
                          ) : null}
                          <Badge variant="outline" className={item.status === "active"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : item.status === "proposed"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-slate-200 bg-slate-50 text-slate-700"}
                          >{item.status === "monitoring" ? "watching demand" : item.status}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-700">{item.reason}</p>
                        {["recurring_demand", "active_capacity"].includes(item.signal_type) ? (
                          <div className="mt-3 max-w-xl">
                            <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
                              <span>{item.demand_count} distinct demand signal{item.demand_count === 1 ? "" : "s"}</span>
                              <span>{item.signal_type === "active_capacity" ? "Assigned to active capacity" : `Review at ${item.demand_threshold}`}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-amber-500 transition-all"
                                style={{ width: `${Math.min(100, Math.round((Number(item.demand_count || 0) / Math.max(1, Number(item.demand_threshold || 1))) * 100))}%` }}
                              />
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>Department: {item.department_key}</span>
                          <span>Evidence: {Array.isArray(item.evidence_items) ? item.evidence_items.length : item.demand_count || 0}</span>
                          {item.reference_code ? <span>Case: {item.reference_code}</span> : null}
                          {item.commercial_intent ? <span>Intent: {item.commercial_intent}</span> : null}
                          {item.manager_display_name ? <span>Manager: {item.manager_display_name}</span> : null}
                        </div>
                        <div className={`mt-3 flex max-w-2xl flex-col gap-2 rounded-md border p-3 text-xs sm:flex-row sm:items-center sm:justify-between ${
                          item.governance_status === "ready"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-amber-200 bg-amber-50 text-amber-950"
                        }`}>
                          <div className="flex min-w-0 gap-2">
                            {item.governance_status === "ready" ? (
                              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                            ) : (
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            )}
                            <div>
                              <div className="font-semibold">
                                Company Brain: {item.governance_status === "ready" ? "evidence ready" : "review required"}
                              </div>
                              <div className="mt-0.5 leading-5 opacity-80">
                                {item.governance_snapshot?.reason || "A fresh governed context pack will be assembled during review."}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 opacity-75">
                                <span>{Number(item.governance_snapshot?.citationCount || 0)} citations</span>
                                <span>{item.governance_snapshot?.knownConflicts?.length || 0} conflicts</span>
                                <span>{item.governance_snapshot?.openQuestions?.length || 0} open questions</span>
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="agents-os-secondary-action shrink-0"
                            onClick={() => setLocation("/admin/company-brain")}
                          >
                            Review evidence
                          </Button>
                        </div>
                        {Array.isArray(item.evidence_items) && item.evidence_items.length ? (
                          <div className="mt-3 flex flex-wrap gap-2" aria-label="Commercial demand evidence">
                            {item.evidence_items.slice(0, 8).map((evidence, index) => {
                              const referenceCode = String(evidence.referenceCode || evidence.reference_code || `Evidence ${index + 1}`);
                              const product = String(evidence.productName || evidence.productCategory || "Verified demand");
                              const requirementId = String(evidence.requirementId || evidence.requirement_id || "").trim();
                              return (
                                <button
                                  type="button"
                                  key={`${referenceCode}-${index}`}
                                  onClick={() => setLocation(
                                    requirementId
                                      ? `/admin/industrial-network?requirement=${encodeURIComponent(requirementId)}`
                                      : "/admin/industrial-network",
                                  )}
                                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-xs text-slate-700 transition-colors hover:border-amber-300 hover:bg-amber-50"
                                  title="Open the industrial opportunity workspace"
                                >
                                  <span className="font-semibold text-slate-950">{referenceCode}</span>
                                  <span className="ml-1 text-slate-500">/ {product}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {item.status === "proposed" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="agents-os-secondary-action"
                              onClick={() => {
                                setWorkforceReviewRequest(item);
                                setWorkforceReviewDecision("reject");
                                setWorkforceReviewNote("");
                              }}
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                              onClick={() => {
                                setWorkforceReviewRequest(item);
                                setWorkforceReviewDecision("approve");
                                setWorkforceReviewNote("");
                              }}
                            >
                              Review need
                            </Button>
                          </>
                        ) : null}
                        {item.status === "approved" && (
                          item.governance_status !== "ready" ||
                          !item.company_brain_context_pack_id ||
                          !item.evidence?.decisionRecord
                        ) ? (
                          <Button
                            size="sm"
                            className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                            onClick={() => {
                              setWorkforceReviewRequest(item);
                              setWorkforceReviewDecision("approve");
                              setWorkforceReviewNote("");
                            }}
                          >
                            Re-review need
                          </Button>
                        ) : item.status === "approved" && item.role_template_id ? (
                          <Button size="sm" className="bg-slate-950 text-white hover:bg-slate-800" onClick={() => provisionRoleSeat.mutate({ templateId: Number(item.role_template_id), staffingRequestId: item.id })}>Create employee inactive</Button>
                        ) : null}
                        {item.provisioned_agent_id ? (
                          <Button size="sm" variant="outline" className="agents-os-secondary-action" onClick={() => setLocation(`/operations/agents/${item.provisioned_agent_id}?edit=1`)}>Edit identity</Button>
                        ) : null}
                        {item.status === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="agents-os-secondary-action"
                            onClick={() => setLocation(
                              item.requirement_id
                                ? `/admin/industrial-network?requirement=${encodeURIComponent(item.requirement_id)}`
                                : "/admin/industrial-network",
                            )}
                          >
                            View linked work
                          </Button>
                        ) : null}
                        {item.status === "provisioned" && item.provisioned_agent_id ? (
                          <Button size="sm" className="bg-emerald-700 text-white hover:bg-emerald-600" onClick={() => setActivationRequest(item)}>Review &amp; activate</Button>
                        ) : null}
                        {item.status === "active" ? (
                          <Button size="sm" variant="outline" className="agents-os-secondary-action" onClick={() => updateEmployeeLifecycle.mutate({ id: item.id, action: "pause" })}>Pause employee</Button>
                        ) : null}
                        {item.status === "paused" ? (
                          <Button size="sm" className="bg-emerald-700 text-white hover:bg-emerald-600" onClick={() => setActivationRequest(item)}>Reactivate</Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="flex flex-col items-start gap-3 p-6">
                  <div>
                    <div className="font-semibold text-slate-950">No staffing signal has been recorded yet.</div>
                    <p className="mt-1 max-w-2xl text-sm text-slate-600">
                      Evaluate the company's current industrial opportunities against the governed role catalog. This records review evidence only. No employee is created or activated, and no external action starts.
                    </p>
                  </div>
                  <Button
                    className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                    disabled={evaluateCurrentDemand.isPending}
                    onClick={() => evaluateCurrentDemand.mutate()}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {evaluateCurrentDemand.isPending ? "Evaluating demand..." : "Evaluate current demand"}
                  </Button>
                </div>
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="registry" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Registry</CardTitle>
              <CardDescription>Search and manage tenant agents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by name, role, pitch..." className="bg-gray-950 border-gray-800 text-white" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-gray-950 border-gray-800 text-white"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="bg-gray-950 border-gray-800 text-white"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                {agentsQuery.isLoading ? (
                  <div className="text-sm text-gray-400 border border-gray-800 rounded-lg p-4">Loading agents...</div>
                ) : null}
                {(agentsQuery.data?.items || []).map((item) => {
                  const runtimeAgentId = Number(item.runtime_agent_id || 0);
                  const avatarUrl = String(item.avatar_url || "").trim() || getAgentAvatarUrl({
                    id: runtimeAgentId || item.id,
                    name: item.display_name,
                    label: item.display_name,
                    size: 96,
                  });

                  return (
                  <div key={item.id} className="border border-slate-200 rounded-lg p-3 bg-white flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between shadow-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <img
                        src={avatarUrl}
                        alt={`${item.display_name} profile`}
                        loading="lazy"
                        className="h-12 w-12 shrink-0 rounded-full border border-slate-200 bg-slate-100 object-cover"
                      />
                      <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-slate-950 truncate">{item.display_name}</div>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700">{item.status}</Badge>
                        {item.marketplace_visible ? <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">visible</Badge> : null}
                      </div>
                      <div className="text-xs text-slate-600 truncate">{item.role_title} | {item.category}</div>
                      {item.short_pitch ? <div className="text-xs text-slate-500 mt-1 line-clamp-2">{item.short_pitch}</div> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      {runtimeAgentId > 0 ? (
                        <Button
                          size="sm"
                          className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                          onClick={() => setLocation(`/operations/agents/${runtimeAgentId}?edit=1`)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />Edit identity &amp; face
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="agents-os-secondary-action"
                        onClick={() => setLocation(runtimeAgentId > 0 ? `/operations/agents/${runtimeAgentId}` : `/agents-os/agents/${item.id}`)}
                      >
                        <Bot className="h-3.5 w-3.5 mr-1" />
                        {runtimeAgentId > 0 ? "Open workspace" : "Edit listing"}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="agents-os-secondary-action h-9 w-9 px-0"
                            aria-label={`More actions for ${item.display_name}`}
                            title={`More actions for ${item.display_name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-52 border-slate-200 bg-white text-slate-800 shadow-lg">
                          {runtimeAgentId > 0 ? (
                            <DropdownMenuItem onSelect={() => setLocation(`/operations/agents/${runtimeAgentId}?tab=memory`)}>
                              <BrainCircuit className="h-4 w-4 mr-2" />Memory &amp; context
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onSelect={() => snapshotAgent.mutate(item.id)}>
                            <Settings2 className="h-4 w-4 mr-2" />Save configuration snapshot
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => cloneAgent.mutate(item.id)}>
                            <CopyPlus className="h-4 w-4 mr-2" />Clone agent
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {item.status === "active" ? (
                            <DropdownMenuItem className="text-amber-800 focus:text-amber-900" onSelect={() => setAgentStatus.mutate({ id: item.id, action: "retire" })}>
                              Retire agent
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="text-emerald-700 focus:text-emerald-800" onSelect={() => setAgentStatus.mutate({ id: item.id, action: "activate" })}>
                              Activate agent
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  );
                })}
                {!agentsQuery.data?.items?.length ? (
                  <div className="text-sm text-gray-400 border border-gray-800 rounded-lg p-4 space-y-3">
                    <div>No agents found for this tenant.</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="agents-os-secondary-action"
                        disabled={importRuntimeAgents.isPending}
                        onClick={() => importRuntimeAgents.mutate()}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Import runtime agents
                      </Button>
                      <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black" disabled={seedAgents.isPending} onClick={() => seedAgents.mutate()}>
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Generate agents
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="studio" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Studio (Create / Clone)</CardTitle>
              <CardDescription>Create new agents and clone from existing ones.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Display name</Label><Input value={createDisplayName} onChange={(event) => setCreateDisplayName(event.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
                <div className="space-y-1"><Label>Role title</Label><Input value={createRoleTitle} onChange={(event) => setCreateRoleTitle(event.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={createCategory} onValueChange={setCreateCategory}>
                    <SelectTrigger className="bg-gray-950 border-gray-800 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      <SelectItem value="operations">operations</SelectItem>
                      <SelectItem value="compliance">compliance</SelectItem>
                      <SelectItem value="marketing">marketing</SelectItem>
                      <SelectItem value="finance">finance</SelectItem>
                      <SelectItem value="support">support</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Price / month</Label><Input value={createPrice} onChange={(event) => setCreatePrice(event.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
              </div>
              <div className="space-y-1"><Label>Short pitch</Label><Textarea value={createShortPitch} onChange={(event) => setCreateShortPitch(event.target.value)} className="bg-gray-950 border-gray-800 text-white min-h-16" /></div>
              <div className="space-y-1"><Label>Long description</Label><Textarea value={createLongDescription} onChange={(event) => setCreateLongDescription(event.target.value)} className="bg-gray-950 border-gray-800 text-white min-h-24" /></div>
              <Button className="bg-amber-500 hover:bg-amber-600 text-black" disabled={createAgent.isPending || !createDisplayName.trim()} onClick={() => createAgent.mutate()}>
                <Plus className="h-4 w-4 mr-2" />Create agent
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Knowledge Base</CardTitle>
              <CardDescription>Knowledge assignment is controlled per agent record.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {agentsQuery.isLoading ? <div className="text-sm text-gray-400">Loading knowledge targets...</div> : null}
              {(agentsQuery.data?.items || []).map((item) => (
                <div key={item.id} className="p-3 border border-gray-800 rounded-lg bg-gray-950/40 text-sm flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white truncate">{item.display_name}</div>
                    <div className="text-xs text-gray-400 truncate">{item.role_title}</div>
                  </div>
                  <Button size="sm" variant="outline" className="agents-os-secondary-action" onClick={() => snapshotAgent.mutate(item.id)}>
                    Snapshot config
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketplace" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Marketplace</CardTitle>
              <CardDescription>Chairman/Super Admin control publish visibility and pricing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {marketplaceQuery.isLoading ? <div className="text-sm text-gray-400">Loading marketplace agents...</div> : null}
              {(marketplaceQuery.data?.items || agentsQuery.data?.items || []).map((item) => (
                <div key={item.id} className="p-3 border border-gray-800 rounded-lg bg-gray-950/40 grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                  <div className="md:col-span-2 min-w-0">
                    <div className="text-white text-sm truncate">{item.display_name}</div>
                    <div className="text-xs text-gray-400 truncate">{item.category}</div>
                  </div>
                  <div className="text-xs text-gray-300">Price: {fmtMoney(item.price_monthly)} {item.currency || "USD"}</div>
                  <div className="text-xs text-gray-300">Availability: {item.availability || "available"}</div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={Boolean(item.marketplace_visible ?? (item as any).is_visible)}
                      onCheckedChange={(checked) =>
                        setMarketplace.mutate({
                          id: item.id,
                          isVisible: checked,
                          priceMonthly: Number(item.price_monthly || 0),
                          currency: String(item.currency || "USD"),
                          isFeatured: Boolean(item.is_featured),
                          availability: String(item.availability || "available"),
                          sortRank: Number(item.sort_rank || 0),
                        })
                      }
                    />
                    <span className="text-xs text-gray-300">{Boolean(item.marketplace_visible ?? (item as any).is_visible) ? "Visible" : "Hidden"}</span>
                  </div>
                  <div className="text-right">
                    <Button
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-black"
                      onClick={() =>
                        setMarketplace.mutate({
                          id: item.id,
                          isVisible: true,
                          priceMonthly: Number(item.price_monthly || 0),
                          currency: String(item.currency || "USD"),
                          isFeatured: true,
                          availability: String(item.availability || "available"),
                          sortRank: 0,
                        })
                      }
                    >
                      Feature
                    </Button>
                  </div>
                </div>
              ))}
              {!agentsQuery.data?.items?.length ? <div className="text-sm text-gray-400">No agents to publish.</div> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader><CardTitle className="text-white">Analytics</CardTitle><CardDescription>Live catalog health and publishing coverage.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-950/40">
                <div className="text-xs text-gray-400">Catalog coverage</div>
                <div className="text-lg text-white font-semibold">
                  {summaryQuery.data?.summary.totalAgents ? Math.round(((summaryQuery.data?.summary.marketplaceVisible || 0) / Math.max(1, summaryQuery.data.summary.totalAgents)) * 100) : 0}%
                </div>
              </div>
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-950/40">
                <div className="text-xs text-gray-400">Draft backlog</div>
                <div className="text-lg text-white font-semibold">{summaryQuery.data?.summary.draftAgents || 0}</div>
              </div>
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-950/40">
                <div className="text-xs text-gray-400">Featured opportunities</div>
                <div className="text-lg text-white font-semibold">{(marketplaceQuery.data?.items || []).filter((x) => Boolean(x.is_featured)).length}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="governance" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2"><Network className="h-4 w-4" />Governance (Hierarchy)</CardTitle>
              <CardDescription>Hierarchy tools are managed from this section.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded border border-gray-800 bg-gray-950/40 p-2 text-xs text-gray-300">
                  <div className="text-gray-500">Total</div>
                  <div className="text-white text-lg font-semibold">{governanceQuery.data?.total ?? 0}</div>
                </div>
                <div className="rounded border border-gray-800 bg-gray-950/40 p-2 text-xs text-gray-300">
                  <div className="text-gray-500">Roots</div>
                  <div className="text-white text-lg font-semibold">{governanceQuery.data?.roots ?? 0}</div>
                </div>
                <div className="rounded border border-gray-800 bg-gray-950/40 p-2 text-xs text-gray-300">
                  <div className="text-gray-500">Orphans</div>
                  <div className="text-white text-lg font-semibold">{governanceQuery.data?.orphans ?? 0}</div>
                </div>
              </div>
              {governanceQuery.isLoading ? (
                <div className="text-sm text-gray-400">Loading hierarchy...</div>
              ) : governanceQuery.data?.nodes?.length ? (
                <div className="space-y-2">
                  {governanceQuery.data.nodes.map((node) => (
                    <div key={node.id} className="p-3 border border-gray-800 rounded-lg bg-gray-950/40">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm text-white font-medium">{node.displayName}</div>
                        <Badge variant="secondary" className="bg-gray-800 text-gray-100">{node.status}</Badge>
                        {node.isDepartmentHead ? <Badge className="bg-emerald-600/20 text-emerald-200 border border-emerald-500/40">department head</Badge> : null}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{node.roleTitle} • {node.category}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Manager: {node.managerName || "Unassigned"}{node.runtimeAgentId ? ` • runtime #${node.runtimeAgentId}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400 border border-gray-800 rounded-lg p-3">No hierarchy data found.</div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" className="agents-os-secondary-action" onClick={() => importRuntimeAgents.mutate()} disabled={importRuntimeAgents.isPending}>
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Refresh from runtime agents
                </Button>
                <Button variant="outline" className="agents-os-secondary-action" onClick={() => setLocation("/admin/agents/governance")}>
                  Open Governance Workspace
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(editingRoleSeat)} onOpenChange={(open) => !open && setEditingRoleSeat(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-200 bg-white text-slate-950">
          <DialogHeader>
            <DialogTitle>Edit role seat</DialogTitle>
            <DialogDescription>
              Update the role blueprint. Immutable seat identity, department ownership, runtime state, and production permissions remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="role-seat-name">Display name</Label>
              <Input
                id="role-seat-name"
                value={roleSeatDraft.displayName}
                onChange={(event) => setRoleSeatDraft((current) => ({ ...current, displayName: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-seat-title">Role title</Label>
              <Input
                id="role-seat-title"
                value={roleSeatDraft.roleTitle}
                onChange={(event) => setRoleSeatDraft((current) => ({ ...current, roleTitle: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="role-seat-avatar">Portrait URL</Label>
              <Input
                id="role-seat-avatar"
                value={roleSeatDraft.avatarUrl}
                onChange={(event) => setRoleSeatDraft((current) => ({ ...current, avatarUrl: event.target.value }))}
                placeholder="https://..."
              />
              <p className="text-xs text-slate-500">After provisioning, use the existing identity editor to upload or generate a professional face.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="role-seat-description">Mission and scope</Label>
              <Textarea
                id="role-seat-description"
                value={roleSeatDraft.description}
                onChange={(event) => setRoleSeatDraft((current) => ({ ...current, description: event.target.value }))}
                className="min-h-24"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-seat-languages">Languages</Label>
              <Input
                id="role-seat-languages"
                value={roleSeatDraft.languages}
                onChange={(event) => setRoleSeatDraft((current) => ({ ...current, languages: event.target.value }))}
                placeholder="English, French"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-seat-authority">Decision authority</Label>
              <Select
                value={roleSeatDraft.decisionAuthority}
                onValueChange={(value) => setRoleSeatDraft((current) => ({ ...current, decisionAuthority: value }))}
              >
                <SelectTrigger id="role-seat-authority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="executive">Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-seat-geographies">Territories</Label>
              <Input
                id="role-seat-geographies"
                value={roleSeatDraft.geographies}
                onChange={(event) => setRoleSeatDraft((current) => ({ ...current, geographies: event.target.value }))}
                placeholder="Global, West Africa, UAE"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-seat-sectors">Sectors</Label>
              <Input
                id="role-seat-sectors"
                value={roleSeatDraft.sectors}
                onChange={(event) => setRoleSeatDraft((current) => ({ ...current, sectors: event.target.value }))}
                placeholder="Machinery, Mining, Agro-processing"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRoleSeat(null)}>Cancel</Button>
            <Button
              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
              disabled={updateRoleSeat.isPending || !roleSeatDraft.displayName.trim() || !roleSeatDraft.roleTitle.trim()}
              onClick={() => updateRoleSeat.mutate()}
            >
              Save role seat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reconciliationOpen} onOpenChange={setReconciliationOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-slate-200 bg-white text-slate-950">
          <DialogHeader>
            <DialogTitle>Reconcile the current team</DialogTitle>
            <DialogDescription>
              These links use immutable organization keys, not names. Applying them only connects existing employee records to role seats; it does not create agents, enable tools, change status, or start external work.
            </DialogDescription>
          </DialogHeader>

          {coreTeamReconciliationQuery.isLoading ? (
            <div className="py-6 text-sm text-slate-600">Reviewing current employee identities...</div>
          ) : coreTeamReconciliationQuery.isError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              The reconciliation preview could not be loaded.
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-center">
                {[
                  ["Ready", coreTeamReconciliationQuery.data?.summary.ready ?? 0],
                  ["Already linked", coreTeamReconciliationQuery.data?.summary.linked ?? 0],
                  ["Blocked", coreTeamReconciliationQuery.data?.summary.blocked ?? 0],
                ].map(([label, value]) => (
                  <div key={String(label)} className="bg-white px-3 py-3">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
                  </div>
                ))}
              </div>

              <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {(coreTeamReconciliationQuery.data?.items || []).map((item) => {
                  const isBlocked = !["ready", "already_linked"].includes(item.status);
                  return (
                    <div key={item.organizationKey} className="p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-slate-950">
                              {item.employee?.displayName || item.organizationKey}
                            </div>
                            <Badge variant="outline" className={
                              item.status === "already_linked"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : isBlocked
                                  ? "border-rose-200 bg-rose-50 text-rose-800"
                                  : "border-amber-200 bg-amber-50 text-amber-800"
                            }>
                              {item.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            {item.employee?.role || "Employee unavailable"} <span className="mx-1 text-slate-300">→</span> {item.roleSeat.roleTitle}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{item.blockingReason || item.rationale}</p>
                        </div>
                        {item.employee ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="agents-os-secondary-action shrink-0"
                            onClick={() => setLocation(`/operations/agents/${item.employee!.id}?edit=1`)}
                          >
                            Review employee
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Applying this preview writes one auditable organization-link event. It does not send messages, spend money, modify employee permissions, or activate dormant capacity.
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReconciliationOpen(false)}>Cancel</Button>
            <Button
              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
              disabled={
                reconcileCoreTeam.isPending ||
                !coreTeamReconciliationQuery.data?.summary.ready ||
                Boolean(coreTeamReconciliationQuery.data?.summary.blocked)
              }
              onClick={() => reconcileCoreTeam.mutate()}
            >
              <Link2 className="mr-2 h-4 w-4" />
              Confirm and link {coreTeamReconciliationQuery.data?.summary.ready || 0}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(workforceReviewRequest)}
        onOpenChange={(open) => {
          if (!open && !reviewWorkforceRequest.isPending) {
            setWorkforceReviewRequest(null);
            setWorkforceReviewNote("");
          }
        }}
      >
        <DialogContent className="max-w-xl border-slate-200 bg-white text-slate-950">
          <DialogHeader>
            <DialogTitle>
              {workforceReviewDecision === "approve" ? "Review staffing need" : "Reject staffing need"}
            </DialogTitle>
            <DialogDescription>
              Record the evidence-based reason for this decision. The review is written to both the staffing audit and Company Brain.
            </DialogDescription>
          </DialogHeader>
          {workforceReviewRequest ? (
            <div className="space-y-4 py-2">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-semibold text-slate-950">{workforceReviewRequest.role_title}</div>
                <div className="mt-1 text-slate-600">{workforceReviewRequest.reason}</div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>Demand: {workforceReviewRequest.demand_count} / {workforceReviewRequest.demand_threshold}</span>
                  <span>Department: {workforceReviewRequest.department_key}</span>
                  <span>Company Brain: {workforceReviewRequest.governance_status || "pending refresh"}</span>
                </div>
              </div>
              {workforceReviewDecision === "approve" ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                  Approval assembles a fresh Company Brain context pack and checks its citations, conflicts, and open questions. It authorizes only a private role blueprint. No employee is created, activated, or allowed to contact anyone.
                </div>
              ) : (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                  Rejection closes this proposal without changing existing employees, role seats, tasks, or communications.
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="workforce-review-note">Decision rationale</Label>
                <Textarea
                  id="workforce-review-note"
                  value={workforceReviewNote}
                  onChange={(event) => setWorkforceReviewNote(event.target.value.slice(0, 1200))}
                  placeholder={
                    workforceReviewDecision === "approve"
                      ? "Explain why current demand justifies this role and what evidence you reviewed."
                      : "Explain why this role should not be created from the current evidence."
                  }
                  className="min-h-28 border-slate-300 bg-white text-slate-950"
                  autoFocus
                />
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Minimum 12 characters</span>
                  <span>{workforceReviewNote.trim().length} / 1200</span>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWorkforceReviewRequest(null);
                setWorkforceReviewNote("");
              }}
              disabled={reviewWorkforceRequest.isPending}
            >
              Cancel
            </Button>
            <Button
              className={
                workforceReviewDecision === "approve"
                  ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                  : "bg-rose-700 text-white hover:bg-rose-600"
              }
              disabled={
                reviewWorkforceRequest.isPending ||
                !workforceReviewRequest ||
                workforceReviewNote.trim().length < 12
              }
              onClick={() => workforceReviewRequest && reviewWorkforceRequest.mutate({
                id: workforceReviewRequest.id,
                decision: workforceReviewDecision,
                reviewNote: workforceReviewNote.trim(),
              })}
            >
              {reviewWorkforceRequest.isPending
                ? "Recording decision..."
                : workforceReviewDecision === "approve"
                  ? "Approve role blueprint"
                  : "Reject staffing need"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activationRequest)} onOpenChange={(open) => !open && setActivationRequest(null)}>
        <DialogContent className="max-w-lg border-slate-200 bg-white text-slate-950">
          <DialogHeader>
            <DialogTitle>{activationRequest?.status === "paused" ? "Reactivate employee" : "Activate employee"}</DialogTitle>
            <DialogDescription>
              Confirm that this profile, reporting line, and budget are ready for event-driven internal work.
            </DialogDescription>
          </DialogHeader>
          {activationRequest ? (
            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="font-semibold text-slate-950">{activationRequest.runtime_display_name || activationRequest.role_title}</div>
                <div className="mt-1 text-slate-600">{activationRequest.role_title}</div>
                <div className="mt-2 grid gap-1 text-xs text-slate-500">
                  <span>Manager: {activationRequest.manager_display_name || "Not assigned"}</span>
                  <span>Demand evidence: {activationRequest.demand_count} of {activationRequest.demand_threshold}</span>
                  <span>Department: {activationRequest.department_key}</span>
                </div>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">
                Activation enables internal production routing only. Email, WhatsApp, calls, payments, contracts, public claims, and background conversations remain disabled or approval-gated.
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivationRequest(null)}>Cancel</Button>
            <Button
              className="bg-emerald-700 text-white hover:bg-emerald-600"
              disabled={updateEmployeeLifecycle.isPending || !activationRequest?.manager_id}
              onClick={() => activationRequest && updateEmployeeLifecycle.mutate({ id: activationRequest.id, action: "activate" })}
            >
              Confirm activation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="text-xs text-gray-500">{location.includes("admin/agents-os") ? "" : ""}</div>
    </div>
  );
}
