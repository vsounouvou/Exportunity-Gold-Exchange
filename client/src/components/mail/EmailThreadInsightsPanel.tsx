import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type ThreadInsightsResponse = {
  ok: boolean;
  threadId: number;
  summary: { summaryBullets?: string[]; generatedAt?: string } | Record<string, unknown>;
  nextActions: Array<{
    title?: string;
    description?: string;
    draft?: { subject?: string; body?: string };
  }>;
  cached?: boolean;
};

function safeArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

export function EmailThreadInsightsPanel(props: {
  agentKey: string;
  threadId: number | null;
  assistantAgentId: number | null;
  onApplyDraft: (draft: { subject: string; body: string }) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const enabled = !!props.threadId && !!props.assistantAgentId;

  const queryKey = useMemo(
    () => ["mail_thread_insights", props.agentKey, props.threadId, props.assistantAgentId],
    [props.agentKey, props.threadId, props.assistantAgentId],
  );

  const insightsQuery = useQuery<ThreadInsightsResponse>({
    queryKey,
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      return apiRequest(`/api/mail/assistant/thread-insights?agentKey=${encodeURIComponent(props.agentKey)}`, "POST", {
        threadId: props.threadId,
        assistantAgentId: props.assistantAgentId,
      }) as Promise<ThreadInsightsResponse>;
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      toast({ title: "Refresh failed", description: "Could not refresh the summary.", variant: "destructive" });
    },
  });

  const bullets = useMemo(() => {
    const summary = insightsQuery.data?.summary as any;
    const raw = summary?.summaryBullets ?? summary?.bullets ?? [];
    return safeArray(raw).slice(0, 6);
  }, [insightsQuery.data?.summary]);

  const nextActions = useMemo(() => {
    return Array.isArray(insightsQuery.data?.nextActions) ? insightsQuery.data!.nextActions.slice(0, 5) : [];
  }, [insightsQuery.data?.nextActions]);

  if (!enabled) return null;

  return (
    <Card className="bg-slate-950/40 border border-slate-800 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white flex items-center gap-2">
          <span>Conversation summary</span>
          {insightsQuery.data?.cached ? <Badge className="bg-white/10 text-white">cached</Badge> : null}
        </div>
        <Button size="sm" variant="secondary" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
          Refresh
        </Button>
      </div>

      {insightsQuery.isLoading ? (
        <div className="text-sm text-slate-400">Generating summary…</div>
      ) : insightsQuery.isError ? (
        <div className="text-sm text-slate-400">Summary unavailable.</div>
      ) : bullets.length ? (
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-100">
          {bullets.map((b, idx) => (
            <li key={idx}>{b}</li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-slate-400">No summary yet.</div>
      )}

      {nextActions.length ? (
        <div className="pt-1 space-y-2">
          <div className="text-xs text-slate-400">Suggested next actions</div>
          <ScrollArea className="max-h-[180px] pr-2">
            <div className="space-y-2">
              {nextActions.map((a, idx) => {
                const title = String(a.title || `Next action ${idx + 1}`).trim() || `Next action ${idx + 1}`;
                const description = String(a.description || "").trim();
                const subject = String(a.draft?.subject || "").trim();
                const body = String(a.draft?.body || "").trim();
                const canApply = !!(subject || body);

                return (
                  <div key={idx} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-white font-medium">{title}</div>
                      <Button
                        size="sm"
                        onClick={() => props.onApplyDraft({ subject: subject || "(no subject)", body })}
                        disabled={!canApply}
                      >
                        Open draft
                      </Button>
                    </div>
                    {description ? <div className="text-xs text-slate-400 mt-1">{description}</div> : null}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      ) : null}
    </Card>
  );
}

