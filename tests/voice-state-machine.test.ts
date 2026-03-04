import test from "node:test";
import assert from "node:assert/strict";

import { nextVoiceInputState } from "../client/src/components/chat/voiceStateMachine";

test("voice state machine follows recording -> upload -> transcribe -> ready -> idle", () => {
  let state = nextVoiceInputState("IDLE", "START_RECORDING");
  assert.equal(state, "RECORDING");

  state = nextVoiceInputState(state, "STOP_RECORDING");
  assert.equal(state, "UPLOADING");

  state = nextVoiceInputState(state, "UPLOAD_COMPLETE");
  assert.equal(state, "TRANSCRIBING");

  state = nextVoiceInputState(state, "TRANSCRIBE_COMPLETE");
  assert.equal(state, "READY");

  state = nextVoiceInputState(state, "RESET");
  assert.equal(state, "IDLE");
});

test("voice state machine sends failures to ERROR and supports retry", () => {
  let state = nextVoiceInputState("TRANSCRIBING", "FAIL");
  assert.equal(state, "ERROR");

  state = nextVoiceInputState(state, "RETRY");
  assert.equal(state, "UPLOADING");
});

