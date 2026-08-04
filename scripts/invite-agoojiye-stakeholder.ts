import { randomUUID } from "node:crypto";

import { and, eq, isNull, notInArray, or } from "drizzle-orm";
import nodemailer from "nodemailer";
import { z } from "zod";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeEngineeringProfiles,
  agoojyeProjectUsers,
  eceUsers,
} from "@db/schema";
import { canInviteEngineeringProfile } from "../server/lib/agoojye/ndaAccess";
import { buildEngineeringInvitation } from "../server/lib/agoojye/engineeringInvitation";
import { resolveAgoojiyeTenantId } from "../server/lib/agoojye/osSeed";
import {
  buildPasswordSetupLink,
  createPasswordSetupToken,
  resolvePasswordSetupBaseUrl,
} from "../server/lib/password-setup";

const APPLY = process.argv.includes("--apply");
const SEND = process.argv.includes("--send");
const OWNER_AUTHORIZED = process.argv.includes("--confirm-owner-authorization");
const TOKEN_TTL_HOURS = Math.max(
  24,
  Math.min(168, Math.trunc(Number(process.env.AGOOJIYE_INVITATION_TTL_HOURS || 72))),
);
const emailSchema = z.string().trim().toLowerCase().email().max(320);

function argument(name: string) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return String(process.argv[exact + 1] || "").trim();
  const prefix = `${name}=`;
  return String(process.argv.find((entry) => entry.startsWith(prefix)) || "")
    .slice(prefix.length)
    .trim();
}

function smtpConfig() {
  const host = String(
    process.env.AGOOJIYE_INVITATION_SMTP_HOST ||
      process.env.AGOOJIYE_SMTP_HOST ||
      "mail.agoojiye.com",
  ).trim();
  const port = Number(process.env.AGOOJIYE_INVITATION_SMTP_PORT || 587);
  const secure =
    String(process.env.AGOOJIYE_INVITATION_SMTP_SECURE || "false").toLowerCase() ===
    "true";
  const user = String(
    process.env.AGOOJIYE_INVITATION_SMTP_USER || "regis@agoojiye.com",
  )
    .trim()
    .toLowerCase();
  const pass = String(
    process.env.AGOOJIYE_INVITATION_SMTP_PASS ||
      process.env.AGOOJIYE_MAILBOX_REGIS_PASSWORD ||
      "",
  ).trim();
  if (!host || !Number.isFinite(port) || !emailSchema.safeParse(user).success || !pass) {
    throw new Error("AGOOJIYE invitation SMTP is not fully configured.");
  }
  return {
    host,
    port,
    secure,
    user,
    pass,
    from:
      String(process.env.AGOOJIYE_INVITATION_FROM || "").trim() ||
      `Équipe AGOOJIYE <${user}>`,
    replyTo:
      String(process.env.AGOOJIYE_INVITATION_REPLY_TO || "").trim() || user,
  };
}

