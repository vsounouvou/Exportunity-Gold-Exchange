import { db } from "@db";
import { knowledgeDocuments, knowledgeSpaces } from "@db/schema";
import { and, eq, sql } from "drizzle-orm";

type SeedDoc = {
  title: string;
  tags: string[];
  content: string;
};

const SPACE_NAME = "Company Brain — Bourse de l’Or";
const PRIMARY_SPACE_NAME = "Company Brain — Bourse de l'Or";
const SEED_VERSION = 2;

const DOCS: SeedDoc[] = [
  {
    title: "BDO — Identity & Positioning (Merchant-of-Record)",
    tags: ["bdo", "identity", "policy"],
    content: `Core truth:
- Bourse de l’Or is NOT a matching / "mise en relation" platform.
- Bourse de l’Or is the sole counterparty (merchant-of-record): customers buy from Bourse de l’Or; suppliers sell to Bourse de l’Or.

Do not describe the platform as connecting buyers and sellers.`,
  },
  {
    title: "BDO — Wallet-Centric Commerce",
    tags: ["bdo", "wallet", "settlement"],
    content: `All settlement happens via the Bourse de l’Or wallet ledger:
- Deposits (bank transfer, cards, other rails)
- Internal transfers (including escrow/holds)
- All trades settle on-platform (no off-platform payment for core flows)`,
  },
  {
    title: "BDO — Gold Units (Standardized)",
    tags: ["bdo", "gold", "units"],
    content: `Gold ownership is measured in grams (not money).
Customers buy standardized units (no free-form "any grams" purchase):
- 10g, 20g, 50g, 100g (larger sizes require higher KYC tier)
Caps must apply per transaction and per time window.`,
  },
  {
    title: "BDO — Proof-of-Acquisition & Allocation",
    tags: ["bdo", "acquisition", "audit"],
    content: `Every purchase must create an immutable acquisition record:
- timestamp, unit size in grams, purity
- price-per-gram snapshot used at purchase time
- total paid and pricing method id
- allocation to inventory lot(s) + custody data
- proof documents (attachments)`,
  },
  {
    title: "BDO — Virtual Vault & Delivery",
    tags: ["bdo", "vault", "delivery"],
    content: `Each customer has a Virtual Gold Vault:
- holdings shown in grams, broken down by units
- each unit has status: stored / delivered / listed-for-resale / sold / locked-until-date
- delivery can be immediate at purchase or requested later`,
  },
  {
    title: "BDO — Deferred Delivery (Lock-up)",
    tags: ["bdo", "lockup", "delivery"],
    content: `Customers can opt into "do not deliver before DATE":
- blocks delivery requests before end date
- can optionally enable eligibility for resale listing (only with explicit owner authorization)`,
  },
  {
    title: "BDO — Secondary Market (Confirmed Clients Only)",
    tags: ["bdo", "secondary-market", "resale"],
    content: `Secondary market is controlled:
- Only Confirmed Clients can access listings
- Listings can be BDO inventory lots OR customer vault units with explicit ResaleAuthorization
- Settlement via wallet: buyer debited, seller credited net of commission, BDO commission captured
- Ownership transfers to buyer vault; buyer chooses delivery now or store`,
  },
  {
    title: "BDO — Operational Workflows (High Level)",
    tags: ["bdo", "workflows", "ops"],
    content: `Supplier → BDO:
1) Supplier submits offer + docs
2) Review/verification
3) BDO purchases via wallet settlement
4) Create/verify inventory lot(s)

Customer buys:
1) KYC tier
2) Fund wallet
3) Buy unit (10/20/50/100g)
4) Create acquisition record + allocate lot(s) + create vault unit
5) Delivery now or store (optionally locked)`,
  },
  {
    title: "BDO — Compliance & Forbidden Language",
    tags: ["bdo", "compliance", "wording"],
    content: `Forbidden (must never appear in UI/agents):
- "mise en relation"
- "we connect buyers and sellers"
- "buyer pays the seller"
- "matching platform"
- "interest rate", "guaranteed return", "savings product", "deposit account"
- any claim that user gold is lent/used without explicit authorization

Required wording (when relevant):
- "You buy from Bourse de l’Or."
- "Suppliers sell to Bourse de l’Or."
- "Holdings are measured in grams."
- "Your gold is stored in your virtual vault."
- "Resale requires your explicit authorization."
- "Bourse de l’Or earns a commission on resale."`,
  },
  {
    title: "BDO — Internal Agent Roles (Short Prompts)",
    tags: ["bdo", "agents", "prompts"],
    content: `Onboarding Agent:
- Classify user as Customer vs Supplier; drive KYC tier; never mention matching.

Wallet & Settlement Agent:
- All payments via wallet; explain deposits/transfers; gold holdings in grams.

Vault & Delivery Agent:
- Explain store vs delivery; enforce lock-up; handle delivery requests.

Procurement Agent:
- Manage supplier offers → purchases → inventory lots and verification tasks.

Secondary Market Agent:
- Enforce confirmed-client gating; require resale authorization; calculate commission and settle.

Compliance Agent:
- Blocks forbidden language; ensures required records exist before delivery/resale.`,
  },
  {
    title: "BDO — Master Spec (Wallet + Vault + Resale)",
    tags: ["bdo", "spec", "wallet", "vault", "resale", "compliance"],
    content: `Source-of-truth (must be enforced everywhere):
- Bourse de l'Or is NOT a matching / "mise en relation" platform (no buyer-seller deal rooms).
- Bourse de l'Or is the sole counterparty (merchant-of-record): customers buy from Bourse de l'Or; suppliers sell to Bourse de l'Or.
- All settlement happens via the Bourse de l'Or wallet ledger (no off-platform payments for core flows).
- Gold ownership is measured in grams (not money).
- Every purchase creates an immutable proof-of-acquisition record (timestamp, price-per-gram snapshot used at purchase time, unit size in grams, purity, custody data, proof attachments).
- Each user has a Virtual Gold Vault; delivery can be immediate or requested later.
- Optional deferred delivery: "Do not deliver before DATE" (lock-up) blocks delivery until end date.
- Secondary resale is controlled: confirmed clients only; resale requires explicit owner authorization; Bourse de l'Or earns a commission; wallet settlement debits buyer, credits seller net of commission, captures commission, then transfers ownership into buyer vault.

Compliance hard rules:
- Forbidden wording in UI/agents: "mise en relation", "matching platform", "we connect buyers and sellers", "buyer pays the seller", any "interest rate"/"guaranteed return"/"savings product"/"deposit account" language, and any claim that user gold is used without explicit authorization.
- Required wording (when relevant): "You buy from Bourse de l'Or.", "Suppliers sell to Bourse de l'Or.", "Holdings are measured in grams.", "Your gold is stored in your virtual vault.", "Resale requires your explicit authorization.", "Bourse de l'Or earns a commission on resale."`,
  },
  {
    title: "BDO — Ingot Identity & Bar Passport (Digital Twin)",
    tags: ["bdo", "vault", "identity", "audit", "custody"],
    content: `Goal: each physical bar has a durable identity + a digital twin ("Bar Passport") that supports custody, delivery, disputes, and resale.

Physical identity layers (recommended combo):
- Laser-engraved serial (human-readable), e.g. BDO-CI-2026-000001
- Data Matrix on the bar (more reliable than QR on metal)
- Tamper-evident sealed packaging with NFC + hologram label
- Optional vault-only RFID (bulk inventory scanning)

Bar Passport (digital record) should include:
- Bar ID (serial + checksum), weight (grams), purity, refiner/assayer (if applicable)
- Custody timeline (created, received, verified, stored, moved, redeemed/resold)
- Verification artifacts (photos, weigh/assay video, scale ticket reference, assay certificate reference)
- Risk flags (holds, disputes, compliance checks)
- Owner relationship: user owns title; Bourse de l'Or is custodian

Anti-duplication (cryptographic layer):
- Encode in QR/DataMatrix: bar_id + signature
- signature = Sign(private_key, bar_id + issuance_timestamp)
- App verifies signature via public key (fake codes fail verification)

Proof-of-reserve style audits (optional, trust booster):
- Vault performs periodic signed inventory snapshots ("Audit #12")
- Users can see their Bar ID included in an audit snapshot.`,
  },
  {
    title: "BDO — Autonomous Operations (Compliance + Growth Engines)",
    tags: ["bdo", "autonomy", "operations", "marketing", "events", "governance"],
    content: `Company "GO" switch triggers time-boxed, budgeted engines (script-first):
1) Compliance & Risk Engine
2) Client Hunter Engine
3) Sales/Partnership Engine
4) Marketing & Content Engine
5) Event Engine

Governance rules:
- Scripts execute operations; LLMs only interpret, summarize, and draft.
- Budgets, run limits, and approvals gates are mandatory (publisher can publish only after compliance + brand review pass).
- All actions are logged to an audit trail with artifacts (drafts, posts, event pages, outreach lists).

Client Hunter pipeline (low-cost, script-first):
- Build target lists -> enrich -> score -> templated outreach drafts (LLM only for tone/localization) -> schedule follow-ups -> handoff.

Marketing + Social Vault (credentials storage):
- Store tokens/permissions for Meta/IG/TikTok/YouTube/X/LinkedIn/blog/email/ad accounts.
- Split rights: creators draft; publisher schedules; treasury controls spend caps; auditor logs.

Event engine:
- Propose -> review -> landing page -> reminders -> host (AI can run structured parts) -> post-event lead extraction + content repurposing.`,
  },
  {
    title: "BDO — Survival & Legacy (Roadmap Modules)",
    tags: ["bdo", "vault", "legacy", "safety", "roadmap"],
    content: `Survival layer (protect + access):
- Emergency access protocol: trusted contacts can trigger a recovery case (not direct access).
- Recovery modes: freeze everything; emergency cash-out (higher verification).
- Safety modes: safe mode (time delays), travel mode (stricter checks), family mode, business mode.
- Minimum reserve rule: lock a portion of grams as untouchable reserve.

Expansion layer (share + transform + transmit):
- Gifts: instant grams, scheduled gifts, milestone gifts, conditional release after recipient KYC.
- Inheritance/beneficiaries: Legacy Plan with dead-man's-switch check-ins, executor workflow, dispute-safe delays.
- Transformation: melt-to-jewelry orders with custody transfer events and a jewelry certificate.
- Family vaults + community circles: permissioned sub-vaults, quorum rules, transparent circle vaults.
- Vault goals (safer wording than "investments"): house deposit, school fund, business reserve, legacy targets in grams.`,
  },
];

