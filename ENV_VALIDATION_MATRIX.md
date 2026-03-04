# Environment Validation Matrix

Date: 2026-02-28

## Startup Validators and Runtime Guards

## Twilio / Messaging

Required core keys:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`

Channel keys:
- SMS: `TWILIO_SMS_FROM` OR `TWILIO_MESSAGING_SERVICE_SID`
- WhatsApp sender: `TWILIO_WHATSAPP_FROM` OR `TWILIO_MESSAGING_SERVICE_SID`
- WhatsApp OTP verify: `TWILIO_VERIFY_SERVICE_SID`

Boot behavior:
- `server/index.ts` calls `validateTwilioEnv()` and logs resolved messaging health/missing keys.
- Missing core config causes Twilio runtime to be treated as misconfigured.

Action enqueue behavior:
- `SEND_SMS`/`SEND_WHATSAPP` requests fail immediately with:
  - `status=FAILED`
  - `lifecycleState=FAILED`
  - `errorCode=MISSING_CONFIG`
  - human-readable `errorMessage`
- No stuck queued action when config is missing.

Health endpoints:
- `GET /api/health/messaging`
- `GET /api/health/whatsapp`
- `GET /api/health/messaging/test` (admin)

## Email / SMTP

Required keys (when SMTP mode enabled):
- `MAIL_SMTP_HOST`
- `MAIL_SMTP_PORT`
- `MAIL_SMTP_USER`
- `MAIL_SMTP_PASS`

Boot behavior:
- `server/index.ts` calls `validateSmtpEnvAtBoot()`.
- Logs `SMTP disabled` with missing key list when incomplete.

Action enqueue behavior:
- `SEND_EMAIL` request fails immediately with:
  - `status=FAILED`
  - `lifecycleState=FAILED`
  - `errorCode=MISSING_CONFIG`
  - clear message (`Email disabled: missing ...`)

Health endpoint:
- `GET /api/health/email` (SMTP probe)

## Actions Runner

Runtime keys:
- `ACTIONS_WORKER_ENABLED` (default true)
- `ACTIONS_WORKER_INTERVAL_MS`
- `ACTIONS_WORKER_MAX_BATCH`
- `ACTIONS_WORKER_INITIAL_DELAY_MS`
- `ACTIONS_RUNNER_CLAIM_TTL_SECONDS`

Behavior:
- Worker heartbeat and batch stats tracked by scheduler.
- Lease-based dequeue protects against stuck/duplicate claims:
  - `claimed_until`
  - `claimed_by`
  - `next_retry_at`

Health endpoint:
- `GET /api/health/actions-runner`
  - `runnerAlive`
  - `queueDepth`
  - `lastJobAt`

## Action Evidence Control

Per-action behavior:
- Default is no mandatory evidence unless explicitly requested.
- Explicit requirement can be set via metadata (`evidenceRequired/evidence_required`) or registry `requiresEvidence=true`.

Queue gating:
- If `evidence_required=true` on action request:
  - created as `status=PENDING`, `lifecycleState=CREATED`, `evidence_status=PENDING`
  - not dequeued until evidence is attached.
- Evidence attach endpoint:
  - `POST /api/actions/:id/evidence`
  - transitions pending request to `QUEUED`.
