# AGOOJIYE email DNS and mailbox handoff

Last updated: 2026-08-02

Brand spelling note: the final public spelling is `AGOOJIYE`. The legacy technical key `agoojye` remains in route names, database tables, and private credential-file paths, while public DNS and email use `agoojiye.com`.

## Latest verified live state

Verified on 2026-07-24 after the AGOOJIYE production deployment, public mail cutover, mailbox correction, and branded-webmail launch:

- Production runs commit `16d0ec2f1556` with build ID `1784918929913`; `/api/system/version` reports no client/server build mismatch.
- `https://agoojiye.com` returns HTTP 200.
- `https://agoojiye.com/mail/password` returns HTTP 200 with the title `Mot de passe email - AGOOJIYE`.
- `https://agoojiye.com/admin/agoojye/email` returns HTTP 200 for the protected app shell.
- `https://agoojiye.com/admin/agoojye/inbox` returns HTTP 200 for the protected unified-inbox shell.
- `https://agoojiye.com/api/agoojye/public/bootstrap` returns HTTP 200.
- The five approved human mailboxes authenticate successfully: `regis`, `soriane`, `maryse`, `christian`, and `vital`.
- WorkOS provisions the separate principal mailbox `vs@agoojiye.com`; its IMAP and Roundcube login were verified on 2026-08-02. Its initial credential is held only in the private deployment handoff and must be changed at first use.
- `https://mail.agoojiye.com/` serves the French Roundcube login with AGOOJIYE product name, logo, favicon, and a valid Let's Encrypt certificate.
- The first-login password-change route was verified end-to-end on 2026-06-29: one mailbox was changed to a temporary password through `https://agoojiye.com/mail/password`, authenticated with the temporary password, then reverted to the original initial password and re-verified.
- The five active human mailbox profiles and SMTP identities are persisted for tenant `3162`, linked to physical `email_accounts`, and reference environment-secret names instead of storing passwords in the database.
- All 15 shared aliases resolve to the five approved recipients. The former misspellings `marise@agoojiye.com` and `surian@agoojiye.com` redirect to `maryse@agoojiye.com` and `soriane@agoojiye.com`.
- OVH DNS now publishes the self-hosted mail records: one priority-10 MX, `mail` A, SPF, DMARC, DKIM, and the matching `mail.agoojiye.com` PTR.
- The repository DNS verifier passes all five forward-DNS checks. Google Public DNS also resolves the PTR to `mail.agoojiye.com`.
- A post-cutover SMTP submission from `vital@agoojiye.com` was accepted and delivered to the INBOX for `regis@agoojiye.com`.
- Public TCP checks pass for SMTP port 25, SMTPS port 465, submission port 587, and IMAPS port 993.

## Roundcube internal routing

Roundcube must not connect back to the public mail hostname from the same VPS. That path can time out even while Dovecot and Postfix are healthy. Production therefore uses the private `mailserver_mailnet` Docker network:

```text
IMAP: ssl://mailserver:993
SMTP: tls://mailserver:587
TLS peer name: mail.exportunity.net
```

The certificate presented by docker-mailserver covers both `mail.exportunity.net` and `mail.agoojiye.com`. Roundcube keeps peer and hostname verification enabled; its connection options set `peer_name` to `mail.exportunity.net` while the socket uses the internal `mailserver` service name.

Source-of-truth files on the VPS:

```text
/home/vital/infra/mailserver/docker-compose.yml
/home/vital/infra/mailserver/roundcube-config/20-agoojiye.php
```

The custom PHP configuration is mounted read-only in the container but must remain host-readable (`0644`). A stricter host mode prevents the Roundcube PHP worker from including it and silently restores the generated external endpoints.

This route was re-verified end-to-end on 2026-08-01 with an ephemeral mailbox: French web login, TLS IMAP authentication, SMTP submission, clean filtering, INBOX delivery, and logout all passed. The test mailbox was deleted afterward, and neither Roundcube nor docker-mailserver was restarted for the fix.

### Fail2ban and the private Roundcube network

Roundcube shares one private source address for all webmail IMAP logins. Dovecot must therefore never ban the `mailserver_mailnet` subnet after an end user mistypes a password, because such a ban blocks webmail for every mailbox. The production override is versioned at `ops/mailserver/fail2ban-jail.cf` and deployed to:

```text
/home/vital/infra/mailserver/config/fail2ban-jail.cf
```

