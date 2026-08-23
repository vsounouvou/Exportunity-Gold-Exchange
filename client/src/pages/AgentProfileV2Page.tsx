
import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, BrainCircuit, Pencil, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAgentAvatarUrl } from "@/lib/agentAvatar";
import { AgentProfileDialog } from "@/components/AgentProfileDialog";
import type { Agent } from "@db/schema";

type AgentProfilePayload = {
  ok: boolean;
  overview: any;
  performance: {
    total: number;
    successCount: number;
    failedCount: number;
    noEffectCount: number;
  };
  activity: {
    actionRuns: any[];
    meetings: any[];
    tasks: any[];
    workstations: any[];
  };
  managerOfPages: any[];
};

type AgentMemoryItem = {
  id: number;
  type: string;
  content: string;
  tags: string[];
  confidence: number;
  pinned: boolean;
  updated_at: string | null;
  is_active: boolean;
};

type AgentSkillsPayload = { ok: boolean; skills: string[] };
type SkillCategoryItem = { key: string; label: string; skills: string[] };
type MemoryTemplateItem = { key: string; label: string; type: string; tags: string[]; content: string };
type AgentHistoryItem = {
  id: number;
  entry_type: "TEST" | "CHAT";
  session_id: string | null;
  prompt: string;
  response: string | null;
  analysis: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};
