import { and, asc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeOsChannelMembers,
  agoojyeOsChannels,
  agoojyeProjectUsers,
  agoojyeWorkosSessions,
  eceSessions,
  eceUsers,
  tenants,
  userTenantRoles,
} from "@db/schema";

import { canAccessAgoojiyeOsChannel } from "./osPolicy";
import { isActiveAgoojiyeMember } from "./chatLogic";
import { hashWorkosToken, hasPrivilegedWorkosRole } from "./workosSecurity";

export async function listAccessibleAgoojiyeChatChannels(tenantId: number, member: any) {
  const [channels, memberships] = await Promise.all([
    db.query.agoojyeOsChannels.findMany({
      where: and(
        eq(agoojyeOsChannels.tenantId, tenantId),
        eq(agoojyeOsChannels.status, "active"),
      ),
      orderBy: [asc(agoojyeOsChannels.name)],
    }),
    db.query.agoojyeOsChannelMembers.findMany({
      where: and(
        eq(agoojyeOsChannelMembers.tenantId, tenantId),
        eq(agoojyeOsChannelMembers.userId, Number(member.id)),
      ),
    }),
  ]);
  const memberChannelIds = new Set(memberships.map((entry) => Number(entry.channelId)));
  return channels.filter((channel) =>
    canAccessAgoojiyeOsChannel({ member, channel, memberChannelIds }),
  );
}

export async function canAccessAgoojiyeChatChannel(
  tenantId: number,
  member: any,
  channelId: number,
) {
  if (!Number.isFinite(channelId) || channelId <= 0) return null;
  const channels = await listAccessibleAgoojiyeChatChannels(tenantId, member);
  return channels.find((channel) => Number(channel.id) === channelId) || null;
}

export type AgoojiyeSocketIdentity = {
  tenantId: number;
  user: any;
  member: any;
  roles: string[];
  token: string;
};

export async function resolveAgoojiyeSocketIdentity(
  rawToken: unknown,
): Promise<AgoojiyeSocketIdentity | null> {
  const token = String(rawToken || "").trim().replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, "agoojye") });
  if (!tenant) return null;
  const session = await db.query.eceSessions.findFirst({
    where: and(eq(eceSessions.token, token), gt(eceSessions.expiresAt, new Date())),
  });
  if (!session) return null;
  const user = await db.query.eceUsers.findFirst({
    where: and(eq(eceUsers.id, Number(session.userId)), eq(eceUsers.isActive, true)),
  });
  if (!user) return null;
  const roleRows = await db.query.userTenantRoles.findMany({
    where: and(
      eq(userTenantRoles.tenantId, Number(tenant.id)),
      eq(userTenantRoles.userId, Number(user.id)),
    ),
  });
  const roles = roleRows.map((entry) => String(entry.role));
  if (!roles.length) return null;
  const member = await db.query.agoojyeProjectUsers.findFirst({
    where: and(
      eq(agoojyeProjectUsers.tenantId, Number(tenant.id)),
      eq(agoojyeProjectUsers.authUserId, Number(user.id)),
    ),
  });
  if (!member || !isActiveAgoojiyeMember(member.status)) return null;
  if (hasPrivilegedWorkosRole(user, roles)) {
    const workosSession = await db.query.agoojyeWorkosSessions.findFirst({
      where: and(
        eq(agoojyeWorkosSessions.tenantId, Number(tenant.id)),
        eq(agoojyeWorkosSessions.userId, Number(user.id)),
        eq(agoojyeWorkosSessions.tokenHash, hashWorkosToken(token)),
        isNull(agoojyeWorkosSessions.revokedAt),
        gt(agoojyeWorkosSessions.expiresAt, new Date()),
      ),
    });
    if (!workosSession?.mfaVerifiedAt) return null;
  }
  return {
    tenantId: Number(tenant.id),
    user,
    member,
    roles,
    token,
  };
}
