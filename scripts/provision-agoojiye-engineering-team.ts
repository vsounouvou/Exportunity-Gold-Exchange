import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeEmailIdentities,
  agoojyeEngineeringProfiles,
  agoojyeParticipants,
  agoojyeProjectUsers,
  eceUsers,
  emailAccounts,
  emailDomains,
  userTenantRoles,
} from "@db/schema";
import {
  assertNoOutboundDeliveryArguments,
  ENGINEERING_ROSTER,
  ENGINEERING_SOURCE,
  summarizeEngineeringRoster,
  validateEngineeringRoster,
  type EngineeringRosterMember,
} from "../server/lib/agoojye/engineeringTeam";
import { loadPrivateEngineeringRoster } from "../server/lib/agoojye/engineeringWorkbook";
import {
  ensureEngineeringTeams,
  seedEngineeringWorkspace,
} from "../server/lib/agoojye/engineeringWorkspace";
import { resolveAgoojiyeTenantId } from "../server/lib/agoojye/osSeed";
import {
  isMailserverSetupAvailable,
  mailserverDoveadmAuthTestWithRefresh,
  mailserverEmailAdd,
  mailserverQuotaSet,
} from "../server/lib/mail/mailserverSetup";

const APPLY = process.argv.includes("--apply");
const CONFIRM_NO_EMAIL = process.argv.includes("--confirm-no-email");
const MAILBOX_QUOTA_MB = 2048;
const HANDOFF_FILE = "engineering-team-handoff-2026-07-28.json";

type HandoffAccount = {
  corporateEmail: string;
  displayName: string;
  personalEmail: string | null;
  initialMailboxPassword: string;
  mailboxState: "planned" | "provisioned" | "existing" | "failed";
  mailboxPasswordKnown: boolean;
  platformAccountState: "planned" | "prepared";
  setupLink: null;
  deliveryState: "not_authorized";
  lastCheckedAt?: string;
  errorCode?: string;
};

type HandoffManifest = {
  version: 1;
  sourceHash: string;
  generatedAt: string;
  updatedAt: string;
  noEmailSent: true;
  outboundDeliveryAuthorized: false;
  webmailUrl: string;
  setupLinkPolicy: string;
  accounts: HandoffAccount[];
};

function securePassword() {
  return `${randomBytes(24).toString("base64url")}!Aa7`;
}

function normalizedPersonKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function secureHandoffDirectory() {
  const configured = String(process.env.AGOOJIYE_SECURE_HANDOFF_DIR || "").trim();
  if (configured) return path.resolve(configured);
  if (process.env.NODE_ENV === "production") return "/home/vital/secure/agoojye";
  return path.resolve("ops", "private");
}

async function readManifest(target: string): Promise<HandoffManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(target, "utf8")) as HandoffManifest;
    if (parsed?.version !== 1 || parsed?.sourceHash !== ENGINEERING_SOURCE.workbookSha256) return null;
    return parsed;
  } catch {
    return null;
  }
}

function mergeManifest(
  previous: HandoffManifest | null,
  roster: ReadonlyArray<EngineeringRosterMember>,
): HandoffManifest {
  const priorByEmail = new Map(
    (previous?.accounts || []).map((account) => [account.corporateEmail.toLowerCase(), account]),
  );
  const now = new Date().toISOString();
  return {
    version: 1,
    sourceHash: ENGINEERING_SOURCE.workbookSha256,
    generatedAt: previous?.generatedAt || now,
    updatedAt: now,
    noEmailSent: true,
    outboundDeliveryAuthorized: false,
    webmailUrl: process.env.AGOOJIYE_WEBMAIL_URL || "https://mail.agoojiye.com/",
    setupLinkPolicy:
      "Aucun lien n'est généré pendant le provisioning. Un lien frais et personnel sera créé uniquement après autorisation explicite d'envoi.",
    accounts: roster.map((rosterMember) => {
      const previousAccount = priorByEmail.get(rosterMember.corporateEmail);
      return {
        corporateEmail: rosterMember.corporateEmail,
        displayName: rosterMember.displayName,
        personalEmail: rosterMember.personalEmail,
        initialMailboxPassword: previousAccount?.initialMailboxPassword || securePassword(),
        mailboxState: previousAccount?.mailboxState || "planned",
        mailboxPasswordKnown: previousAccount?.mailboxPasswordKnown || false,
        platformAccountState: previousAccount?.platformAccountState || "planned",
        setupLink: null,
        deliveryState: "not_authorized",
        lastCheckedAt: previousAccount?.lastCheckedAt,
        errorCode: previousAccount?.errorCode,
      };
    }),
  };
}

