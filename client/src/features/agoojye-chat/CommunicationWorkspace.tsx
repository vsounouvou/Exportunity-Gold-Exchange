import {
  Archive,
  ArrowLeft,
  AtSign,
  BellOff,
  Bold,
  CheckSquare,
  ChevronDown,
  FileText,
  Hash,
  Info,
  Italic,
  List,
  Loader2,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  Plus,
  Search,
  Send,
  Smile,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import { chatApi, uploadChatAttachment } from "./api";
import { MessageContent } from "./MessageContent";
import { reconcileIncomingMessage } from "./reconciliation";
import { getAgoojiyeChatSocket } from "./socket";
import type {
  ChatAttachment,
  ChatConversation,
  ChatDirectoryMember,
  ChatMessage,
  ChatPresence,
  ConversationListPayload,
  MessagePagePayload,
} from "./types";

type BootstrapLike = {
  member: {
    id: number;
    displayName: string;
    role?: string;
    accessLevel?: number;
  };
};

type ConversationTab = "all" | "unread" | "direct" | "channels" | "favorites";
type PendingUpload = ChatAttachment & { uploading?: boolean };
type OfflineSend = {
  channelId: number;
  payload: {
    body: string;
    clientMessageId: string;
    messageType: string;
    replyToMessageId?: number;
    attachmentIds: string[];
    mentionUserIds: number[];
    scheduledAt?: string;
  };
  createdAt: string;
};

const emojiChoices = ["👍", "❤️", "👏", "✅", "🎉", "🙏", "👀", "💡"];

function formatConversationTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("fr-BJ", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Porto-Novo",
    }).format(date);
  }
  return new Intl.DateTimeFormat("fr-BJ", {
    day: "2-digit",
    month: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(date);
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((entry) => entry[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function presenceLabel(value: ChatPresence) {
  if (value === "online") return "En ligne";
  if (value === "busy") return "Occupé";
  if (value === "away") return "Absent";
  return "Hors ligne";
}

function queueKey(memberId: number) {
  return `agoojye-chat-offline-queue:${memberId}`;
}

function readOfflineQueue(memberId: number): OfflineSend[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(queueKey(memberId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(memberId: number, queue: OfflineSend[]) {
  localStorage.setItem(queueKey(memberId), JSON.stringify(queue.slice(-50)));
}

function insertAroundSelection(
  textarea: HTMLTextAreaElement | null,
  value: string,
  setValue: (value: string) => void,
  before: string,
  after = before,
) {
  if (!textarea) {
    setValue(`${value}${before}${after}`);
    return;
  }
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end);
  const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + before.length, end + before.length);
  });
}

function updateMessagePages(
  data: InfiniteData<MessagePagePayload> | undefined,
  mapper: (message: ChatMessage) => ChatMessage,
) {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map(mapper),
    })),
  };
}

