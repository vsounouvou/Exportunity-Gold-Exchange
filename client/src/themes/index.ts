import { bdoTenantConfig } from "../../../tenants/bdo/config";
import { agoojyeTenantConfig } from "../../../tenants/agoojye/config";
import { exportunityTenantConfig } from "../../../tenants/exportunity/config";
import { hozTenantConfig } from "../../../tenants/hoz/config";
import { maddTenantConfig } from "../../../tenants/madd/config";
import { metTenantConfig } from "../../../tenants/met/config";
import { mindbaseTenantConfig } from "../../../tenants/mindbase/config";
import { rayon1kmTenantConfig } from "../../../tenants/rayon1km/config";
import { vsTenantConfig } from "../../../tenants/vs/config";
import { xportcardTenantConfig } from "../../../tenants/xportcard/config";
import { zoneTenantConfig } from "../../../tenants/zone/config";
import { zoguelandTenantConfig } from "../../../tenants/zogueland/config";
import type { TenantTheme } from "./types";
import type { TenantKey } from "@/types/tenant";

export const bdoTheme = bdoTenantConfig.storefrontTheme as TenantTheme;
export const agoojyeTheme = agoojyeTenantConfig.storefrontTheme as TenantTheme;
export const exportunityTheme = exportunityTenantConfig.storefrontTheme as TenantTheme;
export const hozTheme = hozTenantConfig.storefrontTheme as TenantTheme;
export const maddTheme = maddTenantConfig.storefrontTheme as TenantTheme;
export const metTheme = metTenantConfig.storefrontTheme as TenantTheme;
export const mindbaseTheme = mindbaseTenantConfig.storefrontTheme as TenantTheme;
export const rayon1kmTheme = rayon1kmTenantConfig.storefrontTheme as TenantTheme;
export const vsTheme = vsTenantConfig.storefrontTheme as TenantTheme;
export const xportcardTheme = xportcardTenantConfig.storefrontTheme as TenantTheme;
export const zoneTheme = zoneTenantConfig.storefrontTheme as TenantTheme;
export const zoguelandTheme = zoguelandTenantConfig.storefrontTheme as TenantTheme;

const THEME_BY_TENANT: Record<TenantKey, TenantTheme> = {
  bdo: bdoTheme,
  agoojye: agoojyeTheme,
  exportunity: exportunityTheme,
  zone: zoneTheme,
  mindbase: mindbaseTheme,
  met: metTheme,
  vs: vsTheme,
  hoz: hozTheme,
  zogueland: zoguelandTheme,
  madd: maddTheme,
  rayon1km: rayon1kmTheme,
  xportcard: xportcardTheme,
};

export function resolveTenantTheme(tenantKey: TenantKey): TenantTheme {
  return THEME_BY_TENANT[tenantKey] || exportunityTheme;
}