async function persistManifest(target: string, manifest: HandoffManifest) {
  manifest.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(target), 0o700).catch(() => undefined);
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(target, 0o600).catch(() => undefined);
}

function manifestAccount(manifest: HandoffManifest, email: string) {
  const account = manifest.accounts.find((entry) => entry.corporateEmail === email);
  if (!account) throw new Error(`Handoff account missing for ${email}`);
  return account;
}

async function mailboxProvision(
  rosterMember: EngineeringRosterMember,
  handoff: HandoffAccount,
) {
  if (handoff.mailboxState === "provisioned" && handoff.mailboxPasswordKnown) {
    const existingAuth = await mailserverDoveadmAuthTestWithRefresh(
      rosterMember.corporateEmail,
      handoff.initialMailboxPassword,
      { attempts: 2, delayMs: 500 },
    );
    if (existingAuth.ok) {
      handoff.lastCheckedAt = new Date().toISOString();
      return "provisioned" as const;
    }
  }

  const result = await mailserverEmailAdd(
    rosterMember.corporateEmail,
    handoff.initialMailboxPassword,
  );
  if (!result.ok && /exist|already/i.test(`${result.stdout}\n${result.stderr}`)) {
    handoff.mailboxState = "existing";
    handoff.mailboxPasswordKnown = false;
    handoff.lastCheckedAt = new Date().toISOString();
    handoff.errorCode = undefined;
    return "existing" as const;
  }
  if (!result.ok) {
    handoff.mailboxState = "failed";
    handoff.mailboxPasswordKnown = false;
    handoff.lastCheckedAt = new Date().toISOString();
    handoff.errorCode = "MAILSERVER_ADD_FAILED";
    throw new Error(`Provisioning failed for ${rosterMember.corporateEmail}`);
  }

  const verified = await mailserverDoveadmAuthTestWithRefresh(
    rosterMember.corporateEmail,
    handoff.initialMailboxPassword,
  );
  if (!verified.ok) {
    handoff.mailboxState = "failed";
    handoff.mailboxPasswordKnown = false;
    handoff.lastCheckedAt = new Date().toISOString();
    handoff.errorCode = "MAILSERVER_AUTH_FAILED";
    throw new Error(`Mailbox authentication failed for ${rosterMember.corporateEmail}`);
  }
  const quota = await mailserverQuotaSet(rosterMember.corporateEmail, "2G");
  if (!quota.ok) {
    handoff.errorCode = "MAILSERVER_QUOTA_WARNING";
  } else {
    handoff.errorCode = undefined;
  }
  handoff.mailboxState = "provisioned";
  handoff.mailboxPasswordKnown = true;
  handoff.lastCheckedAt = new Date().toISOString();
  return "provisioned" as const;
}

async function ensureDomain(tenantId: number) {
  const [domain] = await db
    .insert(emailDomains)
    .values({
      tenantId,
      domain: "agoojiye.com",
      type: "primary",
      isVerified: true,
      metadata: {
        source: "engineering_team_provisioner",
        webmail: process.env.AGOOJIYE_WEBMAIL_URL || "https://mail.agoojiye.com/",
      },
    })
    .onConflictDoUpdate({
      target: [emailDomains.tenantId, emailDomains.domain],
      set: {
        type: "primary",
        isVerified: true,
        updatedAt: new Date(),
      },
    })
    .returning();
  return domain;
}

async function existingProfileForMember(
  tenantId: number,
  rosterMember: EngineeringRosterMember,
) {
  const engineering = await db.query.agoojyeEngineeringProfiles.findFirst({
    where: and(
      eq(agoojyeEngineeringProfiles.tenantId, tenantId),
      eq(agoojyeEngineeringProfiles.sourceUid, rosterMember.sourceUid),
    ),
  });
  if (engineering) {
    return db.query.agoojyeProjectUsers.findFirst({
      where: and(
        eq(agoojyeProjectUsers.tenantId, tenantId),
        eq(agoojyeProjectUsers.id, Number(engineering.projectUserId)),
      ),
    });
  }

  const byCorporateEmail = await db.query.agoojyeProjectUsers.findFirst({
    where: and(
      eq(agoojyeProjectUsers.tenantId, tenantId),
      eq(agoojyeProjectUsers.email, rosterMember.corporateEmail),
    ),
  });
  if (byCorporateEmail) return byCorporateEmail;

  if (rosterMember.personalEmail) {
    const byPersonalEmail = await db.query.agoojyeProjectUsers.findFirst({
      where: and(
        eq(agoojyeProjectUsers.tenantId, tenantId),
        eq(agoojyeProjectUsers.email, rosterMember.personalEmail),
      ),
    });
    if (byPersonalEmail) return byPersonalEmail;
  }

  const tenantProfiles = await db.query.agoojyeProjectUsers.findMany({
    where: eq(agoojyeProjectUsers.tenantId, tenantId),
  });
  const expected = normalizedPersonKey(rosterMember.displayName);
  return (
    tenantProfiles.find(
      (profile) => normalizedPersonKey(profile.displayName) === expected,
    ) || null
  );
}

