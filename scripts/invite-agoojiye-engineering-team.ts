import { randomUUID } from "node:crypto";

import nodemailer from "nodemailer";
import { and, eq, isNull, notInArray, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeEngineeringProfiles,
  agoojyeProjectUsers,
  eceUsers,
} from "@db/schema";
import {
  canInviteEngineeringProfile,
} from "../server/lib/agoojye/ndaAccess";
import {
  buildEngineeringInvitation,
} from "../server/lib/agoojye/engineeringInvitation";
import { resolveAgoojiyeTenantId } from "../server/lib/agoojye/osSeed";
import {
  buildPasswordSetupLink,
  createPasswordSetupToken,
  resolvePasswordSetupBaseUrl,
} from "../server/lib/password-setup";

const APPLY = process.argv.includes("--apply");
const SEND = process.argv.includes("--send");
const ELIGIBLE_ONLY = process.argv.includes("--eligible-signed-nda-only");
const OWNER_AUTHORIZED = process.argv.includes("--confirm-owner-authorization");
const TOKEN_TTL_HOURS = Math.max(
  24,
  Math.min(168, Math.trunc(Number(process.env.AGOOJIYE_INVITATION_TTL_HOURS || 72))),
);
const emailSchema = z.string().trim().email().max(320);

function requireDeliveryAuthorization() {
  if (!APPLY && !SEND && !OWNER_AUTHORIZED) return;
  if (!(APPLY && SEND && ELIGIBLE_ONLY && OWNER_AUTHORIZED)) {
    throw new Error(
      "Sending requires --apply --send --eligible-signed-nda-only --confirm-owner-authorization.",
    );
  }
}

function smtpConfig() {
  const host = String(
    process.env.AGOOJIYE_INVITATION_SMTP_HOST ||
      process.env.AGOOJIYE_SMTP_HOST ||
      "mail.agoojiye.com",
  ).trim();
  const port = Number(process.env.AGOOJIYE_INVITATION_SMTP_PORT || 587);
  const secure =
    String(process.env.AGOOJIYE_INVITATION_SMTP_SECURE || "false")
      .trim()
      .toLowerCase() === "true";
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
  if (!host || !Number.isFinite(port) || port <= 0 || !emailSchema.safeParse(user).success || !pass) {
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
      String(process.env.AGOOJIYE_INVITATION_REPLY_TO || "").trim() ||
      user,
  };
}

async function invitationCandidates(tenantId: number) {
  const profiles = await db.query.agoojyeEngineeringProfiles.findMany({
    where: eq(agoojyeEngineeringProfiles.tenantId, tenantId),
  });
  const candidates = [];
  for (const profile of profiles) {
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
    candidates.push({ profile, member, user });
  }
  return candidates;
}

async function main() {
  requireDeliveryAuthorization();
  const tenantId = await resolveAgoojiyeTenantId();
  const candidates = await invitationCandidates(tenantId);
  const eligible = candidates.filter(
    ({ profile, member, user }) =>
      canInviteEngineeringProfile(profile) &&
      Boolean(member) &&
      Boolean(user?.isActive) &&
      emailSchema.safeParse(profile.personalEmail).success,
  );
  const summary = {
    totalProfiles: candidates.length,
    eligible: eligible.length,
    skippedNdaNotRegistered: candidates.filter(
      ({ profile }) => profile.ndaStatus !== "signed",
    ).length,
    skippedPersonalEmailMissing: candidates.filter(
      ({ profile }) => !profile.personalEmail,
    ).length,
    skippedAlreadyInvited: candidates.filter(({ profile }) =>
      ["sending", "sent", "delivery_unconfirmed", "accepted", "cancelled"].includes(
        String(profile.invitationState || "").toLowerCase(),
      ),
    ).length,
  };
  if (!APPLY) {
    console.log(JSON.stringify({ ok: true, mode: "preview", ...summary }, null, 2));
    return;
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

  const baseUrl = resolvePasswordSetupBaseUrl(
    process.env.AGOOJIYE_APP_URL || "https://agoojiye.com",
  );
  let sent = 0;
  let failed = 0;
  let deliveryUnconfirmed = 0;
  for (const candidate of eligible) {
    const { profile, member, user } = candidate;
    if (!member || !user || !profile.personalEmail) continue;
    let delivered = false;
    let deliveryId = "";
    try {
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
      if (!claimed?.id) continue;
      const created = await createPasswordSetupToken({
        userId: Number(user.id),
        ttlHours: TOKEN_TTL_HOURS,
        invalidateExisting: true,
      });
      const setupLink = buildPasswordSetupLink(baseUrl, created.rawToken);
      const content = buildEngineeringInvitation({
        displayName: member.displayName,
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
          "X-AGOOJIYE-Purpose": "engineering-onboarding",
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
      await db
        .insert(agoojyeAuditLogs)
        .values({
          tenantId,
          actor: "AGOOJIYE engineering invitation sender",
          action: "engineering_invitation_sent",
          entityType: "agoojye_engineering_profile",
          entityId: Number(profile.id),
          metadata: {
            deliveryId: String(delivery.messageId || ""),
            tokenTtlHours: TOKEN_TTL_HOURS,
            rawLinkStored: false,
          },
        })
        .catch(() => undefined);
      sent += 1;
    } catch (error: any) {
      if (delivered) deliveryUnconfirmed += 1;
      else failed += 1;
      await db
        .update(agoojyeEngineeringProfiles)
        .set({
          invitationState: delivered
            ? "delivery_unconfirmed"
            : "delivery_failed",
          ...(deliveryId ? { invitationDeliveryId: deliveryId } : {}),
          invitationLastError: String(error?.message || "delivery_failed").slice(
            0,
            500,
          ),
          updatedAt: new Date(),
        })
        .where(eq(agoojyeEngineeringProfiles.id, Number(profile.id)));
      await db
        .insert(agoojyeAuditLogs)
        .values({
          tenantId,
          actor: "AGOOJIYE engineering invitation sender",
          action: delivered
            ? "engineering_invitation_delivery_unconfirmed"
            : "engineering_invitation_failed",
          entityType: "agoojye_engineering_profile",
          entityId: Number(profile.id),
          metadata: { rawLinkStored: false },
        })
        .catch(() => undefined);
    }
  }
  transport.close();
  console.log(
    JSON.stringify(
      {
        ok: failed === 0,
        mode: "send",
        ...summary,
        sent,
        failed,
        deliveryUnconfirmed,
        rawLinksLogged: 0,
      },
      null,
      2,
    ),
  );
  if (failed || deliveryUnconfirmed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
