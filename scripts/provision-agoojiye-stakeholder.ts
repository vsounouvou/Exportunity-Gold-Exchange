import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeEmailIdentities,
  agoojyeEngineeringProfiles,
  agoojyeParticipants,
  agoojyePartners,
  agoojyeProjectUsers,
  agoojyeTeams,
  eceUsers,
  emailAccounts,
  emailDomains,
  userTenantRoles,
} from "@db/schema";
import { resolveAgoojiyeTenantId } from "../server/lib/agoojye/osSeed";
import {
  isMailserverSetupAvailable,
  mailserverDoveadmAuthTestWithRefresh,
  mailserverEmailAdd,
  mailserverEmailUpdate,
  mailserverQuotaSet,
} from "../server/lib/mail/mailserverSetup";

const APPLY = process.argv.includes("--apply");
const OWNER_AUTHORIZED = process.argv.includes("--confirm-owner-authorization");
const MAILBOX_QUOTA_MB = 2048;

function argument(name: string) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return String(process.argv[exact + 1] || "").trim();
  const prefix = `${name}=`;
  return String(process.argv.find((entry) => entry.startsWith(prefix)) || "")
    .slice(prefix.length)
    .trim();
}

const stakeholderSchema = z.object({
  displayName: z.string().trim().min(3).max(160),
  personalEmail: z.string().trim().toLowerCase().email().max(320),
  corporateEmail: z.string().trim().toLowerCase().email().max(320),
  organization: z.string().trim().min(2).max(160),
  sharePercent: z.coerce.number().positive().max(100),
  teamSlug: z.string().trim().min(2).max(120).default("sponsorship-partnerships"),
});

function splitName(displayName: string) {
  const parts = displayName.trim().split(/\s+/);
  return {
    firstName: parts.shift() || displayName,
    lastName: parts.join(" ") || "AGOOJIYE",
  };
}

function securePassword() {
  return `${randomBytes(24).toString("base64url")}!Aa7`;
}

function stableSourceHash(input: z.infer<typeof stakeholderSchema>) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        displayName: input.displayName,
        personalEmail: input.personalEmail,
        corporateEmail: input.corporateEmail,
        organization: input.organization,
        sharePercent: input.sharePercent,
      }),
    )
    .digest("hex");
}

