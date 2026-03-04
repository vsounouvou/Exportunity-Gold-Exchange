# DNS RECORDS TO APPLY - EXACT VALUES

**Generated**: 2026-02-13 00:04 UTC
**DKIM Keys Generated**: ✅ Complete
**Server**: mail.exportunity.net (51.254.143.30)

---

## ⚠️ CRITICAL: APPLY THESE RECORDS IMMEDIATELY

### STEP 1: boursedelor.com - ADD SPF RECORD

**Action**: ADD new TXT record

```
Type: TXT
Name: @ (or boursedelor.com)
Value: v=spf1 ip4:51.254.143.30 include:_spf.google.com ~all
TTL: 3600
```

---

### STEP 2: boursedelor.com - ADD DKIM PUBLIC KEY

**Action**: ADD new TXT record

```
Type: TXT
Name: s1._domainkey
Value: v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtBhTkYgZ2vG+Inl0bApjNNWEEO6GP+kKhxNpT3uLQ+u+CcNxAyuEBSL0NV9wIgZUVKM74KgfXlV5IzSGJGjf5vrz8Jfs3z0eX6fxCfur6l3ssiub3oqHCFadipe3K9LRznYqXSBpkDdCdSAbQMEEGY1kZzqli57YwPFQyt3oReI1OtN67LnewftDJiTq/i9D+/2/OG2fUc2w+qDXtKA4VRK145kraaj39O/gBpwiCYbkFnNk+pyvWFc0wCObSDzu+0dmmAP6bw0Jo6wkxjCczhR+Lu/hJhE/jwM1Et2CxqvlubzDu/Pi50DpK1vhW9pVJf34MyD2av/i/GwQuNZtCQIDAQAB
TTL: 3600
```

**IMPORTANT**: If your DNS provider splits long TXT records, ensure the entire p= value is included.

---

### STEP 3: exportunity.net - FIX DUAL SPF (DELETE + ADD)

**Action 1**: DELETE both existing SPF records:
- ❌ DELETE: `v=spf1 ip4:51.254.143.30 -all`
- ❌ DELETE: `v=spf1 a mx ptr include:secureserver.net ~all`

**Action 2**: ADD single correct SPF record:

```
Type: TXT
Name: @ (or exportunity.net)
Value: v=spf1 ip4:51.254.143.30 include:_spf.google.com ~all
TTL: 3600
```

---

### STEP 4: exportunity.net - ADD DKIM PUBLIC KEY

**Action**: ADD new TXT record

```
Type: TXT
Name: s1._domainkey
Value: v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq+gMK3DtCwOIMkIvDobXyXm/3K8we5dbzNpXqGIVeMHfnXZFb6YaX4mw6ktCGCOUvJ0+zBNBXC+5pPTqfGrAJ4Uzd/QZKolUsODJJZn0aWHKD4CAakiQ9PbDuAGUAIPQg5FMyh+z4AKmUsMtrsmcxvMONwGNomDnWcD3XwQfQskLX5ke+Zb91gLPd2DekQ1a0FaXvu0Nm0oCYT6ZQga7v4mBmAS5wT3N6kD1tER0Z6aj583D/KYa99oW3GOX3qnQXLrycSFyFy5MkhXOpvI8X0DxhTwpWckh41y0QXMmA5y4xDUwmQcQtHWnTJUcH7gcpuJXGnD4HC/zsOVq3HAnNQIDAQAB
TTL: 3600
```

---

### STEP 5: boursedelor.com - ADD/UPDATE DMARC

**Action**: ADD or UPDATE TXT record

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@boursedelor.com; ruf=mailto:dmarc@boursedelor.com; fo=1
TTL: 3600
```

---

### STEP 6: exportunity.net - ADD/UPDATE DMARC

**Action**: ADD or UPDATE TXT record

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@exportunity.net; ruf=mailto:dmarc@exportunity.net; fo=1
TTL: 3600
```

---

## VERIFICATION COMMANDS

After applying DNS changes, wait 30 minutes, then verify:

### Verify SPF records (should show EXACTLY ONE per domain)
```bash
nslookup -type=TXT boursedelor.com 8.8.8.8 | grep spf
nslookup -type=TXT exportunity.net 8.8.8.8 | grep spf
```

### Verify DKIM public keys (should return the public key)
```bash
nslookup -type=TXT s1._domainkey.boursedelor.com 8.8.8.8
nslookup -type=TXT s1._domainkey.exportunity.net 8.8.8.8
```

### Verify DMARC (should show p=none)
```bash
nslookup -type=TXT _dmarc.boursedelor.com 8.8.8.8
nslookup -type=TXT _dmarc.exportunity.net 8.8.8.8
```

---

## DNS PROVIDER ACCESS

**IP Address**: 51.254.143.30 is hosted by OVH
**Likely Provider**: OVH or transferred to another DNS provider (GoDaddy, Cloudflare, etc.)

**To apply these records**:
1. Log into your DNS provider dashboard
2. Navigate to DNS zone editor for each domain
3. Apply the records exactly as shown above
4. Wait 30 minutes to 2 hours for propagation
5. Run verification commands

---

## CURRENT SERVER STATUS

✅ **DKIM Keys Generated**: Both boursedelor.com and exportunity.net
✅ **OpenDKIM Configured**: Signing table and key table active
✅ **Postfix Configured**: Milter enabled for DKIM signing
✅ **Services Restarted**: OpenDKIM and Postfix running
✅ **SMTP Account Created**: app@mail.exportunity.net (password set)
✅ **Application .env Updated**: SMTP credentials configured

⏳ **Waiting for**: DNS records to be applied (manual action required)

---

## NEXT STEPS

1. **YOU**: Apply all DNS records above in your DNS provider
2. **WAIT**: 30 min - 2 hours for DNS propagation
3. **VERIFY**: Run verification commands
4. **TEST**: Run acceptance tests (`npx tsx scripts/email-acceptance-tests.ts`)
5. **CONFIRM**: All 4 tests should show DELIVERED_REMOTE_ACCEPTED

---

**STATUS**: ⏳ Server infrastructure complete, awaiting DNS propagation
