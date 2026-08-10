import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("the industrial operating plan owns mission, objectives, and recurring execution reviews", () => {
  const plan = readRepoFile("server/lib/industrial/operatingPlan.ts");

  assert.match(plan, /Turn verified industrial demand in Benin into reliable sourcing/);
  assert.match(plan, /Build the verified industrial demand pipeline/);
  assert.match(plan, /Establish the verified supplier and factory network/);
  assert.match(plan, /Convert urgent spare-parts needs into controlled orders/);
  assert.match(plan, /Operate the scan-to-manufacture and quality pipeline/);
  assert.match(plan, /Build a disciplined industrial commercial pipeline/);
  assert.match(plan, /Make industrial supply and export execution reviewable/);
  assert.match(plan, /human_approval_required/);
  assert.match(plan, /industrialAgendaKey/);
  assert.match(plan, /FREQ=WEEKLY/);
});

test("agenda creation submits a real objective and hierarchy reads the same plan", () => {
  const agenda = readRepoFile("client/src/pages/AgendaPage.tsx");
  const operationsCenter = readRepoFile("client/src/pages/AITeamHubPage.tsx");
  const hierarchy = readRepoFile("client/src/pages/HierarchyPage.tsx");
  const auth = readRepoFile("server/routes/utils/auth.ts");

  assert.match(agenda, /objective_id: newObjectiveId/);
  assert.match(agenda, /Objective is required/);
  assert.match(agenda, /Select the objective this meeting advances/);
  assert.match(agenda, /\^fenou\$/i);
  assert.match(agenda, /"note_taker"/);
  assert.match(agenda, /Start in Operations Center/);
  assert.match(agenda, /selectedMeetingDetail\?\.participants/);
  assert.match(agenda, /selectedObjective\?\.title/);
  assert.match(agenda, /\/ai-team\?conversation=/);
  assert.match(agenda, /exportunity-operations-light/);
  assert.match(operationsCenter, /params\.get\("conversation"\)/);
  assert.match(operationsCenter, /setCurrentMeeting\(requestedRoom\)/);
  assert.match(hierarchy, /companyData\.vision/);
  assert.match(hierarchy, /active objectives/);
  assert.match(hierarchy, /setLocation\("\/goals"\)/);
  assert.doesNotMatch(hierarchy, /companyData\.goal \|\| ['"]Not set['"]/);
  assert.match(auth, /\(req as any\)\.adminUser = user;[\s\S]*\(req as any\)\.staffUser = user;/);
});

test("working agents expose a direct identity and face editor", () => {
  const team = readRepoFile("client/src/pages/OperationsAgentsPage.tsx");
  const profile = readRepoFile("client/src/pages/AgentProfileV2Page.tsx");
  const registry = readRepoFile("client/src/pages/AdminAgentsOsPage.tsx");
  const registryApi = readRepoFile("server/routes/admin-agents-os.ts");

  assert.match(team, /Team &amp; Agents/);
  assert.match(team, /Create and edit/);
  assert.match(team, /Edit identity &amp; face/);
  assert.match(team, /\/operations\/agents\/\$\{item\.id\}\?edit=1/);
  assert.match(profile, /Edit identity &amp; face/);
  assert.doesNotMatch(profile, /\{location\}<\/div>/);
  assert.match(registry, /runtime_agent_id/);
  assert.match(registry, /\/operations\/agents\/\$\{Number\(item\.runtime_agent_id\)\}\?edit=1/);
  assert.match(registryApi, /as runtime_agent_id/);
});

test("agent lists resolve the department selected in the identity editor", () => {
  const routes = readRepoFile("server/routes/agents-v2.ts");
  const team = readRepoFile("client/src/pages/OperationsAgentsPage.tsx");
  const profile = readRepoFile("client/src/pages/AgentProfileV2Page.tsx");

  assert.match(routes, /left join departments d on d\.id = a\.department_id/);
  assert.match(routes, /d\.name as department_name/);
  assert.match(routes, /as department_key/);
  assert.match(team, /item\.department_name \|\| item\.department_key/);
  assert.match(profile, /overview\.department_name \|\| overview\.department_key/);
});
