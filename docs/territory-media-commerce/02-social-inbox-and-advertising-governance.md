# Social Inbox and Advertising Governance

Date: 2026-08-17
Status: implemented in source; database deployment and live-provider evidence remain open.

## Social inbox boundary

Provider comments, replies, mentions, and direct messages reuse the canonical `communications_threads`, `communications_messages`, and `communications_work_orders` tables. Migration `20270415` adds the immutable provider binding and audit extension; it does not create a second inbox.

Every accepted event requires:

- a tenant-scoped, provider-verified social target;
- a provider event ID that is unique per tenant/provider;
- provider/platform/channel/event-type consistency;
- allowlisted verification evidence confirming a business-owned account and excluding credentials;
- a bounded message body and identifiers, with no raw authorization headers or tokens.

The deterministic classifier uses exactly: `interest`, `purchase_request`, `wholesale_request`, `partnership`, `producer_application`, `creator_application`, `delivery_question`, `complaint`, `misinformation`, `spam`, `abuse`, `sensitive_issue`, and `press_request`.

Lead-eligible intent creates or matches a tenant CRM contact without changing consent or DNC state. Every unique event creates one paused, zero-budget Media Agent review task and reopens the canonical work order. Spam, abuse, misinformation, complaints, press, and sensitive issues remain human-only. Other replies still require an official provider adapter, approved product facts, approved policies and tone, approved price references when a price is claimed, and human approval. The current source performs no external social reply.

## Advertising ownership and credential boundary

`ad_account_connections` stores only non-secret references, scoped permissions/capabilities, ownership/billing state, health/restriction state, and allowlisted verification evidence. Passwords, access tokens, refresh tokens, cookies, secrets, and private keys are rejected from evidence payloads. Canonical encrypted Mindbase connections may be referenced; credentials are never copied into advertising records.

An account is not ready unless all of the following hold:

1. the business owns the ad account;
2. the tenant owns the billing method;
3. authorization and scoped permissions are active;
4. provider health is verified;
5. no account restriction is present;
6. the official create-ad capability is evidenced;
7. verification evidence confirms credentials were excluded.

No cross-tenant account sharing, personal-account shadowing, password collection, or restriction evasion is supported.

## Budget and pre-spend boundary

`ad_budget_envelopes` creates a restrictive hierarchy across global, brand, tenant, country, city, neighborhood, channel, campaign, test, production, and rights scopes. Each active ancestor can only reduce available authority. Total, daily, weekly, and monthly caps are all mandatory and checked in minor currency units. Internal approval requires an authenticated approver and evidence; it does not submit a campaign or spend money.

Before a media plan can reach internal approval, the policy requires:

- a defined objective;
- a tenant-owned, healthy, unrestricted ad account;
- an active, approved, in-period envelope hierarchy with enough total/daily/weekly/monthly capacity;
- an eligible, currently orderable product and approved fact reference;
- verified stock or production capacity;
- an active evidence-backed neighborhood territory;
- verified delivery serviceability;
- a verified landing page and conversion tracking plan;
- margin above the envelope minimum and CAC at or below its maximum;
- a current `paid_ad` rights grant from the canonical media-rights ledger;
- approved platform and brand policy state;
- explicit stop conditions for spend, CAC, account restriction, product availability, and delivery availability.

A plan with blockers remains `blocked`, and its campaign accurately reports `AWAITING_ACCOUNT`, `AWAITING_RIGHTS`, `AWAITING_STOCK`, `AWAITING_DELIVERY`, `AWAITING_BUDGET`, or `RESTRICTED`. A blocker-free plan is only `approval_required` / `NEEDS_REVIEW`.

## Authorization, reconciliation, and attribution

Media-plan approval and spend-authorization approval are separate accountable Actions. Approval reserves internal envelope capacity under an advisory lock and moves the campaign only to `SUBMISSION_READY`. It does not call a provider. The database prevents `ACTIVE` unless a provider campaign ID, provider confirmation timestamp, and activation timestamp are present.

Future official adapters must write every provider charge, refund, reversal, and reconciliation adjustment to the append-only `spend_ledger` using a tenant/provider transaction ID. Conversions are provider-idempotent and remain unverified until evidence exists. Attribution records bind conversions to campaign/creative/territory touchpoints with weights constrained to 0–10,000 basis points. Account restriction incidents are durable and must pause future provider execution.

## Live release checklist

1. Apply migrations through `20270416` in a non-production tenant and verify every constraint and tenant boundary.
2. Restore the Codex desktop Navigator transport, then privately authenticate to Google/YouTube, Meta, and Twilio. The user handles password and MFA.
3. Verify exact OAuth callbacks, app review, business manager ownership, ad-account ownership, billing ownership, permissions, account health, and restriction state. Retain non-secret provider references.
4. Implement official provider webhook/polling and reply/ad adapters with signature verification, idempotency, quota/rate controls, and provider receipts.
5. Run controlled non-spending permission tests. Do not launch an ad or perform a charge merely to prove connectivity.
6. Add provider charge ingestion/reconciliation before enabling submission. Any unreconciled or disputed charge must fail closed.
7. Add emergency pause and restriction incident drills, then complete accountable release approval.

No production migration, provider grant, campaign creation, social reply, or advertising spend was performed by this source package.
