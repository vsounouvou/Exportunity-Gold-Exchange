import dns from "node:dns/promises";

type DeliverabilityPreflightResult = {
  domain: string;
  hasSpf: boolean;
  hasDmarc: boolean;
  hasDkim: boolean;
  spfRecords: string[];
  dmarcRecords: string[];
  dkimRecords: string[];
  checkedAtIso: string;
  warnings: string[];
};

const DEFAULT_CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { atMs: number; value: DeliverabilityPreflightResult }>();

function nowIso() {
  return new Date().toISOString();
}

function normalizeDomain(input: string) {
  return String(input || "").trim().toLowerCase().replace(/\.+$/g, "");
}

async function resolveTxtStrings(name: string): Promise<string[]> {
  const rows = await dns.resolveTxt(name);
  // Each row is an array of strings; join per RFC to rebuild full TXT.
  return rows.map((parts) => parts.join("")).map((v) => v.trim()).filter(Boolean);
}

function hasTxtPrefix(records: string[], prefix: string) {
  const p = prefix.toLowerCase();
  return records.some((r) => String(r || "").trim().toLowerCase().startsWith(p));
}

function hasTxtIncludes(records: string[], needle: string) {
  const n = needle.toLowerCase();
  return records.some((r) => String(r || "").toLowerCase().includes(n));
}

export async function preflightOutboundDomainDeliverability(opts: {
  domain: string;
  cacheTtlMs?: number;
}) : Promise<DeliverabilityPreflightResult> {
  const domain = normalizeDomain(opts.domain);
  if (!domain) {
    return {
      domain: "",
      hasSpf: false,
      hasDmarc: false,
      hasDkim: false,
      spfRecords: [],
      dmarcRecords: [],
      dkimRecords: [],
      checkedAtIso: nowIso(),
      warnings: ["domain_missing"],
    };
  }

  const ttlMs = typeof opts.cacheTtlMs === "number" ? opts.cacheTtlMs : DEFAULT_CACHE_TTL_MS;
  const cached = cache.get(domain);
  if (cached && Date.now() - cached.atMs <= ttlMs) return cached.value;

  const warnings: string[] = [];
  let spfRecords: string[] = [];
  let dmarcRecords: string[] = [];
  let dkimRecords: string[] = [];

  try {
    spfRecords = await resolveTxtStrings(domain);
  } catch (error: any) {
    warnings.push(`spf_lookup_failed:${String(error?.code || error?.message || "unknown")}`);
  }

  try {
    dmarcRecords = await resolveTxtStrings(`_dmarc.${domain}`);
  } catch (error: any) {
    warnings.push(`dmarc_lookup_failed:${String(error?.code || error?.message || "unknown")}`);
  }

  // docker-mailserver default selector in our setup is "mail" (mail._domainkey.<domain>)
  // but accept "default" as well because some installs use it.
  // Also check s1 selector as configured in OpenDKIM setup.
  const dkimNames = [`s1._domainkey.${domain}`, `mail._domainkey.${domain}`, `default._domainkey.${domain}`];
  for (const name of dkimNames) {
    try {
      const records = await resolveTxtStrings(name);
      dkimRecords = dkimRecords.concat(records);
    } catch {
      // ignore; we'll decide based on aggregate
    }
  }

  const hasSpf = hasTxtPrefix(spfRecords, "v=spf1");
  const hasDmarc = hasTxtPrefix(dmarcRecords, "v=dmarc1");
  const hasDkim = hasTxtIncludes(dkimRecords, "v=dkim1");

  if (!hasSpf) warnings.push("spf_missing");
  if (!hasDkim) warnings.push("dkim_missing");
  if (!hasDmarc) warnings.push("dmarc_missing");

  const value: DeliverabilityPreflightResult = {
    domain,
    hasSpf,
    hasDmarc,
    hasDkim,
    spfRecords,
    dmarcRecords,
    dkimRecords,
    checkedAtIso: nowIso(),
    warnings,
  };

  cache.set(domain, { atMs: Date.now(), value });
  return value;
}

export function shouldEnforceOutboundDeliverability() {
  const raw = String(process.env.MAIL_DELIVERABILITY_ENFORCE || "").trim().toLowerCase();
  if (raw) return ["1", "true", "yes", "y", "on"].includes(raw);
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

export async function assertOutboundDeliverabilityReady(opts: { fromDomain: string }) {
  if (!shouldEnforceOutboundDeliverability()) return;
  const domain = normalizeDomain(opts.fromDomain);
  if (!domain) throw new Error("Outbound mail domain missing.");

  const preflight = await preflightOutboundDomainDeliverability({ domain });
  // Strictly required for inboxing with major providers.
  if (!preflight.hasSpf || !preflight.hasDkim) {
    const missing: string[] = [];
    if (!preflight.hasSpf) missing.push("SPF");
    if (!preflight.hasDkim) missing.push("DKIM");
    const warnings = preflight.warnings.filter((w) => /_missing$/.test(w)).join(", ");

    // Log warning but don't throw if MAIL_DELIVERABILITY_WARN_ONLY is true
    // This allows emails to be sent with missing DNS records (useful for internal/dev)
    const warnOnly = ["1", "true", "yes", "y", "on"].includes(
      String(process.env.MAIL_DELIVERABILITY_WARN_ONLY || "").trim().toLowerCase()
    );

    const errorMsg = `Outbound deliverability misconfigured for ${domain}: missing ${missing.join(" & ")}. Fix DNS (seen: ${warnings || "unknown"}).`;

    if (warnOnly) {
      console.warn(`[deliverability-preflight] WARNING: ${errorMsg}`);
      return;
    }

    throw new Error(errorMsg);
  }
}