async function persistPrivateHandoff(input: {
  corporateEmail: string;
  initialMailboxPassword: string;
  mailboxState: string;
}) {
  const root =
    String(process.env.AGOOJIYE_SECURE_HANDOFF_DIR || "").trim() ||
    path.join(process.cwd(), ".secure-handoff");
  await mkdir(root, { recursive: true });
  await chmod(root, 0o700).catch(() => undefined);
  const target = path.join(root, "stakeholder-henry-ukoha.json");
  await writeFile(
    target,
    JSON.stringify(
      {
        corporateEmail: input.corporateEmail,
        initialMailboxPassword: input.initialMailboxPassword,
        mailboxState: input.mailboxState,
        setupLink: null,
        note: "Le mot de passe choisi via le lien d'activation remplace ce mot de passe initial.",
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await chmod(target, 0o600).catch(() => undefined);
  return target;
}

async function verifyProvisionedMailbox(corporateEmail: string, password: string) {
  const verified = await mailserverDoveadmAuthTestWithRefresh(
    corporateEmail,
    password,
  );
  if (!verified.ok) throw new Error("MAILBOX_AUTH_VERIFICATION_FAILED");
  await mailserverQuotaSet(corporateEmail, "2G");
}

async function provisionMailbox(corporateEmail: string, password: string) {
  const result = await mailserverEmailAdd(corporateEmail, password);
  if (!result.ok && /exist|already/i.test(`${result.stdout}\n${result.stderr}`)) {
    const reset = await mailserverEmailUpdate(corporateEmail, password);
    if (!reset.ok) throw new Error("MAILBOX_PASSWORD_RESET_FAILED");
    await verifyProvisionedMailbox(corporateEmail, password);
    return "provisioned" as const;
  }
  if (!result.ok) throw new Error("MAILBOX_PROVISION_FAILED");
  await verifyProvisionedMailbox(corporateEmail, password);
  return "provisioned" as const;
}

async function main() {
  const parsed = stakeholderSchema.safeParse({
    displayName: argument("--name"),
    personalEmail: argument("--personal-email"),
    corporateEmail: argument("--corporate-email"),
    organization: argument("--organization"),
    sharePercent: argument("--share-percent"),
    teamSlug: argument("--team") || "sponsorship-partnerships",
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid stakeholder arguments: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  const stakeholder = parsed.data;
  if (!stakeholder.corporateEmail.endsWith("@agoojiye.com")) {
    throw new Error("The corporate mailbox must use @agoojiye.com.");
  }
  if (APPLY && !OWNER_AUTHORIZED) {
    throw new Error("Apply mode requires --confirm-owner-authorization.");
  }

  const tenantId = await resolveAgoojiyeTenantId();
  const [team, domain, existingUser, existingMember, existingProfile] =
    await Promise.all([
      db.query.agoojyeTeams.findFirst({
        where: and(
          eq(agoojyeTeams.tenantId, tenantId),
          eq(agoojyeTeams.slug, stakeholder.teamSlug),
        ),
      }),
      db.query.emailDomains.findFirst({
        where: and(
          eq(emailDomains.tenantId, tenantId),
          eq(emailDomains.domain, "agoojiye.com"),
        ),
      }),
      db.query.eceUsers.findFirst({
        where: eq(eceUsers.email, stakeholder.corporateEmail),
      }),
      db.query.agoojyeProjectUsers.findFirst({
        where: and(
          eq(agoojyeProjectUsers.tenantId, tenantId),
          eq(agoojyeProjectUsers.email, stakeholder.corporateEmail),
        ),
      }),
      db.query.agoojyeEngineeringProfiles.findFirst({
        where: and(
          eq(agoojyeEngineeringProfiles.tenantId, tenantId),
          eq(
            agoojyeEngineeringProfiles.corporateEmail,
            stakeholder.corporateEmail,
          ),
        ),
      }),
    ]);
  if (!team) throw new Error(`AGOOJIYE team not found: ${stakeholder.teamSlug}`);
  if (!domain) throw new Error("The verified agoojiye.com email domain is missing.");
  if (
    existingUser &&
    String(existingUser.displayName).trim().toLowerCase() !==
      stakeholder.displayName.toLowerCase()
  ) {
    throw new Error("The corporate email is already assigned to another user.");
  }
  if (
    APPLY &&
    existingProfile &&
    String(existingProfile.invitationState || "not_sent") !== "not_sent"
  ) {
    throw new Error(
      "The stakeholder was already invited; provisioning cannot reset the mailbox.",
    );
  }

  const preview = {
    ok: true,
    mode: APPLY ? "apply" : "preview",
    tenantId,
    stakeholder: {
      displayName: stakeholder.displayName,
      corporateEmail: stakeholder.corporateEmail,
      personalEmail: stakeholder.personalEmail,
      organization: stakeholder.organization,
      sharePercent: stakeholder.sharePercent,
      role: "SHAREHOLDER",
      crm: "read-only",
      ndaGate: "upload-required",
    },
    existing: {
      user: Boolean(existingUser),
      member: Boolean(existingMember),
      ndaProfile: Boolean(existingProfile),
    },
    outboundMessages: 0,
  };
  if (!APPLY) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }
  if (!isMailserverSetupAvailable()) {
    throw new Error("The AGOOJIYE mailserver provisioning socket is unavailable.");
  }

  const initialMailboxPassword = securePassword();
  const mailboxState = await provisionMailbox(
    stakeholder.corporateEmail,
    initialMailboxPassword,
  );
  const { firstName, lastName } = splitName(stakeholder.displayName);
  const roleTitle = `Actionnaire AGOOJIYE (${stakeholder.sharePercent} %) · ${stakeholder.organization}`;
  const sourceMetadata = {
    source: "owner_instruction_2026-08-04",
    stakeholderType: "shareholder",
    organization: stakeholder.organization,
    sharePercent: stakeholder.sharePercent,
    crmAccess: "read-only",
    outboundDeliveryAuthorized: true,
  };
  const ndaStatus = existingProfile?.ndaStatus || "required";
  const ndaAccessState = ["submitted", "approved"].includes(
    String(existingProfile?.ndaAccessState || "").toLowerCase(),
  )
    ? existingProfile!.ndaAccessState
    : "required";
  const previousMetadata =
    existingUser?.metadata &&
    typeof existingUser.metadata === "object" &&
    !Array.isArray(existingUser.metadata)
      ? existingUser.metadata
      : {};

  const [authUser] = await db
    .insert(eceUsers)
    .values({
      email: stakeholder.corporateEmail,
      passwordHash: null,
      displayName: stakeholder.displayName,
      role: "shareholder",
      roles: ["shareholder"] as any,
      permissions: [] as any,
      currentMode: "shareholder",
      isActive: true,
      emailVerified: true,
      metadata: {
        ...previousMetadata,
        mustChangePassword: true,
        webmailPasswordSyncOnActivation: true,
        invitationState: existingProfile?.invitationState || "not_sent",
        stakeholder: sourceMetadata,
      } as any,
    })
    .onConflictDoUpdate({
      target: eceUsers.email,
      set: {
        displayName: stakeholder.displayName,
        role: "shareholder",
        roles: ["shareholder"] as any,
        permissions: [] as any,
        currentMode: "shareholder",
        isActive: true,
        emailVerified: true,
        metadata: {
          ...previousMetadata,
          mustChangePassword: true,
          webmailPasswordSyncOnActivation: true,
          invitationState: existingProfile?.invitationState || "not_sent",
          stakeholder: sourceMetadata,
        } as any,
        updatedAt: new Date(),
      },
    })
    .returning();

  await db
    .insert(userTenantRoles)
    .values({ tenantId, userId: Number(authUser.id), role: "SHAREHOLDER" })
    .onConflictDoNothing();

  const memberValues = {
    firstName,
    lastName,
    displayName: stakeholder.displayName,
    phone: null,
    role: roleTitle,
    teamId: Number(team.id),
    status: "Prepared",
    authUserId: Number(authUser.id),
    managerUserId: null,
    employmentType: "shareholder",
    responsibilities: [
      `Actionnariat AGOOJIYE : ${stakeholder.sharePercent} %`,
      `Suivi du partenariat ${stakeholder.organization}`,
      "Consultation du CRM AGOOJIYE",
    ],
    availability: "available",
    onboardingProgress: 15,
    accessLevel: 2,
    permissions: ["crm:read"],
    startDate: new Date(),
    confirmedRole: true,
    emailAccountCreated: true,
    updatedAt: new Date(),
  };
  const [member] = await db
    .insert(agoojyeProjectUsers)
    .values({
      tenantId,
      email: stakeholder.corporateEmail,
      ...memberValues,
    })
    .onConflictDoUpdate({
      target: [agoojyeProjectUsers.tenantId, agoojyeProjectUsers.email],
      set: memberValues,
    })
    .returning();

  const participant = await db.query.agoojyeParticipants.findFirst({
    where: and(
      eq(agoojyeParticipants.tenantId, tenantId),
      eq(agoojyeParticipants.userId, Number(member.id)),
    ),
  });
  const participantValues = {
    teamId: Number(team.id),
    roleTitle,
    confirmedRole: true,
    participantType: "shareholder",
    skills: ["Partenariats stratégiques", "Suivi actionnarial", "CRM"],
    schoolOrCompany: stakeholder.organization,
    status: "Prepared",
    notes: `Accès CRM en consultation. Participation déclarée : ${stakeholder.sharePercent} %.`,
    updatedAt: new Date(),
  };
  if (participant) {
    await db
      .update(agoojyeParticipants)
      .set(participantValues)
      .where(eq(agoojyeParticipants.id, Number(participant.id)));
  } else {
    await db.insert(agoojyeParticipants).values({
      tenantId,
      userId: Number(member.id),
      ...participantValues,
    });
  }

  const [emailAccount] = await db
    .insert(emailAccounts)
    .values({
      tenantId,
      ownerUserId: Number(authUser.id),
      address: stakeholder.corporateEmail,
      localPart: stakeholder.corporateEmail.split("@")[0],
      domainId: Number(domain.id),
      status: "active",
      quotaMb: MAILBOX_QUOTA_MB,
      metadata: { humanMailbox: true, source: "agoojye_stakeholder" },
    })
    .onConflictDoUpdate({
      target: [emailAccounts.tenantId, emailAccounts.address],
      set: {
        ownerUserId: Number(authUser.id),
        status: "active",
        quotaMb: MAILBOX_QUOTA_MB,
        metadata: { humanMailbox: true, source: "agoojye_stakeholder" },
        updatedAt: new Date(),
      },
    })
    .returning();

  await db
    .insert(agoojyeEmailIdentities)
    .values({
      tenantId,
      userId: Number(member.id),
      emailAddress: stakeholder.corporateEmail,
      displayName: stakeholder.displayName,
      emailType: "individual",
      provider: "docker-mailserver",
      status: "active",
      canSend: true,
      canReceive: true,
      createdBy: "stakeholder_provisioner",
      notes: "Compte actionnaire. Mot de passe synchronisé lors de l'activation.",
    })
    .onConflictDoUpdate({
      target: [
        agoojyeEmailIdentities.tenantId,
        agoojyeEmailIdentities.emailAddress,
      ],
      set: {
        userId: Number(member.id),
        displayName: stakeholder.displayName,
        status: "active",
        canSend: true,
        canReceive: true,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(agoojyeEngineeringProfiles)
    .values({
      tenantId,
      projectUserId: Number(member.id),
      sourceUid: `manual-stakeholder-${stakeholder.corporateEmail}`,
      sourceName: "Manual stakeholder provisioning",
      sourceRows: [],
      sourceHash: stableSourceHash(stakeholder),
      corporateEmail: stakeholder.corporateEmail,
      personalEmail: stakeholder.personalEmail,
      sourceSquad: stakeholder.organization,
      discipline: stakeholder.teamSlug,
      assignmentConfidence: "source",
      skills: ["Partenariats stratégiques", "Suivi actionnarial", "CRM"],
      ndaStatus,
      ndaAccessState,
      onboardingState: "prepared",
      invitationState: existingProfile?.invitationState || "not_sent",
      mailboxState,
      sourceMetadata: { ...sourceMetadata, emailAccountId: emailAccount.id },
    })
    .onConflictDoUpdate({
      target: [
        agoojyeEngineeringProfiles.tenantId,
        agoojyeEngineeringProfiles.corporateEmail,
      ],
      set: {
        projectUserId: Number(member.id),
        personalEmail: stakeholder.personalEmail,
        sourceHash: stableSourceHash(stakeholder),
        sourceSquad: stakeholder.organization,
        discipline: stakeholder.teamSlug,
        skills: ["Partenariats stratégiques", "Suivi actionnarial", "CRM"],
        ndaStatus,
        ndaAccessState,
        mailboxState,
        sourceMetadata: { ...sourceMetadata, emailAccountId: emailAccount.id },
        updatedAt: new Date(),
      },
    });

  const partner = await db.query.agoojyePartners.findFirst({
    where: and(
      eq(agoojyePartners.tenantId, tenantId),
      eq(agoojyePartners.name, stakeholder.organization),
    ),
  });
  if (partner) {
    await db
      .update(agoojyePartners)
      .set({
        contactPerson: stakeholder.displayName,
        contactEmail: stakeholder.corporateEmail,
        updatedAt: new Date(),
      })
      .where(eq(agoojyePartners.id, Number(partner.id)));
  }

  await db.insert(agoojyeAuditLogs).values({
    tenantId,
    actor: "AGOOJIYE stakeholder provisioner",
    action: "stakeholder_account_provisioned",
    entityType: "agoojye_project_user",
    entityId: Number(member.id),
    metadata: {
      organization: stakeholder.organization,
      sharePercent: stakeholder.sharePercent,
      corporateEmail: stakeholder.corporateEmail,
      crmAccess: "read-only",
      ndaAccessState,
      mailboxState,
      outboundMessages: 0,
      secretStoredInAudit: false,
    },
  });

  const handoffPath = await persistPrivateHandoff({
    corporateEmail: stakeholder.corporateEmail,
    initialMailboxPassword,
    mailboxState,
  });
  console.log(
    JSON.stringify(
      {
        ...preview,
        mode: "apply",
        memberId: member.id,
        authUserId: authUser.id,
        mailboxState,
        ndaAccessState,
        invitationState: existingProfile?.invitationState || "not_sent",
        privateHandoffPath: handoffPath,
        secretPrinted: false,
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
