import assert from "node:assert/strict";
import test from "node:test";

import { prohibitsTaskCreation } from "../server/lib/actions/instructionGuards";
import { buildAgentMentionAliases, getMentionedAgentIdsFromText } from "../server/lib/agents/mentions";

const aliases = buildAgentMentionAliases([
  { id: 10, name: "Tassi Hangbe" },
  { id: 170, name: "Fenou" },
  { id: 161, name: "Kossi Mensah" },
]);

test("a unique agent name at the start of a team message directly routes the reply", () => {
  assert.deepEqual(
    getMentionedAgentIdsFromText("Fenou, list the three decisions.", aliases, {
      allowLeadingBareMentions: true,
    }),
    [170],
  );
});

test("a later name reference does not hijack an all-team reply", () => {
  assert.deepEqual(
    getMentionedAgentIdsFromText("Please review the plan Fenou shared yesterday.", aliases, {
      allowLeadingBareMentions: true,
    }),
    [],
  );
});

test("explicit at-mentions continue to work anywhere", () => {
  assert.deepEqual(getMentionedAgentIdsFromText("Please ask @Kossi to verify this.", aliases), [161]);
});

test("ambiguous first names are not exposed as direct-address aliases", () => {
  const ambiguous = buildAgentMentionAliases([
    { id: 1, name: "Awa Kouadio" },
    { id: 2, name: "Awa Mensah" },
  ]);
  assert.deepEqual(
    getMentionedAgentIdsFromText("Awa, review this.", ambiguous, { allowLeadingBareMentions: true }),
    [],
  );
});

test("explicit no-task instructions suppress automatic accountability task creation", () => {
  assert.equal(
    prohibitsTaskCreation("Do not create contacts, tasks, or send messages."),
    true,
  );
  assert.equal(prohibitsTaskCreation("Ne creer pas de taches pour cette question."), true);
  assert.equal(prohibitsTaskCreation("Create three tasks from this plan."), false);
});
