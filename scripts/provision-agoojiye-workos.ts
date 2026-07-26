import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeOsChannelMembers,
  agoojyeOsChannels,
  agoojyeOsMessages,
  agoojyeOsProjectMembers,
  agoojyeProjectUsers,
  agoojyeTasks,
  agoojyeTeams,
  agoojyeWorkosAgents,
  agoojyeWorkosOffboardingEvents,
  agoojyeWorkosVacancies,
  eceSessions,
  eceUsers,
  userTenantRoles,
} from "@db/schema";
import {
  isMailserverSetupAvailable,
  mailserverDoveadmAuthTestWithRefresh,
  mailserverEmailAdd,
  mailserverEmailUpdate,
} from "../server/lib/mail/mailserverSetup";
import {
  buildPasswordSetupLink,
  createPasswordSetupToken,
  resolvePasswordSetupBaseUrl,
} from "../server/lib/password-setup";
import { resolveAgoojiyeTenantId, seedAgoojiyeOs } from "../server/lib/agoojye/osSeed";

const SUPER_ADMIN_EMAIL = String(process.env.AGOOJIYE_SUPER_ADMIN_EMAIL || "vs@agoojiye.com").trim().toLowerCase();
const PRIVATE_DIR = path.resolve("ops", "private");

function securePassword() {
  return `${randomBytes(20).toString("base64url")}!Aa7`;
}

async function persistPrivateJson(fileName: string, payload: Record<string, unknown>) {
  await mkdir(PRIVATE_DIR, { recursive: true });
  const target = path.join(PRIVATE_DIR, fileName);
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(target, 0o600).catch(() => undefined);
  return target;
}

