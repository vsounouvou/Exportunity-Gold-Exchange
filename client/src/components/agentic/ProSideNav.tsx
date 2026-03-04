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
      className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-56 md:flex-col md:border-r md:border-white/10 md:bg-gray-950/95 md:backdrop-blur"
      aria-label="Pro navigation"
      data-testid="pro-side-nav"
    >
      <div className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700" />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-none text-white">Exportunity Pro</div>
            <div className="mt-1 text-[11px] leading-none text-white/55">Company operations</div>
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
                "border border-transparent hover:bg-white/5",
                isPrimary ? "bg-amber-500/10 text-amber-100 hover:bg-amber-500/15" : "text-white/80",
                isActive ? "border-white/10 bg-white/5 text-white" : "",
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

      <div className="mt-auto px-4 py-4 text-[11px] text-white/45">v2</div>
    </aside>
  );
}
