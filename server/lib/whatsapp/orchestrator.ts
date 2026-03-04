import { db } from "@db";
import {
  assistantActionsLog,
  eceUsers,
  userWhatsappChannels,
  waConversationState,
  waOffers,
  waOrders,
  waOpsTickets,
  whatsappLinkTokens,
  whatsappMedia,
  whatsappConversations,
  whatsappMessages,
} from "@db/schema";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { buildHelpMenu, parseIntentFromText } from "./intents";
import { createOtpCode, hashOtp, sendWaTemplate, sendWaText } from "./waGateway";
import { replyRouter } from "../replyRouter";

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

type IncomingMessage = {
  waMessageId: string;
  waPhoneE164: string;
  tenantId?: number | null;
  messageType: "text" | "image" | "video" | "document" | "audio" | "interactive" | "template";
  textBody?: string | null;
  timestamp?: Date | null;
  payloadJson: any;
  mediaDbId?: number | null;
};

export async function processIncomingWhatsAppMessage(msg: IncomingMessage) {
  const conversationId = `wa:${msg.waPhoneE164}`;

  // If an ops takeover is open, pause automation.
  const openTakeover = await db.query.waOpsTickets.findFirst({
    where: and(eq(waOpsTickets.conversationId, conversationId), eq(waOpsTickets.status, "open")),
    orderBy: desc(waOpsTickets.createdAt),
  });
  if (openTakeover?.takenOverByUserId) return;

  const linked = await db.query.userWhatsappChannels.findFirst({
    where: eq(userWhatsappChannels.waPhoneE164, msg.waPhoneE164),
  });

  const user = linked
    ? await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, linked.userId) })
    : null;

  const roles: string[] = Array.isArray((user as any)?.roles) ? ((user as any).roles as string[]) : user ? [user.role] : [];

  const inputText = (msg.textBody || "").trim();
  const parsed = inputText ? parseIntentFromText(inputText) : { intent: "UNKNOWN" as const, entities: {}, confidence: 0.1 };

  if (!user && parsed.intent !== "LINK_ACCOUNT" && parsed.intent !== "HELP") {
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Send START to link your account, or HELP for commands.", conversationId, null);
    return;
  }

  if (user) {
    await logAction(user.id, parsed.intent, [msg.waMessageId], parsed.entities, "parsed_intent", null, null, parsed.confidence);
  }

  if (parsed.intent === "HELP") {
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, buildHelpMenu(roles), conversationId, user?.id);
    return;
  }

  if (parsed.intent === "LINK_ACCOUNT") {
    // START from WhatsApp side: create OTP token bound to phone.
    const otp = createOtpCode();
    await db
      .insert(whatsappLinkTokens)
      .values({
        waPhoneE164: msg.waPhoneE164,
        otpHash: hashOtp(otp),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })
      .onConflictDoNothing();

    // Reply using text (within session window) - platform UI confirms.
    await replyText(
      msg.tenantId ?? null,
      msg.waPhoneE164,
      `Link code: ${otp}\nEnter this code in Settings → WhatsApp to link your account.`,
      conversationId,
      null
    );
    return;
  }

  if (!user) return;

  // ME
  if (parsed.intent === "ME") {
    await replyText(
      msg.tenantId ?? null,
      msg.waPhoneE164,
      `Linked: ${user.displayName}\nRoles: ${(roles.length ? roles : [user.role]).join(", ")}`,
      conversationId,
      user.id
    );
    return;
  }

  if (parsed.intent === "SET_LANGUAGE") {
    const lang = parsed.entities.lang;
    await upsertState(user.id, "prefs", { lang }, 365);
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, lang ? `Language set: ${lang}` : "Usage: LANG fr | LANG en", conversationId, user.id);
    return;
  }

  if (parsed.intent === "HUMAN_HANDOFF") {
    const [ticket] = await db
      .insert(waOpsTickets)
      .values({
        conversationId,
        userId: user.id,
        waPhoneE164: msg.waPhoneE164,
        reason: "User requested HUMAN handoff",
      })
      .returning({ id: waOpsTickets.id });

    await logAction(
      user.id,
      parsed.intent,
      [msg.waMessageId],
      parsed.entities,
      "create_ops_ticket",
      "ticket",
      String(ticket?.id ?? ""),
      parsed.confidence,
    );
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, ticket?.id ? `Ticket created: #${ticket.id}. An ops agent will reply here.` : "Ticket created. An ops agent will reply here.", conversationId, user.id);
    return;
  }

  if (parsed.intent === "ADMIN_TAKEOVER") {
    if (!isAdminLike(roles)) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Admin command. Send HELP.", conversationId, user.id);
      return;
    }
    const targetConversationId = String(parsed.entities.conversationId || "").trim();
    if (!targetConversationId) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Usage: TAKEOVER <conversation_id>", conversationId, user.id);
      return;
    }
    const [ticket] = await db
      .insert(waOpsTickets)
      .values({
        conversationId: targetConversationId,
        userId: null,
        waPhoneE164: targetConversationId.replace(/^wa:/, ""),
        reason: "Admin takeover",
        takenOverByUserId: user.id,
      })
      .returning();
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Takeover enabled for ${targetConversationId} (ticket #${ticket.id}).`, conversationId, user.id);
    return;
  }

  if (parsed.intent === "ADMIN_REQUEST_DOCS") {
    if (!isAdminLike(roles)) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Admin command. Send HELP.", conversationId, user.id);
      return;
    }
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Docs request queued (template DOCS_REQUEST).", conversationId, user.id);
    return;
  }

  if (parsed.intent === "ADMIN_BROADCAST") {
    if (!isAdminLike(roles)) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Admin command. Send HELP.", conversationId, user.id);
      return;
    }
    const segment = String(parsed.entities.segment || "").trim();
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, segment ? `Broadcast queued for segment: ${segment}` : "Usage: BROADCAST <segment>", conversationId, user.id);
    return;
  }

  // Seller flow: OFFER -> create draft then request missing fields.
  if (parsed.intent === "CREATE_OFFER") {
    if (!isSellerLike(roles)) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "You don't have seller access. Send HELP.", conversationId, user.id);
      return;
    }

    const state = await getState(user.id, "offer_create");
    if (!state) {
      const draft = await createOfferDraftFromText(user.id, parsed.entities.freeText || "");
      await upsertState(user.id, "offer_create", { offerId: draft.id, step: "type" }, 2);
      await replyText(
        msg.tenantId ?? null,
        msg.waPhoneE164,
        `Offer draft created: #${draft.id}\nReply with: TYPE dore|dust|nuggets|bar`,
        conversationId,
        user.id
      );
      await logAction(user.id, parsed.intent, [msg.waMessageId], parsed.entities, "create_offer_draft", "offer", String(draft.id), parsed.confidence);
      return;
    }

    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `You're already creating an offer. Reply with the next field or CANCEL.`, conversationId, user.id);
    return;
  }

  if (parsed.intent === "CONFIRM_OFFER") {
    if (!isSellerLike(roles)) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Seller command. Send HELP.", conversationId, user.id);
      return;
    }
    const offerIdNum = parseInt(String(parsed.entities.offerId).replace(/[^\d]/g, ""), 10);
    const offer = offerIdNum ? await db.query.waOffers.findFirst({ where: eq(waOffers.id, offerIdNum) }) : null;
    if (!offer || offer.createdByUserId !== user.id) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Offer not found.", conversationId, user.id);
      return;
    }
    const mediaIds = ((offer as any).mediaIds || []) as number[];
    if (!mediaIds.length) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Add at least 1 photo, then CONFIRM again.", conversationId, user.id);
      return;
    }
    await db.update(waOffers).set({ status: "pending_review", updatedAt: new Date() }).where(eq(waOffers.id, offer.id));
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Offer #${offer.id} submitted for review.`, conversationId, user.id);
    return;
  }

  if (parsed.intent === "WITHDRAW_OFFER") {
    if (!isSellerLike(roles)) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Seller command. Send HELP.", conversationId, user.id);
      return;
    }
    const offerIdNum = parseInt(String(parsed.entities.offerId).replace(/[^\d]/g, ""), 10);
    const offer = offerIdNum ? await db.query.waOffers.findFirst({ where: eq(waOffers.id, offerIdNum) }) : null;
    if (!offer || offer.createdByUserId !== user.id) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Offer not found.", conversationId, user.id);
      return;
    }
    await db.update(waOffers).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(waOffers.id, offer.id));
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Offer #${offer.id} withdrawn.`, conversationId, user.id);
    return;
  }

  if (parsed.intent === "REQUEST_QUOTE") {
    const offerIdNum = parseInt(String(parsed.entities.offerId).replace(/[^\d]/g, ""), 10);
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, offerIdNum ? `Quote request recorded for offer #${offerIdNum}.` : "Usage: QUOTE <offer_id>", conversationId, user.id);
    return;
  }

  if (parsed.intent === "CREATE_INTENT") {
    const offerIdNum = parseInt(String(parsed.entities.offerId).replace(/[^\d]/g, ""), 10);
    const qty = parseQty(parsed.entities.qty);
    if (!offerIdNum || !qty) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Usage: INTENT <offer_id> <qty>", conversationId, user.id);
      return;
    }
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Intent recorded for offer #${offerIdNum} (${qty.value} ${qty.unit}).`, conversationId, user.id);
    return;
  }

  // Guided offer collection via state (minimal): TYPE, QTY, LOC, PRICE, PHOTOS, then CONFIRM.
  const activeOfferFlow = await getState(user.id, "offer_create");
  if (activeOfferFlow && inputText) {
    const handled = await handleOfferCreateStep(user.id, msg, activeOfferFlow, conversationId);
    if (handled) return;
  }

  // Buyer flow: BROWSE/ORDER/TRACK
  if (parsed.intent === "BROWSE_OFFERS") {
    const offers = await listPublishedOffers(parsed.entities.filters || "");
    if (!offers.length) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "No offers found. Try: BROWSE Abidjan 10-50kg", conversationId, user.id);
      return;
    }
    const lines = offers.slice(0, 5).map((o) => `#${o.id} ${o.type} ${o.quantity}${o.unit} • ${o.locationJson?.region || o.locationJson?.city || o.locationJson?.country}`);
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Latest offers:\n${lines.join("\n")}\n\nORDER <offer_id> <qty>`, conversationId, user.id);
    await logAction(user.id, parsed.intent, [msg.waMessageId], parsed.entities, "list_offers", "offer", null, parsed.confidence);
    return;
  }

  if (parsed.intent === "CREATE_ORDER") {
    const offerIdNum = parseInt(String(parsed.entities.offerId).replace(/[^\d]/g, ""), 10);
    const qty = parseQty(parsed.entities.qty);
    if (!offerIdNum || !qty) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Usage: ORDER <offer_id> <qty>", conversationId, user.id);
      return;
    }

    const offer = await db.query.waOffers.findFirst({ where: and(eq(waOffers.id, offerIdNum), eq(waOffers.status, "published")) });
    if (!offer) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Offer #${offerIdNum} not found.`, conversationId, user.id);
      return;
    }

    const [order] = await db
      .insert(waOrders)
      .values({
        offerId: offer.id,
        buyerUserId: user.id,
        quantity: String(qty.value),
        unit: qty.unit,
        status: "pending_terms",
      })
      .returning();

    await logAction(user.id, parsed.intent, [msg.waMessageId], parsed.entities, "create_order", "order", String(order.id), parsed.confidence);
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Order created: #${order.id}\nTRACK ${order.id}`, conversationId, user.id);
    return;
  }

  if (parsed.intent === "TRACK_ORDER") {
    const orderIdNum = parseInt(String(parsed.entities.orderId).replace(/[^\d]/g, ""), 10);
    if (!orderIdNum) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Usage: TRACK <order_id>", conversationId, user.id);
      return;
    }
    const order = await db.query.waOrders.findFirst({ where: and(eq(waOrders.id, orderIdNum), eq(waOrders.buyerUserId, user.id)) });
    if (!order) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Order #${orderIdNum} not found.`, conversationId, user.id);
      return;
    }
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Order #${order.id}: ${order.status}`, conversationId, user.id);
    await logAction(user.id, parsed.intent, [msg.waMessageId], parsed.entities, "track_order", "order", String(order.id), parsed.confidence);
    return;
  }

  // Admin queue/review/approve/reject
  if (parsed.intent === "ADMIN_QUEUE") {
    if (!isAdminLike(roles)) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Admin command. Send HELP.", conversationId, user.id);
      return;
    }
    const pending = await db.query.waOffers.findMany({
      where: eq(waOffers.status, "pending_review"),
      orderBy: desc(waOffers.createdAt),
      limit: 5,
    });
    if (!pending.length) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Queue is empty.", conversationId, user.id);
      return;
    }
    const lines = pending.map((o) => `#${o.id} ${o.type} ${o.quantity}${o.unit} • ${o.locationJson?.region || o.locationJson?.country}`);
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Review queue:\n${lines.join("\n")}\n\nREVIEW <offer_id>`, conversationId, user.id);
    return;
  }

  if (parsed.intent === "ADMIN_REVIEW") {
    if (!isAdminLike(roles)) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Admin command. Send HELP.", conversationId, user.id);
      return;
    }
    const offerIdNum = parseInt(String(parsed.entities.offerId).replace(/[^\d]/g, ""), 10);
    const offer = offerIdNum ? await db.query.waOffers.findFirst({ where: eq(waOffers.id, offerIdNum) }) : null;
    if (!offer) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Offer not found.", conversationId, user.id);
      return;
    }
    await replyText(
      msg.tenantId ?? null,
      msg.waPhoneE164,
      `Offer #${offer.id}\nStatus: ${offer.status}\nType: ${offer.type}\nQty: ${offer.quantity}${offer.unit}\nLocation: ${offer.locationJson?.country} ${offer.locationJson?.region || ""}\n\nAPPROVE ${offer.id}\nREJECT ${offer.id} <reason>`,
      conversationId,
      user.id
    );
    return;
  }

  if (parsed.intent === "ADMIN_APPROVE" || parsed.intent === "ADMIN_REJECT") {
    if (!isAdminLike(roles)) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Admin command. Send HELP.", conversationId, user.id);
      return;
    }
    const offerIdNum = parseInt(String(parsed.entities.offerId).replace(/[^\d]/g, ""), 10);
    if (!offerIdNum) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Invalid offer id.", conversationId, user.id);
      return;
    }
    if (parsed.intent === "ADMIN_APPROVE") {
      await db
        .update(waOffers)
        .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(waOffers.id, offerIdNum));
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Approved and published offer #${offerIdNum}.`, conversationId, user.id);
      return;
    }
    const reason = String(parsed.entities.reason || "").trim();
    await db.update(waOffers).set({ status: "draft", updatedAt: new Date() }).where(eq(waOffers.id, offerIdNum));
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Rejected offer #${offerIdNum}. Reason noted.`, conversationId, user.id);
    await logAction(user.id, parsed.intent, [msg.waMessageId], parsed.entities, "reject_offer", "offer", String(offerIdNum), parsed.confidence);
    return;
  }

  if (inputText) {
    const routed = await replyRouter(inputText, { language: pickLanguage(await getState(user.id, "prefs")) });
    await logAction(
      user.id,
      "REPLY_ROUTER",
      [msg.waMessageId],
      { mode: routed.mode, confidence: routed.confidence, reason: routed.reason },
      routed.mode === "llm" ? "reply_llm" : routed.mode === "data" ? "reply_data" : "reply_canned",
      null,
      null,
      routed.confidence,
    );
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, routed.response, conversationId, user.id);
    return;
  }

  await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Unsupported request. Send HELP.", conversationId, user.id);
}

