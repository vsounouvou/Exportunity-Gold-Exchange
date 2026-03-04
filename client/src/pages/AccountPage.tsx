import { BrandLockup } from "@pkg/branding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/contexts/LocaleContext";
import { useSession } from "@/lib/session";
import { getTenantDefaultRoute } from "@/lib/tenantPolicy";
import { useTenant } from "@/lib/tenant";
import { ArrowLeft, ClipboardList, Home, LogIn, LogOut, Settings, Store, Truck, UserCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function AccountPage() {
  const session = useSession();
  const [, navigate] = useLocation();
  const { tenant } = useTenant();
  const { t } = useLocale();

  const isSignedIn = session.isAuthenticated && !session.isGuest;
  const tenantAdminRoute = getTenantDefaultRoute(tenant.key);
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate("/");
  };

  return (
    <div className="min-h-[100dvh] bg-gray-950 text-white pt-safe pb-safe px-4">
      <div className="mx-auto w-full max-w-md py-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button
            className="justify-start bg-white/5 border border-white/10 hover:bg-white/10 text-white"
            variant="ghost"
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              className="justify-start bg-white/5 border border-white/10 hover:bg-white/10 text-white"
              variant="ghost"
              onClick={() => navigate("/")}
            >
              <Home className="h-4 w-4 mr-2" />
              Home
            </Button>
            <Button
              className="justify-start bg-white/5 border border-white/10 hover:bg-white/10 text-white"
              variant="ghost"
              onClick={() => navigate("/store")}
            >
              <Store className="h-4 w-4 mr-2" />
              Store
            </Button>
          </div>
        </div>

        <div className="flex justify-center">
          <BrandLockup subtitle={t("header.subtitle")} />
        </div>

        <h1 className="text-xl font-semibold">{t("nav.account")}</h1>

        {isSignedIn ? (
          <>
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-white">{session.user?.displayName || "Account"}</CardTitle>
                <CardDescription className="text-gray-400">{session.user?.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full justify-start bg-white/5 border border-white/10 hover:bg-white/10 text-white"
                  variant="ghost"
                  onClick={() => navigate("/orders")}
                >
                  <ClipboardList className="h-4 w-4 mr-2" />
                  My Orders
                </Button>
                <Button
                  className="w-full justify-start bg-white/5 border border-white/10 hover:bg-white/10 text-white"
                  variant="ghost"
                  onClick={() => navigate("/profile")}
                >
                  <UserCircle className="h-4 w-4 mr-2" />
                  Profile
                </Button>
                {session.hasRole("seller") && (
                  <Button
                    className="w-full justify-start bg-white/5 border border-white/10 hover:bg-white/10 text-white"
                    variant="ghost"
                    onClick={() => navigate("/seller")}
                  >
                    <Store className="h-4 w-4 mr-2" />
                    Seller Dashboard
                  </Button>
                )}
                {session.hasRole("delivery") && (
                  <Button
                    className="w-full justify-start bg-white/5 border border-white/10 hover:bg-white/10 text-white"
                    variant="ghost"
                    onClick={() => navigate("/delivery")}
                  >
                    <Truck className="h-4 w-4 mr-2" />
                    {t("account.deliveryDashboard")}
                  </Button>
                )}
                {session.hasRole("admin") && (
                  <Button
                    className="w-full justify-start bg-white/5 border border-white/10 hover:bg-white/10 text-white"
                    variant="ghost"
                    onClick={() => navigate(tenantAdminRoute)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    {t("account.adminConsole")}
                  </Button>
                )}

                <div className="pt-2">
                  <Button
                    className="w-full justify-start bg-red-500/10 hover:bg-red-500/15 text-red-300 border border-red-500/20"
                    variant="ghost"
                    onClick={() => {
                      session.logout();
                      navigate("/");
                    }}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {t("common.signOut")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">{t("nav.account")}</CardTitle>
              <CardDescription className="text-gray-400">
                {t("account.signInToAccessOrdersAndWallet")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black" onClick={() => navigate("/login")}>
                <LogIn className="h-4 w-4 mr-2" />
                {t("common.signIn")}
              </Button>
              <Button
                className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10"
                variant="ghost"
                onClick={() => navigate("/register")}
              >
                <UserCircle className="h-4 w-4 mr-2" />
                {t("common.createAccount")}
              </Button>
              <Button
                className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10"
                  variant="ghost"
                  onClick={() => navigate("/")}
                >
                  {t("common.continueBrowsing")}
                </Button>
              </CardContent>
            </Card>
        )}
      </div>
    </div>
  );
}
