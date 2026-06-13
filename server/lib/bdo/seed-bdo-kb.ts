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
const SEED_VERSION = 3;

const DOCS: SeedDoc[] = [
  {
    title: "BDO - Identity & Compliance Positioning",
    tags: ["bdo", "identity", "policy", "compliance"],
    content: `Official brand: BOURSE DE L'OR. Tagline: Valeur - Confiance - Perennite.

Core positioning:
- Global brokerage platform for certified physical gold, verified gold jewelry, secure delivery, resale requests, and future gold-equipment brokerage.
- Core promise: Buy certified physical gold. Choose secure delivery. Keep full ownership.

Non-negotiable wording:
- The product is physical gold or verified jewelry.
- BOURSE DE L'OR is not a bank, wallet, stored-value account, money-transfer service, FX service, crypto platform, securities issuer, derivatives venue, or financial exchange.
- Sensitive decisions require human escalation.`,
  },
  {
    title: "BDO - Purchase Objective Flow",
    tags: ["bdo", "purchase-objective", "order", "checkout"],
    content: `Purchase Objective flow:
1. User selects a target product.
2. UI says: "Build your purchase budget. Your gold is not purchased until you confirm an order."
3. User can add funds toward a purchase budget.
4. User can cancel before order execution, subject to payment processor and refund rules.
5. User clicks "Order Now".
6. Price is refreshed and shown with a quote validity window.
7. User confirms.
8. Supplier or inventory allocation starts.

Use approved terms: Purchase Objective, Build your purchase budget, Order when ready, Market-linked price + platform spread.`,
  },
  {
    title: "BDO - Pricing Display Rules",
    tags: ["bdo", "pricing", "spread", "checkout"],
    content: `Every product page must split pricing into:
1. Physical product market-linked price
2. Platform spread, default 2% for bullion
3. Payment processing fee, if applicable
4. Delivery / courier / insurance
5. Customs / duties / taxes, if applicable
6. Custody or storage fees, if selected
7. Total payable

Never hide logistics, payment, customs, insurance, or compliance costs inside the 2% bullion spread unless explicitly included in a product offer.`,
  },
  {
    title: "BDO - Product Types",
    tags: ["bdo", "products", "gold", "jewelry"],
    content: `Primary customer-facing products:
- Certified physical gold bars and ingots.
- Verified jewelry.
- Certificate verification and gold passport.
- Secure delivery through an approved logistics partner.
- Client-selected custodian where custody is selected.
- Future gold-equipment brokerage for qualified suppliers and buyers.

Do not position the offer as crypto, remittance, cash-out, investment yield, banking, or peer-to-peer exchange.`,
  },
  {
    title: "BDO - Certificate Verification & Gold Passport",
    tags: ["bdo", "certificate", "verification", "gold-passport"],
    content: `Certificate verification should document what is available at review time:
- product identity, photos, weight, purity/karat, origin information when declared and validated
- serial or certificate number
- QR or code verification record
- custody, logistics, or status history when available
- expert or partner review status

Avoid fake official seals, fake government language, or claims beyond verified records.`,
  },
  {
    title: "BDO - Resale Request Flow",
    tags: ["bdo", "resale", "buyback", "compliance"],
    content: `No public P2P exchange in MVP.
Resale Request flow:
1. User clicks "Request an Offer".
2. User uploads certificate, invoice, photos, and storage location.
3. AI performs a pre-check only.
4. Compliance/human review approves or rejects the request.
5. Approved buyers may submit offers.
6. User accepts or rejects.
7. Logistics or custody transfer is documented.
8. Platform records brokerage fee.

Company buyback is optional and not guaranteed. Use "Conditional Buyback Request" only when eligibility and human approval are clear.`,
  },
  {
    title: "BDO - AI Agent Operations Center",
    tags: ["bdo", "agents", "operations", "human-escalation"],
    content: `Admin operations center agents:
- KYC/KYB Agent
- Certificate Verification Agent
- Pricing Agent
- Order Routing Agent
- Logistics Agent
- Jewelry Marketplace Agent
- Resale Request Agent
- Buyback Review Agent
- Supplier/Jeweler Onboarding Agent
- Investor Reporting Agent
- Website Copy Compliance Agent

Every sensitive decision must support human escalation. Agents draft, pre-check, route, explain, and document; humans approve restricted outcomes.`,
  },
  {
    title: "BDO - Forbidden and Approved Terms",
    tags: ["bdo", "copy", "compliance", "forbidden"],
    content: `Forbidden in customer-facing copy:
- gold wallet
- cash out anywhere
- convert gold to yuan / dollars / CFA
- remittance
- guaranteed return
- guaranteed buyback
- peer-to-peer gold exchange
- instant liquidity
- deposit money
- gold account
- investment yield

Approved terms:
- Buy certified physical gold
- Market-linked price + platform spread
- Purchase Objective
- Build your purchase budget
- Order when ready
- Request a Resale Offer
- Conditional Buyback Request
- Purchase Credits
- Verified jewelry
- Approved logistics partner
- Client-selected custodian
- Certificate verification
- Gold passport
- Source of funds / source of goods review`,
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