async function ensureSuperAdmin(tenantId: number) {
  const existing = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, SUPER_ADMIN_EMAIL) });
  const metadata = {
    ...((existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {}) as Record<string, unknown>),
    mustChangePassword: true,
    requireMfa: true,
    applicationIdentity: "AGOOJIYE_SUPER_ADMIN",
    provisionedAt: new Date().toISOString(),
  };
  let user = existing;
  if (existing) {
    [user] = await db
      .update(eceUsers)
      .set({
        displayName: "Vital Sounouvou",
        roles: ["admin", "AGOOJIYE_SUPER_ADMIN"] as any,
        permissions: ["*", "admin:*"] as any,
        currentMode: "admin" as any,
        isActive: true,
        emailVerified: true,
        timezone: "Africa/Porto-Novo",
        metadata: metadata as any,
        updatedAt: new Date(),
      })
      .where(eq(eceUsers.id, existing.id))
      .returning();
  } else {
    [user] = await db
      .insert(eceUsers)
      .values({
        email: SUPER_ADMIN_EMAIL,
        passwordHash: null,
        displayName: "Vital Sounouvou",
        role: "admin",
        roles: ["admin", "AGOOJIYE_SUPER_ADMIN"] as any,
        permissions: ["*", "admin:*"] as any,
        currentMode: "admin" as any,
        isActive: true,
        emailVerified: true,
        timezone: "Africa/Porto-Novo",
        metadata: metadata as any,
      })
      .returning();
  }
  if (!user) throw new Error("Unable to provision the AGOOJIYE super-admin identity");

  await db
    .insert(userTenantRoles)
    .values({ tenantId, userId: Number(user.id), role: "SUPER_ADMIN" })
    .onConflictDoNothing();

  const direction = await db.query.agoojyeTeams.findFirst({
    where: and(eq(agoojyeTeams.tenantId, tenantId), eq(agoojyeTeams.slug, "direction-coordination")),
  });
  const [profile] = await db
    .insert(agoojyeProjectUsers)
    .values({
      tenantId,
      firstName: "Vital",
      lastName: "Sounouvou",
      displayName: "Vital Sounouvou",
      email: SUPER_ADMIN_EMAIL,
      role: "Super-administrateur AGOOJIYE",
      teamId: direction?.id || null,
      status: "Active",
      authUserId: Number(user.id),
      employmentType: "founder",
      responsibilities: ["Gouvernance", "Administration globale", "Sécurité"],
      onboardingProgress: 100,
      accessLevel: 7,
      permissions: ["*"],
      confirmedRole: true,
      emailAccountCreated: true,
      startDate: new Date(),
    })
    .onConflictDoUpdate({
      target: [agoojyeProjectUsers.tenantId, agoojyeProjectUsers.email],
      set: {
        displayName: "Vital Sounouvou",
        role: "Super-administrateur AGOOJIYE",
        teamId: direction?.id || null,
        status: "Active",
        authUserId: Number(user.id),
        accessLevel: 7,
        permissions: ["*"],
        onboardingProgress: 100,
        confirmedRole: true,
        emailAccountCreated: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  const setup = await createPasswordSetupToken({ userId: Number(user.id), ttlHours: 24, invalidateExisting: true });
  const setupLink = buildPasswordSetupLink(
    resolvePasswordSetupBaseUrl(process.env.AGOOJIYE_APP_URL || "https://agoojiye.com"),
    setup.rawToken,
  );
  const privatePath = await persistPrivateJson("agoojye-super-admin-setup.json", {
    email: SUPER_ADMIN_EMAIL,
    setupLink,
    expiresAt: setup.expiresAt.toISOString(),
    instructions: "Use once, then enroll MFA. Never send this file through public chat.",
  });

  await db.insert(agoojyeAuditLogs).values({
    tenantId,
    actor: "AGOOJIYE WorkOS provisioner",
    action: "super_admin_provisioned",
    entityType: "ece_user",
    entityId: Number(user.id),
    metadata: { email: SUPER_ADMIN_EMAIL, profileId: profile.id, mfaRequired: true },
  });
  return { user, profile, privatePath };
}

async function ensureMailbox() {
  if (!isMailserverSetupAvailable()) return { status: "not_available" as const };
  const mailboxPassword = securePassword();
  let result = await mailserverEmailAdd(SUPER_ADMIN_EMAIL, mailboxPassword);
  if (!result.ok && /exist|already/i.test(`${result.stdout}\n${result.stderr}`)) {
    if (!process.argv.includes("--reset-existing-mailbox")) return { status: "already_exists" as const };
    result = await mailserverEmailUpdate(SUPER_ADMIN_EMAIL, mailboxPassword);
  }
  if (!result.ok) throw new Error(`Unable to provision ${SUPER_ADMIN_EMAIL}: ${result.stderr || "mailserver setup failed"}`);
  const verified = await mailserverDoveadmAuthTestWithRefresh(SUPER_ADMIN_EMAIL, mailboxPassword);
  if (!verified.ok) throw new Error(`Mailbox authentication verification failed for ${SUPER_ADMIN_EMAIL}`);
  const privatePath = await persistPrivateJson("agoojye-vs-mailbox-initial.json", {
    email: SUPER_ADMIN_EMAIL,
    initialPassword: mailboxPassword,
    webmail: process.env.AGOOJIYE_WEBMAIL_URL || "https://mail.agoojiye.com/",
    mustChangeAtFirstUse: true,
  });
  return { status: "provisioned" as const, privatePath };
}

async function offboardBinta(tenantId: number, performedBy: number) {
  const profile = await db.query.agoojyeProjectUsers.findFirst({
    where: and(
      eq(agoojyeProjectUsers.tenantId, tenantId),
      or(
        ilike(agoojyeProjectUsers.firstName, "binta"),
        ilike(agoojyeProjectUsers.displayName, "binta%"),
        ilike(agoojyeProjectUsers.email, "binta@%"),
      ),
    ),
  });
  if (!profile) return { status: "not_present" as const, tasks: 0 };
  const activeTasks = await db.query.agoojyeTasks.findMany({
    where: and(
      eq(agoojyeTasks.tenantId, tenantId),
      eq(agoojyeTasks.assignedTo, Number(profile.id)),
      inArray(agoojyeTasks.status, ["todo", "in_progress", "blocked", "review"]),
    ),
  });
  await db.transaction(async (tx) => {
    if (activeTasks.length) {
      await tx
        .update(agoojyeTasks)
        .set({
          assignedTo: null,
          status: "todo",
          blocker: "À réattribuer après le départ de Binta.",
          metadata: sql`coalesce(${agoojyeTasks.metadata}, '{}'::jsonb) || '{"assignmentState":"A_REATTRIBUER"}'::jsonb`,
          updatedAt: new Date(),
        })
        .where(inArray(agoojyeTasks.id, activeTasks.map((task) => Number(task.id))));
    }
    await tx.delete(agoojyeOsChannelMembers).where(eq(agoojyeOsChannelMembers.userId, Number(profile.id)));
    await tx.delete(agoojyeOsProjectMembers).where(eq(agoojyeOsProjectMembers.userId, Number(profile.id)));
    await tx
      .update(agoojyeProjectUsers)
      .set({
        status: "Ancien membre",
        accessLevel: 0,
        permissions: [],
        availability: "offboarded",
        updatedAt: new Date(),
      })
      .where(eq(agoojyeProjectUsers.id, profile.id));
    if (profile.authUserId) {
      await tx.delete(eceSessions).where(eq(eceSessions.userId, Number(profile.authUserId)));
      await tx.delete(userTenantRoles).where(
        and(eq(userTenantRoles.tenantId, tenantId), eq(userTenantRoles.userId, Number(profile.authUserId))),
      );
      await tx
        .update(eceUsers)
        .set({ isActive: false, roles: [] as any, permissions: [] as any, updatedAt: new Date() })
        .where(eq(eceUsers.id, Number(profile.authUserId)));
    }
    await tx.insert(agoojyeWorkosOffboardingEvents).values({
      tenantId,
      projectUserId: Number(profile.id),
      authUserId: profile.authUserId ? Number(profile.authUserId) : null,
      performedBy,
      reason: "Retrait de Binta de l'organisation active AGOOJIYE",
      transferredTaskCount: activeTasks.length,
      mailboxStatus: "retained_archived",
      snapshot: {
        displayName: profile.displayName,
        email: profile.email,
        role: profile.role,
        teamId: profile.teamId,
      },
    });
    await tx
      .insert(agoojyeWorkosVacancies)
      .values({
        tenantId,
        teamId: profile.teamId,
        title: profile.role || "Poste à pourvoir",
        previousHolderUserId: Number(profile.id),
        status: "open",
        metadata: { source: "binta_offboarding" },
      });
  });
  if (isMailserverSetupAvailable() && profile.email.endsWith("@agoojiye.com")) {
    await mailserverEmailUpdate(profile.email, securePassword()).catch(() => undefined);
  }
  return { status: "offboarded" as const, tasks: activeTasks.length };
}

async function ensureOlivierAndAssistant(tenantId: number) {
  const gestion = await db.query.agoojyeTeams.findFirst({
    where: and(eq(agoojyeTeams.tenantId, tenantId), eq(agoojyeTeams.slug, "direction-coordination")),
  });
  const existingOlivier = await db.query.agoojyeWorkosVacancies.findFirst({
    where: and(
      eq(agoojyeWorkosVacancies.tenantId, tenantId),
      eq(agoojyeWorkosVacancies.candidateName, "Olivier"),
    ),
  });
  if (!existingOlivier) {
    await db.insert(agoojyeWorkosVacancies).values({
      tenantId,
      teamId: gestion?.id || null,
      title: "Responsable / Coordinateur de gestion",
      candidateName: "Olivier",
      status: "candidate_email_required",
      restrictions: [
        "LEGAL_FINANCIAL_RESTRICTED",
        "MANAGEMENT_CONFIDENTIAL",
        "SUPER_ADMIN_RESTRICTED",
        "TECHNICAL_RESTRICTED",
      ],
      metadata: { department: "Gestion", invitationBlockedUntilExactEmail: true },
    });
  }
  const [assistant] = await db
    .insert(agoojyeWorkosAgents)
    .values({
      tenantId,
      key: "howji",
      name: "AGOOJIYE — Assistant IA",
      description: "Assistant unique contextualisé pour le travail personnel, les départements, les opérations mobilité et la direction.",
      timezone: "Africa/Porto-Novo",
      policy: {
        internalReminders: true,
        approvalRequiredFor: ["external", "financial", "legal", "permissions", "delete", "public"],
        privateMessagesExcluded: true,
        allActionsAudited: true,
      },
      schedule: {
        dailyBrief: "07:30",
        overdueScan: "09:00",
        weeklyReport: "MON 08:00",
      },
      dailyBudgetXof: 0,
    })
    .onConflictDoUpdate({
      target: [agoojyeWorkosAgents.tenantId, agoojyeWorkosAgents.key],
      set: {
        name: "AGOOJIYE — Assistant IA",
        description: "Assistant unique contextualisé pour le travail personnel, les départements, les opérations mobilité et la direction.",
        status: "active",
        timezone: "Africa/Porto-Novo",
        updatedAt: new Date(),
      },
    })
    .returning();
  const [assistantChannel] = await db
    .insert(agoojyeOsChannels)
    .values({
      tenantId,
      slug: "howji-coordination",
      name: "AGOOJIYE — Assistant IA",
      description: "Conversation épinglée de synthèse, échéances, blocages et recommandations contextualisées.",
      channelType: "agent",
      teamId: gestion?.id || null,
      confidentiality: 5,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [agoojyeOsChannels.tenantId, agoojyeOsChannels.slug],
      set: {
        name: "AGOOJIYE — Assistant IA",
        description: "Conversation épinglée de synthèse, échéances, blocages et recommandations contextualisées.",
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning();
  const management = await db.query.agoojyeProjectUsers.findMany({
    where: and(eq(agoojyeProjectUsers.tenantId, tenantId), sql`${agoojyeProjectUsers.accessLevel} >= 5`),
  });
  for (const member of management) {
    await db
      .insert(agoojyeOsChannelMembers)
      .values({ tenantId, channelId: Number(assistantChannel.id), userId: Number(member.id), role: "member" })
      .onConflictDoNothing();
  }
  const pinned = await db.query.agoojyeOsMessages.findFirst({
    where: and(
      eq(agoojyeOsMessages.tenantId, tenantId),
      eq(agoojyeOsMessages.channelId, Number(assistantChannel.id)),
      eq(agoojyeOsMessages.messageType, "agent_system"),
    ),
  });
  if (!pinned) {
    await db.insert(agoojyeOsMessages).values({
      tenantId,
      channelId: Number(assistantChannel.id),
      senderUserId: null,
      body: "AGOOJIYE — Assistant IA prépare les synthèses, suit les échéances et propose des relances selon vos autorisations. Les actions externes, financières, juridiques, publiques ou liées aux accès nécessitent une approbation humaine.",
      messageType: "agent_system",
      pinnedAt: new Date(),
      metadata: { agentKey: "howji", governanceNotice: true },
    });
  } else {
    await db
      .update(agoojyeOsMessages)
      .set({
        body: "AGOOJIYE — Assistant IA prépare les synthèses, suit les échéances et propose des relances selon vos autorisations. Les actions externes, financières, juridiques, publiques ou liées aux accès nécessitent une approbation humaine.",
        updatedAt: new Date(),
      })
      .where(eq(agoojyeOsMessages.id, pinned.id));
  }
  return { assistantId: Number(assistant.id) };
}

async function main() {
  const tenantId = await resolveAgoojiyeTenantId();
  await seedAgoojiyeOs(tenantId);
  const superAdmin = await ensureSuperAdmin(tenantId);
  const [mailbox, offboarding, operations] = await Promise.all([
    ensureMailbox(),
    offboardBinta(tenantId, Number(superAdmin.user.id)),
    ensureOlivierAndAssistant(tenantId),
  ]);
  console.log(JSON.stringify({
    ok: true,
    tenantId,
    superAdminEmail: SUPER_ADMIN_EMAIL,
    setupInstructionsStoredPrivately: true,
    mailboxStatus: mailbox.status,
    bintaStatus: offboarding.status,
    transferredTasks: offboarding.tasks,
    assistantId: operations.assistantId,
    olivier: "email_required_before_invitation",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
