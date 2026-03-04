import { resolveApiUrl } from "@/lib/runtimeConfig";

export type LocationSource = "gps" | "ip" | "manual";

export type BdoLocation = {
  lat: number;
  lon: number;
  accuracy: number | null;
  ts: number;
  source: LocationSource;
};

export type LocationPermissionState = "granted" | "prompt" | "denied" | "unknown";

export type LocationErrorKind =
  | "insecure_context"
  | "not_supported"
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "unknown";

export type LocationError = {
  kind: LocationErrorKind;
  message: string;
  code?: number;
};

export type LocationResult = {
  location: BdoLocation;
  permission: LocationPermissionState;
  usedFallback: boolean;
  error?: LocationError;
};

export type LocationEvent = { ts: number; name: string; data?: Record<string, unknown> };

const STORAGE_KEY = "bdo_last_location";
const EVENTS_KEY = "bdo_location_events_v1";
const LAST_ERROR_KEY = "bdo_last_location_error_v1";

const DEFAULT_TTL_MS = 30 * 60_000;
const DEFAULT_GPS_TIMEOUT_MS = 8_000;
const DEFAULT_IP_TIMEOUT_MS = 4_000;

let watchId: number | null = null;

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function safeReadStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeWriteJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function pushEvent(name: string, data?: Record<string, unknown>) {
  const evt: LocationEvent = { ts: Date.now(), name, ...(data ? { data } : {}) };
  try {
    const prev = safeJsonParse<LocationEvent[]>(safeReadStorage(EVENTS_KEY)) || [];
    const next = [evt, ...prev].slice(0, 50);
    safeWriteJson(EVENTS_KEY, next);
  } catch {
    // ignore
  }

  // Helpful while debugging mobile-only issues.
  // eslint-disable-next-line no-console
  console.info("[bdo.location]", evt);
}

function setLastError(error: LocationError | null) {
  if (!error) {
    safeWriteStorage(LAST_ERROR_KEY, "");
    return;
  }
  safeWriteJson(LAST_ERROR_KEY, error);
}

export function getLastLocationError(): LocationError | null {
  return safeJsonParse<LocationError>(safeReadStorage(LAST_ERROR_KEY));
}

export function getLocationEvents(): LocationEvent[] {
  return safeJsonParse<LocationEvent[]>(safeReadStorage(EVENTS_KEY)) || [];
}

export function cacheLocation(location: BdoLocation) {
  safeWriteJson(STORAGE_KEY, location);
}

export function getCachedLocation(opts?: { ttlMs?: number; allowStale?: boolean }): BdoLocation | null {
  const ttlMs = typeof opts?.ttlMs === "number" ? opts.ttlMs : DEFAULT_TTL_MS;
  const allowStale = !!opts?.allowStale;

  const cached = safeJsonParse<BdoLocation>(safeReadStorage(STORAGE_KEY));
  if (!cached || !Number.isFinite(cached.lat) || !Number.isFinite(cached.lon) || !Number.isFinite(cached.ts)) {
    return null;
  }

  if (allowStale) return cached;
  if (Date.now() - cached.ts > ttlMs) return null;

  return cached;
}

export async function getPermissionState(): Promise<LocationPermissionState> {
  try {
    if (typeof navigator === "undefined") return "unknown";
    const perms: any = (navigator as any).permissions;
    if (!perms?.query) return "unknown";
    const status = await perms.query({ name: "geolocation" });
    const state = status?.state as PermissionState | undefined;
    if (state === "granted" || state === "denied" || state === "prompt") return state;
    return "unknown";
  } catch {
    return "unknown";
  }
}

function buildError(kind: LocationErrorKind, message: string, code?: number): LocationError {
  return { kind, message, ...(typeof code === "number" ? { code } : {}) };
}

async function getGpsLocation(opts?: { highAccuracy?: boolean; timeoutMs?: number }): Promise<BdoLocation> {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw buildError("insecure_context", "Location requires HTTPS / a secure context.");
  }

  if (!navigator.geolocation) {
    throw buildError("not_supported", "Geolocation is not supported on this device/browser.");
  }

  const timeoutMs = typeof opts?.timeoutMs === "number" ? opts.timeoutMs : DEFAULT_GPS_TIMEOUT_MS;

  return await new Promise<BdoLocation>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const timer = window.setTimeout(() => {
      finish(() => reject(buildError("timeout", "Timed out requesting GPS location.")));
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        finish(() =>
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
            ts: Date.now(),
            source: "gps",
          }),
        );
      },
      (err) => {
        window.clearTimeout(timer);
        finish(() => {
          const code = typeof err?.code === "number" ? err.code : undefined;
          if (code === 1) return reject(buildError("permission_denied", "User denied geolocation permission.", code));
          if (code === 2) return reject(buildError("position_unavailable", "Position unavailable.", code));
          if (code === 3) return reject(buildError("timeout", "Timed out requesting GPS location.", code));
          return reject(buildError("unknown", "Unknown geolocation error.", code));
        });
      },
      {
        enableHighAccuracy: !!opts?.highAccuracy,
        maximumAge: 60_000,
        timeout: timeoutMs,
      },
    );
  });
}