The override trusts only loopback and the dedicated `172.20.0.0/16` mail network. Fail2ban continues to protect public IMAP and SMTP clients. After changing the Docker network subnet, update this override before recreating either mail container.

## Provisioned mailboxes

These real docker-mailserver mailboxes now exist on the production mail stack. Team members sign in through the AGOOJIYE-owned webmail at `https://mail.agoojiye.com/`.

| Person | Email | Quota | Status |
| --- | --- | ---: | --- |
| Regis | `regis@agoojiye.com` | 2 GB | active, IMAPS + SMTP submission verified |
| Soriane | `soriane@agoojiye.com` | 2 GB | active, IMAPS + SMTP submission verified |
| Maryse | `maryse@agoojiye.com` | 2 GB | active, IMAPS + SMTP submission verified |
| Christian | `christian@agoojiye.com` | 2 GB | active, IMAPS + SMTP submission verified |
| Vital | `vital@agoojiye.com` | 2 GB | active, IMAPS + SMTP submission verified |
| Vital Sounouvou (WorkOS principal) | `vs@agoojiye.com` | 2 GB | active, IMAPS + Roundcube login verified |

Private initial passwords are not committed and are not printed in chat.

- VPS credential file: `/home/vital/secure/agoojye/agoojye-mailbox-initial-credentials-20260724T181337Z.txt`
- VPS WorkOS principal credential: `/home/vital/secure/agoojye/workos-20260725-125956/agoojye-vs-mailbox-initial.json`
- Local handoff copy: `C:\tmp\agoojye-mailbox-initial-credentials-20260724T181337Z.txt`
- Local WorkOS principal handoff: `C:\tmp\agoojiye-vs-mailbox-initial-20260725.json`
- Webmail login: `https://mail.agoojiye.com/`
- First-login password change page: `https://agoojiye.com/mail/password`
- IMAP host: `mail.exportunity.net`, port `993`, TLS on
- SMTP submission host: `mail.exportunity.net`, port `587`, STARTTLS

Roundcube is available for mailbox login. Password self-service is handled by the AGOOJIYE platform at `/mail/password`: the route verifies the current mailbox password against Dovecot in docker-mailserver, updates docker-mailserver, verifies the new password against Dovecot, and writes only audit metadata. Raw mailbox passwords are not stored in the app database.

Private credential-file format: account lines are tab-separated as `<email> <initial-password> <provision-status> <auth-status>`. The initial password is the second field. Treat the entire file as secret material and do not paste it into chat, logs or commits.

## Shared aliases

The following aliases are active and fan out to the five approved AGOOJIYE mailboxes:

```text
hello@agoojiye.com
contact@agoojiye.com
team@agoojiye.com
admin@agoojiye.com
partners@agoojiye.com
sponsors@agoojiye.com
investors@agoojiye.com
press@agoojiye.com
media@agoojiye.com
engineering@agoojiye.com
software@agoojiye.com
design@agoojiye.com
careers@agoojiye.com
legal@agoojiye.com
privacy@agoojiye.com
```

The app database has matching AGOOJIYE tenant records:

- `email_accounts`: 5 active team accounts for tenant `3162`; former accounts remain disabled historical records
- `email_aliases`: 77 routes for tenant `3162` (75 shared routes plus 2 compatibility redirects)
- `agoojye_email_identities`: 20 active identities for tenant `3162`
- `agent_mailboxes`: 5 enabled human inbox profiles for tenant `3162`
- `agent_email_identities`: 5 enabled exact-address SMTP identities for tenant `3162`

The production mail indexer reads each human Maildir every five minutes. It mirrors indexed inbound and outbound messages into `/admin/agoojye/inbox`, deduplicates alias fan-out copies by RFC `Message-ID`, records replies, and applies opt-out/bounce suppression rules. A protected manual synchronization endpoint is also available at `POST /api/admin/agoojye/mail/sync`.

When shared aliases are changed directly in docker-mailserver, confirm that the generated Postfix map is current:

```bash
docker exec mailserver postmap /tmp/docker-mailserver/postfix-virtual.cf
docker exec mailserver postfix reload
docker exec mailserver postmap -q sponsors@agoojiye.com hash:/tmp/docker-mailserver/postfix-virtual.cf
```

## Current public DNS state

The public mail cutover was completed in OVH Manager on 2026-07-21. The authoritative OVH servers and Google Public DNS resolve:

