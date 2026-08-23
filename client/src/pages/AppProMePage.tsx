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
    <div className="min-h-screen bg-[#F7F8FA] pb-24 text-[#07111F]">
      <ProSideNav activeKey="account" />
      <div className="md:ml-56">
      <AppProTopBar subtitle="Account" />
      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        <Button
          variant="ghost"
          className="h-9 px-2 text-slate-600 hover:bg-white hover:text-slate-950"
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

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">My account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="font-black">{user?.displayName || "User"}</div>
              <div className="mt-1 text-slate-500">{user?.email}</div>
            </div>
            {roles.length > 1 ? (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">View as</label>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-800 outline-none focus:border-[#F5A623]"
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
              <div className="text-xs text-slate-500">
                Role: <span className="font-bold text-slate-800">{formatRole(currentMode || "user")}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start border-slate-200 text-slate-700" onClick={() => setLocation("/account")}>
              <Building2 className="h-4 w-4 mr-2" />
              Profile & company
            </Button>
            <Button variant="outline" className="w-full justify-start border-slate-200 text-slate-700" onClick={() => setLocation("/pro/operations")}>
              <Shield className="h-4 w-4 mr-2" />
              Switch company space (top-right)
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start border-slate-200 text-slate-700"
              onClick={() => setLocation("/pro/agents/billing")}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Subscription & billing
            </Button>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          className="w-full border-red-200 bg-white text-red-700 hover:bg-red-50"
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
