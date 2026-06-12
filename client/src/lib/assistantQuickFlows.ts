export type AssistantQuickFlowId =
  | "buyer"
  | "seller"
  | "machinery"
  | "mining"
  | "payments"
  | "contracts"
  | "media"
  | "ai-agents"
  | "logistics"
  | "investment";

export type AssistantQuickFlow = {
  id: AssistantQuickFlowId;
  label: string;
  route: string;
  cta: string;
  seedMessage: string;
  searchTerms: string[];
  assignedAgentKey?: string;
  assignedAgentName?: string;
};

export const EXPORTUNITY_ASSISTANT_SHORTCUTS: AssistantQuickFlow[] = [
  {
    id: "buyer",
    label: "I want to buy products",
    route: "/marketplace",
    cta: "Open marketplace",
    seedMessage:
      "I want to buy products on Exportunity. Show me the best category and the next step for quote, payment, and delivery.",
    searchTerms: ["buy", "products", "catalog", "marketplace", "source", "supplier"],
    assignedAgentKey: "buyer-support-agent",
    assignedAgentName: "Buyer Support Agent",
  },
  {
    id: "seller",
    label: "I want to sell on Exportunity",
    route: "/marketplace/marketplace-services",
    cta: "Start selling",
    seedMessage:
      "I want to sell on Exportunity. Guide me through provider onboarding, shop setup, product upload, and settlement.",
    searchTerms: ["sell", "seller", "shop", "provider", "store", "onboard"],
    assignedAgentKey: "seller-onboarding-agent",
    assignedAgentName: "Seller Onboarding Agent",
  },
  {
    id: "machinery",
    label: "I need machinery",
    route: "/marketplace/machinery",
    cta: "Request quote",
    seedMessage:
      "I need machinery sourcing help. Start with industrial equipment, quote handling, and follow-up support.",
    searchTerms: ["machinery", "machine", "industrial", "equipment", "factory", "maintenance"],
    assignedAgentKey: "machinery-sourcing-agent",
    assignedAgentName: "Machinery Sourcing Agent",
  },
  {
    id: "payments",
    label: "I need payment tools",
    route: "/pay",
    cta: "Open payment tools",
    seedMessage:
      "I need payment tools. Show me wallets, merchant collections, payouts, and card loading options.",
    searchTerms: ["pay", "payment", "wallet", "card", "payout", "fintech", "flutterwave"],
    assignedAgentKey: "payment-operations-agent",
    assignedAgentName: "Payment Operations Agent",
  },
  {
    id: "contracts",
    label: "I need a contract",
    route: "/contracts",
    cta: "Create contract",
    seedMessage:
      "I need a contract. Help me choose the right MOU, supplier agreement, or transaction-ready document.",
    searchTerms: ["contract", "legal", "mou", "agreement", "document", "compliance"],
    assignedAgentKey: "contract-drafting-agent",
    assignedAgentName: "Contract Drafting Agent",
  },
  {
    id: "ai-agents",
    label: "I need an AI agent",
    route: "/marketplace/agents",
    cta: "Deploy agent",
    seedMessage:
      "I need an AI agent for Exportunity. Help me choose between supplier, payment, logistics, media, and support agents.",
    searchTerms: ["agent", "ai", "automation", "assistant", "mindbase", "ops"],
    assignedAgentKey: "chairman-assistant",
    assignedAgentName: "Chairman Assistant Agent",
  },
  {
    id: "mining",
    label: "I need gold/mining services",
    route: "/marketplace/mining",
    cta: "Open mining",
    seedMessage:
      "I need mining and gold services. Start with operator verification, logistics, contracts, payments, and compliance.",
    searchTerms: ["mining", "gold", "operator", "compliance", "lab", "certification"],
    assignedAgentKey: "mining-compliance-agent",
    assignedAgentName: "Mining Compliance Agent",
  },
  {
    id: "media",
    label: "I need media/images",
    route: "/media-bank",
    cta: "Generate media",
    seedMessage:
      "I need media and image support. Show me banners, product images, provider assets, and the media bank workflow.",
    searchTerms: ["media", "image", "banner", "photo", "video", "content", "gallery"],
    assignedAgentKey: "image-generation-agent",
    assignedAgentName: "Image Generation Agent",
  },
  {
    id: "logistics",
    label: "I need logistics",
    route: "/marketplace/logistics",
    cta: "Open logistics",
    seedMessage:
      "I need logistics help. Guide me through warehousing, transport, delivery, and shipment follow-up.",
    searchTerms: ["logistics", "delivery", "transport", "shipment", "warehouse", "freight"],
    assignedAgentKey: "logistics-coordinator-agent",
    assignedAgentName: "Logistics Coordinator Agent",
  },
  {
    id: "investment",
    label: "I need investment opportunities",
    route: "/marketplace/investment-opportunities",
    cta: "Review opportunities",
    seedMessage:
      "I need investment opportunities. Start with mining, sustainable construction, and industrial capacity offers.",
    searchTerms: ["investment", "investor", "opportunity", "project", "partner", "capital"],
    assignedAgentKey: "chief-strategy-agent",
    assignedAgentName: "Chief Strategy Agent",
  },
];

export const EXPORTUNITY_ASSISTANT_SEARCH_SUGGESTIONS = [
  "Find machinery",
  "Request gold certification",
  "Create a contract",
  "Generate product images",
  "Deploy an AI agent",
  "Find construction materials",
  "Open payment tools",
  "Source export-ready products",
];

export function getAssistantQuickFlow(flowId: AssistantQuickFlowId) {
  return EXPORTUNITY_ASSISTANT_SHORTCUTS.find((item) => item.id === flowId) || null;
}

export function findAssistantQuickFlowByQuery(query: string) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return null;

  let winner: AssistantQuickFlow | null = null;
  let bestScore = 0;

  for (const item of EXPORTUNITY_ASSISTANT_SHORTCUTS) {
    const score = item.searchTerms.reduce(
      (total, term) => (normalized.includes(term) ? total + term.length : total),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      winner = item;
    }
  }

  return winner;
}
