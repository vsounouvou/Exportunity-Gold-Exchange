import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  Mail,
  MessageSquare,
  Network,
  ClipboardList,
  Zap,
  Wallet,
  BookOpen,
  Brain,
  Building2,
  Calendar,
  Menu,
  LogOut,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
  Target,
  Truck,
  LayoutDashboard,
  BarChart3,
  Coins,
  User,
  ShoppingBag,
  FileSignature,
  ShieldCheck,
  MapPin,
  Image,
  ImageDown,
  Megaphone,
  DollarSign,
  Search,
  RefreshCw,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChairmanChatDock } from "./ChairmanChatDock";
import { BrandMark } from "@/components/branding/index.ts";
import { useTenant } from "@/lib/tenant";
import { getTenantDefaultRoute, isTenantRouteAllowed } from "@/lib/tenantPolicy";
import { getTenantStandardAdminIa, resolveTenantAdminAliasDestination } from "@/lib/adminIa";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { type AdminNavIconKey } from "@/lib/adminNavRegistry";
import { NAV_GROUPS } from "@/navigation/routes.manifest";
import { CompanyProvider } from "@/hooks/use-company";
import { UserProvider } from "@/hooks/use-user";
import { ChairmanProvider } from "@/hooks/use-chairman-context";
import BuildInfoFooter from "@/components/BuildInfoFooter";
import { apiRequest } from "@/lib/queryClient";

interface AdminLayoutProps {
  children: ReactNode;
}

type DepartmentManagerContext = {
  page_key: string;
  manager_agent_id: number;
  manager_name: string | null;
  manager_role: string | null;
  manager_domain: string | null;
  open_issues?: number | null;
  last_report_at?: string | null;
};

const ICONS: Record<AdminNavIconKey, any> = {
  Calendar,
  LayoutDashboard,
  BarChart3,
  Building2,
  MapPin,
  Brain,
  Users,
  Network,
  ClipboardList,
  Zap,
  Wallet,
  Coins,
  BookOpen,
  Store,
  ShoppingBag,
  FileSignature,
  ShieldCheck,
  Truck,
  ImageDown,
  Image,
  Megaphone,
  DollarSign,
  Search,
  RefreshCw,
  User,
  Target,
  MessageSquare,
  Mail,
};

