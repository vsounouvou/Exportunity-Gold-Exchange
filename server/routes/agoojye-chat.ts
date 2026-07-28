import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { Router } from "express";
import multer from "multer";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeOsChannelMembers,
  agoojyeOsChannels,
  agoojyeOsConversationPreferences,
  agoojyeOsConversationReads,
  agoojyeOsMessageAttachments,
  agoojyeOsMessageDeliveries,
  agoojyeOsMessageDrafts,
  agoojyeOsMessageMentions,
  agoojyeOsMessagePins,
  agoojyeOsMessageReactions,
  agoojyeOsMessages,
  agoojyeOsNotifications,
  agoojyeProjectUsers,
} from "@db/schema";

import { ensureTenantUser } from "./utils/auth";
import { requireWorkosMember } from "./agoojye-workos";
import {
  agoojyeChatChannelRoom,
  AGOOJIYE_CHAT_NAMESPACE,
} from "../lib/agoojye/chatSocket";
import {
  canAccessAgoojiyeChatChannel,
  listAccessibleAgoojiyeChatChannels,
} from "../lib/agoojye/chatAccess";
import {
  attachmentKind,
  directConversationSlug,
  extractAgoojiyeMentions,
  isAgoojiyeAssistantMentioned,
  isActiveAgoojiyeMember,
  messageCanBeEdited,
  normalizeAgoojiyeMemberStatus,
  resolveThreadRoot,
} from "../lib/agoojye/chatLogic";
import { runAgoojiyeChatAssistant } from "../lib/agoojye/chatAssistant";
import { persistChatAttachment } from "../lib/uploads/chatAttachments";

const router = Router();
const publicApi = Router();
const memberApi = Router();

const clean = (value: unknown) => String(value ?? "").trim();
const configuredAttachmentSecret =
  clean(process.env.AGOOJIYE_CHAT_ATTACHMENT_SECRET) ||
  clean(process.env.AGOOJIYE_TICKET_SIGNING_SECRET) ||
  clean(process.env.AUTH_SECRET);
const attachmentSecret = configuredAttachmentSecret || randomBytes(32).toString("hex");
const attachmentUrlTtlSeconds = Math.max(
  60,
  Math.min(60 * 60, Number(process.env.AGOOJIYE_CHAT_ATTACHMENT_URL_TTL_SECONDS || 900)),
);

const maxAttachmentBytes = Math.max(
  1 * 1024 * 1024,
  Math.min(
    30 * 1024 * 1024,
    Number(process.env.AGOOJIYE_CHAT_ATTACHMENT_MAX_BYTES || 20 * 1024 * 1024),
  ),
);

const acceptedMimeTypes = new Set([
  "application/json",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
  "video/mp4",
  "video/webm",
]);

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxAttachmentBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    const mimeType = clean(file.mimetype).toLowerCase();
    if (!acceptedMimeTypes.has(mimeType)) {
      callback(new Error("Ce format de fichier n'est pas autorisé."));
      return;
    }
    callback(null, true);
  },
});

function signAttachment(id: string, tenantId: number, expires: number) {
  return createHmac("sha256", attachmentSecret)
    .update(`${id}.${tenantId}.${expires}`)
    .digest("base64url");
}

function signedAttachmentUrl(id: string, tenantId: number) {
  const expires = Math.floor(Date.now() / 1000) + attachmentUrlTtlSeconds;
  const signature = signAttachment(id, tenantId, expires);
  return `/api/agoojye/chat/attachments/${encodeURIComponent(id)}?expires=${expires}&signature=${encodeURIComponent(signature)}`;
}

function safeSignatureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function emitToChannel(req: any, tenantId: number, channelId: number, event: string, payload: unknown) {
  const io = req.app.get("io");
  io?.of(AGOOJIYE_CHAT_NAMESPACE)
    .to(agoojyeChatChannelRoom(tenantId, channelId))
    .emit(event, payload);
}

async function audit(
  tenantId: number,
  member: any,
  action: string,
  entityType: string,
  entityId?: number | null,
  metadata: Record<string, unknown> = {},
) {
  await db.insert(agoojyeAuditLogs).values({
    tenantId,
    actor: clean(member?.email || member?.displayName || member?.id),
    action,
    entityType,
    entityId: entityId || null,
    metadata: { ...metadata, actorMemberId: Number(member?.id || 0) },
  });
}

function aggregateReactions(rows: any[], directory: Map<number, any>) {
  const byMessage = new Map<number, Array<any>>();
  for (const row of rows) {
    const messageId = Number(row.messageId);
    const list = byMessage.get(messageId) || [];
    let group = list.find((entry) => entry.emoji === row.emoji);
    if (!group) {
      group = { emoji: row.emoji, count: 0, userIds: [], users: [] };
      list.push(group);
    }
    group.count += 1;
    group.userIds.push(Number(row.userId));
    group.users.push(directory.get(Number(row.userId))?.displayName || "Membre AGOOJIYE");
    byMessage.set(messageId, list);
  }
  return byMessage;
}

