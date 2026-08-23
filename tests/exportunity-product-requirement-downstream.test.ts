import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { resolveRequirementProductFacts } from "../server/lib/exportunity/productRequirementReadModel";
import {
  composeSupplierRfqContent,
  SupplierRfqPolicyError,
} from "../server/lib/exportunity/supplierRfqPolicy";
import { EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE } from "../server/lib/exportunity/supplierVerificationPolicy";

const productRequirementId = "1a3794d4-f7ba-4f4b-a70c-78d93b8acf60";

type CanonicalProductRequirementFixture = {
  id: string;
  sourceMessageId: number | null;
  productName: string | null;
  productCategory: string | null;
  specification: string | null;
  quantity: string | null;
  quantityText: string | null;
  unit: string | null;
  origin: string | null;
  destination: string | null;
  targetPrice: string | null;
  currency: string | null;
  deadlineText: string | null;
  frequency: string | null;
  incoterm: string | null;
  customerType: string | null;
};

function legacyRequirement() {
  return {
    title: "REQ-LEGACY • crude palm oil",
    categoryCode: "crude-palm-oil",
    quantityText: "5 barrels",
    deliveryCountryCode: "NG",
    deliveryCity: "Lagos",
    metadata: {
      commercialIntent: {
        product: {
          name: "crude palm oil",
          category: "palm oil",
          specification: "crude only",
          quantity: "5",
          unit: "barrels",
        },
        origin: "unknown legacy origin",
        destination: "Lagos",
        targetPrice: "400",
        currency: "usd",
        deadline: "legacy deadline",
        frequency: "monthly",
        incoterm: "fob",
        customerType: "legacy buyer",
      },
      discoveryProduct: {
        name: "stale discovery oil",
        specification: "unrefined",
      },
    },
  };
}

function canonicalProductRequirement(): CanonicalProductRequirementFixture {
  return {
    id: productRequirementId,
    sourceMessageId: 421,
    productName: "refined palm oil",
    productCategory: "palm oil",
    specification: "RBD food-grade",
    quantity: "100.000000",
    quantityText: "100 t",
    unit: "t",
    origin: "Benin",
    destination: "Abidjan",
    targetPrice: null,
    currency: null,
    deadlineText: "30 September 2026",
    frequency: null,
    incoterm: "cif",
    customerType: "industrial buyer",
  };
}

function supplier() {
  return {
    legalName: "West Africa Edible Oils SA",
    countryCode: "CI",
    contactType: "email",
    contactValue: "commercial@supplier.example",
    verificationScope: EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE,
  };
}

function canonicalDraft(
  productRequirement: CanonicalProductRequirementFixture =
    canonicalProductRequirement(),
) {
  const product = resolveRequirementProductFacts({
    requirement: legacyRequirement(),
    productRequirement,
  });
  return composeSupplierRfqContent({
    requirement: {
      referenceCode: "REQ-2026-1042",
      title: legacyRequirement().title,
      details: "Legacy crude-only specification that must not be disclosed.",
      quantityText: legacyRequirement().quantityText,
      deliveryCountryCode: legacyRequirement().deliveryCountryCode,
      deliveryCity: legacyRequirement().deliveryCity,
      requiredBy: "2026-08-25T00:00:00.000Z",
      productRequirement: product,
    },
    supplier: supplier(),
    buyerInstructions: null,
    responseDeadline: new Date("2026-08-28T12:00:00.000Z"),
  });
}

test("canonical Product Requirement facts override conflicting legacy JSON", () => {
  const product = resolveRequirementProductFacts({
    requirement: legacyRequirement(),
    productRequirement: canonicalProductRequirement(),
  });

  assert.equal(product.source, "canonical_product_requirement");
  assert.equal(product.productRequirementId, productRequirementId);
  assert.equal(product.sourceMessageId, 421);
  assert.equal(product.name, "refined palm oil");
  assert.equal(product.specification, "RBD food-grade");
  assert.equal(product.quantity, "100");
  assert.equal(product.quantityText, "100 t");
  assert.equal(product.destination, "Abidjan");
  assert.equal(product.targetPrice, null);
  assert.equal(product.currency, null);
  assert.equal(product.frequency, null);
  assert.equal(product.incoterm, "CIF");
});

test("canonical nulls remain unknown while only the missing product name may fall back", () => {
  const product = resolveRequirementProductFacts({
    requirement: legacyRequirement(),
    productRequirement: {
      id: productRequirementId,
      productName: null,
      productCategory: null,
      specification: null,
      quantity: null,
      quantityText: "24 drums",
      unit: null,
      origin: null,
      destination: null,
      targetPrice: null,
      currency: null,
      deadlineText: null,
      frequency: null,
      incoterm: null,
      customerType: null,
    },
  });

  assert.equal(product.source, "canonical_product_requirement");
  assert.equal(product.name, "crude palm oil");
  assert.equal(product.quantity, null);
  assert.equal(product.quantityText, "24 drums");
  assert.equal(product.specification, null);
  assert.equal(product.destination, null);
  assert.equal(product.targetPrice, null);
  assert.equal(product.currency, null);
});

