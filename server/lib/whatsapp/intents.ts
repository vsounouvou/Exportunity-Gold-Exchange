export type AllowedIntent =
  | "LINK_ACCOUNT"
  | "HELP"
  | "SET_LANGUAGE"
  | "HUMAN_HANDOFF"
  | "ME"
  | "CREATE_OFFER"
  | "EDIT_OFFER"
  | "CONFIRM_OFFER"
  | "WITHDRAW_OFFER"
  | "BROWSE_OFFERS"
  | "REQUEST_QUOTE"
  | "CREATE_INTENT"
  | "CREATE_ORDER"
  | "TRACK_ORDER"
  | "ADMIN_QUEUE"
  | "ADMIN_REVIEW"
  | "ADMIN_APPROVE"
  | "ADMIN_REJECT"
  | "ADMIN_REQUEST_DOCS"
  | "ADMIN_TAKEOVER"
  | "ADMIN_BROADCAST";

export type ParsedIntent = {
  intent: AllowedIntent | "UNKNOWN";
  entities: Record<string, any>;
  confidence: number;
};

function normalizeText(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

export function parseIntentFromText(inputRaw: string): ParsedIntent {
  const input = normalizeText(inputRaw);
  const upper = input.toUpperCase();

  if (upper === "HELP") return { intent: "HELP", entities: {}, confidence: 1 };
  if (upper === "START") return { intent: "LINK_ACCOUNT", entities: {}, confidence: 1 };
  if (upper === "ME") return { intent: "ME", entities: {}, confidence: 1 };
  if (upper === "HUMAN") return { intent: "HUMAN_HANDOFF", entities: {}, confidence: 1 };

  if (upper.startsWith("LANG ")) {
    const lang = upper.split(" ")[1]?.toLowerCase();
    if (lang === "fr" || lang === "en") return { intent: "SET_LANGUAGE", entities: { lang }, confidence: 1 };
    return { intent: "SET_LANGUAGE", entities: { lang: null }, confidence: 0.7 };
  }

  if (upper === "BROWSE" || upper.startsWith("BROWSE ")) {
    const filters = input.length > 6 ? input.slice(6).trim() : "";
    return { intent: "BROWSE_OFFERS", entities: { filters }, confidence: 0.9 };
  }

  if (upper.startsWith("QUOTE ")) {
    const offerId = upper.split(" ")[1];
    return offerId ? { intent: "REQUEST_QUOTE", entities: { offerId }, confidence: 0.9 } : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }

  if (upper.startsWith("INTENT ")) {
    const [, offerId, qty] = input.split(" ");
    return offerId && qty
      ? { intent: "CREATE_INTENT", entities: { offerId, qty }, confidence: 0.8 }
      : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }

  if (upper.startsWith("ORDER ")) {
    const [, offerId, qty] = input.split(" ");
    return offerId && qty
      ? { intent: "CREATE_ORDER", entities: { offerId, qty }, confidence: 0.85 }
      : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }

  if (upper.startsWith("TRACK ")) {
    const orderId = upper.split(" ")[1];
    return orderId ? { intent: "TRACK_ORDER", entities: { orderId }, confidence: 0.9 } : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }

  if (upper === "OFFER" || upper.startsWith("OFFER ")) {
    const freeText = upper === "OFFER" ? "" : input.slice(5).trim();
    return { intent: "CREATE_OFFER", entities: { freeText }, confidence: freeText ? 0.7 : 1 };
  }

  if (upper.startsWith("EDIT ")) {
    const offerId = upper.split(" ")[1];
    return offerId ? { intent: "EDIT_OFFER", entities: { offerId }, confidence: 0.9 } : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }

  if (upper.startsWith("CONFIRM ")) {
    const offerId = upper.split(" ")[1];
    return offerId ? { intent: "CONFIRM_OFFER", entities: { offerId }, confidence: 0.9 } : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }

  if (upper.startsWith("WITHDRAW ")) {
    const offerId = upper.split(" ")[1];
    return offerId ? { intent: "WITHDRAW_OFFER", entities: { offerId }, confidence: 0.9 } : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }

  if (upper === "QUEUE") return { intent: "ADMIN_QUEUE", entities: {}, confidence: 0.9 };
  if (upper.startsWith("REVIEW ")) {
    const offerId = upper.split(" ")[1];
    return offerId ? { intent: "ADMIN_REVIEW", entities: { offerId }, confidence: 0.9 } : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }
  if (upper.startsWith("APPROVE ")) {
    const offerId = upper.split(" ")[1];
    return offerId ? { intent: "ADMIN_APPROVE", entities: { offerId }, confidence: 0.9 } : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }
  if (upper.startsWith("REJECT ")) {
    const [, offerId, ...rest] = input.split(" ");
    const reason = rest.join(" ").trim();
    return offerId ? { intent: "ADMIN_REJECT", entities: { offerId, reason }, confidence: reason ? 0.9 : 0.6 } : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }
  if (upper.startsWith("REQUEST_DOCS ")) {
    const ref = input.split(" ")[1];
    return ref ? { intent: "ADMIN_REQUEST_DOCS", entities: { ref }, confidence: 0.85 } : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }
  if (upper.startsWith("TAKEOVER ")) {
    const conversationId = input.split(" ")[1];
    return conversationId ? { intent: "ADMIN_TAKEOVER", entities: { conversationId }, confidence: 0.9 } : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }
  if (upper.startsWith("BROADCAST ")) {
    const segment = input.slice("BROADCAST".length).trim();
    return segment ? { intent: "ADMIN_BROADCAST", entities: { segment }, confidence: 0.75 } : { intent: "UNKNOWN", entities: {}, confidence: 0.2 };
  }

  return { intent: "UNKNOWN", entities: { raw: input }, confidence: 0.1 };
}

export function buildHelpMenu(roles: string[]) {
  const lines: string[] = [];
  lines.push("Commands:");
  lines.push("HELP, START, ME, LANG <fr|en>, HUMAN");

  if (roles.includes("supplier") || roles.includes("seller")) {
    lines.push("Seller: OFFER, EDIT <id>, CONFIRM <id>, WITHDRAW <id>");
  }
  if (roles.includes("buyer") || roles.includes("shareholder") || roles.includes("investor")) {
    lines.push("Buyer: BROWSE [filters], QUOTE <offer_id>, INTENT <offer_id> <qty>, ORDER <offer_id> <qty>, TRACK <order_id>");
  }
  if (roles.includes("admin") || roles.includes("ops_agent") || roles.includes("compliance_officer")) {
    lines.push("Admin: QUEUE, REVIEW <offer_id>, APPROVE <offer_id>, REJECT <offer_id> <reason>, REQUEST_DOCS <user_id|offer_id>");
  }

  return lines.join("\n");
}

