import { Component, Suspense, lazy, useEffect, useRef, type ComponentType, type ErrorInfo } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { useSession } from "@/lib/session";
import { useTenant } from "@/lib/tenant";
import { getTenantAdminHomeRoute, getTenantDefaultRoute, isTenantRouteAllowed } from "@/lib/tenantPolicy";
import { resolveTenantAdminAliasDestination, type StandardAdminKey } from "@/lib/adminIa";
import { syncDemoModeFromUrl } from "@/lib/demoMode";
import { telemetry } from "@platform/telemetry";
import { getTenantConfigByKey, getTenantHomeRoute } from "../../tenants/index";
import {
  isBdoHost,
  isAgoojyeHost,
  isExportunityMarketingHost,
  isHozHost,
  isMetHost,
  isMindbaseHost,
  isVsHost,
  isZoguelandHost,
  isZoneHost,
} from "@/lib/hostMode";

import ServiceWorkerUpdateBanner from "@/components/ServiceWorkerUpdateBanner";
import BuildMismatchBanner from "@/components/BuildMismatchBanner";
import ZoneInstallPrompt from "@/components/ZoneInstallPrompt";
import { MinerLoadingAnimation } from "@/components/MinerLoadingAnimation";
import { TapTraceOverlay } from "@/components/debug/TapTraceOverlay";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

const lazyPage = (importer: () => Promise<any>, exportName?: string) =>
  lazy(async () => {
    const mod = await importer();
    const component = (exportName ? mod?.[exportName] : mod?.default) as ComponentType<any> | undefined;
    if (!component) {
      throw new Error(`Lazy page import failed: missing export "${exportName ?? "default"}"`);
    }
    return { default: component };
  });

class RouteErrorBoundary extends Component<
  { routePath: string; children: React.ReactNode },
  { error: Error | null; info: ErrorInfo | null; copied: boolean }
