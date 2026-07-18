import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  classifyAgoojiyeReply,
  isAgoojiyeJobType,
  nextAgoojiyeRetry,
} from "../server/lib/agoojye/jobPolicy";

test("AGOOJIYE job policy only accepts implemented processors", () => {
  assert.equal(isAgoojiyeJobType("mail_sync"), true);
  assert.equal(isAgoojiyeJobType("scheduled_send"), true);
  assert.equal(isAgoojiyeJobType("complaint_processing"), true);
  assert.equal(isAgoojiyeJobType("fake_success"), false);
  assert.equal(isAgoojiyeJobType(""), false);
});

test("AGOOJIYE reply classification prioritizes opt-out and meeting signals", () => {
  assert.deepEqual(classifyAgoojiyeReply("Merci de me désabonner de vos messages."), {
    classification: "opt_out",
    confidence: 100,
    requiresHumanReview: false,
  });
  assert.equal(classifyAgoojiyeReply("Je suis disponible pour un rendez-vous mardi.").classification, "meeting_interest");
  assert.equal(classifyAgoojiyeReply("Message sans indication claire.").classification, "needs_review");
});

test("AGOOJIYE retries use bounded exponential backoff", () => {
  const now = new Date("2026-07-18T10:00:00.000Z");
  assert.equal(nextAgoojiyeRetry(1, now).toISOString(), "2026-07-18T10:01:00.000Z");
  assert.equal(nextAgoojiyeRetry(3, now).toISOString(), "2026-07-18T10:04:00.000Z");
  assert.equal(nextAgoojiyeRetry(20, now).toISOString(), "2026-07-18T11:00:00.000Z");
});

test("AGOOJIYE worker and admin routes enforce real queue execution", () => {
  const worker = fs.readFileSync("server/lib/agoojye/jobWorker.ts", "utf8");
  const routes = fs.readFileSync("server/routes/agoojye.ts", "utf8");
  const server = fs.readFileSync("server/index.ts", "utf8");

  assert.match(worker, /for update skip locked/i);
  assert.match(worker, /status: deadLetter \? "dead_letter" : "queued"/);
  assert.match(worker, /deliverApprovedAgoojiyeOutreach/);
  assert.match(worker, /recipient_replied/);
  assert.match(routes, /adminApi\.post\("\/jobs\/run-due"/);
  assert.match(routes, /jobType: "scheduled_send"/);
  assert.match(server, /startAgoojiyeJobWorkerScheduler\(\)/);
});
