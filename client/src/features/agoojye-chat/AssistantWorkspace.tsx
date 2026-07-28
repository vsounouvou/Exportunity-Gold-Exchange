import {
  Archive,
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  Copy,
  FileText,
  History,
  Loader2,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useToast } from "@/hooks/use-toast";

import { chatApi, streamAssistantMessage } from "./api";
import type {
  AiAction,
  AiContext,
  AiConversation,
  AiMessage,
  AiSource,
} from "./types";

type BootstrapLike = {
  member: {
    id: number;
    displayName: string;
    firstName?: string;
    role?: string;
    onboardingProgress?: number;
  };
  navigation: {
    administration: boolean;
    mobility: boolean;
  };
};

function formatConversationDate(value: string) {
  const date = new Date(value);
  if (date.toDateString() === new Date().toDateString()) {
    return new Intl.DateTimeFormat("fr-BJ", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Porto-Novo",
    }).format(date);
  }
  return new Intl.DateTimeFormat("fr-BJ", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(date);
}

function Markdown({ children }: { children: string }) {
  return (
    <div className="agoojye-assistant-markdown text-sm leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: linkChildren, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#805f12] underline underline-offset-2"
            >
              {linkChildren}
            </a>
          ),
          code: ({ children: codeChildren, className, ...props }) => (
            <code
              {...props}
              className={`${className || ""} bg-black/[0.06] px-1 py-0.5 font-mono text-[0.9em]`}
            >
              {codeChildren}
            </code>
          ),
          pre: ({ children: preChildren }) => (
            <pre className="my-3 max-w-full overflow-x-auto bg-[#171a18] p-4 text-xs leading-6 text-white">
              {preChildren}
            </pre>
          ),
          table: ({ children: tableChildren }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{tableChildren}</table>
            </div>
          ),
          th: ({ children: cellChildren }) => (
            <th className="border border-black/10 bg-black/[0.04] p-2 text-left">{cellChildren}</th>
          ),
          td: ({ children: cellChildren }) => (
            <td className="border border-black/10 p-2">{cellChildren}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function SourceList({
  sources,
  onOpen,
}: {
  sources: AiSource[];
  onOpen: (sources: AiSource[]) => void;
}) {
  if (!sources.length) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(sources)}
      className="mt-3 flex min-h-9 items-center gap-2 text-xs font-semibold text-[#805f12] hover:underline"
    >
      <FileText className="h-3.5 w-3.5" />
      {sources.length} source{sources.length > 1 ? "s" : ""} autorisée{sources.length > 1 ? "s" : ""}
    </button>
  );
}