async function prepareMember(input: {
  tenantId: number;
  domainId: number;
  teamId: number;
  managerUserId: number | null;
  rosterMember: EngineeringRosterMember;
  handoff: HandoffAccount;
}) {
  const {
    tenantId,
    domainId,
    teamId,
    managerUserId,
    rosterMember,
    handoff,
  } = input;
  const currentProfile = await existingProfileForMember(tenantId, rosterMember);
  let authUser = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.email, rosterMember.corporateEmail),
  });
  if (
    authUser &&
    normalizedPersonKey(authUser.displayName) !==
      normalizedPersonKey(rosterMember.displayName)
  ) {
    throw new Error(
      `Corporate email collision for ${rosterMember.corporateEmail}; existing identity is ${authUser.displayName}`,
    );
  }

  const userMetadata = {
    ...((authUser?.metadata &&
    typeof authUser.metadata === "object" &&
    !Array.isArray(authUser.metadata)
      ? authUser.metadata
      : {}) as Record<string, unknown>),
    mustChangePassword: true,
    source: "agoojye_engineering_team",
    sourceUid: rosterMember.sourceUid,
    accountPreparedAt: new Date().toISOString(),
    invitationState: "not_sent",
    outboundDeliveryAuthorized: false,
    webmailPasswordSyncOnActivation: true,
  };
  if (authUser) {
    [authUser] = await db
      .update(eceUsers)
      .set({
        displayName: rosterMember.displayName,
        roles: ["staff"] as any,
        permissions: [] as any,
        currentMode: "buyer",
        isActive: true,
        emailVerified: true,
        phone: rosterMember.phone,
        country: "BJ",
        timezone: "Africa/Porto-Novo",
        metadata: userMetadata as any,
        updatedAt: new Date(),
      })
      .where(eq(eceUsers.id, Number(authUser.id)))
      .returning();
  } else {
    [authUser] = await db
      .insert(eceUsers)
      .values({
        email: rosterMember.corporateEmail,
        passwordHash: null,
        displayName: rosterMember.displayName,
        role: "buyer",
        roles: ["staff"] as any,
        permissions: [] as any,
        currentMode: "buyer",
        isActive: true,
        emailVerified: true,
        phone: rosterMember.phone,
        country: "BJ",
        timezone: "Africa/Porto-Novo",
        metadata: userMetadata as any,
      })
      .returning();
  }
  if (!authUser) throw new Error(`Unable to prepare ${rosterMember.corporateEmail}`);

  await db
    .insert(userTenantRoles)
    .values({ tenantId, userId: Number(authUser.id), role: "USER" })
    .onConflictDoNothing();

  const profileValues = {
    firstName: rosterMember.firstName,
    lastName: rosterMember.lastName,
    displayName: rosterMember.displayName,
    email: rosterMember.corporateEmail,
    phone: rosterMember.phone,
    role: rosterMember.roleTitle,
    teamId,
    status:
      currentProfile?.status &&
      String(currentProfile.status).toLowerCase() === "active"
        ? "Active"
        : "Prepared",
    authUserId: Number(authUser.id),
    managerUserId,
    employmentType: "project_engineer",
    responsibilities: rosterMember.skills,
    availability: "available",
    onboardingProgress: Math.max(
      Number(currentProfile?.onboardingProgress || 0),
      15,
    ),
    accessLevel: 3,
    permissions: ["messages", "tasks", "projects", "documents", "ai"],
    startDate: new Date("2026-07-27T08:00:00+01:00"),
    confirmedRole: rosterMember.assignmentConfidence === "source",
    updatedAt: new Date(),
  };
  let projectUser = currentProfile;
  if (currentProfile) {
    [projectUser] = await db
      .update(agoojyeProjectUsers)
      .set(profileValues)
      .where(eq(agoojyeProjectUsers.id, Number(currentProfile.id)))
      .returning();
  } else {
    [projectUser] = await db
      .insert(agoojyeProjectUsers)
      .values({
        tenantId,
        ...profileValues,
        emailAccountCreated: false,
      })
      .returning();
  }
  if (!projectUser) {
    throw new Error(`Unable to create AGOOJIYE profile for ${rosterMember.corporateEmail}`);
  }

  const existingParticipant = await db.query.agoojyeParticipants.findFirst({
    where: and(
      eq(agoojyeParticipants.tenantId, tenantId),
      eq(agoojyeParticipants.userId, Number(projectUser.id)),
    ),
  });
  const participantValues = {
    teamId,
    roleTitle: rosterMember.roleTitle,
    confirmedRole: rosterMember.assignmentConfidence === "source",
    participantType: "engineer",
    skills: rosterMember.skills,
    phone: rosterMember.phone,
    schoolOrCompany: rosterMember.studyProgram,
    status: "Pending",
    notes:
      rosterMember.assignmentConfidence === "inferred_needs_confirmation"
        ? "Spécialité à confirmer par un administrateur. Aucun message envoyé."
        : "Compte préparé sans message sortant.",
    updatedAt: new Date(),
  };
  if (existingParticipant) {
    await db
      .update(agoojyeParticipants)
      .set(participantValues)
      .where(eq(agoojyeParticipants.id, Number(existingParticipant.id)));
  } else {
    await db.insert(agoojyeParticipants).values({
      tenantId,
      userId: Number(projectUser.id),
      ...participantValues,
    });
  }

  const [emailAccount] = await db
    .insert(emailAccounts)
    .values({
      tenantId,
      ownerUserId: Number(authUser.id),
      address: rosterMember.corporateEmail,
      localPart: rosterMember.corporateLocalPart,
      domainId,
      status: "active",
      quotaMb: MAILBOX_QUOTA_MB,
      metadata: {
        humanMailbox: true,
        source: "agoojye_engineering_team",
        invitationState: "not_sent",
        outboundDeliveryAuthorized: false,
      },
    })
    .onConflictDoUpdate({
      target: [emailAccounts.tenantId, emailAccounts.address],
      set: {
        ownerUserId: Number(authUser.id),
        localPart: rosterMember.corporateLocalPart,
        domainId,
        status: "active",
        quotaMb: MAILBOX_QUOTA_MB,
        metadata: {
          humanMailbox: true,
          source: "agoojye_engineering_team",
          invitationState: "not_sent",
          outboundDeliveryAuthorized: false,
        },
        updatedAt: new Date(),
      },
    })
    .returning();

  const mailboxState = await mailboxProvision(rosterMember, handoff);
  const [identity] = await db
    .insert(agoojyeEmailIdentities)
    .values({
      tenantId,
      userId: Number(projectUser.id),
      emailAddress: rosterMember.corporateEmail,
      displayName: rosterMember.displayName,
      emailType: "individual",
      provider: "docker-mailserver",
      status: "active",
      canSend: true,
      canReceive: true,
      forwardingAddress: null,
      createdBy: "engineering_team_provisioner",
      notes: "Boîte préparée. Aucun e-mail d'invitation ou de notification envoyé.",
    })
    .onConflictDoUpdate({
      target: [
        agoojyeEmailIdentities.tenantId,
        agoojyeEmailIdentities.emailAddress,
      ],
      set: {
        userId: Number(projectUser.id),
        displayName: rosterMember.displayName,
        provider: "docker-mailserver",
        status: "active",
        canSend: true,
        canReceive: true,
        notes: "Boîte préparée. Aucun e-mail d'invitation ou de notification envoyé.",
        updatedAt: new Date(),
      },
    })
    .returning();

  if (identity) {
    await db
      .update(agoojyeParticipants)
      .set({ emailIdentityId: Number(identity.id), updatedAt: new Date() })
      .where(
        and(
          eq(agoojyeParticipants.tenantId, tenantId),
          eq(agoojyeParticipants.userId, Number(projectUser.id)),
        ),
      );
  }

  await db
    .insert(agoojyeEngineeringProfiles)
    .values({
      tenantId,
      projectUserId: Number(projectUser.id),
      sourceUid: rosterMember.sourceUid,
      sourceName: rosterMember.sourceName,
      sourceRows: rosterMember.sourceRows,
      sourceHash: ENGINEERING_SOURCE.workbookSha256,
      corporateEmail: rosterMember.corporateEmail,
      personalEmail: rosterMember.personalEmail,
      studyProgram: rosterMember.studyProgram,
      sourceSquad: rosterMember.sourceSquad,
      discipline: rosterMember.teamSlug,
      assignmentConfidence: rosterMember.assignmentConfidence,
      skills: rosterMember.skills,
      ndaStatus: rosterMember.ndaStatus,
      ndaUrl: rosterMember.ndaUrl,
      ndaAccessState:
        rosterMember.ndaStatus === "signed" ? "required" : "blocked",
      onboardingState:
        rosterMember.assignmentConfidence === "source"
          ? "prepared"
          : "needs_role_confirmation",
      invitationState: "not_sent",
      mailboxState,
      sourceMetadata: {
        workbook: ENGINEERING_SOURCE.workbookName,
        duplicateMerged: rosterMember.sourceRows.length > 1,
        emailAccountId: emailAccount.id,
        outboundDeliveryAuthorized: false,
      },
    })
    .onConflictDoUpdate({
      target: [
        agoojyeEngineeringProfiles.tenantId,
        agoojyeEngineeringProfiles.sourceUid,
      ],
      set: {
        projectUserId: Number(projectUser.id),
        sourceName: rosterMember.sourceName,
        sourceRows: rosterMember.sourceRows,
        sourceHash: ENGINEERING_SOURCE.workbookSha256,
        corporateEmail: rosterMember.corporateEmail,
        personalEmail: rosterMember.personalEmail,
        studyProgram: rosterMember.studyProgram,
        sourceSquad: rosterMember.sourceSquad,
        discipline: rosterMember.teamSlug,
        assignmentConfidence: rosterMember.assignmentConfidence,
        skills: rosterMember.skills,
        ndaStatus: rosterMember.ndaStatus,
        ndaUrl: rosterMember.ndaUrl,
        onboardingState:
          rosterMember.assignmentConfidence === "source"
            ? "prepared"
            : "needs_role_confirmation",
        invitationState: "not_sent",
        mailboxState,
        sourceMetadata: {
          workbook: ENGINEERING_SOURCE.workbookName,
          duplicateMerged: rosterMember.sourceRows.length > 1,
          emailAccountId: emailAccount.id,
          outboundDeliveryAuthorized: false,
        },
        updatedAt: new Date(),
      },
    });

  await db
    .update(agoojyeProjectUsers)
    .set({ emailAccountCreated: true, updatedAt: new Date() })
    .where(eq(agoojyeProjectUsers.id, Number(projectUser.id)));

  handoff.platformAccountState = "prepared";
  return { projectUserId: Number(projectUser.id), mailboxState };
}

