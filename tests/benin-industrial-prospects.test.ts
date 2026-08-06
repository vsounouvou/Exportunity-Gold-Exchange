import assert from "node:assert/strict";
import test from "node:test";

import {
  BENIN_INDUSTRIAL_PROSPECTS,
  beninIndustrialProspectSummary,
  mapBeninIndustrialProspectToFactoryLead,
} from "../server/lib/industrial/beninIndustrialProspects";

test("Benin industrial prospect universe is sourced, unique and outreach blocked", () => {
  const summary = beninIndustrialProspectSummary();
  const ids = new Set(BENIN_INDUSTRIAL_PROSPECTS.map((item) => item.id));

  assert.equal(BENIN_INDUSTRIAL_PROSPECTS.length, 52);
  assert.equal(ids.size, BENIN_INDUSTRIAL_PROSPECTS.length);
  assert.equal(summary.gdizApproved, 20);
  assert.equal(summary.importableFactoryLeads, 38);
  assert.equal(summary.logisticsPartners, 11);
  assert.equal(summary.institutionalPartners, 3);

  for (const item of BENIN_INDUSTRIAL_PROSPECTS) {
    assert.match(item.sourceUrl, /^https:\/\//);
    assert.equal(item.verificationRequired, true);
    assert.equal(item.outreachAllowed, false);
    assert.ok(item.evidenceSummary.length > 20);
  }
});

test("only factory-relevant prospects map into the private lead queue", () => {
  const importable = BENIN_INDUSTRIAL_PROSPECTS.filter(
    (item) => item.importableAsFactoryLead,
  );
  const planningOnly = BENIN_INDUSTRIAL_PROSPECTS.filter(
    (item) => !item.importableAsFactoryLead,
  );

  for (const item of importable) {
    const lead = mapBeninIndustrialProspectToFactoryLead(item);
    assert.ok(lead);
    assert.equal(lead.metadata.verificationRequired, true);
    assert.equal(lead.metadata.outreachAllowed, false);
    assert.equal(lead.metadata.publicProfileCreated, false);
  }

  for (const item of planningOnly) {
    assert.equal(mapBeninIndustrialProspectToFactoryLead(item), null);
  }
});
