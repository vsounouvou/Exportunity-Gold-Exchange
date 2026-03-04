import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type AssistantPolicy = {
  isEnabled: boolean;
  readScope: "subject_only" | "full_thread";
  canSuggestDrafts: boolean;
  canSuggestSummaries: boolean;
  canSuggestFollowups: boolean;
  sendMode: "never" | "approval" | "autonomous";
  isDefault: boolean;
};

type AssistantAgentItem = {
  id: number;
  name: string;
  role: string;
  policy: AssistantPolicy;
};

type AssistAgentsResponse = { ok: boolean; items: AssistantAgentItem[] };

type DraftAssistAction = "suggest_draft" | "improve_tone" | "shorter" | "formal" | "translate";

type DraftAssistResponse = {
  ok: boolean;
  suggestedBy: { agentId: number; name: string; role: string };
  action: DraftAssistAction;
  draft: { subject: string; body: string };
};

function readLocal(key: string, fallback: string) {
  try {
    const v = localStorage.getItem(key);
    return v ? String(v) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function EmailWritingAssistantPanel(props: {
  agentKey: string;
  threadId: number | null;
  to: string;
  subject: string;
  body: string;
  onApplyDraft: (draft: { subject: string; body: string }) => void;
}) {
  const { toast } = useToast();

  const assistantsQuery = useQuery<AssistAgentsResponse>({
    queryKey: ["/api/mail/assistant/agents"],
    retry: false,
  });

  const assistants = Array.isArray(assistantsQuery.data?.items) ? assistantsQuery.data!.items : [];

  const [panelOpen, setPanelOpen] = useState(() => readLocal("mail_assistant_panel_open", "1") === "1");
  const [assistantAgentId, setAssistantAgentId] = useState<string>(() => readLocal("mail_assistant_agent_id", "none"));

  const [useThreadContext, setUseThreadContext] = useState(() => readLocal("mail_assistant_use_thread", "1") === "1");
  const [useRoleContext, setUseRoleContext] = useState(() => readLocal("mail_assistant_use_role", "1") === "1");
  const [useToneGuidelines, setUseToneGuidelines] = useState(() => readLocal("mail_assistant_use_tone", "1") === "1");

  const [translateLang, setTranslateLang] = useState<"en" | "fr">(() => (readLocal("mail_assistant_translate_lang", "en") === "fr" ? "fr" : "en"));

  useEffect(() => writeLocal("mail_assistant_panel_open", panelOpen ? "1" : "0"), [panelOpen]);
  useEffect(() => writeLocal("mail_assistant_agent_id", assistantAgentId), [assistantAgentId]);
  useEffect(() => writeLocal("mail_assistant_use_thread", useThreadContext ? "1" : "0"), [useThreadContext]);
  useEffect(() => writeLocal("mail_assistant_use_role", useRoleContext ? "1" : "0"), [useRoleContext]);
  useEffect(() => writeLocal("mail_assistant_use_tone", useToneGuidelines ? "1" : "0"), [useToneGuidelines]);
  useEffect(() => writeLocal("mail_assistant_translate_lang", translateLang), [translateLang]);

  useEffect(() => {
    if (assistantAgentId !== "none") return;
    if (!assistants.length) return;
    const first = assistants[0]?.id;
    if (!first) return;
    setAssistantAgentId(String(first));
  }, [assistants.length]);

  const selectedAssistant = useMemo(() => {
    const id = parseInt(assistantAgentId, 10);
    if (!Number.isFinite(id)) return null;
    return assistants.find((a) => a.id === id) ?? null;
  }, [assistantAgentId, assistants]);

  const [proposal, setProposal] = useState<{
    suggestedBy: { agentId: number; name: string; role: string };
    action: DraftAssistAction;
    draft: { subject: string; body: string };
  } | null>(null);
  const [lastAction, setLastAction] = useState<DraftAssistAction>("suggest_draft");

  const assistMutation = useMutation({
    mutationFn: async (action: DraftAssistAction) => {
      const id = parseInt(assistantAgentId, 10);
      if (!Number.isFinite(id)) throw new Error("Select an assistant");
      if (assistantAgentId === "none") throw new Error("Select an assistant");
      if (!selectedAssistant?.policy?.canSuggestDrafts) throw new Error("This assistant cannot suggest drafts");

      const toList = props.to
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      return apiRequest(`/api/mail/assistant/draft?agentKey=${encodeURIComponent(props.agentKey)}`, "POST", {
        assistantAgentId: id,
        action,
        targetLanguage: translateLang,
        useThreadContext,
        useRoleContext,
        useToneGuidelines,
        threadId: props.threadId,
        to: toList,
        subject: props.subject,
        body: props.body,
      }) as Promise<DraftAssistResponse>;
    },
    onSuccess: (data) => {
      setProposal({ suggestedBy: data.suggestedBy, action: data.action, draft: data.draft });
      setLastAction(data.action);
    },
    onError: (err) => {
      toast({
        title: "Assistant unavailable",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="bg-slate-950/40 border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm text-white">Writing assistant</CardTitle>
          <Button size="sm" variant="secondary" onClick={() => setPanelOpen((v) => !v)}>
            {panelOpen ? "Hide" : "Show"}
          </Button>
        </div>
      </CardHeader>
      {panelOpen ? (
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-200">Who should help you?</Label>
            <Select value={assistantAgentId} onValueChange={setAssistantAgentId}>
              <SelectTrigger className="bg-slate-950/40 border-slate-800 text-slate-100">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {assistants.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} — {a.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAssistant ? (
              <div className="text-xs text-slate-400">
                <span className="text-slate-200">{selectedAssistant.name}</span>{" "}
                <span className="text-slate-500">•</span>{" "}
                <span>Reads: {selectedAssistant.policy.readScope === "subject_only" ? "subject only" : "full thread"}</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Context</Label>
            <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
              <div className="text-slate-300">Use previous emails in this thread</div>
              <Switch checked={useThreadContext} onCheckedChange={setUseThreadContext} />
            </div>
            <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
              <div className="text-slate-300">Use my role</div>
              <Switch checked={useRoleContext} onCheckedChange={setUseRoleContext} />
            </div>
            <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
              <div className="text-slate-300">Use company tone guidelines</div>
              <Switch checked={useToneGuidelines} onCheckedChange={setUseToneGuidelines} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Actions</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => assistMutation.mutate("suggest_draft")}
                disabled={assistMutation.isPending || assistantAgentId === "none"}
              >
                Suggest draft
              </Button>
              <Button
                variant="secondary"
                onClick={() => assistMutation.mutate("improve_tone")}
                disabled={assistMutation.isPending || assistantAgentId === "none" || !props.body.trim()}
              >
                Improve tone
              </Button>
              <Button
                variant="secondary"
                onClick={() => assistMutation.mutate("shorter")}
                disabled={assistMutation.isPending || assistantAgentId === "none" || !props.body.trim()}
              >
                Make it shorter
              </Button>
              <Button
                variant="secondary"
                onClick={() => assistMutation.mutate("formal")}
                disabled={assistMutation.isPending || assistantAgentId === "none" || !props.body.trim()}
              >
                More formal
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select value={translateLang} onValueChange={(v) => setTranslateLang(v === "fr" ? "fr" : "en")}>
                <SelectTrigger className="bg-slate-950/40 border-slate-800 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">Translate to EN</SelectItem>
                  <SelectItem value="fr">Translate to FR</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="secondary"
                onClick={() => assistMutation.mutate("translate")}
                disabled={assistMutation.isPending || assistantAgentId === "none" || !props.body.trim()}
              >
                Translate
              </Button>
            </div>
          </div>

          {proposal ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-300">
                  Suggested by{" "}
                  <span className="text-slate-100 font-semibold">{proposal.suggestedBy.name}</span>
                </div>
                <Badge className="bg-white/10 text-white">{proposal.action.replace(/_/g, " ")}</Badge>
              </div>
              <div className="text-xs text-slate-400">Subject</div>
              <div className="text-sm text-slate-100 whitespace-pre-wrap">{proposal.draft.subject || "(no subject)"}</div>
              <div className="text-xs text-slate-400 mt-2">Draft</div>
              <Textarea
                value={proposal.draft.body}
                onChange={(e) =>
                  setProposal((p) => (p ? { ...p, draft: { ...p.draft, body: e.target.value } } : p))
                }
                className="min-h-[120px] bg-slate-950/40 border-slate-800 text-slate-100"
              />
              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={() => {
                    props.onApplyDraft({ subject: proposal.draft.subject, body: proposal.draft.body });
                    toast({ title: "Draft applied", description: "You can edit it before sending." });
                  }}
                >
                  Accept
                </Button>
                <Button variant="secondary" onClick={() => assistMutation.mutate(lastAction)} disabled={assistMutation.isPending}>
                  Regenerate
                </Button>
                <Button variant="secondary" onClick={() => setProposal(null)} disabled={assistMutation.isPending}>
                  Discard
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              Suggestions appear here. Nothing is sent automatically.
            </div>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

