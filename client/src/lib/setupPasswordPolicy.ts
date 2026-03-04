import type { TenantKey } from "@/types/tenant";

import { getTenantDefaultRoute, isTenantRouteAllowed } from "./tenantPolicy";
import { resolveTenantKey } from "./tenantResolution";
import { normalizeTenantKey } from "../../../tenants/index";

function asTenantKey(value: unknown): TenantKey | null {
  return normalizeTenantKey(value as string) as TenantKey | null;
}

function normalizeRedirect(value: unknown) {
  const redirect = String(value || "").trim();
  if (!redirect.startsWith("/")) return "";
  return redirect;
}

export function resolveSetupPasswordTenantKey(input: {
  serverTenantKey?: unknown;
  host?: string;
  sessionToken?: string | null;
}) {
  const fromServer = asTenantKey(input.serverTenantKey);
  if (fromServer) return fromServer;
  return resolveTenantKey({
    host: input.host,
    sessionToken: input.sessionToken,
    apiTenantKey: null,
  });
}

export function resolveSetupPasswordRedirect(input: { tenantKey: TenantKey; serverRedirect?: unknown }) {
  const redirect = normalizeRedirect(input.serverRedirect);
  if (redirect && isTenantRouteAllowed(redirect, input.tenantKey)) {
    return redirect;
  }
  return getTenantDefaultRoute(input.tenantKey);
}

export function resolveSetupPasswordPostSetupPath(input: {
  serverTenantKey?: unknown;
  serverRedirect?: unknown;
  host?: string;
  sessionToken?: string | null;
}) {
  const tenantKey = resolveSetupPasswordTenantKey({
    serverTenantKey: input.serverTenantKey,
    host: input.host,
    sessionToken: input.sessionToken,
  });

  return {
    tenantKey,
    redirect: resolveSetupPasswordRedirect({
      tenantKey,
      serverRedirect: input.serverRedirect,
    }),
  };
}

export function getSetupPasswordErrorMessage(input: { code?: unknown; fallbackMessage?: unknown }) {
  const code = String(input.code || "").trim().toUpperCase();
  if (code === "SETUP_TOKEN_USED") return "This setup link was already used. Generate a new one.";
  if (code === "SETUP_TOKEN_EXPIRED") return "This setup link expired. Generate a new one.";

  const fallback = String(input.fallbackMessage || "").trim();
  if (fallback) return fallback;
  return "Invalid or expired setup link.";
}
