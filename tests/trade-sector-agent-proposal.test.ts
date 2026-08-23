import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildTradeSectorProposalInstruction,
  parseTradeSectorProposalOutput,
  TRADE_SECTOR_PROPOSAL_EXECUTION_TYPE,
} from "../server/lib/trade-intelligence/agentSectorProposalFoundation";

test("agent sector proposals normalize a valid governed JSON draft", () => {
  const proposal = parseTradeSectorProposalOutput(
    `\n\`\`\`json\n{
      "code": "Cold-Chain",
      "name": "Cold-chain systems",
      "nameFr": "Systèmes de chaîne du froid",
      "description": "Equipment and services used to preserve temperature-controlled industrial products.",
      "rationale": "Recorded unmet demand explicitly requests temperature-controlled equipment and logistics.",
      "canonicalCategoryCodes": ["machinery-and-production-equipment", "industrial_services"],
      "confidence": 0.78
    }\n\`\`\``,
    ["machinery_and_production_equipment", "industrial_services"],
  );

  assert.equal(proposal.code, "cold_chain");
  assert.deepEqual(proposal.canonicalCategoryCodes, [
    "machinery_and_production_equipment",
    "industrial_services",
  ]);
  assert.equal(proposal.confidence, 0.78);
  assert.ok(TRADE_SECTOR_PROPOSAL_EXECUTION_TYPE.length <= 20);
});

test("agent sector proposals reject unknown Industrial OS categories", () => {
  assert.throws(
    () =>
      parseTradeSectorProposalOutput(
        JSON.stringify({
          code: "invented_sector",
          name: "Invented sector",
          nameFr: null,
          description: "A sufficiently long description for validation.",
          rationale: "A sufficiently long rationale for validation.",
          canonicalCategoryCodes: ["fabricated_category"],
          confidence: 0.4,
        }),
        ["industrial_services"],
      ),
    /unknown Industrial OS categories/i,
  );
});

test("the sector proposal instruction keeps agent work internal and review-gated", () => {
  const instruction = buildTradeSectorProposalInstruction({
    demandEventId: "8c4606cb-76c2-4d51-9b78-345663989430",
    normalizedProduct: "industrial chillers",
    destinationCountryCode: "CI",
    resultCount: 0,
    canonicalCategories: [
      { code: "machinery_and_production_equipment", label: "Machinery" },
    ],
  });

  assert.match(instruction, /do not contact third parties/i);
  assert.match(instruction, /Return exactly one JSON object/i);
  assert.match(instruction, /human administrator must review and activate/i);
  assert.match(instruction, /Missing evidence must remain missing/i);
});

test("the trade action worker dispatches the proposal scope without starting outreach", async () => {
  const [route, worker, execution] = await Promise.all([
    readFile("server/routes/trade-intelligence.ts", "utf8"),
    readFile("server/lib/actions/worker.ts", "utf8"),
    readFile("server/lib/trade-intelligence/agentSectorProposal.ts", "utf8"),
  ]);

  assert.match(route, /queue-sector-proposal/);
  assert.match(worker, /executeTradeSectorProposalAgentWork/);
  assert.match(execution, /2100-01-01T00:00:00\.000Z/);
  assert.match(execution, /externalCommunicationAllowed:\s*false/);
  assert.match(execution, /activationRequiresHumanApproval:\s*true/);
  assert.doesNotMatch(execution, /SEND_EMAIL|SEND_SMS|SEND_WHATSAPP/);
});
