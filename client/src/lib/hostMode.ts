import { tenantFromHost } from "@/lib/tenantResolution";

function normalizeHost(host: string | undefined): string {
  return String(host || "").split(":")[0]?.trim().toLowerCase() || "";
}

function currentHost() {
  if (typeof window === "undefined") return "";
  return normalizeHost(window.location.hostname);
}

function isHostForTenant(key: string) {
  const host = currentHost();
  if (!host) return false;
  return tenantFromHost(host) === key;
}

export function isMindbaseHost() {
  return isHostForTenant("mindbase");
}

export function isBdoHost() {
  return isHostForTenant("bdo");
}

export function isZoneHost() {
  return isHostForTenant("zone");
}

export function isMetHost() {
  return isHostForTenant("met");
}

export function isVsHost() {
  return isHostForTenant("vs");
}

export function isHozHost() {
  return isHostForTenant("hoz");
}

export function isZoguelandHost() {
  return isHostForTenant("zogueland");
}

export function isExportunityMarketingHost() {
  const host = currentHost();
  const marketingHosts = new Set([
    "exportunity.com",
    "www.exportunity.com",
    "com.exportunity.net",
    "www.com.exportunity.net",
  ]);

  if (marketingHosts.has(host)) return true;

  if (host === "localhost" || host === "127.0.0.1") {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("marketing") === "1";
    } catch {
      return false;
    }
  }

  return false;
}
