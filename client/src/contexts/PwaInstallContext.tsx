import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALLED_KEY = "zone_install_prompt_installed";

function isStandaloneMode() {
  const nav = navigator as any;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || nav.standalone === true;
}

function readInstalledFlag() {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "true";
  } catch {
    return false;
  }
}

type PwaInstallContextValue = {
  installed: boolean;
  canPrompt: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => isStandaloneMode() || readInstalledFlag());

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      try {
        localStorage.setItem(INSTALLED_KEY, "true");
        localStorage.setItem("bdo_pwa_installed_at", String(Date.now()));
        localStorage.removeItem("bdo_pwa_installed_ack_at");
      } catch {
        // ignore
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!installed) return;
    try {
      localStorage.setItem(INSTALLED_KEY, "true");
    } catch {
      // ignore
    }
  }, [installed]);

  const canPrompt = !!deferredPrompt && !installed;

  const value = useMemo<PwaInstallContextValue>(
    () => ({
      installed,
      canPrompt,
      promptInstall: async () => {
        if (!deferredPrompt || installed) return "unavailable";
        try {
          await deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice.catch(() => null);
          setDeferredPrompt(null);
          if (choice?.outcome === "accepted") return "accepted";
          if (choice?.outcome === "dismissed") return "dismissed";
          return "unavailable";
        } catch {
          setDeferredPrompt(null);
          return "unavailable";
        }
      },
    }),
    [canPrompt, deferredPrompt, installed],
  );

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall() {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) throw new Error("usePwaInstall must be used within PwaInstallProvider");
  return ctx;
}
