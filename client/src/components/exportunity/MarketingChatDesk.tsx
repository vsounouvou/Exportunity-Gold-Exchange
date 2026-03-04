import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchTalkLead, sendTalkMessage, startTalkSession, type TalkMessage } from "@/lib/marketing-api";

type TalkIntent = "platform" | "invest" | "run_business" | "gold";

const INTENTS: Array<{ key: TalkIntent; label: string; blurb: string; routeLabel: string; routeHref: string }> = [
  {
    key: "gold",
    label: "Trade gold",
    blurb: "Route me to Bourse de l'Or.",
    routeLabel: "Open Gold Trade",
    routeHref: "https://boursedelor.com",
  },
  {
    key: "run_business",
    label: "Buy products",
    blurb: "Route me to marketplace and retail sellers.",
    routeLabel: "Open Marketplace",
    routeHref: "https://exportunity.net/zone",
  },
  {
    key: "platform",
    label: "Need compliance",
    blurb: "Route me to contracts and compliance workflows.",
    routeLabel: "Open Contracts & Compliance",
    routeHref: "https://exportunity.net/app/contracts",
  },
  {
    key: "invest",
    label: "Open Pro workspace",
    blurb: "Route me to the professional workspace.",
    routeLabel: "Open Pro Workspace",
    routeHref: "https://exportunity.net/pro/",
  },
];

function safeStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeStorageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function renderMessageContent(content: string) {
  const text = String(content || "");
  const parts: Array<{ type: "text" | "link"; value: string }> = [];
  const re = /(https?:\/\/[^\s]+|\/[^\s]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const start = match.index ?? 0;
    const url = match[0] ?? "";
    if (start > lastIndex) parts.push({ type: "text", value: text.slice(lastIndex, start) });
    parts.push({ type: "link", value: url.replace(/[),.?!;:]+$/g, "") });
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) parts.push({ type: "text", value: text.slice(lastIndex) });

  return parts.map((p, idx) =>
    p.type === "link" ? (
      <a
        key={`${p.type}-${idx}`}
        href={p.value}
        target={p.value.startsWith("http") ? "_blank" : undefined}
        rel={p.value.startsWith("http") ? "noreferrer" : undefined}
        className="font-medium text-sky-300 hover:text-sky-200"
      >
        {p.value}
      </a>
    ) : (
      <span key={`${p.type}-${idx}`}>{p.value}</span>
    ),
  );
}

