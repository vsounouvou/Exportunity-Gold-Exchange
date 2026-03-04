import { db } from "@db";
import { emailDomains } from "@db/schema";
import { asc, desc, eq } from "drizzle-orm";

type TenantLike = {
  id: number;
  key: string;
  domains?: string[] | null;
};

function stripWww(value: string) {
  return value.replace(/^www\./i, "").trim();
}

function normalizeDomain(value: unknown) {
  const domain = stripWww(String(value || "").trim().toLowerCase());
  if (!domain) return "";
  if (domain === "localhost") return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(domain)) return "";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return "";
  return domain;
}

function defaultDomainForTenantKey(key: string) {
  const normalized = String(key || "").trim().toLowerCase();
  if (normalized === "bdo") return "boursedelor.com";
  if (normalized === "exportunity") return "exportunity.net";
  return "";
}

function tenantScopedDomainEnvKey(tenantKey: string) {
  const key = String(tenantKey || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
  if (!key) return "";
  return `MAIL_DOMAIN_${key}`;
}

export async function resolveTenantMailDomain(tenant: TenantLike): Promise<string | null> {
  const tenantKey = String(tenant?.key || "").trim();
  const scopedEnvKey = tenantScopedDomainEnvKey(tenantKey);
  if (scopedEnvKey) {
    const fromScopedEnv = normalizeDomain(process.env[scopedEnvKey]);
    if (fromScopedEnv) return fromScopedEnv;
  }

  const fromGlobalEnv = normalizeDomain(process.env.MAIL_DOMAIN);
  if (fromGlobalEnv) return fromGlobalEnv;

  const storedDomains = await db.query.emailDomains.findMany({
    where: eq(emailDomains.tenantId, tenant.id),
    orderBy: (t, { desc, asc }) => [desc(t.isVerified), asc(t.type), asc(t.domain)],
    limit: 25,
  });
  for (const row of storedDomains) {
    const domain = normalizeDomain(row.domain);
    if (domain) return domain;
  }

  for (const candidate of Array.isArray(tenant.domains) ? tenant.domains : []) {
    const domain = normalizeDomain(candidate);
    if (domain) return domain;
  }

  const fallback = normalizeDomain(defaultDomainForTenantKey(tenantKey));
  if (fallback) return fallback;

  return null;
}