type AgentChatSessionItem = {
  session_id: string;
  title: string | null;
  archived: boolean;
  entry_count: number;
  last_message_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function parseCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const agentProfileTabClass =
  "shrink-0 rounded-none border-b-2 border-transparent px-3 py-3 text-xs text-slate-500 data-[state=active]:border-[#f5a623] data-[state=active]:bg-transparent data-[state=active]:text-slate-950 sm:px-4 sm:text-sm";

function normalizeOverviewAgent(record: any): Agent | null {
  if (!record || typeof record !== "object") return null;
  const id = Number(record.id || 0);
  if (!Number.isInteger(id) || id <= 0) return null;

  const status = String(record.status || record.statusV2 || "active").toLowerCase();
  return {
    ...record,
    id,
    tenantId: record.tenantId ?? record.tenant_id ?? null,
    companyId: record.companyId ?? record.company_id ?? null,
    departmentId: record.departmentId ?? record.department_id ?? null,
    managerId: record.managerId ?? record.manager_id ?? null,
    isDepartmentHead: Boolean(record.isDepartmentHead ?? record.is_department_head),
    displayName: record.displayName ?? record.display_name ?? null,
    avatarUrl: record.avatarUrl ?? record.avatar_url ?? null,
    photoAssetId: record.photoAssetId ?? record.photo_asset_id ?? null,
    photoPrompt: record.photoPrompt ?? record.photo_prompt ?? null,
    photoLocked: Boolean(record.photoLocked ?? record.photo_locked),
    industryFocus: Array.isArray(record.industryFocus)
      ? record.industryFocus
      : Array.isArray(record.industry_focus)
        ? record.industry_focus
        : [],
    autonomyLevel: record.autonomyLevel ?? record.autonomy_level ?? "partial",
    hiredDate: record.hiredDate ?? record.hired_date ?? null,
    promotedDate: record.promotedDate ?? record.promoted_date ?? null,
    status: ["active", "inactive", "paused", "archived"].includes(status) ? status : "active",
    name: String(record.name || "Agent"),
    role: String(record.role || "Operations Agent"),
  } as Agent;
}

export default function AgentProfileV2Page() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [, operationsParams] = useRoute("/operations/agents/:agentId");
  const [, marketplaceParams] = useRoute("/commerce/ai-marketplace/agents/:agentId");
  const isMarketplace = Boolean((marketplaceParams as any)?.agentId);
  const agentId = Number((operationsParams as any)?.agentId || (marketplaceParams as any)?.agentId || 0);
  const backHref = isMarketplace ? "/commerce/ai-marketplace/agents" : "/operations/agents";
  const [editOpen, setEditOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("edit") === "1";
  });
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "activity";
    return new URLSearchParams(window.location.search).get("tab") || "activity";
  });

  const updateProfileLocation = (updates: { tab?: string; edit?: boolean }) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (updates.tab) params.set("tab", updates.tab);
    if (updates.edit === true) params.set("edit", "1");
    if (updates.edit === false) params.delete("edit");
    const search = params.toString();
    setLocation(`${window.location.pathname}${search ? `?${search}` : ""}`);
  };

  const selectProfileTab = (tab: string) => {
    setActiveTab(tab);
    updateProfileLocation({ tab, edit: false });
  };

  const setProfileEditorOpen = (open: boolean) => {
    setEditOpen(open);
    updateProfileLocation({ edit: open });
  };

  const profileQuery = useQuery<AgentProfilePayload>({
    queryKey: agentId ? [`/api/v2/agents/${agentId}/profile`] : ["__no_agent_profile_v2__"],
    enabled: Number.isFinite(agentId) && agentId > 0,
    staleTime: 10_000,
    retry: false,
  });

  const overview = profileQuery.data?.overview || null;
  const editableAgent = useMemo(() => normalizeOverviewAgent(overview), [overview]);
  const avatarUrl = editableAgent
    ? String(editableAgent.avatarUrl || editableAgent.avatar || "") ||
      getAgentAvatarUrl({ id: editableAgent.id, name: editableAgent.name, label: editableAgent.name, size: 192 })
    : "";
  const performance = profileQuery.data?.performance || { total: 0, successCount: 0, failedCount: 0, noEffectCount: 0 };
  const activity = profileQuery.data?.activity || { actionRuns: [], meetings: [], tasks: [], workstations: [] };

  const [runtimeModel, setRuntimeModel] = useState("");
  const [toolsEnabled, setToolsEnabled] = useState("");
  const [modelProvider, setModelProvider] = useState("");
  const [temperature, setTemperature] = useState("");
  const [hardMode, setHardMode] = useState(false);

  const [skillInput, setSkillInput] = useState("");
  const [selectedSkillCategory, setSelectedSkillCategory] = useState("");
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryType, setMemoryType] = useState("operations");
  const [memoryTags, setMemoryTags] = useState("");
  const [selectedMemoryTemplate, setSelectedMemoryTemplate] = useState("");
  const [testPrompt, setTestPrompt] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatSessionId, setChatSessionId] = useState("");
  const [includeArchivedSessions, setIncludeArchivedSessions] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<number | null>(null);
  const [memoryEditContent, setMemoryEditContent] = useState("");
  const [memoryEditType, setMemoryEditType] = useState("note");
  const [memoryEditTags, setMemoryEditTags] = useState("");
  const [editingSessionId, setEditingSessionId] = useState("");
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");

  const memoryEndpoint = agentId ? `/api/v2/agents/${agentId}/memory?includeInactive=true` : "";
  const skillsEndpoint = agentId ? `/api/v2/agents/${agentId}/skills` : "";
  const skillCatalogEndpoint = "/api/v2/agents/catalog/skills";
  const memoryTemplatesEndpoint = "/api/v2/agents/catalog/memory-templates";
  const testHistoryEndpoint = agentId ? `/api/v2/agents/${agentId}/history?type=TEST&limit=30&includeMetadata=true` : "";
  const chatHistoryEndpoint = agentId ? `/api/v2/agents/${agentId}/history?type=CHAT&limit=160&includeMetadata=true` : "";
  const chatSessionsEndpoint = agentId
    ? `/api/v2/agents/${agentId}/chat-sessions?limit=200${includeArchivedSessions ? "&includeArchived=true" : ""}`
    : "";

  const memoryQuery = useQuery<{ ok: boolean; items: AgentMemoryItem[] }>({
    queryKey: memoryEndpoint ? [memoryEndpoint] : ["__no_agent_memory_v2__"],
    enabled: Boolean(memoryEndpoint),
    staleTime: 8_000,
    retry: false,
  });

  const skillsQuery = useQuery<AgentSkillsPayload>({
    queryKey: skillsEndpoint ? [skillsEndpoint] : ["__no_agent_skills_v2__"],
    enabled: Boolean(skillsEndpoint),
    staleTime: 8_000,
    retry: false,
  });

  const skillCatalogQuery = useQuery<{ ok: boolean; items: SkillCategoryItem[] }>({
    queryKey: [skillCatalogEndpoint],
    staleTime: 60_000,
    retry: false,
  });

  const memoryTemplatesQuery = useQuery<{ ok: boolean; items: MemoryTemplateItem[] }>({
    queryKey: [memoryTemplatesEndpoint],
    staleTime: 60_000,
    retry: false,
  });

  const testHistoryQuery = useQuery<{ ok: boolean; items: AgentHistoryItem[] }>({
    queryKey: testHistoryEndpoint ? [testHistoryEndpoint] : ["__no_agent_test_history_v2__"],
    enabled: Boolean(testHistoryEndpoint),
    staleTime: 8_000,
    retry: false,
  });

  const chatHistoryQuery = useQuery<{ ok: boolean; items: AgentHistoryItem[] }>({
    queryKey: chatHistoryEndpoint ? [chatHistoryEndpoint] : ["__no_agent_chat_history_v2__"],
    enabled: Boolean(chatHistoryEndpoint),
    staleTime: 4_000,
    retry: false,
  });
  const chatSessionsQuery = useQuery<{ ok: boolean; items: AgentChatSessionItem[] }>({
    queryKey: chatSessionsEndpoint ? [chatSessionsEndpoint] : ["__no_agent_chat_sessions_v2__"],
    enabled: Boolean(chatSessionsEndpoint),
    staleTime: 4_000,
    retry: false,
  });

  const skillCategories = skillCatalogQuery.data?.items || [];
  const memoryTemplates = memoryTemplatesQuery.data?.items || [];
  const testHistoryItems = testHistoryQuery.data?.items || [];
  const chatHistoryItemsDesc = chatHistoryQuery.data?.items || [];
  const activeSkillCategory = useMemo(
    () => skillCategories.find((item) => item.key === selectedSkillCategory) || null,
    [skillCategories, selectedSkillCategory],
  );
  const derivedChatSessions = useMemo(() => {
    const map = new Map<string, { id: string; count: number; latestAt: string }>();
    for (const row of chatHistoryItemsDesc) {
      const session = String(row.session_id || "").trim();
      if (!session) continue;
      const existing = map.get(session);
      if (!existing) {
        map.set(session, { id: session, count: 1, latestAt: row.created_at });
      } else {
        existing.count += 1;
      }
    }
    return Array.from(map.values())
      .map((row) => ({
        session_id: row.id,
        title: `Thread ${row.id.slice(0, 8)}`,
        archived: false,
        entry_count: row.count,
        last_message_at: row.latestAt,
      }))
      .sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
  }, [chatHistoryItemsDesc]);
  const chatSessions = useMemo(() => {
    const map = new Map<string, AgentChatSessionItem>();
    for (const row of derivedChatSessions) {
      map.set(row.session_id, row);
    }
    for (const row of chatSessionsQuery.data?.items || []) {
      const id = String(row.session_id || "").trim();
      if (!id) continue;
      const existing = map.get(id);
      map.set(id, {
        session_id: id,
        title: String(row.title || "").trim() || existing?.title || `Thread ${id.slice(0, 8)}`,
        archived: Boolean(row.archived),
        entry_count: Number(row.entry_count || existing?.entry_count || 0),
        last_message_at: row.last_message_at || existing?.last_message_at || null,
        created_at: row.created_at || existing?.created_at || null,
        updated_at: row.updated_at || existing?.updated_at || null,
      });
    }
    return Array.from(map.values()).sort((a, b) => {
      const aTs = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTs = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTs - aTs;
    });
  }, [derivedChatSessions, chatSessionsQuery.data?.items]);

  const activeChatEntries = useMemo(() => {
    if (!chatSessionId) return [] as AgentHistoryItem[];
    return [...chatHistoryItemsDesc]
      .filter((row) => String(row.session_id || "") === chatSessionId)
      .reverse();
  }, [chatHistoryItemsDesc, chatSessionId]);

  const activeChatMessages = useMemo(() => {
    const messages: Array<{ role: "user" | "assistant"; content: string; at: string }> = [];
    for (const row of activeChatEntries) {
      const userPrompt = String(row.prompt || "").trim();
      const assistantReply = String(row.response || "").trim();
      if (userPrompt) messages.push({ role: "user", content: userPrompt, at: row.created_at });
      if (assistantReply) messages.push({ role: "assistant", content: assistantReply, at: row.created_at });
    }
    return messages;
  }, [activeChatEntries]);

  useEffect(() => {
    if (!overview) return;
    setRuntimeModel(overview.runtime_model || "");
    setToolsEnabled(Array.isArray(overview.toolsEnabled) ? overview.toolsEnabled.join(",") : "");
    setModelProvider(String(overview?.metadata?.modelProvider || ""));
    setTemperature(
      overview?.metadata?.temperature == null || Number.isNaN(Number(overview?.metadata?.temperature))
        ? ""
        : String(overview.metadata.temperature),
    );
    setHardMode(Boolean(overview?.metadata?.hardMode));
    setSkillInput("");
    setSelectedSkillCategory("");
    setTestResult(null);
    setChatInput("");
    setChatSessionId("");
    setIncludeArchivedSessions(false);
    setEditingMemoryId(null);
    setMemoryEditContent("");
    setMemoryEditType("note");
    setMemoryEditTags("");
    setEditingSessionId("");
    setSessionTitleDraft("");
    setMemoryContent("");
    setMemoryTags("");
    setMemoryType("operations");
    setSelectedMemoryTemplate("");
  }, [overview?.id]);

  useEffect(() => {
    const searchParams = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    setEditOpen(searchParams.get("edit") === "1");
    const requestedTab = searchParams.get("tab");
    if (requestedTab) setActiveTab(requestedTab);
  }, [location]);

  useEffect(() => {
    if (!selectedSkillCategory && skillCategories.length > 0) {
      setSelectedSkillCategory(skillCategories[0].key);
    }
  }, [selectedSkillCategory, skillCategories]);

  useEffect(() => {
    if (chatSessionId) return;
    const latest = chatSessions[0];
    if (latest?.session_id) setChatSessionId(latest.session_id);
  }, [chatSessions, chatSessionId]);

  const refreshProfile = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/v2/agents/${agentId}/profile`] });
    if (memoryEndpoint) queryClient.invalidateQueries({ queryKey: [memoryEndpoint] });
    if (skillsEndpoint) queryClient.invalidateQueries({ queryKey: [skillsEndpoint] });
    if (testHistoryEndpoint) queryClient.invalidateQueries({ queryKey: [testHistoryEndpoint] });
    if (chatHistoryEndpoint) queryClient.invalidateQueries({ queryKey: [chatHistoryEndpoint] });
    if (chatSessionsEndpoint) queryClient.invalidateQueries({ queryKey: [chatSessionsEndpoint] });
  };

  const modelMutation = useMutation({
    mutationFn: async () => {
      const tools = parseCsv(toolsEnabled);
      const numericTemperature = Number.parseFloat(temperature);
      return apiRequest(`/api/v2/agents/${agentId}/runtime-model`, "PATCH", {
        runtimeModel: runtimeModel.trim() || overview?.runtime_model || "",
        toolsEnabled: tools,
        modelProvider: modelProvider.trim() || null,
        temperature: Number.isFinite(numericTemperature) ? numericTemperature : null,
        hardMode,
      });
    },
    onSuccess: () => {
      toast({ title: "Agent config updated", description: "Runtime model/tools change has been saved." });
      refreshProfile();
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error?.message || "Could not update runtime model", variant: "destructive" });
    },
  });

  const skillsMutation = useMutation({
    mutationFn: async (payload: { action: "add" | "remove" | "set"; skill?: string; skills?: string[] }) =>
      apiRequest(`/api/v2/agents/${agentId}/skills`, "PATCH", payload),
    onSuccess: () => {
      setSkillInput("");
      refreshProfile();
    },
    onError: (error: any) => {
      toast({ title: "Skills update failed", description: error?.message || "Failed to update skills", variant: "destructive" });
    },
  });

  const createMemoryMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/v2/agents/${agentId}/memory`, "POST", {
        content: memoryContent,
        category: memoryType,
        tags: parseCsv(memoryTags),
        source: selectedMemoryTemplate ? `template:${selectedMemoryTemplate}` : "manual_profile_entry",
      }),
    onSuccess: () => {
      setMemoryContent("");
      setMemoryTags("");
      setSelectedMemoryTemplate("");
      refreshProfile();
      toast({ title: "Memory added", description: "New memory entry saved for this agent." });
    },
    onError: (error: any) => {
      toast({ title: "Memory create failed", description: error?.message || "Failed to add memory", variant: "destructive" });
    },
  });

  const updateMemoryMutation = useMutation({
    mutationFn: async (payload: {
      memoryId: number;
      active?: boolean;
      pinned?: boolean;
      content?: string;
      type?: string;
      tags?: string[];
      confidence?: number;
    }) =>
      apiRequest(`/api/v2/agents/${agentId}/memory/${payload.memoryId}`, "PATCH", payload),
    onSuccess: (_data, payload) => {
      if (editingMemoryId === payload.memoryId) {
        setEditingMemoryId(null);
        setMemoryEditContent("");
        setMemoryEditType("note");
        setMemoryEditTags("");
      }
      refreshProfile();
    },
    onError: (error: any) => {
      toast({ title: "Memory update failed", description: error?.message || "Failed to update memory", variant: "destructive" });
    },
  });
  const deleteMemoryMutation = useMutation({
    mutationFn: async (memoryId: number) => apiRequest(`/api/v2/agents/${agentId}/memory/${memoryId}`, "DELETE"),
    onSuccess: (_data, memoryId) => {
      if (editingMemoryId === memoryId) {
        setEditingMemoryId(null);
        setMemoryEditContent("");
        setMemoryEditType("note");
        setMemoryEditTags("");
      }
      refreshProfile();
      toast({ title: "Memory deleted", description: `Entry #${memoryId} removed.` });
    },
    onError: (error: any) => {
      toast({ title: "Memory delete failed", description: error?.message || "Failed to delete memory", variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/v2/agents/${agentId}/test`, "POST", {
        prompt: testPrompt,
      }),
    onSuccess: (data: any) => {
      setTestResult(data?.result || null);
      if (testHistoryEndpoint) queryClient.invalidateQueries({ queryKey: [testHistoryEndpoint] });
    },
    onError: (error: any) => {
      toast({ title: "Test failed", description: error?.message || "Could not run ability test", variant: "destructive" });
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const promptHistory = activeChatMessages.slice(-20).map((item) => ({
        role: item.role,
        content: item.content,
      }));
      return apiRequest(`/api/v2/agents/${agentId}/chat`, "POST", {
        message,
        sessionId: chatSessionId || undefined,
        history: promptHistory,
      });
    },
    onSuccess: (data: any) => {
      if (String(data?.sessionId || "").trim()) {
        setChatSessionId(String(data.sessionId));
      }
      if (chatHistoryEndpoint) queryClient.invalidateQueries({ queryKey: [chatHistoryEndpoint] });
      if (chatSessionsEndpoint) queryClient.invalidateQueries({ queryKey: [chatSessionsEndpoint] });
    },
    onError: (error: any) => {
      toast({ title: "Chat failed", description: error?.message || "Could not reach this agent", variant: "destructive" });
    },
  });
  const updateChatSessionMutation = useMutation({
    mutationFn: async (payload: { sessionId: string; title?: string; archived?: boolean }) => {
      const body: Record<string, unknown> = {};
      if (payload.title !== undefined) body.title = payload.title;
      if (payload.archived !== undefined) body.archived = payload.archived;
      return apiRequest(
        `/api/v2/agents/${agentId}/chat-sessions/${encodeURIComponent(payload.sessionId)}`,
        "PATCH",
        body,
      );
    },
    onSuccess: (_data, payload) => {
      if (payload.title !== undefined) {
        setEditingSessionId("");
        setSessionTitleDraft("");
      }
      if (payload.archived === true && chatSessionId === payload.sessionId) {
        setChatSessionId("");
      }
      refreshProfile();
    },
    onError: (error: any) => {
      toast({
        title: "Session update failed",
        description: error?.message || "Could not update this chat session",
        variant: "destructive",
      });
    },
  });

  const beginMemoryEdit = (entry: AgentMemoryItem) => {
    setEditingMemoryId(entry.id);
    setMemoryEditContent(String(entry.content || ""));
    setMemoryEditType(String(entry.type || "note"));
    setMemoryEditTags(Array.isArray(entry.tags) ? entry.tags.join(", ") : "");
  };

  const cancelMemoryEdit = () => {
    setEditingMemoryId(null);
    setMemoryEditContent("");
    setMemoryEditType("note");
    setMemoryEditTags("");
  };

  const beginSessionRename = (session: AgentChatSessionItem) => {
    setEditingSessionId(session.session_id);
    setSessionTitleDraft(String(session.title || "").trim() || `Thread ${session.session_id.slice(0, 8)}`);
  };

  const cancelSessionRename = () => {
    setEditingSessionId("");
    setSessionTitleDraft("");
  };

  const confirmRuntimeConfigUpdate = () => {
    const approved = window.confirm(
      "Save this agent's runtime model, provider, tools, temperature, and hard-mode configuration? This changes future internal execution settings. It does not send an external message, create a payment, or start a contract.",
    );
    if (!approved) return;
    modelMutation.mutate();
  };

  const confirmMemoryDeletion = (memoryId: number) => {
    if (!window.confirm(`Delete memory entry #${memoryId}? This cannot be undone.`)) return;
    deleteMemoryMutation.mutate(memoryId);
  };

  const confirmSkillRemoval = (skill: string) => {
    if (!window.confirm(`Remove the skill "${skill}" from this agent?`)) return;
    skillsMutation.mutate({ action: "remove", skill });
  };

  const confirmAbilityTest = () => {
    const approved = window.confirm(
      "Run this internal ability test? It may use the configured model provider and consume provider capacity. It will not send an external message, create a payment, or start a contract.",
    );
    if (!approved) return;
    testMutation.mutate();
  };

  const confirmChatSessionArchive = (session: AgentChatSessionItem) => {
    if (!session.archived) {
      const label = session.title || `Thread ${session.session_id.slice(0, 8)}`;
      if (!window.confirm(`Archive "${label}"? Its saved history will remain available under archived threads.`)) return;
    }
    updateChatSessionMutation.mutate({
      sessionId: session.session_id,
      archived: !session.archived,
    });
  };

  if (!agentId) {
    return <Redirect to={backHref} />;
  }

  return (
    <div data-testid="exportunity-agent-profile-workspace" className="light min-h-full space-y-4 bg-[#f7f8fa] p-4 text-slate-950 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <Link href={backHref}>
          <a className="inline-flex items-center text-xs text-slate-700 hover:text-slate-950">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to team
          </a>
        </Link>
      </div>

      {profileQuery.isLoading ? (
        <Card className="bg-white border-slate-200"><CardContent className="pt-6 text-slate-600">Loading profile...</CardContent></Card>
      ) : null}

      {overview ? (
        <>
          <Card className="bg-white border-slate-200">
            <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-14 w-14 border border-amber-200 bg-slate-100">
                  <AvatarImage src={avatarUrl} alt={overview.name || "Agent"} className="object-cover" />
                  <AvatarFallback>{String(overview.name || "A").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <CardTitle className="text-slate-950 text-lg flex flex-wrap items-center gap-2">
                    <span className="truncate">{overview.name}</span>
                    <Badge variant="outline">{overview.domain || "INTERNAL"}</Badge>
                    <Badge variant="outline">{overview.statusV2 || "ACTIVE"}</Badge>
                  </CardTitle>
                  <div className="mt-1 text-xs text-slate-600">{overview.role || "-"}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{overview.department_name || overview.department_key || "Unassigned department"}</div>
                </div>
              </div>
              <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => selectProfileTab("memory")}
                >
                  <BrainCircuit className="mr-2 h-4 w-4" />
                  Memory &amp; context
                </Button>
                <Button
                  type="button"
                  className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                  disabled={!editableAgent}
                  onClick={() => setProfileEditorOpen(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit identity &amp; face
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 p-3 bg-slate-50"><div className="text-slate-500">Actions</div><div className="text-slate-950 text-lg font-semibold">{performance.total}</div></div>
              <div className="rounded-lg border border-slate-200 p-3 bg-slate-50"><div className="text-slate-500">Success</div><div className="text-emerald-700 text-lg font-semibold">{performance.successCount}</div></div>
              <div className="rounded-lg border border-slate-200 p-3 bg-slate-50"><div className="text-slate-500">Failures</div><div className="text-rose-700 text-lg font-semibold">{performance.failedCount}</div></div>
              <div className="rounded-lg border border-slate-200 p-3 bg-slate-50"><div className="text-slate-500">NO_EFFECT</div><div className="text-amber-700 text-lg font-semibold">{performance.noEffectCount}</div></div>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={selectProfileTab}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b border-slate-200 bg-transparent p-0">
              <TabsTrigger className={agentProfileTabClass} value="overview">Overview</TabsTrigger>
              <TabsTrigger className={agentProfileTabClass} value="activity">Activity</TabsTrigger>
              <TabsTrigger className={agentProfileTabClass} value="permissions">Permissions</TabsTrigger>
              <TabsTrigger className={agentProfileTabClass} value="memory">Memory</TabsTrigger>
              <TabsTrigger className={agentProfileTabClass} value="skills">Skills</TabsTrigger>
              <TabsTrigger className={agentProfileTabClass} value="test">Test</TabsTrigger>
              <TabsTrigger className={agentProfileTabClass} value="chat">Direct chat</TabsTrigger>
              {isMarketplace ? <TabsTrigger className={agentProfileTabClass} value="listing">Listing</TabsTrigger> : null}
            </TabsList>

            <TabsContent value="overview" className="space-y-3">
              <Card className="bg-white border-slate-200">
                <CardHeader><CardTitle className="text-sm text-slate-950">Runtime</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div>Department: <span className="text-slate-900">{overview.department_key || "-"}</span></div>
                  <div>Current model: <span className="text-slate-900">{overview.runtime_model || "default"}</span></div>
                  <div>Tools: <span className="text-slate-900">{Array.isArray(overview.toolsEnabled) ? overview.toolsEnabled.join(", ") || "none" : "none"}</span></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                    <div>
                      <Label className="text-slate-700">Runtime model</Label>
                      <Input value={runtimeModel} onChange={(e) => setRuntimeModel(e.target.value)} placeholder={overview.runtime_model || "gpt-4.1"} className="bg-white border-slate-300" />
                    </div>
                    <div>
                      <Label className="text-slate-700">Tools (csv)</Label>
                      <Input value={toolsEnabled} onChange={(e) => setToolsEnabled(e.target.value)} placeholder={(Array.isArray(overview.toolsEnabled) ? overview.toolsEnabled.join(",") : "") || "browser,workstation"} className="bg-white border-slate-300" />
                    </div>
                    <div>
                      <Label className="text-slate-700">Model provider</Label>
                      <Input value={modelProvider} onChange={(e) => setModelProvider(e.target.value)} placeholder={overview?.metadata?.modelProvider || "openai / claude / gemini"} className="bg-white border-slate-300" />
                    </div>
                    <div>
                      <Label className="text-slate-700">Temperature (0-2)</Label>
                      <Input value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder={overview?.metadata?.temperature == null ? "0.4" : String(overview.metadata.temperature)} className="bg-white border-slate-300" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <input id="hard-mode" type="checkbox" checked={hardMode} onChange={(e) => setHardMode(e.target.checked)} className="rounded border-slate-300 bg-white" />
                    <Label htmlFor="hard-mode" className="text-slate-700 cursor-pointer">Hard mode (strict execution)</Label>
                  </div>
                  <Button
                    onClick={confirmRuntimeConfigUpdate}
                    disabled={modelMutation.isPending}
                    className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                  >
                    {modelMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save runtime config
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="space-y-3">
              <Card className="bg-white border-slate-200">
                <CardHeader><CardTitle className="text-sm text-slate-950">Action Runs</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {activity.actionRuns.length === 0 ? <div className="text-slate-500">No action runs.</div> : null}
                  {activity.actionRuns.map((row: any) => (
                    <div key={`ar-${row.id}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                      <div className="text-slate-900">{row.action_key}</div>
                      <div className="text-slate-600">{row.status} • {row.outcome || "-"} • {row.created_at ? new Date(row.created_at).toLocaleString() : "n/a"}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-white border-slate-200">
                <CardHeader><CardTitle className="text-sm text-slate-950">Workstation Sessions</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {activity.workstations.length === 0 ? <div className="text-slate-500">No workstation sessions.</div> : null}
                  {activity.workstations.map((row: any) => (
                    <div key={`ws-${row.id}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                      <div className="text-slate-900">Workstation {row.workstation_id}</div>
                      <div className="text-slate-600">{row.status || "-"} • start {row.started_at ? new Date(row.started_at).toLocaleString() : "n/a"}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="permissions">
              <Card className="bg-white border-slate-200">
                <CardHeader><CardTitle className="text-sm text-slate-950">Permissions</CardTitle></CardHeader>
                <CardContent className="text-xs text-slate-700 space-y-1">
                  <div>Allowed actions: see action policy attached to this agent profile.</div>
                  <div>Restricted tables: protected-table enforcement applies on forged actions.</div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="memory">
              <Card className="bg-white border-slate-200">
                <CardHeader><CardTitle className="text-sm text-slate-950">Memory / Context</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-xs text-slate-700">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                    <div>
                      <Label className="text-slate-700">Memory template</Label>
                      <select
                        value={selectedMemoryTemplate}
                        onChange={(e) => setSelectedMemoryTemplate(e.target.value)}
                        className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                      >
                        <option value="">Select template...</option>
                        {memoryTemplates.map((tpl) => (
                          <option key={tpl.key} value={tpl.key}>
                            {tpl.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!selectedMemoryTemplate}
                      onClick={() => {
                        const tpl = memoryTemplates.find((item) => item.key === selectedMemoryTemplate);
                        if (!tpl) return;
                        setMemoryType(String(tpl.type || "note"));
                        setMemoryContent(String(tpl.content || ""));
                        setMemoryTags(Array.isArray(tpl.tags) ? tpl.tags.join(", ") : "");
                      }}
                    >
                      Apply template
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="md:col-span-2">
                      <Label className="text-slate-700">Memory content</Label>
                      <Textarea value={memoryContent} onChange={(e) => setMemoryContent(e.target.value)} placeholder="Add memory this agent should retain..." className="bg-white border-slate-300 min-h-[90px]" />
                    </div>
                    <div className="space-y-2">
                      <div><Label className="text-slate-700">Category</Label><Input value={memoryType} onChange={(e) => setMemoryType(e.target.value)} placeholder="operations" className="bg-white border-slate-300" /></div>
                      <div><Label className="text-slate-700">Tags (csv)</Label><Input value={memoryTags} onChange={(e) => setMemoryTags(e.target.value)} placeholder="priority,policy,customer" className="bg-white border-slate-300" /></div>
                      <Button className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={!memoryContent.trim() || createMemoryMutation.isPending} onClick={() => createMemoryMutation.mutate()}>{createMemoryMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}Add memory</Button>
                    </div>
                  </div>

                  {(memoryQuery.data?.items || []).length === 0 ? <div className="text-slate-500">No memory entries yet.</div> : null}
                  {(memoryQuery.data?.items || []).map((entry) => (
                    <div key={entry.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{entry.type || "note"}</Badge>
                          <Badge variant="outline" className={entry.is_active ? "text-emerald-700" : "text-rose-700"}>{entry.is_active ? "ACTIVE" : "INACTIVE"}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => updateMemoryMutation.mutate({ memoryId: entry.id, pinned: !entry.pinned })}>{entry.pinned ? "Unpin" : "Pin"}</Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => updateMemoryMutation.mutate({ memoryId: entry.id, active: !entry.is_active })}>{entry.is_active ? "Disable" : "Enable"}</Button>
                          {editingMemoryId === entry.id ? (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={cancelMemoryEdit}>Cancel edit</Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => beginMemoryEdit(entry)}>Edit</Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] border-rose-200 text-rose-700 hover:bg-rose-50"
                            onClick={() => confirmMemoryDeletion(entry.id)}
                            disabled={deleteMemoryMutation.isPending}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      {editingMemoryId === entry.id ? (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            value={memoryEditContent}
                            onChange={(e) => setMemoryEditContent(e.target.value)}
                            className="bg-white border-slate-300 min-h-[90px]"
                            placeholder="Memory content"
                          />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                              <Label className="text-slate-700">Category</Label>
                              <Input
                                value={memoryEditType}
                                onChange={(e) => setMemoryEditType(e.target.value)}
                                className="bg-white border-slate-300"
                                placeholder="operations"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-700">Tags (csv)</Label>
                              <Input
                                value={memoryEditTags}
                                onChange={(e) => setMemoryEditTags(e.target.value)}
                                className="bg-white border-slate-300"
                                placeholder="priority,policy"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                              disabled={!memoryEditContent.trim() || updateMemoryMutation.isPending}
                              onClick={() =>
                                updateMemoryMutation.mutate({
                                  memoryId: entry.id,
                                  content: memoryEditContent.trim(),
                                  type: memoryEditType.trim() || "note",
                                  tags: parseCsv(memoryEditTags),
                                })
                              }
                            >
                              Save memory
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mt-2 text-slate-900 whitespace-pre-wrap">{entry.content}</div>
                          <div className="mt-2 text-[11px] text-slate-600">tags: {Array.isArray(entry.tags) && entry.tags.length ? entry.tags.join(", ") : "none"} • conf {entry.confidence == null ? "-" : Number(entry.confidence).toFixed(2)} • updated {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : "n/a"}</div>
                        </>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="skills">
              <Card className="bg-white border-slate-200">
                <CardHeader><CardTitle className="text-sm text-slate-950">Skills</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-xs text-slate-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-slate-700">Skill category</Label>
                      <select
                        value={selectedSkillCategory}
                        onChange={(e) => setSelectedSkillCategory(e.target.value)}
                        className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                      >
                        <option value="">Select category...</option>
                        {skillCategories.map((category) => (
                          <option key={category.key} value={category.key}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      {(activeSkillCategory?.skills || []).map((skill) => (
                        <Button
                          key={`${activeSkillCategory?.key || "cat"}-${skill}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-[11px]"
                          onClick={() => skillsMutation.mutate({ action: "add", skill })}
                          disabled={skillsMutation.isPending}
                        >
                          + {skill}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder="Add a skill (e.g. SLA enforcement)" className="bg-white border-slate-300" />
                    <Button className="bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={!skillInput.trim() || skillsMutation.isPending} onClick={() => skillsMutation.mutate({ action: "add", skill: skillInput.trim() })}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(skillsQuery.data?.skills || []).length === 0 ? <span className="text-slate-500">No skills assigned.</span> : null}
                    {(skillsQuery.data?.skills || []).map((skill) => (
                      <span key={skill} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-1">
                        <span>{skill}</span>
                        <button type="button" className="text-slate-600 hover:text-rose-700" onClick={() => confirmSkillRemoval(skill)} aria-label={`Remove ${skill}`}>x</button>
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="test">
              <Card className="bg-white border-slate-200">
                <CardHeader><CardTitle className="text-sm text-slate-950">Ability Test</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-xs text-slate-700">
                  <Textarea value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} placeholder="Describe a scenario and test this agent's reasoning/execution output." className="bg-white border-slate-300 min-h-[110px]" />
                  <Button className="bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={!testPrompt.trim() || testMutation.isPending} onClick={confirmAbilityTest}>{testMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}Run test</Button>
                  {testResult ? (
                    <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
                      <div className="text-[11px] text-slate-600">model: {testResult.runtimeModel || "default"} • tools: {Array.isArray(testResult.toolsEnabled) ? testResult.toolsEnabled.join(", ") || "none" : "none"} • {Number(testResult.durationMs || 0)}ms</div>
                      <div className="text-slate-900 whitespace-pre-wrap">{String(testResult.response || "(no response)")}</div>
                      {testResult.analysis ? <div className="text-[11px] text-slate-600 whitespace-pre-wrap">analysis: {String(testResult.analysis)}</div> : null}
                    </div>
                  ) : null}
                  <div className="rounded border border-slate-200 bg-slate-50 p-2 space-y-2">
                    <div className="text-[11px] text-slate-600">Recent persisted tests</div>
                    {testHistoryItems.length === 0 ? <div className="text-slate-500">No test history yet.</div> : null}
                    {testHistoryItems.map((entry) => (
                      <div key={`test-${entry.id}`} className="rounded border border-slate-200 bg-white p-2">
                        <div className="text-[11px] text-slate-600">
                          {entry.created_at ? new Date(entry.created_at).toLocaleString() : "n/a"}
                          {" • "}
                          {Number(entry?.metadata?.durationMs || 0)}ms
                        </div>
                        <div className="text-slate-800 mt-1">prompt: {entry.prompt}</div>
                        <div className="text-slate-900 mt-1 whitespace-pre-wrap">{String(entry.response || "(no response)")}</div>
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              setTestPrompt(String(entry.prompt || ""));
                              setTestResult({
                                response: entry.response || "",
                                analysis: entry.analysis || "",
                                durationMs: entry?.metadata?.durationMs || null,
                                runtimeModel: entry?.metadata?.runtimeModel || null,
                                toolsEnabled: Array.isArray(entry?.metadata?.toolsEnabled) ? entry.metadata.toolsEnabled : [],
                              });
                            }}
                          >
                            Load
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="chat">
              <Card className="bg-white border-slate-200">
                <CardHeader><CardTitle className="text-sm text-slate-950">Direct Chat</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-xs text-slate-700">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
                    <div>
                      <Label className="text-slate-700">Session</Label>
                      <select
                        value={chatSessionId}
                        onChange={(e) => setChatSessionId(e.target.value)}
                        className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                      >
                        <option value="">Select session...</option>
                        {chatSessionId && !chatSessions.some((session) => session.session_id === chatSessionId) ? (
                          <option value={chatSessionId}>Current draft session</option>
                        ) : null}
                        {chatSessions.map((session) => (
                          <option key={session.session_id} value={session.session_id}>
                            {(session.title || `Thread ${session.session_id.slice(0, 8)}`).slice(0, 42)}
                            {session.archived ? " • archived" : ""}
                            {" • "}
                            {Number(session.entry_count || 0)} msg
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      onClick={() => setChatSessionId(`session-${Date.now().toString(36)}`)}
                    >
                      New thread
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      onClick={() => {
                        if (chatHistoryEndpoint) queryClient.invalidateQueries({ queryKey: [chatHistoryEndpoint] });
                        if (chatSessionsEndpoint) queryClient.invalidateQueries({ queryKey: [chatSessionsEndpoint] });
                      }}
                    >
                      Refresh
                    </Button>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-2 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-600">Thread manager</div>
                      <label className="inline-flex items-center gap-2 text-[11px] text-slate-600">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 bg-white"
                          checked={includeArchivedSessions}
                          onChange={(e) => setIncludeArchivedSessions(e.target.checked)}
                        />
                        Show archived
                      </label>
                    </div>
                    {chatSessions.length === 0 ? <div className="text-slate-500">No saved chat sessions yet.</div> : null}
                    {chatSessions.map((session) => (
                      <div
                        key={`mgr-${session.session_id}`}
                        className={`rounded border p-2 ${chatSessionId === session.session_id ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            {editingSessionId === session.session_id ? (
                              <Input
                                value={sessionTitleDraft}
                                onChange={(e) => setSessionTitleDraft(e.target.value)}
                                className="h-8 bg-white border-slate-300"
                                placeholder={`Thread ${session.session_id.slice(0, 8)}`}
                              />
                            ) : (
                              <div className="font-medium text-slate-900 truncate">
                                {session.title || `Thread ${session.session_id.slice(0, 8)}`}
                              </div>
                            )}
                            <div className="text-[11px] text-slate-600">
                              {Number(session.entry_count || 0)} msg
                              {" • "}
                              {session.last_message_at ? new Date(session.last_message_at).toLocaleString() : "no activity"}
                              {session.archived ? " • archived" : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => setChatSessionId(session.session_id)}
                            >
                              Open
                            </Button>
                            {editingSessionId === session.session_id ? (
                              <>
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-[11px] bg-amber-500 text-slate-950 hover:bg-amber-400"
                                  disabled={!sessionTitleDraft.trim() || updateChatSessionMutation.isPending}
                                  onClick={() =>
                                    updateChatSessionMutation.mutate({
                                      sessionId: session.session_id,
                                      title: sessionTitleDraft.trim(),
                                    })
                                  }
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={cancelSessionRename}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => beginSessionRename(session)}
                              >
                                Rename
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={updateChatSessionMutation.isPending}
                              onClick={() => confirmChatSessionArchive(session)}
                            >
                              {session.archived ? "Unarchive" : "Archive"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="max-h-[280px] overflow-auto rounded border border-slate-200 bg-slate-50 p-2 space-y-2">
                    {activeChatMessages.length === 0 ? <div className="text-slate-500">Start a direct chat with this agent.</div> : null}
                    {activeChatMessages.map((row, index) => (
                      <div key={`${row.role}-${index}-${row.at}`} className={`rounded p-2 border ${row.role === "user" ? "border-amber-200 bg-amber-50 text-slate-900 ml-8" : "border-slate-300 bg-white text-slate-900 mr-8"}`}>
                        <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-1">{row.role}</div>
                        <div className="whitespace-pre-wrap">{row.content}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message this agent directly..." className="bg-white border-slate-300 min-h-[74px]" />
                    <Button
                      className="self-end bg-amber-500 text-slate-950 hover:bg-amber-400"
                      disabled={!chatInput.trim() || chatMutation.isPending}
                      onClick={() => {
                        const message = chatInput.trim();
                        if (!message) return;
                        setChatInput("");
                        chatMutation.mutate(message);
                      }}
                    >
                      {chatMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Send"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {isMarketplace ? (
              <TabsContent value="listing">
                <Card className="bg-white border-slate-200">
                  <CardHeader><CardTitle className="text-sm text-slate-950">Listing</CardTitle></CardHeader>
                  <CardContent className="text-xs text-slate-700 space-y-1">
                    <div>Template: {overview.is_template ? "Yes" : "No"}</div>
                    <div>Parent agent id: {overview.parent_agent_id || "-"}</div>
                    <div>Use Marketplace management controls for pricing/tags/public listing state.</div>
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </Tabs>
        </>
      ) : null}
      <AgentProfileDialog
        agent={editableAgent}
        runtimeAgentId={agentId}
        open={editOpen}
        onOpenChange={(open) => {
          setProfileEditorOpen(open);
          if (!open) {
            void queryClient.invalidateQueries({ queryKey: [`/api/v2/agents/${agentId}/profile`] });
          }
        }}
      />
    </div>
  );
}
