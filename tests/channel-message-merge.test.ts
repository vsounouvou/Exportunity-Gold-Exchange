import assert from "node:assert/strict";
import test from "node:test";

import { mergeChannelMessages } from "../client/src/lib/channelMessageMerge";

test("persisted channel messages replace their optimistic copy", () => {
  const clientMessageId = "a7d7c7b7-fefa-46ae-b75a-ae4e1f0e58c1";
  const optimistic = {
    id: `temp-user-${clientMessageId}`,
    clientMessageId,
    content: "Use governed context.",
    createdAt: "2026-08-13T15:03:00.000Z",
  };
  const persisted = {
    id: 912,
    clientMessageId,
    content: "Use governed context.",
    createdAt: "2026-08-13T15:03:00.100Z",
  };

  assert.deepEqual(mergeChannelMessages([optimistic], [persisted]), [persisted]);
});

test("messages from separate scopes or client ids remain distinct", () => {
  const optimistic = {
    id: "temp-user-1",
    clientMessageId: "message-1",
    content: "First",
  };
  const background = {
    id: 1,
    clientMessageId: "message-1",
    content: "Background",
    isBackgroundMessage: true,
  };
  const second = {
    id: 2,
    clientMessageId: "message-2",
    content: "Second",
  };

  assert.deepEqual(mergeChannelMessages([optimistic], [background, second]), [optimistic, background, second]);
});
