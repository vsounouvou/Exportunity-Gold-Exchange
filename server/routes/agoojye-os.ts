import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { Router } from "express";
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeDocuments,
  agoojyeMobilityBookings,
  agoojyeMobilityBusOrderRequests,
  agoojyeMobilityBusReservationRequests,
  agoojyeMobilityDemoRequests,
  agoojyeMobilityPayments,
  agoojyeMobilityTickets,
  agoojyeMobilityTrips,
  agoojyeOsChannelMembers,
  agoojyeOsChannels,
  agoojyeOsDecisions,
  agoojyeOsInvitations,
  agoojyeOsMeetings,
  agoojyeOsMessages,
  agoojyeOsNotifications,
  agoojyeOsProjectMembers,
  agoojyeOsProjects,
  agoojyeOsPushSubscriptions,
  agoojyePartners,
  agoojyeProjectUsers,
  agoojyeTasks,
  agoojyeTeams,
  eceSessions,
  eceUsers,
  userTenantRoles,
} from "@db/schema";

import { ensureTenantUser } from "./utils/auth";
import { requireWorkosAdmin, requireWorkosMember } from "./agoojye-workos";
import { hashAgoojiyeInvitationToken } from "../lib/agoojye/osSeed";
import {
  canAccessAgoojiyeOsChannel,
  canAccessAgoojiyeDataClass,
  evaluateAgoojiyeOsInvitation,
  hasAgoojiyeOsPermission,
} from "../lib/agoojye/osPolicy";

const router = Router();
const publicApi = Router();
const memberApi = Router();
const adminApi = Router();

const clean = (value: unknown) => String(value ?? "").trim();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();
const list = (value: unknown) =>
  (Array.isArray(value) ? value : clean(value).split(","))
    .map((entry) => clean(entry))
    .filter(Boolean);
const slugify = (value: unknown) =>
  clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const invitationBuckets = new Map<string, { count: number; resetAt: number }>();
const VAPID_PUBLIC_KEY = clean(process.env.AGOOJIYE_VAPID_PUBLIC_KEY);
const VAPID_PRIVATE_KEY = clean(process.env.AGOOJIYE_VAPID_PRIVATE_KEY);
const VAPID_SUBJECT = clean(process.env.AGOOJIYE_VAPID_SUBJECT) || "mailto:support@agoojiye.com";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function requireAgoojiyeTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant || clean(tenant.key).toLowerCase() !== "agoojye") {
    res.status(404).json({ message: "AGOOJIYE OS n'est disponible que sur le domaine AGOOJIYE." });
    return null;
  }
  return Number(tenant.id);
}

function rateLimitInvitation(req: any, res: any) {
  const key = clean(req.headers["x-forwarded-for"] || req.ip || "unknown").split(",")[0].slice(0, 100);
  const now = Date.now();
  const bucket = invitationBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    invitationBuckets.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }
  if (bucket.count >= 12) {
    res.status(429).json({ message: "Trop de tentatives. Réessayez dans quelques minutes." });
    return false;
  }
  bucket.count += 1;
  return true;
}

function sessionUser(user: any) {
  return {
    id: Number(user.id),
    email: clean(user.email),
    displayName: clean(user.displayName),
    roles: Array.isArray(user.roles) ? user.roles : ["staff"],
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    currentMode: user.currentMode || "buyer",
    buyerType: user.buyerType || "retail",
    verificationLevel: user.verificationLevel || "NONE",
    mustChangePassword: false,
  };
}

async function audit(tenantId: number, member: any, action: string, entityType: string, entityId?: number | null, metadata?: Record<string, unknown>) {
  await db.insert(agoojyeAuditLogs).values({
    tenantId,
    actor: member ? `${clean(member.displayName)} <${clean(member.email)}>` : "AGOOJIYE OS",
    action,
    entityType,
    entityId: entityId || null,
    metadata: metadata || {},
  });
}

function memberCan(member: any, permission: string) {
  return hasAgoojiyeOsPermission(member, permission);
}

async function requireMember(req: any, res: any, next: any) {
  const tenantId = requireAgoojiyeTenant(req, res);
  if (!tenantId) return;
  const authUser = req.tenantUser;
  let member = await db.query.agoojyeProjectUsers.findFirst({
    where: and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.authUserId, Number(authUser.id))),
  });
  if (!member) {
    member = await db.query.agoojyeProjectUsers.findFirst({
      where: and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.email, normalizeEmail(authUser.email))),
    });
    if (member && !member.authUserId) {
      const [linked] = await db
        .update(agoojyeProjectUsers)
        .set({ authUserId: Number(authUser.id), status: "Active", updatedAt: new Date() })
        .where(and(eq(agoojyeProjectUsers.id, member.id), isNull(agoojyeProjectUsers.authUserId)))
        .returning();
      member = linked || member;
    }
  }
  if (!member || ["suspended", "archived", "inactive"].includes(clean(member.status).toLowerCase())) {
    return res.status(403).json({ message: "Votre compte n'est pas autorisé à accéder à AGOOJIYE OS." });
  }
  req.osTenantId = tenantId;
  req.osMember = member;
  req.osAuthUser = authUser;
  next();
}

async function accessibleChannels(tenantId: number, member: any) {
  const rows = await db.query.agoojyeOsChannels.findMany({
    where: and(
      eq(agoojyeOsChannels.tenantId, tenantId),
      eq(agoojyeOsChannels.status, "active"),
      lte(agoojyeOsChannels.confidentiality, Number(member.accessLevel || 1)),
    ),
    orderBy: [asc(agoojyeOsChannels.name)],
  });
  if (Number(member.accessLevel || 0) >= 6) return rows;
  const memberships = await db.query.agoojyeOsChannelMembers.findMany({
    where: and(eq(agoojyeOsChannelMembers.tenantId, tenantId), eq(agoojyeOsChannelMembers.userId, Number(member.id))),
  });
  const memberChannelIds = new Set(memberships.map((entry) => Number(entry.channelId)));
  return rows.filter((channel) => canAccessAgoojiyeOsChannel({ member, channel, memberChannelIds }));
}

async function sendPushToUsers(tenantId: number, userIds: number[], payload: { title: string; body?: string; url?: string }) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !userIds.length) return;
  const members = await db.query.agoojyeProjectUsers.findMany({
    where: and(eq(agoojyeProjectUsers.tenantId, tenantId), inArray(agoojyeProjectUsers.id, userIds)),
  });
  const authUserIds = members.map((member) => Number(member.authUserId || 0)).filter((id) => id > 0);
  if (!authUserIds.length) return;
  const subscriptions = await db.query.agoojyeOsPushSubscriptions.findMany({
    where: and(
      eq(agoojyeOsPushSubscriptions.tenantId, tenantId),
      inArray(agoojyeOsPushSubscriptions.authUserId, authUserIds),
    ),
  });
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
        );
      } catch (error: any) {
        if ([404, 410].includes(Number(error?.statusCode || 0))) {
          await db.delete(agoojyeOsPushSubscriptions).where(eq(agoojyeOsPushSubscriptions.id, subscription.id));
        }
      }
    }),
  );
}

