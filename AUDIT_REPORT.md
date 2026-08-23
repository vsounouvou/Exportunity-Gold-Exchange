# Exportunity Production Audit

Date: 2026-08-15

## Product Boundary

Exportunity is now implemented as an industrial trade operating system for factories, exporters, suppliers, logistics partners, and industrial buyers. The public experience is industrial and global. Retail marketplace and public investment-exchange concepts are not the active product direction.

The operating model is:

1. Capture a real industrial need.
2. Qualify the technical and commercial requirement through Awa Kouadio, Commercial Director.
3. Route specialist work to governed agents.
4. Source, quote, review, approve, order, pay, deliver, and retain evidence.
5. Expand the workforce only when governed demand signals justify a role.

## Architecture Verified

- Public industrial routes use the dedicated Exportunity industrial shell and persistent assistant, not the retired retail shell.
- The factory and map journeys expose documented industrial zones, factories, products, spare parts, export products, and technical-request entry points.
- Awa Kouadio is the public commercial closer. Specialist agents hand reviewed work back to the Commercial Director instead of independently closing customer deals.
- The Operations Center reuses persistent meetings, conversations, attachments, decisions, objectives, tasks, actions, and agent membership.
- Agent profiles expose identity and face editing, memory, permissions, skills, runtime model, tools, temperature, test execution, and direct chat.
- The Company Brain has governed evidence sources, context packs, founder charter, security rules, relationship reconstruction, and Google Workspace ingestion services.
- Demand-driven staffing uses a catalog of 126 governed role seats across 14 departments. Seats remain available until demand and governance justify provisioning.
- The configured OpenAI account exposes the selected `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` Responses API models.
- Tenant-aware Flutterwave v4 checkout is configured. The unrelated legacy v3 orchestrator is now reported as unavailable instead of appearing ready and failing later.

## Production Data Snapshot

The Exportunity tenant was audited after guarded removal of synthetic QA records:

- 12 active visible agents.
- 126 current governed role seats: 12 provisioned and 114 available.
- 14 persisted meetings, each linked to a conversation.
- 92 tenant messages across 10 conversations, including 35 agent messages.
- 9 retained tasks, 8 awaiting approval.
- 8 retained company goals covering demand, supplier network, spare parts, scan-to-manufacture, commercial pipeline, execution review, intake, and one user meeting.
- 4 retained Company Brain context packs.
- No identified synthetic QA meetings, tasks, actions, chat rooms, requirements, or contacts remain.

The cleanup was executed with `scripts/ops/cleanup-exportunity-production-qa.cjs`, which defaults to dry-run, validates tenant/company/record identifiers, uses a transaction and advisory lock, and does not touch other tenants.

## Production Configuration Audit

### Ready

- AI is enabled and the OpenAI credential is present.
- Company Brain and context-pack features are enabled.
- Google Workspace connector code and read feature flags are enabled.
- Twilio account, token, and WhatsApp sender configuration are present.
- Tenant-aware Flutterwave v4 client, encryption, and webhook configuration is present.
- External communications are disabled globally.
- The approved Exportunity AI logo pack is integrated into tenant identity assets.

### Setup Required

- Google Workspace OAuth client ID, client secret, and redirect URI are absent, so no Workspace connector can be activated yet.
- Google Maps has a browser key but no production Map ID.
- Google Places has no server key and import is not enabled.
- Exportunity-specific KKiaPay credentials are absent.
- No authenticated end-to-end browser credentials are available for a fresh Operations Center release smoke test.

## Defects Corrected In This Release

- `exportunity.net` was incorrectly classified as a noindex staging host in both HTTP headers and `robots.txt`. Only clone hosts are now noindex.
- The root SEO resolver previously canonicalized the live Exportunity root to the Zone tenant. The live root now resolves to Exportunity with `/` as canonical.
- Unknown `/api/*` paths previously fell through to the SPA with HTTP 200. They now return non-cacheable JSON 404 responses.
- Missing `/public/audio` caused recurring cleanup errors. A missing audio directory is now treated as an empty state.
- The legacy Flutterwave adapter reported missing keys despite valid tenant-aware v4 configuration. It now reports its actual legacy-only state, and legacy endpoints remain disabled unless that adapter is configured.

## Current Release Files

- `server/index.ts`
- `server/routes.ts`
- `server/routes/public.ts`
- `server/lib/audioCleanup.ts`
- `server/lib/http/unknownApiHandler.ts`
- `server/lib/payment/providers/FlutterwaveProvider.ts`
- `server/lib/seo/hostIndexingPolicy.ts`
- `server/lib/seo/runtimeSeo.ts`
- `scripts/site/public-surface-quality-gate.mjs`
- `scripts/ops/cleanup-exportunity-production-qa.cjs`
- `tests/audio-cleanup.test.ts`
- `tests/exportunity-root-seo.test.ts`
- `tests/host-indexing-policy.test.ts`
- `tests/unknown-api-handler.test.ts`
- Production audit and deployment documents.

## Verification Evidence

- All 149 focused assertions passed across the industrial, Operations Center, Company Brain, workforce, agent, attachment, catalog, payment, SEO, host-policy, API-boundary, and audio-cleanup suites. The two database-importing catalog assertions were run with an inert local-only test URL and did not connect to production.
- `npm run check` passed route and TypeScript validation.
- `npm run build` passed, including the repository's browser-based marketing quality gate. The gate now runs in an isolated database-free startup mode and terminates its preview server after the audit.
- Public route and database smoke checks were completed without modifying real customer records.
- The in-app browser automation runtime is currently unavailable on this workstation. Visual browser acceptance remains an explicit release gap and was not replaced with an unapproved hidden browser process.

## Remaining Risks

- A real authenticated Operations Center release smoke still requires a supplied non-production admin session or test credential.
- A live Flutterwave charge was not created during audit; doing so would create a real financial transaction.
- Google business discovery remains on curated/OSM fallback until Map ID and server Places credentials are configured.
- Google Workspace evidence sync cannot run until OAuth credentials and an approved account connection exist.
- External email, WhatsApp, voice, LinkedIn, or social outreach remains disabled. No outbound campaign should run without explicit approval, consent/template controls, quiet hours, suppression, and audit logging.
