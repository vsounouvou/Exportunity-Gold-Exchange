import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requireDist = process.argv.includes("--dist");
const expectedSurface = "global-trade-network";
const expectedSchemaVersion = 2;
const expectedSurfaceRevision = 5;
const expectedHomepageSourceSha256 =
  "0c40d6a498340288889fc3d9e112df085442cbc0f7018ce41b131deb014c2816";

function readText(relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert.ok(fs.existsSync(absolutePath), `Missing required Exportunity surface file: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertSurfaceMarker(marker, label) {
  assert.equal(marker?.schemaVersion, expectedSchemaVersion, `${label} must use the current lock schema`);
  assert.equal(
    marker?.surfaceRevision,
    expectedSurfaceRevision,
    `${label} must identify the exact approved GTN recovery baseline`,
  );
  assert.equal(marker?.canonicalSurface, expectedSurface, `${label} must identify the Global Trade Network`);
  assert.equal(marker?.homepageComponent, "MarketplacePage", `${label} must identify MarketplacePage`);
  assert.equal(
    marker?.homepageSourceSha256,
    expectedHomepageSourceSha256,
    `${label} must pin the exact approved homepage source`,
  );
  assert.equal(marker?.legacyHomepageRetired, true, `${label} must retire the legacy homepage`);
}

const appSource = readText("client/src/App.tsx");
const globalCssSource = readText("client/src/index.css");
const legacyAiTeamSource = readText("client/src/pages/AITeamHubPage.tsx");
const viteConfigSource = readText("vite.config.ts");
const packageSource = readText("package.json");
const tenantBuildPrunerSource = readText("scripts/prune-tenant-build.mjs");
const serviceWorkerSource = readText("client/public/sw.js");
const buildStampSource = readText("scripts/stamp-build.mjs");
const homeSource = readText("client/src/pages/exportunity/MarketplacePage.tsx");
const marketplaceSource = homeSource;
const globalTradeSource = readText("client/src/pages/exportunity/GlobalTradeHomePage.tsx");
const exportunityManifest = readJson("client/public/manifest-exportunity.webmanifest");
assert.ok(
  !fs.existsSync(path.join(root, "client/src/pages/HomePage.tsx")),
  "The unreachable legacy company dashboard must stay physically removed",
);
const accessSource = readText("client/src/pages/exportunity/AccessPage.tsx");
const tradeOrdersSource = readText("client/src/pages/exportunity/TradeOrdersPage.tsx");
const governanceSource = readText("client/src/pages/exportunity/GovernancePages.tsx");
const accountSupportSource = readText("client/src/pages/exportunity/AccountSupportPages.tsx");
const applicationShellSource = readText("client/src/components/exportunity/ExportunityApplicationShell.tsx");
const setupPasswordSource = readText("client/src/pages/SetupPasswordPage.tsx");
const shopApplicationSource = readText("client/src/pages/ShopApplicationPage.tsx");
const deliveryApplicationSource = readText("client/src/pages/DeliveryApplicationPage.tsx");
const clientHunterSource = readText("client/src/pages/ClientHunterPage.tsx");
const governedCommerceWorkspaceSources = {
  governanceLog: readText("client/src/pages/AppGovernanceLogsPage.tsx"),
  investOpportunities: readText("client/src/pages/AppInvestOpportunitiesPage.tsx"),
  investOpportunityDetail: readText("client/src/pages/AppInvestOpportunityDetailPage.tsx"),
  investOnboarding: readText("client/src/pages/AppInvestOnboardingPage.tsx"),
  raiseCapital: readText("client/src/pages/AppRaiseCapitalApplyPage.tsx"),
  machineryFinancing: readText("client/src/pages/AppMachineryFinancingPage.tsx"),
  deliveryHub: readText("client/src/pages/DeliveryHubPage.tsx"),
  deliveryAgent: readText("client/src/pages/DeliveryAgentDashboard.tsx"),
  deliveryAdmin: readText("client/src/pages/DeliveryAdminDashboard.tsx"),
};
const notificationWorkspaceSources = {
  account: readText("client/src/pages/NotificationsPage.tsx"),
  operations: readText("client/src/pages/AdminNotificationsPage.tsx"),
  detail: readText("client/src/pages/AdminNotificationDetailPage.tsx"),
};
const mailWorkspaceSource = readText("client/src/pages/MailPage.tsx");
const meetWorkspaceSource = readText("client/src/pages/MeetRoomPage.tsx");
const agentEconomyWorkspaceSource = readText("client/src/pages/AgentEconomyDashboard.tsx");
const subscriptionPlansWorkspaceSource = readText("client/src/pages/SubscriptionPlansPage.tsx");
const knowledgeWorkspaceSource = readText("client/src/pages/KnowledgeBasePage.tsx");
const contactsWorkspaceSource = readText("client/src/pages/AdminContactsPage.tsx");
const expertAgentsWorkspaceSource = readText("client/src/pages/ExpertClonesHubPage.tsx");
const evidenceWorkspaceSource = readText("client/src/pages/AdminEvidencePage.tsx");
const workstationsWorkspaceSource = readText("client/src/pages/AdminWorkstationsPage.tsx");
const actionsWorkspaceSource = readText("client/src/pages/ActionsPage.tsx");
const operationsCenterSource = readText("client/src/pages/exportunity/ExportunityOperationsCenterPage.tsx");
const agendaSource = readText("client/src/pages/AgendaPage.tsx");
const peopleAccessSource = readText("client/src/pages/AdminUserManagementPage.tsx");
const organizationSource = readText("client/src/pages/HierarchyPage.tsx");
const organizationTreeSource = readText("client/src/components/OrgChartTree.tsx");
const systemHubSource = readText("client/src/pages/AdminSystemUpdatePage.tsx");
const websiteIntelligenceSource = readText("client/src/pages/AdminWebsiteIntelligencePage.tsx");
const agentsOsSource = readText("client/src/pages/AdminAgentsOsPage.tsx");
const internalAgentsSource = readText("client/src/pages/OperationsAgentsPage.tsx");
const agentProfileSource = readText("client/src/pages/AgentProfileV2Page.tsx");
const agentProfileDialogSource = readText("client/src/components/AgentProfileDialog.tsx");
const retiredAgentDetailSource = readText("client/src/pages/AgentDetailPage.tsx");
const agentsOsRoutesSource = readText("server/routes/admin-agents-os.ts");
const routeRegistrySource = readText("client/src/navigation/routeRegistry.ts");
const routeMetaSource = readText("client/src/lib/routeMeta.ts");
const tenantPolicySource = readText("client/src/lib/tenantPolicy.ts");
const adminLayoutSource = readText("client/src/components/AdminLayout.tsx");
const adminNavRegistrySource = readText("client/src/lib/adminNavRegistry.ts");
const walletStripSource = readText("client/src/components/agentic/WalletStrip.tsx");
const pwaInstallSource = readText("client/src/contexts/PwaInstallContext.tsx");
const industrialHubSource = readText("client/src/pages/exportunity/IndustrialHubPage.tsx");
const producerExchangeSource = readText("client/src/pages/exportunity/ProducerExchangePage.tsx");
const marketplaceCatalogSource = readText("client/src/content/exportunity/marketplaceCatalog.ts");
const routePolicySource = readText("client/src/lib/exportunityPublicRoutePolicy.ts");
const hostModeSource = readText("client/src/lib/hostMode.ts");
const runtimeSeoSource = readText("server/lib/seo/runtimeSeo.ts");
const serverRoutesSource = readText("server/routes.ts");
const orderRecordsRouteSource = readText("server/routes/exportunity-order-records.ts");
const errorBoundarySource = readText("client/src/components/ErrorBoundary.tsx");
const institutionFooterSource = readText("client/src/components/branding/InstitutionFooter.tsx");
const proTopBarSource = readText("client/src/components/agentic/AppProTopBar.tsx");
const proSideNavSource = readText("client/src/components/agentic/ProSideNav.tsx");
const proBottomNavSource = readText("client/src/components/agentic/AppProBottomNav.tsx");
const mobileBottomNavSource = readText("client/src/components/marketplace/MobileBottomNav.tsx");
const proCoreSurfaceSources = [
  "client/src/pages/AppProActionsPage.tsx",
  "client/src/pages/AppProChatsPage.tsx",
  "client/src/pages/AppProJoinPage.tsx",
  "client/src/pages/AppProMePage.tsx",
  "client/src/pages/AppProMoneyPage.tsx",
  "client/src/pages/AppProOrdersPage.tsx",
  "client/src/pages/AppProRoomPage.tsx",
  "client/src/pages/AppProWalletPage.tsx",
].map(readText);
const proExtendedSurfaceSources = {
  mine: readText("client/src/pages/AppProMineHomePage.tsx"),
  equipment: readText("client/src/pages/AppProEquipmentPage.tsx"),
  agents: readText("client/src/pages/AppProAgentsPage.tsx"),
  shop: readText("client/src/pages/AppProShopPage.tsx"),
};
const publicRoutesSource = readText("server/routes/public.ts");
const publicSurfaceContractsSource = readText("scripts/site/public-surface-contracts.ts");
const publicSurfaceQualityGateSource = readText("scripts/site/public-surface-quality-gate.mjs");
const marker = readJson("client/public/exportunity-surface.json");

assertSurfaceMarker(marker, "client/public/exportunity-surface.json");
assert.equal(
  sha256(homeSource),
  expectedHomepageSourceSha256,
  "MarketplacePage.tsx changed without an explicit public-surface lock revision",
);
assert.match(
  appSource,
  /tenant\.key === "exportunity"\) return <ExportunityMarketplacePage \/>/,
  "Exportunity root must render MarketplacePage",
);
assert.match(viteConfigSource, /__BUILD_INCLUDE_SHARED_STOREFRONT__:\s*JSON\.stringify\(buildAppName !== "exportunity"\)/);
assert.match(viteConfigSource, /__BUILD_INCLUDE_MINDBASE__:\s*JSON\.stringify\(buildAppName === "" \|\| buildAppName === "mindbase"\)/);
assert.match(viteConfigSource, /__BUILD_INCLUDE_OTHER_TENANT_UI__:\s*JSON\.stringify\(buildAppName !== "exportunity"\)/);
assert.match(appSource, /const includeSharedStorefront = __BUILD_INCLUDE_SHARED_STOREFRONT__/);
assert.match(appSource, /const includeMindbase = __BUILD_INCLUDE_MINDBASE__/);
assert.match(appSource, /const includeOtherTenantUi = __BUILD_INCLUDE_OTHER_TENANT_UI__/);
assert.match(
  appSource,
  /const ExportunityAdminDashboardPage = lazyPage\(\(\) => import\("@\/pages\/exportunity\/ExportunityAdminDashboardPage"\)\)[\s\S]*const AdminDashboardPage = includeOtherTenantUi[\s\S]*import\("@\/pages\/AdminDashboardPage"\)[\s\S]*: ExportunityAdminDashboardPage/,
  "The dedicated Exportunity build must bypass the generic legacy dashboard module",
);
assert.match(
  appSource,
  /const ExportunityOperationsCenterPage = lazyPage\(\(\) => import\("@\/pages\/exportunity\/ExportunityOperationsCenterPage"\)\)[\s\S]*const AITeamHubPage = includeOtherTenantUi[\s\S]*import\("@\/pages\/AITeamHubPage"\)[\s\S]*: ExportunityOperationsCenterPage/,
  "The dedicated Exportunity build must bypass the legacy AI Team renderer",
);
assert.match(appSource, /function TenantDashboardRoute\(\)[\s\S]*tenant\.key === "exportunity"[\s\S]*<ExportunityAdminDashboardPage \/>/);
assert.match(appSource, /function TenantOperationsCenterRoute\(\)[\s\S]*tenant\.key === "exportunity"[\s\S]*<ExportunityOperationsCenterPage \/>/);
assert.match(appSource, /<Route path="\/dashboard">[\s\S]*<TenantDashboardRoute \/>/);
assert.match(appSource, /<Route path="\/ai-team">[\s\S]*<TenantOperationsCenterRoute \/>/);
assert.match(appSource, /includeSharedStorefront[\s\S]*import\("@\/pages\/store\/StorePage"\)/);
assert.match(appSource, /includeMindbase[\s\S]*import\("@\/pages\/mindbase\/MindbaseLandingPage"\)/);
assert.match(appSource, /includeOtherTenantUi[\s\S]*import\("@\/pages\/bdo\/BdoAuthorityPages"\)/);
for (const diagnosticPage of [
  "QAMobilePage",
  "DebugLocationPage",
  "DebugHitTestPage",
  "PublicCadastreDemoPage",
]) {
  assert.match(
    appSource,
    new RegExp(`const ${diagnosticPage} = includeOtherTenantUi[\\s\\S]*import\\(\"@/pages/${diagnosticPage}\"\\)[\\s\\S]*ExcludedTenantPage`),
  );
}
assert.match(
  appSource,
  /const UnifiedAccessPage = includeOtherTenantUi[\s\S]*import\("@\/pages\/ECELoginPage"\)[\s\S]*import\("@\/pages\/exportunity\/AccessPage"\)/,
);
assert.match(
  appSource,
  /const InstallAppPage = includeOtherTenantUi[\s\S]*import\("@\/pages\/InstallAppPage"\)[\s\S]*import\("@\/pages\/exportunity\/InstallAppPage"\)/,
  "The dedicated Exportunity build must use the native install interface",
);
assert.match(appSource, /path="\/login" component=\{UnifiedAccessPage\}/);
assert.match(appSource, /path="\/register" component=\{UnifiedAccessPage\}/);
assert.match(
  appSource,
  /const MyOrdersPage = includeOtherTenantUi[\s\S]*import\("@\/pages\/MyOrdersPage"\)[\s\S]*import\("@\/pages\/exportunity\/TradeOrdersPage"\)/,
);
assert.match(
  appSource,
  /const GatewayPage = includeOtherTenantUi[\s\S]*import\("@\/pages\/GatewayPage"\)[\s\S]*ExcludedTenantPage/,
);
for (const [legacyPage, exportName] of [
  ["CompliancePage", "ExportunityCompliancePage"],
  ["TermsPage", "ExportunityTermsPage"],
  ["PrivacyPage", "ExportunityPrivacyPage"],
]) {
  assert.match(
    appSource,
    new RegExp(`const ${legacyPage} = includeOtherTenantUi[\\s\\S]*import\\(\"@/pages/${legacyPage}\"\\)[\\s\\S]*${exportName}`),
  );
}
for (const [legacyPage, exportName] of [
  ["AdminLoginPage", "ExportunityOperationsAccessPage"],
  ["ApplicationStatusPage", "ExportunityApplicationStatusPage"],
  ["SwitchSpacePage", "ExportunitySpaceExchangePage"],
]) {
  assert.match(
    appSource,
    new RegExp(`const ${legacyPage} = includeOtherTenantUi[\\s\\S]*import\\(\"@/pages/${legacyPage}\"\\)[\\s\\S]*${exportName}`),
  );
}
assert.match(packageSource, /build:prune-tenant-assets/);
assert.match(tenantBuildPrunerSource, /appName !== "exportunity"/);
assert.match(tenantBuildPrunerSource, /tenants\/\$\{entry\.name\}/);
assert.doesNotMatch(appSource, /@\/pages\/MarketingPage/);
assert.doesNotMatch(
  appSource,
  /ExportunityMarketing[A-Za-z]+Page|MarketingHomePage|isExportunityMarketingHost|ExportunityLegacyMarketplaceRoute|@\/pages\/MarketplacePage/,
  "Retired Exportunity marketing components must not remain importable from App.tsx",
);
assert.match(
  appSource,
  /path="\/marketplace-old" component=\{\(\) => <ExportunityIndustrialAliasRoute to="\/marketplace" \/>\}/,
  "The retired marketplace URL must resolve through the current tenant-aware surface",
);
assert.match(appSource, /path="\/marketplace" component=\{ExportunityMarketplaceRoute\}/);
assert.match(appSource, /import\("@\/pages\/exportunity\/MarketplacePage"\)/);
assert.match(homeSource, /data-testid="exportunity-marketplace"/);
assert.match(accessSource, /data-testid="exportunity-access-page"/);
assert.match(accessSource, /\/api\/ece\/auth\/login/);
assert.match(accessSource, /\/api\/ece\/applications\/submit/);
assert.match(accessSource, /"buyer" \| "supplier" \| "shareholder"/);
assert.match(accessSource, /\/tenants\/exportunity\/official\/logo-long-light\.png/);
assert.doesNotMatch(accessSource, /BOURSE DE L'OR|tenants\/bdo|MindBase/i);
assert.match(runtimeSeoSource, /"\/login": "Global Trade Network Access"/);
assert.match(accountSupportSource, /data-testid="exportunity-operations-access-page"/);
assert.match(accountSupportSource, /data-testid="exportunity-application-status-page"/);
assert.match(accountSupportSource, /data-testid="exportunity-space-exchange-page"/);
assert.match(accountSupportSource, /\/api\/ece\/auth\/login/);
assert.match(accountSupportSource, /\/api\/ece\/applications\/status/);
assert.match(accountSupportSource, /\/api\/ece\/auth\/exchange-space/);
assert.match(accountSupportSource, /targetTenant: "exportunity"/);
assert.match(accountSupportSource, /\/tenants\/exportunity\/official\/logo-long-light\.png/);
assert.doesNotMatch(accountSupportSource, /BOURSE DE L'OR|tenants\/bdo|MindBase|rayon1km|AppPro/i);
assert.doesNotMatch(appSource, /Report to Codex/);
assert.match(appSource, /Copy error details/);
assert.match(runtimeSeoSource, /"\/application-status": "Global Trade Network Access Request Status"/);
assert.match(runtimeSeoSource, /"\/admin\/login": "Global Trade Network Operations Access"/);
assert.match(proTopBarSource, /__BUILD_INCLUDE_OTHER_TENANT_UI__/);
assert.match(proTopBarSource, /\/tenants\/exportunity\/official\/favicon-64\.png/);
assert.match(proTopBarSource, /GTN Operations/);
assert.doesNotMatch(proTopBarSource, /Exportunity Pro|Bourse de l'Or|MindBase/i);
assert.match(proSideNavSource, /Global Trade Network/);
assert.match(proSideNavSource, /Exportunity · GTN/);
assert.doesNotMatch(proSideNavSource, /Exportunity Pro|Bourse de l'Or|MindBase/i);
assert.match(proBottomNavSource, /theme="gtn"/);
assert.match(mobileBottomNavSource, /theme\?: "dark" \| "gtn"/);
for (const source of proCoreSurfaceSources) {
  assert.match(source, /bg-\[#F7F8FA\]/);
  assert.doesNotMatch(source, /min-h-screen bg-gray-950|Bourse de l'Or|MindBase|bdo_pwa_/i);
}
assert.match(proCoreSurfaceSources[0], /\/api\/ece\/operations\/center/);
assert.match(proCoreSurfaceSources[1], /\/api\/ece\/inbox\/rooms/);
assert.match(proCoreSurfaceSources[4], /\/api\/ece\/money\/overview/);
assert.match(proCoreSurfaceSources[5], /\/api\/marketplace\/sellers/);
assert.match(proCoreSurfaceSources[6], /\/api\/ece\/inbox\/rooms/);
assert.match(proCoreSurfaceSources[7], /\/api\/ece\/money\/overview/);
assert.match(appSource, /path="\/inbox" component=\{\(\) => <Redirect to="\/pro\/chats" \/>\}/);
assert.match(
  appSource,
  /path="\/inbox\/:roomKey"[\s\S]*roomKey === "wallet"[\s\S]*"\/pro\/money"[\s\S]*roomSlugFromKey\(roomKey\)/,
);
assert.doesNotMatch(appSource, /@\/pages\/(?:InboxPage|RoomPage)|const (?:InboxPage|RoomPage)/);
assert.match(walletStripSource, /href = "\/pro\/money"/);
assert.match(pwaInstallSource, /__BUILD_APP_NAME__/);
assert.match(pwaInstallSource, /PWA_INSTALL_STORAGE_KEYS/);
assert.doesNotMatch(pwaInstallSource, /zone_install_prompt_installed|bdo_pwa_/i);
assert.match(clientHunterSource, /data-testid="exportunity-lead-operations-page"/);
assert.match(clientHunterSource, /--admin-header-height/);
assert.match(clientHunterSource, /\/api\/admin\/leads/);
assert.match(clientHunterSource, /\/api\/admin\/campaigns/);
assert.match(clientHunterSource, /\/api\/marketplace\/admin\/sourcing-requests/);
assert.doesNotMatch(clientHunterSource, /min-h-screen bg-gray-950|mockLeads|John Smith|Acme Corp|Bourse de l'Or|MindBase/i);
assert.match(appSource, /path="\/sales"[\s\S]*<ProtectedRoute>[\s\S]*<Redirect to="\/client-hunter" \/>/);
assert.doesNotMatch(appSource, /@\/pages\/SalesPage|const SalesPage/);
for (const source of Object.values(proExtendedSurfaceSources)) {
  assert.match(source, /bg-\[#F7F8FA\]/);
  assert.doesNotMatch(source, /min-h-screen bg-gray-950|Bourse de l'Or|MindBase/i);
}
assert.match(proExtendedSurfaceSources.mine, /\/api\/ece\/mine\/production\/today/);
assert.match(proExtendedSurfaceSources.equipment, /\/api\/payments\/escrow\/hold/);
assert.match(proExtendedSurfaceSources.equipment, /\/api\/payments\/escrow\/release/);
assert.match(proExtendedSurfaceSources.agents, /\/api\/ece\/agents\/hire/);
assert.match(proExtendedSurfaceSources.agents, /External actions are always approval-gated/);
assert.match(proExtendedSurfaceSources.shop, /setLocation\("\/apply\/shop"\)/);
assert.doesNotMatch(proExtendedSurfaceSources.shop, /\/api\/marketplace\/demo\/create-seller|createDemoSeller/);
assert.match(evidenceWorkspaceSource, /data-testid="exportunity-evidence-workspace"/);
assert.match(evidenceWorkspaceSource, /\/api\/admin\/evidence\?limit=100/);
assert.match(evidenceWorkspaceSource, /\/api\/admin\/evidence\/\$\{selectedRunId\}/);
assert.match(evidenceWorkspaceSource, /function redactForDisplay/);
assert.match(evidenceWorkspaceSource, /sensitiveEvidenceKey\.test\(key\)/);
assert.match(evidenceWorkspaceSource, /bg-\[#F7F8FA\]/);
assert.doesNotMatch(
  evidenceWorkspaceSource,
  /bg-gray-950|bg-gray-900|border-gray-800|text-gray-100|Bourse de l'Or|MindBase/i,
  "Execution evidence must use the current GTN workspace and redact sensitive result fields",
);
assert.match(workstationsWorkspaceSource, /data-testid="exportunity-workstations-workspace"/);
assert.match(workstationsWorkspaceSource, /\/api\/admin\/workstations/);
for (const operation of ["events", "sessions", "artifacts", "terminate-session", "reassign", "view-token", "network-policy"]) {
  assert.match(workstationsWorkspaceSource, new RegExp(`/api/workstations/[\\s\\S]*${operation}`));
}
assert.match(workstationsWorkspaceSource, /if \(window\.confirm\(prompt\)\) controlMutation\.mutate/);
assert.match(workstationsWorkspaceSource, /Terminate the active session/);
assert.match(workstationsWorkspaceSource, /Reassign this workstation/);
assert.match(workstationsWorkspaceSource, /function redactOperationalText/);
assert.match(workstationsWorkspaceSource, /complete replacement list/);
assert.match(workstationsWorkspaceSource, /Full egress exposes this runtime/);
assert.match(workstationsWorkspaceSource, /bg-\[#F7F8FA\]/);
assert.doesNotMatch(
  workstationsWorkspaceSource,
  /bg-gray-950|bg-gray-900|border-gray-800|text-gray-100|Bourse de l'Or|MindBase/i,
  "Workstation operations must use the current GTN workspace and explicit guarded controls",
);
assert.equal(
  fs.existsSync(path.join(root, "client/src/pages/AdminActionForgePage.tsx")),
  false,
  "The duplicate legacy Action Forge renderer must remain deleted",
);
assert.doesNotMatch(appSource, /AdminActionForgePage/);
assert.match(
  appSource,
  /path="\/admin\/action-forge"[\s\S]*<Redirect to="\/actions\?view=automations" \/>/,
  "The old Action Forge URL must resolve into the canonical action ledger",
);
assert.match(actionsWorkspaceSource, /data-testid="exportunity-automation-governance"/);
assert.match(actionsWorkspaceSource, /\/api\/action-forge\/requests\/\$\{selectedForgeId\}/);
assert.match(actionsWorkspaceSource, /\/api\/action-forge\/\$\{input\.id\}\/\$\{input\.action\}/);
assert.match(actionsWorkspaceSource, /selectedForgeStatus !== "APPROVED"/);
assert.match(actionsWorkspaceSource, /Rejection reason required/);
assert.match(actionsWorkspaceSource, /if \(window\.confirm\(prompt\)\) forgeTransitionMutation\.mutate/);
assert.match(actionsWorkspaceSource, /Server filesystem paths are intentionally not exposed here/);
assert.match(actionsWorkspaceSource, /bg-\[#f7f8fa\]/);
assert.doesNotMatch(actionsWorkspaceSource, /Bourse de l'Or|MindBase|Safe pipeline for creating missing actions|Create Forge Request/i);
const exportunityAdminNavBlock = tenantPolicySource.match(/const EXPORTUNITY_ADMIN_NAV_ROUTES = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
assert.doesNotMatch(exportunityAdminNavBlock, /\/admin\/action-forge/);
assert.match(routeRegistrySource, /"\/admin\/action-forge": \{ title: "Automation governance \(alias\)"[\s\S]*?kind: "hidden"/);
assert.doesNotMatch(adminLayoutSource, /Forge actions|إنشاء الإجراءات/);
assert.doesNotMatch(adminNavRegistrySource, /ACTION_FORGE_NAV_ITEM/);
assert.match(serviceWorkerSource, /const TENANT = "platform"/);
assert.match(serviceWorkerSource, /isApiRequest\(url\)[\s\S]*fetch\(request, \{ cache: "no-store" \}\)/);
assert.doesNotMatch(serviceWorkerSource, /API_CACHE|manifest-bdo|tenants\/bdo|const TENANT = "bdo"/);
assert.match(buildStampSource, /resolveServiceWorkerTenant/);
assert.match(buildStampSource, /updateSwVersion\(path\.join\(DIST_PUBLIC, "sw\.js"\), build\.buildId, APP_NAME\)/);
assert.equal(
  fs.existsSync(path.join(root, "client/src/pages/AdminDeveloperSettingsPage.tsx")),
  false,
  "The duplicate developer diagnostics renderer must remain deleted",
);
assert.equal(
  fs.existsSync(path.join(root, "client/src/pages/AdminMapSettingsPage.tsx")),
  false,
  "The unreachable legacy map settings renderer must remain deleted",
);
assert.doesNotMatch(appSource, /AdminDeveloperSettingsPage|AdminMapSettingsPage/);
assert.match(
  appSource,
  /path="\/admin\/settings\/developer"[\s\S]*<Redirect to="\/admin\/system\/update\?view=voice" \/>/,
  "The former developer URL must reuse the current system hub voice view",
);
assert.match(systemHubSource, /data-testid="exportunity-system-hub"/);
assert.match(systemHubSource, /bg-\[#f7f8fa\]/);
assert.match(systemHubSource, /\/api\/system\/version/);
assert.match(systemHubSource, /\/api\/admin\/transcription-jobs\?limit=20/);
assert.match(systemHubSource, /refetchInterval: false/);
assert.match(systemHubSource, /if \(!confirmed\) return/);
assert.match(systemHubSource, /Copy sanitized diagnostics/);
assert.match(systemHubSource, /server filesystem paths are reduced to asset names/i);
assert.doesNotMatch(
  systemHubSource,
  /Admin &gt; System|bg-gray-900|Generate Cadastre Demo Link|\/api\/admin\/demo-links|chairman\/quick-token|x-chairman-admin-override|Chairman Quick Chat|Voice Debug|qa-mobile|Bourse de l'Or|MindBase/i,
  "The system hub must not restore legacy diagnostics, demo-email, token, or cross-project controls",
);
for (const retiredWebsitePage of [
  "AdminSeoHealthPage.tsx",
  "AdminVisitsIntelligencePage.tsx",
  "AdminSeoAutopilotPage.tsx",
  "AdminUxAuditPage.tsx",
]) {
  assert.equal(
    fs.existsSync(path.join(root, "client/src/pages", retiredWebsitePage)),
    false,
    `${retiredWebsitePage} must remain deleted`,
  );
}
assert.doesNotMatch(appSource, /AdminSeoHealthPage|AdminVisitsIntelligencePage|AdminSeoAutopilotPage|AdminUxAuditPage/);
assert.match(appSource, /const AdminWebsiteIntelligencePage = lazyPage/);
assert.match(appSource, /path="\/admin\/seo"[\s\S]*?<AdminWebsiteIntelligencePage \/>/);
for (const [legacyRoute, view] of [
  ["/admin/website/seo", "seo"],
  ["/admin/website/visits", "visits"],
  ["/admin/website/seo-autopilot", "governance"],
  ["/admin/ux-audit", "navigation"],
]) {
  assert.match(
    appSource,
    new RegExp(`path="${legacyRoute.replaceAll("/", "\\/")}"[\\s\\S]*?<Redirect to="\\/admin\\/seo\\?view=${view}" \\/>`),
    `${legacyRoute} must resolve into the current Website Intelligence workspace`,
  );
}
assert.match(websiteIntelligenceSource, /data-testid="exportunity-website-intelligence"/);
assert.match(websiteIntelligenceSource, /bg-\[#f7f8fa\]/);
for (const endpoint of [
  "/api/admin/seo/issues",
  "/api/admin/seo/snapshots",
  "/api/admin/seo/scan",
  "/api/admin/seo/recommendations",
  "/api/admin/seo/patches",
  "/api/admin/telemetry/summary",
  "/api/admin/telemetry/sessions/recent",
  "/api/admin/ux-audit",
  "/api/admin/ia/pages-audit",
]) {
  assert.match(websiteIntelligenceSource, new RegExp(endpoint.replaceAll("/", "\\/")));
}
assert.match(websiteIntelligenceSource, /if \(window\.confirm\("Run an on-demand technical SEO scan/);
assert.match(websiteIntelligenceSource, /if \(window\.confirm\(prompt\)\) seoActionMutation\.mutate/);
assert.match(websiteIntelligenceSource, /function sanitizeEvidence/);
assert.match(websiteIntelligenceSource, /Session identifiers are intentionally not exposed/);
assert.doesNotMatch(websiteIntelligenceSource, /sessionId|window\.open|Open raw endpoint/);
assert.doesNotMatch(
  websiteIntelligenceSource,
  /bg-gray-950|bg-gray-900|border-gray-800|text-gray-100|Bourse de l'Or|MindBase/i,
  "Website Intelligence must use the current GTN workspace without legacy or cross-project UI",
);
assert.match(exportunityAdminNavBlock, /\/admin\/seo/);
for (const alias of ["website/seo", "website/seo-autopilot", "website/visits", "ux-audit"]) {
  assert.match(routeRegistrySource, new RegExp(`"\\/admin\\/${alias}":[\\s\\S]*?kind: "hidden"`));
}
assert.match(agentsOsSource, /data-testid="exportunity-agents-os-workspace"/);
assert.match(agentsOsSource, /bg-\[#f7f8fa\]/);
for (const endpoint of [
  "/api/admin/agents-os/summary",
  "/api/admin/agents-os/role-seats",
  "/api/admin/agents-os/workforce-requests",
  "/api/admin/agents-os/governance",
  "/api/admin/agents-os/import-runtime",
  "/api/admin/marketplace/agents",
]) {
  assert.match(agentsOsSource, new RegExp(endpoint.replaceAll("/", "\\/")));
}
for (const guard of [
  "confirmImportRuntimeAgents",
  "confirmCreateDraft",
  "confirmMarketplaceUpdate",
  "confirmAgentStatus",
  "confirmCloneAgent",
  "confirmPauseEmployee",
]) {
  assert.match(agentsOsSource, new RegExp(`const ${guard}`));
}
assert.doesNotMatch(agentsOsSource, /agents-os\/seed|boursedelor_core|Generate agents|agents-os-light|agents-os-secondary-action|<style>/i);
assert.doesNotMatch(
  agentsOsRoutesSource,
  /router\.post\("\/admin\/agents-os\/seed"|AGENTS_OS_SEED_PRESET|AGENTS_OS_SEED|agents_os_seed/i,
  "The retired workforce preset must not remain callable or write template records",
);
assert.doesNotMatch(
  agentsOsSource,
  /bg-gray-950|bg-gray-900|border-gray-800|text-gray-100|Bourse de l'Or|MindBase/i,
  "Agents OS must use native GTN classes and must not expose cross-project seeding",
);
assert.match(internalAgentsSource, /data-testid="exportunity-internal-agents-workspace"/);
assert.match(internalAgentsSource, /\/api\/v2\/agents/);
assert.match(internalAgentsSource, /\/api\/v2\/agents\/internal\/create/);
assert.match(internalAgentsSource, /if \(confirmed\) createMutation\.mutate\(\)/);
assert.match(internalAgentsSource, /No message, payment, contract, or external work will be started/);
assert.doesNotMatch(
  internalAgentsSource,
  /exportunity-operations-light|bg-gray-950|bg-gray-900|border-gray-800|text-gray-100|Bourse de l'Or|MindBase/i,
  "Internal Agents must use the current GTN workspace without the retired color-override shim",
);
assert.match(operationsCenterSource, /data-testid="exportunity-operations-center"/);
assert.match(operationsCenterSource, /bg-\[#F7F8FA\]/);
assert.match(operationsCenterSource, /Awa/);
assert.match(operationsCenterSource, /GDIZ/);
assert.match(operationsCenterSource, /\/pro\/operations\/general-operations/);
assert.match(operationsCenterSource, /data-testid="exportunity-requested-operation-room"/);
for (const endpoint of [
  "/api/v2/agents?domain=INTERNAL",
  "/api/chatrooms",
  "/api/actions/queue?limit=12",
  "/api/actions/decisions?limit=12",
]) {
  assert.ok(operationsCenterSource.includes(endpoint), endpoint);
}
assert.doesNotMatch(
  operationsCenterSource,
  /useMutation|exportunity-operations-light|bg-gray-9(?:00|50)|bg-slate-950|border-gray-8(?:00|50)|Bourse de l'Or|MindBase/i,
  "The GTN Operations Center must be a native coordinator without the retired renderer or duplicate writes",
);
assert.match(agendaSource, /data-testid="exportunity-agenda-workspace"/);
assert.match(agendaSource, /bg-\[#F7F8FA\]/);
assert.match(agendaSource, /Awa-qualified work/);
assert.match(agendaSource, /GDIZ sourcing/);
assert.match(agendaSource, /objective_id: newObjectiveId/);
assert.match(agendaSource, /const confirmMeetingCreation/);
assert.match(agendaSource, /const confirmMeetingStart/);
assert.match(agendaSource, /window\.confirm/);
assert.match(agendaSource, /onClick=\{confirmMeetingCreation\}/);
assert.match(agendaSource, /onClick=\{\(\) => confirmMeetingStart\(selectedEvent\)\}/);
assert.match(agendaSource, /min-w-\[760px\]/);
assert.doesNotMatch(
  agendaSource,
  /exportunity-operations-light|bg-gray-9(?:00|50)|bg-slate-950|border-gray-8(?:00|50)|text-gray-[1-5]00|Bourse de l'Or|MindBase/i,
  "Agenda must preserve governed records in a native GTN interface",
);
assert.doesNotMatch(
  globalCssSource,
  /exportunity-operations-light/,
  "The dedicated application stylesheet must not retain the retired runtime recoloring shim",
);
assert.doesNotMatch(legacyAiTeamSource, /legacy-operations-light\.css/);
assert.equal(
  fs.existsSync(path.join(root, "client", "src", "legacy-operations-light.css")),
  false,
  "The retired runtime recoloring stylesheet must stay deleted",
);
assert.match(peopleAccessSource, /data-testid="exportunity-people-access-workspace"/);
assert.match(peopleAccessSource, /bg-\[#F7F8FA\]/);
assert.match(peopleAccessSource, /const confirmSetupLinkGeneration/);
assert.match(peopleAccessSource, /const confirmAccessUpdate/);
assert.match(peopleAccessSource, /if \(confirmed\) setupLinkMutation\.mutate/);
assert.match(peopleAccessSource, /if \(confirmed\) updateUserMutation\.mutate/);
assert.match(organizationSource, /data-testid="exportunity-organization-workspace"/);
assert.match(organizationSource, /bg-\[#F7F8FA\]/);
assert.match(organizationSource, /const confirmCreateDepartment/);
assert.match(organizationSource, /const confirmDepartmentUpdate/);
assert.match(organizationSource, /window\.confirm\("Delete this department/);
assert.match(organizationTreeSource, /container\.scrollLeft = Math\.max\(0, \(container\.scrollWidth - container\.clientWidth\) \/ 2\)/);
assert.doesNotMatch(
  `${peopleAccessSource}\n${organizationSource}\n${organizationTreeSource}`,
  /exportunity-operations-light|bg-gray-9(?:00|50)|bg-slate-950|border-gray-8(?:00|50)|text-gray-[1-5]00|Bourse de l'Or|MindBase/i,
  "People access and organization must be native GTN surfaces without the retired compatibility renderer",
);
assert.match(agentProfileSource, /data-testid="exportunity-agent-profile-workspace"/);
assert.match(agentProfileSource, /bg-\[#f7f8fa\]/);
for (const endpoint of ["profile", "runtime-model", "memory", "skills", "test", "chat", "chat-sessions"]) {
  assert.match(
    agentProfileSource,
    new RegExp(`\\/api\\/v2\\/agents\\/\\$\\{agentId\\}\\/${endpoint}`),
    `Runtime agent profile must preserve the ${endpoint} API`,
  );
}
assert.match(agentProfileSource, /\/api\/v2\/agents\/\$\{agentId\}\/history\?type=TEST/);
assert.match(agentProfileSource, /\/api\/v2\/agents\/\$\{agentId\}\/history\?type=CHAT/);
assert.match(agentProfileSource, /\/api\/v2\/agents\/catalog\/skills/);
assert.match(agentProfileSource, /\/api\/v2\/agents\/catalog\/memory-templates/);
for (const guard of [
  "confirmRuntimeConfigUpdate",
  "confirmMemoryDeletion",
  "confirmSkillRemoval",
  "confirmAbilityTest",
  "confirmChatSessionArchive",
]) {
  assert.match(agentProfileSource, new RegExp(`const ${guard}`));
}
assert.match(agentProfileDialogSource, /data-testid="exportunity-agent-profile-editor"/);
assert.match(agentProfileDialogSource, /const confirmQueueProfileAction/);
assert.match(agentProfileDialogSource, /internal action queue for approval/);
assert.doesNotMatch(
  `${agentProfileSource}\n${agentProfileDialogSource}`,
  /exportunity-operations-light|bg-gray-9(?:00|50)|bg-slate-950|border-gray-8(?:00|50)|text-gray-[1-5]00|Bourse de l'Or|MindBase/i,
  "Runtime agent profile and editor must be native GTN surfaces without a retired compatibility renderer",
);
assert.match(retiredAgentDetailSource, /data-testid="exportunity-retired-agent-detail-redirect"/);
assert.match(retiredAgentDetailSource, /<Redirect to=\{`\/operations\/agents\/\$\{legacyAgentId\}`\}/);
assert.match(retiredAgentDetailSource, /<Redirect to=\{`\/operations\/agents\/\$\{runtimeAgentId\}`\}/);
assert.match(retiredAgentDetailSource, /<Redirect to="\/agents-os\?tab=registry"/);
assert.match(retiredAgentDetailSource, /apiRequest\(`\/api\/admin\/agents\/\$\{definitionId\}`, "GET"\)/);
assert.ok(
  retiredAgentDetailSource.split(/\r?\n/).length < 180,
  "The retired agent-detail adapter must stay small instead of regrowing a duplicate workspace",
);
assert.doesNotMatch(
  retiredAgentDetailSource,
  /useMutation|\/api\/email\/send|\/api\/comms\/send|\/api\/voice\/call|\/api\/admin\/mailboxes|exportunity-operations-light|bg-gray-9(?:00|50)|border-gray-8(?:00|50)|Bourse de l'Or|MindBase/i,
  "Retired agent-detail URLs must not retain duplicate write paths or the retired interface",
);
for (const retiredOrphanPage of [
  "ActionsPageEnhanced.tsx",
  "AgentsPage.tsx",
  "AgentManagementPage.tsx",
  "AgentMemoryPage.tsx",
  "AgentStorePage.tsx",
  "ChairmanDiaryPage.tsx",
  "ChatAndMeetingsPage.tsx",
  "CompanyProfilePage.tsx",
  "CreditsDashboardPage.tsx",
  "DashboardPageNew.tsx",
  "ECEAdminChatPage.tsx",
  "ECEBuyerChatPage.tsx",
  "ECEHomePage.tsx",
  "ECELandingPage.tsx",
  "ECEShareholderChatPage.tsx",
  "ECESupplierChatPage.tsx",
  "EmailAppPage.tsx",
  "ErrorDashboardPage.tsx",
  "ExpertMarketplacePage.tsx",
  "ExpertProfileDetailPage.tsx",
  "HomePageNew.tsx",
  "MasterCenterPage.tsx",
  "ChatroomPage.tsx",
  "MeetingDetails.tsx",
  "MeetingsPageNew.tsx",
  "MyBusinessPage.tsx",
  "PerformanceDiagnosticsPage.tsx",
  "PerformancePage.tsx",
  "ProductPublicPage.tsx",
  "TokenEconomyPage.tsx",
]) {
  assert.equal(
    fs.existsSync(path.join(root, "client/src/pages", retiredOrphanPage)),
    false,
    `${retiredOrphanPage} is an unreachable legacy renderer and must remain deleted`,
  );
}
assert.equal(
  fs.existsSync(path.join(root, "client/src/components/ECEChatInterface.tsx")),
  false,
  "The unreachable role-specific legacy chat interface must remain deleted",
);
assert.doesNotMatch(appSource, /ProductPublicPage|EmailAppPage|ECE(?:Admin|Buyer|Shareholder|Supplier)ChatPage/);
assert.match(routeMetaSource, /path: "\/product\/:slug"/);
assert.equal(
  fs.existsSync(path.join(root, "client/src/pages/AgentCommandCenterPage.tsx")),
  false,
  "The unreachable duplicate agent command center must remain deleted",
);
assert.doesNotMatch(appSource, /AgentCommandCenterPage/);
for (const [name, source] of Object.entries(governedCommerceWorkspaceSources)) {
  assert.match(source, /bg-\[#F7F8FA\]/, `${name} must use the current GTN workspace surface`);
  assert.doesNotMatch(
    source,
    /min-h-screen bg-gray-950|min-h-screen bg-black|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    `${name} must not retain the retired dark or cross-project interface`,
  );
}
assert.match(governedCommerceWorkspaceSources.governanceLog, /\/api\/ece\/audit\/logs/);
assert.match(governedCommerceWorkspaceSources.investOpportunities, /\/api\/invest\/opportunities/);
assert.match(governedCommerceWorkspaceSources.investOpportunityDetail, /\/api\/invest\/opportunities/);
assert.match(governedCommerceWorkspaceSources.investOnboarding, /\/api\/invest\/leads/);
assert.match(governedCommerceWorkspaceSources.raiseCapital, /\/api\/invest\/leads/);
assert.match(governedCommerceWorkspaceSources.machineryFinancing, /\/api\/invest\/opportunities/);
assert.match(governedCommerceWorkspaceSources.deliveryHub, /data-testid="exportunity-delivery-hub"/);
assert.match(governedCommerceWorkspaceSources.deliveryAgent, /\/api\/delivery\/wallets/);
assert.match(governedCommerceWorkspaceSources.deliveryAdmin, /\/api\/delivery\/dashboard\/stats/);
for (const [name, source] of Object.entries(notificationWorkspaceSources)) {
  assert.match(source, /bg-\[#F7F8FA\]/, `${name} notifications must use the current GTN workspace surface`);
  assert.doesNotMatch(
    source,
    /min-h-\[calc\(100vh-4rem\)\] bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    `${name} notifications must not retain the retired dark or cross-project interface`,
  );
}
assert.match(notificationWorkspaceSources.account, /\/api\/notifications\/read/);
assert.match(notificationWorkspaceSources.operations, /\/api\/admin\/notifications/);
assert.match(notificationWorkspaceSources.detail, /\/api\/admin\/notifications/);
assert.match(mailWorkspaceSource, /data-testid="exportunity-mail-workspace"/);
assert.match(mailWorkspaceSource, /\/api\/mail\/threads/);
assert.match(mailWorkspaceSource, /\/api\/mail\/work-orders/);
assert.match(mailWorkspaceSource, /\/api\/mail\/send/);
assert.match(mailWorkspaceSource, /\/api\/mail\/message\/\$\{selectedMessageId\}\/reply/);
assert.doesNotMatch(
  mailWorkspaceSource,
  /min-h-\[calc\(100vh-4rem\)\] bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
  "The mail workspace must not retain the retired dark or cross-project interface",
);
assert.match(meetWorkspaceSource, /data-testid="exportunity-meeting-workspace"/);
assert.match(meetWorkspaceSource, /\/api\/meet\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/join-token/);
assert.match(meetWorkspaceSource, /\/api\/meet\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/summary/);
assert.match(meetWorkspaceSource, /\/api\/meet\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/end/);
assert.match(meetWorkspaceSource, /\/api\/meet\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/lock/);
assert.doesNotMatch(
  meetWorkspaceSource,
  /min-h-\[calc\(100vh-4rem\)\] bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
  "The meeting workspace must not retain the retired dark or cross-project interface",
);
assert.match(agentEconomyWorkspaceSource, /data-testid="exportunity-agent-economy-workspace"/);
assert.match(agentEconomyWorkspaceSource, /\/api\/agent-economy\/command-center/);
assert.match(agentEconomyWorkspaceSource, /\/api\/agent-economy\/agents\/\$\{agentId\}\/super/);
assert.match(agentEconomyWorkspaceSource, /\/api\/agent-economy\/agents\/\$\{agentId\}\/freeze/);
assert.match(agentEconomyWorkspaceSource, /\/api\/agent-economy\/cron\/\$\{id\}\/toggle/);
assert.doesNotMatch(
  agentEconomyWorkspaceSource,
  /min-h-screen bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
  "The agent-economy workspace must not retain the retired dark or cross-project interface",
);
assert.match(subscriptionPlansWorkspaceSource, /data-testid="exportunity-subscription-plans-workspace"/);
assert.match(subscriptionPlansWorkspaceSource, /queryKey: \['\/api\/admin\/subscription-plans'\]/);
assert.match(subscriptionPlansWorkspaceSource, /apiRequest\('\/api\/admin\/subscription-plans'/);
assert.match(subscriptionPlansWorkspaceSource, /apiRequest\(`\/api\/admin\/subscription-plans\/\$\{id\}`/);
assert.match(subscriptionPlansWorkspaceSource, /bg-\[#F7F8FA\]/);
assert.doesNotMatch(
  subscriptionPlansWorkspaceSource,
  /DEFAULT_PLANS|seedPlansMutation|Seed Default Plans|min-h-screen bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
  "The subscription-plan workspace must not retain legacy seed data or a retired interface",
);
assert.doesNotMatch(subscriptionPlansWorkspaceSource, /parseFloat\(plan\.pricePerMonth\)/);
assert.match(knowledgeWorkspaceSource, /data-testid="exportunity-knowledge-workspace"/);
assert.match(knowledgeWorkspaceSource, /queryKey: \['\/api\/knowledge\/documents'\]/);
assert.match(knowledgeWorkspaceSource, /queryKey: \['\/api\/knowledge\/spaces'\]/);
for (const endpoint of ["upload", "note", "import-url", "generate-ai"]) {
  assert.match(knowledgeWorkspaceSource, new RegExp(`apiRequest\\("\\/api\\/knowledge\\/${endpoint}"`), endpoint);
}
assert.match(knowledgeWorkspaceSource, /bg-\[#F7F8FA\]/);
assert.doesNotMatch(
  knowledgeWorkspaceSource,
  /mockDocuments|mockSpaces|mockSources|Connected Sources|Create New Space|Open Full View|Summarize with AI|min-h-screen bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
  "The knowledge workspace must not contain fabricated integrations, dead actions, or a retired interface",
);
assert.match(contactsWorkspaceSource, /data-testid="exportunity-contacts-workspace"/);
assert.match(contactsWorkspaceSource, /apiRequest\(`\/api\/tenant\/contacts\$\{suffix/);
assert.match(contactsWorkspaceSource, /\/api\/tenant\/contacts\/diagnostics/);
assert.match(contactsWorkspaceSource, /\/api\/admin\/contacts\/imports\?limit=100/);
assert.match(contactsWorkspaceSource, /\/api\/tenant\/contacts\/import\/csv/);
assert.match(contactsWorkspaceSource, /\/api\/admin\/contacts\/capture/);
assert.match(contactsWorkspaceSource, /\/api\/admin\/contacts\/\$\{selectedContact\.id\}\/merge/);
assert.match(contactsWorkspaceSource, /window\.confirm\(`Mark \$\{selectedContact\.displayName\} as do-not-contact/);
assert.match(contactsWorkspaceSource, /window\.confirm\(`Rollback import batch/);
assert.match(contactsWorkspaceSource, /const \[captureSave, setCaptureSave\] = useState\(false\)/);
assert.match(contactsWorkspaceSource, /xl:grid-cols-\[minmax\(0,1fr\)_420px\]/);
assert.match(contactsWorkspaceSource, /bg-\[#F7F8FA\]/);
assert.doesNotMatch(
  contactsWorkspaceSource,
  /claim-legacy|force-claim|Claim Legacy|Force Claim|value="segments"|value="campaigns"|Start Outreach|min-h-screen bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
  "The contact workspace must not expose legacy ownership controls, dead campaign tabs, or a retired interface",
);
assert.match(expertAgentsWorkspaceSource, /data-testid="exportunity-expert-agents-workspace"/);
assert.match(expertAgentsWorkspaceSource, /\/api\/expert-clones\/profiles/);
assert.match(expertAgentsWorkspaceSource, /\/api\/expert-clones\/companies\/\$\{effectiveCompanyId\}\/assignments/);
assert.match(expertAgentsWorkspaceSource, /\/api\/expert-clones\/assignments\/\$\{assignmentId\}\/\$\{action\}/);
assert.match(expertAgentsWorkspaceSource, /\/api\/companies\/\$\{effectiveCompanyId\}\/agents/);
assert.match(expertAgentsWorkspaceSource, /profile\.visibility === "public_marketplace"/);
assert.match(expertAgentsWorkspaceSource, /profile\.longDescription \|\| profile\.bio/);
assert.match(expertAgentsWorkspaceSource, /profile\.skills/);
assert.match(expertAgentsWorkspaceSource, /function exactDecimal/);
assert.match(expertAgentsWorkspaceSource, /window\.confirm\(`Assign \$\{profile\.displayName\}/);
assert.match(expertAgentsWorkspaceSource, /if \(window\.confirm\(prompt\)\) onStatusChange\(action\)/);
assert.match(expertAgentsWorkspaceSource, /assignment\.status !== "terminated"/);
assert.match(routeRegistrySource, /"\/expert-clones": \{ title: "Expert agents"/);
assert.doesNotMatch(
  expertAgentsWorkspaceSource,
  /profile\.visibility === ['"]public['"]|case ['"]complete['"]|case ['"]in_progress['"]|\n  description: string;|capabilities: string\[\]|parseFloat|Browse Expert Clones|My Assigned Clones|Assign to Company|min-h-\[calc\(100vh-4rem\)\] bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
  "The expert-agent workspace must use the current profile schema, exact display values, and the GTN interface",
);
assert.match(applicationShellSource, /data-testid=\{testId\}/);
assert.match(applicationShellSource, /Global Trade Network/);
assert.match(applicationShellSource, /\/tenants\/exportunity\/official\/logo-long-light\.png/);
assert.match(applicationShellSource, /bg-\[#F7F8FA\]/);
assert.doesNotMatch(applicationShellSource, /bg-gray-950|bg-\[#090d16\]|Bourse de l'Or|MindBase/i);
assert.match(setupPasswordSource, /data-testid="exportunity-setup-password-page"/);
assert.match(setupPasswordSource, /\/api\/auth\/setup-password/);
assert.match(setupPasswordSource, /resolveSetupPasswordPostSetupPath/);
assert.match(setupPasswordSource, /\/tenants\/exportunity\/official\/logo-long-light\.png/);
assert.match(setupPasswordSource, /bg-\[#F7F8FA\]/);
assert.match(shopApplicationSource, /ExportunityApplicationConversation/);
assert.match(shopApplicationSource, /testId="exportunity-seller-application"/);
assert.match(shopApplicationSource, /\/api\/admin\/applications\/shop\/chat/);
assert.match(shopApplicationSource, /apiRequest\("\/api\/admin\/applications\/shop"/);
assert.match(deliveryApplicationSource, /ExportunityApplicationConversation/);
assert.match(deliveryApplicationSource, /testId="exportunity-delivery-application"/);
assert.match(deliveryApplicationSource, /\/api\/admin\/applications\/delivery\/chat/);
assert.match(deliveryApplicationSource, /apiRequest\("\/api\/admin\/applications\/delivery"/);
for (const source of [setupPasswordSource, shopApplicationSource, deliveryApplicationSource]) {
  assert.doesNotMatch(source, /bg-gray-950|bg-\[#090d16\]|bg-\[#0f1729\]|Bourse de l'Or|MindBase/i);
}
assert.match(tradeOrdersSource, /data-testid="exportunity-trade-orders-page"/);
assert.match(tradeOrdersSource, /data-testid="exportunity-order-record"/);
assert.match(tradeOrdersSource, /\/api\/exportunity\/order-records/);
assert.match(tradeOrdersSource, /BigInt\(match\[2\]\)/);
assert.doesNotMatch(
  tradeOrdersSource,
  /BOURSE DE L'OR|tenants\/bdo|MindBase|\/api\/marketplace\/buyer\/orders|pay-with-wallet|KkiapayCheckoutButton/i,
);
assert.match(orderRecordsRouteSource, /router\.get\("\/", ensureTenantUser/);
assert.match(orderRecordsRouteSource, /router\.get\("\/:orderNumber", ensureTenantUser/);
assert.match(orderRecordsRouteSource, /eq\(marketplaceOrders\.tenantId, tenant\.id\)/);
assert.match(orderRecordsRouteSource, /ownershipPredicate\(viewer\)/);
assert.doesNotMatch(orderRecordsRouteSource, /marketplaceOrders\.buyerUserId/);
assert.doesNotMatch(orderRecordsRouteSource, /router\.(?:post|put|patch|delete)\(/);
assert.match(serverRoutesSource, /"\/api\/exportunity\/order-records", exportunityOrderRecordsRouter/);
assert.match(runtimeSeoSource, /"\/orders": "Global Trade Network Order Records"/);
assert.match(governanceSource, /data-testid=\{PAGE_META\[pageKey\]\.testId\}/);
assert.match(governanceSource, /exportunity-privacy-page/);
assert.match(governanceSource, /exportunity-terms-page/);
assert.match(governanceSource, /exportunity-compliance-page/);
assert.match(governanceSource, /\/tenants\/exportunity\/official\/logo-long-light\.png/);
assert.match(governanceSource, /meta\[name="description"\]/);
assert.doesNotMatch(governanceSource, /BOURSE DE L'OR|tenants\/bdo|MindBase/i);
assert.match(routePolicySource, /path === "\/gateway"\) return "\/"/);
assert.doesNotMatch(errorBoundarySource, /Bourse de l'Or|Report to Codex/i);
assert.match(errorBoundarySource, /Global Trade Network/);
assert.doesNotMatch(institutionFooterSource, /Bourse de l'Or|MindBase/i);
assert.match(runtimeSeoSource, /"\/cadre-conformite": "Global Trade Network Governance and Compliance"/);
assert.match(globalTradeSource, /Exportunity global trade network/);
assert.match(globalTradeSource, /Trade\. Source\. Expand\. Operate\./);
assert.match(globalTradeSource, /href="\/marketplace"/);
assert.doesNotMatch(homeSource, /Platforms for trade, gold, machinery, and execution\./);
assert.match(marketplaceSource, /data-testid="exportunity-marketplace"/);
assert.match(marketplaceSource, /<Circle/);
assert.match(marketplaceSource, /\/api\/marketplace\/buyer\/nearby/);
assert.match(marketplaceSource, /\/api\/industrial\/factories/);
assert.match(marketplaceSource, /\/api\/industrial\/catalog/);
assert.match(marketplaceSource, /Approved seller listing/);
assert.match(marketplaceSource, /Documented reference; supplier and stock to qualify/);
assert.equal(exportunityManifest.start_url, "/marketplace");
assert.match(exportunityManifest.description, /proximity-first marketplace/i);
assert.doesNotMatch(
  marketplaceSource,
  /BOURSE DE L'OR|tenants\/bdo|MindBase|ExportunityNeighbourhoodCommerce|ExportunityConversationalCommerce|\/api\/marketplace\/buyer\/orders|pay-with-wallet/i,
);
assert.match(industrialHubSource, /African Industrial Sourcing \| Exportunity/);
assert.match(industrialHubSource, /African Industrial Network Map \| Exportunity/);
assert.match(producerExchangeSource, /African Producer Exchange \| Exportunity/);
assert.doesNotMatch(industrialHubSource, /BOURSE DE L'OR/i);
assert.doesNotMatch(producerExchangeSource, /BOURSE DE L'OR/i);
assert.match(marketplaceCatalogSource, /id: "gtn-operations"/);
assert.match(marketplaceCatalogSource, /Exportunity AI Operations/);
assert.match(marketplaceCatalogSource, /Exportunity-native agents/);
assert.doesNotMatch(marketplaceCatalogSource, /MindBase|mindbase\.cloud|id: "mindbase"/i);
assert.match(routePolicySource, /const EXPORTUNITY_PLATFORM_HOSTS = EXPORTUNITY_PUBLIC_HOSTS/);
assert.doesNotMatch(routePolicySource, /isExportunityMarketingHostname/);
assert.doesNotMatch(hostModeSource, /isExportunityMarketingHost/);
assert.doesNotMatch(runtimeSeoSource, /isExportunityMarketingHost|marketingTitleMap|marketingDescriptionMap/);
assert.doesNotMatch(publicRoutesSource, /isExportunityPublicMarketingHost|marketingHost/);
assert.match(publicRoutesSource, /const EXPORTUNITY_CANONICAL_HOST = "exportunity\.net"/);
assert.match(publicSurfaceContractsSource, /PUBLIC_SURFACE_CONTRACTS/);
assert.doesNotMatch(publicSurfaceContractsSource, /\/company|\/what-we-do|\/operating-stack|\/work-with-us/);
assert.match(publicSurfaceQualityGateSource, /STARTUP_MODE: "public-surface-audit"/);
assert.doesNotMatch(publicSurfaceQualityGateSource, /marketing-audit|MARKETING_AUDIT/);
for (const canonicalPath of [
  "/trade",
  "/industrial",
  "/producer-exchange",
  "/ai-team",
]) {
  assert.match(publicRoutesSource, new RegExp(`"${canonicalPath}"`));
}

const retiredPageDirectory = path.join(root, "client", "src", "pages", "exportunity");
const retiredRendererPages = fs
  .readdirSync(retiredPageDirectory)
  .filter((entry) => /^Marketing.*Page\.tsx$/.test(entry));
assert.deepEqual(
  retiredRendererPages,
  [],
  "Retired Exportunity corporate renderer pages must be deleted from current source",
);
assert.equal(
  fs.existsSync(path.join(root, "client", "public", "brand-assets", "generated")),
  false,
  "Retired generated corporate-marketing artwork must be deleted from source",
);
for (const relativePath of [
  "client/src/components/exportunity/MarketingShell.tsx",
  "client/src/components/exportunity/MarketingChatDesk.tsx",
  "client/src/components/exportunity/PlatformModulePage.tsx",
  "client/src/pages/MarketplacePage.tsx",
  "client/src/content/marketing/pageContracts.ts",
  "client/src/content/marketing/site.ts",
  "client/src/content/marketing/vitrine.ts",
  "client/src/content/platformModules.ts",
  "content/marketing/site.json",
  "scripts/site/audit-site.ts",
  "scripts/site/marketing-quality-gate.mjs",
  "client/src/components/exportunity/InvestmentLeadForm.tsx",
  "client/src/components/exportunity/PlatformExecutionDiagram.tsx",
  "client/src/components/exportunity/PlatformProofGrid.tsx",
  "client/src/components/exportunity/ProofPanel.tsx",
  "client/src/components/exportunity/invest-ui.tsx",
  "client/src/components/exportunity/marketing-ui.tsx",
  "client/src/components/exportunity/useMarketingLinks.ts",
  "client/src/pages/MarketingPage.tsx",
  "client/src/pages/AppProInboxPage.tsx",
  "client/src/pages/AppProOperationsPage.tsx",
  "client/src/pages/AppProThreadsPage.tsx",
  "client/src/pages/InboxPage.tsx",
  "client/src/pages/RoomPage.tsx",
  "client/src/pages/SalesPage.tsx",
]) {
  assert.equal(
    fs.existsSync(path.join(root, relativePath)),
    false,
    `Retired Exportunity renderer source must not exist: ${relativePath}`,
  );
}

if (requireDist) {
  const distMarker = readJson("dist/public/exportunity-surface.json");
  const build = readJson("dist/public/build.json");
  const distExportunityManifest = readJson("dist/public/manifest-exportunity.webmanifest");
  assertSurfaceMarker(distMarker, "dist/public/exportunity-surface.json");
  assert.equal(distExportunityManifest.start_url, "/marketplace");
  assert.match(distExportunityManifest.description, /proximity-first marketplace/i);
  assert.equal(build?.publicSurface, expectedSurface, "dist/public/build.json must stamp the canonical surface");
  assert.equal(
    build?.publicSurfaceRevision,
    expectedSurfaceRevision,
    "dist/public/build.json must stamp the exact approved surface revision",
  );
  assert.equal(
    build?.homepageSourceSha256,
    expectedHomepageSourceSha256,
    "dist/public/build.json must stamp the exact approved homepage source",
  );
  assert.equal(
    build?.homepageComponent,
    "MarketplacePage",
    "dist/public/build.json must stamp the canonical homepage component",
  );
  assert.equal(build?.legacyHomepageRetired, true, "dist/public/build.json must stamp legacy retirement");
  const distServiceWorker = readText("dist/public/sw.js");
  assert.equal(build?.sw?.startsWith("exportunity-sw-v1-build-"), true, "The build marker must expose an Exportunity service-worker version");
  assert.match(distServiceWorker, /const TENANT = "exportunity"/);
  assert.doesNotMatch(distServiceWorker, /API_CACHE|manifest-bdo|tenants\/bdo|const TENANT = "bdo"/);
  assert.match(distServiceWorker, /isApiRequest\(url\)[\s\S]*fetch\(request, \{ cache: "no-store" \}\)/);

  const assetsDir = path.join(root, "dist", "public", "assets");
  const emittedAssetEntries = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir, { recursive: true }).map(String)
    : [];
  const bundledJavaScript = emittedAssetEntries
    .filter((entry) => entry.endsWith(".js"))
    .map((entry) => fs.readFileSync(path.join(assetsDir, entry), "utf8"))
    .join("\n");
  const bundledCss = emittedAssetEntries
    .filter((entry) => entry.endsWith(".css"))
    .map((entry) => fs.readFileSync(path.join(assetsDir, entry), "utf8"))
    .join("\n");
  assert.doesNotMatch(
    bundledCss,
    /exportunity-operations-light/,
    "The dedicated Exportunity artifact must not ship the retired runtime recoloring shim",
  );
  assert.equal(
    emittedAssetEntries.some((entry) => /(?:^|[\\/])StorePage-[^\\/]+\.js$/.test(entry)),
    false,
    "The dedicated Exportunity artifact must not emit the shared Bourse/Zone storefront",
  );
  assert.equal(
    emittedAssetEntries.some((entry) => /(?:^|[\\/])MarketingPage-[^\\/]+\.js$/.test(entry)),
    false,
    "The deleted mock marketing dashboard must not remain in the artifact",
  );
  assert.equal(
    emittedAssetEntries.some((entry) => /(?:^|[\\/])AdminDashboardPage-[^\\/]+\.js$/.test(entry)),
    false,
    "The dedicated Exportunity artifact must not emit the generic legacy dashboard",
  );
  assert.equal(
    emittedAssetEntries.some((entry) => /(?:^|[\\/])AITeamHubPage-[^\\/]+\.js$/.test(entry)),
    false,
    "The dedicated Exportunity artifact must not emit the legacy AI Team renderer",
  );
  assert.equal(
    emittedAssetEntries.some((entry) => /(?:^|[\\/])AgentsPage-[^\\/]+\.js$/.test(entry)),
    false,
    "The dedicated Exportunity artifact must not emit the deleted duplicate agent prototype",
  );
  const operationsCenterChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])ExportunityOperationsCenterPage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(
    operationsCenterChunkEntries.length,
    1,
    "The Exportunity artifact must emit exactly one native GTN Operations Center chunk",
  );
  const operationsCenterBundle = fs.readFileSync(path.join(assetsDir, operationsCenterChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    operationsCenterBundle,
    /exportunity-operations-light|bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    "The native GTN Operations Center chunk must not contain the retired renderer or another project's identity",
  );
  assert.doesNotMatch(
    bundledJavaScript,
    /Seed gold mines \(demo\)|Marketplace Modules|LLM routing settings updated/,
    "The dedicated Exportunity artifact must not contain legacy dashboard controls",
  );
  assert.equal(
    emittedAssetEntries.some((entry) => /(?:^|[\\/])Mindbase[^\\/]*\.js$/.test(entry)),
    false,
    "The dedicated Exportunity artifact must not emit MindBase product pages",
  );
  assert.equal(
    emittedAssetEntries.some((entry) =>
      /(?:^|[\\/])(?:MetPublicPages|MetAdminPages|VsPublicPages|VsAdminPages|HozPublicPages|HozAdminPages|AgoojyePublicPages|AgoojyeAdminPages|BdoAuthorityPages|BdoProPages|BdoGoalPages|BdoAdminPages|StampedGoldVerifyPage|AdminStampedGold[^\\/]*|FinancePage|AuthorizedBureausPage|AdminPmeExchangePage|ECELoginPage|AppProLoginPage|MyOrdersPage|GatewayPage|CompliancePage|TermsPage|PrivacyPage|AdminLoginPage|ApplicationStatusPage|SwitchSpacePage|AppProInboxPage|AppProOperationsPage|AppProThreadsPage|InboxPage|RoomPage|SalesPage|QAMobilePage|DebugLocationPage|DebugHitTestPage|PublicCadastreDemoPage|ZoneInstallPrompt)-[^\\/]+\.js$/.test(
        entry,
      ),
    ),
    false,
    "The dedicated Exportunity artifact must not emit other tenant UI chunks",
  );
  const accessChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])AccessPage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(accessChunkEntries.length, 1, "The Exportunity artifact must emit exactly one GTN access page chunk");
  const accessBundle = fs.readFileSync(path.join(assetsDir, accessChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    accessBundle,
    /BOURSE DE L'OR|tenants\/bdo|MindBase/i,
    "The GTN access page chunk must not contain another project's identity",
  );
  const marketplaceChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])MarketplacePage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(
    marketplaceChunkEntries.length,
    1,
    "The Exportunity artifact must emit exactly one GTN Marketplace page chunk",
  );
  const marketplaceBundle = fs.readFileSync(path.join(assetsDir, marketplaceChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    marketplaceBundle,
    /BOURSE DE L'OR|tenants\/bdo|MindBase|\/api\/marketplace\/buyer\/orders|pay-with-wallet/i,
    "The GTN Marketplace chunk must not contain another project's identity or a retired direct-order path",
  );
  const tradeOrdersChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])TradeOrdersPage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(
    tradeOrdersChunkEntries.length,
    1,
    "The Exportunity artifact must emit exactly one GTN order-record page chunk",
  );
  const tradeOrdersBundle = fs.readFileSync(path.join(assetsDir, tradeOrdersChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    tradeOrdersBundle,
    /BOURSE DE L'OR|tenants\/bdo|MindBase|\/api\/marketplace\/buyer\/orders|pay-with-wallet/i,
    "The GTN order-record chunk must not contain a retired storefront identity or write path",
  );
  const governanceChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])GovernancePages-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(
    governanceChunkEntries.length,
    1,
    "The Exportunity artifact must emit exactly one GTN governance chunk",
  );
  const governanceBundle = fs.readFileSync(path.join(assetsDir, governanceChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    governanceBundle,
    /BOURSE DE L'OR|tenants\/bdo|MindBase/i,
    "The GTN governance chunk must not contain another project's identity",
  );
  const accountSupportChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])AccountSupportPages-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(
    accountSupportChunkEntries.length,
    1,
    "The Exportunity artifact must emit exactly one GTN account-support chunk",
  );
  const accountSupportBundle = fs.readFileSync(path.join(assetsDir, accountSupportChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    accountSupportBundle,
    /BOURSE DE L'OR|tenants\/bdo|MindBase|rayon1km|AppPro/i,
    "The GTN account-support chunk must not contain another project's identity",
  );
  const applicationPageChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])(?:SetupPasswordPage|ShopApplicationPage|DeliveryApplicationPage)-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(
    applicationPageChunkEntries.length,
    3,
    "The Exportunity artifact must emit the three current GTN account/application routes",
  );
  const applicationPageBundle = emittedAssetEntries
    .filter((entry) =>
      /(?:^|[\\/])(?:SetupPasswordPage|ShopApplicationPage|DeliveryApplicationPage|ExportunityApplicationShell)-[^\\/]+\.js$/.test(
        entry,
      ),
    )
    .map((entry) => fs.readFileSync(path.join(assetsDir, entry), "utf8"))
    .join("\n");
  assert.doesNotMatch(
    applicationPageBundle,
    /bg-gray-950|bg-\[#090d16\]|bg-\[#0f1729\]|BOURSE DE L'OR|MindBase/i,
    "GTN account/application chunks must not contain the retired dark or cross-project interface",
  );
  const leadOperationsChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])ClientHunterPage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(leadOperationsChunkEntries.length, 1, "The Exportunity artifact must emit one current lead-operations chunk");
  const leadOperationsBundle = fs.readFileSync(path.join(assetsDir, leadOperationsChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    leadOperationsBundle,
    /min-h-screen bg-gray-950|John Smith|Acme Corp|Bourse de l'Or|MindBase/i,
    "The GTN lead-operations chunk must not contain the retired mock pipeline or another project's identity",
  );
  const governedCommerceChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])(?:AppGovernanceLogsPage|AppInvestOpportunitiesPage|AppInvestOpportunityDetailPage|AppInvestOnboardingPage|AppRaiseCapitalApplyPage|AppMachineryFinancingPage|DeliveryHubPage|DeliveryAgentDashboard|DeliveryAdminDashboard)-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(
    governedCommerceChunkEntries.length,
    9,
    "The Exportunity artifact must emit the nine current governance, capital, and delivery workspaces",
  );
  const governedCommerceBundle = governedCommerceChunkEntries
    .map((entry) => fs.readFileSync(path.join(assetsDir, entry), "utf8"))
    .join("\n");
  assert.doesNotMatch(
    governedCommerceBundle,
    /min-h-screen bg-gray-950|min-h-screen bg-black|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    "Governance, capital, and delivery chunks must not contain the retired dark or cross-project interface",
  );
  const notificationChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])(?:NotificationsPage|AdminNotificationsPage|AdminNotificationDetailPage)-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(
    notificationChunkEntries.length,
    3,
    "The Exportunity artifact must emit the account and provider-notification workspaces",
  );
  const notificationBundle = notificationChunkEntries
    .map((entry) => fs.readFileSync(path.join(assetsDir, entry), "utf8"))
    .join("\n");
  assert.doesNotMatch(
    notificationBundle,
    /min-h-\[calc\(100vh-4rem\)\] bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    "Notification chunks must not contain the retired dark or cross-project interface",
  );
  const evidenceChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])AdminEvidencePage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(evidenceChunkEntries.length, 1, "The Exportunity artifact must emit one current evidence workspace");
  const evidenceBundle = fs.readFileSync(path.join(assetsDir, evidenceChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    evidenceBundle,
    /bg-gray-950|bg-gray-900|border-gray-800|text-gray-100|Bourse de l'Or|MindBase/i,
    "The evidence chunk must not contain the retired dark or cross-project interface",
  );
  const workstationsChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])AdminWorkstationsPage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(
    workstationsChunkEntries.length,
    1,
    "The Exportunity artifact must emit one current workstation operations workspace",
  );
  const workstationsBundle = fs.readFileSync(path.join(assetsDir, workstationsChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    workstationsBundle,
    /bg-gray-950|bg-gray-900|border-gray-800|text-gray-100|Bourse de l'Or|MindBase/i,
    "The workstation operations chunk must not contain the retired dark or cross-project interface",
  );
  assert.equal(
    emittedAssetEntries.some((entry) => /(?:^|[\\/])AdminActionForgePage-[^\\/]+\.js$/.test(entry)),
    false,
    "The dedicated Exportunity artifact must not emit the duplicate legacy Action Forge page",
  );
  assert.equal(
    emittedAssetEntries.some((entry) => /(?:^|[\\/])AgentCommandCenterPage-[^\\/]+\.js$/.test(entry)),
    false,
    "The dedicated Exportunity artifact must not emit the unreachable legacy agent command center",
  );
  const actionsChunkEntries = emittedAssetEntries.filter((entry) => /(?:^|[\\/])ActionsPage-[^\\/]+\.js$/.test(entry));
  assert.equal(actionsChunkEntries.length, 1, "The Exportunity artifact must emit one canonical action ledger");
  const actionsBundle = fs.readFileSync(path.join(assetsDir, actionsChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    actionsBundle,
    /Safe pipeline for creating missing actions|Create Forge Request|Bourse de l'Or|MindBase/i,
    "The canonical action ledger must not contain the retired forge renderer or cross-project copy",
  );
  assert.equal(
    emittedAssetEntries.some((entry) => /(?:^|[\\/])AdminDeveloperSettingsPage-[^\\/]+\.js$/.test(entry)),
    false,
    "The dedicated Exportunity artifact must not emit the duplicate developer diagnostics page",
  );
  assert.equal(
    emittedAssetEntries.some((entry) => /(?:^|[\\/])AdminMapSettingsPage-[^\\/]+\.js$/.test(entry)),
    false,
    "The dedicated Exportunity artifact must not emit the unreachable legacy map settings page",
  );
  const systemHubChunkEntries = emittedAssetEntries.filter((entry) => /(?:^|[\\/])AdminSystemUpdatePage-[^\\/]+\.js$/.test(entry));
  assert.equal(systemHubChunkEntries.length, 1, "The Exportunity artifact must emit one current system hub");
  const systemHubBundle = fs.readFileSync(path.join(assetsDir, systemHubChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    systemHubBundle,
    /Generate Cadastre Demo Link|chairman\/quick-token|Chairman Quick Chat|Voice Debug|qa-mobile|Bourse de l'Or|MindBase/i,
    "The system hub chunk must not contain retired demo, token, diagnostics, or cross-project UI",
  );
  for (const retiredChunk of [
    "AdminSeoHealthPage",
    "AdminVisitsIntelligencePage",
    "AdminSeoAutopilotPage",
    "AdminUxAuditPage",
  ]) {
    assert.equal(
      emittedAssetEntries.some((entry) => new RegExp(`(?:^|[\\\\/])${retiredChunk}-[^\\\\/]+\\.js$`).test(entry)),
      false,
      `The dedicated Exportunity artifact must not emit ${retiredChunk}`,
    );
  }
  const websiteIntelligenceChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])AdminWebsiteIntelligencePage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(websiteIntelligenceChunkEntries.length, 1, "The Exportunity artifact must emit one Website Intelligence workspace");
  const websiteIntelligenceBundle = fs.readFileSync(path.join(assetsDir, websiteIntelligenceChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    websiteIntelligenceBundle,
    /bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase|Open raw endpoint/i,
    "The Website Intelligence chunk must not contain retired dark, raw-endpoint, or cross-project UI",
  );
  for (const [chunkName, label] of [
    ["AdminAgentsOsPage", "Agents OS"],
    ["OperationsAgentsPage", "Internal Agents"],
    ["AgentProfileV2Page", "Runtime Agent Profile"],
    ["AgentDetailPage", "Retired Agent Detail Redirect"],
    ["AgendaPage", "Agenda & Objectives"],
    ["AdminUserManagementPage", "People & Access"],
    ["HierarchyPage", "Organization"],
  ]) {
    const chunks = emittedAssetEntries.filter((entry) => new RegExp(`(?:^|[\\\\/])${chunkName}-[^\\\\/]+\\.js$`).test(entry));
    assert.equal(chunks.length, 1, `The Exportunity artifact must emit one current ${label} workspace`);
    const bundle = fs.readFileSync(path.join(assetsDir, chunks[0]), "utf8");
    assert.doesNotMatch(
      bundle,
      /bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase|boursedelor_core|Generate agents/i,
      `${label} must not contain the retired dark or cross-project interface`,
    );
  }
  const mailChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])MailPage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(mailChunkEntries.length, 1, "The Exportunity artifact must emit one canonical mail workspace");
  const mailBundle = fs.readFileSync(path.join(assetsDir, mailChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    mailBundle,
    /min-h-\[calc\(100vh-4rem\)\] bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    "The mail chunk must not contain the retired dark or cross-project interface",
  );
  const meetChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])MeetRoomPage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(meetChunkEntries.length, 1, "The Exportunity artifact must emit one canonical meeting workspace");
  const meetBundle = fs.readFileSync(path.join(assetsDir, meetChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    meetBundle,
    /min-h-\[calc\(100vh-4rem\)\] bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    "The meeting chunk must not contain the retired dark or cross-project interface",
  );
  const agentEconomyChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])AgentEconomyDashboard-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(agentEconomyChunkEntries.length, 1, "The Exportunity artifact must emit one canonical agent-economy workspace");
  const agentEconomyBundle = fs.readFileSync(path.join(assetsDir, agentEconomyChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    agentEconomyBundle,
    /min-h-screen bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    "The agent-economy chunk must not contain the retired dark or cross-project interface",
  );
  const subscriptionPlansChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])SubscriptionPlansPage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(
    subscriptionPlansChunkEntries.length,
    1,
    "The Exportunity artifact must emit one canonical subscription-plan workspace",
  );
  const subscriptionPlansBundle = fs.readFileSync(path.join(assetsDir, subscriptionPlansChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    subscriptionPlansBundle,
    /Seed Default Plans|min-h-screen bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    "The subscription-plan chunk must not contain legacy seed data or a retired interface",
  );
  const knowledgeChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])KnowledgeBasePage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(knowledgeChunkEntries.length, 1, "The Exportunity artifact must emit one canonical knowledge workspace");
  const knowledgeBundle = fs.readFileSync(path.join(assetsDir, knowledgeChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    knowledgeBundle,
    /Company Shared Drive|Product Wiki|Marketing Assets|Connected Sources|Create New Space|Open Full View|Summarize with AI|min-h-screen bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    "The knowledge chunk must not contain fabricated integrations, dead actions, or a retired interface",
  );
  const contactsChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])AdminContactsPage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(contactsChunkEntries.length, 1, "The Exportunity artifact must emit one canonical contact workspace");
  const contactsBundle = fs.readFileSync(path.join(assetsDir, contactsChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    contactsBundle,
    /claim-legacy|force-claim|Claim Legacy|Force Claim|Start Outreach|min-h-screen bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    "The contact chunk must not expose legacy ownership controls, dead campaign actions, or a retired interface",
  );
  const expertAgentsChunkEntries = emittedAssetEntries.filter((entry) =>
    /(?:^|[\\/])ExpertClonesHubPage-[^\\/]+\.js$/.test(entry),
  );
  assert.equal(expertAgentsChunkEntries.length, 1, "The Exportunity artifact must emit one canonical expert-agent workspace");
  const expertAgentsBundle = fs.readFileSync(path.join(assetsDir, expertAgentsChunkEntries[0]), "utf8");
  assert.doesNotMatch(
    expertAgentsBundle,
    /Browse Expert Clones|My Assigned Clones|Assign to Company|min-h-\[calc\(100vh-4rem\)\] bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
    "The expert-agent chunk must not contain the retired clone interface or cross-project identity",
  );
  const emittedTenantDirectories = fs.existsSync(path.join(root, "dist", "public", "tenants"))
    ? fs
        .readdirSync(path.join(root, "dist", "public", "tenants"), {
          withFileTypes: true,
        })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];
  assert.deepEqual(
    emittedTenantDirectories,
    ["exportunity"],
    "The Exportunity artifact may contain only Exportunity tenant assets",
  );
  for (const retiredArtifactPath of [
    "dist/public/brand/agoojiye",
    "dist/public/brand-assets/generated",
    "dist/public/met",
  ]) {
    assert.equal(
      fs.existsSync(path.join(root, retiredArtifactPath)),
      false,
      `Cross-tenant artifact path must be pruned: ${retiredArtifactPath}`,
    );
  }
  for (const retiredRootAsset of [
    "favicon-mindbase.svg",
    "manifest-agoojiye.webmanifest",
    "manifest-bdo.webmanifest",
    "manifest-mindbase.webmanifest",
    "manifest.webmanifest",
  ]) {
    assert.equal(
      fs.existsSync(path.join(root, "dist", "public", retiredRootAsset)),
      false,
      `Cross-project root asset must not ship in the Exportunity artifact: ${retiredRootAsset}`,
    );
  }
  const emittedIndex = fs.readFileSync(path.join(root, "dist", "public", "index.html"), "utf8");
  assert.match(emittedIndex, /<title>Exportunity \| Global Trade Network<\/title>/);
  assert.match(emittedIndex, /manifest-exportunity\.webmanifest/);
  assert.doesNotMatch(
    emittedIndex,
    /Bourse de l'Or|AGOOJIYE|MindBase|Tenant platform|manifest\.webmanifest/,
    "The Exportunity document shell must be isolated from other projects and generic legacy metadata",
  );
  for (const retiredAsset of [
    "assets/bdo-gateway-bg.jpg",
    "assets/bdo-gateway-bg.svg",
    "assets/gateway-preview.svg",
    "assets/gateway-role-buyer.svg",
    "assets/gateway-role-demo.svg",
    "assets/gateway-role-investor.svg",
    "assets/gateway-role-miner.svg",
    "assets/gateway-role-wholesaler.svg",
  ]) {
    assert.equal(
      fs.existsSync(path.join(root, "dist", "public", retiredAsset)),
      false,
      `Retired gateway artwork must not ship in the Exportunity artifact: ${retiredAsset}`,
    );
  }
  assert.doesNotMatch(
    bundledJavaScript,
    /Platforms for trade, gold, machinery, and execution\.|Tell us what you need\. We coordinate the trade\.|Marketplace account|10 live locations around Cocody|Google Maps key rejected|Tap a product or marker to enter the shop/,
    "The production bundle must not ship a retired Exportunity homepage",
  );
}

console.log(`[exportunity-surface] OK: ${expectedSurface}`);
