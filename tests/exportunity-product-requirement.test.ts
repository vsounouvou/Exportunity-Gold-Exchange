import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { detectCommercialIntent } from "../server/lib/commercialIntentEngine";
import { projectCanonicalProductRequirement } from "../server/lib/exportunity/productRequirementPolicy";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("projects a qualified French palm-oil request into canonical product facts", () => {
  const commercial = detectCommercialIntent(
    "Je cherche 100 tonnes d'huile de palme raffinée à livrer à Abidjan.",
  );

  const projection = projectCanonicalProductRequirement({
    commercial,
    sourceMessageId: 421,
    sourceChatLeadId: "lead-421",
    requirementReferenceCode: "TREQ-20260821-PALM",
  });

  assert.equal(projection.sourceMessageId, 421);
  assert.equal(projection.intent, "source_product");
  assert.equal(projection.productName, "refined palm oil");
  assert.equal(projection.productCategory, "palm oil");
  assert.equal(projection.specification, "refined");
  assert.equal(projection.quantity, "100");
  assert.equal(projection.quantityText, "100 t");
  assert.equal(projection.unit, "t");
  assert.equal(projection.destination, "abidjan");
  assert.equal(projection.targetPrice, null);
  assert.equal(projection.currency, null);
  assert.deepEqual(projection.missingFields, []);
  assert.deepEqual(
    {
      source: projection.metadata.source,
      canonical: projection.metadata.canonical,
      sourceChatLeadId: projection.metadata.sourceChatLeadId,
      sourceMessageId: projection.metadata.sourceMessageId,
    },
    {
      source: "exportunity_talk",
      canonical: true,
      sourceChatLeadId: "lead-421",
      sourceMessageId: 421,
    },
  );
});

test("partial qualification remains explicit and never fabricates commercial facts", () => {
  const commercial = detectCommercialIntent(
    "Je veux sourcer de l'huile de palme.",
  );
  const projection = projectCanonicalProductRequirement({
    commercial,
    sourceMessageId: -4,
  });

  assert.equal(projection.sourceMessageId, null);
  assert.equal(projection.quantity, null);
  assert.equal(projection.quantityText, null);
  assert.equal(projection.destination, null);
  assert.equal(projection.targetPrice, null);
  assert.equal(projection.currency, null);
  assert.deepEqual(
    [...projection.missingFields].sort(),
    ["destination", "quantity"],
  );
});

test("canonical persistence is additive, source-linked, idempotent, and audited", () => {
  const migration = source(
    "db/migrations/20260821_exportunity_product_requirements.sql",
  );
  const schema = source("db/schema/industrial.ts");
  const ensureTables = source("server/lib/industrial/ensureTables.ts");
  const persistence = source("server/lib/exportunity/productRequirement.ts");
  const talkRoute = source("server/routes/talk.ts");
  const combined = [migration, schema, ensureTables, persistence, talkRoute].join(
    "\n",
  );

  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS industrial_product_requirements/,
  );
  assert.match(
    migration,
    /source_message_id integer REFERENCES chat_messages\(id\) ON DELETE SET NULL/,
  );
  assert.match(migration, /quantity numeric\(20,6\)/);
  assert.match(
    migration,
    /industrial_product_requirements_requirement_unique/,
  );
  assert.match(schema, /export const industrialProductRequirements = pgTable/);
  assert.match(ensureTables, /CREATE TABLE IF NOT EXISTS industrial_product_requirements/);
  assert.match(persistence, /\.onConflictDoUpdate\(\{/);
  assert.match(
    persistence,
    /target:\s*industrialProductRequirements\.requirementId/,
  );
  assert.match(
    persistence,
    /action:\s*"industrial_product_requirement\.synced"/,
  );
  assert.match(persistence, /outboundActionCreated:\s*false/);
  assert.match(persistence, /quoteCreated:\s*false/);
  assert.match(talkRoute, /\.returning\(\{ id: chatMessages\.id \}\)/);
  assert.match(talkRoute, /sourceMessageId:\s*userMessage\.id/);
  assert.match(talkRoute, /syncCanonicalProductRequirement\(\{/);
  assert.match(talkRoute, /productRequirementId:\s*productRequirement\.id/);
  assert.doesNotMatch(persistence, /sendContactNotification|sendMail|sendSms|twilio/i);
  assert.doesNotMatch(combined, /mindbase/i);
});
