import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  attachmentKind,
  directConversationSlug,
  extractAgoojiyeTaskProposal,
  extractAgoojiyeMentions,
  isActiveAgoojiyeMember,
  isAgoojiyeAssistantMentioned,
  isMeaningfulAgoojiyeTaskTitle,
  messageCanBeEdited,
  normalizeAgoojiyeMemberStatus,
  normalizeAgoojiyePresence,
  resolveThreadRoot,
} from "../server/lib/agoojye/chatLogic";
import { canAccessAgoojiyeOsChannel } from "../server/lib/agoojye/osPolicy";
import { reconcileIncomingMessage } from "../client/src/features/agoojye-chat/reconciliation";
import type {
  ChatMessage,
  MessagePagePayload,
} from "../client/src/features/agoojye-chat/types";

const root = process.cwd();

test("AGOOJIYE chat normalizes member status and presence labels", () => {
  assert.equal(normalizeAgoojiyeMemberStatus("Active"), "active");
  assert.equal(normalizeAgoojiyeMemberStatus("ACTIF"), "active");
  assert.equal(normalizeAgoojiyeMemberStatus("Invité"), "invited");
  assert.equal(isActiveAgoojiyeMember("disabled"), false);
  assert.equal(isActiveAgoojiyeMember("active"), true);
  assert.equal(normalizeAgoojiyePresence("En ligne"), "online");
  assert.equal(normalizeAgoojiyePresence("Occupé"), "busy");
});

test("AGOOJIYE direct-conversation slug is stable in both directions", () => {
  assert.equal(directConversationSlug(42, 7), "dm-7-42");
  assert.equal(directConversationSlug(7, 42), "dm-7-42");
});

test("AGOOJIYE realtime reconciliation collapses optimistic and socket copies", () => {
  const optimistic: ChatMessage = {
    id: -1,
    channelId: 22,
    senderUserId: 1,
    body: "Message de contrôle",
    messageType: "text",
    clientMessageId: "client-message-1",
    attachments: [],
    reactions: [],
    pinned: false,
    deliveryStatus: "sending",
    createdAt: "2026-07-28T02:00:00.000Z",
    threadReplyCount: 0,
    optimistic: true,
  };
  const confirmed: ChatMessage = {
    ...optimistic,
    id: 5,
    deliveryStatus: "sent",
    optimistic: false,
    updatedAt: "2026-07-28T02:00:01.000Z",
  };
  const page: MessagePagePayload = {
    ok: true,
    items: [optimistic],
    page: { hasMore: false, nextBefore: null },
  };
  const seed = { pages: [page], pageParams: [null] };

  const socketFirst = reconcileIncomingMessage(seed, confirmed);
  assert.deepEqual(socketFirst?.pages[0].items.map((message) => message.id), [5]);

  const httpResponseAfterSocket = reconcileIncomingMessage(socketFirst, confirmed);
  assert.equal(httpResponseAfterSocket?.pages[0].items.length, 1);
  assert.equal(httpResponseAfterSocket?.pages[0].items[0].optimistic, false);

  const withoutOptimistic = {
    pages: [{ ...page, items: [] }],
    pageParams: [null],
  };
  const firstEvent = reconcileIncomingMessage(withoutOptimistic, confirmed);
  const duplicateEvent = reconcileIncomingMessage(firstEvent, confirmed);
  assert.deepEqual(duplicateEvent?.pages[0].items.map((message) => message.id), [5]);
});

test("AGOOJIYE direct members can access their DM without weakening private channels", () => {
  const member = { accessLevel: 2, teamId: 12 };
  const memberships = new Set([81]);

  assert.equal(
    canAccessAgoojiyeOsChannel({
      member,
      channel: { id: 81, channelType: "direct", confidentiality: 7 },
      memberChannelIds: memberships,
    }),
    true,
  );
  assert.equal(
    canAccessAgoojiyeOsChannel({
      member,
      channel: { id: 81, channelType: "channel", confidentiality: 7 },
      memberChannelIds: memberships,
    }),
    false,
  );
});

test("AGOOJIYE chat resolves top-level and nested thread roots", () => {
  assert.equal(resolveThreadRoot({}), null);
  assert.equal(resolveThreadRoot({ replyToMessageId: 15 }), 15);
  assert.equal(
    resolveThreadRoot({ replyToMessageId: 22, replyThreadRootMessageId: 15 }),
    15,
  );
});

test("AGOOJIYE mention parser detects the assistant and deduplicates people", () => {
  assert.deepEqual(
    extractAgoojiyeMentions("@Christian bonjour @christian et @Maryse"),
    ["christian", "maryse"],
  );
  assert.equal(isAgoojiyeAssistantMentioned("@AGOOJIYE résume cette discussion."), true);
  assert.equal(isAgoojiyeAssistantMentioned("agoojiye résume cette discussion."), false);
});

