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
  Cloud,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChairmanChatDock } from "./ChairmanChatDock";
import { BrandMark } from "@/components/branding/index.ts";
import { useTenant } from "@/lib/tenant";
import { getTenantAdminHomeRoute, isTenantAdminNavVisible, isTenantRouteAllowed } from "@/lib/tenantPolicy";
import { getTenantStandardAdminIa, resolveTenantAdminAliasDestination } from "@/lib/adminIa";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
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

type AdminLanguage = "en" | "fr" | "ar";

const adminUiCopy: Record<AdminLanguage, Record<string, string>> = {
  en: {
    allPages: "All pages",
    searchPages: "Search pages...",
    noPages: "No pages found for this search.",
    backToMarketplace: "Back to marketplace",
    operationsCenter: "Operations Center HQ",
    inbox: "Inbox",
    internalAgents: "Internal agents",
    webmail: "Webmail",
    notifications: "Notifications",
    viewAllNotifications: "View all notifications",
    noNotifications: "No notifications.",
    systemNotification: "System notification",
    noMessage: "No message",
    profile: "Profile",
    marketplace: "Marketplace",
    updateReset: "Update / reset",
    department: "Department",
    manager: "Manager",
    notAssigned: "Not assigned",
    openIssues: "Open issues",
    lastReport: "Last report",
    openManagerChat: "Open manager chat",
    adminInterface: "Admin interface",
    openSidebar: "Open sidebar",
    closeSidebar: "Close sidebar",
  },
  fr: {
    allPages: "Toutes les pages",
    searchPages: "Rechercher une page...",
    noPages: "Aucune page trouvee pour cette recherche.",
    backToMarketplace: "Retour au marche",
    operationsCenter: "Centre des operations",
    inbox: "Boite de reception",
    internalAgents: "Equipe et agents",
    webmail: "Webmail",
    notifications: "Notifications",
    viewAllNotifications: "Voir toutes les notifications",
    noNotifications: "Aucune notification.",
    systemNotification: "Notification systeme",
    noMessage: "Aucun message",
    profile: "Profil",
    marketplace: "Marche",
    updateReset: "Mise a jour / reset",
    department: "Departement",
    manager: "Responsable",
    notAssigned: "Non assigne",
    openIssues: "Points ouverts",
    lastReport: "Dernier rapport",
    openManagerChat: "Ouvrir le chat responsable",
    adminInterface: "Interface administration",
    openSidebar: "Ouvrir la navigation",
    closeSidebar: "Fermer la navigation",
  },
  ar: {
    allPages: "كل الصفحات",
    searchPages: "ابحث عن صفحة...",
    noPages: "لا توجد صفحات مطابقة لهذا البحث.",
    backToMarketplace: "العودة إلى السوق",
    operationsCenter: "مركز العمليات",
    inbox: "صندوق الوارد",
    internalAgents: "الوكلاء الداخليون",
    webmail: "البريد",
    notifications: "الإشعارات",
    viewAllNotifications: "عرض كل الإشعارات",
    noNotifications: "لا توجد إشعارات.",
    systemNotification: "إشعار النظام",
    noMessage: "لا توجد رسالة",
    profile: "الملف الشخصي",
    marketplace: "السوق",
    updateReset: "تحديث / إعادة ضبط",
    department: "القسم",
    manager: "المسؤول",
    notAssigned: "غير مخصص",
    openIssues: "المسائل المفتوحة",
    lastReport: "آخر تقرير",
    openManagerChat: "فتح محادثة المسؤول",
    adminInterface: "واجهة الإدارة",
    openSidebar: "فتح التنقل",
    closeSidebar: "إغلاق التنقل",
  },
};

