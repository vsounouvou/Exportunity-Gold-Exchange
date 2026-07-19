import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  nextAgoojiyeSequenceRun,
  renderAgoojiyeSequenceTemplate,
  validateAgoojiyeSequencePolicy,
} from "../server/lib/agoojye/sequencePolicy";

test("AGOOJIYE sequence policy enforces conservative limits", () => {
  assert.equal(
    validateAgoojiyeSequencePolicy({ templateIds: [1, 2, 3], maxSteps: 3, minDelayHours: 72, dailyLimit: 10 }).valid,
    true,
  );
  const unsafe = validateAgoojiyeSequencePolicy({
    templateIds: [1, 2, 3, 4, 5, 6],
    maxSteps: 6,
    minDelayHours: 2,
    dailyLimit: 100,
  });
  assert.equal(unsafe.valid, false);
  assert.equal(unsafe.errors.length, 4);
});

test("AGOOJIYE sequence scheduling observes Benin business hours and weekends", () => {
  const fridayAfternoonUtc = new Date("2026-07-17T16:30:00.000Z");
  assert.equal(
    nextAgoojiyeSequenceRun({ from: fridayAfternoonUtc, minDelayHours: 24, businessHours: "08:00-17:00" }).toISOString(),
    "2026-07-20T07:00:00.000Z",
  );
  assert.equal(
    nextAgoojiyeSequenceRun({ from: new Date("2026-07-20T08:00:00.000Z"), minDelayHours: 48 }).toISOString(),
    "2026-07-22T08:00:00.000Z",
  );
});

test("AGOOJIYE sequence templates make missing variables explicit", () => {
  assert.equal(
    renderAgoojiyeSequenceTemplate("Bonjour {{ contact_first_name }} - {{organization_name}}", {
      contact_first_name: "Awa",
      organization_name: "",
    }),
    "Bonjour Awa - [A COMPLETER: organization_name]",
  );
});

test("AGOOJIYE sequences require initial approval and persist automatic stop paths", () => {
  const service = fs.readFileSync("server/lib/agoojye/sequenceService.ts", "utf8");
  const worker = fs.readFileSync("server/lib/agoojye/jobWorker.ts", "utf8");
  const routes = fs.readFileSync("server/routes/agoojye.ts", "utf8");
  const delivery = fs.readFileSync("server/lib/agoojye/outreachDelivery.ts", "utf8");

  assert.match(service, /status: "awaiting_approval"/);
  assert.match(service, /humanApprovalRequired: true/);
  assert.match(service, /jobType: "follow_up"/);
  assert.match(service, /status: "completed"/);
  assert.match(worker, /recipient_replied/);
  assert.match(worker, /hard_bounce/);
  assert.match(worker, /explicit_opt_out/);
  assert.match(routes, /adminApi\.post\("\/sequences\/:id\/activate"/);
  assert.match(routes, /adminApi\.post\("\/sequences\/:id\/enroll"/);
  assert.match(routes, /Utilisez l'action Activer/);
  assert.match(delivery, /advanceAgoojiyeSequenceAfterSend/);
  assert.match(delivery, /mailServerAccepted/);
});
