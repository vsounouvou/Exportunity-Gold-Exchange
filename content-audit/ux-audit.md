# UX Audit

## Findings before this pass

- The marketing home page was a gateway and live module launcher, not a public company vitrine.
- Header IA did not match the master task; it used Platform, Solutions, Journey.
- Visible CTA language included "Talk to us", which the master task asked to remove from public CTA labels.
- Real government/event imagery was being used as a general hero candidate, which risks implying current institutional relationships.
- Footer was too thin for a company site with many activities and platforms.

## Changes applied in this pass

- Rebuilt the public home page around company positioning, proof strip, activities, public record, platform cards, and Work With Exportunity CTA.
- Added required public route aliases for company, what-we-do, platforms, gold-mining, government-institutions, archive, operating-stack, work-with-us, and contact.
- Updated shell navigation and footer to match the required IA.
- Replaced main hero with generated abstract operating-stack imagery, avoiding fake documentary proof.
- Added distinct generated visuals for gold/mining, machinery, institutional advisory, payments/wallet, and archive sections.
- Moved vitrine page content into a typed content model with source-status fields for claims, cards, timeline entries, and images.
- Added a source registry and compact source chips so public vitrine claims can point to owner, project, legacy, and third-party evidence.
- Reserved real historic images for archive/proof contexts with cautious captions.

## Remaining UX work

- Full mobile/browser visual QA still required.
- Legacy pages such as `/journey`, `/solutions`, `/media`, and `/platform/*` still need the same institutional redesign.
- CMS/admin editability still needs a database/admin UI pass; the page data is now centralized and ready for that migration.
- Full image scoring for the complete asset library remains incomplete.
