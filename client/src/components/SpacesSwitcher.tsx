import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRightLeft, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { useTenant } from "@/lib/tenant";
import { BRAND_MAP } from "@/lib/brand";
import { getTenantDefaultRoute, isTenantRouteAllowed } from "@/lib/tenantPolicy";
import type { TenantKey } from "@/types/tenant";
import { getTenantConfigByKey, listTenantConfigs } from "../../../tenants/index";

type SpaceOption = {
  key: TenantKey;
  label: string;
  name: string;
  description: string;
  domainFallback: string;
};

const ORDER: TenantKey[] = ["bdo", "exportunity", "zone", "rayon1km", "mindbase", "met", "vs", "hoz", "zogueland"];

function buildSpaceOptions(): SpaceOption[] {
  const registry = listTenantConfigs();
  const byKey = new Map(registry.map((entry) => [entry.slug, entry]));

  return ORDER.map((key) => {
    const config = byKey.get(key);
    const brand = BRAND_MAP[key];

    return {
      key,
      label: config?.brandName || brand?.name || key,
      name: brand?.name || config?.brandName || key,
      description: config?.tagline || brand?.tagline || "Tenant workspace",
      domainFallback: brand?.domain || config?.primaryDomain || "",
    };
  }).filter((option) => Boolean(option.domainFallback));
}

const SPACE_OPTIONS = buildSpaceOptions();

function pickTargetDomain(target: any, fallback: string) {
  const domains = Array.isArray(target?.domains) ? target.domains : [];
  const preferred = domains.find((domain: string) => domain && !domain.startsWith("www.")) || domains[0];
  return preferred || fallback;
}

export function SpacesSwitcher() {
  const { user, token, isAuthenticated, hasRole } = useSession();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [location] = useLocation();
  const [isSwitching, setIsSwitching] = useState(false);

  const isChairman = hasRole("chairman_assistant");
  const canSwitch = isAuthenticated && !!token && isChairman;

  if (!canSwitch) {
    return null;
  }

  const current = SPACE_OPTIONS.find((option) => option.key === tenant.key);
  const currentLabel = current?.label || "Switch tenant";

  const computeReturnPathForTenant = useMemo(
    () => (targetTenant: TenantKey) => {
      const tenantDefaultPath = getTenantDefaultRoute(targetTenant);
      if (!location) return tenantDefaultPath;
      if (location.startsWith("/pro") || location.startsWith("/app") || location.startsWith("/mobile")) {
        return isTenantRouteAllowed(location, targetTenant) ? location : tenantDefaultPath;
      }
      const adminLike =
        location.startsWith("/admin") ||
        location.startsWith("/dashboard") ||
        location.startsWith("/ai-team") ||
        location.startsWith("/agents") ||
        location.startsWith("/admin-users") ||
        location.startsWith("/subscription-plans") ||
        location.startsWith("/client-hunter") ||
        location.startsWith("/territories");
      const candidate = adminLike ? location : tenantDefaultPath;
      return isTenantRouteAllowed(candidate, targetTenant) ? candidate : tenantDefaultPath;
    },
    [location],
  );

  const handleSwitch = async (targetKey: TenantKey) => {
    if (targetKey === tenant.key || isSwitching) return;
    const targetOption = SPACE_OPTIONS.find((option) => option.key === targetKey);
    if (!targetOption) return;

    if (!token) {
      toast({
        title: "Unable to switch tenants",
        description: "Session token missing. Please sign in again.",
        variant: "destructive",
      });
      return;
    }

    setIsSwitching(true);
    try {
      const result = await apiRequest("/api/ece/auth/switch-space", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetTenant: targetKey }),
      });

      const domain = pickTargetDomain(result?.target, targetOption.domainFallback);
      const exchangeToken = result?.token;
      if (!exchangeToken) throw new Error("Missing exchange token");

      try {
        localStorage.setItem("ece_space_switch_token", exchangeToken);
      } catch {
        // ignore local storage failures
      }

      const returnPath = encodeURIComponent(computeReturnPathForTenant(targetKey));
      const targetTenant = encodeURIComponent(targetKey);
      const url = `https://${domain}/switch?token=${encodeURIComponent(exchangeToken)}&targetTenant=${targetTenant}&return=${returnPath}`;
      window.open(url, "_blank", "noopener");

      toast({
        title: "Tenant opened",
        description: `${targetOption.label} opened in a new tab.`,
      });
    } catch (error: any) {
      toast({
        title: "Unable to switch tenants",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3 text-gray-200 hover:text-white hover:bg-white/10"
          disabled={isSwitching}
        >
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          <span className="hidden lg:inline">{currentLabel}</span>
          <span className="lg:hidden">{current?.label ?? "Switch"}</span>
          <ChevronDown className="h-4 w-4 ml-2 hidden lg:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 bg-gray-900 border-gray-700 text-white">
        <DropdownMenuLabel className="text-xs text-gray-400">Chairman Tenant Switcher</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-700" />
        {SPACE_OPTIONS.map((option) => {
          const isActive = option.key === tenant.key;
          const cfg = getTenantConfigByKey(option.key);
          return (
            <DropdownMenuItem
              key={option.key}
              className={`cursor-pointer hover:bg-gray-800 ${isActive ? "bg-amber-500/10 text-amber-300" : ""}`}
              onClick={() => handleSwitch(option.key)}
              disabled={isActive}
            >
              <div className="flex flex-col">
                <span className="text-sm font-semibold">
                  {option.label}
                  {isActive ? " (Current)" : ""}
                </span>
                <span className="text-[11px] text-white/60">{cfg?.slug || option.key}</span>
                <span className="text-[11px] text-white/60">{option.description}</span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