publicApi.get("/invitations/:token", async (req: any, res) => {
  const tenantId = requireAgoojiyeTenant(req, res);
  if (!tenantId || !rateLimitInvitation(req, res)) return;
  const token = clean(req.params.token);
  const invitation = await db.query.agoojyeOsInvitations.findFirst({
    where: and(
      eq(agoojyeOsInvitations.tenantId, tenantId),
      eq(agoojyeOsInvitations.tokenHash, hashAgoojiyeInvitationToken(token)),
      eq(agoojyeOsInvitations.status, "active"),
      gt(agoojyeOsInvitations.expiresAt, new Date()),
    ),
  });
  if (!invitation || Number(invitation.useCount) >= Number(invitation.maxUses)) {
    return res.status(404).json({ message: "Cette invitation est invalide, expirée ou entièrement utilisée." });
  }
  const allowedEmails = Array.isArray(invitation.allowedEmails) ? invitation.allowedEmails : [];
  const pending = await db.query.agoojyeProjectUsers.findMany({
    where: and(eq(agoojyeProjectUsers.tenantId, tenantId), inArray(agoojyeProjectUsers.email, allowedEmails)),
  });
  return res.json({
    ok: true,
    organization: "AGOOJIYE",
    label: invitation.label,
    expiresAt: invitation.expiresAt,
    remainingPlaces: Math.max(0, Number(invitation.maxUses) - Number(invitation.useCount)),
    members: pending.map((member) => ({
      firstName: member.firstName,
      emailHint: `${clean(member.email).slice(0, 2)}•••@agoojiye.com`,
      activated: Boolean(member.authUserId),
    })),
  });
});

const acceptInvitationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(200),
  phone: z.string().max(40).optional(),
});

publicApi.post("/invitations/:token/accept", async (req: any, res) => {
  const tenantId = requireAgoojiyeTenant(req, res);
  if (!tenantId || !rateLimitInvitation(req, res)) return;
  const parsed = acceptInvitationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Vérifiez l'adresse email et utilisez au moins 10 caractères pour le mot de passe." });
  const email = normalizeEmail(parsed.data.email);
  const tokenHash = hashAgoojiyeInvitationToken(clean(req.params.token));
  try {
    const result = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`
        select * from agoojye_os_invitations
        where tenant_id = ${tenantId} and token_hash = ${tokenHash}
        for update
      `);
      const invitation = (locked.rows?.[0] || null) as any;
      const invitationState = invitation
        ? evaluateAgoojiyeOsInvitation(
            {
              status: invitation.status,
              expiresAt: invitation.expires_at,
              useCount: Number(invitation.use_count),
              maxUses: Number(invitation.max_uses),
              allowedEmails: invitation.allowed_emails,
            },
            email,
          )
        : { ok: false as const };
      if (!invitationState.ok) {
        throw Object.assign(new Error("INVITATION_INVALID"), { status: 403 });
      }

      const member = await tx.query.agoojyeProjectUsers.findFirst({
        where: and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.email, email)),
      });
      if (!member) throw Object.assign(new Error("MEMBER_NOT_ALLOWED"), { status: 403 });
      if (member.authUserId) throw Object.assign(new Error("ACCOUNT_ALREADY_ACTIVE"), { status: 409 });

      let authUser = await tx.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) });
      const passwordHash = await bcrypt.hash(parsed.data.password, 11);
      if (authUser) {
        const roles = Array.from(new Set([...(Array.isArray(authUser.roles) ? authUser.roles : []), "staff"]));
        const [updatedUser] = await tx
          .update(eceUsers)
          .set({
            passwordHash,
            displayName: member.displayName,
            phone: parsed.data.phone || authUser.phone,
            roles: roles as any,
            isActive: true,
            emailVerified: true,
            metadata: {
              ...((authUser.metadata && typeof authUser.metadata === "object" ? authUser.metadata : {}) as Record<string, unknown>),
              agoojiyeOsActivatedAt: new Date().toISOString(),
            } as any,
            updatedAt: new Date(),
          })
          .where(eq(eceUsers.id, authUser.id))
          .returning();
        authUser = updatedUser;
      } else {
        const [createdUser] = await tx
          .insert(eceUsers)
          .values({
            email,
            passwordHash,
            displayName: member.displayName,
            phone: parsed.data.phone || member.phone,
            role: "buyer",
            roles: ["staff"] as any,
            permissions: [] as any,
            currentMode: "buyer",
            isActive: true,
            emailVerified: true,
            metadata: { agoojiyeOsActivatedAt: new Date().toISOString() } as any,
          })
          .returning();
        authUser = createdUser;
      }

      await tx
        .insert(userTenantRoles)
        .values({ tenantId, userId: Number(authUser.id), role: "USER" })
        .onConflictDoNothing();
      await tx
        .update(agoojyeProjectUsers)
        .set({
          authUserId: Number(authUser.id),
          status: "Active",
          onboardingProgress: 60,
          startDate: member.startDate || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agoojyeProjectUsers.id, member.id));
      await tx
        .update(agoojyeOsInvitations)
        .set({ useCount: Number(invitation.use_count) + 1, updatedAt: new Date() })
        .where(eq(agoojyeOsInvitations.id, Number(invitation.id)));

      const sessionToken = randomBytes(32).toString("hex");
      await tx.insert(eceSessions).values({
        userId: Number(authUser.id),
        token: sessionToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip,
        userAgent: clean(req.headers["user-agent"]),
      });

      return { authUser, member, sessionToken };
    });
    await audit(tenantId, result.member, "member_joined", "project_user", Number(result.member.id), {
      source: "team_invitation",
    });
    return res.json({
      ok: true,
      token: result.sessionToken,
      user: sessionUser(result.authUser),
      redirect: "/os",
    });
  } catch (error: any) {
    if (error?.message === "ACCOUNT_ALREADY_ACTIVE") {
      return res.status(409).json({ message: "Ce compte est déjà actif. Connectez-vous avec votre adresse AGOOJIYE.", code: error.message });
    }
    if (["INVITATION_INVALID", "MEMBER_NOT_ALLOWED"].includes(error?.message)) {
      return res.status(Number(error.status || 403)).json({ message: "Cette adresse n'est pas autorisée par l'invitation.", code: error.message });
    }
    return res.status(500).json({ message: "L'activation du compte a échoué. Réessayez." });
  }
});

memberApi.use(ensureTenantUser);
memberApi.use(requireWorkosMember);
memberApi.use(requireMember);

