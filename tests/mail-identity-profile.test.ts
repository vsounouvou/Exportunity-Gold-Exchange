import test from "node:test";
import assert from "node:assert/strict";
import { resolveAgentProfessionalProfile } from "../server/lib/mail/identityProfile";

test("resolveAgentProfessionalProfile returns fixed persona for known agent key", () => {
  const profile = resolveAgentProfessionalProfile({
    tenantKey: "bdo",
    tenantName: "Bourse de l'Or",
    agentKey: "samuel_mensah",
    preferredDomain: "boursedelor.com",
  });

  assert.equal(profile.displayName, "Samuel Mensah");
  assert.equal(profile.role, "Operations Coordinator");
  assert.equal(profile.emailAddress, "samuel.mensah@boursedelor.com");
});

test("Exportunity commercial mail is owned by Awa Kouadio", () => {
  const profile = resolveAgentProfessionalProfile({
    tenantKey: "exportunity",
    tenantName: "Exportunity",
    agentKey: "commercial",
    preferredDomain: "exportunity.net",
  });

  assert.equal(profile.displayName, "Awa Kouadio");
  assert.equal(profile.role, "Director of Commercial and Client Success");
  assert.equal(profile.emailAddress, "awa.kouadio@exportunity.net");
});

test("resolveAgentProfessionalProfile generates deterministic human fallback", () => {
  const profile = resolveAgentProfessionalProfile({
    tenantKey: "exportunity",
    tenantName: "Exportunity",
    agentKey: "ops",
    agentName: null,
    agentRole: null,
    preferredDomain: "exportunity.net",
  });

  assert.match(profile.emailAddress, /^[a-z]+\.[a-z]+@exportunity\.net$/);
  assert.ok(profile.displayName.split(" ").length >= 2);
  assert.ok(profile.role.length > 0);
});
