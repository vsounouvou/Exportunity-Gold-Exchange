# Email Activation Runbook

## Current state

External email is disabled. The Company Brain phase supports reading approved business evidence and creating internal drafts only. It does not send, compose in Gmail, modify mail, label mail, or manage settings.

Do not activate sending as part of the read-only Workspace release.

## Preconditions for a later activation proposal

All of the following must be complete:

1. Read-only Gmail, Drive, and Contacts connectors pass tenant and permission tests.
2. The exact connected Workspace identity is visible and verified.
3. The Company Brain claim and evidence review workflow is operating.
4. Contacts preserve consent, DNC, opt-out, and source provenance.
5. Drafts show recipients, relationship context, citations, template, language, sender identity, and reason for contact.
6. Message-level human approval is recorded.
7. Domain authentication and deliverability are verified for the intended sender domain.
8. Rate limits, quiet hours, duplicate suppression, bounce handling, and complaint suppression are configured.
9. Inbound replies link to the correct contact, relationship, opportunity, and visible conversation.
10. Audit, incident response, and emergency stop have been tested.

## Required controls

- external-send feature flag off by default;
- separate provider scope activation;
- sender allowlist;
- recipient source and lawful-purpose record;
- consent and DNC enforcement;
- approved template or reviewed free-form draft;
- per-message approval ID, approving user, and timestamp;
- idempotency key and duplicate-contact window;
- daily, per-domain, per-agent, and campaign limits;
- working-hours policy by recipient timezone;
- unsubscribe and opt-out handling;
- bounce, complaint, and provider failure handling;
- immutable action result, provider ID, and evidence receipt;
- global stop switch visible to an administrator.

## Activation stages

### Stage 0 - internal drafting

- no send scope;
- no provider send call;
- human edits and approves draft quality;
- current required state.

### Stage 1 - test recipients

- separate founder approval required;
- only explicitly allowlisted company-controlled recipients;
- maximum 5 messages;
- verify headers, sender, signatures, links, threading, and audit receipts.

### Stage 2 - named relationship follow-up

- recipients must already have a documented relationship or explicit consent;
- each message individually approved;
- no bulk campaigns.

### Stage 3 - controlled campaigns

- separate legal/compliance and founder approval;
- approved audience, template, limits, opt-out, and monitoring;
- start with a small test cohort and stop on adverse signals.

## Sending path

All sends must use the existing action request and approval infrastructure. An agent creates a draft and proposed `SEND_EMAIL` action. The user approves the exact content and recipients. The worker executes once, records provider result and receipt, and links any reply to the same conversation.

No public marketplace interaction can trigger unattended outreach.

## Emergency stop

1. Set `FEATURE_EXTERNAL_COMMUNICATIONS=false`.
2. Pause the relevant action worker or campaign through visible controls.
3. Revoke provider credentials if compromise is suspected.
4. Quarantine queued send actions.
5. Preserve logs and provider IDs.
6. Review recipients, contents, approvals, and provider status.
7. Resume only after an incident decision is recorded.
