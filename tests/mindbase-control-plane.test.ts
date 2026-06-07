import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(file: string) {
  return readFileSync(path.resolve(process.cwd(), file), "utf8");
}

const landingSource = source("client/src/pages/mindbase/MindbaseHumanizedLandingPage.tsx");
const starterAgentsSource = source("client/src/pages/mindbase/starterAgents.ts");
const mindbaseRouterSource = source("server/routes/mindbase.ts");
const organizationsSource = source("server/lib/mindbase/organizations.ts");
const schemaSource = source("db/schema/mindbase.ts");
const ensureTablesSource = source("server/lib/mindbase/ensureTables.ts");

test("mindbase landing keeps onboarding in the chat-first shell", () => {
  assert.match(landingSource, /mindbase_onboarding_session_v1/);
  assert.match(landingSource, /Command Center opened:/);
  assert.match(landingSource, /Workspace ID:/);
  assert.doesNotMatch(landingSource, /return <Redirect/);
});

test("mindbase landing persists a real launch workspace after signup", () => {
  assert.match(landingSource, /apiRequest\("\/api\/mindbase\/onboarding\/workspace"/);
  assert.match(landingSource, /applySavedLaunchWorkspace/);
  assert.match(landingSource, /Workspace saved:/);
  assert.match(landingSource, /AI team: \$\{record\.installedAgents\.length\} installed/);
  assert.match(landingSource, /mindbasePath\(launchWorkspace\.commandRoute\)/);
  assert.match(landingSource, /mindbasePath\("\/workspaces"\)/);
});

test("mindbase starter agents expose portraits, roles, and gated integrations", () => {
  assert.match(starterAgentsSource, /export const starterAgents/);
  assert.match(starterAgentsSource, /Executive Assistant/);
  assert.match(starterAgentsSource, /Operations Manager/);
  assert.match(starterAgentsSource, /Accounting Agent/);
  assert.match(starterAgentsSource, /integrationCards/);
  assert.match(starterAgentsSource, /fallback:/);
});

test("mindbase onboarding endpoint creates organizations, workspaces, and starter installs", () => {
  assert.match(mindbaseRouterSource, /router\.post\("\/api\/mindbase\/onboarding\/workspace"/);
  assert.match(mindbaseRouterSource, /LAUNCH_STARTER_AGENTS/);
  assert.match(mindbaseRouterSource, /createMindbaseOrganization/);
  assert.match(mindbaseRouterSource, /mindbaseWorkspaceMembers/);
  assert.match(mindbaseRouterSource, /mindbaseWorkspaceAgents/);
  assert.match(mindbaseRouterSource, /requiredIntegrations: \[\.\.\.template\.requiredIntegrations\]/);
  assert.match(mindbaseRouterSource, /commandRoute: `\/workspaces\?workspace=\$\{encodeURIComponent\(workspace\.id\)\}`/);
});

test("mindbase organization helper bootstraps draft HQ workspaces", () => {
  assert.match(organizationsSource, /export async function createMindbaseOrganization/);
  assert.match(organizationsSource, /export async function bootstrapMindbaseOrganizationForUser/);
  assert.match(organizationsSource, /name: `\$\{organizationName\} HQ`/);
  assert.match(organizationsSource, /status: "draft"/);
  assert.match(organizationsSource, /companyBrainProgress: 18/);
  assert.match(organizationsSource, /personaReadiness: 10/);
});

test("mindbase schema supports launch organization and workspace status", () => {
  assert.match(schemaSource, /export const mindbaseOrganizations = pgTable/);
  assert.match(schemaSource, /"draft",\s+"onboarding"/);
  assert.match(schemaSource, /status: text\("status"\)\.notNull\(\)\.default\("draft"\)/);
  assert.match(schemaSource, /companyBrainProgress/);
  assert.match(schemaSource, /personaReadiness/);
  assert.match(schemaSource, /requiredIntegrations/);
});

test("mindbase ensureTables adds launch columns idempotently", () => {
  assert.match(ensureTablesSource, /alter type mindbase_organization_status add value if not exists 'draft'/);
  assert.match(ensureTablesSource, /alter table mindbase_workspaces add column if not exists status/);
  assert.match(ensureTablesSource, /alter table mindbase_workspaces add column if not exists company_brain_progress/);
  assert.match(ensureTablesSource, /alter table mindbase_workspaces add column if not exists persona_readiness/);
  assert.match(ensureTablesSource, /alter table mindbase_workspace_agents add column if not exists required_integrations/);
});
