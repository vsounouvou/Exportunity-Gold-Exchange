import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import { RefreshCw } from "lucide-react";

type SettingsResponse = {
  settings: Record<string, any>;
};

function parseEnabledFlag(value: any): boolean | null {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && typeof value.enabled === "boolean") return value.enabled;
  return null;
}

export default function AdminMapSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant, loading: tenantLoading, error: tenantError } = useTenant();

  const scope = useMemo(() => `tenant:${tenant.key}`, [tenant.key]);
  const settingsUrl = useMemo(
    () => `/api/admin/settings?scope=${encodeURIComponent(scope)}&prefix=FEATURE_MAP_SHOW_JEWELERS`,
    [scope],
  );

  const { data, isLoading, error, refetch, isFetching } = useQuery<SettingsResponse>({
    queryKey: [settingsUrl],
    enabled: !tenantLoading && !tenantError,
    queryFn: () => apiRequest(settingsUrl, { method: "GET" }),
  });

  const rawSetting = data?.settings?.FEATURE_MAP_SHOW_JEWELERS;
  const overrideEnabled = parseEnabledFlag(rawSetting);
  const effectiveEnabled = overrideEnabled ?? true;

  const saveMutation = useMutation({
    mutationFn: async (nextEnabled: boolean) => {
      return apiRequest("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({
          scope,
          key: "FEATURE_MAP_SHOW_JEWELERS",
          value: nextEnabled,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Map settings updated." });
      queryClient.invalidateQueries({ queryKey: [settingsUrl] });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Unable to update map settings.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Admin &gt; Marketplace &gt; Map Settings</h1>
        <p className="text-sm text-gray-400">
          Feature flags that affect map pins. These settings are tenant-scoped and override server defaults.
        </p>
      </div>

      {(tenantError || error) && (
        <div className="text-sm text-red-200 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
          {tenantError ? String(tenantError) : (error as any)?.message || "Failed to load settings."}
        </div>
      )}

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between gap-3">
            <span>Seller pins</span>
            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {tenant.key.toUpperCase()}
            </Badge>
          </CardTitle>
          <CardDescription className="text-gray-400">
            Controls whether jewelers can appear as map pins. Catalog listings remain available regardless.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1">
              <div className="text-sm font-medium text-white">Show jewelers on map</div>
              <div className="text-xs text-gray-500">
                Emergency switch to hide jeweler pins during staged rollout. Default behavior is ON unless overridden.
              </div>
              <div className="text-[11px] text-gray-600">Scope: {scope}</div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                className={
                  effectiveEnabled
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "bg-slate-500/15 text-slate-200 border border-slate-500/30"
                }
              >
                {effectiveEnabled ? "ON" : "OFF"}
              </Badge>
              <Switch
                checked={effectiveEnabled}
                onCheckedChange={(checked) => saveMutation.mutate(!!checked)}
                disabled={tenantLoading || isLoading || saveMutation.isPending}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>Override:</span>
            <Badge variant="outline" className="border-white/10 text-white/80">
              {overrideEnabled === null ? "none" : overrideEnabled ? "true" : "false"}
            </Badge>
            <span>Effective:</span>
            <Badge variant="outline" className="border-white/10 text-white/80">
              {effectiveEnabled ? "true" : "false"}
            </Badge>
          </div>

          <div>
            <Button
              variant="secondary"
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
              onClick={() => refetch()}
              disabled={tenantLoading || isLoading || isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