function pickLanguage(prefsState: any): "fr" | "en" {
  const lang = String(prefsState?.lang || "").trim().toLowerCase();
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("fr")) return "fr";
  return "fr";
}

async function replyText(tenantId: number | null | undefined, to: string, body: string, conversationId: string, userId: number | null | undefined) {
  const lastSeenAt = await getLastSeenAt(to);
  const within = lastSeenAt ? Date.now() - lastSeenAt.getTime() <= SESSION_WINDOW_MS : true;

  const sendResult = within ? await sendWaText(to, body) : await sendWaTemplate(to, "ORDER_STATUS_UPDATE");

  const now = new Date();
  if (tenantId) {
    await db
      .insert(whatsappConversations)
      .values({
        tenantId,
        conversationId,
        waPhoneE164: to,
        status: "open",
        lastInboundAt: null,
        lastOutboundAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [whatsappConversations.tenantId, whatsappConversations.conversationId],
        set: { waPhoneE164: to, lastOutboundAt: now, updatedAt: now },
      });
  }

  await db.insert(whatsappMessages).values({
    tenantId: tenantId ?? null,
    direction: "out",
    waMessageId: sendResult.ok ? sendResult.waMessageId : `fail_${cryptoRandomId()}`,
    userId: userId ?? null,
    waPhoneE164: to,
    timestamp: now,
    messageType: within ? "text" : "template",
    textBody: within ? body : null,
    payloadJson: { type: within ? "text" : "template", body, templateName: within ? null : "ORDER_STATUS_UPDATE", sendResult },
    conversationId,
    deliveryStatus: sendResult.ok ? "sent" : "failed",
    errorCode: sendResult.ok ? null : sendResult.errorCode || null,
    errorMessage: sendResult.ok ? null : sendResult.error,
  });
}