async function hydrateMessages(tenantId: number, rows: any[], currentMemberId: number) {
  if (!rows.length) return [];
  const messageIds = rows.map((row) => Number(row.id));
  const replyIds = rows
    .map((row) => Number(row.replyToMessageId || 0))
    .filter((id) => id > 0);
  const [attachments, reactions, pins, deliveries, threadCounts, replyRows, directoryRows] =
    await Promise.all([
      db.query.agoojyeOsMessageAttachments.findMany({
        where: and(
          eq(agoojyeOsMessageAttachments.tenantId, tenantId),
          inArray(agoojyeOsMessageAttachments.messageId, messageIds),
          eq(agoojyeOsMessageAttachments.status, "ready"),
        ),
        orderBy: [asc(agoojyeOsMessageAttachments.createdAt)],
      }),
      db.query.agoojyeOsMessageReactions.findMany({
        where: and(
          eq(agoojyeOsMessageReactions.tenantId, tenantId),
          inArray(agoojyeOsMessageReactions.messageId, messageIds),
        ),
      }),
      db.query.agoojyeOsMessagePins.findMany({
        where: and(
          eq(agoojyeOsMessagePins.tenantId, tenantId),
          inArray(agoojyeOsMessagePins.messageId, messageIds),
        ),
      }),
      db.query.agoojyeOsMessageDeliveries.findMany({
        where: and(
          eq(agoojyeOsMessageDeliveries.tenantId, tenantId),
          inArray(agoojyeOsMessageDeliveries.messageId, messageIds),
        ),
      }),
      db
        .select({
          rootId: agoojyeOsMessages.threadRootMessageId,
          count: sql<number>`count(*)::int`,
        })
        .from(agoojyeOsMessages)
        .where(
          and(
            eq(agoojyeOsMessages.tenantId, tenantId),
            inArray(agoojyeOsMessages.threadRootMessageId, messageIds),
            isNull(agoojyeOsMessages.deletedAt),
          ),
        )
        .groupBy(agoojyeOsMessages.threadRootMessageId),
      replyIds.length
        ? db
            .select({
              id: agoojyeOsMessages.id,
              body: agoojyeOsMessages.body,
              deletedAt: agoojyeOsMessages.deletedAt,
              senderName: agoojyeProjectUsers.displayName,
            })
            .from(agoojyeOsMessages)
            .leftJoin(
              agoojyeProjectUsers,
              eq(agoojyeProjectUsers.id, agoojyeOsMessages.senderUserId),
            )
            .where(
              and(
                eq(agoojyeOsMessages.tenantId, tenantId),
                inArray(agoojyeOsMessages.id, replyIds),
              ),
            )
        : Promise.resolve([]),
      db.query.agoojyeProjectUsers.findMany({
        where: eq(agoojyeProjectUsers.tenantId, tenantId),
        columns: { id: true, displayName: true },
      }),
    ]);

  const directory = new Map(directoryRows.map((row) => [Number(row.id), row]));
  const reactionGroups = aggregateReactions(reactions, directory);
  const pinnedIds = new Set(pins.map((row) => Number(row.messageId)));
  const attachmentsByMessage = new Map<number, any[]>();
  for (const attachment of attachments) {
    const messageId = Number(attachment.messageId);
    const list = attachmentsByMessage.get(messageId) || [];
    list.push({
      id: attachment.id,
      name: attachment.originalName,
      mimeType: attachment.mimeType,
      byteSize: attachment.byteSize,
      kind: attachment.kind,
      url: signedAttachmentUrl(String(attachment.id), tenantId),
    });
    attachmentsByMessage.set(messageId, list);
  }
  const deliveriesByMessage = new Map<number, any[]>();
  for (const delivery of deliveries) {
    const messageId = Number(delivery.messageId);
    const list = deliveriesByMessage.get(messageId) || [];
    list.push({
      userId: Number(delivery.userId),
      status: delivery.status,
      deliveredAt: delivery.deliveredAt,
      readAt: delivery.readAt,
    });
    deliveriesByMessage.set(messageId, list);
  }
  const threadCountByRoot = new Map(
    threadCounts.map((entry) => [Number(entry.rootId), Number(entry.count)]),
  );
  const replyById = new Map(replyRows.map((row) => [Number(row.id), row]));

  return rows.map((row) => {
    const deleted = Boolean(row.deletedAt);
    const legacyAttachments = deleted
      ? []
      : Array.isArray(row.attachments)
        ? row.attachments
        : [];
    const normalizedAttachments = deleted
      ? []
      : [...(attachmentsByMessage.get(Number(row.id)) || []), ...legacyAttachments];
    const deliveryRows = deliveriesByMessage.get(Number(row.id)) || [];
    const otherDeliveries = deliveryRows.filter(
      (delivery) => Number(delivery.userId) !== currentMemberId,
    );
    const deliveryStatus = otherDeliveries.some((delivery) => delivery.readAt)
      ? "read"
      : otherDeliveries.some((delivery) => delivery.deliveredAt)
        ? "delivered"
        : row.deliveryStatus || "sent";
    const reply = replyById.get(Number(row.replyToMessageId || 0));
    return {
      ...row,
      body: deleted ? "Ce message a été supprimé." : row.body,
      attachments: normalizedAttachments,
      reactions: reactionGroups.get(Number(row.id)) || [],
      pinned: pinnedIds.has(Number(row.id)) || Boolean(row.pinnedAt),
      threadReplyCount: threadCountByRoot.get(Number(row.id)) || 0,
      deliveryStatus,
      deliveryReceipts: otherDeliveries,
      replyPreview: reply
        ? {
            id: Number(reply.id),
            senderName: reply.senderName || "AGOOJIYE",
            body: reply.deletedAt ? "Message supprimé" : clean(reply.body).slice(0, 180),
          }
        : null,
    };
  });
}

async function selectMessageRows(input: {
  tenantId: number;
  channelId: number;
  before?: number;
  limit: number;
  threadRootId?: number;
}) {
  const conditions: any[] = [
    eq(agoojyeOsMessages.tenantId, input.tenantId),
    eq(agoojyeOsMessages.channelId, input.channelId),
  ];
  if (input.before) conditions.push(lt(agoojyeOsMessages.id, input.before));
  if (input.threadRootId) {
    conditions.push(
      or(
        eq(agoojyeOsMessages.id, input.threadRootId),
        eq(agoojyeOsMessages.threadRootMessageId, input.threadRootId),
      ),
    );
  } else {
    conditions.push(isNull(agoojyeOsMessages.threadRootMessageId));
  }
  return db
    .select({
      id: agoojyeOsMessages.id,
      channelId: agoojyeOsMessages.channelId,
      senderUserId: agoojyeOsMessages.senderUserId,
      body: agoojyeOsMessages.body,
      messageType: agoojyeOsMessages.messageType,
      replyToMessageId: agoojyeOsMessages.replyToMessageId,
      threadRootMessageId: agoojyeOsMessages.threadRootMessageId,
      clientMessageId: agoojyeOsMessages.clientMessageId,
      attachments: agoojyeOsMessages.attachments,
      pinnedAt: agoojyeOsMessages.pinnedAt,
      editedAt: agoojyeOsMessages.editedAt,
      deletedAt: agoojyeOsMessages.deletedAt,
      scheduledAt: agoojyeOsMessages.scheduledAt,
      sentAt: agoojyeOsMessages.sentAt,
      deliveryStatus: agoojyeOsMessages.deliveryStatus,
      confidentiality: agoojyeOsMessages.confidentiality,
      createdAt: agoojyeOsMessages.createdAt,
      updatedAt: agoojyeOsMessages.updatedAt,
      senderName: agoojyeProjectUsers.displayName,
      senderRole: agoojyeProjectUsers.role,
    })
    .from(agoojyeOsMessages)
    .leftJoin(
      agoojyeProjectUsers,
      eq(agoojyeProjectUsers.id, agoojyeOsMessages.senderUserId),
    )
    .where(and(...conditions))
    .orderBy(desc(agoojyeOsMessages.id))
    .limit(input.limit);
}

