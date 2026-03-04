import { useState, useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/use-company";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { getAgentAvatarUrl } from "@/lib/agentAvatar";
import { apiRequest } from "@/lib/queryClient";
import { Separator } from "@/components/ui/separator";
import { VoiceToTextButton } from "@/components/chat/VoiceToTextButton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Send,
  MessageSquare,
  Users,
  Plus,
  Target,
  Video,
  Bot,
  Activity,
  Crown,
  TrendingUp,
  Megaphone,
  Briefcase,
  UserPlus,
  UserMinus,
  Search,
  Circle,
  Zap,
  X,
  Calendar,
  Sparkles,
  Brain,
  Square,
  Clock,
  Loader2,
  Check,
  ChevronsUpDown,
  Menu,
  PanelLeft,
  PanelRight,
  Paperclip,
  FileText,
} from "lucide-react";
import type { Agent } from "@db/schema";
import { format, formatDistanceToNowStrict } from "date-fns";

type BackgroundConsentPlan = {
  what: string;
  why: string;
  forHowLong: string;
  resources: string[];
  howToAuthorize: string[];
  howToStop: string[];
  visibility: string;
};

type AiStatusPayload = {
  config?: Record<string, any>;
  processes?: {
    backgroundConversations?: { running?: boolean; lastCycleAt?: string | null; lastError?: string | null };
    opsCommsAutopilot?: { running?: boolean; lastCycleAt?: string | null; lastError?: string | null };
  };
  backgroundSessions?: {
    activeSessionId?: string | null;
    items?: Array<any>;
  };
};

interface ChannelMessage {
  id: number | string;
  clientMessageId?: string | null;
  inReplyToClientMessageId?: string | null;
  content: string;
  messageType: string;
  contextTags?: string[];
  createdAt: string;
  fromAgent?: {
    id?: number;
    name: string;
    role: string;
  };
  isBackgroundMessage?: boolean;
  attachments?: ChannelAttachment[];
  metadata?: Record<string, any> | null;
  actions?: number;
  linkedItem?: string;
}

interface ChannelAttachment {
  id: string;
  name: string;
  type?: string;
  size?: number;
  textPreview?: string;
  version?: number;
  url?: string;
}

interface ChatRoom {
  id: string | number;
  name: string;
  type: string;
  createdAt: string;
  conversationId: string;
  agents: Agent[];
  status?: string;
  isActive?: boolean;
  lastActivity?: string;
  isBackgroundConversation?: boolean;
  metadata?: any;
}

interface Message {
  id: number;
  content: string;
  fromAgentId: number | null;
  toAgentId: number | null;
  type: "chat" | "system" | "notification" | "thought";
  status: "sending" | "sent" | "error";
  conversationId: string;
  createdAt: string;
  fromAgent?: Agent;
  metadata?: any;
}

type MembershipAuditEvent = {
  id: number | null;
  eventType: string;
  reasonCode: string;
  reasonText: string | null;
  relatedTaskId: number | null;
  actorUserId: number | null;
  actorAgentId: number | null;
  targetAgentId: number | null;
  actorName: string | null;
  targetAgentName: string | null;
  createdAt: string;
};

type MembershipAuditResponse = {
  conversationId: string;
  members: Array<{ id?: number; agentId?: number; agent?: Agent | null }>;
  events: MembershipAuditEvent[];
};

interface ActivityItem {
  id: number;
  companyId: number;
  agentId: number | null;
  eventType: string;
  eventCategory: string;
  title: string;
  description: string | null;
  metadata: any;
  createdAt: string;
  agent?: Agent;
}

interface Goal {
  id: number;
  title: string;
  status?: string | null;
  priority?: string | null;
}

interface TaskItem {
  id: number;
  title: string;
  description: string;
  goalId?: number | null;
  status?: string | null;
  priority?: string | null;
  approvalStatus?: string | null;
  dueDate?: string | null;
  sourceMeetingId?: number | null;
  agent?: { id: number; name: string; role?: string | null } | null;
}

type AgendaSnapshotItem = {
  id: string;
  meetingId: number | null;
  title: string;
  status: string;
  startTime: string;
  endTime: string | null;
  conversationId: string | null;
  objectiveId: number | null;
};

type BrainstormSession = {
  id: string;
  tenant_id: number;
  conversation_id: string | null;
  meeting_id: number | null;
  company_id: number | null;
  topic: string;
  duration_sec: number;
  status: "running" | "stopped" | "done" | "failed";
  started_at: string;
  ended_at: string | null;
  settings_json?: Record<string, any> | null;
  participants_agent_ids?: number[] | null;
  summary_message_id?: number | null;
  message_count?: number | null;
  token_usage?: number | null;
  max_tokens?: number | null;
  error?: string | null;
};

const DEPARTMENT_CONFIG: Record<string, { color: string; bgColor: string; icon: any }> = {
  Management: {
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/30",
    icon: Crown
  },
  Sales: {
    color: "text-green-400",
    bgColor: "bg-green-500/10 border-green-500/30",
    icon: TrendingUp
  },
  Marketing: {
    color: "text-pink-400",
    bgColor: "bg-pink-500/10 border-pink-500/30",
    icon: Megaphone
  },
  Operations: {
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    icon: Briefcase
  }
};

function getDepartmentFromRole(role: string): string {
  const roleLower = role?.toLowerCase() || "";
  if (roleLower.includes("sales") || roleLower.includes("sdr") || roleLower.includes("closer")) return "Sales";
  if (roleLower.includes("marketing") || roleLower.includes("content") || roleLower.includes("social") || roleLower.includes("cmo")) return "Marketing";
  if (roleLower.includes("operations") || roleLower.includes("automation") || roleLower.includes("data")) return "Operations";
  return "Management";
}

function getWelcomeMessages(agents: Agent[], activeAgentIds: number[]): ChannelMessage[] {
  const now = new Date();
  const messages: ChannelMessage[] = [];
  
  const activeAgents = agents.filter(a => activeAgentIds.includes(a.id));
  
  if (activeAgents.length === 0) {
    messages.push({
      id: 'system-welcome',
      content: `Welcome to the Operations Center. Add agents from the sidebar to start a conversation or select a meeting from the left panel.`,
      messageType: 'system',
      contextTags: ['welcome'],
      createdAt: new Date(now.getTime() - 60000).toISOString(),
      fromAgent: { name: 'System', role: 'Operations Center' }
    });
  }

  return messages;
}

const MAX_CHAT_ATTACHMENTS = 5;
const MAX_ATTACHMENT_PREVIEW_CHARS = 1800;
const CHANNEL_CONVERSATION_PAGE_SIZE = 200;
const CHAT_AUTOSCROLL_THRESHOLD_PX = 120;

