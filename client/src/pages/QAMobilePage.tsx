import { BrandLockup } from "@pkg/branding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/contexts/LocaleContext";
import { useSession } from "@/lib/session";
import { getCachedLocation, getLastLocationError, getPermissionState } from "@/services/location";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Circle, ClipboardCopy, ExternalLink, XCircle } from "lucide-react";

type GatePageKey =
  | "browse"
  | "map"
  | "product"
  | "wallet"
  | "vault"
  | "orders"
  | "contracts"
  | "login"
  | "register"
  | "admin";

type PageGateChecks = {
  exitClear: boolean;
  thumbPrimary: boolean;
  noOverlap: boolean;
  noDeadEnds: boolean;
};

type ScoreKey =
  | "nav_where_am_i"
  | "nav_exit_clear"
  | "nav_no_dead_ends"
  | "nav_consistency"
  | "thumb_primary"
  | "thumb_secondary"
  | "thumb_non_obstructive"
  | "info_quantity_first"
  | "info_proximity_clear"
  | "info_mode_clarity"
  | "visual_unique_images"
  | "visual_premium"
  | "trust_wallet_clarity"
  | "trust_vault_clarity"
  | "trust_contracts_clarity"
  | "auth_optional_feel"
  | "auth_exit_always";

type GateState = {
  version: 1;
  pages: Record<GatePageKey, PageGateChecks>;
  scores: Partial<Record<ScoreKey, number>>;
  notes: Partial<Record<GatePageKey | "global", string>>;
  updatedAt: string;
};

const GATE_STORAGE_KEY = "bdo_ux_acceptance_gate_v1";

const DEFAULT_PAGE_CHECKS: PageGateChecks = {
  exitClear: false,
  thumbPrimary: false,
  noOverlap: false,
  noDeadEnds: false,
};

const DEFAULT_GATE_STATE: GateState = {
  version: 1,
  pages: {
    browse: { ...DEFAULT_PAGE_CHECKS },
    map: { ...DEFAULT_PAGE_CHECKS },
    product: { ...DEFAULT_PAGE_CHECKS },
    wallet: { ...DEFAULT_PAGE_CHECKS },
    vault: { ...DEFAULT_PAGE_CHECKS },
    orders: { ...DEFAULT_PAGE_CHECKS },
    contracts: { ...DEFAULT_PAGE_CHECKS },
    login: { ...DEFAULT_PAGE_CHECKS },
    register: { ...DEFAULT_PAGE_CHECKS },
    admin: { ...DEFAULT_PAGE_CHECKS },
  },
  scores: {},
  notes: {},
  updatedAt: new Date().toISOString(),
};

function clampScore(value: number) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  return Math.max(1, Math.min(5, Math.round(v)));
}

function loadGateState(): GateState {
  try {
    const raw = localStorage.getItem(GATE_STORAGE_KEY);
    if (!raw) return DEFAULT_GATE_STATE;
    const parsed = JSON.parse(raw) as Partial<GateState>;
    if (!parsed || parsed.version !== 1) return DEFAULT_GATE_STATE;
    return {
      ...DEFAULT_GATE_STATE,
      ...parsed,
      pages: { ...DEFAULT_GATE_STATE.pages, ...(parsed.pages || {}) },
      scores: { ...(parsed.scores || {}) },
      notes: { ...(parsed.notes || {}) },
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : DEFAULT_GATE_STATE.updatedAt,
    };
  } catch {
    return DEFAULT_GATE_STATE;
  }
}

