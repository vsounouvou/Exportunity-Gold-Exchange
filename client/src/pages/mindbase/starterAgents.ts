export type StarterAgentId =
  | "adjoa"
  | "awa"
  | "kwame"
  | "aminata"
  | "idriss"
  | "nene";

export type StarterAgent = {
  id: StarterAgentId;
  name: string;
  role: string;
  purpose: string;
  helpWith: string[];
  needs: string[];
  avatar: string;
  accent: string;
  joinsAt?: "business" | "customer" | "team";
  firstMessage: string;
};

export const agentAvatars: Record<StarterAgentId, string> = {
  adjoa: "/images/agents/adjoa.png",
  awa: "/images/agents/awa.png",
  kwame: "/images/agents/kwame.png",
  aminata: "/images/agents/aminata.png",
  idriss: "/images/agents/idriss.png",
  nene: "/images/agents/nene.png",
};

export const starterAgents: StarterAgent[] = [
  {
    id: "adjoa",
    name: "Adjoa",
    role: "MindBase Guide",
    purpose:
      "Guides onboarding, creates your workspace, recommends agents, and keeps setup moving.",
    helpWith: [
      "Workspace creation",
      "Agent recommendation",
      "Next-step guidance",
      "Company profile setup",
    ],
    needs: ["Founder name", "Company name", "Business type"],
    avatar: agentAvatars.adjoa,
    accent: "#0B65FF",
    firstMessage:
      "I will help you assemble the AI team that will help run your company.",
  },
  {
    id: "awa",
    name: "Awa",
    role: "Executive Assistant",
    purpose: "Manages inbox follow-ups, meetings, reminders, and decisions.",
    helpWith: [
      "Inbox follow-up",
      "Meeting notes",
      "Calendar reminders",
      "Decision tracking",
      "Daily priorities",
    ],
    needs: ["Gmail or Outlook", "Calendar", "Preferred work rhythm"],
    avatar: agentAvatars.awa,
    accent: "#F59E0B",
    joinsAt: "team",
    firstMessage:
      "I will organize your inbox, reminders, meetings, and decisions once your tools are connected.",
  },
  {
    id: "kwame",
    name: "Kwame",
    role: "Operations Manager",
    purpose:
      "Turns goals into tasks, workflows, blockers, and execution plans.",
    helpWith: [
      "Weekly execution rhythm",
      "Tasks and owners",
      "Workflow design",
      "Blocker tracking",
      "Team coordination",
    ],
    needs: ["Company structure", "Team members", "Projects", "Recurring tasks"],
    avatar: agentAvatars.kwame,
    accent: "#38BDF8",
    joinsAt: "business",
    firstMessage:
      "I will help structure the work your company needs to execute every week.",
  },
  {
    id: "aminata",
    name: "Aminata",
    role: "Marketing Agent",
    purpose:
      "Creates campaigns, content plans, social posts, and brand messaging.",
    helpWith: [
      "Campaign ideas",
      "Social posts",
      "Brand messages",
      "Content calendars",
      "Customer communication",
    ],
    needs: [
      "Target customers",
      "Offer description",
      "Brand tone",
      "Social accounts",
    ],
    avatar: agentAvatars.aminata,
    accent: "#22C55E",
    joinsAt: "business",
    firstMessage:
      "I will prepare campaigns, content ideas, and customer messages around your market.",
  },
  {
    id: "idriss",
    name: "Idriss",
    role: "Sales Agent",
    purpose:
      "Tracks leads, prepares offers, follows up, and helps close opportunities.",
    helpWith: [
      "Lead tracking",
      "Offer preparation",
      "Pipeline follow-up",
      "Customer conversion",
      "Sales reminders",
    ],
    needs: ["Customer list", "Pipeline", "Email or CRM", "Offer details"],
    avatar: agentAvatars.idriss,
    accent: "#06B6D4",
    joinsAt: "customer",
    firstMessage:
      "I will prepare your first customer pipeline and follow-up rhythm.",
  },
  {
    id: "nene",
    name: "Nene",
    role: "Accounting Agent",
    purpose:
      "Tracks invoices, expenses, revenue, cashflow, and finance reminders.",
    helpWith: [
      "Invoice tracking",
      "Expense reminders",
      "Revenue view",
      "Cashflow alerts",
      "Finance follow-up",
    ],
    needs: [
      "Revenue model",
      "Currency",
      "Invoices",
      "Expense files",
      "Bank/payment integrations later",
    ],
    avatar: agentAvatars.nene,
    accent: "#8B5CF6",
    joinsAt: "team",
    firstMessage:
      "I will configure your finance workspace around invoices, expenses, revenue, and cashflow.",
  },
];

export const starterAgentById = Object.fromEntries(
  starterAgents.map((agent) => [agent.id, agent]),
) as Record<StarterAgentId, StarterAgent>;

export const operatingAgents = starterAgents.filter(
  (agent) => agent.id !== "adjoa",
);

export const integrationCards = [
  {
    id: "gmail",
    title: "Connect Gmail",
    copy: "Allows Awa to help with follow-ups, opportunities, decisions, and inbox summaries.",
    status: "Not connected",
    action: "Connect Gmail",
    fallback: "Gmail connection is not enabled yet in this environment.",
    security: "You can revoke access anytime.",
  },
  {
    id: "calendar",
    title: "Connect Calendar",
    copy: "Allows Awa to track meetings, reminders, and your preferred work rhythm.",
    status: "Not connected",
    action: "Connect Calendar",
    fallback: "Calendar connection is not enabled yet in this environment.",
    security: "You can revoke access anytime.",
  },
  {
    id: "drive",
    title: "Connect Google Drive",
    copy: "Allows MindBase to build your company brain from documents.",
    status: "Not connected",
    action: "Connect Drive",
    fallback: "Google Drive connection is not enabled yet in this environment.",
    security: "You can revoke access anytime.",
  },
  {
    id: "whatsapp",
    title: "Connect WhatsApp",
    copy: "Allows agents to help with customer conversations.",
    status: "Not connected",
    action: "Connect WhatsApp",
    fallback: "WhatsApp connection is not enabled yet in this environment.",
    security: "You can revoke access anytime.",
  },
  {
    id: "team",
    title: "Invite your team",
    copy: "Allows MindBase to coordinate people, tasks, and responsibilities.",
    status: "Ready",
    action: "Invite team",
    fallback: "",
    security: "You control every invitation.",
  },
  {
    id: "documents",
    title: "Upload documents",
    copy: "Allows your agents to learn how your company already operates.",
    status: "Ready",
    action: "Upload documents",
    fallback: "",
    security: "Documents stay inside your workspace.",
  },
  {
    id: "crm",
    title: "Add customers / CRM",
    copy: "Allows Idriss to track leads, offers, and follow-up.",
    status: "Ready",
    action: "Add customers",
    fallback: "",
    security: "Customer data stays tied to this workspace.",
  },
];
