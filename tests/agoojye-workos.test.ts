import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildTotpUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  hasPrivilegedWorkosRole,
  isAgoojiyeSuperAdmin,
  totpCode,
  verifyTotp,
} from "../server/lib/agoojye/workosSecurity";
import { canAccessAgoojiyeDataClass } from "../server/lib/agoojye/osPolicy";
import { hasAgoojiyeStaffAccess } from "../server/lib/agoojye/staffAccess";

test("TOTP follows the RFC test vector and accepts only the configured time window", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totpCode(secret, 59_000), "287082");
  assert.equal(verifyTotp(secret, "287082", 59_000, 0), true);
  assert.equal(verifyTotp(secret, "287082", 59_000 + 60_000, 0), false);
});

test("MFA secrets are encrypted with authenticated encryption", () => {
  const key = "test-only-key-material-with-at-least-32-characters";
  const encrypted = encryptMfaSecret("SECRET-FOR-TOTP", key);
  assert.notEqual(encrypted, "SECRET-FOR-TOTP");
  assert.equal(decryptMfaSecret(encrypted, key), "SECRET-FOR-TOTP");
  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
  assert.throws(() => decryptMfaSecret(tampered, key));
});

test("recovery codes are unique and hashed before persistence", () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  const hashes = codes.map(hashRecoveryCode);
  assert.equal(new Set(hashes).size, 10);
  assert.ok(hashes.every((hash) => !codes.includes(hash)));
});

test("the TOTP enrollment URI contains no password or application session", () => {
  const uri = buildTotpUri({ secret: "GEZDGNBVGY3TQOJQ", email: "vs@agoojiye.com" });
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, "otpauth:");
  assert.equal(parsed.searchParams.get("issuer"), "AGOOJIYE WorkOS");
  assert.equal(uri.includes("password"), false);
  assert.equal(uri.includes("session"), false);
});

test("privileged WorkOS roles require MFA while ordinary workers do not", () => {
  assert.equal(hasPrivilegedWorkosRole({ roles: ["staff"], permissions: [] }, ["USER"]), false);
  assert.equal(hasPrivilegedWorkosRole({ roles: ["admin"], permissions: [] }, ["TENANT_ADMIN"]), true);
  assert.equal(hasPrivilegedWorkosRole({ roles: [], permissions: ["admin:*"] }, ["USER"]), true);
});

test("mobility staff access recognizes the dedicated controller role", () => {
  assert.equal(hasAgoojiyeStaffAccess({ roles: ["CONTROLLER"], permissions: [] }), true);
  assert.equal(hasAgoojiyeStaffAccess({ roles: ["contrôleur"], permissions: [] }), true);
  assert.equal(hasAgoojiyeStaffAccess({ roles: ["USER"], permissions: [] }), false);
});

test("the principal super-admin identity requires both the exact email and tenant role", () => {
  const previous = process.env.AGOOJIYE_SUPER_ADMIN_EMAIL;
  process.env.AGOOJIYE_SUPER_ADMIN_EMAIL = "vs@agoojiye.com";
  try {
    assert.equal(isAgoojiyeSuperAdmin({ email: "vs@agoojiye.com", roles: ["AGOOJIYE_SUPER_ADMIN"] }, ["SUPER_ADMIN"]), true);
    assert.equal(isAgoojiyeSuperAdmin({ email: "other@agoojiye.com", roles: ["AGOOJIYE_SUPER_ADMIN"] }, ["SUPER_ADMIN"]), false);
    assert.equal(isAgoojiyeSuperAdmin({ email: "vs@agoojiye.com", roles: ["staff"] }, ["USER"]), false);
  } finally {
    if (previous === undefined) delete process.env.AGOOJIYE_SUPER_ADMIN_EMAIL;
    else process.env.AGOOJIYE_SUPER_ADMIN_EMAIL = previous;
  }
});

test("MFA challenges are claimed atomically before a session can be created", () => {
  const routeSource = readFileSync(new URL("../server/routes/agoojye-workos.ts", import.meta.url), "utf8");
  assert.equal((routeSource.match(/MFA_CHALLENGE_USED/g) || []).length, 2);
  assert.match(
    routeSource,
    /where\(and\(eq\(agoojyeWorkosMfaChallenges\.id, challenge\.id\), isNull\(agoojyeWorkosMfaChallenges\.usedAt\)\)\)[\s\S]*?returning/,
  );
});

test("data classification enforces department, project and super-admin boundaries", () => {
  const worker = { accessLevel: 3, teamId: 7, permissions: [] };
  assert.equal(canAccessAgoojiyeDataClass({ member: worker, classification: "INTERNAL" }), true);
  assert.equal(canAccessAgoojiyeDataClass({ member: worker, classification: "DEPARTMENT_ONLY", resourceTeamId: 7 }), true);
  assert.equal(canAccessAgoojiyeDataClass({ member: worker, classification: "DEPARTMENT_ONLY", resourceTeamId: 8 }), false);
  assert.equal(canAccessAgoojiyeDataClass({
    member: worker,
    classification: "PROJECT_RESTRICTED",
    resourceProjectId: 12,
    projectMembershipIds: new Set([12]),
  }), true);
  assert.equal(canAccessAgoojiyeDataClass({ member: worker, classification: "MANAGEMENT_CONFIDENTIAL" }), false);
  assert.equal(canAccessAgoojiyeDataClass({ member: { accessLevel: 7 }, classification: "SUPER_ADMIN_RESTRICTED" }), true);
});

test("unknown classification labels fail closed", () => {
  assert.equal(canAccessAgoojiyeDataClass({ member: { accessLevel: 7 }, classification: "UNMAPPED_SECRET" }), false);
});

test("administrative assistant keeps legacy routes internal and exposes one AGOOJIYE identity", () => {
  const routeSource = readFileSync(new URL("../server/routes/agoojye-workos.ts", import.meta.url), "utf8");
  const provisionSource = readFileSync(new URL("../scripts/provision-agoojiye-workos.ts", import.meta.url), "utf8");
  assert.match(routeSource, /\["\/assistant", "\/howji"\]/);
  assert.match(routeSource, /Synthèse quotidienne AGOOJIYE/);
  assert.doesNotMatch(routeSource, /Synthèse quotidienne HOWJI|HOWJI n'est|Action HOWJI/);
  assert.match(provisionSource, /name: "AGOOJIYE — Assistant IA"/);
  assert.doesNotMatch(provisionSource, /name: "HOWJI|body: "HOWJI/);
});

test("only the principal super-admin sees the assistant approval control", () => {
  const source = readFileSync(new URL("../client/src/pages/agoojye/AgoojiyeWorkosAdminPage.tsx", import.meta.url), "utf8");
  assert.match(source, /data\.currentUser\.superAdmin && action\.status === "awaiting_approval"/);
  assert.match(source, /assistant\/actions\/\$\{actionId\}\/approve/);
  assert.match(source, /action\.status === "approved" && action\.requiresApproval/);
  assert.match(source, /Action approuvée\. Toute exécution reste séparée et auditée\./);
});
