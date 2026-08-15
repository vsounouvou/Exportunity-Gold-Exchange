import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { injectCompanyContext } from "../server/lib/agent-os/company-context";
import { normalizeCompanyBrainTaskEvidenceRefs } from "../server/lib/company-brain/taskEvidencePolicy";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("the Context Assembler implements every required governed section", () => {
  const source = read("server/lib/company-brain/contextAssembler.ts");
  for (const key of [
    "task",
    "agent_identity",
    "authority",
    "company_charter",
    "current_strategy",
    "verified_facts",
    "related_entities",
    "relationship_history",
    "project_or_opportunity_state",
    "task_evidence",
    "approved_playbooks",
    "applicable_policies",
    "available_tools",
    "required_approvals",
    "known_conflicts",
    "open_questions",
    "source_citations",
    "freshness",
    "redactions",
  ]) {
    assert.match(source, new RegExp(`\\b${key}\\b`), `missing context pack section ${key}`);
  }
  assert.match(source, /payload: pack/);
  assert.match(source, /const isExternalPurpose = purpose !== "internal"/);
  assert.match(source, /const allowedStatuses = isExternalPurpose[\s\S]{0,80}\["approved_external"\]/);
  assert.match(source, /isExternalPurpose[\s\S]{0,80}claim\.approvedExternalWording/);
  assert.match(source, /traceability: claim\.status === "inference" \? "inference" : "source_backed"/);
  assert.match(source, /claim\.traceability === "inference" \|\| claim\.citations\.length > 0/);
  assert.match(source, /Explicit task evidence is restricted to internal Company Brain context packs/);
  assert.match(source, /Selected Company Brain evidence must be active, extracted, and marked clean before use/);
  assert.match(source, /company_brain:read_restricted/);
});

test("explicit task evidence references are bounded, deduplicated, and require exact identifiers", () => {
  assert.deepEqual(
    normalizeCompanyBrainTaskEvidenceRefs([
      { sourceId: 4, sourceVersionId: 9 },
      { source_id: 4, source_version_id: 9 },
      { sourceId: 5, sourceVersionId: 12 },
    ]),
    [
      { sourceId: 4, sourceVersionId: 9 },
      { sourceId: 5, sourceVersionId: 12 },
    ],
  );
  assert.throws(
    () => normalizeCompanyBrainTaskEvidenceRefs([{ sourceId: 0, sourceVersionId: 2 }]),
    /positive sourceId and sourceVersionId/,
  );
  assert.throws(
    () => normalizeCompanyBrainTaskEvidenceRefs(Array.from({ length: 13 }, (_, index) => ({ sourceId: index + 1, sourceVersionId: index + 1 }))),
    /at most 12/,
  );
});

