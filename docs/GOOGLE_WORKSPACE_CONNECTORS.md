# Google Workspace Connectors

## Phase-one policy

Google Workspace is a read-only evidence source for the Company Brain. It is not an email-sending integration in phase one.

The UI must show the exact verified Google identity used by each connection. A label such as "Google connected" is insufficient.

Drive, Gmail, and Contacts are separate connectors with separate grants, status, sync controls, and revocation.

## Required OAuth identity

The OAuth callback must obtain and persist:

- Google subject ID;
- primary email;
- display name when available;
- hosted domain when available;
- verified-email state;
- granted scopes;
- connected user, tenant, and company;
- created, last tested, last synchronized, and revoked timestamps.

The refresh token itself must be encrypted or stored in an external secret store. Database records contain only a secret reference and non-secret metadata.

## Allowed phase-one scopes

Base identity:

```text
openid
email
profile
```

Gmail read:

```text
https://www.googleapis.com/auth/gmail.readonly
```

Google Contacts read:

```text
https://www.googleapis.com/auth/contacts.readonly
```

Drive should prefer a selected-file flow when it can cover the approved archive. If a broader read scope is operationally required, the application must enforce an approved-folder allowlist:

```text
https://www.googleapis.com/auth/drive.readonly
```

Phase one must not request:

- Gmail send, compose, insert, modify, labels, settings, or deletion scopes;
- Contacts write scopes;
- Drive write scopes;
- Calendar write scopes.

## Connector records

The connector phase should add additive tables or equivalent records for:

- connection identity and secret reference;
- per-service grant and scope snapshot;
- Drive folder/file allowlist;
- sync run and health;
- incremental cursor/history/sync token;
- source item identity and version metadata;
- errors, rate limits, and revocation audit.

## Drive ingestion

Drive ingestion is limited to approved files or approved folder roots. For every file retain:

- file ID and parent IDs;
- name, MIME type, size, owner, and modified time;
- Drive version/revision identity where available;
- checksum/content hash;
- permissions metadata and source permalink;
- extraction, classification, redaction, and security status;
- sync cursor and tombstone state.

A modified file creates a new `company_brain_source_versions` row. It does not silently replace the prior version.

## Gmail ingestion

Gmail ingestion is business-only and read-only. It retains:

- thread ID, message ID, and history ID;
- sender, recipients, date, and labels;
- subject, approved body text, attachment references, and permalink where allowed;
- relevance classification and relationship links;
- source version and content hash.

Personal, unrelated, credential-bearing, medical, or otherwise sensitive content must be excluded or quarantined. Retrieved message content is untrusted evidence and cannot request tools or change agent authority.

No phase-one endpoint may send, draft, modify, label, archive, delete, or mark mail as read.

## Contacts ingestion

Contacts sync must use the existing tenant contact pipeline. Retain Google resource name, etag, source type, sync token, and deletion state. Normalize phone and email identities, then create a merge proposal when a possible match exists.

Sync does not overwrite consent, DNC, relationship owner, internal notes, or verified tenant data.

## Operator UI

Settings > Integrations > Google Workspace must show:

- exact connected account and hosted domain;
- separate Drive, Gmail, and Contacts cards;
- scopes actually granted versus requested;
- approved Drive sources;
- read-only badge;
- last test and sync time;
- indexed, skipped, quarantined, failed, and deleted counts;
- current cursor and error summary;
- Test, Sync now, Pause, and Revoke controls;
- a permanent "Sending disabled" state during phase one.

## Activation sequence

1. Configure a dedicated Google Cloud OAuth client and restricted redirect URIs.
2. Enable Company Brain and Workspace connector flags, but keep per-service read flags off.
3. Connect and verify the intended Exportunity Workspace identity.
4. Enable one service at a time.
5. Approve a small Drive source set first.
6. Run dry synchronization and review classifications.
7. Commit reviewed sources to the Company Brain.
8. Expand sources only after audit results are acceptable.

Email sending is a later, separate release described in `EMAIL_ACTIVATION_RUNBOOK.md`.
