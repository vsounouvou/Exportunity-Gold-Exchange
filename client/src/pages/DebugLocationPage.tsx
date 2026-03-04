import { BrandLockup } from "@pkg/branding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/contexts/LocaleContext";
import {
  cacheLocation,
  getCachedLocation,
  getIpFallbackLocation,
  getLastLocationError,
  getLocation,
  getLocationEvents,
  getPermissionState,
  type LocationEvent,
  type LocationResult,
} from "@/services/location";
import { useEffect, useMemo, useState } from "react";

function formatAge(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

export default function DebugLocationPage() {
  const { t } = useLocale();
  const [permission, setPermission] = useState("unknown");
  const [cached, setCached] = useState(() => getCachedLocation({ allowStale: true }));
  const [lastError, setLastError] = useState(() => getLastLocationError());
  const [events, setEvents] = useState<LocationEvent[]>(() => getLocationEvents());
  const [lastResult, setLastResult] = useState<LocationResult | null>(null);
  const [running, setRunning] = useState<null | "gps" | "ip" | "refresh">(null);

  const env = useMemo(() => {
    const secureContext = typeof window !== "undefined" ? window.isSecureContext : false;
    const protocol = typeof window !== "undefined" ? window.location.protocol : "—";
    const host = typeof window !== "undefined" ? window.location.host : "—";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "—";
    const displayMode =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)")?.matches
        ? "standalone"
        : window.matchMedia?.("(display-mode: minimal-ui)")?.matches
          ? "minimal-ui"
          : "browser");
    return { secureContext, protocol, host, ua, displayMode };
  }, []);

  const refresh = async () => {
    setRunning("refresh");
    try {
      const nextPermission = await getPermissionState();
      setPermission(nextPermission);
      setCached(getCachedLocation({ allowStale: true }));
      setLastError(getLastLocationError());
      setEvents(getLocationEvents());
    } finally {
      setRunning(null);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runGps = async () => {
    setRunning("gps");
    try {
      const result = await getLocation({ force: true });
      setLastResult(result);
    } finally {
      setRunning(null);
      void refresh();
    }
  };

  const runIp = async () => {
    setRunning("ip");
    try {
      const loc = await getIpFallbackLocation();
      cacheLocation(loc);
      setLastResult({ location: loc, permission: await getPermissionState(), usedFallback: false });
    } catch (err: any) {
      setLastResult({
        location: getCachedLocation({ allowStale: true }) || { lat: 0, lon: 0, accuracy: null, ts: Date.now(), source: "ip" },
        permission: await getPermissionState(),
        usedFallback: true,
        error: { kind: "unknown", message: err?.message || "IP fallback failed." },
      });
    } finally {
      setRunning(null);
      void refresh();
    }
  };

  const clearCache = () => {
    try {
      localStorage.removeItem("bdo_last_location");
    } catch {
      // ignore
    }
    void refresh();
  };

  const cachedAge = cached ? Date.now() - cached.ts : null;

  return (
    <div className="min-h-[100dvh] bg-gray-950 text-white pt-safe pb-safe px-4">
      <div className="mx-auto w-full max-w-3xl py-6 space-y-4">
        <div className="flex justify-center">
          <BrandLockup subtitle={t("header.subtitle")} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Location Debug</h1>
          <div className="flex gap-2">
            <Button variant="outline" className="border-white/15 text-white/80 hover:bg-white/10" onClick={clearCache}>
              Clear cache
            </Button>
            <Button variant="outline" className="border-white/15 text-white/80 hover:bg-white/10" onClick={refresh} disabled={running === "refresh"}>
              Refresh
            </Button>
          </div>
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white">Environment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-200 break-words">
            <div>secureContext: {String(env.secureContext)}</div>
            <div>protocol: {env.protocol}</div>
            <div>host: {env.host}</div>
            <div>displayMode: {env.displayMode}</div>
            <div>userAgent: {env.ua}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white">State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-200">
            <div>permission: {permission}</div>
            <div>
              cached:{" "}
              {cached
                ? `${cached.source} — ${cached.lat.toFixed(5)}, ${cached.lon.toFixed(5)} — age ${formatAge(cachedAge ?? 0)}`
                : "—"}
            </div>
            <div>lastError: {lastError ? `${lastError.kind}${lastError.code ? ` (code ${lastError.code})` : ""} — ${lastError.message}` : "—"}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-2">
            <Button className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-black" onClick={runGps} disabled={running != null}>
              Test GPS
            </Button>
            <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-black" onClick={runIp} disabled={running != null}>
              Test IP fallback
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white">Last Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-200 break-words">
            {lastResult ? (
              <>
                <div>source: {lastResult.location.source}</div>
                <div>
                  coords: {lastResult.location.lat.toFixed(6)}, {lastResult.location.lon.toFixed(6)}
                </div>
                <div>accuracy: {lastResult.location.accuracy ?? "—"}</div>
                <div>usedFallback: {String(lastResult.usedFallback)}</div>
                <div>permission: {lastResult.permission}</div>
                <div>
                  error:{" "}
                  {lastResult.error
                    ? `${lastResult.error.kind}${lastResult.error.code ? ` (code ${lastResult.error.code})` : ""} — ${lastResult.error.message}`
                    : "—"}
                </div>
              </>
            ) : (
              <div>—</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white">Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-200">
            {events.length ? (
              <div className="space-y-2">
                {events.slice(0, 50).map((evt) => (
                  <div key={`${evt.ts}-${evt.name}`} className="rounded-lg border border-gray-800 bg-black/30 p-2">
                    <div className="text-[11px] text-gray-400">
                      {new Date(evt.ts).toLocaleString()} — {evt.name}
                    </div>
                    {evt.data ? (
                      <pre className="mt-1 text-[11px] text-gray-200 whitespace-pre-wrap break-words">
                        {JSON.stringify(evt.data, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div>—</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