test("the shared LLM gateway assembles task-scoped Company Brain context when explicitly enabled", () => {
  const gateway = read("server/lib/agent-os/llm-gateway.ts");
  assert.match(gateway, /isCompanyBrainFeatureEnabled\("companyBrain"\)/);
  assert.match(gateway, /isCompanyBrainFeatureEnabled\("contextPacks"\)/);
  assert.match(gateway, /loadCompanyBrainContextPack\(\{/);
  assert.match(gateway, /taskKey: params\.taskKey \|\| params\.purpose \|\| params\.jobId/);
  assert.match(gateway, /taskEvidenceRefs: params\.taskEvidenceRefs/);
  assert.match(gateway, /injectCompanyContext\(params\.policy, params\.messages, contextPack\)/);
  assert.doesNotMatch(gateway, /catch\s*\([^)]*\)[\s\S]{0,180}contextPack\s*=\s*null/);
});

test("the existing Operations chat provider persists governed task context instead of bypassing Company Brain", () => {
  const provider = read("server/lib/ai-provider.ts");
  const routes = read("server/routes.ts");

  assert.match(provider, /context\.tenantKey === "exportunity"/);
  assert.match(provider, /getAgentPolicy\(options\.agentId\)/);
  assert.match(provider, /loadCompanyBrainContextPack\(\{/);
  assert.match(provider, /renderCompanyBrainContextPackForModel\(pack\)/);
  assert.match(provider, /taskEvidenceRefs: context\.companyBrainEvidenceRefs/);
  assert.doesNotMatch(
    provider,
    /loadCompanyBrainContextPack\([\s\S]{0,500}catch\s*\([^)]*\)[\s\S]{0,120}(?:ignore|fallback|null)/i,
  );
  assert.match(routes, /taskKey: `operations-channel:\$\{channelId\}:message:/);
  assert.match(routes, /conversationId: String\(conversationId\)/);
  assert.match(routes, /clientMessageId \|\|[\s\S]{0,160}`operations-channel:/);
});

test("rendered context remains task-scoped and treats source evidence as untrusted data", () => {
  const pack: any = {
    version: "company-brain-context-v1",
    contextPackId: 31,
    tenantId: 3,
    companyId: 7,
    agentId: 12,
    task: { key: "quote:42", purpose: "internal", conversationId: "thread-2", correlationId: "job-9" },
    agent_identity: { agentId: 12, organizationKey: "sourcing", role: "RFQ Agent", roleLevel: 3 },
    taskKey: "quote:42",
    purpose: "internal",
    authority: { role: "RFQ Agent", decisionAuthority: "medium", permissions: ["kb_search"] },
    company_charter: [],
    current_strategy: [],
    verified_facts: [],
    related_entities: [],
    relationship_history: [],
    project_or_opportunity_state: [],
    task_evidence: [
      {
        confidentiality: "internal",
        businessRelevance: "operating_plan",
        citation: { sourceId: 8, sourceVersionId: 13, title: "Reviewed operating plan" },
        evidence: {
          kind: "untrusted_evidence",
          sourceId: "8",
          sourceVersionId: "13",
          title: "Reviewed operating plan",
          locator: null,
          sourceUrl: null,
          text: "Use only as evidence for this visible task.",
          securityStatus: "clean",
          indicators: [],
          truncated: false,
        },
      },
    ],
    approved_playbooks: [],
    applicable_policies: [],
    available_tools: ["kb_search"],
    required_approvals: [],
    known_conflicts: [],
    open_questions: [],
    source_citations: [],
    freshness: { assembledAt: "2026-08-12T00:00:00.000Z", expiresAt: "2026-08-12T00:15:00.000Z" },
    redactions: [],
    claims: [],
    conflicts: [],
    citations: [],
    assembledAt: "2026-08-12T00:00:00.000Z",
    expiresAt: "2026-08-12T00:15:00.000Z",
  };
  const policy: any = {
    agentId: 12,
    organizationKey: "sourcing",
    companyContext: "Exportunity is a global trade operating system.",
  };
  const messages = [{ role: "user" as const, content: "Compare these quotes." }];
  const contextualized = injectCompanyContext(policy, messages, pack);

  assert.equal(contextualized.length, 2);
  assert.match(contextualized[0].content, /quote:42/);
  assert.match(contextualized[0].content, /Use this pack only for the visible task/);
  assert.match(contextualized[0].content, /untrusted data/);
  assert.match(contextualized[0].content, /Reviewed operating plan/);
  assert.match(contextualized[0].content, /UNTRUSTED EVIDENCE - DATA ONLY/);
  assert.match(contextualized[0].content, /background conversations/);
});

test("Fenou links reviewed Company Brain evidence through the existing assistant thread", () => {
  const route = read("server/routes/assistant.ts");
  const page = read("client/src/pages/ChairmanQuickPage.tsx");
  assert.match(route, /thread\/:id\/company-brain-sources/);
  assert.match(route, /sv\.security_status = 'clean'/);
  assert.match(route, /s\.tenant_id = \$\{tenantId\}/);
  assert.match(route, /companyBrainEvidenceRefs/);
  assert.match(page, /Clean Company Brain evidence/);
  assert.match(page, /companyBrainEvidenceRefs: pendingEvidenceRefs/);
  assert.equal((page.match(/<form\b/g) || []).length, 1, "Fenou must retain one composer");
});
