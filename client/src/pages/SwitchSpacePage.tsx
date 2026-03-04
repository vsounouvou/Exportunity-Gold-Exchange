import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, AlertCircle } from "lucide-react";
import { useSession } from "@/lib/session";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { getTenantDefaultRoute, isTenantRouteAllowed } from "@/lib/tenantPolicy";
import { tenantFromHost } from "@/lib/tenantResolution";
import type { TenantKey } from "@/types/tenant";

function asTenantKey(value: string | null | undefined): TenantKey | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bdo") return "bdo";
  if (normalized === "exportunity") return "exportunity";
  if (normalized === "zone") return "zone";
  if (normalized === "mindbase") return "mindbase";
  if (normalized === "vs" || normalized === "vitalsounouvou") return "vs";
  return null;
}

function sanitizeReturnPath(value: string | null | undefined, tenantKey: TenantKey) {
  const raw = String(value || "").trim();
  const fallback = getTenantDefaultRoute(tenantKey);
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("://")) return fallback;
  return isTenantRouteAllowed(raw, tenantKey) ? raw : fallback;
}

export function SwitchSpacePage() {
  const [, setLocation] = useLocation();
  const { login } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const exchange = async (token: string, returnPath: string) => {
      try {
        const result = await apiRequest("/api/ece/auth/exchange-space", {
          method: "POST",
          body: JSON.stringify({ token }),
        });

        if (!mounted) return;
        try {
          localStorage.removeItem("ece_space_switch_token");
        } catch {
          // ignore
        }
        login(result.token, result.user);
        setLocation(returnPath);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "Unable to complete space switch.");
      }
    };

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const targetTenant = asTenantKey(params.get("targetTenant"));
      const hostTenant = tenantFromHost(window.location.hostname);
      const activeTenant = hostTenant || targetTenant || "bdo";
      const returnPath = sanitizeReturnPath(params.get("return"), activeTenant);
      let exchangeToken = String(params.get("token") || "").trim();
      if (!exchangeToken) {
        try {
          exchangeToken = String(localStorage.getItem("ece_space_switch_token") || "").trim();
        } catch {
          // ignore
        }
      }

      if (!exchangeToken) {
        try {
          const refreshed = await apiRequest("/api/ece/auth/switch-space/refresh", {
            method: "POST",
            body: JSON.stringify({
              targetTenant: targetTenant || undefined,
            }),
          });
          exchangeToken = String(refreshed?.token || "").trim();
        } catch (refreshError: any) {
          if (!mounted) return;
          setError(refreshError?.message || "Missing space switch token.");
          return;
        }
      }

      if (!exchangeToken) {
        if (!mounted) return;
        setError("Missing space switch token.");
        return;
      }

      await exchange(exchangeToken, returnPath);
    };

    run();
    return () => {
      mounted = false;
    };
  }, [login, setLocation]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <Card className="w-full max-w-md bg-gray-900 border-gray-800">
        <CardContent className="pt-6">
          {error ? (
            <div className="flex items-start gap-3 text-red-300">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Space switch failed</p>
                <p className="text-xs text-white/60 mt-1">{error}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
              <div>
                <p className="text-sm font-semibold">Switching spaces</p>
                <p className="text-xs text-white/60 mt-1">One moment while we sign you in.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
