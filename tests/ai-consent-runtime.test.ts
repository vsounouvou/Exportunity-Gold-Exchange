import test from "node:test";
import assert from "node:assert/strict";

import {
  disableAiBackgroundRuntime,
  enableAiBackgroundRuntime,
  getAiBackgroundRuntimeOverride,
  isAiBackgroundEnabled,
} from "../server/lib/ai-consent";

test("runtime AI background override enables background without env flag", () => {
  const prev = process.env.AI_BACKGROUND_ENABLED;
  delete process.env.AI_BACKGROUND_ENABLED;

  try {
    disableAiBackgroundRuntime();
    assert.equal(isAiBackgroundEnabled(), false);

    enableAiBackgroundRuntime(60_000);
    const status = getAiBackgroundRuntimeOverride();
    assert.equal(status.enabled, true);
    assert.ok(typeof status.until === "string" && status.until.length > 10);
    assert.equal(isAiBackgroundEnabled(), true);

    disableAiBackgroundRuntime();
    assert.equal(isAiBackgroundEnabled(), false);
  } finally {
    if (prev == null) delete process.env.AI_BACKGROUND_ENABLED;
    else process.env.AI_BACKGROUND_ENABLED = prev;
    disableAiBackgroundRuntime();
  }
});