function saveGateState(next: GateState) {
  try {
    localStorage.setItem(GATE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readSafeAreaInsets(): SafeAreaInsets {
  if (typeof document === "undefined") return { top: 0, right: 0, bottom: 0, left: 0 };

  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.inset = "0";
  el.style.pointerEvents = "none";
  el.style.paddingTop = "env(safe-area-inset-top)";
  el.style.paddingRight = "env(safe-area-inset-right)";
  el.style.paddingBottom = "env(safe-area-inset-bottom)";
  el.style.paddingLeft = "env(safe-area-inset-left)";

  document.body.appendChild(el);
  const style = getComputedStyle(el);
  const insets = {
    top: parsePx(style.paddingTop),
    right: parsePx(style.paddingRight),
    bottom: parsePx(style.paddingBottom),
    left: parsePx(style.paddingLeft),
  };
  document.body.removeChild(el);
  return insets;
}

export default function QAMobilePage() {
  const session = useSession();
  const { t } = useLocale();
  const [, navigate] = useLocation();

  const [complianceAccepted, setComplianceAccepted] = useState(false);
  const [locationState, setLocationState] = useState<{
    permission: string;
    cached: ReturnType<typeof getCachedLocation> | null;
    cachedAgeMs: number | null;
    lastError: ReturnType<typeof getLastLocationError> | null;
  }>(() => ({
    permission: "unknown",
    cached: getCachedLocation({ allowStale: true }),
    cachedAgeMs: null,
    lastError: getLastLocationError(),
  }));
  const [safeArea, setSafeArea] = useState<SafeAreaInsets>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [viewport, setViewport] = useState(() => ({
    innerWidth: typeof window !== "undefined" ? window.innerWidth : 0,
    innerHeight: typeof window !== "undefined" ? window.innerHeight : 0,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    vvWidth: typeof window !== "undefined" ? window.visualViewport?.width ?? null : null,
    vvHeight: typeof window !== "undefined" ? window.visualViewport?.height ?? null : null,
    vvOffsetTop: typeof window !== "undefined" ? window.visualViewport?.offsetTop ?? null : null,
  }));
  const [sw, setSw] = useState<{
    controllerUrl: string | null;
    registrations: string[];
    caches: string[];
    displayMode: string;
    bundleScripts: string[];
    swVersion: string | null;
  }>({ controllerUrl: null, registrations: [], caches: [], displayMode: "browser", bundleScripts: [], swVersion: null });

  const roles = useMemo(() => ["admin", "seller", "delivery", "compliance", "confirmedClient"], []);
  const [gate, setGate] = useState<GateState>(() => loadGateState());

  useEffect(() => {
    saveGateState({ ...gate, updatedAt: new Date().toISOString() });
  }, [gate]);

  useEffect(() => {
    try {
      setComplianceAccepted(localStorage.getItem("bdo_concierge_compliance_accepted_v1") === "1");
    } catch {
      setComplianceAccepted(false);
    }
  }, []);

  useEffect(() => {
    const refresh = async () => {
      const permission = await getPermissionState();
      const cached = getCachedLocation({ allowStale: true });
      const lastError = getLastLocationError();
      const cachedAgeMs = cached ? Date.now() - cached.ts : null;
      setLocationState({ permission, cached, cachedAgeMs, lastError });
    };

    refresh().catch(() => {
      setLocationState((prev) => ({ ...prev, permission: "unknown" }));
    });
  }, []);

  useEffect(() => {
    setSafeArea(readSafeAreaInsets());

    const updateViewport = () => {
      setViewport({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        dpr: window.devicePixelRatio,
        vvWidth: window.visualViewport?.width ?? null,
        vvHeight: window.visualViewport?.height ?? null,
        vvOffsetTop: window.visualViewport?.offsetTop ?? null,
      });
      setSafeArea(readSafeAreaInsets());
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, []);

  useEffect(() => {
    const displayMode =
      window.matchMedia?.("(display-mode: standalone)")?.matches
        ? "standalone"
        : window.matchMedia?.("(display-mode: minimal-ui)")?.matches
          ? "minimal-ui"
          : "browser";

    const load = async () => {
      const controllerUrl = navigator.serviceWorker?.controller?.scriptURL || null;
      const registrations = navigator.serviceWorker?.getRegistrations
        ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "")
        : [];
      const cachesList = "caches" in window ? await caches.keys() : [];
      const bundleScripts = Array.from(document.querySelectorAll("script[src]"))
        .map((el) => (el as HTMLScriptElement).src)
        .filter(Boolean);

      let swVersion: string | null = null;
      try {
        const text = await fetch("/sw.js", { cache: "no-store" }).then((r) => r.text());
        const match = text.match(/const\\s+VERSION\\s*=\\s*\"([^\"]+)\"/);
        swVersion = match?.[1] || null;
      } catch {
        swVersion = null;
      }

      setSw({
        controllerUrl,
        registrations: registrations.filter(Boolean),
        caches: cachesList,
        displayMode,
        bundleScripts,
        swVersion,
      });
    };

    load().catch(() => {
      setSw((prev) => ({ ...prev, displayMode }));
    });
  }, []);

  const resetPwaCache = async () => {
    try {
      if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // ignore
      }
    } finally {
      window.location.assign("/reset.html");
    }
  };

  const conciergeState = complianceAccepted ? "active" : "compliance_gate";

  const scoreItems: Array<{ key: ScoreKey; label: string; group: string }> = [
    { key: "nav_where_am_i", label: "User always knows where they are", group: "Navigation" },
    { key: "nav_exit_clear", label: "Exit is always obvious", group: "Navigation" },
    { key: "nav_no_dead_ends", label: "No dead-end pages", group: "Navigation" },
    { key: "nav_consistency", label: "Navigation consistency", group: "Navigation" },

    { key: "thumb_primary", label: "Primary actions are thumb-reachable", group: "Thumb Ergonomics" },
    { key: "thumb_secondary", label: "Secondary actions are reachable", group: "Thumb Ergonomics" },
    { key: "thumb_non_obstructive", label: "Floating buttons never obstruct", group: "Thumb Ergonomics" },

    { key: "info_quantity_first", label: "Availability/quantity shown first", group: "Information Hierarchy" },
    { key: "info_proximity_clear", label: "Proximity is clear and useful", group: "Information Hierarchy" },
    { key: "info_mode_clarity", label: "Mode clarity (Retail/Wholesale/Invest)", group: "Information Hierarchy" },

    { key: "visual_unique_images", label: "Images feel unique (no repetition)", group: "Visual Quality" },
    { key: "visual_premium", label: "Premium, calm, exchange-grade feel", group: "Visual Quality" },

    { key: "trust_wallet_clarity", label: "Wallet clarity (balances + movements)", group: "Trust & Finance" },
    { key: "trust_vault_clarity", label: "Vault clarity (ownership + units)", group: "Trust & Finance" },
    { key: "trust_contracts_clarity", label: "Contracts readability", group: "Trust & Finance" },

    { key: "auth_optional_feel", label: "Login feels optional (not coercive)", group: "Auth" },
    { key: "auth_exit_always", label: "Auth screens always escapable", group: "Auth" },
  ];

  const pageMatrix: Array<{ key: GatePageKey; label: string; href: string; requiresAuth?: boolean }> = [
    { key: "browse", label: "Browse", href: "/?mode=retail" },
    { key: "map", label: "Map", href: "/?panel=map" },
    { key: "product", label: "Product detail", href: "/?panel=browse" },
    { key: "wallet", label: "Wallet", href: "/?panel=wallet", requiresAuth: true },
    { key: "vault", label: "Vault", href: "/?panel=vault", requiresAuth: true },
    { key: "orders", label: "Orders", href: "/orders" },
    { key: "contracts", label: "Contracts", href: "/contracts", requiresAuth: true },
    { key: "login", label: "Login", href: "/login" },
    { key: "register", label: "Signup", href: "/register" },
    { key: "admin", label: "Admin", href: "/admin/dashboard", requiresAuth: true },
  ];

  const scoreSummary = useMemo(() => {
    const values = scoreItems
      .map((item) => gate.scores[item.key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const total = values.reduce((sum, v) => sum + v, 0);
    const avg = values.length ? total / values.length : 0;
    return { avg, count: values.length };
  }, [gate.scores, scoreItems]);

  const pageSummary = useMemo(() => {
    const sessionHasAuth = session.isAuthenticated && !session.isGuest;
    const effective = pageMatrix.filter((p) => (p.requiresAuth ? sessionHasAuth : true));
    const pass = effective.every((p) => {
      const c = gate.pages[p.key];
      return c.exitClear && c.thumbPrimary && c.noOverlap && c.noDeadEnds;
    });
    return { pass, effectiveCount: effective.length, sessionHasAuth };
  }, [gate.pages, pageMatrix, session.isAuthenticated, session.isGuest]);

  const releaseGatePass = scoreSummary.count >= 8 && scoreSummary.avg >= 4.5 && pageSummary.pass;

  return (
    <div className="min-h-[100dvh] bg-gray-950 text-white pt-safe pb-safe px-4">
      <div className="mx-auto w-full max-w-2xl py-6 space-y-4">
        <div className="flex justify-center">
          <BrandLockup subtitle={t("header.subtitle")} />
        </div>

        <h1 className="text-xl font-semibold">Mobile QA</h1>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white">Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-200">
            <div>isAuthenticated: {String(session.isAuthenticated)}</div>
            <div>isGuest: {String(session.isGuest)}</div>
            <div>userId: {session.user?.id ?? "—"}</div>
            <div>email: {session.user?.email ?? "—"}</div>
            <div>displayName: {session.user?.displayName ?? "—"}</div>
            <div>
              roles:{" "}
              {roles
                .filter((r) => session.hasRole(r as any))
                .join(", ") || "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white">Concierge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-200">
            <div>complianceAccepted: {String(complianceAccepted)}</div>
            <div>state: {conciergeState}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white">Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-200">
            <div>permission: {locationState.permission}</div>
            <div>
              cached:{" "}
              {locationState.cached
                ? `${locationState.cached.source} — ${locationState.cached.lat.toFixed(5)}, ${locationState.cached.lon.toFixed(5)}`
                : "—"}
            </div>
            <div>
              cachedAgeMs:{" "}
              {typeof locationState.cachedAgeMs === "number" ? Math.round(locationState.cachedAgeMs) : "—"}
            </div>
            <div>
              lastError:{" "}
              {locationState.lastError
                ? `${locationState.lastError.kind}${locationState.lastError.code ? ` (code ${locationState.lastError.code})` : ""} — ${locationState.lastError.message}`
                : "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white">Viewport</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-200">
            <div>
              inner: {viewport.innerWidth} × {viewport.innerHeight} @ {viewport.dpr}x
            </div>
            <div>
              visualViewport:{" "}
              {viewport.vvWidth && viewport.vvHeight ? `${viewport.vvWidth.toFixed(1)} × ${viewport.vvHeight.toFixed(1)}` : "—"}
            </div>
            <div>visualViewport offsetTop: {viewport.vvOffsetTop ?? "—"}</div>
            <div>
              safeArea (px): top {safeArea.top}, right {safeArea.right}, bottom {safeArea.bottom}, left {safeArea.left}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center justify-between gap-3">
              <span>PWA / SW</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
                  Refresh
                </Button>
                <Button size="sm" onClick={resetPwaCache}>
                  Reset cache
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-200 break-words">
            <div>displayMode: {sw.displayMode}</div>
            <div>sw version: {sw.swVersion ?? "—"}</div>
            <div>sw controller: {sw.controllerUrl ?? "—"}</div>
            <div>sw registrations: {sw.registrations.length ? sw.registrations.join(" | ") : "—"}</div>
            <div>cache keys: {sw.caches.length ? sw.caches.join(", ") : "—"}</div>
            <div>bundle scripts: {sw.bundleScripts.length ? sw.bundleScripts.join(" | ") : "—"}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center justify-between gap-3">
              <span>UX Acceptance Gate</span>
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold border ${
                  releaseGatePass
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                }`}
              >
                {releaseGatePass ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {releaseGatePass ? "PASS" : "NEEDS WORK"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">Score</div>
                <div className="text-sm font-semibold text-white/80">
                  {scoreSummary.count ? scoreSummary.avg.toFixed(2) : "—"} / 5{" "}
                  <span className="text-[11px] text-white/50">({scoreSummary.count} rated)</span>
                </div>
              </div>
              <div className="mt-1 text-[11px] text-white/50">
                Gate rule: average ≥ 4.5 and all required pages checked.
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">Pages</div>
                <div className="text-[11px] text-white/50">
                  Required pages: {pageSummary.effectiveCount}
                  {pageSummary.sessionHasAuth ? "" : " (auth pages hidden until signed in)"}
                </div>
              </div>

              <div className="space-y-2">
                {pageMatrix
                  .filter((p) => (p.requiresAuth ? pageSummary.sessionHasAuth : true))
                  .map((page) => {
                    const checks = gate.pages[page.key];
                    const pagePass = checks.exitClear && checks.thumbPrimary && checks.noOverlap && checks.noDeadEnds;
                    return (
                      <div
                        key={page.key}
                        className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {pagePass ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                            ) : (
                              <Circle className="h-4 w-4 text-white/30" />
                            )}
                            <div className="text-sm font-semibold text-white truncate">{page.label}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 border-white/10 bg-black/30 text-white/80 hover:bg-black/40"
                              onClick={() => navigate(page.href)}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Open
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 border-white/10 bg-black/30 text-white/80 hover:bg-black/40"
                              onClick={async () => {
                                const url = `${window.location.origin}${page.href}`;
                                try {
                                  await navigator.clipboard?.writeText?.(url);
                                } catch {
                                  // ignore
                                }
                              }}
                            >
                              <ClipboardCopy className="h-4 w-4 mr-1" />
                              Copy URL
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {[
                            { k: "exitClear" as const, label: "Exit clear" },
                            { k: "thumbPrimary" as const, label: "Thumb actions" },
                            { k: "noOverlap" as const, label: "No overlaps" },
                            { k: "noDeadEnds" as const, label: "No dead ends" },
                          ].map((item) => {
                            const checked = checks[item.k];
                            return (
                              <Button
                                key={item.k}
                                type="button"
                                variant="outline"
                                size="sm"
                                className={`h-9 justify-start border-white/10 text-white/80 ${
                                  checked
                                    ? "bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-200"
                                    : "bg-black/30 hover:bg-black/40"
                                }`}
                                onClick={() =>
                                  setGate((prev) => ({
                                    ...prev,
                                    pages: {
                                      ...prev.pages,
                                      [page.key]: {
                                        ...prev.pages[page.key],
                                        [item.k]: !checked,
                                      },
                                    },
                                  }))
                                }
                              >
                                {checked ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <Circle className="h-4 w-4 mr-2" />}
                                {item.label}
                              </Button>
                            );
                          })}
                        </div>

                        <textarea
                          value={gate.notes[page.key] ?? ""}
                          onChange={(e) =>
                            setGate((prev) => ({
                              ...prev,
                              notes: { ...prev.notes, [page.key]: e.target.value },
                            }))
                          }
                          placeholder="Notes (optional)…"
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white/90 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                          rows={2}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-white">Scorecard</div>
              <div className="space-y-2">
                {Array.from(new Set(scoreItems.map((s) => s.group))).map((group) => (
                  <div key={group} className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-white/60">{group}</div>
                    {scoreItems
                      .filter((s) => s.group === group)
                      .map((item) => {
                        const value = gate.scores[item.key] ?? 0;
                        return (
                          <div key={item.key} className="flex items-center justify-between gap-2">
                            <div className="text-[12px] text-white/80">{item.label}</div>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((n) => {
                                const active = value === n;
                                return (
                                  <Button
                                    key={n}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className={`h-8 w-8 p-0 border-white/10 ${
                                      active
                                        ? "bg-amber-500/20 text-amber-200 hover:bg-amber-500/25"
                                        : "bg-black/30 text-white/70 hover:bg-black/40"
                                    }`}
                                    onClick={() =>
                                      setGate((prev) => ({
                                        ...prev,
                                        scores: { ...prev.scores, [item.key]: clampScore(n) },
                                      }))
                                    }
                                  >
                                    {n}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-white">Global notes</div>
              <textarea
                value={gate.notes.global ?? ""}
                onChange={(e) =>
                  setGate((prev) => ({
                    ...prev,
                    notes: { ...prev.notes, global: e.target.value },
                  }))
                }
                placeholder="What feels frictiony? What feels world-class?…"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white/90 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                rows={3}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/10 bg-black/30 text-white/80 hover:bg-black/40"
                onClick={() => setGate(loadGateState())}
              >
                Reload saved
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-white/10 bg-black/30 text-white/80 hover:bg-black/40"
                onClick={() => {
                  setGate(DEFAULT_GATE_STATE);
                  try {
                    localStorage.removeItem(GATE_STORAGE_KEY);
                  } catch {
                    // ignore
                  }
                }}
              >
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
