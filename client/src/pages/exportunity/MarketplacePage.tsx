import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Factory,
  Globe2,
  Languages,
  LocateFixed,
  LogIn,
  MapPin,
  Moon,
  PackageSearch,
  Search,
  ShoppingBag,
  Store,
  Sun,
} from "lucide-react";
import { Link } from "wouter";

import {
  IndustrialAssistantChat,
  type IndustrialAssistantContext,
  type IndustrialAssistantProductContext,
} from "@/components/exportunity/IndustrialAssistantChat";
import { useLocale } from "@/contexts/LocaleContext";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Language = "fr" | "en";
type ThemeMode = "light" | "dark";
type LocationState = "locating" | "ready" | "denied" | "unavailable";
type MarketplaceScope = 10 | 50 | 250 | 1000 | "global";

type UserLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type MarketplaceCategory = {
  id: number;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
};

type MarketplaceProduct = {
  id: number;
  name: string;
  description?: string | null;
  image?: string | null;
  images?: string[] | null;
  shopName?: string | null;
  shopId?: number | null;
  shopSlug?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  distance?: number | null;
  distanceText?: string | null;
  isVerifiedSeller?: boolean;
  stockQuantity?: number | null;
  inStock?: boolean;
};

type MarketplaceShop = {
  id: number;
  shopName: string;
  slug?: string | null;
  description?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  cityName?: string | null;
  countryName?: string | null;
  countryCode?: string | null;
  distance?: number | null;
  distanceText?: string | null;
  verifiedAt?: string | null;
  products?: MarketplaceProduct[];
};

type NearbyPayload = {
  shops?: MarketplaceShop[];
  fallback?: {
    used?: boolean;
    reason?: string | null;
    withinRadiusCount?: number;
    totalCount?: number;
  };
};

type PublicFactory = {
  id: string;
  name: string;
  industry: string;
  countryCode: string;
  region?: string | null;
  city?: string | null;
  industrialZone?: string | null;
  description?: string | null;
  latitude: number | null;
  longitude: number | null;
  verification: "verified";
};

type FactoryPayload = {
  factories?: PublicFactory[];
};

type IndustrialCatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  localizedName?: { fr?: string; en?: string } | null;
  localizedDescription?: { fr?: string; en?: string } | null;
  categoryCode: string;
  classification: string;
  productCode?: string | null;
  partNumber?: string | null;
  unitOfMeasure?: string | null;
  minimumOrderQuantity?: string | null;
  leadTimeText?: string | null;
  media?: string[] | null;
  factoryId?: string | null;
  factoryName?: string | null;
  factoryCity?: string | null;
  factoryCountryCode?: string | null;
  listingKind?:
    | "verified_factory_catalog"
    | "documented_factory_output"
    | "exportunity_sourcing_program";
  inventoryVerified?: boolean;
  displayPriority?: number;
};

type CatalogPayload = {
  items?: IndustrialCatalogItem[];
};

type UnifiedListing = {
  key: string;
  source: "marketplace" | "industrial";
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  organization: string;
  location: string;
  categoryCode: string;
  categoryLabel: string;
  distanceKm: number | null;
  latitude: number | null;
  longitude: number | null;
  assurance: "verified_listing" | "verified_factory" | "documented_sourcing";
  inStock?: boolean;
  assistantProduct: IndustrialAssistantProductContext;
};

const SCOPE_OPTIONS: MarketplaceScope[] = [10, 50, 250, 1000, "global"];
const AFRICA_CENTER: [number, number] = [7.1881, 21.0938];

