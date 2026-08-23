# Exportunity Outbound Communications Policy

**Implementation status:** implemented and locally verified on 2026-08-17. Provider-console verification, production secrets, deployment, and controlled delivery receipts remain release actions.

## Canonical Decision

Every Exportunity email, SMS, WhatsApp message, meeting invite, and voice call is evaluated by one policy service. It returns exactly one decision:

| Decision | Meaning |
| --- | --- |
| `ALLOW_AUTO_SEND` | Every execution control is satisfied. This is available only to a separately authorized low-risk purpose or an action carrying a current visible approval receipt. |
| `REQUIRE_APPROVAL` | The draft may be stored, but no provider side effect may occur until a human approves the canonical action request. |
| `BLOCK` | A hard prohibition or execution gate failed. Approval cannot override consent withdrawal, DNC, suppression, sanctions risk, recipient mismatch, a disabled provider, or a missing/invalid receipt. |

The implementation lives in `server/lib/communications/outboundPolicy.ts` and `server/lib/communications/outboundDecisionService.ts`. It is enforced when the action is created, when it is approved, when the worker starts execution, and again immediately before the provider call.

## Evidence Evaluated

- Tenant scope and the global external-communications kill switch.
- Channel-specific release and verified-sender/caller flags.
- Current provider configuration and sender availability.
- Exact recipient set, tenant contact record, consent, opt-out, do-not-contact, suppression, and channel preference.
- Purpose, contact basis, commitment risk, recipient provenance, country/time zone, business hours, and daily quota.
- Explicit SMS/WhatsApp opt-in evidence.
- Approved WhatsApp template SID or an active WhatsApp session.
- A current action status of `RUNNING`, a matching channel and recipient set, and a visible approval receipt where required.

Conversational action normalization preserves this governance evidence instead of discarding it. Provider boundaries reject direct or replayed Exportunity sends that do not originate from the running canonical worker action.

## Release Gates

Credentials alone do not activate outreach. Exportunity requires all applicable gates:

```text
FEATURE_EXTERNAL_COMMUNICATIONS=true
FEATURE_EXPORTUNITY_<CHANNEL>_OUTBOUND=true
EXPORTUNITY_<CHANNEL>_SENDER_VERIFIED=true
```

The supported channel suffixes are `EMAIL`, `SMS`, `WHATSAPP`, and `VOICE`; voice uses `EXPORTUNITY_VOICE_CALLER_ID_VERIFIED`. `FEATURE_EXPORTUNITY_AUTONOMOUS_LOW_RISK_OUTBOUND` is an additional independent gate and must remain false unless a separately reviewed autonomous-purpose policy is released.

All release and verification flags default to false in `.env.example`.

## Provider Activation Checklist

1. Sign into each provider in the private browser UI. Do not paste passwords, MFA codes, auth tokens, app secrets, or API keys into a chat, commit, ticket, or screenshot.
2. Create or select the intended Exportunity provider project/account and record its accountable owner.
3. Store credentials only in the intended production secret manager or protected deployment environment. Confirm no value is committed to the repository.
4. Keep the global and channel release flags false while credentials and callbacks are tested.
5. Verify the exact callback and webhook URLs, HTTPS/TLS, signature validation, least-privilege scopes, provider account mode, quotas, and provider status callbacks.
6. Verify sender-domain, phone-number, WhatsApp-business-sender, or caller-ID ownership in the provider console. Only then set the applicable sender-verification flag.
7. Perform a non-production or provider-sandbox connection check. A provider being configured is not delivery evidence.
8. Enable one channel release flag for a controlled test recipient, then enable the global switch for the shortest required window.
9. Create the canonical action, review its policy reasons, approve it visibly, execute it through the worker, and retain the provider delivery/status receipt and action audit trail.
10. Disable the global switch after the test until release sign-off is complete. Never bulk-send as an activation test.

## Twilio Configuration

Required keys depend on the channel and may use Exportunity tenant overrides supported by the messaging resolver:

- Core: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`.
- SMS: `TWILIO_SMS_FROM` or `TWILIO_MESSAGING_SERVICE_SID`.
- WhatsApp: `TWILIO_WHATSAPP_FROM` or a correctly configured Messaging Service; outbound templates also need an approved `contentSid` and recipient-specific opt-in evidence.
- Voice: `TWILIO_VOICE_FROM`.
- Status callbacks: `TWILIO_STATUS_CALLBACK_BASE_URL=https://exportunity.net` and `TWILIO_WEBHOOK_PATH=/api/webhooks/twilio/status`.

Twilio Verify OTP traffic remains a separate authentication path. It is not supplier/customer outreach and must not be repurposed to bypass this action policy.

Exportunity voice is intentionally fail-closed at the provider boundary. A canonical `PLACE_VOICE_CALL` action and worker execution path have not yet been released, so setting environment flags cannot make direct Exportunity voice calls operational.

## Google and Meta Account Connections

The current Company Brain account connections are read-only. They do not grant autonomous email, calendar, Drive, Facebook, or Instagram writes.

Google redirect URI:

```text
https://exportunity.net/api/mindbase/integrations/google/callback
```

The generic Google connection requests identity plus Gmail read-only, Calendar read-only, and Drive read-only scopes. A separate Company Brain Google workspace callback already uses:

```text
https://exportunity.net/api/admin/company-brain/workspace/google/callback
```

Meta redirect URI:

```text
https://exportunity.net/api/mindbase/integrations/meta/callback
```

Facebook requests page-list and page-engagement read permissions. Instagram adds basic Instagram account access. `META_GRAPH_VERSION` is mandatory; it must be pinned only after confirming a currently supported version in the provider console. No page-management or Instagram-comment-management permission is requested.

## Verification Record

- Policy and action-intent regression tests pass locally.
- Repository route verification and TypeScript compilation pass locally.
- No provider secret was read, copied, generated, or stored during this implementation.
- No email, SMS, WhatsApp message, voice call, OAuth grant, crawler, scheduler, migration, deployment, or live payment was executed.
- Provider-console tabs were opened, but interactive browser control failed before session initialization in this desktop task. Provider ownership, redirect registration, app review, sender verification, secrets, and delivery receipts therefore remain open release evidence.
