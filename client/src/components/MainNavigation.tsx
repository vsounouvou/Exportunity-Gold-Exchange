import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, MessageSquare, BarChart2, Wallet, AlertCircle, ClipboardList } from "lucide-react";
import { useTenant } from "@/lib/tenant";
import { getTenantAdminHomeRoute } from "@/lib/tenantPolicy";

interface MainNavigationProps {
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function MainNavigation({ 
  isCollapsed = false, 
  onCollapsedChange
}: MainNavigationProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(isCollapsed);
  const [location] = useLocation();
  const { tenant } = useTenant();

  const collapsed = isCollapsed ?? internalCollapsed;
  const setCollapsed = onCollapsedChange ?? setInternalCollapsed;

  const menuItems = useMemo(() => [
    { name: "Dashboard", icon: BarChart2, href: getTenantAdminHomeRoute(tenant.key) },
    { name: "Operations Center", icon: MessageSquare, href: "/ai-team" },
    { name: "Tasks", icon: ClipboardList, href: "/tasks" },
    { name: "Wallets & Credits", icon: Wallet, href: "/agent-economy" },
    { name: "Ops Actions", icon: AlertCircle, href: "/actions" },
  ], [tenant.key]);

  return (
    <div
      className={cn(
        "relative flex-none transition-all duration-300 ease-in-out border-r border-gray-800 bg-gray-900",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-0 top-2 h-6 w-6 p-0 rounded-l-md hover:bg-gray-800/80 text-gray-400 hover:text-white transition-all duration-200 ease-in-out"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </Button>

      <div className="flex flex-col h-full">
        <nav className={cn("space-y-1 p-4", collapsed && "px-2")}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-200 group relative overflow-hidden",
                    collapsed && "justify-center p-2",
                    location === item.href
                      ? "bg-gray-800/70 text-white border border-gray-700/50 shadow-sm"
                      : "text-gray-400 hover:text-white hover:bg-gray-800/60"
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-800/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-x-full group-hover:translate-x-full transform" />
                  <Icon className={cn("flex-shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                </a>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
