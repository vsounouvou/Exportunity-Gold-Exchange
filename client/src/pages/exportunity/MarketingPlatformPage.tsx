import { useMemo } from "react";
import { Link, Redirect } from "wouter";
import { useLocation } from "wouter";

import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import { GlassCard, HeroPanel, MarketingContainer, MarketingLead, MarketingTitle } from "@/components/exportunity/marketing-ui";
import marketingSiteConfig from "@/content/marketing/site";
import { useSession } from "@/lib/session";

const MODULES: Array<{
  key: string;
  name: string;
  description: string;
  href: string;
  appPath: string;
}> = [
  { key: "wallet", name: "Wallet", description: "Accounts, balances, and settlement rails.", href: "/wallet", appPath: "/app/wallet" },
  { key: "trade", name: "Trade execution", description: "Commodity trade and settlement workflows.", href: "/trade", appPath: "/app" },
  { key: "contracts", name: "Contracts", description: "Create and manage enforceable digital contracts.", href: "/contracts", appPath: "/app/contracts" },
  { key: "business", name: "Business operations", description: "Operate farms, SMEs, and project workflows.", href: "/business", appPath: "/app" },
  { key: "machinery", name: "Machinery", description: "Order and finance operational equipment.", href: "/machinery", appPath: "/app/machinery/catalog" },
  { key: "invest", name: "Invest", description: "Access structured investment opportunities.", href: "/invest", appPath: "/app/invest/opportunities" },
  { key: "compliance", name: "Compliance", description: "Audit trails, identity checks, and controls.", href: "/compliance", appPath: "/app/governance/logs" },
  { key: "communications", name: "Communications", description: "Messaging and operational notifications.", href: "/communications", appPath: "/app/messaging" },
  { key: "ai-operations", name: "AI-managed operations", description: "Automated task execution and routing.", href: "/ai-operations", appPath: "/app?tab=team" },
];

export default function MarketingPlatformPage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;
  const session = useSession();
  const isMember = session.isAuthenticated && !session.isGuest;
  const [location] = useLocation();

  const activeKey = useMemo(() => {
    const query = String(location || "").split("?")[1] || "";
    if (!query) return "";
    const params = new URLSearchParams(query);
    return String(params.get("module") || "").trim().toLowerCase();
  }, [location]);

  const activeModule = useMemo(() => MODULES.find((item) => item.key === activeKey) || null, [activeKey]);
  const openHref = activeModule
    ? isMember
      ? activeModule.appPath
      : `/auth?next=${encodeURIComponent(activeModule.appPath)}`
    : isMember
      ? "/app"
      : "/signup";

  return (
    <MarketingShell active="platform">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.platform} imageAlt="Module access">
          <div className="max-w-3xl space-y-4">
            <MarketingTitle className="text-4xl md:text-5xl">Platform directory</MarketingTitle>
            <MarketingLead>Direct entry points to operational tenants and modules.</MarketingLead>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="pb-14 pt-10">
        <GlassCard className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.12em] text-white/60">Selected module</div>
              <div className="mt-1 text-lg font-semibold text-white">{activeModule?.name || "Choose a module"}</div>
              <div className="mt-1 text-sm text-white/75">{activeModule?.description || "Select one module card to continue."}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={openHref}>
                <a className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300">Open</a>
              </Link>
              <Link href="/contact">
                <a className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">Contact</a>
              </Link>
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => (
            <GlassCard key={module.name} className="rounded-3xl">
              <Link href={`/platform?module=${module.key}`}>
                <a
                  className={`block rounded-2xl border bg-black/30 p-6 text-left transition-all hover:-translate-y-0.5 ${
                    module.key === activeKey ? "border-amber-300/60" : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <div className="text-xl font-semibold text-white">{module.name}</div>
                  <div className="mt-2 text-sm text-white/75">{module.description}</div>
                  <div className="mt-5 inline-flex rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950">Open</div>
                </a>
              </Link>
            </GlassCard>
          ))}
        </div>
      </MarketingContainer>
    </MarketingShell>
  );
}

