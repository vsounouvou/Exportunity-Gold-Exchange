# AGOOJIYE Communications and Assistant

## Scope

The private workspace exposes two complementary experiences:

- `/workspace/messages`: team channels and direct messages.
- `/workspace/chat`: persistent conversations with `AGOOJIYE — Assistant IA`.

The interface is French-first and preserves tenant `3162`, WorkOS membership,
role permissions, direct-message privacy, MFA, tasks, decisions, documents,
CRM, mobility operations, webmail, and audit records.

## User Experience

Desktop communications use:

```text
[App rail] [Conversation list] [Conversation] [Optional information drawer]
```

Mobile communications use separate inbox and conversation screens. The
composer stays above the bottom navigation and supports:

- multiline text;
- Enter to send and Shift+Enter for a new line;
- direct file selection;
- drag and drop;
- image/file paste;
- voice notes;
- replies and threads;
- mentions, including explicit `@AGOOJIYE`;
- reactions;
- scheduled send time;
- persistent drafts;
- an offline send queue.

Keyboard access includes:

- `Ctrl/Cmd+K`: communication search;
- `Ctrl/Cmd+N`: new direct conversation menu;
- `Escape`: close search, thread, menu, or information drawer.

The assistant uses a wider reading layout for Markdown, tables, lists, sources,
feedback, and action approval cards. It does not reuse narrow message bubbles
for long answers.

## Data Model

Apply:

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f db/migrations/20260728_agoojye_chat_worldclass.sql
```

The migration adds:

- message thread, idempotency, edit/delete, schedule, and delivery fields;
- conversation read positions and preferences;
- per-user deliveries and read receipts;
- reactions and mentions;
- tenant-scoped attachments;
- drafts and pinned messages;
- persistent AI conversations, messages, contexts, and proposed actions;
- task/decision links back to source messages.

The migration is transactional and uses conditional DDL for repeatable
controlled deployments. Back up PostgreSQL before applying it.

## Real-Time Transport

Socket.IO namespace:

```text
/agoojye-workos
```

Channel rooms include both tenant and channel IDs. The server resolves the ECE
session, checks active WorkOS membership, requires MFA for privileged users,
and authorizes every channel before joining its room. Typing events are relayed
only for joined rooms.

Events include:

- `message:created`;
- `message:updated`;
- `message:deleted`;
- `message:reactions`;
- `message:pinned`;
- `conversation:read`;
- `typing:changed`;
- `presence:snapshot`;
- `presence:changed`.

Polling is not the primary transport. TanStack Query remains the recovery and
initial-load layer.

## Reverse Proxy

The existing HTTPS virtual host must forward WebSocket upgrades:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 75s;
}
```

Keep the normal application proxy for HTTP APIs. No additional public DNS
record is required when WorkOS remains under `https://agoojiye.com/workspace`.

## Attachments

Required production configuration:

```dotenv
AGOOJIYE_CHAT_ATTACHMENT_SECRET=
AGOOJIYE_CHAT_ATTACHMENT_MAX_BYTES=20971520
AGOOJIYE_CHAT_ATTACHMENT_URL_TTL_SECONDS=900
ASSET_ROOT=/data/assets
```

Generate an independent secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Do not reuse or commit the generated value. In production, the chat API returns
`503` until a durable signing secret is available.

The server validates MIME type and size, stores a SHA-256 digest, isolates the
asset under the AGOOJIYE tenant directory, and returns a short-lived signed
download URL. File paths are never sent to the browser.

Use shared durable storage when more than one application instance is running.
Connect an antivirus or content-disarm service before permitting untrusted
external attachments.

## Message Consistency

Every client send includes a UUID `clientMessageId`. The server:

1. obtains a PostgreSQL transaction advisory lock;
2. checks for an existing tenant/channel/client UUID;
3. inserts the message once;
4. links only attachments uploaded by the same member in the same channel;
5. creates recipient delivery rows;
6. emits the acknowledged message.

This prevents duplicate insertion during retry and reconnect. The browser shows
an optimistic message immediately, marks failed sends, and stores network
failures in a bounded device-local queue.

## Privacy and Authorization

