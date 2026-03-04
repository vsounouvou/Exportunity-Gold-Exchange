# Twilio integration (SMS / WhatsApp / Voice / Verify)

This repo supports Twilio end-to-end for:

- Messaging: SMS + WhatsApp (inbound/outbound + status callbacks + media metadata)
- Voice: inbound TwiML + outbound calls + status callbacks + optional recordings
- Verify (OTP): WhatsApp or SMS OTP for login (separate from agent messaging)

Security: never hardcode `TWILIO_AUTH_TOKEN` in code or commit it to git. Use environment variables only.

## 1) Server environment variables

Set these on the server only (never in the frontend):

```env
# Twilio core
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Public base URL used for webhook signature validation + callback URL generation
# (Either PUBLIC_BASE_URL or TWILIO_APP_BASE_URL is required for callbacks.)
PUBLIC_BASE_URL=https://your-domain.com
# TWILIO_APP_BASE_URL=https://your-domain.com

# Messaging senders
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_SMS_FROM=+1XXXXXXXXXX
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Voice sender + optional fallback destination (if a route/agent doesn't specify one)
TWILIO_VOICE_FROM=+1XXXXXXXXXX
TWILIO_VOICE_FORWARD_TO=+1XXXXXXXXXX
TWILIO_VOICE_VOICEMAIL_ENABLED=true

# Verify (OTP) - optional but recommended
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Webhook signing secret override (optional). Fallbacks: TWILIO_WEBHOOK_SECRET, then TWILIO_AUTH_TOKEN.
TWILIO_WEBHOOK_SIGNING_SECRET=
TWILIO_WEBHOOK_SECRET=

# Optional routing defaults
TWILIO_DEFAULT_AGENT_KEY=support
TWILIO_AUTO_REPLY=true

# Optional: comma-separated VIP numbers (E.164) for shorter SLA dueAt
TWILIO_VIP_PHONES=+2250100000229,+1XXXXXXXXXX
```

Notes:
- If `TWILIO_SMS_FROM` and `TWILIO_MESSAGING_SERVICE_SID` are both empty, SMS sending is disabled.
- If you set any Twilio config, the server will fail boot if `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` are missing.

## 2) Webhook URLs (Twilio Console)

All webhooks verify `X-Twilio-Signature`. The URL Twilio uses must match your `PUBLIC_BASE_URL` (or `TWILIO_APP_BASE_URL`) host.

Configure Twilio to call these endpoints (HTTP POST):

Messaging
- Inbound SMS: `PUBLIC_BASE_URL/api/webhooks/twilio/sms/inbound`
- Inbound WhatsApp: `PUBLIC_BASE_URL/api/webhooks/twilio/whatsapp/inbound`
- Message status callback: `PUBLIC_BASE_URL/api/webhooks/twilio/message/status`

Voice
- Inbound voice (TwiML): `PUBLIC_BASE_URL/api/webhooks/twilio/voice/inbound`
- Voice status callback: `PUBLIC_BASE_URL/api/webhooks/twilio/voice/status`
- Recording callback: `PUBLIC_BASE_URL/api/webhooks/twilio/voice/recording`

Legacy aliases still work (backward compatibility):
- Inbound messages: `.../api/webhooks/twilio/inbound`
- Message status: `.../api/webhooks/twilio/status`

## 3) WhatsApp sandbox (trial)

If you're using the Twilio WhatsApp Sandbox:

1. Twilio Console -> Messaging -> Try it out -> Send a WhatsApp message.
2. Join the sandbox from your phone (Twilio provides a `join ...` code).
3. Use the platform UI to send a test message.

Twilio trial constraints:
- SMS and voice often work only with verified destination numbers.
- WhatsApp sandbox requires the recipient to join before you can message them.

## 4) Multi-tenant + agent routing (To -> agent)

Inbound webhooks resolve:

- Tenant: by Host header (your tenant domain).
- Agent: by routing rules (`communications_routing_map`) using `To` + `channel`.

UI:
- Inbox: `/admin/communications/twilio`
- Settings -> Communications -> Twilio: `/admin/settings/communications/twilio`

Example routing rule:
- Channel: `whatsapp`
- To address: `+14155238886`
- Agent key: `support`

Voice routing can optionally include a dial target (agent phone) in the route metadata.

## 5) Per-agent controls (limits + enable flags)

Per-tenant/per-agent controls are stored in `communications_agent_controls` and enforced for non-admin staff:
- Enable/disable SMS, WhatsApp, Voice per agent key
- Daily outbound limits per channel (0 = unlimited)
- `voiceDialToE164` default destination for outbound voice calls

Admin API:
- `GET /api/admin/twilio/agent-controls`
- `POST /api/admin/twilio/agent-controls`

## 6) Observability

The platform stores webhook events in `communications_events` (provider=`twilio`).
You can view recent events in the Twilio settings page.