function cryptoRandomId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

async function getLastSeenAt(phone: string) {
  const row = await db.query.userWhatsappChannels.findFirst({
    where: eq(userWhatsappChannels.waPhoneE164, phone),
  });
  return row?.lastSeenAt || null;
}

async function upsertState(userId: number, stateKey: string, stateJson: any, ttlDays: number) {
  const expiresAt = ttlDays ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000) : null;
  await db
    .insert(waConversationState)
    .values({ userId, stateKey, stateJson, expiresAt })
    .onConflictDoUpdate({
      target: [waConversationState.userId, waConversationState.stateKey],
      set: { stateJson, expiresAt, updatedAt: new Date() },
    });
}

async function getState(userId: number, stateKey: string) {
  const row = await db.query.waConversationState.findFirst({
    where: and(eq(waConversationState.userId, userId), eq(waConversationState.stateKey, stateKey)),
  });
  if (!row) return null;
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) return null;
  return row.stateJson as any;
}

async function clearState(userId: number, stateKey: string) {
  await db.delete(waConversationState).where(and(eq(waConversationState.userId, userId), eq(waConversationState.stateKey, stateKey)));
}

function isSellerLike(roles: string[]) {
  return roles.includes("supplier") || roles.includes("seller");
}

function isAdminLike(roles: string[]) {
  return roles.includes("admin") || roles.includes("ops_agent") || roles.includes("compliance_officer");
}

