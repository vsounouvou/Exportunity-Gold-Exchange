import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MANUAL_EVIDENCE_CONFIDENTIALITY,
  MANUAL_EVIDENCE_RELEVANCE,
  mimeTypeForManualEvidenceExtension,
  validateManualEvidenceFile,
} from "../server/lib/company-brain/manualEvidencePolicy";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

function file(name: string, body = "Founder-authorized internal company evidence.") {
  const buffer = Buffer.from(body);
  return { originalname: name, size: buffer.length, buffer };
}

test("manual Company Brain evidence accepts the governed document and image formats", () => {
  assert.deepEqual(validateManualEvidenceFile(file("strategy.pdf")), { extension: ".pdf", sourceType: "document" });
  assert.deepEqual(validateManualEvidenceFile(file("forecast.xlsx")), { extension: ".xlsx", sourceType: "spreadsheet" });
  assert.deepEqual(validateManualEvidenceFile(file("board.pptx")), { extension: ".pptx", sourceType: "presentation" });
  assert.deepEqual(validateManualEvidenceFile(file("factory.jpg")), { extension: ".jpg", sourceType: "image" });
  assert.throws(() => validateManualEvidenceFile(file("archive.exe")), /Unsupported evidence file/);
  assert.throws(() => validateManualEvidenceFile(file("empty.pdf", "")), /empty/);
  assert.equal(mimeTypeForManualEvidenceExtension(".pdf"), "application/pdf");
  assert.equal(mimeTypeForManualEvidenceExtension(".xml"), "text/plain; charset=utf-8");
});

test("manual evidence classifications are constrained to explicit governance values", () => {
  assert.deepEqual(
    Array.from(MANUAL_EVIDENCE_CONFIDENTIALITY).sort(),
    ["confidential", "internal", "restricted"],
  );
  assert.ok(MANUAL_EVIDENCE_RELEVANCE.has("governance"));
  assert.ok(MANUAL_EVIDENCE_RELEVANCE.has("financial"));
  assert.ok(!MANUAL_EVIDENCE_RELEVANCE.has("publicly_approved"));
});

test("manual intake is admin-only, private, review-gated, audited, and creates no claims", () => {
  const route = read("server/routes/company-brain-governance.ts");
  const service = read("server/lib/company-brain/manualEvidence.ts");
  const storage = read("server/lib/company-brain/manualEvidenceStorage.ts");
  const ui = read("client/src/pages/AdminCompanyBrainPage.tsx");

  assert.ok(route.indexOf("router.use(ensureTenantAdmin)") < route.indexOf('router.post("/sources/upload"'));
  assert.match(route, /manualEvidenceUpload\.single\("file"\)/);
  assert.match(route, /router\.get\("\/sources\/:sourceId\/file"/);
  assert.match(route, /source_manual_file_viewed/);
  assert.match(route, /Cache-Control", "no-store"/);
  assert.match(route, /Content-Security-Policy", "sandbox; default-src 'none'"/);
  assert.match(route, /filename\*=UTF-8''/);
  assert.match(route, /router\.get\("\/sources\/:sourceId\/file"[\s\S]*?assertCompanyBrainEnabled\(\)/);
  assert.match(service, /const securityStatus = secured\.securityStatus === "quarantined" \? "quarantined" : "review_required"/);
  assert.match(service, /claimsCreated: 0/);
  assert.doesNotMatch(service, /companyBrainClaims/);
  assert.doesNotMatch(service, /\/assets\/chat-attachments/);
  assert.match(storage, /UPLOAD_DIR \|\| "\/data\/uploads"/);
  assert.match(storage, /company-brain-evidence/);
  assert.match(storage, /mode: 0o600/);
  assert.match(storage, /absolutePath\.startsWith/);
  assert.match(ui, /Add governed evidence/);
  assert.match(ui, /No claim is created or published automatically/);
  assert.match(ui, /Upload for review/);
  assert.match(ui, /localStorage\.getItem\("ece_session"\)/);
  assert.match(ui, /headers\.set\("Authorization", `Bearer \$\{token\}`\)/);
  assert.match(ui, /fetch\(resolveApiUrl\(source\.source_url\)/);
});
