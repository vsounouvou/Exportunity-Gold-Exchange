# DNS CONFIGURATION INSTRUCTIONS

**CRITICAL**: These DNS changes are REQUIRED for email delivery to Gmail/Outlook.
**Timeline**: Apply immediately, allow 2-24h for propagation.

---

## Overview

You need to configure DNS records for **TWO domains**:
1. `boursedelor.com` (current state: ❌ NO SPF, ❌ NO DKIM)
2. `exportunity.net` (current state: ⚠️ DUAL SPF, ❌ NO DKIM)

**Mail server**: `mail.exportunity.net` (IP: `51.254.143.30`)

---

## DNS Changes Required

### 1. SPF (Sender Policy Framework)

#### boursedelor.com - ADD NEW RECORD
```
Type: TXT
Host: @
Value: v=spf1 ip4:51.254.143.30 include:_spf.google.com ~all
TTL: 3600
```

#### exportunity.net - REPLACE EXISTING (DELETE BOTH, ADD ONE)
**Current (BROKEN)**:
```
v=spf1 ip4:51.254.143.30 -all
v=spf1 a mx ptr include:secureserver.net ~all
```

**Action**: Delete BOTH records above, then add:
```
Type: TXT
Host: @
Value: v=spf1 ip4:51.254.143.30 include:_spf.google.com ~all
TTL: 3600
```

---

### 2. DKIM (DomainKeys Identified Mail)

⚠️ **PREREQUISITE**: You MUST generate DKIM keys on the mail server first. See `EMAIL_FIX_PLAN.md` Phase 3.

Once keys are generated (via `opendkim-genkey`), add these DNS records:

#### boursedelor.com
```
Type: TXT
Host: s1._domainkey
Value: v=DKIM1; k=rsa; p=<PUBLIC_KEY_FROM_SERVER>
TTL: 3600
```

#### exportunity.net
```
Type: TXT
Host: s1._domainkey
Value: v=DKIM1; k=rsa; p=<PUBLIC_KEY_FROM_SERVER>
TTL: 3600
```

**Where to get `<PUBLIC_KEY_FROM_SERVER>`**:
```bash
ssh root@mail.exportunity.net
docker exec -it mailserver cat /etc/opendkim/keys/boursedelor.com/s1.txt
docker exec -it mailserver cat /etc/opendkim/keys/exportunity.net/s1.txt
```

Copy the `p=...` value (will be very long, ~400 characters).

---

### 3. DMARC (Domain-based Message Authentication)

#### boursedelor.com - UPDATE EXISTING
**Current**:
```
v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;
```

**New**:
```
Type: TXT
Host: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc_rua@onsecureserver.net; ruf=mailto:dmarc_ruf@onsecureserver.net; fo=1; pct=100; adkim=r; aspf=r
TTL: 3600
```

**Change**: `p=quarantine` → `p=none` (relaxed while fixing SPF/DKIM)

#### exportunity.net - UPDATE EXISTING
**Current**:
```
v=DMARC1; p=quarantine; rua=mailto:vs@exportunity.net
```

**New**:
```
Type: TXT
Host: _dmarc
Value: v=DMARC1; p=none; rua=mailto:vs@exportunity.net; ruf=mailto:vs@exportunity.net; fo=1; pct=100; adkim=r; aspf=r
TTL: 3600
```

**Change**: `p=quarantine` → `p=none`

---

### 4. PTR (Reverse DNS)

⚠️ **ACTION REQUIRED**: Contact your hosting provider (OVH) to set reverse DNS.

**Request**:
```
IP Address: 51.254.143.30
PTR Record: mail.exportunity.net
```

**How to verify**:
```bash
nslookup 51.254.143.30
# Expected output: name = mail.exportunity.net
```

---

## Verification Commands

After applying DNS changes, wait 15-30 minutes, then verify:

### SPF Verification
```bash
# boursedelor.com
nslookup -type=TXT boursedelor.com 8.8.8.8 | grep "v=spf1"
# Expected: ONE line with "v=spf1 ip4:51.254.143.30 include:_spf.google.com ~all"

# exportunity.net
nslookup -type=TXT exportunity.net 8.8.8.8 | grep "v=spf1"
# Expected: ONE line with "v=spf1 ip4:51.254.143.30 include:_spf.google.com ~all"
```

