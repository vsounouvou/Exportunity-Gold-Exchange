import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { MessageSquare, BarChart2, Wallet, AlertCircle, ClipboardList } from "lucide-react";
import { useTenant } from "@/lib/tenant";
import { getTenantDefaultRoute } from "@/lib/tenantPolicy";

export function NavigationBar() {
  const [location] = useLocation();
  const { tenant } = useTenant();
  const menuItems = useMemo(
    () => [
      { href: getTenantDefaultRoute(tenant.key), label: "Dashboard", icon: BarChart2 },
      { href: "/ai-team", label: "Operations Center", icon: MessageSquare },
      { href: "/tasks", label: "Tasks", icon: ClipboardList },
      { href: "/agent-economy", label: "Wallets & Credits", icon: Wallet },
      { href: "/actions", label: "Ops Actions", icon: AlertCircle },
    ],
    [tenant.key],
  );

  return (
    <nav className="bg-gray-900 border-b border-gray-800 shadow-lg backdrop-blur-sm bg-opacity-90 sticky top-0 z-50">
      <div className="px-4 mx-auto">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <span className="text-white font-semibold text-xl tracking-tight">Agent Platform</span>
            <div className="ml-10 flex items-center space-x-1">
              {menuItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-200 cursor-pointer",
                      location === item.href
                        ? "bg-gray-800 text-white shadow-sm border border-gray-700/50"
                        : "text-gray-300 hover:bg-gray-800/50 hover:text-white hover:shadow-sm"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
