import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { useTenant } from "@/lib/tenant";
import { workspaceLoginUrl } from "@/lib/workspaceEntry";
import { conversationQueryKey, createTassiConversationApi } from "@/lib/tassiConversationApi.js";

const conversationApi = createTassiConversationApi(apiRequest);

function Conversation({ tenantId, userId, tenantName }: { tenantId: number; userId: number; tenantName: string }) {
  const [draft, setDraft] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const sending = useRef(false);
  const queryClient = useQueryClient();
  const prefix = conversationQueryKey(tenantId, userId);
  const threads = useQuery({
    queryKey: [...prefix, "threads"],
    queryFn: conversationApi.list,
    retry: false,
  });
  const ownThreads = (threads.data?.threads || []).filter((thread) =>
    /tassi|chairman[ _]assistant/i.test(
      String(thread.assistantDisplayName || "") + " " + String(thread.assistantRole || ""),
    ),
  );
  const activeThread = ownThreads.find((thread) => thread.id === selectedThreadId) || ownThreads[0] || null;
  const messages = useQuery({
    queryKey: [...prefix, activeThread?.id || 0, "messages"],
    queryFn: () => conversationApi.messages(activeThread!.id),
    enabled: Boolean(activeThread) && !threads.isError,
    retry: false,
  });
  const send = useMutation({
    mutationFn: (content: string) => conversationApi.send(content, activeThread?.id),
    retry: false,
    onSuccess: async (response) => {
      setDraft("");
      setSelectedThreadId(response.thread.id);
      await queryClient.invalidateQueries({ queryKey: prefix });
    },
  });
  const submit = async () => {
    if (sending.current || !draft.trim() || threads.isError || messages.isError) return;
    sending.current = true;
    try {
      await send.mutateAsync(draft);
    } catch {
      // Retain the draft. The existing API may have recorded the request;
      // never retry an uncertain send automatically.
    } finally {
      sending.current = false;
    }
  };
  const readError = threads.error || messages.error;
  const denied = /403|forbidden|access required|access denied/i.test(String(readError || ""));
  const busy = threads.isFetching || messages.isFetching || send.isPending;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 bg-white p-4 text-slate-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <h1 className="text-xl font-semibold">Tassi</h1>
          <p className="text-sm text-slate-600">{tenantName} · Vos conversations autorisées</p>
        </div>
        <TenantSwitcher />
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="tassi-thread" className="text-sm">Conversation</label>
        <select
          id="tassi-thread"
          className="min-h-11 max-w-full rounded border p-2"
          value={activeThread?.id || ""}
          disabled={busy || !ownThreads.length}
          onChange={(event) => setSelectedThreadId(Number(event.target.value))}
        >
          {!ownThreads.length ? <option value="">Nouvelle conversation</option> : null}
          {ownThreads.map((thread) => (
            <option key={thread.id} value={thread.id}>{thread.assistantDisplayName || "Tassi"} · #{thread.id}</option>
          ))}
        </select>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => { void queryClient.invalidateQueries({ queryKey: prefix }); }}
        >
          {threads.isFetching || messages.isFetching ? "Actualisation…" : "Actualiser mes conversations"}
        </Button>
      </div>
      {readError ? (
        <p role="alert" className="rounded border border-red-300 p-3 text-sm">
          {denied
            ? "Votre compte n’a pas accès à cette conversation Tassi. Aucun droit n’a été modifié."
            : "Impossible de charger vos conversations. Réessayez avec Actualiser mes conversations."}
        </p>
      ) : null}
      <section aria-label="Conversation avec Tassi" aria-busy={busy} className="flex-1 space-y-3">
        {threads.isPending || (activeThread && messages.isPending) ? <p role="status">Chargement de la conversation…</p> : null}
        {!threads.isPending && !readError && !activeThread ? (
          <p>Aucune conversation Tassi enregistrée. Votre premier message en ouvrira une.</p>
        ) : null}
        {(messages.data?.messages || []).map((message) => (
          <article key={message.id} className="rounded border p-3">
            <p className="mb-1 text-xs text-slate-600">
              {message.senderName || (message.senderType === "user" ? "Vous" : message.senderType === "assistant" ? "Tassi" : "Système")}
              {" · "}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
            </p>
            <p className="whitespace-pre-wrap">{message.content}</p>
          </article>
        ))}
      </section>
      {send.isError ? (
        <p role="alert" className="text-sm text-red-700">
          Envoi non confirmé. Actualisez l’historique avant de réessayer ; le brouillon est conservé.
        </p>
      ) : null}
      <form className="sticky bottom-0 space-y-2 border-t bg-white py-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label htmlFor="tassi-message" className="text-sm font-medium">Demander à Tassi</label>
        <textarea
          id="tassi-message"
          rows={3}
          className="w-full rounded border p-3"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={busy || Boolean(readError)}
        />
        <Button type="submit" disabled={busy || Boolean(readError) || !draft.trim()}>
          {send.isPending ? "Envoi…" : "Envoyer"}
        </Button>
      </form>
    </main>
  );
}

export default function TassiConversationPage() {
  const { isAuthenticated, isGuest, user } = useSession();
  const { tenant } = useTenant();
  const [location] = useLocation();
  const destination = typeof window === "undefined"
    ? location
    : window.location.pathname + window.location.search + window.location.hash;
  if (!isAuthenticated || isGuest) return <Redirect to={workspaceLoginUrl(destination)} />;
  if (user?.mustChangePassword) return <Redirect to="/admin/password" />;
  const tenantId = Number(tenant?.id);
  const userId = Number(user?.id);
  if (!(tenantId > 0 && userId > 0)) return <p role="alert">Espace ou compte non identifié. Aucune conversation n’a été ouverte.</p>;
  return <Conversation key={tenantId + ":" + userId} tenantId={tenantId} userId={userId} tenantName={tenant.name} />;
}
