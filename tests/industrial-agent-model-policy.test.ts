import assert from "node:assert/strict";
import test from "node:test";

import { EXPORTUNITY_COMPANY_CONTEXT } from "../server/lib/industrial/companyContext";
import {
  getExportunityAgentModelPolicy,
  listExportunityAgentModelPolicies,
} from "../server/lib/industrial/modelPolicy";

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

test("Exportunity company context keeps agents in the B2B industrial domain", () => {
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /B2B African trade, sourcing, commodities, machinery/i);
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /not a retail marketplace, a gold business, a crypto product/i);
  assert.match(EXPORTUNITY_COMPANY_CONTEXT, /explicit human approval/i);
});