function Composer({
  channelId,
  body,
  setBody,
  attachments,
  setAttachments,
  replyTo,
  setReplyTo,
  editMessage,
  setEditMessage,
  directory,
  mentionUserIds,
  setMentionUserIds,
  sending,
  onSend,
  onEdit,
  onTyping,
  scheduledAt,
  setScheduledAt,
}: {
  channelId: number;
  body: string;
  setBody: (value: string) => void;
  attachments: PendingUpload[];
  setAttachments: React.Dispatch<React.SetStateAction<PendingUpload[]>>;
  replyTo: ChatMessage | null;
  setReplyTo: (message: ChatMessage | null) => void;
  editMessage: ChatMessage | null;
  setEditMessage: (message: ChatMessage | null) => void;
  directory: ChatDirectoryMember[];
  mentionUserIds: number[];
  setMentionUserIds: React.Dispatch<React.SetStateAction<number[]>>;
  sending: boolean;
  onSend: () => void;
  onEdit: () => void;
  onTyping: (typing: boolean) => void;
  scheduledAt: string;
  setScheduledAt: (value: string) => void;
}) {
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "uploading">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mentionSearch = body.match(/(^|\s)@([\p{L}\p{N}._-]*)$/u)?.[2] || null;
  const mentionSuggestions = mentionSearch === null
    ? []
    : [
        { id: 0, displayName: "AGOOJIYE", role: "Assistant IA", status: "active" },
        ...directory,
      ]
        .filter((person) =>
          person.displayName.toLocaleLowerCase("fr").includes(mentionSearch.toLocaleLowerCase("fr")),
        )
        .slice(0, 6);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(180, Math.max(48, textarea.scrollHeight))}px`;
  }, [body]);

  const uploadFiles = async (files: FileList | File[]) => {
    const availableSlots = Math.max(0, 10 - attachments.length);
    const selectedFiles = Array.from(files).slice(0, availableSlots);
    if (Array.from(files).length > availableSlots) {
      toast({
        title: "Limite de pièces jointes",
        description: "Un message peut contenir jusqu'à 10 fichiers.",
        variant: "destructive",
      });
    }
    for (const file of selectedFiles) {
      const temporaryId = `upload-${crypto.randomUUID()}`;
      setAttachments((current) => [
        ...current,
        {
          id: temporaryId,
          name: file.name,
          mimeType: file.type,
          byteSize: file.size,
          kind: file.type.startsWith("image/") ? "image" : "document",
          url: "",
          uploading: true,
        },
      ]);
      try {
        const payload = await uploadChatAttachment(channelId, file);
        setAttachments((current) =>
          current.map((item) => (item.id === temporaryId ? payload.item : item)),
        );
      } catch (error) {
        setAttachments((current) => current.filter((item) => item.id !== temporaryId));
        toast({
          title: "Fichier non ajouté",
          description: error instanceof Error ? error.message : "Réessayez.",
          variant: "destructive",
        });
      }
    }
  };

  const toggleVoice = async () => {
    if (voiceState === "recording") {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setVoiceState("uploading");
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const payload = await uploadChatAttachment(
            channelId,
            blob,
            `message-vocal-${Date.now()}.webm`,
          );
          setAttachments((current) => [...current, payload.item]);
        } catch (error) {
          toast({
            title: "Message vocal non ajouté",
            description: error instanceof Error ? error.message : "Réessayez.",
            variant: "destructive",
          });
        } finally {
          setVoiceState("idle");
        }
      };
      recorder.start();
      setVoiceState("recording");
    } catch {
      toast({
        title: "Microphone indisponible",
        description: "Autorisez l'accès au microphone dans votre navigateur.",
        variant: "destructive",
      });
    }
  };

  const chooseMention = (person: ChatDirectoryMember | any) => {
    const replacement = `@${String(person.displayName).replace(/\s+/g, "")} `;
    setBody(body.replace(/@[\p{L}\p{N}._-]*$/u, replacement));
    if (person.id) setMentionUserIds((current) => [...new Set([...current, Number(person.id)])]);
    textareaRef.current?.focus();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editMessage) onEdit();
    else onSend();
  };

  return (
    <form
      onSubmit={submit}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files);
      }}
      className={`relative border-t bg-white px-3 pb-3 pt-2 ${
        dragActive ? "border-[#8a6615] ring-2 ring-inset ring-[#d3a72f]" : "border-black/10"
      }`}
    >
      {dragActive ? (
        <div
          className="pointer-events-none absolute inset-2 z-20 grid place-items-center border border-dashed border-[#8a6615] bg-[#fffaf0]/95 text-sm font-semibold text-[#5e4610]"
          role="status"
        >
          Déposez les fichiers dans ce message
        </div>
      ) : null}
      {replyTo || editMessage ? (
        <div className="mb-2 flex items-start gap-2 border-l-2 border-[#b58a24] bg-[#f4f2ea] px-3 py-2 text-xs">
          <div className="min-w-0 flex-1">
            <strong className="block">
              {editMessage ? "Modifier votre message" : `Réponse à ${replyTo?.senderName || "AGOOJIYE"}`}
            </strong>
            <span className="block truncate text-black/50">
              {(editMessage || replyTo)?.body}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setReplyTo(null);
              setEditMessage(null);
              if (editMessage) setBody("");
            }}
            className="grid h-8 w-8 shrink-0 place-items-center"
            aria-label="Annuler"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {attachments.length ? (
        <div className="mb-2 flex gap-2 overflow-x-auto py-1">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex min-w-44 max-w-56 items-center gap-2 border border-black/10 bg-[#f6f6f2] p-2 text-xs"
            >
              {attachment.uploading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : attachment.kind === "image" ? (
                <img src={attachment.url} alt="" className="h-9 w-9 shrink-0 object-cover" />
              ) : (
                <FileText className="h-4 w-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              <button
                type="button"
                onClick={() =>
                  setAttachments((current) => current.filter((item) => item.id !== attachment.id))
                }
                className="grid h-7 w-7 shrink-0 place-items-center"
                aria-label={`Retirer ${attachment.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {mentionSuggestions.length ? (
        <div className="mb-1 max-w-sm border border-black/10 bg-white p-1 shadow-lg">
          {mentionSuggestions.map((person) => (
            <button
              type="button"
              key={person.id || "assistant"}
              onClick={() => chooseMention(person)}
              className="flex min-h-10 w-full items-center gap-2 px-2 text-left text-xs hover:bg-black/[0.04]"
            >
              <AtSign className="h-3.5 w-3.5 text-[#805f12]" />
              <span>
                <strong className="block">{person.displayName}</strong>
                <span className="text-black/45">{person.role}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="border border-black/15 bg-white focus-within:border-[#8a6615]">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            onTyping(Boolean(event.target.value));
          }}
          onBlur={() => onTyping(false)}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files || []);
            if (!files.length) return;
            event.preventDefault();
            void uploadFiles(files);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (body.trim() || attachments.length) {
                if (editMessage) onEdit();
                else onSend();
              }
            }
          }}
          placeholder="Écrire un message à l'équipe…"
          aria-label="Écrire un message"
          maxLength={8000}
          rows={2}
          className="block min-h-12 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none"
        />
        <div className="flex min-h-11 items-center border-t border-black/[0.07] px-1">
          <button
            type="button"
            onClick={() => insertAroundSelection(textareaRef.current, body, setBody, "**")}
            className="grid h-9 w-9 place-items-center hover:bg-black/[0.04]"
            title="Gras"
            aria-label="Gras"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => insertAroundSelection(textareaRef.current, body, setBody, "_")}
            className="grid h-9 w-9 place-items-center hover:bg-black/[0.04]"
            title="Italique"
            aria-label="Italique"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => insertAroundSelection(textareaRef.current, body, setBody, "\n- ", "")}
            className="hidden h-9 w-9 place-items-center hover:bg-black/[0.04] sm:grid"
            title="Liste"
            aria-label="Liste"
          >
            <List className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.ogg,.webm,.mp4"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              if (event.target.files) void uploadFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="grid h-9 w-9 place-items-center hover:bg-black/[0.04]"
            title="Ajouter un fichier"
            aria-label="Ajouter un fichier"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setEmojiOpen((value) => !value)}
              className="grid h-9 w-9 place-items-center hover:bg-black/[0.04]"
              title="Emoji"
              aria-label="Emoji"
            >
              <Smile className="h-4 w-4" />
            </button>
            {emojiOpen ? (
              <div className="absolute bottom-11 left-0 z-30 grid grid-cols-4 border border-black/10 bg-white p-1 shadow-lg">
                {emojiChoices.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    onClick={() => {
                      setBody(`${body}${emoji}`);
                      setEmojiOpen(false);
                    }}
                    className="grid h-9 w-9 place-items-center text-lg hover:bg-black/[0.04]"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleVoice}
            className={`grid h-9 w-9 place-items-center hover:bg-black/[0.04] ${
              voiceState === "recording" ? "text-red-600" : ""
            }`}
            title={voiceState === "recording" ? "Arrêter l'enregistrement" : "Message vocal"}
            aria-label={voiceState === "recording" ? "Arrêter l'enregistrement" : "Message vocal"}
          >
            {voiceState === "uploading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
          <div className="relative ml-auto hidden sm:block">
            <button
              type="button"
              onClick={() => setScheduleOpen((value) => !value)}
              className="flex min-h-9 items-center gap-1 px-2 text-[11px] text-black/50 hover:bg-black/[0.04]"
            >
              {scheduledAt ? "Planifié" : "Envoyer plus tard"} <ChevronDown className="h-3 w-3" />
            </button>
            {scheduleOpen ? (
              <div className="absolute bottom-11 right-0 z-30 w-64 border border-black/10 bg-white p-3 shadow-lg">
                <label className="text-xs font-semibold" htmlFor="chat-schedule">
                  Date et heure
                </label>
                <input
                  id="chat-schedule"
                  type="datetime-local"
                  value={scheduledAt}
                  min={new Date(Date.now() + 2 * 60_000).toISOString().slice(0, 16)}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  className="mt-2 h-10 w-full border border-black/15 px-2 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    setScheduledAt("");
                    setScheduleOpen(false);
                  }}
                  className="mt-2 min-h-9 text-xs text-red-700"
                >
                  Annuler la planification
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={
              sending ||
              attachments.some((attachment) => attachment.uploading) ||
              (!body.trim() && !attachments.length)
            }
            className="ml-1 grid h-9 w-9 place-items-center bg-[#174e36] text-white disabled:opacity-40"
            title={editMessage ? "Enregistrer" : "Envoyer"}
            aria-label={editMessage ? "Enregistrer le message" : "Envoyer le message"}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-black/50">
        Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne
      </p>
    </form>
  );
}

export function CommunicationWorkspace({ data }: { data: BootstrapLike }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<ConversationTab>("all");
  const [search, setSearch] = useState("");
  const initialChannel = Number(new URLSearchParams(window.location.search).get("channel") || 0);
  const initialDm = Number(new URLSearchParams(window.location.search).get("dm") || 0);
  const [channelId, setChannelId] = useState(initialChannel);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(Boolean(initialChannel || initialDm));
  const [contextOpen, setContextOpen] = useState(false);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingUpload[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editMessage, setEditMessage] = useState<ChatMessage | null>(null);
  const [threadRoot, setThreadRoot] = useState<ChatMessage | null>(null);
  const [mentionUserIds, setMentionUserIds] = useState<number[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [typingUsers, setTypingUsers] = useState<Record<number, string>>({});
  const [presence, setPresence] = useState<Record<number, ChatPresence>>({});
  const [connectionState, setConnectionState] = useState<"connected" | "connecting" | "offline">("connecting");
  const [offlineQueue, setOfflineQueue] = useState<OfflineSend[]>(() =>
    readOfflineQueue(Number(data.member.id)),
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [actionPending, setActionPending] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const newConversationRef = useRef<HTMLDetailsElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef(getAgoojiyeChatSocket());

  const conversationsQuery = useQuery<ConversationListPayload>({
    queryKey: ["/api/agoojye/chat/member/conversations"],
    queryFn: () => chatApi("/api/agoojye/chat/member/conversations"),
    staleTime: 15_000,
  });
  const conversations = conversationsQuery.data?.items || [];
  const directory = conversationsQuery.data?.directory || [];
  const selected = conversations.find((conversation) => conversation.id === channelId) || null;

  useEffect(() => {
    if (!channelId && conversations.length) {
      setChannelId(conversations[0].id);
    }
  }, [channelId, conversations]);

  const messagesQuery = useInfiniteQuery<MessagePagePayload>({
    queryKey: ["/api/agoojye/chat/member/channels", channelId, "messages"],
    queryFn: ({ pageParam }) =>
      chatApi(
        `/api/agoojye/chat/member/channels/${channelId}/messages?limit=50${
          pageParam ? `&before=${pageParam}` : ""
        }`,
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.page.nextBefore || undefined,
    enabled: channelId > 0,
  });
  const messages = useMemo(
    () => [...(messagesQuery.data?.pages || [])].reverse().flatMap((page) => page.items),
    [messagesQuery.data],
  );

  const threadQuery = useQuery<MessagePagePayload>({
    queryKey: ["/api/agoojye/chat/member/channels", channelId, "thread", threadRoot?.id],
    queryFn: () =>
      chatApi(
        `/api/agoojye/chat/member/channels/${channelId}/messages?limit=100&thread=${threadRoot?.id}&markRead=false`,
      ),
    enabled: Boolean(threadRoot && channelId),
  });

  const searchQuery = useQuery<{ ok: boolean; items: any[] }>({
    queryKey: ["/api/agoojye/chat/member/search", globalSearch],
    queryFn: () =>
      chatApi(`/api/agoojye/chat/member/search?q=${encodeURIComponent(globalSearch)}`),
    enabled: searchOpen && globalSearch.trim().length >= 2,
  });

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 92,
    overscan: 10,
  });

  const scrollToBottom = useCallback((smooth = false) => {
    if (!messages.length) return;
    virtualizer.scrollToIndex(messages.length - 1, {
      align: "end",
      behavior: smooth ? "smooth" : "auto",
    });
  }, [messages.length, virtualizer]);

  useEffect(() => {
    if (messagesQuery.isSuccess) requestAnimationFrame(() => scrollToBottom(false));
  }, [channelId, messagesQuery.isSuccess]);

  const updateCachedMessage = useCallback(
    (mapper: (message: ChatMessage) => ChatMessage) => {
      queryClient.setQueryData<InfiniteData<MessagePagePayload>>(
        ["/api/agoojye/chat/member/channels", channelId, "messages"],
        (current) => updateMessagePages(current, mapper),
      );
      queryClient.setQueryData<MessagePagePayload>(
        ["/api/agoojye/chat/member/channels", channelId, "thread", threadRoot?.id],
        (current) =>
          current
            ? { ...current, items: current.items.map(mapper) }
            : current,
      );
    },
    [channelId, queryClient, threadRoot?.id],
  );

  useEffect(() => {
    const socket = socketRef.current;
    const onConnect = () => setConnectionState("connected");
    const onDisconnect = () => setConnectionState(navigator.onLine ? "connecting" : "offline");
    const onPresenceSnapshot = (items: Array<{ userId: number; status: ChatPresence }>) => {
      setPresence(Object.fromEntries(items.map((item) => [Number(item.userId), item.status])));
    };
    const onPresenceChanged = (item: { userId: number; status: ChatPresence }) => {
      setPresence((current) => ({ ...current, [Number(item.userId)]: item.status }));
    };
    const onTyping = (item: { channelId: number; userId: number; displayName: string; typing: boolean }) => {
      if (Number(item.channelId) !== channelId) return;
      setTypingUsers((current) => {
        const next = { ...current };
        if (item.typing) next[Number(item.userId)] = item.displayName;
        else delete next[Number(item.userId)];
        return next;
      });
    };
    const onCreated = ({ item }: { item: ChatMessage }) => {
      if (Number(item.channelId) === channelId) {
        queryClient.setQueryData<InfiniteData<MessagePagePayload>>(
          ["/api/agoojye/chat/member/channels", channelId, "messages"],
          (current) => reconcileIncomingMessage(current, item),
        );
        requestAnimationFrame(() => scrollToBottom(true));
      }
      void queryClient.invalidateQueries({ queryKey: ["/api/agoojye/chat/member/conversations"] });
    };
    const onUpdated = (item: Partial<ChatMessage> & { id: number }) =>
      updateCachedMessage((message) => (message.id === item.id ? { ...message, ...item } : message));
    const onDeleted = (item: { id: number; deletedAt: string }) =>
      updateCachedMessage((message) =>
        message.id === item.id
          ? { ...message, body: "Ce message a été supprimé.", attachments: [], deletedAt: item.deletedAt }
          : message,
      );
    const onReactions = (item: { messageId: number; reactions: any[] }) =>
      updateCachedMessage((message) =>
        message.id === item.messageId ? { ...message, reactions: item.reactions } : message,
      );
    const onPinned = (item: { messageId: number; pinned: boolean }) =>
      updateCachedMessage((message) =>
        message.id === item.messageId ? { ...message, pinned: item.pinned } : message,
      );
    const onRead = (item: { userId: number; lastReadMessageId: number | null }) => {
      if (Number(item.userId) === Number(data.member.id) || !item.lastReadMessageId) return;
      updateCachedMessage((message) =>
        message.id <= Number(item.lastReadMessageId) && Number(message.senderUserId) === Number(data.member.id)
          ? { ...message, deliveryStatus: "read" }
          : message,
      );
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("presence:snapshot", onPresenceSnapshot);
    socket.on("presence:changed", onPresenceChanged);
    socket.on("typing:changed", onTyping);
    socket.on("message:created", onCreated);
    socket.on("message:updated", onUpdated);
    socket.on("message:deleted", onDeleted);
    socket.on("message:reactions", onReactions);
    socket.on("message:pinned", onPinned);
    socket.on("conversation:read", onRead);
    if (socket.connected) setConnectionState("connected");
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("presence:snapshot", onPresenceSnapshot);
      socket.off("presence:changed", onPresenceChanged);
      socket.off("typing:changed", onTyping);
      socket.off("message:created", onCreated);
      socket.off("message:updated", onUpdated);
      socket.off("message:deleted", onDeleted);
      socket.off("message:reactions", onReactions);
      socket.off("message:pinned", onPinned);
      socket.off("conversation:read", onRead);
    };
  }, [channelId, data.member.id, queryClient, scrollToBottom, updateCachedMessage]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!channelId) return;
    socket.emit("conversation:join", { channelId });
    setTypingUsers({});
    return () => {
      socket.emit("typing:stop", { channelId });
      socket.emit("conversation:leave", { channelId });
    };
  }, [channelId]);

  useEffect(() => {
    if (!initialDm) return;
    let cancelled = false;
    void chatApi<{ item: { id: number } }>(`/api/agoojye/chat/member/direct/${initialDm}`, {
      method: "POST",
    }).then((payload) => {
      if (cancelled) return;
      setChannelId(Number(payload.item.id));
      setMobileConversationOpen(true);
      void conversationsQuery.refetch();
    });
    return () => {
      cancelled = true;
    };
  }, [initialDm]);

  const saveDraft = useCallback(
    (nextBody: string, nextAttachments: PendingUpload[], nextReply: ChatMessage | null) => {
      if (!channelId) return;
      const payload = {
        body: nextBody,
        attachmentIds: nextAttachments.filter((item) => !item.uploading).map((item) => item.id),
        replyToMessageId: nextReply?.id || null,
      };
      void chatApi(`/api/agoojye/chat/member/channels/${channelId}/draft`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    },
    [channelId],
  );

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    void chatApi<{ item: any | null }>(
      `/api/agoojye/chat/member/channels/${channelId}/draft`,
    ).then((payload) => {
      if (cancelled || !payload.item) return;
      setBody(payload.item.body || "");
      setReplyTo(
        messages.find((message) => message.id === Number(payload.item.replyToMessageId)) || null,
      );
    });
    return () => {
      cancelled = true;
      if (body.trim() || attachments.length) saveDraft(body, attachments, replyTo);
    };
  }, [channelId]);

  const setComposerBody = (value: string) => {
    setBody(value);
  };

  const sendPayload = useCallback(
    async (pending: OfflineSend, optimisticId?: number) => {
      const response = await chatApi<{ item: ChatMessage }>(
        `/api/agoojye/chat/member/channels/${pending.channelId}/messages`,
        { method: "POST", body: JSON.stringify(pending.payload) },
      );
      queryClient.setQueryData<InfiniteData<MessagePagePayload>>(
        ["/api/agoojye/chat/member/channels", pending.channelId, "messages"],
        (current) => reconcileIncomingMessage(current, response.item),
      );
      return response.item;
    },
    [queryClient],
  );

  const flushOfflineQueue = useCallback(async () => {
    const queue = readOfflineQueue(Number(data.member.id));
    if (!queue.length || !navigator.onLine) return;
    const remaining: OfflineSend[] = [];
    for (const pending of queue) {
      try {
        await sendPayload(pending);
      } catch {
        remaining.push(pending);
      }
    }
    setOfflineQueue(remaining);
    writeOfflineQueue(Number(data.member.id), remaining);
  }, [data.member.id, sendPayload]);

  useEffect(() => {
    const onOnline = () => {
      setConnectionState("connecting");
      void flushOfflineQueue();
    };
    const onOffline = () => setConnectionState("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (navigator.onLine) void flushOfflineQueue();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flushOfflineQueue]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!channelId) throw new Error("Choisissez une conversation.");
      const clientMessageId = crypto.randomUUID();
      const payload: OfflineSend = {
        channelId,
        payload: {
          body: body.trim(),
          clientMessageId,
          messageType: attachments.some((item) => item.kind === "voice")
            ? "voice"
            : attachments.length
              ? "document"
              : "text",
          replyToMessageId: replyTo?.id,
          attachmentIds: attachments.map((item) => item.id),
          mentionUserIds,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        },
        createdAt: new Date().toISOString(),
      };
      const optimisticId = -Date.now();
      const optimistic: ChatMessage = {
        id: optimisticId,
        channelId,
        senderUserId: Number(data.member.id),
        senderName: data.member.displayName,
        senderRole: data.member.role,
        body: payload.payload.body,
        messageType: payload.payload.messageType,
        replyToMessageId: replyTo?.id,
        clientMessageId,
        attachments,
        reactions: [],
        pinned: false,
        deliveryStatus: navigator.onLine ? "sending" : "queued",
        createdAt: payload.createdAt,
        threadReplyCount: 0,
        replyPreview: replyTo
          ? { id: replyTo.id, senderName: replyTo.senderName || "AGOOJIYE", body: replyTo.body }
          : null,
        optimistic: true,
      };
      queryClient.setQueryData<InfiniteData<MessagePagePayload>>(
        ["/api/agoojye/chat/member/channels", channelId, "messages"],
        (current) => {
          if (!current) return current;
          const pages = [...current.pages];
          pages[0] = { ...pages[0], items: [...pages[0].items, optimistic] };
          return { ...current, pages };
        },
      );
      setBody("");
      setAttachments([]);
      setReplyTo(null);
      setMentionUserIds([]);
      setScheduledAt("");
      requestAnimationFrame(() => scrollToBottom(true));
      if (!navigator.onLine) {
        const nextQueue = [...readOfflineQueue(Number(data.member.id)), payload];
        writeOfflineQueue(Number(data.member.id), nextQueue);
        setOfflineQueue(nextQueue);
        return optimistic;
      }
      try {
        const sent = await sendPayload(payload, optimisticId);
        if (/@agoojiye(?:\s|$|[.,!?;:])/iu.test(payload.payload.body)) {
          await chatApi(
            `/api/agoojye/chat/member/channels/${channelId}/assistant-reply`,
            {
              method: "POST",
              body: JSON.stringify({ messageId: sent.id }),
            },
          ).catch((error) => {
            toast({
              title: "AGOOJIYE n'a pas pu répondre",
              description: error instanceof Error ? error.message : "Réessayez.",
              variant: "destructive",
            });
          });
        }
        return sent;
      } catch (error) {
        const networkFailure = error instanceof TypeError || !navigator.onLine;
        if (networkFailure) {
          const nextQueue = [...readOfflineQueue(Number(data.member.id)), payload];
          writeOfflineQueue(Number(data.member.id), nextQueue);
          setOfflineQueue(nextQueue);
          updateCachedMessage((message) =>
            message.id === optimisticId ? { ...message, deliveryStatus: "queued" } : message,
          );
          return optimistic;
        }
        updateCachedMessage((message) =>
          message.id === optimisticId ? { ...message, deliveryStatus: "failed" } : message,
        );
        throw error;
      }
    },
    onError: (error) =>
      toast({
        title: "Message non envoyé",
        description: error instanceof Error ? error.message : "Réessayez.",
        variant: "destructive",
      }),
    onSuccess: () => {
      void chatApi(`/api/agoojye/chat/member/channels/${channelId}/draft`, {
        method: "DELETE",
      }).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ["/api/agoojye/chat/member/conversations"] });
    },
  });

  const sendThreadReply = async () => {
    if (!threadRoot || !body.trim()) return;
    const clientMessageId = crypto.randomUUID();
    await chatApi(`/api/agoojye/chat/member/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        body: body.trim(),
        clientMessageId,
        messageType: "text",
        replyToMessageId: threadRoot.id,
        attachmentIds: attachments.map((item) => item.id),
        mentionUserIds,
      }),
    });
    setBody("");
    setAttachments([]);
    void threadQuery.refetch();
    void messagesQuery.refetch();
  };

  const editMutation = useMutation({
    mutationFn: () =>
      chatApi(`/api/agoojye/chat/member/messages/${editMessage?.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body: body.trim() }),
      }),
    onSuccess: () => {
      setBody("");
      setEditMessage(null);
    },
    onError: (error) =>
      toast({
        title: "Modification impossible",
        description: error instanceof Error ? error.message : "Réessayez.",
        variant: "destructive",
      }),
  });

  const chooseConversation = (conversation: ChatConversation) => {
    if (channelId && (body.trim() || attachments.length)) saveDraft(body, attachments, replyTo);
    setBody("");
    setAttachments([]);
    setReplyTo(null);
    setEditMessage(null);
    setChannelId(conversation.id);
    setMobileConversationOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.set("channel", String(conversation.id));
    url.searchParams.delete("dm");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };

  const createDirect = async (userId: number) => {
    const payload = await chatApi<{ item: { id: number } }>(
      `/api/agoojye/chat/member/direct/${userId}`,
      { method: "POST" },
    );
    await conversationsQuery.refetch();
    const conversation = conversationsQuery.data?.items.find(
      (item) => item.id === Number(payload.item.id),
    );
    setChannelId(Number(payload.item.id));
    setMobileConversationOpen(true);
    if (conversation) chooseConversation(conversation);
  };

  const filteredConversations = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr");
    return conversations.filter((conversation) => {
      if (conversation.archived) return false;
      if (tab === "unread" && conversation.unreadCount === 0) return false;
      if (tab === "direct" && conversation.type !== "direct") return false;
      if (tab === "channels" && conversation.type !== "channel") return false;
      if (tab === "favorites" && !conversation.favorite) return false;
      if (!needle) return true;
      return `${conversation.name} ${conversation.description || ""} ${conversation.lastMessage?.body || ""}`
        .toLocaleLowerCase("fr")
        .includes(needle);
    });
  }, [conversations, search, tab]);

  const onTyping = (typing: boolean) => {
    const socket = socketRef.current;
    if (!channelId) return;
    socket.emit(typing ? "typing:start" : "typing:stop", { channelId });
    if (typing) {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(
        () => socket.emit("typing:stop", { channelId }),
        1800,
      );
    }
  };

  const react = async (message: ChatMessage, emoji: string) => {
    await chatApi(
      `/api/agoojye/chat/member/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`,
      { method: "PUT" },
    );
  };
  const pin = async (message: ChatMessage) => {
    await chatApi(`/api/agoojye/chat/member/messages/${message.id}/pin`, {
      method: "PUT",
    });
  };
  const remove = async (message: ChatMessage) => {
    if (!window.confirm("Supprimer ce message ?")) return;
    await chatApi(`/api/agoojye/chat/member/messages/${message.id}`, {
      method: "DELETE",
    });
  };
  const convertMessage = async (message: ChatMessage, action: "to-task" | "to-decision") => {
    setActionPending(message.id);
    try {
      await apiRequest(`/api/agoojye/os/member/messages/${message.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast({
        title: action === "to-task" ? "Tâche créée" : "Décision enregistrée",
        description: "Le lien vers le message source a été conservé.",
      });
    } finally {
      setActionPending(null);
    }
  };

  const togglePreference = async (
    conversation: ChatConversation,
    key: "favorite" | "archived",
  ) => {
    await chatApi(`/api/agoojye/chat/member/channels/${conversation.id}/preferences`, {
      method: "PATCH",
      body: JSON.stringify({ [key]: !conversation[key] }),
    });
    await conversationsQuery.refetch();
  };

  const typingNames = Object.values(typingUsers);
  const peerPresence: ChatPresence = selected?.peer
    ? presence[selected.peer.id] || "offline"
    : "offline";
  const pinnedMessages = messages.filter((message) => message.pinned);

  useEffect(() => {
    const onKeyboardShortcut = (event: KeyboardEvent) => {
      const commandKey = event.ctrlKey || event.metaKey;
      if (commandKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (commandKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (newConversationRef.current) newConversationRef.current.open = true;
        return;
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setContextOpen(false);
        setThreadRoot(null);
        if (newConversationRef.current) newConversationRef.current.open = false;
      }
    };
    window.addEventListener("keydown", onKeyboardShortcut);
    return () => window.removeEventListener("keydown", onKeyboardShortcut);
  }, []);

  return (
    <div
      className={`grid h-[calc(100dvh-132px)] min-h-[500px] overflow-hidden bg-white lg:h-[calc(100dvh-64px)] lg:min-h-[560px] ${
        contextOpen
          ? "lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_300px]"
          : "lg:grid-cols-[320px_minmax(0,1fr)]"
      }`}
    >
      <aside
        className={`min-w-0 border-r border-black/10 bg-[#f5f5f1] ${
          mobileConversationOpen ? "hidden lg:flex" : "flex"
        } flex-col`}
      >
        <header className="border-b border-black/10 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-[#805f12]">
                Communication
              </p>
              <h1 className="mt-0.5 text-xl font-semibold">Messages</h1>
              {conversationsQuery.data?.unreadTotal ? (
                <p className="mt-1 text-xs font-medium text-[#174e36]">
                  {conversationsQuery.data.unreadTotal} non lus
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="grid h-10 w-10 place-items-center border border-black/10 bg-white"
                title="Rechercher partout"
                aria-label="Rechercher partout"
              >
                <Search className="h-4 w-4" />
              </button>
              <details ref={newConversationRef} className="relative">
                <summary
                  className="grid h-10 w-10 cursor-pointer list-none place-items-center bg-[#174e36] text-white"
                  title="Nouvelle conversation"
                  aria-label="Nouvelle conversation"
                >
                  <Plus className="h-4 w-4" />
                </summary>
                <div className="absolute right-0 top-11 z-40 max-h-80 w-72 overflow-y-auto border border-black/10 bg-white p-2 shadow-xl">
                  <p className="px-2 py-2 text-xs font-bold uppercase text-black/50">
                    Démarrer un message direct
                  </p>
                  {directory.map((person) => (
                    <button
                      type="button"
                      key={person.id}
                      onClick={() => void createDirect(person.id)}
                      className="flex min-h-11 w-full items-center gap-3 px-2 text-left hover:bg-black/[0.04]"
                    >
                      <span className="grid h-8 w-8 place-items-center bg-[#e5e7e2] text-[11px] font-bold">
                        {initials(person.displayName)}
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-xs">{person.displayName}</strong>
                        <span className="block truncate text-[11px] text-black/45">{person.role}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            </div>
          </div>
          <label className="mt-3 flex h-10 items-center gap-2 border border-black/10 bg-white px-3">
            <Search className="h-4 w-4 text-black/35" />
            <span className="sr-only">Filtrer les conversations</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une conversation"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
            {search ? (
              <button type="button" onClick={() => setSearch("")} aria-label="Effacer">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
        </header>
        <div className="flex gap-1 overflow-x-auto border-b border-black/10 px-2 py-2">
          {(
            [
              ["all", "Tout"],
              ["unread", "Non lus"],
              ["direct", "Directs"],
              ["channels", "Canaux"],
              ["favorites", "Favoris"],
            ] as const
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => setTab(key)}
              className={`min-h-8 shrink-0 px-2.5 text-[11px] font-semibold ${
                tab === key ? "bg-[#1b1f1c] text-white" : "text-black/50 hover:bg-black/[0.04]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {connectionState !== "connected" || offlineQueue.length ? (
          <div
            className={`px-3 py-2 text-[11px] ${
              connectionState === "offline" ? "bg-amber-100 text-amber-900" : "bg-blue-50 text-blue-900"
            }`}
            role="status"
          >
            {connectionState === "offline"
              ? "Hors ligne. Vos messages restent en attente sur cet appareil."
              : offlineQueue.length
                ? `${offlineQueue.length} message${offlineQueue.length > 1 ? "s" : ""} en attente d'envoi.`
                : "Reconnexion en cours…"}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversationsQuery.isLoading ? (
            <div className="space-y-2 p-3" aria-label="Chargement des conversations">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse bg-black/[0.05]" />
              ))}
            </div>
          ) : filteredConversations.length ? (
            filteredConversations.map((conversation) => {
              const conversationPresence: ChatPresence = conversation.peer
                ? presence[conversation.peer.id] || "offline"
                : "offline";
              return (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => chooseConversation(conversation)}
                  className={`grid min-h-[72px] w-full grid-cols-[40px_minmax(0,1fr)_auto] gap-3 border-b border-black/[0.06] px-3 py-2.5 text-left ${
                    conversation.id === channelId ? "bg-white" : "hover:bg-white/70"
                  }`}
                >
                  <span className="relative grid h-10 w-10 place-items-center bg-[#e1e4dd] text-xs font-bold">
                    {conversation.type === "channel" ? (
                      <Hash className="h-4 w-4" />
                    ) : (
                      initials(conversation.name)
                    )}
                    {conversation.type === "direct" ? (
                      <span
                        className={`absolute bottom-0 right-0 h-2.5 w-2.5 border-2 border-[#f5f5f1] ${
                          conversationPresence === "online"
                            ? "bg-emerald-500"
                            : conversationPresence === "busy"
                              ? "bg-red-500"
                              : conversationPresence === "away"
                                ? "bg-amber-400"
                                : "bg-zinc-300"
                        }`}
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 self-center">
                    <span className="flex items-center gap-1">
                      <strong
                        className={`truncate text-xs ${
                          conversation.unreadCount ? "text-black" : "font-medium text-black/75"
                        }`}
                      >
                        {conversation.name}
                      </strong>
                      {conversation.favorite ? <Star className="h-3 w-3 fill-amber-400 text-amber-500" /> : null}
                      {conversation.mutedUntil ? <BellOff className="h-3 w-3 text-black/35" /> : null}
                    </span>
                    <span
                      className={`mt-1 block truncate text-[11px] ${
                        conversation.unreadCount ? "font-semibold text-black/65" : "text-black/40"
                      }`}
                    >
                      {conversation.lastMessage?.senderUserId === data.member.id ? "Vous : " : ""}
                      {conversation.lastMessage?.body || conversation.description || "Aucun message"}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1 self-center">
                    <span className="text-[11px] text-black/50">
                      {formatConversationTime(conversation.lastMessage?.createdAt || conversation.updatedAt)}
                    </span>
                    {conversation.unreadCount ? (
                      <span className="grid min-h-5 min-w-5 place-items-center bg-[#174e36] px-1 text-[11px] font-bold text-white">
                        {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-5 py-12 text-center">
              <MessageCircle className="mx-auto h-6 w-6 text-black/30" />
              <p className="mt-3 text-sm font-semibold">Aucune conversation</p>
              <p className="mt-1 text-xs leading-5 text-black/45">
                Modifiez le filtre ou démarrez un message direct.
              </p>
            </div>
          )}
        </div>
      </aside>

      <main
        className={`${mobileConversationOpen ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col bg-white`}
      >
        {selected ? (
          <>
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-black/10 px-3 sm:px-4">
              <button
                type="button"
                onClick={() => setMobileConversationOpen(false)}
                className="grid h-10 w-10 place-items-center lg:hidden"
                aria-label="Retour aux conversations"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <span className="relative grid h-9 w-9 shrink-0 place-items-center bg-[#e5e7e2] text-xs font-bold">
                {selected.type === "channel" ? <Hash className="h-4 w-4" /> : initials(selected.name)}
                {selected.type === "direct" ? (
                  <span
                    className={`absolute bottom-0 right-0 h-2.5 w-2.5 border-2 border-white ${
                      peerPresence === "online"
                        ? "bg-emerald-500"
                        : peerPresence === "busy"
                          ? "bg-red-500"
                          : peerPresence === "away"
                            ? "bg-amber-400"
                            : "bg-zinc-300"
                    }`}
                  />
                ) : null}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">
                  {selected.type === "channel" ? `# ${selected.name}` : selected.name}
                </h2>
                <p className="truncate text-[11px] text-black/45">
                  {selected.type === "direct"
                    ? `${presenceLabel(peerPresence)} · ${selected.description || "Membre AGOOJIYE"}`
                    : `${selected.memberCount} membre${selected.memberCount > 1 ? "s" : ""} · ${selected.description || "Canal d'équipe"}`}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void togglePreference(selected, "favorite")}
                  className="grid h-10 w-10 place-items-center hover:bg-black/[0.04]"
                  title={selected.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                  aria-label={selected.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                >
                  <Star
                    className={`h-4 w-4 ${
                      selected.favorite ? "fill-amber-400 text-amber-500" : ""
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="grid h-10 w-10 place-items-center hover:bg-black/[0.04]"
                  title="Rechercher"
                  aria-label="Rechercher"
                >
                  <Search className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setContextOpen((value) => !value)}
                  className="grid h-10 w-10 place-items-center hover:bg-black/[0.04]"
                  title="Informations"
                  aria-label="Informations sur la conversation"
                >
                  {contextOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </button>
              </div>
            </header>
            <div
              ref={scrollerRef}
              onScroll={(event) => {
                if (
                  event.currentTarget.scrollTop < 100 &&
                  messagesQuery.hasNextPage &&
                  !messagesQuery.isFetchingNextPage
                ) {
                  void messagesQuery.fetchNextPage();
                }
              }}
              className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              {messagesQuery.isFetchingNextPage ? (
                <div className="sticky top-2 z-10 mx-auto flex w-fit items-center gap-2 bg-white px-3 py-2 text-xs shadow">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Messages précédents
                </div>
              ) : null}
              {messagesQuery.isLoading ? (
                <div className="space-y-4 p-5" aria-label="Chargement des messages">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className={`h-16 w-2/3 animate-pulse bg-black/[0.05] ${
                        index % 3 === 0 ? "ml-auto" : ""
                      }`}
                    />
                  ))}
                </div>
              ) : messages.length ? (
                <div
                  style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
                  className="w-full py-2"
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const message = messages[virtualItem.index];
                    const previous = messages[virtualItem.index - 1];
                    const mine = Number(message.senderUserId) === Number(data.member.id);
                    const showAuthor =
                      !previous ||
                      Number(previous.senderUserId) !== Number(message.senderUserId) ||
                      new Date(message.createdAt).getTime() -
                        new Date(previous.createdAt).getTime() >
                        5 * 60_000;
                    const showDate =
                      !previous ||
                      new Date(previous.createdAt).toDateString() !==
                        new Date(message.createdAt).toDateString();
                    return (
                      <div
                        key={message.id || message.clientMessageId}
                        ref={virtualizer.measureElement}
                        data-index={virtualItem.index}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <MessageContent
                          message={message}
                          mine={mine}
                          showAuthor={showAuthor}
                          showDate={showDate}
                          currentMemberId={Number(data.member.id)}
                          onReply={setReplyTo}
                          onThread={setThreadRoot}
                          onReaction={(item, emoji) => void react(item, emoji)}
                          onPin={(item) => void pin(item)}
                          onEdit={(item) => {
                            setEditMessage(item);
                            setReplyTo(null);
                            setBody(item.body);
                          }}
                          onDelete={(item) => void remove(item)}
                          onTask={(item) => void convertMessage(item, "to-task")}
                          onDecision={(item) => void convertMessage(item, "to-decision")}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid h-full min-h-80 place-items-center p-5 text-center">
                  <div>
                    <span className="mx-auto grid h-14 w-14 place-items-center bg-[#eef0eb]">
                      <MessageCircle className="h-6 w-6 text-[#174e36]" />
                    </span>
                    <h3 className="mt-4 font-semibold">Commencez la conversation</h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-black/45">
                      Écrivez un message, partagez un document ou mentionnez @AGOOJIYE.
                    </p>
                  </div>
                </div>
              )}
            </div>
            {typingNames.length ? (
              <div className="shrink-0 px-4 py-1 text-[11px] text-black/45" role="status">
                {typingNames.slice(0, 2).join(" et ")} écrit{typingNames.length > 1 ? "vent" : ""}…
              </div>
            ) : null}
            <Composer
              channelId={channelId}
              body={body}
              setBody={setComposerBody}
              attachments={attachments}
              setAttachments={setAttachments}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              editMessage={editMessage}
              setEditMessage={setEditMessage}
              directory={directory}
              mentionUserIds={mentionUserIds}
              setMentionUserIds={setMentionUserIds}
              sending={sendMutation.isPending || editMutation.isPending}
              onSend={() => {
                if (threadRoot) void sendThreadReply();
                else sendMutation.mutate();
              }}
              onEdit={() => editMutation.mutate()}
              onTyping={onTyping}
              scheduledAt={scheduledAt}
              setScheduledAt={setScheduledAt}
            />
          </>
        ) : (
          <div className="grid h-full place-items-center bg-[#fafaf7] p-6 text-center">
            <div>
              <MessageCircle className="mx-auto h-8 w-8 text-black/25" />
              <h2 className="mt-4 text-lg font-semibold">Choisissez une conversation</h2>
              <p className="mt-2 text-sm text-black/45">
                Vos canaux et messages directs apparaissent dans une seule liste.
              </p>
            </div>
          </div>
        )}
      </main>

      {contextOpen && selected ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 2xl:hidden"
            onClick={() => setContextOpen(false)}
            aria-label="Fermer les informations"
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-[min(340px,92vw)] overflow-y-auto border-l border-black/10 bg-[#f4f3ed] 2xl:static 2xl:z-auto 2xl:w-auto">
            <header className="flex h-16 items-center justify-between border-b border-black/10 px-4">
              <h2 className="text-sm font-semibold">Informations</h2>
              <button
                type="button"
                onClick={() => setContextOpen(false)}
                className="grid h-10 w-10 place-items-center"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <section className="border-b border-black/10 p-5 text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center bg-[#dfe3da] text-lg font-bold">
                {selected.type === "channel" ? <Hash className="h-6 w-6" /> : initials(selected.name)}
              </span>
              <h3 className="mt-3 font-semibold">{selected.name}</h3>
              <p className="mt-1 text-xs leading-5 text-black/50">{selected.description}</p>
            </section>
            <section className="grid grid-cols-2 border-b border-black/10">
              <button
                type="button"
                onClick={() => void togglePreference(selected, "favorite")}
                className="flex min-h-16 flex-col items-center justify-center gap-1 border-r border-black/10 text-[11px]"
              >
                <Star className={`h-4 w-4 ${selected.favorite ? "fill-amber-400 text-amber-500" : ""}`} />
                Favori
              </button>
              <button
                type="button"
                onClick={() => void togglePreference(selected, "archived")}
                className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px]"
              >
                <Archive className="h-4 w-4" /> Archiver
              </button>
            </section>
            <section className="border-b border-black/10 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase text-black/45">
                  Membres · {selected.memberCount}
                </h3>
              </div>
              <div className="mt-3 grid gap-1">
                {selected.members.map((person) => (
                  <button
                    type="button"
                    key={person.id}
                    onClick={() => person.id !== data.member.id && void createDirect(person.id)}
                    className="flex min-h-11 items-center gap-3 px-1 text-left hover:bg-white/70"
                  >
                    <span className="relative grid h-8 w-8 place-items-center bg-[#dfe3da] text-[11px] font-bold">
                      {initials(person.displayName)}
                      <span
                        className={`absolute bottom-0 right-0 h-2 w-2 ${
                          presence[person.id] === "online" ? "bg-emerald-500" : "bg-zinc-300"
                        }`}
                      />
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-xs">{person.displayName}</strong>
                      <span className="block truncate text-[11px] text-black/55">{person.role}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="p-4">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase text-black/45">
                <Pin className="h-3.5 w-3.5" /> Éléments épinglés
              </h3>
              <div className="mt-3 space-y-2">
                {pinnedMessages.length ? (
                  pinnedMessages.map((message) => (
                    <button
                      type="button"
                      key={message.id}
                      onClick={() =>
                        document
                          .querySelector(`[data-message-id="${message.id}"]`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                      className="block w-full border-l-2 border-[#b58a24] bg-white px-3 py-2 text-left"
                    >
                      <strong className="block truncate text-xs">{message.senderName}</strong>
                      <span className="mt-1 block line-clamp-2 text-[11px] leading-5 text-black/50">
                        {message.body}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs leading-5 text-black/45">
                    Les messages épinglés apparaîtront ici.
                  </p>
                )}
              </div>
            </section>
          </aside>
        </>
      ) : null}

      {threadRoot ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-black/35"
            onClick={() => setThreadRoot(null)}
            aria-label="Fermer le fil"
          />
          <aside className="fixed inset-y-0 right-0 z-[70] flex w-[min(460px,96vw)] flex-col border-l border-black/10 bg-white shadow-xl">
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-black/10 px-4">
              <div>
                <h2 className="text-sm font-semibold">Fil de discussion</h2>
                <p className="text-[11px] text-black/45">{selected?.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setThreadRoot(null)}
                className="grid h-10 w-10 place-items-center"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto py-3">
              {(threadQuery.data?.items || [threadRoot]).map((message, index) => (
                <MessageContent
                  key={message.id}
                  message={message}
                  mine={Number(message.senderUserId) === Number(data.member.id)}
                  showAuthor
                  showDate={false}
                  currentMemberId={Number(data.member.id)}
                  onReply={() => setReplyTo(threadRoot)}
                  onThread={() => undefined}
                  onReaction={(item, emoji) => void react(item, emoji)}
                  onPin={(item) => void pin(item)}
                  onEdit={(item) => {
                    setEditMessage(item);
                    setBody(item.body);
                  }}
                  onDelete={(item) => void remove(item)}
                  onTask={(item) => void convertMessage(item, "to-task")}
                  onDecision={(item) => void convertMessage(item, "to-decision")}
                />
              ))}
            </div>
            <Composer
              channelId={channelId}
              body={body}
              setBody={setComposerBody}
              attachments={attachments}
              setAttachments={setAttachments}
              replyTo={threadRoot}
              setReplyTo={() => undefined}
              editMessage={editMessage}
              setEditMessage={setEditMessage}
              directory={directory}
              mentionUserIds={mentionUserIds}
              setMentionUserIds={setMentionUserIds}
              sending={sendMutation.isPending}
              onSend={() => void sendThreadReply()}
              onEdit={() => editMutation.mutate()}
              onTyping={onTyping}
              scheduledAt=""
              setScheduledAt={() => undefined}
            />
          </aside>
        </>
      ) : null}

      {searchOpen ? (
        <div className="fixed inset-0 z-[80] bg-black/40 p-3 sm:p-8">
          <section className="mx-auto flex h-full max-h-[760px] max-w-3xl flex-col overflow-hidden bg-white shadow-2xl">
            <header className="flex items-center gap-3 border-b border-black/10 p-3">
              <Search className="h-5 w-5 text-black/35" />
              <input
                autoFocus
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                placeholder="Rechercher dans tous vos messages autorisés"
                className="h-11 min-w-0 flex-1 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="grid h-10 w-10 place-items-center"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {globalSearch.trim().length < 2 ? (
                <div className="grid h-full place-items-center p-8 text-center text-sm text-black/45">
                  Saisissez au moins deux caractères.
                </div>
              ) : searchQuery.isLoading ? (
                <div className="grid h-full place-items-center">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : searchQuery.data?.items.length ? (
                searchQuery.data.items.map((result) => (
                  <button
                    type="button"
                    key={result.id}
                    onClick={() => {
                      setChannelId(Number(result.channelId));
                      setMobileConversationOpen(true);
                      setSearchOpen(false);
                      requestAnimationFrame(() =>
                        document
                          .querySelector(`[data-message-id="${result.id}"]`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                      );
                    }}
                    className="block min-h-20 w-full border-b border-black/[0.07] px-5 py-3 text-left hover:bg-black/[0.03]"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <strong className="text-xs">{result.senderName || "AGOOJIYE"}</strong>
                      <span className="text-[11px] text-black/50">
                        {formatConversationTime(result.createdAt)}
                      </span>
                    </span>
                    <span className="mt-2 block line-clamp-2 text-sm leading-5 text-black/60">
                      {result.body}
                    </span>
                  </button>
                ))
              ) : (
                <div className="grid h-full place-items-center p-8 text-center">
                  <div>
                    <Search className="mx-auto h-6 w-6 text-black/25" />
                    <p className="mt-3 text-sm font-semibold">Aucun résultat</p>
                    <p className="mt-1 text-xs text-black/45">
                      Essayez un autre mot ou un nom de personne.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {actionPending ? (
        <div className="fixed bottom-20 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 bg-[#171a18] px-4 py-3 text-xs text-white shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" /> Création en cours…
        </div>
      ) : null}
    </div>
  );
}