```text
agoojiye.com.                  MX   10 mail.agoojiye.com.
mail.agoojiye.com.             A    51.254.143.30
agoojiye.com.                  TXT  v=spf1 mx ip4:51.254.143.30 -all
_dmarc.agoojiye.com.           TXT  v=DMARC1; p=none; rua=mailto:dmarc@agoojiye.com; adkim=s; aspf=s
mail._domainkey.agoojiye.com.  TXT  v=DKIM1; h=sha256; k=rsa; p=...
51.254.143.30                  PTR  mail.agoojiye.com.
```

The three legacy OVH MX records and the legacy OVH SPF record have been removed. Keep exactly one root SPF record and one MX record unless the mail architecture changes deliberately.

Re-verify the public records after any future DNS change with:

```powershell
npm run verify:agoojye:mail-dns
```

The command must pass MX, `mail` A, SPF, DMARC, and DKIM. Query the PTR separately because the verifier intentionally covers only the forward zone.

## Applied OVH DNS records

The docker-mailserver cutover applied the following changes to the `agoojiye.com` DNS zone.

### Remove

```text
@  MX  1    mx1.mail.ovh.net.
@  MX  5    mx2.mail.ovh.net.
@  MX  100  mx3.mail.ovh.net.
@  TXT      v=spf1 include:mx.ovh.com -all
```

### Add or replace

```text
mail  A    51.254.143.30
@     MX   10 mail.agoojiye.com.
@     TXT  v=spf1 mx ip4:51.254.143.30 -all
```

### Add DKIM

Record name:

```text
mail._domainkey
```

Record type:

```text
TXT
```

Record value:

```text
v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2sc5bNVbO7Z6xXGrtXXA2FP65BU7GgVc7oliHOI5N/HTP1RE2HOSCS71FRVB6ceTRMD/KnbPP4Y0pSdR9GUCMkCPH0COJf6HegEj9QAny+kczV/Xgy1XYi2AZiVZ6R7qZflKTIHvPwL1/KeQ8FoZp3ykfXkGkav0kyx4zovc5mau5NjLKG9RpsFzVa9FTKrXbb1uBEQwHFKv4HMVwaWjCn+GJrxuIL1O4UfqaMkcHdso1lLPjy/i8Rg6mN4D1dmRT3p1UB3GUTiFuZGJVMz7CN1GXymDRbd4hqcoIjzqAbx5/rMZU7nO3U1Ev2rR8C68V1OmpIs3LtYlBXUTJohfgwIDAQAB
```

OVH may split the TXT value into quoted chunks internally; the logical value must remain one DKIM TXT record.

### Add DMARC

Record name:

```text
_dmarc
```

Record type:

```text
TXT
```

Record value:

```text
v=DMARC1; p=none; rua=mailto:dmarc@agoojiye.com; adkim=s; aspf=s
```

DMARC starts in monitoring mode. Move from `p=none` to `p=quarantine` and then `p=reject` only after legitimate senders are verified.

### Set reverse DNS

Reverse DNS is configured on the OVH VPS/IP resource, not in the domain DNS zone. Set:

```text
IP: 51.254.143.30
PTR: mail.agoojiye.com
```

Create the `mail` A record first. OVH may refuse the PTR until `mail.agoojiye.com` resolves forward to `51.254.143.30`.

### OVH Manager sequence

1. Open `Web Cloud -> Domain names -> agoojiye.com -> DNS zone`.
2. Add `mail` A, DMARC and DKIM.
3. Replace the root SPF TXT record; keep only one SPF record at the root.
4. Replace the three OVH MX records with the single priority-10 MX record.
5. Save the zone changes and wait for propagation.
6. Open the VPS/IP reverse-DNS control and set the PTR shown above.
7. Run `npm run verify:agoojye:mail-dns` until all five forward-DNS checks pass, then query the PTR separately.

Changing MX moves external inbound delivery away from OVH mail. Confirm that any mail that must be retained in the old OVH mailboxes has been exported before submitting the MX deletion.

## Branded mail access

The production login endpoint is `https://mail.agoojiye.com/`. The existing `mail` A record points to the VPS, Nginx Proxy Manager routes the hostname to Roundcube, and certificate `npm-4` covers both `mail.agoojiye.com` and the legacy backend hostname. Roundcube defaults to French and uses AGOOJIYE branding. The legacy hostname remains available only for protocol compatibility and rollback.
