import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown } from "lucide-react";

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

type AdminTenant = {
  id: number;
  key: string;
  name: string;
  domains?: string[];
};

type AdminTenantsPayload = {
  ok: boolean;
  canSwitch: boolean;
  currentTenantId: number | null;
  activeTenantId: number | null;
  activeTenant: AdminTenant | null;
  tenants: AdminTenant[];
};

export function TenantSwitcher() {
  const { isAuthenticated, hasRole, hasPermission, user } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const normalizedRoles = Array.isArray(user?.roles)
    ? user.roles.map((entry) =>
        String(entry || "")
          .trim()
          .toLowerCase()
          .replace(/[_-]+/g, " "),
      )
    : [];
  const isTenantAdminRole = normalizedRoles.includes("tenant admin");
  const isAdminUser =
    isAuthenticated && (hasRole("admin") || hasPermission("view_admin_dashboard") || isTenantAdminRole);

  const tenantsQuery = useQuery<AdminTenantsPayload>({
    queryKey: ["/api/admin/tenants"],
    queryFn: () => apiRequest("/api/admin/tenants", "GET"),
    enabled: isAdminUser,
    staleTime: 20_000,
    retry: false,
  });

  const switchMutation = useMutation({
    mutationFn: async (tenantId: number) => {
      return apiRequest("/api/admin/context/switch", "POST", { tenantId });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] }),
        queryClient.invalidateQueries(),
      ]);
      toast({
        title: "Tenant context switched",
        description: "Admin data has been refreshed for the selected tenant.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to switch tenant",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const payload = tenantsQuery.data;
  const tenantOptions = payload?.tenants || [];
  const canSwitch = Boolean(payload?.canSwitch);
  const activeTenantId = Number(payload?.activeTenantId || payload?.currentTenantId || 0);
  const activeTenant = useMemo(
    () => tenantOptions.find((item) => Number(item.id) === activeTenantId) || payload?.activeTenant || tenantOptions[0] || null,
    [tenantOptions, payload?.activeTenant, activeTenantId],
  );

  if (!isAdminUser || !activeTenant) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3 text-gray-200 hover:text-white hover:bg-white/10"
          disabled={tenantsQuery.isLoading || switchMutation.isPending}
        >
          <Building2 className="h-4 w-4 mr-2" />
          <span>{activeTenant.name}</span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 bg-gray-900 border-gray-700 text-white">
        <DropdownMenuLabel className="text-xs text-gray-400">Active tenant context</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-700" />
        {tenantOptions.map((option) => {
          const isCurrent = Number(option.id) === activeTenantId;
          return (
            <DropdownMenuItem
              key={option.id}
              className={`cursor-pointer ${isCurrent ? "bg-amber-500/10 text-amber-300" : "hover:bg-gray-800"}`}
              disabled={isCurrent || !canSwitch || switchMutation.isPending}
              onClick={() => switchMutation.mutate(Number(option.id))}
            >
              <div className="flex flex-col">
                <span className="text-sm font-semibold">
                  {option.name}
                  {isCurrent ? " (Active)" : ""}
                </span>
                <span className="text-[11px] text-white/60">{option.key}</span>
              </div>
            </DropdownMenuItem>
          );
        })}
        {!canSwitch ? (
          <>
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem className="cursor-default text-[11px] text-gray-400 focus:bg-transparent">
              Your role is tenant-scoped for this workspace.
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
