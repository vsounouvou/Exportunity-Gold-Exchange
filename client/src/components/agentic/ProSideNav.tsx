import { Activity, Bot, Package, UserCircle2, Wallet } from "lucide-react";
import { useLocation } from "wouter";

type ProPrimarySection = "operations" | "money" | "orders" | "agents" | "account";

type ProSideNavProps = {
  activeKey: ProPrimarySection;
};

export function ProSideNav({ activeKey }: ProSideNavProps) {
  const [, setLocation] = useLocation();

  const items: Array<{
    key: ProPrimarySection;
    label: string;
    href: string;
    icon: JSX.Element;
    primary?: boolean;
  }> = [
    {
      key: "operations",
      label: "Operations",
      href: "/pro/operations",
      icon: <Activity className="h-4 w-4" />,
      primary: true,
    },
    {
      key: "money",
      label: "Money",
      href: "/pro/money",
      icon: <Wallet className="h-4 w-4" />,
    },
    {
      key: "orders",
      label: "Orders",
      href: "/pro/orders",
      icon: <Package className="h-4 w-4" />,
    },
    {
      key: "agents",
      label: "Agents",
      href: "/pro/agents",
      icon: <Bot className="h-4 w-4" />,
    },
    {
      key: "account",
      label: "Account",
      href: "/pro/account",
      icon: <UserCircle2 className="h-4 w-4" />,
    },
  ];

  return (
    <aside
      className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-56 md:flex-col md:border-r md:border-slate-200 md:bg-white/95 md:text-[#07111F] md:backdrop-blur-xl"
      aria-label="Pro navigation"
      data-testid="pro-side-nav"
    >
      <div className="px-4 py-4">
        <div className="flex items-center gap-2">
          <img src="/tenants/exportunity/official/favicon-64.png" alt="" className="h-8 w-8 rounded-lg object-contain" />
          <div className="min-w-0">
            <div className="text-sm font-black leading-none text-slate-950">Global Trade Network</div>
            <div className="mt-1 text-[11px] font-bold leading-none text-slate-500">Operations workspace</div>
          </div>
        </div>
      </div>

      <nav className="px-3 py-2 space-y-1">
        {items.map((item) => {
          const isActive = item.key === activeKey;
          const isPrimary = item.primary === true;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setLocation(item.href)}
              aria-current={isActive ? "page" : undefined}
              data-testid={`pro-side-nav-${item.key}`}
              className={[
                "w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition",
                "border border-transparent hover:bg-slate-50",
                isPrimary ? "bg-[#FFF8E8] text-[#8A5700] hover:bg-[#FFF1CF]" : "text-slate-600",
                isActive ? "border-[#F5A623]/35 bg-[#FFF8E8] text-slate-950" : "",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                {item.icon}
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-slate-100 px-4 py-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Exportunity · GTN</div>
    </aside>
  );
}