async function dryRun(
  tenantId: number,
  roster: ReadonlyArray<EngineeringRosterMember>,
) {
  const corporateEmails = roster.map((entry) => entry.corporateEmail);
  const existingUsers = await db.query.eceUsers.findMany();
  const existingCorporate = new Set(
    existingUsers
      .map((user) => String(user.email || "").toLowerCase())
      .filter((email) => corporateEmails.includes(email)),
  );
  const collisions = roster.filter((entry) => {
    const existing = existingUsers.find(
      (user) =>
        String(user.email || "").toLowerCase() === entry.corporateEmail,
    );
    return (
      existing &&
      normalizedPersonKey(existing.displayName) !==
        normalizedPersonKey(entry.displayName)
    );
  });
  return {
    ok: collisions.length === 0,
    mode: "dry-run",
    tenantId,
    writes: 0,
    outboundMessages: 0,
    mailserverAvailable: isMailserverSetupAvailable(),
    roster: summarizeEngineeringRoster(roster),
    existingCorporateAccounts: existingCorporate.size,
    accountsToPrepare: roster.length - existingCorporate.size,
    collisions: collisions.map((entry) => entry.corporateEmail),
    missingPersonalContact: roster.filter(
      (entry) => !entry.personalEmailRecorded,
    ).map((entry) => entry.displayName),
    nextCommand:
      "npm run provision:agoojye:engineering-team -- --apply --confirm-no-email",
  };
}

