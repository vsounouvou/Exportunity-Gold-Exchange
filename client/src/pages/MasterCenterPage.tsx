import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

const MASTER_MENU_KEYS = [
  "Home",
  "Agents",
  "Operations",
  "Trade",
  "Assets",
  "Territories",
  "Finance",
  "Settings",
  "Tools",
] as const;

type MasterMenuKey = (typeof MASTER_MENU_KEYS)[number];
type RegistrationFilter = "all" | "registered" | "unregistered";
type EnabledFilter = "all" | "enabled" | "disabled";

type BrowsePageItem = {
  id: string;
  key: string;
  title: string;
  path: string;
  source: "REGISTERED" | "UNREGISTERED";
  tags: string[];
  isEnabled: boolean;
  isFlaggedOff: boolean;
  isRestricted: boolean;
  brokenRoute: boolean;
  routeKind: "app" | "pages" | "wouter" | "unknown";
  filePath: string | null;
  minRole: "PUBLIC" | "USER" | "STAFF" | "ADMIN" | "SUPERADMIN";
  featureFlag: string | null;
};

type BrowseResponse = {
  ok: boolean;
  master: MasterMenuKey;
  pages: BrowsePageItem[];
  total: number;
  generatedAt: string;
};

function normalizeMaster(input: string): MasterMenuKey {
  const normalized = String(input || "").trim().toLowerCase();
  const found = MASTER_MENU_KEYS.find((master) => master.toLowerCase() === normalized);
  return found || "Home";
}

function tagStyle(tag: string) {
  const value = String(tag || "").toUpperCase();
  if (value === "UNREGISTERED") return "bg-amber-500/10 text-amber-300 border border-amber-500/30";
  if (value === "REGISTERED") return "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30";
  if (value === "TEMPLATE_ROUTE") return "bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/30";
  if (value === "SYSTEM_ROUTE") return "bg-sky-500/10 text-sky-300 border border-sky-500/30";
  if (value === "FLAGGED_OFF") return "bg-orange-500/10 text-orange-300 border border-orange-500/30";
  if (value === "RESTRICTED") return "bg-violet-500/10 text-violet-300 border border-violet-500/30";
  if (value === "DISABLED") return "bg-gray-500/20 text-gray-200 border border-gray-500/40";
  if (value === "BROKEN_ROUTE") return "bg-red-500/10 text-red-300 border border-red-500/30";
  return "bg-slate-500/20 text-slate-200 border border-slate-500/40";
}