export async function ensureBourseDeLorKnowledgeBase(companyId: number) {
  const now = new Date();

  let space = await db.query.knowledgeSpaces.findFirst({
    where: and(
      eq(knowledgeSpaces.companyId, companyId),
      sql`${knowledgeSpaces.name} IN (${PRIMARY_SPACE_NAME}, ${SPACE_NAME})`,
    ),
  });

  if (!space) {
    const [created] = await db
      .insert(knowledgeSpaces)
      .values({
        companyId,
        name: PRIMARY_SPACE_NAME,
        description: "Canonical policies, schemas, and workflows for Bourse de l'Or.",
        color: "amber",
        icon: "brain",
        metadata: { kind: "bdo_company_brain" },
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    space = created;
  }

  // Normalize name to ASCII apostrophe for consistency (idempotent).
  if (space.name !== PRIMARY_SPACE_NAME && (space.metadata as any)?.kind === "bdo_company_brain") {
    const [updated] = await db
      .update(knowledgeSpaces)
      .set({ name: PRIMARY_SPACE_NAME, updatedAt: now })
      .where(eq(knowledgeSpaces.id, space.id))
      .returning();
    space = updated ?? space;
  }

  for (const doc of DOCS) {
    const existing = await db.query.knowledgeDocuments.findFirst({
      where: and(
        eq(knowledgeDocuments.companyId, companyId),
        eq(knowledgeDocuments.spaceId, space.id),
        eq(knowledgeDocuments.title, doc.title),
      ),
    });

    if (!existing) {
      await db.insert(knowledgeDocuments).values({
        companyId,
        spaceId: space.id,
        title: doc.title,
        type: "note",
        content: doc.content,
        tags: doc.tags,
        createdByType: "agent",
        preview: doc.content.slice(0, 200),
        metadata: { seeded: true, namespace: "bdo", seedVersion: SEED_VERSION },
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    const meta = (existing.metadata ?? {}) as Record<string, any>;
    const existingSeedVersion = Number(meta.seedVersion ?? 0);
    const seeded = meta.seeded === true && meta.namespace === "bdo";

    if (seeded && existingSeedVersion < SEED_VERSION) {
      await db
        .update(knowledgeDocuments)
        .set({
          content: doc.content,
          tags: doc.tags,
          preview: doc.content.slice(0, 200),
          metadata: { ...meta, seeded: true, namespace: "bdo", seedVersion: SEED_VERSION },
          updatedAt: now,
        })
        .where(eq(knowledgeDocuments.id, existing.id));
    }
  }

  // Touch space updatedAt for visibility in UI.
  await db
    .update(knowledgeSpaces)
    .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(knowledgeSpaces.id, space.id));

  return { spaceId: space.id, documentsSeeded: DOCS.length };
}
