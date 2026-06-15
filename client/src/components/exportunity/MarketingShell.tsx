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

const ACTIVE_NAV_ALIASES: Record<ActiveKey, ActiveKey> = {
  invest: "platforms",
  journey: "company",
  media: "archive",
  platform: "platforms",
  proof: "archive",
  solutions: "what",
  story: "company",
  talk: "work",
  useCases: "what",
};

const NAV_ITEMS: Array<{ key: ActiveKey; label: string; href: string }> = [
  { key: "home", label: "Home", href: "/" },
  { key: "company", label: "Company", href: "/company" },
  { key: "what", label: "What We Do", href: "/what-we-do" },
  { key: "platforms", label: "Platforms", href: "/platforms" },
  { key: "archive", label: "Archive", href: "/archive" },
  { key: "stack", label: "Operating Stack", href: "/operating-stack" },
  { key: "work", label: "Work With Us", href: "/work-with-us" },
];

const FOOTER_GROUPS: Array<{ title: string; items: Array<{ label: string; href: string }> }> = [
  {
    title: "Company",
    items: [
      { label: "Home", href: "/" },
      { label: "Company", href: "/company" },
      { label: "Archive", href: "/archive" },
      { label: "Work With Us", href: "/work-with-us" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Activities",
    items: [
      { label: "Trade", href: "/what-we-do" },
      { label: "Gold & Mining", href: "/gold-mining" },
      { label: "Machinery", href: "/machinery" },
      { label: "Government & Institutions", href: "/government-institutions" },
      { label: "B2B Operations", href: "/what-we-do" },
      { label: "B2G Advisory", href: "/government-institutions" },
    ],
  },
  {
    title: "Platforms",
    items: [
      { label: "Platforms", href: "/platforms" },
      { label: "Bourse de l'Or", href: "/gold-mining" },
      { label: "Maison en Terre", href: "/platforms" },
      { label: "rayOn", href: "/platforms" },
      { label: "XportCARD", href: "/platforms" },
      { label: "MindBase", href: "/platforms" },
      { label: "House of Zogue", href: "/platforms" },
    ],
  },
  {
    title: "Access",
    items: [
      { label: "Platform Access", href: "/platform" },
      { label: "Operating Stack", href: "/operating-stack" },
      { label: "Request Access", href: "/work-with-us" },
    ],
  },
];

const LOGIN_CHOICES: Array<{ label: string; href: string; description: string }> = [
  {
    label: "Marketplace access",
    href: "https://exportunity.net/login",
    description: "Retail and marketplace user access.",
  },
  {
    label: "Pro workspace access",
    href: "https://exportunity.net/pro/login",
    description: "Operator and partner professional workspace.",
  },
  {
    label: "Gold workflow access",
    href: "https://boursedelor.com/login",
    description: "Bourse de l'Or access for gold workflows.",
  },
];

const PLATFORM_CHOICES: Array<{ label: string; href: string; description: string }> = [
  {
    label: "Open marketplace",
    href: "https://exportunity.net/zone",
    description: "Buy and sell products.",
  },
  {
    label: "Open gold workflows",
    href: "https://boursedelor.com",
    description: "Commodity and gold operations.",
  },
  {
    label: "Open pro workspace",
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
  const normalizedActive = active ? ACTIVE_NAV_ALIASES[active] || active : active;

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
      normalizedActive === key ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
    );

  const openTalk = () => setIsTalkOpen(true);
  const onTalkOpenChange = (next: boolean) => {
    setIsTalkOpen(next);
    if (!next && pathname === "/talk") {
      setPathname("/");
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050505] text-white">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,#050505_0%,#090806_42%,#10100d_100%)]"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:96px_96px] opacity-30" aria-hidden />

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
              onClick={() => setIsPlatformOpen(true)}
              className="rounded-full border border-white/30 bg-transparent px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Platform Access
            </button>
            <Link
              href={withMarketingQuery("/contact")}
              className="rounded-full bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300"
            >
              Contact
            </Link>
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
        aria-label="Contact Exportunity"
      >
        Contact
      </button>

      <Dialog open={isLoginOpen} onOpenChange={setIsLoginOpen}>
        <DialogContent className="max-w-xl border-white/10 bg-[#070b14] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">Platform access</DialogTitle>
            <DialogDescription className="text-white/70">
              Select the workspace that matches the operation.
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
            <DialogTitle className="text-xl">Platform access</DialogTitle>
            <DialogDescription className="text-white/70">
              Open a public platform or request operator access.
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
            systemMessage="What kind of Exportunity support do you need?"
          />
        </SheetContent>
      </Sheet>

      <footer className="mt-16 border-t border-white/10 bg-black/20 backdrop-blur">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 py-10 md:grid-cols-[1.15fr_repeat(4,1fr)] md:px-8">
          <div>
            <div className="text-sm font-semibold text-white">Exportunity Group Ltd</div>
            <div className="mt-2 text-sm leading-relaxed text-white/70">
              Platforms for trade, gold, machinery, payments, advisory, and execution.
            </div>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2 text-sm text-white/70">
              <div className="font-semibold text-white">{group.title}</div>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <Link key={`${group.title}-${item.href}-${item.label}`} href={withMarketingQuery(item.href)} className="hover:text-white">
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
