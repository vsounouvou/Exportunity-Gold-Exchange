type DeviceClass = "mobile" | "tablet" | "desktop" | "unknown";

export type TelemetryEvent = {
  type: string;
  ts: number;
  path: string;
  canonicalUrl?: string | null;
  referrer?: string | null;
  lastRoute?: string | null;
  session: { id: string; startedAt?: number };
  anonId: string;
  userId?: string | number | null;
  locale?: string | null;
  deviceClass?: DeviceClass | null;
  territoryId?: number | null;
  botHints?: { webdriver?: boolean; userAgent?: string } | null;
  payload?: Record<string, unknown> | null;
};

type TelemetryContext = {
  territoryId?: number | null;
};

type TelemetryOptions = {
  enabled?: boolean;
  flushIntervalMs?: number;
  maxBatchSize?: number;
};

const DEFAULTS: Required<TelemetryOptions> = {
  enabled: true,
  flushIntervalMs: 6_000,
  maxBatchSize: 50,
};

function normalizePath(path: string) {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function getCanonicalUrl() {
  try {
    const tag = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (tag?.href) return tag.href;
  } catch {
    // ignore
  }
  return `${window.location.origin}${window.location.pathname}`;
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID() as string;
  }
  return `id_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function getOrCreateAnonId() {
  const key = "platform_anon_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = randomId();
  localStorage.setItem(key, id);
  return id;
}

function getStoredUserId(): number | null {
  try {
    const raw = localStorage.getItem("ece_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    const id = Number(parsed?.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    return Math.trunc(id);
  } catch {
    return null;
  }
}

function classifyDevice(): DeviceClass {
  const ua = String(navigator.userAgent || "").toLowerCase();
  if (!ua) return "unknown";
  if (/ipad|tablet|kindle|silk/.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod/.test(ua)) return "mobile";
  return "desktop";
}

function isInteractiveElement(el: Element) {
  const tag = el.tagName.toLowerCase();
  if (["button", "a", "input", "textarea", "select", "option", "label"].includes(tag)) return true;
  const role = (el.getAttribute("role") || "").toLowerCase();
  if (role === "button" || role === "link") return true;
  if ((el as any).onclick) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function selectorHint(el: Element) {
  const parts: string[] = [];
  let node: Element | null = el;
  for (let depth = 0; node && depth < 4; depth += 1) {
    const tag = node.tagName.toLowerCase();
    const stable =
      node.getAttribute("data-telemetry-id") ||
      node.getAttribute("data-testid") ||
      node.getAttribute("id") ||
      "";
    let part = tag;
    if (stable) {
      part += `#${stable}`;
    } else {
      const cls = (node.getAttribute("class") || "")
        .split(/\s+/g)
        .filter(Boolean)
        .slice(0, 2)
        .join(".");
      if (cls) part += `.${cls}`;
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(">");
}

