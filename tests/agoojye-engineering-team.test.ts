import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertNoOutboundDeliveryArguments,
  ENGINEERING_ROSTER,
  ENGINEERING_TASKS,
  ENGINEERING_TEAM_SLUGS,
  LAUNCH_COMMUNICATION_TASKS,
  summarizeEngineeringRoster,
  validateEngineeringRoster,
} from "../server/lib/agoojye/engineeringTeam";

test("the engineering workbook is represented by 34 unique people", () => {
  const validation = validateEngineeringRoster();
  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.equal(ENGINEERING_ROSTER.length, 34);
  assert.equal(
    new Set(ENGINEERING_ROSTER.map((entry) => entry.corporateEmail)).size,
    34,
  );
  assert.equal(
    new Set(ENGINEERING_ROSTER.flatMap((entry) => entry.sourceRows)).size,
    35,
  );
});

test("the duplicate Judicael rows are merged into one corporate identity", () => {
  const judicael = ENGINEERING_ROSTER.filter(
    (entry) => entry.corporateEmail === "judicael@agoojiye.com",
  );
  assert.equal(judicael.length, 1);
  assert.deepEqual(judicael[0].sourceRows, [6, 36]);
  assert.equal(judicael[0].personalEmailRecorded, true);
  assert.equal(judicael[0].personalEmail, null);
  assert.equal(judicael[0].ndaUrl, null);
});

test("squads, missing contacts and NDA review counts remain explicit", () => {
  const summary = summarizeEngineeringRoster();
  assert.deepEqual(summary, {
    total: 34,
    byTeam: {
      [ENGINEERING_TEAM_SLUGS.cad]: 7,
      [ENGINEERING_TEAM_SLUGS.electrical]: 8,
      [ENGINEERING_TEAM_SLUGS.firmware]: 4,
      [ENGINEERING_TEAM_SLUGS.software]: 12,
      [ENGINEERING_TEAM_SLUGS.integration]: 3,
    },
    missingPersonalEmail: 2,
    ndaSigned: 27,
    ndaNotRecorded: 7,
    assignmentsToConfirm: 3,
  });
  assert.deepEqual(
    ENGINEERING_ROSTER.filter((entry) => !entry.personalEmailRecorded).map(
      (entry) => entry.displayName,
    ),
    ["Fried BOCOVO", "Prince ATCHIN"],
  );
});

test("prototype and communication work are converted into operational tasks", () => {
  assert.equal(ENGINEERING_TASKS.length, 16);
  assert.equal(LAUNCH_COMMUNICATION_TASKS.length, 6);
  assert.ok(
    ENGINEERING_TASKS.some((task) => task.key === "s4-final-assembly"),
  );
  assert.ok(
    ENGINEERING_TASKS.some((task) => task.key === "s5-reliability-safety"),
  );
  assert.ok(
    LAUNCH_COMMUNICATION_TASKS.some((task) => task.key === "launch-gala"),
  );
});

test("the account provisioner rejects every outbound-delivery switch", () => {
  assert.doesNotThrow(() =>
    assertNoOutboundDeliveryArguments(["--apply", "--confirm-no-email"]),
  );
  for (const option of [
    "--send",
    "--send=true",
    "--notify",
    "--email",
    "--invite=team",
  ]) {
    assert.throws(() => assertNoOutboundDeliveryArguments([option]));
  }
});

test("provisioning stores credentials privately and never creates setup links", () => {
  const rosterSource = readFileSync(
    new URL("../server/lib/agoojye/engineeringTeam.ts", import.meta.url),
    "utf8",
  );
  const source = readFileSync(
    new URL("../scripts/provision-agoojiye-engineering-team.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /--confirm-no-email/);
  assert.match(source, /outboundDeliveryAuthorized: false/);
  assert.match(source, /setupLink: null/);
  assert.match(source, /mode: 0o600/);
  assert.doesNotMatch(source, /createPasswordSetupToken|nodemailer|sendMail\(/);
  assert.doesNotMatch(
    rosterSource,
    /@(gmail|epitech)\.|drive\.google\.com\/file|01 [0-9]{2} [0-9]{2}/i,
  );
});

test("account activation synchronizes the chosen password with AGOOJIYE webmail", () => {
  const routeSource = readFileSync(
    new URL("../server/routes/password-setup.ts", import.meta.url),
    "utf8",
  );
  const pageSource = readFileSync(
    new URL("../client/src/pages/SetupPasswordPage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(routeSource, /mailserverEmailUpdate\(corporateEmail, password\)/);
  assert.match(routeSource, /webmailPasswordSyncStatus/);
  assert.match(routeSource, /invitationState: "accepted"/);
  assert.match(routeSource, /createEngineeringNdaSession/);
  assert.match(routeSource, /status: ndaUploadRequired \? "NDA Required" : "Active"/);
  assert.match(routeSource, /sessionScope: "agoojye_nda"/);
  assert.match(
    pageSource,
    /Il servira pour la plateforme et le webmail AGOOJIYE/,
  );
});