memberApi.get("/bootstrap", async (req: any, res) => {
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const leadership = Number(member.accessLevel || 0) >= 6;
  const teamId = Number(member.teamId || 0);
  const channels = await accessibleChannels(tenantId, member);
  const channelIds = channels.map((channel) => Number(channel.id));
  const projectMemberships = await db.query.agoojyeOsProjectMembers.findMany({
    where: and(eq(agoojyeOsProjectMembers.tenantId, tenantId), eq(agoojyeOsProjectMembers.userId, Number(member.id))),
  });
  const projectIds = projectMemberships.map((entry) => Number(entry.projectId));

  const taskWhere = leadership
    ? eq(agoojyeTasks.tenantId, tenantId)
    : and(
        eq(agoojyeTasks.tenantId, tenantId),
        or(eq(agoojyeTasks.assignedTo, Number(member.id)), teamId ? eq(agoojyeTasks.teamId, teamId) : sql`false`),
      );
  const projectWhere = leadership
    ? eq(agoojyeOsProjects.tenantId, tenantId)
    : and(
        eq(agoojyeOsProjects.tenantId, tenantId),
        or(
          teamId ? eq(agoojyeOsProjects.teamId, teamId) : sql`false`,
          projectIds.length ? inArray(agoojyeOsProjects.id, projectIds) : sql`false`,
        ),
      );
  const documentWhere = leadership
    ? eq(agoojyeDocuments.tenantId, tenantId)
    : and(
        eq(agoojyeDocuments.tenantId, tenantId),
        or(
          inArray(agoojyeDocuments.visibility, ["public", "internal"]),
          teamId ? eq(agoojyeDocuments.teamId, teamId) : sql`false`,
        ),
      );

  const [
    team,
    directory,
    tasks,
    projects,
    documents,
    partners,
    meetings,
    decisions,
    notifications,
    messages,
    mobility,
  ] = await Promise.all([
    member.teamId
      ? db.query.agoojyeTeams.findFirst({ where: and(eq(agoojyeTeams.tenantId, tenantId), eq(agoojyeTeams.id, Number(member.teamId))) })
      : null,
    db.query.agoojyeProjectUsers.findMany({
      where: and(eq(agoojyeProjectUsers.tenantId, tenantId), inArray(agoojyeProjectUsers.status, ["Active", "Invited"])),
      orderBy: [asc(agoojyeProjectUsers.displayName)],
    }),
    db.query.agoojyeTasks.findMany({ where: taskWhere, orderBy: [asc(agoojyeTasks.dueDate), desc(agoojyeTasks.createdAt)], limit: 100 }),
    db.query.agoojyeOsProjects.findMany({ where: projectWhere, orderBy: [desc(agoojyeOsProjects.updatedAt)], limit: 100 }),
    db.query.agoojyeDocuments.findMany({ where: documentWhere, orderBy: [desc(agoojyeDocuments.updatedAt)], limit: 100 }),
    memberCan(member, "crm")
      ? db.query.agoojyePartners.findMany({ where: eq(agoojyePartners.tenantId, tenantId), orderBy: [asc(agoojyePartners.name)], limit: 100 })
      : Promise.resolve([]),
    db.query.agoojyeOsMeetings.findMany({
      where: and(
        eq(agoojyeOsMeetings.tenantId, tenantId),
        lte(agoojyeOsMeetings.confidentiality, Number(member.accessLevel || 1)),
        gte(agoojyeOsMeetings.startsAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ),
      orderBy: [asc(agoojyeOsMeetings.startsAt)],
      limit: 50,
    }),
    db.query.agoojyeOsDecisions.findMany({
      where: and(
        eq(agoojyeOsDecisions.tenantId, tenantId),
        lte(agoojyeOsDecisions.confidentiality, Number(member.accessLevel || 1)),
      ),
      orderBy: [desc(agoojyeOsDecisions.createdAt)],
      limit: 100,
    }),
    db.query.agoojyeOsNotifications.findMany({
      where: and(eq(agoojyeOsNotifications.tenantId, tenantId), eq(agoojyeOsNotifications.userId, Number(member.id))),
      orderBy: [desc(agoojyeOsNotifications.createdAt)],
      limit: 50,
    }),
    channelIds.length
      ? db
          .select({
            id: agoojyeOsMessages.id,
            channelId: agoojyeOsMessages.channelId,
            senderUserId: agoojyeOsMessages.senderUserId,
            body: agoojyeOsMessages.body,
            messageType: agoojyeOsMessages.messageType,
            replyToMessageId: agoojyeOsMessages.replyToMessageId,
            attachments: agoojyeOsMessages.attachments,
            reactions: agoojyeOsMessages.reactions,
            pinnedAt: agoojyeOsMessages.pinnedAt,
            createdAt: agoojyeOsMessages.createdAt,
            senderName: agoojyeProjectUsers.displayName,
          })
          .from(agoojyeOsMessages)
          .leftJoin(agoojyeProjectUsers, eq(agoojyeProjectUsers.id, agoojyeOsMessages.senderUserId))
          .where(and(eq(agoojyeOsMessages.tenantId, tenantId), inArray(agoojyeOsMessages.channelId, channelIds)))
          .orderBy(desc(agoojyeOsMessages.createdAt))
          .limit(80)
      : Promise.resolve([]),
    Promise.all([
      db.select({ value: sql<number>`count(*)::int` }).from(agoojyeMobilityTrips).where(eq(agoojyeMobilityTrips.tenantId, tenantId)),
      db.select({ value: sql<number>`count(*)::int` }).from(agoojyeMobilityBookings).where(eq(agoojyeMobilityBookings.tenantId, tenantId)),
      db.select({ value: sql<number>`count(*)::int` }).from(agoojyeMobilityTickets).where(eq(agoojyeMobilityTickets.tenantId, tenantId)),
      db.select({ value: sql<number>`coalesce(sum(${agoojyeMobilityPayments.amountXof}),0)::int` }).from(agoojyeMobilityPayments).where(and(eq(agoojyeMobilityPayments.tenantId, tenantId), eq(agoojyeMobilityPayments.status, "paid"))),
      db.select({ value: sql<number>`count(*)::int` }).from(agoojyeMobilityBusReservationRequests).where(and(eq(agoojyeMobilityBusReservationRequests.tenantId, tenantId), eq(agoojyeMobilityBusReservationRequests.status, "new"))),
      db.select({ value: sql<number>`count(*)::int` }).from(agoojyeMobilityDemoRequests).where(and(eq(agoojyeMobilityDemoRequests.tenantId, tenantId), eq(agoojyeMobilityDemoRequests.status, "new"))),
      db.select({ value: sql<number>`count(*)::int` }).from(agoojyeMobilityBusOrderRequests).where(and(eq(agoojyeMobilityBusOrderRequests.tenantId, tenantId), eq(agoojyeMobilityBusOrderRequests.status, "new"))),
    ]),
  ]);

  const visibleMeetings = leadership
    ? meetings
    : meetings.filter((meeting) => {
        const participants = Array.isArray(meeting.participantUserIds) ? meeting.participantUserIds.map(Number) : [];
        return participants.includes(Number(member.id)) || Number(meeting.organizerUserId || 0) === Number(member.id);
      });
  const memberDirectory = directory.map((entry) => ({
    id: entry.id,
    displayName: entry.displayName,
    firstName: entry.firstName,
    email: entry.email,
    phone: entry.phone,
    role: entry.role,
    teamId: entry.teamId,
    managerUserId: entry.managerUserId,
    employmentType: entry.employmentType,
    availability: entry.availability,
    onboardingProgress: entry.onboardingProgress,
    status: entry.status,
    isCurrentUser: Number(entry.id) === Number(member.id),
  }));
  const unread = notifications.filter((notification) => !notification.readAt);
  const projectMembershipIdSet = new Set(projectIds);
  const classifiedTasks = tasks.filter((task) =>
    canAccessAgoojiyeDataClass({
      member,
      classification: task.confidentialityClass,
      resourceTeamId: task.teamId,
    }),
  );
  const classifiedProjects = projects.filter((project) =>
    canAccessAgoojiyeDataClass({
      member,
      classification: project.confidentialityClass,
      resourceTeamId: project.teamId,
      resourceProjectId: project.id,
      projectMembershipIds: projectMembershipIdSet,
    }),
  );
  const classifiedDocuments = documents.filter((document) =>
    canAccessAgoojiyeDataClass({
      member,
      classification: document.confidentialityClass,
      resourceTeamId: document.teamId,
    }),
  );
  const overdue = classifiedTasks.filter((task) => task.dueDate && new Date(task.dueDate).getTime() < Date.now() && !["done", "cancelled"].includes(task.status));

  return res.json({
    ok: true,
    member: {
      ...member,
      team,
      permissions: Array.isArray(member.permissions) ? member.permissions : [],
    },
    navigation: {
      crm: memberCan(member, "crm"),
      mobility: memberCan(member, "mobility"),
      administration:
        Array.isArray(req.workosTenantRoles) &&
        req.workosTenantRoles.some((role: string) => ["SUPER_ADMIN", "TENANT_ADMIN"].includes(String(role))),
      ai: true,
    },
    attention: {
      dueToday: classifiedTasks.filter((task) => task.dueDate && new Date(task.dueDate).toDateString() === new Date().toDateString()).length,
      overdue: overdue.length,
      unreadNotifications: unread.length,
      pendingDecisions: decisions.filter((decision) => decision.status === "pending_approval").length,
      documentsForReview: classifiedDocuments.filter((document) => document.status === "under_review").length,
    },
    teams: await db.query.agoojyeTeams.findMany({ where: eq(agoojyeTeams.tenantId, tenantId), orderBy: [asc(agoojyeTeams.name)] }),
    directory: memberDirectory,
    channels,
    messages: [...messages].reverse(),
    tasks: classifiedTasks,
    projects: classifiedProjects,
    documents: classifiedDocuments,
    partners,
    meetings: visibleMeetings,
    decisions,
    notifications,
    mobility: {
      trips: Number(mobility[0][0]?.value || 0),
      bookings: Number(mobility[1][0]?.value || 0),
      tickets: Number(mobility[2][0]?.value || 0),
      revenueXof: Number(mobility[3][0]?.value || 0),
      pendingBusRequests: Number(mobility[4][0]?.value || 0),
      pendingDemos: Number(mobility[5][0]?.value || 0),
      pendingOrders: Number(mobility[6][0]?.value || 0),
    },
    agents: [
      { key: "falove", name: "Falovè", role: "Assistante de l'entreprise", department: "Direction", level: 1, status: "active" },
      { key: "technical", name: "Copilote technique", role: "Synthèse et checklists techniques", department: "Ingénierie", level: 1, status: "active" },
      { key: "operations", name: "Agent opérations", role: "Manifestes et alertes mobilité", department: "Opérations", level: 1, status: "active" },
      { key: "communication", name: "Agent communication", role: "Brouillons soumis à validation", department: "Communication", level: 2, status: "active" },
      { key: "crm", name: "Agent CRM", role: "Suivi partenaires et prochaines actions", department: "Partenariats", level: 1, status: "active" },
    ],
  });
});

memberApi.get("/channels/:id/messages", async (req: any, res) => {
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const channels = await accessibleChannels(tenantId, member);
  const channelId = Number(req.params.id);
  if (!channels.some((channel) => Number(channel.id) === channelId)) return res.status(403).json({ message: "Canal non autorisé." });
  const messages = await db
    .select({
      id: agoojyeOsMessages.id,
      channelId: agoojyeOsMessages.channelId,
      senderUserId: agoojyeOsMessages.senderUserId,
      body: agoojyeOsMessages.body,
      messageType: agoojyeOsMessages.messageType,
      replyToMessageId: agoojyeOsMessages.replyToMessageId,
      attachments: agoojyeOsMessages.attachments,
      reactions: agoojyeOsMessages.reactions,
      pinnedAt: agoojyeOsMessages.pinnedAt,
      createdAt: agoojyeOsMessages.createdAt,
      senderName: agoojyeProjectUsers.displayName,
    })
    .from(agoojyeOsMessages)
    .leftJoin(agoojyeProjectUsers, eq(agoojyeProjectUsers.id, agoojyeOsMessages.senderUserId))
    .where(and(eq(agoojyeOsMessages.tenantId, tenantId), eq(agoojyeOsMessages.channelId, channelId)))
    .orderBy(desc(agoojyeOsMessages.createdAt))
    .limit(200);
  await db
    .update(agoojyeOsChannelMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(agoojyeOsChannelMembers.channelId, channelId), eq(agoojyeOsChannelMembers.userId, Number(member.id))));
  return res.json({ ok: true, items: messages.reverse() });
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(8000),
  messageType: z.enum(["text", "voice", "image", "video", "document", "announcement"]).default("text"),
  replyToMessageId: z.coerce.number().int().positive().optional(),
  attachments: z.array(z.object({ name: z.string().max(200), url: z.string().url(), type: z.string().max(80).optional() })).max(10).default([]),
});