async function logAction(
  userId: number,
  intent: string,
  inputMessageIds: string[],
  entitiesJson: any,
  actionTaken: string | null,
  resultRefType: string | null,
  resultRefId: string | null,
  confidence: number
) {
  await db.insert(assistantActionsLog).values({
    userId,
    source: "whatsapp",
    intent,
    inputMessageIds,
    entitiesJson,
    actionTaken,
    resultRefType,
    resultRefId,
    confidence: String(Math.max(0, Math.min(1, confidence)).toFixed(2)) as any,
  });
}

async function createOfferDraftFromText(userId: number, freeText: string) {
  const initial = parseOfferFreeText(freeText);
  const [offer] = await db
    .insert(waOffers)
    .values({
      createdByUserId: userId,
      status: "draft",
      type: initial.type || "dore",
      quantity: String(initial.quantity || 0.0),
      unit: initial.unit || "kg",
      locationJson: initial.locationJson || { country: "CI" },
      priceJson: initial.priceJson || null,
      notes: initial.notes || null,
      mediaIds: [],
    })
    .returning();
  return offer;
}

function parseOfferFreeText(text: string) {
  const out: any = {};
  const t = (text || "").toLowerCase();
  const typeMatch = t.match(/\b(dore|dor[eé]|dust|nuggets?|bar|bars)\b/);
  if (typeMatch) out.type = typeMatch[1].replace("doré", "dore").replace("dore", "dore").replace("bars", "bar").replace("nuggets", "nuggets");
  const qtyMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|grams|gram|oz)\b/);
  if (qtyMatch) {
    out.quantity = parseFloat(qtyMatch[1].replace(",", "."));
    out.unit = qtyMatch[2].startsWith("g") ? "g" : qtyMatch[2];
    if (out.unit === "grams" || out.unit === "gram") out.unit = "g";
  }
  const cityMatch = t.match(/\b(abidjan|bouake|yamoussoukro|daloa|korhogo|man|odienne|boundiali|issia|ferkessedougou)\b/);
  if (cityMatch) out.locationJson = { country: "CI", city: cityMatch[1] };
  return out;
}

