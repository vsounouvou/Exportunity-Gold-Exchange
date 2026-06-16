import { useMemo } from "react";
import { BuyerHomePage } from "@/pages/BuyerHomePage";
import { useTenant } from "@/lib/tenant";
import { hasTenantModule, getTenantConfigByKey } from "../../../../tenants/index";
import { getTenantUXConfig } from "@/config/tenantUX";
import type { ConversationSpace, ExportunityExchangeVariant, ExportunityShellMode } from "@/components/exportunity/ExportunityConversationalCommerce";

type ZoneInterfaceProps = {
  initialSpace?: ConversationSpace;
  shellMode?: ExportunityShellMode;
  exchangeVariant?: ExportunityExchangeVariant;
};

export function ZoneInterface({ initialSpace = "city", shellMode = "commerce", exchangeVariant = "export" }: ZoneInterfaceProps) {
  const { tenant } = useTenant();
  const config = useMemo(() => getTenantConfigByKey(tenant.key), [tenant.key]);
  const tenantUx = useMemo(() => getTenantUXConfig(tenant.key), [tenant.key]);
  const isBdoWholesaleShell = tenant.key === "bdo" && initialSpace === "wholesale";
  const mapEnabled =
    (tenantUx.showMap || isBdoWholesaleShell) && hasTenantModule(tenant.key, "map");
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
        exportunityInitialSpace={initialSpace}
        exportunityShellMode={shellMode}
        exportunityExchangeVariant={exchangeVariant}
      />
    </div>
  );
}
