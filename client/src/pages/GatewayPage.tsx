import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { setDemoModeEnabled } from "@/lib/demoMode";
import { useSession } from "@/lib/session";
import { apiRequest } from "@/lib/queryClient";
import { buildResolverAssetUrl } from "@/lib/assets";
import { useTenant } from "@/lib/tenant";
import { getGatewayDestinations, type GatewayRoleKey } from "@/config/gatewayRoutes";

type RoleKey = Extract<GatewayRoleKey, "miner" | "wholesaler" | "buyer" | "investor">;

const ROLE_META: Record<RoleKey, { title: string; desc: string; assetKey: string }> = {
  miner: {
    title: "Miner / Producer",
    desc: "Sell production, access buyers, manage traceability.",
    assetKey: "landing/role_miner",
  },
  wholesaler: {
    title: "Wholesaler / Bureau d'Achat",
    desc: "Source gold, manage volumes, connect to buyers.",
    assetKey: "landing/role_wholesaler",
  },
  buyer: {
    title: "Buyer / Trader",
    desc: "Access verified supply, pricing, and deal flow.",
    assetKey: "landing/role_buyer",
  },
  investor: {
    title: "Investor",
    desc: "Monitor opportunities, flows, and risk.",
    assetKey: "landing/role_investor",
  },
};

function normalizePreferredRole(raw: unknown): RoleKey | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "bureau") return "wholesaler";
  if (value === "wholesaler" || value === "miner" || value === "buyer" || value === "investor") {
    return value as RoleKey;
  }
  return null;
}

function isGatewayPreviewEnabled(location: string): boolean {
  try {
    const query = location.split("?")[1] || "";
    const params = new URLSearchParams(query);
    const flag = (params.get("preview") || "").trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(flag)) return true;
    if (["0", "false", "no", "off"].includes(flag)) return false;
  } catch {
    // ignore
  }

  try {
    return localStorage.getItem("gateway_preview") === "true";
  } catch {
    return false;
  }
}

async function resolveAsset(namespace: string, assetKey: string) {
  const res = await apiRequest(
    `/api/assets/image?namespace=${encodeURIComponent(namespace)}&assetKey=${encodeURIComponent(assetKey)}`,
  );
  return buildResolverAssetUrl(res);
}

