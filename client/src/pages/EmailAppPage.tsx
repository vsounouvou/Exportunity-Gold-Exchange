import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ExternalLink, Mail, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";

type AssistantAgent = {
  id: number;
  name: string;
  role: string | null;
  policy: {
    isEnabled: boolean;
    readScope: "subject_only" | "full_thread";
    canSuggestDrafts: boolean;
    canSuggestSummaries: boolean;
    canSuggestFollowups: boolean;
    sendMode: "never" | "approval" | "autonomous";
    isDefault: boolean;
  };
};

type AssistAgentsResponse = { ok: boolean; items: AssistantAgent[] };

type DraftResponse = {
  ok: boolean;
  suggestedBy: { agentId: number; name: string; role: string | null };
  action: string;
  draft: { subject: string; body: string };
};

type ContextInsightsResponse = {
  ok: boolean;
  suggestedBy: { agentId: number; name: string; role: string | null };
  summary: string[];
  suggestedActions: Array<{ key: string; label: string; description?: string }>;
};

function nowIso() {
  return new Date().toISOString();
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const ROUND_CUBE_BASE = "https://mail.exportunity.net";
const ROUND_CUBE_INBOX = `${ROUND_CUBE_BASE}/?_task=mail`;
const ROUND_CUBE_COMPOSE = `${ROUND_CUBE_BASE}/?_task=mail&_action=compose`;

export function EmailAppPage() {
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [iframeSrc, setIframeSrc] = useState<string>(ROUND_CUBE_INBOX);

  const assistantsQuery = useQuery<AssistAgentsResponse>({
    queryKey: ["/api/mail/assistant/agents"],
    retry: false,
  });

  const assistants = assistantsQuery.data?.items ?? [];

  const [assistantAgentId, setAssistantAgentId] = useState<number | "none">("none");

  useEffect(() => {
    if (assistantAgentId !== "none") return;
    if (!assistants.length) return;
    setAssistantAgentId(assistants[0]!.id);
  }, [assistantAgentId, assistants]);

  const activeAssistant = useMemo(() => {
    if (assistantAgentId === "none") return null;
    return assistants.find((a) => a.id === assistantAgentId) ?? null;
  }, [assistantAgentId, assistants]);

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [contextText, setContextText] = useState("");

  const [useRoleContext, setUseRoleContext] = useState(true);
  const [useToneGuidelines, setUseToneGuidelines] = useState(true);
  const [useThreadContext, setUseThreadContext] = useState(true);
  const [targetLanguage, setTargetLanguage] = useState<"en" | "fr">("en");

  const [lastSuggestion, setLastSuggestion] = useState<
    | (DraftResponse & {
        at: string;
      })
    | null
  >(null);

  const draftMutation = useMutation({
    mutationFn: async (action: string) => {
      if (assistantAgentId === "none") throw new Error("Select an assistant");
      return apiRequest("/api/mail/assistant/draft", "POST", {
        assistantAgentId,
        action,
        to,
        subject,
        body,
        contextText,
        useThreadContext,
        useRoleContext,
        useToneGuidelines,
        targetLanguage,
      }) as Promise<DraftResponse>;
    },
    onSuccess: (res) => {
      setLastSuggestion({ ...res, at: nowIso() });
      toast({
        title: "Suggestion ready",
        description: `Suggested by ${res.suggestedBy?.name || "assistant"}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Assistant failed", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const [contextInsights, setContextInsights] = useState<ContextInsightsResponse | null>(null);
  const insightsMutation = useMutation({
    mutationFn: async () => {
      if (assistantAgentId === "none") throw new Error("Select an assistant");
      if (!contextText.trim()) throw new Error("Paste some context first");
      return apiRequest("/api/mail/assistant/context-insights", "POST", {
        assistantAgentId,
        subject,
        contextText,
      }) as Promise<ContextInsightsResponse>;
    },
    onSuccess: (res) => {
      setContextInsights(res);
    },
    onError: (err: any) => {
      toast({ title: "Summary failed", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const contextStatus = useMemo(() => {
    if (body.trim() || subject.trim() || to.trim()) return "Composing email";
    return "No email selected";
  }, [body, subject, to]);

  return (
    <div className="p-6 space-y-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Email</h1>
            <Badge className="bg-slate-500/15 text-slate-200 border border-slate-500/30">Roundcube</Badge>
          </div>
          <p className="text-sm text-slate-400">
            Your mailbox is ready. Use the assistant to draft, summarize, and follow up. You stay in control.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="secondary" onClick={() => setIframeSrc(ROUND_CUBE_INBOX)}>
            <Mail className="h-4 w-4 mr-2" />
            Inbox
          </Button>
          <Button onClick={() => setIframeSrc(ROUND_CUBE_COMPOSE)}>
            <Sparkles className="h-4 w-4 mr-2" />
            Compose
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open(iframeSrc || ROUND_CUBE_INBOX, "_blank", "noreferrer")}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open
          </Button>
        </div>
      </div>

      <div className="flex gap-4 items-stretch">
        <div className={cn("transition-all duration-200 overflow-hidden", panelCollapsed ? "w-10" : "w-[360px]")}>
          <Card className="h-full bg-slate-900/60 border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-white text-base">Email assistant</CardTitle>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setPanelCollapsed((v) => !v)}
                  aria-label={panelCollapsed ? "Expand assistant panel" : "Collapse assistant panel"}
                >
                  {panelCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>

            {panelCollapsed ? null : (
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Who should help you?</div>
                  <Select
                    value={String(assistantAgentId)}
                    onValueChange={(value) => setAssistantAgentId(value === "none" ? "none" : Number(value))}
                  >
                    <SelectTrigger className="bg-slate-950/40 border-slate-800 text-slate-100">
                      <SelectValue placeholder="Select assistant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {assistants.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assistantsQuery.isError ? (
                    <div className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                      Assistant list unavailable. You can still use webmail using the Open button.
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                  <div className="text-xs font-semibold text-slate-200">Context status</div>
                  <div className="text-xs text-slate-400 mt-1">{contextStatus}</div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-200">Writing help</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      disabled={draftMutation.isPending || assistantAgentId === "none"}
                      onClick={() => draftMutation.mutate("suggest_draft")}
                    >
                      Suggest draft
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={draftMutation.isPending || assistantAgentId === "none"}
                      onClick={() => draftMutation.mutate("improve_tone")}
                    >
                      Improve tone
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={draftMutation.isPending || assistantAgentId === "none"}
                      onClick={() => draftMutation.mutate("shorter")}
                    >
                      Make shorter
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={draftMutation.isPending || assistantAgentId === "none"}
                      onClick={() => draftMutation.mutate("formal")}
                    >
                      More formal
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={draftMutation.isPending || assistantAgentId === "none"}
                      onClick={() => {
                        setTargetLanguage("fr");
                        draftMutation.mutate("translate");
                      }}
                    >
                      Translate FR
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={draftMutation.isPending || assistantAgentId === "none"}
                      onClick={() => {
                        setTargetLanguage("en");
                        draftMutation.mutate("translate");
                      }}
                    >
                      Translate EN
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-200">Draft inputs</div>
                  <Input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="To (comma-separated)"
                    className="bg-slate-950/40 border-slate-800 text-slate-100"
                  />
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                    className="bg-slate-950/40 border-slate-800 text-slate-100"
                  />
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="What do you want to say?"
                    className="min-h-[110px] bg-slate-950/40 border-slate-800 text-slate-100"
                  />
                  <Textarea
                    value={contextText}
                    onChange={(e) => setContextText(e.target.value)}
                    placeholder="Context (optional): paste the email you are replying to, or add notes."
                    className="min-h-[90px] bg-slate-950/40 border-slate-800 text-slate-100"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={useThreadContext}
                        onChange={(e) => setUseThreadContext(e.target.checked)}
                      />
                      Use context
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={useRoleContext}
                        onChange={(e) => setUseRoleContext(e.target.checked)}
                      />
                      Use my role
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={useToneGuidelines}
                        onChange={(e) => setUseToneGuidelines(e.target.checked)}
                      />
                      Use tone guidelines
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-200">Conversation summary</div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={insightsMutation.isPending || assistantAgentId === "none"}
                      onClick={() => insightsMutation.mutate()}
                    >
                      Summarize
                    </Button>
                  </div>

                  {!contextText.trim() ? (
                    <div className="text-xs text-slate-400 rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                      Select an email to get assistance, or paste it into the Context box above.
                    </div>
                  ) : contextInsights?.summary?.length ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                      <div className="text-[11px] text-slate-400">
                        Summary by <span className="text-slate-200">{contextInsights.suggestedBy?.name || "assistant"}</span>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs text-slate-200 list-disc pl-5">
                        {contextInsights.summary.slice(0, 6).map((s, idx) => (
                          <li key={idx}>{s}</li>
                        ))}
                      </ul>
                      {contextInsights.suggestedActions?.length ? (
                        <div className="mt-3">
                          <div className="text-[11px] text-slate-400">Suggested next actions</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {contextInsights.suggestedActions.map((a) => (
                              <Button
                                key={a.key}
                                size="sm"
                                variant="secondary"
                                disabled={draftMutation.isPending}
                                onClick={() => draftMutation.mutate(a.key)}
                              >
                                {a.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                      Click Summarize to generate a short thread summary and suggested actions.
                    </div>
                  )}
                </div>

                {lastSuggestion ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-slate-400">
                          Suggested by{" "}
                          <span className="text-slate-200">{lastSuggestion.suggestedBy?.name || "assistant"}</span>{" "}
                          · {new Date(lastSuggestion.at).toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-200 mt-2 font-medium break-words">
                          Subject: {lastSuggestion.draft?.subject || "(none)"}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            const ok = await copyToClipboard(lastSuggestion.draft?.body || "");
                            toast({
                              title: ok ? "Copied" : "Copy failed",
                              description: ok ? "Draft copied to clipboard." : "Clipboard unavailable.",
                            });
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={lastSuggestion.draft?.body || ""}
                      readOnly
                      className="min-h-[140px] bg-black/40 border-white/10 text-slate-100"
                    />
                    <div className="text-[11px] text-slate-400">
                      Insert into email: click inside Roundcube and paste (Ctrl/Cmd + V). This assistant never sends emails automatically.
                    </div>
                  </div>
                ) : null}

                {activeAssistant ? (
                  <div className="text-[11px] text-slate-500">
                    Assistant: <span className="text-slate-300">{activeAssistant.name}</span>{" "}
                    {activeAssistant.role ? (
                      <>
                        · <span className="text-slate-400">{activeAssistant.role}</span>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            )}
          </Card>
        </div>

        <div className="flex-1 min-w-0">
          <Card className="bg-slate-900/60 border-slate-800 h-[calc(100vh-180px)]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-white text-base">Webmail</CardTitle>
                <a
                  href={ROUND_CUBE_BASE}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1"
                >
                  mail.exportunity.net <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardHeader>
            <CardContent className="h-[calc(100%-56px)]">
              <div className="h-full w-full rounded-xl overflow-hidden border border-slate-800 bg-black/30">
                <iframe
                  ref={iframeRef}
                  title="Roundcube Webmail"
                  src={iframeSrc}
                  className="w-full h-full"
                  allow="clipboard-read; clipboard-write"
                />
              </div>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between gap-2">
                <span>
                  If the iframe does not load, use <span className="text-slate-300">Open</span> to access webmail in a new tab.
                </span>
                <span className="text-slate-600">Embedded: {ROUND_CUBE_BASE}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}
