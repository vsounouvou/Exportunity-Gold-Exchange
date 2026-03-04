export type ChatRoomKey =
  | "ops"
  | "support"
  | "wallet"
  | "procurement"
  | "sales"
  | "compliance"
  | "accounting"
  | "delivery"
  | "team"
  | "investor"
  | "production"
  | "legal";

export type AgentProfile = {
  key: string;
  name: string;
  role: string;
  scope: string[];
  status: "active" | "paused";
};

export const PRIMARY_ROOM_KEY: ChatRoomKey = "ops";
export const PRIMARY_ROOM_SLUG = "general-operations";

export const STARTER_AGENT_ROSTER: AgentProfile[] = [
  {
    key: "compliance",
    name: "Elena Novak",
    role: "Compliance Agent",
    scope: ["KYC", "KYB", "AML"],
    status: "active",
  },
  {
    key: "support",
    name: "Amadou Kone",
    role: "Support Agent",
    scope: ["Customer support", "Escalations", "Follow-up"],
    status: "active",
  },
  {
    key: "wallet",
    name: "Kofi Mensah",
    role: "Payments Agent",
    scope: ["Receive", "Send", "Reconciliation"],
    status: "active",
  },
  {
    key: "accounting",
    name: "Marie Diop",
    role: "Accounting Agent",
    scope: ["Ledger checks", "Invoicing", "Daily summary"],
    status: "active",
  },
  {
    key: "procurement",
    name: "Fatou Traore",
    role: "Operations Agent",
    scope: ["Orders", "Procurement", "Execution follow-up"],
    status: "active",
  },
  {
    key: "sales",
    name: "Sara Bello",
    role: "Sales Assistant",
    scope: ["Client replies", "Offers", "Pipeline updates"],
    status: "active",
  },
];

const SLUG_TO_KEY: Record<string, ChatRoomKey> = {
  "general-operations": "ops",
  operations: "ops",
  ops: "ops",
  support: "support",
  wallet: "wallet",
  procurement: "procurement",
  orders: "procurement",
  sales: "sales",
  clients: "sales",
  compliance: "compliance",
  accounting: "accounting",
  delivery: "delivery",
  team: "team",
  "team-room": "team",
  investor: "investor",
  production: "production",
  legal: "legal",
};

export function roomKeyFromSlug(value: string): ChatRoomKey {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return SLUG_TO_KEY[normalized] || PRIMARY_ROOM_KEY;
}

export function roomSlugFromKey(value: string): string {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "ops") return PRIMARY_ROOM_SLUG;
  return key || PRIMARY_ROOM_SLUG;
}
