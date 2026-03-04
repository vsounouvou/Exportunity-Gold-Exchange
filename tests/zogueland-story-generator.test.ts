import assert from "node:assert/strict";
import test from "node:test";

import { buildZoguelandStory } from "../server/lib/zoguelandStory";

test("zogueland story generator returns child-safe story", () => {
  const result = buildZoguelandStory({
    character: "Luna",
    world: "Sky Forest",
    mission: "find the missing song crystal",
    tone: "curious",
    length: "short",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.title, /Luna/);
  assert.match(result.story, /Sky Forest/);
  assert.equal(result.safetyLabel, "child-safe");
  assert.ok(result.tokenUsage.estimatedTokens > 0);
});

test("zogueland story generator blocks unsafe input", () => {
  const result = buildZoguelandStory({
    character: "Shadow",
    world: "Dark cave",
    mission: "learn to use a gun",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "UNSAFE_INPUT");
});

test("zogueland story generator requires all base fields", () => {
  const result = buildZoguelandStory({
    character: "",
    world: "Rainbow Valley",
    mission: "build a kind village",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "MISSING_FIELDS");
});
