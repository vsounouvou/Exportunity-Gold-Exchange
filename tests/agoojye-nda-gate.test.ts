import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  canInviteEngineeringProfile,
  engineeringNdaDecision,
} from "../server/lib/agoojye/ndaAccess";
import {
  persistEncryptedNdaDocument,
  readEncryptedNdaDocument,
  removeEncryptedNdaDocument,
  validateNdaDocument,
} from "../server/lib/agoojye/ndaDocuments";
import {
  buildEngineeringInvitation,
  engineeringInvitationFirstName,
} from "../server/lib/agoojye/engineeringInvitation";

const TEST_SECRET = "agoojye-nda-test-secret-with-more-than-32-characters";

test("engineering access stays closed until a registered NDA is uploaded", () => {
  assert.deepEqual(
    engineeringNdaDecision({
      ndaStatus: "not_recorded",
      ndaAccessState: "blocked",
    }),
    {
      allowed: false,
      code: "NDA_NOT_REGISTERED",
      state: "blocked",
    },
  );
  assert.deepEqual(
    engineeringNdaDecision({
      ndaStatus: "signed",
      ndaAccessState: "blocked",
    }),
    {
      allowed: false,
      code: "NDA_UPLOAD_REQUIRED",
      state: "required",
    },
  );
  assert.deepEqual(
    engineeringNdaDecision({
      ndaStatus: "required",
      ndaAccessState: "required",
    }),
    {
      allowed: false,
      code: "NDA_UPLOAD_REQUIRED",
      state: "required",
    },
  );
  assert.equal(
    engineeringNdaDecision({
      ndaStatus: "signed",
      ndaAccessState: "submitted",
    }).allowed,
    true,
  );
  assert.equal(
    engineeringNdaDecision({
      ndaStatus: "signed",
      ndaAccessState: "approved",
    }).allowed,
    true,
  );
  assert.deepEqual(
    engineeringNdaDecision({
      ndaStatus: "signed",
      ndaAccessState: "rejected",
    }),
    {
      allowed: false,
      code: "NDA_REJECTED",
      state: "rejected",
    },
  );
});

test("invitations require a registered NDA and a personal email", () => {
  assert.equal(
    canInviteEngineeringProfile({
      ndaStatus: "signed",
      personalEmail: "person@example.com",
      invitationState: "not_sent",
    }),
    true,
  );
  assert.equal(
    canInviteEngineeringProfile({
      ndaStatus: "required",
      personalEmail: "shareholder@example.com",
      invitationState: "not_sent",
    }),
    true,
  );
  assert.equal(
    canInviteEngineeringProfile({
      ndaStatus: "not_recorded",
      personalEmail: "person@example.com",
      invitationState: "not_sent",
    }),
    false,
  );
  assert.equal(
    canInviteEngineeringProfile({
      ndaStatus: "signed",
      personalEmail: null,
      invitationState: "not_sent",
    }),
    false,
  );
  assert.equal(
    canInviteEngineeringProfile({
      ndaStatus: "signed",
      personalEmail: "person@example.com",
      invitationState: "sent",
    }),
    false,
  );
});

test("NDA files are validated, encrypted at rest and recoverable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "agoojye-nda-test-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  const pdf = Buffer.from("%PDF-1.7\nAGOOJIYE signed NDA test\n%%EOF", "utf8");
  const stored = await persistEncryptedNdaDocument({
    tenantId: 3162,
    engineeringProfileId: 42,
    buffer: pdf,
    mimeType: "application/pdf",
    originalName: "../NDA signé.pdf",
    root,
    secret: TEST_SECRET,
  });

  assert.equal(stored.originalName, "NDA signé.pdf");
  assert.equal(stored.mimeType, "application/pdf");
  assert.match(stored.sha256, /^[a-f0-9]{64}$/);
  const encrypted = await readFile(join(root, ...stored.storageKey.split("/")));
  assert.equal(encrypted.includes(Buffer.from("%PDF-", "ascii")), false);
  assert.deepEqual(
    await readEncryptedNdaDocument({
      storageKey: stored.storageKey,
      root,
      secret: TEST_SECRET,
    }),
    pdf,
  );

  await assert.rejects(
    readEncryptedNdaDocument({
      storageKey: "../outside.nda",
      root,
      secret: TEST_SECRET,
    }),
    /storage key/i,
  );
  await removeEncryptedNdaDocument({ storageKey: stored.storageKey, root });
  await assert.rejects(readFile(join(root, ...stored.storageKey.split("/"))));
});

test("an extension and MIME type cannot disguise invalid NDA content", () => {
  assert.throws(
    () =>
      validateNdaDocument({
        buffer: Buffer.from("not a PDF"),
        mimeType: "application/pdf",
        originalName: "nda.pdf",
      }),
    /contenu du fichier/i,
  );
  assert.throws(
    () =>
      validateNdaDocument({
        buffer: Buffer.from("%PDF-test"),
        mimeType: "text/plain",
        originalName: "nda.txt",
      }),
    /PDF, JPG ou PNG/i,
  );
});

test("the French invitation is personal and explains the NDA gate", () => {
  assert.equal(engineeringInvitationFirstName("Awa DOE"), "Awa");
  const invitation = buildEngineeringInvitation({
    displayName: "Awa DOE",
    setupLink: "https://agoojiye.com/setup-password?token=secret-test-token",
    expiresInHours: 72,
    corporateEmail: "awa.doe@agoojiye.com",
    role: "Actionnaire AGOOJIYE",
    accessDescription: "CRM AGOOJIYE en consultation uniquement",
  });
  assert.match(invitation.subject, /accès personnel/i);
  assert.match(invitation.text, /Bonjour Awa/);
  assert.match(invitation.text, /NDA signé/);
  assert.match(invitation.text, /Aucun accès/);
  assert.match(invitation.text, /72 heures/);
  assert.match(invitation.text, /awa\.doe@agoojiye\.com/);
  assert.match(invitation.text, /consultation uniquement/);
  assert.match(invitation.html, /Activer mon compte/);
});
