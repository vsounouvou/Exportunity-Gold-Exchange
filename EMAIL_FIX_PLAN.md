# EMAIL DELIVERY FIX PLAN - P0 PRODUCTION INCIDENT

**Status**: 🔴 CRITICAL - Gmail/Outlook rejecting all emails
**Root Cause**: SPF/DKIM authentication missing
**Impact**: 100% email delivery failure to external recipients
**ETA to fix**: 2-4 hours (DNS propagation dependent)

---

## EXECUTIVE SUMMARY

**Problem**: Emails from `*@boursedelor.com` and `*@exportunity.net` are rejected by Gmail/Outlook with `550-5.7.26 sender is unauthenticated`.

**Root Causes**:
1. **boursedelor.com**: NO SPF record
2. **exportunity.net**: DUAL SPF records (RFC violation)
3. **Both domains**: NO DKIM signing configured
4. **Both domains**: NO PTR (reverse DNS)
5. **.env**: SMTP configuration missing

**Fix Strategy**:
- Phase 1: DNS authentication (SPF + DKIM + DMARC + PTR) [2-24h including propagation]
- Phase 2: SMTP environment configuration [15 min]
- Phase 3: DKIM signing on mail server [30 min]
- Phase 4: Status tracking + UX [2-4h]
- Phase 5: Agent identity cleanup + test suite [2-4h]

---

## PHASE 1: DNS AUTHENTICATION FIXES

### 1.1 SPF Records

#### boursedelor.com - ADD NEW SPF RECORD
```
Type: TXT
Name: @
Value: v=spf1 ip4:51.254.143.30 include:_spf.google.com ~all
TTL: 3600
```

**Explanation**:
- `ip4:51.254.143.30` - Authorizes our mail server
- `include:_spf.google.com` - Allows Google Workspace (if used)
- `~all` - SoftFail for unauthorized (recommended for initial deployment)

#### exportunity.net - FIX DUAL SPF (REMOVE LEGACY)
**Current (BROKEN - has 2 SPF records)**:
```
v=spf1 ip4:51.254.143.30 -all
v=spf1 a mx ptr include:secureserver.net ~all
```

**REMOVE the second record entirely, KEEP only**:
```
Type: TXT
Name: @
Value: v=spf1 ip4:51.254.143.30 include:_spf.google.com ~all
TTL: 3600
```

---

### 1.2 DKIM Public Keys

**NOTE**: You MUST generate DKIM keys on the mail server first (see Phase 3). Once generated, add these DNS records:

#### boursedelor.com
```
Type: TXT
Name: s1._domainkey
Value: v=DKIM1; k=rsa; p=<PUBLIC_KEY_FROM_SERVER>
TTL: 3600
```

#### exportunity.net
```
Type: TXT
Name: s1._domainkey
Value: v=DKIM1; k=rsa; p=<PUBLIC_KEY_FROM_SERVER>
TTL: 3600
```

**Where to get `<PUBLIC_KEY_FROM_SERVER>`**: See Phase 3, step 3.3

---

### 1.3 DMARC Records (Relax to p=none during fixes)

#### boursedelor.com - UPDATE
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc_rua@onsecureserver.net; ruf=mailto:dmarc_ruf@onsecureserver.net; fo=1
TTL: 3600
```

#### exportunity.net - UPDATE
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:vs@exportunity.net; ruf=mailto:vs@exportunity.net; fo=1
TTL: 3600
```

**Change**: `p=quarantine` → `p=none` (relaxed policy while fixing SPF/DKIM)

---

### 1.4 PTR (Reverse DNS)

**Contact your hosting provider (OVH)** to set PTR record:

```
IP: 51.254.143.30
PTR: mail.exportunity.net
```

**Verification command**:
```bash
nslookup 51.254.143.30
# Should return: name = mail.exportunity.net
```

---

## PHASE 2: SMTP ENVIRONMENT CONFIGURATION

Add to `.env`:

```bash
# ============================================
# MAIL SERVER CONFIGURATION (mail.exportunity.net)
# ============================================

# SMTP Connection
MAIL_SMTP_HOST=mail.exportunity.net
MAIL_SMTP_PORT=587
MAIL_SMTP_SECURE=false  # Use STARTTLS on port 587
MAIL_SMTP_USER=postmaster@mail.exportunity.net
MAIL_SMTP_PASS=<ASK_INFRASTRUCTURE_TEAM>
MAIL_SMTP_SENDMAIL=false
MAIL_SMTP_ALLOW_NO_AUTH=false
MAIL_SMTP_TLS_REJECT_UNAUTHORIZED=true

# Public IP (for SPF diagnostics)
MAIL_SMTP_PUBLIC_IP=51.254.143.30

# HELO/EHLO hostname
MAIL_SMTP_HELO_NAME=mail.exportunity.net

# Fallback Reply-To (if mailbox not provisioned)
MAIL_REPLY_FALLBACK=no-reply@exportunity.net

# Maildir base path (inside mailserver container)
MAILDIR_BASE=/var/vmail

# Docker mailserver container name
MAILSERVER_CONTAINER_NAME=mailserver
MAILSERVER_DOCKER_SOCKET_PATH=/var/run/docker.sock
```

**Action Required**: Get SMTP credentials from infrastructure team

---

## PHASE 3: DKIM SIGNING CONFIGURATION

### 3.1 Check if OpenDKIM is installed

SSH into `mail.exportunity.net` (51.254.143.30):

```bash
ssh root@mail.exportunity.net
docker exec -it mailserver bash

# Inside container
opendkim -V
# Should show: OpenDKIM Filter v2.x.x
```

### 3.2 Generate DKIM keys for both domains

```bash
# Inside mailserver container
mkdir -p /etc/opendkim/keys/boursedelor.com
mkdir -p /etc/opendkim/keys/exportunity.net

# Generate for boursedelor.com
opendkim-genkey -b 2048 -d boursedelor.com -D /etc/opendkim/keys/boursedelor.com -s s1 -v

# Generate for exportunity.net
opendkim-genkey -b 2048 -d exportunity.net -D /etc/opendkim/keys/exportunity.net -s s1 -v

# Set permissions
chown -R opendkim:opendkim /etc/opendkim/keys
chmod 600 /etc/opendkim/keys/*/s1.private
```

### 3.3 Extract public keys for DNS

```bash
# boursedelor.com public key
cat /etc/opendkim/keys/boursedelor.com/s1.txt

# exportunity.net public key
cat /etc/opendkim/keys/exportunity.net/s1.txt
```

**Output will look like**:
```
s1._domainkey	IN	TXT	( "v=DKIM1; k=rsa; "
	  "p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..." )
```

**Copy the `p=...` value** and add to DNS (Phase 1.2)

### 3.4 Configure OpenDKIM signing table

```bash
# Edit /etc/opendkim/SigningTable
echo "*@boursedelor.com s1._domainkey.boursedelor.com" >> /etc/opendkim/SigningTable
echo "*@exportunity.net s1._domainkey.exportunity.net" >> /etc/opendkim/SigningTable

# Edit /etc/opendkim/KeyTable
echo "s1._domainkey.boursedelor.com boursedelor.com:s1:/etc/opendkim/keys/boursedelor.com/s1.private" >> /etc/opendkim/KeyTable
echo "s1._domainkey.exportunity.net exportunity.net:s1:/etc/opendkim/keys/exportunity.net/s1.private" >> /etc/opendkim/KeyTable

# Edit /etc/opendkim/TrustedHosts
echo "boursedelor.com" >> /etc/opendkim/TrustedHosts
echo "exportunity.net" >> /etc/opendkim/TrustedHosts
echo "mail.exportunity.net" >> /etc/opendkim/TrustedHosts
echo "localhost" >> /etc/opendkim/TrustedHosts
echo "127.0.0.1" >> /etc/opendkim/TrustedHosts
echo "51.254.143.30" >> /etc/opendkim/TrustedHosts
```

### 3.5 Configure Postfix to use OpenDKIM