test("requirements without a canonical row retain the legacy read model", () => {
  const product = resolveRequirementProductFacts({
    requirement: legacyRequirement(),
    productRequirement: null,
  });

  assert.equal(product.source, "industrial_requirement_legacy");
  assert.equal(product.productRequirementId, null);
  assert.equal(product.name, "crude palm oil");
  assert.equal(product.specification, "crude only");
  assert.equal(product.quantityText, "5 barrels");
  assert.equal(product.destination, "Lagos");
  assert.equal(product.targetPrice, "400");
  assert.equal(product.currency, "USD");
});

test("canonical RFQs disclose canonical facts and bind the complete snapshot to the hash", () => {
  const draft = canonicalDraft();
  const repeated = canonicalDraft();
  const changedTarget = canonicalDraft({
    ...canonicalProductRequirement(),
    targetPrice: "900",
    currency: "USD",
  });

  assert.equal(draft.subject, "RFQ REQ-2026-1042: refined palm oil");
  assert.match(draft.messageBody, /Product or service: refined palm oil/);
  assert.match(
    draft.messageBody,
    /Specification: RBD food-grade \| Origin: Benin \| Incoterm: CIF/,
  );
  assert.match(draft.messageBody, /Quantity: 100 t/);
  assert.match(draft.messageBody, /Delivery destination: Abidjan/);
  assert.match(
    draft.messageBody,
    /Requested delivery timing: 30 September 2026/,
  );
  assert.doesNotMatch(draft.messageBody, /crude|Lagos|5 barrels|400|legacy/i);
  assert.match(
    draft.messageBody,
    /not a purchase order, contract, payment request, or commitment to buy/,
  );

  const snapshot = draft.requirementSnapshot as Record<string, any>;
  assert.equal(snapshot.title, "refined palm oil");
  assert.equal(snapshot.quantityText, "100 t");
  assert.equal(snapshot.destinationText, "Abidjan");
  assert.equal(snapshot.deliveryCity, null);
  assert.equal(snapshot.requiredBy, null);
  assert.equal(snapshot.productRequirement.productRequirementId, productRequirementId);
  assert.equal(
    snapshot.productRequirement.source,
    "canonical_product_requirement",
  );
  assert.equal(snapshot.productRequirement.targetPrice, null);
  assert.equal(draft.contentHash, repeated.contentHash);
  assert.equal(draft.messageBody, changedTarget.messageBody);
  assert.notEqual(draft.contentHash, changedTarget.contentHash);
});

test("canonical missing quantity or destination cannot fall back to stale legacy facts", () => {
  assert.throws(
    () =>
      canonicalDraft({
        ...canonicalProductRequirement(),
        quantity: null,
        quantityText: null,
      }),
    (error: unknown) =>
      error instanceof SupplierRfqPolicyError &&
      /requirement\.quantityText/.test(error.message),
  );

  assert.throws(
    () =>
      canonicalDraft({
        ...canonicalProductRequirement(),
        destination: null,
      }),
    (error: unknown) =>
      error instanceof SupplierRfqPolicyError &&
      /productRequirement\.destination/.test(error.message),
  );
});

test("legacy RFQ content remains deterministic and does not gain a canonical snapshot", () => {
  const input = {
    requirement: {
      referenceCode: "REQ-LEGACY-8",
      title: "Legacy industrial component",
      details: "Legacy specification retained for historical requirements.",
      quantityText: "20 units",
      deliveryCountryCode: "BJ",
      deliveryCity: "Cotonou",
      requiredBy: "2026-10-15T00:00:00.000Z",
    },
    supplier: supplier(),
    buyerInstructions: null,
    responseDeadline: new Date("2026-08-28T12:00:00.000Z"),
  };
  const first = composeSupplierRfqContent(input);
  const second = composeSupplierRfqContent(input);

  assert.equal(first.contentHash, second.contentHash);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      first.requirementSnapshot,
      "productRequirement",
    ),
    false,
  );
  assert.match(first.messageBody, /Delivery destination: Cotonou, BJ/);
  assert.match(first.messageBody, /Requested delivery date: 2026-10-15/);
});

test("discovery, verification, RFQ, and the admin queue consume the native read model", () => {
  const source = (relativePath: string) =>
    readFileSync(path.join(process.cwd(), relativePath), "utf8");
  const readModel = source(
    "server/lib/exportunity/productRequirementReadModel.ts",
  );
  const discovery = source("server/lib/exportunity/supplierDiscovery.ts");
  const verification = source("server/lib/exportunity/supplierVerification.ts");
  const rfq = source("server/lib/exportunity/supplierRfq.ts");
  const policy = source("server/lib/exportunity/supplierRfqPolicy.ts");
  const admin = source(
    "client/src/pages/AdminExportunitySupplierRfqsPage.tsx",
  );
  const executableServices = [
    readModel,
    discovery,
    verification,
    rfq,
    policy,
  ].join("\n");

  for (const service of [discovery, verification, rfq]) {
    assert.match(service, /industrialProductRequirements/);
    assert.match(service, /resolveRequirementProductFacts/);
    assert.match(service, /productRequirementId/);
    assert.match(service, /productRequirementSource/);
  }
  assert.match(rfq, /leftJoin\(\s*industrialProductRequirements/);
  assert.match(policy, /canonicalProductRequirement/);
  assert.match(admin, /promotion\.productName \|\| promotion\.requirementTitle/);
  assert.doesNotMatch(
    executableServices,
    /sendMail|sendSms|sendWhatsApp|nodemailer|twilio|\bfetch\(|axios|mindbase/i,
  );
});