export function MarketingChatDesk({
  variant = "page",
  className,
  autoStart = false,
  hideIntentCards = false,
  inputPlaceholder = "Type your message...",
  systemMessage = "What are you trying to do today?",
}: {
  variant?: "page" | "widget";
  className?: string;
  autoStart?: boolean;
  hideIntentCards?: boolean;
  inputPlaceholder?: string;
  systemMessage?: string;
}) {
  const storageKey = "exportunity_talk_lead_id";
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<TalkIntent | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TalkMessage[]>(() => [{ role: "assistant", content: systemMessage }]);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const attemptedAutoStartRef = useRef(false);

  const isWidget = variant === "widget";
  const introVisible = !leadId && !hideIntentCards;

  const resolveIntentRoute = (value: TalkIntent | null) => {
    if (!value) return null;
    return INTENTS.find((item) => item.key === value) || null;
  };

  const actions = useMemo(() => {
    return [
      { label: "Gold Trade", href: "https://boursedelor.com" },
      { label: "Marketplace", href: "https://exportunity.net/zone" },
      { label: "Pro Workspace", href: "https://exportunity.net/pro/" },
    ];
  }, []);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  useEffect(() => {
    if (!leadId) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [leadId]);

  useEffect(() => {
    let cancelled = false;
    const existing = safeStorageGet(storageKey);
    if (!existing) return;
    setBusy(true);
    setErrorMessage(null);
    fetchTalkLead(existing, { limit: 80 })
      .then((res) => {
        if (cancelled) return;
        const nextLeadId = String(res?.lead?.id || "").trim();
        if (!nextLeadId) throw new Error("missing lead");
        setLeadId(nextLeadId);
        setIntent((res?.lead?.intent as TalkIntent) || null);
        const loaded = Array.isArray(res?.messages) ? (res.messages as TalkMessage[]) : [];
        if (loaded.length) setMessages(loaded);
      })
      .catch(() => {
        safeStorageRemove(storageKey);
        if (!cancelled) setErrorMessage("Previous chat could not be restored. Start a new session.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = async (nextIntent?: TalkIntent) => {
    if (busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await startTalkSession({ intent: nextIntent, sourceUrl: window.location.href });
      const nextLeadId = String(res?.leadId || "").trim();
      const nextMsgs = Array.isArray(res?.messages) ? (res.messages as TalkMessage[]) : [];
      if (!nextLeadId) throw new Error("Failed to start");
      setLeadId(nextLeadId);
      safeStorageSet(storageKey, nextLeadId);
      setIntent(nextIntent || null);
      if (nextMsgs.length) {
        setMessages((prev) => [...prev, ...nextMsgs]);
      }
      const intentRoute = resolveIntentRoute(nextIntent || null);
      if (intentRoute) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `I’ll take you there → ${intentRoute.routeHref}`,
          },
        ]);
      }
    } catch (error: any) {
      setErrorMessage(String(error?.message || "Unable to start chat session. Please retry."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!autoStart) return;
    if (leadId) return;
    if (busy) return;
    if (attemptedAutoStartRef.current) return;
    attemptedAutoStartRef.current = true;
    void start();
  }, [autoStart, leadId, busy]);

  const reset = () => {
    safeStorageRemove(storageKey);
    setLeadId(null);
    setIntent(null);
    setDraft("");
    setErrorMessage(null);
    attemptedAutoStartRef.current = false;
    setMessages([{ role: "assistant", content: systemMessage }]);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    if (!leadId) return;

    setDraft("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await sendTalkMessage({ leadId, message: text, intent: intent || undefined });
      const nextMsgs = Array.isArray(res?.messages) ? (res.messages as TalkMessage[]) : [];
      if (nextMsgs.length) setMessages((prev) => [...prev, ...nextMsgs]);

      const responseHasRoute = nextMsgs.some((msg) => /(https?:\/\/\S+|\/[a-z0-9/_-]+)/i.test(String(msg?.content || "")));
      if (!responseHasRoute) {
        const intentRoute = resolveIntentRoute(intent);
        if (intentRoute) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `I’ll take you there → ${intentRoute.routeHref}`,
            },
          ]);
        }
      }
    } catch (error: any) {
      setMessages((prev) => [...prev, { role: "system", content: "Message not sent. Please retry." }]);
      setErrorMessage(String(error?.message || "Unable to send message right now."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/30",
        isWidget ? "h-[560px] w-full" : "min-h-[640px]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">Talk</div>
          <div className="truncate text-xs text-white/60">{intent ? `Intent: ${intent.replace(/_/g, " ")}` : "Operator routing"}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={reset}
            className="border border-white/15 bg-white/10 text-white hover:bg-white/20"
          >
            New
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <div className="border-b border-amber-400/30 bg-amber-500/10 px-5 py-3 text-xs text-amber-100">{errorMessage}</div>
      ) : null}

      <div ref={listRef} className="flex-1 space-y-3 overflow-auto px-5 py-5">
        {introVisible ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {INTENTS.map((i) => (
              <button
                key={i.key}
                onClick={() => {
                  void start(i.key);
                }}
                disabled={busy}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06] disabled:opacity-60"
              >
                <div className="text-sm font-semibold">{i.label}</div>
                <div className="mt-1 text-xs text-white/65">{i.blurb}</div>
              </button>
            ))}
          </div>
        ) : null}

        {!introVisible && !leadId && busy ? <div className="text-sm text-white/70">Connecting...</div> : null}

        {messages.map((m, idx) => (
          <div
            key={`${m.role}-${idx}`}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[70%]",
                m.role === "user"
                  ? "bg-amber-400 text-slate-950"
                  : m.role === "system"
                    ? "border border-white/10 bg-white/[0.03] text-white/80"
                    : "border border-white/10 bg-black/40 text-white",
              )}
            >
              {renderMessageContent(m.content)}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        {!leadId ? (
          <div className="text-xs text-white/60">Choose one mission or type your request.</div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {actions.map((a) => (
                <a key={a.href} href={a.href} target="_blank" rel="noreferrer" className="text-xs text-white/65 hover:text-white">
                  {a.label}
                </a>
              ))}
              {busy ? <span className="text-xs text-white/45">Routing...</span> : null}
            </div>
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={inputPlaceholder}
                className="border-white/15 bg-white/5 text-white placeholder:text-white/40"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <Button
                onClick={() => {
                  void send();
                }}
                disabled={busy || !draft.trim()}
                className="bg-amber-400 text-slate-950 hover:bg-amber-300"
              >
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