export function MasterCenterPage({ master }: { master: string }) {
  const resolvedMaster = normalizeMaster(master);
  const [searchTerm, setSearchTerm] = useState("");
  const [registrationFilter, setRegistrationFilter] = useState<RegistrationFilter>("all");
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>("all");

  const browseQuery = useQuery<BrowseResponse>({
    queryKey: [`/api/page-registry/all/${resolvedMaster}`],
    staleTime: 15_000,
    retry: false,
    queryFn: async () => apiRequest(`/api/page-registry/all/${resolvedMaster}`, "GET"),
  });

  const pages = Array.isArray(browseQuery.data?.pages) ? browseQuery.data?.pages : [];

  const filteredPages = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return pages.filter((page) => {
      if (registrationFilter === "registered" && page.source !== "REGISTERED") return false;
      if (registrationFilter === "unregistered" && page.source !== "UNREGISTERED") return false;

      if (enabledFilter === "enabled" && !page.isEnabled) return false;
      if (enabledFilter === "disabled" && page.isEnabled) return false;

      if (!normalizedSearch) return true;
      return (
        String(page.title || "").toLowerCase().includes(normalizedSearch) ||
        String(page.path || "").toLowerCase().includes(normalizedSearch)
      );
    });
  }, [pages, searchTerm, registrationFilter, enabledFilter]);

  const quickActions = filteredPages
    .filter((page) => !page.brokenRoute && page.isEnabled && !page.tags.includes("TEMPLATE_ROUTE") && !page.tags.includes("SYSTEM_ROUTE"))
    .slice(0, 5);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-xl">{resolvedMaster} Center</CardTitle>
          <p className="text-sm text-gray-400">Browse all pages discovered from actual routes in code.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {quickActions.map((page) => (
              <Link key={`quick-${page.path}`} href={page.path}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-700 text-gray-200 hover:bg-gray-800"
                >
                  {page.title}
                </Button>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr,auto,auto]">
            <div className="relative">
              <Search className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search title or path"
                className="pl-9 bg-gray-950 border-gray-800 text-gray-100"
              />
            </div>

            <div className="flex items-center gap-2">
              {[
                { key: "all", label: "All" },
                { key: "registered", label: "Registered" },
                { key: "unregistered", label: "Unregistered" },
              ].map((item) => (
                <Button
                  key={`registration-${item.key}`}
                  type="button"
                  size="sm"
                  variant={registrationFilter === item.key ? "default" : "outline"}
                  className={registrationFilter === item.key ? "bg-amber-500 text-black hover:bg-amber-400" : "border-gray-700 text-gray-200"}
                  onClick={() => setRegistrationFilter(item.key as RegistrationFilter)}
                >
                  {item.label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {[
                { key: "all", label: "All states" },
                { key: "enabled", label: "Enabled" },
                { key: "disabled", label: "Disabled" },
              ].map((item) => (
                <Button
                  key={`enabled-${item.key}`}
                  type="button"
                  size="sm"
                  variant={enabledFilter === item.key ? "default" : "outline"}
                  className={enabledFilter === item.key ? "bg-blue-500 text-white hover:bg-blue-400" : "border-gray-700 text-gray-200"}
                  onClick={() => setEnabledFilter(item.key as EnabledFilter)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-white">
            Browse all pages
            <span className="ml-2 text-xs font-normal text-gray-400">
              {filteredPages.length} shown / {pages.length} total
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {browseQuery.isLoading ? (
            <div className="text-sm text-gray-400 py-6">Loading pages...</div>
          ) : browseQuery.error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 px-3 py-2 text-sm">
              Failed to load pages.
            </div>
          ) : filteredPages.length === 0 ? (
            <div className="text-sm text-gray-400 py-6">No pages match this filter.</div>
          ) : (
            <div className="space-y-2">
              {filteredPages.map((page) => (
                (() => {
                  const isTemplateRoute = page.tags.includes("TEMPLATE_ROUTE");
                  const canOpen = !page.brokenRoute && !isTemplateRoute;
                  return (
                <div
                  key={page.path}
                  className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-100 truncate">{page.title || page.path}</div>
                    <div className="text-xs text-gray-400 truncate">{page.path}</div>
                    {page.filePath ? (
                      <div className="text-[11px] text-gray-500 truncate">{page.filePath}</div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 sm:items-end">
                    <div className="flex flex-wrap gap-1 sm:justify-end">
                      {page.tags.map((tag) => (
                        <Badge key={`${page.path}-${tag}`} className={tagStyle(tag)}>
                          {tag}
                        </Badge>
                      ))}
                      {page.brokenRoute ? (
                        <Badge className="bg-red-500/10 text-red-300 border border-red-500/30 inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Broken route
                        </Badge>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 sm:justify-end">
                      <Badge className="bg-gray-800 text-gray-300 border border-gray-700">
                        {page.routeKind}
                      </Badge>
                      {canOpen ? (
                        <Link href={page.path}>
                          <Button size="sm" className="bg-amber-500 hover:bg-amber-400 text-black">
                            Open
                            <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                          </Button>
                        </Link>
                      ) : (
                        <Button size="sm" variant="outline" className="border-gray-700 text-gray-400" disabled>
                          {isTemplateRoute ? "Template route" : "Unavailable"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                  );
                })()
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