async function markConversationRead(
  tenantId: number,
  channelId: number,
  memberId: number,
  lastMessageId: number | null,
) {
  const now = new Date();
  await db
    .insert(agoojyeOsConversationReads)
    .values({
      tenantId,
      channelId,
      userId: memberId,
      lastReadMessageId: lastMessageId,
      lastReadAt: now,
      markedUnreadAt: null,
    })
    .onConflictDoUpdate({
      target: [
        agoojyeOsConversationReads.channelId,
        agoojyeOsConversationReads.userId,
      ],
      set: {
        lastReadMessageId: lastMessageId,
        lastReadAt: now,
        markedUnreadAt: null,
        updatedAt: now,
      },
    });
  if (lastMessageId) {
    const messageIds = await db
      .select({ id: agoojyeOsMessages.id })
      .from(agoojyeOsMessages)
      .where(
        and(
          eq(agoojyeOsMessages.tenantId, tenantId),
          eq(agoojyeOsMessages.channelId, channelId),
          sql`${agoojyeOsMessages.id} <= ${lastMessageId}`,
        ),
      );
    if (messageIds.length) {
      await db
        .update(agoojyeOsMessageDeliveries)
        .set({ status: "read", deliveredAt: now, readAt: now, updatedAt: now })
        .where(
          and(
            eq(agoojyeOsMessageDeliveries.tenantId, tenantId),
            eq(agoojyeOsMessageDeliveries.userId, memberId),
            inArray(
              agoojyeOsMessageDeliveries.messageId,
              messageIds.map((entry) => Number(entry.id)),
            ),
          ),
        );
    }
  }
  return now;
}

publicApi.get("/attachments/:id", async (req, res) => {
  if (process.env.NODE_ENV === "production" && !configuredAttachmentSecret) {
    return res.status(503).json({
      message: "Le téléchargement sécurisé n'est pas configuré.",
    });
  }
  const id = clean(req.params.id);
  const expires = Number(req.query.expires);
  const signature = clean(req.query.signature);
  if (!id || !Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) {
    return res.status(403).json({ message: "Ce lien de fichier a expiré." });
  }
  const attachment = await db.query.agoojyeOsMessageAttachments.findFirst({
    where: and(
      eq(agoojyeOsMessageAttachments.id, id),
      eq(agoojyeOsMessageAttachments.status, "ready"),
    ),
  });
  if (
    !attachment ||
    !signature ||
    !safeSignatureEqual(
      signature,
      signAttachment(id, Number(attachment.tenantId), expires),
    )
  ) {
    return res.status(403).json({ message: "Lien de fichier invalide." });
  }
  try {
    const file = await stat(attachment.storageKey);
    if (!file.isFile()) throw new Error("not-a-file");
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Length", String(file.size));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${clean(attachment.originalName).replace(/["\r\n]/g, "_")}"`,
    );
    res.setHeader("Cache-Control", "private, max-age=300, no-transform");
    createReadStream(attachment.storageKey).pipe(res);
  } catch {
    return res.status(404).json({ message: "Fichier introuvable." });
  }
});

memberApi.use(ensureTenantUser);
memberApi.use(requireWorkosMember);
memberApi.use((_req, res, next) => {
  if (process.env.NODE_ENV === "production" && !configuredAttachmentSecret) {
    return res.status(503).json({
      message: "La messagerie sécurisée n'est pas configurée.",
    });
  }
  next();
});
memberApi.use((req: any, _res, next) => {
  req.chatTenantId = Number(req.workosTenantId);
  req.chatMember = req.workosMember;
  next();
});

memberApi.get("/conversations", async (req: any, res) => {
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const channels = await listAccessibleAgoojiyeChatChannels(tenantId, member);
  if (!channels.length) return res.json({ ok: true, items: [], unreadTotal: 0 });
  const channelIds = channels.map((channel) => Number(channel.id));
  const [reads, preferences, memberships, directory] = await Promise.all([
    db.query.agoojyeOsConversationReads.findMany({
      where: and(
        eq(agoojyeOsConversationReads.tenantId, tenantId),
        eq(agoojyeOsConversationReads.userId, Number(member.id)),
        inArray(agoojyeOsConversationReads.channelId, channelIds),
      ),
    }),
    db.query.agoojyeOsConversationPreferences.findMany({
      where: and(
        eq(agoojyeOsConversationPreferences.tenantId, tenantId),
        eq(agoojyeOsConversationPreferences.userId, Number(member.id)),
        inArray(agoojyeOsConversationPreferences.channelId, channelIds),
      ),
    }),
    db.query.agoojyeOsChannelMembers.findMany({
      where: and(
        eq(agoojyeOsChannelMembers.tenantId, tenantId),
        inArray(agoojyeOsChannelMembers.channelId, channelIds),
      ),
    }),
    db.query.agoojyeProjectUsers.findMany({
      where: eq(agoojyeProjectUsers.tenantId, tenantId),
      orderBy: [asc(agoojyeProjectUsers.displayName)],
    }),
  ]);
  const readByChannel = new Map(reads.map((entry) => [Number(entry.channelId), entry]));
  const preferenceByChannel = new Map(
    preferences.map((entry) => [Number(entry.channelId), entry]),
  );
  const directoryById = new Map(directory.map((entry) => [Number(entry.id), entry]));
  const membersByChannel = new Map<number, any[]>();
  for (const membership of memberships) {
    const channelId = Number(membership.channelId);
    const list = membersByChannel.get(channelId) || [];
    const profile = directoryById.get(Number(membership.userId));
    if (profile) list.push(profile);
    membersByChannel.set(channelId, list);
  }

  const items = await Promise.all(
    channels.map(async (channel) => {
      const channelId = Number(channel.id);
      const read = readByChannel.get(channelId);
      const readBoundary = read?.markedUnreadAt || read?.lastReadAt || new Date(0);
      const [latestRows, unreadRows] = await Promise.all([
        selectMessageRows({ tenantId, channelId, limit: 1 }),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(agoojyeOsMessages)
          .where(
            and(
              eq(agoojyeOsMessages.tenantId, tenantId),
              eq(agoojyeOsMessages.channelId, channelId),
              gt(agoojyeOsMessages.createdAt, readBoundary),
              ne(agoojyeOsMessages.senderUserId, Number(member.id)),
              isNull(agoojyeOsMessages.deletedAt),
            ),
          ),
      ]);
      const members = membersByChannel.get(channelId) || [];
      const otherMember =
        channel.channelType === "direct"
          ? members.find((entry) => Number(entry.id) !== Number(member.id))
          : null;
      const preference = preferenceByChannel.get(channelId);
      const latest = latestRows[0];
      return {
        id: channelId,
        slug: channel.slug,
        name: otherMember?.displayName || channel.name,
        description:
          channel.channelType === "direct"
            ? otherMember?.role || "Conversation directe"
            : channel.description,
        type: channel.channelType === "direct" ? "direct" : "channel",
        teamId: channel.teamId,
        projectId: channel.projectId,
        confidentiality: channel.confidentiality,
        memberCount: members.length,
        members: members.slice(0, 12).map((entry) => ({
          id: Number(entry.id),
          displayName: entry.displayName,
          role: entry.role,
          status: normalizeAgoojiyeMemberStatus(entry.status),
        })),
        peer: otherMember
          ? {
              id: Number(otherMember.id),
              displayName: otherMember.displayName,
              role: otherMember.role,
              status: normalizeAgoojiyeMemberStatus(otherMember.status),
            }
          : null,
        unreadCount: Number(unreadRows[0]?.count || 0),
        favorite: Boolean(preference?.favorite),
        archived: Boolean(preference?.archived),
        mutedUntil: preference?.mutedUntil || null,
        folder: preference?.folder || null,
        lastMessage: latest
          ? {
              id: Number(latest.id),
              body: latest.deletedAt
                ? "Message supprimé"
                : clean(latest.body).slice(0, 180),
              senderUserId: latest.senderUserId,
              senderName: latest.senderName,
              createdAt: latest.createdAt,
              messageType: latest.messageType,
            }
          : null,
        updatedAt: latest?.createdAt || channel.updatedAt,
      };
    }),
  );
  items.sort((left, right) => {
    if (left.favorite !== right.favorite) return left.favorite ? -1 : 1;
    return (
      new Date(right.updatedAt || 0).getTime() -
      new Date(left.updatedAt || 0).getTime()
    );
  });
  return res.json({
    ok: true,
    items,
    unreadTotal: items.reduce((total, item) => total + item.unreadCount, 0),
    directory: directory
      .filter(
        (entry) =>
          Number(entry.id) !== Number(member.id) && isActiveAgoojiyeMember(entry.status),
      )
      .map((entry) => ({
        id: Number(entry.id),
        displayName: entry.displayName,
        firstName: entry.firstName,
        role: entry.role,
        teamId: entry.teamId,
        status: normalizeAgoojiyeMemberStatus(entry.status),
      })),
  });
});

