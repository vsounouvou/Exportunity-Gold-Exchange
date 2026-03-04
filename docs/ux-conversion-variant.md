# Conversion-Focused UX Variant (Mobile)

This defines a **conversion-oriented** UX variant for Bourse de l’Or while preserving the premium, trust-first baseline.

## Principles (Do Not Break)

- Never block browsing with forced auth.
- Always offer a clean escape route (Back / Close / Continue browsing).
- Conversion prompts must be **dismissible** and **non-sticky** unless explicitly enabled for an experiment.

## Variant Goals

- Increase: add-to-cart rate, completed checkout rate, account creation.
- Reduce: bounce, confusion, “I feel trapped” moments.

## Recommended Changes (Variant Only)

### 1) Soft Identity Prompt

When user is a guest and performs a high-intent action (adds to cart, starts checkout, opens wallet/vault):

- Show a bottom sheet:
  - Title: “Secure your trade”
  - Value: “Track orders, wallet, vault and contracts”
  - CTAs:
    - Primary: “Create account”
    - Secondary: “Continue as guest”

### 2) Checkout Confidence Cues

- Add lightweight trust microcopy near the “Place order” step:
  - “Contracts & receipts generated automatically”
  - “Secure delivery available”

### 3) Orders/Receipts Discovery

- After checkout success:
  - Primary CTA: “View Orders”
  - Secondary CTA: “Continue browsing”

## Metrics To Track

- `browse → product_open` conversion
- `product_open → add_to_cart`
- `add_to_cart → checkout_start`
- `checkout_start → order_success`
- `guest → signup_start`
- `signup_start → signup_complete`

## Rollout / Toggle Strategy

- Enable via a feature flag (query param or localStorage).
- Default remains **premium/trust-first**.

