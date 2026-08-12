# Mobile CEO Cockpit

## Goal

The mobile cockpit lets an executive understand the company, give visible instructions, review evidence, and approve controlled work without exposing a desktop dashboard compressed onto a phone.

## Primary navigation

The compact mobile shell should prioritize:

1. Pulse
2. Ask Fenou
3. Approvals
4. Missions
5. Relationships
6. More

Fenou is the executive task assistant. Tassi/Awa remains the client-facing commercial guide where configured. Agent identities and roles must be explicit.

## Pulse

Show a concise priority stream:

- urgent approvals;
- sourcing and trade missions at risk;
- client/supplier replies needing action;
- unresolved Company Brain claims or conflicts;
- integration and agent failures;
- today's meetings and decisions;
- market and territory signals;
- completed work with evidence.

Each item opens the underlying real object, not a decorative card.

## Executive conversation

Reuse the existing visible Operations Center conversation and action systems. Voice and text share one thread. An executive request should resolve company, contact, territory, product, and project entities against the Company Brain, then ask only necessary clarifying questions.

Every proposed external or high-impact action shows:

- exact action;
- responsible agent;
- affected entities;
- source evidence and known uncertainty;
- expected outcome and risk;
- approval control;
- cancel/stop control;
- result receipt.

## Capture actions

### Business card

Reuse the existing business-card image capture endpoint and contact pipeline. After capture:

1. show extracted fields;
2. show possible duplicate contacts;
3. let the user confirm or merge;
4. retain the card as contact evidence;
5. suggest, but do not automatically send, a follow-up.

### Voice note

Voice notes attach to the current visible conversation or entity. The system transcribes, identifies decisions/tasks/relationships/claims, and presents proposed records for confirmation.

### Document/photo

The capture joins the current conversation as evidence, displays extraction/security state, and routes to the relevant specialist. It never silently becomes an approved company claim.

## Responsive behavior

- one primary pane at a time;
- stable pinned composer;
- no overlapping Chairman Assistant/Fenou dock;
- assistant dock can minimize and move without covering content;
- horizontal chips scroll without clipping;
- sheets have a visible close/back control;
- 44px minimum touch targets;
- readable light mode default and full dark-mode parity;
- offline/reconnect state is explicit;
- active runs and stop controls remain visible.

## Security

- short-lived authenticated sessions and device-aware revocation;
- no connector secret display;
- biometric/PIN reauthentication for approvals where supported;
- sensitive previews hidden from app switcher where feasible;
- no external action from a lock-screen notification;
- full audit identity for every approval.

## Acceptance profiles

Test as founder/CEO, technical director, commercial lead, sourcing manager, territory manager, finance reviewer, compliance reviewer, relationship owner, field capture user, and read-only observer across narrow phone, large phone, tablet portrait, and tablet landscape.