memberApi.post("/channels/:id/messages", async (req: any, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Le message est invalide." });
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const channelId = Number(req.params.id);
  const channels = await accessibleChannels(tenantId, member);
  const channel = channels.find((entry) => Number(entry.id) === channelId);
  if (!channel) return res.status(403).json({ message: "Canal non autorisé." });
  if (parsed.data.messageType === "announcement" && Number(member.accessLevel || 0) < 4) {
    return res.status(403).json({ message: "La publication d'annonces nécessite une autorisation." });
  }
  const [message] = await db
    .insert(agoojyeOsMessages)
    .values({
      tenantId,
      channelId,
      senderUserId: Number(member.id),
      body: parsed.data.body,
      messageType: parsed.data.messageType,
      replyToMessageId: parsed.data.replyToMessageId || null,
      attachments: parsed.data.attachments,
    })
    .returning();
  const channelMembers = await db.query.agoojyeOsChannelMembers.findMany({
    where: and(eq(agoojyeOsChannelMembers.tenantId, tenantId), eq(agoojyeOsChannelMembers.channelId, channelId)),
  });
  const recipients = channelMembers.map((entry) => Number(entry.userId)).filter((id) => id !== Number(member.id));
  if (recipients.length) {
    await db.insert(agoojyeOsNotifications).values(
      recipients.map((userId) => ({
        tenantId,
        userId,
        type: "message",
        title: `Nouveau message dans #${channel.slug}`,
        body: `${member.displayName}: ${parsed.data.body.slice(0, 120)}`,
        link: `/os/messages?channel=${channelId}`,
      })),
    );
    void sendPushToUsers(tenantId, recipients, {
      title: `#${channel.slug} · ${member.displayName}`,
      body: parsed.data.body.slice(0, 160),
      url: `/os/messages?channel=${channelId}`,
    });
  }
  await audit(tenantId, member, "message_created", "os_message", Number(message.id), { channelId });
  return res.status(201).json({ ok: true, item: { ...message, senderName: member.displayName } });
});

