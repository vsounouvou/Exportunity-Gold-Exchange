import {
  Check,
  CheckCheck,
  Download,
  FileText,
  MoreHorizontal,
  Pin,
  Reply,
  RotateCcw,
  SmilePlus,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChatAttachment, ChatMessage } from "./types";

function formatBytes(value: number) {
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / 1024 / 1024).toFixed(1)} Mo`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fr-BJ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(value));
}

function Attachment({ attachment }: { attachment: ChatAttachment }) {
  if (attachment.kind === "image") {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" className="block">
        <img
          src={attachment.url}
          alt={attachment.name}
          loading="lazy"
          className="max-h-80 w-auto max-w-full border border-black/10 object-contain"
        />
      </a>
    );
  }
  if (attachment.kind === "voice") {
    return (
      <div className="min-w-0">
        <audio controls preload="metadata" className="h-10 max-w-full" src={attachment.url}>
          Votre navigateur ne peut pas lire ce message vocal.
        </audio>
        <p className="mt-1 truncate text-[11px] opacity-60">{attachment.name}</p>
      </div>
    );
  }
  if (attachment.kind === "video") {
    return (
      <video
        controls
        preload="metadata"
        className="max-h-80 max-w-full border border-black/10"
        src={attachment.url}
      >
        Votre navigateur ne peut pas lire cette vidéo.
      </video>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-14 items-center gap-3 border border-current/15 px-3 py-2 hover:bg-black/[0.04]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center bg-black/[0.06]">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-xs">{attachment.name}</strong>
        <span className="text-[11px] opacity-55">{formatBytes(attachment.byteSize)}</span>
      </span>
      <Download className="h-4 w-4 shrink-0" />
    </a>
  );
}

function Delivery({ status }: { status: ChatMessage["deliveryStatus"] }) {
  if (status === "failed") return <RotateCcw className="h-3.5 w-3.5 text-red-500" />;
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 opacity-50" />;
  return <Check className="h-3.5 w-3.5 opacity-50" />;
}

type MessageContentProps = {
  message: ChatMessage;
  mine: boolean;
  showAuthor: boolean;
  showDate: boolean;
  currentMemberId: number;
  onReply: (message: ChatMessage) => void;
  onThread: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emoji: string) => void;
  onPin: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onTask: (message: ChatMessage) => void;
  onDecision: (message: ChatMessage) => void;
  onRetry?: (message: ChatMessage) => void;
};

export function MessageContent({
  message,
  mine,
  showAuthor,
  showDate,
  currentMemberId,
  onReply,
  onThread,
  onReaction,
  onPin,
  onEdit,
  onDelete,
  onTask,
  onDecision,
  onRetry,
}: MessageContentProps) {
  const deleted = Boolean(message.deletedAt);
  const isAssistant = message.messageType === "assistant";
  const markdown = String(message.body || "").replace(
    /(^|\s)@([\p{L}\p{N}._-]{2,80})/gu,
    "$1**@$2**",
  );
  return (
    <article
      className={`group relative px-4 ${showDate ? "pt-5" : "pt-0.5"} ${
        message.pinned ? "bg-amber-50/70" : ""
      }`}
      data-message-id={message.id}
    >
      {showDate ? (
        <div className="mb-5 flex items-center gap-3" aria-label="Séparateur de date">
          <span className="h-px flex-1 bg-black/10" />
          <span className="text-[11px] font-semibold text-black/45">
            {new Intl.DateTimeFormat("fr-BJ", {
              dateStyle: "long",
              timeZone: "Africa/Porto-Novo",
            }).format(new Date(message.createdAt))}
          </span>
          <span className="h-px flex-1 bg-black/10" />
        </div>
      ) : null}
      <div className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
        {showAuthor ? (
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center text-xs font-bold ${
              isAssistant ? "bg-[#d3a72f] text-[#111]" : "bg-[#e5e7e2] text-[#242724]"
            }`}
            aria-hidden="true"
          >
            {isAssistant ? "AI" : String(message.senderName || "AG").slice(0, 2).toUpperCase()}
          </span>
        ) : (
          <span className="w-9 shrink-0" />
        )}
        <div className={`min-w-0 max-w-[min(760px,88%)] ${mine ? "items-end" : ""}`}>
          {showAuthor ? (
            <div className={`mb-1 flex items-center gap-2 text-xs ${mine ? "justify-end" : ""}`}>
              <strong className="truncate text-black/70">
                {isAssistant ? "AGOOJIYE — Assistant IA" : message.senderName || "AGOOJIYE"}
              </strong>
              <span className="shrink-0 text-black/35">{formatTime(message.createdAt)}</span>
              {message.pinned ? <Pin className="h-3 w-3 text-[#8a6615]" aria-label="Épinglé" /> : null}
            </div>
          ) : null}
          {message.replyPreview ? (
            <button
              type="button"
              onClick={() => {
                document
                  .querySelector(`[data-message-id="${message.replyPreview?.id}"]`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className={`mb-1 block max-w-full border-l-2 px-3 py-1 text-left text-xs ${
                mine ? "border-white/35 bg-white/10" : "border-[#b58a24] bg-black/[0.035]"
              }`}
            >
              <strong className="block truncate">{message.replyPreview.senderName}</strong>
              <span className="block truncate opacity-65">{message.replyPreview.body}</span>
            </button>
          ) : null}
          <div
            className={`relative px-3.5 py-2.5 text-sm leading-6 ${
              isAssistant
                ? "border-l-2 border-[#d3a72f] bg-[#f3efe1]"
                : mine
                  ? "bg-[#174e36] text-white"
                  : "bg-[#eef0eb] text-[#20231f]"
            } ${deleted ? "italic opacity-60" : ""}`}
          >
            <div className="agoojye-message-markdown break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ children, ...props }) => (
                    <a
                      {...props}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold underline underline-offset-2"
                    >
                      {children}
                    </a>
                  ),
                  code: ({ children, className, ...props }) => (
                    <code
                      {...props}
                      className={`${className || ""} bg-black/10 px-1 py-0.5 font-mono text-[0.9em]`}
                    >
                      {children}
                    </code>
                  ),
                }}
              >
                {markdown}
              </ReactMarkdown>
            </div>
            {message.attachments.length ? (
              <div className="mt-3 grid gap-2">
                {message.attachments.map((attachment) => (
                  <Attachment key={attachment.id || attachment.url} attachment={attachment} />
                ))}
              </div>
            ) : null}
            <div
              className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
                mine ? "text-white/55" : "text-black/40"
              }`}
            >
              {!showAuthor ? <span>{formatTime(message.createdAt)}</span> : null}
              {message.editedAt ? <span>modifié</span> : null}
              {mine ? <Delivery status={message.deliveryStatus} /> : null}
            </div>
          </div>
          {message.reactions.length ? (
            <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
              {message.reactions.map((reaction) => (
                <button
                  type="button"
                  key={reaction.emoji}
                  title={reaction.users.join(", ")}
                  onClick={() => onReaction(message, reaction.emoji)}
                  className={`min-h-7 border px-2 text-xs ${
                    reaction.userIds.includes(currentMemberId)
                      ? "border-[#b58a24] bg-amber-50"
                      : "border-black/10 bg-white"
                  }`}
                >
                  {reaction.emoji} {reaction.count}
                </button>
              ))}
            </div>
          ) : null}
          {message.threadReplyCount > 0 ? (
            <button
              type="button"
              onClick={() => onThread(message)}
              className="mt-1 min-h-8 text-xs font-semibold text-[#805f12] hover:underline"
            >
              {message.threadReplyCount} réponse{message.threadReplyCount > 1 ? "s" : ""} dans le fil
            </button>
          ) : null}
        </div>
      </div>
      {!deleted ? (
        <div
          className={`absolute top-1 z-10 hidden border border-black/10 bg-white p-1 shadow-sm group-hover:flex group-focus-within:flex ${
            mine ? "right-14" : "left-14"
          }`}
        >
          <button
            type="button"
            onClick={() => onReaction(message, "👍")}
            className="grid h-8 w-8 place-items-center hover:bg-black/[0.05]"
            title="Réagir"
            aria-label="Réagir"
          >
            <SmilePlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onReply(message)}
            className="grid h-8 w-8 place-items-center hover:bg-black/[0.05]"
            title="Répondre"
            aria-label="Répondre"
          >
            <Reply className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onThread(message)}
            className="grid h-8 w-8 place-items-center hover:bg-black/[0.05]"
            title="Ouvrir le fil"
            aria-label="Ouvrir le fil"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          <details className="relative">
            <summary
              className="grid h-8 w-8 cursor-pointer list-none place-items-center hover:bg-black/[0.05]"
              title="Plus d'actions"
              aria-label="Plus d'actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 top-9 z-30 min-w-52 border border-black/10 bg-white p-1 text-xs text-black shadow-lg">
              <button type="button" onClick={() => onPin(message)} className="block min-h-9 w-full px-3 text-left hover:bg-black/[0.05]">
                {message.pinned ? "Retirer des éléments épinglés" : "Épingler"}
              </button>
              <button type="button" onClick={() => onTask(message)} className="block min-h-9 w-full px-3 text-left hover:bg-black/[0.05]">
                Créer une tâche
              </button>
              <button type="button" onClick={() => onDecision(message)} className="block min-h-9 w-full px-3 text-left hover:bg-black/[0.05]">
                Enregistrer une décision
              </button>
              {mine ? (
                <button type="button" onClick={() => onEdit(message)} className="block min-h-9 w-full px-3 text-left hover:bg-black/[0.05]">
                  Modifier
                </button>
              ) : null}
              {mine ? (
                <button type="button" onClick={() => onDelete(message)} className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-red-700 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </button>
              ) : null}
            </div>
          </details>
          {message.deliveryStatus === "failed" && onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="grid h-8 w-8 place-items-center text-red-700 hover:bg-red-50"
              title="Réessayer"
              aria-label="Réessayer"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
