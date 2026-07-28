export type ChatPresence = "online" | "busy" | "away" | "offline";

export type ChatDirectoryMember = {
  id: number;
  displayName: string;
  firstName?: string | null;
  role?: string | null;
  teamId?: number | null;
  status: string;
};

export type ChatConversation = {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  type: "direct" | "channel";
  teamId?: number | null;
  projectId?: number | null;
  confidentiality: number;
  memberCount: number;
  members: ChatDirectoryMember[];
  peer?: ChatDirectoryMember | null;
  unreadCount: number;
  favorite: boolean;
  archived: boolean;
  mutedUntil?: string | null;
  folder?: string | null;
  lastMessage?: {
    id: number;
    body: string;
    senderUserId?: number | null;
    senderName?: string | null;
    createdAt: string;
    messageType: string;
  } | null;
  updatedAt: string;
};

export type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  byteSize: number;
  kind: "image" | "voice" | "video" | "document";
  url: string;
};

export type ChatReaction = {
  emoji: string;
  count: number;
  userIds: number[];
  users: string[];
};

export type ChatMessage = {
  id: number;
  channelId: number;
  senderUserId?: number | null;
  senderName?: string | null;
  senderRole?: string | null;
  body: string;
  messageType: string;
  replyToMessageId?: number | null;
  threadRootMessageId?: number | null;
  clientMessageId?: string | null;
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
  pinned: boolean;
  editedAt?: string | null;
  deletedAt?: string | null;
  scheduledAt?: string | null;
  sentAt?: string | null;
  deliveryStatus: "queued" | "sending" | "scheduled" | "sent" | "delivered" | "read" | "failed";
  createdAt: string;
  updatedAt?: string;
  threadReplyCount: number;
  replyPreview?: {
    id: number;
    senderName: string;
    body: string;
  } | null;
  optimistic?: boolean;
};

export type ConversationListPayload = {
  ok: boolean;
  items: ChatConversation[];
  unreadTotal: number;
  directory: ChatDirectoryMember[];
};

export type MessagePagePayload = {
  ok: boolean;
  items: ChatMessage[];
  page: {
    hasMore: boolean;
    nextBefore: number | null;
  };
};

export type AiContext = {
  type: "personal" | "department" | "project" | "mobility" | "direction";
  id?: string | null;
  label: string;
  description: string;
};

export type AiConversation = {
  id: string;
  title: string;
  contextType: AiContext["type"];
  contextId?: string | null;
  contextLabel: string;
  pinned: boolean;
  status: "active" | "archived";
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiSource = {
  type: string;
  title: string;
  detail?: string;
  href?: string;
};

export type AiAction = {
  id: string;
  actionType: string;
  label: string;
  payload: Record<string, unknown>;
  riskLevel: string;
  status: "proposed" | "completed" | "rejected";
  requiresApproval: boolean;
};

export type AiMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  parentMessageId?: string | null;
  sources: AiSource[];
  proposedActions?: AiAction[];
  provider?: string | null;
  model?: string | null;
  feedback?: "positive" | "negative" | null;
  createdAt: string;
  optimistic?: boolean;
};