async function resolveAccessibleMessage(tenantId: number, member: any, messageId: number) {
  const message = await db.query.agoojyeOsMessages.findFirst({
    where: and(eq(agoojyeOsMessages.tenantId, tenantId), eq(agoojyeOsMessages.id, messageId)),
  });
  if (!message) return null;
  const channels = await accessibleChannels(tenantId, member);
  return channels.some((channel) => Number(channel.id) === Number(message.channelId)) ? message : null;
}

memberApi.get("/messages/search", async (req: any, res) => {
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const query = clean(req.query?.q);
  if (query.length < 2) return res.status(400).json({ message: "Saisissez au moins deux caractères." });
  const channels = await accessibleChannels(tenantId, member);
  const channelIds = channels.map((channel) => Number(channel.id));
  if (!channelIds.length) return res.json({ ok: true, items: [] });
  const items = await db
    .select({
      id: agoojyeOsMessages.id,
      channelId: agoojyeOsMessages.channelId,
      body: agoojyeOsMessages.body,
      createdAt: agoojyeOsMessages.createdAt,
      senderName: agoojyeProjectUsers.displayName,
    })
    .from(agoojyeOsMessages)
    .leftJoin(agoojyeProjectUsers, eq(agoojyeProjectUsers.id, agoojyeOsMessages.senderUserId))
    .where(
      and(
        eq(agoojyeOsMessages.tenantId, tenantId),
        inArray(agoojyeOsMessages.channelId, channelIds),
        ilike(agoojyeOsMessages.body, `%${query.replace(/[%_]/g, "")}%`),
      ),
    )
    .orderBy(desc(agoojyeOsMessages.createdAt))
    .limit(100);
  return res.json({ ok: true, items });
});

memberApi.patch("/messages/:id/reaction", async (req: any, res) => {
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const message = await resolveAccessibleMessage(tenantId, member, Number(req.params.id));
  if (!message) return res.status(404).json({ message: "Message introuvable." });
  const emoji = z.string().trim().min(1).max(12).safeParse(req.body?.emoji);
  if (!emoji.success) return res.status(400).json({ message: "Réaction invalide." });
  const reactions = message.reactions && typeof message.reactions === "object" ? { ...(message.reactions as Record<string, number[]>) } : {};
  const current = Array.isArray(reactions[emoji.data]) ? reactions[emoji.data].map(Number) : [];
  reactions[emoji.data] = current.includes(Number(member.id))
    ? current.filter((id) => id !== Number(member.id))
    : [...current, Number(member.id)];
  const [updated] = await db
    .update(agoojyeOsMessages)
    .set({ reactions, updatedAt: new Date() })
    .where(eq(agoojyeOsMessages.id, message.id))
    .returning();
  return res.json({ ok: true, item: updated });
});

memberApi.patch("/messages/:id/pin", async (req: any, res) => {
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  if (Number(member.accessLevel || 0) < 4) return res.status(403).json({ message: "Autorisation requise pour épingler un message." });
  const message = await resolveAccessibleMessage(tenantId, member, Number(req.params.id));
  if (!message) return res.status(404).json({ message: "Message introuvable." });
  const [updated] = await db
    .update(agoojyeOsMessages)
    .set({ pinnedAt: message.pinnedAt ? null : new Date(), updatedAt: new Date() })
    .where(eq(agoojyeOsMessages.id, message.id))
    .returning();
  await audit(tenantId, member, message.pinnedAt ? "message_unpinned" : "message_pinned", "os_message", Number(message.id));
  return res.json({ ok: true, item: updated });
});

memberApi.post("/messages/:id/to-task", async (req: any, res) => {
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const message = await resolveAccessibleMessage(tenantId, member, Number(req.params.id));
  if (!message) return res.status(404).json({ message: "Message introuvable." });
  const title = clean(req.body?.title) || message.body.slice(0, 180);
  const [task] = await db
    .insert(agoojyeTasks)
    .values({
      tenantId,
      teamId: Number(member.teamId || 0) || null,
      assignedTo: Number(req.body?.assignedTo || member.id),
      createdBy: Number(member.id),
      title,
      description: `${message.body}\n\nSource : message #${message.id}`,
      priority: clean(req.body?.priority) || "medium",
      status: "todo",
      dueDate: req.body?.dueDate ? new Date(req.body.dueDate) : null,
      attachments: Array.isArray(message.attachments) ? message.attachments.map((entry: any) => clean(entry?.url)).filter(Boolean) : [],
    })
    .returning();
  await audit(tenantId, member, "message_converted_to_task", "task", Number(task.id), { messageId: message.id });
  return res.status(201).json({ ok: true, item: task });
});

memberApi.post("/messages/:id/to-decision", async (req: any, res) => {
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const message = await resolveAccessibleMessage(tenantId, member, Number(req.params.id));
  if (!message) return res.status(404).json({ message: "Message introuvable." });
  const [decision] = await db
    .insert(agoojyeOsDecisions)
    .values({
      tenantId,
      decision: clean(req.body?.decision) || message.body,
      context: `Décision issue du message #${message.id}.`,
      decisionMakerUserId: Number(member.id),
      participantUserIds: [Number(member.id)],
      status: Number(member.accessLevel || 0) >= 4 ? "recorded" : "pending_approval",
      confidentiality: Math.min(3, Number(member.accessLevel || 2)),
    })
    .returning();
  await audit(tenantId, member, "message_converted_to_decision", "os_decision", Number(decision.id), { messageId: message.id });
  return res.status(201).json({ ok: true, item: decision });
});

memberApi.post("/direct/:userId", async (req: any, res) => {
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const targetUserId = Number(req.params.userId);
  if (!Number.isFinite(targetUserId) || targetUserId <= 0 || targetUserId === Number(member.id)) {
    return res.status(400).json({ message: "Destinataire invalide." });
  }
  const target = await db.query.agoojyeProjectUsers.findFirst({
    where: and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.id, targetUserId)),
  });
  if (!target) return res.status(404).json({ message: "Membre introuvable." });
  const pair = [Number(member.id), targetUserId].sort((a, b) => a - b);
  const slug = `dm-${pair[0]}-${pair[1]}`;
  const [channel] = await db
    .insert(agoojyeOsChannels)
    .values({
      tenantId,
      slug,
      name: `${member.displayName} & ${target.displayName}`,
      description: "Conversation directe",
      channelType: "direct",
      confidentiality: Math.min(5, Math.max(3, Number(member.accessLevel || 3), Number(target.accessLevel || 3))),
      createdBy: Number(member.id),
    })
    .onConflictDoUpdate({
      target: [agoojyeOsChannels.tenantId, agoojyeOsChannels.slug],
      set: { updatedAt: new Date() },
    })
    .returning();
  await db
    .insert(agoojyeOsChannelMembers)
    .values(pair.map((userId) => ({ tenantId, channelId: Number(channel.id), userId, role: "member" })))
    .onConflictDoNothing();
  return res.json({ ok: true, item: channel });
});

