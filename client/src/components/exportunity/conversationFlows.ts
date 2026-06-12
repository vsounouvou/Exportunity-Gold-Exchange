import type { ConversationSpace } from "./ExportunityConversationalCommerce";

export type ConversationFlow = {
  id: string;
  triggerPhrases: string[];
  contextTags: string[];
  userType: string;
  locationRelevance: "nearby" | "city" | "regional";
  timeRelevance: "morning" | "afternoon" | "evening" | "any";
  assistantPrompt: string;
  quickReplies: string[];
  followUpQuestions: string[];
  mapAction: "show-nearby" | "focus-shop" | "show-suppliers" | "show-route" | "open-business";
  agentsToInvolve: string[];
  nextStates: string[];
};

const categories = [
  "breakfast",
  "bread",
  "coffee",
  "lunch",
  "dinner",
  "groceries",
  "organic food",
  "pharmacy",
  "building materials",
  "hardware",
  "machinery",
  "business supplies",
  "gifts",
  "send to family",
  "delivery",
  "track order",
  "wallet payment",
  "wholesale inquiry",
  "supplier quote",
  "sell on Exportunity",
  "shop onboarding",
  "marketplace help",
  "local product discovery",
  "tourist authentic goods",
  "return reorder",
];

const userTypes = [
  "first-time visitor",
  "busy worker",
  "parent buyer",
  "student",
  "builder contractor",
  "wholesale buyer",
  "shop owner",
  "mobile-first user",
];

function mapActionFor(category: string): ConversationFlow["mapAction"] {
  if (category.includes("wholesale") || category.includes("supplier") || category.includes("machinery")) return "show-suppliers";
  if (category.includes("delivery") || category.includes("track")) return "show-route";
  if (category.includes("shop onboarding") || category.includes("sell")) return "open-business";
  return "show-nearby";
}

function agentsFor(category: string) {
  const agents = ["Tassi"];
  if (category.includes("wallet") || category.includes("payment")) agents.push("Wallet Accountant");
  if (category.includes("delivery") || category.includes("track")) agents.push("Delivery Agent");
  if (category.includes("wholesale") || category.includes("supplier") || category.includes("machinery")) agents.push("Supplier Desk");
  if (category.includes("shop") || category.includes("sell")) agents.push("Front Desk", "Marketing");
  return agents;
}

export const conversationFlows: ConversationFlow[] = categories.flatMap((category, categoryIndex) =>
  userTypes.map((userType, userIndex) => {
    const wholesale = category.includes("wholesale") || category.includes("supplier") || category.includes("machinery");
    const business = category.includes("sell") || category.includes("shop onboarding") || userType.includes("shop owner");
    const locationRelevance: ConversationFlow["locationRelevance"] = wholesale ? "regional" : business ? "city" : "nearby";
    const timeRelevance: ConversationFlow["timeRelevance"] = category.includes("breakfast") || category.includes("coffee") || category.includes("bread") ? "morning" : category.includes("dinner") ? "evening" : "any";
    return {
      id: `${category.replaceAll(" ", "-")}-${userIndex + 1}`,
      triggerPhrases: [
        category,
        `find ${category}`,
        `${category} near me`,
        wholesale ? `request ${category}` : `show me ${category}`,
      ],
      contextTags: [category, userType, wholesale ? "wholesale" : business ? "business" : "marketplace"],
      userType,
      locationRelevance,
      timeRelevance,
      assistantPrompt: wholesale
        ? `I found supplier options for ${category}. I can compare MOQ, lead time, verification, distance, and delivery route before you request a quote.`
        : business
          ? `I can bring this into My Business and involve the right operating agents so the work becomes a conversation with tasks and follow-up.`
          : `I found nearby ${category} options around you. I highlighted the strongest matches on the map so you can speak with the shop directly.`,
      quickReplies: wholesale
        ? ["Compare suppliers", "Request a quote", "Show closest", "Best verified", "Logistics help"]
        : business
          ? ["Ask the team", "Create tasks", "Show summary", "Invite agent", "Plan next step"]
          : ["Closest", "Best rated", "Can you deliver?", "Use my wallet", "Show similar"],
      followUpQuestions: wholesale
        ? ["What quantity do you need?", "Do you need delivery or pickup?", "Should I prioritize price, lead time, or verification?"]
        : ["Do you want the closest option or the best rated?", "Should I include delivery?", "Do you want Tassi to ask the shop?"],
      mapAction: mapActionFor(category),
      agentsToInvolve: agentsFor(category),
      nextStates: wholesale ? ["supplier-results", "quote-request", "delivery-route"] : business ? ["business-thread", "task-creation", "agent-routing"] : ["nearby-results", "shop-conversation", "payment-or-delivery"],
    };
  }),
);

export function findConversationFlow(input: string, space: ConversationSpace) {
  const normalized = input.toLowerCase();
  const contextMatch = space === "wholesale" ? "wholesale" : space === "business" ? "business" : "marketplace";
  return (
    conversationFlows.find(
      (flow) =>
        flow.contextTags.includes(contextMatch) &&
        flow.triggerPhrases.some((phrase) => normalized.includes(phrase.toLowerCase())),
    ) ||
    conversationFlows.find((flow) => flow.triggerPhrases.some((phrase) => normalized.includes(phrase.toLowerCase())))
  );
}
