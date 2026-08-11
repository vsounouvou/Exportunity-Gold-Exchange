import assert from "node:assert/strict";
import test from "node:test";

import { buildConversationAccountabilityTask } from "../server/lib/conversation-accountability";

test("uses the action item as the accountability task title", () => {
  const result = buildConversationAccountabilityTask({
    conversationId: "meeting:2:123:abc",
    titleSource: [
      "Decision: Validate the Operations Center workflow.",
      "Action item: Fenou must document the verification result in this meeting only.",
    ].join("\n"),
    description: "Internal QA record",
  });

  assert.equal(result.title, "Fenou must document the verification result in this meeting only.");
  assert.equal(result.legacyTitle, "Conversation meeting:2:123:abc");
  assert.match(result.description, /^\[Conversation: meeting:2:123:abc\]/);
});

test("falls back to a readable first line", () => {
  const result = buildConversationAccountabilityTask({
    conversationId: "channel:2:all-team",
    titleSource: "Review the supplier qualification file before approval.",
    description: "",
  });

  assert.equal(result.title, "Review the supplier qualification file before approval.");
  assert.match(result.description, /Review the supplier qualification file before approval/);
});
