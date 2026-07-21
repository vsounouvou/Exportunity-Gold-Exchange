# AGOOJIYE email DNS and mailbox handoff

Date: 2026-07-21

Brand spelling note: the final public spelling is `AGOOJIYE`. The legacy technical key `agoojye` remains in route names, database tables, and private credential-file paths, while public DNS and email use `agoojiye.com`.

## Latest verified live state

Verified on 2026-07-21 after the AGOOJIYE production deployment and public mail cutover:

- Production runs commit `f7d766ea0abe` with build ID `1784585722185`; `/api/system/version` reports no client/server build mismatch.
- `https://agoojiye.com` returns HTTP 200.
- `https://agoojiye.com/mail/password` returns HTTP 200 with the title `Mot de passe email - AGOOJIYE`.
- `https://agoojiye.com/admin/agoojye/email` returns HTTP 200 for the protected app shell.
- `https://agoojiye.com/admin/agoojye/inbox` returns HTTP 200 for the protected unified-inbox shell.
- `https://agoojiye.com/api/agoojye/public/bootstrap` returns HTTP 200.
- All five initial human mailboxes authenticate successfully over IMAPS and SMTP submission using the private credential file.
- The first-login password-change route was verified end-to-end on 2026-06-29: one mailbox was changed to a temporary password through `https://agoojiye.com/mail/password`, authenticated with the temporary password, then reverted to the original initial password and re-verified.
- The five human mailbox profiles and SMTP identities are persisted for tenant `3162`, linked to the five physical `email_accounts`, and reference environment-secret names instead of storing passwords in the database.
- A live message sent to `sponsors@agoojiye.com` was delivered to all five Maildir inboxes, indexed as five source messages, and deduplicated by RFC `Message-ID` into one AGOOJIYE CRM thread/message. The completed index cycle reported `warnings=0`.
- The Postfix alias hash was rebuilt on 2026-07-18 because its generated `.db` file was older than the alias source. All 15 shared aliases now resolve to the five recipients.
- OVH DNS now publishes the self-hosted mail records: one priority-10 MX, `mail` A, SPF, DMARC, DKIM, and the matching `mail.agoojiye.com` PTR.
- The repository DNS verifier passes all five forward-DNS checks. Google Public DNS also resolves the PTR to `mail.agoojiye.com`.
- A post-cutover SMTP submission from `vital@agoojiye.com` was accepted and delivered to the INBOX for `regis@agoojiye.com`.
- Public TCP checks pass for SMTP port 25, SMTPS port 465, submission port 587, and IMAPS port 993.

## Provisioned mailboxes

These real docker-mailserver mailboxes now exist on the production mail stack and authenticate over IMAPS and SMTP submission through `mail.exportunity.net`.

| Person | Email | Quota | Status |
| --- | --- | ---: | --- |
| Regis | `regis@agoojiye.com` | 2 GB | active, IMAPS + SMTP submission verified |
| Marise | `marise@agoojiye.com` | 2 GB | active, IMAPS + SMTP submission verified |
| Vital | `vital@agoojiye.com` | 2 GB | active, IMAPS + SMTP submission verified |
| Surian | `surian@agoojiye.com` | 2 GB | active, IMAPS + SMTP submission verified |
| Binta | `binta@agoojiye.com` | 2 GB | active, IMAPS + SMTP submission verified; password-change flow verified and reverted |

Private initial passwords are not committed and are not printed in chat.

- VPS credential file: `/home/vital/secure/agoojye/agoojye-mailbox-initial-credentials-20260625T012859Z.txt`
- Local handoff copy: `C:\tmp\agoojye-mailbox-initial-credentials-20260625T012859Z.txt`
- Webmail login: `https://mail.exportunity.net/`
- First-login password change page: `https://agoojiye.com/mail/password`
- IMAP host: `mail.exportunity.net`, port `993`, TLS on
- SMTP submission host: `mail.exportunity.net`, port `587`, STARTTLS

Roundcube is available for mailbox login. Password self-service is handled by the AGOOJIYE platform at `/mail/password`: the route verifies the current mailbox password against Dovecot in docker-mailserver, updates docker-mailserver, verifies the new password against Dovecot, and writes only audit metadata. Raw mailbox passwords are not stored in the app database.

Private credential-file format: account lines are tab-separated as `<email> <initial-password> <provision-status> <auth-status>`. The initial password is the second field. Treat the entire file as secret material and do not paste it into chat, logs or commits.

## Shared aliases

The following aliases are active and currently fan out to all five initial AGOOJIYE mailboxes:

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

- `email_accounts`: 5 active accounts for tenant `3162`
- `email_aliases`: 75 alias routes for tenant `3162`
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

## Optional branded mail access

The verified login endpoint today is `mail.exportunity.net`. If AGOOJIYE needs branded webmail at `mail.agoojiye.com` or `webmail.agoojiye.com`, add the DNS record and an Nginx Proxy Manager host with a Let's Encrypt certificate before telling users to use that branded URL.
