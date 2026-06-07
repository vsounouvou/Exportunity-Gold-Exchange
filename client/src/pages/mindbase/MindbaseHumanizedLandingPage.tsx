import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Cloud,
  Command,
  Home,
  HelpCircle,
  LogIn,
  LogOut,
  Lock,
  Mail,
  Menu,
  Mic,
  Moon,
  Paperclip,
  Send,
  Sparkles,
  Sun,
  Upload,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";

import MindbaseLogo from "@/components/branding/MindbaseLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useSession, type User } from "@/lib/session";
import {
  integrationCards,
  operatingAgents,
  starterAgentById,
  type StarterAgent,
  type StarterAgentId,
} from "./starterAgents";
import { mindbasePath } from "./routing";

type ThemeMode = "dark" | "light";
type ChatRole = StarterAgentId | "user" | "system";
type AgentStatus =
  | "Waiting"
  | "Listening"
  | "Configuring"
  | "Ready"
  | "Working"
  | "Needs approval";
type OnboardingStep =
  | "name"
  | "company"
  | "business"
  | "customer"
  | "team"
  | "signup"
  | "connect"
  | "command"
  | "done";
type ActiveTab = "chat" | "team" | "brain" | "tasks" | "market";
type SignupMode =
  | "choices"
  | "email"
  | "password"
  | "signin-email"
  | "signin-password"
  | "recover";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  at?: string;
};

type SavedSession = {
  version: 1;
  theme: ThemeMode;
  messages: ChatMessage[];
  step: OnboardingStep;
  visitorName: string;
  companyName: string;
  business: string;
  customer: string;
  selectedAgentIds: StarterAgentId[];
  activeTab: ActiveTab;
  organizationDraft?: string;
  workspaceDraft?: string;
  connectedTools?: Record<string, string>;
  launchWorkspace?: LaunchWorkspaceRecord | null;
};

type LaunchWorkspaceRecord = {
  organizationId: string;
  organizationSlug: string;
  organizationStatus: string;
  workspaceId: string;
  workspaceStatus: string;
  commandRoute: string;
  installedAgents: Array<{
    id: string;
    agentId: string;
    name: string;
    status: string;
    requiredIntegrations: string[];
  }>;
};

const THEME_STORAGE_KEY = "mindbase_theme_mode";
const SESSION_STORAGE_KEY = "mindbase_onboarding_session_v1";
const INVALID_COMPANY_ANSWERS = new Set([
  "yes",
  "yeah",
  "yep",
  "sure",
  "ok",
  "okay",
  "y",
  "nope",
]);

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "welcome",
    role: "adjoa",
    text: "Hello. Welcome to MindBase.\n\nI'm Adjoa, your MindBase Guide. I'll help you assemble the AI team that will help run your company.\n\nWhat is your name?",
    at: "9:41 AM",
  },
];

const BUSINESS_SUGGESTIONS = [
  "Technology platform",
  "Trading company",
  "Construction company",
  "Consulting firm",
  "Marketplace",
  "Education",
  "I'll type my own",
];
const CUSTOMER_SUGGESTIONS = [
  "SMEs",
  "Enterprises",
  "Individuals",
  "Government",
  "NGOs",
  "I'll type my own",
];
const TEAM_SUGGESTIONS = [
  "Yes, prepare my team",
  "Show me what each agent does",
  "Start with only one agent",
  "I want to customize the team",
];
const WORKSPACE_SUGGESTIONS = [
  "Open workspace",
  "Connect Gmail",
  "Connect Google Drive",
  "Invite my team",
  "Add my first customer",
  "Keep setting up in chat",
];
const REASONING_TRIGGERS = [
  "which agents",
  "design my company",
  "company structure",
  "analyze",
  "strategy",
  "automation",
  "business model",
  "sales process",
  "marketing plan",
  "plan for my team",
];

const modeCopy: Record<ThemeMode, Record<string, string>> = {
  dark: {
    page: "bg-[#050B16] text-white",
    top: "border-white/10 bg-[#050B16]/94 text-white",
    panel:
      "border-white/10 bg-[#07111D]/90 shadow-[0_24px_80px_rgba(0,0,0,0.42)]",
    panelSoft: "border-white/10 bg-[#0A1627]/82",
    chat: "bg-[radial-gradient(circle_at_80%_8%,rgba(0,123,255,0.16),transparent_30%),linear-gradient(180deg,rgba(8,20,38,0.94),rgba(4,9,18,0.94))]",
    muted: "text-slate-400",
    border: "border-white/10",
    input: "border-white/10 bg-white/6 text-white placeholder:text-slate-500",
    userBubble:
      "border-[#1E7BFF]/70 bg-[#0B65FF] text-white shadow-[0_0_28px_rgba(30,123,255,0.24)]",
    agentBubble:
      "border-cyan-300/20 bg-[#101B2D]/90 text-slate-100 shadow-[0_0_28px_rgba(0,220,255,0.10)]",
    systemBubble: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
    chip: "border-white/10 bg-white/6 text-slate-200",
    navHover: "hover:bg-white/8",
  },
  light: {
    page: "bg-[#F6F8FB] text-[#07111D]",
    top: "border-slate-200 bg-white/94 text-[#07111D]",
    panel: "border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.10)]",
    panelSoft: "border-slate-200 bg-[#FBFCFF]",
    chat: "bg-[radial-gradient(circle_at_82%_12%,rgba(0,123,255,0.08),transparent_30%),linear-gradient(180deg,#FFFFFF,#FAFCFF)]",
    muted: "text-slate-500",
    border: "border-slate-200",
    input:
      "border-slate-200 bg-white text-[#07111D] placeholder:text-slate-400",
    userBubble:
      "border-[#0B65FF] bg-[#0B65FF] text-white shadow-[0_14px_28px_rgba(11,101,255,0.20)]",
    agentBubble:
      "border-slate-200 bg-white text-slate-950 shadow-[0_12px_34px_rgba(15,23,42,0.09)]",
    systemBubble: "border-emerald-200 bg-emerald-50 text-emerald-800",
    chip: "border-slate-200 bg-white text-slate-700",
    navHover: "hover:bg-slate-100",
  },
};

function resolveInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? "dark"
    : "light";
}

function loadSavedSession(): SavedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SESSION_STORAGE_KEY) || "null",
    ) as SavedSession | null;
    return parsed?.version === 1 && Array.isArray(parsed.messages)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function normalizeMindbaseUser(user: any): User {
  const roles = Array.isArray(user?.roles)
    ? user.roles.map((entry: unknown) => String(entry || ""))
    : [];
  const currentMode = roles.includes("admin")
    ? "admin"
    : String(roles[0] || "client");
  return {
    id: Number(user?.id || 0),
    email: String(user?.email || ""),
    displayName: String(
      user?.display_name || user?.displayName || user?.email || "MindBase User",
    ),
    roles: roles as User["roles"],
    permissions: [],
    currentMode: currentMode as User["currentMode"],
    buyerType: "retail",
    verificationLevel: "NONE",
    mustChangePassword: false,
  };
}

