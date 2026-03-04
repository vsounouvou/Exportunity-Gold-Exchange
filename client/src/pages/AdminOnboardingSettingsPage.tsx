import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";

type SettingsResponse = { settings: Record<string, any> };
type OnboardingConfigResponse = { config: any };

const SETTINGS_KEY = "ece.onboarding.v1";

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function tryParseJson(value: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid JSON" };
  }
}

export default function AdminOnboardingSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant, loading: tenantLoading, error: tenantError } = useTenant();

  const scope = useMemo(() => `tenant:${tenant.key}`, [tenant.key]);
  const settingsUrl = useMemo(
    () => `/api/admin/settings?scope=${encodeURIComponent(scope)}&prefix=${encodeURIComponent("ece.onboarding")}`,
    [scope],
  );
  const effectiveConfigUrl = "/api/ece/onboarding/config";
  const defaultConfigUrl = "/api/ece/onboarding/config?defaults=1";

  const { data: settingsResp, isLoading: settingsLoading, error: settingsError } = useQuery<SettingsResponse>({
    queryKey: [settingsUrl],
    enabled: !tenantLoading && !tenantError,
    queryFn: () => apiRequest(settingsUrl, { method: "GET" }),
  });

  const { data: effectiveResp, isLoading: effectiveLoading, error: effectiveError } = useQuery<OnboardingConfigResponse>({
    queryKey: [effectiveConfigUrl],
    enabled: !tenantLoading && !tenantError,
    queryFn: () => apiRequest(effectiveConfigUrl, { method: "GET" }),
  });

  const { data: defaultResp } = useQuery<OnboardingConfigResponse>({
    queryKey: [defaultConfigUrl],
    enabled: !tenantLoading && !tenantError,
    queryFn: () => apiRequest(defaultConfigUrl, { method: "GET" }),
    staleTime: 60_000,
  });

  const existingOverride = settingsResp?.settings?.[SETTINGS_KEY];
  const effectiveConfig = effectiveResp?.config;
  const defaultConfig = defaultResp?.config;

  const [draft, setDraft] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    const base = existingOverride ?? effectiveConfig ?? defaultConfig;
    if (!base) return;
    setDraft(safeStringify(base));
    initializedRef.current = true;
  }, [defaultConfig, effectiveConfig, existingOverride]);

  const saveMutation = useMutation({
    mutationFn: async (nextValue: any) => {
      return apiRequest("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({
          scope,
          key: SETTINGS_KEY,
          value: nextValue,
        }),
      });
    },
    onSuccess: async () => {
      toast({ title: "Saved", description: "Onboarding settings updated." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [settingsUrl] }),
        queryClient.invalidateQueries({ queryKey: [effectiveConfigUrl] }),
      ]);
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Unable to update onboarding settings.",
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({
          scope,
          key: SETTINGS_KEY,
          value: {},
        }),
      });
    },
    onSuccess: async () => {
      toast({ title: "Reset", description: "Override cleared; defaults will apply." });
      setParseError(null);
      initializedRef.current = false;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [settingsUrl] }),
        queryClient.invalidateQueries({ queryKey: [effectiveConfigUrl] }),
        queryClient.invalidateQueries({ queryKey: [defaultConfigUrl] }),
      ]);
    },
    onError: (err: any) => {
      toast({
        title: "Reset failed",
        description: err?.message || "Unable to reset onboarding settings.",
        variant: "destructive",
      });
    },
  });

  const onSave = () => {
    const parsed = tryParseJson(draft);
    if (!parsed.ok) {
      setParseError(parsed.error);
      toast({ title: "Invalid JSON", description: parsed.error, variant: "destructive" });
      return;
    }
    setParseError(null);
    saveMutation.mutate(parsed.value);
  };

  const previewRooms = useMemo(() => {
    const parsed = tryParseJson(draft);
    if (!parsed.ok) return [];
    const rooms = parsed.value?.rooms && typeof parsed.value.rooms === "object" ? parsed.value.rooms : {};
    const keys = ["support", "sales", "production", "delivery"];
    return keys
      .map((key) => ({ key, value: rooms?.[key] }))
      .filter((entry) => entry.value && Array.isArray(entry.value.introMessages));
  }, [draft]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Admin &gt; Marketplace &gt; Onboarding &amp; PWA</h1>
        <p className="text-sm text-gray-400">
          Tenant-scoped chat onboarding copy (welcome + role rooms) and PWA install messaging. Stored in{" "}
          <span className="text-white/80">{SETTINGS_KEY}</span>.
        </p>
      </div>

      {(tenantError || settingsError || effectiveError) && (
        <div className="text-sm text-red-200 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
          {tenantError ? String(tenantError) : (settingsError as any)?.message || (effectiveError as any)?.message || "Failed to load."}
        </div>
      )}

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between gap-3">
            <span>Configuration</span>
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30">{tenant.key.toUpperCase()}</Badge>
              <Badge
                className={cn(
                  existingOverride
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "bg-slate-500/15 text-slate-200 border border-slate-500/30",
                )}
              >
                {existingOverride ? "Override" : "Default"}
              </Badge>
            </div>
          </CardTitle>
          <CardDescription className="text-gray-400">
            Edit JSON and save to apply immediately. Keep the user-facing text exactly as desired.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-amber-500 text-black hover:bg-amber-400"
              onClick={onSave}
              disabled={tenantLoading || settingsLoading || effectiveLoading || saveMutation.isPending || resetMutation.isPending}
            >
              Save
            </Button>
            <Button
              variant="secondary"
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
              onClick={() => setDraft(safeStringify(defaultConfig ?? effectiveConfig ?? {}))}
              disabled={tenantLoading || settingsLoading || effectiveLoading || saveMutation.isPending || resetMutation.isPending}
            >
              Load defaults
            </Button>
            <Button
              variant="destructive"
              className="bg-red-600 hover:bg-red-500"
              onClick={() => resetMutation.mutate()}
              disabled={tenantLoading || settingsLoading || effectiveLoading || saveMutation.isPending || resetMutation.isPending}
            >
              Clear override
            </Button>
          </div>

          <div className="text-[11px] text-gray-500">
            Scope: <span className="text-gray-300">{scope}</span>
          </div>

          <Textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (parseError) setParseError(null);
            }}
            className={cn(
              "min-h-[420px] font-mono text-xs bg-black/40 border-white/10 text-white",
              parseError ? "border-red-500/40" : "",
            )}
            placeholder={'{\n  "version": 1,\n  "enabled": true,\n  ...\n}'}
          />

          {parseError ? <div className="text-xs text-red-300">JSON error: {parseError}</div> : null}
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Preview</CardTitle>
          <CardDescription className="text-gray-400">
            Quick visual check of seeded messages. Actual rendering uses the same chat bubble style as the inbox rooms.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {previewRooms.length === 0 ? (
            <div className="text-sm text-white/60">Nothing to preview (invalid JSON or missing rooms).</div>
          ) : (
            previewRooms.map(({ key, value }) => (
              <div key={key} className="space-y-2">
                <div className="text-xs text-white/70 uppercase tracking-wide">{key}</div>
                <div className="space-y-2">
                  {(value.introMessages as any[]).slice(0, 3).map((msg, idx) => (
                    <div key={idx} className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap border bg-white/5 border-white/10 text-white/90">
                        {String(msg?.content || "")}
                        {Array.isArray(msg?.quickReplies) && msg.quickReplies.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {msg.quickReplies.slice(0, 6).map((qr: string) => (
                              <span
                                key={qr}
                                className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80"
                              >
                                {qr}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
