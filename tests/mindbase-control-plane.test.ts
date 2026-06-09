import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(file: string) {
  return readFileSync(path.resolve(process.cwd(), file), "utf8");
}

const landingSource = source("client/src/pages/mindbase/MindbaseHumanizedLandingPage.tsx");
const starterAgentsSource = source("client/src/pages/mindbase/starterAgents.ts");
const discoverSource = source("client/src/pages/mindbase/MindbaseDiscoverPage.tsx");
const mindbaseRouterSource = source("server/routes/mindbase.ts");
const organizationsSource = source("server/lib/mindbase/organizations.ts");
const schemaSource = source("db/schema/mindbase.ts");
const ensureTablesSource = source("server/lib/mindbase/ensureTables.ts");

test("mindbase landing keeps onboarding in the chat-first shell", () => {
  assert.match(landingSource, /mindbase_onboarding_session_v1/);
  assert.match(landingSource, /Command Center opened:/);
  assert.match(landingSource, /Workspace ID:/);
  assert.match(landingSource, /I need to save a real workspace before opening the command center/);
  assert.doesNotMatch(landingSource, /Draft local workspace/);
  assert.doesNotMatch(landingSource, /return <Redirect/);
});

test("mindbase landing persists a real launch workspace after signup", () => {
  assert.match(landingSource, /apiRequest\("\/api\/mindbase\/onboarding\/workspace"/);
  assert.match(landingSource, /applySavedLaunchWorkspace/);
  assert.match(landingSource, /Workspace saved:/);
  assert.match(landingSource, /AI team: \$\{record\.installedAgents\.length\} installed/);
  assert.match(landingSource, /mindbasePath\(workspaceRecord\.commandRoute\)/);
  assert.match(landingSource, /mindbasePath\("\/workspaces"\)/);
});

test("mindbase onboarding does not silently install the full team before confirmation", () => {
  assert.match(landingSource, /selectedAgentIds: \["adjoa"\]/);
  assert.match(landingSource, /AI team install requested:/);
  assert.match(landingSource, /No agent has been marked ready yet/);
  assert.match(landingSource, /I need a clear team choice before I install agents/);
  assert.match(landingSource, /describeOwnInputPrompt/);
  assert.match(mindbaseRouterSource, /const installStarterTeam =/);
  assert.match(mindbaseRouterSource, /!selectedAgentIds\.size && installStarterTeam/);
});

test("mindbase mobile tabs open real bottom sheets", () => {
  assert.match(landingSource, /activeTab === "chat" \? null : mobileSheetCopy\[activeTab\]/);
  assert.match(landingSource, /side="bottom"/);
  assert.match(landingSource, /Create a task draft/);
  assert.match(landingSource, /Browse agent marketplace/);
  assert.match(landingSource, /Upload documents/);
});

test("mindbase auth recovery stays inside chat", () => {
  assert.match(landingSource, /\/api\/mindbase\/auth\/login/);
  assert.match(landingSource, /\/api\/auth\/request-password-reset/);
  assert.match(landingSource, /Sign in with email/);
  assert.match(landingSource, /Forgot password/);
  assert.match(landingSource, /Forgot email/);
  assert.match(landingSource, /I cannot reveal account emails from chat/);
});

test("mindbase starter agents expose portraits, roles, and gated integrations", () => {
  assert.match(starterAgentsSource, /export const starterAgents/);
  for (const id of ["adjoa", "awa", "kwame", "aminata", "idriss", "nene"]) {
    assert.match(starterAgentsSource, new RegExp(`/${id}\\.png`));
    assert.ok(existsSync(path.resolve(process.cwd(), `client/public/images/agents/${id}.png`)), `${id} portrait asset missing`);
  }
  assert.match(landingSource, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(discoverSource, /MarketplaceAgentPortrait/);
  assert.match(discoverSource, /aria-label=\{`\$\{label\} avatar`\}/);
  assert.match(starterAgentsSource, /Executive Assistant/);
  assert.match(starterAgentsSource, /Operations Manager/);
  assert.match(starterAgentsSource, /Accounting Agent/);
  assert.match(starterAgentsSource, /integrationCards/);
  assert.match(starterAgentsSource, /fallback:/);
});

test("mindbase integration cards do not fake connected status without a start URL", () => {
  assert.match(landingSource, /connectUrl\?: string/);
  assert.match(landingSource, /const connectUrl = runtime\?\.connectUrl/);
  assert.match(landingSource, /Connection flow unavailable/);
  assert.match(landingSource, /window\.location\.assign\(connectUrl\)/);
  assert.match(mindbaseRouterSource, /connectUrl\?: string/);
});

test("mindbase onboarding endpoint creates organizations, workspaces, and starter installs", () => {
  assert.match(mindbaseRouterSource, /router\.post\("\/api\/mindbase\/onboarding\/workspace"/);
  assert.match(mindbaseRouterSource, /LAUNCH_STARTER_AGENTS/);
  assert.match(mindbaseRouterSource, /createMindbaseOrganization/);
  assert.match(mindbaseRouterSource, /mindbaseWorkspaceMembers/);
  assert.match(mindbaseRouterSource, /mindbaseWorkspaceAgents/);
  assert.match(mindbaseRouterSource, /requiredIntegrations: \[\.\.\.template\.requiredIntegrations\]/);
  assert.match(mindbaseRouterSource, /commandRoute: `\/app\/\$\{encodeURIComponent\(finalOrganization\.slug\)\}\/operations`/);
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
