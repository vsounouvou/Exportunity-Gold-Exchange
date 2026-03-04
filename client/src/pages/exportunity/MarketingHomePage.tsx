import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";

import { Input } from "@/components/ui/input";
import { MarketingShell, isExportunityMarketingHost } from "@/components/exportunity/MarketingShell";
import {
  GlassCard,
  HeroPanel,
  MarketingContainer,
  MarketingLead,
  MarketingTitle,
} from "@/components/exportunity/marketing-ui";
import marketingSiteConfig from "@/content/marketing/site";
import { fetchInvestmentOpportunities } from "@/lib/marketing-api";
import { apiRequest } from "@/lib/queryClient";

type MissionTile = {
  id: string;
  title: string;
  text: string;
  href?: string;
  kind: "link" | "talk";
  tags: string[];
  authHint?: string;
};

const MISSION_TILES: MissionTile[] = [
  {
    id: "marketplace",
    title: "Buy & Sell (Marketplace)",
    text: "Everyday products, wholesale, and supply sourcing.",
    href: "https://exportunity.net/zone",
    kind: "link",
    tags: ["marketplace", "products", "retail", "wholesale", "buy", "sell"],
  },
  {
    id: "gold",
    title: "Gold Trade (Bourse de l'Or)",
    text: "Buy, sell, and manage gold workflows with compliance.",
    href: "https://boursedelor.com",
    kind: "link",
    tags: ["gold", "trade", "bourse", "commodities"],
  },
  {
    id: "pro",
    title: "Professional Workspace (Pro)",
    text: "Professional workspace for operators and partners.",
    href: "https://exportunity.net/pro/",
    kind: "link",
    tags: ["pro", "workspace", "operations"],
    authHint: "Login required",
  },
  {
    id: "wallet",
    title: "Wallet & Escrow",
    text: "Balances, escrow, settlements, and transfers.",
    href: "https://exportunity.net/app/wallet",
    kind: "link",
    tags: ["wallet", "escrow", "payments", "settlement"],
    authHint: "Login required",
  },
  {
    id: "contracts",
    title: "Contracts & Compliance",
    text: "Create enforceable digital contracts and approvals.",
    href: "https://exportunity.net/app/contracts",
    kind: "link",
    tags: ["contracts", "compliance", "approvals"],
    authHint: "Login required",
  },
  {
    id: "machinery",
    title: "Machinery & Equipment",
    text: "Equipment sourcing and operational procurement.",
    href: "https://exportunity.net/app/machinery/catalog",
    kind: "link",
    tags: ["machinery", "equipment", "procurement"],
    authHint: "Login required",
  },
  {
    id: "invest",
    title: "Invest / Opportunities",
    text: "Structured opportunities and deal routing.",
    href: "https://exportunity.net/app/invest/opportunities",
    kind: "link",
    tags: ["invest", "opportunities", "capital"],
    authHint: "Login required",
  },
  {
    id: "talk",
    title: "Talk to an Operator",
    text: "Get routed instantly to the right platform.",
    kind: "talk",
    tags: ["talk", "operator", "support", "routing", "help"],
  },
];

function formatNumber(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function formatMoney(value: unknown, currency = "XOF") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Price on request";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: String(currency || "XOF"),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency || "XOF"}`;
  }
}

function triggerEvent(name: "marketing:open-talk" | "marketing:open-platform-launcher") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(name));
}