const taskSchema = z.object({
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(5000).optional(),
  assignedTo: z.coerce.number().int().positive().optional(),
  teamId: z.coerce.number().int().positive().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dueDate: z.string().datetime().optional(),
  confidentialityClass: z.enum([
    "PUBLIC",
    "INTERNAL",
    "DEPARTMENT_ONLY",
    "PROJECT_RESTRICTED",
    "MANAGEMENT_CONFIDENTIAL",
    "LEGAL_FINANCIAL_RESTRICTED",
    "SUPER_ADMIN_RESTRICTED",
  ]).default("INTERNAL"),
});

memberApi.post("/tasks", async (req: any, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Les informations de la tâche sont invalides." });
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const teamId = parsed.data.teamId || Number(member.teamId || 0) || null;
  if (Number(member.accessLevel || 0) < 4 && teamId && Number(teamId) !== Number(member.teamId || 0)) {
    return res.status(403).json({ message: "Vous pouvez créer des tâches uniquement dans votre département." });
  }
  if (!canAccessAgoojiyeDataClass({ member, classification: parsed.data.confidentialityClass, resourceTeamId: teamId })) {
    return res.status(403).json({ message: "Vous ne pouvez pas attribuer ce niveau de confidentialité." });
  }
  const [task] = await db
    .insert(agoojyeTasks)
    .values({
      tenantId,
      teamId,
      assignedTo: parsed.data.assignedTo || Number(member.id),
      createdBy: Number(member.id),
      title: parsed.data.title,
      description: parsed.data.description || null,
      priority: parsed.data.priority,
      status: "todo",
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      attachments: [],
      confidentialityClass: parsed.data.confidentialityClass,
    })
    .returning();
  const assignedTo = Number(task.assignedTo || 0);
  if (assignedTo && assignedTo !== Number(member.id)) {
    await db.insert(agoojyeOsNotifications).values({
      tenantId,
      userId: assignedTo,
      type: "task",
      title: "Nouvelle tâche assignée",
      body: task.title,
      link: "/workspace/tasks",
    });
    void sendPushToUsers(tenantId, [assignedTo], { title: "Nouvelle tâche AGOOJIYE", body: task.title, url: "/workspace/tasks" });
  }
  await audit(tenantId, member, "task_created", "task", Number(task.id));
  return res.status(201).json({ ok: true, item: task });
});

memberApi.patch("/tasks/:id", async (req: any, res) => {
  const status = z.enum(["todo", "in_progress", "blocked", "review", "done", "cancelled"]).safeParse(req.body?.status);
  if (!status.success) return res.status(400).json({ message: "Statut de tâche invalide." });
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const task = await db.query.agoojyeTasks.findFirst({
    where: and(eq(agoojyeTasks.tenantId, tenantId), eq(agoojyeTasks.id, Number(req.params.id))),
  });
  if (!task) return res.status(404).json({ message: "Tâche introuvable." });
  const authorized =
    Number(member.accessLevel || 0) >= 4 ||
    Number(task.assignedTo || 0) === Number(member.id) ||
    (task.teamId && Number(task.teamId) === Number(member.teamId || 0));
  if (!authorized) return res.status(403).json({ message: "Modification non autorisée." });
  const [updated] = await db
    .update(agoojyeTasks)
    .set({ status: status.data, updatedAt: new Date() })
    .where(eq(agoojyeTasks.id, task.id))
    .returning();
  await audit(tenantId, member, "task_status_updated", "task", Number(task.id), { status: status.data });
  return res.json({ ok: true, item: updated });
});

const projectSchema = z.object({
  name: z.string().trim().min(2).max(240),
  objective: z.string().trim().min(5).max(5000),
  teamId: z.coerce.number().int().positive().optional(),
  deadline: z.string().datetime().optional(),
  confidentiality: z.coerce.number().int().min(1).max(6).default(3),
  confidentialityClass: z.enum([
    "PUBLIC",
    "INTERNAL",
    "DEPARTMENT_ONLY",
    "PROJECT_RESTRICTED",
    "MANAGEMENT_CONFIDENTIAL",
    "LEGAL_FINANCIAL_RESTRICTED",
    "SUPER_ADMIN_RESTRICTED",
  ]).default("INTERNAL"),
});

memberApi.post("/projects", async (req: any, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Les informations du projet sont invalides." });
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const teamId = parsed.data.teamId || Number(member.teamId || 0) || null;
  if (Number(member.accessLevel || 0) < 4 && teamId !== Number(member.teamId || 0)) {
    return res.status(403).json({ message: "Création de projet limitée à votre département." });
  }
  const classMinLevel: Record<string, number> = {
    PUBLIC: 0,
    INTERNAL: 1,
    DEPARTMENT_ONLY: 2,
    PROJECT_RESTRICTED: 3,
    MANAGEMENT_CONFIDENTIAL: 5,
    LEGAL_FINANCIAL_RESTRICTED: 6,
    SUPER_ADMIN_RESTRICTED: 7,
  };
  if (Number(member.accessLevel || 0) < classMinLevel[parsed.data.confidentialityClass]) {
    return res.status(403).json({ message: "Vous ne pouvez pas attribuer ce niveau de confidentialité." });
  }
  const baseSlug = slugify(parsed.data.name);
  const slug = `${baseSlug}-${randomBytes(2).toString("hex")}`;
  const [project] = await db
    .insert(agoojyeOsProjects)
    .values({
      tenantId,
      name: parsed.data.name,
      slug,
      objective: parsed.data.objective,
      ownerUserId: Number(member.id),
      teamId,
      status: "active",
      progress: 0,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
      confidentiality: Math.min(parsed.data.confidentiality, Number(member.accessLevel || 2)),
      confidentialityClass: parsed.data.confidentialityClass,
      risks: [],
    })
    .returning();
  await db.insert(agoojyeOsProjectMembers).values({
    tenantId,
    projectId: Number(project.id),
    userId: Number(member.id),
    role: "owner",
  });
  const [channel] = await db
    .insert(agoojyeOsChannels)
    .values({
      tenantId,
      name: parsed.data.name,
      slug: `projet-${slug}`,
      description: parsed.data.objective,
      channelType: "project",
      teamId,
      projectId: Number(project.id),
      confidentiality: project.confidentiality,
      createdBy: Number(member.id),
    })
    .returning();
  await db.insert(agoojyeOsChannelMembers).values({
    tenantId,
    channelId: Number(channel.id),
    userId: Number(member.id),
    role: "owner",
  });
  await audit(tenantId, member, "project_created", "os_project", Number(project.id));
  return res.status(201).json({ ok: true, item: project, channel });
});