export function GatewayPage() {
  const [location, setLocation] = useLocation();
  useSession(); // ensures auth context ready
  const { tenant } = useTenant();
  const [skipGateway, setSkipGateway] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleKey | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const isBourse = tenant.key === "bdo";

  const params = useMemo(() => {
    try {
      const query = location.split("?")[1] || "";
      return new URLSearchParams(query);
    } catch {
      return new URLSearchParams();
    }
  }, [location]);

  const forceGateway = params.get("forceGateway") === "1";
  const previewEnabled = isGatewayPreviewEnabled(location);

  const destinations = useMemo(
    () => getGatewayDestinations(tenant.key, selectedRole, false),
    [tenant.key, selectedRole],
  );

  useEffect(() => {
    const savedSkip = localStorage.getItem("skipGateway") === "true";
    const savedRole = normalizePreferredRole(localStorage.getItem("preferredRole"));

    if (savedRole) setSelectedRole(savedRole);

    // Bourse is always unskippable: clear any previous skip and ignore redirect
    if (isBourse && !forceGateway) {
      localStorage.removeItem("skipGateway");
      setSkipGateway(false);
      return;
    }

    const shouldSkip = !forceGateway && savedSkip;
    setSkipGateway(shouldSkip);
    if (shouldSkip && savedRole) {
      const url = getGatewayDestinations(tenant.key, savedRole, false).roleUrls[savedRole];
      setLocation(url);
    }
  }, [forceGateway, isBourse, setLocation, tenant.key]);

  useEffect(() => {
    const loadAssets = async () => {
      const keys: Record<string, string> = {
        hero: "landing/hero_desktop",
        miner: ROLE_META.miner.assetKey,
        wholesaler: ROLE_META.wholesaler.assetKey,
        buyer: ROLE_META.buyer.assetKey,
        investor: ROLE_META.investor.assetKey,
      };

      if (previewEnabled) {
        keys.panel = "landing/hero_panel";
      }

      const next: Record<string, string> = {};
      for (const [localKey, assetKey] of Object.entries(keys)) {
        try {
          const url = await resolveAsset("bourse", assetKey);
          if (url) next[localKey] = url;
        } catch {
          // fallback applied below
        }
      }
      setAssetUrls(next);
    };
    loadAssets();
  }, [previewEnabled]);

  const handleChoose = (role: RoleKey) => {
    setSelectedRole(role);
    localStorage.setItem("preferredRole", role);
    if (skipGateway && !isBourse) localStorage.setItem("skipGateway", "true");
    setLocation(destinations.roleUrls[role]);
  };

  const handleToggleSkip = (checked: boolean) => {
    setSkipGateway(checked);
    if (!isBourse) {
      localStorage.setItem("skipGateway", checked ? "true" : "false");
    }
  };

  const handleDemoMode = () => {
    setDemoModeEnabled(true);
    setLocation(destinations.demoUrl);
  };

  const handleEnterEcosystem = () => {
    setLocation(destinations.enterEcosystemUrl);
  };

  const roles = (["miner", "wholesaler", "buyer", "investor"] as RoleKey[]).map(
    (r) => [r, ROLE_META[r]] as [RoleKey, { title: string; desc: string; assetKey: string }]
  );

  const heroUrl = assetUrls.hero || null;
  const heroPanelUrl = assetUrls.panel || null;
  const brandName = tenant.name;
  const headline = `${tenant.name} — digitizing the gold trade in Africa.`;
  const subheadline =
    "Choose your role to access traceable supply, compliant sourcing, transparent pricing, and settlement — from mine to buyer.";
  const ctaPrimary = `Enter the ecosystem ${"\u2192"}`;
  const ctaSecondary = "Demo mode";
  const showPreview = previewEnabled;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Desktop layout - forced single-screen */}
      <div className="hidden md:block">
        <section className="relative w-full h-screen overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
          {heroUrl && (
            <img
              src={heroUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover brightness-95 saturate-110"
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/30 to-black/10" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#0f172a,transparent_45%),radial-gradient(circle_at_bottom_right,#020617,transparent_45%)] opacity-70" />

          <div className="relative z-10 max-w-7xl mx-auto h-full px-10 py-6 flex flex-col gap-6">
            {!isBourse && !forceGateway && (
              <div className="flex items-center justify-end gap-3">
                <Switch checked={skipGateway} onCheckedChange={handleToggleSkip} />
                <div className="text-xs text-gray-200 leading-tight">
                  <div className="font-semibold text-white">Skip gateway next time</div>
                  <div>Go straight to my interface</div>
                </div>
              </div>
            )}

            <div className={`flex-1 grid grid-cols-1 gap-8 items-start ${showPreview ? "lg:grid-cols-2" : ""}`}>
              <div className="space-y-4 max-w-[640px] bg-black/25 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
                <div className="text-sm font-semibold tracking-[0.25em] text-amber-300">{brandName}</div>
                <h1 className="text-4xl lg:text-5xl font-bold leading-tight text-white">{headline}</h1>
                <p className="text-base lg:text-lg text-gray-200 max-w-[62ch]">{subheadline}</p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-200">
                  {["Traceability", "Compliance", "Settlement"].map((item) => (
                    <span key={item} className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                      <span>{item}</span>
                    </span>
                  ))}
                </div>
                <div className="h-px w-24 bg-amber-400" />
                <div className="flex items-center gap-3 flex-wrap">
                  <Button size="lg" onClick={handleEnterEcosystem}>
                    {ctaPrimary}
                  </Button>
                  <Button variant="secondary" size="lg" onClick={handleDemoMode}>
                    {ctaSecondary}
                  </Button>
                </div>
              </div>
              {showPreview && (
                <button
                  type="button"
                  onClick={handleEnterEcosystem}
                  className="group relative h-[320px] w-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900/60 backdrop-blur text-left focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                  aria-label="Preview the platform. Click to enter."
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
                  {heroPanelUrl ? (
                    <img
                      src={heroPanelUrl}
                      alt="Platform preview"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/45" />
                  <div className="absolute inset-0 p-5 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold tracking-wider text-amber-300 uppercase">
                        Preview the platform
                      </div>
                      <div className="text-sm text-white/75">Click to enter</div>
                    </div>
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                      <span>Open</span>
                      <span aria-hidden="true">{"\u2192"}</span>
                    </div>
                  </div>
                </button>
              )}
            </div>

            <div className="bg-black/55 backdrop-blur-md rounded-2xl border border-slate-800 p-5">
              <div className="flex items-end justify-between gap-4 mb-4">
                <div>
                  <div className="text-sm font-semibold text-white">Choose your role</div>
                  <div className="text-xs text-white/60">Select an interface tailored to your workflow.</div>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {roles.map(([key, meta]) => (
                  <button
                    key={key}
                    className={`relative h-44 rounded-xl overflow-hidden group border focus:outline-none focus:ring-2 focus:ring-amber-400/60 ${
                      selectedRole === key ? "border-amber-400" : "border-slate-800"
                    }`}
                    onClick={() => handleChoose(key)}
                  >
                    {assetUrls[key] ? (
                      <img
                        src={assetUrls[key]}
                        alt={meta.title}
                        className="absolute inset-0 w-full h-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 transition duration-300 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                    <div className="absolute inset-0 p-3 flex flex-col justify-end text-left space-y-1">
                      <p className="text-sm font-semibold text-white">{meta.title}</p>
                      <p className="text-xs text-gray-200 line-clamp-1">{meta.desc}</p>
                      <div className="flex items-center justify-between text-xs text-white">
                        <span>{`Enter ${meta.title.split(" ")[0]} Interface`}</span>
                        <span>{"\u2192"}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Mobile layout - still one screen feel */}
      <div className="md:hidden">
        <section className="relative w-full min-h-screen overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
          {heroUrl && (
            <img
              src={heroUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
              decoding="async"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-black/75" />
          <div className="relative z-10 px-4 pt-10 pb-6 flex flex-col gap-4">
            <div className="rounded-2xl bg-black/30 border border-white/10 backdrop-blur-sm p-5 space-y-3">
              <div className="text-sm font-semibold tracking-[0.25em] text-amber-300">{brandName}</div>
              <h1 className="text-3xl font-bold text-white leading-tight">{headline}</h1>
              <p className="text-gray-200">{subheadline}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-200">
                {["Traceability", "Compliance", "Settlement"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Button className="w-full" onClick={handleEnterEcosystem}>
                {ctaPrimary}
              </Button>
              <Button variant="secondary" className="w-full" onClick={handleDemoMode}>
                {ctaSecondary}
              </Button>
            </div>
            {!isBourse && !forceGateway && (
              <div className="flex items-center gap-2 bg-slate-900/70 border border-slate-800 rounded-lg px-3 py-2 w-fit">
                <Switch checked={skipGateway} onCheckedChange={handleToggleSkip} />
                <span className="text-xs text-gray-300">Skip next time</span>
              </div>
            )}
          </div>

          <div className="relative z-10 px-4 pb-10 space-y-3">
            <div className="text-sm font-semibold text-white/90">Choose your role</div>
            <div className="grid grid-cols-1 gap-3">
              {roles.map(([key, meta]) => (
                <button
                  key={key}
                  className="relative h-28 rounded-xl overflow-hidden border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                  onClick={() => handleChoose(key)}
                >
                  {assetUrls[key] ? (
                    <img
                      src={assetUrls[key]}
                      alt={meta.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/15" />
                  <div className="absolute inset-0 p-4 flex items-center justify-between gap-3 text-left">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-white">{meta.title}</p>
                      <p className="text-xs text-gray-200 line-clamp-1">{meta.desc}</p>
                    </div>
                    <span className="text-white/90 text-sm font-semibold" aria-hidden="true">
                      {"\u2192"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
