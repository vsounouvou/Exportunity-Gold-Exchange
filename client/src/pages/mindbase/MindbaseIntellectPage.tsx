import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import MindbaseLayout from "./MindbaseLayout";
import { mindbasePath } from "./routing";

type IntellectDetail = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  category: string;
  tags: string[];
  access_policy: "private" | "public" | "paid";
  price_per_100_messages: number;
  usage_count: number;
  knowledge_files_count: number;
  creator: {
    display_name: string;
    share_slug: string | null;
    verification_status: string;
  } | null;
};

type IntellectDetailPayload = {
  ok: boolean;
  item: IntellectDetail;
};

type ChatReply = {
  ok: boolean;
  conversation_id: string;
  blocked: boolean;
  response: string;
  citations?: Array<{ fileId?: string; filename?: string }>;
  debited?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
};

type ThreadMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  at: string;
  blocked?: boolean;
  citations?: string[];
};

export default function MindbaseIntellectPage({ slug }: { slug: string }) {
  const { isAuthenticated } = useSession();
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [usageInfo, setUsageInfo] = useState<string>("");

  const intellectQuery = useQuery<IntellectDetailPayload>({
    queryKey: [`/api/mindbase/intellects/${encodeURIComponent(slug)}`],
    staleTime: 15_000,
  });

  const intellect = intellectQuery.data?.item ?? null;
  const pricingLabel = useMemo(() => {
    if (!intellect) return "";
    return intellect.access_policy === "paid" ? `${intellect.price_per_100_messages} credits / 100 msgs` : "Free";
  }, [intellect]);

  const canChat = useMemo(() => {
    if (!intellect) return false;
    if (intellect.access_policy === "public" || intellect.access_policy === "paid") return true;
    return isAuthenticated;
  }, [intellect, isAuthenticated]);

  const chatMutation = useMutation({
    mutationFn: async () => {
      if (!intellect) throw new Error("Agent not loaded");
      return apiRequest(`/api/mindbase/intellects/${intellect.id}/chat`, "POST", {
        message,
        conversation_id: conversationId || undefined,
      }) as Promise<ChatReply>;
    },
    onSuccess: (payload) => {
      setConversationId(String(payload.conversation_id || conversationId || ""));
      const now = new Date().toISOString();
      const citationNames = Array.isArray(payload.citations)
        ? payload.citations.map((entry) => String(entry?.filename || "")).filter(Boolean)
        : [];
      setThread((prev) => [
        ...prev,
        { role: "user", content: message, at: now },
        {
          role: payload.blocked ? "system" : "assistant",
          content: payload.response,
          at: now,
          blocked: payload.blocked,
          citations: citationNames,
        },
      ]);
      if (payload?.usage) {
        setUsageInfo(`Tokens: ${payload.usage.totalTokens} (prompt ${payload.usage.promptTokens} / completion ${payload.usage.completionTokens})`);
      }
      setMessage("");
    },
  });

  return (
    <MindbaseLayout>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        {intellectQuery.isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        ) : intellect ? (
          <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-2xl text-slate-900" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
                  {intellect.name}
                </CardTitle>
                <p className="text-slate-600">{intellect.tagline || "Digital expert profile."}</p>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-700">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {intellect.category}
                  </Badge>
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                    {pricingLabel}
                  </Badge>
                  <Badge variant="secondary" className="bg-amber-50 text-amber-700">
                    Rating: N/A
                  </Badge>
                </div>
                <p>{intellect.description || "No description yet."}</p>
                {intellect.creator ? (
                  <div className="text-sm">
                    Owner:{" "}
                    {intellect.creator.share_slug ? (
                      <Link href={mindbasePath(`/c/${intellect.creator.share_slug}`)}>
                        <a className="font-medium text-[#007BFF] hover:underline">{intellect.creator.display_name}</a>
                      </Link>
                    ) : (
                      <span className="font-medium">{intellect.creator.display_name}</span>
                    )}
                    <span className="ml-2 text-xs text-slate-500">({intellect.creator.verification_status})</span>
                  </div>
                ) : null}
                <div className="text-xs text-slate-500">
                  Knowledge files: {intellect.knowledge_files_count} | Usage count: {intellect.usage_count}
                </div>
                {intellect.tags?.length ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {intellect.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="border-slate-300 text-slate-700">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-slate-900">Hire this Agent</CardTitle>
                <p className="text-xs text-slate-500">
                  Replies include filename citations when knowledge files are used.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {thread.length ? (
                    thread.map((entry, idx) => (
                      <div key={`${entry.at}-${idx}`} className="space-y-1">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">{entry.role}</div>
                        <div className="rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-800">
                          {entry.content}
                        </div>
                        {entry.citations?.length ? (
                          <div className="text-[11px] text-emerald-700">Sources: {entry.citations.join(", ")}</div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">Start a conversation to preview this Agent.</div>
                  )}
                </div>
                {usageInfo ? <div className="text-xs text-slate-500">{usageInfo}</div> : null}

                {canChat ? (
                  <div className="space-y-2">
                    <Input
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder="What outcome do you need?"
                      className="border-slate-300 bg-white"
                    />
                    <Button
                      type="button"
                      disabled={!message.trim() || chatMutation.isPending}
                      onClick={() => chatMutation.mutate()}
                      className="bg-[#007BFF] hover:bg-[#006AE0]"
                    >
                      {chatMutation.isPending ? "Sending..." : "Hire / Send"}
                    </Button>
                    {chatMutation.error ? (
                      <div className="text-xs text-red-600">
                        {(chatMutation.error as Error).message || "Unable to send message"}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                    <div>Sign in to access this Agent.</div>
                    <Button size="sm" asChild className="bg-[#007BFF] hover:bg-[#006AE0]">
                      <Link href={`/login?next=${encodeURIComponent(mindbasePath(`/i/${slug}`))}`}>Sign in</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="pt-6 text-sm text-red-700">Unable to load this Agent.</CardContent>
          </Card>
        )}
      </main>
    </MindbaseLayout>
  );
}