function finiteCoordinate(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function distanceKm(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = radians(toLatitude - fromLatitude);
  const longitudeDelta = radians(toLongitude - fromLongitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(fromLatitude)) *
      Math.cos(radians(toLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function localizedText(
  localized: { fr?: string; en?: string } | null | undefined,
  fallback: string | null | undefined,
  language: Language,
) {
  return localized?.[language]?.trim() || localized?.en?.trim() || fallback?.trim() || "";
}

function firstImage(images: unknown, fallback?: string | null) {
  if (Array.isArray(images)) {
    const found = images.find((value) => typeof value === "string" && value.trim());
    if (typeof found === "string") return found;
  }
  return fallback || null;
}

function formatDistance(value: number | null, language: Language) {
  if (value === null || !Number.isFinite(value)) {
    return language === "fr" ? "Distance a confirmer" : "Distance to confirm";
  }
  if (value < 1) return `${Math.max(100, Math.round(value * 1000))} m`;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} km`;
}

function scopeLabel(scope: MarketplaceScope, language: Language) {
  if (scope === "global") return language === "fr" ? "Au-dela" : "Beyond";
  return `${scope} km`;
}

function markerIcon(kind: "user" | "shop" | "factory", active = false) {
  const label = kind === "user" ? "●" : kind === "shop" ? "S" : "F";
  const background = kind === "user" ? "#2563EB" : kind === "shop" ? "#F5A623" : "#07111F";
  const foreground = kind === "shop" ? "#07111F" : "#FFFFFF";
  const size = kind === "user" ? 22 : active ? 38 : 32;
  return L.divIcon({
    className: "",
    html: `<span style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:${kind === "user" ? "999px" : "10px"};background:${background};color:${foreground};font:800 12px/1 system-ui;border:3px solid white;box-shadow:0 8px 24px rgba(7,17,31,.28)">${label}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function ProximityViewport({
  location,
  scope,
}: {
  location: UserLocation | null;
  scope: MarketplaceScope;
}) {
  const map = useMap();

  useEffect(() => {
    if (!location) {
      map.setView(AFRICA_CENTER, 3, { animate: true });
      return;
    }
    if (scope === "global") {
      map.setView([location.latitude, location.longitude], 4, { animate: true });
      return;
    }
    const bounds = L.latLng(location.latitude, location.longitude).toBounds(scope * 2_000);
    map.fitBounds(bounds, { animate: true, padding: [32, 32], maxZoom: 13 });
  }, [location, map, scope]);

  return null;
}

function ListingCard({
  listing,
  language,
  selected,
  onSelect,
}: {
  listing: UnifiedListing;
  language: Language;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={cn(
        "flex min-h-[250px] min-w-[236px] flex-col overflow-hidden rounded-xl border bg-white transition dark:bg-[#0A1628] sm:min-w-0",
        selected
          ? "border-[#F5A623] shadow-[0_16px_40px_rgba(245,166,35,0.16)]"
          : "border-slate-200 hover:border-[#F5A623]/70 dark:border-white/10",
      )}
    >
      <div className="relative h-28 overflow-hidden bg-[#EEF2F6] dark:bg-[#07111F]">
        {listing.imageUrl ? (
          <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-[#B26F00] dark:text-[#F5A623]">
            {listing.source === "industrial" ? (
              <Factory className="h-9 w-9" />
            ) : (
              <ShoppingBag className="h-9 w-9" />
            )}
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-[#07111F]/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
          {listing.source === "industrial"
            ? language === "fr"
              ? "Industrie"
              : "Industrial"
            : language === "fr"
              ? "Marketplace"
              : "Marketplace"}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-slate-800 shadow-sm">
          {formatDistance(listing.distanceKm, language)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#9A6200] dark:text-[#F5A623]">
          {listing.categoryLabel}
        </p>
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-950 dark:text-white">
          {listing.name}
        </h3>
        <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-300">
          {listing.organization} · {listing.location}
        </p>
        <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
          <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>
            {listing.assurance === "verified_listing"
              ? language === "fr"
                ? "Annonce vendeur approuvee"
                : "Approved seller listing"
              : listing.assurance === "verified_factory"
                ? language === "fr"
                  ? "Catalogue d'usine verifiee; disponibilite a confirmer"
                  : "Verified factory catalog; availability to confirm"
                : language === "fr"
                  ? "Reference documentee; fournisseur et stock a qualifier"
                  : "Documented reference; supplier and stock to qualify"}
          </span>
        </div>
        <button
          type="button"
          onClick={onSelect}
          className="mt-auto inline-flex min-h-9 items-center justify-between gap-2 rounded-md bg-[#07111F] px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-[#14243B] dark:bg-[#F5A623] dark:text-[#07111F] dark:hover:bg-[#F8C45B]"
        >
          <span>{language === "fr" ? "Demander a Awa" : "Ask Awa"}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}

export default function MarketplacePage() {
  const { language: localeLanguage, setLanguage } = useLocale();
  const { user, isAuthenticated } = useSession();
  const language: Language = localeLanguage === "fr" ? "fr" : "en";
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("exportunity-global-theme") === "dark" ? "dark" : "light";
  });
  const [scope, setScope] = useState<MarketplaceScope>(10);
  const [locationState, setLocationState] = useState<LocationState>("locating");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedListing, setSelectedListing] = useState<UnifiedListing | null>(null);
  const assistantRef = useRef<HTMLElement | null>(null);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationState("unavailable");
      return;
    }
    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        });
        setLocationState("ready");
      },
      (error) => {
        setLocationState(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 10_000 },
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  useEffect(() => {
    window.localStorage.setItem("exportunity-global-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.title =
      language === "fr"
        ? "Marketplace Exportunity | Produits et usines autour de vous"
        : "Exportunity Marketplace | Products and factories around you";
  }, [language]);

  const radiusForApi = scope === "global" ? 20_000 : scope;
  const nearbyUrl = userLocation
    ? `/api/marketplace/buyer/nearby?lat=${encodeURIComponent(userLocation.latitude)}&lng=${encodeURIComponent(userLocation.longitude)}&radius=${radiusForApi}&limit=100&productsPerSeller=24`
    : "/api/marketplace/buyer/nearby?location=required";

  const categoriesQuery = useQuery<MarketplaceCategory[]>({
    queryKey: ["/api/marketplace/product-categories"],
    staleTime: 5 * 60 * 1000,
  });
  const nearbyQuery = useQuery<NearbyPayload>({
    queryKey: [nearbyUrl],
    enabled: Boolean(userLocation),
    staleTime: 30_000,
  });
  const factoriesQuery = useQuery<FactoryPayload>({
    queryKey: ["/api/industrial/factories?limit=120"],
    staleTime: 5 * 60 * 1000,
  });
  const catalogQuery = useQuery<CatalogPayload>({
    queryKey: ["/api/industrial/catalog?limit=160"],
    staleTime: 5 * 60 * 1000,
  });

  const factories = factoriesQuery.data?.factories || [];
  const shops = nearbyQuery.data?.shops || [];

  const unifiedListings = useMemo(() => {
    const factoryById = new Map(factories.map((factory) => [factory.id, factory]));
    const retailListings: UnifiedListing[] = shops.flatMap((shop) => {
      const latitude = finiteCoordinate(shop.latitude);
      const longitude = finiteCoordinate(shop.longitude);
      const computedDistance =
        userLocation && latitude !== null && longitude !== null
          ? distanceKm(userLocation.latitude, userLocation.longitude, latitude, longitude)
          : finiteCoordinate(shop.distance);
      return (shop.products || []).map((product) => ({
        key: `marketplace:${product.id}`,
        source: "marketplace" as const,
        name: product.name,
        description: product.description,
        imageUrl: firstImage(product.images, product.image),
        organization: product.shopName || shop.shopName,
        location:
          [shop.cityName, shop.countryName].filter(Boolean).join(", ") ||
          (language === "fr" ? "Localisation verifiee par le vendeur" : "Seller location on record"),
        categoryCode: product.categorySlug || "marketplace",
        categoryLabel: product.categoryName || (language === "fr" ? "Produit" : "Product"),
        distanceKm: computedDistance,
        latitude,
        longitude,
        assurance: "verified_listing" as const,
        inStock: product.inStock,
        assistantProduct: {
          id: `marketplace-${product.id}`,
          name: product.name,
          description: product.description,
          imageUrl: firstImage(product.images, product.image),
          factoryId: null,
          factoryName: product.shopName || shop.shopName,
          factoryLocation: [shop.cityName, shop.countryName].filter(Boolean).join(", ") || null,
          categoryCode: product.categorySlug || "marketplace-product",
          classification: "marketplace_product",
          requirementType: "product",
          reference: `MKT-${product.id}`,
          territoryCode: shop.countryCode || null,
        },
      }));
    });

    const industrialListings: UnifiedListing[] = (catalogQuery.data?.items || []).map((item) => {
      const factory = item.factoryId ? factoryById.get(item.factoryId) : undefined;
      const latitude = factory?.latitude ?? null;
      const longitude = factory?.longitude ?? null;
      const computedDistance =
        userLocation && latitude !== null && longitude !== null
          ? distanceKm(userLocation.latitude, userLocation.longitude, latitude, longitude)
          : null;
      const verified = item.listingKind === "verified_factory_catalog" && Boolean(factory);
      const itemName = localizedText(item.localizedName, item.name, language);
      const itemDescription = localizedText(item.localizedDescription, item.description, language);
      const organization = item.factoryName || factory?.name || "Exportunity sourcing";
      const location =
        [item.factoryCity || factory?.city, item.factoryCountryCode || factory?.countryCode]
          .filter(Boolean)
          .join(", ") || (language === "fr" ? "Marche a qualifier" : "Market to qualify");
      return {
        key: `industrial:${item.id}`,
        source: "industrial" as const,
        name: itemName,
        description: itemDescription,
        imageUrl: firstImage(item.media),
        organization,
        location,
        categoryCode: item.categoryCode || "industrial",
        categoryLabel: language === "fr" ? "Industrie" : "Industrial",
        distanceKm: computedDistance,
        latitude,
        longitude,
        assurance: verified ? ("verified_factory" as const) : ("documented_sourcing" as const),
        assistantProduct: {
          id: item.id,
          name: itemName,
          description: itemDescription,
          imageUrl: firstImage(item.media),
          factoryId: item.factoryId,
          factoryName: organization,
          factoryLocation: location,
          categoryCode: item.categoryCode || "industrial",
          classification: item.classification || "industrial_product",
          requirementType: "product",
          unitOfMeasure: item.unitOfMeasure,
          minimumOrderQuantity: item.minimumOrderQuantity,
          leadTimeText: item.leadTimeText,
          reference: item.productCode || item.partNumber || item.id,
          territoryCode: item.factoryCountryCode || factory?.countryCode || null,
        },
      };
    });

    return [...retailListings, ...industrialListings].sort((left, right) => {
      const leftDistance = left.distanceKm ?? Number.POSITIVE_INFINITY;
      const rightDistance = right.distanceKm ?? Number.POSITIVE_INFINITY;
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      if (left.source !== right.source) return left.source === "marketplace" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  }, [catalogQuery.data?.items, factories, language, shops, userLocation]);

  const { visibleListings, expandedScopeFallback } = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(language);
    const matchingListings = unifiedListings.filter((listing) => {
      if (category === "marketplace" && listing.source !== "marketplace") return false;
      if (category === "industrial" && listing.source !== "industrial") return false;
      if (
        category !== "all" &&
        category !== "marketplace" &&
        category !== "industrial" &&
        listing.categoryCode !== category
      ) {
        return false;
      }
      if (!normalizedQuery) return true;
      return `${listing.name} ${listing.description || ""} ${listing.organization} ${listing.location}`
        .toLocaleLowerCase(language)
        .includes(normalizedQuery);
    });
    const listingsInsideScope = matchingListings.filter((listing) => {
      if (!userLocation || scope === "global") return true;
      return listing.distanceKm !== null && listing.distanceKm <= scope;
    });
    const shouldShowExpandedScope =
      Boolean(userLocation) &&
      scope !== "global" &&
      listingsInsideScope.length === 0 &&
      matchingListings.length > 0;

    return {
      visibleListings: (shouldShowExpandedScope ? matchingListings : listingsInsideScope).slice(0, 48),
      expandedScopeFallback: shouldShowExpandedScope,
    };
  }, [category, language, query, scope, unifiedListings, userLocation]);

  const mappedFactories = useMemo(
    () =>
      factories
        .map((factory) => ({
          factory,
          latitude: finiteCoordinate(factory.latitude),
          longitude: finiteCoordinate(factory.longitude),
        }))
        .filter(
          (entry): entry is { factory: PublicFactory; latitude: number; longitude: number } =>
            entry.latitude !== null && entry.longitude !== null,
        )
        .filter((entry) => {
          if (!userLocation || scope === "global") return true;
          return (
            distanceKm(
              userLocation.latitude,
              userLocation.longitude,
              entry.latitude,
              entry.longitude,
            ) <= scope
          );
        }),
    [factories, scope, userLocation],
  );

  const retailProductCount = shops.reduce((total, shop) => total + (shop.products?.length || 0), 0);
  const mappedShopCount = shops.filter(
    (shop) => finiteCoordinate(shop.latitude) !== null && finiteCoordinate(shop.longitude) !== null,
  ).length;

  const assistantContext: IndustrialAssistantContext = {
    id: "unified-marketplace",
    title: language === "fr" ? "Marketplace Exportunity" : "Exportunity Marketplace",
    role:
      language === "fr"
        ? "Commerce de proximite, sourcing et qualification"
        : "Proximity commerce, sourcing, and qualification",
    intro:
      language === "fr"
        ? "Dites-moi ce que vous souhaitez acheter ou vendre. Je commence autour de vous, puis j'elargis la recherche selon votre rayon, vos specifications et votre marche."
        : "Tell me what you want to buy or sell. I start around you, then widen the search based on your radius, specifications, and market.",
    quickReplies:
      language === "fr"
        ? ["Trouver un produit autour de moi", "Trouver une usine", "Je veux vendre", "Elargir a l'Afrique"]
        : ["Find a product near me", "Find a factory", "I want to sell", "Expand across Africa"],
    discoveryReplies:
      language === "fr"
        ? ["Produits de proximite", "Usines verifiees", "Produits industriels"]
        : ["Nearby products", "Verified factories", "Industrial products"],
    requirementType: "product",
    territoryCode: null,
    tradeIntake: true,
    missionType: "source",
  };

  const openListing = (listing: UnifiedListing) => {
    setSelectedListing(listing);
    window.setTimeout(() => {
      if (window.innerWidth < 1024) {
        assistantRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
  };

  const locationMessage =
    locationState === "locating"
      ? language === "fr"
        ? "Localisation en cours..."
        : "Locating you..."
      : locationState === "ready"
        ? language === "fr"
          ? "Votre position organise les resultats du plus proche au plus eloigne."
          : "Your position ranks results from nearest to farthest."
        : language === "fr"
          ? "Activez votre position pour voir ce qui est fabrique et vendu autour de vous."
          : "Enable your location to see what is made and sold around you.";

  return (
    <div
      className={cn(
        "min-h-screen bg-[#F7F8FA] text-[#111827]",
        theme === "dark" && "dark bg-[#05070B] text-white",
      )}
      data-testid="exportunity-marketplace"
    >
      <header className="sticky top-0 z-[1100] border-b border-slate-200 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#05070B]/95">
        <div className="mx-auto flex h-[68px] max-w-[1680px] items-center gap-3 px-3 sm:px-6">
          <Link href="/" className="shrink-0" aria-label="Exportunity home">
            <span className="flex h-9 w-[112px] items-center overflow-hidden rounded-md bg-white shadow-sm dark:bg-[#07111F] sm:h-10 sm:w-[154px]">
              <img
                src={
                  theme === "dark"
                    ? "/tenants/exportunity/official/logo-long-transparent.png"
                    : "/tenants/exportunity/official/logo-long-light.png"
                }
                alt="Exportunity AI"
                className="h-full w-full object-contain"
              />
            </span>
          </Link>
          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex" aria-label="Main navigation">
            <Link href="/" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
              {language === "fr" ? "Accueil" : "Home"}
            </Link>
            <span className="rounded-md bg-[#F5A623]/16 px-3 py-2 text-sm font-semibold text-[#7A4D00] dark:text-[#F8C45B]">
              Marketplace
            </span>
            <Link href="/industrial" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
              {language === "fr" ? "Industries" : "Industries"}
            </Link>
            <Link href="/trade" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
              {language === "fr" ? "Intelligence marches" : "Trade intelligence"}
            </Link>
            <Link href="/producer-exchange" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
              {language === "fr" ? "Bourse producteurs" : "Producer exchange"}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLanguage(language === "fr" ? "en" : "fr")}
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 dark:border-white/15 dark:bg-[#0A1628] dark:text-white sm:h-10 sm:w-10"
              aria-label={language === "fr" ? "Use English" : "Utiliser le francais"}
            >
              <Languages className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 dark:border-white/15 dark:bg-[#0A1628] dark:text-white sm:h-10 sm:w-10"
              aria-label={theme === "light" ? "Use dark mode" : "Use light mode"}
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <Link
              href={isAuthenticated ? "/ai-team" : "/auth?next=/ai-team"}
              className="hidden h-10 items-center gap-2 rounded-md bg-[#07111F] px-3 text-xs font-semibold text-white sm:inline-flex dark:bg-[#F5A623] dark:text-[#07111F]"
            >
              <LogIn className="h-4 w-4" />
              {language === "fr" ? "Plateforme" : "Platform"}
            </Link>
          </div>
        </div>
      </header>

      <div
        className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,370px)] lg:items-start"
        data-testid="marketplace-primary-grid"
      >
        <main className="contents">
          <section className="order-1 min-w-0 border-b border-slate-200 pb-4 dark:border-white/10 lg:col-start-1 lg:row-start-1">
            <p className="text-xs font-bold uppercase text-[#9A6200] dark:text-[#F5A623]">
              Exportunity marketplace · proximity first
            </p>
            <div className="mt-2 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
              <div className="max-w-3xl">
                <h1 className="text-2xl font-semibold leading-tight text-[#07111F] dark:text-white sm:text-4xl">
                  {language === "fr"
                    ? "Commencez autour de vous. Elargissez sans limite."
                    : "Start around you. Expand without limits."}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
                  {language === "fr"
                    ? "Produits, commerces et usines sont reunis dans un seul Marketplace. Le rayon montre d'abord les offres les plus proches, puis vous laisse explorer plus loin."
                    : "Products, shops, and factories live in one Marketplace. The radius shows the nearest offers first, then lets you explore farther."}
                </p>
              </div>
              <Link
                href="/apply/shop"
                className="inline-flex min-h-10 items-center gap-2 self-start rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-[#F5A623] dark:border-white/20 dark:bg-white/5 dark:text-white xl:self-auto"
              >
                <Store className="h-4 w-4 text-[#B26F00] dark:text-[#F5A623]" />
                {language === "fr" ? "Vendre sur le Marketplace" : "Sell on the Marketplace"}
              </Link>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#0A1628] sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={locate}
                className={cn(
                  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold transition",
                  locationState === "ready"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-300/15 dark:text-emerald-200"
                    : "bg-[#07111F] text-white dark:bg-[#F5A623] dark:text-[#07111F]",
                )}
              >
                <LocateFixed className={cn("h-4 w-4", locationState === "locating" && "animate-pulse")} />
                {locationState === "ready"
                  ? language === "fr"
                    ? "Position active"
                    : "Location active"
                  : language === "fr"
                    ? "Utiliser ma position"
                    : "Use my location"}
              </button>
              <p className="min-w-0 flex-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {locationMessage}
              </p>
              <div className="flex gap-1 overflow-x-auto" aria-label={language === "fr" ? "Rayon" : "Radius"}>
                {SCOPE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setScope(option)}
                    className={cn(
                      "min-h-9 shrink-0 rounded-md border px-3 text-xs font-semibold transition",
                      scope === option
                        ? "border-[#F5A623] bg-[#FFF8E8] text-[#7A4D00] dark:bg-[#F5A623]/12 dark:text-[#F8C45B]"
                        : "border-slate-200 text-slate-600 hover:border-[#F5A623]/70 dark:border-white/15 dark:text-slate-300",
                    )}
                  >
                    {scopeLabel(option, language)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="order-3 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#0A1628] lg:col-start-1 lg:row-start-3" aria-label="Marketplace proximity map">
            <div className="relative h-[420px] sm:h-[500px]">
              <MapContainer
                center={AFRICA_CENTER}
                zoom={3}
                minZoom={2}
                maxZoom={18}
                scrollWheelZoom
                className="h-full w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url={
                    theme === "dark"
                      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  }
                />
                <ProximityViewport location={userLocation} scope={scope} />
                {userLocation ? (
                  <>
                    {scope !== "global" ? (
                      <Circle
                        center={[userLocation.latitude, userLocation.longitude]}
                        radius={scope * 1000}
                        pathOptions={{
                          color: "#F5A623",
                          fillColor: "#F5A623",
                          fillOpacity: 0.08,
                          weight: 2,
                          dashArray: "8 8",
                        }}
                      />
                    ) : null}
                    <Marker
                      position={[userLocation.latitude, userLocation.longitude]}
                      icon={markerIcon("user")}
                      zIndexOffset={1200}
                    >
                      <Tooltip direction="top" offset={[0, -12]} opacity={0.96}>
                        {language === "fr" ? "Vous etes ici" : "You are here"}
                      </Tooltip>
                    </Marker>
                  </>
                ) : null}
                {shops.map((shop) => {
                  const latitude = finiteCoordinate(shop.latitude);
                  const longitude = finiteCoordinate(shop.longitude);
                  if (latitude === null || longitude === null) return null;
                  return (
                    <Marker
                      key={`shop-${shop.id}`}
                      position={[latitude, longitude]}
                      icon={markerIcon("shop")}
                    >
                      <Tooltip direction="top" offset={[0, -16]} opacity={0.96}>
                        <span className="font-semibold">{shop.shopName}</span>
                        <br />
                        {shop.distanceText || (language === "fr" ? "Commerce approuve" : "Approved shop")}
                      </Tooltip>
                    </Marker>
                  );
                })}
                {mappedFactories.map(({ factory, latitude, longitude }) => (
                  <Marker
                    key={`factory-${factory.id}`}
                    position={[latitude, longitude]}
                    icon={markerIcon("factory")}
                  >
                    <Tooltip direction="top" offset={[0, -16]} opacity={0.96}>
                      <span className="font-semibold">{factory.name}</span>
                      <br />
                      {language === "fr" ? "Usine verifiee" : "Verified factory"}
                    </Tooltip>
                  </Marker>
                ))}
              </MapContainer>

              <div className="pointer-events-none absolute left-3 top-3 z-[500] max-w-[calc(100%-24px)] rounded-lg border border-white/90 bg-white/94 p-3 shadow-md backdrop-blur dark:border-white/15 dark:bg-[#07111F]/92">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#07111F] dark:text-white">
                  <MapPin className="h-4 w-4 text-[#B26F00] dark:text-[#F5A623]" />
                  {userLocation
                    ? language === "fr"
                      ? `${scopeLabel(scope, language)} autour de vous`
                      : `${scopeLabel(scope, language)} around you`
                    : language === "fr"
                      ? "Vue d'ensemble — activez votre position"
                      : "Overview — enable your location"}
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                  {mappedShopCount} {language === "fr" ? "commerces cartographies" : "mapped shops"} · {mappedFactories.length}{" "}
                  {language === "fr" ? "usines verifiees" : "verified factories"}
                </p>
              </div>

              <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex gap-2 rounded-lg border border-white/90 bg-white/94 p-2 text-[10px] font-semibold text-slate-700 shadow-md backdrop-blur dark:border-white/15 dark:bg-[#07111F]/92 dark:text-slate-200">
                <span className="inline-flex items-center gap-1"><span className="grid h-4 w-4 place-items-center rounded bg-[#F5A623] text-[8px] font-black text-[#07111F]">S</span>{language === "fr" ? "Commerce" : "Shop"}</span>
                <span className="inline-flex items-center gap-1"><span className="grid h-4 w-4 place-items-center rounded bg-[#07111F] text-[8px] font-black text-white">F</span>{language === "fr" ? "Usine" : "Factory"}</span>
              </div>
            </div>
          </section>
        </main>

        <aside
          ref={assistantRef}
          className="relative z-[100] isolate order-4 min-w-0 scroll-mt-20 lg:sticky lg:top-[84px] lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:h-[calc(100vh-100px)]"
          aria-label="Exportunity commercial assistant"
        >
          <div className="mb-2 flex items-center justify-between gap-3 lg:hidden">
            <div>
              <p className="text-[11px] font-bold uppercase text-[#9A6200] dark:text-[#F5A623]">Exportunity AI</p>
              <h2 className="text-lg font-semibold text-[#07111F] dark:text-white">
                {language === "fr" ? "Parlez a Awa" : "Talk to Awa"}
              </h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-300/15 dark:text-emerald-200">
              {language === "fr" ? "Dossier" : "Case"}
            </span>
          </div>
          <IndustrialAssistantChat
            language={language}
            requester={user}
            context={assistantContext}
            product={selectedListing?.assistantProduct || null}
            onCloseProduct={() => setSelectedListing(null)}
            mode="commercial"
            pane
            className="mt-0 h-[440px] min-h-0 rounded-lg sm:h-[520px] lg:h-full lg:min-h-[610px]"
          />
        </aside>

        <section className="order-2 min-w-0 lg:col-start-1 lg:row-start-2" aria-labelledby="marketplace-results-title">
          <div className="mt-4 border-y border-slate-200 py-4 dark:border-white/10">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase text-[#9A6200] dark:text-[#F5A623]">
                  {language === "fr" ? "Marketplace unifie" : "Unified marketplace"}
                </p>
                <h2 id="marketplace-results-title" className="mt-1 text-xl font-semibold text-[#07111F] dark:text-white">
                  {userLocation
                    ? language === "fr"
                      ? "Du plus proche au plus eloigne"
                      : "Nearest first"
                    : language === "fr"
                      ? "Catalogue disponible — activez la proximite"
                      : "Available catalog — enable proximity"}
                </h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-300">
                  {language === "fr"
                    ? "Les annonces approuvees restent distinctes des references documentees. Prix, stock et capacite sont confirmes dans le dossier avant engagement."
                    : "Approved listings remain distinct from documented references. Price, stock, and capacity are confirmed in the case before commitment."}
                </p>
              </div>
              <label className="flex min-h-10 w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-slate-500 dark:border-white/15 dark:bg-[#0A1628] dark:text-slate-300 xl:w-[340px]">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={language === "fr" ? "Produit, commerce, usine..." : "Product, shop, factory..."}
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                />
              </label>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {[
                { slug: "all", label: language === "fr" ? "Tout" : "All", icon: Globe2 },
                { slug: "marketplace", label: language === "fr" ? "Commerces et produits" : "Shops and products", icon: ShoppingBag },
                { slug: "industrial", label: language === "fr" ? "Industrie" : "Industrial", icon: Factory },
                ...(categoriesQuery.data || []).map((item) => ({ ...item, label: item.name, icon: PackageSearch })),
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => setCategory(item.slug)}
                    className={cn(
                      "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition",
                      category === item.slug
                        ? "border-[#F5A623] bg-[#FFF8E8] text-[#7A4D00] dark:bg-[#F5A623]/12 dark:text-[#F8C45B]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-[#F5A623]/70 dark:border-white/15 dark:bg-[#0A1628] dark:text-slate-300",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {nearbyQuery.data?.fallback?.used ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
              {language === "fr"
                ? "Aucune annonce vendeur approuvee n'est encore disponible dans ce rayon. Les premiers resultats plus lointains restent separes des references industrielles documentees."
                : "No approved seller listing is available inside this radius yet. The nearest wider results remain separate from documented industrial references."}
            </div>
          ) : null}

          {expandedScopeFallback ? (
            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-100">
              {language === "fr"
                ? `Aucune annonce avec une distance verifiee dans le rayon de ${scopeLabel(scope, language)}. Les references plus larges ci-dessous sont affichees separement; leur distance, leur vendeur et leur stock restent a confirmer dans le dossier.`
                : `No listing with a verified distance is available inside ${scopeLabel(scope, language)}. The wider references below are shown separately; their distance, seller, and stock still require confirmation in the case.`}
            </div>
          ) : null}

          {userLocation && !nearbyQuery.isLoading && retailProductCount === 0 ? (
            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0A1628] sm:grid-cols-[42px_minmax(0,1fr)_auto] sm:items-center">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-[#07111F] text-[#F5A623]"><ShoppingBag className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {language === "fr" ? "Aucune annonce locale verifiee dans ce rayon pour le moment" : "No verified local listing in this radius yet"}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-300">
                  {language === "fr"
                    ? "Elargissez le rayon ou demandez a Awa de lancer un sourcing. Le catalogue d'usines reste affiche avec son niveau de preuve."
                    : "Widen the radius or ask Awa to start sourcing. The factory catalog remains visible with its evidence level."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScope((current) => (current === 10 ? 50 : current === 50 ? 250 : current === 250 ? 1000 : "global"))}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:border-[#F5A623] dark:border-white/20 dark:text-white"
              >
                {language === "fr" ? "Elargir le rayon" : "Widen radius"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {nearbyQuery.isLoading || factoriesQuery.isLoading || catalogQuery.isLoading ? (
            <div className="mt-4 grid min-h-[180px] place-items-center rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#0A1628]">
              <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#F5A623]/30 border-t-[#F5A623]" />
                {language === "fr" ? "Classement des offres..." : "Ranking marketplace results..."}
              </div>
            </div>
          ) : visibleListings.length ? (
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
              {visibleListings.map((listing) => (
                <ListingCard
                  key={listing.key}
                  listing={listing}
                  language={language}
                  selected={selectedListing?.key === listing.key}
                  onSelect={() => openListing(listing)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 grid min-h-[190px] place-items-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center dark:border-white/15 dark:bg-[#0A1628]">
              <div className="max-w-lg">
                <Building2 className="mx-auto h-8 w-8 text-[#B26F00] dark:text-[#F5A623]" />
                <h3 className="mt-3 text-base font-semibold text-slate-950 dark:text-white">
                  {language === "fr" ? "Aucun resultat publie pour cette recherche" : "No published result for this search"}
                </h3>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-300">
                  {language === "fr"
                    ? "Awa peut transformer votre besoin en dossier de sourcing suivi sans inventer un fournisseur, un stock ou une capacite."
                    : "Awa can turn your need into a tracked sourcing case without inventing a supplier, stock level, or capacity."}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