```bash
# Edit /etc/postfix/main.cf
postconf -e "milter_default_action = accept"
postconf -e "milter_protocol = 6"
postconf -e "smtpd_milters = inet:localhost:8891"
postconf -e "non_smtpd_milters = inet:localhost:8891"

# Restart services
service opendkim restart
service postfix restart
```

### 3.6 Verify DKIM signing

```bash
# Send test email
echo "DKIM test" | mail -s "Test DKIM" test@gmail.com

# Check Postfix logs
tail -f /var/log/mail.log | grep -i dkim
# Should see: "DKIM-Signature" header added
```

---

## PHASE 4: EMAIL STATUS TRACKING PIPELINE

**Current Issue**: UI shows "sent successfully" when email only queued, NOT when remote accepts.

### 4.1 Create Postfix log parser worker

File: `Exportunity-Gold-Exchange/server/scripts/postfix-log-worker.ts`

```typescript
import { db } from "@db";
import { emailMessages, emailSendLogs } from "@db/schema";
import { eq } from "drizzle-orm";
import { parsePostfixDeliveryEvents } from "../lib/mail/postfixLogParser";
import { MAIL_DELIVERY_STATUSES } from "../lib/mail/deliveryStatus";
import fs from "fs";
import { Tail } from "tail";

const POSTFIX_LOG_PATH = process.env.POSTFIX_LOG_PATH || "/var/log/mail.log";

async function updateMessageStatus(queueId: string, recipient: string, deliveryStatus: string, reason: string | null) {
  try {
    // Find message by queue ID in metadata
    const messages = await db
      .select()
      .from(emailMessages)
      .where(sql`${emailMessages.metadata}->>'queueId' = ${queueId}`)
      .limit(10);

    for (const msg of messages) {
      const toEmails = Array.isArray(msg.toJson) ? msg.toJson : [];
      if (!toEmails.some(email => email.toLowerCase() === recipient.toLowerCase())) continue;

      await db
        .update(emailMessages)
        .set({
          status: deliveryStatus,
          metadata: {
            ...msg.metadata,
            postfixDeliveryStatus: deliveryStatus,
            postfixQueueId: queueId,
            postfixReason: reason,
            postfixUpdatedAt: new Date().toISOString(),
          },
        })
        .where(eq(emailMessages.id, msg.id));

      console.log(`[postfix-log-worker] Updated message ${msg.id} → ${deliveryStatus}`);
    }
  } catch (err) {
    console.error("[postfix-log-worker] Error updating status:", err);
  }
}

async function main() {
  if (!fs.existsSync(POSTFIX_LOG_PATH)) {
    console.error(`[postfix-log-worker] Log file not found: ${POSTFIX_LOG_PATH}`);
    process.exit(1);
  }

  const tail = new Tail(POSTFIX_LOG_PATH, { follow: true, useWatchFile: true });

  tail.on("line", async (line: string) => {
    const event = parsePostfixDeliveryEvent(line);
    if (!event) return;

    console.log("[postfix-log-worker] Delivery event:", event);
    await updateMessageStatus(event.queueId, event.recipient, event.deliveryStatus, event.reason);
  });

  tail.on("error", (err) => {
    console.error("[postfix-log-worker] Tail error:", err);
  });

  console.log(`[postfix-log-worker] Watching ${POSTFIX_LOG_PATH}`);
}

main().catch(console.error);
```

**Deploy**:
```bash
npm install tail
pm2 start tsx server/scripts/postfix-log-worker.ts --name=postfix-log-worker
```

---

## PHASE 5: AGENT EMAIL IDENTITIES (first.last@domain)

### 5.1 Current agent email issues

- Agents have NO email addresses configured
- Need deterministic first.last@ format
- Need signatures (HTML + text)
- Need stable avatars

### 5.2 Agent identity migration script

File: `Exportunity-Gold-Exchange/scripts/fix-agent-email-identities.ts`

