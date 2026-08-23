import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Download, PlusSquare, Share2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function detectPlatform(userAgent: string) {
  const normalized = userAgent.toLowerCase();
  return {
    isAndroid: normalized.includes("android"),
    isIOS:
      /iphone|ipad|ipod/.test(normalized) ||
      (normalized.includes("mac") && "ontouchend" in document),
  };
}

function isStandaloneMode() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    standaloneNavigator.standalone === true
  );
}

export function ExportunityInstallAppPage() {
  const platform = useMemo(() => detectPlatform(navigator.userAgent), []);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandaloneMode());

  useEffect(() => {
    document.title = "Install Exportunity | Global Trade Network";
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const canPrompt = Boolean(deferredPrompt) && !installed;

  return (
    <main
      className="min-h-screen bg-[#f5f1e8] px-4 py-6 text-[#102238] sm:px-6 sm:py-10"
      data-testid="exportunity-install-app-page"
    >
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/platform/marketplace">
          <Button
            variant="ghost"
            className="mb-5 h-10 px-2 text-[#102238]/70 hover:bg-[#102238]/5 hover:text-[#102238]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to the network
          </Button>
        </Link>

        <section className="overflow-hidden rounded-[2rem] border border-[#d8cbaa] bg-white shadow-[0_24px_70px_rgba(16,34,56,0.12)]">
          <div className="border-b border-[#eadfca] bg-[#102238] px-6 py-7 text-white sm:px-9">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d4a72c] text-[#102238]">
              <Smartphone className="h-6 w-6" />
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-[#e8c76d]">
              Global Trade Network
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Install Exportunity
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/70 sm:text-base">
              Keep industrial sourcing, commercial rooms, delivery evidence, and relationship memory
              close at hand.
            </p>
          </div>

          <div className="space-y-5 px-6 py-7 sm:px-9 sm:py-9">
            {installed ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900">Exportunity is installed</p>
                <p className="mt-1 text-sm text-emerald-800/75">
                  You are using the Global Trade Network in app mode.
                </p>
              </div>
            ) : null}

            {canPrompt ? (
              <Button
                className="h-12 w-full rounded-xl bg-[#d4a72c] font-semibold text-[#102238] hover:bg-[#c49620]"
                onClick={async () => {
                  try {
                    await deferredPrompt?.prompt();
                    await deferredPrompt?.userChoice.catch(() => null);
                  } finally {
                    setDeferredPrompt(null);
                  }
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Install Exportunity
              </Button>
            ) : (
              <div className="rounded-2xl border border-[#e6dcc8] bg-[#fbf8f2] p-5">
                <p className="font-semibold text-[#102238]">Add Exportunity to your device</p>
                {platform.isIOS ? (
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-[#425268]">
                    <li>
                      Tap <Share2 className="mx-1 inline h-4 w-4" /> Share in your browser.
                    </li>
                    <li>Choose Add to Home Screen.</li>
                    <li>Confirm Add.</li>
                  </ol>
                ) : platform.isAndroid ? (
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-[#425268]">
                    <li>Open the browser menu.</li>
                    <li>Choose Install app or Add to Home screen.</li>
                    <li>Confirm Install.</li>
                  </ol>
                ) : (
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-[#425268]">
                    <li>Open your browser menu.</li>
                    <li>Choose Install app or Add to Home screen.</li>
                    <li>Confirm the installation.</li>
                  </ol>
                )}
                <p className="mt-4 flex items-center gap-2 text-xs text-[#66758a]">
                  <PlusSquare className="h-4 w-4 text-[#b48718]" />
                  If the install option is missing, update your browser and try again.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-[#e6dcc8] p-5">
              <p className="font-semibold text-[#102238]">Secure online operations</p>
              <p className="mt-2 text-sm leading-6 text-[#58687c]">
                The interface can open from your home screen. Live trade records, approvals, and
                evidence remain server-verified and require an internet connection.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
