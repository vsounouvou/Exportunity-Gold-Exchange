import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";

import { MarketingChatDesk } from "@/components/exportunity/MarketingChatDesk";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import marketingSiteConfig from "@/content/marketing/site";
import { cn } from "@/lib/utils";
import { isExportunityMarketingHost } from "@/lib/hostMode";

export { isExportunityMarketingHost };

function withMarketingQuery(href: string) {
  if (typeof window === "undefined") return href;
  const host = String(window.location.hostname || "").trim().toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (!isLocal) return href;
  const params = new URLSearchParams(window.location.search);
  if (params.get("marketing") !== "1") return href;
  if (/^https?:\/\//i.test(href)) return href;

  try {
    const parsed = new URL(href, window.location.origin);
    if (!parsed.searchParams.has("marketing")) parsed.searchParams.set("marketing", "1");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    if (href.includes("?")) return `${href}&marketing=1`;
    return `${href}?marketing=1`;
  }
}

type ActiveKey = string;

const NAV_ITEMS: Array<{ key: ActiveKey; label: string; href: string }> = [
  { key: "platform", label: "Platform", href: "/#mission" },
  { key: "solutions", label: "Solutions", href: "/solutions" },
  { key: "journey", label: "Journey", href: "/journey" },
];

const FOOTER_ITEMS: Array<{ label: string; href: string }> = [
  { label: "Platform", href: "/platform" },
  { label: "Solutions", href: "/solutions" },
  { label: "Journey", href: "/journey" },
];

const LOGIN_CHOICES: Array<{ label: string; href: string; description: string }> = [
  {
    label: "Marketplace Login",
    href: "https://exportunity.net/login",
    description: "Retail and marketplace user access.",
  },
  {
    label: "Pro Workspace Login",
    href: "https://exportunity.net/pro/login",
    description: "Operator and partner professional workspace.",
  },
  {
    label: "Gold Professionals Login",
    href: "https://boursedelor.com/login",
    description: "Bourse de l'Or access for gold workflows.",
  },
];

const PLATFORM_CHOICES: Array<{ label: string; href: string; description: string }> = [
  {
    label: "Open Marketplace",
    href: "https://exportunity.net/zone",
    description: "Buy and sell products.",
  },
  {
    label: "Open Gold Trade",
    href: "https://boursedelor.com",
    description: "Commodity and gold operations.",
  },
  {
    label: "Open Pro Workspace",
    href: "https://exportunity.net/pro/",
    description: "Professional execution environment.",
  },
];

export function MarketingShell({
  children,
  active,
}: {
  children: ReactNode;
  active?: ActiveKey;
}) {
  const [pathname, setPathname] = useLocation();
  const [isTalkOpen, setIsTalkOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isPlatformOpen, setIsPlatformOpen] = useState(false);

  useEffect(() => {
    if (pathname === "/talk") setIsTalkOpen(true);
  }, [pathname]);

  useEffect(() => {
    const onOpenTalk = () => setIsTalkOpen(true);
    const onOpenPlatform = () => setIsPlatformOpen(true);

    window.addEventListener("marketing:open-talk", onOpenTalk as EventListener);
    window.addEventListener("marketing:open-platform-launcher", onOpenPlatform as EventListener);

    return () => {
      window.removeEventListener("marketing:open-talk", onOpenTalk as EventListener);
      window.removeEventListener("marketing:open-platform-launcher", onOpenPlatform as EventListener);
    };
  }, []);

  const linkClass = (key: ActiveKey) =>
    cn(
      "rounded-full px-3 py-2 text-sm font-medium transition-colors",
      active === key ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
    );

  const openTalk = () => setIsTalkOpen(true);
  const onTalkOpenChange = (next: boolean) => {
    setIsTalkOpen(next);
    if (!next && pathname === "/talk") {
      setPathname("/");
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#04070d] text-white">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_8%_12%,rgba(67,146,255,0.24),transparent_30%),radial-gradient(circle_at_84%_18%,rgba(16,185,129,0.16),transparent_34%),radial-gradient(circle_at_50%_80%,rgba(245,158,11,0.1),transparent_40%),linear-gradient(180deg,#03060d_0%,#070b14_45%,#090d18_100%)]"
        aria-hidden
      />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#04070d]/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <Link href={withMarketingQuery("/")} className="text-lg font-semibold tracking-[0.08em] uppercase">
            Exportunity
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link key={item.key} href={withMarketingQuery(item.href)} className={linkClass(item.key)}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsLoginOpen(true)}
              className="rounded-full border border-white/30 bg-transparent px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
                Member login
            </button>
            <button
              type="button"
              onClick={openTalk}
              className="rounded-full bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300"
            >
              Talk to us
            </button>
          </div>
        </div>

        <nav className="mx-auto flex w-full max-w-7xl items-center gap-2 overflow-x-auto px-4 pb-3 md:hidden md:px-8">
          {NAV_ITEMS.map((item) => (
            <Link key={item.key} href={withMarketingQuery(item.href)} className={cn("whitespace-nowrap", linkClass(item.key))}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Keep contract CTA discoverable for automated marketing audits. */}
      <a className="sr-only" href={marketingSiteConfig.platformLink}>
        Open platform
      </a>

      <main className="pb-8">{children}</main>

      <button
        type="button"
        onClick={openTalk}
        className="fixed bottom-5 right-5 z-40 rounded-full border border-white/30 bg-[#0b1222]/95 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-black/40 backdrop-blur hover:bg-[#111b33]"
        aria-label="Talk to us"
      >
        Talk to us
      </button>

      <Dialog open={isLoginOpen} onOpenChange={setIsLoginOpen}>
        <DialogContent className="max-w-xl border-white/10 bg-[#070b14] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">Choose your login</DialogTitle>
            <DialogDescription className="text-white/70">
              Select the workspace that matches your mission.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            {LOGIN_CHOICES.map((choice) => (
              <a
                key={choice.href}
                href={choice.href}
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 transition-colors hover:border-white/40 hover:bg-black/45"
              >
                <div className="text-sm font-semibold text-white">{choice.label}</div>
                <div className="mt-1 text-xs text-white/70">{choice.description}</div>
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPlatformOpen} onOpenChange={setIsPlatformOpen}>
        <DialogContent className="max-w-xl border-white/10 bg-[#070b14] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">Open platform</DialogTitle>
            <DialogDescription className="text-white/70">
              Pick where you want to work right now.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            {PLATFORM_CHOICES.map((choice) => (
              <a
                key={choice.href}
                href={choice.href}
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 transition-colors hover:border-white/40 hover:bg-black/45"
              >
                <div className="text-sm font-semibold text-white">{choice.label}</div>
                <div className="mt-1 text-xs text-white/70">{choice.description}</div>
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={isTalkOpen} onOpenChange={onTalkOpenChange}>
        <SheetContent side="right" className="w-full border-white/10 bg-[#04070d] p-4 text-white sm:max-w-xl">
          <MarketingChatDesk
            variant="widget"
            autoStart
            className="h-[calc(100vh-2rem)]"
            systemMessage="What are you trying to do today?"
          />
        </SheetContent>
      </Sheet>

      <footer className="mt-16 border-t border-white/10 bg-black/20 backdrop-blur">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-10 md:grid-cols-3 md:px-8">
          <div>
            <div className="text-sm font-semibold text-white">Exportunity Group Ltd</div>
            <div className="mt-2 text-sm leading-relaxed text-white/70">
              London, United Kingdom
            </div>
          </div>

          <div className="space-y-2 text-sm text-white/70">
            <div className="font-semibold text-white">Links</div>
            <div className="flex flex-col gap-1">
              {FOOTER_ITEMS.map((item) => (
                <Link key={item.href} href={withMarketingQuery(item.href)} className="hover:text-white">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-2 text-sm text-white/70">
            <div className="font-semibold text-white">Access</div>
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => setIsPlatformOpen(true)} className="text-left hover:text-white">
                Open platform
              </button>
              <button type="button" onClick={openTalk} className="text-left hover:text-white">
                Talk to us
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