test("AGOOJIYE message edit policy protects authorship and time window", () => {
  const recent = new Date(Date.now() - 5 * 60_000);
  const old = new Date(Date.now() - 45 * 60_000);

  assert.equal(
    messageCanBeEdited({ senderUserId: 9, currentUserId: 9, createdAt: recent }),
    true,
  );
  assert.equal(
    messageCanBeEdited({ senderUserId: 8, currentUserId: 9, createdAt: recent }),
    false,
  );
  assert.equal(
    messageCanBeEdited({ senderUserId: 9, currentUserId: 9, createdAt: old }),
    false,
  );
  assert.equal(
    messageCanBeEdited({
      senderUserId: 8,
      currentUserId: 9,
      createdAt: old,
      isAdmin: true,
    }),
    true,
  );
  assert.equal(
    messageCanBeEdited({
      senderUserId: 9,
      currentUserId: 9,
      createdAt: recent,
      deletedAt: recent,
      isAdmin: true,
    }),
    false,
  );
});

test("AGOOJIYE attachment renderer uses safe coarse content kinds", () => {
  assert.equal(attachmentKind("image/png"), "image");
  assert.equal(attachmentKind("audio/webm"), "voice");
  assert.equal(attachmentKind("video/mp4"), "video");
  assert.equal(attachmentKind("application/pdf"), "document");
});

test("AGOOJIYE chat transport enforces idempotence, signed files, reads and MFA", () => {
  const chatRoute = fs.readFileSync(path.join(root, "server/routes/agoojye-chat.ts"), "utf8");
  const aiRoute = fs.readFileSync(path.join(root, "server/routes/agoojye-chat-ai.ts"), "utf8");
  const accessSource = fs.readFileSync(path.join(root, "server/lib/agoojye/chatAccess.ts"), "utf8");
  const socketSource = fs.readFileSync(path.join(root, "server/lib/agoojye/chatSocket.ts"), "utf8");

  assert.match(chatRoute, /pg_advisory_xact_lock/);
  assert.match(chatRoute, /clientMessageId/);
  assert.match(chatRoute, /signedAttachmentUrl/);
  assert.match(chatRoute, /timingSafeEqual/);
  assert.match(chatRoute, /configuredAttachmentSecret/);
  assert.match(chatRoute, /NODE_ENV === "production"/);
  assert.doesNotMatch(chatRoute, /chat-development-only/);
  assert.match(chatRoute, /markedUnreadAt/);
  assert.match(chatRoute, /lastReadMessageId/);
  assert.match(accessSource, /mfaVerifiedAt/);
  assert.match(socketSource, /canAccessAgoojiyeChatChannel/);
  assert.match(socketSource, /socket\.data\.joinedChannels/);
  assert.match(aiRoute, /actions\/:id\/approve/);
  assert.match(aiRoute, /ai_action_approved/);
  assert.match(aiRoute, /actions\/:id\/reject/);
});

test("AGOOJIYE assistant never performs a proposed task before approval", () => {
  const aiRoute = fs.readFileSync(path.join(root, "server/routes/agoojye-chat-ai.ts"), "utf8");
  const proposeIndex = aiRoute.indexOf("proposed");
  const approveIndex = aiRoute.indexOf('router.post("/actions/:id/approve"');
  const taskInsertIndex = aiRoute.indexOf(".insert(agoojyeTasks)", approveIndex);

  assert.ok(proposeIndex >= 0);
  assert.ok(approveIndex > proposeIndex);
  assert.ok(taskInsertIndex > approveIndex);
});

test("AGOOJIYE assistant respects negation and requires a meaningful task title", () => {
  assert.equal(
    extractAgoojiyeTaskProposal(
      "Confirme que l'assistant est disponible, sans créer d'action.",
    ),
    null,
  );
  assert.equal(
    extractAgoojiyeTaskProposal("Ne crée pas de tâche pour ce contrôle."),
    null,
  );
  assert.equal(extractAgoojiyeTaskProposal("Crée une action."), null);
  assert.deepEqual(
    extractAgoojiyeTaskProposal(
      "Transforme ce suivi en tâche : Relancer le fournisseur de batteries.",
    ),
    { title: "Relancer le fournisseur de batteries" },
  );
  assert.deepEqual(
    extractAgoojiyeTaskProposal("Ajoute une tâche pour préparer le rapport hebdomadaire."),
    { title: "préparer le rapport hebdomadaire" },
  );
  assert.equal(isMeaningfulAgoojiyeTaskTitle("."), false);
  assert.equal(isMeaningfulAgoojiyeTaskTitle("Nouvelle tâche"), false);
  assert.equal(isMeaningfulAgoojiyeTaskTitle("RDV Régis"), true);
});

test("AGOOJIYE composer exposes direct uploads and keyboard-first navigation", () => {
  const source = fs.readFileSync(
    path.join(root, "client/src/features/agoojye-chat/CommunicationWorkspace.tsx"),
    "utf8",
  );

  assert.match(source, /onDrop=\{\(event\) =>/);
  assert.match(source, /onPaste=\{\(event\) =>/);
  assert.match(source, /event\.clipboardData\.files/);
  assert.match(source, /event\.dataTransfer\.files/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "k"/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "n"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /maxLength=\{8000\}/);
});