memberApi.get("/channels/:id/messages", async (req: any, res) => {
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const channelId = Number(req.params.id);
  const channel = await canAccessAgoojiyeChatChannel(tenantId, member, channelId);
  if (!channel) return res.status(403).json({ message: "Conversation non autorisée." });
  const parsed = z
    .object({
      before: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(10).max(100).default(50),
      thread: z.coerce.number().int().positive().optional(),
      markRead: z.enum(["true", "false"]).default("true"),
    })
    .safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "Pagination invalide." });
  const rows = await selectMessageRows({
    tenantId,
    channelId,
    before: parsed.data.before,
    limit: parsed.data.limit + 1,
    threadRootId: parsed.data.thread,
  });
  const hasMore = rows.length > parsed.data.limit;
  const pageRows = rows.slice(0, parsed.data.limit);
  const ordered = [...pageRows].reverse();
  const items = await hydrateMessages(tenantId, ordered, Number(member.id));
  const lastMessageId = ordered.length ? Number(ordered[ordered.length - 1].id) : null;
  if (parsed.data.markRead === "true" && !parsed.data.thread) {
    const readAt = await markConversationRead(
      tenantId,
      channelId,
      Number(member.id),
      lastMessageId,
    );
    emitToChannel(req, tenantId, channelId, "conversation:read", {
      channelId,
      userId: Number(member.id),
      lastReadMessageId: lastMessageId,
      readAt,
    });
  }
  return res.json({
    ok: true,
    items,
    page: {
      hasMore,
      nextBefore: hasMore ? Number(pageRows[pageRows.length - 1]?.id || 0) : null,
    },
  });
});

const createMessageSchema = z
  .object({
    body: z.string().trim().max(8000).default(""),
    clientMessageId: z.string().uuid(),
    messageType: z
      .enum(["text", "voice", "image", "video", "document", "announcement"])
      .default("text"),
    replyToMessageId: z.coerce.number().int().positive().optional(),
    attachmentIds: z.array(z.string().uuid()).max(10).default([]),
    mentionUserIds: z.array(z.coerce.number().int().positive()).max(30).default([]),
    scheduledAt: z.string().datetime().optional(),
  })
  .refine((value) => Boolean(value.body || value.attachmentIds.length), {
    message: "Le message ou une pièce jointe est requis.",
  });