function resolveDepartmentPageKey(pathname: string) {
  const path = String(pathname || "").toLowerCase();
  if (
    path.startsWith("/ai-team") ||
    path.startsWith("/operations") ||
    path.startsWith("/agenda") ||
    path.startsWith("/tasks") ||
    path.startsWith("/actions")
  ) {
    return "operations";
  }
  if (path.startsWith("/finance") || path.startsWith("/admin/wallet")) return "finance";
  if (path.startsWith("/admin/stamped-gold") || path.startsWith("/gold-stamping")) return "gold-stamping";
  if (
    path.startsWith("/commerce/ai-marketplace") ||
    path.startsWith("/admin/marketplace") ||
    path.startsWith("/marketplace") ||
    path.startsWith("/sellers") ||
    path.startsWith("/seller")
  ) {
    return "marketplace";
  }
  if (path.startsWith("/delivery") || path.startsWith("/admin/equipment-ops")) return "logistics";
  if (path.startsWith("/marketing") || path.startsWith("/admin/website")) return "growth";
  if (path.startsWith("/territories")) return "territories";
  if (path.startsWith("/admin/agents") || path.startsWith("/agents")) return "hr";
  return null;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useSession();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { brand, tenant } = useTenant();
  const { t } = useLocale();
  const managerPageKey = resolveDepartmentPageKey(location);
  const managerDispatchRef = useRef<string | null>(null);

  const managerContextQuery = useQuery<{
    ok: boolean;
    item: DepartmentManagerContext | null;
    page: { key: string; label: string };
  }>({
    queryKey: managerPageKey ? [`/api/v2/departments/context/${managerPageKey}`] : ["__no_department_manager__"],
    enabled: Boolean(managerPageKey),
    staleTime: 20_000,
    retry: false,
    queryFn: async () => {
      if (!managerPageKey) throw new Error("No department page key");
      return apiRequest(`/api/v2/departments/context/${managerPageKey}`, "GET");
    },
  });

  useEffect(() => {
    if (!managerPageKey) return;
    const payload = managerContextQuery.data;
    const manager = payload?.item;
    const page = payload?.page;
    const detail = {
      pageKey: managerPageKey,
      pageLabel: page?.label || managerPageKey,
      managerAgentId: manager?.manager_agent_id || null,
      managerName: manager?.manager_name || null,
      managerRole: manager?.manager_role || null,
    };
    const dispatchKey = `${managerPageKey}:${detail.managerAgentId || "none"}`;
    if (managerDispatchRef.current === dispatchKey) return;
    managerDispatchRef.current = dispatchKey;
    window.dispatchEvent(new CustomEvent("chairman-dock:context", { detail }));
    window.dispatchEvent(new CustomEvent("chairman-dock:open", { detail }));
  }, [managerContextQuery.data, managerPageKey]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const notificationsQuery = useQuery<{
    ok: boolean;
    items: Array<{
      notification: {
        id: number;
        title: string | null;
        message: string | null;
        status: string;
        createdAt: string;
        readAt: string | null;
      };
      deliveries: Array<{ id: number; channel: string; status: string }>;
    }>;
  }>({
    queryKey: ["/api/notifications?limit=12"],
    queryFn: async () => apiRequest("/api/notifications?limit=12", "GET"),
    staleTime: 30_000,
  });

  const markNotificationReadMutation = useMutation({
    mutationFn: async (notificationId: number) =>
      apiRequest("/api/notifications/read", "POST", { notificationIds: [notificationId] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications?limit=12"] });
    },
  });

  const notificationItems = notificationsQuery.data?.items || [];
  const unreadCount = notificationItems.reduce((count, item) => (item.notification.readAt ? count : count + 1), 0);

  const navStateStorageKey = useMemo(
    () => `admin-nav-collapse:${tenant.key}:${user?.id || "anonymous"}`,
    [tenant.key, user?.id],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(navStateStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      setCollapsedGroups(parsed as Record<string, boolean>);
    } catch {
      // ignore invalid state
    }
  }, [navStateStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(navStateStorageKey, JSON.stringify(collapsedGroups));
    } catch {
      // ignore storage failures
    }
  }, [collapsedGroups, navStateStorageKey]);

  const sidebarGroups = useMemo(() => {
    const query = sidebarQuery.trim().toLowerCase();
    return NAV_GROUPS.map((group) => {
      const includeItem = (item: { label: string; path: string; subgroup?: string }) => {
        if (!isTenantRouteAllowed(item.path, tenant.key)) return false;
        if (!query) return true;
        return (
          item.label.toLowerCase().includes(query) ||
          item.path.toLowerCase().includes(query) ||
          String(item.subgroup || "")
            .toLowerCase()
            .includes(query)
        );
      };

      const mapItem = (item: { icon?: AdminNavIconKey; path: string; label: string; subgroup?: string }) => ({
        ...item,
        icon: item.icon ? ICONS[item.icon] : LayoutDashboard,
        route: item.path,
        href: item.path,
      });

      const items = group.items.filter(includeItem).map(mapItem);
      const subgroups = (group.subgroups || [])
        .map((subgroup) => ({
          ...subgroup,
          items: subgroup.items.filter(includeItem).map(mapItem),
        }))
        .filter((subgroup) => subgroup.items.length > 0);

      return {
        ...group,
        items,
        subgroups,
      };
    }).filter((group) => group.items.length > 0 || group.subgroups.length > 0);
  }, [sidebarQuery, tenant.key]);

  const operationsQuickAccessActive = location === "/ai-team" || location.startsWith("/ai-team/");
  const internalAgentsQuickAccessActive =
    location === "/operations/agents" || location.startsWith("/operations/agents/");
  const inboxQuickAccessActive = location === "/admin/inbox" || location.startsWith("/admin/inbox/");
  const tenantHomePath = useMemo(() => getTenantDefaultRoute(tenant.key), [tenant.key]);
  const showOperationsQuickAccess = isTenantRouteAllowed("/ai-team", tenant.key);
  const showInboxQuickAccess = isTenantRouteAllowed("/admin/inbox", tenant.key);
  const showInternalAgentsQuickAccess = isTenantRouteAllowed("/operations/agents", tenant.key);
  const standardAdminIa = useMemo(
    () =>
      getTenantStandardAdminIa(tenant.key).filter(
        (item) =>
          isTenantRouteAllowed(item.canonicalPath, tenant.key) &&
          isTenantRouteAllowed(item.destination, tenant.key),
      ),
    [tenant.key],
  );

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isEntryCollapsed = (entryId: string, mobile: boolean) => (mobile ? false : Boolean(collapsedGroups[entryId]));

  const NavLinks = ({ onNavigate, mobile = false }: { onNavigate?: () => void; mobile?: boolean }) => (
    <div className="space-y-3">
      {sidebarGroups.map((group) => {
        const isCollapsed = isEntryCollapsed(group.groupId, mobile);
        return (
          <div key={group.groupId} className="rounded-lg border border-gray-800/70 bg-gray-900/40">
            <button
              type="button"
              className="w-full px-3 py-2 flex items-center justify-between text-left text-xs font-semibold text-gray-300 uppercase tracking-wide"
              onClick={() => toggleGroup(group.groupId)}
            >
              <span>{group.label}</span>
              {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {!isCollapsed ? (
              <div className="pb-2 space-y-1">
                {group.items.map((item) => {
                  const isActive = location === item.route || location.startsWith(item.route + "/");
                  return (
                    <Link key={item.path} href={item.href}>
                      <div
                        onClick={onNavigate}
                        className={cn(
                          "mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] cursor-pointer transition-colors",
                          isActive
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "text-gray-300 hover:bg-gray-800/80 hover:text-white",
                        )}
                      >
                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </div>
                    </Link>
                  );
                })}

                {group.subgroups.map((subgroup) => {
                  const subgroupCollapsed = isEntryCollapsed(subgroup.id, mobile);
                  return (
                    <div key={subgroup.id} className="mx-2 rounded-md border border-gray-800/80 bg-gray-950/70">
                      <button
                        type="button"
                        className="w-full px-2 py-1.5 flex items-center justify-between text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide"
                        onClick={() => toggleGroup(subgroup.id)}
                      >
                        <span>{subgroup.label}</span>
                        {subgroupCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {!subgroupCollapsed ? (
                        <div className="pb-1">
                          {subgroup.items.map((item) => {
                            const isActive = location === item.route || location.startsWith(item.route + "/");
                            return (
                              <Link key={item.path} href={item.href}>
                                <div
                                  onClick={onNavigate}
                                  className={cn(
                                    "mx-1.5 mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] cursor-pointer transition-colors",
                                    isActive
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                      : "text-gray-300 hover:bg-gray-800/80 hover:text-white",
                                  )}
                                >
                                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{item.label}</span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
      {!sidebarGroups.length ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 text-xs text-gray-400">
          No pages found for this search.
        </div>
      ) : null}
    </div>
  );

  return (
    <UserProvider>
      <CompanyProvider>
        <ChairmanProvider>
          <div className="min-h-screen flex flex-col bg-gray-950 [--admin-header-height:calc(3.5rem+env(safe-area-inset-top,0px))]">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-gray-900/75 pt-safe">
        <div className="flex h-14 items-center px-4 gap-4">
          {/* Mobile Menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" className="text-gray-400">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-gray-900 border-gray-800 p-4">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-amber-500">{brand.name}</h2>
                <p className="text-xs text-gray-500">All pages</p>
                <div className="relative mt-3">
                  <Search className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={sidebarQuery}
                    onChange={(event) => setSidebarQuery(event.target.value)}
                    placeholder="Search pages..."
                    className="w-full h-9 rounded-md bg-gray-950 border border-gray-800 pl-9 pr-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
                  />
                </div>
              </div>
              <ScrollArea className="h-[calc(100vh-180px)]">
                <NavLinks mobile onNavigate={() => setMobileOpen(false)} />
              </ScrollArea>
              <div className="pt-4 border-t border-gray-800 mt-4">
                <Link href="/" onClick={() => setMobileOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer">
                    <ShoppingBag className="h-4 w-4" />
                    Back to Marketplace
                  </div>
                </Link>
              </div>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link href={tenantHomePath}>
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <BrandMark title={brand.name} className="h-4 w-4 text-amber-400" />
              </div>
              <span className="hidden sm:inline font-semibold text-white">{brand.name}</span>
            </div>
          </Link>


          <div className="flex-1" />

          {/* Quick Access */}
          {showOperationsQuickAccess ? (
            <Link href="/ai-team">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "hidden md:flex",
                  operationsQuickAccessActive
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-gray-400 hover:text-gray-200"
                )}
                data-testid="top-quick-operations-hq"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Operations Center HQ
              </Button>
            </Link>
          ) : null}

          {showInboxQuickAccess ? (
            <Link href="/admin/inbox">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "hidden md:flex",
                  inboxQuickAccessActive
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-gray-400 hover:text-gray-200"
                )}
                data-testid="top-quick-inbox"
              >
                <Mail className="h-4 w-4 mr-2" />
                Inbox
              </Button>
            </Link>
          ) : null}

          {showInternalAgentsQuickAccess ? (
            <Link href="/operations/agents">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "hidden md:flex",
                  internalAgentsQuickAccessActive
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-gray-400 hover:text-gray-200"
                )}
                data-testid="top-quick-internal-agents"
              >
                <Users className="h-4 w-4 mr-2" />
                Internal Agents
              </Button>
            </Link>
          ) : null}

          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn("hidden md:flex", "text-gray-400 hover:text-gray-200")}
          >
            <a href="https://mail.exportunity.net/" target="_blank" rel="noreferrer">
              <Mail className="h-4 w-4 mr-2" />
              Webmail
            </a>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative text-gray-400 hover:text-gray-200">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-amber-500 text-[10px] px-1 text-black font-semibold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96 max-w-[90vw] bg-gray-900 border-gray-800">
              <DropdownMenuLabel className="text-white">Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-gray-800" />
              <div className="max-h-[420px] overflow-auto">
                {notificationItems.length ? (
                  notificationItems.map((item) => {
                    const n = item.notification;
                    const deliverySummary = item.deliveries
                      .map((d) => `${d.channel}:${d.status}`)
                      .slice(0, 2)
                      .join(" • ");
                    return (
                      <DropdownMenuItem
                        key={n.id}
                        className={cn(
                          "cursor-pointer whitespace-normal p-0 focus:bg-gray-800",
                          !n.readAt ? "bg-amber-500/5" : "",
                        )}
                        onClick={() => {
                          if (!n.readAt) markNotificationReadMutation.mutate(n.id);
                        }}
                      >
                        <div className="w-full p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-gray-100 truncate">
                              {n.title || "System notification"}
                            </span>
                            {!n.readAt ? <span className="h-2 w-2 rounded-full bg-amber-400" /> : null}
                          </div>
                          <p className="mt-1 text-xs text-gray-300 line-clamp-2">{n.message || "No message"}</p>
                          <div className="mt-1 text-[11px] text-gray-500 flex items-center justify-between gap-2">
                            <span>{new Date(n.createdAt).toLocaleString()}</span>
                            <span className="truncate">{deliverySummary || n.status}</span>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    );
                  })
                ) : (
                  <div className="p-3 text-sm text-gray-400">No notifications.</div>
                )}
              </div>
              <DropdownMenuSeparator className="bg-gray-800" />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/admin/notifications">
                  <Bell className="h-4 w-4 mr-2" />
                  View all notifications
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <TenantSwitcher />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-amber-500/20 text-amber-400">
                    {user?.displayName?.charAt(0)?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-gray-900 border-gray-800">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium text-white">{user?.displayName || "User"}</span>
                  <span className="text-xs text-gray-500">{user?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-gray-800" />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/profile">
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer md:hidden">
                <Link href="/">
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  Marketplace
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/admin/system/update">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Update / Reset
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-800" />
              <DropdownMenuItem 
                className="cursor-pointer text-red-400 focus:text-red-400"
                onClick={() => {
                  logout();
                  window.location.href = "/";
                }}
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t("common.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside
          className={cn(
            "hidden lg:flex h-[calc(100vh-var(--admin-header-height))] shrink-0 flex-col border-r border-gray-800 bg-gray-900/70 transition-all duration-200",
            sidebarCollapsed ? "w-16" : "w-80",
          )}
        >
          <div className="p-3 border-b border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-300 hover:text-white"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
              {!sidebarCollapsed ? (
                <span className="text-xs font-semibold tracking-wide uppercase text-gray-300">All Pages</span>
              ) : null}
            </div>
            {!sidebarCollapsed ? (
              <div className="relative">
                <Search className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={sidebarQuery}
                  onChange={(event) => setSidebarQuery(event.target.value)}
                  placeholder="Search pages..."
                  className="w-full h-9 rounded-md bg-gray-950 border border-gray-800 pl-9 pr-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
                />
              </div>
            ) : null}
          </div>

          <ScrollArea className="flex-1 p-3">
            {!sidebarCollapsed ? (
              <NavLinks />
            ) : (
              <div className="space-y-2">
                {sidebarGroups.map((group) => (
                  <div key={group.groupId} className="rounded-md border border-gray-800/80 bg-gray-900/70 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 text-center">{group.label[0]}</div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </aside>

        <main className="flex-1 min-w-0 overflow-auto">
          {standardAdminIa.length ? (
            <div className="border-b border-gray-800 bg-gray-950/70 px-4 py-2">
              <div className="flex items-center gap-2 overflow-x-auto">
                {standardAdminIa.map((item) => {
                  const destination = resolveTenantAdminAliasDestination(tenant.key, item.key);
                  const active =
                    location === item.canonicalPath ||
                    location.startsWith(`${item.canonicalPath}/`) ||
                    location === destination ||
                    location.startsWith(`${destination}/`);
                  return (
                    <Link key={item.key} href={item.canonicalPath}>
                      <div
                        className={cn(
                          "whitespace-nowrap rounded-md border px-3 py-1.5 text-xs transition-colors",
                          active
                            ? "border-amber-500/40 bg-amber-500/20 text-amber-200"
                            : "border-gray-800 bg-gray-900/60 text-gray-300 hover:bg-gray-800/80 hover:text-white",
                        )}
                      >
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
          {managerPageKey && managerContextQuery.data?.page ? (
            <div className="border-b border-gray-800 bg-gray-900/70 px-4 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-gray-300">
                <span>
                  Department: <span className="text-white font-medium">{managerContextQuery.data.page.label}</span>
                </span>
                <span>
                  Manager:{" "}
                  <span className="text-white font-medium">
                    {managerContextQuery.data.item?.manager_name || "Not assigned"}
                  </span>
                </span>
                <span>
                  Open issues:{" "}
                  <span className="text-amber-300 font-medium">
                    {Number(managerContextQuery.data.item?.open_issues || 0)}
                  </span>
                </span>
                <span>
                  Last report:{" "}
                  <span className="text-gray-200">
                    {managerContextQuery.data.item?.last_report_at
                      ? new Date(managerContextQuery.data.item.last_report_at).toLocaleString()
                      : "n/a"}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-blue-300 hover:text-blue-200 hover:bg-blue-500/10"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("chairman-dock:open", {
                        detail: {
                          pageKey: managerPageKey,
                          pageLabel: managerContextQuery.data?.page?.label || managerPageKey,
                          managerAgentId: managerContextQuery.data?.item?.manager_agent_id || null,
                          managerName: managerContextQuery.data?.item?.manager_name || null,
                          managerRole: managerContextQuery.data?.item?.manager_role || null,
                        },
                      }),
                    );
                  }}
                >
                  Open manager chat
                </Button>
              </div>
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <BuildInfoFooter />

            {/* Chairman Assistant - Persistent Chat Dock */}
            <ChairmanChatDock />
          </div>
        </ChairmanProvider>
      </CompanyProvider>
    </UserProvider>
  );
}