```typescript
import { db } from "../db";
import { agents, agentEmailIdentities, agentMailboxes, tenants } from "../db/schema";
import { eq } from "drizzle-orm";

function generateProfessionalEmail(name: string, domain: string): string {
  const parts = name.toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return `agent${Date.now()}@${domain}`;
  if (parts.length === 1) return `${parts[0]}@${domain}`;

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return `${firstName}.${lastName}@${domain}`;
}

async function main() {
  const allAgents = await db.query.agents.findMany({
    where: eq(agents.isTest, false),
    with: { company: true },
  });

  for (const agent of allAgents) {
    if (!agent.company) {
      console.log(`[SKIP] Agent ${agent.id} (${agent.name}) - no company`);
      continue;
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, agent.company.id),
    });

    if (!tenant) {
      console.log(`[SKIP] Agent ${agent.id} - no tenant`);
      continue;
    }

    const domain = tenant.key === "bdo" ? "boursedelor.com" : "exportunity.net";
    const professionalEmail = generateProfessionalEmail(agent.name, domain);

    console.log(`[FIX] Agent ${agent.id} (${agent.name}) → ${professionalEmail}`);

    // Create/update email identity
    await db
      .insert(agentEmailIdentities)
      .values({
        tenantId: tenant.id,
        agentId: agent.id,
        agentKey: agent.name.toLowerCase().replace(/\s+/g, "_"),
        fromEmail: professionalEmail,
        replyToEmail: professionalEmail,
        displayName: agent.name,
        isEnabled: true,
        metadata: {
          role: agent.role,
          companyName: tenant.name,
          website: `https://${domain}`,
          migratedAt: new Date().toISOString(),
        },
      })
      .onConflictDoUpdate({
        target: [agentEmailIdentities.tenantId, agentEmailIdentities.agentId],
        set: {
          fromEmail: professionalEmail,
          replyToEmail: professionalEmail,
          displayName: agent.name,
          updatedAt: new Date(),
        },
      });
  }

  console.log("[DONE] Agent email identities fixed");
}

main();
```

**Run**:
```bash
tsx scripts/fix-agent-email-identities.ts
```

---

## PHASE 6: EMAIL ACCEPTANCE TEST SUITE

File: `Exportunity-Gold-Exchange/scripts/email-acceptance-tests.ts`

```typescript
import { sendEmailAsAgent } from "../server/lib/mail/sender";
import { db } from "../db";
import { tenants } from "../db/schema";
import { eq } from "drizzle-orm";

const TEST_RECIPIENTS = {
  gmail: ["test.recipient.1@gmail.com", "test.recipient.2@gmail.com"],
  outlook: ["test.recipient@outlook.com"],
  yahoo: ["test.recipient@yahoo.com"],
  internal: ["vs@exportunity.net"],
};

async function runTest(tenantKey: string, agentKey: string, recipientType: string, to: string[]) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.key, tenantKey as any),
  });
  if (!tenant) throw new Error(`Tenant not found: ${tenantKey}`);

  console.log(`\n[TEST] ${tenantKey} → ${agentKey} → ${recipientType} (${to.join(", ")})`);

  const result = await sendEmailAsAgent({
    tenantId: tenant.id,
    agentKey,
    actorType: "system",
    to,
    subject: `[EMAIL TEST] ${tenantKey} → ${recipientType} at ${new Date().toISOString()}`,
    textBody: `This is an email delivery acceptance test from ${agentKey}@${tenantKey}.

If you receive this, SPF+DKIM are working!

Test ID: ${Date.now()}
Tenant: ${tenantKey}
Agent: ${agentKey}
Recipient type: ${recipientType}`,
    htmlBody: null,
    bypassApproval: true,
  });

  console.log("[RESULT]", JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  const tests = [
    { tenant: "bdo", agent: "diego_alvarez", type: "gmail", to: TEST_RECIPIENTS.gmail },
    { tenant: "bdo", agent: "samuel_mensah", type: "outlook", to: TEST_RECIPIENTS.outlook },
    { tenant: "exportunity", agent: "chairman", type: "yahoo", to: TEST_RECIPIENTS.yahoo },
    { tenant: "exportunity", agent: "cfo", type: "internal", to: TEST_RECIPIENTS.internal },
  ];

  const results = [];
  for (const test of tests) {
    try {
      const result = await runTest(test.tenant, test.agent, test.type, test.to);
      results.push({ ...test, ok: result.ok, status: result.message?.status });
    } catch (err: any) {
      results.push({ ...test, ok: false, error: err.message });
    }
  }

  console.log("\n========== ACCEPTANCE TEST SUMMARY ==========");
  console.table(results);

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log(`\nPassed: ${passed}/${total}`);

  if (passed === total) {
    console.log("✅ ALL TESTS PASSED - Email delivery is OPERATIONAL");
  } else {
    console.log("❌ SOME TESTS FAILED - Review errors above");
    process.exit(1);
  }
}

