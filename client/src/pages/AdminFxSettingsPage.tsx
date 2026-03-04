import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, ArrowRight, RefreshCw, Save, Undo2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type FxPayload = {
  baseRates: Record<string, number>;
  effectiveRates: Record<string, number>;
  overrides: Record<string, number>;
  updatedAt?: string;
  providerTimestamp?: string;
  isStale?: boolean;
  source?: string;
  overrideApplied?: boolean;
};

const OVERRIDABLE_CURRENCIES = ["EUR", "GBP", "XOF", "GHS", "NGN", "KES", "AED"] as const;

function formatRate(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toFixed(2);
  if (Math.abs(n) >= 100) return n.toFixed(3);
  return n.toFixed(4);
}

export default function AdminFxSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const fxQuery = useQuery<FxPayload>({
    queryKey: ["/api/admin/settings/fx"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const overrides = fxQuery.data?.overrides || {};
    const next: Record<string, string> = {};
    for (const code of OVERRIDABLE_CURRENCIES) {
      const value = Number(overrides?.[code]);
      next[code] = Number.isFinite(value) && value > 0 ? String(value) : "";
    }
    setDraft(next);
  }, [fxQuery.data?.updatedAt]);

  const normalizedOverrides = useMemo(() => {
    const out: Record<string, number> = {};
    for (const code of OVERRIDABLE_CURRENCIES) {
      const value = Number(draft[code]);
      if (Number.isFinite(value) && value > 0) out[code] = value;
    }
    return out;
  }, [draft]);

  const hasPendingChanges = useMemo(() => {
    const current = fxQuery.data?.overrides || {};
    const keys = new Set([...Object.keys(current), ...Object.keys(normalizedOverrides)]);
    for (const key of keys) {
      const left = Number(current[key] ?? NaN);
      const right = Number(normalizedOverrides[key] ?? NaN);
      if (Number.isFinite(left) !== Number.isFinite(right)) return true;
      if (Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) > 0.0000001) return true;
    }
    return false;
  }, [fxQuery.data?.overrides, normalizedOverrides]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/settings/fx", {
        method: "PUT",
        body: JSON.stringify({ overrides: normalizedOverrides }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/fx"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/marketplace/fx-rates"] }),
      ]);
      toast({ title: "FX overrides saved" });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to save FX overrides",
        description: error?.message || "Validation failed",
        variant: "destructive",
      });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/settings/fx/refresh", { method: "POST" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/fx"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/marketplace/fx-rates"] }),
      ]);
      toast({ title: "FX provider data refreshed" });
    },
    onError: (error: any) => {
      toast({
        title: "Refresh failed",
        description: error?.message || "Provider request failed",
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/settings/fx", { method: "PUT", body: JSON.stringify({ overrides: {} }) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/fx"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/marketplace/fx-rates"] }),
      ]);
      toast({ title: "FX overrides cleared" });
    },
    onError: (error: any) => {
      toast({
        title: "Reset failed",
        description: error?.message || "Unable to clear overrides",
        variant: "destructive",
      });
    },
  });

  const fx = fxQuery.data;
  const busy = saveMutation.isPending || refreshMutation.isPending || resetMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">FX Settings</h1>
          <p className="text-sm text-white/60">Tenant-scoped exchange rate controls for buyer prices and gold conversion.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-white/15" disabled={busy} onClick={() => refreshMutation.mutate()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Provider
          </Button>
          <Button variant="outline" className="border-white/15" disabled={busy} onClick={() => resetMutation.mutate()}>
            <Undo2 className="h-4 w-4 mr-2" />
            Clear Overrides
          </Button>
          <Button className="bg-amber-500 text-black hover:bg-amber-600" disabled={!hasPendingChanges || busy} onClick={() => saveMutation.mutate()}>
            <Save className="h-4 w-4 mr-2" />
            Save Overrides
          </Button>
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Provider Health</CardTitle>
          <CardDescription>Effective rates = provider base merged with tenant overrides.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={fx?.isStale ? "border-red-500/50 text-red-300" : "border-green-500/50 text-green-300"}>
              {fx?.isStale ? "Stale" : "Fresh"}
            </Badge>
            <Badge variant="outline" className="border-white/20 text-white/80">
              Source: {fx?.source || "unknown"}
            </Badge>
            <Badge variant="outline" className={fx?.overrideApplied ? "border-amber-500/50 text-amber-300" : "border-white/20 text-white/70"}>
              {fx?.overrideApplied ? "Override active" : "No override"}
            </Badge>
          </div>
          <div className="text-white/70">Updated: {fx?.updatedAt ? new Date(fx.updatedAt).toLocaleString() : "—"}</div>
          <div className="text-white/70">Provider timestamp: {fx?.providerTimestamp ? new Date(fx.providerTimestamp).toLocaleString() : "—"}</div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Rates Table</CardTitle>
          <CardDescription>Set optional overrides. Leave empty to use provider base rate.</CardDescription>
        </CardHeader>
        <CardContent>
          {fxQuery.isLoading ? (
            <div className="text-sm text-white/60">Loading FX settings...</div>
          ) : fxQuery.isError ? (
            <div className="flex items-center gap-2 text-sm text-red-300">
              <AlertCircle className="h-4 w-4" />
              Failed to load FX settings
            </div>
          ) : (
            <div className="space-y-3">
              {OVERRIDABLE_CURRENCIES.map((code) => {
                const base = Number(fx?.baseRates?.[code]);
                const effective = Number(fx?.effectiveRates?.[code]);
                const override = draft[code] ?? "";
                return (
                  <div key={code} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-800 bg-gray-950 p-3 md:grid-cols-[120px_1fr_1fr_1fr] md:items-center">
                    <div className="text-white font-medium">{code}</div>
                    <div className="text-sm text-white/70">Base: {formatRate(base)}</div>
                    <div className="text-sm text-white/90">Effective: {formatRate(effective)}</div>
                    <input
                      value={override}
                      onChange={(event) => setDraft((prev) => ({ ...prev, [code]: event.target.value }))}
                      className="h-9 rounded-md border border-white/15 bg-black/30 px-2 text-sm text-white outline-none focus:border-amber-500/70"
                      placeholder="Override rate"
                      inputMode="decimal"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Link href="/admin">
          <Button variant="outline" className="border-white/15">
            Back to Admin Dashboard
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
