import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMindbaseSystemPrompt,
  chunkKnowledgeText,
  computeCreditsCostPerMessage,
  extractMentionSlug,
  selectWorkspaceAgentRoute,
} from "../server/lib/mindbase/prompting";

test("buildMindbaseSystemPrompt includes core policy blocks", () => {
  const prompt = buildMindbaseSystemPrompt({
    name: "Accountant",
    description: "Finance assistant",
    personaRole: "financial analyst",
    personaTone: "professional",
    personaRules: ["validate assumptions", "show calculations"],
    styleConstraints: ["short sections", "bullet points"],
  });

  assert.match(prompt, /You are "Accountant"/);
  assert.match(prompt, /financial analyst/);
  assert.match(prompt, /Knowledge policy:/);
  assert.match(prompt, /Cite source filenames when you use knowledge/);
});

test("chunkKnowledgeText creates overlapped chunks for long content", () => {
  const source = "A".repeat(4200) + "\n\n" + "B".repeat(4200);
  const chunks = chunkKnowledgeText(source);
  assert.ok(chunks.length >= 2, "expected at least two chunks");
  assert.ok(chunks.every((chunk) => chunk.length > 0), "chunks must not be empty");
});

test("extractMentionSlug parses @agent-slug mentions", () => {
  assert.equal(extractMentionSlug("please ask @accountant to review"), "accountant");
  assert.equal(extractMentionSlug("@Mason estimate this site"), "mason");
  assert.equal(extractMentionSlug("no mention here"), "");
});

test("computeCreditsCostPerMessage enforces per-message minimum", () => {
  assert.equal(computeCreditsCostPerMessage(0), 1);
  assert.equal(computeCreditsCostPerMessage(100), 1);
  assert.equal(computeCreditsCostPerMessage(250), 3);
});

test("selectWorkspaceAgentRoute supports mention, sticky, and round-robin", () => {
  const ordered = ["mason", "accountant", "trainer"];

  const mention = selectWorkspaceAgentRoute({
    message: "Please ask @trainer for onboarding flow",
    orderedAgentSlugs: ordered,
    stickySlug: "accountant",
    latestSlug: "accountant",
  });
  assert.equal(mention.mode, "mention");
  assert.equal(mention.slug, "trainer");

  const sticky = selectWorkspaceAgentRoute({
    message: "continue previous thread",
    orderedAgentSlugs: ordered,
    stickySlug: "accountant",
    latestSlug: "mason",
  });
  assert.equal(sticky.mode, "sticky");
  assert.equal(sticky.slug, "accountant");

  const rr = selectWorkspaceAgentRoute({
    message: "next turn",
    orderedAgentSlugs: ordered,
    latestSlug: "accountant",
  });
  assert.equal(rr.mode, "round_robin");
  assert.equal(rr.slug, "trainer");
});
