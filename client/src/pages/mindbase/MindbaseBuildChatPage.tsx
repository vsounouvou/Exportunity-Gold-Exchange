import { FormEvent, useMemo, useState } from "react";
import { Link } from "wouter";

import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import MindbaseLayout from "./MindbaseLayout";
import { mindbasePath } from "./routing";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type ExtractedDraft = {
  displayName?: string | null;
  roleOrCompany?: string | null;
  goals?: string[];
  projects?: string[];
  preferredAssistantType?: string | null;
};

type IngestResponse = {
  ok: boolean;
  conversationId: string;
  assistantReply: string;
  extracted: ExtractedDraft;
  messageCount: number;
  readyToFinalize: boolean;
};

type FinalizeResponse = {
  ok: boolean;
  message: string;
  mindbase?: { id: string; title: string; slug: string };
  agents?: Array<{ id: string; name: string; slug: string }>;
};

const INITIAL_MESSAGE =
  "Tell me what you're building and what you want help with.";

function createConversationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mb-onboard-${Date.now()}`;
}

export default function MindbaseBuildChatPage() {
  const { isAuthenticated, isGuest } = useSession();
  const [conversationId] = useState(() => createConversationId());
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "assistant-0", role: "assistant", text: INITIAL_MESSAGE },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [readyToFinalize, setReadyToFinalize] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [extracted, setExtracted] = useState<ExtractedDraft>({});
  const [finalized, setFinalized] = useState<FinalizeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasProfileSignal = useMemo(
    () =>
      Boolean(
        extracted.displayName ||
          extracted.roleOrCompany ||
          (extracted.goals || []).length ||
          (extracted.projects || []).length ||
          extracted.preferredAssistantType,
      ),
    [extracted],
  );

  async function submitMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || finalizing) return;

    setError(null);
    setSending(true);
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const res = (await apiRequest("/api/onboarding/ingest", "POST", {
        conversationId,
        message: text,
      })) as IngestResponse;

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: String(res?.assistantReply || "Got it. Tell me a bit more."),
        },
      ]);
      setExtracted(res?.extracted || {});
      setReadyToFinalize(Boolean(res?.readyToFinalize));
      setMessageCount(Number(res?.messageCount || 0));
    } catch (err: any) {
      setError(String(err?.message || "Unable to process onboarding message."));
    } finally {
      setSending(false);
    }
  }

  async function finalizeMindbase() {
    if (finalizing) return;
    setFinalizing(true);
    setError(null);
    try {
      const res = (await apiRequest("/api/onboarding/finalize", "POST", {
        conversationId,
      })) as FinalizeResponse;
      setFinalized(res);
    } catch (err: any) {
      setError(String(err?.message || "Unable to finalize MindBase."));
    } finally {
      setFinalizing(false);
    }
  }

  if (!isAuthenticated || isGuest) {
    return (
      <MindbaseLayout>
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
          <section className="rounded-xl border border-[var(--border)] bg-white p-6">
            <h1 className="text-2xl font-semibold text-[var(--text)]" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
              Build your MindBase in chat
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Sign in to start chat-first onboarding.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/login?next=${encodeURIComponent(mindbasePath("/build/chat"))}`}>
                <a className="inline-flex items-center justify-center rounded-[10px] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primaryHover)]">
                  Sign in
                </a>
              </Link>
              <Link href={mindbasePath("/build/advanced")}>
                <a className="inline-flex items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--chipBg)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-slate-200">
                  Advanced
                </a>
              </Link>
            </div>
          </section>
        </main>
      </MindbaseLayout>
    );
  }

  return (
    <MindbaseLayout>
      <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="flex min-h-[70vh] flex-col rounded-xl border border-[var(--border)] bg-white">
          <header className="border-b border-[var(--border)] px-4 py-3">
            <h1 className="text-xl font-semibold text-[var(--text)]" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
              Build your MindBase
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Chat-first onboarding. No form required.
            </p>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  message.role === "assistant"
                    ? "border border-[var(--border)] bg-[var(--chipBg)] text-[var(--text)]"
                    : "ml-auto bg-[var(--primary)] text-white"
                }`}
              >
                {message.text}
              </div>
            ))}
            {sending ? (
              <div className="max-w-[85%] rounded-xl border border-[var(--border)] bg-[var(--chipBg)] px-3 py-2 text-sm text-[var(--muted)]">
                Thinking...
              </div>
            ) : null}
          </div>

          <form onSubmit={submitMessage} className="border-t border-[var(--border)] p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type your message..."
                className="h-11 flex-1 rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="h-11 rounded-[10px] bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primaryHover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
            {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
          </form>
        </section>

        <aside className="space-y-3">
          <section className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="text-sm font-semibold text-[var(--text)]">MindMap Draft</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Conversation messages: {messageCount}
            </p>
            {!hasProfileSignal ? (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Keep chatting. We are extracting your profile signals.
              </p>
            ) : (
              <div className="mt-3 space-y-2 text-sm text-[var(--text)]">
                {extracted.displayName ? <p><span className="text-[var(--muted)]">Name:</span> {extracted.displayName}</p> : null}
                {extracted.roleOrCompany ? <p><span className="text-[var(--muted)]">Role/Company:</span> {extracted.roleOrCompany}</p> : null}
                {(extracted.goals || []).length ? <p><span className="text-[var(--muted)]">Goals:</span> {extracted.goals?.join(", ")}</p> : null}
                {(extracted.projects || []).length ? <p><span className="text-[var(--muted)]">Projects:</span> {extracted.projects?.join(", ")}</p> : null}
                {extracted.preferredAssistantType ? (
                  <p><span className="text-[var(--muted)]">Preferred assistant:</span> {extracted.preferredAssistantType}</p>
                ) : null}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="text-sm font-semibold text-[var(--text)]">Next step</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              After 5 to 10 useful messages, finalize your MindBase.
            </p>
            <button
              type="button"
              disabled={!readyToFinalize || finalizing || Boolean(finalized)}
              onClick={finalizeMindbase}
              className="mt-3 w-full rounded-[10px] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primaryHover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {finalizing ? "Creating..." : "Create my MindBase"}
            </button>
            <Link href={mindbasePath("/build/advanced")}>
              <a className="mt-2 inline-block text-sm font-medium text-[var(--primary)] hover:underline">
                Use Advanced setup
              </a>
            </Link>
            {finalized?.ok ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <p className="font-semibold">{finalized.message}</p>
                {(finalized.agents || []).length ? (
                  <p className="mt-1">
                    Agents: {finalized.agents?.map((item) => item.name).join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        </aside>
      </main>
    </MindbaseLayout>
  );
}