export async function getIpFallbackLocation(opts?: { timeoutMs?: number }): Promise<BdoLocation> {
  const timeoutMs = typeof opts?.timeoutMs === "number" ? opts.timeoutMs : DEFAULT_IP_TIMEOUT_MS;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(resolveApiUrl("/api/geo/ip"), {
      headers: { Accept: "application/json" },
      signal: controller?.signal,
    });

    if (!res.ok) throw new Error(`ip_geo_http_${res.status}`);
    const data = (await res.json()) as any;
    const lat = Number(data?.lat);
    const lon = Number(data?.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("ip_geo_invalid");

    return {
      lat,
      lon,
      accuracy: null,
      ts: Date.now(),
      source: "ip",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function defaultLocation(): BdoLocation {
  return { lat: 5.349, lon: -4.017, accuracy: null, ts: Date.now(), source: "ip" };
}

export async function getLocation(opts?: {
  force?: boolean;
  ttlMs?: number;
  highAccuracy?: boolean;
}): Promise<LocationResult> {
  const force = !!opts?.force;
  const ttlMs = typeof opts?.ttlMs === "number" ? opts.ttlMs : DEFAULT_TTL_MS;

  const cached = getCachedLocation({ ttlMs });
  if (cached && !force) {
    pushEvent("location_success", { source: cached.source, cached: true });
    return { location: cached, permission: await getPermissionState(), usedFallback: false };
  }

  const permission = await getPermissionState();

  if (!force) {
    pushEvent("location_request_started", { mode: "ip_only" });
    try {
      const startedAt = Date.now();
      const ipLoc = await getIpFallbackLocation();
      cacheLocation(ipLoc);
      setLastError(null);
      pushEvent("location_success", { source: "ip", ms: Date.now() - startedAt });
      return { location: ipLoc, permission, usedFallback: false };
    } catch {
      const fallback = cached || defaultLocation();
      cacheLocation(fallback);
      pushEvent("location_failed", { mode: "ip_only" });
      return { location: fallback, permission, usedFallback: true, error: buildError("unknown", "IP fallback failed.") };
    }
  }

  pushEvent("location_request_started", { mode: "gps_then_ip", highAccuracy: !!opts?.highAccuracy });
  const startedAt = Date.now();
  try {
    const gpsLoc = await getGpsLocation({ highAccuracy: !!opts?.highAccuracy });
    cacheLocation(gpsLoc);
    setLastError(null);
    pushEvent("location_success", { source: "gps", ms: Date.now() - startedAt, accuracy: gpsLoc.accuracy ?? null });
    return { location: gpsLoc, permission: await getPermissionState(), usedFallback: false };
  } catch (err: any) {
    const error = (typeof err?.kind === "string" ? (err as LocationError) : null) ?? buildError("unknown", "GPS failed.");
    setLastError(error);
    pushEvent("location_failed", { source: "gps", kind: error.kind, ms: Date.now() - startedAt });

    try {
      const ipLoc = await getIpFallbackLocation({ timeoutMs: DEFAULT_IP_TIMEOUT_MS });
      cacheLocation(ipLoc);
      pushEvent("location_success", { source: "ip", ms: Date.now() - startedAt, usedFallback: true, gpsKind: error.kind });
      return { location: ipLoc, permission: await getPermissionState(), usedFallback: true, error };
    } catch {
      const fallback = cached || defaultLocation();
      cacheLocation(fallback);
      return { location: fallback, permission: await getPermissionState(), usedFallback: true, error };
    }
  }
}

export function stopWatch() {
  if (watchId == null) return;
  try {
    if (navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  } catch {
    // ignore
  } finally {
    watchId = null;
  }
}

export function startWatch(
  onUpdate: (result: LocationResult) => void,
  opts?: { highAccuracy?: boolean },
) {
  stopWatch();

  if (typeof window !== "undefined" && window.isSecureContext === false) {
    const error = buildError("insecure_context", "Location requires HTTPS / a secure context.");
    setLastError(error);
    onUpdate({ location: defaultLocation(), permission: "unknown", usedFallback: true, error });
    return;
  }

  if (!navigator.geolocation) {
    const error = buildError("not_supported", "Geolocation is not supported on this device/browser.");
    setLastError(error);
    onUpdate({ location: defaultLocation(), permission: "unknown", usedFallback: true, error });
    return;
  }

  pushEvent("location_watch_started", { highAccuracy: !!opts?.highAccuracy });

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const loc: BdoLocation = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        ts: Date.now(),
        source: "gps",
      };
      cacheLocation(loc);
      setLastError(null);
      onUpdate({ location: loc, permission: await getPermissionState(), usedFallback: false });
    },
    async (err) => {
      const code = typeof err?.code === "number" ? err.code : undefined;
      const error =
        code === 1
          ? buildError("permission_denied", "User denied geolocation permission.", code)
          : code === 2
            ? buildError("position_unavailable", "Position unavailable.", code)
            : code === 3
              ? buildError("timeout", "Timed out requesting GPS location.", code)
              : buildError("unknown", "Unknown geolocation error.", code);

      setLastError(error);
      const permission = await getPermissionState();
      const fallback = getCachedLocation({ allowStale: true }) || defaultLocation();
      onUpdate({ location: fallback, permission, usedFallback: true, error });
    },
    {
      enableHighAccuracy: !!opts?.highAccuracy,
      maximumAge: 60_000,
      timeout: DEFAULT_GPS_TIMEOUT_MS,
    },
  );
}
