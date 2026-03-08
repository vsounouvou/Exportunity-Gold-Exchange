# Twilio production messaging

This repo now treats Twilio as a shared production communications layer for every tenant.

## Sender resolution

Outbound sends resolve in this order:

1. `agent_sender_profiles`
2. `tenant_communication_profiles`
3. global env fallback

The result determines:

- `fromAddress`
- `messagingServiceSid`
- `verifyServiceSid`
- sender label
- appended signature
- whether WhatsApp is explicitly sandbox-only for that tenant

Agent profiles can override sender identity and signature. If `fallback_to_tenant_default=true`, an agent can keep its own signature while still using the tenant sender.

## Global env fallback

These env vars remain supported as shared fallbacks only:

```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_SMS_FROM=
TWILIO_WHATSAPP_FROM=
TWILIO_VERIFY_SERVICE_SID=
TWILIO_MESSAGING_SERVICE_SID=
```

## SMS sender vs Messaging Service vs WhatsApp sender

- `TWILIO_SMS_FROM` or tenant `sms_from`: direct SMS sender number
- `TWILIO_MESSAGING_SERVICE_SID` or tenant `messaging_service_sid`: Twilio Messaging Service for SMS routing and sender pooling
- tenant `whatsapp_from`: approved WhatsApp sender for production WhatsApp traffic

Do not assume a Messaging Service replaces WhatsApp sender approval. Production WhatsApp still needs a real approved sender.

## Sandbox

Sandbox is optional only.

- `use_sandbox_for_dev=true` on a tenant profile explicitly enables sandbox fallback for that tenant
- without that flag, sandbox numbers are not treated as a valid production path
- the default production flow must not assume `whatsapp:+14155238886`

## Webhooks

Configure Twilio to post to:

- inbound SMS: `/api/webhooks/twilio/sms/inbound`
- inbound WhatsApp: `/api/webhooks/twilio/whatsapp/inbound`
- message status: `/api/webhooks/twilio/status`

The webhook layer validates `X-Twilio-Signature`, persists inbound/outbound status logs, and links status callbacks to `outbound_message_logs` via Twilio SID.

## Manual Twilio console work

The platform code cannot do these Twilio console steps for you:

1. buy or connect the SMS sender / Messaging Service
2. register and approve the production WhatsApp sender
3. create the Verify Service
4. configure webhook URLs in Twilio Console
5. create and approve WhatsApp content templates

## Moving a tenant from sandbox/dev to production

1. approve the tenant WhatsApp sender in Twilio
2. save the tenant profile with `whatsapp_from` and `whatsapp_sender_status=approved`
3. turn `use_sandbox_for_dev` off
4. keep `verify_service_sid` set if OTP is needed
5. optionally add agent sender profiles for tenant-specific signatures or sender overrides