### DKIM Verification
```bash
# boursedelor.com
nslookup -type=TXT s1._domainkey.boursedelor.com 8.8.8.8
# Expected: v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0B...

# exportunity.net
nslookup -type=TXT s1._domainkey.exportunity.net 8.8.8.8
# Expected: v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0B...
```

### DMARC Verification
```bash
# boursedelor.com
nslookup -type=TXT _dmarc.boursedelor.com 8.8.8.8
# Expected: v=DMARC1; p=none; ...

# exportunity.net
nslookup -type=TXT _dmarc.exportunity.net 8.8.8.8
# Expected: v=DMARC1; p=none; ...
```

### PTR Verification
```bash
nslookup 51.254.143.30
# Expected: name = mail.exportunity.net
```

---

## Online Verification Tools

After DNS propagation (24h), use these tools to verify:

1. **MXToolbox** - https://mxtoolbox.com/SuperTool.aspx
   - Check: `boursedelor.com` (SPF, DKIM, DMARC)
   - Check: `exportunity.net` (SPF, DKIM, DMARC)

2. **Google Admin Toolbox** - https://toolbox.googleapps.com/apps/checkmx/
   - Enter: `boursedelor.com`
   - Enter: `exportunity.net`
   - Verify all checks pass

3. **DMARC Analyzer** - https://www.dmarcanalyzer.com/dmarc/dmarc-record-check/
   - Check both domains

4. **Mail Tester** - https://www.mail-tester.com/
   - Send test email to provided address
   - Should score 10/10 after fixes

---

## Troubleshooting

### Issue: Multiple SPF records found
**Symptom**: `nslookup -type=TXT domain.com` shows 2+ SPF records
**Fix**: Delete ALL SPF records, then add exactly ONE record

### Issue: DKIM "Non-existent domain"
**Symptom**: `nslookup -type=TXT s1._domainkey.domain.com` fails
**Cause**: DKIM keys not generated on server OR DNS not propagated
**Fix**:
1. Generate keys on server (see Phase 3 in EMAIL_FIX_PLAN.md)
2. Add public key to DNS
3. Wait 30 minutes for propagation

### Issue: PTR not resolving
**Symptom**: `nslookup 51.254.143.30` returns no name
**Cause**: Hosting provider has not set reverse DNS
**Fix**: Contact OVH support, provide IP and desired PTR record

---

## DNS Provider Instructions

### If using GoDaddy:
1. Go to: Domain Settings → DNS → Manage DNS
2. Add TXT records as specified above
3. Save changes
4. Wait 15-30 min for propagation

### If using Cloudflare:
1. Go to: DNS → Records
2. Add TXT records (set "Proxy status" to "DNS only" for email records)
3. Save
4. Wait 5-15 min for propagation

### If using OVH:
1. Go to: Web Cloud → Domain names → [domain] → DNS zone
2. Add TXT records as specified
3. Click "Apply configuration"
4. Wait 15-30 min for propagation

---

## Timeline

| Step | Time | Notes |
|------|------|-------|
| Apply DNS changes | 5-15 min | Depends on DNS provider interface |
| DNS propagation | 15 min - 24h | Average: 1-2 hours |
| PTR setup (OVH) | 24-48h | Requires support ticket |
| Verification | 5 min | Run commands above |

---

## Final Checklist

- [ ] boursedelor.com SPF record added
- [ ] exportunity.net dual SPF fixed (only ONE record exists)
- [ ] DKIM keys generated on server
- [ ] boursedelor.com DKIM public key added to DNS
- [ ] exportunity.net DKIM public key added to DNS
- [ ] boursedelor.com DMARC updated to p=none
- [ ] exportunity.net DMARC updated to p=none
- [ ] PTR record requested from OVH
- [ ] All DNS changes verified with nslookup
- [ ] Test email sent to Gmail (check "Show Original" for SPF/DKIM PASS)

---

**NEXT STEP**: Once DNS changes are applied, proceed to Phase 2 (SMTP configuration) in `EMAIL_FIX_PLAN.md`.
