# MindBase Production Integration Runbook

This is the operator checklist for moving MindBase from chat-first MVP to customer launch.

## Status Endpoints

- `/api/system/version`
- `/api/mindbase/integrations/status`
- `/api/admin/mindbase/launch-readiness`
- `/admin/mindbase/settings`

The readiness checks are intentionally conservative. A key being present does not mark a feature ready if token storage, routing, verification, or end-to-end testing is still missing.

## Core Production Environment

```env
APP_NAME=mindbase
DEPLOY_TENANT=mindbase
TENANT_DEFAULT=mindbase
PUBLIC_BASE_URL=https://mindbase.cloud
APP_BASE_URL=https://mindbase.cloud
PASSWORD_SETUP_BASE_URL=https://mindbase.cloud
DATABASE_URL=
OPENAI_API_KEY=
MINDBASE_JWT_SECRET=
MINDBASE_JWT_REFRESH_SECRET=
```

## Google OAuth

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://mindbase.cloud/api/mindbase/oauth/google/callback
MINDBASE_GOOGLE_OAUTH_ENABLED=false
```

Keep `MINDBASE_GOOGLE_OAUTH_ENABLED=false` until MindBase stores refresh tokens per workspace and requests only contextual Gmail, Drive, and Calendar scopes.

## Microsoft OAuth

```env
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=https://mindbase.cloud/api/mindbase/oauth/microsoft/callback
MINDBASE_MICROSOFT_OAUTH_ENABLED=false
```

Keep this disabled until Microsoft callback handling and token storage are implemented and tested.

## WhatsApp Cloud API

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
MINDBASE_WHATSAPP_ENABLED=false
```

Webhook URLs:

```text
GET  https://mindbase.cloud/api/webhooks/whatsapp
POST https://mindbase.cloud/api/webhooks/whatsapp
```

Keep `MINDBASE_WHATSAPP_ENABLED=false` until inbound messages are routed to workspace context and outbound sends require user approval.

## Email Provider

Configure one provider for account recovery, notifications, and invitations:

```env
RESEND_API_KEY=
SENDGRID_API_KEY=
MAILGUN_API_KEY=
MAIL_SMTP_HOST=
MAIL_SMTP_USER=
MAIL_SMTP_PASS=
```

## Payments

MindBase supports Free/manual access now. Paid access must stay gated until checkout, callback verification, webhook processing, and entitlement activation are tested.

```env
PAYMENT_PROVIDER=manual
# or
PAYMENT_PROVIDER=flutterwave
# or
PAYMENT_PROVIDER=kkiapay
```

Flutterwave:

```env
FLUTTERWAVE_PUBLIC_KEY=
FLUTTERWAVE_SECRET_KEY=
FLUTTERWAVE_ENCRYPTION_KEY=
FLUTTERWAVE_WEBHOOK_SECRET=
```

Kkiapay:

```env
KKIAPAY_PUBLIC_KEY=
KKIAPAY_PRIVATE_KEY=
KKIAPAY_SECRET_KEY=
KKIAPAY_SANDBOX=true
```

## Cutover Gate

- `/api/system/version` reports `app=mindbase`.
- `/api/system/version` reports the expected `buildId`.
- New visitor onboarding creates a real organization, workspace, and installed agents.
- Refresh restores the same draft session.
- Mobile chat keeps the composer fixed and scrolls inside the message list.
- Public integrations either start a real provider flow or show a disabled reason.
- Paid plans remain Free/manual unless provider verification has passed.
- Nginx Proxy Manager routes `mindbase.cloud` to `mindbase-app:5000`.
