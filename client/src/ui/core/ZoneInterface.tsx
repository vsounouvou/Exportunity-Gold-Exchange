import { useMemo } from "react";
import { BuyerHomePage } from "@/pages/BuyerHomePage";
import { useTenant } from "@/lib/tenant";
import { hasTenantModule, getTenantConfigByKey } from "../../../../tenants/index";
import { getTenantUXConfig } from "@/config/tenantUX";

export function ZoneInterface() {
  const { tenant } = useTenant();
  const config = useMemo(() => getTenantConfigByKey(tenant.key), [tenant.key]);
  const tenantUx = useMemo(() => getTenantUXConfig(tenant.key), [tenant.key]);
  const mapEnabled = tenantUx.showMap && hasTenantModule(tenant.key, "map");
  const storefrontHero = tenantUx.heroMode === "BANNER" ? config?.storefrontHero || null : null;

  return (
    <div data-ui="zone-interface" className="relative">
      <BuyerHomePage
        uiMarker="zone-interface"
        mapEnabled={mapEnabled}
        defaultRadiusKm={config?.defaultRadiusKm}
        storefrontHero={storefrontHero}
        showGoldChart={tenantUx.showGoldChart}
        showNewsBanner={tenantUx.showNewsBanner}
      />
    </div>
  );
}
