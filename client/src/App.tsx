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
  isHozHost,
  isMetHost,
  isMindbaseHost,
  isVsHost,
  isZoguelandHost,
  isZoneHost,
} from "@/lib/hostMode";
import { getExportunityLegacyCommerceDestination } from "@/lib/exportunityPublicRoutePolicy";
import { roomSlugFromKey } from "@/config/chatRooms";

import ServiceWorkerUpdateBanner from "@/components/ServiceWorkerUpdateBanner";
import BuildMismatchBanner from "@/components/BuildMismatchBanner";
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
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#F7F8FA] p-4 text-[#07111F]">
        <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />
        <Card className="relative w-full max-w-2xl border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.16)]">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9A6200]">Global Trade Network</div>
                <div className="mt-2 text-lg font-black text-slate-950">Page failed to load</div>
                <div className="mt-1 text-sm text-slate-500">
                  Route: <span className="text-slate-700">{this.props.routePath}</span>
                </div>
                <div className="mt-1 text-sm text-slate-700">{this.state.error.message}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 font-bold text-slate-700 hover:border-[#F5A623] hover:text-slate-950"
                onClick={this.copyDebug}
              >
                {this.state.copied ? "Copied" : "Copy error details"}
              </Button>
              <Button
                type="button"
                className="bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-bold text-slate-500">Debug</div>
              <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-600">
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
const includeSharedStorefront = __BUILD_INCLUDE_SHARED_STOREFRONT__;
const includeMindbase = __BUILD_INCLUDE_MINDBASE__;
const includeOtherTenantUi = __BUILD_INCLUDE_OTHER_TENANT_UI__;
const ZoneInstallPrompt = includeOtherTenantUi
  ? lazyPage(() => import("@/components/ZoneInstallPrompt"))
  : () => null;
const ExcludedTenantPage: ComponentType<any> = () => <Redirect to="/" />;
const GatewayPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/GatewayPage"), "GatewayPage")
  : ExcludedTenantPage;
const AdminLoginPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AdminLoginPage"), "AdminLoginPage")
  : lazyPage(() => import("@/pages/exportunity/AccountSupportPages"), "ExportunityOperationsAccessPage");
const AdminPasswordChangePage = lazyPage(() => import("@/pages/AdminPasswordChangePage"), "AdminPasswordChangePage");
const UnifiedAccessPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/ECELoginPage"), "ECELoginPage")
  : lazyPage(() => import("@/pages/exportunity/AccessPage"));
const SetupPasswordPage = lazyPage(() => import("@/pages/SetupPasswordPage"));
const ApplicationStatusPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/ApplicationStatusPage"), "ApplicationStatusPage")
  : lazyPage(() => import("@/pages/exportunity/AccountSupportPages"), "ExportunityApplicationStatusPage");
const CompliancePage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/CompliancePage"), "CompliancePage")
  : lazyPage(() => import("@/pages/exportunity/GovernancePages"), "ExportunityCompliancePage");
const TermsPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/TermsPage"), "TermsPage")
  : lazyPage(() => import("@/pages/exportunity/GovernancePages"), "ExportunityTermsPage");
const PrivacyPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/PrivacyPage"), "PrivacyPage")
  : lazyPage(() => import("@/pages/exportunity/GovernancePages"), "ExportunityPrivacyPage");
const InstallAppPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/InstallAppPage"), "InstallAppPage")
  : lazyPage(() => import("@/pages/exportunity/InstallAppPage"), "ExportunityInstallAppPage");
const SwitchSpacePage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/SwitchSpacePage"), "SwitchSpacePage")
  : lazyPage(() => import("@/pages/exportunity/AccountSupportPages"), "ExportunitySpaceExchangePage");
const ChairmanQuickPage = lazyPage(() => import("@/pages/ChairmanQuickPage"), "ChairmanQuickPage");
const AccountPage = lazyPage(() => import("@/pages/AccountPage"));
const QAMobilePage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/QAMobilePage"))
  : ExcludedTenantPage;
const DebugLocationPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/DebugLocationPage"))
  : ExcludedTenantPage;
const DebugHitTestPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/DebugHitTestPage"))
  : ExcludedTenantPage;
const StorePage = includeSharedStorefront
  ? lazyPage(() => import("@/pages/store/StorePage"))
  : null;
const StoreCollectionsPage = includeSharedStorefront
  ? lazyPage(() => import("@/pages/store/StoreCollectionsPage"))
  : null;
const StoreCollectionPage = includeSharedStorefront
  ? lazyPage(() => import("@/pages/store/StoreCollectionPage"))
  : null;
const StoreProductPage = includeSharedStorefront
  ? lazyPage(() => import("@/pages/store/StoreProductPage"))
  : null;
const StampedGoldVerifyPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/StampedGoldVerifyPage"))
  : ExcludedTenantPage;
const MyOrdersPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/MyOrdersPage"))
  : lazyPage(() => import("@/pages/exportunity/TradeOrdersPage"));
const DeliveryHubPage = lazyPage(() => import("@/pages/DeliveryHubPage"));
const AppProChatsPage = lazyPage(() => import("@/pages/AppProChatsPage"));
const AppProActionsPage = lazyPage(() => import("@/pages/AppProActionsPage"));
const AppProWalletPage = lazyPage(() => import("@/pages/AppProWalletPage"));
const AppProMoneyPage = lazyPage(() => import("@/pages/AppProMoneyPage"));
const AppProRoomPage = lazyPage(() => import("@/pages/AppProRoomPage"));
const AppProMineHomePage = lazyPage(() => import("@/pages/AppProMineHomePage"));
const AppProLoginPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AppProLoginPage"))
  : UnifiedAccessPage;
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
const PublicCadastreDemoPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/PublicCadastreDemoPage"))
  : ExcludedTenantPage;
const MindbaseLandingPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseLandingPage"))
  : ExcludedTenantPage;
const MindbaseDiscoverPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseDiscoverPage"))
  : ExcludedTenantPage;
const MindbaseIntellectPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseIntellectPage"))
  : ExcludedTenantPage;
const MindbaseCreatorProfilePage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseCreatorProfilePage"))
  : ExcludedTenantPage;
const MindbaseStudioPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseStudioPage"))
  : ExcludedTenantPage;
const MindbaseBuildChatPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseBuildChatPage"))
  : ExcludedTenantPage;
const MindbaseStudioIntellectPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseStudioIntellectPage"))
  : ExcludedTenantPage;
const MindbaseWorkspacesPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseWorkspacesPage"))
  : ExcludedTenantPage;
const MindbasePricingPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbasePricingPage"))
  : ExcludedTenantPage;
const MindbaseDocsApiPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseDocsApiPage"))
  : ExcludedTenantPage;
const MindbaseAdminDashboardPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminDashboardPage")
  : ExcludedTenantPage;
const MindbaseAdminModerationPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminModerationPage")
  : ExcludedTenantPage;
const MindbaseAdminUsersPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminUsersPage")
  : ExcludedTenantPage;
const MindbaseAdminCreditsPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminCreditsPage")
  : ExcludedTenantPage;
const MindbaseAdminAgentsPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminAgentsPage")
  : ExcludedTenantPage;
const MindbaseAdminSettingsPage = includeMindbase
  ? lazyPage(() => import("@/pages/mindbase/MindbaseAdminPages"), "MindbaseAdminSettingsPage")
  : ExcludedTenantPage;

// Exportunity Global Trade Network public surfaces
const ExportunityGlobalTradeHomePage = lazyPage(() => import("@/pages/exportunity/GlobalTradeHomePage"));
const ExportunityMarketplacePage = lazyPage(() => import("@/pages/exportunity/MarketplacePage"));
const ExportunityIndustrialHubPage = lazyPage(() => import("@/pages/exportunity/IndustrialHubPage"));
const ExportunityTradeIntelligencePage = lazyPage(
  () => import("@/pages/exportunity/TradeIntelligencePage"),
);
const ExportunityProducerExchangePage = lazyPage(
  () => import("@/pages/exportunity/ProducerExchangePage"),
);
const ExportunityTradeNewsroomArticlePage = lazyPage(
  () => import("@/pages/exportunity/TradeNewsroomArticlePage"),
);
const ExportunityIndustrialOrderPaymentPage = lazyPage(
  () => import("@/pages/exportunity/IndustrialOrderPaymentPage"),
);
const metPublicPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/met/MetPublicPages")
  : null;
const metAdminPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/met/MetAdminPages")
  : null;
const vsPublicPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/vs/VsPublicPages")
  : null;
const vsAdminPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/vs/VsAdminPages")
  : null;
const hozPublicPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/hoz/HozPublicPages")
  : null;
const hozAdminPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/hoz/HozAdminPages")
  : null;
const agoojyePublicPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/agoojye/AgoojyePublicPages")
  : null;
const agoojyeAdminPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/agoojye/AgoojyeAdminPages")
  : null;
const bdoAuthorityPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/bdo/BdoAuthorityPages")
  : null;
const bdoProPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/bdo/BdoProPages")
  : null;
const bdoGoalPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/bdo/BdoGoalPages")
  : null;
const bdoAdminPagesImporter = includeOtherTenantUi
  ? () => import("@/pages/bdo/BdoAdminPages")
  : null;

function isolatedTenantPage(
  importer: (() => Promise<any>) | null,
  exportName: string,
) {
  return importer ? lazyPage(importer, exportName) : ExcludedTenantPage;
}

const MetHomePage = isolatedTenantPage(metPublicPagesImporter, "MetHomePage");
const MetModelHousePage = isolatedTenantPage(metPublicPagesImporter, "MetModelHousePage");
const MetBricksPage = isolatedTenantPage(metPublicPagesImporter, "MetBricksPage");
const MetPlansPage = isolatedTenantPage(metPublicPagesImporter, "MetPlansPage");
const MetPlanDetailPage = isolatedTenantPage(metPublicPagesImporter, "MetPlanDetailPage");
const MetEstimatePage = isolatedTenantPage(metPublicPagesImporter, "MetEstimatePage");
const MetRealisationsPage = isolatedTenantPage(metPublicPagesImporter, "MetRealisationsPage");
const MetProjectDetailPage = isolatedTenantPage(metPublicPagesImporter, "MetProjectDetailPage");
const MetBlogPage = isolatedTenantPage(metPublicPagesImporter, "MetBlogPage");
const MetBlogPostPage = isolatedTenantPage(metPublicPagesImporter, "MetBlogPostPage");
const MetContactPage = isolatedTenantPage(metPublicPagesImporter, "MetContactPage");
const MetLegalMentionsPage = isolatedTenantPage(metPublicPagesImporter, "MetLegalMentionsPage");
const MetPrivacyPolicyPage = isolatedTenantPage(metPublicPagesImporter, "MetPrivacyPolicyPage");
const MetAdminDashboardPage = isolatedTenantPage(metAdminPagesImporter, "MetAdminDashboardPage");
const MetAdminLeadsPage = isolatedTenantPage(metAdminPagesImporter, "MetAdminLeadsPage");
const MetAdminEstimatesPage = isolatedTenantPage(metAdminPagesImporter, "MetAdminEstimatesPage");
const MetAdminOrdersPage = isolatedTenantPage(metAdminPagesImporter, "MetAdminOrdersPage");
const MetAdminProductsPage = isolatedTenantPage(metAdminPagesImporter, "MetAdminProductsPage");
const MetAdminPlansPage = isolatedTenantPage(metAdminPagesImporter, "MetAdminPlansPage");
const MetAdminProjectsPage = isolatedTenantPage(metAdminPagesImporter, "MetAdminProjectsPage");
const MetAdminBlogPage = isolatedTenantPage(metAdminPagesImporter, "MetAdminBlogPage");
const MetAdminMediaPage = isolatedTenantPage(metAdminPagesImporter, "MetAdminMediaPage");
const MetAdminSettingsPage = isolatedTenantPage(metAdminPagesImporter, "MetAdminSettingsPage");
const VsHomePage = isolatedTenantPage(vsPublicPagesImporter, "VsHomePage");
const VsAboutPage = isolatedTenantPage(vsPublicPagesImporter, "VsAboutPage");
const VsPressPage = isolatedTenantPage(vsPublicPagesImporter, "VsPressPage");
const VsPortfolioPage = isolatedTenantPage(vsPublicPagesImporter, "VsPortfolioPage");
const VsContactPage = isolatedTenantPage(vsPublicPagesImporter, "VsContactPage");
const VsInsightsPage = isolatedTenantPage(vsPublicPagesImporter, "VsInsightsPage");
const VsAdminDashboardPage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminDashboardPage");
const VsAdminReputationPage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminReputationPage");
const VsAdminPrPage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminPrPage");
const VsAdminStudioPage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminStudioPage");
const VsAdminSocialPage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminSocialPage");
const VsAdminInboxPage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminInboxPage");
const VsAdminAgentsPage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminAgentsPage");
const VsAdminAssistantPage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminAssistantPage");
const VsAdminActionsPage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminActionsPage");
const VsAdminUsersPage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminUsersPage");
const VsAdminSettingsPage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminSettingsPage");
const VsAdminWebsitePage = isolatedTenantPage(vsAdminPagesImporter, "VsAdminWebsitePage");
const HozHomePage = isolatedTenantPage(hozPublicPagesImporter, "HozHomePage");
const HozBooksPage = isolatedTenantPage(hozPublicPagesImporter, "HozBooksPage");
const HozJewelryPage = isolatedTenantPage(hozPublicPagesImporter, "HozJewelryPage");
const HozMediaPage = isolatedTenantPage(hozPublicPagesImporter, "HozMediaPage");
const HozAboutPage = isolatedTenantPage(hozPublicPagesImporter, "HozAboutPage");
const HozContactPage = isolatedTenantPage(hozPublicPagesImporter, "HozContactPage");
const HozAdminDashboardPage = isolatedTenantPage(hozAdminPagesImporter, "HozAdminDashboardPage");
const HozAdminCollectionsPage = isolatedTenantPage(hozAdminPagesImporter, "HozAdminCollectionsPage");
const HozAdminMediaPage = isolatedTenantPage(hozAdminPagesImporter, "HozAdminMediaPage");
const HozAdminInboxPage = isolatedTenantPage(hozAdminPagesImporter, "HozAdminInboxPage");
const HozAdminWebsitePage = isolatedTenantPage(hozAdminPagesImporter, "HozAdminWebsitePage");
const HozAdminSettingsPage = isolatedTenantPage(hozAdminPagesImporter, "HozAdminSettingsPage");
const AgoojyeHomePage = isolatedTenantPage(agoojyePublicPagesImporter, "AgoojyeHomePage");
const AgoojyeVisionPage = isolatedTenantPage(agoojyePublicPagesImporter, "AgoojyeVisionPage");
const AgoojyeHistoryPage = isolatedTenantPage(agoojyePublicPagesImporter, "AgoojyeHistoryPage");
const AgoojyeChallengePage = isolatedTenantPage(agoojyePublicPagesImporter, "AgoojyeChallengePage");
const AgoojyeTeamsPage = isolatedTenantPage(agoojyePublicPagesImporter, "AgoojyeTeamsPage");
const AgoojyePartnersPage = isolatedTenantPage(agoojyePublicPagesImporter, "AgoojyePartnersPage");
const AgoojyeSponsorsPage = isolatedTenantPage(agoojyePublicPagesImporter, "AgoojyeSponsorsPage");
const AgoojyeMediaPage = isolatedTenantPage(agoojyePublicPagesImporter, "AgoojyeMediaPage");
const AgoojyeContactPage = isolatedTenantPage(agoojyePublicPagesImporter, "AgoojyeContactPage");
const AgoojyeAdminDashboardPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminDashboardPage");
const AgoojyeAdminUsersPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminUsersPage");
const AgoojyeAdminTeamsPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminTeamsPage");
const AgoojyeAdminParticipantsPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminParticipantsPage");
const AgoojyeAdminEmailsPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminEmailsPage");
const AgoojyeAdminMessagesPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminMessagesPage");
const AgoojyeAdminTasksPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminTasksPage");
const AgoojyeAdminMilestonesPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminMilestonesPage");
const AgoojyeAdminDocumentsPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminDocumentsPage");
const AgoojyeAdminPartnersPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminPartnersPage");
const AgoojyeAdminSponsorsPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminSponsorsPage");
const AgoojyeAdminMediaPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminMediaPage");
const AgoojyeAdminContentPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminContentPage");
const AgoojyeAdminSettingsPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminSettingsPage");
const AgoojyeAdminAuditPage = isolatedTenantPage(agoojyeAdminPagesImporter, "AgoojyeAdminAuditPage");
const BdoActualitesPage = isolatedTenantPage(bdoAuthorityPagesImporter, "BdoActualitesPage");
const BdoReglementationPage = isolatedTenantPage(bdoAuthorityPagesImporter, "BdoReglementationPage");
const BdoIndustrieMinierePage = isolatedTenantPage(bdoAuthorityPagesImporter, "BdoIndustrieMinierePage");
const BdoCertificationPage = isolatedTenantPage(bdoAuthorityPagesImporter, "BdoCertificationPage");
const BdoVerifierPage = isolatedTenantPage(bdoAuthorityPagesImporter, "BdoVerifierPage");
const BdoEspaceProDashboardPage = isolatedTenantPage(bdoProPagesImporter, "BdoEspaceProDashboardPage");
const BdoWholesaleMarketPage = isolatedTenantPage(bdoProPagesImporter, "BdoWholesaleMarketPage");
const BdoProMapPage = isolatedTenantPage(bdoProPagesImporter, "BdoProMapPage");
const BdoProIntelligencePage = isolatedTenantPage(bdoProPagesImporter, "BdoProIntelligencePage");
const BdoProBureauxPage = isolatedTenantPage(bdoProPagesImporter, "BdoProBureauxPage");
const BdoProBuyersPage = isolatedTenantPage(bdoProPagesImporter, "BdoProBuyersPage");
const BdoProExportersPage = isolatedTenantPage(bdoProPagesImporter, "BdoProExportersPage");
const BdoProCounterpartiesPage = isolatedTenantPage(bdoProPagesImporter, "BdoProCounterpartiesPage");
const BdoProMembershipPage = isolatedTenantPage(bdoProPagesImporter, "BdoProMembershipPage");
const BdoCoffrePage = isolatedTenantPage(bdoGoalPagesImporter, "BdoCoffrePage");
const BdoGoalsPage = isolatedTenantPage(bdoGoalPagesImporter, "BdoGoalsPage");
const BdoGoalDetailPage = isolatedTenantPage(bdoGoalPagesImporter, "BdoGoalDetailPage");
const BdoAdminSettingsPage = isolatedTenantPage(bdoAdminPagesImporter, "BdoAdminSettingsPage");
const BdoAdminGoalsPage = isolatedTenantPage(bdoAdminPagesImporter, "BdoAdminGoalsPage");
const BdoAdminProMembershipsPage = isolatedTenantPage(bdoAdminPagesImporter, "BdoAdminProMembershipsPage");
const AdminMarketingPostsPage = lazyPage(() => import("@/pages/AdminMarketingPostsPage"));
const AdminMarketingPressPage = lazyPage(() => import("@/pages/AdminMarketingPressPage"));
const AdminMarketingLibraryPage = lazyPage(() => import("@/pages/AdminMarketingLibraryPage"));
const AdminMarketingMediaPage = lazyPage(() => import("@/pages/AdminMarketingMediaPage"));
const AdminMediaStudioPage = lazyPage(() => import("@/pages/AdminMediaStudioPage"));
const AdminAdvertisingGovernancePage = lazyPage(() => import("@/pages/AdminAdvertisingGovernancePage"));
const AdminMarketingScreenshotsPage = lazyPage(() => import("@/pages/AdminMarketingScreenshotsPage"));
const AdminContactsPage = lazyPage(() => import("@/pages/AdminContactsPage"));

// Admin layout + pages (route-level code split)
const AdminLayout = lazyPage(() => import("@/components/AdminLayout"), "AdminLayout");
const ExportunityAdminDashboardPage = lazyPage(() => import("@/pages/exportunity/ExportunityAdminDashboardPage"));
const AdminDashboardPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AdminDashboardPage"))
  : ExportunityAdminDashboardPage;
const ExportunityOperationsCenterPage = lazyPage(() => import("@/pages/exportunity/ExportunityOperationsCenterPage"));
const AITeamHubPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AITeamHubPage"), "AITeamHubPage")
  : ExportunityOperationsCenterPage;
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
const AdminExportunityIntegrationsPage = lazyPage(
  () => import("@/pages/AdminExportunityIntegrationsPage"),
);
const AdminExportunitySupplierDiscoveryPage = lazyPage(
  () => import("@/pages/AdminExportunitySupplierDiscoveryPage"),
);
const AdminExportunitySupplierRfqsPage = lazyPage(
  () => import("@/pages/AdminExportunitySupplierRfqsPage"),
);
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
const FinancePage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/FinancePage"), "FinancePage")
  : ExcludedTenantPage;
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
const ContractsPage = lazyPage(() => import("@/pages/ContractsPage"));
const ContractDetailPage = lazyPage(() => import("@/pages/ContractDetailPage"));
const AuthorizedBureausPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AuthorizedBureausPage"))
  : ExcludedTenantPage;
const AdminAssetStudioPage = lazyPage(() => import("@/pages/AdminAssetStudioPage"));
const AdminMediaDebugPage = lazyPage(() => import("@/pages/AdminMediaDebugPage"));
const AdminMarketplaceProductsPage = lazyPage(() => import("@/pages/AdminMarketplaceProductsPage"));
const AdminMarketplacePaymentsPage = lazyPage(() => import("@/pages/AdminMarketplacePaymentsPage"));
const AdminPmeExchangePage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AdminPmeExchangePage"))
  : ExcludedTenantPage;
const AdminIndustrialNetworkPage = lazyPage(() => import("@/pages/AdminIndustrialNetworkPage"));
const AdminCarrierNetworkPage = lazyPage(() => import("@/pages/AdminCarrierNetworkPage"));
const AdminGroupBuyingPage = lazyPage(() => import("@/pages/AdminGroupBuyingPage"));
const AdminTradeIntelligencePage = lazyPage(
  () => import("@/pages/AdminTradeIntelligencePage"),
);
const AdminSystemUpdatePage = lazyPage(() => import("@/pages/AdminSystemUpdatePage"));
const AdminMapIconsPage = lazyPage(() => import("@/pages/AdminMapIconsPage"));
const AdminOnboardingSettingsPage = lazyPage(() => import("@/pages/AdminOnboardingSettingsPage"));
const AdminWebsiteIntelligencePage = lazyPage(() => import("@/pages/AdminWebsiteIntelligencePage"));
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
const AdminStampedGoldMasterPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AdminStampedGoldMasterPage"))
  : ExcludedTenantPage;
const AdminStampedGoldSkusPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AdminStampedGoldSkusPage"))
  : ExcludedTenantPage;
const AdminStampedGoldItemsPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AdminStampedGoldItemsPage"))
  : ExcludedTenantPage;
const AdminStampedGoldJewellersPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AdminStampedGoldJewellersPage"))
  : ExcludedTenantPage;
const AdminStampedGoldScansPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AdminStampedGoldScansPage"))
  : ExcludedTenantPage;
const AdminStampedGoldPickupPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AdminStampedGoldPickupPage"))
  : ExcludedTenantPage;
const AdminStampedGoldMintingStudioPage = includeOtherTenantUi
  ? lazyPage(() => import("@/pages/AdminStampedGoldMintingStudioPage"))
  : ExcludedTenantPage;
const AdminEquipmentOpsFleetMapPage = lazyPage(() => import("@/pages/AdminEquipmentOpsFleetMapPage"));
const AdminEquipmentOpsListingsPage = lazyPage(() => import("@/pages/AdminEquipmentOpsListingsPage"));
const AdminEquipmentOpsContractsPage = lazyPage(() => import("@/pages/AdminEquipmentOpsContractsPage"));
const AdminEquipmentOpsMaintenancePage = lazyPage(() => import("@/pages/AdminEquipmentOpsMaintenancePage"));
const AdminWorkstationsPage = lazyPage(() => import("@/pages/AdminWorkstationsPage"));
const AdminEvidencePage = lazyPage(() => import("@/pages/AdminEvidencePage"));

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

function TenantDashboardRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") return <ExportunityAdminDashboardPage />;
  return <AdminDashboardPage />;
}

function TenantOperationsCenterRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") return <ExportunityOperationsCenterPage />;
  return <AITeamHubPage />;
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

function RootPublicRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") return <ExportunityMarketplacePage />;

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
  if (tenant.key === "exportunity") {
    return <ExportunityGlobalTradeHomePage />;
  }
  return <Redirect to="/zone" />;
}

function StoreRoute() {
  const [location] = useLocation();
  if (!StorePage) return <Redirect to="/industrial" />;
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

function ExportunityLegacyCommerceGuard({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant();
  const [location] = useLocation();
  const destination = getExportunityLegacyCommerceDestination(location);

  if (tenant.key === "exportunity" && destination) {
    return <Redirect to={destination} />;
  }
  return <>{children}</>;
}

function ExportunityLegacyStoreRoute() {
  return (
    <ExportunityLegacyCommerceGuard>
      <StoreRoute />
    </ExportunityLegacyCommerceGuard>
  );
}

function ExportunityLegacyCollectionsRoute() {
  return (
    <ExportunityLegacyCommerceGuard>
      <CollectionsRoute />
    </ExportunityLegacyCommerceGuard>
  );
}

function ExportunityLegacyStoreRedirect({ query }: { query: string }) {
  return (
    <ExportunityLegacyCommerceGuard>
      <Redirect to={`/store?${query}`} />
    </ExportunityLegacyCommerceGuard>
  );
}

function ExportunityIndustrialRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") {
    return <ExportunityIndustrialHubPage />;
  }
  return <Redirect to="/zone" />;
}

function ExportunityMarketplaceRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") {
    return <ExportunityMarketplacePage />;
  }
  return <StoreRoute />;
}

function ExportunityMarketplaceMapRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") {
    return <ExportunityMarketplacePage />;
  }
  return <StoreRoute />;
}

function ExportunityIndustrialAliasRoute({ to }: { to: string }) {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") {
    return <Redirect to={to} />;
  }
  return <StoreRoute />;
}

function ExportunityMachineryRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") {
    return <ExportunityIndustrialHubPage />;
  }
  return <Redirect to="/auth?next=/app/machinery/catalog" />;
}

function BdoWholesaleRoute() {
  const { tenant } = useTenant();
  if (isBdoHost() || tenant.key === "bdo") return <StoreRoute />;
  return tenant.key === "exportunity"
    ? <Redirect to="/industrial-supply" />
    : <Redirect to="/zone" />;
}

function CollectionsRoute() {
  return StoreCollectionsPage ? <StoreCollectionsPage /> : <Redirect to="/industrial" />;
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
  return <Redirect to="/" />;
}

function UnifiedDocsApiRoute() {
  if (isMindbaseHost()) return <MindbaseDocsApiPage />;
  return <Redirect to="/zone" />;
}

function MarketingAwareAboutRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") return <Redirect to="/" />;
  if (isVsHost()) return <VsAboutPage />;
  if (isHozHost()) return <HozAboutPage />;
  return <GatewayPage />;
}

function UnifiedContactRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") return <Redirect to="/" />;
  if (tenant.key === "agoojye" || isAgoojyeHost()) return <AgoojyeContactPage />;
  if (isVsHost()) return <VsContactPage />;
  if (isMetHost()) return <MetContactPage />;
  if (isHozHost()) return <HozContactPage />;
  return <Redirect to="/" />;
}

function UnifiedMediaRoute() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") return <Redirect to="/trade" />;
  if (tenant.key === "agoojye" || isAgoojyeHost()) return <AgoojyeMediaPage />;
  if (isHozHost()) return <HozMediaPage />;
  return <Redirect to="/" />;
}

function AgoojyeOnlyRoute({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant();
  return tenant.key === "agoojye" || isAgoojyeHost() ? <>{children}</> : <Redirect to="/zone" />;
}

function MarketingAwarePrivacyRoute() {
  return <PrivacyPage />;
}

function MarketingAwareTermsRoute() {
  return <TermsPage />;
}

function RetiredPublicSurfaceRedirect({ to = "/" }: { to?: string }) {
  return <Redirect to={to} />;
}

function RetailAliasRedirect() {
  const { tenant } = useTenant();
  if (tenant.key === "exportunity") {
    return <Redirect to="/industrial" />;
  }

  const legacyRedirect = (() => {
    if (typeof window === "undefined") return <Redirect to="/zone" />;
    const pathname = String(window.location.pathname || "/retail");
    const suffix = pathname.startsWith("/retail/") ? pathname.slice("/retail".length) : "";
    const search = String(window.location.search || "");
    return <Redirect to={`/zone${suffix}${search}`} />;
  })();

  return <ExportunityLegacyCommerceGuard>{legacyRedirect}</ExportunityLegacyCommerceGuard>;
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
      <Suspense fallback={null}>
        <ZoneInstallPrompt />
      </Suspense>
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
          <Route path="/store" component={ExportunityLegacyStoreRoute} />
          <Route path="/or" component={ExportunityLegacyStoreRoute} />
          <Route path="/or/:rest*" component={ExportunityLegacyStoreRoute} />
          <Route path="/achat-or" component={ExportunityLegacyStoreRoute} />
          <Route path="/achat-or/:rest*" component={ExportunityLegacyStoreRoute} />
          <Route path="/stamped-gold" component={ExportunityLegacyStoreRoute} />
          <Route path="/pieces" component={ExportunityLegacyStoreRoute} />
          <Route path="/collections" component={ExportunityLegacyCollectionsRoute} />
          <Route path="/collections/:slug">
            {(params) => (
              <ExportunityLegacyCommerceGuard>
                {StoreCollectionPage ? (
                  <StoreCollectionPage slug={String((params as any).slug || "")} />
                ) : (
                  <Redirect to="/industrial" />
                )}
              </ExportunityLegacyCommerceGuard>
            )}
          </Route>
          <Route path="/cart" component={() => <ExportunityLegacyStoreRedirect query="cart=1" />} />
          <Route path="/checkout" component={() => <ExportunityLegacyStoreRedirect query="checkout=1" />} />
          <Route path="/maison-modele" component={() => (isMetHost() ? <MetModelHousePage /> : <Redirect to="/zone" />)} />
          <Route path="/briques" component={() => (isMetHost() ? <MetBricksPage /> : <Redirect to="/zone" />)} />
          <Route path="/plans/:slug">
            {(params) => (isMetHost() ? <MetPlanDetailPage slug={String((params as any)?.slug || "")} /> : <RetiredPublicSurfaceRedirect />)}
          </Route>
          <Route path="/plans" component={() => (isMetHost() ? <MetPlansPage /> : <RetiredPublicSurfaceRedirect />)} />
          <Route path="/devis" component={() => (isMetHost() ? <MetEstimatePage /> : <Redirect to="/zone" />)} />
          <Route path="/realisations/:slug">
            {(params) => (isMetHost() ? <MetProjectDetailPage slug={String((params as any)?.slug || "")} /> : <Redirect to="/zone" />)}
          </Route>
          <Route path="/realisations" component={() => (isMetHost() ? <MetRealisationsPage /> : <Redirect to="/zone" />)} />
          <Route path="/blog/:slug">
            {(params) => (isMetHost() ? <MetBlogPostPage slug={String((params as any)?.slug || "")} /> : <RetiredPublicSurfaceRedirect to="/trade" />)}
          </Route>
          <Route path="/blog" component={() => (isMetHost() ? <MetBlogPage /> : <RetiredPublicSurfaceRedirect to="/trade" />)} />
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
          <Route path="/industrial/orders/:orderId/pay">
            {(params) => (
              <ProtectedRoute>
                <ExportunityIndustrialOrderPaymentPage
                  orderId={String((params as any)?.orderId || "")}
                />
              </ProtectedRoute>
            )}
          </Route>
          <Route path="/industrial" component={ExportunityIndustrialRoute} />
          <Route path="/trade" component={ExportunityTradeIntelligencePage} />
          <Route path="/trade/articles/:slug" component={ExportunityTradeNewsroomArticlePage} />
          <Route path="/trade/countries/:countryCode" component={ExportunityTradeIntelligencePage} />
          <Route path="/trade/sectors/:sectorCode" component={ExportunityTradeIntelligencePage} />
          <Route path="/producer-exchange/:slug">
            {(params) => (
              <ExportunityProducerExchangePage slug={String((params as any)?.slug || "")} />
            )}
          </Route>
          <Route path="/producer-exchange" component={ExportunityProducerExchangePage} />
          <Route path="/industrial-map" component={ExportunityIndustrialRoute} />
          <Route path="/factories" component={ExportunityIndustrialRoute} />
          <Route path="/factories/:rest*" component={ExportunityIndustrialRoute} />
          <Route path="/export-products" component={ExportunityIndustrialRoute} />
          <Route path="/export-products/:rest*" component={ExportunityIndustrialRoute} />
          <Route path="/industrial-supply" component={ExportunityIndustrialRoute} />
          <Route path="/industrial-supply/:rest*" component={ExportunityIndustrialRoute} />
          <Route path="/request-quote" component={ExportunityIndustrialRoute} />
          <Route path="/my-factory" component={ExportunityIndustrialRoute} />
          <Route path="/zone" component={() => <ExportunityIndustrialAliasRoute to="/marketplace" />} />
          <Route path="/zone/:rest*" component={() => <ExportunityIndustrialAliasRoute to="/marketplace" />} />
          <Route path="/map" component={ExportunityMarketplaceMapRoute} />
          <Route path="/marketplace/map" component={ExportunityMarketplaceRoute} />
          <Route path="/marketplace/map/:rest*" component={ExportunityMarketplaceRoute} />
          <Route path="/pme-exchange" component={() => <ExportunityIndustrialAliasRoute to="/factories" />} />
          <Route path="/pme-exchange/:rest*" component={() => <ExportunityIndustrialAliasRoute to="/factories" />} />
          <Route path="/ready-for-export" component={() => <ExportunityIndustrialAliasRoute to="/export-products" />} />
          <Route path="/ready-for-export/:rest*" component={() => <ExportunityIndustrialAliasRoute to="/export-products" />} />
          <Route path="/retail" component={RetailAliasRedirect} />
          <Route path="/retail/:rest*" component={RetailAliasRedirect} />
          <Route path="/marketplace" component={ExportunityMarketplaceRoute} />
          <Route path="/shop" component={() => <ExportunityIndustrialAliasRoute to="/marketplace" />} />
          <Route path="/shop/:rest*" component={() => <ExportunityIndustrialAliasRoute to="/marketplace" />} />
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
          <Route path="/press" component={() => (isVsHost() ? <VsPressPage /> : <RetiredPublicSurfaceRedirect to="/trade" />)} />
          <Route path="/portfolio" component={() => (isVsHost() ? <VsPortfolioPage /> : <Redirect to="/zone" />)} />
          <Route path="/insights" component={() => (isVsHost() ? <VsInsightsPage /> : <Redirect to="/zone" />)} />
          <Route path="/books" component={() => (isHozHost() ? <HozBooksPage /> : <Redirect to="/zone" />)} />
          <Route path="/jewelry" component={() => (isHozHost() ? <HozJewelryPage /> : <Redirect to="/zone" />)} />
          <Route path="/how-it-works" component={() => <RetiredPublicSurfaceRedirect />} />

          {/* Retired corporate URLs can resolve only into the current GTN and governed application surfaces. */}
          <Route path="/company" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/what-we-do" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/platforms" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/gold-mining" component={() => <RetiredPublicSurfaceRedirect to="/producer-exchange" />} />
          <Route path="/gold" component={() => <RetiredPublicSurfaceRedirect to="/producer-exchange" />} />
          <Route path="/government-institutions" component={() => <RetiredPublicSurfaceRedirect to="/industrial" />} />
          <Route path="/government" component={() => <RetiredPublicSurfaceRedirect to="/industrial" />} />
          <Route path="/archive" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/operating-stack" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/work-with-us" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/story" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/journey" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/story/founder" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/use-cases" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/demo" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/proof" component={() => <RetiredPublicSurfaceRedirect to="/trade" />} />
          <Route path="/our-journey" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/solutions" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/platform/os" component={() => <RetiredPublicSurfaceRedirect to="/ai-team" />} />
          <Route path="/platform/pro" component={() => <RetiredPublicSurfaceRedirect to="/ai-team" />} />
          <Route path="/platform/gold" component={() => <RetiredPublicSurfaceRedirect to="/producer-exchange" />} />
          <Route path="/platform/agents" component={() => <RetiredPublicSurfaceRedirect to="/ai-team" />} />
          <Route path="/platform/marketplace" component={() => <RetiredPublicSurfaceRedirect to="/marketplace" />} />
          <Route path="/platform/wallet" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/wallet" />} />
          <Route path="/platform/contracts" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/contracts" />} />
          <Route path="/platform/invest" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/invest/opportunities" />} />
          <Route path="/platform/compliance" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/governance/logs" />} />
          <Route path="/platform/messaging" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/messaging" />} />
          <Route path="/platform/governance" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/governance/logs" />} />
          <Route path="/platform/security" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/governance/logs" />} />
          <Route path="/platform/screenshots" component={() => <RetiredPublicSurfaceRedirect to="/ai-team" />} />
          <Route path="/platform/modules/:slug" component={() => <RetiredPublicSurfaceRedirect to="/ai-team" />} />
          <Route path="/platform/modules" component={() => <RetiredPublicSurfaceRedirect to="/ai-team" />} />
          <Route path="/platform" component={() => <RetiredPublicSurfaceRedirect to="/ai-team" />} />
          <Route path="/media" component={UnifiedMediaRoute} />
          <Route path="/media/press" component={() => (isHozHost() ? <Redirect to="/media" /> : <RetiredPublicSurfaceRedirect to="/trade" />)} />
          <Route path="/media/videos" component={() => (isHozHost() ? <Redirect to="/media" /> : <RetiredPublicSurfaceRedirect to="/trade" />)} />
          <Route path="/media/profiles" component={() => (isHozHost() ? <Redirect to="/media" /> : <RetiredPublicSurfaceRedirect to="/trade" />)} />
          <Route path="/media/articles" component={() => (isHozHost() ? <Redirect to="/media" /> : <RetiredPublicSurfaceRedirect to="/trade" />)} />
          <Route path="/media/library" component={() => (isHozHost() ? <Redirect to="/media" /> : <RetiredPublicSurfaceRedirect to="/trade" />)} />
          <Route path="/talk" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/signup" component={() => <Redirect to="/register" />} />
          <Route path="/wallet" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/wallet" />} />
          <Route path="/contracts" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/contracts" />} />
          <Route path="/business" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app" />} />
          <Route path="/ops" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app" />} />
          <Route path="/machinery" component={ExportunityMachineryRoute} />
          <Route path="/invest" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/invest/opportunities" />} />
          <Route path="/compliance" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/governance/logs" />} />
          <Route path="/communications" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/messaging" />} />
          <Route path="/ai-operations" component={() => <RetiredPublicSurfaceRedirect to="/ai-team" />} />
          <Route path="/privacy" component={MarketingAwarePrivacyRoute} />
          <Route path="/terms" component={MarketingAwareTermsRoute} />
          <Route path="/copy-of-home" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/contact-8" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/privacypolicy" component={() => <RetiredPublicSurfaceRedirect to="/privacy" />} />
          <Route path="/termsofservice" component={() => <RetiredPublicSurfaceRedirect to="/terms" />} />
          <Route path="/library" component={() => <RetiredPublicSurfaceRedirect to="/trade" />} />
          <Route path="/library/categories/:slug" component={() => <RetiredPublicSurfaceRedirect to="/trade" />} />
          <Route path="/library/tags/:slug" component={() => <RetiredPublicSurfaceRedirect to="/trade" />} />
          <Route path="/post/:slug" component={() => <RetiredPublicSurfaceRedirect to="/trade" />} />
          <Route path="/invest/opportunities" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/invest/opportunities" />} />
          <Route path="/invest/opportunities/:slug" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/invest/opportunities" />} />
          <Route path="/invest/contracts" component={() => <RetiredPublicSurfaceRedirect to="/auth?next=/app/contracts" />} />
          <Route path="/pricing" component={UnifiedPricingRoute} />
          <Route path="/plans-pricing" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/academy" component={() => <RetiredPublicSurfaceRedirect to="/trade" />} />
          <Route path="/initiative" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/booking-calendar" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/people" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/clubs" component={() => <RetiredPublicSurfaceRedirect to="/trade" />} />
          <Route path="/rayonhome" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/rayon-seller" component={() => <RetiredPublicSurfaceRedirect to="/industrial" />} />
          <Route path="/copy-of-fintech" component={() => <RetiredPublicSurfaceRedirect />} />
          <Route path="/challenge-page/:id" component={() => <RetiredPublicSurfaceRedirect to="/trade" />} />
          <Route path="/group/:rest*" component={() => <RetiredPublicSurfaceRedirect to="/trade" />} />
          <Route path="/profile/:rest*" component={() => <RetiredPublicSurfaceRedirect to="/trade" />} />
          <Route path="/orders" component={MyOrdersPage} />
          <Route path="/orders/:orderNumber" component={MyOrdersPage} />
          <Route path="/delivery" component={() => (isBdoHost() ? <Redirect to="/store" /> : <DeliveryHubPage />)} />
          <Route path="/marketplace-old" component={() => <ExportunityIndustrialAliasRoute to="/marketplace" />} />
          <Route path="/product/:slug">
            {(params) => (
              <ExportunityLegacyCommerceGuard>
                {StoreProductPage ? (
                  <StoreProductPage slug={String((params as any).slug || "")} />
                ) : (
                  <Redirect to="/industrial" />
                )}
              </ExportunityLegacyCommerceGuard>
            )}
          </Route>
          <Route path="/verify/:serial" component={StampedGoldVerifyPage} />
          <Route path="/login" component={UnifiedAccessPage} />
          <Route path="/register" component={UnifiedAccessPage} />
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
          <Route path="/inbox" component={() => <Redirect to="/pro/chats" />} />
          <Route path="/inbox/:roomKey">
            {(params) => {
              const roomKey = String((params as any)?.roomKey || "").trim().toLowerCase();
              return (
                <Redirect
                  to={
                    roomKey === "wallet"
                      ? "/pro/money"
                      : `/pro/operations/${encodeURIComponent(roomSlugFromKey(roomKey))}`
                  }
                />
              );
            }}
          </Route>
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
          <Route path="/admin/media/studio">
            <ProtectedRoute>
              <AdminMediaStudioPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/media">
            <ProtectedRoute>
              <AdminMarketingMediaPage />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/advertising-governance">
            <ProtectedRoute>
              <AdminAdvertisingGovernancePage />
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
            <TenantDashboardRoute />
          </ProtectedRoute>
        </Route>

        <Route path="/ai-team">
          <ProtectedRoute>
            <TenantOperationsCenterRoute />
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
            <Redirect to="/actions?view=automations" />
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

        <Route path="/admin/exportunity/integrations">
          <ProtectedRoute>
            <AdminExportunityIntegrationsPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/exportunity/supplier-discovery">
          <ProtectedRoute>
            <AdminExportunitySupplierDiscoveryPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/exportunity/supplier-rfqs">
          <ProtectedRoute>
            <AdminExportunitySupplierRfqsPage />
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
            <Redirect to="/admin/media" />
          </ProtectedRoute>
        </Route>

        <Route path="/sales">
          <ProtectedRoute>
            <Redirect to="/client-hunter" />
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
            <Redirect to="/admin/seo?view=visits" />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/website/seo">
          <ProtectedRoute>
            <Redirect to="/admin/seo?view=seo" />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/website/seo-autopilot">
          <ProtectedRoute>
            <Redirect to="/admin/seo?view=governance" />
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

        <Route path="/admin/carrier-network">
          <ProtectedRoute>
            <AdminCarrierNetworkPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/group-buying">
          <ProtectedRoute>
            <AdminGroupBuyingPage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/trade-intelligence">
          <ProtectedRoute>
            <AdminTradeIntelligencePage />
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
            <AdminWebsiteIntelligencePage />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/ux-audit">
          <ProtectedRoute>
            <Redirect to="/admin/seo?view=navigation" />
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
            <Redirect to="/admin/system/update?view=voice" />
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
