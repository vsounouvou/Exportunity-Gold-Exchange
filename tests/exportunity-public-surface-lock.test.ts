import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const EXPECTED_SURFACE_REVISION = 7;
const EXPECTED_HOME_SHA256 =
  "2e8f0d2e5f65b72be86c78a981157f5e5f56d4fe2177639f9199187215902c70";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const marker = JSON.parse(read("client/public/exportunity-surface.json"));
const homeSource = read("client/src/pages/exportunity/MarketplacePage.tsx");
const accessSource = read("client/src/pages/exportunity/AccessPage.tsx");
const tradeOrdersSource = read("client/src/pages/exportunity/TradeOrdersPage.tsx");
const governanceSource = read("client/src/pages/exportunity/GovernancePages.tsx");
const accountSupportSource = read("client/src/pages/exportunity/AccountSupportPages.tsx");
const applicationShellSource = read("client/src/components/exportunity/ExportunityApplicationShell.tsx");
const setupPasswordSource = read("client/src/pages/SetupPasswordPage.tsx");
const shopApplicationSource = read("client/src/pages/ShopApplicationPage.tsx");
const deliveryApplicationSource = read("client/src/pages/DeliveryApplicationPage.tsx");
const clientHunterSource = read("client/src/pages/ClientHunterPage.tsx");

test("the unreachable legacy company dashboard stays physically removed", () => {
  assert.equal(
    existsSync(
      new URL("../client/src/pages/HomePage.tsx", import.meta.url),
    ),
    false,
  );
});
const governedCommerceWorkspaceSources = {
  governanceLog: read("client/src/pages/AppGovernanceLogsPage.tsx"),
  investOpportunities: read("client/src/pages/AppInvestOpportunitiesPage.tsx"),
  investOpportunityDetail: read("client/src/pages/AppInvestOpportunityDetailPage.tsx"),
  investOnboarding: read("client/src/pages/AppInvestOnboardingPage.tsx"),
  raiseCapital: read("client/src/pages/AppRaiseCapitalApplyPage.tsx"),
  machineryFinancing: read("client/src/pages/AppMachineryFinancingPage.tsx"),
  deliveryHub: read("client/src/pages/DeliveryHubPage.tsx"),
  deliveryAgent: read("client/src/pages/DeliveryAgentDashboard.tsx"),
  deliveryAdmin: read("client/src/pages/DeliveryAdminDashboard.tsx"),
};
const notificationWorkspaceSources = {
  account: read("client/src/pages/NotificationsPage.tsx"),
  operations: read("client/src/pages/AdminNotificationsPage.tsx"),
  detail: read("client/src/pages/AdminNotificationDetailPage.tsx"),
};
const mailWorkspaceSource = read("client/src/pages/MailPage.tsx");
const meetWorkspaceSource = read("client/src/pages/MeetRoomPage.tsx");
const agentEconomyWorkspaceSource = read("client/src/pages/AgentEconomyDashboard.tsx");
const subscriptionPlansWorkspaceSource = read("client/src/pages/SubscriptionPlansPage.tsx");
const knowledgeWorkspaceSource = read("client/src/pages/KnowledgeBasePage.tsx");
const contactsWorkspaceSource = read("client/src/pages/AdminContactsPage.tsx");
const expertAgentsWorkspaceSource = read("client/src/pages/ExpertClonesHubPage.tsx");
const evidenceWorkspaceSource = read("client/src/pages/AdminEvidencePage.tsx");
const workstationsWorkspaceSource = read("client/src/pages/AdminWorkstationsPage.tsx");
const actionsWorkspaceSource = read("client/src/pages/ActionsPage.tsx");
const operationsCenterSource = read("client/src/pages/exportunity/ExportunityOperationsCenterPage.tsx");
const agendaSource = read("client/src/pages/AgendaPage.tsx");
const peopleAccessSource = read("client/src/pages/AdminUserManagementPage.tsx");
const organizationSource = read("client/src/pages/HierarchyPage.tsx");
const organizationTreeSource = read("client/src/components/OrgChartTree.tsx");
const systemHubSource = read("client/src/pages/AdminSystemUpdatePage.tsx");
const websiteIntelligenceSource = read("client/src/pages/AdminWebsiteIntelligencePage.tsx");
const agentsOsSource = read("client/src/pages/AdminAgentsOsPage.tsx");
const internalAgentsSource = read("client/src/pages/OperationsAgentsPage.tsx");
const agentProfileSource = read("client/src/pages/AgentProfileV2Page.tsx");
const agentProfileDialogSource = read("client/src/components/AgentProfileDialog.tsx");
const retiredAgentDetailSource = read("client/src/pages/AgentDetailPage.tsx");
const agentsOsRoutesSource = read("server/routes/admin-agents-os.ts");
const routeRegistrySource = read("client/src/navigation/routeRegistry.ts");
const routeMetaSource = read("client/src/lib/routeMeta.ts");
const tenantPolicySource = read("client/src/lib/tenantPolicy.ts");
const adminLayoutSource = read("client/src/components/AdminLayout.tsx");
const adminNavRegistrySource = read("client/src/lib/adminNavRegistry.ts");
const walletStripSource = read("client/src/components/agentic/WalletStrip.tsx");
const pwaInstallSource = read("client/src/contexts/PwaInstallContext.tsx");
const marketplaceCatalogSource = read("client/src/content/exportunity/marketplaceCatalog.ts");
const appSource = read("client/src/App.tsx");
const globalCssSource = read("client/src/index.css");
const legacyAiTeamSource = read("client/src/pages/AITeamHubPage.tsx");
const tenantConfig = JSON.parse(read("ops/tenants.config.json"));
const tenantConfigScript = read("scripts/ops/tenant-config.mjs");
const deployScript = read("scripts/ops/deploy-release.sh");
const localBackupPruneScript = read("scripts/ops/prune-local-backups.sh");
const artifactPrunerSource = read("scripts/prune-tenant-build.mjs");

