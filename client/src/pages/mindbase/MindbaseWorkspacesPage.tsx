import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MindbaseLayout from "./MindbaseLayout";
import { mindbasePath } from "./routing";

type WorkspaceListItem = {
  id: string;
  name: string;
  description: string | null;
  role: "owner" | "admin" | "member";
  updated_at: string;
};

type WorkspaceMember = {
  id: string;
  user_id: number;
  role: "owner" | "admin" | "member";
};

type WorkspaceAgent = {
  id: string;
  intellect_id: string;
  name: string;
  slug: string;
  category: string;
  access_policy: "private" | "public" | "paid";
};

type WorkspaceDetail = {
  item: WorkspaceListItem;
  members: WorkspaceMember[];
  agents: WorkspaceAgent[];
};

type StudioAgent = {
  id: string;
  name: string;
  slug: string;
  category: string;
  accessPolicy: "private" | "public" | "paid";
};

type WorkspaceChatPayload = {
  ok: boolean;
  routed_agent: {
    id: string;
    name: string;
    slug: string;
  };
  route_mode: "mention" | "round_robin" | "sticky";
  conversation_id: string;
  response: string;
  blocked?: boolean;
  citations?: Array<{ filename?: string }>;
  debited?: number;
};

type ChatLine = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  at: string;
  agentName?: string;
  routeMode?: string;
  citations?: string[];
};