memberApi.post("/channels/:id/messages", async (req: any, res) => {
  const parsed = createMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message || "Le message est invalide.",
    });
  }
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const channelId = Number(req.params.id);
  const channel = await canAccessAgoojiyeChatChannel(tenantId, member, channelId);
  if (!channel) return res.status(403).json({ message: "Conversation non autorisée." });
  if (
    parsed.data.messageType === "announcement" &&
    Number(member.accessLevel || 0) < 4
  ) {
    return res
      .status(403)
      .json({ message: "La publication d'annonces nécessite une autorisation." });
  }
  const scheduledAt = parsed.data.scheduledAt
    ? new Date(parsed.data.scheduledAt)
    : null;
  if (scheduledAt && scheduledAt.getTime() <= Date.now() + 60_000) {
    return res.status(400).json({
      message: "Un message planifié doit être envoyé dans plus d'une minute.",
    });
  }

  let created: any;
  let wasExisting = false;
  try {
    created = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${tenantId}:${channelId}:${parsed.data.clientMessageId}`}))`,
      );
      const existing = await tx.query.agoojyeOsMessages.findFirst({
        where: and(
          eq(agoojyeOsMessages.tenantId, tenantId),
          eq(agoojyeOsMessages.channelId, channelId),
          eq(agoojyeOsMessages.clientMessageId, parsed.data.clientMessageId),
        ),
      });
      if (existing) {
        wasExisting = true;
        return existing;
      }
      const reply = parsed.data.replyToMessageId
        ? await tx.query.agoojyeOsMessages.findFirst({
            where: and(
              eq(agoojyeOsMessages.tenantId, tenantId),
              eq(agoojyeOsMessages.channelId, channelId),
              eq(agoojyeOsMessages.id, parsed.data.replyToMessageId),
              isNull(agoojyeOsMessages.deletedAt),
            ),
          })
        : null;
      if (parsed.data.replyToMessageId && !reply) {
        throw new Error("REPLY_NOT_FOUND");
      }
      const uploadedAttachments = parsed.data.attachmentIds.length
        ? await tx.query.agoojyeOsMessageAttachments.findMany({
            where: and(
              eq(agoojyeOsMessageAttachments.tenantId, tenantId),
              eq(agoojyeOsMessageAttachments.channelId, channelId),
              inArray(agoojyeOsMessageAttachments.id, parsed.data.attachmentIds),
              eq(agoojyeOsMessageAttachments.uploadedBy, Number(member.id)),
              isNull(agoojyeOsMessageAttachments.messageId),
              eq(agoojyeOsMessageAttachments.status, "ready"),
            ),
          })
        : [];
      if (uploadedAttachments.length !== parsed.data.attachmentIds.length) {
        throw new Error("ATTACHMENT_NOT_AVAILABLE");
      }
      const [message] = await tx
        .insert(agoojyeOsMessages)
        .values({
          tenantId,
          channelId,
          senderUserId: Number(member.id),
          body: parsed.data.body,
          messageType: parsed.data.messageType,
          replyToMessageId: reply ? Number(reply.id) : null,
          threadRootMessageId: resolveThreadRoot({
            replyToMessageId: reply ? Number(reply.id) : null,
            replyThreadRootMessageId: reply?.threadRootMessageId,
          }),
          clientMessageId: parsed.data.clientMessageId,
          attachments: [],
          scheduledAt,
          sentAt: scheduledAt ? null : new Date(),
          deliveryStatus: scheduledAt ? "scheduled" : "sent",
          confidentiality: Number(channel.confidentiality || 2),
        })
        .returning();
      if (uploadedAttachments.length) {
        await tx
          .update(agoojyeOsMessageAttachments)
          .set({ messageId: Number(message.id), updatedAt: new Date() })
          .where(
            inArray(
              agoojyeOsMessageAttachments.id,
              uploadedAttachments.map((entry) => String(entry.id)),
            ),
          );
      }
      const channelMembers = await tx.query.agoojyeOsChannelMembers.findMany({
        where: and(
          eq(agoojyeOsChannelMembers.tenantId, tenantId),
          eq(agoojyeOsChannelMembers.channelId, channelId),
        ),
      });
      const recipients = channelMembers
        .map((entry) => Number(entry.userId))
        .filter((id) => id !== Number(member.id));
      if (recipients.length) {
        await tx
          .insert(agoojyeOsMessageDeliveries)
          .values(
            recipients.map((userId) => ({
              tenantId,
              messageId: Number(message.id),
              userId,
              status: scheduledAt ? "scheduled" : "sent",
            })),
          )
          .onConflictDoNothing();
      }
      const allowedMentionIds = parsed.data.mentionUserIds.filter((id) =>
        channelMembers.some((entry) => Number(entry.userId) === id),
      );
      if (allowedMentionIds.length) {
        await tx
          .insert(agoojyeOsMessageMentions)
          .values(
            [...new Set(allowedMentionIds)].map((userId) => ({
              tenantId,
              messageId: Number(message.id),
              userId,
            })),
          )
          .onConflictDoNothing();
      }
      if (recipients.length && !scheduledAt) {
        const mentionSet = new Set(allowedMentionIds);
        await tx.insert(agoojyeOsNotifications).values(
          recipients.map((userId) => ({
            tenantId,
            userId,
            type: mentionSet.has(userId) ? "mention" : "message",
            title:
              channel.channelType === "direct"
                ? `Nouveau message de ${member.displayName}`
                : mentionSet.has(userId)
                  ? `${member.displayName} vous a mentionné`
                  : `Nouveau message dans #${channel.name}`,
            body: parsed.data.body.slice(0, 160),
            link: `/workspace/messages?channel=${channelId}`,
          })),
        );
      }
      return message;
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "REPLY_NOT_FOUND") {
      return res.status(409).json({ message: "Le message auquel vous répondez n'existe plus." });
    }
    if (code === "ATTACHMENT_NOT_AVAILABLE") {
      return res.status(409).json({
        message: "Une pièce jointe n'est plus disponible. Ajoutez-la de nouveau.",
      });
    }
    throw error;
  }
  const rows = await selectMessageRows({ tenantId, channelId, limit: 1 });
  const sourceRow =
    rows.find((row) => Number(row.id) === Number(created.id)) || {
      ...created,
      senderName: member.displayName,
      senderRole: member.role,
    };
  const [item] = await hydrateMessages(
    tenantId,
    [sourceRow],
    Number(member.id),
  );
  if (!wasExisting && !scheduledAt) {
    emitToChannel(req, tenantId, channelId, "message:created", { item });
    await audit(tenantId, member, "chat_message_created", "os_message", Number(created.id), {
      channelId,
      messageType: parsed.data.messageType,
      attachmentCount: parsed.data.attachmentIds.length,
      mentionCount: parsed.data.mentionUserIds.length,
      mentionedAliases: extractAgoojiyeMentions(parsed.data.body),
    });
  }
  return res.status(wasExisting ? 200 : 201).json({ ok: true, item, idempotent: wasExisting });
});

memberApi.post("/channels/:id/assistant-reply", async (req: any, res) => {
  const parsed = z
    .object({ messageId: z.coerce.number().int().positive() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Message source invalide." });
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const channelId = Number(req.params.id);
  const channel = await canAccessAgoojiyeChatChannel(tenantId, member, channelId);
  if (!channel) return res.status(403).json({ message: "Conversation non autorisée." });
  const source = await db.query.agoojyeOsMessages.findFirst({
    where: and(
      eq(agoojyeOsMessages.tenantId, tenantId),
      eq(agoojyeOsMessages.channelId, channelId),
      eq(agoojyeOsMessages.id, parsed.data.messageId),
      eq(agoojyeOsMessages.senderUserId, Number(member.id)),
      isNull(agoojyeOsMessages.deletedAt),
    ),
  });
  if (!source || !isAgoojiyeAssistantMentioned(source.body)) {
    return res.status(409).json({
      message: "Ce message ne contient pas une mention valide de @AGOOJIYE.",
    });
  }
  const clientMessageId = `assistant-reply:${source.id}`;
  const existing = await db.query.agoojyeOsMessages.findFirst({
    where: and(
      eq(agoojyeOsMessages.tenantId, tenantId),
      eq(agoojyeOsMessages.channelId, channelId),
      eq(agoojyeOsMessages.clientMessageId, clientMessageId),
    ),
  });
  let assistantMessage = existing;
  let generation: any = null;
  if (!assistantMessage) {
    const query =
      clean(source.body)
        .replace(/(^|\s)@agoojiye(?:\s|$|[.,!?;:])/giu, " ")
        .replace(/\s+/g, " ")
        .trim() || "Résume les éléments utiles pour cette conversation.";
    const result = await runAgoojiyeChatAssistant({
      tenantId,
      member,
      query,
      contextType: channel.projectId
        ? "project"
        : channel.teamId
          ? "department"
          : "personal",
      contextId: channel.projectId
        ? String(channel.projectId)
        : channel.teamId
          ? String(channel.teamId)
          : null,
      contextLabel: channel.projectId
        ? `Projet ${channel.name}`
        : channel.teamId
          ? `Département ${channel.name}`
          : `Conversation ${channel.name}`,
    });
    generation = result.generation;
    assistantMessage = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${tenantId}:${channelId}:${clientMessageId}`}))`,
      );
      const duplicate = await tx.query.agoojyeOsMessages.findFirst({
        where: and(
          eq(agoojyeOsMessages.tenantId, tenantId),
          eq(agoojyeOsMessages.channelId, channelId),
          eq(agoojyeOsMessages.clientMessageId, clientMessageId),
        ),
      });
      if (duplicate) return duplicate;
      const [created] = await tx
        .insert(agoojyeOsMessages)
        .values({
          tenantId,
          channelId,
          senderUserId: null,
          body: result.answer,
          messageType: "assistant",
          replyToMessageId: Number(source.id),
          threadRootMessageId: null,
          clientMessageId,
          attachments: [],
          sentAt: new Date(),
          deliveryStatus: "sent",
          confidentiality: Number(channel.confidentiality || 2),
          metadata: {
            visibleAssistant: true,
            sourceMessageId: Number(source.id),
            sources: result.matches,
            generationMode: result.generation.mode,
          },
        })
        .returning();
      const channelMembers = await tx.query.agoojyeOsChannelMembers.findMany({
        where: and(
          eq(agoojyeOsChannelMembers.tenantId, tenantId),
          eq(agoojyeOsChannelMembers.channelId, channelId),
        ),
      });
      if (channelMembers.length) {
        await tx
          .insert(agoojyeOsMessageDeliveries)
          .values(
            channelMembers.map((membership) => ({
              tenantId,
              messageId: Number(created.id),
              userId: Number(membership.userId),
              status: Number(membership.userId) === Number(member.id) ? "read" : "sent",
              deliveredAt:
                Number(membership.userId) === Number(member.id) ? new Date() : null,
              readAt: Number(membership.userId) === Number(member.id) ? new Date() : null,
            })),
          )
          .onConflictDoNothing();
      }
      return created;
    });
    await audit(
      tenantId,
      member,
      "chat_visible_assistant_reply",
      "os_message",
      Number(assistantMessage.id),
      {
        channelId,
        sourceMessageId: Number(source.id),
        generationMode: result.generation.mode,
        provider: result.generation.provider,
        model: result.generation.model,
        recordsAccessed: result.recordsAccessed,
      },
    );
  }
  const latestRows = await selectMessageRows({ tenantId, channelId, limit: 10 });
  const row =
    latestRows.find((entry) => Number(entry.id) === Number(assistantMessage.id)) || {
      ...assistantMessage,
      senderName: "AGOOJIYE — Assistant IA",
      senderRole: "Assistant IA",
    };
  const [item] = await hydrateMessages(tenantId, [row], Number(member.id));
  if (!existing) {
    emitToChannel(req, tenantId, channelId, "message:created", { item });
  }
  return res.status(existing ? 200 : 201).json({
    ok: true,
    item,
    idempotent: Boolean(existing),
    generation,
  });
});