const adminNavLabelCopy: Record<AdminLanguage, Record<string, string>> = {
  en: {},
  fr: {
    Overview: "Vue d'ensemble",
    Agents: "Agents",
    Operations: "Operations",
    Trade: "Commerce",
    Assets: "Actifs",
    Territories: "Territoires",
    Finance: "Finance",
    Settings: "Parametres",
    System: "Systeme",
    Dashboard: "Tableau de bord",
    Companies: "Entreprises",
    "Org Hierarchy": "Hierarchie",
    "Internal Agents": "Equipe et agents",
    "AI Marketplace Agents": "Agents marketplace IA",
    "Agents OS": "Registre des agents",
    "Action Forge": "Forge actions",
    "Operations Center HQ": "Centre des operations",
    Agenda: "Agenda",
    "Video meetings": "Reunions video",
    Tasks: "Taches",
    Objectives: "Objectifs",
    Actions: "Actions",
    Knowledge: "Connaissance",
    "Expert Clones": "Clones experts",
    Inbox: "Boite de reception",
    Mail: "Courrier",
    Workstations: "Postes de travail",
    Evidence: "Preuves",
    Notifications: "Notifications",
    Bureaus: "Bureaux",
    Contracts: "Contrats",
    Delivery: "Livraison",
    "Marketplace Products": "Produits marketplace",
    "Marketplace Payments": "Paiements marketplace",
    Marketing: "Marketing",
    Sales: "Ventes",
    "Lead Hunter": "Prospection",
    "Gold Stamping": "Or certifie",
    "Gold Stamping Hub": "Centre or certifie",
    "Stamped Gold SKUs": "References or certifie",
    "Stamped Gold Items": "Pieces or certifie",
    "Stamped Gold Jewellers": "Bijoutiers or certifie",
    "Stamped Gold Scans": "Scans or certifie",
    "Stamped Gold Pickup": "Collecte or certifie",
    Machinery: "Machines",
    Media: "Media",
    "Asset Studio": "Studio visuel",
    "Map Icons": "Icones carte",
    "Wallet Hub": "Centre portefeuille",
    Wallet: "Portefeuille",
    "Wallet Accounts": "Comptes portefeuille",
    "Wallet Ledger": "Grand livre",
    "Wallet Topups": "Rechargements",
    "Wallet Payouts": "Paiements sortants",
    "Wallet Vouchers": "Bons",
    "Wallet Sellers": "Vendeurs",
    "Wallet Risk": "Risque portefeuille",
    "Wallet Config": "Configuration portefeuille",
    "System Hub": "Centre systeme",
    "SEO Hub": "Centre SEO",
    "SEO Health": "Sante SEO",
    "SEO Autopilot": "SEO autopilote",
    "Visits Intelligence": "Analyse des visites",
    Communications: "Communications",
    "Email Control Center": "Centre email",
    Contacts: "Contacts",
    "User Management": "Gestion utilisateurs",
  },
  ar: {
    Overview: "نظرة عامة",
    Agents: "الوكلاء",
    Operations: "العمليات",
    Trade: "التجارة",
    Assets: "الأصول",
    Territories: "المناطق",
    Finance: "المالية",
    Settings: "الإعدادات",
    System: "النظام",
    Dashboard: "لوحة التحكم",
    Companies: "الشركات",
    "Org Hierarchy": "الهيكل التنظيمي",
    "Internal Agents": "الوكلاء الداخليون",
    "AI Marketplace Agents": "وكلاء سوق الذكاء الاصطناعي",
    "Agents OS": "نظام الوكلاء",
    "Action Forge": "إنشاء الإجراءات",
    "Operations Center HQ": "مركز العمليات",
    Agenda: "الأجندة",
    Meetings: "الاجتماعات",
    Tasks: "المهام",
    Objectives: "الأهداف",
    Actions: "الإجراءات",
    Knowledge: "المعرفة",
    "Expert Clones": "نسخ الخبراء",
    Inbox: "صندوق الوارد",
    Mail: "البريد",
    Workstations: "محطات العمل",
    Evidence: "الأدلة",
    Notifications: "الإشعارات",
    Bureaus: "المكاتب",
    Contracts: "العقود",
    Delivery: "التسليم",
    "Marketplace Products": "منتجات السوق",
    "Marketplace Payments": "مدفوعات السوق",
    Marketing: "التسويق",
    Sales: "المبيعات",
    "Lead Hunter": "البحث عن العملاء",
    "Gold Stamping": "ختم الذهب",
    "Gold Stamping Hub": "مركز ختم الذهب",
    "Stamped Gold SKUs": "رموز الذهب المختوم",
    "Atelier de frappe": "ورشة الختم",
    "Stamped Gold Items": "قطع الذهب المختوم",
    "Stamped Gold Jewellers": "صاغة الذهب المختوم",
    "Stamped Gold Scans": "مسح الذهب المختوم",
    "Stamped Gold Pickup": "استلام الذهب المختوم",
    Machinery: "المعدات",
    Media: "الوسائط",
    "Asset Studio": "استوديو الأصول",
    "Map Icons": "أيقونات الخريطة",
    "Wallet Hub": "مركز المحفظة",
    Wallet: "المحفظة",
    "Wallet Accounts": "حسابات المحفظة",
    "Wallet Ledger": "سجل المحفظة",
    "Wallet Topups": "تعبئة المحفظة",
    "Wallet Payouts": "مدفوعات المحفظة",
    "Wallet Vouchers": "قسائم المحفظة",
    "Wallet Sellers": "بائعو المحفظة",
    "Wallet Risk": "مخاطر المحفظة",
    "Wallet Config": "إعدادات المحفظة",
    "System Hub": "مركز النظام",
    "SEO Hub": "مركز SEO",
    "SEO Health": "صحة SEO",
    "SEO Autopilot": "SEO تلقائي",
    "Visits Intelligence": "تحليل الزيارات",
    Communications: "الاتصالات",
    "Email Control Center": "مركز البريد",
    Contacts: "جهات الاتصال",
    "User Management": "إدارة المستخدمين",
  },
};