> {
  state = {
    error: null,
    info: null,
    copied: false,
  } as { error: Error | null; info: ErrorInfo | null; copied: boolean };

  static getDerivedStateFromError(error: Error) {
    return { error, info: null, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
  }

  copyDebug = async () => {
    const { error, info } = this.state;
    const lines = [
      `Route: ${this.props.routePath}`,
      `Time: ${new Date().toISOString()}`,
      `UserAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
      "",
      `Error: ${error?.name || "Error"}: ${error?.message || ""}`,
      error?.stack ? `Stack:\n${error.stack}` : "",
      info?.componentStack ? `ComponentStack:\n${info.componentStack}` : "",
    ].filter(Boolean);
    const payload = lines.join("\n");

    try {
      await navigator.clipboard.writeText(payload);
      this.setState({ copied: true });
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = payload;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
        this.setState({ copied: true });
      } catch {
        // ignore
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl bg-gray-900 border-gray-800">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-red-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-lg font-semibold text-white">Page failed to load</div>
                <div className="mt-1 text-sm text-gray-400">
                  Route: <span className="text-gray-200">{this.props.routePath}</span>
                </div>
                <div className="mt-1 text-sm text-gray-300">{this.state.error.message}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white/80 hover:bg-white/10"
                onClick={this.copyDebug}
              >
                {this.state.copied ? "Copied" : "Report to Codex"}
              </Button>
              <Button
                type="button"
                className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-xs text-gray-300 mb-2">Debug</div>
              <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words max-h-[240px] overflow-auto">
                {this.state.error.stack || this.state.error.message}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

// Public pages (route-level code split)
const MarketplacePage = lazyPage(() => import("@/pages/MarketplacePage"), "MarketplacePage");
const GatewayPage = lazyPage(() => import("@/pages/GatewayPage"), "GatewayPage");
const AdminLoginPage = lazyPage(() => import("@/pages/AdminLoginPage"), "AdminLoginPage");
const AdminPasswordChangePage = lazyPage(() => import("@/pages/AdminPasswordChangePage"), "AdminPasswordChangePage");
const ECELoginPage = lazyPage(() => import("@/pages/ECELoginPage"), "ECELoginPage");
const SetupPasswordPage = lazyPage(() => import("@/pages/SetupPasswordPage"));
const ApplicationStatusPage = lazyPage(() => import("@/pages/ApplicationStatusPage"), "ApplicationStatusPage");
const CompliancePage = lazyPage(() => import("@/pages/CompliancePage"), "CompliancePage");
const TermsPage = lazyPage(() => import("@/pages/TermsPage"), "TermsPage");
const PrivacyPage = lazyPage(() => import("@/pages/PrivacyPage"), "PrivacyPage");
const InstallAppPage = lazyPage(() => import("@/pages/InstallAppPage"), "InstallAppPage");
const SwitchSpacePage = lazyPage(() => import("@/pages/SwitchSpacePage"), "SwitchSpacePage");
const ChairmanQuickPage = lazyPage(() => import("@/pages/ChairmanQuickPage"), "ChairmanQuickPage");
const AccountPage = lazyPage(() => import("@/pages/AccountPage"));
const QAMobilePage = lazyPage(() => import("@/pages/QAMobilePage"));
const DebugLocationPage = lazyPage(() => import("@/pages/DebugLocationPage"));
const DebugHitTestPage = lazyPage(() => import("@/pages/DebugHitTestPage"));
const StorePage = lazyPage(() => import("@/pages/store/StorePage"));
const StoreCollectionsPage = lazyPage(() => import("@/pages/store/StoreCollectionsPage"));
const StoreCollectionPage = lazyPage(() => import("@/pages/store/StoreCollectionPage"));
const StoreProductPage = lazyPage(() => import("@/pages/store/StoreProductPage"));
const StampedGoldVerifyPage = lazyPage(() => import("@/pages/StampedGoldVerifyPage"));
const MyOrdersPage = lazyPage(() => import("@/pages/MyOrdersPage"));
const DeliveryHubPage = lazyPage(() => import("@/pages/DeliveryHubPage"));
const InboxPage = lazyPage(() => import("@/pages/InboxPage"));
const RoomPage = lazyPage(() => import("@/pages/RoomPage"));
const AppProInboxPage = lazyPage(() => import("@/pages/AppProInboxPage"));
const AppProChatsPage = lazyPage(() => import("@/pages/AppProChatsPage"));
const AppProActionsPage = lazyPage(() => import("@/pages/AppProActionsPage"));
const AppProWalletPage = lazyPage(() => import("@/pages/AppProWalletPage"));
const AppProMoneyPage = lazyPage(() => import("@/pages/AppProMoneyPage"));
const AppProRoomPage = lazyPage(() => import("@/pages/AppProRoomPage"));
const AppProMineHomePage = lazyPage(() => import("@/pages/AppProMineHomePage"));
const AppProLoginPage = lazyPage(() => import("@/pages/AppProLoginPage"));
const AppProJoinPage = lazyPage(() => import("@/pages/AppProJoinPage"));
const AppProShopPage = lazyPage(() => import("@/pages/AppProShopPage"));
const AppProEquipmentPage = lazyPage(() => import("@/pages/AppProEquipmentPage"));
const AppProAgentsPage = lazyPage(() => import("@/pages/AppProAgentsPage"));
const AppProOrdersPage = lazyPage(() => import("@/pages/AppProOrdersPage"));
const AppProMePage = lazyPage(() => import("@/pages/AppProMePage"));
const AuthGatePage = lazyPage(() => import("@/pages/AuthGatePage"));
const AppContractsModulePage = lazyPage(() => import("@/pages/AppContractsModulePage"));
const AppInvestOpportunitiesPage = lazyPage(() => import("@/pages/AppInvestOpportunitiesPage"));
const AppInvestOpportunityDetailPage = lazyPage(() => import("@/pages/AppInvestOpportunityDetailPage"));
const AppInvestOnboardingPage = lazyPage(() => import("@/pages/AppInvestOnboardingPage"));
const AppRaiseCapitalApplyPage = lazyPage(() => import("@/pages/AppRaiseCapitalApplyPage"));
const AppGovernanceLogsPage = lazyPage(() => import("@/pages/AppGovernanceLogsPage"));
const AppMachineryFinancingPage = lazyPage(() => import("@/pages/AppMachineryFinancingPage"));
const MailPage = lazyPage(() => import("@/pages/MailPage"), "MailPage");
const MachineryPage = lazyPage(() => import("@/pages/MachineryPage"), "MachineryPage");
const ShopApplicationPage = lazyPage(() => import("@/pages/ShopApplicationPage"));
const DeliveryApplicationPage = lazyPage(() => import("@/pages/DeliveryApplicationPage"));
const KkiapayReturnPage = lazyPage(() => import("@/pages/KkiapayReturnPage"), "KkiapayReturnPage");
const WalletTopupReturnPage = lazyPage(() => import("@/pages/WalletTopupReturnPage"), "WalletTopupReturnPage");
const SellerTopupPage = lazyPage(() => import("@/pages/SellerTopupPage"));
const SellerDirectoryPage = lazyPage(() => import("@/pages/SellerDirectoryPage"));
const MeetingsHubPage = lazyPage(() => import("@/pages/MeetingsHubPage"));
const AgendaPage = lazyPage(() => import("@/pages/AgendaPage"));
const MeetRoomPage = lazyPage(() => import("@/pages/MeetRoomPage"));
const PublicCadastreDemoPage = lazyPage(() => import("@/pages/PublicCadastreDemoPage"));
const MindbaseLandingPage = lazyPage(() => import("@/pages/mindbase/MindbaseLandingPage"));
const MindbaseDiscoverPage = lazyPage(() => import("@/pages/mindbase/MindbaseDiscoverPage"));
const MindbaseIntellectPage = lazyPage(() => import("@/pages/mindbase/MindbaseIntellectPage"));
const MindbaseCreatorProfilePage = lazyPage(() => import("@/pages/mindbase/MindbaseCreatorProfilePage"));
const MindbaseStudioPage = lazyPage(() => import("@/pages/mindbase/MindbaseStudioPage"));
const MindbaseBuildChatPage = lazyPage(() => import("@/pages/mindbase/MindbaseBuildChatPage"));
const MindbaseStudioIntellectPage = lazyPage(() => import("@/pages/mindbase/MindbaseStudioIntellectPage"));
const MindbaseWorkspacesPage = lazyPage(() => import("@/pages/mindbase/MindbaseWorkspacesPage"));
const MindbasePricingPage = lazyPage(() => import("@/pages/mindbase/MindbasePricingPage"));
const MindbaseDocsApiPage = lazyPage(() => import("@/pages/mindbase/MindbaseDocsApiPage"));
const MindbaseAdminDashboardPage = lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminDashboardPage");
const MindbaseAdminModerationPage = lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminModerationPage");
const MindbaseAdminUsersPage = lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminUsersPage");
const MindbaseAdminCreditsPage = lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminCreditsPage");
const MindbaseAdminAgentsPage = lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminAgentsPage");
const MindbaseAdminSettingsPage = lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminSettingsPage");

// Exportunity marketing clone (exportunity.com)
const ExportunityGlobalTradeHomePage = lazyPage(() => import("@/pages/exportunity/GlobalTradeHomePage"));
const ExportunityIndustrialHubPage = lazyPage(() => import("@/pages/exportunity/IndustrialHubPage"));
const ExportunityMarketingHomePage = lazyPage(() => import("@/pages/exportunity/MarketingHomePage"));
const ExportunityMarketingVitrinePage = lazyPage(() => import("@/pages/exportunity/MarketingVitrinePage"));
const ExportunityMarketingAboutPage = lazyPage(() => import("@/pages/exportunity/MarketingAboutPage"));
const ExportunityMarketingStoryPage = lazyPage(() => import("@/pages/exportunity/MarketingStoryPage"));
const ExportunityMarketingFounderStoryPage = lazyPage(() => import("@/pages/exportunity/MarketingFounderStoryPage"));
const ExportunityMarketingUseCasesPage = lazyPage(() => import("@/pages/exportunity/MarketingUseCasesPage"));
const ExportunityMarketingProofPage = lazyPage(() => import("@/pages/exportunity/MarketingProofPage"));
const ExportunityMarketingSolutionsPage = lazyPage(() => import("@/pages/exportunity/MarketingSolutionsPage"));
const ExportunityMarketingPlatformPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformPage"));
const ExportunityMarketingPlatformOsPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformOsPage"));
const ExportunityMarketingPlatformProPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformProPage"));
const ExportunityMarketingPlatformGoldPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformGoldPage"));
const ExportunityMarketingPlatformAgentsPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformAgentsPage"));
const ExportunityMarketingPlatformMarketplacePage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformMarketplacePage"));
const ExportunityMarketingPlatformWalletPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformWalletPage"));
const ExportunityMarketingPlatformContractsPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformContractsPage"));
const ExportunityMarketingPlatformInvestPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformInvestPage"));
const ExportunityMarketingPlatformCompliancePage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformCompliancePage"));
const ExportunityMarketingPlatformMessagingPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformMessagingPage"));
const ExportunityMarketingPlatformGovernancePage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformGovernancePage"));
const ExportunityMarketingPlatformSecurityPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformSecurityPage"));
const ExportunityMarketingPlatformScreenshotsPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformScreenshotsPage"));
const ExportunityMarketingPlatformModulesPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformModulesPage"));
const ExportunityMarketingPlatformModuleDetailPage = lazyPage(() => import("@/pages/exportunity/MarketingPlatformModuleDetailPage"));
const ExportunityMarketingDemoPage = lazyPage(() => import("@/pages/exportunity/MarketingDemoPage"));
const ExportunityMarketingMediaPage = lazyPage(() => import("@/pages/exportunity/MarketingMediaPage"));
const ExportunityMarketingMediaPressPage = lazyPage(() => import("@/pages/exportunity/MarketingMediaPressPage"));
const ExportunityMarketingMediaVideosPage = lazyPage(() => import("@/pages/exportunity/MarketingMediaVideosPage"));
const ExportunityMarketingMediaProfilesPage = lazyPage(() => import("@/pages/exportunity/MarketingMediaProfilesPage"));
const ExportunityMarketingAdvisoryPage = lazyPage(() => import("@/pages/exportunity/MarketingAdvisoryPage"));
const ExportunityMarketingContactPage = lazyPage(() => import("@/pages/exportunity/MarketingContactPage"));
const ExportunityMarketingTalkPage = lazyPage(() => import("@/pages/exportunity/MarketingTalkPage"));
const ExportunityMarketingPrivacyPage = lazyPage(() => import("@/pages/exportunity/MarketingPrivacyPage"));
const ExportunityMarketingTermsPage = lazyPage(() => import("@/pages/exportunity/MarketingTermsPage"));
const ExportunityMarketingLibraryPage = lazyPage(() => import("@/pages/exportunity/MarketingLibraryPage"));
const ExportunityMarketingPostPage = lazyPage(() => import("@/pages/exportunity/MarketingPostPage"));
const ExportunityMarketingInvestPage = lazyPage(() => import("@/pages/exportunity/MarketingInvestPage"));
const ExportunityMarketingInvestOpportunitiesPage = lazyPage(() => import("@/pages/exportunity/MarketingInvestOpportunitiesPage"));
const ExportunityMarketingInvestOpportunityDetailPage = lazyPage(() => import("@/pages/exportunity/MarketingInvestOpportunityDetailPage"));
const ExportunityMarketingInvestContractsPage = lazyPage(() => import("@/pages/exportunity/MarketingInvestContractsPage"));
const ExportunityMarketingPricingPage = lazyPage(() => import("@/pages/exportunity/MarketingPricingPage"));
const MetHomePage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetHomePage");
const MetModelHousePage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetModelHousePage");
const MetBricksPage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetBricksPage");
const MetPlansPage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetPlansPage");
const MetPlanDetailPage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetPlanDetailPage");
const MetEstimatePage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetEstimatePage");
const MetRealisationsPage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetRealisationsPage");
const MetProjectDetailPage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetProjectDetailPage");
const MetBlogPage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetBlogPage");
const MetBlogPostPage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetBlogPostPage");
const MetContactPage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetContactPage");
const MetLegalMentionsPage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetLegalMentionsPage");
const MetPrivacyPolicyPage = lazyPage(() => import("@/pages/met/MetPublicPages"), "MetPrivacyPolicyPage");
const MetAdminDashboardPage = lazyPage(() => import("@/pages/met/MetAdminPages"), "MetAdminDashboardPage");
const MetAdminLeadsPage = lazyPage(() => import("@/pages/met/MetAdminPages"), "MetAdminLeadsPage");
const MetAdminEstimatesPage = lazyPage(() => import("@/pages/met/MetAdminPages"), "MetAdminEstimatesPage");
const MetAdminOrdersPage = lazyPage(() => import("@/pages/met/MetAdminPages"), "MetAdminOrdersPage");
const MetAdminProductsPage = lazyPage(() => import("@/pages/met/MetAdminPages"), "MetAdminProductsPage");
const MetAdminPlansPage = lazyPage(() => import("@/pages/met/MetAdminPages"), "MetAdminPlansPage");
const MetAdminProjectsPage = lazyPage(() => import("@/pages/met/MetAdminPages"), "MetAdminProjectsPage");
const MetAdminBlogPage = lazyPage(() => import("@/pages/met/MetAdminPages"), "MetAdminBlogPage");
const MetAdminMediaPage = lazyPage(() => import("@/pages/met/MetAdminPages"), "MetAdminMediaPage");
const MetAdminSettingsPage = lazyPage(() => import("@/pages/met/MetAdminPages"), "MetAdminSettingsPage");
const VsHomePage = lazyPage(() => import("@/pages/vs/VsPublicPages"), "VsHomePage");
const VsAboutPage = lazyPage(() => import("@/pages/vs/VsPublicPages"), "VsAboutPage");
const VsPressPage = lazyPage(() => import("@/pages/vs/VsPublicPages"), "VsPressPage");
const VsPortfolioPage = lazyPage(() => import("@/pages/vs/VsPublicPages"), "VsPortfolioPage");
const VsContactPage = lazyPage(() => import("@/pages/vs/VsPublicPages"), "VsContactPage");
const VsInsightsPage = lazyPage(() => import("@/pages/vs/VsPublicPages"), "VsInsightsPage");
const VsAdminDashboardPage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminDashboardPage");
const VsAdminReputationPage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminReputationPage");
const VsAdminPrPage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminPrPage");
const VsAdminStudioPage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminStudioPage");
const VsAdminSocialPage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminSocialPage");
const VsAdminInboxPage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminInboxPage");
const VsAdminAgentsPage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminAgentsPage");
const VsAdminAssistantPage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminAssistantPage");
const VsAdminActionsPage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminActionsPage");
const VsAdminUsersPage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminUsersPage");
const VsAdminSettingsPage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminSettingsPage");
const VsAdminWebsitePage = lazyPage(() => import("@/pages/vs/VsAdminPages"), "VsAdminWebsitePage");
const HozHomePage = lazyPage(() => import("@/pages/hoz/HozPublicPages"), "HozHomePage");
const HozBooksPage = lazyPage(() => import("@/pages/hoz/HozPublicPages"), "HozBooksPage");
const HozJewelryPage = lazyPage(() => import("@/pages/hoz/HozPublicPages"), "HozJewelryPage");
const HozMediaPage = lazyPage(() => import("@/pages/hoz/HozPublicPages"), "HozMediaPage");
const HozAboutPage = lazyPage(() => import("@/pages/hoz/HozPublicPages"), "HozAboutPage");
const HozContactPage = lazyPage(() => import("@/pages/hoz/HozPublicPages"), "HozContactPage");
const HozAdminDashboardPage = lazyPage(() => import("@/pages/hoz/HozAdminPages"), "HozAdminDashboardPage");
const HozAdminCollectionsPage = lazyPage(() => import("@/pages/hoz/HozAdminPages"), "HozAdminCollectionsPage");
const HozAdminMediaPage = lazyPage(() => import("@/pages/hoz/HozAdminPages"), "HozAdminMediaPage");
const HozAdminInboxPage = lazyPage(() => import("@/pages/hoz/HozAdminPages"), "HozAdminInboxPage");
const HozAdminWebsitePage = lazyPage(() => import("@/pages/hoz/HozAdminPages"), "HozAdminWebsitePage");
const HozAdminSettingsPage = lazyPage(() => import("@/pages/hoz/HozAdminPages"), "HozAdminSettingsPage");
const AgoojyeHomePage = lazyPage(() => import("@/pages/agoojye/AgoojyePublicPages"), "AgoojyeHomePage");
const AgoojyeVisionPage = lazyPage(() => import("@/pages/agoojye/AgoojyePublicPages"), "AgoojyeVisionPage");
const AgoojyeHistoryPage = lazyPage(() => import("@/pages/agoojye/AgoojyePublicPages"), "AgoojyeHistoryPage");
const AgoojyeChallengePage = lazyPage(() => import("@/pages/agoojye/AgoojyePublicPages"), "AgoojyeChallengePage");
const AgoojyeTeamsPage = lazyPage(() => import("@/pages/agoojye/AgoojyePublicPages"), "AgoojyeTeamsPage");
const AgoojyePartnersPage = lazyPage(() => import("@/pages/agoojye/AgoojyePublicPages"), "AgoojyePartnersPage");
const AgoojyeSponsorsPage = lazyPage(() => import("@/pages/agoojye/AgoojyePublicPages"), "AgoojyeSponsorsPage");
const AgoojyeMediaPage = lazyPage(() => import("@/pages/agoojye/AgoojyePublicPages"), "AgoojyeMediaPage");
const AgoojyeContactPage = lazyPage(() => import("@/pages/agoojye/AgoojyePublicPages"), "AgoojyeContactPage");
const AgoojyeAdminDashboardPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminDashboardPage");
const AgoojyeAdminUsersPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminUsersPage");
const AgoojyeAdminTeamsPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminTeamsPage");
const AgoojyeAdminParticipantsPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminParticipantsPage");
const AgoojyeAdminEmailsPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminEmailsPage");
const AgoojyeAdminMessagesPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminMessagesPage");
const AgoojyeAdminTasksPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminTasksPage");
const AgoojyeAdminMilestonesPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminMilestonesPage");
const AgoojyeAdminDocumentsPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminDocumentsPage");
const AgoojyeAdminPartnersPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminPartnersPage");
const AgoojyeAdminSponsorsPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminSponsorsPage");
const AgoojyeAdminMediaPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminMediaPage");
const AgoojyeAdminContentPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminContentPage");
const AgoojyeAdminSettingsPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminSettingsPage");
const AgoojyeAdminAuditPage = lazyPage(() => import("@/pages/agoojye/AgoojyeAdminPages"), "AgoojyeAdminAuditPage");
const BdoActualitesPage = lazyPage(() => import("@/pages/bdo/BdoAuthorityPages"), "BdoActualitesPage");
const BdoReglementationPage = lazyPage(() => import("@/pages/bdo/BdoAuthorityPages"), "BdoReglementationPage");
const BdoIndustrieMinierePage = lazyPage(() => import("@/pages/bdo/BdoAuthorityPages"), "BdoIndustrieMinierePage");
const BdoCertificationPage = lazyPage(() => import("@/pages/bdo/BdoAuthorityPages"), "BdoCertificationPage");
const BdoVerifierPage = lazyPage(() => import("@/pages/bdo/BdoAuthorityPages"), "BdoVerifierPage");
const BdoEspaceProDashboardPage = lazyPage(() => import("@/pages/bdo/BdoProPages"), "BdoEspaceProDashboardPage");
const BdoWholesaleMarketPage = lazyPage(() => import("@/pages/bdo/BdoProPages"), "BdoWholesaleMarketPage");
const BdoProMapPage = lazyPage(() => import("@/pages/bdo/BdoProPages"), "BdoProMapPage");
const BdoProIntelligencePage = lazyPage(() => import("@/pages/bdo/BdoProPages"), "BdoProIntelligencePage");
const BdoProBureauxPage = lazyPage(() => import("@/pages/bdo/BdoProPages"), "BdoProBureauxPage");
const BdoProBuyersPage = lazyPage(() => import("@/pages/bdo/BdoProPages"), "BdoProBuyersPage");
const BdoProExportersPage = lazyPage(() => import("@/pages/bdo/BdoProPages"), "BdoProExportersPage");
const BdoProCounterpartiesPage = lazyPage(() => import("@/pages/bdo/BdoProPages"), "BdoProCounterpartiesPage");
const BdoProMembershipPage = lazyPage(() => import("@/pages/bdo/BdoProPages"), "BdoProMembershipPage");
const BdoCoffrePage = lazyPage(() => import("@/pages/bdo/BdoGoalPages"), "BdoCoffrePage");
const BdoGoalsPage = lazyPage(() => import("@/pages/bdo/BdoGoalPages"), "BdoGoalsPage");
const BdoGoalDetailPage = lazyPage(() => import("@/pages/bdo/BdoGoalPages"), "BdoGoalDetailPage");
const BdoAdminSettingsPage = lazyPage(() => import("@/pages/bdo/BdoAdminPages"), "BdoAdminSettingsPage");
const BdoAdminGoalsPage = lazyPage(() => import("@/pages/bdo/BdoAdminPages"), "BdoAdminGoalsPage");
const BdoAdminProMembershipsPage = lazyPage(() => import("@/pages/bdo/BdoAdminPages"), "BdoAdminProMembershipsPage");
const AdminMarketingPostsPage = lazyPage(() => import("@/pages/AdminMarketingPostsPage"));
const AdminMarketingPressPage = lazyPage(() => import("@/pages/AdminMarketingPressPage"));
const AdminMarketingLibraryPage = lazyPage(() => import("@/pages/AdminMarketingLibraryPage"));
const AdminMarketingMediaPage = lazyPage(() => import("@/pages/AdminMarketingMediaPage"));
const AdminMarketingScreenshotsPage = lazyPage(() => import("@/pages/AdminMarketingScreenshotsPage"));
const AdminContactsPage = lazyPage(() => import("@/pages/AdminContactsPage"));

// Admin layout + pages (route-level code split)
const AdminLayout = lazyPage(() => import("@/components/AdminLayout"), "AdminLayout");
const AdminDashboardPage = lazyPage(() => import("@/pages/AdminDashboardPage"));
const AITeamHubPage = lazyPage(() => import("@/pages/AITeamHubPage"), "AITeamHubPage");
const AgentCommandCenterPage = lazyPage(() => import("@/pages/AgentCommandCenterPage"), "AgentCommandCenterPage");
const AdminAgentGovernancePage = lazyPage(
  () => import("@/pages/AdminAgentGovernancePage"),
  "AdminAgentGovernancePage",
);
const AdminAgentsOsPage = lazyPage(() => import("@/pages/AdminAgentsOsPage"));
  const AdminEmailControlCenterPage = lazyPage(
    () => import("@/pages/AdminEmailControlCenterPage"),
    "AdminEmailControlCenterPage",
  );
const AdminTwilioControlCenterPage = lazyPage(
  () => import("@/pages/AdminTwilioControlCenterPage"),
  "AdminTwilioControlCenterPage",
);
const AdminGooglePlacesIntegrationPage = lazyPage(() => import("@/pages/AdminGooglePlacesIntegrationPage"));
const AdminGoogleWorkspaceIntegrationPage = lazyPage(() => import("@/pages/AdminGoogleWorkspaceIntegrationPage"));
const AdminCompanyBrainPage = lazyPage(() => import("@/pages/AdminCompanyBrainPage"));
const AdminTwilioLogsPage = lazyPage(() => import("@/pages/AdminTwilioLogsPage"));
  const AdminCommunicationsInboxPage = lazyPage(
    () => import("@/pages/AdminCommunicationsInboxPage"),
    "AdminCommunicationsInboxPage",
  );
  const AdminInboxPage = lazyPage(() => import("@/pages/AdminInboxPage"), "AdminInboxPage");
const NotificationsPage = lazyPage(() => import("@/pages/NotificationsPage"), "NotificationsPage");
const AdminNotificationsPage = lazyPage(() => import("@/pages/AdminNotificationsPage"), "AdminNotificationsPage");
const AdminNotificationDetailPage = lazyPage(
  () => import("@/pages/AdminNotificationDetailPage"),
  "AdminNotificationDetailPage",
);
const HierarchyPage = lazyPage(() => import("@/pages/HierarchyPage"));
const AgentDetailPage = lazyPage(() => import("@/pages/AgentDetailPage"), "AgentDetailPage");
const OperationsAgentsPage = lazyPage(() => import("@/pages/OperationsAgentsPage"));
const MarketplaceAgentsPage = lazyPage(() => import("@/pages/MarketplaceAgentsPage"));
const AgentProfileV2Page = lazyPage(() => import("@/pages/AgentProfileV2Page"));
const TasksPage = lazyPage(() => import("@/pages/TasksPage"), "TasksPage");
const GoalsPage = lazyPage(() => import("@/pages/GoalsPage"), "GoalsPage");
const ActionsPage = lazyPage(() => import("@/pages/ActionsPage"), "ActionsPage");
const FinancePage = lazyPage(() => import("@/pages/FinancePage"), "FinancePage");
const KnowledgeBasePage = lazyPage(() => import("@/pages/KnowledgeBasePage"), "KnowledgeBasePage");
const ExpertClonesHubPage = lazyPage(() => import("@/pages/ExpertClonesHubPage"), "ExpertClonesHubPage");
const CompanyListPage = lazyPage(() => import("@/pages/CompanyListPage"), "CompanyListPage");
const DeliveryAgentDashboard = lazyPage(() => import("@/pages/DeliveryAgentDashboard"));
const DeliveryAdminDashboard = lazyPage(() => import("@/pages/DeliveryAdminDashboard"));
const SellerDashboard = lazyPage(() => import("@/pages/SellerDashboard"));
const SellerListPage = lazyPage(() => import("@/pages/SellerListPage"));
const MarketplaceSellerDetailPage = lazyPage(() => import("@/pages/MarketplaceSellerDetailPage"));
const AgentEconomyDashboard = lazyPage(() => import("@/pages/AgentEconomyDashboard"));
const UserProfilePage = lazyPage(() => import("@/pages/UserProfilePage"));
const WhatsAppConversationsPage = lazyPage(() => import("@/pages/WhatsAppConversationsPage"));
const WhatsAppLogsPage = lazyPage(() => import("@/pages/WhatsAppLogsPage"));
const AdminUserManagementPage = lazyPage(() => import("@/pages/AdminUserManagementPage"));
const AdminProTestAccountPage = lazyPage(() => import("@/pages/AdminProTestAccountPage"));
const SubscriptionPlansPage = lazyPage(() => import("@/pages/SubscriptionPlansPage"));
const ClientHunterPage = lazyPage(() => import("@/pages/ClientHunterPage"));
const MarketingPage = lazyPage(() => import("@/pages/MarketingPage"), "MarketingPage");
const SalesPage = lazyPage(() => import("@/pages/SalesPage"), "SalesPage");
const ContractsPage = lazyPage(() => import("@/pages/ContractsPage"));
const ContractDetailPage = lazyPage(() => import("@/pages/ContractDetailPage"));
const AuthorizedBureausPage = lazyPage(() => import("@/pages/AuthorizedBureausPage"));
const AdminAssetStudioPage = lazyPage(() => import("@/pages/AdminAssetStudioPage"));
const AdminMediaDebugPage = lazyPage(() => import("@/pages/AdminMediaDebugPage"));
const AdminMarketplaceProductsPage = lazyPage(() => import("@/pages/AdminMarketplaceProductsPage"));
const AdminMarketplacePaymentsPage = lazyPage(() => import("@/pages/AdminMarketplacePaymentsPage"));
const AdminPmeExchangePage = lazyPage(() => import("@/pages/AdminPmeExchangePage"));
const AdminIndustrialNetworkPage = lazyPage(() => import("@/pages/AdminIndustrialNetworkPage"));
const AdminSystemUpdatePage = lazyPage(() => import("@/pages/AdminSystemUpdatePage"));
const AdminMapIconsPage = lazyPage(() => import("@/pages/AdminMapIconsPage"));
const AdminMapSettingsPage = lazyPage(() => import("@/pages/AdminMapSettingsPage"));
const AdminOnboardingSettingsPage = lazyPage(() => import("@/pages/AdminOnboardingSettingsPage"));
const AdminDeveloperSettingsPage = lazyPage(() => import("@/pages/AdminDeveloperSettingsPage"));
const AdminUxAuditPage = lazyPage(() => import("@/pages/AdminUxAuditPage"));
const AdminVisitsIntelligencePage = lazyPage(() => import("@/pages/AdminVisitsIntelligencePage"));
const AdminSeoHealthPage = lazyPage(() => import("@/pages/AdminSeoHealthPage"));
const AdminSeoAutopilotPage = lazyPage(() => import("@/pages/AdminSeoAutopilotPage"));
const TerritoryManagementPage = lazyPage(() => import("@/pages/TerritoryManagementPage"), "TerritoryManagementPage");
const TerritoryDetailPage = lazyPage(() => import("@/pages/TerritoryDetailPage"), "TerritoryDetailPage");
const AdminWalletAccountsPage = lazyPage(() => import("@/pages/AdminWalletAccountsPage"));
const AdminWalletHubPage = lazyPage(() => import("@/pages/AdminWalletHubPage"));
const AdminWalletLedgerPage = lazyPage(() => import("@/pages/AdminWalletLedgerPage"));
const AdminWalletTopupsPage = lazyPage(() => import("@/pages/AdminWalletTopupsPage"));
const AdminWalletPayoutsPage = lazyPage(() => import("@/pages/AdminWalletPayoutsPage"));
const AdminWalletVouchersPage = lazyPage(() => import("@/pages/AdminWalletVouchersPage"));
const AdminWalletSellersPage = lazyPage(() => import("@/pages/AdminWalletSellersPage"));
const AdminWalletRiskPage = lazyPage(() => import("@/pages/AdminWalletRiskPage"));
const AdminWalletConfigPage = lazyPage(() => import("@/pages/AdminWalletConfigPage"));
const AdminFxSettingsPage = lazyPage(() => import("@/pages/AdminFxSettingsPage"));
const AdminStampedGoldMasterPage = lazyPage(() => import("@/pages/AdminStampedGoldMasterPage"));
const AdminStampedGoldSkusPage = lazyPage(() => import("@/pages/AdminStampedGoldSkusPage"));
const AdminStampedGoldItemsPage = lazyPage(() => import("@/pages/AdminStampedGoldItemsPage"));
const AdminStampedGoldJewellersPage = lazyPage(() => import("@/pages/AdminStampedGoldJewellersPage"));
const AdminStampedGoldScansPage = lazyPage(() => import("@/pages/AdminStampedGoldScansPage"));
const AdminStampedGoldPickupPage = lazyPage(() => import("@/pages/AdminStampedGoldPickupPage"));
const AdminStampedGoldMintingStudioPage = lazyPage(() => import("@/pages/AdminStampedGoldMintingStudioPage"));
const AdminEquipmentOpsFleetMapPage = lazyPage(() => import("@/pages/AdminEquipmentOpsFleetMapPage"));
const AdminEquipmentOpsListingsPage = lazyPage(() => import("@/pages/AdminEquipmentOpsListingsPage"));
const AdminEquipmentOpsContractsPage = lazyPage(() => import("@/pages/AdminEquipmentOpsContractsPage"));
const AdminEquipmentOpsMaintenancePage = lazyPage(() => import("@/pages/AdminEquipmentOpsMaintenancePage"));
const AdminWorkstationsPage = lazyPage(() => import("@/pages/AdminWorkstationsPage"));
const AdminEvidencePage = lazyPage(() => import("@/pages/AdminEvidencePage"));
const AdminActionForgePage = lazyPage(() => import("@/pages/AdminActionForgePage"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isGuest, user } = useSession();
  const { tenant } = useTenant();
  const [location] = useLocation();
  
  if (!isAuthenticated || isGuest) {
    return <Redirect to="/admin" />;
  }

  if (user?.mustChangePassword) {
    return <Redirect to="/admin/password" />;
  }

  const path = typeof window !== "undefined" ? window.location.pathname : location;
  if (!isTenantRouteAllowed(path, tenant.key)) {
    return <Redirect to={getTenantAdminHomeRoute(tenant.key)} />;
  }
  
  return <AdminLayout>{children}</AdminLayout>;
}

function TenantAdminAliasRoute({ target }: { target: StandardAdminKey }) {
  const { tenant } = useTenant();
  const [location] = useLocation();
  const destination = resolveTenantAdminAliasDestination(tenant.key, target);
  const fallback = getTenantAdminHomeRoute(tenant.key);
  if (!destination) return <Redirect to={fallback} />;
  if (destination === location) return <Redirect to={fallback} />;
  return <Redirect to={destination} />;
}

// Zone is the canonical marketplace landing.
const DefaultLanding = () => <Redirect to="/zone" />;

function RootPublicRoute() {
  const { tenant } = useTenant();
  if (isExportunityMarketingHost()) return <ExportunityMarketingHomePage />;
  if (tenant.key === "exportunity") return <ExportunityGlobalTradeHomePage />;

  const config = getTenantConfigByKey(tenant.key);
  if (!config) return <Redirect to="/store" />;

  if (config.homeMode === "platform" || config.homeMode === "hybrid") {
    return <Redirect to={getTenantHomeRoute(tenant.key)} />;
  }

  if (tenant.key === "vs") return <VsHomePage />;
  if (tenant.key === "agoojye") return <AgoojyeHomePage />;
  if (tenant.key === "met") return <MetHomePage />;
  if (tenant.key === "hoz") return <HozHomePage />;
  if (tenant.key === "mindbase") return <MindbaseLandingPage />;
  if (tenant.key === "zogueland") return <Redirect to="/store" />;
  if (tenant.key === "zone" || tenant.key === "rayon1km") return <Redirect to="/zone" />;
  return <Redirect to={getTenantHomeRoute(tenant.key)} />;
}

function ExportunityGlobalTradeRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity" && !isExportunityMarketingHost()) {
    return <ExportunityGlobalTradeHomePage />;
  }
  if (isExportunityMarketingHost()) return <Redirect to="/solutions" />;
  return <Redirect to="/zone" />;
}

function StoreRoute() {
  const [location] = useLocation();
  const normalizedLocation = location.replace(/\/+$/, "") || "/";
  const initialSpace = normalizedLocation.startsWith("/wholesale")
    ? "wholesale"
    : normalizedLocation.startsWith("/pme-exchange") || normalizedLocation.startsWith("/ready-for-export")
      ? "exchange"
      : "city";
  const exchangeVariant = normalizedLocation.startsWith("/pme-exchange") ? "pme" : "export";
  const isMapRoute =
    normalizedLocation === "/map" ||
    normalizedLocation === "/map/" ||
    normalizedLocation === "/marketplace/map" ||
    normalizedLocation.startsWith("/marketplace/map/") ||
    normalizedLocation === "/wholesale/map" ||
    normalizedLocation.startsWith("/wholesale/map/");
  const isMapDominantRoute =
    normalizedLocation.startsWith("/marketplace") ||
    normalizedLocation.startsWith("/wholesale") ||
    normalizedLocation.startsWith("/zone") ||
    normalizedLocation.startsWith("/ready-for-export") ||
    normalizedLocation.startsWith("/pme-exchange");
  const shellMode = isMapRoute
      ? "mapFull"
      : isMapDominantRoute
        ? "mapDominant"
        : "commerce";
  return <StorePage initialSpace={initialSpace} shellMode={shellMode} exchangeVariant={exchangeVariant} />;
}

function ExportunityIndustrialRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity" && !isExportunityMarketingHost()) {
    return <ExportunityIndustrialHubPage />;
  }
  return <Redirect to="/zone" />;
}

function ExportunityIndustrialMapRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity" && !isExportunityMarketingHost()) {
    return <ExportunityIndustrialHubPage />;
  }
  return <StoreRoute />;
}

function ExportunityIndustrialAliasRoute({ to }: { to: string }) {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity" && !isExportunityMarketingHost()) {
    return <Redirect to={to} />;
  }
  return <StoreRoute />;
}

function ExportunityMachineryRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity" && !isExportunityMarketingHost()) {
    return <ExportunityIndustrialHubPage />;
  }
  return isExportunityMarketingHost() ? (
    <ExportunityMarketingVitrinePage />
  ) : (
    <MarketingOrAuthRedirect marketingTo="/platform?module=machinery" authTo="/auth?next=/app/machinery/catalog" />
  );
}

function BdoWholesaleRoute() {
  const { tenant } = useTenant();
  if (isBdoHost() || tenant.key === "bdo") return <StoreRoute />;
  return tenant.key === "exportunity" ? <Redirect to="/industrial-supply" /> : <Redirect to="/zone" />;
}

function CollectionsRoute() {
  return <StoreCollectionsPage />;
}

function MindbaseHostDiscoverRoute() {
  return isMindbaseHost() ? <MindbaseDiscoverPage /> : <Redirect to="/zone" />;
}

function MindbaseHostStudioRoute() {
  return isMindbaseHost() ? <Redirect to="/build/advanced" /> : <Redirect to="/zone" />;
}

function MindbaseHostBuildChatRoute() {
  return isMindbaseHost() ? <MindbaseBuildChatPage /> : <Redirect to="/zone" />;
}

function MindbaseHostBuildAdvancedRoute() {
  return isMindbaseHost() ? <MindbaseStudioPage /> : <Redirect to="/zone" />;
}

function MindbaseHostWorkspacesRoute() {
  return isMindbaseHost() ? <MindbaseWorkspacesPage /> : <Redirect to="/zone" />;
}

function UnifiedPricingRoute() {
  if (isMindbaseHost()) return <MindbasePricingPage />;
  return <ExportunityMarketingPricingPage />;
}

function UnifiedDocsApiRoute() {
  if (isMindbaseHost()) return <MindbaseDocsApiPage />;
  return <Redirect to="/zone" />;
}

function MarketingAwareAboutRoute() {
  if (isVsHost()) return <VsAboutPage />;
  if (isHozHost()) return <HozAboutPage />;
  return isExportunityMarketingHost() ? <Redirect to="/our-journey" /> : <GatewayPage />;
}

function UnifiedContactRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "agoojye" || isAgoojyeHost()) return <AgoojyeContactPage />;
  if (isVsHost()) return <VsContactPage />;
  if (isMetHost()) return <MetContactPage />;
  if (isHozHost()) return <HozContactPage />;
  return <MarketingRedirect to="/talk" />;
}

function UnifiedMediaRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "agoojye" || isAgoojyeHost()) return <AgoojyeMediaPage />;
  if (isHozHost()) return <HozMediaPage />;
  return <ExportunityMarketingMediaPage />;
}

function AgoojyeOnlyRoute({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant();
  return tenant.key === "agoojye" || isAgoojyeHost() ? <>{children}</> : <Redirect to="/zone" />;
}

function MarketingAwarePrivacyRoute() {
  return isExportunityMarketingHost() ? <ExportunityMarketingPrivacyPage /> : <PrivacyPage />;
}

function MarketingAwareTermsRoute() {
  return isExportunityMarketingHost() ? <ExportunityMarketingTermsPage /> : <TermsPage />;
}

function withMarketingQuery(to: string) {
  if (typeof window === "undefined") return to;
  const host = String(window.location.hostname || "").trim().toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (!isLocal) return to;
  const currentParams = new URLSearchParams(window.location.search);
  if (currentParams.get("marketing") !== "1") return to;

  try {
    const parsed = new URL(to, window.location.origin);
    if (!parsed.searchParams.has("marketing")) parsed.searchParams.set("marketing", "1");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const hasQuery = to.includes("?");
    if (hasQuery) return `${to}&marketing=1`;
    return `${to}?marketing=1`;
  }
}

function MarketingRedirect({ to }: { to: string }) {
  return isExportunityMarketingHost() ? <Redirect to={withMarketingQuery(to)} /> : <Redirect to="/zone" />;
}

function MarketingOrAuthRedirect({ marketingTo, authTo }: { marketingTo: string; authTo: string }) {
  return isExportunityMarketingHost() ? <Redirect to={withMarketingQuery(marketingTo)} /> : <Redirect to={authTo} />;
}

function RetailAliasRedirect() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity" && !isExportunityMarketingHost()) {
    return <Redirect to="/industrial" />;
  }
  if (typeof window === "undefined") return <Redirect to="/zone" />;
  const pathname = String(window.location.pathname || "/retail");
  const suffix = pathname.startsWith("/retail/") ? pathname.slice("/retail".length) : "";
  const search = String(window.location.search || "");
  return <Redirect to={`/zone${suffix}${search}`} />;
}

function normalizeAccessRoleLabel(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasInternalEmailAccess(user: any) {
  const roles = Array.isArray(user?.roles) ? user.roles.map((role: unknown) => normalizeAccessRoleLabel(role)) : [];
  const currentMode = normalizeAccessRoleLabel(user?.currentMode);
  const permissions = Array.isArray(user?.permissions) ? user.permissions.map((permission: unknown) => String(permission ?? "").trim()) : [];

  if (permissions.includes("*")) return true;
  if (roles.includes("admin") || currentMode === "admin") return true;
  if (roles.includes("super admin") || roles.includes("platform admin")) return true;
  if (roles.includes("chairman assistant") || roles.includes("chairmans assistant")) return true;
  if (roles.includes("operator") || roles.includes("agent operator")) return true;
  return false;
}

function ProEmailRedirectRoute() {
  const { isAuthenticated, isGuest, user } = useSession();
  if (!isAuthenticated || isGuest) {
    return <Redirect to="/login?next=%2Fapp%2Femail" />;
  }
  if (hasInternalEmailAccess(user)) {
    return <Redirect to="/admin/email" />;
  }
  return <Redirect to="/app" />;
}

function EmailAdminRoute({ alias = false }: { alias?: boolean }) {
  const { isAuthenticated, isGuest, user } = useSession();
  if (!isAuthenticated || isGuest) {
    return <Redirect to="/admin" />;
  }
  if (user?.mustChangePassword) {
    return <Redirect to="/admin/password" />;
  }
  if (!hasInternalEmailAccess(user)) {
    return <Redirect to="/app" />;
  }
  if (alias) {
    return <Redirect to="/admin/email" />;
  }
  return (
    <AdminLayout>
      <AdminEmailControlCenterPage />
    </AdminLayout>
  );
}

function ProLandingRedirect() {
  const { isAuthenticated, isGuest, user } = useSession();
  if (!isAuthenticated || isGuest) {
    return <Redirect to="/pro/operations" />;
  }

  const roles = Array.isArray(user?.roles) ? user.roles.map(String) : [];
  const mode = String(user?.currentMode || "").toLowerCase();
  const isMine =
    roles.includes("mine_operator") ||
    roles.includes("mine_owner") ||
    roles.includes("gold_miner") ||
    mode === "mine_operator" ||
    mode === "mine_owner";

  return <Redirect to={isMine ? "/pro/mine" : "/pro/operations"} />;
}

function AgentsOsAliasRedirect() {
  const search = typeof window === "undefined" ? "" : String(window.location.search || "");
  return <Redirect to={`/agents-os${search}`} />;
}

function RouteLoadingFallback() {
  const { tenant } = useTenant();

  if (tenant.key === "exportunity") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="grid min-h-screen w-full place-items-center bg-[#F7F8FA] p-6"
      >
        <div className="flex max-w-sm flex-col items-center text-center">
          <img
            src="/tenants/exportunity/official/logo-long-light.png"
            alt="Exportunity AI"
            className="h-12 w-auto max-w-[230px]"
          />
          <div className="mt-6 flex items-center gap-3 text-sm font-medium text-[#334155]">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#F5A623]/30 border-t-[#F5A623]" />
            Opening the global trade network...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <Card className="w-full max-w-md border-gray-800 bg-gray-900">
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center gap-4">
            <MinerLoadingAnimation className="h-16 w-28 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight text-white">
                Loading...
              </h1>
              <p className="mt-1 text-sm text-gray-400">
                Preparing the page.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function App() {
  const [location] = useLocation();
  const previousPathRef = useRef(location.split("?")[0] || "/");

  useEffect(() => {
    syncDemoModeFromUrl();
    telemetry().pageView(location);

    const nextPath = location.split("?")[0] || "/";
    if (previousPathRef.current !== nextPath) {
      previousPathRef.current = nextPath;
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    }
  }, [location]);

  return (
    <div className="min-h-screen bg-background">
      <BuildMismatchBanner />
      <ServiceWorkerUpdateBanner />
      <ZoneInstallPrompt />
      {import.meta.env.DEV ? <TapTraceOverlay /> : null}
      <Suspense
        fallback={<RouteLoadingFallback />}
      >
        <RouteErrorBoundary key={location} routePath={location}>
          <Switch>
          {/* Public routes */}
          <Route path="/" component={RootPublicRoute} />
          <Route path="/source" component={ExportunityGlobalTradeRoute} />
          <Route path="/sell-export" component={ExportunityGlobalTradeRoute} />
          <Route path="/manage-supply" component={ExportunityGlobalTradeRoute} />
          <Route path="/expand" component={ExportunityGlobalTradeRoute} />
          <Route path="/store" component={StoreRoute} />
          <Route path="/or" component={StoreRoute} />
          <Route path="/or/:rest*" component={StoreRoute} />
          <Route path="/achat-or" component={StoreRoute} />
          <Route path="/achat-or/:rest*" component={StoreRoute} />
          <Route path="/stamped-gold" component={StoreRoute} />
          <Route path="/pieces" component={StoreRoute} />
          <Route path="/collections" component={CollectionsRoute} />
          <Route path="/collections/:slug">
            {(params) => <StoreCollectionPage slug={String((params as any).slug || "")} />}
          </Route>
          <Route path="/cart" component={() => <Redirect to="/store?cart=1" />} />
          <Route path="/checkout" component={() => <Redirect to="/store?checkout=1" />} />
          <Route path="/maison-modele" component={() => (isMetHost() ? <MetModelHousePage /> : <Redirect to="/zone" />)} />
          <Route path="/briques" component={() => (isMetHost() ? <MetBricksPage /> : <Redirect to="/zone" />)} />
          <Route path="/plans/:slug">
            {(params) => (isMetHost() ? <MetPlanDetailPage slug={String((params as any)?.slug || "")} /> : <MarketingRedirect to="/pricing" />)}
          </Route>
          <Route path="/plans" component={() => (isMetHost() ? <MetPlansPage /> : <MarketingRedirect to="/pricing" />)} />
          <Route path="/devis" component={() => (isMetHost() ? <MetEstimatePage /> : <Redirect to="/zone" />)} />
          <Route path="/realisations/:slug">
            {(params) => (isMetHost() ? <MetProjectDetailPage slug={String((params as any)?.slug || "")} /> : <Redirect to="/zone" />)}
          </Route>
          <Route path="/realisations" component={() => (isMetHost() ? <MetRealisationsPage /> : <Redirect to="/zone" />)} />
          <Route path="/blog/:slug">
            {(params) => (isMetHost() ? <MetBlogPostPage slug={String((params as any)?.slug || "")} /> : <MarketingRedirect to="/media" />)}
          </Route>
          <Route path="/blog" component={() => (isMetHost() ? <MetBlogPage /> : <MarketingRedirect to="/media" />)} />
          <Route path="/contact" component={UnifiedContactRoute} />
          <Route path="/vision" component={() => <AgoojyeOnlyRoute><AgoojyeVisionPage /></AgoojyeOnlyRoute>} />
          <Route path="/history" component={() => <AgoojyeOnlyRoute><AgoojyeHistoryPage /></AgoojyeOnlyRoute>} />
          <Route path="/challenge" component={() => <AgoojyeOnlyRoute><AgoojyeChallengePage /></AgoojyeOnlyRoute>} />
          <Route path="/teams" component={() => <AgoojyeOnlyRoute><AgoojyeTeamsPage /></AgoojyeOnlyRoute>} />
          <Route path="/partners" component={() => <AgoojyeOnlyRoute><AgoojyePartnersPage /></AgoojyeOnlyRoute>} />
          <Route path="/sponsors" component={() => <AgoojyeOnlyRoute><AgoojyeSponsorsPage /></AgoojyeOnlyRoute>} />
          <Route path="/mentions-legales" component={() => (isMetHost() ? <MetLegalMentionsPage /> : <Redirect to="/terms" />)} />
          <Route path="/politique-confidentialite" component={() => (isMetHost() ? <MetPrivacyPolicyPage /> : <Redirect to="/privacy" />)} />
          <Route path="/a/quick" component={ChairmanQuickPage} />
          <Route path="/mindbase" component={MindbaseLandingPage} />
          <Route path="/mindbase/discover" component={MindbaseDiscoverPage} />
          <Route path="/mindbase/explore" component={() => <Redirect to="/mindbase/discover" />} />
          <Route path="/mindbase/build" component={() => <Redirect to="/mindbase/build/chat" />} />
          <Route path="/mindbase/build/chat" component={MindbaseBuildChatPage} />
          <Route path="/mindbase/build/advanced" component={MindbaseStudioPage} />
          <Route path="/mindbase/studio" component={() => <Redirect to="/mindbase/build/advanced" />} />
          <Route path="/mindbase/workspaces" component={MindbaseWorkspacesPage} />
          <Route path="/mindbase/pricing" component={MindbasePricingPage} />
          <Route path="/mindbase/docs/api" component={MindbaseDocsApiPage} />
          <Route path="/mindbase/docs" component={() => <Redirect to="/mindbase/docs/api" />} />
          <Route path="/discover" component={MindbaseHostDiscoverRoute} />
          <Route path="/explore" component={MindbaseHostDiscoverRoute} />
          <Route path="/build" component={() => <Redirect to="/build/chat" />} />
          <Route path="/build/chat" component={MindbaseHostBuildChatRoute} />
          <Route path="/build/advanced" component={MindbaseHostBuildAdvancedRoute} />
          <Route path="/studio" component={MindbaseHostStudioRoute} />
          <Route path="/workspaces" component={MindbaseHostWorkspacesRoute} />
          <Route path="/docs/api" component={UnifiedDocsApiRoute} />
          <Route path="/studio/intellects/:id">
            {(params) =>
              isMindbaseHost() ? (
                <MindbaseStudioIntellectPage intellectId={String((params as any)?.id || "")} />
              ) : (
                <Redirect to="/zone" />
              )
            }
          </Route>
          <Route path="/mindbase/studio/intellects/:id">
            {(params) => <MindbaseStudioIntellectPage intellectId={String((params as any)?.id || "")} />}
          </Route>
          <Route path="/i/:slug">
            {(params) =>
              isMindbaseHost() ? (
                <MindbaseIntellectPage slug={String((params as any)?.slug || "")} />
              ) : (
                <Redirect to="/zone" />
              )
            }
          </Route>
          <Route path="/mindbase/i/:slug">
            {(params) => <MindbaseIntellectPage slug={String((params as any)?.slug || "")} />}
          </Route>
          <Route path="/c/:slug">
            {(params) =>
              isMindbaseHost() ? (
                <MindbaseCreatorProfilePage slug={String((params as any)?.slug || "")} />
              ) : (
                <Redirect to="/zone" />
              )
            }
          </Route>
          <Route path="/mindbase/c/:slug">
            {(params) => <MindbaseCreatorProfilePage slug={String((params as any)?.slug || "")} />}
          </Route>
          <Route path="/industrial" component={ExportunityIndustrialRoute} />
          <Route path="/industrial-map" component={ExportunityIndustrialRoute} />
          <Route path="/factories" component={ExportunityIndustrialRoute} />
          <Route path="/factories/:rest*" component={ExportunityIndustrialRoute} />
          <Route path="/export-products" component={ExportunityIndustrialRoute} />
          <Route path="/export-products/:rest*" component={ExportunityIndustrialRoute} />
          <Route path="/industrial-supply" component={ExportunityIndustrialRoute} />
          <Route path="/industrial-supply/:rest*" component={ExportunityIndustrialRoute} />
          <Route path="/request-quote" component={ExportunityIndustrialRoute} />
          <Route path="/my-factory" component={ExportunityIndustrialRoute} />
          <Route path="/zone" component={() => <ExportunityIndustrialAliasRoute to="/industrial" />} />
          <Route path="/zone/:rest*" component={() => <ExportunityIndustrialAliasRoute to="/industrial" />} />
          <Route path="/map" component={ExportunityIndustrialMapRoute} />
          <Route path="/marketplace/map" component={ExportunityIndustrialMapRoute} />
          <Route path="/marketplace/map/:rest*" component={ExportunityIndustrialMapRoute} />
          <Route path="/pme-exchange" component={() => <ExportunityIndustrialAliasRoute to="/factories" />} />
          <Route path="/pme-exchange/:rest*" component={() => <ExportunityIndustrialAliasRoute to="/factories" />} />
          <Route path="/ready-for-export" component={() => <ExportunityIndustrialAliasRoute to="/export-products" />} />
          <Route path="/ready-for-export/:rest*" component={() => <ExportunityIndustrialAliasRoute to="/export-products" />} />
          <Route path="/retail" component={RetailAliasRedirect} />
          <Route path="/retail/:rest*" component={RetailAliasRedirect} />
          <Route path="/marketplace" component={() => <ExportunityIndustrialAliasRoute to="/industrial" />} />
          <Route path="/marketplace/:rest*" component={() => <ExportunityIndustrialAliasRoute to="/industrial" />} />
          <Route path="/shop" component={() => <ExportunityIndustrialAliasRoute to="/industrial" />} />
          <Route path="/shop/:rest*" component={() => <ExportunityIndustrialAliasRoute to="/industrial" />} />
          <Route path="/wholesale" component={BdoWholesaleRoute} />
          <Route path="/wholesale/:rest*" component={BdoWholesaleRoute} />
          <Route path="/gateway" component={GatewayPage} />
          <Route path="/actualites" component={() => (isBdoHost() ? <BdoActualitesPage /> : <Redirect to="/store" />)} />
          <Route path="/reglementation" component={() => (isBdoHost() ? <BdoReglementationPage /> : <Redirect to="/store" />)} />
          <Route path="/industrie-miniere" component={() => (isBdoHost() ? <BdoIndustrieMinierePage /> : <Redirect to="/store" />)} />
          <Route path="/certification" component={() => (isBdoHost() ? <BdoCertificationPage /> : <Redirect to="/store" />)} />
          <Route path="/verifier" component={() => (isBdoHost() ? <BdoVerifierPage /> : <Redirect to="/store" />)} />
          <Route path="/coffre" component={() => (isBdoHost() ? <BdoCoffrePage /> : <Redirect to="/store" />)} />
          <Route path="/mes-objectifs" component={() => (isBdoHost() ? <BdoGoalsPage /> : <Redirect to="/store" />)} />
          <Route path="/objectif/:id">
            {(params) =>
              isBdoHost() ? <BdoGoalDetailPage goalId={String((params as any)?.id || "")} /> : <Redirect to="/store" />
            }
          </Route>
          <Route path="/espace-pro" component={() => (isBdoHost() ? <BdoEspaceProDashboardPage /> : <Redirect to="/store" />)} />
          <Route path="/pro/map" component={() => (isBdoHost() ? <BdoProMapPage /> : <Redirect to="/store" />)} />
          <Route path="/pro/intelligence" component={() => (isBdoHost() ? <BdoProIntelligencePage /> : <Redirect to="/store" />)} />
          <Route path="/pro/bureaux-achat" component={() => (isBdoHost() ? <BdoProBureauxPage /> : <Redirect to="/store" />)} />
          <Route path="/pro/buyers" component={() => (isBdoHost() ? <BdoProBuyersPage /> : <Redirect to="/store" />)} />
          <Route path="/pro/counterparties" component={() => (isBdoHost() ? <BdoProCounterpartiesPage /> : <Redirect to="/store" />)} />
          <Route path="/pro/membership" component={() => (isBdoHost() ? <BdoProMembershipPage /> : <Redirect to="/store" />)} />
          <Route path="/pro/exportateurs-verifies" component={() => (isBdoHost() ? <BdoProExportersPage /> : <Redirect to="/store" />)} />
          <Route path="/about" component={MarketingAwareAboutRoute} />
          <Route path="/press" component={() => (isVsHost() ? <VsPressPage /> : <MarketingRedirect to="/media" />)} />
          <Route path="/portfolio" component={() => (isVsHost() ? <VsPortfolioPage /> : <Redirect to="/zone" />)} />
          <Route path="/insights" component={() => (isVsHost() ? <VsInsightsPage /> : <Redirect to="/zone" />)} />
          <Route path="/books" component={() => (isHozHost() ? <HozBooksPage /> : <Redirect to="/zone" />)} />
          <Route path="/jewelry" component={() => (isHozHost() ? <HozJewelryPage /> : <Redirect to="/zone" />)} />
          <Route path="/how-it-works" component={() => <MarketingRedirect to="/platform" />} />

          {/* Exportunity marketing clone routes (exportunity.com) */}
          <Route path="/company" component={ExportunityMarketingVitrinePage} />
          <Route path="/what-we-do" component={ExportunityMarketingVitrinePage} />
          <Route path="/platforms" component={ExportunityMarketingVitrinePage} />
          <Route path="/gold-mining" component={ExportunityMarketingVitrinePage} />
          <Route path="/gold" component={() => <MarketingRedirect to="/gold-mining" />} />
          <Route path="/government-institutions" component={ExportunityMarketingVitrinePage} />
          <Route path="/government" component={() => <MarketingRedirect to="/government-institutions" />} />
          <Route path="/archive" component={ExportunityMarketingVitrinePage} />
          <Route path="/operating-stack" component={ExportunityMarketingVitrinePage} />
          <Route path="/work-with-us" component={ExportunityMarketingVitrinePage} />
          <Route path="/contact" component={ExportunityMarketingContactPage} />
          <Route path="/story" component={() => <MarketingRedirect to="/journey" />} />
          <Route path="/journey" component={ExportunityMarketingStoryPage} />
          <Route path="/story/founder" component={ExportunityMarketingFounderStoryPage} />
          <Route path="/use-cases" component={() => <MarketingRedirect to="/solutions" />} />
          <Route path="/demo" component={ExportunityMarketingDemoPage} />
          <Route path="/proof" component={() => <MarketingRedirect to="/media" />} />
          <Route path="/our-journey" component={() => <MarketingRedirect to="/journey" />} />
          <Route path="/solutions" component={ExportunityMarketingSolutionsPage} />
          <Route path="/platform" component={ExportunityMarketingPlatformPage} />
          <Route path="/platform/os" component={ExportunityMarketingPlatformOsPage} />
          <Route path="/platform/pro" component={ExportunityMarketingPlatformProPage} />
          <Route path="/platform/gold" component={ExportunityMarketingPlatformGoldPage} />
          <Route path="/platform/agents" component={ExportunityMarketingPlatformAgentsPage} />
          <Route path="/platform/marketplace" component={ExportunityMarketingPlatformMarketplacePage} />
          <Route path="/platform/wallet" component={ExportunityMarketingPlatformWalletPage} />
          <Route path="/platform/contracts" component={ExportunityMarketingPlatformContractsPage} />
          <Route path="/platform/invest" component={ExportunityMarketingPlatformInvestPage} />
          <Route path="/platform/compliance" component={ExportunityMarketingPlatformCompliancePage} />
          <Route path="/platform/messaging" component={ExportunityMarketingPlatformMessagingPage} />
          <Route path="/platform/governance" component={ExportunityMarketingPlatformGovernancePage} />
          <Route path="/platform/security" component={ExportunityMarketingPlatformSecurityPage} />
          <Route path="/platform/screenshots" component={ExportunityMarketingPlatformScreenshotsPage} />
          <Route path="/platform/modules" component={ExportunityMarketingPlatformModulesPage} />
          <Route path="/platform/modules/:slug" component={ExportunityMarketingPlatformModuleDetailPage} />
          <Route path="/media" component={UnifiedMediaRoute} />
          <Route path="/media/press" component={() => (isHozHost() ? <Redirect to="/media" /> : <MarketingRedirect to="/media" />)} />
          <Route path="/media/videos" component={() => (isHozHost() ? <Redirect to="/media" /> : <MarketingRedirect to="/media" />)} />
          <Route path="/media/profiles" component={() => (isHozHost() ? <Redirect to="/media" /> : <MarketingRedirect to="/media" />)} />
          <Route path="/media/articles" component={() => (isHozHost() ? <Redirect to="/media" /> : <MarketingRedirect to="/media" />)} />
          <Route path="/media/library" component={() => (isHozHost() ? <Redirect to="/media" /> : <MarketingRedirect to="/media" />)} />
          <Route path="/talk" component={ExportunityMarketingTalkPage} />
          <Route path="/signup" component={() => <Redirect to="/register" />} />
          <Route path="/wallet" component={() => <MarketingOrAuthRedirect marketingTo="/platform?module=wallet" authTo="/auth?next=/app/wallet" />} />
          <Route path="/trade" component={() => <MarketingOrAuthRedirect marketingTo="/platform?module=trade" authTo="/auth?next=/app" />} />
          <Route path="/contracts" component={() => <MarketingOrAuthRedirect marketingTo="/platform?module=contracts" authTo="/auth?next=/app/contracts" />} />
          <Route path="/business" component={() => <MarketingOrAuthRedirect marketingTo="/platform?module=business" authTo="/auth?next=/app" />} />
          <Route path="/ops" component={() => <MarketingOrAuthRedirect marketingTo="/platform?module=business" authTo="/auth?next=/app" />} />
          <Route path="/machinery" component={ExportunityMachineryRoute} />
          <Route path="/invest" component={() => <MarketingOrAuthRedirect marketingTo="/platform?module=invest" authTo="/auth?next=/app/invest/opportunities" />} />
          <Route path="/compliance" component={() => <MarketingOrAuthRedirect marketingTo="/platform?module=compliance" authTo="/auth?next=/app/governance/logs" />} />
          <Route path="/communications" component={() => <MarketingOrAuthRedirect marketingTo="/platform?module=communications" authTo="/auth?next=/app/messaging" />} />
          <Route path="/ai-operations" component={() => <MarketingOrAuthRedirect marketingTo="/platform?module=ai-operations" authTo="/auth?next=/app?tab=team" />} />
          <Route path="/privacy" component={MarketingAwarePrivacyRoute} />
          <Route path="/terms" component={MarketingAwareTermsRoute} />
          <Route path="/copy-of-home" component={() => <MarketingRedirect to="/solutions" />} />
          <Route path="/contact-8" component={() => <MarketingRedirect to="/talk" />} />
          <Route path="/privacypolicy" component={() => <MarketingRedirect to="/privacy" />} />
          <Route path="/termsofservice" component={() => <MarketingRedirect to="/terms" />} />
          <Route path="/library" component={() => <MarketingRedirect to="/media" />} />
          <Route path="/library/categories/:slug" component={() => <MarketingRedirect to="/media" />} />
          <Route path="/library/tags/:slug" component={() => <MarketingRedirect to="/media" />} />
          <Route path="/post/:slug" component={ExportunityMarketingPostPage} />
          <Route path="/invest/opportunities" component={() => <MarketingRedirect to="/invest" />} />
          <Route path="/invest/opportunities/:slug" component={() => <MarketingRedirect to="/invest" />} />
          <Route path="/invest/contracts" component={() => <MarketingRedirect to="/invest" />} />
          <Route path="/pricing" component={UnifiedPricingRoute} />
          <Route path="/plans-pricing" component={() => <MarketingRedirect to="/pricing" />} />
          <Route path="/academy" component={() => <MarketingRedirect to="/media/library" />} />
          <Route path="/initiative" component={() => <MarketingRedirect to="/solutions" />} />
          <Route path="/booking-calendar" component={() => <MarketingRedirect to="/talk" />} />
          <Route path="/people" component={() => <MarketingRedirect to="/journey" />} />
          <Route path="/clubs" component={() => <MarketingRedirect to="/media/library" />} />
          <Route path="/rayonhome" component={() => <MarketingRedirect to="/" />} />
          <Route path="/rayon-seller" component={() => <MarketingRedirect to="/invest" />} />
          <Route path="/copy-of-fintech" component={() => <MarketingRedirect to="/solutions" />} />
          <Route path="/challenge-page/:id" component={() => <MarketingRedirect to="/media/library" />} />
          <Route path="/group/:rest*" component={() => <MarketingRedirect to="/media/library" />} />
          <Route path="/profile/:rest*" component={() => <MarketingRedirect to="/media/library" />} />
          <Route path="/orders" component={MyOrdersPage} />
          <Route path="/orders/:orderNumber" component={MyOrdersPage} />
          <Route path="/delivery" component={() => (isBdoHost() ? <Redirect to="/store" /> : <DeliveryHubPage />)} />
          <Route path="/marketplace-old" component={MarketplacePage} />
          <Route path="/product/:slug">
            {(params) => <StoreProductPage slug={String((params as any).slug || "")} />}
          </Route>
          <Route path="/verify/:serial" component={StampedGoldVerifyPage} />
          <Route path="/login" component={ECELoginPage} />
          <Route path="/register" component={ECELoginPage} />
          <Route path="/setup-password" component={SetupPasswordPage} />
          <Route path="/auth" component={AuthGatePage} />
          <Route path="/account" component={AccountPage} />
          {/* Pro (canonical) */}
          <Route path="/pro/login" component={AppProLoginPage} />
          <Route path="/pro/join/:role" component={AppProJoinPage} />
          <Route path="/pro/mine" component={AppProMineHomePage} />
          <Route path="/pro/operations/:roomKey" component={AppProRoomPage} />
          <Route path="/pro/operations" component={() => <Redirect to="/pro/operations/general-operations" />} />
          <Route path="/pro/chats" component={AppProChatsPage} />
          <Route path="/pro/money/:section" component={AppProMoneyPage} />
          <Route path="/pro/money" component={AppProMoneyPage} />
          <Route path="/pro/orders" component={AppProOrdersPage} />
          <Route path="/pro/agents/:tab" component={AppProAgentsPage} />
          <Route path="/pro/agents" component={AppProAgentsPage} />
          <Route path="/pro/account" component={AppProMePage} />
          <Route path="/pro/me" component={() => <Redirect to="/pro/account" />} />
          <Route path="/pro/threads/:roomKey">
            {(params) => <Redirect to={`/pro/operations/${String((params as any)?.roomKey || "general-operations")}`} />}
          </Route>
          <Route path="/pro/threads" component={() => <Redirect to="/pro/chats" />} />
          <Route path="/pro/room/:roomKey">
            {(params) => <Redirect to={`/pro/operations/${String((params as any)?.roomKey || "general-operations")}`} />}
          </Route>
          <Route path="/pro" component={ProLandingRedirect} />
          <Route path="/app/login" component={AppProLoginPage} />
          <Route path="/app/join/:role" component={AppProJoinPage} />
          <Route path="/app/contracts" component={AppContractsModulePage} />
          <Route path="/app/wallet/receive" component={AppProWalletPage} />
          <Route path="/app/wallet/send" component={AppProWalletPage} />
          <Route path="/app/wallet" component={AppProWalletPage} />
          <Route path="/app/approvals" component={() => <Redirect to="/app/actions?filter=approvals" />} />
          <Route path="/app/messaging" component={() => <Redirect to="/app/chats" />} />
          <Route path="/app/governance/logs" component={AppGovernanceLogsPage} />
          <Route path="/app/assets" component={() => <Redirect to="/app/invest/opportunities" />} />
          <Route path="/app/invest/opportunities/:slug">
            {(params) => <AppInvestOpportunityDetailPage slug={String((params as any)?.slug || "")} />}
          </Route>
          <Route path="/app/invest/opportunities" component={AppInvestOpportunitiesPage} />
          <Route path="/app/invest/onboarding" component={AppInvestOnboardingPage} />
          <Route path="/app/raise-capital/apply" component={AppRaiseCapitalApplyPage} />
          <Route path="/app/machinery/catalog" component={() => <Redirect to="/app/equipment?tab=equipment" />} />
          <Route path="/app/machinery/orders" component={() => <Redirect to="/app/equipment?tab=contracts" />} />
          <Route path="/app/machinery/financing" component={AppMachineryFinancingPage} />
          <Route path="/app/chats/:roomKey">
            {(params) => <Redirect to={`/pro/operations/${String((params as any)?.roomKey || "general-operations")}`} />}
          </Route>
          <Route path="/app/chats" component={() => <Redirect to="/pro/chats" />} />
          <Route path="/app/actions" component={AppProActionsPage} />
          <Route path="/app/threads" component={() => <Redirect to="/pro/chats" />} />
          <Route path="/app/money/:section" component={AppProMoneyPage} />
          <Route path="/app/money" component={AppProMoneyPage} />
          <Route path="/app/inbox" component={() => <Redirect to="/app/chats" />} />
          <Route path="/app/room/:roomKey">
            {(params) => <Redirect to={`/pro/operations/${String((params as any)?.roomKey || "general-operations")}`} />}
          </Route>
          <Route path="/app" component={() => <Redirect to="/pro/operations" />} />
          <Route path="/mobile/operations" component={() => <Redirect to="/pro/operations" />} />
          <Route path="/mobile/threads" component={() => <Redirect to="/pro/chats" />} />
          <Route path="/mobile/money" component={() => <Redirect to="/pro/money" />} />
          <Route path="/app/shop" component={AppProShopPage} />
          <Route path="/app/equipment" component={AppProEquipmentPage} />
          <Route path="/app/agents/:tab" component={AppProAgentsPage} />
          <Route path="/app/agents" component={AppProAgentsPage} />
          <Route path="/app/me" component={AppProMePage} />
          <Route path="/app/email" component={ProEmailRedirectRoute} />
          <Route path="/app/:rest*">
            <Redirect to="/pro/operations" />
          </Route>
          <Route path="/m/:id" component={MeetRoomPage} />
          <Route path="/meet/:id" component={MeetRoomPage} />
          <Route path="/inbox" component={InboxPage} />
          <Route path="/inbox/:roomKey" component={RoomPage} />
          <Route path="/qa-mobile" component={QAMobilePage} />
          <Route path="/debug/location" component={DebugLocationPage} />
          <Route path="/debug/hit-test" component={DebugHitTestPage} />
          <Route path="/application-status" component={() => (isBdoHost() ? <Redirect to="/orders" /> : <ApplicationStatusPage />)} />
          <Route path="/apply/shop" component={() => (isBdoHost() ? <Redirect to="/wholesale/apply" /> : <ShopApplicationPage />)} />
          <Route path="/apply/delivery" component={() => (isBdoHost() ? <Redirect to="/espace-pro" /> : <DeliveryApplicationPage />)} />
          <Route path="/cadre-conformite" component={CompliancePage} />
          <Route path="/install" component={InstallAppPage} />
          <Route path="/pay/kkiapay/return" component={KkiapayReturnPage} />
          <Route path="/wallet/topup/return" component={WalletTopupReturnPage} />
          <Route path="/wallet/topup/flutterwave/return" component={WalletTopupReturnPage} />
          <Route path="/pay/flutterwave/return" component={WalletTopupReturnPage} />
          <Route path="/public/demo/cadastre" component={PublicCadastreDemoPage} />
          <Route path="/sellers" component={SellerDirectoryPage} />
          <Route path="/seller/topup" component={SellerTopupPage} />
          <Route path="/switch" component={SwitchSpacePage} />
          <Route path="/admin/login" component={AdminLoginPage} />
          <Route path="/admin/exportunity">
            <ProtectedRoute>
              <Redirect to="/ai-team" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin" component={AdminLoginPage} />
          <Route path="/admin/password" component={AdminPasswordChangePage} />
          <Route path="/admin/dashboard">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="dashboard" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/orders">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="orders" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/products">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="products" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/collections">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="collections" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/users">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="users" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agents">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="agents" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/wallets">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="wallets" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/analytics">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="analytics" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/map">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="map" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/settings">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="settings" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/brand">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="brand" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/modules">
            <ProtectedRoute>
              <TenantAdminAliasRoute target="modules" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/bdo/settings">
            <ProtectedRoute>
              <BdoAdminSettingsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/bdo/goals">
            <ProtectedRoute>
              <BdoAdminGoalsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/bdo/pro-memberships">
            <ProtectedRoute>
              <BdoAdminProMembershipsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/met">
            <ProtectedRoute>
              <MetAdminDashboardPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/met/leads">
            <ProtectedRoute>
              <MetAdminLeadsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/met/estimates">
            <ProtectedRoute>
              <MetAdminEstimatesPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/met/orders">
            <ProtectedRoute>
              <MetAdminOrdersPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/met/products">
            <ProtectedRoute>
              <MetAdminProductsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/met/plans">
            <ProtectedRoute>
              <MetAdminPlansPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/met/projects">
            <ProtectedRoute>
              <MetAdminProjectsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/met/blog">
            <ProtectedRoute>
              <MetAdminBlogPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/met/media">
            <ProtectedRoute>
              <MetAdminMediaPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/met/settings">
            <ProtectedRoute>
              <MetAdminSettingsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs">
            <ProtectedRoute>
              <VsAdminDashboardPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/dashboard">
            <ProtectedRoute>
              <Redirect to="/admin/vs" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/reputation">
            <ProtectedRoute>
              <VsAdminReputationPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/pr">
            <ProtectedRoute>
              <VsAdminPrPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/studio">
            <ProtectedRoute>
              <VsAdminStudioPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/social">
            <ProtectedRoute>
              <VsAdminSocialPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/inbox">
            <ProtectedRoute>
              <VsAdminInboxPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/agents">
            <ProtectedRoute>
              <VsAdminAgentsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/assistant">
            <ProtectedRoute>
              <VsAdminAssistantPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/actions">
            <ProtectedRoute>
              <VsAdminActionsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/users">
            <ProtectedRoute>
              <VsAdminUsersPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/settings">
            <ProtectedRoute>
              <VsAdminSettingsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/vs/website">
            <ProtectedRoute>
              <VsAdminWebsitePage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye">
            <ProtectedRoute>
              <AgoojyeAdminDashboardPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/dashboard">
            <ProtectedRoute>
              <Redirect to="/admin/agoojye" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/users">
            <ProtectedRoute>
              <AgoojyeAdminUsersPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/teams">
            <ProtectedRoute>
              <AgoojyeAdminTeamsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/participants">
            <ProtectedRoute>
              <AgoojyeAdminParticipantsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/emails">
            <ProtectedRoute>
              <AgoojyeAdminEmailsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/messages">
            <ProtectedRoute>
              <AgoojyeAdminMessagesPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/tasks">
            <ProtectedRoute>
              <AgoojyeAdminTasksPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/milestones">
            <ProtectedRoute>
              <AgoojyeAdminMilestonesPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/documents">
            <ProtectedRoute>
              <AgoojyeAdminDocumentsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/partners">
            <ProtectedRoute>
              <AgoojyeAdminPartnersPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/sponsors">
            <ProtectedRoute>
              <AgoojyeAdminSponsorsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/media">
            <ProtectedRoute>
              <AgoojyeAdminMediaPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/content">
            <ProtectedRoute>
              <AgoojyeAdminContentPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/settings">
            <ProtectedRoute>
              <AgoojyeAdminSettingsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/agoojye/audit">
            <ProtectedRoute>
              <AgoojyeAdminAuditPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/hoz">
            <ProtectedRoute>
              <HozAdminDashboardPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/hoz/dashboard">
            <ProtectedRoute>
              <Redirect to="/admin/hoz" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/hoz/collections">
            <ProtectedRoute>
              <HozAdminCollectionsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/hoz/media">
            <ProtectedRoute>
              <HozAdminMediaPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/hoz/inbox">
            <ProtectedRoute>
              <HozAdminInboxPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/hoz/website">
            <ProtectedRoute>
              <HozAdminWebsitePage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/hoz/settings">
            <ProtectedRoute>
              <HozAdminSettingsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/zogueland">
            <ProtectedRoute>
              <AdminDashboardPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/rayon1km">
            <ProtectedRoute>
              <AdminDashboardPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/mindbase">
            <ProtectedRoute>
              <MindbaseAdminDashboardPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/mindbase/dashboard">
            <ProtectedRoute>
              <Redirect to="/admin/mindbase" />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/mindbase/moderation">
            <ProtectedRoute>
              <MindbaseAdminModerationPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/mindbase/users">
            <ProtectedRoute>
              <MindbaseAdminUsersPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/mindbase/credits">
            <ProtectedRoute>
              <MindbaseAdminCreditsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/mindbase/agents">
            <ProtectedRoute>
              <MindbaseAdminAgentsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/mindbase/settings">
            <ProtectedRoute>
              <MindbaseAdminSettingsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/posts">
            <ProtectedRoute>
              <AdminMarketingPostsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/press">
            <ProtectedRoute>
              <AdminMarketingPressPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/library">
            <ProtectedRoute>
              <AdminMarketingLibraryPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/media">
            <ProtectedRoute>
              <AdminMarketingMediaPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/screenshots">
            <ProtectedRoute>
              <AdminMarketingScreenshotsPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/contacts">
            <ProtectedRoute>
              <AdminContactsPage />
            </ProtectedRoute>
          </Route>
        
        {/* Admin/Dashboard routes - require authentication */}
        <Route path="/dashboard">
          <ProtectedRoute>
            <AdminDashboardPage />
          </ProtectedRoute>
        </Route>

        <Route path="/ai-team">
          <ProtectedRoute>
            <AITeamHubPage />
          </ProtectedRoute>
        </Route>

        <Route path="/agenda">
          <ProtectedRoute>
            <AgendaPage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/meetings">
          <ProtectedRoute>
            <MeetingsHubPage />
          </ProtectedRoute>
        </Route>

        <Route path="/meetings/:id">
          <ProtectedRoute>
            <MeetRoomPage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/agents">
          <ProtectedRoute>
            <HierarchyPage />
          </ProtectedRoute>
        </Route>

        <Route path="/agents/:agentId">
          {(params) => {
            const id = Number((params as any)?.agentId || 0);
            if (!Number.isFinite(id) || id <= 0) return <Redirect to="/agents" />;
            return (
              <ProtectedRoute>
                <AgentDetailPage />
              </ProtectedRoute>
            );
          }}
        </Route>

        <Route path="/operations/agents">
          <ProtectedRoute>
            <OperationsAgentsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/operations/agents/:agentId">
          {(params) => {
            const id = Number((params as any)?.agentId || 0);
            if (!Number.isFinite(id) || id <= 0) return <Redirect to="/operations/agents" />;
            return (
              <ProtectedRoute>
                <AgentProfileV2Page />
              </ProtectedRoute>
            );
          }}
        </Route>

        <Route path="/commerce/ai-marketplace/agents">
          <ProtectedRoute>
            <MarketplaceAgentsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/commerce/ai-marketplace/agents/:agentId">
          {(params) => {
            const id = Number((params as any)?.agentId || 0);
            if (!Number.isFinite(id) || id <= 0) return <Redirect to="/commerce/ai-marketplace/agents" />;
            return (
              <ProtectedRoute>
                <AgentProfileV2Page />
              </ProtectedRoute>
            );
          }}
        </Route>

        <Route path="/admin/agents/governance">
          <ProtectedRoute>
            <Redirect to="/agents-os?tab=governance" />
          </ProtectedRoute>
        </Route>

        <Route path="/agents-os/agents/:id">
          {(params) => {
            const id = Number((params as any)?.id || 0);
            if (!Number.isFinite(id) || id <= 0) return <Redirect to="/agents-os" />;
            return (
              <ProtectedRoute>
                <AgentDetailPage />
              </ProtectedRoute>
            );
          }}
        </Route>

        <Route path="/admin/agents-os/agents/:id">
          {(params) => (
            <ProtectedRoute>
              <Redirect to={`/agents-os/agents/${(params as any).id}`} />
            </ProtectedRoute>
          )}
        </Route>

        <Route path="/agents-os">
          <ProtectedRoute>
            <AdminAgentsOsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/agents-os">
          <ProtectedRoute>
            <AgentsOsAliasRedirect />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/workstations">
          <ProtectedRoute>
            <AdminWorkstationsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/evidence">
          <ProtectedRoute>
            <AdminEvidencePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/action-forge">
          <ProtectedRoute>
            <AdminActionForgePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/inbox">
          <ProtectedRoute>
            <AdminInboxPage />
          </ProtectedRoute>
        </Route>

        <Route path="/mail">
          <ProtectedRoute>
            <MailPage />
          </ProtectedRoute>
        </Route>

        <Route path="/webmail" component={ProEmailRedirectRoute} />

        <Route path="/notifications">
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/email">
          <EmailAdminRoute />
        </Route>

        <Route path="/admin/mail">
          <EmailAdminRoute alias />
        </Route>

        <Route path="/admin/notifications">
          <ProtectedRoute>
            <AdminNotificationsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/notifications/:id">
          <ProtectedRoute>
            <AdminNotificationDetailPage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/hierarchy">
          <ProtectedRoute>
            <Redirect to="/agents" />
          </ProtectedRoute>
        </Route>
        
        <Route path="/tasks">
          <ProtectedRoute>
            <TasksPage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/goals">
          <ProtectedRoute>
            <GoalsPage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/actions">
          <ProtectedRoute>
            <ActionsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/machinery">
          <ProtectedRoute>
            <MachineryPage />
          </ProtectedRoute>
        </Route>

        <Route path="/manufacturing">
          <ProtectedRoute>
            <Redirect to="/machinery" />
          </ProtectedRoute>
        </Route>
        
        <Route path="/finance">
          <ProtectedRoute>
            <FinancePage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/knowledge">
          <ProtectedRoute>
            <KnowledgeBasePage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/expert-clones">
          <ProtectedRoute>
            <ExpertClonesHubPage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/companies">
          <ProtectedRoute>
            <CompanyListPage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/delivery/agent/:id">
          <ProtectedRoute>
            <DeliveryAgentDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/delivery/admin">
          <ProtectedRoute>
            <DeliveryAdminDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/agent-economy">
          <ProtectedRoute>
            <AgentEconomyDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/seller-dashboard">
          <ProtectedRoute>
            <SellerDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/seller">
          <ProtectedRoute>
            <Redirect to="/seller-dashboard" />
          </ProtectedRoute>
        </Route>
        
        <Route path="/marketplace/sellers">
          <ProtectedRoute>
            <SellerListPage />
          </ProtectedRoute>
        </Route>

        <Route path="/marketplace/sellers/:id">
          {(params) => (
            <ProtectedRoute>
              <MarketplaceSellerDetailPage sellerId={parseInt((params as any).id, 10)} />
            </ProtectedRoute>
          )}
        </Route>
        
        <Route path="/profile">
          <ProtectedRoute>
            <UserProfilePage />
          </ProtectedRoute>
        </Route>

        <Route path="/whatsapp">
          <ProtectedRoute>
            <Redirect to="/admin/communications/whatsapp" />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/communications/whatsapp">
          <ProtectedRoute>
            <WhatsAppConversationsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/communications/whatsapp/logs">
          <ProtectedRoute>
            <WhatsAppLogsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/communications/twilio">
          <ProtectedRoute>
            <AdminCommunicationsInboxPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/communications/twilio/logs">
          <ProtectedRoute>
            <AdminTwilioLogsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/settings/communications/twilio">
          <ProtectedRoute>
            <AdminTwilioControlCenterPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/settings/integrations/google-maps">
          <ProtectedRoute>
            <AdminGooglePlacesIntegrationPage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/admin-users">
          <ProtectedRoute>
            <AdminUserManagementPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/pro-test-accounts">
          <ProtectedRoute>
            <AdminProTestAccountPage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/subscription-plans">
          <ProtectedRoute>
            <SubscriptionPlansPage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/client-hunter">
          <ProtectedRoute>
            <ClientHunterPage />
          </ProtectedRoute>
        </Route>

        <Route path="/marketing">
          <ProtectedRoute>
            <MarketingPage />
          </ProtectedRoute>
        </Route>

        <Route path="/sales">
          <ProtectedRoute>
            <SalesPage />
          </ProtectedRoute>
        </Route>

        <Route path="/contracts/:contractId">
          <ProtectedRoute>
            <ContractDetailPage />
          </ProtectedRoute>
        </Route>

        <Route path="/contracts">
          <ProtectedRoute>
            <ContractsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/bureaus">
          <ProtectedRoute>
            <AuthorizedBureausPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/assets/images">
          <ProtectedRoute>
            <Redirect to="/admin/media/assets" />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/media/assets">
          <ProtectedRoute>
            <AdminAssetStudioPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/media/images">
          <ProtectedRoute>
            <Redirect to="/admin/media/assets" />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/media/debug">
          <ProtectedRoute>
            <AdminMediaDebugPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/website/landing-images">
          <ProtectedRoute>
            <Redirect to="/admin/media/assets?tab=presets&scope=landing" />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/website/visits">
          <ProtectedRoute>
            <AdminVisitsIntelligencePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/website/seo">
          <ProtectedRoute>
            <AdminSeoHealthPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/website/seo-autopilot">
          <ProtectedRoute>
            <AdminSeoAutopilotPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/marketplace/products">
          <ProtectedRoute>
            <AdminMarketplaceProductsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/settings/integrations/google-workspace">
          <ProtectedRoute>
            <AdminGoogleWorkspaceIntegrationPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/company-brain">
          <ProtectedRoute>
            <AdminCompanyBrainPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/industrial-network">
          <ProtectedRoute>
            <AdminIndustrialNetworkPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/pme-exchange">
          <ProtectedRoute>
            <AdminPmeExchangePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/pme-exchange/map">
          <ProtectedRoute>
            <AdminPmeExchangePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/pme-exchange/leads">
          <ProtectedRoute>
            <AdminPmeExchangePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/pme-exchange/import">
          <ProtectedRoute>
            <AdminPmeExchangePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/pme-exchange/campaigns">
          <ProtectedRoute>
            <AdminPmeExchangePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/pme-exchange/conversations">
          <ProtectedRoute>
            <AdminPmeExchangePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/pme-exchange/profiles">
          <ProtectedRoute>
            <AdminPmeExchangePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/pme-exchange/audit">
          <ProtectedRoute>
            <AdminPmeExchangePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/equipment-ops">
          <ProtectedRoute>
            <Redirect to="/admin/equipment-ops/fleet-map" />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/equipment-ops/fleet-map">
          <ProtectedRoute>
            <AdminEquipmentOpsFleetMapPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/equipment-ops/listings">
          <ProtectedRoute>
            <AdminEquipmentOpsListingsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/equipment-ops/contracts">
          <ProtectedRoute>
            <AdminEquipmentOpsContractsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/equipment-ops/maintenance">
          <ProtectedRoute>
            <AdminEquipmentOpsMaintenancePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/stamped-gold/skus">
          <ProtectedRoute>
            <AdminStampedGoldSkusPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/stamped-gold/minting-studio">
          <ProtectedRoute>
            <AdminStampedGoldMintingStudioPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/stamped-gold">
          <ProtectedRoute>
            <AdminStampedGoldMasterPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/stamped-gold/items">
          <ProtectedRoute>
            <AdminStampedGoldItemsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/stamped-gold/jewellers">
          <ProtectedRoute>
            <AdminStampedGoldJewellersPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/stamped-gold/scans">
          <ProtectedRoute>
            <AdminStampedGoldScansPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/stamped-gold/pickup">
          <ProtectedRoute>
            <AdminStampedGoldPickupPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/marketplace/payments">
          <ProtectedRoute>
            <AdminMarketplacePaymentsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/wallet">
          <ProtectedRoute>
            <AdminWalletHubPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/wallet/accounts">
          <ProtectedRoute>
            <AdminWalletAccountsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/wallet/ledger">
          <ProtectedRoute>
            <AdminWalletLedgerPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/wallet/topups">
          <ProtectedRoute>
            <AdminWalletTopupsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/wallet/payouts">
          <ProtectedRoute>
            <AdminWalletPayoutsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/wallet/vouchers">
          <ProtectedRoute>
            <AdminWalletVouchersPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/wallet/sellers">
          <ProtectedRoute>
            <AdminWalletSellersPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/wallet/risk">
          <ProtectedRoute>
            <AdminWalletRiskPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/wallet/config">
          <ProtectedRoute>
            <AdminWalletConfigPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/system/update">
          <ProtectedRoute>
            <AdminSystemUpdatePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/seo">
          <ProtectedRoute>
            <AdminSeoHealthPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/ux-audit">
          <ProtectedRoute>
            <AdminUxAuditPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/settings/map">
          <ProtectedRoute>
            <Redirect to="/admin/map-icons" />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/map-icons">
          <ProtectedRoute>
            <AdminMapIconsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/settings/onboarding">
          <ProtectedRoute>
            <AdminOnboardingSettingsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/settings/developer">
          <ProtectedRoute>
            <AdminDeveloperSettingsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/settings/fx">
          <ProtectedRoute>
            <AdminFxSettingsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/territories">
          <ProtectedRoute>
            <Redirect to="/territories" />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/territories/:id">
          {(params) => (
            <ProtectedRoute>
              <Redirect to={`/territories/${(params as any).id}`} />
            </ProtectedRoute>
          )}
        </Route>

        <Route path="/admin/gateway-images">
          <ProtectedRoute>
            <Redirect to="/admin/media/assets" />
          </ProtectedRoute>
        </Route>

        <Route path="/territories">
          <ProtectedRoute>
            <TerritoryManagementPage />
          </ProtectedRoute>
        </Route>

        <Route path="/territories/:id">
          <ProtectedRoute>
            <TerritoryDetailPage />
          </ProtectedRoute>
        </Route>
        
          {/* 404 fallback */}
          <Route>
            <div className="min-h-screen w-full flex items-center justify-center p-4">
              <Card className="w-full max-w-md bg-gray-900 border-gray-800">
                <CardContent className="pt-6">
                  <div className="flex mb-4 gap-2 items-center">
                    <AlertCircle className="h-8 w-8 text-red-400" />
                    <h1 className="text-2xl font-bold text-white">404 Page Not Found</h1>
                  </div>
                  <p className="mt-4 text-sm text-gray-400">The page you're looking for doesn't exist.</p>
                </CardContent>
              </Card>
            </div>
          </Route>
          </Switch>
        </RouteErrorBoundary>
      </Suspense>
    </div>
  );
}

export default App;
