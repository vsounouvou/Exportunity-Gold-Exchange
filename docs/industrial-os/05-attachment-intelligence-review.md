# Governed Attachment Intelligence Review

**Migration:** `20270412_exportunity_industrial_attachment_reviews.sql`
**Status:** Implemented in source; database migration, provider configuration, and a deployed acceptance test remain open.

## Outcome

An industrial image, scanned document, or CAD file can now produce an editable evidence proposal without silently becoming a product specification.

The canonical sequence is:

`PRIVATE ATTACHMENT -> CANDIDATE -> HUMAN REVIEW -> APPROVAL -> SELECTED-FIELD APPLY`

Every state is persisted. Applying fields is a separate administrator action and records the prior and next values.

## Evidence Paths

| Evidence | Candidate path | Boundary |
| --- | --- | --- |
| JPEG, PNG, WebP | A deliberate foreground OpenAI Responses request can propose an object, category, visible brand/model/text, specifications with evidence, clarification questions, limitations, and internal search terms. | Global AI consent, a dedicated feature flag, a configured key, administrator access, and explicit per-image confirmation are all required. |
| Scanned PDF | Human OCR review can enter and approve the same bounded proposal. | No scanned-PDF provider call is claimed in this slice. |
| DXF, DWG, STEP/STP, STL, IGES/IGS | Accountable technical review can record the proposal. | CAD is never sent through generic image vision. A compatible engineering viewer and qualified reviewer remain operational requirements. |
| Extractable text/office files | Existing deterministic extraction remains visible beside the review form. | Extracted text is evidence, not a structured claim or permission to overwrite a requirement. |

## State Machine

The persisted review states are:

`pending_analysis -> analysis_ready | analysis_failed`

`analysis_ready | analysis_failed | rejected | approved -> under_review`

`under_review -> approved | rejected`

`approved -> applied`

`applied` is immutable. An analysis result cannot transition directly to `approved` or `applied`.

The service takes a PostgreSQL advisory transaction lock per tenant and attachment before state-changing operations. The review-event table and industrial audit log preserve each decision.

## Apply Boundary

Only these reviewed fields are eligible:

- `productName`
- `productCategory`
- `specification`

The reviewer selects each field. Null fields are ignored. The product-requirement record must already exist in the same tenant and case. Quantity, price, currency, supplier identity, certification, compatibility, inventory, outreach, quote, order, payment, and publication are never created from attachment interpretation.

## Provider Request Policy

Image interpretation is off by default:

```text
AI_ENABLED=false
FEATURE_EXPORTUNITY_ATTACHMENT_VISION=false
OPENAI_API_KEY=
OPENAI_INDUSTRIAL_ATTACHMENT_MODEL=
```

When enabled, the request uses one base64 `input_image` in the Responses API and strict JSON-schema output. The prompt treats visible text as untrusted evidence, requires uncertainty and visible evidence, and prohibits claims about authenticity, certification, price, availability, or unseen measurements.

There is no scheduler, retry loop, upload-triggered analysis, or background conversation. A failed provider request becomes `analysis_failed`; no case field changes.

## Release Verification

1. Apply migration `20270412` after the preceding industrial migrations and verify both tables, the tenant/attachment uniqueness constraint, foreign keys, indexes, and enums.
2. Keep the feature flag off while testing manual image, scanned-document, and CAD reviews.
3. In a non-production tenant, enable the feature and perform one explicit test with a non-sensitive image whose expected visible markings are known.
4. Verify that the model proposal remains in `analysis_ready`, the product requirement is unchanged, and the provider/model/prompt version is visible.
5. Edit the proposal against the original evidence, save the human review, and test both rejection and approval paths.
6. Apply one selected field, then verify prior/next values in `industrial_audit_logs` and that the review is immutable.
7. Attempt direct analysis-to-apply, cross-tenant access, CAD analysis, missing confirmation, disabled feature, missing key, empty apply fields, and replay after `applied`; each must fail closed.
8. Retain the feature flag off if data-residency, model access, cost limits, retention, or acceptable-use review is incomplete.

No production attachment, API call, database migration, or provider setting was activated while implementing this source slice.
