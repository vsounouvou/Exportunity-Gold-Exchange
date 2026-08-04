function escapeHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function engineeringInvitationFirstName(displayName: string) {
  return String(displayName || "").trim().split(/\s+/)[0] || "membre";
}

export function buildEngineeringInvitation(input: {
  displayName: string;
  setupLink: string;
  expiresInHours: number;
  webmailUrl?: string;
  corporateEmail?: string;
  role?: string;
  accessDescription?: string;
}) {
  const firstName = engineeringInvitationFirstName(input.displayName);
  const safeFirstName = escapeHtml(firstName);
  const safeLink = escapeHtml(input.setupLink);
  const webmailUrl =
    String(input.webmailUrl || "").trim() || "https://mail.agoojiye.com/";
  const details = [
    input.corporateEmail
      ? `Adresse professionnelle : ${String(input.corporateEmail).trim()}`
      : "",
    input.role ? `Rôle : ${String(input.role).trim()}` : "",
    input.accessDescription
      ? `Accès : ${String(input.accessDescription).trim()}`
      : "",
  ].filter(Boolean);
  const detailText = details.length ? ["", ...details, ""] : [""];
  const detailHtml = details.length
    ? `<div style="margin:0 0 22px;border:1px solid #dedbd1;background:#faf9f5;padding:16px 18px;color:#415047;line-height:1.65">${details
        .map((detail) => escapeHtml(detail))
        .join("<br>")}</div>`
    : "";
  const subject = "Votre accès personnel à l'espace équipe AGOOJIYE";
  const text = [
    `Bonjour ${firstName},`,
    "",
    "Votre compte professionnel AGOOJIYE est prêt.",
    ...detailText,
    "Ouvrez votre lien personnel pour définir votre mot de passe. Ce même mot de passe servira ensuite pour la plateforme et le webmail AGOOJIYE.",
    "",
    input.setupLink,
    "",
    "Avant l'accès à l'espace de travail, la plateforme vous demandera de joindre votre NDA signé au format PDF, JPG ou PNG. Aucun accès aux informations de l'équipe n'est accordé avant ce dépôt.",
    "",
    `Ce lien est personnel, utilisable une seule fois et expire dans ${input.expiresInHours} heures. Ne le transférez pas.`,
    "",
    `Webmail AGOOJIYE : ${webmailUrl}`,
    "Assistance : support@agoojiye.com",
    "",
    "L'équipe AGOOJIYE",
  ].join("\n");
  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;background:#f3f1ea;color:#171a18;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">Votre compte professionnel AGOOJIYE est prêt.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f1ea">
      <tr><td align="center" style="padding:28px 14px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dedbd1">
          <tr><td style="background:#111512;padding:24px 28px;color:#d8ad3d;font-size:22px;font-weight:800">AGOOJIYE</td></tr>
          <tr><td style="padding:32px 28px">
            <p style="margin:0 0 18px;font-size:17px">Bonjour ${safeFirstName},</p>
            <h1 style="margin:0 0 14px;font-size:28px;line-height:1.2">Votre espace équipe est prêt.</h1>
            ${detailHtml}
            <p style="margin:0 0 22px;color:#4f5752;line-height:1.65">Définissez votre mot de passe personnel. Il servira pour la plateforme et le webmail AGOOJIYE.</p>
            <p style="margin:0 0 26px"><a href="${safeLink}" style="display:inline-block;background:#d8ad3d;color:#17140c;text-decoration:none;font-weight:700;padding:14px 20px">Activer mon compte</a></p>
            <div style="border-left:4px solid #18563b;background:#eef7f2;padding:16px 18px">
              <strong>Dernière étape obligatoire</strong>
              <p style="margin:7px 0 0;color:#415047;line-height:1.55">Après avoir choisi votre mot de passe, joignez votre NDA signé. Aucun accès aux informations de l’équipe n’est accordé avant ce dépôt.</p>
            </div>
            <p style="margin:24px 0 0;color:#6a706c;font-size:13px;line-height:1.55">Ce lien est personnel, utilisable une seule fois et expire dans ${input.expiresInHours} heures. Ne le transférez pas.</p>
          </td></tr>
          <tr><td style="border-top:1px solid #ece9df;padding:20px 28px;color:#6a706c;font-size:12px;line-height:1.6">Webmail : <a href="${escapeHtml(webmailUrl)}" style="color:#18563b">${escapeHtml(webmailUrl)}</a><br>Assistance : support@agoojiye.com</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return { subject, text, html };
}
