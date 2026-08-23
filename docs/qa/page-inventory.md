# Page Inventory

Generated: 2026-02-02T02:39:26.434Z

| Path | Label | Auth Required | Hidden | Reason | Component | Redirect | Feature Flag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| / | Default Landing | no | yes | Primary entry route with automatic redirects. | DefaultLanding |  |  |
| /retail | Retail Home | no | yes | Primary marketplace entry; access is handled by role/gateway routing and in-page mode controls. | BuyerHomePage |  |  |
| /marketplace | Marketplace Home | no | yes | Primary marketplace entry; access is handled by role/gateway routing and in-page mode controls. | BuyerHomePage |  |  |
| /shop | Marketplace Home | no | yes | Marketplace entry handled by CTA/role routing. | BuyerHomePage |  |  |
| /gateway | Gateway | no | yes | Primary role gateway entry. | GatewayPage |  |  |
| /about | About | no | yes | Marketing page reached from landing flows and contextual links (not part of the admin/agent menus). | GatewayPage |  |  |
| /how-it-works | How It Works | no | yes | Marketing page reached from landing flows and contextual links (not part of the admin/agent menus). | GatewayPage |  |  |
| /orders | Orders | no | yes | Orders view accessed from account/CTA. | MyOrdersPage |  |  |
| /orders/:orderNumber | Order Detail | no | yes | Detail page linked from orders list. | MyOrdersPage |  |  |
| /delivery | Delivery Hub | no | yes | Delivery hub entry accessed from CTA. | DeliveryHubPage |  |  |
| /marketplace-old | Legacy Marketplace | no | yes | Legacy route kept for backwards compatibility. | MarketplacePage |  |  |
| /product/:slug | Product Detail | no | yes | Governed product deep link handled by the current tenant storefront or Exportunity industrial alias. | ExportunityLegacyCommerceGuard | /industrial |  |
| /verify/:serial | Stamped Gold Verification | no | yes | Verification page reached via QR/deep links; not a navigation destination. | StampedGoldVerifyPage |  |  |
| /login | Login | no | yes | Authentication entry screen. | ECELoginPage |  |  |
| /register | Register | no | yes | Authentication entry screen. | ECELoginPage |  |  |
| /account | Account | no | yes | Account entry accessed from user menu. | AccountPage |  |  |
| /app/login | Pro App Login | no | yes | Professional app entry; accessed via deep links/CTA. | AppProLoginPage |  |  |
| /app/join/:role | Pro App Join | no | yes | Professional app onboarding flow. | AppProJoinPage |  |  |
| /app | GTN Operations Alias | no | yes | Legacy app entry redirects to the canonical GTN operations workspace. |  | /pro/operations |  |
| /app/room/:roomKey | GTN Operations Room Alias | no | yes | Legacy room deep links redirect to the canonical GTN operations room. |  | /pro/operations/:roomKey |  |
| /app/equipment | Pro App Equipment | no | yes | Professional equipment tools accessed from the pro app. | AppProEquipmentPage |  |  |
| /app/:rest* | Pro App Redirect | no | yes | Catch-all redirect for professional app deep links. |  | /app |  |
| /inbox | Inbox | no | yes | Conversation hub accessed from contextual entry points (e.g. Wallet strip, buttons, notifications). | InboxPage |  |  |
| /inbox/:roomKey | Inbox Room | no | yes | Conversation room linked from inbox list. | RoomPage |  |  |
| /qa-mobile | QA Mobile Gate | no | yes | QA utility, not for production users. | QAMobilePage |  |  |
| /debug/location | Debug Location | no | yes | Debug utility, not for production users. | DebugLocationPage |  |  |
| /application-status | Application Status | no | yes | Status deep link from email. | ApplicationStatusPage |  |  |
| /apply/shop | Shop Application | no | yes | Application flow entry from CTA. | ShopApplicationPage |  |  |
| /apply/delivery | Delivery Application | no | yes | Application flow entry from CTA. | DeliveryApplicationPage |  |  |
| /cadre-conformite | Compliance | no | yes | Legal/compliance footer link. | CompliancePage |  |  |
| /terms | Terms | no | yes | Legal footer link. | TermsPage |  |  |
| /privacy | Privacy | no | yes | Legal footer link. | PrivacyPage |  |  |
| /install | Install App | no | yes | Install flow entry (PWA). | InstallAppPage |  |  |
| /pay/kkiapay/return | Kkiapay Return | no | yes | Payment provider return URL. | KkiapayReturnPage |  |  |
| /wallet/topup/return | Wallet Topup Return | no | yes | Top-up provider return URL. | WalletTopupReturnPage |  |  |
| /sellers | Seller Directory | no | yes | Directory is accessed from marketplace CTAs and discovery flows. | SellerDirectoryPage |  |  |
| /seller/topup | Seller Topup | no | yes | Topup flow accessed from seller dashboard actions. | SellerTopupPage |  |  |
| /switch | Switch Space | no | yes | Deep link used by space switcher. | SwitchSpacePage |  |  |
| /admin | Admin Login | no | yes | Authentication entry screen. | AdminLoginPage |  |  |
| /admin/password | Admin Password Reset | no | yes | Password change flow. | AdminPasswordChangePage |  |  |
| /dashboard | Dashboard | yes | no |  | AdminDashboardPage |  |  |
| /ai-team | AI Team HQ | yes | no |  | AITeamHubPage |  |  |
| /meetings | Meetings Redirect | no | yes | Legacy redirect to /ai-team. |  | /ai-team |  |
| /agents | Agents | yes | no |  | HierarchyPage |  |  |
| /agents/:agentId | Agent Detail | yes | yes | Detail page linked from Agents home. | AgentDetailPage |  |  |
| /admin/agents | Agent Jobs (Legacy) | yes | yes | Legacy task runner; daily work is agent-centric under /agents. | AgentCommandCenterPage |  |  |
| /admin/inbox | Inbox | yes | no |  | AdminInboxPage |  |  |
| /admin/email | Email Setup | yes | no |  | AdminEmailControlCenterPage |  |  |
| /hierarchy | Hierarchy Redirect | yes | yes | Legacy redirect to /agents. |  | /agents |  |
| /tasks | Tasks | yes | no |  | TasksPage |  |  |
| /goals | Objectives | yes | no |  | GoalsPage |  |  |
| /actions | Automations | yes | no |  | ActionsPage |  |  |
| /finance | Finance | yes | no |  | FinancePage |  |  |
| /knowledge | Knowledge Base | yes | no |  | KnowledgeBasePage |  |  |
| /expert-clones | Expert Agents | yes | no |  | ExpertClonesHubPage |  |  |
| /companies | Companies | yes | no |  | CompanyListPage |  |  |
| /delivery/agent/:id | Delivery Agent Detail | yes | yes | Detail page linked from delivery admin list. | DeliveryAgentDashboard |  |  |
| /delivery/admin | Delivery | yes | no |  | DeliveryAdminDashboard |  |  |
| /agent-economy | Wallets & Credits | yes | no |  | AgentEconomyDashboard |  |  |
| /seller-dashboard | Seller Dashboard | yes | no |  | SellerDashboard |  |  |
| /seller | Seller Dashboard Alias | yes | yes | Alias route for /seller-dashboard. |  | /seller-dashboard |  |
| /marketplace/sellers | Sellers | yes | no |  | SellerListPage |  |  |
| /marketplace/sellers/:id | Seller Detail | yes | yes | Detail page linked from sellers list. | MarketplaceSellerDetailPage |  |  |
| /profile | Profile | yes | no |  | UserProfilePage |  |  |
| /whatsapp | WhatsApp Redirect | yes | yes | Legacy redirect to /admin/communications/whatsapp. |  | /admin/communications/whatsapp |  |
| /admin/communications/whatsapp | WhatsApp | yes | no |  | WhatsAppConversationsPage |  |  |
| /admin-users | Users & Roles | yes | no |  | AdminUserManagementPage |  |  |
| /subscription-plans | Plans | yes | no |  | SubscriptionPlansPage |  |  |
| /client-hunter | Leads & Campaigns | yes | no |  | ClientHunterPage |  |  |
| /marketing | Marketing | yes | no |  | MarketingPage |  |  |
| /sales | Sales | yes | no |  | SalesPage |  |  |
| /contracts/:contractId | Contract Detail | yes | yes | Detail page linked from contracts list. | ContractDetailPage |  |  |
| /contracts | Contracts | yes | no |  | ContractsPage |  |  |
| /bureaus | Bureaus | yes | no |  | AuthorizedBureausPage |  |  |
| /admin/assets/images | Admin Assets Redirect | yes | yes | Legacy redirect to /admin/media/assets. |  | /admin/media/assets |  |
| /admin/media/assets | Asset Studio | yes | no |  | AdminAssetStudioPage |  |  |
| /admin/media/images | Image Studio Redirect | yes | yes | Legacy redirect to /admin/media/assets. |  | /admin/media/assets |  |
| /admin/media/debug | Media Debug | yes | no |  | AdminMediaDebugPage |  |  |
| /admin/website/landing-images | Landing Images Redirect | yes | yes | Legacy redirect to /admin/media/assets?tab=presets&scope=landing. |  | /admin/media/assets?tab=presets&scope=landing |  |
| /admin/website/visits | Visits Intelligence | yes | no |  | AdminVisitsIntelligencePage |  |  |
| /admin/website/seo | SEO Health | yes | no |  | AdminSeoHealthPage |  |  |
| /admin/website/seo-autopilot | SEO Autopilot | yes | no |  | AdminSeoAutopilotPage |  |  |
| /admin/marketplace/products | Products | yes | no |  | AdminMarketplaceProductsPage |  |  |
| /admin/equipment-ops | Equipment Ops Redirect | yes | yes | Redirect entry to the default Equipment Ops view. |  | /admin/equipment-ops/fleet-map |  |
| /admin/equipment-ops/fleet-map | Fleet Map | yes | no |  | AdminEquipmentOpsFleetMapPage |  |  |
| /admin/equipment-ops/listings | Listings | yes | no |  | AdminEquipmentOpsListingsPage |  |  |
| /admin/equipment-ops/contracts | Contracts | yes | no |  | AdminEquipmentOpsContractsPage |  |  |
| /admin/equipment-ops/maintenance | Maintenance | yes | no |  | AdminEquipmentOpsMaintenancePage |  |  |
| /admin/stamped-gold/skus | SKUs | yes | no |  | AdminStampedGoldSkusPage |  |  |
| /admin/stamped-gold/items | Items | yes | no |  | AdminStampedGoldItemsPage |  |  |
| /admin/stamped-gold/jewellers | Jewellers | yes | no |  | AdminStampedGoldJewellersPage |  |  |
| /admin/stamped-gold/scans | Scans | yes | no |  | AdminStampedGoldScansPage |  |  |
| /admin/stamped-gold/pickup | Pickup | yes | no |  | AdminStampedGoldPickupPage |  |  |
| /admin/marketplace/payments | Payments | yes | no |  | AdminMarketplacePaymentsPage |  |  |
| /admin/wallet | Wallet OS Redirect | yes | yes | Redirect entry to the default Wallet OS view. |  | /admin/wallet/accounts |  |
| /admin/wallet/accounts | Wallet Accounts | yes | no |  | AdminWalletAccountsPage |  |  |
| /admin/wallet/ledger | Ledger | yes | no |  | AdminWalletLedgerPage |  |  |
| /admin/wallet/topups | Topups | yes | no |  | AdminWalletTopupsPage |  |  |
| /admin/wallet/payouts | Payouts | yes | no |  | AdminWalletPayoutsPage |  |  |
| /admin/wallet/vouchers | Vouchers | yes | no |  | AdminWalletVouchersPage |  |  |
| /admin/wallet/sellers | Sellers | yes | no |  | AdminWalletSellersPage |  |  |
| /admin/wallet/risk | Risk | yes | no |  | AdminWalletRiskPage |  |  |
| /admin/wallet/config | Config | yes | no |  | AdminWalletConfigPage |  |  |
| /admin/system/update | Update / Reset | yes | no |  | AdminSystemUpdatePage |  |  |
| /admin/ux-audit | UX Audit | yes | no |  | AdminUxAuditPage |  |  |
| /admin/settings/map | Map Settings | yes | no |  | AdminMapSettingsPage |  |  |
| /admin/settings/onboarding | Onboarding & PWA | yes | no |  | AdminOnboardingSettingsPage |  |  |
| /admin/territories | Territories Redirect | yes | yes | Legacy redirect to /territories. |  | /territories |  |
| /admin/territories/:id | Territory Hub Redirect | yes | yes | Legacy redirect to /territories/:id. |  |  |  |
| /admin/gateway-images | Gateway Images Redirect | yes | yes | Legacy redirect to /admin/media/assets. |  | /admin/media/assets |  |
| /territories | Territories | yes | no |  | TerritoryManagementPage |  |  |
| /territories/:id | Territory Detail | yes | yes | Detail page linked from territory list. | TerritoryDetailPage |  |  |