async function main() {
  const targetEmail = emailSchema.parse(argument("--corporate-email"));
  if (APPLY || SEND || OWNER_AUTHORIZED) {
    if (!(APPLY && SEND && OWNER_AUTHORIZED)) {
      throw new Error(
        "Sending requires --apply --send --confirm-owner-authorization.",
      );
    }
  }
  const tenantId = await resolveAgoojiyeTenantId();
  const profile = await db.query.agoojyeEngineeringProfiles.findFirst({
    where: and(
      eq(agoojyeEngineeringProfiles.tenantId, tenantId),
      eq(agoojyeEngineeringProfiles.corporateEmail, targetEmail),
    ),
  });
  if (!profile) throw new Error("Target stakeholder profile not found.");
  const member = await db.query.agoojyeProjectUsers.findFirst({
    where: and(
      eq(agoojyeProjectUsers.tenantId, tenantId),
      eq(agoojyeProjectUsers.id, Number(profile.projectUserId)),
    ),
  });
  const user = member?.authUserId
    ? await db.query.eceUsers.findFirst({
        where: eq(eceUsers.id, Number(member.authUserId)),
      })
    : null;
  const eligible =
    canInviteEngineeringProfile(profile) &&
    Boolean(member) &&
    Boolean(user?.isActive) &&
    emailSchema.safeParse(profile.personalEmail).success;
  const preview = {
    ok: eligible,
    mode: APPLY ? "send" : "preview",
    targetEmail,
    destination: profile.personalEmail,
    invitationState: profile.invitationState,
    ndaStatus: profile.ndaStatus,
    ndaAccessState: profile.ndaAccessState,
    eligible,
    targetedProfiles: 1,
    rawLinksLogged: 0,
  };
  if (!APPLY) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }
  if (!eligible || !member || !user || !profile.personalEmail) {
    throw new Error("The stakeholder is not eligible for invitation delivery.");
  }

  const smtp = smtpConfig();
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: { rejectUnauthorized: true },
  });
  await transport.verify();
  const attemptId = randomUUID();
  const [claimed] = await db
    .update(agoojyeEngineeringProfiles)
    .set({
      invitationState: "sending",
      invitationDeliveryId: `attempt:${attemptId}`,
      invitationLastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agoojyeEngineeringProfiles.id, Number(profile.id)),
        or(
          isNull(agoojyeEngineeringProfiles.invitationState),
          notInArray(agoojyeEngineeringProfiles.invitationState, [
            "sending",
            "sent",
            "delivery_unconfirmed",
            "accepted",
            "cancelled",
          ]),
        ),
      ),
    )
    .returning({ id: agoojyeEngineeringProfiles.id });
  if (!claimed?.id) {
    transport.close();
    throw new Error("The invitation was already claimed or sent.");
  }
  let delivered = false;
  let deliveryId = "";
  try {
    const created = await createPasswordSetupToken({
      userId: Number(user.id),
      ttlHours: TOKEN_TTL_HOURS,
      invalidateExisting: true,
    });
    const setupLink = buildPasswordSetupLink(
      resolvePasswordSetupBaseUrl(
        process.env.AGOOJIYE_APP_URL || "https://agoojiye.com",
      ),
      created.rawToken,
    );
    const content = buildEngineeringInvitation({
      displayName: member.displayName,
      corporateEmail: profile.corporateEmail,
      role: member.role,
      accessDescription: "CRM AGOOJIYE en consultation uniquement",
      setupLink,
      expiresInHours: TOKEN_TTL_HOURS,
      webmailUrl:
        process.env.AGOOJIYE_WEBMAIL_URL || "https://mail.agoojiye.com/",
    });
    const delivery = await transport.sendMail({
      from: smtp.from,
      replyTo: smtp.replyTo,
      to: profile.personalEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
      headers: {
        "X-AGOOJIYE-Purpose": "stakeholder-onboarding",
        "X-AGOOJIYE-Profile": String(profile.id),
      },
    });
    delivered = true;
    deliveryId = String(delivery.messageId || "");
    await db
      .update(agoojyeEngineeringProfiles)
      .set({
        invitationState: "sent",
        invitationSentAt: new Date(),
        invitationDeliveryId: deliveryId,
        invitationLastError: null,
        onboardingState: "invited",
        updatedAt: new Date(),
      })
      .where(eq(agoojyeEngineeringProfiles.id, Number(profile.id)));
    await db.insert(agoojyeAuditLogs).values({
      tenantId,
      actor: "AGOOJIYE stakeholder invitation sender",
      action: "stakeholder_invitation_sent",
      entityType: "agoojye_engineering_profile",
      entityId: Number(profile.id),
      metadata: {
        destination: profile.personalEmail,
        deliveryId,
        tokenTtlHours: TOKEN_TTL_HOURS,
        targetedProfiles: 1,
        rawLinkStored: false,
      },
    });
    console.log(
      JSON.stringify(
        {
          ...preview,
          ok: true,
          invitationState: "sent",
          delivered: true,
          deliveryIdRecorded: Boolean(deliveryId),
          rawLinksLogged: 0,
        },
        null,
        2,
      ),
    );
  } catch (error: any) {
    await db
      .update(agoojyeEngineeringProfiles)
      .set({
        invitationState: delivered ? "delivery_unconfirmed" : "delivery_failed",
        ...(deliveryId ? { invitationDeliveryId: deliveryId } : {}),
        invitationLastError: String(error?.message || "delivery_failed").slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(agoojyeEngineeringProfiles.id, Number(profile.id)));
    throw error;
  } finally {
    transport.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
