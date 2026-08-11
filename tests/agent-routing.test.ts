import assert from "node:assert/strict";
import test from "node:test";

import { prohibitsTaskCreation } from "../server/lib/actions/instructionGuards";
import { buildAgentMentionAliases, getMentionedAgentIdsFromText } from "../server/lib/agents/mentions";

const aliases = buildAgentMentionAliases([
  { id: 10, name: "Tassi Hangbe" },
  { id: 170, name: "Fenou" },
  { id: 161, name: "Kossi Mensah" },
  { id: 171, name: "Awa Kouadio" },
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

test("a vocative name after a routing prefix selects the addressed agent", () => {
  assert.deepEqual(
    getMentionedAgentIdsFromText(
      "QA commercial: Awa, confirme ton role sans creer de tache.",
      aliases,
      { allowVocativeBareMentions: true },
    ),
    [171],
  );
});

test("an incidental name in prose is not treated as a vocative address", () => {
  assert.deepEqual(
    getMentionedAgentIdsFromText("Review the commercial note Awa shared yesterday.", aliases, {
      allowVocativeBareMentions: true,
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
  assert.equal(prohibitsTaskCreation("Ne cree aucune tache et ne contacte personne."), true);
  assert.equal(prohibitsTaskCreation("Confirme que tu n'as cree aucune tache."), true);
  assert.equal(prohibitsTaskCreation("Confirme que tu n’as créé aucune tâche."), true);
  assert.equal(prohibitsTaskCreation("Resume ce document sans creer de tache."), true);
  assert.equal(prohibitsTaskCreation("Create three tasks from this plan."), false);
});
