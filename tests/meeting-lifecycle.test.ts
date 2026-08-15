import assert from "node:assert/strict";
import test from "node:test";

import { decideMeetingLifecycle } from "../server/lib/meetingLifecycle";

const NOW = new Date("2026-08-15T12:00:00.000Z");

test("keeps a recently active live meeting open", () => {
  const decision = decideMeetingLifecycle(
    {
      status: "in_progress",
      type: "spontaneous",
      startTime: "2026-08-15T10:00:00.000Z",
      endTime: "2026-08-15T10:30:00.000Z",
      actualStartAt: "2026-08-15T10:00:00.000Z",
      lastMessageAt: "2026-08-15T11:30:00.000Z",
    },
    NOW,
  );

  assert.equal(decision, null);
});

test("completes an abandoned live meeting after its grace window", () => {
  const decision = decideMeetingLifecycle(
    {
      status: "in_progress",
      type: "spontaneous",
      startTime: "2026-08-12T10:00:00.000Z",
      endTime: "2026-08-12T10:30:00.000Z",
      actualStartAt: "2026-08-12T10:00:00.000Z",
      lastMessageAt: "2026-08-12T10:18:00.000Z",
    },
    NOW,
  );

  assert.equal(decision?.status, "completed");
  assert.equal(decision?.reason, "stale_in_progress");
  assert.equal(decision?.actualEndAt?.toISOString(), "2026-08-12T10:30:00.000Z");
});

test("marks an elapsed scheduled meeting without activity as missed", () => {
  const decision = decideMeetingLifecycle(
    {
      status: "scheduled",
      type: "scheduled",
      startTime: "2026-08-10T08:00:00.000Z",
      endTime: "2026-08-10T08:30:00.000Z",
      duration: 30,
    },
    NOW,
  );

  assert.equal(decision?.status, "cancelled");
  assert.equal(decision?.lifecycleState, "missed");
  assert.equal(decision?.actualStartAt, null);
});

test("preserves a scheduled meeting inside the 24-hour recovery window", () => {
  const decision = decideMeetingLifecycle(
    {
      status: "scheduled",
      type: "scheduled",
      startTime: "2026-08-14T18:00:00.000Z",
      endTime: "2026-08-14T18:30:00.000Z",
    },
    NOW,
  );

  assert.equal(decision, null);
});

test("completes an elapsed scheduled room when its conversation contains activity", () => {
  const decision = decideMeetingLifecycle(
    {
      status: "scheduled",
      type: "spontaneous",
      startTime: "2026-08-10T08:00:00.000Z",
      endTime: "2026-08-10T08:30:00.000Z",
      lastMessageAt: "2026-08-10T08:22:00.000Z",
    },
    NOW,
  );

  assert.equal(decision?.status, "completed");
  assert.equal(decision?.reason, "elapsed_with_activity");
  assert.equal(decision?.actualStartAt?.toISOString(), "2026-08-10T08:00:00.000Z");
});