function cleanName(value: string) {
  return value
    .replace(/^my name is\s+/i, "")
    .replace(/^i am\s+/i, "")
    .replace(/^i'm\s+/i, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
}

function isInvalidCompanyName(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
  return !normalized || INVALID_COMPANY_ANSWERS.has(normalized);
}

function detectsStrategyRequest(value: string) {
  const text = value.toLowerCase();
  return REASONING_TRIGGERS.some((trigger) => text.includes(trigger));
}

function messageTime() {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function makeMessage(role: ChatRole, text: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    at: messageTime(),
  };
}

function statusClass(status: AgentStatus, theme: ThemeMode) {
  if (status === "Ready" || status === "Working")
    return theme === "dark"
      ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-200"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Listening" || status === "Configuring")
    return theme === "dark"
      ? "border-cyan-300/25 bg-cyan-400/12 text-cyan-200"
      : "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (status === "Needs approval")
    return theme === "dark"
      ? "border-rose-300/25 bg-rose-400/12 text-rose-200"
      : "border-rose-200 bg-rose-50 text-rose-700";
  return theme === "dark"
    ? "border-amber-300/25 bg-amber-400/12 text-amber-200"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

function agentForRole(role: ChatRole): StarterAgent | null {
  if (role === "user" || role === "system") return null;
  return starterAgentById[role];
}

function PortraitAvatar({
  agent,
  size = "md",
  active = false,
}: {
  agent: StarterAgent;
  size?: "sm" | "md" | "lg" | "xl";
  active?: boolean;
}) {
  const sizeClass =
    size === "xl"
      ? "h-28 w-28"
      : size === "lg"
        ? "h-20 w-20"
        : size === "sm"
          ? "h-10 w-10"
          : "h-12 w-12";
  return (
    <img
      src={agent.avatar}
      alt={`${agent.name} portrait`}
      className={`${sizeClass} shrink-0 rounded-full object-cover object-center shadow-[0_0_24px_rgba(0,180,255,0.20)] ${active ? "ring-2 ring-cyan-300/80 ring-offset-2 ring-offset-transparent" : ""}`}
      loading="eager"
    />
  );
}

function ProgressLine({ value, theme }: { value: number; theme: ThemeMode }) {
  return (
    <div
      className={`h-2 overflow-hidden rounded-full ${theme === "dark" ? "bg-white/10" : "bg-slate-200"}`}
    >
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,#23F6E7,#0B65FF)]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function currentSuggestions(step: OnboardingStep) {
  if (step === "business") return BUSINESS_SUGGESTIONS;
  if (step === "customer") return CUSTOMER_SUGGESTIONS;
  if (step === "team") return TEAM_SUGGESTIONS;
  if (step === "connect" || step === "command" || step === "done")
    return WORKSPACE_SUGGESTIONS;
  return [];
}

function stepDescription(step: OnboardingStep) {
  if (step === "company") return "naming your company";
  if (step === "business") return "defining your business type";
  if (step === "customer") return "identifying your main customer";
  if (step === "team") return "preparing your AI team";
  if (step === "signup") return "saving your workspace";
  if (step === "connect") return "connecting your tools";
  if (step === "command") return "opening your command center";
  return "getting started";
}

function teamWelcomeMessages(
  agentIds: StarterAgentId[],
  visitorName: string,
): ChatMessage[] {
  const name = visitorName || "there";
  const uniqueIds = Array.from(new Set(agentIds)).filter(
    (id) => id !== "adjoa",
  );
  const copy: Partial<Record<StarterAgentId, string>> = {
    awa: `Hi ${name}, I'm Awa, your Executive Assistant. I'll help protect your attention, follow up on messages, and keep meetings from becoming loose ends.`,
    kwame: `Kwame here. I turn what you want to build into tasks, owners, rhythms, and blockers so the company keeps moving.`,
    aminata:
      "I'm Aminata. I'll help shape your offer, campaigns, content ideas, and the way customers understand your company.",
    idriss:
      "Idriss here. I'll help turn conversations into leads, offers, reminders, and a sales pipeline you can actually follow.",
    nene:
      "I'm Nene. I'll watch the money side: invoices, expenses, revenue, cashflow, and the reminders that keep finance clean.",
  };
  return uniqueIds
    .map((id) => makeMessage(id, copy[id] || starterAgentById[id].firstMessage))
    .filter(Boolean);
}

export default function MindbaseHumanizedLandingPage() {
  const { isAuthenticated, login, logout, user } = useSession();
  const restoredSession = useMemo(loadSavedSession, []);
  const restoredMessages = restoredSession?.messages?.length
    ? restoredSession.messages
    : INITIAL_MESSAGES;
  const shouldWelcomeBack = Boolean(
    restoredSession?.messages?.length &&
    !restoredSession.messages.some((message) =>
      message.id.startsWith("welcome-back"),
    ),
  );
  const [theme, setTheme] = useState<ThemeMode>(
    restoredSession?.theme || resolveInitialTheme,
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    shouldWelcomeBack
      ? [
          {
            id: `welcome-back-${restoredSession?.step || "draft"}`,
            role: "system",
            text: `Welcome back, ${restoredSession?.visitorName || "there"}. Your workspace draft is saved. We were ${stepDescription(restoredSession?.step || "name")}.`,
            at: messageTime(),
          },
          ...restoredMessages,
        ]
      : restoredMessages,
  );
  const [step, setStep] = useState<OnboardingStep>(
    restoredSession?.step || "name",
  );
  const [input, setInput] = useState("");
  const [visitorName, setVisitorName] = useState(
    restoredSession?.visitorName || "",
  );
  const [companyName, setCompanyName] = useState(
    restoredSession?.companyName || "",
  );
  const [organizationDraft, setOrganizationDraft] = useState(
    restoredSession?.organizationDraft || "",
  );
  const [workspaceDraft, setWorkspaceDraft] = useState(
    restoredSession?.workspaceDraft || "",
  );
  const [connectedTools, setConnectedTools] = useState<Record<string, string>>(
    restoredSession?.connectedTools || {},
  );
  const [launchWorkspace, setLaunchWorkspace] =
    useState<LaunchWorkspaceRecord | null>(
      restoredSession?.launchWorkspace || null,
    );
  const [business, setBusiness] = useState(restoredSession?.business || "");
  const [customer, setCustomer] = useState(restoredSession?.customer || "");
  const [selectedAgentIds, setSelectedAgentIds] = useState<StarterAgentId[]>(
    restoredSession?.selectedAgentIds?.length
      ? restoredSession.selectedAgentIds
      : ["awa", "kwame", "aminata", "idriss", "nene"],
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    restoredSession?.activeTab || "chat",
  );
  const [signupMode, setSignupMode] = useState<SignupMode>("choices");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountNotice, setAccountNotice] = useState("");
  const [reasoningModeReady, setReasoningModeReady] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<StarterAgent | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const t = modeCopy[theme];

  useEffect(() => {
    if (typeof window !== "undefined")
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        theme,
        messages,
        step,
        visitorName,
        companyName,
        business,
        customer,
        selectedAgentIds,
        activeTab,
        organizationDraft,
        workspaceDraft,
        connectedTools,
        launchWorkspace,
      }),
    );
  }, [
    activeTab,
    business,
    companyName,
    connectedTools,
    customer,
    launchWorkspace,
    messages,
    organizationDraft,
    selectedAgentIds,
    step,
    theme,
    visitorName,
    workspaceDraft,
  ]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (typeof window === "undefined" || organizationDraft) return;
    const params = new URLSearchParams(window.location.search);
    const organization = params.get("organization");
    if (!organization) return;
    const workspaceName = `${organization} HQ`;
    setCompanyName(organization);
    setOrganizationDraft(organization);
    setWorkspaceDraft(workspaceName);
    setStep(params.get("next") === "tools" ? "connect" : "command");
    setMessages((current) => [
      ...current,
      makeMessage(
        "system",
        `Organization created: ${organization}\nStatus: Draft\nNext: Open workspace in chat`,
      ),
      makeMessage(
        "system",
        `Workspace created: ${workspaceName}\nStatus: Draft\nAI team: Preparing`,
      ),
      makeMessage(
        "adjoa",
        "You are back inside the chat-first setup. We can open the workspace, add the AI team, or connect tools here.",
      ),
    ]);
  }, [organizationDraft]);

  const applySavedLaunchWorkspace = (payload: any) => {
    const organization = payload?.organization || {};
    const workspace = payload?.workspace || {};
    const record: LaunchWorkspaceRecord = {
      organizationId: String(organization.id || ""),
      organizationSlug: String(organization.slug || ""),
      organizationStatus: String(organization.status || "draft"),
      workspaceId: String(workspace.id || ""),
      workspaceStatus: String(workspace.status || "draft"),
      commandRoute: String(payload?.commandRoute || ""),
      installedAgents: Array.isArray(payload?.agents)
        ? payload.agents.map((agent: any) => ({
            id: String(agent?.id || ""),
            agentId: String(agent?.agentId || ""),
            name: String(agent?.name || ""),
            status: String(agent?.status || "draft"),
            requiredIntegrations: Array.isArray(agent?.requiredIntegrations)
              ? agent.requiredIntegrations.map((item: unknown) =>
                  String(item || ""),
                )
              : [],
          }))
        : [],
    };
    setLaunchWorkspace(record);
    if (organization.name) setOrganizationDraft(String(organization.name));
    if (workspace.name) setWorkspaceDraft(String(workspace.name));
    return record;
  };

  const saveLaunchWorkspace = async (
    accessToken?: string,
    override?: { companyName?: string; workspaceName?: string },
  ) =>
    apiRequest("/api/mindbase/onboarding/workspace", {
      method: "POST",
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : undefined,
      body: JSON.stringify({
        companyName:
          override?.companyName || companyName || organizationDraft || "Draft Company",
        workspaceName:
          override?.workspaceName ||
          workspaceDraft ||
          `${override?.companyName || companyName || "Draft Company"} HQ`,
        selectedAgentIds,
      }),
    });

  const finishAuthenticatedWorkspace = async (
    accessToken: string,
    openingMessage: string,
  ) => {
    const saved = await saveLaunchWorkspace(accessToken);
    const record = applySavedLaunchWorkspace(saved);
    setStep("connect");
    setMessages((current) => [
      ...current,
      makeMessage(
        "system",
        `Workspace saved: ${saved?.workspace?.name || workspaceDraft || `${companyName || "Your company"} HQ`}\nStatus: ${record.workspaceStatus}\nAI team: ${record.installedAgents.length} installed\nWorkspace ID: ${record.workspaceId}`,
      ),
      makeMessage("adjoa", openingMessage),
      ...teamWelcomeMessages(selectedAgentIds, visitorName),
    ]);
  };

  const registerMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/mindbase/auth/register", {
        method: "POST",
        body: JSON.stringify({
          display_name: visitorName || email.split("@")[0] || "MindBase User",
          email,
          password,
        }),
      }),
    onSuccess: async (payload: any) => {
      const accessToken = String(payload?.access_token || "");
      login(
        accessToken,
        normalizeMindbaseUser(payload?.user),
      );
      setAccountNotice(
        "Your account has been created. I sent you a verification email. You can continue setting up your workspace while we wait for verification.",
      );
      try {
        await finishAuthenticatedWorkspace(
          accessToken,
          "Your workspace is ready. The team is here with you now. You can enter your company command center, keep setting up in chat, or connect the tools your agents need.",
        );
      } catch (error: any) {
        setStep("signup");
        const message = String(
          error?.message || "The account was created, but the workspace could not be saved yet.",
        );
        setAccountNotice(message);
        setMessages((current) => [
          ...current,
          makeMessage(
            "adjoa",
            `${message}\n\nI did not mark the workspace as saved. Your draft is still in this chat, and you can try saving again.`,
          ),
        ]);
      }
    },
    onError: (error: any) => {
      const message = String(error?.message || "Unable to create your account");
      setAccountNotice(message);
      if (/already exists/i.test(message)) {
        setSignupMode("signin-password");
        setPassword("");
        setMessages((current) => [
          ...current,
          makeMessage(
            "adjoa",
            "That email already has a MindBase account. Type the password here and I will bring you back into your workspace. If you forgot which email or password you used, choose the recovery option below.",
          ),
        ]);
      }
    },
  });

  const loginMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/mindbase/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
      }),
    onSuccess: async (payload: any) => {
      const accessToken = String(payload?.access_token || "");
      login(accessToken, normalizeMindbaseUser(payload?.user));
      setAccountNotice("Signed in. Your draft workspace is being saved.");
      try {
        await finishAuthenticatedWorkspace(
          accessToken,
          `Welcome back${visitorName ? `, ${visitorName}` : ""}. I saved the draft workspace to this account, and your AI team can keep working from here.`,
        );
      } catch (error: any) {
        setStep("signup");
        const message = String(
          error?.message || "You are signed in, but the workspace could not be saved yet.",
        );
        setAccountNotice(message);
        setMessages((current) => [
          ...current,
          makeMessage(
            "adjoa",
            `${message}\n\nYou are signed in, and this chat still has the draft. Try saving again after checking the workspace details.`,
          ),
        ]);
      }
    },
    onError: (error: any) => {
      const message = String(error?.message || "Unable to sign in");
      setAccountNotice(message);
      setMessages((current) => [
        ...current,
        makeMessage(
          "adjoa",
          "I could not sign you in with those details. Try the password again, use the recovery option, or create a new account with another email.",
        ),
      ]);
    },
  });

  const workspace = useMemo(() => {
    const brainProgress =
      step === "done" ||
      step === "command" ||
      step === "connect" ||
      step === "signup"
        ? 18
        : step === "team"
          ? 14
          : customer
            ? 12
            : business
              ? 9
              : companyName
                ? 6
                : visitorName
                  ? 4
                  : 0;
    const personaProgress =
      step === "done" ||
      step === "command" ||
      step === "connect" ||
      step === "signup"
        ? 10
        : business
          ? 7
          : visitorName
            ? 4
            : 0;
    return {
      founder: visitorName || "Waiting",
      companyName: companyName || "Waiting",
      scope: business || "Waiting",
      customer: customer || "Waiting",
      teamSize: selectedAgentIds.length,
      brainProgress,
      personaProgress,
    };
  }, [
    business,
    companyName,
    customer,
    selectedAgentIds.length,
    step,
    visitorName,
  ]);

  const agents = useMemo(() => {
    return operatingAgents.map((agent) => {
      const finalStep =
        step === "signup" ||
        step === "connect" ||
        step === "command" ||
        step === "done";
      const active =
        agent.id === "awa" || agent.id === "nene"
          ? finalStep
          : agent.id === "kwame" || agent.id === "aminata"
            ? Boolean(business || customer || step === "team" || finalStep)
            : Boolean(customer || step === "team" || finalStep);
      const status: AgentStatus = active
        ? finalStep
          ? "Ready"
          : agent.id === "idriss"
            ? "Listening"
            : "Configuring"
        : "Waiting";
      return { ...agent, active, status };
    });
  }, [business, customer, step]);

  const authenticatedCommandRoute = launchWorkspace?.commandRoute
    ? mindbasePath(launchWorkspace.commandRoute)
    : mindbasePath("/workspaces");

  const pushConversation = (userText: string, replies: ChatMessage[]) =>
    setMessages((current) => [
      ...current,
      makeMessage("user", userText),
      ...replies,
    ]);

  const openWorkspaceInChat = (sourceText = "Open workspace") => {
    setStep("command");
    setActiveTab("chat");
    pushConversation(sourceText, [
      makeMessage(
        "system",
        `Command Center opened: ${workspaceDraft || `${companyName || "Your company"} HQ`}\nOrganization: ${organizationDraft || companyName || "Draft organization"}\nWorkspace ID: ${launchWorkspace?.workspaceId || "Draft local workspace"}\nInstalled agents: ${launchWorkspace?.installedAgents.length || selectedAgentIds.length}\nBackend route: ${authenticatedCommandRoute || "Draft chat command center"}\nNext action: Connect tools or invite your team.`,
      ),
      makeMessage(
        "adjoa",
        "You are inside your company command center now. We can keep setting it up here without leaving the chat.",
      ),
    ]);
  };

  const openAccountPanel = (
    mode: "create" | "signin" | "recover",
    sourceText?: string,
  ) => {
    setStep("signup");
    setActiveTab("chat");
    setAccountNotice("");
    setPassword("");
    const modeCopyText = {
      create:
        "Let's save this workspace before the team starts doing serious work. What email should I use for your MindBase account?",
      signin:
        "Good. Sign in right here and I will attach this workspace draft to your account.",
      recover:
        "No problem. Give me the email you might have used, or choose that you forgot the email. I will keep this workspace draft in the chat while we sort it out.",
    };
    const modeLabel = {
      create: "Create account",
      signin: "Sign in",
      recover: "I need help signing in",
    };
    setSignupMode(
      mode === "create"
        ? "email"
        : mode === "signin"
          ? "signin-email"
          : "recover",
    );
    pushConversation(sourceText || modeLabel[mode], [
      makeMessage("adjoa", modeCopyText[mode]),
    ]);
  };

  const handleLogout = () => {
    logout();
    setAccountNotice("Signed out.");
    setMessages((current) => [
      ...current,
      makeMessage("user", "Log out"),
      makeMessage("system", "Signed out of MindBase."),
      makeMessage(
        "adjoa",
        "You are signed out. The chat draft is still here, but you will need to sign in again before the workspace can be saved.",
      ),
    ]);
  };

  const handleIntegrationChoice = (title: string, sourceText = title) => {
    const normalizedTitle = title.toLowerCase();
    const card = integrationCards.find(
      (item) =>
        item.title === title ||
        item.action === title ||
        normalizedTitle.includes(
          item.title.toLowerCase().replace("connect ", ""),
        ),
    );
    if (!card) return false;
    if (card.fallback) {
      setConnectedTools((current) => ({
        ...current,
        [card.id]: "Unavailable",
      }));
      pushConversation(sourceText, [
        makeMessage(
          "system",
          `${card.title}\nStatus: Not connected\nWhat it enables: ${card.copy}\nSecurity: ${card.security}`,
        ),
        makeMessage(
          "adjoa",
          `${card.fallback}\n\nYou can continue setup without it, and MindBase will keep the workspace draft intact.`,
        ),
      ]);
      return true;
    }
    setConnectedTools((current) => ({ ...current, [card.id]: "Ready" }));
    pushConversation(sourceText, [
      makeMessage(
        "system",
        `${card.title}\nStatus: Ready to configure\nWhat it enables: ${card.copy}\nSecurity: ${card.security}`,
      ),
      makeMessage(
        "adjoa",
        "Good. I kept this step inside your setup. What do you want to do next?",
      ),
    ]);
    return true;
  };

  const addAgentToChat = (agent: StarterAgent) => {
    setSelectedAgentIds((current) =>
      current.includes(agent.id) ? current : [...current, agent.id],
    );
    setMessages((current) => [
      ...current,
      makeMessage("system", `${agent.name} has joined your AI team.`),
      makeMessage(agent.id, agent.firstMessage),
    ]);
    setSelectedAgent(null);
  };

  const configureAgent = (agent: StarterAgent) => {
    setMessages((current) => [
      ...current,
      makeMessage(
        "system",
        `Configure ${agent.name}\nRole: ${agent.role}\nStatus: Draft\nNeeds: ${agent.needs.join(", ")}`,
      ),
      makeMessage(
        "adjoa",
        `${agent.name} is ready to configure in chat. Connect the required tools or tell me what task you want this agent to handle first.`,
      ),
    ]);
    setSelectedAgent(null);
  };

  const assignTaskToAgent = (agent: StarterAgent) => {
    setMessages((current) => [
      ...current,
      makeMessage(
        "system",
        `Task draft opened for ${agent.name}\nStatus: Needs instructions\nExternal actions: Approval required`,
      ),
      makeMessage(
        agent.id,
        "Tell me the outcome you want, the deadline, and any tools or documents I should use.",
      ),
    ]);
    setSelectedAgent(null);
  };

  const hireAgent = (agent: StarterAgent) => {
    setSelectedAgentIds((current) =>
      current.includes(agent.id) ? current : [...current, agent.id],
    );
    setMessages((current) => [
      ...current,
      makeMessage(
        "system",
        `${agent.name} installed in draft mode.\nPlan requirement: Free starter team\nPayment: Not required for this starter agent`,
      ),
      makeMessage(
        "adjoa",
        `${agent.name} is now part of the draft AI team. Save the workspace to persist this installation to your MindBase account.`,
      ),
    ]);
    setSelectedAgent(null);
  };

  const connectAgentRequiredTools = (agent: StarterAgent) => {
    setSelectedAgent(null);
    const required = agent.needs.join(" ").toLowerCase();
    if (required.includes("gmail") || required.includes("outlook"))
      return handleIntegrationChoice(
        "Connect Gmail",
        `Connect tools for ${agent.name}`,
      );
    if (required.includes("calendar"))
      return handleIntegrationChoice(
        "Connect Calendar",
        `Connect tools for ${agent.name}`,
      );
    if (required.includes("customer") || required.includes("pipeline"))
      return handleIntegrationChoice(
        "Add customers",
        `Connect tools for ${agent.name}`,
      );
    return handleIntegrationChoice(
      "Upload documents",
      `Connect tools for ${agent.name}`,
    );
  };

  const handleUserAnswer = (rawValue?: string) => {
    const value = String(rawValue ?? input).trim();
    if (!value) return;
    setInput("");
    const strategyRequest = detectsStrategyRequest(value);
    if (strategyRequest) setReasoningModeReady(true);
    if (value === "I'll type my own") return;
    if (/forgot|recover|reset password|lost access|can't sign in|cannot sign in/i.test(value)) {
      openAccountPanel("recover", value);
      return;
    }
    if (/^sign in$|^login$|^log in$|already have an account/i.test(value)) {
      openAccountPanel("signin", value);
      return;
    }
    if (/^create account$|^sign up$|^signup$/i.test(value)) {
      openAccountPanel("create", value);
      return;
    }
    if (
      /^open workspace$/i.test(value) ||
      /^open command center$/i.test(value)
    ) {
      openWorkspaceInChat(value);
      return;
    }
    if (
      /connect gmail|connect google drive|connect drive|connect calendar|connect whatsapp|invite my team|invite your team|upload documents|add my first customer|add customers/i.test(
        value,
      )
    ) {
      if (handleIntegrationChoice(value, value)) return;
    }
    if (/keep setting up in chat/i.test(value)) {
      pushConversation(value, [
        makeMessage(
          "adjoa",
          "Good. We will keep everything here. Choose a tool to connect, invite your team, or open the workspace when you are ready.",
        ),
      ]);
      return;
    }
    if (step === "name") {
      const name = cleanName(value) || "there";
      setVisitorName(name);
      setStep("company");
      pushConversation(value, [
        makeMessage(
          "system",
          `Profile created: ${name}. Founder workspace preparing.`,
        ),
        makeMessage(
          "adjoa",
          `Nice to meet you, ${name}.\n\nWhat is the name of your company?\nIf you do not have one yet, type "not yet".`,
        ),
      ]);
      return;
    }
    if (step === "company") {
      if (isInvalidCompanyName(value)) {
        pushConversation(value, [
          makeMessage(
            "adjoa",
            `I need the company name, not a yes/no answer. Type the company name, or type "not yet" if you do not have one.`,
          ),
        ]);
        return;
      }
      const normalizedCompany =
        value.toLowerCase() === "not yet" ? "Not yet" : value;
      const workspaceName =
        normalizedCompany === "Not yet"
          ? "Draft Company HQ"
          : `${normalizedCompany} HQ`;
      setCompanyName(normalizedCompany);
      setOrganizationDraft(normalizedCompany);
      setWorkspaceDraft(workspaceName);
      setStep("business");
      if (isAuthenticated) {
        pushConversation(value, [
          makeMessage(
            "adjoa",
            `Great. I'm creating a draft organization for ${normalizedCompany}.`,
          ),
        ]);
        saveLaunchWorkspace(undefined, {
          companyName: normalizedCompany,
          workspaceName,
        })
          .then((payload) => {
            const record = applySavedLaunchWorkspace(payload);
            setMessages((current) => [
              ...current,
              makeMessage(
                "system",
                `Organization created: ${payload?.organization?.name || normalizedCompany}\nStatus: ${record.organizationStatus}\nOrganization ID: ${record.organizationId}\nNext: Create workspace`,
              ),
              makeMessage(
                "adjoa",
                "Now I'll prepare your first workspace so your AI team has a place to work.",
              ),
              makeMessage(
                "system",
                `Workspace created: ${payload?.workspace?.name || workspaceName}\nStatus: ${record.workspaceStatus}\nWorkspace ID: ${record.workspaceId}\nAI team: Preparing`,
              ),
              makeMessage(
                "adjoa",
                `What kind of company is ${normalizedCompany}?`,
              ),
            ]);
          })
          .catch((error: any) => {
            setMessages((current) => [
              ...current,
              makeMessage(
                "adjoa",
                `I could not create the backend workspace yet: ${String(error?.message || "Unknown error")}\n\nI kept a local draft in this chat and did not mark it as saved.`,
              ),
            ]);
          });
        return;
      }
      pushConversation(value, [
        makeMessage(
          "adjoa",
          `Great. I'm creating a draft organization for ${normalizedCompany}.`,
        ),
        makeMessage(
          "system",
          `Organization created: ${normalizedCompany}\nStatus: Draft\nNext: Create workspace`,
        ),
        makeMessage(
          "adjoa",
          "Now I'll prepare your first workspace so your AI team has a place to work.",
        ),
        makeMessage(
          "system",
          `Workspace created: ${workspaceName}\nStatus: Draft\nAI team: Preparing\n\nActions: Continue setup - Rename workspace - Add AI team`,
        ),
        makeMessage("adjoa", `What kind of company is ${normalizedCompany}?`),
      ]);
      return;
    }
    if (step === "business") {
      setBusiness(value);
      setStep("customer");
      pushConversation(value, [
        makeMessage(
          "adjoa",
          "Good. I'm bringing in Kwame, your Operations Manager.",
        ),
        makeMessage("system", "Kwame has joined your AI team."),
        makeMessage("kwame", starterAgentById.kwame.firstMessage),
        makeMessage(
          "adjoa",
          "I'm also bringing in Aminata, your Marketing Agent.",
        ),
        makeMessage("system", "Aminata has joined your AI team."),
        makeMessage("aminata", starterAgentById.aminata.firstMessage),
        makeMessage("adjoa", "Who is your main customer?"),
      ]);
      return;
    }
    if (step === "customer") {
      setCustomer(value);
      setStep("team");
      pushConversation(value, [
        makeMessage("system", "Idriss has joined your AI team."),
        makeMessage("idriss", starterAgentById.idriss.firstMessage),
        makeMessage(
          "adjoa",
          "Perfect. Based on that, I recommend starting with this AI team:\nAwa for executive follow-up,\nKwame for operations,\nAminata for marketing,\nIdriss for sales,\nand Nene for finance.\n\nDo you want me to prepare this team?",
        ),
      ]);
      return;
    }
    if (step === "team") {
      const nextAgentIds: StarterAgentId[] = /only one/i.test(value)
        ? ["awa"]
        : ["awa", "kwame", "aminata", "idriss", "nene"];
      setSelectedAgentIds(nextAgentIds);
      if (/show me/i.test(value)) setSelectedAgent(starterAgentById.awa);
      setStep("signup");
      const joinedNames = nextAgentIds
        .map((id) => starterAgentById[id].name)
        .join(", ");
      pushConversation(value, [
        makeMessage("system", `${joinedNames} joined your AI team.`),
        ...teamWelcomeMessages(nextAgentIds, visitorName),
        makeMessage(
          "adjoa",
          "Your AI team is ready in draft mode.\n\nTo start working properly, your agents need access to the tools your company already uses.\n\nI've prepared your first MindBase workspace. To save it, choose how you want to continue.",
        ),
      ]);
      return;
    }
    pushConversation(value, [
      strategyRequest
        ? makeMessage(
            "adjoa",
            "I can help with that in Deep strategy mode after your workspace is saved. For now I am keeping setup fast.",
          )
        : makeMessage(
            "adjoa",
            "I have that. The next step is saving your workspace so your agents can keep working.",
          ),
    ]);
  };

  const chooseSignup = (
    choice:
      | "google"
      | "microsoft"
      | "email"
      | "signin"
      | "recover"
      | "later",
  ) => {
    if (choice === "email") {
      openAccountPanel("create", "Create with email");
      return;
    }
    if (choice === "signin") {
      openAccountPanel("signin", "Sign in");
      return;
    }
    if (choice === "recover") {
      openAccountPanel("recover", "I need help signing in");
      return;
    }
    if (choice === "later") {
      setStep("connect");
      setMessages((current) => [
        ...current,
        makeMessage("user", "Continue without saving for now"),
        makeMessage(
          "adjoa",
          "No problem. Your draft workspace stays visible here. What do you want to do next?",
        ),
      ]);
      return;
    }
    setMessages((current) => [
      ...current,
      makeMessage(
        "user",
        choice === "google"
          ? "Continue with Google"
          : "Continue with Microsoft",
      ),
      makeMessage(
        "adjoa",
        `${choice === "google" ? "Google" : "Microsoft"} sign-in is not enabled yet in this environment.\n\nUse email signup here now, or continue without saving. Your workspace draft will stay inside this chat.`,
      ),
    ]);
  };

  const submitEmail = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      setAccountNotice("Enter a valid email address.");
      return;
    }
    setEmail(normalizedEmail);
    if (signupMode === "signin-email") {
      setSignupMode("signin-password");
      setAccountNotice("");
      setMessages((current) => [
        ...current,
        makeMessage("user", normalizedEmail),
        makeMessage(
          "adjoa",
          "Welcome back. Type your password here and I will save this workspace to your account.",
        ),
      ]);
      return;
    }
    if (signupMode === "recover") {
      setAccountNotice(
        "If this email exists, use the password you remember or ask support for account recovery. Your workspace draft stays in this chat.",
      );
      setMessages((current) => [
        ...current,
        makeMessage("user", `Recover account for ${normalizedEmail}`),
        makeMessage(
          "adjoa",
          "I will keep the workspace draft here. Try signing in with this email if you remember the password, or create a new account with another email and we will save the draft there.",
        ),
      ]);
      setSignupMode("signin-password");
      return;
    }
    setSignupMode("password");
    setAccountNotice("");
    setMessages((current) => [
      ...current,
      makeMessage("user", normalizedEmail),
      makeMessage(
        "adjoa",
        "Great. Choose a password for your MindBase account.",
      ),
    ]);
  };

  const submitPassword = () => {
    if (password.length < 8) {
      setAccountNotice("Password must be at least 8 characters.");
      return;
    }
    setAccountNotice("");
    if (signupMode === "signin-password") {
      loginMutation.mutate();
      return;
    }
    registerMutation.mutate();
  };

  const submitRecovery = (forgotEmail = false) => {
    setAccountNotice("");
    if (forgotEmail || !email.trim()) {
      setMessages((current) => [
        ...current,
        makeMessage("user", "I forgot my email"),
        makeMessage(
          "adjoa",
          "That is okay. Tell me your name and company in the chat, or create a new account with an email you can access. I will keep the current workspace draft visible until you save it.",
        ),
      ]);
      setSignupMode("choices");
      return;
    }
    submitEmail();
  };

  const suggestions = currentSuggestions(step);
  const actionIcons = [
    Mail,
    CalendarDays,
    Cloud,
    Command,
    UserPlus,
    Upload,
    BriefcaseBusiness,
  ];

  return (
    <div
      className={`h-screen overflow-hidden ${t.page}`}
      style={{
        fontFamily:
          "Inter, Roboto, system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <header
        className={`sticky top-0 z-40 h-[68px] border-b px-4 py-3 backdrop-blur-xl md:px-8 ${t.top}`}
      >
        <div className="mx-auto flex h-full max-w-[1500px] items-center justify-between gap-4">
          <Link href={mindbasePath("/")}>
            <a aria-label="MindBase home">
              <MindbaseLogo tone={theme === "dark" ? "dark" : "light"} />
            </a>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {[
              ["Marketplace", "/discover"],
              ["Build", "/build/chat"],
              ["Workspaces", "/workspaces"],
              ["Pricing", "/pricing"],
              ["Docs/API", "/docs/api"],
            ].map(([label, href]) => (
              <Link key={href} href={mindbasePath(href)}>
                <a
                  className={`rounded-full px-4 py-2 text-sm font-medium ${t.muted} ${t.navHover}`}
                >
                  {label}
                </a>
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${t.chip}`}
              onClick={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
              }
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            {isAuthenticated ? (
              <>
                <span
                  className={`hidden max-w-[220px] truncate rounded-full border px-3 py-2 text-xs font-semibold md:inline-flex ${t.chip}`}
                  title={user?.email || "Signed in"}
                >
                  {user?.email || "Signed in"}
                </span>
                <button
                  type="button"
                  className={`hidden items-center gap-2 rounded-[12px] border px-4 py-2 text-sm font-semibold md:inline-flex ${t.chip}`}
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`hidden items-center gap-2 rounded-[12px] border px-4 py-2 text-sm font-semibold md:inline-flex ${t.chip}`}
                  onClick={() => openAccountPanel("signin")}
                >
                  <LogIn className="h-4 w-4" />
                  Sign in
                </button>
                <button
                  type="button"
                  className="hidden items-center gap-2 rounded-[12px] bg-[linear-gradient(135deg,#075DFF,#18A8FF)] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_22px_rgba(11,101,255,0.35)] md:inline-flex"
                  onClick={() => openAccountPanel("create")}
                >
                  <UserPlus className="h-4 w-4" />
                  Create account
                </button>
              </>
            )}
            <button
              type="button"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border lg:hidden ${t.chip}`}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid h-[calc(100vh-68px)] max-w-[1500px] grid-cols-1 gap-3 overflow-hidden px-3 pb-20 pt-3 md:grid-cols-[minmax(0,1fr)_330px] md:px-5 md:pb-3 lg:grid-cols-[190px_minmax(0,1.35fr)_350px] xl:grid-cols-[205px_minmax(0,1.45fr)_365px] xl:px-6">
        <aside
          className={`hidden min-h-0 overflow-hidden rounded-[20px] border p-3 lg:block ${t.panel}`}
        >
          <div className="flex flex-col items-center border-b border-current/10 pb-4 text-center">
            <PortraitAvatar agent={starterAgentById.adjoa} size="lg" active />
            <h2 className="mt-2 text-xl font-semibold">Adjoa</h2>
            <p className="text-sm font-medium text-cyan-500">MindBase Guide</p>
            <div
              className={`mt-3 rounded-full border px-3 py-1 text-xs ${t.chip}`}
            >
              Your AI operations guide
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {[
              [Brain, "Start your company brain", "Build your foundation"],
              [Users, "Install your AI team", "Assemble operating agents"],
              [Command, "Train your persona", "Shape how you operate"],
              [BriefcaseBusiness, "Explore Marketplace", "Hire capability"],
            ].map(([Icon, title, copy]) => {
              const JourneyIcon = Icon as typeof Brain;
              return (
                <div
                  key={String(title)}
                  className={`flex items-center gap-3 rounded-[14px] border p-2.5 ${t.panelSoft}`}
                >
                  <JourneyIcon className="h-5 w-5 text-cyan-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{String(title)}</p>
                    <p className={`text-xs ${t.muted}`}>{String(copy)}</p>
                  </div>
                  <ChevronRight className={`h-4 w-4 ${t.muted}`} />
                </div>
              );
            })}
          </div>
        </aside>

        <section
          className={`min-h-0 overflow-hidden rounded-[22px] border ${t.panel}`}
        >
          <div className={`relative flex h-full min-h-0 flex-col ${t.chat}`}>
            <div className="relative shrink-0 border-b border-current/10 px-4 py-3 md:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p
                    className={`text-xs font-semibold uppercase ${t.muted}`}
                  >
                    Welcome to MindBase
                  </p>
                  <h1 className="mt-1 max-w-2xl text-xl font-semibold leading-tight md:text-2xl xl:text-[28px]">
                    Build the AI team that helps run your company.
                  </h1>
                  <p
                    className={`mt-1 max-w-xl text-xs leading-5 md:text-sm ${t.muted}`}
                  >
                    Create your company brain. Hire AI agents. Connect your
                    tools. Start operating.
                  </p>
                </div>
                <div
                  className={`inline-flex rounded-full border p-1 text-xs ${t.chip}`}
                >
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 font-semibold ${!reasoningModeReady ? "bg-[#0B65FF] text-white" : ""}`}
                    onClick={() => setReasoningModeReady(false)}
                  >
                    <Zap className="mr-1 inline h-3 w-3" />
                    Fast setup
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 font-semibold ${reasoningModeReady ? "bg-[#0B65FF] text-white" : ""}`}
                    onClick={() => setReasoningModeReady(true)}
                  >
                    Deep strategy
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
                <span className={`shrink-0 text-xs font-semibold ${t.muted}`}>
                  Talk with
                </span>
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => addAgentToChat(agent)}
                    className={`flex min-w-[132px] items-center gap-2 rounded-full border px-2 py-1.5 text-left ${agent.active ? t.panelSoft : t.chip}`}
                  >
                    <PortraitAvatar
                      agent={agent}
                      size="sm"
                      active={agent.active}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">
                        {agent.name}
                      </span>
                      <span className={`block truncate text-[11px] ${t.muted}`}>
                        {agent.role}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-6">
              {messages.map((message) => {
                const isUser = message.role === "user";
                const isSystem = message.role === "system";
                const agent = agentForRole(message.role);
                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {agent ? (
                      <PortraitAvatar
                        agent={agent}
                        active={message.role === "adjoa"}
                      />
                    ) : null}
                    <div
                      className={`max-w-[88%] whitespace-pre-line rounded-[20px] border px-4 py-3 text-sm leading-6 md:max-w-[720px] ${isUser ? t.userBubble : isSystem ? t.systemBubble : t.agentBubble}`}
                    >
                      {!isUser ? (
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-cyan-500">
                            {agent?.name || "MindBase"}
                          </span>
                          <span className={t.muted}>
                            {agent?.role || "Company Brain"}
                          </span>
                          <span className={t.muted}>{message.at}</span>
                        </div>
                      ) : null}
                      {message.text}
                      {isUser ? (
                        <div className="mt-1 text-right text-[10px] text-white/70">
                          {message.at} seen
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${t.chip}`}
              >
                <span className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#0B65FF]" />
                  <span className="h-2 w-2 rounded-full bg-[#23F6E7]" />
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                </span>
                Adjoa is listening...
              </div>
              <div ref={messageEndRef} />
            </div>

            <div
              className={`relative shrink-0 border-t border-current/10 p-3 backdrop-blur-xl md:p-4 ${t.top}`}
            >
              {suggestions.length ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {suggestions.map((choice) => (
                    <Button
                      key={choice}
                      type="button"
                      variant="outline"
                      className={`h-9 rounded-[14px] px-3 text-xs md:h-10 md:text-sm ${t.chip}`}
                      onClick={() => handleUserAnswer(choice)}
                    >
                      {choice}
                    </Button>
                  ))}
                </div>
              ) : null}
              {step === "signup" ? (
                <div
                  className={`rounded-[18px] border p-3 shadow-[0_16px_40px_rgba(15,23,42,0.08)] ${t.panelSoft}`}
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Save this workspace
                      </p>
                      <p className={`mt-0.5 text-xs leading-5 ${t.muted}`}>
                        Create an account, sign in, or keep the draft in chat.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${signupMode === "email" || signupMode === "password" ? "bg-[#0B65FF] text-white" : t.chip}`}
                        onClick={() => chooseSignup("email")}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Create
                      </button>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${signupMode === "signin-email" || signupMode === "signin-password" ? "bg-[#0B65FF] text-white" : t.chip}`}
                        onClick={() => chooseSignup("signin")}
                      >
                        <LogIn className="h-3.5 w-3.5" />
                        Sign in
                      </button>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${signupMode === "recover" ? "bg-[#0B65FF] text-white" : t.chip}`}
                        onClick={() => chooseSignup("recover")}
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        Help
                      </button>
                    </div>
                  </div>
                  {signupMode === "choices" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="h-11 rounded-[14px] bg-[#0B65FF] px-4 text-white hover:bg-[#075DFF]"
                        onClick={() => chooseSignup("email")}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        Create with email
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`h-11 rounded-[14px] ${t.chip}`}
                        onClick={() => chooseSignup("signin")}
                      >
                        <LogIn className="mr-2 h-4 w-4" />
                        I already have an account
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`h-11 rounded-[14px] ${t.chip}`}
                        onClick={() => chooseSignup("recover")}
                      >
                        <HelpCircle className="mr-2 h-4 w-4" />
                        I forgot my email or password
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className={`h-11 rounded-[14px] px-4 text-sm ${theme === "dark" ? "text-slate-200 hover:bg-white/8" : "text-slate-700 hover:bg-slate-100"}`}
                        onClick={() => chooseSignup("later")}
                      >
                        Continue without saving
                      </Button>
                    </div>
                  ) : null}
                  {signupMode === "email" ||
                  signupMode === "signin-email" ||
                  signupMode === "recover" ? (
                    <form
                      className="flex flex-col gap-2 sm:flex-row"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (signupMode === "recover") submitRecovery();
                        else submitEmail();
                      }}
                    >
                      <Input
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={
                          signupMode === "recover"
                            ? "Email you might have used"
                            : "you@company.com"
                        }
                        className={`h-12 rounded-[14px] ${t.input}`}
                      />
                      <Button
                        type="submit"
                        className="h-12 rounded-[14px] bg-[#0B65FF] px-5 text-white hover:bg-[#075DFF]"
                      >
                        {signupMode === "signin-email"
                          ? "Use this email"
                          : signupMode === "recover"
                            ? "Try recovery"
                            : "Continue"}
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                      {signupMode === "recover" ? (
                        <Button
                          type="button"
                          variant="outline"
                          className={`h-12 rounded-[14px] ${t.chip}`}
                          onClick={() => submitRecovery(true)}
                        >
                          I forgot my email
                        </Button>
                      ) : null}
                    </form>
                  ) : null}
                  {signupMode === "password" ||
                  signupMode === "signin-password" ? (
                    <form
                      className="flex flex-col gap-2 sm:flex-row"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submitPassword();
                      }}
                    >
                      <Input
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={
                          signupMode === "signin-password"
                            ? "Enter your password"
                            : "Create a secure password"
                        }
                        type="password"
                        className={`h-12 rounded-[14px] ${t.input}`}
                      />
                      <Button
                        type="submit"
                        className="h-12 rounded-[14px] bg-[#0B65FF] px-5 text-white hover:bg-[#075DFF]"
                        disabled={
                          registerMutation.isPending || loginMutation.isPending
                        }
                      >
                        <Lock className="mr-2 h-4 w-4" />
                        {signupMode === "signin-password"
                          ? loginMutation.isPending
                            ? "Signing in..."
                            : "Sign in"
                          : registerMutation.isPending
                            ? "Creating..."
                            : "Create account"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`h-12 rounded-[14px] ${t.chip}`}
                        onClick={() => chooseSignup("recover")}
                      >
                        <HelpCircle className="mr-2 h-4 w-4" />
                        Forgot?
                      </Button>
                    </form>
                  ) : null}
                  {signupMode !== "choices" ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {signupMode !== "signin-email" &&
                      signupMode !== "signin-password" ? (
                        <button
                          type="button"
                          className={`font-semibold ${t.muted}`}
                          onClick={() => chooseSignup("signin")}
                        >
                          Use an existing account
                        </button>
                      ) : null}
                      {signupMode !== "email" && signupMode !== "password" ? (
                        <button
                          type="button"
                          className={`font-semibold ${t.muted}`}
                          onClick={() => chooseSignup("email")}
                        >
                          Create a new account
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={
                          theme === "dark"
                            ? "text-slate-200 hover:bg-white/8"
                            : "text-slate-700 hover:bg-slate-100"
                        }
                        onClick={() => chooseSignup("later")}
                      >
                        Continue without saving
                      </button>
                    </div>
                  ) : null}
                  {accountNotice ? (
                    <p className="mt-2 text-sm text-amber-500">
                      {accountNotice}
                    </p>
                  ) : null}
                </div>
              ) : (
                <form
                  className={`flex items-center gap-2 rounded-[22px] border p-2 ${theme === "dark" ? "border-white/10 bg-black/24" : "border-slate-200 bg-white"}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleUserAnswer();
                  }}
                >
                  <button
                    type="button"
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${t.muted}`}
                    aria-label="Attach file"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <Input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Tell MindBase what you want to build..."
                    className={`h-11 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 ${theme === "dark" ? "text-white placeholder:text-slate-500" : "text-slate-950 placeholder:text-slate-400"}`}
                  />
                  <button
                    type="button"
                    className={`hidden h-10 w-10 items-center justify-center rounded-full md:inline-flex ${t.muted}`}
                    aria-label="Voice input"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                  <Button
                    type="submit"
                    className="h-11 w-11 rounded-full bg-[linear-gradient(135deg,#075DFF,#18A8FF)] p-0 text-white shadow-[0_0_24px_rgba(11,101,255,0.36)]"
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </form>
              )}
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 space-y-4 overflow-y-auto md:block">
          <div className={`rounded-[22px] border p-4 ${t.panel}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ClipboardList className="h-5 w-5 text-cyan-400" />
                Workspace
              </h2>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(step === "done" ? "Ready" : "Waiting", theme)}`}
              >
                {step === "done" ? "Coming alive" : "Draft"}
              </span>
            </div>
            <div className="space-y-3 text-sm">
              {[
                ["Founder profile", workspace.founder],
                ["Company name", workspace.companyName],
                ["Scope", workspace.scope],
                ["Main customer", workspace.customer],
                [
                  "Team size",
                  workspace.teamSize
                    ? `${workspace.teamSize} agents`
                    : "Waiting",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4"
                >
                  <span className={t.muted}>{label}</span>
                  <span className="max-w-[170px] truncate font-medium">
                    {value}
                  </span>
                </div>
              ))}
              <div className={`border-t pt-3 ${t.border}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={t.muted}>Company Brain</span>
                  <span className="font-semibold">
                    {workspace.brainProgress}%
                  </span>
                </div>
                <ProgressLine value={workspace.brainProgress} theme={theme} />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className={t.muted}>Persona readiness</span>
                  <span className="font-semibold">
                    {workspace.personaProgress}%
                  </span>
                </div>
                <ProgressLine value={workspace.personaProgress} theme={theme} />
              </div>
            </div>
          </div>
          <div className={`rounded-[22px] border p-4 ${t.panel}`}>
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Users className="h-5 w-5 text-cyan-400" />
                  Your AI team
                </h2>
                <span className="text-xs font-semibold text-[#0B65FF]">
                  View all
                </span>
              </div>
              <p className={`mt-1 text-xs leading-5 ${t.muted}`}>
                These agents will help operate your company once your workspace
                is connected.
              </p>
            </div>
            <div className="space-y-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`w-full rounded-[16px] border p-3 text-left ${agent.active ? t.panelSoft : theme === "dark" ? "border-white/8 bg-white/[0.03]" : "border-slate-200 bg-white"}`}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 text-left"
                    onClick={() => setSelectedAgent(agent)}
                  >
                    <PortraitAvatar
                      agent={agent}
                      size="sm"
                      active={agent.active}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {agent.name}
                      </p>
                      <p className={`truncate text-xs ${t.muted}`}>
                        {agent.role}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(agent.status, theme)}`}
                    >
                      {agent.status === "Waiting"
                        ? "Waiting for tools"
                        : agent.status}
                    </span>
                  </button>
                  <p className={`mt-2 pl-12 text-xs ${t.muted}`}>
                    {agent.purpose}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 pl-12">
                    <button
                      type="button"
                      onClick={() => addAgentToChat(agent)}
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${t.chip}`}
                    >
                      Add to chat
                    </button>
                    <button
                      type="button"
                      onClick={() => configureAgent(agent)}
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${t.chip}`}
                    >
                      Configure
                    </button>
                    <button
                      type="button"
                      onClick={() => hireAgent(agent)}
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${t.chip}`}
                    >
                      Hire / install
                    </button>
                    <button
                      type="button"
                      onClick={() => connectAgentRequiredTools(agent)}
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${t.chip}`}
                    >
                      Connect tools
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={`rounded-[22px] border p-4 ${t.panel}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-cyan-500">
                  Your company brain is coming alive.
                </h2>
                <p className={`mt-1 text-sm ${t.muted}`}>
                  {selectedAgentIds.length} agents selected
                </p>
              </div>
              <div
                className={`grid h-14 w-14 place-items-center rounded-full border ${theme === "dark" ? "border-cyan-300/30 bg-cyan-400/10" : "border-blue-200 bg-blue-50"}`}
              >
                <span className="text-sm font-semibold">
                  {workspace.brainProgress}%
                </span>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {integrationCards.map((card, index) => {
                const ActionIcon = actionIcons[index] || Command;
                const cardStatus = connectedTools[card.id] || card.status;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleIntegrationChoice(card.title)}
                    className={`flex w-full items-start gap-3 rounded-[14px] border px-3 py-3 text-left text-sm ${t.panelSoft}`}
                  >
                    <ActionIcon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{card.title}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(cardStatus === "Ready" ? "Ready" : "Waiting", theme)}`}
                        >
                          {cardStatus}
                        </span>
                      </span>
                      <span
                        className={`mt-1 block text-xs leading-5 ${t.muted}`}
                      >
                        {card.copy}
                      </span>
                      <span
                        className={`mt-2 block text-[11px] leading-4 ${t.muted}`}
                      >
                        {card.security}
                      </span>
                      <span className="mt-2 inline-flex rounded-full bg-[#0B65FF] px-2.5 py-1 text-[11px] font-semibold text-white">
                        {card.action}
                      </span>
                    </span>
                    <ChevronRight className={`mt-0.5 h-4 w-4 ${t.muted}`} />
                  </button>
                );
              })}
            </div>
            <div
              className={`mt-4 rounded-[16px] border p-3 ${theme === "dark" ? "border-violet-300/20 bg-violet-500/10" : "border-violet-100 bg-violet-50"}`}
            >
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-violet-400" />
                <div>
                  <p className="text-sm font-semibold">
                    Profile becoming valuable
                  </p>
                  <p className={`text-xs ${t.muted}`}>
                    Train your expert agent later. Persona{" "}
                    {workspace.personaProgress}%.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <nav
        className={`fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t px-2 py-2 backdrop-blur-xl md:hidden ${t.top}`}
      >
        {[
          [Home, "Chat", "chat"],
          [Users, "Team", "team"],
          [Brain, "Brain", "brain"],
          [ClipboardList, "Tasks", "tasks"],
          [BriefcaseBusiness, "Market", "market"],
        ].map(([Icon, label, tab]) => {
          const NavIcon = Icon as typeof Home;
          return (
            <button
              key={String(label)}
              type="button"
              onClick={() => setActiveTab(tab as ActiveTab)}
              className={`flex flex-col items-center gap-1 rounded-[12px] py-1.5 text-xs ${activeTab === tab ? "text-[#0B65FF]" : t.muted}`}
            >
              <NavIcon className="h-5 w-5" />
              {String(label)}
            </button>
          );
        })}
      </nav>

      <Sheet
        open={Boolean(selectedAgent)}
        onOpenChange={(open) => (!open ? setSelectedAgent(null) : undefined)}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-slate-200 bg-white text-slate-950 sm:max-w-md"
        >
          {selectedAgent ? (
            <>
              <SheetHeader className="text-left">
                <div className="flex items-center gap-4">
                  <PortraitAvatar agent={selectedAgent} size="xl" />
                  <div>
                    <SheetTitle className="text-2xl">
                      {selectedAgent.name}
                    </SheetTitle>
                    <SheetDescription>{selectedAgent.role}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="mt-8 space-y-6">
                <section>
                  <h3 className="text-sm font-semibold uppercase text-slate-500">
                    What I help with
                  </h3>
                  <div className="mt-3 grid gap-2">
                    {selectedAgent.helpWith.map((item) => (
                      <div
                        key={item}
                        className="flex items-center gap-2 rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                      >
                        <Check className="h-4 w-4 text-emerald-500" />
                        {item}
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h3 className="text-sm font-semibold uppercase text-slate-500">
                    What I need to start working
                  </h3>
                  <div className="mt-3 grid gap-2">
                    {selectedAgent.needs.map((item) => (
                      <div
                        key={item}
                        className="rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </section>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    className="rounded-[14px] bg-[#0B65FF] text-white hover:bg-[#075DFF]"
                    onClick={() => addAgentToChat(selectedAgent)}
                  >
                    Add to chat
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-[14px] border-slate-200"
                    onClick={() => configureAgent(selectedAgent)}
                  >
                    Configure
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-[14px] border-slate-200"
                    onClick={() => hireAgent(selectedAgent)}
                  >
                    Hire / install
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-[14px] border-slate-200"
                    onClick={() => assignTaskToAgent(selectedAgent)}
                  >
                    Assign task
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-[14px] border-slate-200"
                    onClick={() => connectAgentRequiredTools(selectedAgent)}
                  >
                    Connect tools
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
