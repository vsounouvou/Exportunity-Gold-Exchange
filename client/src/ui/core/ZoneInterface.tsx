import { useMemo } from "react";
import { Link } from "wouter";
import { BuyerHomePage } from "@/pages/BuyerHomePage";
import { useTenant } from "@/lib/tenant";
import { hasTenantModule, getTenantConfigByKey } from "../../../../tenants/index";

export function ZoneInterface() {
  const { tenant } = useTenant();
  const config = useMemo(() => getTenantConfigByKey(tenant.key), [tenant.key]);
  const mapEnabled = hasTenantModule(tenant.key, "map");

  return (
    <div data-ui="zone-interface" className="relative">
      <div className="absolute left-4 top-4 z-[41] hidden gap-2 md:flex">
        <Link href="/store">
          <span className="rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs text-white/80 backdrop-blur">
            Store
          </span>
        </Link>
        <Link href="/collections">
          <span className="rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs text-white/80 backdrop-blur">
            Collections
          </span>
        </Link>
        <Link href={tenant.key === "mindbase" ? "/admin/mindbase" : "/admin"}>
          <span className="rounded-full border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-xs text-amber-200 backdrop-blur">
            Admin
          </span>
        </Link>
      </div>
      <BuyerHomePage
        uiMarker="zone-interface"
        mapEnabled={mapEnabled}
        defaultRadiusKm={config?.defaultRadiusKm}
        storefrontHero={config?.storefrontHero || null}
      />
    </div>
  );
}

