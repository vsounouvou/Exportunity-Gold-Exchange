import test from "node:test";
import assert from "node:assert/strict";

import { analyzeMailAuthRecords } from "../server/lib/mail/authRecordPolicy";

const validDkim = {
  selector: "s1",
  records: ["v=DKIM1; h=sha256; k=rsa; p=public-key"],
};

test("mail authentication accepts exactly one SPF, DMARC, and active DKIM selector", () => {
  const result = analyzeMailAuthRecords({
    spfRecords: ["google-site-verification=value", "v=spf1 mx -all"],
    dmarcRecords: ["v=DMARC1; p=quarantine; rua=mailto:vs@exportunity.net"],
    dkimLookups: [validDkim, { selector: "mail", records: [] }],
  });

  assert.equal(result.spfOk, true);
  assert.equal(result.dmarcOk, true);
  assert.equal(result.dmarcPolicy, "quarantine");
  assert.equal(result.dkimOk, true);
  assert.equal(result.dkimSelector, "s1");
  assert.deepEqual(result.warnings, []);
});

test("conflicting DMARC policies are invalid instead of selecting one", () => {
  const result = analyzeMailAuthRecords({
    spfRecords: ["v=spf1 mx -all"],
    dmarcRecords: ["v=DMARC1; p=quarantine", "v=DMARC1; p=none"],
    dkimLookups: [validDkim],
  });

  assert.equal(result.dmarcOk, false);
  assert.equal(result.dmarcPolicy, null);
  assert.deepEqual(result.warnings, ["dmarc_multiple"]);
});

test("multiple SPF records and duplicate keys on one DKIM selector fail closed", () => {
  const result = analyzeMailAuthRecords({
    spfRecords: ["v=spf1 mx -all", "v=spf1 ip4:203.0.113.4 -all"],
    dmarcRecords: [],
    dkimLookups: [
      {
        selector: "s1",
        records: ["v=DKIM1; p=first", "v=DKIM1; p=second"],
      },
    ],
  });

  assert.equal(result.spfOk, false);
  assert.equal(result.dkimOk, false);
  assert.equal(result.dmarcOk, false);
  assert.deepEqual(result.warnings, [
    "spf_multiple",
    "dkim_multiple",
    "dmarc_missing",
  ]);
});
