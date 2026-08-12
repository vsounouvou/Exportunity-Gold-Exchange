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

  assert.match(plan, /industrial demand across Cote d'Ivoire, Benin, and connected UAE supplier corridors/);
  assert.match(plan, /EXPORTUNITY_GLOBAL_MISSION/);
  assert.match(plan, /Trade\. Source\. Expand\. Operate\./);
  assert.match(plan, /masterBrand: "Exportunity \| AI"/);
  assert.match(plan, /operatingTerritories: \["Global network", "Cote d'Ivoire", "Benin", "United Arab Emirates"\]/);
  assert.match(plan, /activeOperatingCorridors: \["Cote d'Ivoire", "Benin", "United Arab Emirates"\]/);
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
  assert.match(operationsCenter, /isArchivedTestMeeting/);
  assert.match(operationsCenter, /\\bsmoke\\b\|safe to archive/);
  assert.match(operationsCenter, /import ReactMarkdown from "react-markdown"/);
  assert.match(operationsCenter, /function OperationsMessageContent/);
  assert.match(operationsCenter, /<OperationsMessageContent content=\{msg\.content\}/);
  assert.match(operationsCenter, /<OperationsMessageContent content=\{message\.content\}/);
  assert.match(operationsCenter, /<MessageAuditTrail metadata=\{msg\.metadata\} lightMode=\{useExportunityLightWorkspace\}/);
  assert.match(operationsCenter, /border-emerald-200 bg-emerald-50 text-emerald-800/);
  assert.match(operationsCenter, /border-amber-200 bg-amber-50 text-amber-900/);
  assert.match(operationsCenter, /data-testid="operations-center-workspace"/);
  assert.match(operationsCenter, /h-\[calc\(100dvh-var\(--admin-header-height\)-6\.125rem\)\]/);
  assert.match(operationsCenter, /md:h-\[calc\(100dvh-var\(--admin-header-height\)-2\.625rem\)\]/);
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

  assert.match(team, /Team & Agents/);
  assert.match(team, /Create and edit/);
  assert.match(team, /Edit identity & face/);
  assert.match(team, /\/operations\/agents\/\$\{item\.id\}\?edit=1/);
  assert.match(team, /\/operations\/agents\/\$\{item\.id\}\?tab=memory/);
  assert.match(team, /Memory & context/);
  assert.match(profile, /Edit identity &amp; face/);
  assert.match(profile, /new URLSearchParams\(window\.location\.search\)\.get\("tab"\)/);
  assert.match(profile, /selectProfileTab\("memory"\)/);
  assert.match(profile, /<Tabs value=\{activeTab\} onValueChange=\{selectProfileTab\}>/);
  assert.match(profile, /params\.delete\("edit"\)/);
  assert.match(profile, /setProfileEditorOpen\(open\)/);
  assert.doesNotMatch(profile, /\{location\}<\/div>/);
  assert.match(registry, /runtime_agent_id/);
  assert.match(registry, /getAgentAvatarUrl/);
  assert.match(registry, /Edit identity &amp; face/);
  assert.match(registry, /\/operations\/agents\/\$\{runtimeAgentId\}\?edit=1/);
  assert.match(registry, /\/operations\/agents\/\$\{runtimeAgentId\}\?tab=memory/);
  assert.match(registry, /More actions for \$\{item\.display_name\}/);
  assert.match(registry, /agents-os-secondary-action/);
  assert.match(registryApi, /as runtime_agent_id/);
});

