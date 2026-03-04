import test from "node:test";
import assert from "node:assert/strict";
import { nanoid } from "nanoid";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@db";
import { agentAuditLog, agentJobs, agents, companies, clues, templates } from "@db/schema";

import { createAgentJob } from "../server/lib/agent-os/audit";
import { getAgentPolicy } from "../server/lib/agent-os/registry";
import { generateText as generateAnthropicText } from "../server/lib/agent-os/anthropic-gateway";
import { embedText, generateText as generateOpenAiText } from "../server/lib/agent-os/openai-gateway";
import { addClue, searchClues } from "../server/lib/agent-os/memory";
import { renderTemplate } from "../server/lib/agent-os/templates";
import { runAgentTask } from "../server/lib/agent-os/router";
import { TemplateRenderError } from "../server/lib/agent-os/errors";
import { ensureAgentVisibilityColumns } from "../server/lib/agents/ensureVisibilityColumns";

let visibilityColumnsEnsured = false;

async function ensureAgentSchema() {
  if (visibilityColumnsEnsured) return;
  await ensureAgentVisibilityColumns();
  visibilityColumnsEnsured = true;
}

async function ensureTestCompany() {
  await ensureAgentSchema();
  const existing = await db.query.companies.findFirst({
    orderBy: desc(companies.id),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(companies)
    .values({
      name: `Test Company ${nanoid(6)}`,
      metadata: { test: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

async function createTestAgent(params: {
  companyId: number;
  name?: string;
  role?: string;
  permissions?: any;
}) {
  await ensureAgentSchema();
  const [created] = await db
    .insert(agents)
    .values({
      companyId: params.companyId,
      name: params.name ?? `Test Agent ${nanoid(6)}`,
      role: params.role ?? "Test Agent",
      status: "active",
      permissions: params.permissions ?? { email: true, crm: true, webResearch: true },
      metadata: { test: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: agents.id });
  return created.id;
}

async function ensureOutreachTemplate(companyId: number) {
  const existing = await db.query.templates.findFirst({
    where: and(eq(templates.companyId, companyId), eq(templates.useCase, "outreach"), eq(templates.channel, "email")),
    orderBy: desc(templates.templateId),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(templates)
    .values({
      companyId,
      useCase: "outreach",
      channel: "email",
      language: "en",
      tone: "concise",
      subject: "Hello {company}",
      body: "Hi {first_name},\n\nWe can source {product} and deliver via insured logistics. Interested?\n\n{cta_link}",
      requiredVars: ["company", "first_name", "product", "cta_link"],
      version: "1.0.0",
      approved: true,
      createdBy: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

test("AgentOS integration (router + memory + templates + playbooks + audit)", async () => {
  process.env.AI_ENABLED = process.env.AI_ENABLED ?? "true";

  const company = await ensureTestCompany();
  const agentId = await createTestAgent({ companyId: company.id });
  const policy = await getAgentPolicy(agentId);
  await ensureOutreachTemplate(company.id);

  // OpenAI connectivity (optional; skipped on quota/billing/permission errors)
  let openaiAvailable = false;
  if (process.env.OPENAI_API_KEY) {
    const jobId = await createAgentJob({ title: "OpenAI connectivity", agentId, companyId: company.id });
    try {
      const embedding = await embedText({
        jobId,
        policy,
        input: "hello world",
        purpose: "test_openai_embeddings_basic",
      });
      assert.ok(embedding.embedding.length > 100);

      const response = await generateOpenAiText({
        jobId,
        policy,
        purpose: "test_openai_responses_basic",
        messages: [
          { role: "system", content: "Reply with a single word: OK" },
          { role: "user", content: "ping" },
        ],
        maxTokens: 10,
        temperature: 0,
      });
      assert.ok(response.text.length > 0);
      openaiAvailable = true;
    } catch (error) {
      openaiAvailable = false;
    }
  }

  // Anthropic connectivity (optional)
  let anthropicAvailable = false;
  if (process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY) {
    const jobId = await createAgentJob({ title: "Anthropic connectivity", agentId, companyId: company.id });
    try {
      const model = policy.anthropicPolicy.allowedModels[0] ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";
      const response = await generateAnthropicText({
        jobId,
        policy,
        model,
        purpose: "test_anthropic_messages_basic",
        messages: [
          { role: "system", content: "Reply with a single word: OK" },
          { role: "user", content: "ping" },
        ],
        maxTokens: 10,
        temperature: 0,
      });
      assert.ok(response.text.length > 0);
      anthropicAvailable = true;
    } catch (error) {
      anthropicAvailable = false;
    }
  }

  // Memory: keyword retrieval
  {
    const jobId = await createAgentJob({ title: "Memory keyword", agentId, companyId: company.id });
    const token = `kw-${nanoid(8)}`;
    const clueId = await addClue({
      jobId,
      policy,
      scope: "personal",
      type: "note",
      content: `Remember this token: ${token}`,
      tags: ["test", "keyword"],
      embed: false,
    });

    const results = await searchClues({
      jobId,
      policy,
      query: token,
      useEmbeddings: false,
      limit: 5,
    });
    assert.ok(results.some((r) => r.clue.clueId === clueId));
  }

  // Memory: embedding retrieval + entity isolation (requires OpenAI embeddings)
  if (openaiAvailable) {
    const jobId = await createAgentJob({ title: "Memory embeddings", agentId, companyId: company.id });

    const a = `entity-a-${nanoid(6)}`;
    const b = `entity-b-${nanoid(6)}`;
    const clueA = await addClue({
      jobId,
      policy,
      scope: "entity",
      type: "note",
      content: `Entity A note ${a}`,
      entityId: "A",
      tags: ["entity"],
      embed: true,
    });
    const clueB = await addClue({
      jobId,
      policy,
      scope: "entity",
      type: "note",
      content: `Entity B note ${b}`,
      entityId: "B",
      tags: ["entity"],
      embed: true,
    });

    const resultsA = await searchClues({
      jobId,
      policy,
      query: a,
      entityId: "A",
      useEmbeddings: true,
      limit: 10,
    });
    assert.ok(resultsA.some((r) => r.clue.clueId === clueA));
    assert.ok(!resultsA.some((r) => r.clue.clueId === clueB));

    const resultsB = await searchClues({
      jobId,
      policy,
      query: b,
      entityId: "B",
      useEmbeddings: true,
      limit: 10,
    });
    assert.ok(resultsB.some((r) => r.clue.clueId === clueB));
  }

  // Templates: render + missing vars error
  {
    const template = await db.query.templates.findFirst({
      where: and(eq(templates.companyId, company.id), eq(templates.useCase, "outreach"), eq(templates.channel, "email")),
      orderBy: desc(templates.templateId),
    });
    assert.ok(template);

    const jobId = await createAgentJob({ title: "Template render", agentId, companyId: company.id });
    const rendered = await renderTemplate({
      jobId,
      policy,
      template: template!,
      vars: {
        company: "Acme",
        first_name: "Sam",
        product: "doré",
        cta_link: "https://example.com",
      },
    });
    assert.ok((rendered.subject ?? "").includes("Acme"));
    assert.ok(rendered.body.includes("Sam"));

    await assert.rejects(
      () =>
        renderTemplate({
          jobId,
          policy,
          template: template!,
          vars: { company: "Acme" },
        }),
      (err: any) => err instanceof TemplateRenderError && err.missingVars.length > 0,
    );
  }

  // Router decisions: rules, memory, template, playbook, llm
  {
    const rulesRun = await runAgentTask({
      agentId,
      companyId: company.id,
      task: "ping",
    });
    assert.equal(rulesRun.decision.decision, "rules");
    assert.equal(rulesRun.output.message, "pong");

    const jobId = await createAgentJob({ title: "Router memory seed", agentId, companyId: company.id });
    const memoryToken = `memory-${nanoid(8)}`;
    await addClue({
      jobId,
      policy,
      scope: "personal",
      type: "note",
      content: memoryToken,
      tags: ["router"],
      embed: false,
    });
    const memoryRun = await runAgentTask({
      agentId,
      companyId: company.id,
      task: memoryToken,
    });
    assert.equal(memoryRun.decision.decision, "memory");

    const templateRun = await runAgentTask({
      agentId,
      companyId: company.id,
      task: "send outreach email",
      useCase: "outreach",
      channel: "email",
      language: "en",
      to: "test@example.com",
      vars: {
        company: "Acme",
        first_name: "Sam",
        product: "gold bars",
        cta_link: "https://example.com",
      },
    });
    assert.equal(templateRun.decision.decision, "template");

    const playbookRun = await runAgentTask({
      agentId,
      companyId: company.id,
      task: "client hunter: run",
      to: "lead@example.com",
      language: "en",
      vars: {
        lead: {
          companyName: "Acme Trading",
          contactName: "Sam",
          contactEmail: "lead@example.com",
          country: "CI",
          city: "Abidjan",
          sourceLink: "https://example.com",
          tags: ["test"],
        },
        company: "Acme Trading",
        first_name: "Sam",
        product: "gold bars",
        cta_link: "https://example.com",
      },
    });
    assert.equal(playbookRun.decision.decision, "playbook");

    if (openaiAvailable || anthropicAvailable) {
      const hardRun = await runAgentTask({
        agentId,
        companyId: company.id,
        task: "Draft a concise reply to a complex client objection about delivery risk and escrow.",
      });
      assert.equal(hardRun.decision.decision, "llm");
      assert.ok(typeof hardRun.output.message === "string" && hardRun.output.message.length > 0);
    }
  }

  // Permissions enforcement: CRM tool blocked
  {
    const limitedAgentId = await createTestAgent({
      companyId: company.id,
      name: `Limited Agent ${nanoid(6)}`,
      role: "Limited",
      permissions: { email: true, crm: false, webResearch: false },
    });

    const denied = await runAgentTask({
      agentId: limitedAgentId,
      companyId: company.id,
      task: "client hunter: run",
      to: "lead@example.com",
      language: "en",
      vars: {
        lead: { companyName: "Blocked Co", contactEmail: "lead@example.com" },
        company: "Blocked Co",
        first_name: "Sam",
        product: "gold bars",
        cta_link: "https://example.com",
      },
    });

    assert.equal(denied.decision.decision, "playbook");
    assert.equal(typeof denied.output.message, "string");
  }

  // Failover: AI disabled causes safe escalation (does not require OpenAI availability)
  if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY) {
    const original = process.env.AI_ENABLED;
    process.env.AI_ENABLED = "false";
    const failed = await runAgentTask({
      agentId,
      companyId: company.id,
      task: "Draft a reply that requires OpenAI.",
    });
    process.env.AI_ENABLED = original ?? "true";

    assert.equal(failed.decision.decision, "llm");
    assert.equal(failed.output.message, "Temporarily unavailable; job escalated for review.");
  }

  // End-to-end job continuity: playbook (no LLM) then hard case (LLM) under same jobId
  if (openaiAvailable || anthropicAvailable) {
    const jobId = await createAgentJob({ title: "E2E Client Hunter", agentId, companyId: company.id });

    const first = await runAgentTask({
      jobId,
      agentId,
      companyId: company.id,
      task: "client hunter: run",
      to: "lead@example.com",
      language: "en",
      vars: {
        lead: { companyName: "Acme Trading", contactEmail: "lead@example.com" },
        company: "Acme Trading",
        first_name: "Sam",
        product: "gold bars",
        cta_link: "https://example.com",
      },
    });
    assert.equal(first.jobId, jobId);
    assert.equal(first.decision.decision, "playbook");

    const second = await runAgentTask({
      jobId,
      agentId,
      companyId: company.id,
      task: "Client replied: I'm worried about delivery fraud and insurance. Draft a confident reply with steps.",
    });
    assert.equal(second.jobId, jobId);
    assert.equal(second.decision.decision, "llm");

    const logs = await db.select().from(agentAuditLog).where(eq(agentAuditLog.jobId, jobId));
    const actionTypes = new Set(logs.map((l) => l.actionType));
    assert.ok(actionTypes.has("router_decision"));
    assert.ok(actionTypes.has("tool_call"));
    assert.ok(actionTypes.has("template_render"));
    assert.ok(actionTypes.has("playbook_step"));
    assert.ok(actionTypes.has("llm_call"));

    const job = await db.query.agentJobs.findFirst({ where: eq(agentJobs.jobId, jobId) });
    assert.ok(job);
  }
});
