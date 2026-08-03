import test from "node:test";
import assert from "node:assert/strict";

import { injectCompanyContext } from "../server/lib/agent-os/company-context";
import { buildOfflineAgentSuggestions } from "../server/lib/agent-suggestions";

test("Exportunity organization context is added only to a visible LLM request", () => {
  const policy: any = {
    agentId: 10,
    organizationKey: "technical",
    companyContext: "Exportunity is a B2B industrial operations platform.",
  };
  const messages = [{ role: "user" as const, content: "I need a replacement bearing." }];

  const contextualized = injectCompanyContext(policy, messages);

  assert.equal(contextualized.length, 2);
  assert.equal(contextualized[0].role, "system");
  assert.match(contextualized[0].content, /B2B industrial operations platform/);
  assert.match(contextualized[0].content, /background conversations/);
  assert.deepEqual(messages, [{ role: "user", content: "I need a replacement bearing." }]);
  assert.equal(injectCompanyContext(policy, contextualized).length, 2);
});

test("Exportunity industrial agents do not inherit gold exchange suggestions", () => {
  const agent: any = {
    id: 10,
    name: "Mariam Diallo",
    role: "Director of Technical and Industrial Operations",
    country: "Benin",
    metadata: { organizationVersion: "exportunity-industrial-org-v2" },
    skills: [],
    industryFocus: [],
    responsibilities: [],
    languages: ["fr", "en"],
  };

  const suggestions = buildOfflineAgentSuggestions(agent);
  const copy = JSON.stringify(suggestions).toLowerCase();

  assert.match(copy, /reverse-engineering/);
  assert.doesNotMatch(copy, /gold exchange/);
  assert.doesNotMatch(copy, /gold pricing/);
});
