# Messaging Debug Report

- Timestamp: `2026-02-27T18:02:30.798Z`
- Commit: `95fb93a`
- Total tenants: `4`
- PASS: `4`
- FAIL: `0`
- Scope: `env-filtered`
- Scoped slugs: `bdo, exportunity, zone, mindbase`

| Tenant | Base URL | Health | SMS Test | WA OTP Test | Notes |
|---|---|---:|---:|---:|---|
| bdo | https://boursedelor.com | PASS | PASS | PASS |  |
| exportunity | https://exportunity.net | PASS | PASS | PASS |  |
| zone | https://exportunity.zone | PASS | PASS | PASS |  |
| mindbase | https://mindbase.cloud | PASS | PASS | PASS |  |

## bdo
- Tenant ID: `1`
- Base URL: `https://boursedelor.com`
- Env namespace: `global`
- Health endpoint: `https://boursedelor.com/api/health/messaging`
- Health status: PASS (200)
- Warnings: Twilio WhatsApp Sandbox mode
- SMS test: PASS (queued)
- WA OTP test: PASS (pending)

## exportunity
- Tenant ID: `2`
- Base URL: `https://exportunity.net`
- Env namespace: `global`
- Health endpoint: `https://exportunity.net/api/health/messaging`
- Health status: PASS (200)
- Warnings: Twilio WhatsApp Sandbox mode
- SMS test: PASS (queued)
- WA OTP test: PASS (pending)

## zone
- Tenant ID: `970`
- Base URL: `https://exportunity.zone`
- Env namespace: `global`
- Health endpoint: `https://exportunity.zone/api/health/messaging`
- Health status: PASS (200)
- Warnings: Twilio WhatsApp Sandbox mode
- SMS test: PASS (queued)
- WA OTP test: PASS (pending)

## mindbase
- Tenant ID: `971`
- Base URL: `https://mindbase.cloud`
- Env namespace: `global`
- Health endpoint: `https://mindbase.cloud/api/health/messaging`
- Health status: PASS (200)
- Warnings: Twilio WhatsApp Sandbox mode
- SMS test: PASS (queued)
- WA OTP test: PASS (pending)

