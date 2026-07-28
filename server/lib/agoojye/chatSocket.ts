import type { Server, Socket } from "socket.io";

import {
  canAccessAgoojiyeChatChannel,
  resolveAgoojiyeSocketIdentity,
  type AgoojiyeSocketIdentity,
} from "./chatAccess";
import { normalizeAgoojiyePresence, type AgoojiyePresence } from "./chatLogic";

export const AGOOJIYE_CHAT_NAMESPACE = "/agoojye-workos";
export const agoojyeChatChannelRoom = (tenantId: number, channelId: number) =>
  `agoojye:${tenantId}:channel:${channelId}`;
export const agoojyeChatTenantRoom = (tenantId: number) => `agoojye:${tenantId}`;

type AuthenticatedSocket = Socket & {
  data: {
    identity?: AgoojiyeSocketIdentity;
    joinedChannels?: Set<number>;
  };
};

type PresenceState = {
  connections: number;
  status: AgoojiyePresence;
  lastSeenAt: string;
};

const presence = new Map<string, PresenceState>();
const presenceKey = (tenantId: number, memberId: number) => `${tenantId}:${memberId}`;

function publicPresence(identity: AgoojiyeSocketIdentity, state: PresenceState) {
  return {
    userId: Number(identity.member.id),
    status: state.status,
    lastSeenAt: state.lastSeenAt,
  };
}

export function attachAgoojiyeChatSocket(io: Server) {
  const namespace = io.of(AGOOJIYE_CHAT_NAMESPACE);

  namespace.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization ||
        socket.handshake.query?.token;
      const identity = await resolveAgoojiyeSocketIdentity(token);
      if (!identity) return next(new Error("AUTH_REQUIRED"));
      socket.data.identity = identity;
      socket.data.joinedChannels = new Set();
      return next();
    } catch {
      return next(new Error("AUTH_REQUIRED"));
    }
  });

  namespace.on("connection", (socket: AuthenticatedSocket) => {
    const identity = socket.data.identity;
    if (!identity) {
      socket.disconnect(true);
      return;
    }
    const tenantRoom = agoojyeChatTenantRoom(identity.tenantId);
    const key = presenceKey(identity.tenantId, Number(identity.member.id));
    const previous = presence.get(key);
    const state: PresenceState = {
      connections: Number(previous?.connections || 0) + 1,
      status: previous?.status === "busy" ? "busy" : "online",
      lastSeenAt: new Date().toISOString(),
    };
    presence.set(key, state);
    socket.join(tenantRoom);
    namespace.to(tenantRoom).emit("presence:changed", publicPresence(identity, state));
    socket.emit(
      "presence:snapshot",
      [...presence.entries()]
        .filter(([entryKey]) => entryKey.startsWith(`${identity.tenantId}:`))
        .map(([entryKey, entryState]) => ({
          userId: Number(entryKey.split(":")[1]),
          status: entryState.status,
          lastSeenAt: entryState.lastSeenAt,
        })),
    );

    socket.on("conversation:join", async (payload: { channelId?: number }, acknowledge?: Function) => {
      const channelId = Number(payload?.channelId || 0);
      const channel = await canAccessAgoojiyeChatChannel(identity.tenantId, identity.member, channelId);
      if (!channel) {
        acknowledge?.({ ok: false, code: "FORBIDDEN" });
        return;
      }
      socket.join(agoojyeChatChannelRoom(identity.tenantId, channelId));
      socket.data.joinedChannels?.add(channelId);
      acknowledge?.({ ok: true });
    });

    socket.on("conversation:leave", (payload: { channelId?: number }) => {
      const channelId = Number(payload?.channelId || 0);
      if (!socket.data.joinedChannels?.has(channelId)) return;
      socket.leave(agoojyeChatChannelRoom(identity.tenantId, channelId));
      socket.data.joinedChannels.delete(channelId);
    });

    const relayTyping = (typing: boolean, payload: { channelId?: number }) => {
      const channelId = Number(payload?.channelId || 0);
      if (!socket.data.joinedChannels?.has(channelId)) return;
      socket.to(agoojyeChatChannelRoom(identity.tenantId, channelId)).emit("typing:changed", {
        channelId,
        userId: Number(identity.member.id),
        displayName: String(identity.member.displayName || "Membre AGOOJIYE"),
        typing,
        at: new Date().toISOString(),
      });
    };
    socket.on("typing:start", (payload) => relayTyping(true, payload));
    socket.on("typing:stop", (payload) => relayTyping(false, payload));

    socket.on("presence:update", (payload: { status?: string }) => {
      const current = presence.get(key);
      if (!current) return;
      current.status = normalizeAgoojiyePresence(payload?.status);
      if (current.status === "offline") current.status = "away";
      current.lastSeenAt = new Date().toISOString();
      namespace.to(tenantRoom).emit("presence:changed", publicPresence(identity, current));
    });

    socket.on("disconnect", () => {
      const current = presence.get(key);
      if (!current) return;
      current.connections = Math.max(0, current.connections - 1);
      current.lastSeenAt = new Date().toISOString();
      if (current.connections === 0) current.status = "offline";
      namespace.to(tenantRoom).emit("presence:changed", publicPresence(identity, current));
    });
  });
}