test("the exact reviewed proximity-marketplace home is cryptographically pinned", () => {
  const sourceSha256 = createHash("sha256").update(homeSource).digest("hex");

  assert.deepEqual(marker, {
    schemaVersion: 2,
    surfaceRevision: EXPECTED_SURFACE_REVISION,
    canonicalSurface: "global-trade-network",
    homepageComponent: "MarketplacePage",
    homepageSourceSha256: EXPECTED_HOME_SHA256,
    legacyHomepageRetired: true,
  });
  assert.equal(sourceSha256, EXPECTED_HOME_SHA256);

  for (const sourcePath of [
    "scripts/verify-exportunity-public-surface.mjs",
    "scripts/stamp-build.mjs",
    "scripts/ops/deploy-release.sh",
    "server/deployGuard.ts",
  ]) {
    const source = read(sourcePath);
    assert.match(source, new RegExp(EXPECTED_HOME_SHA256), sourcePath);
    assert.match(source, /surfaceRevision|SURFACE_REVISION|publicSurfaceRevision/, sourcePath);
  }
});

test("the pinned home is the unified proximity map, marketplace, and Awa experience", () => {
  assert.match(homeSource, /data-testid="exportunity-marketplace"/);
  assert.match(homeSource, /Start around you\. Expand without limits\./);
  assert.match(homeSource, /<MapContainer/);
  assert.match(homeSource, /<Circle/);
  assert.match(homeSource, /\/api\/marketplace\/buyer\/nearby/);
  assert.match(homeSource, /\/api\/industrial\/catalog/);
  assert.doesNotMatch(homeSource, /Platforms for trade, gold, machinery, and execution\./);
});

test("retired Exportunity renderers are absent from the application route graph", () => {
  assert.match(appSource, /path="\/" component=\{RootPublicRoute\}/);
  assert.match(appSource, /tenant\.key === "exportunity"\) return <ExportunityMarketplacePage \/>/);
  assert.doesNotMatch(
    appSource,
    /ExportunityMarketing[A-Za-z]+Page|MarketingHomePage|MarketingRedirect|MarketingOrAuthRedirect|isExportunityMarketingHost/,
  );
  assert.equal((appSource.match(/path="\/trade"/g) || []).length, 1);
  assert.match(
    appSource,
    /const ExportunityAdminDashboardPage = lazyPage\(\(\) => import\("@\/pages\/exportunity\/ExportunityAdminDashboardPage"\)\)[\s\S]*const AdminDashboardPage = includeOtherTenantUi[\s\S]*import\("@\/pages\/AdminDashboardPage"\)[\s\S]*: ExportunityAdminDashboardPage/,
  );
  assert.match(
    appSource,
    /const ExportunityOperationsCenterPage = lazyPage\(\(\) => import\("@\/pages\/exportunity\/ExportunityOperationsCenterPage"\)\)[\s\S]*const AITeamHubPage = includeOtherTenantUi[\s\S]*import\("@\/pages\/AITeamHubPage"\)[\s\S]*: ExportunityOperationsCenterPage/,
  );
  assert.match(appSource, /function TenantDashboardRoute\(\)[\s\S]*tenant\.key === "exportunity"[\s\S]*<ExportunityAdminDashboardPage \/>/);
  assert.match(appSource, /function TenantOperationsCenterRoute\(\)[\s\S]*tenant\.key === "exportunity"[\s\S]*<ExportunityOperationsCenterPage \/>/);
  assert.match(appSource, /<Route path="\/dashboard">[\s\S]*<TenantDashboardRoute \/>/);
  assert.match(appSource, /<Route path="\/ai-team">[\s\S]*<TenantOperationsCenterRoute \/>/);

  for (const retiredPath of [
    "/company",
    "/what-we-do",
    "/platforms",
    "/archive",
    "/operating-stack",
    "/work-with-us",
    "/journey",
    "/copy-of-home",
  ]) {
    assert.match(
      appSource,
      new RegExp(`path="${retiredPath.replaceAll("/", "\\/")}" component=\\{\\(\\) => <RetiredPublicSurfaceRedirect`),
      retiredPath,
    );
  }
});

