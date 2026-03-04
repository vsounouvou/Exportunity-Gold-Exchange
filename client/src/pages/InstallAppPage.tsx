import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Download, PlusSquare, Share2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPageTitle } from "@/lib/brand";
import { getRetailLabel } from "@/lib/storefrontIdentity";
import { useTenant } from "@/lib/tenant";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function detectPlatform(userAgent: string) {
  const ua = userAgent.toLowerCase();
  const isAndroid = ua.includes("android");
  const isIOS = /iphone|ipad|ipod/.test(ua) || (ua.includes("mac") && "ontouchend" in document);
  return { isAndroid, isIOS };
}

function isStandaloneMode() {
  const nav = navigator as any;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || nav.standalone === true;
}

export function InstallAppPage() {
  const platform = useMemo(() => detectPlatform(navigator.userAgent), []);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => isStandaloneMode());
  const { brand, tenant } = useTenant();
  const installLabel = getRetailLabel(tenant.key);

  useEffect(() => {
    if (tenant.key === "exportunity") {
      document.title = `Install ${installLabel} — Exportunity`;
      return;
    }
    document.title = formatPageTitle(`Install ${installLabel}`, brand);
  }, [brand, tenant.key, installLabel]);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
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

  const canPrompt = !!deferredPrompt && !installed;

  return (
    <div className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <div className="flex items-center gap-2">
          <Link href={tenant.key === "exportunity" ? "/zone" : "/"}>
            <Button variant="ghost" className="h-10 px-2 text-white/80 hover:bg-white/10 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
              <span className="ml-2">Back</span>
            </Button>
          </Link>
        </div>

        <Card className="border-white/10 bg-white/5">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-white">
              <Smartphone className="h-5 w-5 text-amber-300" />
              Install {installLabel}
            </CardTitle>
            <p className="text-sm text-white/60">Add {installLabel} to your home screen for faster access.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {installed ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <p className="text-sm font-semibold text-emerald-200">Installed</p>
                <p className="mt-1 text-xs text-emerald-200/70">You are using {installLabel} in app mode.</p>
              </div>
            ) : null}

            {canPrompt ? (
              <Button
                className="h-11 w-full bg-gradient-to-r from-amber-500 to-amber-600 font-semibold text-black hover:from-amber-600 hover:to-amber-700"
                onClick={async () => {
                  try {
                    await deferredPrompt?.prompt();
                    await deferredPrompt?.userChoice.catch(() => null);
                    setDeferredPrompt(null);
                  } catch {
                    setDeferredPrompt(null);
                  }
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Install now
              </Button>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="text-sm font-semibold text-white/90">Manual install</p>
                {platform.isIOS ? (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/70">
                    <li>
                      Tap{" "}
                      <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/10 px-2 py-0.5">
                        <Share2 className="h-4 w-4" />
                        Share
                      </span>
                    </li>
                    <li>Tap Add to Home Screen</li>
                    <li>Confirm Add</li>
                  </ol>
                ) : platform.isAndroid ? (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/70">
                    <li>Open browser menu</li>
                    <li>Tap Install app or Add to Home screen</li>
                    <li>Confirm Install</li>
                  </ol>
                ) : (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/70">
                    <li>Open browser menu</li>
                    <li>Choose Install app or Add to Home screen</li>
                    <li>Confirm</li>
                  </ol>
                )}

                <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
                  <PlusSquare className="h-4 w-4" />
                  <span>If install options are missing, update your browser and try again.</span>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white/90">Offline behavior</p>
              <p className="mt-1 text-sm text-white/70">
                The app shell can load offline, but live prices and wallet operations require internet access.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