memberApi.post(
  "/channels/:id/attachments",
  (req, res, next) => {
    attachmentUpload.single("file")(req, res, (error) => {
      if (error) {
        const message =
          error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
            ? `Le fichier dépasse la limite de ${Math.round(maxAttachmentBytes / 1024 / 1024)} Mo.`
            : error?.message || "Le fichier n'a pas pu être ajouté.";
        res.status(400).json({ message });
        return;
      }
      next();
    });
  },
  async (req: any, res) => {
    const tenantId = Number(req.chatTenantId);
    const member = req.chatMember;
    const channelId = Number(req.params.id);
    const channel = await canAccessAgoojiyeChatChannel(tenantId, member, channelId);
    if (!channel) return res.status(403).json({ message: "Conversation non autorisée." });
    if (!req.file) return res.status(400).json({ message: "Sélectionnez un fichier." });
    const stored = await persistChatAttachment({ tenantKey: "agoojye", file: req.file });
    const [attachment] = await db
      .insert(agoojyeOsMessageAttachments)
      .values({
        tenantId,
        channelId,
        uploadedBy: Number(member.id),
        originalName: clean(req.file.originalname).slice(0, 240),
        storageKey: stored.absolutePath,
        mimeType: clean(req.file.mimetype).toLowerCase(),
        byteSize: Number(req.file.size),
        sha256: stored.sha256,
        kind: attachmentKind(req.file.mimetype),
        metadata: { storedFileName: stored.fileName },
      })
      .returning();
    await audit(
      tenantId,
      member,
      "chat_attachment_uploaded",
      "os_message_attachment",
      null,
      {
        attachmentId: attachment.id,
        channelId,
        mimeType: attachment.mimeType,
        byteSize: attachment.byteSize,
        sha256: attachment.sha256,
      },
    );
    return res.status(201).json({
      ok: true,
      item: {
        id: attachment.id,
        name: attachment.originalName,
        mimeType: attachment.mimeType,
        byteSize: attachment.byteSize,
        kind: attachment.kind,
        url: signedAttachmentUrl(String(attachment.id), tenantId),
      },
    });
  },
);

memberApi.post("/direct/:userId", async (req: any, res) => {
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const targetUserId = Number(req.params.userId);
  if (
    !Number.isFinite(targetUserId) ||
    targetUserId <= 0 ||
    targetUserId === Number(member.id)
  ) {
    return res.status(400).json({ message: "Destinataire invalide." });
  }
  const target = await db.query.agoojyeProjectUsers.findFirst({
    where: and(
      eq(agoojyeProjectUsers.tenantId, tenantId),
      eq(agoojyeProjectUsers.id, targetUserId),
    ),
  });
  if (!target || !isActiveAgoojiyeMember(target.status)) {
    return res.status(404).json({ message: "Membre introuvable ou inactif." });
  }
  const slug = directConversationSlug(Number(member.id), targetUserId);
  const [channel] = await db
    .insert(agoojyeOsChannels)
    .values({
      tenantId,
      slug,
      name: `${member.displayName} & ${target.displayName}`,
      description: "Conversation directe",
      channelType: "direct",
      confidentiality: Math.min(
        Number(member.accessLevel || 1),
        Number(target.accessLevel || 1),
      ),
      createdBy: Number(member.id),
    })
    .onConflictDoUpdate({
      target: [agoojyeOsChannels.tenantId, agoojyeOsChannels.slug],
      set: { status: "active", updatedAt: new Date() },
    })
    .returning();
  await db
    .insert(agoojyeOsChannelMembers)
    .values(
      [Number(member.id), targetUserId].map((userId) => ({
        tenantId,
        channelId: Number(channel.id),
        userId,
        role: "member",
      })),
    )
    .onConflictDoNothing();
  return res.json({ ok: true, item: { id: Number(channel.id), type: "direct" } });
});

const preferenceSchema = z.object({
  favorite: z.boolean().optional(),
  archived: z.boolean().optional(),
  mutedUntil: z.string().datetime().nullable().optional(),
  folder: z.string().trim().max(80).nullable().optional(),
});

