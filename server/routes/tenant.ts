import { Router } from "express";
import { getTenantConfigByKey } from "../../tenants/index";

const router = Router();

router.get("/", (req, res) => {
  const tenant = req.tenant;
  if (!tenant) {
    return res.status(500).json({ message: "Tenant not resolved" });
  }

  const tenantConfig = getTenantConfigByKey(tenant.key);

  res.json({
    id: tenant.id,
    key: tenant.key,
    name: tenant.name,
    domains: tenant.domains ?? [],
    themeConfig: tenant.themeConfig ?? {},
    featureFlags: tenant.featureFlags ?? {},
    brandName: tenantConfig?.brandName ?? tenant.name,
    tagline: tenantConfig?.tagline ?? null,
    homeMode: tenantConfig?.homeMode ?? "platform",
    homeRedirectTo: tenantConfig?.homeRedirectTo ?? "/store",
    storefrontMarketType: tenantConfig?.storefrontMarketType ?? "ALL",
    modulesEnabled: tenantConfig?.modulesEnabled ?? [],
    modulesDisabled: tenantConfig?.modulesDisabled ?? [],
    storefrontHero: tenantConfig?.storefrontHero ?? null,
    storefrontTheme: tenantConfig?.storefrontTheme ?? null,
    storefrontIdentity: tenantConfig?.storefrontIdentity ?? null,
    assets: tenantConfig?.assets ?? null,
    retailModeLabel: tenantConfig?.storefrontIdentity?.retailModeLabel ?? "Marketplace",
    platformLabel: tenantConfig?.storefrontIdentity?.platformLabel ?? tenantConfig?.brandName ?? tenant.name,
  });
});

export default router;
