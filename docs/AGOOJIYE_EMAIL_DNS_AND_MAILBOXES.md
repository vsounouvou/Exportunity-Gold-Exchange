# AGOOJIYE email DNS and mailbox handoff

Date: 2026-06-29

Brand spelling note: the final public spelling is `AGOOJIYE`. The legacy technical key `agoojye` remains in route names, database tables, and private credential-file paths, while public DNS and email use `agoojiye.com`.

## Provisioned mailboxes

These real docker-mailserver mailboxes now exist on the production mail stack and authenticate over IMAPS through `mail.exportunity.net`.

| Person | Email | Quota | Status |
| --- | --- | ---: | --- |
| Regis | `regis@agoojiye.com` | 2 GB | active, IMAPS verified |
| Marise | `marise@agoojiye.com` | 2 GB | active, IMAPS verified |
| Vital | `vital@agoojiye.com` | 2 GB | active, IMAPS verified |
| Surian | `surian@agoojiye.com` | 2 GB | active, IMAPS verified |
| Binta | `binta@agoojiye.com` | 2 GB | active, IMAPS verified |

Private initial passwords are not committed and are not printed in chat.

- VPS credential file: `/home/vital/secure/agoojye/agoojye-mailbox-initial-credentials-20260625T012859Z.txt`
- Local handoff copy: `C:\tmp\agoojye-mailbox-initial-credentials-20260625T012859Z.txt`
- Webmail login: `https://mail.exportunity.net/`
- First-login password change page: `https://agoojiye.com/mail/password`
- IMAP host: `mail.exportunity.net`, port `993`, TLS on
- SMTP submission host: `mail.exportunity.net`, port `587`, STARTTLS

Roundcube is available for mailbox login. Password self-service is handled by the AGOOJIYE platform at `/mail/password`: the route verifies the current mailbox password against Dovecot in docker-mailserver, updates docker-mailserver, verifies the new password against Dovecot, and writes only audit metadata. Raw mailbox passwords are not stored in the app database.

Private credential-file format: account lines are whitespace-separated as `<email> <initial-password> <created-marker> <verification-marker>`. The initial password is the second field. Treat the entire file as secret material and do not paste it into chat, logs or commits.

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

## Current public DNS state

As of 2026-06-29, public DNS is not yet cut over for this self-hosted mail stack:

- `agoojiye.com` MX still points to OVH: `mx1.mail.ovh.net`, `mx2.mail.ovh.net`, `mx3.mail.ovh.net`
- `mail.agoojiye.com` has no public `A` record
- root SPF is still `v=spf1 include:mx.ovh.com -all`
- `_dmarc.agoojiye.com` does not exist

The mailboxes can log in now, but external inbound mail for `@agoojiye.com` will keep going to OVH until the MX records below are changed.

## Required OVH DNS records

For the docker-mailserver cutover, update the `agoojiye.com` DNS zone as follows.

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

## Optional branded mail access

The verified login endpoint today is `mail.exportunity.net`. If AGOOJIYE needs branded webmail at `mail.agoojiye.com` or `webmail.agoojiye.com`, add the DNS record and an Nginx Proxy Manager host with a Let's Encrypt certificate before telling users to use that branded URL.