function fnv1a32Hex(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

class TelemetryClient {
  private enabled: boolean;
  private flushIntervalMs: number;
  private maxBatchSize: number;

  private queue: TelemetryEvent[] = [];
  private flushTimer: number | null = null;
  private lastRoute: string | null = null;
  private context: TelemetryContext = {};

  private scrollMarks = new Set<number>();
  private perf = {
    cls: 0,
    lcp: 0,
    inp: 0,
    ttfb: 0,
  };

  private clickHistory = new Map<string, number[]>();
  private rageLastSent = new Map<string, number>();

  constructor(opts: TelemetryOptions) {
    const merged = { ...DEFAULTS, ...opts };
    this.enabled = merged.enabled;
    this.flushIntervalMs = merged.flushIntervalMs;
    this.maxBatchSize = merged.maxBatchSize;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setContext(partial: TelemetryContext) {
    this.context = { ...this.context, ...partial };
  }

  private getSession() {
    const sessionIdKey = "platform_session_id";
    const startedAtKey = "platform_session_started_at";
    const lastSeenKey = "platform_session_last_seen_at";
    const timeoutMs = 30 * 60_000;

    const now = Date.now();
    const existingId = sessionStorage.getItem(sessionIdKey);
    const startedAt = Number(sessionStorage.getItem(startedAtKey) || "0");
    const lastSeen = Number(sessionStorage.getItem(lastSeenKey) || "0");

    const expired = !existingId || !Number.isFinite(lastSeen) || now - lastSeen > timeoutMs;
    const sessionId = expired ? randomId() : existingId;
    const started = expired ? now : Number.isFinite(startedAt) && startedAt > 0 ? startedAt : now;

    sessionStorage.setItem(sessionIdKey, sessionId);
    sessionStorage.setItem(startedAtKey, String(started));
    sessionStorage.setItem(lastSeenKey, String(now));

    return { id: sessionId, startedAt: started };
  }

  track(type: string, payload?: Record<string, unknown>) {
    if (!this.enabled) return;
    try {
      const ts = Date.now();
      const path = normalizePath(window.location.pathname + window.location.search);
      const anonId = getOrCreateAnonId();
      const session = this.getSession();
      const userId = getStoredUserId();
      const canonicalUrl = getCanonicalUrl();
      const deviceClass = classifyDevice();
      const locale = navigator.language || null;

      const event: TelemetryEvent = {
        type,
        ts,
        path,
        canonicalUrl,
        referrer: document.referrer || null,
        lastRoute: this.lastRoute,
        session,
        anonId,
        userId: userId ?? null,
        locale,
        deviceClass,
        territoryId: this.context.territoryId ?? null,
        botHints: { webdriver: Boolean((navigator as any).webdriver), userAgent: navigator.userAgent },
        payload: payload ?? null,
      };

      this.queue.push(event);
      this.scheduleFlush();
    } catch {
      // non-blocking
    }
  }

  pageView(nextPath: string) {
    const normalized = normalizePath(nextPath);
    const prev = this.lastRoute;
    this.lastRoute = normalized;
    this.scrollMarks.clear();
    this.track("page_view", { from: prev });
    this.capturePerfVitalsSoon();
  }

  flush(opts?: { reason?: string; useBeacon?: boolean }) {
    if (!this.enabled) return;
    if (!this.queue.length) return;

    const events = this.queue.splice(0, this.maxBatchSize);
    const body = JSON.stringify({ events, meta: { reason: opts?.reason || "flush" } });

    if (opts?.useBeacon && "sendBeacon" in navigator) {
      try {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/telemetry/events", blob);
        return;
      } catch {
        // fallback to fetch
      }
    }

    fetch("/api/telemetry/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "include",
      keepalive: true,
    }).catch(() => {
      // best-effort: re-queue (cap to avoid unbounded growth)
      this.queue.unshift(...events);
      this.queue = this.queue.slice(0, 500);
    });
  }

  private scheduleFlush() {
    if (this.flushTimer != null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flush({ reason: "interval" });
    }, this.flushIntervalMs);
  }

  installAutoCapture() {
    if (!this.enabled) return;

    window.addEventListener(
      "pagehide",
      () => {
        this.flush({ reason: "pagehide", useBeacon: true });
      },
      { capture: true },
    );

    window.addEventListener(
      "error",
      (event) => {
        const message = (event as ErrorEvent).message || "error";
        const filename = (event as ErrorEvent).filename || "";
        this.track("js_error", { message, filename });
      },
      { capture: true },
    );

    window.addEventListener(
      "unhandledrejection",
      (event) => {
        const reason = (event as PromiseRejectionEvent).reason;
        const message = reason instanceof Error ? reason.message : String(reason || "unhandledrejection");
        this.track("js_error", { message, kind: "unhandledrejection" });
      },
      { capture: true },
    );

    const onScroll = () => {
      const el = document.scrollingElement || document.documentElement;
      const max = Math.max(1, el.scrollHeight - el.clientHeight);
      const pct = Math.round((el.scrollTop / max) * 100);
      const marks = [25, 50, 75, 100];
      for (const m of marks) {
        if (pct >= m && !this.scrollMarks.has(m)) {
          this.scrollMarks.add(m);
          this.track("scroll_depth", { percent: m });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    document.addEventListener(
      "click",
      (e) => {
        const target = e.target as Element | null;
        if (!target || !(target instanceof Element)) return;

        const hint = selectorHint(target);
        const selectorHash = fnv1a32Hex(hint);
        const tag = target.tagName.toLowerCase();
        const role = (target.getAttribute("role") || "").toLowerCase() || null;

        this.track("click", { selectorHash, tag, role });

        // Rage click: 4+ clicks on same element within 1s.
        const now = Date.now();
        const prev = this.clickHistory.get(selectorHash) || [];
        const next = [...prev.filter((t) => now - t < 1000), now];
        this.clickHistory.set(selectorHash, next);

        if (next.length >= 4) {
          const lastSent = this.rageLastSent.get(selectorHash) || 0;
          if (now - lastSent > 10_000) {
            this.rageLastSent.set(selectorHash, now);
            this.track("rage_click", { selectorHash, count: next.length });
          }
        }

        // Dead click: cursor pointer but no navigation.
        try {
          if (isInteractiveElement(target)) return;
          const style = window.getComputedStyle(target as Element);
          if (style.cursor !== "pointer") return;
          const before = window.location.pathname + window.location.search;
          window.setTimeout(() => {
            const after = window.location.pathname + window.location.search;
            if (after === before) {
              this.track("dead_click", { selectorHash, tag, role });
            }
          }, 650);
        } catch {
          // ignore
        }
      },
      { capture: true },
    );

    this.installFetchTelemetry();
    this.installPerfObservers();
  }

  private installFetchTelemetry() {
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const isTelemetry = url.includes("/api/telemetry/events");
      try {
        const res = await original(input as any, init);
        if (!isTelemetry && url.includes("/api/") && !res.ok) {
          this.track("api_error", { url: url.slice(0, 512), status: res.status });
        }
        return res;
      } catch (err) {
        if (!isTelemetry && url.includes("/api/")) {
          this.track("api_error", { url: url.slice(0, 512), message: err instanceof Error ? err.message : String(err) });
        }
        throw err;
      }
    };
  }

  private installPerfObservers() {
    // TTFB (navigation timing)
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav) {
        const ttfb = Math.max(0, nav.responseStart - nav.startTime);
        this.perf.ttfb = Math.round(ttfb);
      }
    } catch {
      // ignore
    }

    // CLS
    try {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (entry && entry.entryType === "layout-shift" && !entry.hadRecentInput) {
            this.perf.cls += Number(entry.value || 0);
          }
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true } as any);
    } catch {
      // ignore
    }

    // LCP
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as any[];
        const last = entries[entries.length - 1];
        if (last && typeof last.startTime === "number") {
          this.perf.lcp = Math.max(this.perf.lcp, Math.round(last.startTime));
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true } as any);
    } catch {
      // ignore
    }

    // INP (approx via longest event duration)
    try {
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          const duration = typeof entry.duration === "number" ? entry.duration : 0;
          this.perf.inp = Math.max(this.perf.inp, Math.round(duration));
        }
      });
      inpObserver.observe({ type: "event", buffered: true, durationThreshold: 40 } as any);
    } catch {
      // ignore
    }
  }

  private capturePerfVitalsSoon() {
    try {
      window.setTimeout(() => {
        const payload = {
          cls: Number(this.perf.cls.toFixed(4)),
          lcp: this.perf.lcp,
          inp: this.perf.inp,
          ttfb: this.perf.ttfb,
        };
        this.track("perf_vitals", payload);
      }, 4_000);
    } catch {
      // ignore
    }
  }
}

let singleton: TelemetryClient | null = null;

export function initTelemetry(opts?: TelemetryOptions) {
  if (singleton) return singleton;
  singleton = new TelemetryClient(opts || {});
  singleton.installAutoCapture();
  return singleton;
}

export function telemetry() {
  if (!singleton) singleton = new TelemetryClient({});
  return singleton;
}

