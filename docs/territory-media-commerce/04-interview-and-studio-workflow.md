# Interview and Media Studio Workflow

## Release truth

This source release adds a governed interview and provider-neutral editing foundation inside the existing Exportunity CMS, rights ledger, tenant administration, Actions, and Operations task model.

It does **not** contact an interviewee, start a recording, upload raw media, call a rendering provider, publish content, create an advertisement, send a message, or spend money. The provider adapter is intentionally absent. A `prepared` render job means only that an approved version and hashed input manifest were frozen for a future, separately approved provider submission.

## Reused canonical systems

- Public media output remains `marketing_media_items`.
- Original-source provenance remains `source_content_references`.
- reusable-rights, producer consent, subject release, music licensing, attribution, territory, channel, use, validity, revocation, and takedown truth remain in `media_rights_grants` and `media_rights_events`.
- CRM identity remains `contacts` under tenant ownership.
- Human/agent work remains in `agent_tasks`; evidence gaps are created `paused`, with zero calls, tokens, and budget.
- Accountable mutations use central Action Runs and evidence.

The studio tables extend those systems. They are not a second CMS, CRM, task engine, rights ledger, or publication system.

## Interview modes

The canonical modes are:

1. asynchronous mobile;
2. live browser;
3. live audio;
4. recorded video call;
5. in-person field;
6. human-presented with AI preparation;
7. guided self-recording.

This release prepares all seven modes. A future recording or public-link adapter must still be selected, security-reviewed, and action-time approved. Public mobile invite tokens, calendar scheduling, provider recording, upload transport, transcription, and identity verification remain open release work.

## Progressive intake and review

The prepared question plan covers consent, identity, role and authority, producer story, products, capacity, price and MOQ, packaging, certifications, buyer segments, export experience, delivery, constraints, call to action, media, corrections, and final approval.

Every material answer is stored as a progressive claim with exactly one tag:

- `VERIFIED`
- `SUPPORTED_BY_DOCUMENT`
- `PRODUCER_CLAIM`
- `CREATOR_CLAIM`
- `INFERENCE`
- `UNVERIFIED`
- `OUTDATED`

`VERIFIED` requires an accountable verifier, verification time, and material evidence. `SUPPORTED_BY_DOCUMENT` requires at least one document/source reference. The other five tags preserve useful interview truth but block production use for a material claim. They can remain visible to reviewers and can create paused evidence work; they cannot silently become factual overlays or public sales claims.

Review readiness requires identity, an explanation/form reference for consent, recording consent, AI-processing consent, and at least one claim. Production readiness additionally requires publication consent whenever the intended use is public, social, advertising, newsletter, website, group campaign, or sales, plus a publishable state for every material claim.

## Studio project and version workflow

The governed states are:

`draft -> awaiting_source_verification -> awaiting_rights -> awaiting_producer_consent -> editing -> compliance_review -> awaiting_approval -> approved -> rendering -> ready -> scheduled -> published`

`failed`, `restricted`, `archived`, and `revoked` are terminal/restrictive branches. This release actively creates only the internal preparation, editing, compliance-review, approved, and prepared-render records. Provider rendering, scheduling, and publication need separate implementations and evidence.

A project begins only from:

- an approved, production-ready interview;
- the same tenant's source reference;
- an active rights grant belonging to that source;
- producer consent, subject release, music status, and material rights evidence.

Every asset records role, non-secret storage reference, original source, owner, uploader, MIME type, SHA-256, generation provider/prompt where applicable, AI-generation truth, rights, subject consent, music license, modifications, takedown state, and safe metadata. Credential-shaped keys and values are rejected rather than persisted.

A version freezes the storyboard, edit decision list, natural-language editing commands, output specification, exact claim IDs, review comments, and a deterministic content hash. Approval rechecks the interview, source, rights, consent, takedown, asset provenance, and fact gates. Approval applies to that exact hash; a later edit creates another version.

## Outputs and downstream mappings

The project content plan can request producer/CRM profile enrichment, product records, capacity records, wholesale offers, export assessment, transcript, subtitles, long-form episodes, clips, commerce cards, images, article, newsletter, group-purchase campaign preparation, and sales/evidence tasks.

This foundation records the plan and evidence dependencies. It does not auto-create or publish those downstream canonical records. Each mapper must be added against the existing canonical domain table, preserve the fact tags and citations, remain idempotent, and use its own approval/action boundary.

Supported render-manifest formats are vertical 9:16, feed 4:5, square 1:1, landscape 16:9, 15/30/60 seconds, 3-minute feature, long-form interview, audio-only, article, transcript, subtitle file, and thumbnail.

## Render truth boundary

`POST /api/admin/marketing/studio/renders/prepare` can create only:

- status `prepared`;
- provider `null`;
- provider job reference `null`;
- `external_render_executed = false`;
- `provider_confirmed = false`;
- exact project/version IDs, content hash evidence, output format, and input asset hashes.

The database rejects `provider_submitted`, `rendering`, or `succeeded` unless future code supplies the required provider, provider job reference, timestamps, output storage reference, output hash, and provider confirmation. No such provider-submission route exists in this release.

## Tenant-admin surface

The internal surface is `/admin/media/studio`. It exposes:

1. consent-aware interview preparation;
2. progressive claim entry;
3. evidence review and approval;
4. source/right-linked studio project preparation;
5. provenance asset recording;
6. edit version creation and approval;
7. render-manifest preparation.

Every mutation requires an explicit confirmation in the request. Passwords, MFA codes, OAuth tokens, cookies, API keys, private keys, provider secrets, and signed credential URLs must never be entered there.

## Release checklist still open

1. Apply and verify migration `20270419_exportunity_media_interview_studio.sql` in a non-production tenant, including foreign keys, tenant isolation, checks, unique idempotency/version constraints, immutable event triggers, and render-truth constraints.
2. Run cross-tenant denial tests for sessions, claims, projects, assets, versions, render jobs, source references, rights grants, contacts, territories, and media items.
3. Complete privacy, retention, minor/vulnerable-subject, biometrics, voice-cloning, AI-disclosure, and jurisdictional consent review before accepting real recordings.
4. Implement encrypted object storage, malware scanning, upload limits, deletion/takedown propagation, and data-subject request handling.
5. Select transcription and rendering providers only after security/data-processing review. Add separate adapters with request/response evidence, idempotency, cost caps, timeouts, cancellation, reconciliation, and action-time approval.
6. Build the public invite/scheduling/recording flow without automating passwords, MFA, or private account authentication.
7. Add approved, idempotent mappers for each requested downstream canonical output; never copy an unverified material claim into a public/product/sales field.
8. Retain controlled sandbox receipts before claiming transcription, rendering, upload, scheduling, or publication is live.