const documentSchema = z.object({
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().min(2).max(100).default("Interne"),
  fileUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(["draft", "under_review", "approved", "signed", "superseded", "archived"]).default("draft"),
  visibility: z.enum(["internal", "team_only", "admin_only"]).default("team_only"),
  confidentialityClass: z.enum([
    "PUBLIC",
    "INTERNAL",
    "DEPARTMENT_ONLY",
    "PROJECT_RESTRICTED",
    "MANAGEMENT_CONFIDENTIAL",
    "LEGAL_FINANCIAL_RESTRICTED",
    "SUPER_ADMIN_RESTRICTED",
  ]).default("INTERNAL"),
});

memberApi.post("/documents", async (req: any, res) => {
  const parsed = documentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Les informations du document sont invalides." });
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  if (!canAccessAgoojiyeDataClass({
    member,
    classification: parsed.data.confidentialityClass,
    resourceTeamId: Number(member.teamId || 0) || null,
  })) {
    return res.status(403).json({ message: "Vous ne pouvez pas attribuer ce niveau de confidentialité." });
  }
  const [document] = await db
    .insert(agoojyeDocuments)
    .values({
      tenantId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      category: parsed.data.category,
      teamId: Number(member.teamId || 0) || null,
      uploadedBy: Number(member.id),
      fileUrl: parsed.data.fileUrl || null,
      version: "1.0",
      status: parsed.data.status,
      visibility: Number(member.accessLevel || 0) >= 5 ? parsed.data.visibility : "team_only",
      confidentialityClass: parsed.data.confidentialityClass,
    })
    .returning();
  await audit(tenantId, member, "document_created", "document", Number(document.id));
  return res.status(201).json({ ok: true, item: document });
});

const partnerSchema = z.object({
  name: z.string().trim().min(2).max(240),
  category: z.string().trim().min(2).max(120),
  status: z.string().trim().min(2).max(120).default("In discussion"),
  contactPerson: z.string().trim().max(200).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  notes: z.string().trim().max(5000).optional(),
});

memberApi.post("/crm/partners", async (req: any, res) => {
  const member = req.osMember;
  if (!memberCan(member, "crm")) return res.status(403).json({ message: "Accès CRM non autorisé." });
  const parsed = partnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Les informations du partenaire sont invalides." });
  const tenantId = Number(req.osTenantId);
  const [partner] = await db
    .insert(agoojyePartners)
    .values({
      tenantId,
      ...parsed.data,
      contactEmail: parsed.data.contactEmail || null,
      contactPerson: parsed.data.contactPerson || null,
      notes: parsed.data.notes || null,
      visibility: "private",
    })
    .returning();
  await audit(tenantId, member, "crm_partner_created", "partner", Number(partner.id));
  return res.status(201).json({ ok: true, item: partner });
});

const meetingSchema = z.object({
  title: z.string().trim().min(2).max(240),
  agenda: z.string().trim().max(5000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  participantUserIds: z.array(z.coerce.number().int().positive()).max(100).default([]),
  projectId: z.coerce.number().int().positive().optional(),
  videoUrl: z.string().max(500).optional(),
});

memberApi.post("/meetings", async (req: any, res) => {
  const parsed = meetingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Les informations de la réunion sont invalides." });
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const participants = Array.from(new Set([Number(member.id), ...parsed.data.participantUserIds]));
  const [meeting] = await db
    .insert(agoojyeOsMeetings)
    .values({
      tenantId,
      title: parsed.data.title,
      agenda: parsed.data.agenda || null,
      projectId: parsed.data.projectId || null,
      organizerUserId: Number(member.id),
      participantUserIds: participants,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
      videoUrl: parsed.data.videoUrl || "/meetings",
      status: "scheduled",
      confidentiality: Math.min(3, Number(member.accessLevel || 2)),
    })
    .returning();
  const recipients = participants.filter((id) => id !== Number(member.id));
  if (recipients.length) {
    await db.insert(agoojyeOsNotifications).values(
      recipients.map((userId) => ({
        tenantId,
        userId,
        type: "meeting",
        title: "Nouvelle réunion",
        body: parsed.data.title,
        link: "/os/reunions",
      })),
    );
    void sendPushToUsers(tenantId, recipients, { title: "Réunion AGOOJIYE", body: parsed.data.title, url: "/os/reunions" });
  }
  await audit(tenantId, member, "meeting_created", "os_meeting", Number(meeting.id));
  return res.status(201).json({ ok: true, item: meeting });
});

const decisionSchema = z.object({
  decision: z.string().trim().min(5).max(5000),
  context: z.string().trim().max(5000).optional(),
  projectId: z.coerce.number().int().positive().optional(),
  meetingId: z.coerce.number().int().positive().optional(),
  consequences: z.string().trim().max(5000).optional(),
  assignedActions: z.array(z.string().trim().min(2).max(500)).max(30).default([]),
  reviewDate: z.string().datetime().optional(),
});

memberApi.post("/decisions", async (req: any, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Les informations de la décision sont invalides." });
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const [decision] = await db
    .insert(agoojyeOsDecisions)
    .values({
      tenantId,
      projectId: parsed.data.projectId || null,
      meetingId: parsed.data.meetingId || null,
      decision: parsed.data.decision,
      context: parsed.data.context || null,
      decisionMakerUserId: Number(member.id),
      participantUserIds: [Number(member.id)],
      consequences: parsed.data.consequences || null,
      assignedActions: parsed.data.assignedActions,
      reviewDate: parsed.data.reviewDate ? new Date(parsed.data.reviewDate) : null,
      status: Number(member.accessLevel || 0) >= 4 ? "recorded" : "pending_approval",
      confidentiality: Math.min(3, Number(member.accessLevel || 2)),
    })
    .returning();
  await audit(tenantId, member, "decision_created", "os_decision", Number(decision.id), { status: decision.status });
  return res.status(201).json({ ok: true, item: decision });
});

memberApi.patch("/notifications/:id/read", async (req: any, res) => {
  const [notification] = await db
    .update(agoojyeOsNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(agoojyeOsNotifications.id, Number(req.params.id)),
        eq(agoojyeOsNotifications.tenantId, Number(req.osTenantId)),
        eq(agoojyeOsNotifications.userId, Number(req.osMember.id)),
      ),
    )
    .returning();
  return notification ? res.json({ ok: true, item: notification }) : res.status(404).json({ message: "Notification introuvable." });
});

memberApi.get("/push/public-key", (_req, res) => {
  return res.json({ ok: true, enabled: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY), publicKey: VAPID_PUBLIC_KEY || null });
});