export default function MarketingHomePage() {
  if (!isExportunityMarketingHost()) return <Redirect to="/zone" />;

  const [search, setSearch] = useState("");

  const goldQuery = useQuery({
    queryKey: ["marketing-home-gold-price"],
    queryFn: () => apiRequest("/api/marketplace/gold-price", { method: "GET" }),
    refetchInterval: 60_000,
  });

  const opportunitiesQuery = useQuery({
    queryKey: ["marketing-home-opportunities"],
    queryFn: () => fetchInvestmentOpportunities({ limit: 200 }),
    refetchInterval: 120_000,
  });

  const nearbyProductsQuery = useQuery({
    queryKey: ["marketing-home-nearby-products"],
    queryFn: () =>
      apiRequest("/api/marketplace/buyer/nearby?lat=5.349&lng=-4.017&radius=3000&limit=24&productsPerSeller=5", {
        method: "GET",
      }),
    refetchInterval: 120_000,
  });

  const catalogProductsQuery = useQuery({
    queryKey: ["marketing-home-catalog-products"],
    queryFn: () => apiRequest("/api/marketplace/shop-products?limit=16", { method: "GET" }),
    refetchInterval: 120_000,
  });

  const opportunityItems = Array.isArray(opportunitiesQuery.data?.items) ? opportunitiesQuery.data.items : [];
  const nearbyShops = Array.isArray(nearbyProductsQuery.data?.shops) ? nearbyProductsQuery.data.shops : [];

  const nearbyProducts = useMemo(() => {
    const dedupe = new Set<string>();
    const rows: Array<{
      id: string;
      name: string;
      image: string | null;
      price: unknown;
      currency: string | null;
      shopName: string | null;
      categoryName: string | null;
      distanceText: string | null;
    }> = [];

    for (const shop of nearbyShops as any[]) {
      const products = Array.isArray(shop?.products) ? shop.products : [];
      for (const product of products) {
        const id = String(product?.id ?? "").trim();
        if (!id || dedupe.has(id)) continue;
        dedupe.add(id);
        rows.push({
          id,
          name: String(product?.name || "Unnamed product"),
          image:
            typeof product?.image === "string"
              ? product.image
              : Array.isArray(product?.images) && typeof product.images[0] === "string"
                ? product.images[0]
                : null,
          price: product?.price,
          currency: String(product?.currency || "XOF"),
          shopName: String(shop?.shopName || ""),
          categoryName: String(product?.categoryName || ""),
          distanceText: String(shop?.distanceText || ""),
        });
      }
    }

    return rows.slice(0, 8);
  }, [nearbyShops]);

  const catalogRows = Array.isArray(catalogProductsQuery.data) ? catalogProductsQuery.data : [];
  const catalogProducts = useMemo(() => {
    return catalogRows
      .map((row: any) => {
        const product = row?.product || row || {};
        const seller = row?.seller || {};
        const images = Array.isArray(product?.images) ? product.images : [];
        const firstImage = images.find((item: unknown) => typeof item === "string" && item.trim()) as string | undefined;
        return {
          id: String(product?.id || ""),
          name: String(product?.name || "Unnamed product"),
          image: firstImage || null,
          price: product?.price,
          currency: String(product?.currency || "XOF"),
          shopName: String(seller?.shopName || "Marketplace seller"),
          categoryName: String(row?.category?.name || product?.categoryName || ""),
          distanceText: null as string | null,
        };
      })
      .filter((item) => item.id)
      .slice(0, 8);
  }, [catalogRows]);

  const products = nearbyProducts.length ? nearbyProducts : catalogProducts;
  const productsSource = nearbyProducts.length ? "nearby sellers" : "active marketplace listings";
  const productsError =
    nearbyProductsQuery.error instanceof Error && catalogProductsQuery.error instanceof Error
      ? nearbyProductsQuery.error.message || catalogProductsQuery.error.message
      : null;

  const activeOpportunities = opportunityItems.filter(
    (item: any) => String(item?.status || "").toLowerCase() === "published",
  ).length;

  const countriesActive = useMemo(
    () =>
      new Set(
        opportunityItems
          .map((item: any) => String(item?.country || "").trim())
          .filter(Boolean),
      ).size,
    [opportunityItems],
  );

  const signalCards = [
    {
      title: "Gold price (USD / oz)",
      value: formatNumber(goldQuery.data?.lbma?.priceUSD),
    },
    {
      title: "Gold 22K (XOF / g)",
      value: formatNumber(goldQuery.data?.local?.refined22K?.priceXOF),
    },
    {
      title: "USD / XOF",
      value: formatNumber(goldQuery.data?.fxRates?.XOF),
    },
    {
      title: "Active opportunities",
      value: `${formatNumber(activeOpportunities)} in ${formatNumber(countriesActive)} countries`,
    },
  ];

  const filteredTiles = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return MISSION_TILES;
    return MISSION_TILES.filter((tile) => {
      return (
        tile.title.toLowerCase().includes(normalized) ||
        tile.text.toLowerCase().includes(normalized) ||
        tile.tags.some((tag) => tag.toLowerCase().includes(normalized))
      );
    });
  }, [search]);

  return (
    <MarketingShell active="home">
      <MarketingContainer className="pt-10 md:pt-14">
        <HeroPanel image={marketingSiteConfig.images?.hero} imageAlt="Exportunity gateway">
          <div className="max-w-4xl space-y-5">
            <MarketingTitle className="text-4xl md:text-6xl">One gateway. Many platforms. Built for execution.</MarketingTitle>
            <MarketingLead>
              Choose what you want to do. Exportunity routes you to the right platform instantly.
            </MarketingLead>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => triggerEvent("marketing:open-platform-launcher")}
                className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
              >
                Open platform
              </button>
              <button
                type="button"
                onClick={() => triggerEvent("marketing:open-talk")}
                className="rounded-xl border border-white/30 bg-transparent px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Talk to us
              </button>
            </div>
          </div>
        </HeroPanel>
      </MarketingContainer>

      <MarketingContainer className="py-8" id="mission">
        <GlassCard className="space-y-5">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold md:text-3xl">What do you want to do today?</h2>
            <p className="text-sm text-white/70">Find a tool or service in one step.</p>
          </div>

          <div className="space-y-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a tool / service"
              className="border-white/15 bg-black/30 text-white placeholder:text-white/45"
            />
            {search.trim() ? (
              <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/70">
                {filteredTiles.length
                  ? `Found ${filteredTiles.length} mission${filteredTiles.length > 1 ? "s" : ""}.`
                  : "No direct match. Try terms like gold, wallet, machinery, or contracts."}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {filteredTiles.map((tile) =>
              tile.kind === "talk" ? (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => triggerEvent("marketing:open-talk")}
                  className="rounded-2xl border border-white/10 bg-black/30 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-white/30"
                >
                  <div className="text-base font-semibold text-white">{tile.title}</div>
                  <div className="mt-2 text-sm text-white/75">{tile.text}</div>
                </button>
              ) : (
                <a
                  key={tile.id}
                  href={tile.href}
                  className="rounded-2xl border border-white/10 bg-black/30 p-5 transition-all hover:-translate-y-0.5 hover:border-white/30"
                >
                  <div className="text-base font-semibold text-white">{tile.title}</div>
                  <div className="mt-2 text-sm text-white/75">{tile.text}</div>
                  {tile.authHint ? <div className="mt-3 text-xs text-amber-200">{tile.authHint}</div> : null}
                </a>
              ),
            )}
          </div>
        </GlassCard>
      </MarketingContainer>

      <MarketingContainer className="pb-8">
        <GlassCard className="space-y-5">
          <h2 className="text-xl font-semibold md:text-2xl">Live signals</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {signalCards.map((item) => (
              <div key={item.title} className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-[11px] uppercase tracking-[0.12em] text-white/60">{item.title}</div>
                <div className="mt-2 text-lg font-semibold text-white">{item.value}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      </MarketingContainer>

      <MarketingContainer className="pb-8">
        <GlassCard className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold md:text-3xl">Products live now</h2>
              <p className="mt-2 text-sm text-white/75">Showing {productsSource}. Open Zone for full map, filters, and checkout.</p>
            </div>
            <a href="https://exportunity.net/zone" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
              Open Zone marketplace
            </a>
          </div>

          {nearbyProductsQuery.isLoading && catalogProductsQuery.isLoading ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">Loading live products...</div>
          ) : null}

          {productsError ? (
            <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
              Product preview is temporarily unavailable. {productsError}
            </div>
          ) : null}

          {!productsError && !nearbyProductsQuery.isLoading && !catalogProductsQuery.isLoading && products.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              No products were returned in this snapshot. Open Zone and refresh your location to see full inventory.
            </div>
          ) : null}

          {!productsError && products.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              {products.slice(0, 8).map((product) => (
                <div key={product.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="aspect-[4/3] overflow-hidden rounded-xl bg-white/5">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-white/40">No image</div>
                    )}
                  </div>
                  <div className="mt-3">
                    <div className="line-clamp-2 text-sm font-semibold text-white">{product.name}</div>
                    <div className="mt-1 text-xs text-white/65">
                      {product.shopName || "Marketplace seller"}
                      {product.distanceText ? ` · ${product.distanceText}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-white/50">{product.categoryName || "General goods"}</div>
                    <div className="mt-2 text-sm font-semibold text-amber-300">{formatMoney(product.price, product.currency || "XOF")}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </GlassCard>
      </MarketingContainer>
    </MarketingShell>
  );
}