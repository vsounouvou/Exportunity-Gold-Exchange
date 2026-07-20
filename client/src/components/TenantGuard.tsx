import { ReactNode, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant";
import { clearTenantScopedBrowserState } from "@/lib/tenantScopedState";
import { shouldBlockTenantRendering } from "@/lib/tenantResolution";

const PRESERVE_QUERY_PREFIXES = ["/api/ece/auth", "/api/mindbase/auth", "/api/tenant", "/api/health/build"];

function clearTenantScopedQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.removeQueries({
    predicate: (query) => {
      const first = (query.queryKey || [])[0];
      const key = String(first || "");
      if (!key.startsWith("/api")) return false;
      return !PRESERVE_QUERY_PREFIXES.some((prefix) => key.startsWith(prefix));
    },
  });
}

export function TenantGuard({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { tenant, loading } = useTenant();
  const previousTenant = useRef<string | null>(null);

  useEffect(() => {
    const current = String(tenant?.key || "").trim();
    if (!current) return;

    const previous = previousTenant.current;
    if (previous && previous !== current) {
      clearTenantScopedQueries(queryClient);
      clearTenantScopedBrowserState();
    }

    previousTenant.current = current;
  }, [queryClient, tenant?.key]);

  const shouldBlock = shouldBlockTenantRendering({
    loading,
    tenantId: tenant?.id,
    host: typeof window !== "undefined" ? window.location.hostname : undefined,
    sessionToken: typeof window !== "undefined" ? window.localStorage.getItem("ece_session") : null,
  });

  if (shouldBlock) {
    return <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center">Resolving tenant...</div>;
  }

  return <>{children}</>;
}