memberApi.patch("/channels/:id/preferences", async (req: any, res) => {
  const parsed = preferenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Préférences invalides." });
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const channelId = Number(req.params.id);
  const channel = await canAccessAgoojiyeChatChannel(tenantId, member, channelId);
  if (!channel) return res.status(403).json({ message: "Conversation non autorisée." });
  const existing = await db.query.agoojyeOsConversationPreferences.findFirst({
    where: and(
      eq(agoojyeOsConversationPreferences.channelId, channelId),
      eq(agoojyeOsConversationPreferences.userId, Number(member.id)),
    ),
  });
  const values = {
    favorite: parsed.data.favorite ?? existing?.favorite ?? false,
    archived: parsed.data.archived ?? existing?.archived ?? false,
    mutedUntil:
      parsed.data.mutedUntil === undefined
        ? existing?.mutedUntil || null
        : parsed.data.mutedUntil
          ? new Date(parsed.data.mutedUntil)
          : null,
    folder:
      parsed.data.folder === undefined ? existing?.folder || null : parsed.data.folder,
    updatedAt: new Date(),
  };
  const [item] = await db
    .insert(agoojyeOsConversationPreferences)
    .values({
      tenantId,
      channelId,
      userId: Number(member.id),
      ...values,
    })
    .onConflictDoUpdate({
      target: [
        agoojyeOsConversationPreferences.channelId,
        agoojyeOsConversationPreferences.userId,
      ],
      set: values,
    })
    .returning();
  return res.json({ ok: true, item });
});

