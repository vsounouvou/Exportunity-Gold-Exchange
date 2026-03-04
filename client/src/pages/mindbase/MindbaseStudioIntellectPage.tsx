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

type StudioIntellect = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  category: string;
  tags: string[];
  personaRole: string | null;
  personaTone: string | null;
  personaRules: string[];
  styleConstraints: string[];
  systemPrompt: string | null;
  accessPolicy: "private" | "public" | "paid";
  pricePer100Messages: number;
  isPublished: boolean;
  publishStatus: string;
  agentEmail: string | null;
};

type StudioKnowledgeFile = {
  id: string;
  filename: string;
  scope: "private" | "public" | "monetized";
  status: "uploaded" | "processed" | "failed";
  createdAt: string;
  errorMessage: string | null;
};

type InboxThread = {
  id: string;
  fromEmail: string;
  toEmail: string;
  subject: string | null;
  lastMessageAt: string;
};

type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  from_email: string | null;
  to_email: string | null;
  parsed_text: string | null;
  raw_text: string | null;
  created_at: string;
};

export default function MindbaseStudioIntellectPage({ intellectId }: { intellectId: string }) {
  const { isAuthenticated } = useSession();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [tags, setTags] = useState("");
  const [personaRole, setPersonaRole] = useState("");
  const [personaTone, setPersonaTone] = useState("");
  const [personaRules, setPersonaRules] = useState("");
  const [styleConstraints, setStyleConstraints] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [accessPolicy, setAccessPolicy] = useState<"private" | "public" | "paid">("private");
  const [price, setPrice] = useState("0");
  const [knowledgeScope, setKnowledgeScope] = useState<"private" | "public" | "monetized">("private");
  const [knowledgeFile, setKnowledgeFile] = useState<File | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);

  const intellectQuery = useQuery<{ ok: boolean; item: StudioIntellect }>({
    queryKey: [`/api/mindbase/studio/intellects/${encodeURIComponent(intellectId)}`],
    enabled: isAuthenticated && Boolean(intellectId),
    staleTime: 5_000,
  });

  const knowledgeQuery = useQuery<{ ok: boolean; items: StudioKnowledgeFile[] }>({
    queryKey: [`/api/mindbase/studio/intellects/${encodeURIComponent(intellectId)}/knowledge`],
    enabled: isAuthenticated && Boolean(intellectId),
    staleTime: 5_000,
  });

  const inboxThreadsQuery = useQuery<{ ok: boolean; items: InboxThread[] }>({
    queryKey: [`/api/mindbase/studio/intellects/${encodeURIComponent(intellectId)}/inbox`],
    enabled: isAuthenticated && Boolean(intellectId),
    staleTime: 5_000,
  });

  const inboxMessagesQuery = useQuery<{ ok: boolean; items: InboxMessage[]; thread: InboxThread }>({
    queryKey: [
      `/api/mindbase/studio/intellects/${encodeURIComponent(intellectId)}/inbox/${encodeURIComponent(selectedThreadId)}/messages`,
    ],
    enabled: isAuthenticated && Boolean(intellectId) && Boolean(selectedThreadId),
    staleTime: 5_000,
  });

  const item = intellectQuery.data?.item ?? null;

  useEffect(() => {
    if (!item) return;
    setName(item.name || "");
    setTagline(item.tagline || "");
    setDescription(item.description || "");
    setCategory(item.category || "general");
    setTags(Array.isArray(item.tags) ? item.tags.join(", ") : "");
    setPersonaRole(item.personaRole || "");
    setPersonaTone(item.personaTone || "");
    setPersonaRules(Array.isArray(item.personaRules) ? item.personaRules.join("\n") : "");
    setStyleConstraints(Array.isArray(item.styleConstraints) ? item.styleConstraints.join("\n") : "");
    setSystemPrompt(item.systemPrompt || "");
    setAccessPolicy(item.accessPolicy || "private");
    setPrice(String(item.pricePer100Messages || 0));
  }, [item]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/mindbase/studio/intellects/${intellectId}`, "PATCH", {
        name,
        tagline,
        description,
        category,
        tags: tags
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
        persona_role: personaRole,
        persona_tone: personaTone,
        persona_rules: personaRules
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean),
        style_constraints: styleConstraints
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean),
        system_prompt: systemPrompt,
        access_policy: accessPolicy,
        price_per_100_messages: Number.parseInt(price || "0", 10) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/mindbase/studio/intellects/${encodeURIComponent(intellectId)}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/mindbase/studio/intellects"] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => apiRequest(`/api/mindbase/studio/intellects/${intellectId}/publish`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/mindbase/studio/intellects/${encodeURIComponent(intellectId)}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/mindbase/studio/intellects"] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!knowledgeFile) throw new Error("Select a file first");
      const payload = new FormData();
      payload.set("scope", knowledgeScope);
      payload.set("file", knowledgeFile);
      return apiRequest(`/api/mindbase/studio/intellects/${intellectId}/knowledge`, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: () => {
      setKnowledgeFile(null);
      queryClient.invalidateQueries({ queryKey: [`/api/mindbase/studio/intellects/${encodeURIComponent(intellectId)}/knowledge`] });
    },
  });

  const ingestFromEmailMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/mindbase/agents/${intellectId}/email/ingest-to-knowledge`, "POST", {
        message_ids: selectedMessageIds,
        scope: "private",
      }),
    onSuccess: () => {
      setSelectedMessageIds([]);
      queryClient.invalidateQueries({ queryKey: [`/api/mindbase/studio/intellects/${encodeURIComponent(intellectId)}/knowledge`] });
    },
  });

  const knowledgeItems = useMemo(() => knowledgeQuery.data?.items || [], [knowledgeQuery.data?.items]);
  const inboxThreads = useMemo(() => inboxThreadsQuery.data?.items || [], [inboxThreadsQuery.data?.items]);
  const inboxMessages = useMemo(() => inboxMessagesQuery.data?.items || [], [inboxMessagesQuery.data?.items]);

  useEffect(() => {
    if (selectedThreadId) return;
    const firstThread = inboxThreads[0];
    if (firstThread?.id) setSelectedThreadId(firstThread.id);
  }, [inboxThreads, selectedThreadId]);

  if (!isAuthenticated) {
    return (
      <MindbaseLayout>
        <main className="mx-auto w-full max-w-5xl px-4 py-10">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700">
              <Button asChild className="bg-[#007BFF] hover:bg-[#006AE0]">
                <Link href={`/login?next=${encodeURIComponent(mindbasePath(`/studio/intellects/${intellectId}`))}`}>Sign in</Link>
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
            Configure Agent
          </h1>
          <Link href={mindbasePath("/studio")}>
            <a className="text-sm text-[#007BFF] hover:underline">Back to Studio</a>
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Identity & Behavior</CardTitle>
              <p className="text-xs text-slate-500">Owner-configured persona and operating rules.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} className="border-slate-300 bg-white" />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Input value={category} onChange={(event) => setCategory(event.target.value)} className="border-slate-300 bg-white" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>One-line expertise</Label>
                <Input value={tagline} onChange={(event) => setTagline(event.target.value)} className="border-slate-300 bg-white" />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-[90px] border-slate-300 bg-white" />
              </div>
              <div className="space-y-1">
                <Label>Tags (comma separated)</Label>
                <Input value={tags} onChange={(event) => setTags(event.target.value)} className="border-slate-300 bg-white" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Input value={personaRole} onChange={(event) => setPersonaRole(event.target.value)} className="border-slate-300 bg-white" />
                </div>
                <div className="space-y-1">
                  <Label>Tone</Label>
                  <Input value={personaTone} onChange={(event) => setPersonaTone(event.target.value)} className="border-slate-300 bg-white" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Rules (one per line)</Label>
                <Textarea value={personaRules} onChange={(event) => setPersonaRules(event.target.value)} className="min-h-[90px] border-slate-300 bg-white" />
              </div>
              <div className="space-y-1">
                <Label>Style constraints (one per line)</Label>
                <Textarea value={styleConstraints} onChange={(event) => setStyleConstraints(event.target.value)} className="min-h-[90px] border-slate-300 bg-white" />
              </div>
              <div className="space-y-1">
                <Label>System prompt</Label>
                <Textarea value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} className="min-h-[120px] border-slate-300 bg-white" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Pricing mode</Label>
                  <select
                    value={accessPolicy}
                    onChange={(event) => setAccessPolicy(event.target.value as "private" | "public" | "paid")}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Credits per 100 messages</Label>
                  <Input value={price} onChange={(event) => setPrice(event.target.value)} className="border-slate-300 bg-white" />
                </div>
              </div>
              <div className="space-y-2 text-xs text-slate-600">
                {item?.agentEmail ? <div>Agent email: <span className="font-medium text-slate-800">{item.agentEmail}</span></div> : null}
                {item ? (
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {item.publishStatus}
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-[#007BFF] hover:bg-[#006AE0]">
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button type="button" variant="outline" className="border-slate-300" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
                  {publishMutation.isPending ? "Publishing..." : "Publish"}
                </Button>
                {item ? (
                  <Button asChild type="button" variant="ghost" className="text-[#007BFF]">
                    <Link href={mindbasePath(`/i/${item.slug}`)}>Preview</Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Knowledge Library</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>Visibility</Label>
                  <select
                    value={knowledgeScope}
                    onChange={(event) => setKnowledgeScope(event.target.value as "private" | "public" | "monetized")}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                    <option value="monetized">Monetized</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>File</Label>
                  <Input
                    type="file"
                    accept=".txt,.md,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(event) => setKnowledgeFile(event.target.files?.[0] || null)}
                    className="border-slate-300 bg-white"
                  />
                </div>
                <Button type="button" disabled={!knowledgeFile || uploadMutation.isPending} onClick={() => uploadMutation.mutate()} className="bg-[#007BFF] hover:bg-[#006AE0]">
                  {uploadMutation.isPending ? "Uploading..." : "Upload file"}
                </Button>
                <div className="space-y-2">
                  {knowledgeItems.map((file) => (
                    <div key={file.id} className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                      <div className="font-medium text-slate-900">{file.filename}</div>
                      <div className="text-slate-600">
                        {file.scope} | {file.status}
                      </div>
                      {file.errorMessage ? <div className="text-red-600">{file.errorMessage}</div> : null}
                    </div>
                  ))}
                  {!knowledgeItems.length ? <div className="text-xs text-slate-500">No files uploaded yet.</div> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Agent Inbox</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {inboxThreads.map((thread) => (
                    <button
                      type="button"
                      key={thread.id}
                      onClick={() => {
                        setSelectedThreadId(thread.id);
                        setSelectedMessageIds([]);
                      }}
                      className={`w-full rounded-md border p-2 text-left text-xs ${
                        selectedThreadId === thread.id
                          ? "border-[#007BFF] bg-[#007BFF]/5 text-slate-900"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div className="font-medium">{thread.subject || "(no subject)"}</div>
                      <div className="text-slate-500">{thread.fromEmail}</div>
                    </button>
                  ))}
                  {!inboxThreads.length ? <div className="text-xs text-slate-500">No inbound email threads yet.</div> : null}
                </div>

                {selectedThreadId && inboxMessages.length ? (
                  <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                    {inboxMessages.map((message) => {
                      const checked = selectedMessageIds.includes(message.id);
                      return (
                        <label key={message.id} className="flex items-start gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedMessageIds((prev) => Array.from(new Set([...prev, message.id])));
                              } else {
                                setSelectedMessageIds((prev) => prev.filter((id) => id !== message.id));
                              }
                            }}
                          />
                          <span className="min-w-0">
                            <span className="font-medium text-slate-900">{message.direction}</span>{" "}
                            <span className="text-slate-500">{new Date(message.created_at).toLocaleString()}</span>
                            <span className="mt-1 block line-clamp-3 text-slate-700">
                              {message.parsed_text || message.raw_text || "(empty message)"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    <Button
                      type="button"
                      size="sm"
                      className="bg-[#007BFF] hover:bg-[#006AE0]"
                      disabled={!selectedMessageIds.length || ingestFromEmailMutation.isPending}
                      onClick={() => ingestFromEmailMutation.mutate()}
                    >
                      {ingestFromEmailMutation.isPending ? "Ingesting..." : "Add selected to Knowledge"}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </MindbaseLayout>
  );
}