export default function MindbaseWorkspacesPage() {
  const { isAuthenticated } = useSession();
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedAttachAgentId, setSelectedAttachAgentId] = useState("");
  const [message, setMessage] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");

  const workspacesQuery = useQuery<{ ok: boolean; items: WorkspaceListItem[] }>({
    queryKey: ["/api/mindbase/workspaces"],
    enabled: isAuthenticated,
    staleTime: 8_000,
  });

  const studioAgentsQuery = useQuery<{ ok: boolean; items: StudioAgent[] }>({
    queryKey: ["/api/mindbase/studio/intellects"],
    enabled: isAuthenticated,
    staleTime: 8_000,
  });

  const selectedWorkspaceQuery = useQuery<{ ok: boolean } & WorkspaceDetail>({
    queryKey: [`/api/mindbase/workspaces/${encodeURIComponent(selectedWorkspaceId)}`],
    enabled: isAuthenticated && Boolean(selectedWorkspaceId),
    staleTime: 5_000,
  });

  const workspaces = useMemo(() => workspacesQuery.data?.items || [], [workspacesQuery.data?.items]);
  const workspaceAgents = selectedWorkspaceQuery.data?.agents || [];
  const studioAgents = studioAgentsQuery.data?.items || [];

  useEffect(() => {
    if (selectedWorkspaceId) return;
    const first = workspaces[0];
    if (first?.id) setSelectedWorkspaceId(first.id);
  }, [workspaces, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setLines([]);
      setActiveConversationId("");
    }
  }, [selectedWorkspaceId]);

  const createWorkspaceMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/mindbase/workspaces", "POST", {
        name: workspaceName,
        description: workspaceDescription,
      }),
    onSuccess: (payload: any) => {
      const createdId = String(payload?.item?.id || "");
      setWorkspaceName("");
      setWorkspaceDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/mindbase/workspaces"] });
      if (createdId) setSelectedWorkspaceId(createdId);
    },
  });

  const attachMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspaceId || !selectedAttachAgentId) throw new Error("Select workspace and agent");
      return apiRequest(`/api/mindbase/workspaces/${selectedWorkspaceId}/agents/attach`, "POST", {
        agent_id: selectedAttachAgentId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/mindbase/workspaces/${encodeURIComponent(selectedWorkspaceId)}`] });
      setSelectedAttachAgentId("");
    },
  });

  const workspaceChatMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspaceId || !message.trim()) throw new Error("Select a workspace and enter a message");
      return apiRequest(`/api/mindbase/workspaces/${selectedWorkspaceId}/chat`, "POST", {
        message,
        conversation_id: activeConversationId || undefined,
      }) as Promise<WorkspaceChatPayload>;
    },
    onSuccess: (payload) => {
      const now = new Date().toISOString();
      const citationNames = (payload.citations || []).map((item) => String(item.filename || "")).filter(Boolean);
      setLines((prev) => [
        ...prev,
        { id: `${now}-u`, role: "user", content: message, at: now },
        {
          id: `${now}-a`,
          role: payload.blocked ? "system" : "assistant",
          content: payload.response,
          at: now,
          agentName: payload.routed_agent?.name,
          routeMode: payload.route_mode,
          citations: citationNames,
        },
      ]);
      setActiveConversationId(payload.conversation_id || "");
      setMessage("");
    },
  });

  if (!isAuthenticated) {
    return (
      <MindbaseLayout>
        <main className="mx-auto w-full max-w-4xl px-4 py-10">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <p>Create and run workspaces after signing in.</p>
              <Button asChild className="bg-[#007BFF] hover:bg-[#006AE0]">
                <Link href={`/login?next=${encodeURIComponent(mindbasePath("/workspaces"))}`}>Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </MindbaseLayout>
    );
  }

  return (
    <MindbaseLayout>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
            Workspaces
          </h1>
          <p className="text-sm text-slate-600">
            Attach multiple Agents and run group workflows. Mention an agent with <code>@agent-slug</code> or let route mode pick automatically.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <div className="space-y-5">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Create Workspace</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} className="border-slate-300 bg-white" />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea
                    value={workspaceDescription}
                    onChange={(event) => setWorkspaceDescription(event.target.value)}
                    className="min-h-[72px] border-slate-300 bg-white"
                  />
                </div>
                <Button
                  type="button"
                  disabled={!workspaceName.trim() || createWorkspaceMutation.isPending}
                  onClick={() => createWorkspaceMutation.mutate()}
                  className="bg-[#007BFF] hover:bg-[#006AE0]"
                >
                  {createWorkspaceMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Your Workspaces</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => setSelectedWorkspaceId(workspace.id)}
                    className={`w-full rounded-md border p-2 text-left ${
                      selectedWorkspaceId === workspace.id
                        ? "border-[#007BFF] bg-[#007BFF]/5"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-900">{workspace.name}</div>
                    <div className="text-xs text-slate-600">{workspace.description || "No description"}</div>
                    <div className="mt-1 text-[11px] text-slate-500">Role: {workspace.role}</div>
                  </button>
                ))}
                {!workspaces.length ? <div className="text-xs text-slate-500">No workspace yet.</div> : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Attach Agents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    value={selectedAttachAgentId}
                    onChange={(event) => setSelectedAttachAgentId(event.target.value)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">Select Agent</option>
                    {studioAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.slug})
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    disabled={!selectedWorkspaceId || !selectedAttachAgentId || attachMutation.isPending}
                    onClick={() => attachMutation.mutate()}
                    className="bg-[#007BFF] hover:bg-[#006AE0]"
                  >
                    {attachMutation.isPending ? "Attaching..." : "Attach"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {workspaceAgents.map((agent) => (
                    <Badge key={agent.id} variant="secondary" className="bg-slate-100 text-slate-700">
                      @{agent.slug} · {agent.name}
                    </Badge>
                  ))}
                  {!workspaceAgents.length ? (
                    <div className="text-xs text-slate-500">No attached agents in this workspace.</div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Workspace Chat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3">
                  {lines.map((line) => (
                    <div key={line.id} className="space-y-1">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        {line.role}
                        {line.agentName ? ` · ${line.agentName}` : ""}
                        {line.routeMode ? ` · ${line.routeMode}` : ""}
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-800">{line.content}</div>
                      {line.citations?.length ? (
                        <div className="text-[11px] text-emerald-700">Sources: {line.citations.join(", ")}</div>
                      ) : null}
                    </div>
                  ))}
                  {!lines.length ? (
                    <div className="text-sm text-slate-500">
                      Start with a message. Use <code>@agent-slug</code> to route explicitly, or omit mention for round-robin.
                    </div>
                  ) : null}
                </div>
                <Input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Example: @accountant Build a monthly margin summary template."
                  className="border-slate-300 bg-white"
                />
                <Button
                  type="button"
                  disabled={!selectedWorkspaceId || !message.trim() || workspaceChatMutation.isPending}
                  onClick={() => workspaceChatMutation.mutate()}
                  className="bg-[#007BFF] hover:bg-[#006AE0]"
                >
                  {workspaceChatMutation.isPending ? "Sending..." : "Send"}
                </Button>
                {workspaceChatMutation.error ? (
                  <div className="text-xs text-red-600">{(workspaceChatMutation.error as Error).message || "Chat failed"}</div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </MindbaseLayout>
  );
}

