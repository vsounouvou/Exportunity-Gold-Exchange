import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EXPORTUNITY_COMPANY_CONTEXT } from "../server/lib/industrial/companyContext";
import {
  getExportunityAgentModelPolicy,
  listExportunityAgentModelPolicies,
} from "../server/lib/industrial/modelPolicy";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MODEL_ENV_KEYS = [
  "OPENAI_EXPORTUNITY_MODEL",
  "OPENAI_EXPORTUNITY_TASSI_MODEL",
  "OPENAI_EXPORTUNITY_CEO_MODEL",
  "OPENAI_EXPORTUNITY_SOURCING_MODEL",
  "OPENAI_EXPORTUNITY_TECHNICAL_MODEL",
  "OPENAI_EXPORTUNITY_COMMERCIAL_MODEL",
  "OPENAI_EXPORTUNITY_LOGISTICS_MODEL",
  "OPENAI_EXPORTUNITY_FINANCE_MODEL",
  "OPENAI_EXPORTUNITY_QUALITY_MODEL",
  "OPENAI_EXPORTUNITY_DATA_MODEL",
  "OPENAI_EXPORTUNITY_COMPLIANCE_MODEL",
  "OPENAI_EXPORTUNITY_MARKETING_MODEL",
  "OPENAI_INDUSTRIAL_INTAKE_MODEL",
  "OPENAI_MODEL_FAST",
  "OPENAI_MODEL",
] as const;

function withCleanModelEnvironment(run: () => void) {
  const previous = new Map<string, string | undefined>(
    MODEL_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  for (const key of MODEL_ENV_KEYS) delete process.env[key];
  try {
    run();
  } finally {
    for (const key of MODEL_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Exportunity agent policies use current models by responsibility", () => {
  withCleanModelEnvironment(() => {
    assert.equal(getExportunityAgentModelPolicy("tassi").model, "gpt-5.6-luna");
    assert.equal(getExportunityAgentModelPolicy("technical").model, "gpt-5.6-terra");
    assert.equal(getExportunityAgentModelPolicy("sourcing").model, "gpt-5.6-terra");
    assert.equal(getExportunityAgentModelPolicy("ceo").model, "gpt-5.6-sol");
    assert.equal(getExportunityAgentModelPolicy("finance").model, "gpt-5.6-sol");
    assert.equal(getExportunityAgentModelPolicy("compliance").model, "gpt-5.6-sol");
    assert.equal(listExportunityAgentModelPolicies().length, 11);
  });
});

test("Exportunity company context keeps agents in the global trade domain", () => {
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /Exportunity \| AI is the master brand/i);
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /AI-managed global B2B trade and operations network/i);
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /global by default/i);
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /Trade\. Source\. Expand\. Operate\./i);
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /Cote d'Ivoire and Benin/i);
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /supplier, manufacturing, commodities, and logistics corridors in the UAE/i);
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /Exportunity Machinery is a specialized industrial operating division/i);
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /compliance-gated precious-metals sourcing/i);
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /not a crypto product, a public precious-metals exchange/i);
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /explicit human approval/i);

  for (const gatewayPath of [
    "server/lib/openai.ts",
    "server/lib/claude.ts",
    "server/lib/gemini.ts",
  ]) {
    const gateway = fs.readFileSync(path.join(repoRoot, gatewayPath), "utf8");
    assert.match(gateway, /tenantKey[\s\S]{0,120}exportunity/);
    assert.match(gateway, /Exportunity\(\?:\\s\*\\\|\\s\*AI\)\?/);
  }
});