async function handleOfferCreateStep(userId: number, msg: IncomingMessage, state: any, conversationId: string) {
  const text = (msg.textBody || "").trim();
  const upper = text.toUpperCase();
  if (upper === "CANCEL") {
    await clearState(userId, "offer_create");
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Offer creation cancelled.", conversationId, userId);
    return true;
  }

  const offerId = state.offerId;
  if (!offerId) return false;

  // Accept media as photo collection step.
  if (msg.mediaDbId && state.step === "photos") {
    const offer = await db.query.waOffers.findFirst({ where: eq(waOffers.id, offerId) });
    if (!offer) return false;
    const ids = Array.isArray((offer as any).mediaIds) ? ((offer as any).mediaIds as number[]) : [];
    const next = [...ids, msg.mediaDbId].slice(0, 10);
    await db.update(waOffers).set({ mediaIds: next, updatedAt: new Date() }).where(eq(waOffers.id, offerId));
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Photo received (${next.length}). Send more, or CONFIRM ${offerId}`, conversationId, userId);
    return true;
  }

  // TYPE step via "TYPE dore"
  if (upper.startsWith("TYPE ")) {
    const type = text.split(" ")[1]?.toLowerCase();
    if (!type) return true;
    await db.update(waOffers).set({ type, updatedAt: new Date() }).where(eq(waOffers.id, offerId));
    await upsertState(userId, "offer_create", { offerId, step: "qty" }, 2);
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Reply with: QTY <number> <unit> (e.g. QTY 25 kg)", conversationId, userId);
    return true;
  }

  if (upper.startsWith("QTY ")) {
    const qty = parseQty(text.slice(4));
    if (!qty) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Usage: QTY 25 kg", conversationId, userId);
      return true;
    }
    await db.update(waOffers).set({ quantity: String(qty.value), unit: qty.unit, updatedAt: new Date() }).where(eq(waOffers.id, offerId));
    await upsertState(userId, "offer_create", { offerId, step: "loc" }, 2);
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Reply with: LOC <city/region> (default country = CI)", conversationId, userId);
    return true;
  }

  if (upper.startsWith("LOC ")) {
    const loc = text.slice(4).trim();
    await db
      .update(waOffers)
      .set({ locationJson: { country: "CI", city: loc }, updatedAt: new Date() })
      .where(eq(waOffers.id, offerId));
    await upsertState(userId, "offer_create", { offerId, step: "price" }, 2);
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Reply with: PRICE <amount> <currency> (e.g. PRICE 65000 XOF/g)", conversationId, userId);
    return true;
  }

  if (upper.startsWith("PRICE ")) {
    const price = parsePrice(text.slice(6));
    if (!price) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Usage: PRICE 65000 XOF/g", conversationId, userId);
      return true;
    }
    await db.update(waOffers).set({ priceJson: price, updatedAt: new Date() }).where(eq(waOffers.id, offerId));
    await upsertState(userId, "offer_create", { offerId, step: "photos" }, 2);
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Send 1–5 photos now. Then: CONFIRM <id>", conversationId, userId);
    return true;
  }

  if (upper.startsWith("CONFIRM ")) {
    const id = parseInt(text.split(" ")[1], 10);
    if (id !== offerId) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Confirm the active offer: CONFIRM ${offerId}`, conversationId, userId);
      return true;
    }
    const offer = await db.query.waOffers.findFirst({ where: eq(waOffers.id, offerId) });
    const mediaCount = offer ? (((offer as any).mediaIds || []) as any[]).length : 0;
    if (!offer || !mediaCount) {
      await replyText(msg.tenantId ?? null, msg.waPhoneE164, "Add at least 1 photo before confirming.", conversationId, userId);
      return true;
    }
    await db.update(waOffers).set({ status: "pending_review", updatedAt: new Date() }).where(eq(waOffers.id, offerId));
    await clearState(userId, "offer_create");
    await replyText(msg.tenantId ?? null, msg.waPhoneE164, `Offer #${offerId} submitted for review.`, conversationId, userId);
    return true;
  }

  return false;
}

function parseQty(raw: string) {
  const t = String(raw).trim();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|oz)\b/i);
  if (!m) return null;
  return { value: parseFloat(m[1].replace(",", ".")), unit: m[2].toLowerCase() };
}

function parsePrice(raw: string) {
  const t = String(raw).trim();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*([A-Za-z]{3})(?:\s*\/?\s*([A-Za-z]+))?/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(",", "."));
  const currency = m[2].toUpperCase();
  const unit = m[3] ? m[3] : undefined;
  return { amount, currency, unit };
}

async function listPublishedOffers(filters: string) {
  const baseWhere = eq(waOffers.status, "published");
  if (!filters) {
    return await db.query.waOffers.findMany({ where: baseWhere, orderBy: desc(waOffers.createdAt), limit: 8 });
  }
  const f = `%${filters}%`;
  return await db
    .select()
    .from(waOffers)
    .where(and(baseWhere, ilike(sql`${waOffers.locationJson}::text`, f)))
    .orderBy(desc(waOffers.createdAt))
    .limit(8);
}
