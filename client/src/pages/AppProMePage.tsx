import { Redirect, useLocation } from "wouter";
import { ArrowLeft, Building2, CreditCard, LogOut, Shield } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { ProSideNav } from "@/components/agentic/ProSideNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession, type UserRole } from "@/lib/session";

function formatRole(role: string) {
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AppProMePage() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isGuest, user, switchMode, logout } = useSession();
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const currentMode = String(user?.currentMode || roles[0] || "");

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-24">
      <ProSideNav activeKey="account" />
      <div className="md:ml-56">
      <AppProTopBar subtitle="Account" />
      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        <Button
          variant="ghost"
          className="h-9 px-2 text-white/75 hover:bg-white/5 hover:text-white"
          onClick={() => {
            if (canGoBack) {
              window.history.back();
              return;
            }
            setLocation("/pro/operations");
          }}
          data-testid="pro-account-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">My account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="font-semibold">{user?.displayName || "User"}</div>
              <div className="text-white/60 mt-1">{user?.email}</div>
            </div>
            {roles.length > 1 ? (
              <div className="space-y-1">
                <label className="text-xs text-white/55">View as</label>
                <select
                  className="h-10 w-full rounded-md bg-white/5 border border-white/10 text-white/85 px-3"
                  value={currentMode}
                  onChange={(event) => switchMode(event.target.value as UserRole)}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {formatRole(String(role))}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="text-xs text-white/55">
                Role: <span className="text-white/80">{formatRole(currentMode || "user")}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start border-white/15 text-white/85" onClick={() => setLocation("/account")}>
              <Building2 className="h-4 w-4 mr-2" />
              Profile & company
            </Button>
            <Button variant="outline" className="w-full justify-start border-white/15 text-white/85" onClick={() => setLocation("/pro/operations")}>
              <Shield className="h-4 w-4 mr-2" />
              Switch company space (top-right)
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start border-white/15 text-white/85"
              onClick={() => setLocation("/pro/agents/billing")}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Subscription & billing
            </Button>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          className="w-full border-red-400/40 text-red-200 hover:bg-red-500/10"
          onClick={() => {
            logout();
            setLocation("/pro/login?next=%2Fpro");
          }}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>

      <AppProBottomNav activeKey="account" />
      </div>
    </div>
  );
}
