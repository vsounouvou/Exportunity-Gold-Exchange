
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
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

export default function AgentProfileV2Page() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [, operationsParams] = useRoute("/operations/agents/:agentId");
  const [, marketplaceParams] = useRoute("/commerce/ai-marketplace/agents/:agentId");
  const isMarketplace = Boolean((marketplaceParams as any)?.agentId);
  const agentId = Number((operationsParams as any)?.agentId || (marketplaceParams as any)?.agentId || 0);
  const backHref = isMarketplace ? "/commerce/ai-marketplace/agents" : "/operations/agents";

  const profileQuery = useQuery<AgentProfilePayload>({
    queryKey: agentId ? [`/api/v2/agents/${agentId}/profile`] : ["__no_agent_profile_v2__"],
    enabled: Number.isFinite(agentId) && agentId > 0,
    staleTime: 10_000,
    retry: false,
  });

  const overview = profileQuery.data?.overview || null;
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

  const initialized = useMemo(() => {
    if (!overview) return false;
    return runtimeModel.length > 0 || toolsEnabled.length > 0 || modelProvider.length > 0 || temperature.length > 0;
  }, [overview, runtimeModel, toolsEnabled, modelProvider, temperature]);

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

  if (!agentId) {
    return <Redirect to={backHref} />;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href={backHref}>
          <a className="inline-flex items-center text-xs text-gray-300 hover:text-white">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </a>
        </Link>
        <div className="text-xs text-gray-500">{location}</div>
      </div>

      {profileQuery.isLoading ? (
        <Card className="bg-gray-900 border-gray-800"><CardContent className="pt-6 text-gray-400">Loading profile...</CardContent></Card>
      ) : null}

      {overview ? (
        <>
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-lg flex flex-wrap items-center gap-2">
                {overview.name}
                <Badge variant="outline">{overview.domain || "INTERNAL"}</Badge>
                <Badge variant="outline">{overview.statusV2 || "ACTIVE"}</Badge>
              </CardTitle>
              <div className="text-xs text-gray-400">{overview.role || "-"}</div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border border-gray-800 p-3 bg-gray-950/60"><div className="text-gray-500">Actions</div><div className="text-white text-lg font-semibold">{performance.total}</div></div>
              <div className="rounded-lg border border-gray-800 p-3 bg-gray-950/60"><div className="text-gray-500">Success</div><div className="text-emerald-300 text-lg font-semibold">{performance.successCount}</div></div>
              <div className="rounded-lg border border-gray-800 p-3 bg-gray-950/60"><div className="text-gray-500">Failures</div><div className="text-rose-300 text-lg font-semibold">{performance.failedCount}</div></div>
              <div className="rounded-lg border border-gray-800 p-3 bg-gray-950/60"><div className="text-gray-500">NO_EFFECT</div><div className="text-amber-300 text-lg font-semibold">{performance.noEffectCount}</div></div>
            </CardContent>
          </Card>

          <Tabs defaultValue="activity">
            <TabsList className="bg-gray-900 border border-gray-800 w-full md:w-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
              <TabsTrigger value="memory">Memory</TabsTrigger>
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="test">Test</TabsTrigger>
              <TabsTrigger value="chat">Direct chat</TabsTrigger>
              {isMarketplace ? <TabsTrigger value="listing">Listing</TabsTrigger> : null}
            </TabsList>

            <TabsContent value="overview" className="space-y-3">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader><CardTitle className="text-sm text-white">Runtime</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div>Department: <span className="text-gray-100">{overview.department_key || "-"}</span></div>
                  <div>Current model: <span className="text-gray-100">{overview.runtime_model || "default"}</span></div>
                  <div>Tools: <span className="text-gray-100">{Array.isArray(overview.toolsEnabled) ? overview.toolsEnabled.join(", ") || "none" : "none"}</span></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                    <div>
                      <Label className="text-gray-300">Runtime model</Label>
                      <Input value={runtimeModel} onChange={(e) => setRuntimeModel(e.target.value)} placeholder={overview.runtime_model || "gpt-4.1"} className="bg-gray-800 border-gray-700" />
                    </div>
                    <div>
                      <Label className="text-gray-300">Tools (csv)</Label>
                      <Input value={toolsEnabled} onChange={(e) => setToolsEnabled(e.target.value)} placeholder={(Array.isArray(overview.toolsEnabled) ? overview.toolsEnabled.join(",") : "") || "browser,workstation"} className="bg-gray-800 border-gray-700" />
                    </div>
                    <div>
                      <Label className="text-gray-300">Model provider</Label>
                      <Input value={modelProvider} onChange={(e) => setModelProvider(e.target.value)} placeholder={overview?.metadata?.modelProvider || "openai / claude / gemini"} className="bg-gray-800 border-gray-700" />
                    </div>
                    <div>
                      <Label className="text-gray-300">Temperature (0-2)</Label>
                      <Input value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder={overview?.metadata?.temperature == null ? "0.4" : String(overview.metadata.temperature)} className="bg-gray-800 border-gray-700" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <input id="hard-mode" type="checkbox" checked={hardMode} onChange={(e) => setHardMode(e.target.checked)} className="rounded border-gray-700 bg-gray-800" />
                    <Label htmlFor="hard-mode" className="text-gray-300 cursor-pointer">Hard mode (strict execution)</Label>
                  </div>
                  <Button
                    onClick={() => {
                      if (!initialized) {
                        setRuntimeModel(overview.runtime_model || "");
                        setToolsEnabled(Array.isArray(overview.toolsEnabled) ? overview.toolsEnabled.join(",") : "");
                        setModelProvider(String(overview?.metadata?.modelProvider || ""));
                        setTemperature(overview?.metadata?.temperature == null || Number.isNaN(Number(overview?.metadata?.temperature)) ? "" : String(overview.metadata.temperature));
                        setHardMode(Boolean(overview?.metadata?.hardMode));
                      }
                      modelMutation.mutate();
                    }}
                    disabled={modelMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-500"
                  >
                    {modelMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save runtime config
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="space-y-3">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader><CardTitle className="text-sm text-white">Action Runs</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {activity.actionRuns.length === 0 ? <div className="text-gray-500">No action runs.</div> : null}
                  {activity.actionRuns.map((row: any) => (
                    <div key={`ar-${row.id}`} className="rounded border border-gray-800 bg-gray-950/60 p-2">
                      <div className="text-gray-100">{row.action_key}</div>
                      <div className="text-gray-400">{row.status} • {row.outcome || "-"} • {row.created_at ? new Date(row.created_at).toLocaleString() : "n/a"}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-800">
                <CardHeader><CardTitle className="text-sm text-white">Workstation Sessions</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {activity.workstations.length === 0 ? <div className="text-gray-500">No workstation sessions.</div> : null}
                  {activity.workstations.map((row: any) => (
                    <div key={`ws-${row.id}`} className="rounded border border-gray-800 bg-gray-950/60 p-2">
                      <div className="text-gray-100">Workstation {row.workstation_id}</div>
                      <div className="text-gray-400">{row.status || "-"} • start {row.started_at ? new Date(row.started_at).toLocaleString() : "n/a"}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="permissions">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader><CardTitle className="text-sm text-white">Permissions</CardTitle></CardHeader>
                <CardContent className="text-xs text-gray-300 space-y-1">
                  <div>Allowed actions: see action policy attached to this agent profile.</div>
                  <div>Restricted tables: protected-table enforcement applies on forged actions.</div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="memory">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader><CardTitle className="text-sm text-white">Memory / Context</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-xs text-gray-300">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                    <div>
                      <Label className="text-gray-300">Memory template</Label>
                      <select
                        value={selectedMemoryTemplate}
                        onChange={(e) => setSelectedMemoryTemplate(e.target.value)}
                        className="w-full h-9 rounded-md border border-gray-700 bg-gray-800 px-3 text-sm text-gray-100"
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
                      <Label className="text-gray-300">Memory content</Label>
                      <Textarea value={memoryContent} onChange={(e) => setMemoryContent(e.target.value)} placeholder="Add memory this agent should retain..." className="bg-gray-800 border-gray-700 min-h-[90px]" />
                    </div>
                    <div className="space-y-2">
                      <div><Label className="text-gray-300">Category</Label><Input value={memoryType} onChange={(e) => setMemoryType(e.target.value)} placeholder="operations" className="bg-gray-800 border-gray-700" /></div>
                      <div><Label className="text-gray-300">Tags (csv)</Label><Input value={memoryTags} onChange={(e) => setMemoryTags(e.target.value)} placeholder="priority,policy,customer" className="bg-gray-800 border-gray-700" /></div>
                      <Button className="w-full bg-blue-600 hover:bg-blue-500" disabled={!memoryContent.trim() || createMemoryMutation.isPending} onClick={() => createMemoryMutation.mutate()}>{createMemoryMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}Add memory</Button>
                    </div>
                  </div>

                  {(memoryQuery.data?.items || []).length === 0 ? <div className="text-gray-500">No memory entries yet.</div> : null}
                  {(memoryQuery.data?.items || []).map((entry) => (
                    <div key={entry.id} className="rounded border border-gray-800 bg-gray-950/60 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{entry.type || "note"}</Badge>
                          <Badge variant="outline" className={entry.is_active ? "text-emerald-300" : "text-rose-300"}>{entry.is_active ? "ACTIVE" : "INACTIVE"}</Badge>
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
                            className="h-7 px-2 text-[11px] border-rose-800 text-rose-300 hover:bg-rose-950/40"
                            onClick={() => {
                              if (!window.confirm(`Delete memory entry #${entry.id}?`)) return;
                              deleteMemoryMutation.mutate(entry.id);
                            }}
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
                            className="bg-gray-800 border-gray-700 min-h-[90px]"
                            placeholder="Memory content"
                          />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                              <Label className="text-gray-300">Category</Label>
                              <Input
                                value={memoryEditType}
                                onChange={(e) => setMemoryEditType(e.target.value)}
                                className="bg-gray-800 border-gray-700"
                                placeholder="operations"
                              />
                            </div>
                            <div>
                              <Label className="text-gray-300">Tags (csv)</Label>
                              <Input
                                value={memoryEditTags}
                                onChange={(e) => setMemoryEditTags(e.target.value)}
                                className="bg-gray-800 border-gray-700"
                                placeholder="priority,policy"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-500"
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
                          <div className="mt-2 text-gray-100 whitespace-pre-wrap">{entry.content}</div>
                          <div className="mt-2 text-[11px] text-gray-400">tags: {Array.isArray(entry.tags) && entry.tags.length ? entry.tags.join(", ") : "none"} • conf {entry.confidence == null ? "-" : Number(entry.confidence).toFixed(2)} • updated {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : "n/a"}</div>
                        </>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="skills">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader><CardTitle className="text-sm text-white">Skills</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-xs text-gray-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-gray-300">Skill category</Label>
                      <select
                        value={selectedSkillCategory}
                        onChange={(e) => setSelectedSkillCategory(e.target.value)}
                        className="w-full h-9 rounded-md border border-gray-700 bg-gray-800 px-3 text-sm text-gray-100"
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
                    <Input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder="Add a skill (e.g. SLA enforcement)" className="bg-gray-800 border-gray-700" />
                    <Button className="bg-blue-600 hover:bg-blue-500" disabled={!skillInput.trim() || skillsMutation.isPending} onClick={() => skillsMutation.mutate({ action: "add", skill: skillInput.trim() })}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(skillsQuery.data?.skills || []).length === 0 ? <span className="text-gray-500">No skills assigned.</span> : null}
                    {(skillsQuery.data?.skills || []).map((skill) => (
                      <span key={skill} className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-950 px-2 py-1">
                        <span>{skill}</span>
                        <button type="button" className="text-gray-400 hover:text-rose-300" onClick={() => skillsMutation.mutate({ action: "remove", skill })} aria-label={`Remove ${skill}`}>x</button>
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="test">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader><CardTitle className="text-sm text-white">Ability Test</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-xs text-gray-300">
                  <Textarea value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} placeholder="Describe a scenario and test this agent's reasoning/execution output." className="bg-gray-800 border-gray-700 min-h-[110px]" />
                  <Button className="bg-blue-600 hover:bg-blue-500" disabled={!testPrompt.trim() || testMutation.isPending} onClick={() => testMutation.mutate()}>{testMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}Run test</Button>
                  {testResult ? (
                    <div className="rounded border border-gray-800 bg-gray-950/60 p-3 space-y-2">
                      <div className="text-[11px] text-gray-400">model: {testResult.runtimeModel || "default"} • tools: {Array.isArray(testResult.toolsEnabled) ? testResult.toolsEnabled.join(", ") || "none" : "none"} • {Number(testResult.durationMs || 0)}ms</div>
                      <div className="text-gray-100 whitespace-pre-wrap">{String(testResult.response || "(no response)")}</div>
                      {testResult.analysis ? <div className="text-[11px] text-gray-400 whitespace-pre-wrap">analysis: {String(testResult.analysis)}</div> : null}
                    </div>
                  ) : null}
                  <div className="rounded border border-gray-800 bg-gray-950/60 p-2 space-y-2">
                    <div className="text-[11px] text-gray-400">Recent persisted tests</div>
                    {testHistoryItems.length === 0 ? <div className="text-gray-500">No test history yet.</div> : null}
                    {testHistoryItems.map((entry) => (
                      <div key={`test-${entry.id}`} className="rounded border border-gray-800 bg-gray-900/60 p-2">
                        <div className="text-[11px] text-gray-400">
                          {entry.created_at ? new Date(entry.created_at).toLocaleString() : "n/a"}
                          {" • "}
                          {Number(entry?.metadata?.durationMs || 0)}ms
                        </div>
                        <div className="text-gray-200 mt-1">prompt: {entry.prompt}</div>
                        <div className="text-gray-100 mt-1 whitespace-pre-wrap">{String(entry.response || "(no response)")}</div>
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
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader><CardTitle className="text-sm text-white">Direct Chat</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-xs text-gray-300">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
                    <div>
                      <Label className="text-gray-300">Session</Label>
                      <select
                        value={chatSessionId}
                        onChange={(e) => setChatSessionId(e.target.value)}
                        className="w-full h-9 rounded-md border border-gray-700 bg-gray-800 px-3 text-sm text-gray-100"
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
                  <div className="rounded border border-gray-800 bg-gray-950/60 p-2 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-gray-400">Thread manager</div>
                      <label className="inline-flex items-center gap-2 text-[11px] text-gray-400">
                        <input
                          type="checkbox"
                          className="rounded border-gray-700 bg-gray-800"
                          checked={includeArchivedSessions}
                          onChange={(e) => setIncludeArchivedSessions(e.target.checked)}
                        />
                        Show archived
                      </label>
                    </div>
                    {chatSessions.length === 0 ? <div className="text-gray-500">No saved chat sessions yet.</div> : null}
                    {chatSessions.map((session) => (
                      <div
                        key={`mgr-${session.session_id}`}
                        className={`rounded border p-2 ${chatSessionId === session.session_id ? "border-blue-700 bg-blue-950/20" : "border-gray-800 bg-gray-900/70"}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            {editingSessionId === session.session_id ? (
                              <Input
                                value={sessionTitleDraft}
                                onChange={(e) => setSessionTitleDraft(e.target.value)}
                                className="h-8 bg-gray-800 border-gray-700"
                                placeholder={`Thread ${session.session_id.slice(0, 8)}`}
                              />
                            ) : (
                              <div className="font-medium text-gray-100 truncate">
                                {session.title || `Thread ${session.session_id.slice(0, 8)}`}
                              </div>
                            )}
                            <div className="text-[11px] text-gray-400">
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
                                  className="h-7 px-2 text-[11px] bg-blue-600 hover:bg-blue-500"
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
                              onClick={() =>
                                updateChatSessionMutation.mutate({
                                  sessionId: session.session_id,
                                  archived: !session.archived,
                                })
                              }
                            >
                              {session.archived ? "Unarchive" : "Archive"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="max-h-[280px] overflow-auto rounded border border-gray-800 bg-gray-950/60 p-2 space-y-2">
                    {activeChatMessages.length === 0 ? <div className="text-gray-500">Start a direct chat with this agent.</div> : null}
                    {activeChatMessages.map((row, index) => (
                      <div key={`${row.role}-${index}-${row.at}`} className={`rounded p-2 border ${row.role === "user" ? "border-blue-700 bg-blue-950/40 text-blue-100 ml-8" : "border-gray-700 bg-gray-900 text-gray-100 mr-8"}`}>
                        <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{row.role}</div>
                        <div className="whitespace-pre-wrap">{row.content}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message this agent directly..." className="bg-gray-800 border-gray-700 min-h-[74px]" />
                    <Button
                      className="self-end bg-blue-600 hover:bg-blue-500"
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
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader><CardTitle className="text-sm text-white">Listing</CardTitle></CardHeader>
                  <CardContent className="text-xs text-gray-300 space-y-1">
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
    </div>
  );
}