async function main() {
  assertNoOutboundDeliveryArguments(process.argv.slice(2));
  const workbookArgument = process.argv.find((argument) =>
    argument.startsWith("--workbook="),
  );
  const workbookPath =
    workbookArgument?.slice("--workbook=".length).trim() ||
    String(process.env.AGOOJIYE_ENGINEERING_WORKBOOK_PATH || "").trim();
  if (APPLY && !workbookPath) {
    throw new Error(
      "Apply mode requires --workbook=<private-xlsx-path> or AGOOJIYE_ENGINEERING_WORKBOOK_PATH.",
    );
  }
  const roster = workbookPath
    ? (await loadPrivateEngineeringRoster(workbookPath)).roster
    : [...ENGINEERING_ROSTER];
  const rosterValidation = validateEngineeringRoster(roster);
  if (!rosterValidation.ok) {
    throw new Error(rosterValidation.errors.join("; "));
  }
  const tenantId = await resolveAgoojiyeTenantId();

  if (!APPLY) {
    console.log(JSON.stringify(await dryRun(tenantId, roster), null, 2));
    return;
  }
  if (!CONFIRM_NO_EMAIL) {
    throw new Error(
      "Apply mode requires --confirm-no-email. This provisioner never sends invitations or notifications.",
    );
  }
  if (!isMailserverSetupAvailable()) {
    throw new Error(
      "The AGOOJIYE mailserver is unavailable. No partial database-only provisioning is allowed.",
    );
  }

  const secureDir = secureHandoffDirectory();
  const handoffPath = path.join(secureDir, HANDOFF_FILE);
  const manifest = mergeManifest(await readManifest(handoffPath), roster);
  await persistManifest(handoffPath, manifest);

  const teamBySlug = await ensureEngineeringTeams(tenantId);
  const domain = await ensureDomain(tenantId);
  const manager = await db.query.agoojyeProjectUsers.findFirst({
    where: and(
      eq(agoojyeProjectUsers.tenantId, tenantId),
      eq(agoojyeProjectUsers.email, "christian@agoojiye.com"),
    ),
  });
  const userByCorporateEmail = new Map<string, number>();
  const results: Array<{
    email: string;
    projectUserId: number;
    mailboxState: string;
  }> = [];

  for (const rosterMember of roster) {
    const teamId = teamBySlug.get(rosterMember.teamSlug);
    if (!teamId) {
      throw new Error(`Missing engineering team ${rosterMember.teamSlug}`);
    }
    const handoffAccount = manifestAccount(
      manifest,
      rosterMember.corporateEmail,
    );
    try {
      const prepared = await prepareMember({
        tenantId,
        domainId: Number(domain.id),
        teamId,
        managerUserId: manager ? Number(manager.id) : null,
        rosterMember,
        handoff: handoffAccount,
      });
      userByCorporateEmail.set(
        rosterMember.corporateEmail,
        prepared.projectUserId,
      );
      results.push({
        email: rosterMember.corporateEmail,
        projectUserId: prepared.projectUserId,
        mailboxState: prepared.mailboxState,
      });
    } finally {
      await persistManifest(handoffPath, manifest);
    }
  }

  const workspace = await seedEngineeringWorkspace({
    tenantId,
    teamBySlug,
    userByCorporateEmail,
  });
  await db.insert(agoojyeAuditLogs).values({
    tenantId,
    actor: "AGOOJIYE engineering team provisioner",
    action: "engineering_team_accounts_prepared",
    entityType: "engineering_roster",
    entityId: null,
    metadata: {
      sourceHash: ENGINEERING_SOURCE.workbookSha256,
      accountCount: results.length,
      mailboxCount: results.filter((result) =>
        ["provisioned", "existing"].includes(result.mailboxState),
      ).length,
      invitationCount: 0,
      outboundMessageCount: 0,
      secureHandoffStored: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "apply",
        tenantId,
        accountsPrepared: results.length,
        mailboxesReady: results.filter((result) =>
          ["provisioned", "existing"].includes(result.mailboxState),
        ).length,
        invitationsSent: 0,
        emailsSent: 0,
        notificationsSent: 0,
        setupLinksGenerated: 0,
        handoffStoredPrivately: true,
        handoffPath,
        workspace,
        reviewRequired: {
          missingPersonalEmail: roster.filter(
            (entry) => !entry.personalEmailRecorded,
          ).length,
          assignmentsToConfirm: roster.filter(
            (entry) =>
              entry.assignmentConfidence === "inferred_needs_confirmation",
          ).length,
          ndaNotRecorded: roster.filter(
            (entry) => entry.ndaStatus === "not_recorded",
          ).length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
