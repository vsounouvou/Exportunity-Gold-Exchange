# Relationship Graph

## Purpose

The relationship graph connects people, companies, factories, suppliers, institutions, markets, opportunities, projects, transactions, communications, evidence, and responsible agents. It extends current contacts and commercial records. It is not a second contact database.

## Canonical entities

- tenant and company;
- contact and contact identity;
- organization, supplier, client, prospect, factory, institution, carrier, and partner;
- territory, country, industrial zone, port, and market;
- industry, product, capability, requirement, sourcing mission, RFQ, quote, order, contract, shipment, and payment;
- conversation, message, meeting, task, decision, action, and approval;
- Company Brain source, source version, claim, and evidence;
- agent role seat, assigned agent, and human owner.

## Relationship records

Each relationship edge should record:

- tenant and optional company;
- source entity and target entity;
- relation type and direction;
- relationship stage and strength;
- relationship owner and supporting agents;
- source/provenance references;
- first and last interaction;
- next action and due date;
- consent, DNC, confidentiality, and visibility;
- confidence and verification state;
- created, updated, and review timestamps.

## Examples

```text
Contact -> works_at -> Supplier
Supplier -> supplies -> Product category
Factory -> located_in -> Industrial zone
Client -> requested -> Requirement
Sourcing mission -> considers -> Supplier
Conversation -> concerns -> Opportunity
Claim -> supported_by -> Source version
Agent seat -> owns -> Relationship
Human user -> approved -> Outbound message
```

## Contact integration

The existing contact is the canonical person record. Gmail, Google Contacts, business cards, imports, forms, and manual creation add identities, sources, attachments, and merge candidates around that record.

Never overwrite:

- opt-out or do-not-contact state;
- verified primary identity;
- relationship owner;
- internal notes;
- tenant visibility;
- human-approved qualification.

## Relationship intelligence

Agents may surface:

- who knows a company or contact;
- where the relationship originated;
- the latest verified interaction;
- open requests, commitments, and unresolved questions;
- relevant source-backed company history;
- the responsible owner and recommended next action.

Agents must not infer a partnership, endorsement, contract, or active customer relationship solely from a name appearing in an email or document.

## Deduplication

Deduplication uses normalized email, E.164 phone, provider resource ID, website/domain, legal registration ID where available, and reviewed fuzzy matches. Fuzzy matches create merge suggestions rather than automatic destructive merges.

## Access

Graph queries are tenant-scoped and permission-filtered. Confidential relationships and evidence are not exposed to public or unrelated role contexts. Every relationship mutation is audited.