test("production diagnostics and retired gateway artwork stay out of the Exportunity artifact", () => {
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
  for (const assetName of [
    "bdo-gateway-bg.jpg",
    "bdo-gateway-bg.svg",
    "gateway-preview.svg",
    "gateway-role-buyer.svg",
    "gateway-role-demo.svg",
    "gateway-role-investor.svg",
    "gateway-role-miner.svg",
    "gateway-role-wholesaler.svg",
  ]) {
    assert.match(artifactPrunerSource, new RegExp(assetName.replaceAll(".", "\\.")));
  }
});

test("Exportunity access stays GTN-native while preserving the canonical auth records", () => {
  assert.match(accessSource, /data-testid="exportunity-access-page"/);
  assert.match(accessSource, /\/api\/ece\/auth\/login/);
  assert.match(accessSource, /\/api\/ece\/applications\/submit/);
  assert.match(accessSource, /"buyer" \| "supplier" \| "shareholder"/);
  assert.match(accessSource, /\/tenants\/exportunity\/official\/logo-long-light\.png/);
  assert.doesNotMatch(accessSource, /BOURSE DE L'OR|tenants\/bdo|MindBase/i);
  assert.match(read("scripts/site/public-surface-contracts.ts"), /path: "\/login"/);
  assert.match(read("server/lib/seo/runtimeSeo.ts"), /"\/login": "Global Trade Network Access"/);
  assert.match(appSource, /path="\/login" component=\{UnifiedAccessPage\}/);
  assert.match(appSource, /path="\/register" component=\{UnifiedAccessPage\}/);
  assert.match(
    appSource,
    /const UnifiedAccessPage = includeOtherTenantUi[\s\S]*import\("@\/pages\/ECELoginPage"\)[\s\S]*import\("@\/pages\/exportunity\/AccessPage"\)/,
  );
  assert.match(accessSource, /application-status\?ref=/);
});

test("operations, status, and space exchange use the GTN interface without replacing their records", () => {
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

  assert.match(read("scripts/site/public-surface-contracts.ts"), /path: "\/application-status"/);
  assert.match(read("server/lib/seo/runtimeSeo.ts"), /"\/application-status": "Global Trade Network Access Request Status"/);
  assert.match(read("server/lib/seo/runtimeSeo.ts"), /"\/admin\/login": "Global Trade Network Operations Access"/);
});

test("the active operations shell is GTN-native and superseded pro renderers are deleted", () => {
  const topBarSource = read("client/src/components/agentic/AppProTopBar.tsx");
  const sideNavSource = read("client/src/components/agentic/ProSideNav.tsx");
  const bottomNavSource = read("client/src/components/agentic/AppProBottomNav.tsx");
  const mobileBottomNavSource = read("client/src/components/marketplace/MobileBottomNav.tsx");
  const coreSources = [
    read("client/src/pages/AppProActionsPage.tsx"),
    read("client/src/pages/AppProChatsPage.tsx"),
    read("client/src/pages/AppProJoinPage.tsx"),
    read("client/src/pages/AppProMePage.tsx"),
    read("client/src/pages/AppProMoneyPage.tsx"),
    read("client/src/pages/AppProOrdersPage.tsx"),
    read("client/src/pages/AppProRoomPage.tsx"),
    read("client/src/pages/AppProWalletPage.tsx"),
  ];

  assert.match(topBarSource, /__BUILD_INCLUDE_OTHER_TENANT_UI__/);
  assert.match(topBarSource, /\/tenants\/exportunity\/official\/favicon-64\.png/);
  assert.match(topBarSource, /GTN Operations/);
  assert.doesNotMatch(topBarSource, /Exportunity Pro|Bourse de l'Or|MindBase/i);
  assert.match(sideNavSource, /Global Trade Network/);
  assert.match(sideNavSource, /Exportunity · GTN/);
  assert.doesNotMatch(sideNavSource, /Exportunity Pro|Bourse de l'Or|MindBase/i);
  assert.match(bottomNavSource, /theme="gtn"/);
  assert.match(mobileBottomNavSource, /theme\?: "dark" \| "gtn"/);
  for (const source of coreSources) {
    assert.match(source, /bg-\[#F7F8FA\]/);
    assert.doesNotMatch(source, /min-h-screen bg-gray-950|Bourse de l'Or|MindBase|bdo_pwa_/i);
  }
  assert.match(coreSources[0], /\/api\/ece\/operations\/center/);
  assert.match(coreSources[1], /\/api\/ece\/inbox\/rooms/);
  assert.match(coreSources[4], /\/api\/ece\/money\/overview/);
  assert.match(coreSources[5], /\/api\/marketplace\/sellers/);
  assert.match(coreSources[6], /\/api\/ece\/inbox\/rooms/);
  assert.match(coreSources[7], /\/api\/ece\/money\/overview/);

  for (const relativePath of [
    "client/src/pages/AppProInboxPage.tsx",
    "client/src/pages/AppProOperationsPage.tsx",
    "client/src/pages/AppProThreadsPage.tsx",
    "client/src/pages/InboxPage.tsx",
    "client/src/pages/RoomPage.tsx",
  ]) {
    assert.equal(existsSync(new URL(`../${relativePath}`, import.meta.url)), false, relativePath);
  }
  assert.doesNotMatch(appSource, /AppProInboxPage/);
});

test("legacy inbox URLs reuse the current GTN message workspace without duplicate renderers", () => {
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
});

test("sales operations use current records and cannot fall back to the mock pipeline", () => {
  assert.match(clientHunterSource, /data-testid="exportunity-lead-operations-page"/);
  assert.match(clientHunterSource, /--admin-header-height/);
  assert.match(clientHunterSource, /\/api\/admin\/leads/);
  assert.match(clientHunterSource, /\/api\/admin\/campaigns/);
  assert.match(clientHunterSource, /\/api\/marketplace\/admin\/sourcing-requests/);
  assert.doesNotMatch(clientHunterSource, /min-h-screen bg-gray-950|mockLeads|John Smith|Acme Corp|Bourse de l'Or|MindBase/i);
  assert.match(appSource, /path="\/sales"[\s\S]*<ProtectedRoute>[\s\S]*<Redirect to="\/client-hunter" \/>/);
  assert.doesNotMatch(appSource, /@\/pages\/SalesPage|const SalesPage/);
  assert.equal(existsSync(new URL("../client/src/pages/SalesPage.tsx", import.meta.url)), false);
  assert.match(read("client/src/navigation/routeRegistry.ts"), /"\/sales": \{[^}]*kind: "hidden"/);
});

test("the Exportunity marketplace catalog is GTN-native and does not advertise MindBase", () => {
  assert.match(marketplaceCatalogSource, /id: "gtn-operations"/);
  assert.match(marketplaceCatalogSource, /Exportunity AI Operations/);
  assert.match(marketplaceCatalogSource, /Exportunity-native agents/);
  assert.doesNotMatch(marketplaceCatalogSource, /MindBase|mindbase\.cloud|id: "mindbase"/i);
});

test("remaining active pro surfaces use the GTN shell without bypassing governed APIs", () => {
  const surfaces = {
    mine: read("client/src/pages/AppProMineHomePage.tsx"),
    equipment: read("client/src/pages/AppProEquipmentPage.tsx"),
    agents: read("client/src/pages/AppProAgentsPage.tsx"),
    shop: read("client/src/pages/AppProShopPage.tsx"),
  };

  for (const source of Object.values(surfaces)) {
    assert.match(source, /bg-\[#F7F8FA\]/);
    assert.doesNotMatch(source, /min-h-screen bg-gray-950|Bourse de l'Or|MindBase/i);
  }
  assert.match(surfaces.mine, /\/api\/ece\/mine\/production\/today/);
  assert.match(surfaces.equipment, /\/api\/payments\/escrow\/hold/);
  assert.match(surfaces.equipment, /\/api\/payments\/escrow\/release/);
  assert.match(surfaces.agents, /\/api\/ece\/agents\/hire/);
  assert.match(surfaces.agents, /External actions are always approval-gated/);
  assert.match(surfaces.shop, /setLocation\("\/apply\/shop"\)/);
  assert.doesNotMatch(surfaces.shop, /\/api\/marketplace\/demo\/create-seller|createDemoSeller/);
});

test("governance, capital, and delivery records render only through the current GTN workspace", () => {
  for (const [name, source] of Object.entries(governedCommerceWorkspaceSources)) {
    assert.match(source, /bg-\[#F7F8FA\]/, name);
    assert.doesNotMatch(
      source,
      /min-h-screen bg-gray-950|min-h-screen bg-black|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
      name,
    );
  }

  assert.match(governedCommerceWorkspaceSources.governanceLog, /data-testid="exportunity-governance-log"/);
  assert.match(governedCommerceWorkspaceSources.governanceLog, /\/api\/ece\/audit\/logs/);
  assert.match(governedCommerceWorkspaceSources.investOpportunities, /data-testid="exportunity-invest-opportunities"/);
  assert.match(governedCommerceWorkspaceSources.investOpportunities, /\/api\/invest\/opportunities/);
  assert.match(governedCommerceWorkspaceSources.investOpportunityDetail, /data-testid="exportunity-invest-opportunity-detail"/);
  assert.match(governedCommerceWorkspaceSources.investOpportunityDetail, /\/api\/invest\/opportunities/);
  assert.match(governedCommerceWorkspaceSources.investOnboarding, /data-testid="exportunity-invest-onboarding"/);
  assert.match(governedCommerceWorkspaceSources.investOnboarding, /\/api\/invest\/leads/);
  assert.match(governedCommerceWorkspaceSources.raiseCapital, /data-testid="exportunity-raise-capital"/);
  assert.match(governedCommerceWorkspaceSources.raiseCapital, /\/api\/invest\/leads/);
  assert.match(governedCommerceWorkspaceSources.machineryFinancing, /data-testid="exportunity-machinery-financing"/);
  assert.match(governedCommerceWorkspaceSources.machineryFinancing, /\/api\/invest\/opportunities/);
  assert.match(governedCommerceWorkspaceSources.deliveryHub, /data-testid="exportunity-delivery-hub"/);
  assert.match(governedCommerceWorkspaceSources.deliveryHub, /\/apply\/delivery/);
  assert.match(governedCommerceWorkspaceSources.deliveryHub, /\/tenants\/exportunity\/official\/logo-long-light\.png/);
  assert.match(governedCommerceWorkspaceSources.deliveryAgent, /data-testid="exportunity-delivery-agent"/);
  assert.match(governedCommerceWorkspaceSources.deliveryAgent, /\/api\/delivery\/agents/);
  assert.match(governedCommerceWorkspaceSources.deliveryAgent, /\/api\/delivery\/wallets/);
  assert.match(governedCommerceWorkspaceSources.deliveryAdmin, /data-testid="exportunity-delivery-admin"/);
  assert.match(governedCommerceWorkspaceSources.deliveryAdmin, /\/api\/delivery\/dashboard\/stats/);
});

test("account and provider notifications keep distinct records inside the current GTN interface", () => {
  for (const [name, source] of Object.entries(notificationWorkspaceSources)) {
    assert.match(source, /bg-\[#F7F8FA\]/, name);
    assert.doesNotMatch(
      source,
      /min-h-\[calc\(100vh-4rem\)\] bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
      name,
    );
  }
  assert.match(notificationWorkspaceSources.account, /data-testid="exportunity-notifications"/);
  assert.match(notificationWorkspaceSources.account, /\/api\/notifications\/read/);
  assert.match(notificationWorkspaceSources.operations, /data-testid="exportunity-admin-notifications"/);
  assert.match(notificationWorkspaceSources.operations, /\/api\/admin\/notifications/);
  assert.match(notificationWorkspaceSources.detail, /data-testid="exportunity-admin-notification-detail"/);
  assert.match(notificationWorkspaceSources.detail, /\/api\/admin\/notifications/);
});

test("mail records and governed send actions use one current GTN communications workspace", () => {
  assert.match(mailWorkspaceSource, /data-testid="exportunity-mail-workspace"/);
  assert.match(mailWorkspaceSource, /\/api\/mail\/threads/);
  assert.match(mailWorkspaceSource, /\/api\/mail\/work-orders/);
  assert.match(mailWorkspaceSource, /\/api\/mail\/send/);
  assert.match(mailWorkspaceSource, /\/api\/mail\/message\/\$\{selectedMessageId\}\/reply/);
  assert.doesNotMatch(
    mailWorkspaceSource,
    /min-h-\[calc\(100vh-4rem\)\] bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
  );
});

test("meeting records and host controls use one current GTN communications workspace", () => {
  assert.match(meetWorkspaceSource, /data-testid="exportunity-meeting-workspace"/);
  assert.match(meetWorkspaceSource, /\/api\/meet\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/join-token/);
  assert.match(meetWorkspaceSource, /\/api\/meet\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/summary/);
  assert.match(meetWorkspaceSource, /\/api\/meet\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/end/);
  assert.match(meetWorkspaceSource, /\/api\/meet\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/lock/);
  assert.doesNotMatch(
    meetWorkspaceSource,
    /min-h-\[calc\(100vh-4rem\)\] bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
  );
});

test("agent wallet, execution, and CRON records use one current GTN governance workspace", () => {
  assert.match(agentEconomyWorkspaceSource, /data-testid="exportunity-agent-economy-workspace"/);
  assert.match(agentEconomyWorkspaceSource, /\/api\/agent-economy\/command-center/);
  assert.match(agentEconomyWorkspaceSource, /\/api\/agent-economy\/agents\/\$\{agentId\}\/super/);
  assert.match(agentEconomyWorkspaceSource, /\/api\/agent-economy\/agents\/\$\{agentId\}\/freeze/);
  assert.match(agentEconomyWorkspaceSource, /\/api\/agent-economy\/cron\/\$\{id\}\/toggle/);
  assert.doesNotMatch(
    agentEconomyWorkspaceSource,
    /min-h-screen bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
  );
});

test("subscription plan records use the GTN registry without hardcoded seed plans", () => {
  assert.match(subscriptionPlansWorkspaceSource, /data-testid="exportunity-subscription-plans-workspace"/);
  assert.match(subscriptionPlansWorkspaceSource, /queryKey: \['\/api\/admin\/subscription-plans'\]/);
  assert.match(subscriptionPlansWorkspaceSource, /apiRequest\('\/api\/admin\/subscription-plans'/);
  assert.match(subscriptionPlansWorkspaceSource, /apiRequest\(`\/api\/admin\/subscription-plans\/\$\{id\}`/);
  assert.match(subscriptionPlansWorkspaceSource, /bg-\[#F7F8FA\]/);
  assert.doesNotMatch(
    subscriptionPlansWorkspaceSource,
    /DEFAULT_PLANS|seedPlansMutation|Seed Default Plans|min-h-screen bg-gray-950|bg-gray-900|border-gray-800|Bourse de l'Or|MindBase/i,
  );
  assert.doesNotMatch(subscriptionPlansWorkspaceSource, /parseFloat\(plan\.pricePerMonth\)/);
});

test("knowledge records use the GTN workspace without fabricated source integrations or dead actions", () => {
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
  );
});

test("contact records use the GTN registry without legacy ownership controls or dead campaign tabs", () => {
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
  );
});

test("expert agents use the current profile schema and explicit assignment controls", () => {
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
  );
});

test("execution evidence uses the GTN workspace and masks credential-like result fields", () => {
  assert.match(evidenceWorkspaceSource, /data-testid="exportunity-evidence-workspace"/);
  assert.match(evidenceWorkspaceSource, /\/api\/admin\/evidence\?limit=100/);
  assert.match(evidenceWorkspaceSource, /\/api\/admin\/evidence\/\$\{selectedRunId\}/);
  assert.match(evidenceWorkspaceSource, /function redactForDisplay/);
  assert.match(evidenceWorkspaceSource, /sensitiveEvidenceKey\.test\(key\)/);
  assert.match(evidenceWorkspaceSource, /bg-\[#F7F8FA\]/);
  assert.doesNotMatch(
    evidenceWorkspaceSource,
    /bg-gray-950|bg-gray-900|border-gray-800|text-gray-100|Bourse de l'Or|MindBase/i,
  );
});

test("workstation operations use the GTN workspace and guard every consequential control", () => {
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
  );
});

test("automation governance is consolidated into the current action ledger", () => {
  assert.equal(existsSync(new URL("../client/src/pages/AdminActionForgePage.tsx", import.meta.url)), false);
  assert.doesNotMatch(appSource, /AdminActionForgePage/);
  assert.match(appSource, /path="\/admin\/action-forge"[\s\S]*<Redirect to="\/actions\?view=automations" \/>/);
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
});

test("system health uses one current hub without legacy demo or token controls", () => {
  assert.equal(existsSync(new URL("../client/src/pages/AdminDeveloperSettingsPage.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../client/src/pages/AdminMapSettingsPage.tsx", import.meta.url)), false);
  assert.doesNotMatch(appSource, /AdminDeveloperSettingsPage|AdminMapSettingsPage/);
  assert.match(appSource, /path="\/admin\/settings\/developer"[\s\S]*<Redirect to="\/admin\/system\/update\?view=voice" \/>/);
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
  );
});

test("website intelligence consolidates legacy SEO, visits, and navigation interfaces", () => {
  for (const retiredWebsitePage of [
    "AdminSeoHealthPage.tsx",
    "AdminVisitsIntelligencePage.tsx",
    "AdminSeoAutopilotPage.tsx",
    "AdminUxAuditPage.tsx",
  ]) {
    assert.equal(existsSync(new URL(`../client/src/pages/${retiredWebsitePage}`, import.meta.url)), false);
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
  );
  const exportunityAdminNavBlock = tenantPolicySource.match(/const EXPORTUNITY_ADMIN_NAV_ROUTES = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.match(exportunityAdminNavBlock, /\/admin\/seo/);
  for (const alias of ["website/seo", "website/seo-autopilot", "website/visits", "ux-audit"]) {
    assert.match(routeRegistrySource, new RegExp(`"\\/admin\\/${alias}":[\\s\\S]*?kind: "hidden"`));
  }
});

test("agent operations use native GTN workspaces without cross-project seeding", () => {
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
  );
  assert.doesNotMatch(
    agentsOsSource,
    /bg-gray-950|bg-gray-900|border-gray-800|text-gray-100|Bourse de l'Or|MindBase/i,
  );
  assert.match(internalAgentsSource, /data-testid="exportunity-internal-agents-workspace"/);
  assert.match(internalAgentsSource, /\/api\/v2\/agents/);
  assert.match(internalAgentsSource, /\/api\/v2\/agents\/internal\/create/);
  assert.match(internalAgentsSource, /if \(confirmed\) createMutation\.mutate\(\)/);
  assert.match(internalAgentsSource, /No message, payment, contract, or external work will be started/);
  assert.doesNotMatch(
    internalAgentsSource,
    /exportunity-operations-light|bg-gray-950|bg-gray-900|border-gray-800|text-gray-100|Bourse de l'Or|MindBase/i,
  );
  assert.match(agentProfileSource, /data-testid="exportunity-agent-profile-workspace"/);
  assert.match(agentProfileSource, /bg-\[#f7f8fa\]/);
  for (const endpoint of ["profile", "runtime-model", "memory", "skills", "test", "chat", "chat-sessions"]) {
    assert.match(agentProfileSource, new RegExp(`\\/api\\/v2\\/agents\\/\\$\\{agentId\\}\\/${endpoint}`));
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
  );
  assert.match(retiredAgentDetailSource, /data-testid="exportunity-retired-agent-detail-redirect"/);
  assert.match(retiredAgentDetailSource, /<Redirect to=\{`\/operations\/agents\/\$\{legacyAgentId\}`\}/);
  assert.match(retiredAgentDetailSource, /<Redirect to=\{`\/operations\/agents\/\$\{runtimeAgentId\}`\}/);
  assert.match(retiredAgentDetailSource, /<Redirect to="\/agents-os\?tab=registry"/);
  assert.match(retiredAgentDetailSource, /apiRequest\(`\/api\/admin\/agents\/\$\{definitionId\}`, "GET"\)/);
  assert.ok(retiredAgentDetailSource.split(/\r?\n/).length < 180);
  assert.doesNotMatch(
    retiredAgentDetailSource,
    /useMutation|\/api\/email\/send|\/api\/comms\/send|\/api\/voice\/call|\/api\/admin\/mailboxes|exportunity-operations-light|bg-gray-9(?:00|50)|border-gray-8(?:00|50)|Bourse de l'Or|MindBase/i,
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
    assert.equal(existsSync(new URL(`../client/src/pages/${retiredOrphanPage}`, import.meta.url)), false);
  }
  assert.equal(existsSync(new URL("../client/src/components/ECEChatInterface.tsx", import.meta.url)), false);
  assert.doesNotMatch(appSource, /ProductPublicPage|EmailAppPage|ECE(?:Admin|Buyer|Shareholder|Supplier)ChatPage/);
  assert.match(routeMetaSource, /path: "\/product\/:slug"/);
  assert.equal(existsSync(new URL("../client/src/pages/AgentCommandCenterPage.tsx", import.meta.url)), false);
  assert.doesNotMatch(appSource, /AgentCommandCenterPage/);
});

test("the Exportunity Operations Center is a native GTN coordinator without duplicate write controls", () => {
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
  );
});

test("people access and organization use native GTN surfaces with guarded live changes", () => {
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
  );
});

test("agenda preserves governed meeting records in a native GTN workspace", () => {
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
  );
  assert.doesNotMatch(globalCssSource, /exportunity-operations-light/);
  assert.doesNotMatch(legacyAiTeamSource, /legacy-operations-light\.css/);
  assert.equal(existsSync(new URL("../client/src/legacy-operations-light.css", import.meta.url)), false);
});

test("account activation and partner applications share the GTN interface and preserve their records", () => {
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
});

test("buyer order records use the GTN interface and a signed-in tenant-scoped read model", () => {
  const orderRouteSource = read("server/routes/exportunity-order-records.ts");
  const serverRoutesSource = read("server/routes.ts");

  assert.match(tradeOrdersSource, /data-testid="exportunity-trade-orders-page"/);
  assert.match(tradeOrdersSource, /data-testid="exportunity-order-record"/);
  assert.match(tradeOrdersSource, /\/api\/exportunity\/order-records/);
  assert.match(tradeOrdersSource, /BigInt\(match\[2\]\)/);
  assert.doesNotMatch(
    tradeOrdersSource,
    /BOURSE DE L'OR|tenants\/bdo|MindBase|\/api\/marketplace\/buyer\/orders|pay-with-wallet|KkiapayCheckoutButton/i,
  );
  assert.match(
    appSource,
    /const MyOrdersPage = includeOtherTenantUi[\s\S]*import\("@\/pages\/MyOrdersPage"\)[\s\S]*import\("@\/pages\/exportunity\/TradeOrdersPage"\)/,
  );
  assert.match(orderRouteSource, /router\.get\("\/", ensureTenantUser/);
  assert.match(orderRouteSource, /router\.get\("\/:orderNumber", ensureTenantUser/);
  assert.match(orderRouteSource, /eq\(marketplaceOrders\.tenantId, tenant\.id\)/);
  assert.match(orderRouteSource, /ownershipPredicate\(viewer\)/);
  assert.doesNotMatch(orderRouteSource, /marketplaceOrders\.buyerUserId/);
  assert.doesNotMatch(orderRouteSource, /router\.(?:post|put|patch|delete)\(/);
  assert.match(serverRoutesSource, /"\/api\/exportunity\/order-records", exportunityOrderRecordsRouter/);
  assert.match(read("server/lib/seo/runtimeSeo.ts"), /"\/orders": "Global Trade Network Order Records"/);
  assert.match(read("scripts/site/public-surface-contracts.ts"), /path: "\/orders"/);
});

test("public governance and failure states cannot fall back to the BDO interface", () => {
  const routePolicySource = read("client/src/lib/exportunityPublicRoutePolicy.ts");
  const errorBoundarySource = read("client/src/components/ErrorBoundary.tsx");
  const institutionFooterSource = read("client/src/components/branding/InstitutionFooter.tsx");

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
  assert.match(read("scripts/site/public-surface-contracts.ts"), /path: "\/cadre-conformite"/);
  assert.match(read("server/lib/seo/runtimeSeo.ts"), /"\/cadre-conformite": "Global Trade Network Governance and Compliance"/);
});

test("surface identity files bypass stale service-worker cache entries", () => {
  const serviceWorkerSource = read("client/public/sw.js");
  const buildStampSource = read("scripts/stamp-build.mjs");
  assert.match(serviceWorkerSource, /endsWith\("\/build\.json"\).*return true/);
  assert.match(serviceWorkerSource, /endsWith\("\/exportunity-surface\.json"\).*return true/);
  assert.match(serviceWorkerSource, /fetch\(request, \{ cache: "no-store" \}\)/);
  assert.match(serviceWorkerSource, /const TENANT = "platform"/);
  assert.match(serviceWorkerSource, /isApiRequest\(url\)[\s\S]*fetch\(request, \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(serviceWorkerSource, /API_CACHE|manifest-bdo|tenants\/bdo|const TENANT = "bdo"/);
  assert.match(buildStampSource, /resolveServiceWorkerTenant/);
  assert.match(buildStampSource, /updateSwVersion\(path\.join\(DIST_PUBLIC, "sw\.js"\), build\.buildId, APP_NAME\)/);
});

test("Exportunity release retention is bounded locally and remotely", () => {
  assert.deepEqual(
    {
      keepLocalReleases: tenantConfig.tenants.exportunity.keepLocalReleases,
      keepLocalArchivedReleases:
        tenantConfig.tenants.exportunity.keepLocalArchivedReleases,
      keepRemoteReleases: tenantConfig.tenants.exportunity.keepRemoteReleases,
      keepRemoteArchives: tenantConfig.tenants.exportunity.keepRemoteArchives,
    },
    {
      keepLocalReleases: 1,
      keepLocalArchivedReleases: 0,
      keepRemoteReleases: 2,
      keepRemoteArchives: 2,
    },
  );
  assert.match(tenantConfigScript, /KEEP_LOCAL_ARCHIVED_RELEASES/);
  assert.match(tenantConfigScript, /KEEP_REMOTE_ARCHIVES/);
  assert.match(localBackupPruneScript, /KEEP_LOCAL_ARCHIVED_RELEASES/);
  assert.match(deployScript, /KEEP_REMOTE_ARCHIVES/);
  assert.match(deployScript, /refusing to prune archive outside/);
});