test("Fenou joins Operations meetings and explicit user invitations bypass autonomous join policy", () => {
  const operationsCenter = readRepoFile("client/src/pages/AITeamHubPage.tsx");
  const routes = readRepoFile("server/routes.ts");

  assert.match(operationsCenter, /EXPORTUNITY_CORE_AGENT_KEYS = \["fenou", "ceo", "technical", "sourcing", "commercial"\]/);
  assert.match(routes, /source === "agent" && conversationGovernanceEnabled && !accountabilitySettings\.allowAutoJoin/);
  assert.match(routes, /Joined by explicit user invitation/);
  assert.match(routes, /allowLeadingBareMentions: true/);
  assert.match(routes, /Joined by direct user address/);
  assert.match(routes, /text: response,\s+allowHeuristics: false,/);
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

test("Exportunity admin navigation stays focused on industrial operations", () => {
  const tenantPolicy = readRepoFile("client/src/lib/tenantPolicy.ts");
  const adminLayout = readRepoFile("client/src/components/AdminLayout.tsx");
  const routes = readRepoFile("client/src/navigation/routeRegistry.ts");
  const exportunityNavRoutes = tenantPolicy.match(/const EXPORTUNITY_ADMIN_NAV_ROUTES = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";

  assert.match(tenantPolicy, /EXPORTUNITY_ADMIN_NAV_ROUTES/);
  assert.match(tenantPolicy, /export function isTenantAdminNavVisible/);
  assert.match(tenantPolicy, /tenantKey !== "exportunity"/);
  assert.doesNotMatch(exportunityNavRoutes, /"\/admin\/met"/);
  assert.doesNotMatch(exportunityNavRoutes, /"\/admin\/vs"/);
  assert.match(adminLayout, /isTenantAdminNavVisible\(item\.path, tenant\.key\)/);
  assert.match(adminLayout, /tenant\.key === "exportunity"\s*\? \[\]/);
  assert.match(adminLayout, /mt-3 flex flex-col gap-2 sm:hidden/);
  assert.match(adminLayout, /hidden sm:block[\s\S]*<LocaleSwitcher compact \/>/);
  assert.match(adminLayout, /hidden sm:block[\s\S]*<TenantSwitcher \/>/);
  assert.match(routes, /title: "Video meetings"/);
});

test("Exportunity dashboard prioritizes live industrial operations and readable integration health", () => {
  const dashboardRouter = readRepoFile("client/src/pages/AdminDashboardPage.tsx");
  const dashboard = readRepoFile("client/src/pages/exportunity/ExportunityAdminDashboardPage.tsx");
  const twilio = readRepoFile("client/src/pages/AdminTwilioControlCenterPage.tsx");
  const chairmanDock = readRepoFile("client/src/components/ChairmanChatDock.tsx");

  assert.match(dashboardRouter, /tenant\?\.key === "exportunity"/);
  assert.match(dashboardRouter, /<ExportunityAdminDashboardPage \/>/);
  assert.match(dashboard, /Operations priority center/);
  assert.match(dashboard, /\/api\/task-lifecycle\/company/);
  assert.match(dashboard, /\/api\/actions\/decisions\?limit=200/);
  assert.match(dashboard, /\/api\/places\/config/);
  assert.match(dashboard, /\/api\/admin\/twilio\/status/);
  assert.match(dashboard, /What needs attention now/);
  assert.match(dashboard, /browserApiKeyPresent/);
  assert.match(dashboard, /mapRenderer === "google_maps"/);
  assert.match(dashboard, /Operations meeting follow-up/);
  assert.match(twilio, /function HealthPill/);
  assert.match(twilio, /function choiceButtonClass/);
  assert.match(twilio, /bg-emerald-50 text-emerald-800/);
  assert.match(twilio, /bg-amber-50 text-amber-900/);
  assert.match(chairmanDock, /bottom-32 right-5/);
  assert.match(chairmanDock, /const COLLAPSED_DOCK_HEIGHT = 68/);
  assert.match(chairmanDock, /snapDockToBottom[\s\S]*collapsed: true/);
  assert.match(chairmanDock, /Minimize assistant at the bottom/);
  assert.match(chairmanDock, /aria-label="Assistant placement controls"/);
  assert.match(chairmanDock, /aria-label="Dock assistant to the right side"/);
  assert.match(chairmanDock, /<PanelBottom className="h-4 w-4"/);
  assert.match(chairmanDock, /isWorkSurface && current\.collapsed/);
  assert.match(chairmanDock, /DOCK_OPEN_STORAGE_KEY/);
  assert.match(chairmanDock, /readStoredDockOpen/);
  assert.match(
    chairmanDock,
    /localStorage\.setItem\(DOCK_OPEN_STORAGE_KEY, String\(isOpen\)\)/,
  );
});

test("People and Access is tenant scoped and exposes real account controls", () => {
  const management = readRepoFile("server/routes/admin-management.ts");
  const passwordSetup = readRepoFile("server/routes/password-setup.ts");
  const people = readRepoFile("client/src/pages/AdminUserManagementPage.tsx");
  const hierarchy = readRepoFile("client/src/pages/HierarchyPage.tsx");

  assert.match(management, /eq\(userTenantRoles\.tenantId, tenantId\)/);
  assert.match(management, /\.from\(userTenantRoles\)[\s\S]*\.innerJoin\(eceUsers/);
  assert.doesNotMatch(management, /router\.get\("\/users"[\s\S]*db\.query\.eceUsers\.findMany/);
  assert.match(passwordSetup, /User not found for this tenant/);
  assert.match(passwordSetup, /eq\(userTenantRoles\.userId, userId\)/);
  assert.match(people, /People & access/);
  assert.match(people, /method: "PATCH"/);
  assert.match(people, /regenerate-setup-link/);
  assert.match(people, /Only users assigned to this tenant are shown/);
  assert.match(hierarchy, /Human oversight/);
  assert.match(hierarchy, /Manage people & access/);
  assert.match(hierarchy, /identity, face, instructions, model, permissions, and memory/);
  assert.match(hierarchy, /companyData\.metadata\?\.operatingTerritories/);
  assert.match(hierarchy, /Global trade mission/);
  assert.match(hierarchy, /Active corridors, not limits/);
  assert.match(hierarchy, /roleSeatOrganization\.summary\.total/);
  assert.match(hierarchy, /\/agents-os\?tab=organization/);
  assert.match(hierarchy, /for \(const department of departments \|\| \[\]\)/);
  assert.match(hierarchy, /apiRequest\("\/api\/admin\/agents-os\/role-seats", "GET"\)/);
  assert.match(hierarchy, /aria-label="Operating markets"/);
});