function ActionCard({
  action,
  onApprove,
  onReject,
  pending,
}: {
  action: AiAction;
  onApprove: () => void;
  onReject: () => void;
  pending: boolean;
}) {
  return (
    <div className="mt-3 border-l-2 border-[#d3a72f] bg-[#f6f3e8] p-3">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center bg-[#d3a72f] text-[#17130b]">
          <Check className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">Action proposée</p>
          <p className="mt-1 text-xs leading-5 text-black/60">{action.label}</p>
          {action.status === "proposed" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={onApprove}
                className="min-h-9 bg-[#174e36] px-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Validation…" : "Confirmer"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onReject}
                className="min-h-9 border border-black/15 px-3 text-xs font-semibold disabled:opacity-50"
              >
                Refuser
              </button>
            </div>
          ) : (
            <p
              className={`mt-2 text-xs font-semibold ${
                action.status === "completed" ? "text-emerald-700" : "text-black/45"
              }`}
            >
              {action.status === "completed" ? "Action exécutée après validation" : "Proposition refusée"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AssistantWorkspace({ data }: { data: BootstrapLike }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState(
    new URLSearchParams(window.location.search).get("conversation") || "",
  );
  const [query, setQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [activeSources, setActiveSources] = useState<AiSource[]>([]);
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamError, setStreamError] = useState("");
  const [pendingActionId, setPendingActionId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const contextsQuery = useQuery<{ ok: boolean; items: AiContext[] }>({
    queryKey: ["/api/agoojye/chat/member/ai/contexts"],
    queryFn: () => chatApi("/api/agoojye/chat/member/ai/contexts"),
    staleTime: 60_000,
  });
  const conversationsQuery = useQuery<{ ok: boolean; items: AiConversation[] }>({
    queryKey: ["/api/agoojye/chat/member/ai/conversations"],
    queryFn: () => chatApi("/api/agoojye/chat/member/ai/conversations"),
  });
  const conversation = conversationsQuery.data?.items.find(
    (item) => item.id === conversationId,
  );
  const messagesQuery = useQuery<{
    ok: boolean;
    conversation: AiConversation;
    items: AiMessage[];
  }>({
    queryKey: ["/api/agoojye/chat/member/ai/conversations", conversationId, "messages"],
    queryFn: () =>
      chatApi(`/api/agoojye/chat/member/ai/conversations/${conversationId}/messages`),
    enabled: Boolean(conversationId),
  });
  const messages = messagesQuery.data?.items || [];

  const defaultContext = contextsQuery.data?.items[0] || {
    type: "personal" as const,
    id: null,
    label: "Espace personnel",
    description: "Vos informations autorisées",
  };

  const createConversation = useMutation({
    mutationFn: (context: AiContext) =>
      chatApi<{ item: AiConversation }>("/api/agoojye/chat/member/ai/conversations", {
        method: "POST",
        body: JSON.stringify({
          title: "Nouvelle conversation",
          contextType: context.type,
          contextId: context.id || null,
          contextLabel: context.label,
        }),
      }),
    onSuccess: async (payload) => {
      setConversationId(payload.item.id);
      setHistoryOpen(false);
      setContextPickerOpen(false);
      await conversationsQuery.refetch();
      const url = new URL(window.location.href);
      url.searchParams.set("conversation", payload.item.id);
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  });

  useEffect(() => {
    if (conversationId || conversationsQuery.isLoading) return;
    const firstActive = conversationsQuery.data?.items.find((item) => item.status === "active");
    if (firstActive) {
      setConversationId(firstActive.id);
      return;
    }
    if (contextsQuery.data?.items.length && !createConversation.isPending) {
      createConversation.mutate(defaultContext);
    }
  }, [
    conversationId,
    conversationsQuery.data,
    conversationsQuery.isLoading,
    contextsQuery.data,
  ]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(220, Math.max(52, textarea.scrollHeight))}px`;
  }, [query]);

  const scrollBottom = () => {
    requestAnimationFrame(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTo({
          top: scrollerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    });
  };
  useEffect(scrollBottom, [messages.length, streamText]);

  const startStream = async (submittedQuery: string, parentMessageId?: string | null) => {
    if (!conversationId || streaming) return;
    setStreaming(true);
    setStreamText("");
    setStreamError("");
    setQuery("");
    const optimisticUser: AiMessage = {
      id: `optimistic-user-${Date.now()}`,
      conversationId,
      role: "user",
      content: submittedQuery,
      sources: [],
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    queryClient.setQueryData<any>(
      ["/api/agoojye/chat/member/ai/conversations", conversationId, "messages"],
      (current: any) =>
        current
          ? { ...current, items: [...current.items, optimisticUser] }
          : {
              ok: true,
              conversation,
              items: [optimisticUser],
            },
    );
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamAssistantMessage(
        conversationId,
        { query: submittedQuery, parentMessageId },
        {
          onUserMessage: ({ item, title }) => {
            queryClient.setQueryData<any>(
              ["/api/agoojye/chat/member/ai/conversations", conversationId, "messages"],
              (current: any) =>
                current
                  ? {
                      ...current,
                      conversation: current.conversation
                        ? { ...current.conversation, title }
                        : current.conversation,
                      items: current.items.map((message: AiMessage) =>
                        message.id === optimisticUser.id ? item : message,
                      ),
                    }
                  : current,
            );
          },
          onDelta: ({ text }) => setStreamText((current) => current + text),
          onComplete: ({ item }) => {
            queryClient.setQueryData<any>(
              ["/api/agoojye/chat/member/ai/conversations", conversationId, "messages"],
              (current: any) =>
                current ? { ...current, items: [...current.items, item] } : current,
            );
            setStreamText("");
          },
        },
        controller.signal,
      );
      await conversationsQuery.refetch();
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setStreamError(error instanceof Error ? error.message : "La réponse a été interrompue.");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      void messagesQuery.refetch();
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) void startStream(query.trim());
  };

  const mutateConversation = async (values: Partial<AiConversation>) => {
    if (!conversationId) return;
    await chatApi(`/api/agoojye/chat/member/ai/conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    });
    await conversationsQuery.refetch();
  };

  const feedback = async (message: AiMessage, value: "positive" | "negative" | "none") => {
    await chatApi(`/api/agoojye/chat/member/ai/messages/${message.id}/feedback`, {
      method: "PATCH",
      body: JSON.stringify({ feedback: value }),
    });
    void messagesQuery.refetch();
  };

  const action = async (item: AiAction, decision: "approve" | "reject") => {
    setPendingActionId(item.id);
    try {
      await chatApi(`/api/agoojye/chat/member/ai/actions/${item.id}/${decision}`, {
        method: "POST",
      });
      toast({
        title: decision === "approve" ? "Action confirmée" : "Proposition refusée",
        description:
          decision === "approve"
            ? "La tâche est maintenant disponible dans votre espace de travail."
            : undefined,
      });
      await messagesQuery.refetch();
    } catch (error) {
      toast({
        title: "Action non traitée",
        description: error instanceof Error ? error.message : "Réessayez.",
        variant: "destructive",
      });
    } finally {
      setPendingActionId("");
    }
  };

  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const firstName =
    data.member.firstName || data.member.displayName?.split(/\s+/)[0] || "membre";
  const suggestedPrompts =
    Number(data.member.onboardingProgress || 100) < 100
      ? [
          "Aide-moi à terminer mon accueil.",
          "Quelles sont mes premières priorités ?",
          "Quels documents dois-je consulter ?",
          "Qui est mon responsable ?",
        ]
      : data.navigation.administration
        ? [
            "Donne-moi la synthèse de direction.",
            "Quelles tâches sont en retard ?",
            "Montre-moi les risques critiques.",
            "Prépare mon rapport d'activité.",
          ]
        : [
            "Que dois-je traiter aujourd'hui ?",
            "Qu'est-ce qui est en retard ?",
            "Quelle est ma prochaine réunion ?",
            "Prépare mon rapport d'activité.",
          ];

  return (
    <div className="grid h-[calc(100dvh-132px)] min-h-[500px] overflow-hidden bg-white lg:h-[calc(100dvh-64px)] lg:min-h-[560px] lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside
        className={`border-r border-black/10 bg-[#f5f5f1] ${
          historyOpen ? "fixed inset-y-0 left-0 z-50 flex w-[min(320px,92vw)]" : "hidden lg:flex"
        } flex-col lg:static lg:w-auto`}
      >
        <header className="border-b border-black/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-[#805f12]">
                Assistant central
              </p>
              <h1 className="mt-1 text-lg font-semibold">Conversations</h1>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="grid h-10 w-10 place-items-center lg:hidden"
              aria-label="Fermer l'historique"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setContextPickerOpen(true)}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 bg-[#174e36] px-3 text-xs font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Nouvelle conversation
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {conversationsQuery.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse bg-black/[0.05]" />
              ))}
            </div>
          ) : (
            conversationsQuery.data?.items
              .filter((item) => item.status === "active")
              .map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setConversationId(item.id);
                    setHistoryOpen(false);
                    const url = new URL(window.location.href);
                    url.searchParams.set("conversation", item.id);
                    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
                  }}
                  className={`grid min-h-16 w-full grid-cols-[1fr_auto] gap-3 border-b border-black/[0.06] px-4 py-3 text-left ${
                    item.id === conversationId ? "bg-white" : "hover:bg-white/70"
                  }`}
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-xs">{item.title}</strong>
                    <span className="mt-1 flex items-center gap-1 truncate text-[11px] text-black/50">
                      {item.pinned ? <Pin className="h-3 w-3" /> : null}
                      {item.contextLabel}
                    </span>
                  </span>
                  <span className="text-[11px] text-black/50">
                    {formatConversationDate(item.updatedAt)}
                  </span>
                </button>
              ))
          )}
        </div>
        <footer className="border-t border-black/10 p-4">
          <p className="text-[11px] leading-5 text-black/55">
            Les conversations sont privées et persistantes. AGOOJIYE consulte uniquement votre
            périmètre autorisé.
          </p>
        </footer>
      </aside>

      {historyOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setHistoryOpen(false)}
          aria-label="Fermer l'historique"
        />
      ) : null}

      <main className="flex min-h-0 min-w-0 flex-col bg-[#fbfbf8]">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-black/10 bg-white px-3 sm:px-4">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="grid h-10 w-10 place-items-center lg:hidden"
            aria-label="Ouvrir l'historique"
          >
            <History className="h-5 w-5" />
          </button>
          <span className="grid h-9 w-9 shrink-0 place-items-center bg-[#d3a72f] text-[#17130b]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">AGOOJIYE — Assistant IA</h2>
            <button
              type="button"
              onClick={() => setContextPickerOpen(true)}
              className="flex max-w-full items-center gap-1 text-[11px] text-black/45"
            >
              <span className="truncate">{conversation?.contextLabel || "Espace personnel"}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {conversation ? (
              <button
                type="button"
                onClick={() => void mutateConversation({ pinned: !conversation.pinned })}
                className="grid h-10 w-10 place-items-center hover:bg-black/[0.04]"
                title={conversation.pinned ? "Retirer l'épingle" : "Épingler"}
                aria-label={conversation.pinned ? "Retirer l'épingle" : "Épingler"}
              >
                <Pin className={`h-4 w-4 ${conversation.pinned ? "fill-[#d3a72f] text-[#8a6615]" : ""}`} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSourcesOpen((value) => !value)}
              className="grid h-10 w-10 place-items-center hover:bg-black/[0.04]"
              title="Sources"
              aria-label="Afficher les sources"
            >
              {sourcesOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
            {conversation ? (
              <details className="relative">
                <summary
                  className="grid h-10 w-10 cursor-pointer list-none place-items-center hover:bg-black/[0.04]"
                  aria-label="Options de conversation"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </summary>
                <div className="absolute right-0 top-11 z-30 min-w-48 border border-black/10 bg-white p-1 text-xs shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      const next = window.prompt("Nom de la conversation", conversation.title);
                      if (next?.trim()) void mutateConversation({ title: next.trim() });
                    }}
                    className="block min-h-9 w-full px-3 text-left hover:bg-black/[0.04]"
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    onClick={() => void mutateConversation({ status: "archived" })}
                    className="flex min-h-9 w-full items-center gap-2 px-3 text-left hover:bg-black/[0.04]"
                  >
                    <Archive className="h-3.5 w-3.5" /> Archiver
                  </button>
                </div>
              </details>
            ) : null}
          </div>
        </header>

        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
          {messagesQuery.isLoading ? (
            <div className="mx-auto max-w-3xl space-y-5 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className={`h-20 animate-pulse bg-black/[0.05] ${
                    index % 2 ? "w-4/5" : "ml-auto w-2/3"
                  }`}
                />
              ))}
            </div>
          ) : !messages.length && !streaming ? (
            <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-5 py-10">
              <span className="grid h-14 w-14 place-items-center bg-[#d3a72f] text-[#17130b]">
                <Sparkles className="h-6 w-6" />
              </span>
              <h2 className="mt-5 text-2xl font-semibold">Bonjour {firstName}.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">
                Je peux rechercher, résumer et préparer votre travail à partir des informations que
                vous êtes autorisé à consulter.
              </p>
              <div className="mt-7 grid gap-2 sm:grid-cols-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    onClick={() => setQuery(prompt)}
                    className="min-h-16 border border-black/10 bg-white px-4 py-3 text-left text-sm hover:border-[#b58a24]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`mb-7 flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center text-xs font-bold ${
                      message.role === "assistant"
                        ? "bg-[#d3a72f] text-[#17130b]"
                        : "bg-[#174e36] text-white"
                    }`}
                  >
                    {message.role === "assistant" ? "AI" : "VO"}
                  </span>
                  <div
                    className={`min-w-0 max-w-[88%] ${
                      message.role === "user"
                        ? "bg-[#174e36] px-4 py-3 text-white"
                        : "flex-1 border-l-2 border-[#d3a72f] bg-white px-5 py-4"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <Markdown>{message.content}</Markdown>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                    )}
                    {message.role === "assistant" ? (
                      <>
                        <SourceList
                          sources={message.sources || []}
                          onOpen={(sources) => {
                            setActiveSources(sources);
                            setSourcesOpen(true);
                          }}
                        />
                        {(message.proposedActions || []).map((item) => (
                          <ActionCard
                            key={item.id}
                            action={item}
                            pending={pendingActionId === item.id}
                            onApprove={() => void action(item, "approve")}
                            onReject={() => void action(item, "reject")}
                          />
                        ))}
                        <div className="mt-4 flex items-center gap-1 border-t border-black/[0.07] pt-2">
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(message.content)}
                            className="grid h-8 w-8 place-items-center hover:bg-black/[0.04]"
                            title="Copier"
                            aria-label="Copier la réponse"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void feedback(
                                message,
                                message.feedback === "positive" ? "none" : "positive",
                              )
                            }
                            className={`grid h-8 w-8 place-items-center hover:bg-black/[0.04] ${
                              message.feedback === "positive" ? "text-emerald-700" : ""
                            }`}
                            title="Réponse utile"
                            aria-label="Réponse utile"
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void feedback(
                                message,
                                message.feedback === "negative" ? "none" : "negative",
                              )
                            }
                            className={`grid h-8 w-8 place-items-center hover:bg-black/[0.04] ${
                              message.feedback === "negative" ? "text-red-700" : ""
                            }`}
                            title="Réponse à améliorer"
                            aria-label="Réponse à améliorer"
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </button>
                          {message.provider ? (
                            <span className="ml-auto text-[11px] text-black/45">
                              Réponse générée · vérifiez les décisions sensibles
                            </span>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
              {streaming ? (
                <article className="mb-7 flex gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center bg-[#d3a72f] text-xs font-bold text-[#17130b]">
                    AI
                  </span>
                  <div className="min-w-0 flex-1 border-l-2 border-[#d3a72f] bg-white px-5 py-4">
                    {streamText ? (
                      <Markdown>{streamText}</Markdown>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-black/45" role="status">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        AGOOJIYE consulte votre contexte autorisé…
                      </div>
                    )}
                  </div>
                </article>
              ) : null}
              {streamError ? (
                <div className="mb-6 border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
                  <p>{streamError}</p>
                  {lastUserMessage ? (
                    <button
                      type="button"
                      onClick={() => void startStream(lastUserMessage.content, lastUserMessage.id)}
                      className="mt-2 inline-flex min-h-9 items-center gap-2 font-semibold"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Réessayer
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <form onSubmit={submit} className="shrink-0 border-t border-black/10 bg-white p-3 sm:px-5 sm:py-4">
          <div className="mx-auto max-w-3xl border border-black/15 focus-within:border-[#8a6615]">
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (query.trim() && !streaming) void startStream(query.trim());
                }
              }}
              rows={2}
              placeholder={`Demander à AGOOJIYE dans « ${conversation?.contextLabel || "Espace personnel"} »`}
              aria-label="Votre demande à AGOOJIYE"
              className="block min-h-[52px] w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 outline-none"
            />
            <div className="flex min-h-11 items-center border-t border-black/[0.07] px-2">
              <button
                type="button"
                onClick={() => setContextPickerOpen(true)}
                className="flex min-h-9 items-center gap-2 px-2 text-[11px] text-black/50 hover:bg-black/[0.04]"
              >
                <Bot className="h-3.5 w-3.5" />
                <span className="max-w-44 truncate">{conversation?.contextLabel || "Contexte"}</span>
              </button>
              {streaming ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="ml-auto grid h-9 w-9 place-items-center border border-black/15"
                  title="Arrêter"
                  aria-label="Arrêter la génération"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!query.trim() || !conversationId}
                  className="ml-auto grid h-9 w-9 place-items-center bg-[#174e36] text-white disabled:opacity-35"
                  title="Envoyer"
                  aria-label="Envoyer"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] leading-4 text-black/50">
            AGOOJIYE peut se tromper. Toute action sensible reste soumise à votre confirmation.
          </p>
        </form>
      </main>

      {contextPickerOpen ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4">
          <section className="max-h-[80dvh] w-full max-w-xl overflow-hidden bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase text-[#805f12]">Contexte</p>
                <h2 className="mt-1 font-semibold">Nouvelle conversation</h2>
              </div>
              <button
                type="button"
                onClick={() => setContextPickerOpen(false)}
                className="grid h-10 w-10 place-items-center"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="max-h-[60dvh] overflow-y-auto p-2">
              {(contextsQuery.data?.items || []).map((context) => (
                <button
                  type="button"
                  key={`${context.type}:${context.id || "default"}`}
                  onClick={() => createConversation.mutate(context)}
                  disabled={createConversation.isPending}
                  className="flex min-h-16 w-full items-start gap-3 border-b border-black/[0.07] px-3 py-3 text-left hover:bg-black/[0.03] disabled:opacity-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center bg-[#f1ecdb]">
                    {context.type === "project" ? <FileText className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-[#805f12]" />}
                  </span>
                  <span>
                    <strong className="block text-sm">{context.label}</strong>
                    <span className="mt-1 block line-clamp-2 text-xs leading-5 text-black/45">
                      {context.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {sourcesOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] bg-black/30"
            onClick={() => setSourcesOpen(false)}
            aria-label="Fermer les sources"
          />
          <aside className="fixed inset-y-0 right-0 z-[80] w-[min(380px,94vw)] overflow-y-auto border-l border-black/10 bg-[#f5f4ef] shadow-xl">
            <header className="flex h-16 items-center justify-between border-b border-black/10 px-4">
              <div>
                <h2 className="text-sm font-semibold">Sources autorisées</h2>
                <p className="text-[11px] text-black/50">Contexte utilisé pour la réponse</p>
              </div>
              <button
                type="button"
                onClick={() => setSourcesOpen(false)}
                className="grid h-10 w-10 place-items-center"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="p-3">
              {activeSources.length ? (
                activeSources.map((source, index) => (
                  <a
                    key={`${source.type}:${source.title}:${index}`}
                    href={source.href || "#"}
                    className="block border-b border-black/10 bg-white px-4 py-3 hover:border-[#b58a24]"
                  >
                    <span className="text-[11px] font-bold uppercase text-[#805f12]">{source.type}</span>
                    <strong className="mt-1 block text-sm">{source.title}</strong>
                    {source.detail ? (
                      <span className="mt-1 block text-xs leading-5 text-black/45">{source.detail}</span>
                    ) : null}
                  </a>
                ))
              ) : (
                <div className="px-4 py-12 text-center">
                  <FileText className="mx-auto h-6 w-6 text-black/25" />
                  <p className="mt-3 text-sm font-semibold">Aucune source sélectionnée</p>
                  <p className="mt-1 text-xs leading-5 text-black/45">
                    Ouvrez les sources depuis une réponse de l'assistant.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
