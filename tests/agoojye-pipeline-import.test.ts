import assert from "node:assert/strict";
import test from "node:test";

import {
  inferAgoojiyeImportMapping,
  normalizeAgoojiyeImportRows,
  parseAgoojiyeImportFile,
} from "../server/lib/agoojye/pipelineImport";
import {
  hasForbiddenAgoojiyeSmtpSecret,
  sanitizeAgoojiyeEmailSettingsRow,
} from "../server/lib/agoojye/emailSettingsPolicy";

test("AGOOJIYE pipeline import parses CSV and infers French columns", () => {
  const parsed = parseAgoojiyeImportFile({
    fileName: "sponsors.csv",
    buffer: Buffer.from("Organisation,Site web,Pays\nEnergie Benin,https://energie.example,Benin\nIndustrie Ouest,https://industrie.example,Togo\n"),
  });
  assert.equal(parsed.sourceType, "csv");
  assert.equal(parsed.rows.length, 2);

  const mapping = inferAgoojiyeImportMapping("organizations", parsed.headers);
  assert.deepEqual(mapping, { name: "Organisation", website: "Site web", country: "Pays" });
  const normalized = normalizeAgoojiyeImportRows("organizations", parsed.rows, mapping);
  assert.equal(normalized.validRows.length, 2);
  assert.equal(normalized.validRows[0].data.name, "Energie Benin");
  assert.equal(normalized.warnings.length, 0);
});

test("AGOOJIYE pipeline import rejects invalid contacts and duplicate rows", () => {
  const rows = [
    { Email: "contact@example.com", Prenom: "Awa" },
    { Email: "CONTACT@example.com", Prenom: "Awa bis" },
    { Email: "adresse-invalide", Prenom: "Koffi" },
  ];
  const normalized = normalizeAgoojiyeImportRows("contacts", rows, { email: "Email", firstName: "Prenom" });
  assert.equal(normalized.validRows.length, 1);
  assert.equal(normalized.warnings.length, 2);
  assert.match(normalized.warnings[0].message, /Doublon/);
  assert.match(normalized.warnings[1].message, /invalide/);
});

test("AGOOJIYE email settings never accept or return SMTP password material", () => {
  assert.equal(hasForbiddenAgoojiyeSmtpSecret({ smtpPassword: "secret" }), true);
  assert.equal(hasForbiddenAgoojiyeSmtpSecret({ smtpPasswordEncrypted: "********" }), true);
  assert.equal(hasForbiddenAgoojiyeSmtpSecret({ smtpHost: "mail.example.com" }), false);

  const safe = sanitizeAgoojiyeEmailSettingsRow({
    id: 1,
    smtpHost: "mail.example.com",
    smtpPasswordEncrypted: "legacy-secret",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(safe, "smtpPasswordEncrypted"), false);
  assert.equal(safe.credentialsMode, "environment");
});
