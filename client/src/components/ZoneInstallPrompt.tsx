import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Download, PlusSquare, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/contexts/PwaInstallContext";
import { getRetailLabel } from "@/lib/storefrontIdentity";
import { useSession } from "@/lib/session";
import { useTenant } from "@/lib/tenant";

const DISMISS_KEY = "zone_install_prompt_dismissed_at";
const INSTALLED_KEY = "zone_install_prompt_installed";
const RESULT_KEY = "zone_install_prompt_last_result";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const CART_KEY = "bdo_cart_v1";

function readNumber(key: string) {
  try {
    return Number(localStorage.getItem(key) || "0") || 0;
  } catch {
    return 0;
  }
}

function readInstalledFlag() {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "true";
  } catch {
    return false;
  }
}

function readCartHasItems() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "").toLowerCase();
  const iOS = /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = ua.includes("safari") && !/crios|fxios|edgios|opios|android/.test(ua);
  return iOS && safari;
}

function isAndroidChrome() {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "").toLowerCase();
  return ua.includes("android") && ua.includes("chrome") && !ua.includes("edg");
}

function trackOutcome(outcome: string) {
  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify({ outcome, at: Date.now() }));
  } catch {
    // ignore
  }
}

export default function ZoneInstallPrompt() {
  const [location] = useLocation();
  const { tenant } = useTenant();
  const { isAuthenticated, isGuest } = useSession();
  const { installed, canPrompt, promptInstall } = usePwaInstall();
  const installLabel = getRetailLabel(tenant.key);

  const [dismissedAt, setDismissedAt] = useState<number>(() => readNumber(DISMISS_KEY));
  const [installPersisted, setInstallPersisted] = useState<boolean>(() => readInstalledFlag());
  const [visitedPaths, setVisitedPaths] = useState<string[]>([]);
  const [spentTwentySeconds, setSpentTwentySeconds] = useState(false);
  const [cartGate, setCartGate] = useState(false);
  const [hiddenThisSession, setHiddenThisSession] = useState(false);

  const loggedIn = isAuthenticated && !isGuest;
  const path = String(location || "/").split("?")[0] || "/";
  const onZoneRoute = path === "/zone" || path.startsWith("/zone/");
  const onStoreRoute = path === "/store" || path.startsWith("/store/");
  const onMarketplaceRoute = onZoneRoute || onStoreRoute;
  const iosSafari = useMemo(() => isIosSafari(), []);
  const androidChrome = useMemo(() => isAndroidChrome(), []);

  useEffect(() => {
    if (!loggedIn) {
      setVisitedPaths([]);
      setSpentTwentySeconds(false);
      setCartGate(false);
      setHiddenThisSession(false);
      return;
    }

    const timer = window.setTimeout(() => setSpentTwentySeconds(true), 20_000);
    return () => window.clearTimeout(timer);
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    setVisitedPaths((prev) => (prev.includes(path) ? prev : [...prev, path].slice(-24)));
  }, [loggedIn, path]);

  useEffect(() => {
    if (!loggedIn) return;
    const update = () => setCartGate(readCartHasItems());
    update();
    const handle = window.setInterval(update, 2_000);
    return () => window.clearInterval(handle);
  }, [loggedIn]);

  useEffect(() => {
    if (!installed) return;
    try {
      localStorage.setItem(INSTALLED_KEY, "true");
    } catch {
      // ignore
    }
    setInstallPersisted(true);
  }, [installed]);

  const dismissedCooldown = dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_TTL_MS;
  const interactionGate = visitedPaths.length >= 2 || spentTwentySeconds || cartGate;
  const isEligible =
    loggedIn &&
    onMarketplaceRoute &&
    interactionGate &&
    !dismissedCooldown &&
    !installPersisted &&
    !hiddenThisSession;

  const dismissPrompt = (reason: "not_now" | "dismissed") => {
    const now = Date.now();
    try {
      localStorage.setItem(DISMISS_KEY, String(now));
    } catch {
      // ignore
    }
    setDismissedAt(now);
    setHiddenThisSession(true);
    trackOutcome(reason);
  };

  const completeInstall = () => {
    try {
      localStorage.setItem(INSTALLED_KEY, "true");
    } catch {
      // ignore
    }
    setInstallPersisted(true);
    setHiddenThisSession(true);
  };

  const handleInstall = async () => {
    const outcome = await promptInstall();
    trackOutcome(outcome);
    if (outcome === "accepted") {
      completeInstall();
      return;
    }
    if (outcome === "dismissed") {
      dismissPrompt("dismissed");
      return;
    }
    setHiddenThisSession(true);
  };

  if (!isEligible) return null;

  if (iosSafari) {
    return (
      <div className="fixed inset-x-3 bottom-4 z-[1300] md:max-w-md md:right-4 md:left-auto">
        <div className="rounded-2xl border border-white/15 bg-[#0B0F19]/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Install {installLabel}</p>
              <p className="mt-1 text-xs text-white/70">To install {installLabel}: tap Share, then Add to Home Screen.</p>
            </div>
            <button
              type="button"
              aria-label="Close install prompt"
              className="rounded-full p-1 text-white/60 hover:text-white hover:bg-white/10"
              onClick={() => dismissPrompt("not_now")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-white/70">
            <Share2 className="h-3.5 w-3.5 text-white/80" />
            <span>Share</span>
            <span className="text-white/35">-&gt;</span>
            <PlusSquare className="h-3.5 w-3.5 text-white/80" />
            <span>Add to Home Screen</span>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-xs text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => dismissPrompt("not_now")}
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!androidChrome || !canPrompt) return null;

  return (
    <div className="fixed inset-x-3 bottom-4 z-[1300] md:max-w-md md:right-4 md:left-auto">
      <div className="rounded-2xl border border-white/15 bg-[#0B0F19]/95 p-4 shadow-2xl backdrop-blur-xl">
        <p className="text-sm font-semibold text-white">Install {installLabel}</p>
        <p className="mt-1 text-xs text-white/70">Add {installLabel} to your home screen for faster access.</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-3 text-xs text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => dismissPrompt("not_now")}
          >
            Not now
          </Button>
          <Button type="button" size="sm" className="h-8 px-3 text-xs" onClick={handleInstall}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