function createClientMessageId() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return (crypto as any).randomUUID() as string;
    }
  } catch {
    // ignore
  }

  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function formatAttachmentSize(size?: number) {
  const value = typeof size === "number" && Number.isFinite(size) ? Math.max(0, size) : 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${value} B`;
}

function isTextAttachment(file: File) {
  const mime = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  if (mime.startsWith("text/")) return true;
  return /\.(txt|md|markdown|json|csv|tsv|xml|yaml|yml|log|ini|conf|js|ts|tsx|jsx|py|sql|html|css)$/i.test(name);
}

function buildMessageRenderKey(message: ChannelMessage, idx: number) {
  const scope = message.isBackgroundMessage ? "bg" : "chat";
  return `${scope}:${String(message.id)}:${String(message.createdAt || "")}:${idx}`;
}

function asPositiveInt(value: unknown) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function getOldestStoredMessageId(messages: ChannelMessage[]) {
  let min: number | null = null;
  for (const msg of messages) {
    if (msg.isBackgroundMessage) continue;
    const id = asPositiveInt(msg.id);
    if (id == null) continue;
    min = min == null ? id : Math.min(min, id);
  }
  return min;
}

function mergeChannelMessages(existing: ChannelMessage[], incoming: ChannelMessage[]) {
  const merged = existing.slice();

  const seenById = new Set(existing.map((msg) => `${msg.isBackgroundMessage ? "bg" : "chat"}:${String(msg.id)}`));
  const indexByClientMessageId = new Map<string, number>();

  for (let index = 0; index < existing.length; index += 1) {
    const msg = existing[index];
    const scope = msg.isBackgroundMessage ? "bg" : "chat";
    const cmid = typeof msg.clientMessageId === "string" ? msg.clientMessageId.trim() : "";
    if (cmid) indexByClientMessageId.set(`${scope}:${cmid}`, index);
  }

  for (const msg of incoming) {
    const scope = msg.isBackgroundMessage ? "bg" : "chat";
    const idKey = `${scope}:${String(msg.id)}`;
    if (seenById.has(idKey)) continue;

    const cmid = typeof msg.clientMessageId === "string" ? msg.clientMessageId.trim() : "";
    const cmidKey = cmid ? `${scope}:${cmid}` : "";
    const existingIndex = cmidKey ? indexByClientMessageId.get(cmidKey) : undefined;

    if (existingIndex != null) {
      merged[existingIndex] = { ...merged[existingIndex], ...msg };
      seenById.add(idKey);
      continue;
    }

    seenById.add(idKey);
    merged.push(msg);
    if (cmidKey) indexByClientMessageId.set(cmidKey, merged.length - 1);
  }

  return merged;
}

function createdAtToEpoch(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return Number.NaN;
  if (/^\d{10,13}$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return raw.length <= 10 ? numeric * 1000 : numeric;
    }
  }
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function compareByCreatedAtAsc(a: { createdAt?: unknown; id?: unknown }, b: { createdAt?: unknown; id?: unknown }) {
  const leftTs = createdAtToEpoch(a?.createdAt);
  const rightTs = createdAtToEpoch(b?.createdAt);
  if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
    return leftTs - rightTs;
  }
  const leftId = asPositiveInt(a?.id) ?? 0;
  const rightId = asPositiveInt(b?.id) ?? 0;
  if (leftId !== rightId) return leftId - rightId;
  const leftRaw = String(a?.createdAt ?? "");
  const rightRaw = String(b?.createdAt ?? "");
  return leftRaw.localeCompare(rightRaw);
}

function formatCountdown(seconds: number) {
  const total = Math.max(0, Math.trunc(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const BRAINSTORM_DURATION_OPTIONS = [
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "3m", value: 180 },
  { label: "5m", value: 300 },
  { label: "10m", value: 600 },
];

const BRAINSTORM_EXTEND_OPTIONS = [
  { label: "+1m", value: 60 },
  { label: "+3m", value: 180 },
  { label: "+5m", value: 300 },
];

const PIPELINE_STAGE_LABELS = [
  "Chat",
  "Objectives",
  "Agenda",
  "Background",
  "Decisions",
  "Tasks",
  "Actions",
  "Automations",
] as const;

type DecisionItem = {
  id: string;
  text: string;
  authorName: string;
  createdAt: string;
  sourceLabel: "explicit" | "summary";
  objectiveId?: number | null;
};

type SuggestedTaskItem = {
  id: string;
  text: string;
  authorName: string;
  createdAt: string;
};

function extractSectionBullets(content: string, headerPattern: RegExp) {
  const lines = String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  if (!lines.length) return [];

  const headerIndex = lines.findIndex((line) => headerPattern.test(line));
  if (headerIndex < 0) return [];

  const bullets: string[] = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) {
      if (bullets.length) break;
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) break;
    if (/^\*\*.*\*\*$/.test(line) && bullets.length) break;
    if (/^(summary|decisions|tasks|objective|agenda)\b[:\-]?/i.test(line) && bullets.length && !/^[-*]\s+/.test(line)) {
      break;
    }
    const bulletMatch = line.match(/^(?:[-*]\s+|\d+[.)]\s+)(.+)$/);
    if (bulletMatch?.[1]) {
      bullets.push(bulletMatch[1].trim());
      continue;
    }
    if (bullets.length) {
      bullets[bullets.length - 1] = `${bullets[bullets.length - 1]} ${line}`.trim();
    }
  }
  return bullets.filter(Boolean);
}

function extractDecisionItemsFromMessage(input: { id: string; content: string; createdAt: string; authorName: string; metadata?: Record<string, any> | null }) {
  const content = String(input.content || "");
  const objectiveId = asPositiveInt(input.metadata?.objectiveId ?? input.metadata?.goalId);
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: DecisionItem[] = [];
  lines.forEach((line, index) => {
    const match = line.match(/^(?:\[)?decision(?:\])?\s*[:\-]\s*(.+)$/i);
    if (!match?.[1]) return;
    const text = String(match[1]).trim();
    if (!text) return;
    items.push({
      id: `${input.id}:decision:${index}`,
      text,
      authorName: input.authorName,
      createdAt: input.createdAt,
      sourceLabel: "explicit",
      objectiveId,
    });
  });

  const sectionBullets = extractSectionBullets(content, /^#{0,3}\s*decisions\b[:\-]?/i);
  sectionBullets.forEach((text, index) => {
    if (!text) return;
    items.push({
      id: `${input.id}:summary:${index}`,
      text,
      authorName: input.authorName,
      createdAt: input.createdAt,
      sourceLabel: "summary",
      objectiveId,
    });
  });

  if (String(input.metadata?.brainstorm?.label || "").toUpperCase() === "DECISION" && !items.length && content.trim()) {
    items.push({
      id: `${input.id}:brainstorm-label`,
      text: content.trim().slice(0, 420),
      authorName: input.authorName,
      createdAt: input.createdAt,
      sourceLabel: "explicit",
      objectiveId,
    });
  }

  return items;
}

function extractTaskItemsFromMessage(input: { id: string; content: string; createdAt: string; authorName: string; metadata?: Record<string, any> | null }) {
  const content = String(input.content || "");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: SuggestedTaskItem[] = [];
  lines.forEach((line, index) => {
    const match =
      line.match(/^(?:\[)?task(?:\])?\s*[:\-]\s*(.+)$/i) ||
      line.match(/^(?:action item|action)\s*[:\-]\s*(.+)$/i);
    if (!match?.[1]) return;
    const text = String(match[1]).trim();
    if (!text) return;
    items.push({
      id: `${input.id}:task:${index}`,
      text,
      authorName: input.authorName,
      createdAt: input.createdAt,
    });
  });

  const sectionBullets = extractSectionBullets(content, /^#{0,3}\s*tasks?\b[:\-]?/i);
  sectionBullets.forEach((text, index) => {
    if (!text) return;
    items.push({
      id: `${input.id}:task-summary:${index}`,
      text,
      authorName: input.authorName,
      createdAt: input.createdAt,
    });
  });

  if (String(input.metadata?.brainstorm?.label || "").toUpperCase() === "TASK" && !items.length && content.trim()) {
    items.push({
      id: `${input.id}:task-label`,
      text: content.trim().slice(0, 420),
      authorName: input.authorName,
      createdAt: input.createdAt,
    });
  }

  return items;
}

function hasCompletionClaimText(content: unknown) {
  return /\b(created|deleted|moved|updated|fixed|deployed|tested)\b/i.test(String(content || ""));
}

function isTassiAgentIdentity(agent: { name?: string | null; role?: string | null }) {
  const name = String(agent?.name || "").trim().toLowerCase();
  const role = String(agent?.role || "").trim().toLowerCase();
  return name.includes("tassi") || role.includes("chairman assistant");
}

type MessageActionRun = {
  id: number;
  publicActionId: string;
  state?: string;
  status?: string;
  receiptCount?: number;
  lastError?: string | null;
  correlationId?: string | null;
};

function toActionPublicId(value: unknown, fallbackId: number) {
  const direct = String(value || "").trim();
  if (direct) return direct;
  return `ACT-${String(Math.max(0, fallbackId)).padStart(6, "0")}`;
}

function extractActionRuns(metadata: any): MessageActionRun[] {
  const dispatchCreated = Array.isArray(metadata?.actionDispatch?.created) ? metadata.actionDispatch.created : [];
  const actionRunIds = Array.isArray(metadata?.actionRunIds)
    ? metadata.actionRunIds.map((value: any) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0)
    : [];

  const byId = new Map<number, MessageActionRun>();
  for (const entry of dispatchCreated) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    byId.set(id, {
      id,
      publicActionId: toActionPublicId(entry?.publicActionId ?? entry?.public_action_id, id),
      state:
        String(entry?.state || entry?.lifecycleState || "").trim() ||
        String(entry?.status || "").trim() ||
        undefined,
      status: entry?.status ? String(entry.status) : undefined,
      receiptCount: typeof entry?.receipt_count === "number" ? entry.receipt_count : undefined,
      lastError:
        String(entry?.errorMessage || entry?.error_message || entry?.lastError || "").trim() || null,
      correlationId: String(entry?.correlationId || entry?.correlation_id || "").trim() || null,
    });
  }
  for (const id of actionRunIds) {
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        publicActionId: toActionPublicId(null, id),
      });
    }
  }
  return Array.from(byId.values()).slice(0, 3);
}

function membershipReasonLabel(reasonCode: string) {
  const normalized = String(reasonCode || "").toUpperCase();
  if (normalized === "MANUAL_INVITE") return "Manual invite";
  if (normalized === "TASK_ASSIGNED") return "Task assigned";
  if (normalized === "ESCALATION") return "Escalation";
  if (normalized === "WATCHER") return "Watcher";
  if (normalized === "SYSTEM_DEFAULT") return "System default";
  return normalized || "Unknown";
}

type WorkstationChipState = "RUNNING" | "IDLE" | "NEEDS_PERMISSION" | "DISABLED" | "ERROR" | "UNKNOWN";

type AgentWorkstationSnapshot = {
  agentId: number;
  workstationId: string | null;
  permissionState: string;
  runtimeStatus: string;
  state: WorkstationChipState;
  canOpenLive: boolean;
  detail: string;
};

function toWorkstationState(permissionState: string, runtimeStatus: string): WorkstationChipState {
  const permission = String(permissionState || "").toUpperCase();
  const status = String(runtimeStatus || "").toUpperCase();
  if (permission === "NEEDS_PERMISSION") return "NEEDS_PERMISSION";
  if (permission === "DISABLED") return "DISABLED";
  if (status === "RUNNING") return "RUNNING";
  if (status === "FAILED" || status === "ERROR") return "ERROR";
  if (status === "STOPPED" || status === "IDLE" || status === "CREATING" || status === "DESTROYED") return "IDLE";
  return "UNKNOWN";
}

function workstationChipLabel(state: WorkstationChipState) {
  if (state === "NEEDS_PERMISSION") return "NEEDS PERMISSION";
  return state;
}

function workstationChipClass(state: WorkstationChipState) {
  if (state === "RUNNING") return "border-emerald-500/60 bg-emerald-500/10 text-emerald-200";
  if (state === "IDLE") return "border-gray-600 bg-gray-700/40 text-gray-200";
  if (state === "NEEDS_PERMISSION") return "border-amber-500/60 bg-amber-500/10 text-amber-200";
  if (state === "DISABLED") return "border-gray-600 bg-gray-700/40 text-gray-400";
  if (state === "ERROR") return "border-red-500/60 bg-red-500/10 text-red-200";
  return "border-slate-600 bg-slate-700/40 text-slate-200";
}

export function AITeamHubPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompanyId, companies, isLoading: companiesLoading } = useCompany();
  const isMobile = useIsMobile();
  const [messageInput, setMessageInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChannelAttachment[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [localMessages, setLocalMessages] = useState<ChannelMessage[]>([]);
  const [activeAgentIds, setActiveAgentIds] = useState<number[]>([]);
  const [membersAuditOpen, setMembersAuditOpen] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [showAgentList, setShowAgentList] = useState(!isMobile);
  const [meetingSearch, setMeetingSearch] = useState("");
  const [currentMeeting, setCurrentMeeting] = useState<ChatRoom | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [showDepartmentFilter, setShowDepartmentFilter] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollAreaRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const forceAutoScrollRef = useRef(false);
  const suppressAutoScrollRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMentionPopover, setShowMentionPopover] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const [brainstormPopoverOpen, setBrainstormPopoverOpen] = useState(false);
  const [brainstormTopic, setBrainstormTopic] = useState("");
  const [brainstormDurationSec, setBrainstormDurationSec] = useState(60);
  const [brainstormSummarizeAtEnd, setBrainstormSummarizeAtEnd] = useState(true);
  const [brainstormCreateTasks, setBrainstormCreateTasks] = useState(true);
  const [brainstormAllowActions, setBrainstormAllowActions] = useState(false);
  const [brainstormTick, setBrainstormTick] = useState(Date.now());
  const [mobileLeftSheet, setMobileLeftSheet] = useState(false);
  const [mobileRightSheet, setMobileRightSheet] = useState(false);
  const [executionApproverAgentId, setExecutionApproverAgentId] = useState<number | null>(null);
  const [opsView, setOpsView] = useState<
    | "chat"
    | "objectives"
    | "agenda"
    | "background"
    | "decisions"
    | "tasks"
    | "actions"
    | "automations"
    | "arborescence"
    | "live"
  >("chat");
  const [selectedOpsThreadId, setSelectedOpsThreadId] = useState<number | null>(null);
  const [opsCommsInput, setOpsCommsInput] = useState("");
  const [bgConsentOpen, setBgConsentOpen] = useState(false);
  const [bgConsentPlan, setBgConsentPlan] = useState<BackgroundConsentPlan | null>(null);
  const [bgRequestedMinutes, setBgRequestedMinutes] = useState(10);
  const [bgAgendaText, setBgAgendaText] = useState("");
  const [bgObjectiveId, setBgObjectiveId] = useState<number | null>(null);
  const [bgAgendaEventId, setBgAgendaEventId] = useState<number | null>(null);
  const [bgParticipantAgentIds, setBgParticipantAgentIds] = useState<number[]>([]);
  const [selectedBackgroundConversationId, setSelectedBackgroundConversationId] = useState<string | null>(null);
  const [backgroundInterventionInput, setBackgroundInterventionInput] = useState("");
  const [workstationBusyAgentId, setWorkstationBusyAgentId] = useState<number | null>(null);
  const [emailActionDraft, setEmailActionDraft] = useState({
    agentKey: "marketing",
    to: "",
    subject: "",
    body: "",
  });
  const { user } = useSession();
  const adminLikeUser = useMemo(() => {
    const currentMode = String((user as any)?.currentMode || "").trim().toLowerCase();
    const roles = Array.isArray((user as any)?.roles) ? (user as any).roles.map((r: any) => String(r || "").toLowerCase()) : [];
    const permissions = Array.isArray((user as any)?.permissions)
      ? (user as any).permissions.map((p: any) => String(p || "").toLowerCase())
      : [];
    return (
      currentMode === "admin" ||
      roles.includes("admin") ||
      roles.includes("chairman assistant") ||
      roles.includes("platform admin") ||
      roles.includes("super admin") ||
      permissions.includes("*") ||
      permissions.includes("admin:*")
    );
  }, [user]);

  const actionStateForUi = (item: any) =>
    String(item?.state || item?.lifecycleState || item?.status || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
  const actionPublicIdForUi = (item: any) =>
    String(item?.publicActionId || item?.public_action_id || "").trim() ||
    `ACT-${String(Math.max(0, Number(item?.id || 0))).padStart(6, "0")}`;
  const actionStateClassForUi = (state: string) => {
    if (state === "FAILED") return "bg-red-500/10 text-red-300 border-red-500/30";
    if (state === "SUCCEEDED" || state === "DONE") return "bg-green-500/10 text-green-300 border-green-500/30";
    if (state === "RUNNING") return "bg-blue-500/10 text-blue-300 border-blue-500/30";
    if (state === "QUEUED" || state === "CREATED") return "bg-amber-500/10 text-amber-300 border-amber-500/30";
    if (state === "CANCELED") return "bg-gray-700/40 text-gray-300 border-gray-600";
    return "bg-gray-700/40 text-gray-300 border-gray-600";
  };

  const setDraftText = (text: string) => {
    setMessageInput(String(text || ""));
  };

  const appendDraftText = (text: string) => {
    const chunk = String(text || "").trim();
    if (!chunk) return;
    setMessageInput((prev) => {
      const base = String(prev || "");
      if (!base.trim()) return chunk;
      return /\s$/.test(base) ? `${base}${chunk}` : `${base} ${chunk}`;
    });
  };

  const { data: agents = [], isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    enabled: true
  });

  const { data: chatRooms = [], isLoading: roomsLoading } = useQuery<ChatRoom[]>({
    queryKey: ["/api/chatrooms"],
    refetchInterval: 5000,
  });

  const channelConversationEndpoint = selectedCompanyId
    ? `/api/companies/${selectedCompanyId}/channels/all-team/conversation`
    : "";
  const channelConversationQueryKey = [channelConversationEndpoint];

  const {
    data: conversationPages,
    isLoading: messagesLoading,
    isFetchingNextPage: loadingOlderMessages,
    hasNextPage: hasOlderMessages,
    fetchNextPage: fetchOlderMessages,
  } = useInfiniteQuery<ChannelMessage[]>({
    queryKey: channelConversationQueryKey,
    enabled: Boolean(channelConversationEndpoint) && !currentMeeting,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      if (!channelConversationEndpoint) return [];
      const params = new URLSearchParams();
      params.set("limit", String(CHANNEL_CONVERSATION_PAGE_SIZE));
      if (pageParam) params.set("beforeId", String(pageParam));
      const url = `${channelConversationEndpoint}?${params.toString()}`;
      return apiRequest(url);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!Array.isArray(lastPage)) return undefined;
      if (lastPage.length < CHANNEL_CONVERSATION_PAGE_SIZE) return undefined;
      const flattened = allPages.flat();
      return getOldestStoredMessageId(flattened) ?? undefined;
    },
    refetchInterval: (query: any) => {
      if (currentMeeting || opsView !== "chat") return false;
      const pages = query?.state?.data?.pages;
      if (Array.isArray(pages) && pages.length > 1) return false;
      return 5_000;
    },
    refetchIntervalInBackground: false,
    retry: 0,
    staleTime: 10_000,
  });

  const conversationMessages = useMemo(
    () => (conversationPages?.pages ? conversationPages.pages.flat() : []),
    [conversationPages?.pages],
  );

  const { data: meetingMessages = [], isLoading: meetingMessagesLoading } = useQuery<Message[]>({
    queryKey: [`/api/messages/${currentMeeting?.conversationId}`],
    enabled: !!currentMeeting?.conversationId,
    refetchInterval: 3000,
  });

  const channelConversationId = !currentMeeting && selectedCompanyId ? `channel:${selectedCompanyId}:all-team` : null;
  const currentConversationId = currentMeeting?.conversationId || channelConversationId || null;
  const currentMeetingId = currentMeeting ? asPositiveInt((currentMeeting as any).id) : null;
  const membershipAuditKey = currentConversationId
    ? `/api/chatrooms/${encodeURIComponent(currentConversationId)}/membership-audit`
    : "";

  const membershipAuditQuery = useQuery<MembershipAuditResponse>({
    queryKey: [membershipAuditKey],
    enabled: Boolean(membershipAuditKey) && membersAuditOpen,
    refetchInterval: membersAuditOpen ? 5_000 : false,
  });

  const brainstormActiveEndpoint = currentConversationId
    ? `/api/brainstorm/active?conversation_id=${encodeURIComponent(currentConversationId)}${
        currentMeetingId ? `&meeting_id=${currentMeetingId}` : ""
      }`
    : "";

  const { data: activeBrainstormResponse } = useQuery<{ ok: boolean; session: BrainstormSession | null }>({
    queryKey: [brainstormActiveEndpoint],
    enabled: Boolean(brainstormActiveEndpoint),
    refetchInterval: currentConversationId ? 2_000 : false,
    staleTime: 1_000,
  });

  const activeBrainstormSession = (activeBrainstormResponse as any)?.session as BrainstormSession | null;

  const { data: channelMemberships = [] } = useQuery<{ agent: Agent }[]>({
    queryKey: [channelConversationId ? `/api/chatrooms/${encodeURIComponent(channelConversationId)}/members` : ""],
    enabled: !!channelConversationId,
  });

  const { data: activeMemberships = [] } = useQuery<{ agent: Agent }[]>({
    queryKey: [`/api/chatrooms/${currentMeeting?.conversationId}/members`],
    enabled: !!currentMeeting?.conversationId,
  });

  const meetingAgents = activeMemberships.map(m => m.agent).filter(Boolean);
  const didHydrateChannelMembers = useRef(false);

  const { data: activityFeed } = useQuery<{
    items: Array<{
      id: string;
      type: string;
      timestamp: string;
      fromAgent: { id: number; name: string; role: string; avatar?: string } | null;
      toAgent: { id: number; name: string; role: string } | null;
      content: string;
      roomName: string;
    }>;
    pagination: { limit: number; offset: number; hasMore: boolean };
  }>({
    queryKey: [selectedCompanyId ? `/api/companies/${selectedCompanyId}/activity-feed` : ""],
    enabled: !!selectedCompanyId,
    refetchInterval: 30000
  });

  const { data: activityLogItems = [] } = useQuery<ActivityItem[]>({
    queryKey: [`/api/companies/${selectedCompanyId}/activity`],
    enabled: !!selectedCompanyId,
    refetchInterval: 5000,
  });

  const commsEnabled = !currentMeeting && (opsView === "background" || opsView === "live" || opsView === "arborescence");
  const actionsEnabled =
    !currentMeeting &&
    (opsView === "actions" || opsView === "decisions" || opsView === "automations" || opsView === "live" || opsView === "arborescence");
  const agendaEnabled = opsView === "agenda" || opsView === "live" || opsView === "background" || opsView === "arborescence";

  const { data: aiStatus } = useQuery<AiStatusPayload>({
    queryKey: ["/api/ai/status"],
    enabled: commsEnabled,
    staleTime: 2_000,
    refetchInterval: commsEnabled ? 5_000 : false,
    retry: 0,
  });

  const backgroundRoomsQueryKey = selectedCompanyId
    ? `/api/chatrooms?type=background&companyId=${selectedCompanyId}&limit=120`
    : "/api/chatrooms?type=background&limit=120";

  const { data: backgroundRooms = [], isLoading: backgroundRoomsLoading } = useQuery<ChatRoom[]>({
    queryKey: [backgroundRoomsQueryKey],
    enabled: commsEnabled,
    refetchInterval: commsEnabled ? 5_000 : false,
  });

  useEffect(() => {
    if (!commsEnabled) return;
    if (!backgroundRooms.length) {
      setSelectedBackgroundConversationId(null);
      return;
    }

    const stillExists = selectedBackgroundConversationId
      ? backgroundRooms.some((room) => room.conversationId === selectedBackgroundConversationId)
      : false;
    if (!stillExists) {
      setSelectedBackgroundConversationId(backgroundRooms[0].conversationId);
    }
  }, [commsEnabled, backgroundRooms, selectedBackgroundConversationId]);

  const selectedBackgroundRoom = selectedBackgroundConversationId
    ? backgroundRooms.find((room) => room.conversationId === selectedBackgroundConversationId) || null
    : null;

  const backgroundConversationMessagesKey = selectedBackgroundConversationId
    ? `/api/messages/${encodeURIComponent(selectedBackgroundConversationId)}`
    : "";

  const { data: backgroundConversationMessages = [], isLoading: backgroundConversationMessagesLoading } = useQuery<Message[]>({
    queryKey: [backgroundConversationMessagesKey],
    enabled: commsEnabled && !!selectedBackgroundConversationId,
    refetchInterval: commsEnabled ? 5_000 : false,
  });

  const interveneInBackgroundRoom = useMutation({
    mutationFn: async (payload: { conversationId: string; content: string }) =>
      apiRequest("/api/messages", "POST", {
        conversationId: payload.conversationId,
        content: payload.content,
      }),
    onSuccess: async () => {
      setBackgroundInterventionInput("");
      if (backgroundConversationMessagesKey) {
        await queryClient.invalidateQueries({ queryKey: [backgroundConversationMessagesKey] });
      }
      await queryClient.invalidateQueries({ queryKey: [backgroundRoomsQueryKey] });
      toast({ title: "Intervention sent", description: "Your message was posted to the background conversation." });
    },
    onError: (error: any) => {
      toast({
        title: "Intervention failed",
        description: error?.message || "Could not post message to this conversation.",
        variant: "destructive",
      });
    },
  });

  const startBackground = useMutation({
    mutationFn: async (confirm: boolean) => {
      if (confirm) {
        const agenda = bgAgendaText.trim();
        if (!agenda) {
          return { ok: false, status: 400, payload: { message: "Agenda required" } };
        }
        if (!selectedCompanyId) {
          return { ok: false, status: 400, payload: { message: "Company context required" } };
        }
        if (!bgObjectiveId) {
          return { ok: false, status: 400, payload: { message: "Objective required" } };
        }
        if (!bgAgendaEventId) {
          return { ok: false, status: 400, payload: { message: "Agenda event required" } };
        }
        if (!Array.isArray(bgParticipantAgentIds) || bgParticipantAgentIds.length < 2) {
          return { ok: false, status: 400, payload: { message: "Select at least 2 participants" } };
        }

        await apiRequest("/api/ai/background/config", "POST", {
          enabled: true,
          intervalMinutes: Math.max(5, Math.min(240, Math.trunc(bgRequestedMinutes || 10))),
          topic: agenda,
          companyId: selectedCompanyId,
          participantAgentIds: bgParticipantAgentIds,
          objectiveId: bgObjectiveId,
          agendaEventId: bgAgendaEventId,
        });
      }

      const resp = await fetch(resolveApiUrl("/api/ai/background/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          durationMinutes: Math.max(1, Math.min(120, Math.trunc(bgRequestedMinutes || 10))),
          goalText: bgAgendaText.trim(),
          companyId: selectedCompanyId,
          objectiveId: bgObjectiveId,
          agendaEventId: bgAgendaEventId,
          participantAgentIds: bgParticipantAgentIds,
          confirm,
          visibility: "admin",
        }),
      });

      const payload = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, payload };
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        if (result.status === 428 && result.payload?.requiresConsent && result.payload?.plan) {
          setBgConsentPlan(result.payload.plan as BackgroundConsentPlan);
          setBgConsentOpen(true);
          return;
        }

        toast({
          title: "Background start failed",
          description: String(result.payload?.message || "Could not start background session"),
          variant: "destructive",
        });
        return;
      }

      setBgConsentOpen(false);
      setBgConsentPlan(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/comms/threads"] });
      await queryClient.invalidateQueries({ queryKey: [backgroundRoomsQueryKey] });
      toast({ title: "Background running", description: "Background conversations and ops autopilot started." });
    },
    onError: (error: any) => {
      toast({
        title: "Background start failed",
        description: error?.message || "Could not start background session",
        variant: "destructive",
      });
    },
  });

  const stopBackground = useMutation({
    mutationFn: async () => apiRequest("/api/ai/background/stop", "POST", {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
      await queryClient.invalidateQueries({ queryKey: [backgroundRoomsQueryKey] });
      toast({ title: "Background stopped", description: "Background session stopped." });
    },
    onError: (error) => {
      toast({
        title: "Stop failed",
        description: error instanceof Error ? error.message : "Could not stop background session",
        variant: "destructive",
      });
    },
  });

  const { data: opsCommsThreadsResponse, isLoading: opsCommsThreadsLoading } = useQuery<{
    ok: boolean;
    threads: Array<any>;
  }>({
    queryKey: ["/api/comms/threads"],
    enabled: commsEnabled,
    refetchInterval: commsEnabled ? 10_000 : false,
  });

  const opsCommsThreads = Array.isArray(opsCommsThreadsResponse?.threads) ? opsCommsThreadsResponse!.threads : [];

  useEffect(() => {
    if (!commsEnabled) return;
    if (selectedOpsThreadId) return;
    const first = opsCommsThreads[0];
    if (first?.id) setSelectedOpsThreadId(Number(first.id));
  }, [commsEnabled, selectedOpsThreadId, opsCommsThreadsResponse?.threads?.length]);

  const opsThreadMessagesKey = selectedOpsThreadId ? `/api/comms/threads/${selectedOpsThreadId}/messages?limit=500` : "";
  const { data: opsCommsMessagesResponse, isLoading: opsCommsMessagesLoading } = useQuery<{
    ok: boolean;
    messages: Array<any>;
  }>({
    queryKey: [opsThreadMessagesKey],
    enabled: commsEnabled && !!selectedOpsThreadId,
    refetchInterval: commsEnabled ? 5_000 : false,
  });

  const opsCommsMessages = Array.isArray(opsCommsMessagesResponse?.messages) ? opsCommsMessagesResponse!.messages : [];

  const { data: actionsQueueResponse, isLoading: actionsQueueLoading } = useQuery<{
    ok: boolean;
    items: Array<any>;
  }>({
    queryKey: ["/api/actions/queue?limit=200"],
    enabled: actionsEnabled,
    refetchInterval: actionsEnabled ? 5_000 : false,
  });

  const { data: decisionsResponse, isLoading: decisionsLoading } = useQuery<{
    ok: boolean;
    items: Array<any>;
  }>({
    queryKey: ["/api/actions/decisions?limit=200"],
    enabled: !currentMeeting && (opsView === "decisions" || opsView === "live" || opsView === "arborescence"),
    refetchInterval: !currentMeeting && (opsView === "decisions" || opsView === "live" || opsView === "arborescence") ? 5_000 : false,
  });

  const agendaWindow = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 90);
    const to = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365);
    return {
      from: encodeURIComponent(from.toISOString()),
      to: encodeURIComponent(to.toISOString()),
    };
  }, []);

  const agendaSnapshotUrl = `/api/agenda-events?from=${agendaWindow.from}&to=${agendaWindow.to}`;
  const { data: agendaSnapshotResponse, isLoading: agendaSnapshotLoading } = useQuery<{ items?: Array<any> }>({
    queryKey: ["/api/agenda-events", agendaSnapshotUrl, "ops-copy"],
    queryFn: () => apiRequest(agendaSnapshotUrl, { method: "GET" }),
    enabled: agendaEnabled,
    staleTime: 10_000,
    refetchInterval: agendaEnabled ? 15_000 : false,
  });

  const companyAgents = agents.filter(a => 
    !selectedCompanyId || a.companyId === selectedCompanyId
  );

  useEffect(() => {
    if (opsView !== "background") return;
    if (!selectedCompanyId) return;
    if (bgParticipantAgentIds.length >= 2) return;
    const defaults = companyAgents
      .filter((a) => a.status === "active")
      .slice(0, 3)
      .map((a) => a.id);
    if (defaults.length >= 2) setBgParticipantAgentIds(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opsView, selectedCompanyId, companyAgents.length]);

  const selectedBgParticipants = useMemo(() => {
    const set = new Set(bgParticipantAgentIds);
    return companyAgents.filter((a) => set.has(a.id));
  }, [bgParticipantAgentIds, companyAgents]);

  const toPositiveInt = (value: unknown): number | null => {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  const meetingRoomId = currentMeeting ? toPositiveInt((currentMeeting as any).id) : null;
  const meetingCompanyId = currentMeeting ? toPositiveInt((currentMeeting as any)?.metadata?.companyId) : null;
  const tenantCompanyIdSet = useMemo(() => new Set((companies || []).map((company) => Number(company?.id)).filter((id) => Number.isFinite(id) && id > 0)), [companies]);
  const safeMeetingCompanyId = meetingCompanyId && tenantCompanyIdSet.has(meetingCompanyId) ? meetingCompanyId : null;
  const safeMeetingAgentCompanyId = meetingAgents.find((agent) => {
    const companyId = Number(agent?.companyId || 0);
    return Number.isFinite(companyId) && companyId > 0 && tenantCompanyIdSet.has(companyId);
  })?.companyId ?? null;
  const executionCompanyId =
    selectedCompanyId ?? safeMeetingCompanyId ?? safeMeetingAgentCompanyId ?? companyAgents[0]?.companyId ?? null;

  const meetingGoalId = currentMeeting ? toPositiveInt((currentMeeting as any)?.metadata?.goalId) : null;

  const filteredAgents = companyAgents.filter(agent => 
    agent.name?.toLowerCase().includes(agentSearch.toLowerCase()) ||
    agent.role?.toLowerCase().includes(agentSearch.toLowerCase())
  );

  const { data: companyGoals = [], isLoading: goalsLoading } = useQuery<Goal[]>({
    queryKey: [executionCompanyId ? `/api/goals/company/${executionCompanyId}` : ""],
    enabled: !!executionCompanyId,
    refetchInterval: 15000,
  });

  const { data: companyTasks = [], isLoading: tasksLoading } = useQuery<TaskItem[]>({
    queryKey: [executionCompanyId ? `/api/task-lifecycle/company/${executionCompanyId}` : ""],
    enabled: !!executionCompanyId,
    refetchInterval: currentMeeting ? 4000 : 15000,
  });

  const activeAgents = currentMeeting ? meetingAgents : companyAgents.filter(a => activeAgentIds.includes(a.id));
  const availableAgents = currentMeeting 
    ? agents.filter(agent => !meetingAgents.some(ma => ma.id === agent.id))
    : filteredAgents.filter(a => !activeAgentIds.includes(a.id));

  const activeAgentIdList = useMemo(
    () => Array.from(new Set(activeAgents.map((agent) => Number(agent.id)).filter((id) => Number.isFinite(id) && id > 0))),
    [activeAgents],
  );

  const workstationStatusQuery = useQuery<{ byAgentId: Record<number, AgentWorkstationSnapshot> }>({
    queryKey: ["/api/workstations/agents/status", activeAgentIdList.join(",")],
    enabled: activeAgentIdList.length > 0,
    staleTime: 3_000,
    refetchInterval: activeAgentIdList.length > 0 ? 10_000 : false,
    retry: 0,
    queryFn: async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("ece_session") : null;
      const authHeaders = token ? ({ Authorization: `Bearer ${token}` } as Record<string, string>) : undefined;
      const snapshots = await Promise.all(
        activeAgentIdList.map(async (agentId): Promise<AgentWorkstationSnapshot> => {
          try {
            const response = await fetch(resolveApiUrl(`/api/workstations/agents/${agentId}/status`), {
              method: "GET",
              credentials: "include",
              headers: authHeaders,
            });
            if (!response.ok) {
              if (response.status === 403) {
                return {
                  agentId,
                  workstationId: null,
                  permissionState: "FORBIDDEN",
                  runtimeStatus: "UNKNOWN",
                  state: "UNKNOWN",
                  canOpenLive: false,
                  detail: "Monitor access denied",
                };
              }
              if (response.status === 404) {
                return {
                  agentId,
                  workstationId: null,
                  permissionState: "UNAVAILABLE",
                  runtimeStatus: "STOPPED",
                  state: "IDLE",
                  canOpenLive: false,
                  detail: "No workstation",
                };
              }
              return {
                agentId,
                workstationId: null,
                permissionState: "ERROR",
                runtimeStatus: "ERROR",
                state: "ERROR",
                canOpenLive: false,
                detail: `HTTP ${response.status}`,
              };
            }

            const payload = await response.json().catch(() => ({}));
            const permissionState = String(payload?.permissionState || "");
            const runtimeStatus = String(payload?.workstation?.status || "");
            const workstationId = String(payload?.workstation?.id || "").trim() || null;
            const state = toWorkstationState(permissionState, runtimeStatus);
            return {
              agentId,
              workstationId,
              permissionState,
              runtimeStatus,
              state,
              canOpenLive: Boolean(workstationId && String(runtimeStatus || "").toUpperCase() === "RUNNING"),
              detail: String(runtimeStatus || permissionState || "UNKNOWN"),
            };
          } catch {
            return {
              agentId,
              workstationId: null,
              permissionState: "ERROR",
              runtimeStatus: "ERROR",
              state: "ERROR",
              canOpenLive: false,
              detail: "Status check failed",
            };
          }
        }),
      );

      const byAgentId = snapshots.reduce<Record<number, AgentWorkstationSnapshot>>((acc, item) => {
        acc[item.agentId] = item;
        return acc;
      }, {});

      return { byAgentId };
    },
  });

  const workstationStatusByAgentId = workstationStatusQuery.data?.byAgentId || {};

  const openAgentWorkstationLive = async (agent: Agent) => {
    const snapshot = workstationStatusByAgentId[Number(agent.id)];
    if (!snapshot?.workstationId) {
      toast({
        title: "Workstation unavailable",
        description: `${agent.name} has no active workstation to open.`,
        variant: "destructive",
      });
      return;
    }
    if (!snapshot.canOpenLive) {
      toast({
        title: "Live view unavailable",
        description: `${agent.name} workstation is ${workstationChipLabel(snapshot.state)}.`,
        variant: "destructive",
      });
      return;
    }

    setWorkstationBusyAgentId(agent.id);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("ece_session") : null;
      const authHeaders = token ? ({ Authorization: `Bearer ${token}` } as Record<string, string>) : {};
      const response = await fetch(resolveApiUrl(`/api/workstations/${encodeURIComponent(snapshot.workstationId)}/view-token`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify({ scope: "DESKTOP" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.message || `HTTP ${response.status}`));
      }
      const liveUrl = String(payload?.url || payload?.liveUrl || "").trim();
      if (!liveUrl) throw new Error("No live URL returned");
      window.open(liveUrl, "_blank", "noopener,noreferrer");
      toast({
        title: "Live view opened",
        description: `${agent.name} workstation desktop opened in a new tab.`,
      });
    } catch (error: any) {
      toast({
        title: "Live view failed",
        description: String(error?.message || "Could not open workstation live view."),
        variant: "destructive",
      });
    } finally {
      setWorkstationBusyAgentId((current) => (current === agent.id ? null : current));
    }
  };

  const meetingTasks = currentMeeting && meetingRoomId
    ? companyTasks.filter((task) => task.sourceMeetingId === meetingRoomId)
    : [];

  const proposedMeetingTasks = meetingTasks.filter(
    (task) => String(task.approvalStatus || "").toLowerCase() === "pending",
  );

  const confirmedMeetingTasks = meetingTasks.filter(
    (task) => String(task.approvalStatus || "").toLowerCase() === "approved",
  );

  const welcomeMessages = getWelcomeMessages(companyAgents, activeAgentIds);
  const recentActivity = (activityFeed?.items || []).slice(0, 5);
  const hasBackgroundActivity = recentActivity.length > 0 || activityLogItems.length > 0;

  const brainstormRemainingSec = useMemo(() => {
    if (!activeBrainstormSession || activeBrainstormSession.status !== "running") return 0;
    const startedAt = new Date(activeBrainstormSession.started_at || "").getTime();
    if (!Number.isFinite(startedAt)) return 0;
    const durationMs = Math.max(0, Number(activeBrainstormSession.duration_sec || 0) * 1000);
    const endsAt = startedAt + durationMs;
    const remainingMs = endsAt - brainstormTick;
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }, [activeBrainstormSession, brainstormTick]);

  useEffect(() => {
    if (!activeBrainstormSession || activeBrainstormSession.status !== "running") return;
    const timer = window.setInterval(() => setBrainstormTick(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [activeBrainstormSession?.id, activeBrainstormSession?.status]);
  
  const allMessages = currentMeeting
    ? []
    : [...welcomeMessages, ...conversationMessages, ...localMessages].sort(compareByCreatedAtAsc);

  const sortedMeetingMessages = useMemo(
    () =>
      currentMeeting
        ? [...meetingMessages].sort(compareByCreatedAtAsc)
        : [],
    [currentMeeting, meetingMessages],
  );

  const conversationDecisionItems = useMemo(() => {
    const rawItems = currentMeeting
      ? sortedMeetingMessages.map((msg) => ({
          id: `meeting:${msg.id}`,
          content: msg.content,
          createdAt: msg.createdAt,
          authorName: msg.fromAgent?.name || "You",
          metadata: msg.metadata || null,
        }))
      : allMessages.map((msg) => ({
          id: `ops:${String(msg.id)}`,
          content: msg.content,
          createdAt: msg.createdAt,
          authorName: msg.fromAgent?.name || "You",
          metadata: msg.metadata || null,
        }));

    const dedupe = new Map<string, DecisionItem>();
    for (const source of rawItems) {
      const extracted = extractDecisionItemsFromMessage(source);
      for (const item of extracted) {
        const key = `${item.text.toLowerCase()}::${item.createdAt}`;
        if (!dedupe.has(key)) dedupe.set(key, item);
      }
    }
    return Array.from(dedupe.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allMessages, currentMeeting, sortedMeetingMessages]);

  const suggestedConversationTasks = useMemo(() => {
    const rawItems = currentMeeting
      ? sortedMeetingMessages.map((msg) => ({
          id: `meeting:${msg.id}`,
          content: msg.content,
          createdAt: msg.createdAt,
          authorName: msg.fromAgent?.name || "You",
          metadata: msg.metadata || null,
        }))
      : allMessages.map((msg) => ({
          id: `ops:${String(msg.id)}`,
          content: msg.content,
          createdAt: msg.createdAt,
          authorName: msg.fromAgent?.name || "You",
          metadata: msg.metadata || null,
        }));

    const dedupe = new Map<string, SuggestedTaskItem>();
    for (const source of rawItems) {
      const extracted = extractTaskItemsFromMessage(source);
      for (const item of extracted) {
        const key = `${item.text.toLowerCase()}::${item.createdAt}`;
        if (!dedupe.has(key)) dedupe.set(key, item);
      }
    }
    return Array.from(dedupe.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allMessages, currentMeeting, sortedMeetingMessages]);

  const filteredMeetings = chatRooms.filter((room) => {
    const matchesSearch = room.name.toLowerCase().includes(meetingSearch.toLowerCase());
    const isMeeting = room.type === "meeting";
    return matchesSearch && isMeeting;
  });

  const agendaSnapshotItems = useMemo<AgendaSnapshotItem[]>(() => {
    const raw = Array.isArray((agendaSnapshotResponse as any)?.items) ? (agendaSnapshotResponse as any).items : [];
    const normalized = raw
      .map((item: any) => ({
        id: String(item?.id || ""),
        meetingId: asPositiveInt(item?.meetingId ?? item?.agendaEventId ?? item?.id),
        title: String(item?.title || "Meeting"),
        status: String(item?.status || "scheduled"),
        startTime: String(item?.startTime || item?.startAt || ""),
        endTime: typeof item?.endTime === "string" ? item.endTime : null,
        conversationId: typeof item?.conversationId === "string" ? item.conversationId : null,
        objectiveId: asPositiveInt(
          item?.objectiveId ?? item?.goalId ?? item?.metadata?.objectiveId ?? item?.metadata?.goalId,
        ),
      }))
      .filter((item: AgendaSnapshotItem) => item.startTime);

    if (normalized.length > 0) {
      return normalized.sort(
        (a: AgendaSnapshotItem, b: AgendaSnapshotItem) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
    }

    const now = Date.now();
    const min = now - 1000 * 60 * 60 * 24 * 30;
    const max = now + 1000 * 60 * 60 * 24 * 60;
    const fallback = chatRooms
      .filter((room) => {
        const typeValue = String(room.type || "").toLowerCase();
        const nameValue = String(room.name || "").toLowerCase();
        const metadataMeetingId = (room as any)?.metadata?.meetingId;
        return (
          typeValue === "meeting" ||
          typeValue.includes("meeting") ||
          nameValue.startsWith("meeting ") ||
          Number.isFinite(Number(metadataMeetingId))
        );
      })
      .map((room) => {
        const startedAtRaw = (room as any)?.metadata?.startTime || (room as any)?.metadata?.startedAt || room.lastActivity;
        const startedAt = new Date(startedAtRaw || Date.now());
        return {
          id: `room:${room.id}`,
          meetingId: null,
          title: room.name || "Meeting",
          status: room.isActive ? "in_progress" : "scheduled",
          startTime: startedAt.toISOString(),
          endTime: null,
          conversationId: room.conversationId || null,
          objectiveId: asPositiveInt((room as any)?.metadata?.objectiveId ?? (room as any)?.metadata?.goalId),
        } as AgendaSnapshotItem;
      })
      .filter((item) => {
        const ts = new Date(item.startTime).getTime();
        return Number.isFinite(ts) && ts >= min && ts <= max;
      });

    return fallback.sort(
      (a: AgendaSnapshotItem, b: AgendaSnapshotItem) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  }, [agendaSnapshotResponse, chatRooms]);

  const agendaSnapshotVisibleItems = useMemo(() => {
    if (!agendaSnapshotItems.length) return [];
    const now = Date.now();
    const upcoming = agendaSnapshotItems.filter((item) => {
      const ts = new Date(item.startTime).getTime();
      return Number.isFinite(ts) && ts >= now - 1000 * 60 * 60 * 12;
    });
    if (upcoming.length) return upcoming;
    return [...agendaSnapshotItems]
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 20);
  }, [agendaSnapshotItems]);

  const goalsById = useMemo(() => {
    const map = new Map<number, Goal>();
    for (const goal of companyGoals) {
      if (goal?.id) map.set(goal.id, goal);
    }
    return map;
  }, [companyGoals]);

  const agendaItemsForBackground = useMemo(() => {
    const rows = [...agendaSnapshotItems];
    if (bgObjectiveId) {
      return rows.filter((item) => item.objectiveId === bgObjectiveId);
    }
    return rows.filter((item) => item.objectiveId && goalsById.has(item.objectiveId));
  }, [agendaSnapshotItems, bgObjectiveId, goalsById]);

  const selectedBgAgendaEvent = useMemo(() => {
    if (!bgAgendaEventId) return null;
    return agendaSnapshotItems.find((item) => item.meetingId === bgAgendaEventId) || null;
  }, [agendaSnapshotItems, bgAgendaEventId]);

  useEffect(() => {
    if (!companyGoals.length) {
      setBgObjectiveId(null);
      return;
    }
    if (bgObjectiveId && companyGoals.some((goal) => goal.id === bgObjectiveId)) return;
    setBgObjectiveId(companyGoals[0]?.id ?? null);
  }, [companyGoals, bgObjectiveId]);

  useEffect(() => {
    if (!agendaItemsForBackground.length) {
      setBgAgendaEventId(null);
      return;
    }
    if (
      bgAgendaEventId &&
      agendaItemsForBackground.some((item) => item.meetingId && item.meetingId === bgAgendaEventId)
    ) {
      return;
    }
    const firstId = agendaItemsForBackground[0]?.meetingId ?? null;
    setBgAgendaEventId(firstId);
  }, [agendaItemsForBackground, bgAgendaEventId]);

  useEffect(() => {
    if (!selectedBgAgendaEvent) return;
    if (bgAgendaText.trim()) return;
    setBgAgendaText(`${selectedBgAgendaEvent.title} — generate summary, decisions, and owner tasks.`);
  }, [selectedBgAgendaEvent, bgAgendaText]);

  const validateBackgroundStart = () => {
    const agenda = bgAgendaText.trim();
    if (!agenda) {
      toast({
        title: "Agenda required",
        description: "Define an agenda/objective before starting background conversations.",
        variant: "destructive",
      });
      return false;
    }
    if (!selectedCompanyId) {
      toast({
        title: "Company required",
        description: "Select a company context before starting background conversations.",
        variant: "destructive",
      });
      return false;
    }
    if (!bgObjectiveId) {
      toast({
        title: "Objective required",
        description: "Background conversations must be linked to an objective.",
        variant: "destructive",
      });
      return false;
    }
    if (!bgAgendaEventId) {
      toast({
        title: "Agenda required",
        description: "Select a scheduled agenda event linked to that objective.",
        variant: "destructive",
      });
      return false;
    }
    if (!Array.isArray(bgParticipantAgentIds) || bgParticipantAgentIds.length < 2) {
      toast({
        title: "Participants required",
        description: "Select at least 2 agents to participate in this agenda session.",
        variant: "destructive",
      });
      return false;
    }
    const selectedAgenda = agendaSnapshotItems.find((item) => item.meetingId === bgAgendaEventId);
    if (!selectedAgenda || selectedAgenda.objectiveId !== bgObjectiveId) {
      toast({
        title: "Pipeline link required",
        description: "Agenda event must belong to the selected objective.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const arborescence = useMemo(() => {
    const queueItems = Array.isArray(actionsQueueResponse?.items) ? actionsQueueResponse.items : [];
    const approvalItems = Array.isArray(decisionsResponse?.items) ? decisionsResponse.items : [];

    const objectiveNodes = companyGoals.map((goal) => {
      const objectiveId = asPositiveInt(goal.id);
      const linkedAgenda = agendaSnapshotItems.filter((item) => item.objectiveId === objectiveId);
      const linkedBackground = backgroundRooms.filter((room) => {
        const meta = (room as any)?.metadata || {};
        return asPositiveInt(meta?.objectiveId ?? meta?.goalId) === objectiveId;
      });
      const linkedDecisions = conversationDecisionItems.filter((item) => item.objectiveId === objectiveId);
      const linkedTasks = companyTasks.filter((task) => asPositiveInt((task as any)?.goalId) === objectiveId);
      const linkedActions = approvalItems.filter((item: any) => {
        const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
        return asPositiveInt(payload?.objectiveId ?? payload?.goalId) === objectiveId;
      });
      const linkedAutomations = queueItems.filter((item: any) => {
        const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
        return asPositiveInt(payload?.objectiveId ?? payload?.goalId) === objectiveId;
      });

      const blockers: string[] = [];
      if (linkedAgenda.length === 0) blockers.push("No agenda event linked");
      if (linkedBackground.length === 0) blockers.push("No background conversation linked");
      if (linkedDecisions.length === 0) blockers.push("No decision extracted");
      if (linkedTasks.length === 0) blockers.push("No task generated");

      return {
        goal,
        linkedAgenda,
        linkedBackground,
        linkedDecisions,
        linkedTasks,
        linkedActions,
        linkedAutomations,
        blockers,
      };
    });

    const unlinkedAgenda = agendaSnapshotItems.filter((item) => !item.objectiveId);
    const unlinkedBackground = backgroundRooms.filter((room) => {
      const meta = (room as any)?.metadata || {};
      return !asPositiveInt(meta?.objectiveId ?? meta?.goalId);
    });
    const unlinkedTasks = companyTasks.filter((task) => !asPositiveInt((task as any)?.goalId));

    return {
      objectiveNodes,
      unlinkedAgenda,
      unlinkedBackground,
      unlinkedTasks,
    };
  }, [
    actionsQueueResponse?.items,
    agendaSnapshotItems,
    backgroundRooms,
    companyGoals,
    companyTasks,
    conversationDecisionItems,
    decisionsResponse?.items,
  ]);

  const createMeetingMutation = useMutation({
    mutationFn: async (data: { title: string }) => {
      console.log("[Meeting] Creating new meeting:", data.title, "companyId:", selectedCompanyId);
      const response = await fetch(resolveApiUrl("/api/chatrooms"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.title,
          type: "meeting",
          description: "Team meeting",
          companyId: selectedCompanyId,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Meeting] Failed to create:", errorText);
        throw new Error("Failed to create meeting");
      }
      const result = await response.json();
      console.log("[Meeting] Created successfully:", result);
      return result;
    },
    onSuccess: (newRoom) => {
      console.log("[Meeting] Setting current meeting:", newRoom);
      setCurrentMeeting(newRoom);
      queryClient.invalidateQueries({ queryKey: ["/api/chatrooms"] });
      toast({ title: "Meeting Started", description: "Use @agent to invite team members" });
    },
    onError: (error) => {
      console.error("[Meeting] Error:", error);
      toast({ title: "Error", description: "Failed to create meeting", variant: "destructive" });
    },
  });

  const isApproverCandidate = (agent: Agent) => {
    const name = String(agent.name || "").toLowerCase();
    const role = String(agent.role || "").toLowerCase();
    return (
      role.includes("coordinator") ||
      role.includes("chairman") ||
      role.includes("chief") ||
      name.includes("awa bamba")
    );
  };

  const approverCandidates = [...meetingAgents, ...companyAgents].filter(
    (agent, index, list) => !!agent && list.findIndex((a) => a.id === agent.id) === index,
  );
  const suggestedApprover = approverCandidates.find(isApproverCandidate) || approverCandidates[0] || null;
  const approverKey = `${currentMeeting?.conversationId || ""}:${approverCandidates.map((a) => a.id).join(",")}`;

  useEffect(() => {
    if (!currentMeeting) {
      setExecutionApproverAgentId(null);
      return;
    }
    setExecutionApproverAgentId((prev) => {
      if (prev && approverCandidates.some((a) => a.id === prev)) return prev;
      return suggestedApprover?.id ?? null;
    });
  }, [approverKey]);

  useEffect(() => {
    if (currentMeeting) setOpsView("chat");
  }, [currentMeeting?.conversationId]);

  useEffect(() => {
    if (currentMeeting || opsView !== "chat") {
      setPendingAttachments([]);
    }
  }, [currentMeeting?.conversationId, opsView]);

  const setMeetingGoalMutation = useMutation({
    mutationFn: async (goalId: number | null) => {
      if (!meetingRoomId) throw new Error("No active meeting");
      return apiRequest(`/api/chatrooms/${meetingRoomId}/goal`, "POST", { goalId });
    },
    onSuccess: (_data, goalId) => {
      setCurrentMeeting((prev) => {
        if (!prev) return prev;
        const nextMeta = { ...(prev.metadata || {}) };
        if (goalId) (nextMeta as any).goalId = goalId;
        else delete (nextMeta as any).goalId;
        return { ...prev, metadata: nextMeta };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/chatrooms"] });
      toast({
        title: "Meeting goal updated",
        description: goalId ? "Goal linked to this meeting." : "Goal cleared.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to set meeting goal",
        variant: "destructive",
      });
    },
  });

  const createMeetingGoalMutation = useMutation({
    mutationFn: async () => {
      if (!executionCompanyId) throw new Error("No company selected");
      if (!currentMeeting) throw new Error("No active meeting");
      const goal = await apiRequest("/api/goals", "POST", {
        companyId: executionCompanyId,
        title: currentMeeting.name,
        description: `Goal for meeting: ${currentMeeting.name}`,
        metadata: {
          source: "meeting",
          roomId: meetingRoomId,
          conversationId: currentMeeting.conversationId,
        },
      });
      return goal as Goal;
    },
    onSuccess: async (goal) => {
      queryClient.invalidateQueries({ queryKey: [executionCompanyId ? `/api/goals/company/${executionCompanyId}` : ""] });
      await setMeetingGoalMutation.mutateAsync(goal.id);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create goal",
        variant: "destructive",
      });
    },
  });

  const extractMeetingTasksMutation = useMutation({
    mutationFn: async () => {
      if (!meetingRoomId) throw new Error("No active meeting");
      return apiRequest(`/api/chatrooms/${meetingRoomId}/extract-tasks`, "POST", {
        goalId: meetingGoalId,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [executionCompanyId ? `/api/task-lifecycle/company/${executionCompanyId}` : ""] });
      queryClient.invalidateQueries({ queryKey: ["/api/chatrooms"] });
      toast({
        title: "Tasks extracted",
        description: `${Array.isArray((data as any)?.createdTaskIds) ? (data as any).createdTaskIds.length : 0} task(s) created (pending approval).`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to extract tasks",
        variant: "destructive",
      });
    },
  });

  const closeMeetingMutation = useMutation({
    mutationFn: async () => {
      if (!meetingRoomId) throw new Error("No active meeting");
      return apiRequest(`/api/chatrooms/${meetingRoomId}/close`, "POST", {});
    },
    onSuccess: () => {
      setCurrentMeeting(null);
      queryClient.invalidateQueries({ queryKey: ["/api/chatrooms"] });
      toast({ title: "Meeting closed", description: "Summary saved to Knowledge Base." });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to close meeting",
        variant: "destructive",
      });
    },
  });

  const approveTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      if (!executionApproverAgentId) throw new Error("Select an approver first");
      return apiRequest(`/api/tasks/${taskId}/approve`, "POST", { approverAgentId: executionApproverAgentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [executionCompanyId ? `/api/task-lifecycle/company/${executionCompanyId}` : ""] });
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/activity`] });
      }
      toast({ title: "Task approved" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to approve task",
        variant: "destructive",
      });
    },
  });

  const addAgentToMeeting = useMutation({
    mutationFn: async (agentId: number) => {
      if (!currentMeeting) throw new Error("No active meeting");
      const response = await fetch(
        resolveApiUrl(`/api/chatrooms/${currentMeeting.conversationId}/members`),
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          reasonCode: "MANUAL_INVITE",
          reasonText: "Manual invite from Operations Center UI",
        }),
        },
      );
      if (!response.ok) throw new Error("Failed to add agent");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/chatrooms/${currentMeeting?.conversationId}/members`] 
      });
      toast({ title: "Agent Added", description: "The agent has joined the meeting" });
    },
  });

  const removeAgentFromMeeting = useMutation({
    mutationFn: async (agentId: number) => {
      if (!currentMeeting) throw new Error("No active meeting");
      const response = await fetch(
        resolveApiUrl(`/api/chatrooms/${currentMeeting.conversationId}/members/${agentId}`),
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to remove agent");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/chatrooms/${currentMeeting?.conversationId}/members`] 
      });
      toast({ title: "Agent Removed", description: "The agent has left the meeting" });
    },
  });

  const resolveEffectiveCompanyId = () => {
    return (
      selectedCompanyId ??
      companies.find((c) => c.name.toLowerCase().replace(/\s+/g, " ").trim() === "exportunity gold exchange")?.id ??
      companies[0]?.id ??
      null
    );
  };

  const createGoalFromChatMutation = useMutation({
    mutationFn: async (payload: { companyId: number; content: string; conversationId: string; messageId?: string | number }) => {
      const title = payload.content.trim().slice(0, 120) || "New goal";
      return apiRequest("/api/goals", "POST", {
        companyId: payload.companyId,
        title,
        description: payload.content,
        metadata: {
          source: "chat",
          conversationId: payload.conversationId,
          messageId: payload.messageId != null ? String(payload.messageId) : undefined,
        },
      });
    },
    onSuccess: (_goal, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/goals/company/${vars.companyId}`] });
      toast({ title: "Goal Created", description: "Created from chat message" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create goal",
        variant: "destructive",
      });
    },
  });

  const addAgentToChannel = useMutation({
    mutationFn: async (agentId: number) => {
      const companyId = resolveEffectiveCompanyId();
      if (!companyId) throw new Error(companiesLoading ? "Loading company..." : "No company found");
      const conversationId = `channel:${companyId}:all-team`;
      const response = await fetch(resolveApiUrl(`/api/chatrooms/${encodeURIComponent(conversationId)}/members`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          reasonCode: "MANUAL_INVITE",
          reasonText: "Manual invite from Operations Center channel UI",
        }),
      });
      if (!response.ok) throw new Error("Failed to add agent");
      return response.json();
    },
    onSuccess: (_data, agentId) => {
      setActiveAgentIds((prev) => Array.from(new Set([...prev, agentId])));
      didHydrateChannelMembers.current = true;
      queryClient.invalidateQueries({
        queryKey: [selectedCompanyId ? `/api/companies/${selectedCompanyId}/channels/all-team/conversation` : ""],
      });
      queryClient.invalidateQueries({
        queryKey: [channelConversationId ? `/api/chatrooms/${encodeURIComponent(channelConversationId)}/members` : ""],
      });
      toast({ title: "Agent Added", description: "The agent has joined the conversation" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add agent",
        variant: "destructive",
      });
    },
  });

  const removeAgentFromChannel = useMutation({
    mutationFn: async (agentId: number) => {
      const companyId = resolveEffectiveCompanyId();
      if (!companyId) throw new Error(companiesLoading ? "Loading company..." : "No company found");
      const conversationId = `channel:${companyId}:all-team`;
      const response = await fetch(
        resolveApiUrl(`/api/chatrooms/${encodeURIComponent(conversationId)}/members/${agentId}`),
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Failed to remove agent");
      return response.json();
    },
    onSuccess: (_data, agentId) => {
      setActiveAgentIds((prev) => prev.filter((id) => id !== agentId));
      didHydrateChannelMembers.current = true;
      queryClient.invalidateQueries({
        queryKey: [selectedCompanyId ? `/api/companies/${selectedCompanyId}/channels/all-team/conversation` : ""],
      });
      queryClient.invalidateQueries({
        queryKey: [channelConversationId ? `/api/chatrooms/${encodeURIComponent(channelConversationId)}/members` : ""],
      });
      toast({ title: "Agent Removed", description: "The agent has left the conversation" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove agent",
        variant: "destructive",
      });
    },
  });

  const addAgent = (agent: Agent) => {
    if (currentMeeting) {
      addAgentToMeeting.mutate(agent.id);
    } else if (!activeAgentIds.includes(agent.id)) {
      addAgentToChannel.mutate(agent.id);
    }
  };

  const removeAgent = (agent: Agent) => {
    if (currentMeeting) {
      removeAgentFromMeeting.mutate(agent.id);
    } else {
      removeAgentFromChannel.mutate(agent.id);
    }
  };

  const addAllAgents = async () => {
    const ids = availableAgents.map((a) => a.id).filter((id) => typeof id === "number" && id > 0);
    if (!ids.length) return;

    try {
      if (currentMeeting) {
        const response = await fetch(resolveApiUrl(`/api/chatrooms/${currentMeeting.conversationId}/members/batch`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentIds: ids,
            groupName: currentMeeting.name,
            reasonCode: "MANUAL_INVITE",
            reasonText: "Bulk manual invite from Operations Center UI",
          }),
        });
        if (!response.ok) throw new Error("Failed to add agents");
        queryClient.invalidateQueries({
          queryKey: [`/api/chatrooms/${currentMeeting?.conversationId}/members`],
        });
        toast({ title: "All agents added", description: `${ids.length} agents joined the meeting` });
      } else {
        const companyId = resolveEffectiveCompanyId();
        if (!companyId) throw new Error(companiesLoading ? "Loading company..." : "No company found");
        const conversationId = `channel:${companyId}:all-team`;
        const response = await fetch(resolveApiUrl(`/api/chatrooms/${encodeURIComponent(conversationId)}/members/batch`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentIds: ids,
            groupName: "All Team",
            reasonCode: "MANUAL_INVITE",
            reasonText: "Bulk manual invite from channel UI",
          }),
        });
        if (!response.ok) throw new Error("Failed to add agents");
        setActiveAgentIds((prev) => Array.from(new Set([...prev, ...ids])));
        didHydrateChannelMembers.current = true;
        queryClient.invalidateQueries({
          queryKey: [selectedCompanyId ? `/api/companies/${selectedCompanyId}/channels/all-team/conversation` : ""],
        });
        queryClient.invalidateQueries({
          queryKey: [channelConversationId ? `/api/chatrooms/${encodeURIComponent(channelConversationId)}/members` : ""],
        });
        toast({ title: "All agents added", description: `${ids.length} agents joined` });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add agents",
        variant: "destructive",
      });
    }
  };

  const removeAllAgents = async () => {
    try {
      if (currentMeeting) {
        const ids = meetingAgents.map((a) => a.id).filter((id) => typeof id === "number" && id > 0);
        if (!ids.length) return;
        const response = await fetch(resolveApiUrl(`/api/chatrooms/${currentMeeting.conversationId}/members/batch`), {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentIds: ids }),
        });
        if (!response.ok) throw new Error("Failed to remove agents");
        queryClient.invalidateQueries({
          queryKey: [`/api/chatrooms/${currentMeeting?.conversationId}/members`],
        });
        toast({ title: "All agents removed", description: "Meeting cleared" });
      } else {
        const companyId = resolveEffectiveCompanyId();
        if (!companyId) throw new Error(companiesLoading ? "Loading company..." : "No company found");
        const conversationId = `channel:${companyId}:all-team`;
        const ids = activeAgentIds.slice();
        if (!ids.length) return;
        const response = await fetch(resolveApiUrl(`/api/chatrooms/${encodeURIComponent(conversationId)}/members/batch`), {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentIds: ids }),
        });
        if (!response.ok) throw new Error("Failed to remove agents");
        setActiveAgentIds([]);
        didHydrateChannelMembers.current = true;
        queryClient.invalidateQueries({
          queryKey: [selectedCompanyId ? `/api/companies/${selectedCompanyId}/channels/all-team/conversation` : ""],
        });
        queryClient.invalidateQueries({
          queryKey: [channelConversationId ? `/api/chatrooms/${encodeURIComponent(channelConversationId)}/members` : ""],
        });
        toast({ title: "All agents removed", description: "Conversation cleared" });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove agents",
        variant: "destructive",
      });
    }
  };

  const handleSendMeetingMessage = async () => {
    if (!messageInput.trim() || !currentMeeting) return;
    try {
      setIsThinking(true);
      await apiRequest("/api/messages", "POST", {
        content: messageInput,
        type: "chat",
        fromAgentId: null,
        toAgentId: null,
        conversationId: currentMeeting.conversationId,
        metadata: { requestType: "user_message", requiresResponse: true },
      });
      setMessageInput("");
      await queryClient.invalidateQueries({
        queryKey: [`/api/messages/${currentMeeting.conversationId}`],
      });
      await queryClient.invalidateQueries({
        queryKey: [`/api/chatrooms/${currentMeeting.conversationId}/members`],
      });
      window.setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: [`/api/chatrooms/${currentMeeting?.conversationId}/members`],
        });
      }, 1500);
    } catch (error) {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    } finally {
      setIsThinking(false);
    }
  };

  const removePendingAttachment = (attachmentId: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  };

  const onAttachmentSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (!files.length) return;

    const companyId = resolveEffectiveCompanyId();
    if (!companyId) {
      toast({
        title: "Company unavailable",
        description: companiesLoading ? "Still loading company context." : "No company found.",
        variant: "destructive",
      });
      return;
    }

    if (pendingAttachments.length >= MAX_CHAT_ATTACHMENTS) {
      toast({
        title: "Attachment limit reached",
        description: `You can attach up to ${MAX_CHAT_ATTACHMENTS} files per message.`,
        variant: "destructive",
      });
      return;
    }

    setIsUploadingAttachments(true);

    const existingByName = conversationMessages.reduce<Record<string, number>>((acc, message) => {
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      for (const attachment of attachments) {
        const key = String(attachment?.name || "").toLowerCase();
        if (!key) continue;
        const versionRaw = Number(attachment?.version ?? 1);
        const version = Number.isFinite(versionRaw) && versionRaw > 0 ? Math.trunc(versionRaw) : 1;
        acc[key] = Math.max(acc[key] || 0, version);
      }
      return acc;
    }, {});

    for (const item of pendingAttachments) {
      const key = String(item.name || "").toLowerCase();
      if (!key) continue;
      const versionRaw = Number(item.version || 1);
      const version = Number.isFinite(versionRaw) && versionRaw > 0 ? Math.trunc(versionRaw) : 1;
      existingByName[key] = Math.max(existingByName[key] || 0, version);
    }

    const availableSlots = Math.max(0, MAX_CHAT_ATTACHMENTS - pendingAttachments.length);
    const selected = files.slice(0, availableSlots);
    const nextAttachments: ChannelAttachment[] = [];
    let failedCount = 0;
    let firstError: string | null = null;

    for (const file of selected) {
      const key = String(file.name || "").toLowerCase();
      const version = (existingByName[key] || 0) + 1;
      existingByName[key] = version;
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let textPreview: string | undefined = undefined;

      if (isTextAttachment(file)) {
        try {
          const rawText = await file.text();
          const normalized = rawText.replace(/\r\n/g, "\n").trim();
          if (normalized) textPreview = normalized.slice(0, MAX_ATTACHMENT_PREVIEW_CHARS);
        } catch {
          textPreview = undefined;
        }
      }

      try {
        const formData = new FormData();
        formData.append("file", file, file.name);
        formData.append("id", id);
        formData.append("version", String(version));

        const response = await apiRequest(`/api/companies/${companyId}/channels/all-team/attachments`, {
          method: "POST",
          body: formData,
        });

        const attachment = (response as any)?.attachment ?? null;
        if (!attachment || !attachment.url) {
          throw new Error("Upload failed (no attachment URL returned).");
        }

        nextAttachments.push({
          id: String(attachment.id || id),
          name: String(attachment.name || file.name),
          type: String(attachment.type || file.type || "application/octet-stream"),
          size: Number(attachment.size ?? file.size),
          version: Number(attachment.version ?? version),
          url: String(attachment.url),
          ...(textPreview ? { textPreview } : {}),
        });
      } catch (error) {
        failedCount += 1;
        if (!firstError) firstError = error instanceof Error ? error.message : "Upload failed";
      }
    }

    setIsUploadingAttachments(false);

    if (!nextAttachments.length) return;
    setPendingAttachments((prev) => [...prev, ...nextAttachments]);

    if (failedCount > 0) {
      toast({
        title: "Some uploads failed",
        description: `${failedCount} attachment(s) failed to upload${firstError ? `: ${firstError}` : ""}`,
        variant: "destructive",
      });
    }

    toast({
      title: "Attachment uploaded",
      description: `${nextAttachments.length} file${nextAttachments.length > 1 ? "s" : ""} ready to send.`,
    });
  };

  const startBrainstormMutation = useMutation({
    mutationFn: async (payload: {
      conversationId: string;
      meetingId: number | null;
      companyId: number | null;
      topic: string;
      durationSec: number;
      participants: number[];
      settings: {
        summarize_at_end: boolean;
        create_tasks: boolean;
        allow_actions: boolean;
      };
    }) =>
      apiRequest("/api/brainstorm/start", "POST", {
        conversation_id: payload.conversationId,
        meeting_id: payload.meetingId ?? undefined,
        company_id: payload.companyId ?? undefined,
        topic: payload.topic,
        duration_sec: payload.durationSec,
        participants: payload.participants,
        settings: {
          agents_talk_to_each_other: true,
          summarize_at_end: payload.settings.summarize_at_end,
          create_tasks: payload.settings.create_tasks,
          allow_actions: payload.settings.allow_actions,
        },
      }),
    onSuccess: async (data) => {
      const session = (data as any)?.session as BrainstormSession | undefined;
      toast({
        title: "Brainstorm started",
        description: session?.topic ? `Topic: ${session.topic}` : "Agents are discussing now.",
      });
      setBrainstormPopoverOpen(false);
      setBrainstormTick(Date.now());
      if (brainstormActiveEndpoint) {
        await queryClient.invalidateQueries({ queryKey: [brainstormActiveEndpoint] });
      }
      const companyId = resolveEffectiveCompanyId();
      if (companyId && !currentMeeting) {
        await queryClient.invalidateQueries({
          queryKey: [`/api/companies/${companyId}/channels/all-team/conversation`],
        });
      }
      if (currentMeeting?.conversationId) {
        await queryClient.invalidateQueries({
          queryKey: [`/api/messages/${currentMeeting.conversationId}`],
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Brainstorm failed",
        description: error instanceof Error ? error.message : "Failed to start brainstorm",
        variant: "destructive",
      });
    },
  });

  const stopBrainstormMutation = useMutation({
    mutationFn: async (sessionId: string) =>
      apiRequest("/api/brainstorm/stop", "POST", {
        session_id: sessionId,
      }),
    onSuccess: async () => {
      toast({
        title: "Brainstorm stopped",
      });
      if (brainstormActiveEndpoint) {
        await queryClient.invalidateQueries({ queryKey: [brainstormActiveEndpoint] });
      }
    },
    onError: (error) => {
      toast({
        title: "Stop failed",
        description: error instanceof Error ? error.message : "Failed to stop brainstorm",
        variant: "destructive",
      });
    },
  });

  const extendBrainstormMutation = useMutation({
    mutationFn: async (payload: { sessionId: string; extendSec: number }) =>
      apiRequest("/api/brainstorm/extend", "POST", {
        session_id: payload.sessionId,
        extend_sec: payload.extendSec,
      }),
    onSuccess: async () => {
      toast({
        title: "Brainstorm extended",
        description: "Session duration updated.",
      });
      setBrainstormTick(Date.now());
      if (brainstormActiveEndpoint) {
        await queryClient.invalidateQueries({ queryKey: [brainstormActiveEndpoint] });
      }
    },
    onError: (error) => {
      toast({
        title: "Extend failed",
        description: error instanceof Error ? error.message : "Could not extend brainstorm session",
        variant: "destructive",
      });
    },
  });

  const handleStartBrainstorm = () => {
    const conversationId = currentConversationId;
    if (!conversationId) {
      toast({
        title: "Conversation unavailable",
        description: "Open a meeting/chat first.",
        variant: "destructive",
      });
      return;
    }

    const participants = Array.from(new Set(activeAgents.map((agent) => Number(agent.id)).filter((id) => Number.isFinite(id) && id > 0)));
    if (!participants.length) {
      toast({
        title: "No agents selected",
        description: "Add at least one agent to run brainstorm mode.",
        variant: "destructive",
      });
      return;
    }

    const fallbackTopic =
      messageInput.trim() ||
      allMessages.find((message) => String(message?.content || "").trim())?.content ||
      (currentMeeting ? `Brainstorm for ${currentMeeting.name}` : "General Operations brainstorm");

    startBrainstormMutation.mutate({
      conversationId,
      meetingId: currentMeetingId,
      companyId: resolveEffectiveCompanyId(),
      topic: (brainstormTopic.trim() || fallbackTopic).slice(0, 2000),
      durationSec: brainstormDurationSec,
      participants,
      settings: {
        summarize_at_end: brainstormSummarizeAtEnd,
        create_tasks: brainstormCreateTasks,
        allow_actions: brainstormAllowActions,
      },
    });
  };

  type ChannelSendPayload = {
    tempId: string;
    clientMessageId: string;
    companyId: number;
    content: string;
    attachments: ChannelAttachment[];
  };

  const sendMessage = useMutation({
    mutationFn: async (payload: ChannelSendPayload) => {
      if (!payload.companyId) {
        throw new Error(companiesLoading ? "Loading company..." : "No company found");
      }
      if (activeAgentIds.length === 0) throw new Error("Add agents to the conversation first");
      return apiRequest(
        `/api/companies/${payload.companyId}/channels/all-team/messages`,
        "POST",
        { content: payload.content, activeAgentIds, attachments: payload.attachments, clientMessageId: payload.clientMessageId },
      );
    },
    onSuccess: async (data, vars) => {
      const conversationKey = `/api/companies/${vars.companyId}/channels/all-team/conversation`;
      const persistedUserMessage = (data as any)?.userMessage as ChannelMessage | undefined;
      const persistedAiResponsesRaw = (data as any)?.aiResponses ?? (data as any)?.aiResponse ?? [];
      const persistedAiResponses = Array.isArray(persistedAiResponsesRaw)
        ? (persistedAiResponsesRaw as ChannelMessage[])
        : ([persistedAiResponsesRaw] as ChannelMessage[]);

      const persistedMessages = [persistedUserMessage, ...persistedAiResponses].filter(Boolean) as ChannelMessage[];
      if (persistedMessages.length) {
        queryClient.setQueryData<any>([conversationKey], (old: any) => {
          if (!old || typeof old !== "object" || !Array.isArray(old.pages)) return old;
          const pages = old.pages.slice();
          if (!Array.isArray(pages[0])) return old;
          pages[0] = mergeChannelMessages(pages[0], persistedMessages);
          return { ...old, pages };
        });
      }

      setLocalMessages((prev) => prev.filter((m) => m.id !== vars.tempId));
      setMessageInput("");
      setPendingAttachments([]);

      const summonedIds = Array.isArray((data as any)?.summonedAgentIds)
        ? ((data as any).summonedAgentIds as any[]).map((v: any) => Number(v)).filter((v: any) => Number.isInteger(v) && v > 0)
        : [];

      if (summonedIds.length) {
        setActiveAgentIds((prev) => Array.from(new Set([...prev, ...summonedIds])));
        const summonedAgents = companyAgents.filter((a) => summonedIds.includes(a.id));
        if (summonedAgents.length) {
          toast({
            title: "Agents summoned",
            description: summonedAgents.map((a) => a.name).join(", "),
          });
        }
      }

      await queryClient.invalidateQueries({
        queryKey: [`/api/chatrooms/${encodeURIComponent(`channel:${vars.companyId}:all-team`)}/members`],
      });
    },
    onError: (error, vars) => {
      setLocalMessages((prev) => prev.filter((m) => m.id !== vars.tempId));
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const getChatViewport = () => {
    const root = chatScrollAreaRef.current;
    if (!root) return null;
    return root.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null;
  };

  const loadOlderChannelMessages = async () => {
    if (!hasOlderMessages || loadingOlderMessages) return;

    try {
      await fetchOlderMessages();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load older messages",
        variant: "destructive",
      });
    }
  };

  const postOpsCommsMessage = useMutation({
    mutationFn: async (contentText: string) => {
      if (!selectedOpsThreadId) throw new Error("Select a thread first");
      return apiRequest(`/api/comms/threads/${selectedOpsThreadId}/messages`, "POST", {
        senderType: "AGENT",
        senderAgentKey: "coordinator",
        messageType: "STATUS_UPDATE",
        priority: "NORMAL",
        contentText,
      });
    },
    onSuccess: async () => {
      setOpsCommsInput("");
      await queryClient.invalidateQueries({ queryKey: ["/api/comms/threads"] });
      if (selectedOpsThreadId) {
        await queryClient.invalidateQueries({
          queryKey: [`/api/comms/threads/${selectedOpsThreadId}/messages?limit=500`],
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to post message",
        variant: "destructive",
      });
    },
  });

  const createEmailActionRequest = useMutation({
    mutationFn: async () => {
      const to = emailActionDraft.to
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (!to.length) throw new Error("Recipient required");
      if (!emailActionDraft.subject.trim()) throw new Error("Subject required");
      if (!emailActionDraft.body.trim()) throw new Error("Message required");

      return apiRequest("/api/actions/request", "POST", {
        actionType: "SEND_EMAIL",
        idempotencyKey: `ui-send-email:${Date.now()}`,
        payload: {
          agentKey: emailActionDraft.agentKey,
          to,
          subject: emailActionDraft.subject,
          body: { text: emailActionDraft.body },
        },
      });
    },
    onSuccess: async (data) => {
      const status = data?.actionRequest?.status;
      toast({
        title: status === "REQUIRES_APPROVAL" ? "Queued for approval" : "Queued",
        description: status === "REQUIRES_APPROVAL" ? "Open Decisions to approve & send." : "Run the actions worker to send.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/actions/queue?limit=200"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/actions/decisions?limit=200"] });
      setEmailActionDraft((prev) => ({ ...prev, to: "", subject: "", body: "" }));
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to queue email action",
        variant: "destructive",
      });
    },
  });

  const approveAction = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/actions/${id}/approve`, "POST", {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/actions/queue?limit=200"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/actions/decisions?limit=200"] });
    },
  });

  const denyAction = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/actions/${id}/deny`, "POST", {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/actions/queue?limit=200"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/actions/decisions?limit=200"] });
    },
  });

  const isChatViewActive = Boolean(currentMeeting) || opsView === "chat";

  useEffect(() => {
    const viewport = getChatViewport();
    if (!viewport) return;

    const handleScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
      shouldAutoScrollRef.current = distanceFromBottom <= CHAT_AUTOSCROLL_THRESHOLD_PX;
    };

    handleScroll();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [currentMeeting?.conversationId, opsView]);

  useEffect(() => {
    if (!isChatViewActive) return;
    if (suppressAutoScrollRef.current) return;
    const shouldScroll = forceAutoScrollRef.current || shouldAutoScrollRef.current;
    if (!shouldScroll) return;
    const viewport = getChatViewport();
    if (!viewport) return;
    forceAutoScrollRef.current = false;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [allMessages.length, meetingMessages.length, currentMeeting?.conversationId, isChatViewActive]);

  useEffect(() => {
    forceAutoScrollRef.current = true;
    shouldAutoScrollRef.current = true;
  }, [currentConversationId, currentMeeting?.conversationId]);

  useEffect(() => {
    if (!isChatViewActive) return;
    forceAutoScrollRef.current = true;
    shouldAutoScrollRef.current = true;
    const viewport = getChatViewport();
    if (!viewport) return;
    window.requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
    });
  }, [isChatViewActive]);

  useEffect(() => {
    if (didHydrateChannelMembers.current) return;
    if (currentMeeting) return;
    if (!selectedCompanyId) return;

    const ids = channelMemberships
      .map((m) => m.agent?.id)
      .filter((id): id is number => typeof id === "number" && id > 0);

    if (ids.length) {
      setActiveAgentIds(Array.from(new Set(ids)));
      didHydrateChannelMembers.current = true;
    }
  }, [channelMemberships, currentMeeting, selectedCompanyId]);

  useEffect(() => {
    if (companyAgents.length > 0 && activeAgentIds.length === 0 && !currentMeeting) {
      const defaultAgents = companyAgents.filter(a => a.status === 'active').slice(0, 3).map(a => a.id);
      if (defaultAgents.length > 0) setActiveAgentIds(defaultAgents);
    }
  }, [companyAgents, currentMeeting]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTagColor = (tag: string) => {
    switch (tag?.toLowerCase()) {
      case "sales": return "bg-green-500/20 text-green-400";
      case "marketing": return "bg-pink-500/20 text-pink-400";
      case "joined": return "bg-blue-500/20 text-blue-400";
      default: return "bg-gray-500/20 text-gray-400";
    }
  };

  const parseDateMs = (value: unknown): number | null => {
    if (!value) return null;
    const ts = new Date(String(value)).getTime();
    return Number.isFinite(ts) ? ts : null;
  };

  const getMeetingLastActivityMs = (room: ChatRoom): number | null => {
    const metadata = (room.metadata || {}) as Record<string, any>;
    return (
      parseDateMs(room.lastActivity) ??
      parseDateMs(metadata.lastActivityAt) ??
      parseDateMs(metadata.lastMessageAt) ??
      parseDateMs(metadata.updatedAt) ??
      parseDateMs(room.createdAt)
    );
  };

  const getMeetingPresenceState = (room: ChatRoom): "live" | "active" | "idle" | "completed" => {
    const rawStatus = String(room.status || "").toLowerCase();
    if (rawStatus === "completed" || rawStatus === "closed" || rawStatus === "cancelled" || rawStatus === "canceled") {
      return "completed";
    }

    if (room.isActive === false) return "completed";

    const lastActivityMs = getMeetingLastActivityMs(room);
    if (!lastActivityMs) return rawStatus === "ongoing" ? "live" : "active";

    const elapsed = Date.now() - lastActivityMs;
    if (elapsed <= 1000 * 60 * 120) return "live";
    if (elapsed <= 1000 * 60 * 60 * 24 * 2) return "active";
    return "idle";
  };

  const getMeetingStatusBadge = (room: ChatRoom) => {
    const presence = getMeetingPresenceState(room);
    if (presence === "live") {
      return <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-[10px]">Live</Badge>;
    }
    if (presence === "active") {
      return <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 text-[10px]">Active</Badge>;
    }
    if (presence === "idle") {
      return <Badge className="bg-gray-700/60 text-gray-300 border-gray-600 text-[10px]">Idle</Badge>;
    }
    return (
      <Badge variant="outline" className="text-[10px] border-gray-600 text-gray-300">
        Completed
      </Badge>
    );
  };

  const getMeetingMetaLabel = (room: ChatRoom): string => {
    const lastActivityMs = getMeetingLastActivityMs(room);
    if (!lastActivityMs) return "No recent activity";
    const lastSeen = formatDistanceToNowStrict(new Date(lastActivityMs), { addSuffix: true });
    return `Updated ${lastSeen}`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMessageInput(value);
    
    const textBeforeCursor = value.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (atMatch) {
      setShowMentionPopover(true);
      setMentionSearch(atMatch[1].toLowerCase());
      setMentionCursorPos(cursorPos);
    } else {
      setShowMentionPopover(false);
      setMentionSearch("");
    }
  };

  const handleMentionSelect = (agent: Agent) => {
    const textBeforeMention = messageInput.substring(0, mentionCursorPos).replace(/@\w*$/, '');
    const textAfterMention = messageInput.substring(mentionCursorPos);
    setMessageInput(`${textBeforeMention}@${agent.name} ${textAfterMention}`);
    setShowMentionPopover(false);
    setMentionSearch("");
    setMentionCursorPos(0);
    
    if (currentMeeting) {
      if (!meetingAgents.some(ma => ma.id === agent.id)) {
        addAgentToMeeting.mutate(agent.id);
        toast({ title: `${agent.name} added`, description: "Added to meeting" });
      }
    } else {
      if (!activeAgentIds.includes(agent.id)) {
        setActiveAgentIds(prev => [...prev, agent.id]);
        toast({ title: `${agent.name} added`, description: "Added to conversation" });
      }
    }
    
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const mentionableAgents = availableAgents.filter(agent =>
    agent.name?.toLowerCase().includes(mentionSearch) ||
    agent.role?.toLowerCase().includes(mentionSearch)
  ).slice(0, 6);

  const MeetingsSidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Video className="h-5 w-5 text-blue-400" />
            Meetings
          </h2>
          <Button 
            size="sm" 
            className="ops-pressable bg-blue-600 hover:bg-blue-700 gap-1"
            onClick={() => {
              createMeetingMutation.mutate({ title: `Meeting ${format(new Date(), "MMM d, h:mm a")}` });
              if (isMobile) setMobileLeftSheet(false);
            }}
            disabled={createMeetingMutation.isPending}
          >
            {createMeetingMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New Meeting</span>
              </>
            )}
          </Button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            value={meetingSearch}
            onChange={(e) => setMeetingSearch(e.target.value)}
            placeholder="Search meetings..."
            className="pl-9 bg-gray-800 border-gray-700 text-white h-10"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          <Card
            className={cn(
              "ops-card-interactive cursor-pointer transition-all duration-200 mb-2 overflow-hidden rounded-xl",
              !currentMeeting
                ? "bg-blue-600/20 border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                : "bg-gray-800/50 border-gray-700 hover:bg-gray-800/80 hover:border-gray-600"
            )}
            onClick={() => { setCurrentMeeting(null); if (isMobile) setMobileLeftSheet(false); }}
          >
            <CardHeader className="p-3">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-400" />
	                <div className="flex-1 min-w-0">
	                  <CardTitle className="text-sm font-medium text-white">Operations Center</CardTitle>
	                  <p className="text-xs text-gray-400">General conversation</p>
	                </div>
                {!currentMeeting && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Active</Badge>
                )}
              </div>
            </CardHeader>
          </Card>

          {roomsLoading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 bg-gray-800" />)}
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No meetings yet</p>
            </div>
          ) : (
            filteredMeetings.map((room) => (
              <Card
                key={room.id}
                className={cn(
                  "ops-card-interactive cursor-pointer transition-all duration-200 mb-2 overflow-hidden rounded-xl",
                  currentMeeting?.id === room.id
                    ? "bg-blue-600/20 border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                    : "bg-gray-800/50 border-gray-700 hover:bg-gray-800/80 hover:border-gray-600"
                )}
                onClick={() => { setCurrentMeeting(room); if (isMobile) setMobileLeftSheet(false); }}
              >
                <CardHeader className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium leading-snug text-white line-clamp-2 break-words">{room.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {getMeetingStatusBadge(room)}
                        {room.agents?.length > 0 && (
                          <span className="text-xs text-gray-400">
                            <Users className="h-3 w-3 inline mr-1" />
                            {room.agents.length}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500 truncate">{getMeetingMetaLabel(room)}</div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const AgentsSidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            {currentMeeting ? "Participants" : "Team Members"}
          </h3>
          {!isMobile && (
            <Button variant="ghost" size="sm" onClick={() => setShowAgentList(false)} className="text-gray-400 hover:text-white h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search agents..."
            value={agentSearch}
            onChange={(e) => setAgentSearch(e.target.value)}
            className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 pl-9 h-10"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {hasBackgroundActivity && !currentMeeting && (
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Activity className="h-3 w-3 animate-pulse text-green-400" />
                Live Activity
              </h4>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {activityLogItems.slice(0, 5).map((activity) => {
                const eventColors: Record<string, string> = {
                  task_created: "border-green-500/50 bg-green-500/5",
                  task_approved: "border-blue-500/50 bg-blue-500/5",
                  message_sent: "border-purple-500/50 bg-purple-500/5",
                };
                const colorClass = eventColors[activity.eventType] || "border-gray-500/30 bg-gray-500/5";
                return (
                  <div key={activity.id} className={cn("p-2 rounded-lg border-l-2", colorClass)}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-white truncate">{activity.title}</span>
                      <span className="text-[10px] text-gray-500">
                        {format(new Date(activity.createdAt), "HH:mm")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeAgents.length > 0 && (
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {currentMeeting ? "In Meeting" : "Active"} ({activeAgents.length})
              </h4>
              {!currentMeeting && (
                <Button variant="ghost" size="sm" className="h-6 text-xs text-red-400 hover:text-red-300 px-1" onClick={removeAllAgents}>
                  Clear
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {activeAgents.map((agent) => {
                const dept = getDepartmentFromRole(agent.role || "");
                const config = DEPARTMENT_CONFIG[dept];
                return (
                  <div key={agent.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-800/50 group">
                    <Avatar className="h-9 w-9 bg-gray-700">
                      <AvatarImage
                        src={getAgentAvatarUrl({ id: agent.id, name: agent.name, size: 72 })}
                        alt={agent.name || "Agent"}
                      />
                      <AvatarFallback className="text-xs text-white">{agent.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-white font-medium truncate">{agent.name}</span>
                        <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                      </div>
                      <span className={cn("text-xs truncate", config.color)}>{agent.role}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeAgent(agent)} className="text-red-400 hover:text-red-300 h-8 w-8 p-0">
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Available ({availableAgents.length})
            </h4>
            {availableAgents.length > 0 && !currentMeeting && (
              <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-400 hover:text-blue-300 px-1" onClick={addAllAgents}>
                Add All
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {availableAgents.slice(0, isMobile ? 10 : 50).map((agent) => {
              const dept = getDepartmentFromRole(agent.role || "");
              const config = DEPARTMENT_CONFIG[dept];
              return (
                <div 
                  key={agent.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/50 cursor-pointer group transition-colors"
                  onClick={() => { addAgent(agent); if (isMobile) setMobileRightSheet(false); }}
                >
                  <Avatar className="h-9 w-9 bg-gray-700">
                    <AvatarImage
                      src={getAgentAvatarUrl({ id: agent.id, name: agent.name, size: 72 })}
                      alt={agent.name || "Agent"}
                    />
                    <AvatarFallback className="text-xs text-white">{agent.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-300 font-medium truncate block">{agent.name}</span>
                    <span className={cn("text-xs truncate", config.color)}>{agent.role}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); addAgent(agent); if (isMobile) setMobileRightSheet(false); }}
                    className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border-blue-500/30 h-8 px-2 text-xs"
                  >
                    <UserPlus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
              );
            })}
            {availableAgents.length === 0 && (
              <div className="text-center py-6 text-gray-500 text-sm">
                {agentSearch ? "No agents match search" : "All agents added"}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );

  const currentMeetingPresence = currentMeeting ? getMeetingPresenceState(currentMeeting) : "live";

  return (
    <div className="h-[calc(100dvh-var(--admin-header-height))] min-h-0 flex bg-gradient-to-b from-gray-950 to-[#020817] overflow-hidden">
      {/* Mobile Left Sheet - Meetings */}
      {isMobile && (
        <Sheet open={mobileLeftSheet} onOpenChange={setMobileLeftSheet}>
          <SheetContent side="left" className="w-[300px] p-0 bg-gray-900 border-gray-800">
            <MeetingsSidebar />
          </SheetContent>
        </Sheet>
      )}

      {/* Mobile Right Sheet - Agents */}
      {isMobile && (
        <Sheet open={mobileRightSheet} onOpenChange={setMobileRightSheet}>
          <SheetContent side="right" className="w-[300px] p-0 bg-gray-900 border-gray-800">
            <AgentsSidebar />
          </SheetContent>
        </Sheet>
      )}

      {/* Desktop Left Sidebar - Meetings List */}
      <div className="hidden md:flex w-[21rem] min-w-[19rem] max-w-[23rem] shrink-0 border-r border-gray-800/80 flex-col bg-gray-900/30 backdrop-blur-sm">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Video className="h-5 w-5 text-blue-400" />
              Meetings
            </h2>
            <Button 
              size="sm" 
              className="ops-pressable bg-blue-600 hover:bg-blue-700 gap-1"
              onClick={() => createMeetingMutation.mutate({ title: `Meeting ${format(new Date(), "MMM d, h:mm a")}` })}
              disabled={createMeetingMutation.isPending}
            >
              {createMeetingMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>New Meeting</span>
                </>
              )}
            </Button>
          </div>

          <div className="relative mb-3">
            <Popover open={showDepartmentFilter} onOpenChange={setShowDepartmentFilter}>
              <PopoverTrigger asChild>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    value={meetingSearch}
                    onChange={(e) => setMeetingSearch(e.target.value)}
                    onFocus={() => setShowDepartmentFilter(true)}
                    placeholder={selectedDepartment ? `Filter: ${selectedDepartment}` : "Search or filter..."}
                    className="pl-9 bg-gray-800 border-gray-700 text-white h-9"
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2 bg-gray-900 border-gray-700" align="start">
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 px-2 py-1">Filter by Department</p>
                  {["All Departments", "Executive", "Strategy", "Operations", "Finance", "Marketing", "Engineering"].map((dept) => (
                    <Button
                      key={dept}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full justify-start text-sm",
                        selectedDepartment === dept || (dept === "All Departments" && !selectedDepartment)
                          ? "bg-blue-600/20 text-blue-400"
                          : "text-gray-300 hover:bg-gray-800"
                      )}
                      onClick={() => {
                        setSelectedDepartment(dept === "All Departments" ? null : dept);
                        setShowDepartmentFilter(false);
                      }}
                    >
                      {dept}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

        </div>

        <ScrollArea className="flex-1 min-h-0">
          {/* Team Chat Option */}
          <div className="p-2">
            <Card
              className={cn(
                "ops-card-interactive cursor-pointer transition-all duration-200 mb-2 overflow-hidden rounded-xl",
                !currentMeeting
                  ? "bg-blue-600/20 border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                  : "bg-gray-800/50 border-gray-700 hover:bg-gray-800/80 hover:border-gray-600"
              )}
              onClick={() => setCurrentMeeting(null)}
            >
              <CardHeader className="p-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-blue-400" />
	                  <div className="flex-1 min-w-0">
	                    <CardTitle className="text-sm font-medium text-white">Operations Center</CardTitle>
	                    <p className="text-xs text-gray-400">General conversation</p>
	                  </div>
                  {!currentMeeting && (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Active</Badge>
                  )}
                </div>
              </CardHeader>
            </Card>

            {roomsLoading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 bg-gray-800" />)}
              </div>
            ) : filteredMeetings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No meetings yet</p>
              </div>
            ) : (
              filteredMeetings.map((room) => (
                <Card
                  key={room.id}
                  className={cn(
                    "ops-card-interactive cursor-pointer transition-all duration-200 mb-2 overflow-hidden rounded-xl",
                    currentMeeting?.id === room.id
                      ? "bg-blue-600/20 border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                      : "bg-gray-800/50 border-gray-700 hover:bg-gray-800/80 hover:border-gray-600"
                  )}
                  onClick={() => setCurrentMeeting(room)}
                >
                  <CardHeader className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-medium leading-snug text-white line-clamp-2 break-words">{room.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {getMeetingStatusBadge(room)}
                          {room.agents?.length > 0 && (
                            <span className="text-xs text-gray-400">
                              <Users className="h-3 w-3 inline mr-1" />
                              {room.agents.length}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500 truncate">{getMeetingMetaLabel(room)}</div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {/* Chat Header */}
        <div className="h-14 md:h-16 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm px-3 md:px-6 flex items-center justify-between gap-2">
          {/* Mobile Menu Button */}
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileLeftSheet(true)}
              className="ops-pressable h-10 w-10 text-gray-400 hover:text-white p-0 flex-shrink-0"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            {currentMeeting ? (
              <Video className="h-5 w-5 md:h-6 md:w-6 text-blue-400 flex-shrink-0" />
            ) : (
              <Bot className="h-5 w-5 md:h-6 md:w-6 text-blue-400 flex-shrink-0" />
            )}
            <div className="min-w-0">
	              <h2 className="text-sm md:text-lg font-semibold text-white flex items-center gap-2 truncate">
	                <span className="truncate">{currentMeeting ? currentMeeting.name : "Operations Center"}</span>
	                <span className="hidden md:inline">{!currentMeeting && "HQ"}</span>
	                <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] md:text-xs flex-shrink-0",
                      currentMeetingPresence === "live"
                        ? "bg-green-500/10 text-green-400 border-green-500/30 ops-live-chip"
                        : currentMeetingPresence === "active"
                          ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
                          : currentMeetingPresence === "idle"
                            ? "bg-gray-700/40 text-gray-300 border-gray-600"
                            : "bg-gray-700/40 text-gray-300 border-gray-600",
                    )}
                  >
	                  <Activity className={cn("h-2.5 w-2.5 md:h-3 md:w-3 mr-0.5 md:mr-1", currentMeetingPresence === "live" && "ops-live-dot")} />
                    {currentMeetingPresence === "live"
                      ? "Live"
                      : currentMeetingPresence === "active"
                        ? "Active"
                        : currentMeetingPresence === "idle"
                          ? "Idle"
                          : "Completed"}
                </Badge>
              </h2>
              <p className="text-[10px] md:text-xs text-gray-400 truncate">
                {currentMeeting ? (
                  <>{getMeetingMetaLabel(currentMeeting)}</>
                ) : (
                  `${activeAgents.length} agent${activeAgents.length !== 1 ? 's' : ''} in conversation`
                )}
              </p>
            </div>
          </div>
          
          {/* Mobile Agents Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMembersAuditOpen(true)}
            className="ops-pressable text-gray-400 hover:text-white h-9 px-2"
          >
            <Users className="h-4 w-4" />
            <span className="hidden md:inline ml-1 text-xs">Members ({activeAgents.length})</span>
          </Button>

          {isMobile ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileRightSheet(true)}
              className="ops-pressable h-10 w-10 text-gray-400 hover:text-white p-0 flex-shrink-0"
            >
              <Users className="h-5 w-5" />
              {activeAgents.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {activeAgents.length}
                </span>
              )}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAgentList(!showAgentList)}
              className={cn("ops-pressable text-gray-400 hover:text-white h-9", showAgentList && "bg-gray-800 text-white")}
            >
              <Users className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Active Agents Bar */}
        {activeAgents.length > 0 && !currentMeeting && (
          <div className="border-b border-gray-800 bg-gray-900/30 px-3 md:px-6 py-2">
            <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
              <span className="text-[10px] md:text-xs text-gray-500 mr-1 md:mr-2">In conversation:</span>
              {activeAgents.map((agent) => {
                const dept = getDepartmentFromRole(agent.role || "");
                const config = DEPARTMENT_CONFIG[dept];
                const workstationSnapshot = workstationStatusByAgentId[Number(agent.id)];
                const chipLabel = workstationSnapshot ? workstationChipLabel(workstationSnapshot.state) : "UNKNOWN";
                const canOpenLive = Boolean(workstationSnapshot?.canOpenLive);
                const chipTitle = workstationSnapshot?.detail || "Workstation status unavailable";
                return (
                  <Badge 
                    key={agent.id}
                    variant="outline" 
                    className={cn("text-[10px] md:text-xs pr-0.5 md:pr-1 flex items-center gap-0.5 md:gap-1", config.bgColor, config.color)}
                  >
                    <Circle className="h-1.5 w-1.5 md:h-2 md:w-2 fill-current" />
                    <span className="max-w-[60px] md:max-w-none truncate">{agent.name}</span>
                    <span className="rounded border border-gray-600 bg-gray-900/50 px-1 py-[1px] text-[9px] uppercase tracking-wide text-gray-300">
                      {isTassiAgentIdentity(agent)
                        ? "Tassi (Global)"
                        : "Tenant-scoped"}
                    </span>
                    <button
                      type="button"
                      title={chipTitle}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!canOpenLive) return;
                        void openAgentWorkstationLive(agent);
                      }}
                      className={cn(
                        "rounded border px-1 py-[1px] text-[9px] font-semibold uppercase tracking-wide",
                        workstationSnapshot ? workstationChipClass(workstationSnapshot.state) : "border-slate-600 bg-slate-700/40 text-slate-200",
                        canOpenLive ? "cursor-pointer hover:brightness-110" : "cursor-default",
                      )}
                    >
                      {workstationBusyAgentId === agent.id ? "OPENING..." : `🖥 ${chipLabel}`}
                    </button>
                    <button onClick={() => removeAgent(agent)} className="ml-0.5 hover:bg-white/10 rounded p-0.5">
                      <X className="h-2.5 w-2.5 md:h-3 md:w-3" />
                    </button>
                  </Badge>
                );
              })}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2 bg-gray-900 border-gray-800" align="start">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-400 px-2 py-1">Add Agent</div>
                    {availableAgents.slice(0, 5).map((agent) => {
                      const dept = getDepartmentFromRole(agent.role || "");
                      const config = DEPARTMENT_CONFIG[dept];
                      return (
                        <button
                          key={agent.id}
                          onClick={() => addAgent(agent)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800 text-left"
                        >
                          <Avatar className="h-6 w-6 bg-gray-700">
                            <AvatarImage
                              src={getAgentAvatarUrl({ id: agent.id, name: agent.name, size: 48 })}
                              alt={agent.name || "Agent"}
                            />
                            <AvatarFallback className="text-xs text-white">{agent.name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{agent.name}</div>
                            <div className={cn("text-xs truncate", config.color)}>{agent.role}</div>
                          </div>
                        </button>
                      );
                    })}
                    <button onClick={addAllAgents} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs mt-1">
                      <UserPlus className="h-3 w-3" />
                      Add All
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        {!currentMeeting && (
          <div className="border-b border-gray-800 bg-gray-900/30 px-3 md:px-6 py-2">
            <Tabs value={opsView} onValueChange={(value) => setOpsView(value as any)}>
              <TabsList className="bg-gray-800/50 flex-wrap h-auto p-1">
                <TabsTrigger value="chat">Chat</TabsTrigger>
                <TabsTrigger value="objectives">Objectives</TabsTrigger>
                <TabsTrigger value="agenda">Agenda</TabsTrigger>
                <TabsTrigger value="background">Background conversations</TabsTrigger>
                <TabsTrigger value="decisions">Decisions</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="actions">Actions</TabsTrigger>
                <TabsTrigger value="automations">Automations</TabsTrigger>
                <TabsTrigger value="arborescence">Arborescence</TabsTrigger>
                <TabsTrigger value="live">Live activity</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        {(currentMeeting || opsView === "chat") && (
          <>
            {!currentMeeting && (
              <div className="border-b border-amber-500/20 bg-amber-500/5 px-3 md:px-6 py-2">
                <div className="max-w-4xl mx-auto text-xs text-amber-200">
                  Plan first for better traceability: open a scheduled room from the <span className="font-semibold">Agenda</span> tab.
                </div>
              </div>
            )}
            {/* Messages Area */}
            <ScrollArea ref={chatScrollAreaRef} className="ops-chat-scroll-area flex-1 px-3 md:px-6 py-3 md:py-4">
          <div className="max-w-4xl mx-auto space-y-3 md:space-y-4">
            {(messagesLoading || agentsLoading || meetingMessagesLoading) && !currentMeeting ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-10 w-10 rounded-full bg-gray-800" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32 bg-gray-800" />
                      <Skeleton className="h-16 w-full bg-gray-800" />
                    </div>
                  </div>
                ))}
              </div>
            ) : currentMeeting ? (
              <>
                {sortedMeetingMessages.length === 0 && !meetingMessagesLoading && (
                  <div className="flex flex-col items-center justify-center h-[300px] text-center space-y-3">
                    <MessageSquare className="h-16 w-16 text-gray-600" />
                    <h3 className="text-lg font-medium text-gray-300">Meeting Room Ready</h3>
                    <p className="text-sm text-gray-500">Start the conversation or add agents</p>
                  </div>
                )}
                {sortedMeetingMessages.map((msg) => {
                  const isUser = msg.fromAgentId === null;
                  const agent = msg.fromAgent;
                  const actionRuns = extractActionRuns(msg.metadata);
                  const completionClaim = Boolean(msg.metadata?.completionClaim) || hasCompletionClaimText(msg.content);
                  const unverifiedClaim = Boolean(msg.metadata?.unverifiedClaim) || (completionClaim && actionRuns.length === 0);
                  return (
                    <div key={msg.id} className={cn("ops-message-enter flex", isUser ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "min-w-0 max-w-[92%] md:max-w-[84%] lg:max-w-[76%] rounded-xl p-4 shadow-sm break-words",
                          isUser ? "bg-blue-600/90 text-white" : "bg-gray-800/90 border border-gray-700/50",
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium">{isUser ? "You" : agent?.name || "Agent"}</span>
                          {agent?.role && !isUser && <Badge variant="outline" className="text-xs">{agent.role}</Badge>}
                          <span className="text-xs text-gray-400 ml-auto">{format(new Date(msg.createdAt), "HH:mm")}</span>
                          {isUser && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-white/80 hover:bg-white/10"
                              onClick={() => {
                                const companyId = resolveEffectiveCompanyId();
                                if (!companyId || !currentMeeting) return;
                                createGoalFromChatMutation.mutate({
                                  companyId,
                                  content: msg.content,
                                  conversationId: currentMeeting.conversationId,
                                  messageId: msg.id,
                                });
                              }}
                            >
                              <Target className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</div>
                        {!isUser && actionRuns.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {actionRuns.map((run) => (
                              <div key={`run-${msg.id}-${run.id}`} className="flex items-center gap-1.5">
                                <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-300">
                                  {run.publicActionId}
                                  {run.state || run.status ? ` • ${String(run.state || run.status).toUpperCase()}` : ""}
                                </Badge>
                                {adminLikeUser ? (
                                  <a
                                    href={resolveApiUrl(`/api/admin/actions/${run.id}/events`)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-blue-300 underline underline-offset-2"
                                  >
                                    View debug
                                  </a>
                                ) : null}
                                {run.lastError ? (
                                  <span className="text-[10px] text-red-300">{String(run.lastError)}</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {!isUser && unverifiedClaim ? (
                          <div className="mt-2">
                            <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-300">
                              UNVERIFIED CLAIM
                            </Badge>
                          </div>
                        ) : null}
                        {msg.metadata?.analysis ? (
                          <details className="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-left">
                            <summary className="cursor-pointer text-[11px] text-gray-300">Thinking process</summary>
                            <div className="mt-1 whitespace-pre-wrap text-[11px] text-gray-400">
                              {String(msg.metadata.analysis)}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                {hasOlderMessages && (
                  <div className="flex justify-center pb-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-gray-700 bg-gray-900/60 text-gray-200 hover:bg-gray-800"
                      onClick={loadOlderChannelMessages}
                      disabled={loadingOlderMessages}
                    >
                      {loadingOlderMessages ? "Loading older..." : "Load older messages"}
                    </Button>
                  </div>
                )}

                {allMessages.map((message, idx) => {
                  const isUserMessage = message.messageType === 'user';
                  const isSystemMessage = message.messageType === 'system';
                  const actionRuns = extractActionRuns(message.metadata);
                  const completionClaim = Boolean(message.metadata?.completionClaim) || hasCompletionClaimText(message.content);
                  const unverifiedClaim = Boolean(message.metadata?.unverifiedClaim) || (completionClaim && actionRuns.length === 0);
                  const attachmentItems = Array.isArray(message.attachments) ? message.attachments : [];
                  const otherAttachments = attachmentItems;
                  const renderKey = buildMessageRenderKey(message, idx);
                  const dept = message.fromAgent?.role ? getDepartmentFromRole(message.fromAgent.role) : 'Management';
                  const deptConfig = DEPARTMENT_CONFIG[dept];
                  
                  if (isSystemMessage) {
                    return (
                      <div key={renderKey} className="flex justify-center my-4">
                        <div className="bg-gray-800/50 text-gray-400 text-xs px-4 py-2 rounded-full">
                          {message.content}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={renderKey} className={cn("ops-message-enter flex gap-3 min-w-0", isUserMessage && "flex-row-reverse")}>
                      <Avatar className={cn("h-10 w-10 flex-shrink-0", isUserMessage ? "bg-gradient-to-br from-green-500 to-emerald-600" : "bg-gradient-to-br from-blue-500 to-purple-600")}>
                        {!isUserMessage ? (
                          <AvatarImage
                            src={getAgentAvatarUrl({ id: message.fromAgent?.id, name: message.fromAgent?.name, size: 80 })}
                            alt={message.fromAgent?.name || "Agent"}
                          />
                        ) : null}
                        <AvatarFallback className="bg-transparent text-white text-sm font-medium">
                          {isUserMessage ? "Y" : message.fromAgent?.name?.charAt(0) || "A"}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn("flex-1 min-w-0 max-w-[92%] md:max-w-[84%] lg:max-w-[76%]", isUserMessage && "text-right")}>
                        <div className={cn("flex items-center gap-2 mb-1", isUserMessage && "justify-end")}>
	                          <span className={cn("font-medium text-sm", isUserMessage ? "text-green-400" : "text-white")}>
	                            {message.fromAgent?.name || "Operations Center"}
	                          </span>
                          {!isUserMessage && (
                            <Badge variant="outline" className={cn("text-xs py-0", deptConfig.bgColor, deptConfig.color)}>
                              {message.fromAgent?.role || "System"}
                            </Badge>
                          )}
                          <span className="text-xs text-gray-600">{formatTime(message.createdAt)}</span>
                          {isUserMessage && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-white/70 hover:bg-white/10"
                              onClick={() => {
                                const companyId = resolveEffectiveCompanyId();
                                if (!companyId) return;
                                createGoalFromChatMutation.mutate({
                                  companyId,
                                  content: message.content,
                                  conversationId: `channel:${companyId}:all-team`,
                                  messageId: message.id,
                                });
                              }}
                            >
                              <Target className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-3 text-sm leading-relaxed inline-block max-w-full break-words",
                            isUserMessage ? "bg-blue-600 text-white text-left" : "bg-gray-800 text-gray-200",
                          )}
                        >
                          {message.content?.trim() ? <div className="whitespace-pre-wrap break-words">{message.content}</div> : null}

                          {!isUserMessage && actionRuns.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {actionRuns.map((run) => (
                                <div key={`run-${renderKey}-${run.id}`} className="flex items-center gap-1.5">
                                  <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-300">
                                    {run.publicActionId}
                                    {run.state || run.status ? ` • ${String(run.state || run.status).toUpperCase()}` : ""}
                                  </Badge>
                                  {adminLikeUser ? (
                                    <a
                                      href={resolveApiUrl(`/api/admin/actions/${run.id}/events`)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[10px] text-blue-300 underline underline-offset-2"
                                    >
                                      View debug
                                    </a>
                                  ) : null}
                                  {run.lastError ? (
                                    <span className="text-[10px] text-red-300">{String(run.lastError)}</span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {!isUserMessage && unverifiedClaim ? (
                            <div className="mt-2">
                              <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-300">
                                UNVERIFIED CLAIM
                              </Badge>
                            </div>
                          ) : null}

                          {!isUserMessage && message.metadata?.analysis ? (
                            <details className="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-left">
                              <summary className="cursor-pointer text-[11px] text-gray-300">Thinking process</summary>
                              <div className="mt-1 whitespace-pre-wrap text-[11px] text-gray-400">
                                {String(message.metadata.analysis)}
                              </div>
                            </details>
                          ) : null}

                          {otherAttachments.length > 0 && (
                            <div className={cn("mt-3 space-y-1.5 text-xs", isUserMessage ? "text-blue-100" : "text-gray-300")}>
                              {otherAttachments.map((attachment) => (
                                <div
                                  key={attachment.id}
                                  className={cn(
                                    "rounded-lg border px-2.5 py-1.5 flex items-start gap-2",
                                    isUserMessage ? "border-blue-300/40 bg-blue-500/20" : "border-gray-600 bg-gray-900/40",
                                  )}
                                >
                                  <FileText className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="font-medium truncate">
                                      {attachment.url ? (
                                        <a
                                          href={attachment.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="underline decoration-white/30 underline-offset-2 hover:decoration-white/80"
                                        >
                                          {attachment.name}
                                          {attachment.version && attachment.version > 1 ? ` (v${attachment.version})` : ""}
                                        </a>
                                      ) : (
                                        <span>
                                          {attachment.name}
                                          {attachment.version && attachment.version > 1 ? ` (v${attachment.version})` : ""}
                                        </span>
                                      )}
                                    </div>
                                    <div className="opacity-80">
                                      {[attachment.type || "file", formatAttachmentSize(attachment.size)].filter(Boolean).join(" | ")}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {false && hasOlderMessages && (
                  <div className="flex justify-center pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-gray-700 bg-gray-900/60 text-gray-200 hover:bg-gray-800"
                      onClick={loadOlderChannelMessages}
                      disabled={loadingOlderMessages}
                    >
                      {loadingOlderMessages ? "Loading older..." : "Load older messages"}
                    </Button>
                  </div>
                )}
                
                {sendMessage.isPending && (
                  <div className="ops-message-enter flex gap-3">
                    <Avatar className="h-10 w-10 bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0">
                      <AvatarFallback className="bg-transparent text-white text-sm"><Sparkles className="h-4 w-4" /></AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
	                      <div className="flex items-center gap-2 mb-1">
	                        <span className="font-medium text-white text-sm">Operations Center</span>
	                        <span className="text-xs text-blue-400 animate-pulse">thinking...</span>
	                      </div>
                      <div className="bg-gray-800 rounded-2xl px-4 py-3 inline-block">
                        <div className="flex items-center gap-1 text-gray-400">
                          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            
            {isThinking && (
              <div className="flex justify-start">
                <div className="bg-gray-800/90 border border-gray-700/50 rounded-lg p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Chat Input */}
        <div className="border-t border-gray-800 p-3 md:p-4 bg-gray-900/50 safe-area-bottom">
          <div className="max-w-4xl mx-auto relative">
            {showMentionPopover && mentionableAgents.length > 0 && (
              <div className="absolute bottom-full mb-2 left-0 w-full md:w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-gray-700">
                  <span className="text-xs text-gray-400">Type to filter agents...</span>
                </div>
                <div className="max-h-48 md:max-h-64 overflow-y-auto">
                  {mentionableAgents.map((agent) => {
                    const dept = getDepartmentFromRole(agent.role || "");
                    const config = DEPARTMENT_CONFIG[dept];
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => handleMentionSelect(agent)}
                        className="ops-row-interactive w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800 text-left transition-colors"
                      >
                        <Avatar className="h-8 w-8 bg-gray-700">
                          <AvatarImage
                            src={getAgentAvatarUrl({ id: agent.id, name: agent.name, size: 64 })}
                            alt={agent.name || "Agent"}
                          />
                          <AvatarFallback className="text-sm text-white">{agent.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{agent.name}</div>
                          <div className={cn("text-xs truncate", config.color)}>{agent.role}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Popover open={brainstormPopoverOpen} onOpenChange={setBrainstormPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 border-blue-500/40 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20"
                      disabled={
                        startBrainstormMutation.isPending ||
                        stopBrainstormMutation.isPending ||
                        (!currentConversationId && !currentMeetingId)
                      }
                    >
                      <Brain className="mr-2 h-4 w-4" />
                      Brainstorm
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[360px] max-w-[95vw] border-gray-700 bg-gray-900 p-3">
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-medium text-white">Brainstorm mode</div>
                        <div className="text-xs text-gray-400">
                          Agents discuss in a fast loop for a fixed duration.
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 text-xs text-gray-400">Topic</div>
                        <Textarea
                          value={brainstormTopic}
                          onChange={(event) => setBrainstormTopic(event.target.value)}
                          placeholder="Discuss strategy, blockers, or next steps..."
                          className="min-h-[70px] border-gray-700 bg-gray-800 text-white"
                          maxLength={2000}
                        />
                      </div>

                      <div>
                        <div className="mb-1 text-xs text-gray-400">Duration</div>
                        <div className="flex flex-wrap gap-2">
                          {BRAINSTORM_DURATION_OPTIONS.map((option) => (
                            <Button
                              key={option.value}
                              type="button"
                              size="sm"
                              variant={brainstormDurationSec === option.value ? "default" : "outline"}
                              className={cn(
                                "h-8",
                                brainstormDurationSec === option.value
                                  ? "bg-blue-600 hover:bg-blue-700"
                                  : "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700",
                              )}
                              onClick={() => setBrainstormDurationSec(option.value)}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs text-gray-200">
                          <input
                            type="checkbox"
                            checked
                            readOnly
                            className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-800"
                          />
                          Agents talk to each other
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-200">
                          <input
                            type="checkbox"
                            checked={brainstormSummarizeAtEnd}
                            onChange={(event) => setBrainstormSummarizeAtEnd(event.target.checked)}
                            className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-800"
                          />
                          Summarize at end
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-200">
                          <input
                            type="checkbox"
                            checked={brainstormCreateTasks}
                            onChange={(event) => setBrainstormCreateTasks(event.target.checked)}
                            className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-800"
                          />
                          Create tasks from ideas
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-200">
                          <input
                            type="checkbox"
                            checked={brainstormAllowActions}
                            onChange={(event) => setBrainstormAllowActions(event.target.checked)}
                            className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-800"
                          />
                          Allow actions (guarded)
                        </label>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setBrainstormPopoverOpen(false)}
                          className="text-gray-300 hover:text-white"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700"
                          disabled={startBrainstormMutation.isPending || stopBrainstormMutation.isPending}
                          onClick={handleStartBrainstorm}
                        >
                          {startBrainstormMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="mr-2 h-4 w-4" />
                          )}
                          Start
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {activeBrainstormSession?.status === "running" && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1.5 text-xs text-blue-100">
                  <Brain className="h-3.5 w-3.5" />
                  <span className="font-medium">Brainstorm running</span>
                  <span className="text-blue-200/80">• {formatCountdown(brainstormRemainingSec)} remaining</span>
                  <div className="hidden md:flex items-center gap-1">
                    {BRAINSTORM_EXTEND_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 border-blue-300/40 bg-transparent px-2 text-[11px] text-blue-100 hover:bg-blue-500/20"
                        onClick={() =>
                          extendBrainstormMutation.mutate({
                            sessionId: activeBrainstormSession.id,
                            extendSec: option.value,
                          })
                        }
                        disabled={extendBrainstormMutation.isPending || stopBrainstormMutation.isPending}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 border-blue-300/40 bg-transparent px-2 text-[11px] text-blue-100 hover:bg-blue-500/20"
                    onClick={() => stopBrainstormMutation.mutate(activeBrainstormSession.id)}
                    disabled={stopBrainstormMutation.isPending || extendBrainstormMutation.isPending}
                  >
                    {stopBrainstormMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Square className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1">Stop</span>
                  </Button>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (sendMessage.isPending || isThinking || isUploadingAttachments) return;
                if (currentMeeting) {
                  handleSendMeetingMessage();
                  return;
                }

                const companyId = resolveEffectiveCompanyId();
                if (!companyId) {
                  toast({
                    title: "Company unavailable",
                    description: companiesLoading ? "Still loading company context." : "No company found.",
                    variant: "destructive",
                  });
                  return;
                }

                const attachments = pendingAttachments;
                const hasText = Boolean(messageInput.trim());
                if (!hasText && attachments.length === 0) return;

                forceAutoScrollRef.current = true;
                const content = hasText ? messageInput.trim() : `Please review ${attachments.length} attachment(s).`;
                const clientMessageId = createClientMessageId();
                const tempId = `temp-user-${clientMessageId}`;
                setLocalMessages((prev) => [
                  ...prev,
                  {
                    id: tempId,
                    clientMessageId,
                    content,
                    messageType: "user",
                    contextTags: ["message"],
                    createdAt: new Date().toISOString(),
                    fromAgent: { name: "You", role: "Platform Admin" },
                    attachments,
                  },
                ]);

                sendMessage.mutate({
                  tempId,
                  clientMessageId,
                  companyId,
                  content,
                  attachments,
                });
              }}
              className="space-y-2"
            >
              <div className="flex gap-2 md:gap-3">
                {!currentMeeting && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="ops-pressable h-11 w-11 md:h-12 md:w-12 rounded-xl border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sendMessage.isPending || isThinking || isUploadingAttachments || pendingAttachments.length >= MAX_CHAT_ATTACHMENTS}
                  >
                    <Paperclip className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                )}

                <VoiceToTextButton
                  disabled={sendMessage.isPending || isThinking || isUploadingAttachments || (activeAgents.length === 0 && !currentMeeting)}
                  draftText={messageInput}
                  setDraftText={setDraftText}
                  appendDraftText={appendDraftText}
                  conversationId={currentConversationId}
                  tenantId={selectedCompanyId ?? null}
                  autoSendAfterTranscription={false}
                />

                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                  <Input
                    ref={inputRef}
                    placeholder={activeAgents.length === 0 && !currentMeeting ? "Add agents first..." : `Type @ to mention...`}
                    value={messageInput}
                    onChange={handleInputChange}
                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 h-11 md:h-12 rounded-xl pl-8 text-sm md:text-base"
                    disabled={sendMessage.isPending || isThinking || isUploadingAttachments || (activeAgents.length === 0 && !currentMeeting)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    (!messageInput.trim() && pendingAttachments.length === 0) ||
                    sendMessage.isPending ||
                    isThinking ||
                    isUploadingAttachments ||
                    (activeAgents.length === 0 && !currentMeeting)
                  }
                  className="ops-pressable bg-blue-600 hover:bg-blue-700 h-11 w-11 md:h-12 md:w-12 rounded-xl flex-shrink-0"
                >
                  {sendMessage.isPending || isThinking ? <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" /> : <Send className="h-4 w-4 md:h-5 md:w-5" />}
                </Button>
              </div>

              {!currentMeeting && pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/70 px-2.5 py-1.5 text-xs text-gray-200"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span className="max-w-[220px] truncate">
                        {attachment.url ? (
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-white/30 underline-offset-2 hover:decoration-white/80"
                          >
                            {attachment.name}
                            {attachment.version && attachment.version > 1 ? ` (v${attachment.version})` : ""}
                          </a>
                        ) : (
                          <span>
                            {attachment.name}
                            {attachment.version && attachment.version > 1 ? ` (v${attachment.version})` : ""}
                          </span>
                        )}
                      </span>
                      <span className="text-gray-400">{formatAttachmentSize(attachment.size)}</span>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-white"
                        onClick={() => removePendingAttachment(attachment.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!currentMeeting && (
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={onAttachmentSelect}
                  multiple
                />
              )}
            </form>
          </div>
        </div>
          </>
        )}

        {!currentMeeting && opsView === "objectives" && (
          <ScrollArea className="flex-1 px-3 md:px-6 py-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold text-white">Objectives</div>
                  <div className="text-xs text-gray-400">Chat outcomes translated into trackable goals.</div>
                </div>
                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-300 border-blue-500/30">
                  {companyGoals.length} total
                </Badge>
              </div>

              {goalsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 bg-gray-800" />
                  ))}
                </div>
              ) : companyGoals.length === 0 ? (
                <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-4 py-8 text-center text-sm text-gray-400">
                  No objectives yet. Mark a user message as goal or add one from a meeting.
                </div>
              ) : (
                <div className="space-y-2">
                  {companyGoals.slice(0, 100).map((goal) => (
                    <div key={goal.id} className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white">{goal.title}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                String(goal.status || "").toLowerCase() === "completed"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-amber-500/30 bg-amber-500/10 text-amber-300",
                              )}
                            >
                              {String(goal.status || "planned")}
                            </Badge>
                            <span className="text-[11px] text-gray-500">{String(goal.priority || "normal")}</span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-gray-700 text-gray-200 hover:bg-gray-700"
                          onClick={() => setOpsView("agenda")}
                        >
                          Plan
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {!currentMeeting && opsView === "agenda" && (
          <ScrollArea className="flex-1 px-3 md:px-6 py-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <Card className="bg-gray-900/30 border-gray-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base text-white">Agenda copy</CardTitle>
                      <p className="text-xs text-gray-400 mt-1">Planned meetings only. Open one before chatting.</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => {
                        if (typeof window !== "undefined") window.location.assign("/agenda");
                      }}
                    >
                      Open full agenda
                    </Button>
                  </div>
                </CardHeader>
                <div className="px-4 pb-4">
                  {agendaSnapshotLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-16 bg-gray-800" />
                      ))}
                    </div>
                  ) : agendaSnapshotVisibleItems.length === 0 ? (
                    <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-4 py-8 text-center text-sm text-gray-400">
                      No meetings found in the current agenda window.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {agendaSnapshotVisibleItems.slice(0, 60).map((item) => {
                        const linkedRoom = item.conversationId
                          ? chatRooms.find((room) => room.conversationId === item.conversationId)
                          : null;
                        const start = new Date(item.startTime);
                        const status = item.status.toLowerCase();
                        const statusClass =
                          status === "live" || status === "in_progress"
                            ? "bg-green-500/10 text-green-300 border-green-500/30"
                            : status === "cancelled"
                              ? "bg-red-500/10 text-red-300 border-red-500/30"
                              : "bg-blue-500/10 text-blue-300 border-blue-500/30";
                        return (
                          <div key={item.id} className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-white truncate">{item.title}</div>
                                <div className="text-xs text-gray-400 mt-1">
                                  {Number.isFinite(start.getTime()) ? format(start, "EEE dd MMM | HH:mm") : item.startTime}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant="outline" className={cn("text-[10px]", statusClass)}>
                                  {item.status}
                                </Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-gray-600 text-gray-100 hover:bg-gray-700"
                                  onClick={() => {
                                    if (linkedRoom) {
                                      setCurrentMeeting(linkedRoom);
                                      setOpsView("chat");
                                      return;
                                    }
                                    if (typeof window !== "undefined") window.location.assign("/agenda");
                                  }}
                                >
                                  {linkedRoom ? "Open room" : "Open agenda"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </ScrollArea>
        )}

        {!currentMeeting && opsView === "background" && (
          <div className="flex-1 flex flex-col">
            <div className="border-b border-gray-800 bg-gray-900/20 px-3 md:px-6 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="h-4 w-4 text-blue-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-white truncate">Background</span>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-gray-800/50 border-gray-700 text-gray-300 flex-shrink-0"
                >
                  auto-refresh
                </Badge>
              </div>

              <div className="w-[220px] md:w-[360px]">
                <Select
                  value={selectedOpsThreadId ? String(selectedOpsThreadId) : ""}
                  onValueChange={(value) => setSelectedOpsThreadId(Number(value))}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9">
                    <SelectValue placeholder={opsCommsThreadsLoading ? "Loading..." : "Select thread"} />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    {opsCommsThreads.map((t) => (
                      <SelectItem key={String(t.id)} value={String(t.id)}>
                        {t.name || `Thread #${t.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea className="flex-1 px-3 md:px-6 py-4">
              <div className="max-w-4xl mx-auto space-y-3">
                <Card className="bg-gray-900/30 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-white">Background engine</CardTitle>
                    <p className="text-xs text-gray-400">
                      Starts time-bound background conversations and internal ops updates. Always visible, always stoppable.
                    </p>
                  </CardHeader>
                  <div className="px-4 pb-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] border-gray-700",
                          aiStatus?.processes?.backgroundConversations?.running
                            ? "bg-green-500/10 text-green-300"
                            : "bg-gray-800/40 text-gray-300",
                        )}
                      >
                        background: {aiStatus?.processes?.backgroundConversations?.running ? "RUNNING" : "STOPPED"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] border-gray-700",
                          aiStatus?.processes?.opsCommsAutopilot?.running ? "bg-green-500/10 text-green-300" : "bg-gray-800/40 text-gray-300",
                        )}
                      >
                        ops autopilot: {aiStatus?.processes?.opsCommsAutopilot?.running ? "RUNNING" : "STOPPED"}
                      </Badge>
                      {aiStatus?.backgroundSessions?.activeSessionId ? (
                        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-300 border-blue-500/30">
                          session: {String(aiStatus.backgroundSessions.activeSessionId)}
                        </Badge>
                      ) : null}
                      {aiStatus?.processes?.backgroundConversations?.lastError ? (
                        <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-300 border-red-500/30">
                          error: {String(aiStatus.processes.backgroundConversations.lastError).slice(0, 120)}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-1 md:col-span-1">
                        <div className="text-xs text-gray-400">Objective (required)</div>
                        <Select
                          value={bgObjectiveId ? String(bgObjectiveId) : "none"}
                          onValueChange={(value) => setBgObjectiveId(value === "none" ? null : Number(value))}
                          disabled={!companyGoals.length}
                        >
                          <SelectTrigger className="h-9 bg-gray-800 border-gray-700 text-white">
                            <SelectValue placeholder={goalsLoading ? "Loading objectives..." : "Select objective"} />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-900 border-gray-700">
                            <SelectItem value="none">Select objective</SelectItem>
                            {companyGoals.map((goal) => (
                              <SelectItem key={goal.id} value={String(goal.id)}>
                                {goal.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <div className="text-xs text-gray-400">Agenda meeting (required)</div>
                        <Select
                          value={bgAgendaEventId ? String(bgAgendaEventId) : "none"}
                          onValueChange={(value) => setBgAgendaEventId(value === "none" ? null : Number(value))}
                          disabled={!agendaItemsForBackground.length}
                        >
                          <SelectTrigger className="h-9 bg-gray-800 border-gray-700 text-white">
                            <SelectValue placeholder={agendaSnapshotLoading ? "Loading agenda..." : "Select agenda event"} />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-900 border-gray-700">
                            <SelectItem value="none">Select agenda event</SelectItem>
                            {agendaItemsForBackground.map((item) => {
                              const meetingId = item.meetingId ?? asPositiveInt(item.id);
                              if (!meetingId) return null;
                              return (
                                <SelectItem key={String(meetingId)} value={String(meetingId)}>
                                  {item.title} • {format(new Date(item.startTime), "MMM d, HH:mm")}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <div className="text-xs text-gray-400">Agenda / objective (required)</div>
                        <Textarea
                          value={bgAgendaText}
                          onChange={(e) => setBgAgendaText(e.target.value)}
                          placeholder="Example: Finance catch-up - review cash balance mismatches, hedging window, and email deliverability fixes. Output: 3 decisions + 5 action items with owners and deadlines."
                          className="bg-gray-800 border-gray-700 text-white min-h-[90px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-gray-400">Participants (min 2)</div>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-between border-white/15 bg-gray-800 text-white/80 hover:bg-white/10"
                            >
                              <span className={cn("truncate text-left", selectedBgParticipants.length ? "" : "text-white/50")}>
                                {selectedBgParticipants.length
                                  ? `${selectedBgParticipants.length} selected`
                                  : "Select agents"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-gray-900 border border-white/10 text-white">
                            <Command>
                              <CommandInput placeholder="Search agents..." />
                              <CommandList>
                                <CommandEmpty>No results.</CommandEmpty>
                                <CommandGroup>
                                  {companyAgents
                                    .filter((a) => a.status === "active")
                                    .map((agent) => {
                                      const selected = bgParticipantAgentIds.includes(agent.id);
                                      return (
                                        <CommandItem
                                          key={String(agent.id)}
                                          value={`${agent.name} ${agent.role} ${agent.id}`}
                                          onSelect={() => {
                                            setBgParticipantAgentIds((prev) => {
                                              if (prev.includes(agent.id)) return prev.filter((id) => id !== agent.id);
                                              return [...prev, agent.id];
                                            });
                                          }}
                                          className="text-white/80"
                                        >
                                          <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                                          <span className="truncate">{agent.name}</span>
                                          <span className="ml-auto text-[10px] text-white/40">{agent.role}</span>
                                        </CommandItem>
                                      );
                                    })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>

                        {selectedBgParticipants.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {selectedBgParticipants.slice(0, 6).map((a) => (
                              <Badge key={String(a.id)} variant="outline" className="text-[10px] bg-gray-800/40 border-gray-700 text-gray-300">
                                {a.name}
                              </Badge>
                            ))}
                            {selectedBgParticipants.length > 6 ? (
                              <Badge variant="outline" className="text-[10px] bg-gray-800/40 border-gray-700 text-gray-300">
                                +{selectedBgParticipants.length - 6}
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs text-gray-400">Run for</div>
                      <Select value={String(bgRequestedMinutes)} onValueChange={(v) => setBgRequestedMinutes(Number(v))}>
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9 w-[140px]">
                          <SelectValue placeholder="Minutes" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-gray-700">
                          {[5, 10, 20, 30, 45, 60, 90, 120].map((m) => (
                            <SelectItem key={String(m)} value={String(m)}>
                              {m} minutes
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        type="button"
                        className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold h-9"
                        disabled={startBackground.isPending}
                        onClick={() => {
                          if (!validateBackgroundStart()) return;
                          startBackground.mutate(false);
                        }}
                      >
                        {startBackground.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/15 text-white/80 hover:bg-white/10 h-9"
                        disabled={stopBackground.isPending}
                        onClick={() => stopBackground.mutate()}
                      >
                        {stopBackground.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Stop"}
                      </Button>
                    </div>

                    <Dialog open={bgConsentOpen} onOpenChange={setBgConsentOpen}>
                      <DialogContent className="bg-gray-950 border-gray-800 text-white">
                        <DialogHeader>
                          <DialogTitle>Confirm background AI run</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 text-sm text-white/85">
                          <div className="text-white/70">This starts time-bound background activity. No hidden processes.</div>
                          {bgConsentPlan ? (
                            <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                              <div><span className="text-white/70">What:</span> {bgConsentPlan.what}</div>
                              <div><span className="text-white/70">Why:</span> {bgConsentPlan.why}</div>
                              <div><span className="text-white/70">For:</span> {bgConsentPlan.forHowLong}</div>
                              <div className="text-white/70">Resources: {bgConsentPlan.resources?.join(", ")}</div>
                              <div className="text-white/70">Stop: {bgConsentPlan.howToStop?.join(" | ")}</div>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="border-white/15 text-white/80 hover:bg-white/10"
                              onClick={() => setBgConsentOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
                              onClick={() => {
                                if (!validateBackgroundStart()) return;
                                startBackground.mutate(true);
                              }}
                              disabled={startBackground.isPending}
                            >
                              {startBackground.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm & start"}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </Card>

                <Card className="bg-gray-900/30 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-white">Background conversations</CardTitle>
                    <p className="text-xs text-gray-400">
                      Full room-level visibility. Select a room, inspect every message, and intervene directly if needed.
                    </p>
                  </CardHeader>
                  <div className="px-4 pb-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="md:col-span-1">
                        <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-2">
                          <div className="mb-2 flex items-center justify-between text-[11px] text-gray-400">
                            <span>Rooms</span>
                            <span>{backgroundRooms.length}</span>
                          </div>
                          <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                            {backgroundRoomsLoading ? (
                              <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                  <Skeleton key={i} className="h-14 bg-gray-800" />
                                ))}
                              </div>
                            ) : backgroundRooms.length === 0 ? (
                              <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 text-xs text-gray-400">
                                No background conversations yet.
                              </div>
                            ) : (
                              backgroundRooms.map((room) => {
                                const active = selectedBackgroundConversationId === room.conversationId;
                                const summaryText = String((room.metadata as any)?.summary || "").trim();
                                return (
                                  <button
                                    key={String(room.id)}
                                    type="button"
                                    className={cn(
                                      "w-full rounded-lg border p-2 text-left transition",
                                      active
                                        ? "border-blue-500 bg-blue-500/10"
                                        : "border-gray-700 bg-gray-800/40 hover:bg-gray-800/70",
                                    )}
                                    onClick={() => setSelectedBackgroundConversationId(room.conversationId)}
                                  >
                                    <div className="truncate text-xs font-semibold text-white">
                                      {room.name || room.conversationId}
                                    </div>
                                    <div className="mt-1 truncate text-[11px] text-gray-400">
                                      {summaryText || "Open conversation"}
                                    </div>
                                    <div className="mt-1 text-[10px] text-gray-500">
                                      {formatTime(String(room.createdAt))}
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                          {!selectedBackgroundRoom ? (
                            <div className="py-8 text-center text-sm text-gray-500">Select a background room to inspect messages.</div>
                          ) : (
                            <>
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-white">{selectedBackgroundRoom.name}</div>
                                  <div className="truncate text-[11px] text-gray-400">{selectedBackgroundRoom.conversationId}</div>
                                </div>
                                <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-300">
                                  live
                                </Badge>
                              </div>

                              <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                                {backgroundConversationMessagesLoading ? (
                                  <div className="space-y-2">
                                    {[1, 2, 3].map((i) => (
                                      <Skeleton key={i} className="h-14 bg-gray-800" />
                                    ))}
                                  </div>
                                ) : backgroundConversationMessages.length === 0 ? (
                                  <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 text-xs text-gray-400">
                                    No messages yet.
                                  </div>
                                ) : (
                                  backgroundConversationMessages.map((msg) => {
                                    const meta = ((msg as any)?.metadata || {}) as Record<string, any>;
                                    const senderName = msg.fromAgent?.name || (msg.fromAgentId ? `Agent #${msg.fromAgentId}` : "You");
                                    const senderRole = msg.fromAgent?.role || (msg.fromAgentId ? "Agent" : "Human");
                                    const isAutonomous = Boolean(meta?.isBackgroundMessage);
                                    return (
                                      <div key={String(msg.id)} className="rounded-lg border border-gray-700 bg-gray-800/40 p-2">
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                          <div className="min-w-0">
                                            <span className="truncate text-xs font-semibold text-white">{senderName}</span>
                                            <span className="ml-2 text-[10px] text-gray-500">{senderRole}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Badge
                                              variant="outline"
                                              className={cn(
                                                "text-[10px]",
                                                isAutonomous
                                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                                  : "border-amber-500/30 bg-amber-500/10 text-amber-300",
                                              )}
                                            >
                                              {isAutonomous ? "AUTO" : "INTERVENTION"}
                                            </Badge>
                                            <span className="text-[10px] text-gray-500">{formatTime(String(msg.createdAt))}</span>
                                          </div>
                                        </div>
                                        <div className="whitespace-pre-wrap text-sm text-gray-200">{msg.content}</div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              <div className="mt-3 flex gap-2">
                                <Textarea
                                  value={backgroundInterventionInput}
                                  onChange={(e) => setBackgroundInterventionInput(e.target.value)}
                                  placeholder="Intervene in this conversation..."
                                  className="min-h-[44px] bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                                  disabled={interveneInBackgroundRoom.isPending}
                                />
                                <Button
                                  type="button"
                                  className="h-11 rounded-xl bg-blue-600 px-4 hover:bg-blue-700"
                                  disabled={!backgroundInterventionInput.trim() || interveneInBackgroundRoom.isPending}
                                  onClick={() =>
                                    interveneInBackgroundRoom.mutate({
                                      conversationId: selectedBackgroundRoom.conversationId,
                                      content: backgroundInterventionInput.trim(),
                                    })
                                  }
                                >
                                  {interveneInBackgroundRoom.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {!selectedOpsThreadId ? (
                  <div className="text-center py-12 text-gray-500 text-sm">Select a thread to view messages.</div>
                ) : opsCommsMessagesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 bg-gray-800" />
                    ))}
                  </div>
                ) : opsCommsMessages.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 text-sm">No messages yet.</div>
                ) : (
                  opsCommsMessages.map((m: any) => (
                    <div key={String(m.id)} className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-gray-900/40 border-gray-700 text-gray-300 flex-shrink-0"
                          >
                            {String(m.messageType || "STATUS_UPDATE")}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] flex-shrink-0",
                              m.priority === "URGENT"
                                ? "bg-red-500/10 text-red-300 border-red-500/30"
                                : m.priority === "HIGH"
                                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                  : "bg-blue-500/10 text-blue-300 border-blue-500/30",
                            )}
                          >
                            {String(m.priority || "NORMAL")}
                          </Badge>
                          <span className="text-xs text-gray-400 truncate">
                            {m.senderAgentKey ? `@${m.senderAgentKey}` : String(m.senderType || "SYSTEM")}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-500 flex-shrink-0">
                          {formatTime(String(m.createdAt))}
                        </span>
                      </div>
                      {m.contentText && <div className="text-sm text-gray-200 whitespace-pre-wrap">{m.contentText}</div>}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="border-t border-gray-800 p-3 md:p-4 bg-gray-900/50 safe-area-bottom">
              <div className="max-w-4xl mx-auto flex gap-2">
                <Textarea
                  value={opsCommsInput}
                  onChange={(e) => setOpsCommsInput(e.target.value)}
                  placeholder={selectedOpsThreadId ? "Post a short structured update..." : "Select a thread first..."}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 min-h-[44px]"
                  disabled={!selectedOpsThreadId || postOpsCommsMessage.isPending}
                />
                <Button
                  type="button"
                  onClick={() => {
                    const text = opsCommsInput.trim();
                    if (!text) return;
                    postOpsCommsMessage.mutate(text);
                  }}
                  disabled={!selectedOpsThreadId || !opsCommsInput.trim() || postOpsCommsMessage.isPending}
                  className="bg-blue-600 hover:bg-blue-700 h-11 px-4 rounded-xl flex-shrink-0"
                >
                  {postOpsCommsMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {!currentMeeting && opsView === "tasks" && (
          <ScrollArea className="flex-1 px-3 md:px-6 py-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold text-white">Tasks</div>
                  <div className="text-xs text-gray-400">Execution backlog from meetings, brainstorm and chats.</div>
                </div>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                  {companyTasks.length} tracked
                </Badge>
              </div>

              {tasksLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 bg-gray-800" />
                  ))}
                </div>
              ) : companyTasks.length === 0 && suggestedConversationTasks.length === 0 ? (
                <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-4 py-8 text-center text-sm text-gray-400">
                  No tasks yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {companyTasks.slice(0, 80).map((task) => (
                    <div key={`task:${task.id}`} className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white">{task.title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px] border-gray-600 bg-gray-900/40 text-gray-300">
                              {String(task.status || "todo")}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-300">
                              {String(task.priority || "normal")}
                            </Badge>
                            {task.agent?.name ? <span className="text-[11px] text-gray-400">Owner: {task.agent.name}</span> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {suggestedConversationTasks.slice(0, 30).map((task) => (
                    <div key={`suggested:${task.id}`} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                      <div className="text-sm text-amber-100">{task.text}</div>
                      <div className="mt-1 text-[11px] text-amber-200/80">
                        Suggested by {task.authorName} • {formatTime(task.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {!currentMeeting && opsView === "actions" && (
          <ScrollArea className="flex-1 px-3 md:px-6 py-4">
            <div className="max-w-4xl mx-auto space-y-6">
              <Card className="bg-gray-900/30 border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-white">Queue action: SEND_EMAIL</CardTitle>
                  <p className="text-xs text-gray-400">Creates an action request (runs via background worker).</p>
                </CardHeader>
                <div className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-1">
                      <div className="text-xs text-gray-400 mb-1">From (agent key)</div>
                      <Select
                        value={emailActionDraft.agentKey}
                        onValueChange={(value) => setEmailActionDraft((prev) => ({ ...prev, agentKey: value }))}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-10">
                          <SelectValue placeholder="Agent" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-gray-700">
                          {[
                            "chairman_assistant",
                            "coordinator",
                            "ops",
                            "compliance",
                            "data",
                            "marketing",
                            "sales",
                            "procurement",
                            "wallet",
                            "accounting",
                            "support",
                            "seo",
                            "seo_autopilot",
                            "media",
                            "client_hunter",
                          ].map((key) => (
                            <SelectItem key={key} value={key}>
                              {key}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs text-gray-400 mb-1">To (comma-separated)</div>
                      <Input
                        value={emailActionDraft.to}
                        onChange={(e) => setEmailActionDraft((prev) => ({ ...prev, to: e.target.value }))}
                        placeholder="vs@exportunity.net, someone@example.com"
                        className="bg-gray-800 border-gray-700 text-white h-10"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400 mb-1">Subject</div>
                    <Input
                      value={emailActionDraft.subject}
                      onChange={(e) => setEmailActionDraft((prev) => ({ ...prev, subject: e.target.value }))}
                      placeholder="Subject"
                      className="bg-gray-800 border-gray-700 text-white h-10"
                    />
                  </div>

                  <div>
                    <div className="text-xs text-gray-400 mb-1">Body</div>
                    <Textarea
                      value={emailActionDraft.body}
                      onChange={(e) => setEmailActionDraft((prev) => ({ ...prev, body: e.target.value }))}
                      placeholder="Write a professional email..."
                      className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 min-h-[120px]"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-500">
                      Worker: <span className="text-gray-300 font-mono">npm run actions:worker</span>
                    </div>
                    <Button
                      type="button"
                      onClick={() => createEmailActionRequest.mutate()}
                      disabled={createEmailActionRequest.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {createEmailActionRequest.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Queue email
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="bg-gray-900/30 border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-white">Action queue</CardTitle>
                  <p className="text-xs text-gray-400">Latest action requests (queued/running/done/failed).</p>
                </CardHeader>
                <div className="px-4 pb-4">
                  {actionsQueueLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 bg-gray-800" />
                      ))}
                    </div>
                  ) : (actionsQueueResponse?.items?.length || 0) === 0 ? (
                    <div className="text-gray-500 text-sm py-8 text-center">No action requests yet</div>
                  ) : (
                    <div className="space-y-2">
                      {actionsQueueResponse!.items.slice(0, 50).map((item: any) => (
                        <div key={String(item.id)} className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm text-white truncate">
                                {actionPublicIdForUi(item)} | {item.actionType}
                              </div>
                              <div className="text-xs text-gray-500 truncate">
                                {item.payload?.subject ? `"${item.payload.subject}"` : "-"} | {actionStateForUi(item)}
                              </div>
                              {actionStateForUi(item) === "FAILED" &&
                              (item.diagnostics?.failureReason || item.error?.message || item.metadata?.lastError) ? (
                                <div className="mt-1 text-xs text-red-300 break-words">
                                  {String(item.diagnostics?.failureReason || item.error?.message || item.metadata?.lastError || "")}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] flex-shrink-0", actionStateClassForUi(actionStateForUi(item)))}
                              >
                                {actionStateForUi(item)}
                              </Badge>
                              {adminLikeUser ? (
                                <a
                                  href={resolveApiUrl(`/api/admin/actions/${item.id}/events`)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-blue-300 underline underline-offset-2"
                                >
                                  View debug
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </ScrollArea>
        )}

        {!currentMeeting && opsView === "decisions" && (
          <ScrollArea className="flex-1 px-3 md:px-6 py-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold text-white">Decisions</div>
                  <div className="text-xs text-gray-400">Conversation decisions plus approvals that require your action.</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-300 border-blue-500/30">
                    {conversationDecisionItems.length} in chat
                  </Badge>
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/30">
                    {decisionsResponse?.items?.length || 0} pending
                  </Badge>
                </div>
              </div>

              {conversationDecisionItems.length === 0 ? (
                <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-4 py-6 text-sm text-gray-400">
                  No conversation decision extracted yet. Use lines starting with <span className="font-medium text-gray-200">DECISION:</span> or end a brainstorm with summary enabled.
                </div>
              ) : (
                <div className="space-y-2">
                  {conversationDecisionItems.slice(0, 80).map((item) => (
                    <div key={item.id} className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                      <div className="text-sm text-blue-50">{item.text}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-blue-200/80">
                        <span>{item.authorName}</span>
                        <span>•</span>
                        <span>{formatTime(item.createdAt)}</span>
                        <Badge variant="outline" className="text-[10px] border-blue-400/30 bg-blue-400/10 text-blue-200">
                          {item.sourceLabel === "summary" ? "summary" : "decision"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Separator className="bg-gray-800" />

              <div>
                <div className="mb-2 text-sm font-medium text-white">Approval queue</div>
                {decisionsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 bg-gray-800" />
                    ))}
                  </div>
                ) : (decisionsResponse?.items?.length || 0) === 0 ? (
                  <div className="text-gray-500 text-sm py-6 text-center">No approvals pending</div>
                ) : (
                  <div className="space-y-2">
                    {decisionsResponse!.items.slice(0, 100).map((item: any) => (
                      <div key={String(item.id)} className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm text-white truncate">#{item.id} • {item.actionType}</div>
                            <div className="text-xs text-gray-500 truncate">
                              {item.payload?.subject ? `"${item.payload.subject}"` : "—"} •{" "}
                              {item.payload?.to?.join?.(", ") || item.payload?.to || ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => approveAction.mutate(Number(item.id))}
                              disabled={approveAction.isPending}
                              className="border-green-500/30 text-green-300 hover:bg-green-500/10"
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => denyAction.mutate(Number(item.id))}
                              disabled={denyAction.isPending}
                              className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                            >
                              Deny
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        {!currentMeeting && opsView === "automations" && (
          <ScrollArea className="flex-1 px-3 md:px-6 py-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold text-white">Automations</div>
                  <div className="text-xs text-gray-400">Queued and autonomous actions across this operations room.</div>
                </div>
                <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-300 border-purple-500/30">
                  {actionsQueueResponse?.items?.length || 0} requests
                </Badge>
              </div>

              <Card className="bg-gray-900/30 border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-white">Execution pipeline</CardTitle>
                </CardHeader>
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    {[
                      { label: "Queued", count: actionsQueueResponse?.items?.filter((item: any) => actionStateForUi(item) === "QUEUED" || actionStateForUi(item) === "CREATED").length || 0 },
                      { label: "Running", count: actionsQueueResponse?.items?.filter((item: any) => actionStateForUi(item) === "RUNNING").length || 0 },
                      { label: "Done", count: actionsQueueResponse?.items?.filter((item: any) => actionStateForUi(item) === "SUCCEEDED" || actionStateForUi(item) === "DONE").length || 0 },
                      { label: "Failed", count: actionsQueueResponse?.items?.filter((item: any) => actionStateForUi(item) === "FAILED").length || 0 },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
                        <div className="text-[11px] text-gray-400">{stat.label}</div>
                        <div className="mt-1 text-lg font-semibold text-white">{stat.count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <div className="space-y-2">
                {(actionsQueueResponse?.items || []).slice(0, 80).map((item: any) => (
                  <div key={`automation:${String(item.id)}`} className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-white">{actionPublicIdForUi(item)} • {item.actionType}</div>
                        <div className="text-xs text-gray-500 truncate">{actionStateForUi(item)}</div>
                        {actionStateForUi(item) === "FAILED" &&
                        (item.diagnostics?.failureReason || item.error?.message || item.metadata?.lastError) ? (
                          <div className="mt-1 text-xs text-red-300 break-words">
                            {String(item.diagnostics?.failureReason || item.error?.message || item.metadata?.lastError || "")}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px]", actionStateClassForUi(actionStateForUi(item)))}>
                          {actionStateForUi(item)}
                        </Badge>
                        {adminLikeUser ? (
                          <a
                            href={resolveApiUrl(`/api/admin/actions/${item.id}/events`)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-blue-300 underline underline-offset-2"
                          >
                            View debug
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        )}

        {!currentMeeting && opsView === "arborescence" && (
          <ScrollArea className="flex-1 px-3 md:px-6 py-4">
            <div className="max-w-6xl mx-auto space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-white">Arborescence</div>
                  <div className="text-xs text-gray-400">
                    Hard pipeline: {PIPELINE_STAGE_LABELS.join(" → ")}.
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-300 border-blue-500/30">
                  {arborescence.objectiveNodes.length} objective node{arborescence.objectiveNodes.length === 1 ? "" : "s"}
                </Badge>
              </div>

              <Card className="bg-gray-900/30 border-gray-800">
                <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                  {[
                    { label: "Chat", count: allMessages.length },
                    { label: "Objectives", count: companyGoals.length },
                    { label: "Agenda", count: agendaSnapshotItems.length },
                    { label: "Background", count: backgroundRooms.length },
                    { label: "Decisions", count: conversationDecisionItems.length },
                    { label: "Tasks", count: companyTasks.length },
                    { label: "Actions", count: decisionsResponse?.items?.length || 0 },
                    { label: "Automations", count: actionsQueueResponse?.items?.length || 0 },
                  ].map((stage, idx) => (
                    <div key={stage.label} className="rounded-lg border border-gray-700 bg-gray-800/40 p-2">
                      <div className="text-[11px] text-gray-400">{stage.label}</div>
                      <div className="mt-1 text-base font-semibold text-white">{stage.count}</div>
                      {idx < PIPELINE_STAGE_LABELS.length - 1 ? (
                        <div className="mt-1 text-[10px] text-gray-500">feeds next stage</div>
                      ) : (
                        <div className="mt-1 text-[10px] text-green-400">recurring loop</div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {arborescence.objectiveNodes.length === 0 ? (
                <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-4 py-6 text-sm text-gray-300">
                  No objective-linked pipeline found yet. Create at least one objective, then link agenda and run background/brainstorm.
                </div>
              ) : (
                <div className="space-y-3">
                  {arborescence.objectiveNodes.map((node: any) => (
                    <Card key={`arb:${String(node.goal?.id)}`} className="bg-gray-900/30 border-gray-800">
                      <div className="px-4 py-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">
                              Objective #{node.goal?.id}: {node.goal?.title || "Untitled objective"}
                            </div>
                            <div className="text-xs text-gray-400 truncate">
                              {node.goal?.status ? `status: ${String(node.goal.status)}` : "status: active"}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px] border-gray-700 bg-gray-800/40 text-gray-300">
                              Agenda {node.linkedAgenda.length}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] border-gray-700 bg-gray-800/40 text-gray-300">
                              Background {node.linkedBackground.length}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] border-gray-700 bg-gray-800/40 text-gray-300">
                              Decisions {node.linkedDecisions.length}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] border-gray-700 bg-gray-800/40 text-gray-300">
                              Tasks {node.linkedTasks.length}
                            </Badge>
                          </div>
                        </div>

                        {node.blockers.length > 0 ? (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                            <div className="text-xs font-semibold text-amber-200">Pipeline blockers</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {node.blockers.map((blocker: string, idx: number) => (
                                <Badge key={`blocker:${idx}:${blocker}`} variant="outline" className="text-[10px] border-amber-400/30 bg-amber-400/10 text-amber-200">
                                  {blocker}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-200">
                            Pipeline complete for this objective.
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                          <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
                            <div className="text-xs text-gray-300 font-medium">Agenda</div>
                            {node.linkedAgenda.length === 0 ? (
                              <div className="mt-2 text-xs text-gray-500">No linked agenda event</div>
                            ) : (
                              <div className="mt-2 space-y-1">
                                {node.linkedAgenda.slice(0, 4).map((item: AgendaSnapshotItem) => (
                                  <div key={`agenda:${item.id}`} className="text-xs text-gray-300">
                                    {item.title} • {format(new Date(item.startTime), "MMM d, HH:mm")}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
                            <div className="text-xs text-gray-300 font-medium">Background</div>
                            {node.linkedBackground.length === 0 ? (
                              <div className="mt-2 text-xs text-gray-500">No linked background conversation</div>
                            ) : (
                              <div className="mt-2 space-y-1">
                                {node.linkedBackground.slice(0, 4).map((room: any) => (
                                  <div key={`bg:${String(room.id)}`} className="text-xs text-gray-300 truncate">
                                    {String(room.name || "Background session")}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
                            <div className="text-xs text-gray-300 font-medium">Decisions</div>
                            {node.linkedDecisions.length === 0 ? (
                              <div className="mt-2 text-xs text-gray-500">No decision extracted</div>
                            ) : (
                              <div className="mt-2 space-y-1">
                                {node.linkedDecisions.slice(0, 4).map((decision: DecisionItem) => (
                                  <div key={`decision:${decision.id}`} className="text-xs text-gray-300 truncate">
                                    {decision.text}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
                            <div className="text-xs text-gray-300 font-medium">Tasks → Actions → Automations</div>
                            <div className="mt-2 text-xs text-gray-400">
                              Tasks: {node.linkedTasks.length} • Actions: {node.linkedActions.length} • Automations: {node.linkedAutomations.length}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {(arborescence.unlinkedAgenda.length > 0 || arborescence.unlinkedBackground.length > 0 || arborescence.unlinkedTasks.length > 0) && (
                <Card className="bg-gray-900/30 border-red-500/20">
                  <div className="px-4 py-4 space-y-2">
                    <div className="text-sm font-semibold text-red-200">Unlinked records (pipeline violation)</div>
                    <div className="text-xs text-red-200/80">
                      Every agenda/background/task should be linked to an objective for traceability.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {arborescence.unlinkedAgenda.length > 0 ? (
                        <Badge variant="outline" className="text-[10px] border-red-400/40 bg-red-500/10 text-red-200">
                          Agenda: {arborescence.unlinkedAgenda.length}
                        </Badge>
                      ) : null}
                      {arborescence.unlinkedBackground.length > 0 ? (
                        <Badge variant="outline" className="text-[10px] border-red-400/40 bg-red-500/10 text-red-200">
                          Background: {arborescence.unlinkedBackground.length}
                        </Badge>
                      ) : null}
                      {arborescence.unlinkedTasks.length > 0 ? (
                        <Badge variant="outline" className="text-[10px] border-red-400/40 bg-red-500/10 text-red-200">
                          Tasks: {arborescence.unlinkedTasks.length}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </ScrollArea>
        )}

        {!currentMeeting && opsView === "live" && (
          <ScrollArea className="flex-1 px-3 md:px-6 py-4">
            <div className="max-w-5xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold text-white">Live activity</div>
                  <div className="text-xs text-gray-400">Pipeline order: {PIPELINE_STAGE_LABELS.join(" → ")}.</div>
                </div>
              </div>

              <Card className="bg-gray-900/30 border-gray-800">
                <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                  {[
                    { label: "Chat", count: allMessages.length },
                    { label: "Objectives", count: companyGoals.length },
                    { label: "Agenda", count: agendaSnapshotItems.length },
                    { label: "Background", count: backgroundRooms.length },
                    { label: "Decisions", count: conversationDecisionItems.length },
                    { label: "Tasks", count: companyTasks.length },
                    { label: "Actions", count: decisionsResponse?.items?.length || 0 },
                    { label: "Automations", count: actionsQueueResponse?.items?.length || 0 },
                  ].map((stage) => (
                    <div key={stage.label} className="rounded-lg border border-gray-700 bg-gray-800/40 p-2">
                      <div className="text-[11px] text-gray-400">{stage.label}</div>
                      <div className="mt-1 text-base font-semibold text-white">{stage.count}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="space-y-2">
                {[...activityLogItems, ...recentActivity.map((item) => ({
                  id: item.id,
                  title: item.type,
                  description: item.content,
                  createdAt: item.timestamp,
                  eventType: item.type,
                }))].slice(0, 120).map((event: any, index) => (
                  <div key={`live:${String(event.id)}:${index}`} className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-white">{String(event.title || event.eventType || "Activity")}</div>
                        {event.description ? (
                          <div className="mt-1 whitespace-pre-wrap text-xs text-gray-400">{String(event.description)}</div>
                        ) : null}
                      </div>
                      <span className="text-[11px] text-gray-500">{formatTime(String(event.createdAt || new Date().toISOString()))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Right Sidebar - Agents (Desktop only) */}
      {showAgentList && !isMobile && (
        <div className="w-[20rem] lg:w-[22rem] xl:w-[24rem] min-w-[19rem] max-w-[24rem] shrink-0 border-l border-gray-800/80 bg-gray-900/55 backdrop-blur-sm flex flex-col overflow-hidden overflow-x-hidden">
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                {currentMeeting ? "Participants" : "Team Members"}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAgentList(false)} className="text-gray-400 hover:text-white h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search agents..."
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 pl-9 h-9"
              />
            </div>
          </div>

          <ScrollArea className="ops-team-scroll-area flex-1 min-h-0">
            {/* Execution Panel (Meeting mode) */}
            {currentMeeting && executionCompanyId && meetingRoomId && (
              <div className="p-4 border-b border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <Zap className="h-3 w-3 text-amber-400" />
                    Execution Panel
                  </h4>
                  <Badge className="bg-green-500/10 text-green-300 border-green-500/30 text-[10px]">
                    Live
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">Meeting goal</span>
                    {meetingGoalId ? (
                      <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/30 text-[10px]">Linked</Badge>
                    ) : (
                      <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/30 text-[10px]">Required</Badge>
                    )}
                  </div>

                  <Select
                    value={meetingGoalId ? String(meetingGoalId) : "none"}
                    onValueChange={(value) => {
                      if (value === "none") setMeetingGoalMutation.mutate(null);
                      else setMeetingGoalMutation.mutate(Number(value));
                    }}
                    disabled={goalsLoading || setMeetingGoalMutation.isPending}
                  >
                    <SelectTrigger className="h-9 min-w-0 bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder={goalsLoading ? "Loading goals..." : "Select a goal"} />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      <SelectItem value="none">No goal (not allowed to close)</SelectItem>
                      {companyGoals.map((goal) => (
                        <SelectItem key={goal.id} value={String(goal.id)}>
                          {goal.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-w-[120px] flex-1 border-gray-700 text-gray-200 hover:bg-gray-800"
                      onClick={() => createMeetingGoalMutation.mutate()}
                      disabled={createMeetingGoalMutation.isPending || goalsLoading}
                    >
                      <Target className="h-4 w-4 mr-2" />
                      New goal
                    </Button>
                    <Button
                      size="sm"
                      className="min-w-[120px] flex-1 bg-amber-500 hover:bg-amber-600 text-black"
                      onClick={() => extractMeetingTasksMutation.mutate()}
                      disabled={extractMeetingTasksMutation.isPending}
                    >
                      {extractMeetingTasksMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Extract
                    </Button>
                  </div>
                </div>

                <Separator className="bg-gray-800" />

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">Tasks</span>
                  <div className="flex gap-1">
                    <Badge className="bg-gray-800 text-gray-200 border-gray-700 text-[10px]">
                      Proposed {proposedMeetingTasks.length}
                    </Badge>
                    <Badge className="bg-green-500/10 text-green-300 border-green-500/30 text-[10px]">
                      Confirmed {confirmedMeetingTasks.length}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Proposed</div>
                  {tasksLoading ? (
                    <div className="text-xs text-gray-500">Loading tasks...</div>
                  ) : proposedMeetingTasks.length === 0 ? (
                    <div className="text-xs text-gray-500">No proposed tasks yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {proposedMeetingTasks.slice(0, 6).map((task) => (
                        <div key={task.id} className="flex items-start justify-between gap-2 bg-gray-800/40 border border-gray-700 rounded-lg p-2">
                          <div className="min-w-0">
                            <div className="text-xs text-white line-clamp-2 break-words">{task.title}</div>
                            <div className="text-[10px] text-gray-400 break-words">
                              {task.agent?.name ? `Owner: ${task.agent.name}` : "Owner: Unassigned"}
                              {task.dueDate ? ` | Due: ${String(task.dueDate).slice(0, 10)}` : ""}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-green-500/40 text-green-300 hover:bg-green-500/10"
                            onClick={() => approveTaskMutation.mutate(task.id)}
                            disabled={approveTaskMutation.isPending}
                          >
                            Approve
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {confirmedMeetingTasks.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Confirmed</div>
                    <div className="space-y-2">
                      {confirmedMeetingTasks.slice(0, 4).map((task) => (
                        <div key={task.id} className="bg-gray-800/30 border border-gray-700 rounded-lg p-2">
                          <div className="text-xs text-white line-clamp-2 break-words">{task.title}</div>
                          <div className="text-[10px] text-gray-400 break-words">
                            {task.agent?.name ? `Owner: ${task.agent.name}` : "Owner: Unassigned"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator className="bg-gray-800" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">Approver</span>
                    {!executionApproverAgentId && (
                      <Badge className="bg-red-500/10 text-red-300 border-red-500/30 text-[10px]">Required</Badge>
                    )}
                  </div>
                  <Select
                    value={executionApproverAgentId ? String(executionApproverAgentId) : "none"}
                    onValueChange={(value) => {
                      if (value === "none") setExecutionApproverAgentId(null);
                      else setExecutionApproverAgentId(Number(value));
                    }}
                  >
                    <SelectTrigger className="h-9 min-w-0 bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select approver" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      <SelectItem value="none">None</SelectItem>
                      {approverCandidates.map((agent) => (
                        <SelectItem key={agent.id} value={String(agent.id)}>
                          {agent.name} {agent.role ? ` - ${agent.role}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => closeMeetingMutation.mutate()}
                    disabled={
                      closeMeetingMutation.isPending ||
                      !meetingGoalId ||
                      meetingTasks.length === 0
                    }
                  >
                    {closeMeetingMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Circle className="h-4 w-4 mr-2" />
                    )}
                    Close meeting
                  </Button>
                  {(!meetingGoalId || meetingTasks.length === 0) && (
                    <div className="text-[10px] text-gray-500">
                      Closing requires a linked goal and at least one task.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Activity Feed */}
            {hasBackgroundActivity && !currentMeeting && (
              <div className="p-4 border-b border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <Activity className="h-3 w-3 animate-pulse text-green-400" />
                    Live Activity
                  </h4>
                  <span className="text-[10px] text-gray-600">Auto-refreshes</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {activityLogItems.slice(0, 10).map((activity) => {
                    const eventColors: Record<string, string> = {
                      task_created: "border-green-500/50 bg-green-500/5",
                      task_approved: "border-blue-500/50 bg-blue-500/5",
                      task_rejected: "border-red-500/50 bg-red-500/5",
                      message_sent: "border-purple-500/50 bg-purple-500/5",
                      agent_joined: "border-yellow-500/50 bg-yellow-500/5",
                    };
                    const colorClass = eventColors[activity.eventType] || "border-gray-500/30 bg-gray-500/5";
                    return (
                      <div key={activity.id} className={cn("p-2 rounded-lg border-l-2", colorClass)}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-white break-words">{activity.title}</span>
                          <span className="text-[10px] text-gray-500">
                            {format(new Date(activity.createdAt), "HH:mm")}
                          </span>
                        </div>
                        {activity.description && (
                          <div className="text-xs text-gray-400 line-clamp-2 break-words">{activity.description}</div>
                        )}
                        {activity.agent && (
                          <div className="text-[10px] text-gray-500 mt-1">by {activity.agent.name}</div>
                        )}
                      </div>
                    );
                  })}
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="p-2 rounded-lg bg-gray-800/50 border-l-2 border-blue-500/30">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-blue-300">{activity.fromAgent?.name}</span>
                        <span className="text-[10px] text-gray-500">
                          {format(new Date(activity.timestamp), "HH:mm")}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 line-clamp-3 break-words">{activity.content.slice(0, 140)}...</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Agents */}
            {activeAgents.length > 0 && (
              <div className="p-4 border-b border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {currentMeeting ? "In Meeting" : "In Conversation"} ({activeAgents.length})
                  </h4>
                  {!currentMeeting && (
                    <Button variant="ghost" size="sm" className="h-5 text-xs text-red-400 hover:text-red-300 px-1" onClick={removeAllAgents}>
                      Remove All
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {activeAgents.map((agent) => {
                    const dept = getDepartmentFromRole(agent.role || "");
                    const config = DEPARTMENT_CONFIG[dept];
                    const DeptIcon = config.icon;
                    const workstationSnapshot = workstationStatusByAgentId[Number(agent.id)];
                    const chipLabel = workstationSnapshot ? workstationChipLabel(workstationSnapshot.state) : "UNKNOWN";
                    const canOpenLive = Boolean(workstationSnapshot?.canOpenLive);
                    const chipTitle = workstationSnapshot?.detail || "Workstation status unavailable";
                    return (
                      <div key={agent.id} className="ops-row-interactive flex items-center gap-3 p-2 pr-2 rounded-lg bg-gray-800/50 group min-w-0 overflow-hidden">
                        <Avatar className="h-8 w-8 bg-gray-700">
                          <AvatarImage
                            src={getAgentAvatarUrl({ id: agent.id, name: agent.name, size: 64 })}
                            alt={agent.name || "Agent"}
                          />
                          <AvatarFallback className="text-xs text-white">{agent.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-white font-medium truncate">{agent.name}</span>
                            <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                          </div>
                          <div className="flex items-center gap-1">
                            <DeptIcon className={cn("h-3 w-3", config.color)} />
                            <span className="text-xs text-gray-500 truncate">{agent.role}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-1">
                            <button
                              type="button"
                              title={chipTitle}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!canOpenLive) return;
                                void openAgentWorkstationLive(agent);
                              }}
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                workstationSnapshot ? workstationChipClass(workstationSnapshot.state) : "border-slate-600 bg-slate-700/40 text-slate-200",
                                canOpenLive ? "cursor-pointer hover:brightness-110" : "cursor-default",
                              )}
                            >
                              {workstationBusyAgentId === agent.id ? "OPENING..." : `🖥 ${chipLabel}`}
                            </button>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeAgent(agent)} className="shrink-0 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 h-7 w-7 p-0">
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Available Agents */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Available ({availableAgents.length})
                </h4>
                {availableAgents.length > 0 && !currentMeeting && (
                  <Button variant="ghost" size="sm" className="h-5 text-xs text-blue-400 hover:text-blue-300 px-1" onClick={addAllAgents}>
                    Add All
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {availableAgents.map((agent) => {
                  const dept = getDepartmentFromRole(agent.role || "");
                  const config = DEPARTMENT_CONFIG[dept];
                  const DeptIcon = config.icon;
                  return (
                    <div 
                      key={agent.id}
                      className="ops-row-interactive flex items-center gap-3 p-2 pr-2 rounded-lg hover:bg-gray-800/50 cursor-pointer group transition-colors min-w-0 overflow-hidden"
                      onClick={() => addAgent(agent)}
                    >
                      <Avatar className="h-8 w-8 bg-gray-700">
                        <AvatarImage
                          src={getAgentAvatarUrl({ id: agent.id, name: agent.name, size: 64 })}
                          alt={agent.name || "Agent"}
                        />
                        <AvatarFallback className="text-xs text-white">{agent.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-300 font-medium truncate block">{agent.name}</span>
                        <div className="flex items-center gap-1">
                          <DeptIcon className={cn("h-3 w-3", config.color)} />
                          <span className="text-xs text-gray-500 truncate">{agent.role}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); addAgent(agent); }}
                        className="shrink-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border-blue-500/30 h-7 px-2 text-xs"
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  );
                })}
                {availableAgents.length === 0 && (
                  <div className="text-center py-6 text-gray-500 text-sm">
                    {agentSearch ? "No agents match search" : "All agents added"}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      )}

      <Sheet open={membersAuditOpen} onOpenChange={setMembersAuditOpen}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[90vw] bg-gray-950 border-gray-800 text-gray-100">
          <SheetHeader>
            <SheetTitle className="text-white">Members ({activeAgents.length})</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Current members</div>
              <div className="space-y-2">
                {activeAgents.length === 0 ? (
                  <div className="text-sm text-gray-500">No active members.</div>
                ) : (
                  activeAgents.map((agent) => (
                    <div key={`member-${agent.id}`} className="rounded-md border border-gray-800 bg-gray-900/60 p-2">
                      <div className="text-sm text-white">{agent.name}</div>
                      <div className="text-xs text-gray-400">{agent.role || "Agent"}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Membership audit</div>
              {membershipAuditQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full bg-gray-800" />
                  <Skeleton className="h-12 w-full bg-gray-800" />
                </div>
              ) : membershipAuditQuery.data?.events?.length ? (
                <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                  {membershipAuditQuery.data.events.map((event) => (
                    <div key={`event-${event.id}-${event.createdAt}`} className="rounded-md border border-gray-800 bg-gray-900/40 p-2">
                      <div className="text-xs text-gray-300">
                        {event.eventType} • {membershipReasonLabel(event.reasonCode)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {event.targetAgentName || `Agent #${event.targetAgentId || "?"}`} • Added by {event.actorName || "system"}
                      </div>
                      <div className="text-[11px] text-gray-500">{format(new Date(event.createdAt), "MMM d, HH:mm")}</div>
                      {event.reasonText ? <div className="text-xs text-gray-300 mt-1">{event.reasonText}</div> : null}
                      {event.relatedTaskId ? (
                        <button
                          type="button"
                          className="mt-1 text-[11px] text-blue-300 underline underline-offset-2"
                          onClick={() => {
                            setOpsView("tasks");
                            setMembersAuditOpen(false);
                          }}
                        >
                          Task #{event.relatedTaskId}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No membership events recorded yet.</div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