memberApi.post("/channels/:id/read", async (req: any, res) => {
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const channelId = Number(req.params.id);
  const channel = await canAccessAgoojiyeChatChannel(tenantId, member, channelId);
  if (!channel) return res.status(403).json({ message: "Conversation non autorisée." });
  const parsed = z
    .object({ lastMessageId: z.coerce.number().int().positive().nullable().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Lecture invalide." });
  const readAt = await markConversationRead(
    tenantId,
    channelId,
    Number(member.id),
    parsed.data.lastMessageId || null,
  );
  const payload = {
    channelId,
    userId: Number(member.id),
    lastReadMessageId: parsed.data.lastMessageId || null,
    readAt,
  };
  emitToChannel(req, tenantId, channelId, "conversation:read", payload);
  return res.json({ ok: true, ...payload });
});

memberApi.post("/channels/:id/unread", async (req: any, res) => {
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const channelId = Number(req.params.id);
  const channel = await canAccessAgoojiyeChatChannel(tenantId, member, channelId);
  if (!channel) return res.status(403).json({ message: "Conversation non autorisée." });
  const markedUnreadAt = new Date();
  await db
    .insert(agoojyeOsConversationReads)
    .values({
      tenantId,
      channelId,
      userId: Number(member.id),
      markedUnreadAt,
    })
    .onConflictDoUpdate({
      target: [
        agoojyeOsConversationReads.channelId,
        agoojyeOsConversationReads.userId,
      ],
      set: { markedUnreadAt, updatedAt: markedUnreadAt },
    });
  return res.json({ ok: true, markedUnreadAt });
});

const draftSchema = z.object({
  body: z.string().max(8000).default(""),
  attachmentIds: z.array(z.string().uuid()).max(10).default([]),
  replyToMessageId: z.coerce.number().int().positive().nullable().optional(),
});

memberApi.get("/channels/:id/draft", async (req: any, res) => {
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const channelId = Number(req.params.id);
  const channel = await canAccessAgoojiyeChatChannel(tenantId, member, channelId);
  if (!channel) return res.status(403).json({ message: "Conversation non autorisée." });
  const item = await db.query.agoojyeOsMessageDrafts.findFirst({
    where: and(
      eq(agoojyeOsMessageDrafts.tenantId, tenantId),
      eq(agoojyeOsMessageDrafts.channelId, channelId),
      eq(agoojyeOsMessageDrafts.userId, Number(member.id)),
    ),
  });
  return res.json({ ok: true, item: item || null });
});

memberApi.put("/channels/:id/draft", async (req: any, res) => {
  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Brouillon invalide." });
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const channelId = Number(req.params.id);
  const channel = await canAccessAgoojiyeChatChannel(tenantId, member, channelId);
  if (!channel) return res.status(403).json({ message: "Conversation non autorisée." });
  const now = new Date();
  const [item] = await db
    .insert(agoojyeOsMessageDrafts)
    .values({
      tenantId,
      channelId,
      userId: Number(member.id),
      body: parsed.data.body,
      attachmentIds: parsed.data.attachmentIds,
      replyToMessageId: parsed.data.replyToMessageId || null,
    })
    .onConflictDoUpdate({
      target: [agoojyeOsMessageDrafts.channelId, agoojyeOsMessageDrafts.userId],
      set: {
        body: parsed.data.body,
        attachmentIds: parsed.data.attachmentIds,
        replyToMessageId: parsed.data.replyToMessageId || null,
        updatedAt: now,
      },
    })
    .returning();
  return res.json({ ok: true, item });
});

memberApi.delete("/channels/:id/draft", async (req: any, res) => {
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const channelId = Number(req.params.id);
  await db
    .delete(agoojyeOsMessageDrafts)
    .where(
      and(
        eq(agoojyeOsMessageDrafts.tenantId, tenantId),
        eq(agoojyeOsMessageDrafts.channelId, channelId),
        eq(agoojyeOsMessageDrafts.userId, Number(member.id)),
      ),
    );
  return res.status(204).end();
});

async function accessibleMessage(tenantId: number, member: any, messageId: number) {
  const message = await db.query.agoojyeOsMessages.findFirst({
    where: and(
      eq(agoojyeOsMessages.tenantId, tenantId),
      eq(agoojyeOsMessages.id, messageId),
    ),
  });
  if (!message) return null;
  const channel = await canAccessAgoojiyeChatChannel(
    tenantId,
    member,
    Number(message.channelId),
  );
  return channel ? { message, channel } : null;
}

memberApi.patch("/messages/:id", async (req: any, res) => {
  const parsed = z.object({ body: z.string().trim().min(1).max(8000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Message invalide." });
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const resolved = await accessibleMessage(tenantId, member, Number(req.params.id));
  if (!resolved) return res.status(404).json({ message: "Message introuvable." });
  const isAdmin = Number(member.accessLevel || 0) >= 6;
  if (
    !messageCanBeEdited({
      senderUserId: resolved.message.senderUserId,
      currentUserId: Number(member.id),
      createdAt: resolved.message.createdAt,
      deletedAt: resolved.message.deletedAt,
      isAdmin,
      editWindowMinutes: Number(process.env.AGOOJIYE_CHAT_EDIT_WINDOW_MINUTES || 30),
    })
  ) {
    return res.status(403).json({
      message: "Ce message ne peut plus être modifié.",
    });
  }
  const [updated] = await db
    .update(agoojyeOsMessages)
    .set({ body: parsed.data.body, editedAt: new Date(), updatedAt: new Date() })
    .where(eq(agoojyeOsMessages.id, Number(resolved.message.id)))
    .returning();
  const payload = { id: Number(updated.id), body: updated.body, editedAt: updated.editedAt };
  emitToChannel(
    req,
    tenantId,
    Number(resolved.message.channelId),
    "message:updated",
    payload,
  );
  await audit(tenantId, member, "chat_message_edited", "os_message", Number(updated.id));
  return res.json({ ok: true, item: payload });
});

memberApi.delete("/messages/:id", async (req: any, res) => {
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const resolved = await accessibleMessage(tenantId, member, Number(req.params.id));
  if (!resolved) return res.status(404).json({ message: "Message introuvable." });
  const isAdmin = Number(member.accessLevel || 0) >= 6;
  if (
    !messageCanBeEdited({
      senderUserId: resolved.message.senderUserId,
      currentUserId: Number(member.id),
      createdAt: resolved.message.createdAt,
      deletedAt: resolved.message.deletedAt,
      isAdmin,
      editWindowMinutes: Number(process.env.AGOOJIYE_CHAT_DELETE_WINDOW_MINUTES || 60),
    })
  ) {
    return res.status(403).json({ message: "Ce message ne peut plus être supprimé." });
  }
  const deletedAt = new Date();
  await db
    .update(agoojyeOsMessages)
    .set({ deletedAt, body: "", updatedAt: deletedAt })
    .where(eq(agoojyeOsMessages.id, Number(resolved.message.id)));
  emitToChannel(
    req,
    tenantId,
    Number(resolved.message.channelId),
    "message:deleted",
    { id: Number(resolved.message.id), deletedAt },
  );
  await audit(
    tenantId,
    member,
    "chat_message_deleted",
    "os_message",
    Number(resolved.message.id),
  );
  return res.status(204).end();
});

memberApi.put("/messages/:id/reactions/:emoji", async (req: any, res) => {
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const emoji = clean(decodeURIComponent(req.params.emoji)).slice(0, 16);
  if (!emoji) return res.status(400).json({ message: "Réaction invalide." });
  const resolved = await accessibleMessage(tenantId, member, Number(req.params.id));
  if (!resolved) return res.status(404).json({ message: "Message introuvable." });
  const existing = await db.query.agoojyeOsMessageReactions.findFirst({
    where: and(
      eq(agoojyeOsMessageReactions.messageId, Number(resolved.message.id)),
      eq(agoojyeOsMessageReactions.userId, Number(member.id)),
      eq(agoojyeOsMessageReactions.emoji, emoji),
    ),
  });
  if (existing) {
    await db
      .delete(agoojyeOsMessageReactions)
      .where(eq(agoojyeOsMessageReactions.id, Number(existing.id)));
  } else {
    await db.insert(agoojyeOsMessageReactions).values({
      tenantId,
      messageId: Number(resolved.message.id),
      userId: Number(member.id),
      emoji,
    });
  }
  const reactions = await db.query.agoojyeOsMessageReactions.findMany({
    where: and(
      eq(agoojyeOsMessageReactions.tenantId, tenantId),
      eq(agoojyeOsMessageReactions.messageId, Number(resolved.message.id)),
    ),
  });
  const directoryRows = await db.query.agoojyeProjectUsers.findMany({
    where: eq(agoojyeProjectUsers.tenantId, tenantId),
    columns: { id: true, displayName: true },
  });
  const groups =
    aggregateReactions(
      reactions,
      new Map(directoryRows.map((row) => [Number(row.id), row])),
    ).get(Number(resolved.message.id)) || [];
  const payload = { messageId: Number(resolved.message.id), reactions: groups };
  emitToChannel(
    req,
    tenantId,
    Number(resolved.message.channelId),
    "message:reactions",
    payload,
  );
  return res.json({ ok: true, ...payload });
});

memberApi.put("/messages/:id/pin", async (req: any, res) => {
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const resolved = await accessibleMessage(tenantId, member, Number(req.params.id));
  if (!resolved) return res.status(404).json({ message: "Message introuvable." });
  const existing = await db.query.agoojyeOsMessagePins.findFirst({
    where: eq(agoojyeOsMessagePins.messageId, Number(resolved.message.id)),
  });
  if (existing) {
    await db.delete(agoojyeOsMessagePins).where(eq(agoojyeOsMessagePins.id, existing.id));
  } else {
    await db.insert(agoojyeOsMessagePins).values({
      tenantId,
      channelId: Number(resolved.message.channelId),
      messageId: Number(resolved.message.id),
      pinnedBy: Number(member.id),
    });
  }
  const payload = {
    messageId: Number(resolved.message.id),
    pinned: !existing,
    pinnedBy: !existing ? Number(member.id) : null,
  };
  emitToChannel(
    req,
    tenantId,
    Number(resolved.message.channelId),
    "message:pinned",
    payload,
  );
  await audit(
    tenantId,
    member,
    existing ? "chat_message_unpinned" : "chat_message_pinned",
    "os_message",
    Number(resolved.message.id),
  );
  return res.json({ ok: true, ...payload });
});

memberApi.get("/search", async (req: any, res) => {
  const parsed = z
    .object({
      q: z.string().trim().min(2).max(200),
      channelId: z.coerce.number().int().positive().optional(),
      senderId: z.coerce.number().int().positive().optional(),
      type: z.string().trim().max(40).optional(),
      before: z.coerce.number().int().positive().optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Saisissez au moins deux caractères." });
  }
  const tenantId = Number(req.chatTenantId);
  const member = req.chatMember;
  const channels = await listAccessibleAgoojiyeChatChannels(tenantId, member);
  let channelIds = channels.map((channel) => Number(channel.id));
  if (parsed.data.channelId) {
    channelIds = channelIds.filter((id) => id === parsed.data.channelId);
  }
  if (!channelIds.length) return res.json({ ok: true, items: [] });
  const escaped = parsed.data.q.replace(/[%_]/g, "");
  const conditions: any[] = [
    eq(agoojyeOsMessages.tenantId, tenantId),
    inArray(agoojyeOsMessages.channelId, channelIds),
    sql`${agoojyeOsMessages.body} ilike ${`%${escaped}%`}`,
    isNull(agoojyeOsMessages.deletedAt),
  ];
  if (parsed.data.senderId) {
    conditions.push(eq(agoojyeOsMessages.senderUserId, parsed.data.senderId));
  }
  if (parsed.data.type) {
    conditions.push(eq(agoojyeOsMessages.messageType, parsed.data.type));
  }
  if (parsed.data.before) conditions.push(lt(agoojyeOsMessages.id, parsed.data.before));
  const items = await db
    .select({
      id: agoojyeOsMessages.id,
      channelId: agoojyeOsMessages.channelId,
      body: agoojyeOsMessages.body,
      messageType: agoojyeOsMessages.messageType,
      createdAt: agoojyeOsMessages.createdAt,
      senderUserId: agoojyeOsMessages.senderUserId,
      senderName: agoojyeProjectUsers.displayName,
    })
    .from(agoojyeOsMessages)
    .leftJoin(
      agoojyeProjectUsers,
      eq(agoojyeProjectUsers.id, agoojyeOsMessages.senderUserId),
    )
    .where(and(...conditions))
    .orderBy(desc(agoojyeOsMessages.id))
    .limit(80);
  return res.json({ ok: true, items });
});

router.use("/api/agoojye/chat", publicApi);
router.use("/api/agoojye/chat/member", memberApi);

export default router;
