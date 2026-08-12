# Knowledge and Claims Model

## Why sources and claims are separate

A file or email is evidence. It is not automatically an approved company fact. The Company Brain therefore stores immutable source versions and separately governed claims derived from them.

## Source lifecycle

1. Discover an item through upload, approved connector, internal record, or existing knowledge document.
2. Create or resolve `company_brain_sources` by tenant, connector, and provider identity.
3. Hash the content and create a new source version only when content changes.
4. Extract text and metadata.
5. classify confidentiality and business relevance.
6. scan for prompt-injection indicators and quarantine unsafe content.
7. redact or restrict sensitive spans.
8. queue facts for claim extraction and human review.

Source security states:

- `pending` - not yet evaluated;
- `clean` - no policy indicator found, still treated as untrusted data;
- `review_required` - sensitive, truncated, or suspicious;
- `quarantined` - instruction override, tool injection, credential exfiltration, or equivalent risk.

## Claim lifecycle

Recommended claim states:

- `proposed` - extracted or entered, not yet verified;
- `verified` - evidence reviewed for internal use;
- `approved_external` - approved wording may be published;
- `rejected` - unsupported or invalid;
- `superseded` - retained historically but replaced;
- `expired` - requires renewed review.

Conflict states:

- `clear` - no unresolved conflict;
- `possible` - potential mismatch needs review;
- `open` - confirmed contradiction;
- `resolved` - resolution and reviewer recorded.

## Evidence links

Each claim-to-source link records:

- exact source version;
- supports, refutes, or context-only relation;
- source locator such as page, cell range, slide, or message ID;
- excerpt where allowed;
- source strength;
- confidence.

The original source identity and content hash are retained in every model-facing citation.

## Conflict example

If one archive says Exportunity had approximately 700 trade points and another says more than 2,000 delivery points, both remain distinct claims. The review queue should determine whether they describe different dates, definitions, or networks. Until resolved, external output may use neither figure unless separately approved with precise wording.

## External publication rule

The public path is:

```text
source version -> claim -> evidence review -> conflict review -> external approval -> approved wording
```

External publication never uses raw extracted text. It uses only the approved wording on a claim with `approved_external` status and a clear conflict state.

## Relationship to existing knowledge

- Existing `knowledge_documents` remain document records and user-facing content.
- Existing `knowledge_sources` are not deleted.
- A migration or adapter may register existing documents as Company Brain sources.
- Existing `clues.evidence_ref` can point to canonical claim or source-version IDs.
- Action receipts remain execution evidence and may support operational claims.
- Contact sources and attachments remain the source of relationship provenance.

## Review UI requirements

The Company Brain review queue must support:

- source preview and version diff;
- security and classification status;
- extracted claims and structured values;
- evidence locators and source links;
- duplicate and conflicting claim detection;
- approve internal, approve external wording, reject, supersede, or request evidence;
- reviewer identity and timestamp;
- expiry/review date;
- full tenant-scoped audit trail.

## Retention

Source versions and approvals are append-oriented. Deletion requests should tombstone or remove content according to legal policy while retaining a minimal audit record where permitted. No connector sync may silently erase an approved claim or its prior evidence lineage.
