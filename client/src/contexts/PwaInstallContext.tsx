import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const storageNamespace = String(__BUILD_APP_NAME__ || "platform")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, "-");

export const PWA_INSTALL_STORAGE_KEYS = Object.freeze({
  installed: `${storageNamespace}_pwa_installed`,
  installedAt: `${storageNamespace}_pwa_installed_at`,
  installedAcknowledgedAt: `${storageNamespace}_pwa_installed_ack_at`,
  promptAt: `${storageNamespace}_pwa_install_prompt_at`,
});

function isStandaloneMode() {
  const nav = navigator as any;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || nav.standalone === true;
}

function readInstalledFlag() {
  try {
    return localStorage.getItem(PWA_INSTALL_STORAGE_KEYS.installed) === "true";
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
        localStorage.setItem(PWA_INSTALL_STORAGE_KEYS.installed, "true");
        localStorage.setItem(PWA_INSTALL_STORAGE_KEYS.installedAt, String(Date.now()));
        localStorage.removeItem(PWA_INSTALL_STORAGE_KEYS.installedAcknowledgedAt);
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
      localStorage.setItem(PWA_INSTALL_STORAGE_KEYS.installed, "true");
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
