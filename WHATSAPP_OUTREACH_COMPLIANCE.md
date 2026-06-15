# WhatsApp Outreach Compliance

## Default Policy

PME outreach is controlled, test-first, and approval-gated. Agents may draft outreach, but they must not send bulk messages without admin approval.

## Required Controls

- Human approval required for first production version.
- Default campaign status is `test` or `draft`.
- First test campaign is limited to 10 leads in the UI.
- Backend caps test campaign inputs at 20 leads.
- No duplicate outreach within 30 days.
- No night-time outreach.
- Opt-out keywords: `STOP`, `NON`, `ARRET`, `ARRÊT`, `DESINSCRIPTION`.
- Every drafted, sent, failed, delivered, and replied message must be logged.
- Public listing source must be visible when a contact is used.

## Approved Template Registry

- `pme_intro_fr`
- `pme_intro_en`
- `maison_terre_supplier_fr`
- `exportunity_seller_onboarding_fr`
- `pme_exchange_interest_fr`

## First Contact Template

Bonjour {{business_name}}, je suis l'assistant Exportunity. Nous aidons les PME locales a etre visibles en ligne, recevoir des clients et preparer des opportunites commerciales verifiees. Est-ce que vous etes la bonne personne pour echanger sur votre activite ? Repondez OUI pour continuer ou STOP pour ne plus recevoir de message.

## Current Implementation

- Admin lead selection creates a test campaign.
- Messages are inserted as `approval_required` drafts.
- No Twilio send is executed by PME campaign creation.
- The audit page shows drafted outreach records.
- Twilio configuration remains visible through the existing Twilio control center.

## Before Enabling Sending

1. Confirm WhatsApp sender verification.
2. Confirm approved Meta/Twilio templates.
3. Confirm opt-out suppression storage.
4. Confirm duplicate-contact suppression.
5. Confirm admin approval action with message preview/edit.
6. Confirm inbound reply linkage to PME conversation records.