memberApi.post("/push/subscribe", async (req: any, res) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(503).json({ message: "Les notifications push ne sont pas encore configurées." });
  const schema = z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string().min(20), auth: z.string().min(8) }),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Abonnement push invalide." });
  const [subscription] = await db
    .insert(agoojyeOsPushSubscriptions)
    .values({
      tenantId: Number(req.osTenantId),
      authUserId: Number(req.osAuthUser.id),
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: clean(req.headers["user-agent"]),
    })
    .onConflictDoUpdate({
      target: agoojyeOsPushSubscriptions.endpoint,
      set: {
        authUserId: Number(req.osAuthUser.id),
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: clean(req.headers["user-agent"]),
        updatedAt: new Date(),
      },
    })
    .returning();
  return res.status(201).json({ ok: true, item: { id: subscription.id } });
});

const assistantSchema = z.object({ query: z.string().trim().min(2).max(1000) });
memberApi.post("/assistant", async (req: any, res) => {
  const parsed = assistantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Posez une question plus précise." });
  const tenantId = Number(req.osTenantId);
  const member = req.osMember;
  const query = parsed.data.query;
  const term = `%${query.replace(/[%_]/g, "")}%`;
  const [tasks, projects, documents, decisions, partners] = await Promise.all([
    db.query.agoojyeTasks.findMany({
      where: and(
        eq(agoojyeTasks.tenantId, tenantId),
        or(ilike(agoojyeTasks.title, term), ilike(agoojyeTasks.description, term)),
        Number(member.accessLevel || 0) >= 6
          ? sql`true`
          : or(eq(agoojyeTasks.assignedTo, Number(member.id)), eq(agoojyeTasks.teamId, Number(member.teamId || -1))),
      ),
      limit: 8,
    }),
    db.query.agoojyeOsProjects.findMany({
      where: and(
        eq(agoojyeOsProjects.tenantId, tenantId),
        lte(agoojyeOsProjects.confidentiality, Number(member.accessLevel || 1)),
        or(ilike(agoojyeOsProjects.name, term), ilike(agoojyeOsProjects.objective, term)),
      ),
      limit: 8,
    }),
    db.query.agoojyeDocuments.findMany({
      where: and(
        eq(agoojyeDocuments.tenantId, tenantId),
        or(ilike(agoojyeDocuments.title, term), ilike(agoojyeDocuments.description, term)),
        Number(member.accessLevel || 0) >= 6
          ? sql`true`
          : or(inArray(agoojyeDocuments.visibility, ["public", "internal"]), eq(agoojyeDocuments.teamId, Number(member.teamId || -1))),
      ),
      limit: 8,
    }),
    db.query.agoojyeOsDecisions.findMany({
      where: and(
        eq(agoojyeOsDecisions.tenantId, tenantId),
        lte(agoojyeOsDecisions.confidentiality, Number(member.accessLevel || 1)),
        or(ilike(agoojyeOsDecisions.decision, term), ilike(agoojyeOsDecisions.context, term)),
      ),
      limit: 8,
    }),
    memberCan(member, "crm")
      ? db.query.agoojyePartners.findMany({
          where: and(eq(agoojyePartners.tenantId, tenantId), or(ilike(agoojyePartners.name, term), ilike(agoojyePartners.notes, term))),
          limit: 8,
        })
      : Promise.resolve([]),
  ]);

  const permittedTasks = tasks.filter((item) =>
    canAccessAgoojiyeDataClass({ member, classification: item.confidentialityClass, resourceTeamId: item.teamId }),
  );
  const permittedProjects = projects.filter((item) =>
    canAccessAgoojiyeDataClass({
      member,
      classification: item.confidentialityClass,
      resourceTeamId: item.teamId,
      resourceProjectId: item.id,
      projectMembershipIds: new Set<number>(),
    }),
  );
  const permittedDocuments = documents.filter((item) =>
    canAccessAgoojiyeDataClass({ member, classification: item.confidentialityClass, resourceTeamId: item.teamId }),
  );
  const matches = [
    ...permittedTasks.map((item) => ({ type: "Tâche", title: item.title, detail: `${item.status} · ${item.priority}`, href: "/workspace/tasks" })),
    ...permittedProjects.map((item) => ({ type: "Projet", title: item.name, detail: `${item.progress}% · ${item.status}`, href: "/workspace/projects" })),
    ...permittedDocuments.map((item) => ({ type: "Document", title: item.title, detail: `${item.category} · ${item.status}`, href: "/workspace/files" })),
    ...decisions.map((item) => ({ type: "Décision", title: item.decision, detail: item.status, href: "/workspace/decisions" })),
    ...partners.map((item) => ({ type: "CRM", title: item.name, detail: `${item.category} · ${item.status}`, href: "/workspace/crm" })),
  ].slice(0, 15);
  const answer = matches.length
    ? `J'ai trouvé ${matches.length} élément${matches.length > 1 ? "s" : ""} correspondant à votre recherche. Ils sont classés ci-dessous selon vos autorisations.`
    : "Je n'ai trouvé aucun élément autorisé correspondant exactement à cette recherche. Essayez un nom de projet, une tâche, un document, une décision ou un partenaire.";
  await audit(tenantId, member, "ai_read_only_search", "falove", null, {
    query,
    resultCount: matches.length,
    level: 1,
    sources: ["tasks", "projects", "documents", "decisions", ...(memberCan(member, "crm") ? ["partners"] : [])],
  });
  return res.json({
    ok: true,
    agent: { name: "Falovè", badge: "IA", level: 1 },
    answer,
    matches,
    governance: "Lecture et recommandation uniquement. Aucune donnée n'a été modifiée.",
  });
});

adminApi.use(ensureTenantUser);
adminApi.use(requireWorkosMember);
adminApi.use(requireWorkosAdmin);
adminApi.post("/invitations", async (req: any, res) => {
  const tenantId = requireAgoojiyeTenant(req, res);
  if (!tenantId) return;
  const emails = list(req.body?.emails).map(normalizeEmail);
  if (!emails.length || emails.some((email) => !email.endsWith("@agoojiye.com"))) {
    return res.status(400).json({ message: "Fournissez au moins une adresse @agoojiye.com." });
  }
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(90, Number(req.body?.ttlDays || 30))) * 24 * 60 * 60 * 1000);
  const [invitation] = await db
    .insert(agoojyeOsInvitations)
    .values({
      tenantId,
      tokenHash: hashAgoojiyeInvitationToken(rawToken),
      label: clean(req.body?.label) || "Invitation équipe AGOOJIYE",
      allowedEmails: emails,
      maxUses: emails.length,
      expiresAt,
      createdBy: Number(req.workosUser?.id || 0) || null,
    })
    .returning();
  const origin = `${clean(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0]}://${clean(req.headers["x-forwarded-host"] || req.headers.host)}`;
  return res.status(201).json({
    ok: true,
    id: invitation.id,
    expiresAt,
    link: `${origin}/os/rejoindre/${encodeURIComponent(rawToken)}`,
  });
});

router.use("/api/agoojye/os", publicApi);
router.use("/api/agoojye/os/member", memberApi);
router.use("/api/admin/agoojye/os", adminApi);

export default router;
