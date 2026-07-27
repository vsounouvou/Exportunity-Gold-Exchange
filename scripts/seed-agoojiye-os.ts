import {
  AGOOJIYE_TEAM_EMAILS,
  createAgoojiyeTeamInvitation,
  resolveAgoojiyeTenantId,
  seedAgoojiyeOs,
} from "../server/lib/agoojye/osSeed";

async function main() {
  const tenantId = await resolveAgoojiyeTenantId();
  const seeded = await seedAgoojiyeOs(tenantId);
  const invitation = await createAgoojiyeTeamInvitation({
    tenantId,
    allowedEmails: AGOOJIYE_TEAM_EMAILS,
    ttlDays: Number(process.env.AGOOJIYE_OS_INVITE_TTL_DAYS || 30),
    maxUses: AGOOJIYE_TEAM_EMAILS.length,
  });
  const baseUrl = String(process.env.AGOOJIYE_OS_URL || process.env.AGOOJIYE_APP_URL || "https://agoojiye.com").replace(/\/+$/, "");
  const link = `${baseUrl}/os/rejoindre/${encodeURIComponent(invitation.rawToken)}`;
  console.log(JSON.stringify({ ok: true, tenantId, seeded, invitationId: invitation.id, expiresAt: invitation.expiresAt, link }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