- Every query includes a tenant boundary.
- Channel access is checked server-side.
- Direct channels are visible only to explicit members.
- Ordinary administrators do not receive automatic access to private DMs.
- Privileged WorkOS sessions require MFA.
- Signed attachment URLs carry no passenger or employee record.
- Search operates only over channels already authorized for the requester.
- Task and decision conversions retain the source channel/message IDs.
- Security-sensitive operations are written to the AGOOJIYE audit log.

Emergency DM access remains governed by the existing elevated authorization,
reason, MFA, limited-session, and audit procedures. This module does not create
a bypass.

## Assistant Behavior

The only visible central identity is:

```text
AGOOJIYE — Assistant IA
```

The assistant runs only after:

- a visible user prompt in `/workspace/chat`; or
- an explicit `@AGOOJIYE` mention in an authorized human conversation.

No hidden loop, automatic responder, or background AI conversation is started.
When `AI_ENABLED=false` or a provider fails, a deterministic permission-scoped
answer remains available. Provider calls use the configured timeout and send
only the minimal authorized context assembled for the requesting member.

Assistant responses include internal source references. Prompt/answer evidence,
provider, model, generation mode, and accessed record IDs are auditable.

## Human Approval

Assistant record changes are proposals. A proposed task is stored in
`agoojye_os_ai_message_actions` with `requires_approval=true`. The task is
inserted only when the same conversation owner selects `Confirmer`. Rejection
records the decision without changing operational data.

Adding another executable action requires:

1. a typed server-side payload schema;
2. a permission check for the target record;
3. a dedicated approval endpoint;
4. an audit event;
5. idempotent execution;
6. browser and unit tests.

## Verification

Compile the isolated surfaces:

```powershell
npx tsc -p tsconfig.agoojye-chat-client.json --pretty false
npx tsc -p tsconfig.agoojye-chat-server.json --pretty false
```

Run critical logic:

```powershell
node --import ./scripts/spawn-debug.mjs --loader ./scripts/ts-loader.mjs --test tests/agoojye-chat-worldclass.test.ts
```

Run the four UX sizes with installed Chrome:

```powershell
$env:E2E_CHROME_CHANNEL = "chrome"
npx playwright test tests/e2e/agoojye-chat-worldclass.spec.ts --project=chromium --workers=1
```

Run the production assembly:

```powershell
npm run build
```

Manual production smoke test:

1. Sign in as a normal active member.
2. Open a channel and a DM.
3. Send, edit, react to, reply to, and pin a message.
4. Upload an image and a PDF, then open both signed URLs.
5. Reload and confirm the draft/read position.
6. Open a second session and confirm real-time delivery and read status.
7. Mention `@AGOOJIYE` and verify one visible, auditable response.
8. Open `/workspace/chat`, ask a scoped question, inspect sources, and approve
   one proposed task.
9. Sign in as a user without access and confirm that private content is absent.
10. Repeat at 390 px, 768 px, 1440 px, and 1728 px.

## Deployment

1. Back up PostgreSQL.
2. Deploy the application release with all secrets present.
3. Apply the migration with `ON_ERROR_STOP=1`.
4. Restart the application.
5. Confirm `/socket.io/` upgrade support.
6. Run the critical logic and browser suites against staging.
7. Perform the manual smoke test.
8. Monitor authentication failures, socket reconnects, upload errors, and
   assistant approval audit events.

## Rollback

The application release can be rolled back before removing data. The new tables
and nullable message columns are backward-compatible with the previous WorkOS
code. Do not drop them during an incident rollback. Restore the previous
application image, keep the migration in place, and investigate offline.

## Known Limits

- The offline queue covers message sending; fully offline validation and
  multi-device conflict reconciliation are not claimed.
- Presence is process-local. Multi-instance deployment needs a Socket.IO Redis
  adapter or equivalent shared presence layer.
- Scheduled messages store a send time, but a production scheduler must enforce
  delivery timing across restarts.
- Poll creation, forwarding, huddles, video, and screen sharing are not included.
- Communication search currently covers permission-filtered message history;
  cross-entity task/document search remains available through the scoped
  assistant.
- Uploaded orphan cleanup and antivirus scanning require production jobs.
