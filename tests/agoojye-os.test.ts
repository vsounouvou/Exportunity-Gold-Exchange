import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  canAccessAgoojiyeOsChannel,
  evaluateAgoojiyeOsInvitation,
  hasAgoojiyeOsPermission,
} from "../server/lib/agoojye/osPolicy";

const root = process.cwd();

test("AGOOJIYE OS invitation accepts only listed email while active", () => {
  const invitation = {
    status: "active",
    expiresAt: new Date(Date.now() + 60_000),
    useCount: 1,
    maxUses: 5,
    allowedEmails: ["regis@agoojiye.com", "vital@agoojiye.com"],
  };
  assert.equal(evaluateAgoojiyeOsInvitation(invitation, "REGIS@AGOOJIYE.COM").ok, true);
  assert.equal(evaluateAgoojiyeOsInvitation(invitation, "other@agoojiye.com").reason, "email_not_allowed");
});

test("AGOOJIYE OS invitation rejects expired and fully used links", () => {
  assert.equal(
    evaluateAgoojiyeOsInvitation(
      { status: "active", expiresAt: new Date(Date.now() - 1), useCount: 0, maxUses: 1, allowedEmails: ["vital@agoojiye.com"] },
      "vital@agoojiye.com",
    ).reason,
    "expired",
  );
  assert.equal(
    evaluateAgoojiyeOsInvitation(
      { status: "active", expiresAt: new Date(Date.now() + 60_000), useCount: 1, maxUses: 1, allowedEmails: ["vital@agoojiye.com"] },
      "vital@agoojiye.com",
    ).reason,
    "fully_used",
  );
});

test("AGOOJIYE OS permissions recognize explicit and leadership access", () => {
  assert.equal(hasAgoojiyeOsPermission({ accessLevel: 3, permissions: ["crm"] }, "crm"), true);
  assert.equal(hasAgoojiyeOsPermission({ accessLevel: 3, permissions: ["tasks"] }, "crm"), false);
  assert.equal(hasAgoojiyeOsPermission({ accessLevel: 6, permissions: [] }, "administration"), true);
});

test("AGOOJIYE OS channel visibility honors confidentiality and department", () => {
  const member = { accessLevel: 3, teamId: 7 };
  assert.equal(canAccessAgoojiyeOsChannel({ member, channel: { id: 1, confidentiality: 2 } }), true);
  assert.equal(canAccessAgoojiyeOsChannel({ member, channel: { id: 2, teamId: 7, confidentiality: 3 } }), true);
  assert.equal(canAccessAgoojiyeOsChannel({ member, channel: { id: 3, teamId: 8, confidentiality: 3 } }), false);
  assert.equal(canAccessAgoojiyeOsChannel({ member, channel: { id: 4, confidentiality: 5 }, memberChannelIds: new Set([4]) }), false);
});

test("AGOOJIYE OS acceptance locks invitation rows and requires tenant membership", () => {
  const source = fs.readFileSync(path.join(root, "server/routes/agoojye-os.ts"), "utf8");
  assert.match(source, /for update/i);
  assert.match(source, /ensureTenantUser/);
  assert.match(source, /requireMember/);
  assert.match(source, /evaluateAgoojiyeOsInvitation/);
  assert.match(source, /userTenantRoles/);
});

test("AGOOJIYE OS exposes governed AI, push and PWA surfaces", () => {
  const routeSource = fs.readFileSync(path.join(root, "server/routes/agoojye-os.ts"), "utf8");
  const workspaceSource = fs.readFileSync(path.join(root, "client/src/pages/agoojye/AgoojiyeOsPages.tsx"), "utf8");
  const adminSource = fs.readFileSync(path.join(root, "client/src/pages/agoojye/AgoojiyeWorkosAdminPage.tsx"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const swSource = fs.readFileSync(path.join(root, "client/public/sw.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "client/public/manifest-agoojiye-os.webmanifest"), "utf8"));
  assert.match(routeSource, /ai_read_only_search/);
  assert.match(routeSource, /AGOOJIYE — Assistant IA/);
  assert.match(workspaceSource, /AGOOJIYE — Assistant IA/);
  assert.match(adminSource, /AGOOJIYE — Assistant IA/);
  assert.doesNotMatch(workspaceSource, /Falovè|HOWJI|Agents IA|Collègues numériques|AGOOJIYE AI/);
  assert.doesNotMatch(adminSource, /Falovè|HOWJI|Agents IA|Collègues numériques|AGOOJIYE AI/);
  assert.doesNotMatch(readme, /governed HOWJI|agent HOWJI|Falovè/);
  assert.match(routeSource, /sendPushToUsers/);
  assert.match(swSource, /addEventListener\("push"/);
  assert.equal(manifest.start_url, "/workspace");
  assert.equal(manifest.lang, "fr");
});

test("AGOOJIYE assistant scopes project and decision results and records auditable evidence", () => {
  const source = fs.readFileSync(path.join(root, "server/routes/agoojye-os.ts"), "utf8");
  assert.match(source, /scopedProjectIds/);
  assert.match(source, /memberProjectIdSet/);
  assert.match(source, /permittedDecisions/);
  assert.match(source, /recordsAccessed/);
  assert.match(source, /humanApprovalRequired: false/);
  assert.match(source, /dataUpdated: false/);
});

test("AGOOJIYE OS supports operational message conversion", () => {
  const source = fs.readFileSync(path.join(root, "server/routes/agoojye-os.ts"), "utf8");
  assert.match(source, /messages\/:id\/to-task/);
  assert.match(source, /messages\/:id\/to-decision/);
  assert.match(source, /messages\/search/);
  assert.match(source, /messages\/:id\/reaction/);
});

test("AGOOJIYE OS administrative invitation creation is protected", () => {
  const source = fs.readFileSync(path.join(root, "server/routes/agoojye-os.ts"), "utf8");
  const adminUse = source.indexOf("adminApi.use(requireWorkosAdmin)");
  const invitationRoute = source.indexOf('adminApi.post("/invitations"');
  assert.ok(adminUse >= 0);
  assert.ok(invitationRoute > adminUse);
  assert.match(source, /adminApi\.use\(requireWorkosMember\)/);
});