main();
```

**Run**:
```bash
tsx scripts/email-acceptance-tests.ts
```

---

## VERIFICATION CHECKLIST

### DNS Verification
- [ ] SPF: `nslookup -type=TXT boursedelor.com` shows single SPF with ip4:51.254.143.30
- [ ] SPF: `nslookup -type=TXT exportunity.net` shows single SPF with ip4:51.254.143.30
- [ ] DKIM: `nslookup -type=TXT s1._domainkey.boursedelor.com` returns DKIM public key
- [ ] DKIM: `nslookup -type=TXT s1._domainkey.exportunity.net` returns DKIM public key
- [ ] DMARC: Both domains have `p=none` policy
- [ ] PTR: `nslookup 51.254.143.30` returns `mail.exportunity.net`

### SMTP Configuration
- [ ] `.env` has all MAIL_SMTP_* variables
- [ ] Can connect: `telnet mail.exportunity.net 587`
- [ ] STARTTLS works: `openssl s_client -connect mail.exportunity.net:587 -starttls smtp`

### DKIM Signing
- [ ] OpenDKIM running: `docker exec mailserver service opendkim status`
- [ ] Postfix milter configured: `docker exec mailserver postconf smtpd_milters`
- [ ] Test email has DKIM-Signature header

### Email Delivery
- [ ] Test to Gmail: DELIVERED_REMOTE_ACCEPTED
- [ ] Test to Outlook: DELIVERED_REMOTE_ACCEPTED
- [ ] Test to Yahoo: DELIVERED_REMOTE_ACCEPTED
- [ ] Check Gmail "Show Original" → SPF PASS, DKIM PASS, DMARC PASS

---

## TIMELINE

| Phase | Task | Time | Status |
|-------|------|------|--------|
| 1 | DNS fixes (SPF, DKIM pubkey, DMARC, PTR) | 2-24h | ⏳ Pending DNS propagation |
| 2 | .env SMTP configuration | 15 min | ⏳ Awaiting credentials |
| 3 | DKIM signing setup (OpenDKIM) | 30 min | ⏳ Pending |
| 4 | Postfix log worker (status tracking) | 1h | ⏳ Pending |
| 5 | Agent identity migration | 1h | ⏳ Pending |
| 6 | Email acceptance tests | 30 min | ⏳ Pending |

**TOTAL ETA**: 2-4 hours (excluding DNS propagation wait)

---

## LAUNCH BLOCKER CRITERIA

**CANNOT LAUNCH UNTIL**:
1. ✅ Gmail test shows: SPF=PASS, DKIM=PASS, DMARC=PASS, status=DELIVERED_REMOTE_ACCEPTED
2. ✅ Outlook test shows: status=DELIVERED_REMOTE_ACCEPTED
3. ✅ All agents have professional email addresses (no UUIDs/numbers)
4. ✅ Bounce tracking operational (DSN parsed + attached to threads)

---

## SUPPORT CONTACTS

- **Infrastructure/DNS**: OVH Support / DNS admin
- **Mail Server**: SSH access to root@mail.exportunity.net
- **Code Issues**: Principal Engineer (this session)

---

**NEXT STEPS**: Execute phases 1-3 in parallel, then phases 4-6 sequentially.
