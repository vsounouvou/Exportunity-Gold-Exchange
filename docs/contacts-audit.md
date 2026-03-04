# Contacts Audit (Forensics)

Generated: 2026-02-06

## Where contacts are stored today
- Legacy Wix import writes to `contacts` + `contact_tags` + `contact_sources` via `scripts/import-wix.js`.
- Public website contact form writes to `contact_messages` (marketing inbound form submissions), not CRM contacts.
- Existing admin CRM UI reads `/api/admin/leads` (`leads` + `lead_messages`), not `contacts`.

## Existing field/state reality
- `scripts/import-wix.js` ensures these legacy contact columns: `first_name`, `last_name`, `email`, `phone`, `phone_normalized`, `tags`, `notes`, `source_system`, `imported_from_wix`, `metadata`, etc.
- Some imports can fall back to `leads` only (lock-timeout fallback mode), which means rows may exist in `leads` but not `contacts`.

## Tenant scoping status
- Tenant context exists globally (`req.tenant`) and modern admin modules are tenant-aware.
- Legacy Wix import schema path is not safely tenant-scoped by default, so imported contacts can be unscoped (`tenant_id` missing/null).

## Why contacts were not visible
- Admin UI pages use `/api/admin/leads`; they do not query `contacts`.
- Imported Wix contacts therefore remained hidden from the visible CRM flows.
- In fallback imports, data may be in `leads` with Wix metadata while contact UI still expects contacts.

## What UI/API should fetch
- Canonical admin contacts list should query tenant-scoped `contacts` (with explicit `tenant_id` filter).
- Diagnostics must expose:
  - total contacts overall,
  - contacts per tenant,
  - contacts by source/import batch,
  - earliest/latest dates,
  - sample rows.
- A compatibility migration path is required to claim/import legacy unscoped rows and legacy Wix leads into tenant-scoped contacts.

## Root cause summary
- Split data model + split UI query path:
  - Import path: `contacts` (legacy) or fallback `leads`.
  - UI path: `leads` only.
- Missing first-class, tenant-safe Admin Contacts module caused the “imported weeks ago but not visible” symptom.