function adminCopy(language: string, key: string) {
  const lang = (language === "fr" || language === "ar" ? language : "en") as AdminLanguage;
  return adminUiCopy[lang][key] || adminUiCopy.en[key] || key;
}

function adminNavLabel(language: string, label: string) {
  const lang = (language === "fr" || language === "ar" ? language : "en") as AdminLanguage;
  return adminNavLabelCopy[lang][label] || label;
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
  Cloud,
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
  if (path.startsWith("/admin/agents") || path.startsWith("/agents")) return "organization";
  return null;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useSession();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { brand, tenant } = useTenant();
  const { t, language } = useLocale();
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
        if (!isTenantAdminNavVisible(item.path, tenant.key)) return false;
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
        label: adminNavLabel(language, item.label),
        subgroup: item.subgroup ? adminNavLabel(language, item.subgroup) : item.subgroup,
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
        label: adminNavLabel(language, group.label),
        items,
        subgroups: subgroups.map((subgroup) => ({ ...subgroup, label: adminNavLabel(language, subgroup.label) })),
      };
    }).filter((group) => group.items.length > 0 || group.subgroups.length > 0);
  }, [language, sidebarQuery, tenant.key]);

  const operationsQuickAccessActive = location === "/ai-team" || location.startsWith("/ai-team/");
  const internalAgentsQuickAccessActive =
    location === "/operations/agents" || location.startsWith("/operations/agents/");
  const inboxQuickAccessActive = location === "/admin/inbox" || location.startsWith("/admin/inbox/");
  const tenantHomePath = useMemo(() => getTenantAdminHomeRoute(tenant.key), [tenant.key]);
  const showOperationsQuickAccess = isTenantRouteAllowed("/ai-team", tenant.key);
  const showInboxQuickAccess = isTenantRouteAllowed("/admin/inbox", tenant.key);
  const showInternalAgentsQuickAccess = isTenantRouteAllowed("/operations/agents", tenant.key);
  const standardAdminIa = useMemo(
    () =>
      tenant.key === "exportunity"
        ? []
        : getTenantStandardAdminIa(tenant.key).filter(
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
          <div key={group.groupId} className="admin-shell-nav-card rounded-lg border">
            <button
              type="button"
              aria-expanded={!isCollapsed}
              className="admin-shell-nav-button flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide"
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
                            ? "admin-shell-active border"
                            : "admin-shell-nav-item hover:bg-slate-50",
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
                    <div key={subgroup.id} className="admin-shell-nav-subgroup mx-2 rounded-md border">
                      <button
                        type="button"
                        aria-expanded={!subgroupCollapsed}
                        className="admin-shell-nav-button flex w-full items-center justify-between px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide"
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
                                      ? "admin-shell-active border"
                                      : "admin-shell-nav-item hover:bg-slate-50",
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
        <div className="admin-shell-nav-card admin-shell-muted rounded-lg border p-3 text-xs">
          {adminCopy(language, "noPages")}
        </div>
      ) : null}
    </div>
  );

  return (
    <UserProvider>
      <CompanyProvider>
        <ChairmanProvider>
          <div className="exportunity-admin-shell min-h-screen flex flex-col bg-[#F7F8FA] text-slate-950 [--admin-header-height:calc(3.5rem+env(safe-area-inset-top,0px))]">
            <style>{`
              .exportunity-admin-shell header,
              .exportunity-admin-shell .admin-shell-sidebar,
              .exportunity-admin-shell .admin-shell-subnav,
              .exportunity-admin-shell .admin-shell-context {
                background: rgba(255,255,255,0.94) !important;
                border-color: rgba(15,23,42,0.12) !important;
                color: #111827 !important;
              }
              .exportunity-admin-shell .admin-shell-nav-card,
              .exportunity-admin-shell .admin-shell-nav-subgroup,
              .exportunity-admin-shell .admin-shell-dropdown {
                background: #ffffff !important;
                border-color: rgba(15,23,42,0.12) !important;
                color: #111827 !important;
              }
              .exportunity-admin-shell .admin-shell-nav-button,
              .exportunity-admin-shell .admin-shell-muted,
              .exportunity-admin-shell .admin-shell-link-muted {
                color: #4b5563 !important;
              }
              .exportunity-admin-shell .admin-shell-nav-item {
                color: #334155 !important;
              }
              .exportunity-admin-shell .admin-shell-nav-item:hover {
                background: #f8fafc !important;
                color: #111827 !important;
              }
              .exportunity-admin-shell .admin-shell-active {
                background: rgba(245,166,35,0.16) !important;
                border-color: rgba(245,166,35,0.45) !important;
                color: #07111f !important;
              }
              .exportunity-admin-shell .admin-shell-search {
                background: #ffffff !important;
                border-color: rgba(15,23,42,0.16) !important;
                color: #111827 !important;
              }
              .exportunity-admin-shell .admin-shell-search::placeholder {
                color: #64748b !important;
              }
              .exportunity-admin-shell .admin-shell-brand-text,
              .exportunity-admin-shell .admin-shell-strong {
                color: #111827 !important;
              }
            `}</style>
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 pt-safe">
        <div className="flex h-14 items-center px-4 gap-4">
          {/* Mobile Menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" className="text-slate-600 hover:text-slate-950" aria-label={t("common.menu")}>
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-slate-200 bg-white p-4 text-slate-950">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-amber-500">{brand.name}</h2>
                <p className="admin-shell-muted text-xs">{adminCopy(language, "allPages")}</p>
                <div className="mt-3 flex flex-col gap-2 sm:hidden">
                  <LocaleSwitcher compact />
                  <TenantSwitcher />
                </div>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="search"
                    value={sidebarQuery}
                    onChange={(event) => setSidebarQuery(event.target.value)}
                    placeholder={adminCopy(language, "searchPages")}
                    className="admin-shell-search h-9 w-full rounded-md border pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/60"
                  />
                </div>
              </div>
              <ScrollArea className="h-[calc(100vh-180px)]">
                <NavLinks mobile onNavigate={() => setMobileOpen(false)} />
              </ScrollArea>
              <div className="mt-4 border-t border-slate-200 pt-4">
                <Link href="/" onClick={() => setMobileOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer">
                    <ShoppingBag className="h-4 w-4" />
                    {adminCopy(language, "backToMarketplace")}
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
              <span className="admin-shell-brand-text hidden font-semibold sm:inline">{brand.name}</span>
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
                    : "text-slate-600 hover:text-slate-950"
                )}
                data-testid="top-quick-operations-hq"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                {adminCopy(language, "operationsCenter")}
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
                    : "text-slate-600 hover:text-slate-950"
                )}
                data-testid="top-quick-inbox"
              >
                <Mail className="h-4 w-4 mr-2" />
                {adminCopy(language, "inbox")}
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
                    : "text-slate-600 hover:text-slate-950"
                )}
                data-testid="top-quick-internal-agents"
              >
                <Users className="h-4 w-4 mr-2" />
                {adminCopy(language, "internalAgents")}
              </Button>
            </Link>
          ) : null}

          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn("hidden md:flex", "text-slate-600 hover:text-slate-950")}
          >
            <a href="https://mail.exportunity.net/" target="_blank" rel="noreferrer">
              <Mail className="h-4 w-4 mr-2" />
              {adminCopy(language, "webmail")}
            </a>
          </Button>

          <div className="hidden items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/12 px-2 py-1 text-[11px] font-bold text-slate-900 sm:flex">
            {adminCopy(language, "adminInterface")}
          </div>

          <div className="hidden sm:block">
            <LocaleSwitcher compact />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative text-slate-600 hover:text-slate-950"
                aria-label={adminCopy(language, "notifications")}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-amber-500 text-[10px] px-1 text-black font-semibold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="admin-shell-dropdown w-96 max-w-[90vw]">
              <DropdownMenuLabel className="admin-shell-strong">{adminCopy(language, "notifications")}</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-200" />
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
                          "cursor-pointer whitespace-normal p-0 focus:bg-slate-100",
                          !n.readAt ? "bg-amber-500/5" : "",
                        )}
                        onClick={() => {
                          if (!n.readAt) markNotificationReadMutation.mutate(n.id);
                        }}
                      >
                        <div className="w-full p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-slate-950">
                              {n.title || adminCopy(language, "systemNotification")}
                            </span>
                            {!n.readAt ? <span className="h-2 w-2 rounded-full bg-amber-400" /> : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                            {n.message || adminCopy(language, "noMessage")}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span>{new Date(n.createdAt).toLocaleString()}</span>
                            <span className="truncate">{deliverySummary || n.status}</span>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    );
                  })
                ) : (
                  <div className="p-3 text-sm text-slate-500">{adminCopy(language, "noNotifications")}</div>
                )}
              </div>
              <DropdownMenuSeparator className="bg-slate-200" />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/admin/notifications">
                  <Bell className="h-4 w-4 mr-2" />
                  {adminCopy(language, "viewAllNotifications")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="hidden sm:block">
            <TenantSwitcher />
          </div>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label={adminCopy(language, "profile")}>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-amber-500/20 text-amber-400">
                    {user?.displayName?.charAt(0)?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="admin-shell-dropdown w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium text-slate-950">{user?.displayName || "User"}</span>
                  <span className="text-xs text-slate-500">{user?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-200" />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/profile">
                  <User className="h-4 w-4 mr-2" />
                  {adminCopy(language, "profile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer md:hidden">
                <Link href="/">
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  {adminCopy(language, "marketplace")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/admin/system/update">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {adminCopy(language, "updateReset")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-200" />
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
            "admin-shell-sidebar hidden h-[calc(100vh-var(--admin-header-height))] shrink-0 flex-col border-r transition-all duration-200 lg:flex",
            sidebarCollapsed ? "w-16" : "w-80",
          )}
        >
          <div className="border-b border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-600 hover:text-slate-950"
                aria-label={adminCopy(language, sidebarCollapsed ? "openSidebar" : "closeSidebar")}
                onClick={() => setSidebarCollapsed((prev) => !prev)}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
              {!sidebarCollapsed ? (
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {adminCopy(language, "allPages")}
                </span>
              ) : null}
            </div>
            {!sidebarCollapsed ? (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={sidebarQuery}
                  onChange={(event) => setSidebarQuery(event.target.value)}
                  placeholder={adminCopy(language, "searchPages")}
                  className="admin-shell-search h-9 w-full rounded-md border pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/60"
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
                  <div key={group.groupId} className="admin-shell-nav-card rounded-md border p-2">
                    <div className="admin-shell-muted text-center text-[10px] uppercase tracking-wide">{group.label[0]}</div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </aside>

        <main className="flex-1 min-w-0 overflow-auto">
          {standardAdminIa.length ? (
            <div className="admin-shell-subnav border-b px-4 py-2">
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
                            ? "admin-shell-active"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                        )}
                      >
                        {adminNavLabel(language, item.label)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
          {managerPageKey && managerContextQuery.data?.page ? (
            <div className="admin-shell-context border-b px-4 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-slate-600">
                <span>
                  {adminCopy(language, "department")}:{" "}
                  <span className="font-medium text-slate-950">
                    {adminNavLabel(language, managerContextQuery.data.page.label)}
                  </span>
                </span>
                <span>
                  {adminCopy(language, "manager")}:{" "}
                  <span className="font-medium text-slate-950">
                    {managerContextQuery.data.item?.manager_name || adminCopy(language, "notAssigned")}
                  </span>
                </span>
                <span>
                  {adminCopy(language, "openIssues")}:{" "}
                  <span className="text-amber-300 font-medium">
                    {Number(managerContextQuery.data.item?.open_issues || 0)}
                  </span>
                </span>
                <span>
                  {adminCopy(language, "lastReport")}:{" "}
                  <span className="text-slate-700">
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
                  {adminCopy(language, "openManagerChat")}
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
