import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import L from "leaflet";
import { Link, useLocation } from "wouter";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Factory,
  Landmark,
  Languages,
  List,
  MapPinned,
  MessageCircle,
  Moon,
  PackageSearch,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings2,
  Sun,
  Trash2,
  Wrench,
} from "lucide-react";

import { useLocale } from "@/contexts/LocaleContext";
import { VoiceToTextButton } from "@/components/chat/VoiceToTextButton";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  BENIN_INDUSTRIAL_CONTEXT_LOCATIONS,
  BENIN_INDUSTRIAL_MAP_CENTER,
  BENIN_INDUSTRIAL_SECTOR_LENSES,
  industrialContextText,
  type IndustrialContextLocation,
} from "@/components/exportunity/industrialContext";
import { IndustrialAssistantChat } from "@/components/exportunity/IndustrialAssistantChat";
import FactoryWorkspacePage from "@/pages/exportunity/FactoryWorkspacePage";

type ThemeMode = "light" | "dark";
type IndustrialView =
  | "home"
  | "factories"
  | "factoryProfile"
  | "products"
  | "supply"
  | "machinery"
  | "quote"
  | "register"
  | "claim"
  | "map"
  | "factoryWorkspace";

type PublicFactory = {
  id: string;
  name: string;
  industry: string;
  countryCode: string;
  region?: string | null;
  city?: string | null;
  industrialZone?: string | null;
  description?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  certifications: string[];
  exportMarkets: string[];
  latitude: number | null;
  longitude: number | null;
  verification: "verified";
};

type FactoryDirectoryFilters = {
  countryCode: string;
  region: string;
  city: string;
  industrialZone: string;
  industry: string;
};

type FactoryDirectoryMode = "map" | "table";

const EMPTY_FACTORY_DIRECTORY_FILTERS: FactoryDirectoryFilters = {
  countryCode: "",
  region: "",
  city: "",
  industrialZone: "",
  industry: "",
};

type CatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  categoryCode: string;
  classification: string;
  productCode?: string | null;
  supplyModes: string[];
  priceMode: string;
  availabilityStatus: string;
  manufacturer?: string | null;
  brand?: string | null;
  model?: string | null;
  partNumber?: string | null;
  countryOfOrigin?: string | null;
  application?: string | null;
  compatibleMachinery?: string[];
  material?: string | null;
  unitOfMeasure?: string | null;
  minimumOrderQuantity?: string | null;
  productionCapacityText?: string | null;
  leadTimeText?: string | null;
  certifications?: string[];
  media: string[];
  factoryId: string;
  factoryName: string;
  factoryCity?: string | null;
  factoryCountryCode: string;
};

type IndustrialSearchContext = {
  requirementType?: string | null;
  categoryCode?: string | null;
};

type PublicFactoryProfile = {
  factory: PublicFactory;
  catalog: Array<{
    id: string;
    name: string;
    description?: string | null;
    categoryCode: string;
    classification: string;
    productCode?: string | null;
    supplyModes: string[];
    priceMode: string;
    availabilityStatus: string;
    manufacturer?: string | null;
    brand?: string | null;
    model?: string | null;
    partNumber?: string | null;
    countryOfOrigin?: string | null;
    application?: string | null;
    compatibleMachinery?: string[];
    material?: string | null;
    unitOfMeasure?: string | null;
    minimumOrderQuantity?: string | null;
    productionCapacityText?: string | null;
    leadTimeText?: string | null;
    certifications?: string[];
    media: string[];
  }>;
  productionLines: Array<{
    id: string;
    name: string;
    industry?: string | null;
    summary?: string | null;
    operatingStatus: string;
  }>;
  machines: Array<{
    id: string;
    name: string;
    manufacturer?: string | null;
    model?: string | null;
    machineCategory?: string | null;
    operatingStatus: string;
    productionLineId?: string | null;
  }>;
};

type TaxonomyCategory = {
  code: string;
  classification: string;
  label: { fr: string; en: string };
  description: { fr: string; en: string };
  examples: { fr: string[]; en: string[] };
};

const GDIZ_CONTEXT = BENIN_INDUSTRIAL_CONTEXT_LOCATIONS.find(
  (context) => context.id === "gdiz",
)!;
const PORT_COTONOU_CONTEXT = BENIN_INDUSTRIAL_CONTEXT_LOCATIONS.find(
  (context) => context.id === "port-cotonou",
)!;

const NAVIGATION = [
  { href: "/factories", key: "factories", icon: Factory },
  { href: "/map", key: "map", icon: MapPinned },
  { href: "/export-products", key: "products", icon: PackageSearch },
  { href: "/industrial-supply", key: "supply", icon: Settings2 },
  { href: "/machinery", key: "machinery", icon: Wrench },
  { href: "/request-quote", key: "quote", icon: ClipboardList },
] as const;

function readView(path: string): IndustrialView {
  const pathname = path.split("?")[0] || "/industrial";
  if (pathname.startsWith("/my-factory")) return "factoryWorkspace";
  if (pathname.startsWith("/factories/register")) return "register";
  if (/^\/factories\/[0-9a-f-]{36}\/claim\/?$/i.test(pathname)) return "claim";
  if (/^\/factories\/[0-9a-f-]{36}\/?$/i.test(pathname))
    return "factoryProfile";
  if (pathname.startsWith("/request-quote")) return "quote";
  if (pathname === "/map" || pathname.startsWith("/industrial-map"))
    return "map";
  if (pathname.startsWith("/factories")) return "factories";
  if (pathname.startsWith("/export-products")) return "products";
  if (pathname.startsWith("/industrial-supply")) return "supply";
  if (pathname.startsWith("/machinery")) return "machinery";
  return "home";
}

function categoryRoute(category: TaxonomyCategory) {
  const query = `category=${encodeURIComponent(category.code)}`;
  if (category.classification === "export_ready_factory_product")
    return `/export-products?${query}`;
  if (category.classification === "machinery") return `/machinery?${query}`;
  return `/industrial-supply?${query}`;
}

function requirementTypeForCategory(category: TaxonomyCategory) {
  return category.classification === "export_ready_factory_product"
    ? "export_quotation"
    : category.classification;
}

const REQUIREMENT_TYPE_BY_CLASSIFICATION: Record<string, string> = {
  machinery: "machinery",
  raw_material: "raw_material",
  industrial_input: "industrial_input",
  spare_part: "spare_part",
  industrial_service: "industrial_service",
  export_ready_factory_product: "export_quotation",
};

function catalogRequirementHref(item: CatalogItem) {
  const params = new URLSearchParams({
    type:
      REQUIREMENT_TYPE_BY_CLASSIFICATION[item.classification] ||
      "industrial_service",
    factory: item.factoryId,
    product: item.name,
  });
  if (item.categoryCode) params.set("category", item.categoryCode);
  return `/request-quote?${params.toString()}`;
}

function queryValue(location: string, key: string) {
  const query = location.includes("?")
    ? location.split("?")[1]
    : typeof window !== "undefined"
      ? window.location.search.slice(1)
      : "";
  return new URLSearchParams(query || "").get(key) || "";
}

function factoryClaimId(location: string) {
  const pathname = location.split("?")[0] || "";
  const match = pathname.match(/^\/factories\/([0-9a-f-]{36})\/claim\/?$/i);
  return match?.[1] || "";
}

function factoryProfileId(location: string) {
  const pathname = location.split("?")[0] || "";
  const match = pathname.match(/^\/factories\/([0-9a-f-]{36})\/?$/i);
  return match?.[1] || "";
}

function mapFactoryIcon(active: boolean) {
  return L.divIcon({
    className: "exportunity-industrial-marker",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${active ? 38 : 30}px;height:${active ? 38 : 30}px;border-radius:999px;border:3px solid #ffffff;background:${active ? "#F5A623" : "#07111F"};box-shadow:0 8px 18px rgba(7,17,31,.28);color:white;font-weight:800;font-size:14px">${active ? "&#10003;" : "&bull;"}</span>`,
    iconSize: [active ? 38 : 30, active ? 38 : 30],
    iconAnchor: [active ? 19 : 15, active ? 19 : 15],
  });
}

function mapIndustrialContextIcon(
  context: IndustrialContextLocation,
  active: boolean,
) {
  const markerStyles = {
    industrial_zone: {
      background: "#07111F",
      border: "#F5A623",
      color: "#F5A623",
    },
    logistics_gateway: {
      background: "#FFFFFF",
      border: "#0B1D33",
      color: "#07111F",
    },
    innovation_hub: {
      background: "#F5A623",
      border: "#07111F",
      color: "#07111F",
    },
    agro_processing_reference: {
      background: "#07111F",
      border: "#FFFFFF",
      color: "#FFFFFF",
    },
  } as const;
  const style = markerStyles[context.kind];
  const label = context.markerLabel;
  return L.divIcon({
    className: "exportunity-industrial-context-marker",
    html: `<span style="display:flex;align-items:center;justify-content:center;min-width:${active ? 58 : 50}px;height:${active ? 42 : 38}px;padding:0 8px;border-radius:12px;border:2px solid ${style.border};background:${style.background};box-shadow:0 10px 24px rgba(7,17,31,.38);color:${style.color};font-weight:900;font-size:11px;letter-spacing:.08em;transition:all .2s ease">${label}</span>`,
    iconSize: [active ? 58 : 50, active ? 42 : 38],
    iconAnchor: [active ? 29 : 25, active ? 21 : 19],
  });
}

function MapViewport({
  factory,
  context,
}: {
  factory: PublicFactory | null;
  context: IndustrialContextLocation | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (factory && factory.latitude !== null && factory.longitude !== null) {
      map.flyTo([factory.latitude, factory.longitude], 13, { duration: 0.75 });
      return;
    }
    if (context) {
      map.flyTo([context.latitude, context.longitude], 12, { duration: 0.75 });
    }
  }, [context, factory, map]);
  return null;
}

function IndustrialMap({
  factories,
  selectedFactory,
  onSelectFactory,
  className,
  isDark,
  language,
  showEmptyState = true,
  selectedContext = null,
  onSelectContext,
}: {
  factories: PublicFactory[];
  selectedFactory: PublicFactory | null;
  onSelectFactory: (factory: PublicFactory) => void;
  className?: string;
  isDark: boolean;
  language: "fr" | "en";
  showEmptyState?: boolean;
  selectedContext?: IndustrialContextLocation | null;
  onSelectContext?: (context: IndustrialContextLocation) => void;
}) {
  const visibleFactories = factories.filter(
    (factory) => factory.latitude !== null && factory.longitude !== null,
  );
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-900/10 bg-slate-200",
        className,
      )}
    >
      <MapContainer
        center={BENIN_INDUSTRIAL_MAP_CENTER}
        zoom={9}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
        aria-label={
          language === "fr"
            ? "Carte industrielle du Benin"
            : "Benin industrial map"
        }
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={
            isDark
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
        />
        <ZoomControl position="bottomright" />
        <MapViewport factory={selectedFactory} context={selectedContext} />
        <Polyline
          positions={[
            [GDIZ_CONTEXT.latitude, GDIZ_CONTEXT.longitude],
            [PORT_COTONOU_CONTEXT.latitude, PORT_COTONOU_CONTEXT.longitude],
          ]}
          pathOptions={{
            color: "#F5A623",
            dashArray: "7 10",
            lineCap: "round",
            opacity: isDark ? 0.82 : 0.7,
            weight: 3,
          }}
        >
          <Tooltip sticky direction="top" opacity={1}>
            <span className="block text-xs font-semibold text-slate-800">
              {language === "fr"
                ? "Repere de liaison GDIZ - Port de Cotonou"
                : "GDIZ - Port of Cotonou reference link"}
            </span>
            <span className="mt-0.5 block text-xs text-slate-600">
              {language === "fr"
                ? "Contexte public de chaine logistique, pas un itineraire de transport."
                : "Public supply-chain context, not a transport route."}
            </span>
          </Tooltip>
        </Polyline>
        {BENIN_INDUSTRIAL_CONTEXT_LOCATIONS.map((context) => (
          <Marker
            key={context.id}
            position={[context.latitude, context.longitude]}
            icon={mapIndustrialContextIcon(
              context,
              selectedContext?.id === context.id,
            )}
            eventHandlers={
              onSelectContext
                ? { click: () => onSelectContext(context) }
                : undefined
            }
            zIndexOffset={selectedContext?.id === context.id ? 900 : 450}
          >
            <Tooltip direction="top" offset={[0, -22]} opacity={1}>
              <span className="block text-sm font-semibold">
                {industrialContextText(context.name, language)}
              </span>
              <span className="mt-0.5 block text-xs text-slate-600">
                {language === "fr"
                  ? "Information publique - pas une usine verifiee"
                  : "Public information - not a verified factory"}
              </span>
            </Tooltip>
          </Marker>
        ))}
        {visibleFactories.map((factory) => (
          <Marker
            key={factory.id}
            position={[factory.latitude as number, factory.longitude as number]}
            icon={mapFactoryIcon(selectedFactory?.id === factory.id)}
            eventHandlers={{ click: () => onSelectFactory(factory) }}
          >
            <Tooltip direction="top" offset={[0, -14]} opacity={1}>
              <span className="block text-sm font-semibold">
                {factory.name}
              </span>
              <span className="mt-0.5 block text-xs text-slate-600">
                {factory.industry}
              </span>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(245,166,35,0.18),transparent_26%),radial-gradient(circle_at_83%_70%,rgba(7,17,31,0.2),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(7,17,31,0.1))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#07111F]/45 to-transparent" />
      {showEmptyState && visibleFactories.length === 0 ? (
        <div className="absolute bottom-4 left-4 z-[500] max-w-[326px] rounded-xl border border-white/70 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-white/15 dark:bg-[#07111F]/95">
          <MapPinned className="h-5 w-5 text-[#a96f0b]" />
          <p className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">
            {language === "fr"
              ? "La carte montre déjà les repères industriels publics"
              : "The map already shows public industrial references"}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {language === "fr"
              ? "GDIZ, le Port de Cotonou, Seme City et Ketou sont affiches comme contexte public. Les usines ne sont ajoutees qu'apres verification et autorisation de publication."
              : "GDIZ, the Port of Cotonou, Seme City, and Ketou appear as public context. Factories are added only after verification and publication approval."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/request-quote"
              className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-[#F5A623] px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-[#f9a800]"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              {language === "fr"
                ? "Soumettre un besoin"
                : "Submit a requirement"}
            </Link>
            <Link
              href="/factories/register"
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/10"
            >
              {language === "fr"
                ? "Enregistrer une usine"
                : "Register a factory"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b8720d]">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
        {title}
      </h1>
      {detail ? (
        <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center dark:border-white/15 dark:bg-slate-900/70">
      <Building2 className="mx-auto h-8 w-8 text-[#b8720d]" />
      <h3 className="mt-4 text-base font-semibold text-slate-950 dark:text-white">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
        {detail}
      </p>
    </div>
  );
}

function StatusPill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/20 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-200">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

function uniqueFactoryValues(
  factories: PublicFactory[],
  pick: (factory: PublicFactory) => string | null | undefined,
) {
  return Array.from(
    new Set(
      factories
        .map(pick)
        .filter((value): value is string => Boolean(value?.trim())),
    ),
  ).sort((left, right) => left.localeCompare(right, "fr"));
}

function FactoryDirectoryFilters({
  factories,
  filters,
  onChange,
  language,
}: {
  factories: PublicFactory[];
  filters: FactoryDirectoryFilters;
  onChange: (filters: FactoryDirectoryFilters) => void;
  language: "fr" | "en";
}) {
  if (!factories.length) return null;

  const isFiltered = Object.values(filters).some(Boolean);
  const labels: Record<keyof FactoryDirectoryFilters, string> = {
    countryCode: language === "fr" ? "Pays" : "Country",
    region: language === "fr" ? "Région" : "Region",
    city: language === "fr" ? "Ville" : "City",
    industrialZone: language === "fr" ? "Zone industrielle" : "Industrial zone",
    industry: language === "fr" ? "Industrie" : "Industry",
  };
  const optionValues: Record<keyof FactoryDirectoryFilters, string[]> = {
    countryCode: uniqueFactoryValues(
      factories,
      (factory) => factory.countryCode,
    ),
    region: uniqueFactoryValues(factories, (factory) => factory.region),
    city: uniqueFactoryValues(factories, (factory) => factory.city),
    industrialZone: uniqueFactoryValues(
      factories,
      (factory) => factory.industrialZone,
    ),
    industry: uniqueFactoryValues(factories, (factory) => factory.industry),
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-white">
            {language === "fr"
              ? "Filtrer les usines vérifiées"
              : "Filter verified factories"}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {language === "fr"
              ? "Les filtres s'appliquent à la carte et au répertoire public."
              : "Filters apply to the public map and directory."}
          </p>
        </div>
        {isFiltered ? (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FACTORY_DIRECTORY_FILTERS)}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/10"
          >
            {language === "fr" ? "Réinitialiser" : "Reset"}
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(Object.keys(labels) as Array<keyof FactoryDirectoryFilters>).map(
          (key) => (
            <label key={key} className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                {labels[key]}
              </span>
              <select
                value={filters[key]}
                onChange={(event) =>
                  onChange({ ...filters, [key]: event.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20 dark:border-white/15 dark:bg-[#07111F] dark:text-white"
              >
                <option value="">{language === "fr" ? "Tous" : "All"}</option>
                {optionValues[key].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ),
        )}
      </div>
    </section>
  );
}

function FactoryList({
  factories,
  selectedFactory,
  onSelect,
  language,
}: {
  factories: PublicFactory[];
  selectedFactory: PublicFactory | null;
  onSelect: (factory: PublicFactory) => void;
  language: "fr" | "en";
}) {
  if (!factories.length) {
    return (
      <EmptyState
        title={
          language === "fr"
            ? "Aucune usine vérifiée n'est encore publiée"
            : "No verified factories are published yet"
        }
        detail={
          language === "fr"
            ? "Exportunity publie les profils après vérification. Enregistrez votre usine ou soumettez un besoin industriel pour être accompagné."
            : "Exportunity publishes profiles after verification. Register your factory or submit an industrial requirement to be assisted."
        }
      />
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {factories.map((factory) => (
        <div key={factory.id} className="space-y-2">
          <button
            type="button"
            onClick={() => onSelect(factory)}
            className={cn(
              "group rounded-2xl border bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-xl dark:bg-slate-900",
              selectedFactory?.id === factory.id
                ? "border-[#F5A623] ring-2 ring-[#F5A623]/20"
                : "border-slate-200 dark:border-white/10",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-slate-950 dark:text-white">
                  {factory.name}
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {factory.industry}
                </p>
              </div>
              <StatusPill>
                {language === "fr" ? "Vérifiée" : "Verified"}
              </StatusPill>
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <MapPinned className="h-4 w-4 text-[#b8720d]" />
              {[factory.industrialZone, factory.city, factory.countryCode]
                .filter(Boolean)
                .join(", ")}
            </div>
            {factory.description ? (
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {factory.description}
              </p>
            ) : null}
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-slate-900 group-hover:text-[#a96f0b] dark:text-white">
              {language === "fr"
                ? "Voir le profil public"
                : "View public profile"}
              <ChevronRight className="h-4 w-4" />
            </span>
          </button>
          <Link
            href={`/factories/${factory.id}`}
            className="inline-flex text-xs font-semibold text-slate-800 hover:text-[#a96f0b] dark:text-slate-200 dark:hover:text-[#F5A623]"
          >
            {language === "fr"
              ? "Ouvrir la fiche d'usine"
              : "Open factory profile"}
          </Link>
          <Link
            href={`/factories/${factory.id}/claim`}
            className="inline-flex text-xs font-semibold text-[#a96f0b] hover:text-[#8a5907] dark:hover:text-[#F5A623]"
          >
            {language === "fr"
              ? "Revendiquer ce profil d'usine"
              : "Claim this factory profile"}
          </Link>
        </div>
      ))}
    </div>
  );
}

function FactoryDirectoryModeToggle({
  mode,
  onChange,
  language,
}: {
  mode: FactoryDirectoryMode;
  onChange: (mode: FactoryDirectoryMode) => void;
  language: "fr" | "en";
}) {
  const options: Array<{
    value: FactoryDirectoryMode;
    label: string;
    icon: typeof MapPinned;
  }> = [
    {
      value: "map",
      label: language === "fr" ? "Carte" : "Map",
      icon: MapPinned,
    },
    {
      value: "table",
      label: language === "fr" ? "Tableau" : "Table",
      icon: List,
    },
  ];

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-slate-900/70">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
        {language === "fr" ? "Mode d'exploration" : "Browse mode"}
      </p>
      <div
        className="inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-[#07111F]"
        role="group"
        aria-label={language === "fr" ? "Mode d'affichage" : "Display mode"}
      >
        {options.map((option) => {
          const Icon = option.icon;
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              title={option.label}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition",
                active
                  ? "bg-[#F5A623] text-slate-950"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FactoryDirectoryTable({
  factories,
  selectedFactory,
  onSelect,
  language,
}: {
  factories: PublicFactory[];
  selectedFactory: PublicFactory | null;
  onSelect: (factory: PublicFactory) => void;
  language: "fr" | "en";
}) {
  if (!factories.length) {
    return (
      <EmptyState
        title={
          language === "fr"
            ? "Aucune usine vérifiée n'est encore publiée"
            : "No verified factories are published yet"
        }
        detail={
          language === "fr"
            ? "Les profils restent privés jusqu'à leur vérification et leur autorisation de publication."
            : "Profiles remain private until verification and publication approval."
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/90 text-xs uppercase tracking-[0.11em] text-slate-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-400">
          <tr>
            <th className="px-5 py-3 font-semibold">
              {language === "fr" ? "Usine" : "Factory"}
            </th>
            <th className="px-5 py-3 font-semibold">
              {language === "fr" ? "Industrie" : "Industry"}
            </th>
            <th className="px-5 py-3 font-semibold">
              {language === "fr" ? "Implantation" : "Location"}
            </th>
            <th className="px-5 py-3 font-semibold">
              {language === "fr" ? "Statut" : "Status"}
            </th>
            <th className="px-5 py-3 font-semibold">
              {language === "fr" ? "Profil" : "Profile"}
            </th>
          </tr>
        </thead>
        <tbody>
          {factories.map((factory) => {
            const active = selectedFactory?.id === factory.id;
            return (
              <tr
                key={factory.id}
                className={cn(
                  "border-b border-slate-100 last:border-0 dark:border-white/5",
                  active && "bg-[#F5A623]/10",
                )}
              >
                <td className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => onSelect(factory)}
                    className="font-semibold text-slate-950 hover:text-[#865400] dark:text-white dark:hover:text-[#F5A623]"
                  >
                    {factory.name}
                  </button>
                  {factory.description ? (
                    <p className="mt-1 max-w-sm truncate text-xs text-slate-500 dark:text-slate-400">
                      {factory.description}
                    </p>
                  ) : null}
                </td>
                <td className="px-5 py-4 text-slate-700 dark:text-slate-200">
                  {factory.industry}
                </td>
                <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                  {[factory.industrialZone, factory.city, factory.countryCode]
                    .filter(Boolean)
                    .join(", ")}
                </td>
                <td className="px-5 py-4">
                  <StatusPill>
                    {language === "fr" ? "Vérifiée" : "Verified"}
                  </StatusPill>
                </td>
                <td className="px-5 py-4">
                  <Link
                    href={`/factories/${factory.id}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-[#865400] hover:text-[#6f4300] dark:text-[#F5A623] dark:hover:text-[#f9b54b]"
                  >
                    {language === "fr" ? "Ouvrir" : "Open"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FactoryMapContextPanel({
  factories,
  selectedFactory,
  selectedContext,
  onSelect,
  onSelectContext,
  language,
}: {
  factories: PublicFactory[];
  selectedFactory: PublicFactory | null;
  selectedContext: IndustrialContextLocation | null;
  onSelect: (factory: PublicFactory) => void;
  onSelectContext: (context: IndustrialContextLocation) => void;
  language: "fr" | "en";
}) {
  const visibleFactories = factories.filter(
    (factory) => factory.latitude !== null && factory.longitude !== null,
  );
  return (
    <aside className="mt-4 lg:absolute lg:right-4 lg:top-4 lg:z-[600] lg:mt-0 lg:max-h-[calc(100%_-_2rem)] lg:w-[340px] lg:overflow-y-auto">
      <div className="rounded-2xl border border-white/70 bg-white/95 p-5 shadow-[0_18px_48px_rgba(7,17,31,0.18)] backdrop-blur-xl dark:border-white/15 dark:bg-[#07111F]/95">
        {selectedFactory ? (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <StatusPill>
                  {language === "fr" ? "Usine vérifiée" : "Verified factory"}
                </StatusPill>
                <h2 className="mt-3 truncate text-lg font-semibold text-slate-950 dark:text-white">
                  {selectedFactory.name}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {selectedFactory.industry}
                </p>
              </div>
              <MapPinned className="mt-1 h-5 w-5 shrink-0 text-[#a96f0b]" />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {[
                selectedFactory.industrialZone,
                selectedFactory.city,
                selectedFactory.countryCode,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            {selectedFactory.description ? (
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
                {selectedFactory.description}
              </p>
            ) : null}
            <Link
              href={`/factories/${selectedFactory.id}`}
              className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#F5A623] px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-[#f9a800]"
            >
              <Factory className="h-4 w-4" />
              {language === "fr"
                ? "Ouvrir la fiche d'usine"
                : "Open factory profile"}
            </Link>
          </div>
        ) : selectedContext ? (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b] dark:text-[#F5A623]">
                  {industrialContextText(selectedContext.eyebrow, language)}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                  {industrialContextText(selectedContext.name, language)}
                </h2>
              </div>
              <Landmark className="mt-1 h-5 w-5 shrink-0 text-[#a96f0b]" />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {industrialContextText(selectedContext.summary, language)}
            </p>
            <a
              href={selectedContext.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#F5A623]/45 bg-[#F5A623]/10 px-3.5 py-2 text-sm font-semibold text-slate-900 hover:border-[#F5A623] hover:bg-[#F5A623]/20 dark:text-white"
            >
              {language === "fr"
                ? `Consulter ${selectedContext.sourceLabel}`
                : `Open ${selectedContext.sourceLabel}`}
              <ArrowRight className="h-4 w-4" />
            </a>
            <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {language === "fr"
                ? "Information publique uniquement. Ce repere ne confirme ni une usine, ni une offre, ni une capacite Exportunity."
                : "Public information only. This reference does not confirm an Exportunity factory, offering, or capacity."}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
              {language === "fr" ? "Carte industrielle" : "Industrial map"}
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
              {visibleFactories.length
                ? language === "fr"
                  ? `${visibleFactories.length} usine${visibleFactories.length > 1 ? "s" : ""} vérifiée${visibleFactories.length > 1 ? "s" : ""} visible${visibleFactories.length > 1 ? "s" : ""}`
                  : `${visibleFactories.length} verified factor${visibleFactories.length > 1 ? "ies" : "y"} visible`
                : language === "fr"
                  ? "Repères industriels et filières publiques"
                  : "Public industrial references and sectors"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {visibleFactories.length
                ? language === "fr"
                  ? "Sélectionnez un marqueur pour consulter une usine publiée et son catalogue approuvé."
                  : "Select a marker to review a published factory and its approved catalog."
                : language === "fr"
                  ? "La carte reste utile avec des infrastructures et filières documentées. Les profils d'usine apparaissent seulement après vérification et autorisation de publication."
                  : "The map remains useful with documented infrastructure and sector context. Factory profiles appear only after verification and publication approval."}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {BENIN_INDUSTRIAL_CONTEXT_LOCATIONS.map((context) => (
                <button
                  key={context.id}
                  type="button"
                  onClick={() => onSelectContext(context)}
                  className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 p-3 text-left transition hover:border-[#F5A623]/60 hover:bg-[#F5A623]/15"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#865400] dark:text-[#F5A623]">
                    {industrialContextText(context.eyebrow, language)}
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-slate-950 dark:text-white">
                    {industrialContextText(context.name, language)}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {industrialContextText(context.summary, language)}
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#865400] dark:text-[#F5A623]">
                    <MapPinned className="h-3.5 w-3.5" />
                    {language === "fr" ? "Voir sur la carte" : "View on map"}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  {language === "fr"
                    ? "Filières à explorer"
                    : "Sectors to explore"}
                </p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {BENIN_INDUSTRIAL_SECTOR_LENSES.map((sector) => (
                  <a
                    key={sector.id}
                    href={sector.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-200 bg-white/60 px-3 py-2.5 transition hover:border-[#F5A623]/55 hover:bg-[#F5A623]/10 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-[#F5A623]/55"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {industrialContextText(sector.title, language)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {industrialContextText(sector.summary, language)}
                    </p>
                  </a>
                ))}
              </div>
            </div>
            {!visibleFactories.length ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/request-quote"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#F5A623] px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-[#f9a800]"
                >
                  <ClipboardList className="h-4 w-4" />
                  {language === "fr"
                    ? "Soumettre un besoin"
                    : "Submit a requirement"}
                </Link>
                <Link
                  href="/factories/register"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/10"
                >
                  <Factory className="h-4 w-4" />
                  {language === "fr"
                    ? "Enregistrer une usine"
                    : "Register a factory"}
                </Link>
              </div>
            ) : null}
          </div>
        )}
        {visibleFactories.length ? (
          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-white/10">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {language === "fr" ? "Usines visibles" : "Visible factories"}
              </p>
              <Link
                href="/factories"
                className="text-xs font-semibold text-[#a96f0b] hover:text-[#8a5907] dark:hover:text-[#F5A623]"
              >
                {language === "fr" ? "Répertoire" : "Directory"}
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {visibleFactories.slice(0, 5).map((factory) => (
                <button
                  key={factory.id}
                  type="button"
                  onClick={() => onSelect(factory)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2.5 text-left transition",
                    selectedFactory?.id === factory.id
                      ? "border-[#F5A623] bg-[#F5A623]/10"
                      : "border-slate-200 bg-white/60 hover:border-[#F5A623]/50 dark:border-white/10 dark:bg-white/[0.035]",
                  )}
                >
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {factory.name}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {factory.industry} -{" "}
                    {[factory.city, factory.countryCode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function CatalogList({
  items,
  language,
  emptyTitle,
  emptyDetail,
}: {
  items: CatalogItem[];
  language: "fr" | "en";
  emptyTitle: string;
  emptyDetail: string;
}) {
  if (!items.length)
    return <EmptyState title={emptyTitle} detail={emptyDetail} />;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                {item.classification.replace(/_/g, " ")}
              </p>
              <h3 className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
                {item.name}
              </h3>
            </div>
            <StatusPill>
              {language === "fr" ? "Approuvé" : "Approved"}
            </StatusPill>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {item.description ||
              (language === "fr"
                ? "Description technique disponible après mise en relation qualifiée."
                : "Technical description is available after qualified introduction.")}
          </p>
          <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300">
            <Link
              href={`/factories/${item.factoryId}`}
              className="font-medium text-slate-900 hover:text-[#a96f0b] dark:text-white dark:hover:text-[#F5A623]"
            >
              {item.factoryName}
            </Link>
            <p className="mt-1">
              {[item.factoryCity, item.factoryCountryCode]
                .filter(Boolean)
                .join(", ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {item.partNumber || item.productCode ? (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  {language === "fr" ? "Réf." : "Ref."}{" "}
                  {item.partNumber || item.productCode}
                </span>
              ) : null}
              {item.minimumOrderQuantity ? (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  MOQ: {item.minimumOrderQuantity}
                </span>
              ) : null}
              {item.leadTimeText ? (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  {language === "fr" ? "Délai" : "Lead time"}:{" "}
                  {item.leadTimeText}
                </span>
              ) : null}
              {item.certifications?.slice(0, 2).map((certification) => (
                <span
                  key={certification}
                  className="rounded-md border border-emerald-700/20 bg-emerald-50 px-2 py-1 text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-200"
                >
                  {certification}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {language === "fr"
                ? "Disponibilité à confirmer • devis après revue technique"
                : "Availability to confirm • quotation after technical review"}
            </p>
            <Link
              href={catalogRequirementHref(item)}
              className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#F5A623]/45 bg-[#F5A623]/10 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:border-[#F5A623] hover:bg-[#F5A623]/20 dark:text-white"
            >
              {language === "fr"
                ? "Demander une cotation"
                : "Request a quotation"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

function IndustrialSearchSummary({
  query,
  factoryCount,
  catalogCount,
  searchContext,
  language,
}: {
  query: string;
  factoryCount: number;
  catalogCount: number;
  searchContext: IndustrialSearchContext | null;
  language: "fr" | "en";
}) {
  const hasResults = factoryCount > 0 || catalogCount > 0;
  const requirementParams = new URLSearchParams({ product: query });
  if (searchContext?.requirementType)
    requirementParams.set("type", searchContext.requirementType);
  if (searchContext?.categoryCode)
    requirementParams.set("category", searchContext.categoryCode);
  const requirementHref = `/request-quote?${requirementParams.toString()}`;

  return (
    <section className="rounded-2xl border border-[#F5A623]/35 bg-[#F5A623]/10 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#865400] dark:text-[#F5A623]">
            {language === "fr" ? "Recherche industrielle" : "Industrial search"}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
            {language === "fr"
              ? `Résultats pour « ${query} »`
              : `Results for “${query}”`}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
            {hasResults
              ? language === "fr"
                ? `${factoryCount} usine${factoryCount === 1 ? "" : "s"} vérifiée${factoryCount === 1 ? "" : "s"} et ${catalogCount} offre${catalogCount === 1 ? "" : "s"} technique${catalogCount === 1 ? "" : "s"} publiée${catalogCount === 1 ? "" : "s"}.`
                : `${factoryCount} verified ${factoryCount === 1 ? "factory" : "factories"} and ${catalogCount} published technical ${catalogCount === 1 ? "offering" : "offerings"}.`
              : language === "fr"
                ? "Aucun profil public ni offre technique approuvée ne correspond exactement à cette recherche."
                : "No public profile or approved technical offering exactly matches this search."}
          </p>
        </div>
        <Link
          href={requirementHref}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[#F5A623] px-3.5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800]"
        >
          <ClipboardList className="h-4 w-4" />
          {language === "fr"
            ? hasResults
              ? "Soumettre un besoin"
              : "Décrire ce besoin"
            : hasResults
              ? "Submit a requirement"
              : "Describe this requirement"}
        </Link>
      </div>
    </section>
  );
}

function CategoryFocus({
  category,
  language,
  clearHref,
}: {
  category: TaxonomyCategory;
  language: "fr" | "en";
  clearHref: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[#F5A623]/35 bg-[#F5A623]/10 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#865400] dark:text-[#F5A623]">
          {language === "fr" ? "Catégorie active" : "Active category"}
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
          {category.label[language]}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-700 dark:text-slate-200">
          {category.description[language]}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link
          href={`/request-quote?type=${encodeURIComponent(requirementTypeForCategory(category))}&category=${encodeURIComponent(category.code)}`}
          className="inline-flex min-h-10 items-center rounded-lg bg-[#F5A623] px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-[#f9a800]"
        >
          {language === "fr" ? "Décrire un besoin" : "Describe a requirement"}
        </Link>
        <Link
          href={clearHref}
          className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/10"
        >
          {language === "fr" ? "Voir toutes" : "View all"}
        </Link>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  detail,
}: {
  label: string;
  children: ReactNode;
  detail?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-800 dark:text-slate-100">
      <span>{label}</span>
      {detail ? (
        <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
          {detail}
        </span>
      ) : null}
      <div className="mt-2">{children}</div>
    </label>
  );
}

const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#F5A623] focus:ring-4 focus:ring-[#F5A623]/15 dark:border-white/15 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500";

type ClaimableFactory = {
  id: string;
  name: string;
  industry: string;
  city?: string | null;
  countryCode: string;
  industrialZone?: string | null;
};

function FactoryClaimForm({
  factoryId,
  language,
}: {
  factoryId: string;
  language: "fr" | "en";
}) {
  const { isAuthenticated } = useSession();
  const [factory, setFactory] = useState<ClaimableFactory | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [relationship, setRelationship] = useState("authorized_representative");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [authorizationReference, setAuthorizationReference] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{
    kind: "idle" | "loading" | "success" | "error";
    text?: string;
  }>({ kind: "idle" });

  useEffect(() => {
    if (!factoryId) {
      setLoadError(
        language === "fr"
          ? "Le profil d'usine demande est introuvable."
          : "The requested factory profile could not be found.",
      );
      return;
    }
    let active = true;
    setLoadError(null);
    fetch(`/api/industrial/factories/${factoryId}`)
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok || !payload?.ok) {
          setLoadError(
            payload?.message ||
              (language === "fr"
                ? "Ce profil d'usine n'est pas disponible pour une demande de propriete."
                : "This factory profile is not available for an ownership claim."),
          );
          return;
        }
        setFactory(payload.factory || null);
      })
      .catch(() => {
        if (active)
          setLoadError(
            language === "fr"
              ? "Le profil d'usine est momentanement indisponible."
              : "The factory profile is temporarily unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [factoryId, language]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactEmail.trim() && !contactPhone.trim()) {
      setStatus({
        kind: "error",
        text:
          language === "fr"
            ? "Ajoutez un e-mail professionnel ou un numero de telephone."
            : "Add a business email or phone number.",
      });
      return;
    }
    setStatus({ kind: "loading" });
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("ece_session")
          : null;
      const response = await fetch(
        `/api/industrial/factories/${factoryId}/claim`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            relationship,
            contactEmail: contactEmail.trim(),
            contactPhone: contactPhone.trim(),
            authorizationReference: authorizationReference.trim(),
            message: message.trim(),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.ok)
        throw new Error(
          payload?.message || "Unable to submit the ownership claim.",
        );
      setStatus({ kind: "success", text: payload.message });
    } catch (error: any) {
      setStatus({
        kind: "error",
        text:
          error?.message ||
          (language === "fr"
            ? "La demande de propriete n'a pas pu etre envoyee."
            : "The ownership claim could not be submitted."),
      });
    }
  };

  if (loadError)
    return (
      <EmptyState
        title={
          language === "fr" ? "Profil indisponible" : "Profile unavailable"
        }
        detail={loadError}
      />
    );
  if (!factory)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-7 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
        {language === "fr"
          ? "Chargement du profil d'usine..."
          : "Loading factory profile..."}
      </div>
    );

  const loginHref = `/login?next=${encodeURIComponent(`/factories/${factory.id}/claim`)}`;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-7">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a96f0b]">
            {language === "fr"
              ? "Profil public verifie"
              : "Verified public profile"}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
            {factory.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {factory.industry} -{" "}
            {[factory.industrialZone, factory.city, factory.countryCode]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>
        <StatusPill>
          {language === "fr" ? "Verification requise" : "Review required"}
        </StatusPill>
      </div>
      <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
        {language === "fr"
          ? "Envoyez une demande uniquement si vous representez cette usine. Exportunity verifie les preuves avant tout transfert de gestion. L'envoi de ce formulaire ne modifie pas le proprietaire du profil."
          : "Send a claim only if you represent this factory. Exportunity verifies the evidence before any management transfer. Submitting this form does not change profile ownership."}
      </p>
      {!isAuthenticated ? (
        <div className="mt-6 rounded-xl border border-[#F5A623]/35 bg-[#F5A623]/10 p-4 text-sm text-slate-800 dark:text-slate-100">
          <p>
            {language === "fr"
              ? "Connectez-vous pour envoyer une demande de propriete et suivre son examen."
              : "Sign in to send an ownership claim and follow its review."}
          </p>
          <Link
            href={loginHref}
            className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-[#F5A623] px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-[#f9a800]"
          >
            {language === "fr" ? "Se connecter" : "Sign in"}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6">
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label={
                language === "fr"
                  ? "Votre lien avec l'usine"
                  : "Your relationship to the factory"
              }
            >
              <select
                value={relationship}
                onChange={(event) => setRelationship(event.target.value)}
                className={fieldClass}
              >
                <option value="authorized_representative">
                  {language === "fr"
                    ? "Representant autorise"
                    : "Authorized representative"}
                </option>
                <option value="managing_director">
                  {language === "fr"
                    ? "Direction generale"
                    : "Managing director"}
                </option>
                <option value="factory_administrator">
                  {language === "fr"
                    ? "Administration d'usine"
                    : "Factory administrator"}
                </option>
                <option value="procurement_manager">
                  {language === "fr"
                    ? "Responsable achats"
                    : "Procurement manager"}
                </option>
                <option value="factory_technician">
                  {language === "fr"
                    ? "Responsable technique"
                    : "Factory technician"}
                </option>
              </select>
            </Field>
            <Field
              label={
                language === "fr"
                  ? "Reference d'autorisation"
                  : "Authorization reference"
              }
              detail={language === "fr" ? "facultatif" : "optional"}
            >
              <input
                value={authorizationReference}
                onChange={(event) =>
                  setAuthorizationReference(event.target.value)
                }
                maxLength={240}
                className={fieldClass}
                placeholder={
                  language === "fr"
                    ? "Ex. mandat, matricule ou reference interne"
                    : "E.g. mandate, employee ID, or internal reference"
                }
              />
            </Field>
            <Field
              label={
                language === "fr" ? "E-mail professionnel" : "Business email"
              }
              detail={
                language === "fr"
                  ? "e-mail ou telephone requis"
                  : "email or phone required"
              }
            >
              <input
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                type="email"
                maxLength={240}
                className={fieldClass}
              />
            </Field>
            <Field
              label={
                language === "fr" ? "Telephone professionnel" : "Business phone"
              }
              detail={
                language === "fr"
                  ? "e-mail ou telephone requis"
                  : "email or phone required"
              }
            >
              <input
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                maxLength={80}
                className={fieldClass}
              />
            </Field>
          </div>
          <div className="mt-5">
            <Field
              label={
                language === "fr"
                  ? "Expliquez votre autorité à gérer ce profil"
                  : "Explain your authority to manage this profile"
              }
            >
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                required
                minLength={12}
                maxLength={2000}
                rows={5}
                className={fieldClass}
                placeholder={
                  language === "fr"
                    ? "Indiquez votre fonction, la relation avec l'usine et le moyen de verification approprie."
                    : "State your role, relationship to the factory, and the appropriate method of verification."
                }
              />
            </Field>
          </div>
          {status.kind !== "idle" ? (
            <div
              className={cn(
                "mt-5 rounded-xl border px-4 py-3 text-sm",
                status.kind === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100"
                  : status.kind === "error"
                    ? "border-red-200 bg-red-50 text-red-900 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-100"
                    : "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
              )}
            >
              {status.kind === "loading"
                ? language === "fr"
                  ? "Envoi de la demande..."
                  : "Sending the claim..."
                : status.text}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={status.kind === "loading"}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            {language === "fr"
              ? "Envoyer la demande de propriete"
              : "Send ownership claim"}
          </button>
        </form>
      )}
    </div>
  );
}

function FactoryPublicProfilePage({
  factoryId,
  language,
}: {
  factoryId: string;
  language: "fr" | "en";
}) {
  const [profile, setProfile] = useState<PublicFactoryProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!factoryId) {
      setError(
        language === "fr"
          ? "Le profil d'usine demande est introuvable."
          : "The requested factory profile could not be found.",
      );
      return;
    }
    let active = true;
    setError(null);
    fetch(`/api/industrial/factories/${factoryId}`)
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok || !payload?.ok) {
          setError(
            payload?.message ||
              (language === "fr"
                ? "Le profil d'usine est indisponible."
                : "The factory profile is unavailable."),
          );
          return;
        }
        setProfile({
          factory: payload.factory,
          catalog: Array.isArray(payload.catalog) ? payload.catalog : [],
          productionLines: Array.isArray(payload.productionLines)
            ? payload.productionLines
            : [],
          machines: Array.isArray(payload.machines) ? payload.machines : [],
        });
      })
      .catch(() => {
        if (active)
          setError(
            language === "fr"
              ? "Le profil d'usine est momentanement indisponible."
              : "The factory profile is temporarily unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [factoryId, language]);

  if (error)
    return (
      <EmptyState
        title={
          language === "fr" ? "Profil indisponible" : "Profile unavailable"
        }
        detail={error}
      />
    );
  if (!profile)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-7 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
        {language === "fr"
          ? "Chargement du profil industriel..."
          : "Loading industrial profile..."}
      </div>
    );

  const factory = profile.factory;
  const quoteHref = (item?: PublicFactoryProfile["catalog"][number]) => {
    const params = new URLSearchParams({
      type: item
        ? REQUIREMENT_TYPE_BY_CLASSIFICATION[item.classification] ||
          "export_quotation"
        : "export_quotation",
      factory: factory.id,
    });
    if (item?.name) params.set("product", item.name);
    return `/request-quote?${params.toString()}`;
  };

  return (
    <section>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill>
                {language === "fr" ? "Usine verifiee" : "Verified factory"}
              </StatusPill>
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                {factory.industry}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
              {factory.name}
            </h1>
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <MapPinned className="h-4 w-4 shrink-0 text-[#a96f0b]" />
              {[
                factory.industrialZone,
                factory.city,
                factory.region,
                factory.countryCode,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            {factory.description ? (
              <p className="mt-5 text-base leading-7 text-slate-700 dark:text-slate-200">
                {factory.description}
              </p>
            ) : (
              <p className="mt-5 text-base leading-7 text-slate-600 dark:text-slate-300">
                {language === "fr"
                  ? "Profil industriel verifie par Exportunity. Les produits et capacites publiques ci-dessous sont publies apres validation."
                  : "An industrial profile verified by Exportunity. Public products and capabilities below are published after review."}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <Link
              href={quoteHref()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-[#f9a800]"
            >
              <ClipboardList className="h-4 w-4" />
              {language === "fr" ? "Demander un devis" : "Request a quote"}
            </Link>
            {factory.website ? (
              <a
                href={factory.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-slate-950 dark:text-white dark:hover:bg-white/10"
              >
                {language === "fr" ? "Site de l'usine" : "Factory website"}
                <ArrowRight className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>
        <div className="mt-7 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2 xl:grid-cols-4 dark:border-white/10">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[0.035]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {language === "fr" ? "Produits publics" : "Public products"}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
              {profile.catalog.length}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[0.035]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {language === "fr" ? "Lignes publiees" : "Published lines"}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
              {profile.productionLines.length}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[0.035]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {language === "fr" ? "Certifications" : "Certifications"}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
              {factory.certifications.length}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[0.035]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {language === "fr" ? "Marches export" : "Export markets"}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
              {factory.exportMarkets.length}
            </p>
          </div>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a96f0b]">
              {language === "fr" ? "Catalogue approuve" : "Approved catalog"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {language === "fr"
                ? "Produits et offres de cette usine"
                : "Products and offerings from this factory"}
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">
            {language === "fr"
              ? "Les prix, quantites et delais sont confirmes dans le circuit de devis; rien n'est invente ici."
              : "Prices, quantities, and lead times are confirmed through the quote workflow; none are invented here."}
          </p>
        </div>
        {profile.catalog.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {profile.catalog.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900"
              >
                {item.media?.[0] ? (
                  <img
                    src={item.media[0]}
                    alt=""
                    className="h-36 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center bg-[#F5A623]/10 text-[#a96f0b]">
                    <PackageSearch className="h-7 w-7" />
                  </div>
                )}
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a96f0b]">
                    {item.classification.replace(/_/g, " ")}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                    {item.name}
                  </h3>
                  {item.description ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {item.description}
                    </p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
                    {item.productCode ? (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                        {language === "fr" ? "Ref." : "Ref."} {item.productCode}
                      </span>
                    ) : null}
                    {item.minimumOrderQuantity ? (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                        MOQ: {item.minimumOrderQuantity}
                      </span>
                    ) : null}
                    {item.leadTimeText ? (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                        {language === "fr" ? "Delai" : "Lead time"}:{" "}
                        {item.leadTimeText}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                    {language === "fr"
                      ? "Disponibilite soumise a confirmation"
                      : "Availability subject to confirmation"}
                  </p>
                  <Link
                    href={quoteHref(item)}
                    className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#F5A623] px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-[#f9a800]"
                  >
                    <ClipboardList className="h-4 w-4" />
                    {language === "fr"
                      ? "Demander ce produit"
                      : "Request this product"}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              language === "fr"
                ? "Catalogue public en preparation"
                : "Public catalog in preparation"
            }
            detail={
              language === "fr"
                ? "Cette usine est verifiee, mais aucun produit n'est encore publie pour une demande ouverte. Utilisez le devis pour decrire votre besoin industriel."
                : "This factory is verified, but no products are published for open requests yet. Use the quote request to describe your industrial need."
            }
          />
        )}
      </section>

      <section className="mt-10 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <Wrench className="h-5 w-5 text-[#a96f0b]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                {language === "fr" ? "Capacite publique" : "Public capability"}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                {language === "fr"
                  ? "Lignes et equipements publies"
                  : "Published lines and equipment"}
              </h2>
            </div>
          </div>
          {profile.productionLines.length || profile.machines.length ? (
            <div className="mt-5 space-y-3">
              {profile.productionLines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-xl border border-slate-200 p-4 dark:border-white/10"
                >
                  <p className="font-semibold text-slate-950 dark:text-white">
                    {line.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {[line.industry, line.operatingStatus]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                  {line.summary ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {line.summary}
                    </p>
                  ) : null}
                </div>
              ))}
              {profile.machines.map((machine) => (
                <div
                  key={machine.id}
                  className="rounded-xl border border-slate-200 p-4 dark:border-white/10"
                >
                  <p className="font-semibold text-slate-950 dark:text-white">
                    {machine.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {[
                      machine.machineCategory,
                      machine.manufacturer,
                      machine.model,
                      machine.operatingStatus,
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {language === "fr"
                ? "Les details de lignes et d'equipements restent confidentiels jusqu'a une demande qualifiee ou a une publication explicite par l'usine."
                : "Line and equipment details remain confidential until a qualified request or an explicit publication by the factory."}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
            {language === "fr" ? "Preuves publiques" : "Public proof"}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
            {language === "fr"
              ? "Certifications et marches"
              : "Certifications and markets"}
          </h2>
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {language === "fr" ? "Certifications" : "Certifications"}
              </p>
              {factory.certifications.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {factory.certifications.map((item) => (
                    <span
                      key={item}
                      className="rounded-md border border-emerald-700/20 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-200"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {language === "fr"
                    ? "Aucune certification publiee."
                    : "No certifications published."}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {language === "fr" ? "Marches export" : "Export markets"}
              </p>
              {factory.exportMarkets.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {factory.exportMarkets.map((item) => (
                    <span
                      key={item}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {language === "fr"
                    ? "Aucun marche export publie."
                    : "No export markets published."}
                </p>
              )}
            </div>
          </div>
          <div className="mt-7 border-t border-slate-200 pt-5 dark:border-white/10">
            <Link
              href={`/factories/${factory.id}/claim`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#a96f0b] hover:text-[#8a5907] dark:hover:text-[#F5A623]"
            >
              <CheckCircle2 className="h-4 w-4" />
              {language === "fr"
                ? "Vous representez cette usine ? Revendiquer le profil"
                : "Represent this factory? Claim the profile"}
            </Link>
          </div>
        </div>
      </section>
    </section>
  );
}

const REQUIREMENT_CATEGORY_CLASSIFICATION: Record<string, string> = {
  machinery: "machinery",
  raw_material: "raw_material",
  industrial_input: "industrial_input",
  spare_part: "spare_part",
  custom_manufacturing: "spare_part",
  industrial_service: "industrial_service",
  export_quotation: "export_ready_factory_product",
};

const REQUIREMENT_TITLE_PLACEHOLDERS: Record<
  string,
  { fr: string; en: string }
> = {
  machinery: {
    fr: "Ex. Ligne de conditionnement semi-automatique",
    en: "E.g. Semi-automatic packaging line",
  },
  raw_material: {
    fr: "Ex. Tôle acier 3 mm pour fabrication",
    en: "E.g. 3 mm steel sheet for fabrication",
  },
  industrial_input: {
    fr: "Ex. Lubrifiant industriel ISO VG 46",
    en: "E.g. ISO VG 46 industrial lubricant",
  },
  spare_part: {
    fr: "Ex. Roulement 6205 pour pompe industrielle",
    en: "E.g. 6205 bearing for an industrial pump",
  },
  custom_manufacturing: {
    fr: "Ex. Corps de pompe à refaire à partir d'une pièce",
    en: "E.g. Pump housing to reproduce from an existing part",
  },
  industrial_service: {
    fr: "Ex. Maintenance d'un compresseur industriel",
    en: "E.g. Maintenance for an industrial compressor",
  },
  export_quotation: {
    fr: "Ex. Kits de pièces mécaniques pour export",
    en: "E.g. Mechanical part kits for export",
  },
};

const REQUIREMENT_QUANTITY_PLACEHOLDERS: Record<
  string,
  { fr: string; en: string }
> = {
  machinery: { fr: "Ex. 1 ligne", en: "E.g. 1 line" },
  raw_material: { fr: "Ex. 20 tonnes / mois", en: "E.g. 20 tonnes / month" },
  industrial_input: { fr: "Ex. 200 litres", en: "E.g. 200 litres" },
  spare_part: { fr: "Ex. 4 pièces", en: "E.g. 4 pieces" },
  custom_manufacturing: { fr: "Ex. 2 prototypes", en: "E.g. 2 prototypes" },
  industrial_service: { fr: "Ex. 1 intervention", en: "E.g. 1 intervention" },
  export_quotation: {
    fr: "Ex. 1 conteneur de 20 pieds",
    en: "E.g. 1 twenty-foot container",
  },
};

const REQUIREMENT_TECHNICAL_FIELDS: Record<
  string,
  Array<{
    key: string;
    fr: string;
    en: string;
    frPlaceholder: string;
    enPlaceholder: string;
  }>
> = {
  machinery: [
    {
      key: "productToManufacture",
      fr: "Produit à fabriquer",
      en: "Product to manufacture",
      frPlaceholder: "Ex. sachets de farine",
      enPlaceholder: "E.g. flour pouches",
    },
    {
      key: "requiredOutput",
      fr: "Capacité ou débit recherché",
      en: "Required output or capacity",
      frPlaceholder: "Ex. 1 000 unités / heure",
      enPlaceholder: "E.g. 1,000 units / hour",
    },
    {
      key: "automationLevel",
      fr: "Niveau d'automatisation",
      en: "Automation level",
      frPlaceholder: "Manuel, semi-automatique ou automatique",
      enPlaceholder: "Manual, semi-automatic, or automatic",
    },
    {
      key: "siteUtilities",
      fr: "Espace, électricité et eau disponibles",
      en: "Available space, electricity, and water",
      frPlaceholder: "Décrivez les contraintes du site",
      enPlaceholder: "Describe site constraints",
    },
  ],
  raw_material: [
    {
      key: "gradeOrSpecification",
      fr: "Grade ou spécification",
      en: "Grade or specification",
      frPlaceholder: "Norme, qualité, composition",
      enPlaceholder: "Standard, quality, composition",
    },
    {
      key: "certification",
      fr: "Certification demandée",
      en: "Required certification",
      frPlaceholder: "Ex. alimentaire, ISO, origine",
      enPlaceholder: "E.g. food grade, ISO, origin",
    },
    {
      key: "recurringFrequency",
      fr: "Fréquence d'approvisionnement",
      en: "Supply frequency",
      frPlaceholder: "Ex. mensuelle",
      enPlaceholder: "E.g. monthly",
    },
    {
      key: "packaging",
      fr: "Conditionnement",
      en: "Packaging",
      frPlaceholder: "Ex. sacs de 25 kg",
      enPlaceholder: "E.g. 25 kg bags",
    },
  ],
  industrial_input: [
    {
      key: "technicalSpecification",
      fr: "Spécification technique",
      en: "Technical specification",
      frPlaceholder: "Référence, norme ou application",
      enPlaceholder: "Reference, standard, or application",
    },
    {
      key: "brandPreference",
      fr: "Marque préférée",
      en: "Preferred brand",
      frPlaceholder: "Facultatif",
      enPlaceholder: "Optional",
    },
    {
      key: "recurringFrequency",
      fr: "Fréquence d'achat",
      en: "Purchase frequency",
      frPlaceholder: "Ex. toutes les 6 semaines",
      enPlaceholder: "E.g. every 6 weeks",
    },
    {
      key: "acceptableAlternatives",
      fr: "Alternatives acceptables",
      en: "Acceptable alternatives",
      frPlaceholder: "Oui, avec conditions si nécessaire",
      enPlaceholder: "Yes, with conditions if needed",
    },
  ],
  spare_part: [
    {
      key: "partNumber",
      fr: "Référence de la pièce",
      en: "Part number",
      frPlaceholder: "Référence fabricant si disponible",
      enPlaceholder: "Manufacturer reference if available",
    },
    {
      key: "machineBrandModel",
      fr: "Marque et modèle de machine",
      en: "Machine brand and model",
      frPlaceholder: "Ex. Siemens X200",
      enPlaceholder: "E.g. Siemens X200",
    },
    {
      key: "serialNumber",
      fr: "Numéro de série",
      en: "Serial number",
      frPlaceholder: "Facultatif",
      enPlaceholder: "Optional",
    },
    {
      key: "productionStopped",
      fr: "La production est-elle arrêtée ?",
      en: "Is production stopped?",
      frPlaceholder: "Oui / non et impact",
      enPlaceholder: "Yes / no and impact",
    },
  ],
  custom_manufacturing: [
    {
      key: "componentApplication",
      fr: "Application de la pièce",
      en: "Component application",
      frPlaceholder: "Fonction dans la machine ou la ligne",
      enPlaceholder: "Function in the machine or line",
    },
    {
      key: "material",
      fr: "Matière souhaitée",
      en: "Requested material",
      frPlaceholder: "Ex. acier inoxydable, bronze",
      enPlaceholder: "E.g. stainless steel, bronze",
    },
    {
      key: "drawingOrSample",
      fr: "Plan, photo ou échantillon",
      en: "Drawing, photo, or sample",
      frPlaceholder: "Décrivez ce qui est disponible",
      enPlaceholder: "Describe what is available",
    },
    {
      key: "tolerance",
      fr: "Tolérance ou dimensions critiques",
      en: "Tolerance or critical dimensions",
      frPlaceholder: "Facultatif",
      enPlaceholder: "Optional",
    },
  ],
  industrial_service: [
    {
      key: "serviceScope",
      fr: "Périmètre du service",
      en: "Service scope",
      frPlaceholder: "Installation, maintenance, réparation, audit...",
      enPlaceholder: "Installation, maintenance, repair, audit...",
    },
    {
      key: "equipmentOrLine",
      fr: "Équipement ou ligne concernée",
      en: "Equipment or line concerned",
      frPlaceholder: "Marque, modèle, fonction",
      enPlaceholder: "Brand, model, function",
    },
    {
      key: "siteConditions",
      fr: "Conditions du site",
      en: "Site conditions",
      frPlaceholder: "Accès, sécurité, contraintes",
      enPlaceholder: "Access, safety, constraints",
    },
    {
      key: "preferredDate",
      fr: "Date souhaitée",
      en: "Preferred date",
      frPlaceholder: "Facultatif",
      enPlaceholder: "Optional",
    },
  ],
  export_quotation: [
    {
      key: "destination",
      fr: "Destination export",
      en: "Export destination",
      frPlaceholder: "Pays ou port de destination",
      enPlaceholder: "Country or destination port",
    },
    {
      key: "incoterm",
      fr: "Incoterm souhaité",
      en: "Preferred Incoterm",
      frPlaceholder: "Ex. FOB, CIF, DAP",
      enPlaceholder: "E.g. FOB, CIF, DAP",
    },
    {
      key: "requiredCertifications",
      fr: "Certifications requises",
      en: "Required certifications",
      frPlaceholder: "Facultatif",
      enPlaceholder: "Optional",
    },
    {
      key: "targetPrice",
      fr: "Prix cible ou cadre budgétaire",
      en: "Target price or budget frame",
      frPlaceholder: "Facultatif",
      enPlaceholder: "Optional",
    },
  ],
};

function collectTechnicalDetails(form: FormData) {
  return Object.fromEntries(
    Array.from(form.entries())
      .filter(
        ([key, value]) =>
          key.startsWith("technical_") &&
          typeof value === "string" &&
          value.trim(),
      )
      .map(([key, value]) => [
        key.slice("technical_".length),
        String(value).trim(),
      ]),
  );
}

type RequirementAttachmentUploadSession = {
  requirementId: string;
  token: string;
  expiresAt: string;
  referenceCode: string;
  maxFiles: number;
};

const TECHNICAL_ATTACHMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.docx,.xlsx,.dxf,.dwg,.step,.stp,.stl,.iges,.igs";
const TECHNICAL_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;

async function uploadRequirementAttachments(
  session: RequirementAttachmentUploadSession,
  files: File[],
  onUploaded?: (file: File) => void,
) {
  let uploaded = 0;
  for (const file of files) {
    const upload = new FormData();
    upload.append("file", file, file.name);
    const response = await fetch(
      `/api/industrial/requirements/${encodeURIComponent(session.requirementId)}/attachments`,
      {
        method: "POST",
        headers: { "x-industrial-upload-token": session.token },
        body: upload,
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(
        payload?.message || "The technical document could not be uploaded.",
      );
    }
    uploaded += 1;
    onUploaded?.(file);
  }
  return uploaded;
}

function QuoteForm({
  taxonomy,
  language,
  initialType,
  initialCategoryCode,
  initialUrgency,
  initialFactoryId,
  initialTitle,
  initialFinancingInterest,
}: {
  taxonomy: TaxonomyCategory[];
  language: "fr" | "en";
  initialType: string;
  initialCategoryCode: string;
  initialUrgency: string;
  initialFactoryId: string;
  initialTitle: string;
  initialFinancingInterest: boolean;
}) {
  const [status, setStatus] = useState<{
    kind: "idle" | "loading" | "success" | "error";
    text?: string;
    reference?: string;
  }>({ kind: "idle" });
  const [type, setType] = useState(initialType || "machinery");
  const [category, setCategory] = useState(initialCategoryCode || "");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentSession, setAttachmentSession] =
    useState<RequirementAttachmentUploadSession | null>(null);
  const [financingDiscussion, setFinancingDiscussion] = useState(
    initialFinancingInterest,
  );
  const matchingCategories = useMemo(
    () =>
      taxonomy.filter(
        (item) =>
          item.classification === REQUIREMENT_CATEGORY_CLASSIFICATION[type],
      ),
    [taxonomy, type],
  );
  const technicalFields = REQUIREMENT_TECHNICAL_FIELDS[type] || [];
  const titlePlaceholder =
    REQUIREMENT_TITLE_PLACEHOLDERS[type] ||
    REQUIREMENT_TITLE_PLACEHOLDERS.machinery;
  const quantityPlaceholder =
    REQUIREMENT_QUANTITY_PLACEHOLDERS[type] ||
    REQUIREMENT_QUANTITY_PLACEHOLDERS.machinery;
  const initialUrgencyOption =
    initialUrgency === "urgent" || initialUrgency === "planned"
      ? initialUrgency
      : "standard";

  useEffect(() => {
    if (initialType) setType(initialType);
  }, [initialType]);
  useEffect(() => {
    setFinancingDiscussion(initialFinancingInterest);
  }, [initialFinancingInterest]);
  useEffect(() => {
    if (
      initialCategoryCode &&
      matchingCategories.some((item) => item.code === initialCategoryCode)
    ) {
      setCategory(initialCategoryCode);
      return;
    }
    if (!matchingCategories.some((item) => item.code === category))
      setCategory(matchingCategories[0]?.code || "");
  }, [category, initialCategoryCode, matchingCategories]);

  const uploadTechnicalDocuments = async (
    session: RequirementAttachmentUploadSession,
    files: File[],
  ) => {
    return uploadRequirementAttachments(session, files, (file) => {
      setAttachments((current) =>
        current.filter(
          (item) =>
            `${item.name}:${item.size}:${item.lastModified}` !==
            `${file.name}:${file.size}:${file.lastModified}`,
        ),
      );
    });
  };

  const onAttachmentSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (!selected.length) return;
    const tooLarge = selected.find(
      (file) => file.size > TECHNICAL_ATTACHMENT_MAX_BYTES,
    );
    if (tooLarge) {
      setStatus({
        kind: "error",
        text:
          language === "fr"
            ? `Le fichier ${tooLarge.name} dépasse 15 Mo.`
            : `${tooLarge.name} is larger than 15 MB.`,
      });
      return;
    }
    setAttachments((current) => {
      const deduplicated = new Map(
        current.map((file) => [
          `${file.name}:${file.size}:${file.lastModified}`,
          file,
        ]),
      );
      selected.forEach((file) =>
        deduplicated.set(
          `${file.name}:${file.size}:${file.lastModified}`,
          file,
        ),
      );
      return Array.from(deduplicated.values()).slice(0, 5);
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    let activeUploadSession = attachmentSession;
    setStatus({ kind: "loading" });
    try {
      if (!activeUploadSession) {
        const response = await fetch("/api/industrial/requirements", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requirementType: type,
            categoryCode: category,
            title: form.get("title"),
            details: form.get("details"),
            quantityText: form.get("quantityText"),
            deliveryCountryCode: form.get("countryCode"),
            deliveryCity: form.get("city"),
            requiredBy: form.get("requiredBy"),
            urgency: form.get("urgency"),
            requesterCompany: form.get("company"),
            requesterName: form.get("name"),
            requesterEmail: form.get("email"),
            requesterPhone: form.get("phone"),
            factoryId: initialFactoryId || null,
            technicalDetails: collectTechnicalDetails(form),
          }),
        });
        const payload = await response.json();
        if (!response.ok || !payload?.ok)
          throw new Error(
            payload?.message || "Unable to submit the requirement.",
          );
        const upload = payload?.requirement?.attachmentUpload;
        activeUploadSession =
          upload?.token && payload?.requirement?.id
            ? {
                requirementId: String(payload.requirement.id),
                token: String(upload.token),
                expiresAt: String(upload.expiresAt || ""),
                referenceCode: String(payload.requirement.referenceCode || ""),
                maxFiles: Number(upload.maxFiles || 5),
              }
            : null;
        if (attachments.length && !activeUploadSession) {
          throw new Error(
            language === "fr"
              ? "Le besoin est enregistré, mais la session sécurisée pour les documents est indisponible."
              : "The requirement was saved, but a secure document session is unavailable.",
          );
        }
      }

      const uploaded =
        attachments.length && activeUploadSession
          ? await uploadTechnicalDocuments(activeUploadSession, attachments)
          : 0;
      formElement.reset();
      setAttachments([]);
      setAttachmentSession(null);
      setStatus({
        kind: "success",
        reference: activeUploadSession?.referenceCode,
        text:
          language === "fr"
            ? `${uploaded ? `${uploaded} document${uploaded > 1 ? "s" : ""} technique${uploaded > 1 ? "s" : ""} joint${uploaded > 1 ? "s" : ""}. ` : ""}Votre besoin a été reçu. Exportunity le qualifie avant tout contact fournisseur.`
            : `${uploaded ? `${uploaded} technical document${uploaded > 1 ? "s" : ""} attached. ` : ""}Your requirement has been received. Exportunity qualifies it before any supplier contact.`,
      });
    } catch (error: any) {
      if (activeUploadSession) {
        setAttachmentSession(activeUploadSession);
        setStatus({
          kind: "error",
          reference: activeUploadSession.referenceCode,
          text:
            language === "fr"
              ? "Le besoin est déjà enregistré. Vérifiez les documents sélectionnés puis réessayez leur envoi avant l'expiration de cette session sécurisée."
              : "The requirement is already recorded. Check the selected documents and retry their upload before this secure session expires.",
        });
        return;
      }
      setStatus({
        kind: "error",
        text:
          error?.message ||
          (language === "fr"
            ? "La demande n'a pas pu être envoyée."
            : "The request could not be submitted."),
      });
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-7"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={language === "fr" ? "Type de besoin" : "Requirement type"}
        >
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setStatus({ kind: "idle" });
            }}
            className={fieldClass}
          >
            <option value="machinery">
              {language === "fr"
                ? "Machine ou ligne de production"
                : "Machine or production line"}
            </option>
            <option value="raw_material">
              {language === "fr" ? "Matière première" : "Raw material"}
            </option>
            <option value="industrial_input">
              {language === "fr" ? "Intrant industriel" : "Industrial input"}
            </option>
            <option value="spare_part">
              {language === "fr" ? "Pièce détachée" : "Spare part"}
            </option>
            <option value="custom_manufacturing">
              {language === "fr"
                ? "Fabrication sur mesure"
                : "Custom manufacturing"}
            </option>
            <option value="industrial_service">
              {language === "fr" ? "Service industriel" : "Industrial service"}
            </option>
            <option value="export_quotation">
              {language === "fr"
                ? "Demande de devis export"
                : "Export quotation"}
            </option>
          </select>
        </Field>
        <Field
          label={
            language === "fr" ? "Catégorie contrôlée" : "Controlled category"
          }
        >
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={fieldClass}
            disabled={!matchingCategories.length}
          >
            {matchingCategories.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label[language]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={language === "fr" ? "Besoin recherché" : "What do you need?"}
        >
          <input
            name="title"
            required
            maxLength={240}
            defaultValue={initialTitle}
            className={fieldClass}
            placeholder={titlePlaceholder[language]}
          />
        </Field>
        <Field
          label={language === "fr" ? "Quantité ou unité" : "Quantity or unit"}
          detail={language === "fr" ? "facultatif" : "optional"}
        >
          <input
            name="quantityText"
            maxLength={200}
            className={fieldClass}
            placeholder={quantityPlaceholder[language]}
          />
        </Field>
      </div>
      {initialFactoryId ? (
        <div className="mt-5 rounded-xl border border-[#F5A623]/35 bg-[#F5A623]/10 p-4 text-sm leading-6 text-slate-800 dark:text-slate-100">
          {language === "fr"
            ? "Cette demande est rattachee a une usine verifiee. Exportunity la qualifie avant tout contact commercial."
            : "This request is linked to a verified factory. Exportunity qualifies it before any commercial contact."}
        </div>
      ) : null}
      {initialUrgencyOption === "urgent" ? (
        <div className="mt-5 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100">
          <p className="font-semibold">
            {language === "fr" ? "Demande prioritaire" : "Priority requirement"}
          </p>
          <p className="mt-1">
            {language === "fr"
              ? "Indiquez l'impact sur la production, la machine concernée et toute référence disponible. Exportunity qualifie le dossier avant toute mise en relation."
              : "Include the production impact, affected equipment, and any available reference. Exportunity qualifies the case before any introduction."}
          </p>
        </div>
      ) : null}
      {type === "machinery" ? (
        <div className="mt-5 rounded-xl border border-[#F5A623]/35 bg-[#F5A623]/10 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="technical_financingDiscussion"
              value="yes"
              checked={financingDiscussion}
              onChange={(event) => setFinancingDiscussion(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-[#a96f0b] focus:ring-[#F5A623]"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-950 dark:text-white">
                {language === "fr"
                  ? "Échanger sur le financement de cet équipement"
                  : "Discuss financing for this equipment"}
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">
                {language === "fr"
                  ? "Cette indication est ajoutée au dossier pour un suivi par l'équipe de compte après revue technique. Elle ne constitue ni une offre de crédit ni une décision de financement."
                  : "This records a request for account-management follow-up after technical review. It is not a credit offer or financing decision."}
              </span>
            </span>
          </label>
        </div>
      ) : null}
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.035]">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          {language === "fr"
            ? "Informations techniques pour le triage"
            : "Technical information for triage"}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {language === "fr"
            ? "Ajoutez les données disponibles. Elles restent dans le dossier de besoin et ne sont pas publiées."
            : "Add the information you have. It remains in the requirement record and is not published."}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {technicalFields.map((field) => (
            <Field
              key={field.key}
              label={language === "fr" ? field.fr : field.en}
              detail={language === "fr" ? "facultatif" : "optional"}
            >
              <input
                name={`technical_${field.key}`}
                maxLength={600}
                className={fieldClass}
                placeholder={
                  language === "fr" ? field.frPlaceholder : field.enPlaceholder
                }
              />
            </Field>
          ))}
        </div>
      </div>
      <div className="mt-5">
        <Field
          label={
            language === "fr"
              ? "Contexte technique et spécifications"
              : "Technical context and specifications"
          }
        >
          <textarea
            name="details"
            required
            minLength={10}
            maxLength={6000}
            rows={5}
            className={fieldClass}
            placeholder={
              language === "fr"
                ? "Indiquez la matière, les dimensions, la compatibilité, le produit à fabriquer ou le problème à résoudre."
                : "Include material, dimensions, compatibility, product to manufacture, or problem to solve."
            }
          />
        </Field>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Field
          label={language === "fr" ? "Pays de livraison" : "Delivery country"}
        >
          <input
            name="countryCode"
            defaultValue="BJ"
            minLength={2}
            maxLength={3}
            className={fieldClass}
          />
        </Field>
        <Field
          label={
            language === "fr"
              ? "Ville ou zone industrielle"
              : "City or industrial zone"
          }
        >
          <input name="city" maxLength={160} className={fieldClass} />
        </Field>
        <Field label={language === "fr" ? "Urgence" : "Urgency"}>
          <select
            name="urgency"
            defaultValue={initialUrgencyOption}
            className={fieldClass}
          >
            <option value="standard">
              {language === "fr" ? "Standard" : "Standard"}
            </option>
            <option value="urgent">
              {language === "fr" ? "Urgent" : "Urgent"}
            </option>
            <option value="planned">
              {language === "fr" ? "Planifié" : "Planned"}
            </option>
          </select>
        </Field>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Field
          label={language === "fr" ? "Entreprise" : "Company"}
          detail={language === "fr" ? "facultatif" : "optional"}
        >
          <input name="company" maxLength={240} className={fieldClass} />
        </Field>
        <Field
          label={language === "fr" ? "Échéance souhaitée" : "Required by"}
          detail={language === "fr" ? "facultatif" : "optional"}
        >
          <input
            name="requiredBy"
            maxLength={80}
            className={fieldClass}
            placeholder={
              language === "fr" ? "Ex. Fin septembre" : "E.g. End of September"
            }
          />
        </Field>
        <Field label={language === "fr" ? "Nom du contact" : "Contact name"}>
          <input name="name" required maxLength={180} className={fieldClass} />
        </Field>
        <Field
          label={language === "fr" ? "E-mail professionnel" : "Business email"}
        >
          <input
            name="email"
            required
            type="email"
            maxLength={240}
            className={fieldClass}
          />
        </Field>
      </div>
      <div className="mt-5 max-w-md">
        <Field
          label={language === "fr" ? "Téléphone" : "Phone"}
          detail={language === "fr" ? "facultatif" : "optional"}
        >
          <input name="phone" maxLength={80} className={fieldClass} />
        </Field>
      </div>
      <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.035]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {language === "fr"
                ? "Documents techniques privés"
                : "Private technical documents"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {language === "fr"
                ? "Ajoutez plans, photos, fiches, fichiers CAO ou références utiles. Ils restent dans ce dossier pour la revue technique d'Exportunity."
                : "Attach drawings, photos, specifications, CAD files, or useful references. They stay in this requirement for Exportunity's technical review."}
            </p>
          </div>
          <label
            htmlFor="industrial-technical-files"
            className="inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-[#F5A623] hover:text-[#9d5b00] dark:border-white/15 dark:bg-slate-900 dark:text-white"
          >
            <Paperclip className="h-4 w-4" />
            {language === "fr" ? "Joindre" : "Attach"}
          </label>
          <input
            id="industrial-technical-files"
            className="sr-only"
            type="file"
            multiple
            accept={TECHNICAL_ATTACHMENT_ACCEPT}
            onChange={onAttachmentSelect}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {language === "fr"
            ? "PDF, images, Word, Excel, DXF, DWG, STEP, STL ou IGES. Jusqu'à 5 fichiers de 15 Mo chacun."
            : "PDF, images, Word, Excel, DXF, DWG, STEP, STL, or IGES. Up to 5 files of 15 MB each."}
        </p>
        {attachments.length ? (
          <div className="mt-3 space-y-2">
            {attachments.map((file) => (
              <div
                key={`${file.name}:${file.size}:${file.lastModified}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                    {file.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter(
                        (item) =>
                          `${item.name}:${item.size}:${item.lastModified}` !==
                          `${file.name}:${file.size}:${file.lastModified}`,
                      ),
                    )
                  }
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-rose-700 dark:text-slate-300 dark:hover:bg-white/10"
                  aria-label={
                    language === "fr"
                      ? `Retirer ${file.name}`
                      : `Remove ${file.name}`
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <p className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {language === "fr"
          ? "Aucun fournisseur n'est contacté avant revue par Exportunity. Les documents ne sont jamais publiés depuis ce formulaire."
          : "No supplier is contacted before Exportunity review. Documents are never published from this form."}
      </p>
      {status.kind !== "idle" ? (
        <div
          className={cn(
            "mt-5 rounded-xl border px-4 py-3 text-sm",
            status.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100"
              : status.kind === "error"
                ? "border-red-200 bg-red-50 text-red-900 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-100"
                : "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
          )}
        >
          {status.kind === "loading" ? (
            language === "fr" ? (
              "Envoi de votre besoin..."
            ) : (
              "Submitting your requirement..."
            )
          ) : (
            <>
              {status.reference ? (
                <strong className="mr-2">{status.reference}</strong>
              ) : null}
              {status.text}
            </>
          )}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={status.kind === "loading" || !matchingCategories.length}
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ClipboardList className="h-4 w-4" />
        {attachmentSession
          ? language === "fr"
            ? "Réessayer l'envoi des documents"
            : "Retry document upload"
          : language === "fr"
            ? "Soumettre le besoin industriel"
            : "Submit industrial requirement"}
      </button>
    </form>
  );
}

type FactoryRegistrationDraft = Record<string, string>;

type FactoryProductionLineDraft = {
  name: string;
  industry: string;
  purpose: string;
  operatingStatus: string;
};

type FactoryMachineDraft = {
  name: string;
  manufacturer: string;
  model: string;
  machineCategory: string;
  productionLineIndex: number | null;
  operatingStatus: string;
};

type FactoryAssemblyDraft = {
  name: string;
  assemblyType: string;
  machineIndex: number;
  operatingStatus: string;
};

type FactoryComponentDraft = {
  name: string;
  componentType: string;
  partNumber: string;
  manufacturer: string;
  model: string;
  criticality: "standard" | "important" | "critical";
  machineIndex: number;
  assemblyIndex: number | null;
  operatingStatus: string;
};

const EMPTY_FACTORY_REGISTRATION_DRAFT: FactoryRegistrationDraft = {
  legalName: "",
  displayName: "",
  registrationNumber: "",
  countryCode: "BJ",
  city: "",
  region: "",
  industrialZone: "",
  publicAddress: "",
  primaryIndustry: "",
  website: "",
  description: "",
  foundingYear: "",
  employeeRange: "",
  factorySize: "",
  productionCapacity: "",
  productsManufactured: "",
  exportMarkets: "",
  certifications: "",
  rawMaterials: "",
  industrialInputs: "",
  recurringSpareParts: "",
  procurementFrequency: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
};

function commaSeparatedValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function FactoryRegistrationForm({ language }: { language: "fr" | "en" }) {
  const steps =
    language === "fr"
      ? ["Identité", "Profil industriel", "Production", "Achats & contact"]
      : [
          "Identity",
          "Industrial profile",
          "Production",
          "Procurement & contact",
        ];
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<FactoryRegistrationDraft>({
    ...EMPTY_FACTORY_REGISTRATION_DRAFT,
  });
  const [productionLines, setProductionLines] = useState<
    FactoryProductionLineDraft[]
  >([]);
  const [principalMachines, setPrincipalMachines] = useState<
    FactoryMachineDraft[]
  >([]);
  const [assemblies, setAssemblies] = useState<FactoryAssemblyDraft[]>([]);
  const [components, setComponents] = useState<FactoryComponentDraft[]>([]);
  const [status, setStatus] = useState<{
    kind: "idle" | "loading" | "success" | "error";
    text?: string;
  }>({ kind: "idle" });

  const updateDraft = (key: string, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const updateLine = (
    index: number,
    key: keyof FactoryProductionLineDraft,
    value: string,
  ) => {
    setProductionLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [key]: value } : line,
      ),
    );
  };
  const updateMachine = (
    index: number,
    key: keyof FactoryMachineDraft,
    value: string | number | null,
  ) => {
    setPrincipalMachines((current) =>
      current.map((machine, machineIndex) =>
        machineIndex === index
          ? ({ ...machine, [key]: value } as FactoryMachineDraft)
          : machine,
      ),
    );
  };
  const updateAssembly = (
    index: number,
    key: keyof FactoryAssemblyDraft,
    value: string | number,
  ) => {
    setAssemblies((current) =>
      current.map((assembly, assemblyIndex) =>
        assemblyIndex === index
          ? ({ ...assembly, [key]: value } as FactoryAssemblyDraft)
          : assembly,
      ),
    );
  };
  const updateComponent = (
    index: number,
    key: keyof FactoryComponentDraft,
    value: string | number | null,
  ) => {
    setComponents((current) =>
      current.map((component, componentIndex) =>
        componentIndex === index
          ? ({ ...component, [key]: value } as FactoryComponentDraft)
          : component,
      ),
    );
  };
  const continueToNextStep = () => {
    if (!formRef.current?.reportValidity()) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };
  const addProductionLine = () => {
    setProductionLines((current) => [
      ...current,
      {
        name: "",
        industry: draft.primaryIndustry,
        purpose: "",
        operatingStatus: "unknown",
      },
    ]);
  };
  const addMachine = () => {
    setPrincipalMachines((current) => [
      ...current,
      {
        name: "",
        manufacturer: "",
        model: "",
        machineCategory: "",
        productionLineIndex: null,
        operatingStatus: "unknown",
      },
    ]);
  };
  const addAssembly = () => {
    if (!principalMachines.length) return;
    setAssemblies((current) => [
      ...current,
      {
        name: "",
        assemblyType: "",
        machineIndex: 0,
        operatingStatus: "unknown",
      },
    ]);
  };
  const addComponent = () => {
    if (!principalMachines.length) return;
    setComponents((current) => [
      ...current,
      {
        name: "",
        componentType: "",
        partNumber: "",
        manufacturer: "",
        model: "",
        criticality: "standard",
        machineIndex: 0,
        assemblyIndex: null,
        operatingStatus: "unknown",
      },
    ]);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formRef.current?.reportValidity()) return;
    setStatus({ kind: "loading" });
    const submittedLines = productionLines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.name.trim());
    const submittedLineIndex = new Map(
      submittedLines.map(({ index }, nextIndex) => [index, nextIndex]),
    );
    const submittedMachineRows = principalMachines
      .map((machine, index) => ({ machine, index }))
      .filter(({ machine }) => machine.name.trim());
    const submittedMachines = submittedMachineRows.map(({ machine }) => ({
      ...machine,
      productionLineIndex:
        machine.productionLineIndex === null
          ? null
          : (submittedLineIndex.get(machine.productionLineIndex) ?? null),
    }));
    const submittedMachineIndex = new Map(
      submittedMachineRows.map(({ index }, nextIndex) => [index, nextIndex]),
    );
    const submittedAssemblies = assemblies
      .map((assembly, index) => ({ assembly, index }))
      .filter(
        ({ assembly }) =>
          assembly.name.trim() &&
          submittedMachineIndex.has(assembly.machineIndex),
      );
    const submittedAssemblyIndex = new Map(
      submittedAssemblies.map(({ index }, nextIndex) => [index, nextIndex]),
    );
    const normalizedAssemblies = submittedAssemblies.map(({ assembly }) => ({
      ...assembly,
      machineIndex: submittedMachineIndex.get(assembly.machineIndex) as number,
    }));
    const normalizedComponents = components
      .filter(
        (component) =>
          component.name.trim() &&
          submittedMachineIndex.has(component.machineIndex),
      )
      .map((component) => ({
        ...component,
        machineIndex: submittedMachineIndex.get(
          component.machineIndex,
        ) as number,
        assemblyIndex:
          component.assemblyIndex === null
            ? null
            : (submittedAssemblyIndex.get(component.assemblyIndex) ?? null),
      }));
    try {
      const response = await fetch("/api/industrial/factories/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          legalName: draft.legalName,
          displayName: draft.displayName,
          registrationNumber: draft.registrationNumber,
          countryCode: draft.countryCode,
          city: draft.city,
          region: draft.region,
          industrialZone: draft.industrialZone,
          publicAddress: draft.publicAddress,
          primaryIndustry: draft.primaryIndustry,
          website: draft.website,
          publicDescription: draft.description,
          foundingYear: draft.foundingYear,
          employeeRange: draft.employeeRange,
          factorySize: draft.factorySize,
          productionCapacity: draft.productionCapacity,
          productsManufactured: commaSeparatedValues(
            draft.productsManufactured,
          ),
          exportMarkets: commaSeparatedValues(draft.exportMarkets),
          certifications: commaSeparatedValues(draft.certifications),
          rawMaterials: commaSeparatedValues(draft.rawMaterials),
          industrialInputs: commaSeparatedValues(draft.industrialInputs),
          recurringSpareParts: commaSeparatedValues(draft.recurringSpareParts),
          procurementFrequency: draft.procurementFrequency,
          productionLines: submittedLines.map(({ line }) => line),
          principalMachines: submittedMachines,
          assemblies: normalizedAssemblies,
          components: normalizedComponents,
          contactName: draft.contactName,
          contactEmail: draft.contactEmail,
          contactPhone: draft.contactPhone,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok)
        throw new Error(payload?.message || "Unable to register the factory.");
      setDraft({ ...EMPTY_FACTORY_REGISTRATION_DRAFT });
      setProductionLines([]);
      setPrincipalMachines([]);
      setAssemblies([]);
      setComponents([]);
      setStep(0);
      setStatus({ kind: "success", text: payload.message });
    } catch (error: any) {
      setStatus({
        kind: "error",
        text:
          error?.message ||
          (language === "fr"
            ? "L'inscription n'a pas pu être envoyée."
            : "The registration could not be submitted."),
      });
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-7"
    >
      <div className="grid gap-2 border-b border-slate-200 pb-5 sm:grid-cols-4 dark:border-white/10">
        {steps.map((label, index) => (
          <div
            key={label}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold",
              index === step
                ? "bg-[#F5A623]/15 text-slate-950 dark:text-white"
                : index < step
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-slate-500 dark:text-slate-400",
            )}
          >
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full border",
                index === step
                  ? "border-[#F5A623] bg-[#F5A623] text-slate-950"
                  : index < step
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-300 dark:border-white/20",
              )}
            >
              {index + 1}
            </span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {step === 0 ? (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Field
            label={language === "fr" ? "Raison sociale" : "Legal company name"}
          >
            <input
              value={draft.legalName}
              onChange={(event) => updateDraft("legalName", event.target.value)}
              required
              maxLength={240}
              className={fieldClass}
            />
          </Field>
          <Field
            label={
              language === "fr"
                ? "Nom public de l'usine"
                : "Public factory name"
            }
            detail={language === "fr" ? "facultatif" : "optional"}
          >
            <input
              value={draft.displayName}
              onChange={(event) =>
                updateDraft("displayName", event.target.value)
              }
              maxLength={240}
              className={fieldClass}
            />
          </Field>
          <Field
            label={
              language === "fr"
                ? "Numéro d'enregistrement"
                : "Registration number"
            }
            detail={language === "fr" ? "facultatif" : "optional"}
          >
            <input
              value={draft.registrationNumber}
              onChange={(event) =>
                updateDraft("registrationNumber", event.target.value)
              }
              maxLength={160}
              className={fieldClass}
            />
          </Field>
          <Field
            label={
              language === "fr" ? "Industrie principale" : "Primary industry"
            }
          >
            <input
              value={draft.primaryIndustry}
              onChange={(event) =>
                updateDraft("primaryIndustry", event.target.value)
              }
              required
              maxLength={180}
              className={fieldClass}
              placeholder={
                language === "fr"
                  ? "Ex. agro-transformation, métallurgie, emballage"
                  : "E.g. agro-processing, metalworking, packaging"
              }
            />
          </Field>
          <Field label={language === "fr" ? "Pays" : "Country"}>
            <input
              value={draft.countryCode}
              onChange={(event) =>
                updateDraft("countryCode", event.target.value.toUpperCase())
              }
              required
              minLength={2}
              maxLength={3}
              className={fieldClass}
            />
          </Field>
          <Field label={language === "fr" ? "Ville" : "City"}>
            <input
              value={draft.city}
              onChange={(event) => updateDraft("city", event.target.value)}
              required
              maxLength={160}
              className={fieldClass}
            />
          </Field>
          <Field
            label={language === "fr" ? "Région" : "Region"}
            detail={language === "fr" ? "facultatif" : "optional"}
          >
            <input
              value={draft.region}
              onChange={(event) => updateDraft("region", event.target.value)}
              maxLength={160}
              className={fieldClass}
            />
          </Field>
          <Field
            label={language === "fr" ? "Zone industrielle" : "Industrial zone"}
            detail={language === "fr" ? "facultatif" : "optional"}
          >
            <input
              value={draft.industrialZone}
              onChange={(event) =>
                updateDraft("industrialZone", event.target.value)
              }
              maxLength={160}
              className={fieldClass}
            />
          </Field>
          <Field
            label={language === "fr" ? "Adresse du site" : "Site address"}
            detail={
              language === "fr"
                ? "privée jusqu'à validation"
                : "private until verification"
            }
          >
            <input
              value={draft.publicAddress}
              onChange={(event) =>
                updateDraft("publicAddress", event.target.value)
              }
              maxLength={500}
              className={fieldClass}
            />
          </Field>
          <Field
            label={language === "fr" ? "Site web" : "Website"}
            detail={language === "fr" ? "facultatif" : "optional"}
          >
            <input
              value={draft.website}
              onChange={(event) => updateDraft("website", event.target.value)}
              type="url"
              maxLength={500}
              className={fieldClass}
              placeholder="https://"
            />
          </Field>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="mt-6 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label={language === "fr" ? "Année de création" : "Founding year"}
              detail={language === "fr" ? "facultatif" : "optional"}
            >
              <input
                value={draft.foundingYear}
                onChange={(event) =>
                  updateDraft("foundingYear", event.target.value)
                }
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                className={fieldClass}
                placeholder="2015"
              />
            </Field>
            <Field
              label={
                language === "fr"
                  ? "Effectif approximatif"
                  : "Approximate workforce"
              }
              detail={language === "fr" ? "facultatif" : "optional"}
            >
              <input
                value={draft.employeeRange}
                onChange={(event) =>
                  updateDraft("employeeRange", event.target.value)
                }
                maxLength={120}
                className={fieldClass}
                placeholder={
                  language === "fr" ? "Ex. 50 à 100" : "E.g. 50 to 100"
                }
              />
            </Field>
            <Field
              label={language === "fr" ? "Taille du site" : "Factory size"}
              detail={language === "fr" ? "facultatif" : "optional"}
            >
              <input
                value={draft.factorySize}
                onChange={(event) =>
                  updateDraft("factorySize", event.target.value)
                }
                maxLength={180}
                className={fieldClass}
                placeholder={
                  language === "fr" ? "Ex. 4 000 m²" : "E.g. 4,000 m²"
                }
              />
            </Field>
            <Field
              label={
                language === "fr"
                  ? "Capacité de production"
                  : "Production capacity"
              }
              detail={language === "fr" ? "facultatif" : "optional"}
            >
              <input
                value={draft.productionCapacity}
                onChange={(event) =>
                  updateDraft("productionCapacity", event.target.value)
                }
                maxLength={500}
                className={fieldClass}
                placeholder={
                  language === "fr"
                    ? "Ex. 20 tonnes / mois"
                    : "E.g. 20 tonnes / month"
                }
              />
            </Field>
          </div>
          <Field
            label={
              language === "fr" ? "Produits fabriqués" : "Products manufactured"
            }
            detail={
              language === "fr" ? "séparés par des virgules" : "comma-separated"
            }
          >
            <input
              value={draft.productsManufactured}
              onChange={(event) =>
                updateDraft("productsManufactured", event.target.value)
              }
              maxLength={3000}
              className={fieldClass}
              placeholder={
                language === "fr"
                  ? "Ex. sacs tissés, huile raffinée, pièces moulées"
                  : "E.g. woven bags, refined oil, cast components"
              }
            />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label={
                language === "fr"
                  ? "Marchés export actuels ou visés"
                  : "Current or target export markets"
              }
              detail={
                language === "fr"
                  ? "séparés par des virgules"
                  : "comma-separated"
              }
            >
              <input
                value={draft.exportMarkets}
                onChange={(event) =>
                  updateDraft("exportMarkets", event.target.value)
                }
                maxLength={1800}
                className={fieldClass}
                placeholder={
                  language === "fr"
                    ? "Ex. Bénin, Ghana, UEMOA"
                    : "E.g. Benin, Ghana, WAEMU"
                }
              />
            </Field>
            <Field
              label={language === "fr" ? "Certifications" : "Certifications"}
              detail={
                language === "fr"
                  ? "séparées par des virgules"
                  : "comma-separated"
              }
            >
              <input
                value={draft.certifications}
                onChange={(event) =>
                  updateDraft("certifications", event.target.value)
                }
                maxLength={1800}
                className={fieldClass}
                placeholder="ISO 9001, HACCP"
              />
            </Field>
          </div>
          <Field
            label={
              language === "fr"
                ? "Présentation de l'activité"
                : "Business introduction"
            }
            detail={
              language === "fr"
                ? "sans données confidentielles"
                : "without confidential data"
            }
          >
            <textarea
              value={draft.description}
              onChange={(event) =>
                updateDraft("description", event.target.value)
              }
              maxLength={1600}
              rows={5}
              className={fieldClass}
              placeholder={
                language === "fr"
                  ? "Présentez l'activité, les produits et les marchés de l'usine."
                  : "Describe the factory's activity, products, and markets."
              }
            />
          </Field>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-6 space-y-7">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                  {language === "fr"
                    ? "Lignes de production"
                    : "Production lines"}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {language === "fr"
                    ? "Ajoutez les lignes principales connues. Elles restent privées."
                    : "Add the main lines you know. They remain private."}
                </p>
              </div>
              <button
                type="button"
                onClick={addProductionLine}
                disabled={productionLines.length >= 20}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-slate-950 dark:text-white"
              >
                <Plus className="h-4 w-4" />
                {language === "fr" ? "Ajouter une ligne" : "Add a line"}
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {productionLines.map((line, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.035]"
                >
                  <div className="grid gap-4 md:grid-cols-[1.1fr_1fr_1fr_auto]">
                    <Field
                      label={
                        language === "fr" ? "Nom de la ligne" : "Line name"
                      }
                    >
                      <input
                        value={line.name}
                        onChange={(event) =>
                          updateLine(index, "name", event.target.value)
                        }
                        maxLength={180}
                        className={fieldClass}
                        placeholder={
                          language === "fr"
                            ? "Ex. Ligne de conditionnement"
                            : "E.g. packaging line"
                        }
                      />
                    </Field>
                    <Field label={language === "fr" ? "Industrie" : "Industry"}>
                      <input
                        value={line.industry}
                        onChange={(event) =>
                          updateLine(index, "industry", event.target.value)
                        }
                        maxLength={180}
                        className={fieldClass}
                      />
                    </Field>
                    <Field label={language === "fr" ? "Statut" : "Status"}>
                      <select
                        value={line.operatingStatus}
                        onChange={(event) =>
                          updateLine(
                            index,
                            "operatingStatus",
                            event.target.value,
                          )
                        }
                        className={fieldClass}
                      >
                        <option value="unknown">
                          {language === "fr" ? "À préciser" : "To confirm"}
                        </option>
                        <option value="operational">
                          {language === "fr" ? "Opérationnelle" : "Operational"}
                        </option>
                        <option value="partially_operational">
                          {language === "fr" ? "Partielle" : "Partial"}
                        </option>
                        <option value="maintenance">
                          {language === "fr" ? "Maintenance" : "Maintenance"}
                        </option>
                      </select>
                    </Field>
                    <button
                      type="button"
                      onClick={() =>
                        setProductionLines((current) =>
                          current.filter((_, lineIndex) => lineIndex !== index),
                        )
                      }
                      className="mt-7 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-white/15 dark:text-slate-300 dark:hover:bg-red-400/10"
                      aria-label={
                        language === "fr" ? "Supprimer la ligne" : "Remove line"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4">
                    <Field
                      label={
                        language === "fr"
                          ? "Usage ou produit fabriqué"
                          : "Purpose or product made"
                      }
                      detail={language === "fr" ? "facultatif" : "optional"}
                    >
                      <input
                        value={line.purpose}
                        onChange={(event) =>
                          updateLine(index, "purpose", event.target.value)
                        }
                        maxLength={500}
                        className={fieldClass}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                  {language === "fr"
                    ? "Machines principales"
                    : "Principal machinery"}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {language === "fr"
                    ? "Ne renseignez pas les numéros de série dans cette étape publique."
                    : "Do not enter serial numbers at this public intake step."}
                </p>
              </div>
              <button
                type="button"
                onClick={addMachine}
                disabled={principalMachines.length >= 80}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-slate-950 dark:text-white"
              >
                <Plus className="h-4 w-4" />
                {language === "fr" ? "Ajouter une machine" : "Add machinery"}
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {principalMachines.map((machine, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.035]"
                >
                  <div className="grid gap-4 md:grid-cols-[1.1fr_1fr_1fr_auto]">
                    <Field label={language === "fr" ? "Machine" : "Machine"}>
                      <input
                        value={machine.name}
                        onChange={(event) =>
                          updateMachine(index, "name", event.target.value)
                        }
                        maxLength={180}
                        className={fieldClass}
                        placeholder={
                          language === "fr" ? "Ex. Extrudeuse" : "E.g. extruder"
                        }
                      />
                    </Field>
                    <Field
                      label={language === "fr" ? "Fabricant" : "Manufacturer"}
                    >
                      <input
                        value={machine.manufacturer}
                        onChange={(event) =>
                          updateMachine(
                            index,
                            "manufacturer",
                            event.target.value,
                          )
                        }
                        maxLength={180}
                        className={fieldClass}
                      />
                    </Field>
                    <Field label={language === "fr" ? "Modèle" : "Model"}>
                      <input
                        value={machine.model}
                        onChange={(event) =>
                          updateMachine(index, "model", event.target.value)
                        }
                        maxLength={180}
                        className={fieldClass}
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() =>
                        setPrincipalMachines((current) =>
                          current.filter(
                            (_, machineIndex) => machineIndex !== index,
                          ),
                        )
                      }
                      className="mt-7 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-white/15 dark:text-slate-300 dark:hover:bg-red-400/10"
                      aria-label={
                        language === "fr"
                          ? "Supprimer la machine"
                          : "Remove machinery"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Field label={language === "fr" ? "Catégorie" : "Category"}>
                      <input
                        value={machine.machineCategory}
                        onChange={(event) =>
                          updateMachine(
                            index,
                            "machineCategory",
                            event.target.value,
                          )
                        }
                        maxLength={180}
                        className={fieldClass}
                      />
                    </Field>
                    <Field
                      label={
                        language === "fr" ? "Ligne associée" : "Associated line"
                      }
                    >
                      <select
                        value={machine.productionLineIndex ?? ""}
                        onChange={(event) =>
                          updateMachine(
                            index,
                            "productionLineIndex",
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                          )
                        }
                        className={fieldClass}
                      >
                        <option value="">
                          {language === "fr"
                            ? "Non renseignée"
                            : "Not specified"}
                        </option>
                        {productionLines.map((line, lineIndex) => (
                          <option key={lineIndex} value={lineIndex}>
                            {line.name ||
                              (language === "fr"
                                ? "Ligne sans nom"
                                : "Unnamed line")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={language === "fr" ? "Statut" : "Status"}>
                      <select
                        value={machine.operatingStatus}
                        onChange={(event) =>
                          updateMachine(
                            index,
                            "operatingStatus",
                            event.target.value,
                          )
                        }
                        className={fieldClass}
                      >
                        <option value="unknown">
                          {language === "fr" ? "À préciser" : "To confirm"}
                        </option>
                        <option value="operational">
                          {language === "fr" ? "Opérationnelle" : "Operational"}
                        </option>
                        <option value="partially_operational">
                          {language === "fr" ? "Partielle" : "Partial"}
                        </option>
                        <option value="maintenance">
                          {language === "fr" ? "Maintenance" : "Maintenance"}
                        </option>
                      </select>
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                  {language === "fr"
                    ? "Sous-ensembles critiques"
                    : "Critical assemblies"}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {language === "fr"
                    ? "Ajoutez les sous-ensembles utiles au suivi technique. Ils restent prives."
                    : "Add assemblies useful for technical follow-up. They remain private."}
                </p>
              </div>
              <button
                type="button"
                onClick={addAssembly}
                disabled={!principalMachines.length || assemblies.length >= 160}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-slate-950 dark:text-white"
              >
                <Plus className="h-4 w-4" />
                {language === "fr"
                  ? "Ajouter un sous-ensemble"
                  : "Add an assembly"}
              </button>
            </div>
            {!principalMachines.length ? (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                {language === "fr"
                  ? "Ajoutez d'abord une machine pour rattacher un sous-ensemble."
                  : "Add a machine first to link an assembly."}
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              {assemblies.map((assembly, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.035]"
                >
                  <div className="grid gap-4 md:grid-cols-[1.1fr_1fr_1fr_auto]">
                    <Field
                      label={language === "fr" ? "Sous-ensemble" : "Assembly"}
                    >
                      <input
                        value={assembly.name}
                        onChange={(event) =>
                          updateAssembly(index, "name", event.target.value)
                        }
                        maxLength={180}
                        className={fieldClass}
                        placeholder={
                          language === "fr"
                            ? "Ex. Unite d'entrainement"
                            : "E.g. drive unit"
                        }
                      />
                    </Field>
                    <Field label={language === "fr" ? "Type" : "Type"}>
                      <input
                        value={assembly.assemblyType}
                        onChange={(event) =>
                          updateAssembly(
                            index,
                            "assemblyType",
                            event.target.value,
                          )
                        }
                        maxLength={180}
                        className={fieldClass}
                        placeholder={
                          language === "fr"
                            ? "Ex. Transmission"
                            : "E.g. transmission"
                        }
                      />
                    </Field>
                    <Field
                      label={
                        language === "fr"
                          ? "Machine associee"
                          : "Associated machine"
                      }
                    >
                      <select
                        value={assembly.machineIndex}
                        onChange={(event) =>
                          updateAssembly(
                            index,
                            "machineIndex",
                            Number(event.target.value),
                          )
                        }
                        className={fieldClass}
                      >
                        {principalMachines.map((machine, machineIndex) => (
                          <option key={machineIndex} value={machineIndex}>
                            {machine.name ||
                              (language === "fr"
                                ? "Machine sans nom"
                                : "Unnamed machine")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button
                      type="button"
                      onClick={() =>
                        setAssemblies((current) =>
                          current.filter(
                            (_, assemblyIndex) => assemblyIndex !== index,
                          ),
                        )
                      }
                      className="mt-7 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-white/15 dark:text-slate-300 dark:hover:bg-red-400/10"
                      aria-label={
                        language === "fr"
                          ? "Supprimer le sous-ensemble"
                          : "Remove assembly"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 max-w-sm">
                    <Field label={language === "fr" ? "Statut" : "Status"}>
                      <select
                        value={assembly.operatingStatus}
                        onChange={(event) =>
                          updateAssembly(
                            index,
                            "operatingStatus",
                            event.target.value,
                          )
                        }
                        className={fieldClass}
                      >
                        <option value="unknown">
                          {language === "fr" ? "A preciser" : "To confirm"}
                        </option>
                        <option value="operational">
                          {language === "fr" ? "Operationnel" : "Operational"}
                        </option>
                        <option value="partially_operational">
                          {language === "fr" ? "Partiel" : "Partial"}
                        </option>
                        <option value="maintenance">
                          {language === "fr" ? "Maintenance" : "Maintenance"}
                        </option>
                      </select>
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                  {language === "fr"
                    ? "Composants critiques"
                    : "Critical components"}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {language === "fr"
                    ? "Relevez les pieces qui aident a qualifier un besoin, sans ajouter de donnees sensibles."
                    : "Record parts that help qualify a requirement, without adding sensitive data."}
                </p>
              </div>
              <button
                type="button"
                onClick={addComponent}
                disabled={!principalMachines.length || components.length >= 500}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-slate-950 dark:text-white"
              >
                <Plus className="h-4 w-4" />
                {language === "fr" ? "Ajouter un composant" : "Add a component"}
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {components.map((component, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.035]"
                >
                  <div className="grid gap-4 md:grid-cols-[1.1fr_1fr_1fr_auto]">
                    <Field
                      label={language === "fr" ? "Composant" : "Component"}
                    >
                      <input
                        value={component.name}
                        onChange={(event) =>
                          updateComponent(index, "name", event.target.value)
                        }
                        maxLength={180}
                        className={fieldClass}
                        placeholder={
                          language === "fr"
                            ? "Ex. Roulement principal"
                            : "E.g. main bearing"
                        }
                      />
                    </Field>
                    <Field label={language === "fr" ? "Type" : "Type"}>
                      <input
                        value={component.componentType}
                        onChange={(event) =>
                          updateComponent(
                            index,
                            "componentType",
                            event.target.value,
                          )
                        }
                        maxLength={180}
                        className={fieldClass}
                      />
                    </Field>
                    <Field
                      label={
                        language === "fr" ? "Reference piece" : "Part number"
                      }
                    >
                      <input
                        value={component.partNumber}
                        onChange={(event) =>
                          updateComponent(
                            index,
                            "partNumber",
                            event.target.value,
                          )
                        }
                        maxLength={180}
                        className={fieldClass}
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() =>
                        setComponents((current) =>
                          current.filter(
                            (_, componentIndex) => componentIndex !== index,
                          ),
                        )
                      }
                      className="mt-7 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-white/15 dark:text-slate-300 dark:hover:bg-red-400/10"
                      aria-label={
                        language === "fr"
                          ? "Supprimer le composant"
                          : "Remove component"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-4">
                    <Field label={language === "fr" ? "Machine" : "Machine"}>
                      <select
                        value={component.machineIndex}
                        onChange={(event) =>
                          setComponents((current) =>
                            current.map((item, componentIndex) =>
                              componentIndex === index
                                ? {
                                    ...item,
                                    machineIndex: Number(event.target.value),
                                    assemblyIndex: null,
                                  }
                                : item,
                            ),
                          )
                        }
                        className={fieldClass}
                      >
                        {principalMachines.map((machine, machineIndex) => (
                          <option key={machineIndex} value={machineIndex}>
                            {machine.name ||
                              (language === "fr"
                                ? "Machine sans nom"
                                : "Unnamed machine")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label={language === "fr" ? "Sous-ensemble" : "Assembly"}
                    >
                      <select
                        value={component.assemblyIndex ?? ""}
                        onChange={(event) =>
                          updateComponent(
                            index,
                            "assemblyIndex",
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                          )
                        }
                        className={fieldClass}
                      >
                        <option value="">
                          {language === "fr"
                            ? "Non renseigne"
                            : "Not specified"}
                        </option>
                        {assemblies
                          .filter(
                            (assembly) =>
                              assembly.machineIndex === component.machineIndex,
                          )
                          .map((assembly, assemblyIndex) => {
                            const sourceIndex = assemblies.indexOf(assembly);
                            return (
                              <option key={sourceIndex} value={sourceIndex}>
                                {assembly.name ||
                                  (language === "fr"
                                    ? "Sous-ensemble sans nom"
                                    : "Unnamed assembly")}
                              </option>
                            );
                          })}
                      </select>
                    </Field>
                    <Field
                      label={language === "fr" ? "Criticite" : "Criticality"}
                    >
                      <select
                        value={component.criticality}
                        onChange={(event) =>
                          updateComponent(
                            index,
                            "criticality",
                            event.target.value,
                          )
                        }
                        className={fieldClass}
                      >
                        <option value="standard">
                          {language === "fr" ? "Standard" : "Standard"}
                        </option>
                        <option value="important">
                          {language === "fr" ? "Important" : "Important"}
                        </option>
                        <option value="critical">
                          {language === "fr" ? "Critique" : "Critical"}
                        </option>
                      </select>
                    </Field>
                    <Field label={language === "fr" ? "Statut" : "Status"}>
                      <select
                        value={component.operatingStatus}
                        onChange={(event) =>
                          updateComponent(
                            index,
                            "operatingStatus",
                            event.target.value,
                          )
                        }
                        className={fieldClass}
                      >
                        <option value="unknown">
                          {language === "fr" ? "A preciser" : "To confirm"}
                        </option>
                        <option value="operational">
                          {language === "fr" ? "Operationnel" : "Operational"}
                        </option>
                        <option value="partially_operational">
                          {language === "fr" ? "Partiel" : "Partial"}
                        </option>
                        <option value="maintenance">
                          {language === "fr" ? "Maintenance" : "Maintenance"}
                        </option>
                      </select>
                    </Field>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field
                      label={language === "fr" ? "Fabricant" : "Manufacturer"}
                    >
                      <input
                        value={component.manufacturer}
                        onChange={(event) =>
                          updateComponent(
                            index,
                            "manufacturer",
                            event.target.value,
                          )
                        }
                        maxLength={180}
                        className={fieldClass}
                      />
                    </Field>
                    <Field label={language === "fr" ? "Modele" : "Model"}>
                      <input
                        value={component.model}
                        onChange={(event) =>
                          updateComponent(index, "model", event.target.value)
                        }
                        maxLength={180}
                        className={fieldClass}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="mt-6 space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.035]">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {language === "fr"
                ? "Profil d'approvisionnement"
                : "Procurement profile"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {language === "fr"
                ? "Ces informations servent uniquement au triage industriel et restent privées."
                : "This information is used only for industrial triage and remains private."}
            </p>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <Field
                label={
                  language === "fr"
                    ? "Matières premières consommées"
                    : "Raw materials consumed"
                }
                detail={
                  language === "fr"
                    ? "séparées par des virgules"
                    : "comma-separated"
                }
              >
                <input
                  value={draft.rawMaterials}
                  onChange={(event) =>
                    updateDraft("rawMaterials", event.target.value)
                  }
                  maxLength={3000}
                  className={fieldClass}
                />
              </Field>
              <Field
                label={
                  language === "fr"
                    ? "Intrants industriels"
                    : "Industrial inputs"
                }
                detail={
                  language === "fr"
                    ? "séparés par des virgules"
                    : "comma-separated"
                }
              >
                <input
                  value={draft.industrialInputs}
                  onChange={(event) =>
                    updateDraft("industrialInputs", event.target.value)
                  }
                  maxLength={3000}
                  className={fieldClass}
                />
              </Field>
              <Field
                label={
                  language === "fr"
                    ? "Pièces détachées récurrentes"
                    : "Recurring spare parts"
                }
                detail={
                  language === "fr"
                    ? "séparées par des virgules"
                    : "comma-separated"
                }
              >
                <input
                  value={draft.recurringSpareParts}
                  onChange={(event) =>
                    updateDraft("recurringSpareParts", event.target.value)
                  }
                  maxLength={3000}
                  className={fieldClass}
                />
              </Field>
              <Field
                label={
                  language === "fr"
                    ? "Fréquence d'achat"
                    : "Procurement frequency"
                }
                detail={language === "fr" ? "facultatif" : "optional"}
              >
                <input
                  value={draft.procurementFrequency}
                  onChange={(event) =>
                    updateDraft("procurementFrequency", event.target.value)
                  }
                  maxLength={120}
                  className={fieldClass}
                  placeholder={
                    language === "fr"
                      ? "Ex. mensuelle, trimestrielle"
                      : "E.g. monthly, quarterly"
                  }
                />
              </Field>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label={
                language === "fr"
                  ? "Nom du contact principal"
                  : "Primary contact name"
              }
            >
              <input
                value={draft.contactName}
                onChange={(event) =>
                  updateDraft("contactName", event.target.value)
                }
                required
                maxLength={180}
                className={fieldClass}
              />
            </Field>
            <Field
              label={
                language === "fr" ? "E-mail professionnel" : "Business email"
              }
            >
              <input
                value={draft.contactEmail}
                onChange={(event) =>
                  updateDraft("contactEmail", event.target.value)
                }
                required
                type="email"
                maxLength={240}
                className={fieldClass}
              />
            </Field>
            <Field
              label={language === "fr" ? "Téléphone" : "Phone"}
              detail={language === "fr" ? "facultatif" : "optional"}
            >
              <input
                value={draft.contactPhone}
                onChange={(event) =>
                  updateDraft("contactPhone", event.target.value)
                }
                maxLength={80}
                className={fieldClass}
              />
            </Field>
          </div>
        </div>
      ) : null}

      <p className="mt-6 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {language === "fr"
          ? "La soumission crée un profil privé en attente de vérification. Les données de production, de machines, d'achats et les documents ne sont jamais publiés par défaut."
          : "Submission creates a private profile pending verification. Production, machinery, procurement, and documents are never public by default."}
      </p>
      {status.kind !== "idle" ? (
        <div
          className={cn(
            "mt-5 rounded-xl border px-4 py-3 text-sm",
            status.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100"
              : status.kind === "error"
                ? "border-red-200 bg-red-50 text-red-900 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-100"
                : "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
          )}
        >
          {status.kind === "loading"
            ? language === "fr"
              ? "Envoi de l'inscription..."
              : "Submitting registration..."
            : status.text}
        </div>
      ) : null}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-white/15 dark:bg-slate-950 dark:text-white dark:hover:bg-white/10"
          >
            {language === "fr" ? "Retour" : "Back"}
          </button>
        ) : (
          <span />
        )}
        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={continueToNextStep}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-[#f9a800]"
          >
            {language === "fr" ? "Continuer" : "Continue"}
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={status.kind === "loading"}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Factory className="h-4 w-4" />
            {language === "fr"
              ? "Soumettre l'usine pour vérification"
              : "Submit factory for verification"}
          </button>
        )}
      </div>
    </form>
  );
}

export default function IndustrialHubPage() {
  const [location, navigate] = useLocation();
  const { language, setLanguage } = useLocale();
  const { isAuthenticated, user } = useSession();
  const locale: "fr" | "en" = language === "en" ? "en" : "fr";
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window !== "undefined" &&
    window.localStorage.getItem("exportunity-industrial-theme") === "dark"
      ? "dark"
      : "light",
  );
  const [factories, setFactories] = useState<PublicFactory[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [searchContext, setSearchContext] =
    useState<IndustrialSearchContext | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyCategory[]>([]);
  const [selectedFactory, setSelectedFactory] = useState<PublicFactory | null>(
    null,
  );
  const [selectedIndustrialContext, setSelectedIndustrialContext] =
    useState<IndustrialContextLocation | null>(null);
  const [factoryFilters, setFactoryFilters] = useState<FactoryDirectoryFilters>(
    EMPTY_FACTORY_DIRECTORY_FILTERS,
  );
  const [factoryDirectoryMode, setFactoryDirectoryMode] =
    useState<FactoryDirectoryMode>("map");
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [search, setSearch] = useState(queryValue(location, "q"));
  const view = readView(location);
  const activeKey =
    view === "home" ||
    view === "register" ||
    view === "factoryProfile" ||
    view === "claim" ||
    view === "factoryWorkspace"
      ? "factories"
      : view;
  const isMachineryBrand = view === "machinery";

  const copy =
    locale === "fr"
      ? {
          factories: "Usines",
          map: "Carte",
          products: "Produits export",
          supply: "Approvisionnement industriel",
          machinery: "Machines",
          quote: "Demander un devis",
          account: "Compte",
          login: "Se connecter",
          heroEyebrow: "Exportunity",
          heroTitle: "Quel besoin industriel bloque votre production ?",
          heroText:
            "Décrivez une pièce, une machine, une ligne ou un intrant. Ajoutez une photo, une référence ou un plan : Exportunity organise le dossier pour revue technique avant toute mise en relation.",
          assistantName: "Exportunity AI",
          assistantRole: "Assistant industriel",
          assistantGreeting:
            "Dites-moi ce qui bloque votre production. Je peux organiser une recherche vérifiée ou préparer votre demande technique.",
          assistantPlaceholder:
            "Décrivez une pièce, une machine, un matériau ou un problème de production…",
          assistantSend: "Envoyer à Exportunity AI",
          assistantVoice: "Parler à Exportunity AI",
          assistantHint:
            "Exportunity AI transmet votre demande vers les usines, produits et fournisseurs vérifiés.",
          searchPlaceholder:
            "Rechercher une usine, un produit, une machine, une matière première ou une pièce",
          search: "Rechercher",
          verifiedMap: "Carte industrielle du Bénin",
          mapDetail:
            "GDIZ, le Port de Cotonou et les filières publiques donnent le contexte. Les usines ne sont publiées qu'après vérification.",
          sourceFactory: "S'approvisionner auprès d'une usine vérifiée",
          sourceFactoryDetail:
            "Identifier des fabricants et des produits export-ready.",
          supplyFactory: "Approvisionner mon usine",
          supplyFactoryDetail:
            "Demander matières premières, intrants ou pièces.",
          sourceMachinery: "Sourcer une machine",
          openMap: "Ouvrir la carte",
          sourceMachineryDetail:
            "Demander une machine, une ligne ou un équipement.",
          customManufacturing: "Fabrication sur mesure",
          customManufacturingDetail:
            "Lancer un besoin de fabrication ou de reverse engineering.",
          verifiedFactories: "Usines vérifiées",
          exportProducts: "Produits prêts à l'export",
          industrialSupply: "Approvisionnement industriel",
          machineryTitle: "Exportunity Machinery",
          mapEyebrow: "Repères industriels publics",
          mapTitle: "Carte industrielle du Bénin",
          mapDescription:
            "Explorez les infrastructures et filières publiques, puis les implantations de fabricants vérifiés lorsqu'elles sont autorisées à être publiées.",
          factoriesDescription:
            "Trouvez des fabricants vérifiés par industrie, pays, région et zone industrielle.",
          productsDescription:
            "Produits B2B publiés après validation, sans prix, capacité ou délai inventé.",
          supplyDescription:
            "Organisez un besoin de production autour d'une catégorie industrielle contrôlée.",
          machineryDescription:
            "De la demande d'usine à une solution industrielle opérationnelle.",
          quoteDescription:
            "Décrivez votre besoin. Exportunity le trie avant toute mise en relation fournisseur.",
          registerDescription:
            "Créez un profil d'usine privé. La publication publique intervient seulement après vérification.",
          requestQuote: "Soumettre un besoin industriel",
          exploreFactories: "Explorer les usines vérifiées",
          openMachinery: "Accéder à Exportunity Machinery",
          accountManager: "Demander un responsable de compte",
          noCatalog: "Aucune offre industrielle vérifiée n'est publiée",
          noCatalogDetail:
            "Les éléments de catalogue apparaissent après validation de l'usine, de la catégorie et de la visibilité publique.",
          verifiedOnly: "Réservé aux profils vérifiés",
          categoryTitle: "Catégories industrielles contrôlées",
          howItWorks:
            "Exportunity relie les besoins industriels à des acteurs vérifiés. Les détails sensibles restent privés jusqu'à la bonne étape de la relation commerciale.",
        }
      : {
          factories: "Factories",
          map: "Map",
          products: "Export Products",
          supply: "Industrial Supply",
          machinery: "Machinery",
          quote: "Request a Quote",
          account: "Account",
          login: "Sign in",
          heroEyebrow: "Exportunity",
          heroTitle: "What industrial need is blocking your production?",
          heroText:
            "Describe a part, machine, line, or material. Add a photo, reference, or drawing and Exportunity prepares the case for technical review before any supplier introduction.",
          assistantName: "Exportunity AI",
          assistantRole: "Industrial assistant",
          assistantGreeting:
            "Tell me what is blocking production. I can organize a verified search or prepare your technical request.",
          assistantPlaceholder:
            "Describe a part, machine, material, or production issue…",
          assistantSend: "Send to Exportunity AI",
          assistantVoice: "Speak to Exportunity AI",
          assistantHint:
            "Exportunity AI routes your request to verified factories, products, and suppliers.",
          searchPlaceholder:
            "Search a factory, product, machine, raw material, or part number",
          search: "Search",
          verifiedMap: "Benin industrial map",
          mapDetail:
            "GDIZ, the Port of Cotonou, and public sector lenses provide context. Factories are published only after verification.",
          sourceFactory: "Source from a verified factory",
          sourceFactoryDetail:
            "Identify manufacturers and export-ready products.",
          supplyFactory: "Supply my factory",
          supplyFactoryDetail: "Request raw materials, inputs, or parts.",
          sourceMachinery: "Source machinery",
          openMap: "Open map",
          sourceMachineryDetail:
            "Request a machine, line, or industrial equipment.",
          customManufacturing: "Custom manufacturing",
          customManufacturingDetail:
            "Open a manufacturing or reverse-engineering requirement.",
          verifiedFactories: "Verified factories",
          exportProducts: "Export-ready products",
          industrialSupply: "Industrial supply",
          machineryTitle: "Exportunity Machinery",
          mapEyebrow: "Public industrial references",
          mapTitle: "Benin industrial map",
          mapDescription:
            "Explore public infrastructure and sector context, then published locations of verified manufacturers when they are authorized for public display.",
          factoriesDescription:
            "Find verified manufacturers by industry, country, region, and industrial zone.",
          productsDescription:
            "B2B products published after validation, without invented pricing, capacity, or lead times.",
          supplyDescription:
            "Structure a production requirement around a controlled industrial category.",
          machineryDescription:
            "From factory requirement to a working industrial solution.",
          quoteDescription:
            "Describe your requirement. Exportunity triages it before any supplier introduction.",
          registerDescription:
            "Create a private factory profile. Public publication follows verification only.",
          requestQuote: "Submit an industrial requirement",
          exploreFactories: "Explore verified factories",
          openMachinery: "Access Exportunity Machinery",
          accountManager: "Request an account manager",
          noCatalog: "No verified industrial offering is published",
          noCatalogDetail:
            "Catalog items appear after factory, category, and public-visibility approval.",
          verifiedOnly: "Verified profiles only",
          categoryTitle: "Controlled industrial categories",
          howItWorks:
            "Exportunity connects industrial requirements to verified actors. Sensitive details remain private until the appropriate commercial stage.",
        };

  useEffect(() => {
    window.localStorage.setItem("exportunity-industrial-theme", theme);
  }, [theme]);

  useEffect(() => {
    setSearch(queryValue(location, "q"));
  }, [location]);

  const searchQuery = queryValue(location, "q");
  useEffect(() => {
    let active = true;
    setDirectoryError(null);
    setSearchContext(null);
    const query = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : "";
    Promise.all([
      fetch("/api/industrial/taxonomy").then((response) => response.json()),
      fetch(`/api/industrial/factories${query}`).then((response) =>
        response.json(),
      ),
      fetch(`/api/industrial/catalog${query}`).then((response) =>
        response.json(),
      ),
    ])
      .then(([taxonomyPayload, factoryPayload, catalogPayload]) => {
        if (!active) return;
        if (taxonomyPayload?.ok) setTaxonomy(taxonomyPayload.taxonomy || []);
        if (factoryPayload?.ok) setFactories(factoryPayload.factories || []);
        else setDirectoryError(factoryPayload?.message || null);
        if (catalogPayload?.ok) setCatalogItems(catalogPayload.items || []);
        setSearchContext(
          (catalogPayload?.ok && catalogPayload.searchContext) ||
            (factoryPayload?.ok && factoryPayload.searchContext) ||
            null,
        );
      })
      .catch(() => {
        if (!active) return;
        setDirectoryError(
          locale === "fr"
            ? "La plateforme industrielle est momentanément indisponible."
            : "The industrial platform is temporarily unavailable.",
        );
      });
    return () => {
      active = false;
    };
  }, [locale, searchQuery]);

  const filteredFactories = useMemo(() => {
    const normalise = (value?: string | null) =>
      String(value || "")
        .trim()
        .toLocaleLowerCase("fr");
    return factories.filter((factory) => {
      return (
        (!factoryFilters.countryCode ||
          normalise(factory.countryCode) ===
            normalise(factoryFilters.countryCode)) &&
        (!factoryFilters.region ||
          normalise(factory.region) === normalise(factoryFilters.region)) &&
        (!factoryFilters.city ||
          normalise(factory.city) === normalise(factoryFilters.city)) &&
        (!factoryFilters.industrialZone ||
          normalise(factory.industrialZone) ===
            normalise(factoryFilters.industrialZone)) &&
        (!factoryFilters.industry ||
          normalise(factory.industry) === normalise(factoryFilters.industry))
      );
    });
  }, [factories, factoryFilters]);
  const factoryFiltersActive = Object.values(factoryFilters).some(Boolean);

  useEffect(() => {
    if (
      selectedFactory &&
      !filteredFactories.some((factory) => factory.id === selectedFactory.id)
    )
      setSelectedFactory(null);
  }, [filteredFactories, selectedFactory]);

  const categorizedItems = useMemo(
    () => ({
      products: catalogItems.filter(
        (item) => item.classification === "export_ready_factory_product",
      ),
      supply: catalogItems.filter((item) =>
        [
          "raw_material",
          "industrial_input",
          "spare_part",
          "industrial_service",
        ].includes(item.classification),
      ),
      machinery: catalogItems.filter(
        (item) => item.classification === "machinery",
      ),
    }),
    [catalogItems],
  );
  const queryCategory = queryValue(location, "category");
  const selectedCategory = useMemo(
    () => taxonomy.find((category) => category.code === queryCategory) || null,
    [queryCategory, taxonomy],
  );
  const visibleExportItems = useMemo(() => {
    if (selectedCategory?.classification !== "export_ready_factory_product")
      return categorizedItems.products;
    return categorizedItems.products.filter(
      (item) => item.categoryCode === selectedCategory.code,
    );
  }, [categorizedItems.products, selectedCategory]);
  const visibleSupplyItems = useMemo(() => {
    if (
      !selectedCategory ||
      ![
        "raw_material",
        "industrial_input",
        "spare_part",
        "industrial_service",
      ].includes(selectedCategory.classification)
    )
      return categorizedItems.supply;
    return categorizedItems.supply.filter(
      (item) => item.categoryCode === selectedCategory.code,
    );
  }, [categorizedItems.supply, selectedCategory]);
  const visibleMachineryItems = useMemo(() => {
    if (selectedCategory?.classification !== "machinery")
      return categorizedItems.machinery;
    return categorizedItems.machinery.filter(
      (item) => item.categoryCode === selectedCategory.code,
    );
  }, [categorizedItems.machinery, selectedCategory]);

  const goSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = search.trim();
    const destination = view === "map" ? "/map" : "/factories";
    navigate(
      trimmed ? `${destination}?q=${encodeURIComponent(trimmed)}` : destination,
    );
  };

  const heroNeedActions = [
    {
      title:
        locale === "fr"
          ? "Pièce ou composant urgent"
          : "Urgent part or component",
      detail:
        locale === "fr"
          ? "Référence, compatibilité ou panne."
          : "Reference, compatibility, or fault.",
      href: "/request-quote?type=spare_part&urgency=urgent",
      icon: PackageSearch,
    },
    {
      title:
        locale === "fr" ? "Machine ou ligne" : "Machine or production line",
      detail:
        locale === "fr"
          ? "Capacité, site et contrainte technique."
          : "Capacity, site, and technical constraints.",
      href: "/request-quote?type=machinery",
      icon: Wrench,
    },
    {
      title:
        locale === "fr" ? "Matière ou intrant" : "Material or industrial input",
      detail:
        locale === "fr"
          ? "Quantité, fréquence et spécification."
          : "Quantity, frequency, and specification.",
      href: "/request-quote?type=raw_material",
      icon: Settings2,
    },
    {
      title:
        locale === "fr"
          ? "Fabriquer ou refaire une pièce"
          : "Make or reproduce a part",
      detail:
        locale === "fr"
          ? "Photo, dessin, mesure ou fichier CAD."
          : "Photo, drawing, measurement, or CAD file.",
      href: "/request-quote?type=custom_manufacturing",
      icon: ClipboardList,
    },
  ];

  const assistantQuickReplies = [
    locale === "fr" ? "Trouver une pièce détachée" : "Find a spare part",
    locale === "fr" ? "Sourcer une machine" : "Source a machine",
    locale === "fr"
      ? "Trouver un intrant industriel"
      : "Find an industrial input",
    locale === "fr"
      ? "Fabriquer une pièce localement"
      : "Manufacture a part locally",
  ];

  const industrialNeedFlow = [
    {
      title: locale === "fr" ? "1. Décrire" : "1. Describe",
      detail:
        locale === "fr"
          ? "La pièce, l'équipement ou le blocage réel."
          : "The real part, equipment, or production blocker.",
    },
    {
      title: locale === "fr" ? "2. Documenter" : "2. Document",
      detail:
        locale === "fr"
          ? "Photo, référence, plan, CAD ou mesure disponible."
          : "Available photo, reference, drawing, CAD, or measurement.",
    },
    {
      title: locale === "fr" ? "3. Revoir la route" : "3. Review the route",
      detail:
        locale === "fr"
          ? "Stock, distribution, assemblage, import ou fabrication locale."
          : "Stock, distribution, assembly, import, or local-manufacturing review.",
    },
    {
      title:
        locale === "fr" ? "4. Avancer avec accord" : "4. Proceed with approval",
      detail:
        locale === "fr"
          ? "Toute mise en relation ou commande reste soumise à validation."
          : "Any introduction or order remains subject to approval.",
    },
  ];

  const machineryActions = [
    {
      title:
        locale === "fr" ? "Trouver une pièce détachée" : "Find a spare part",
      detail:
        locale === "fr"
          ? "Décrivez la référence, le modèle ou la compatibilité."
          : "Provide a reference, model, or compatibility detail.",
      href: "/request-quote?type=spare_part",
      icon: PackageSearch,
    },
    {
      title:
        locale === "fr"
          ? "Demander une fabrication sur mesure"
          : "Request custom manufacturing",
      detail:
        locale === "fr"
          ? "Lancez une étude de pièce, d'assemblage ou de rétro-ingénierie."
          : "Open a part, assembly, or reverse-engineering assessment.",
      href: "/request-quote?type=custom_manufacturing",
      icon: Settings2,
    },
    {
      title: locale === "fr" ? "Sourcer une machine" : "Source a machine",
      detail:
        locale === "fr"
          ? "Cadrez une machine, un équipement ou une capacité recherchée."
          : "Define the machine, equipment, or capability you need.",
      href: "/request-quote?type=machinery",
      icon: Wrench,
    },
    {
      title:
        locale === "fr"
          ? "Sourcer une ligne de production"
          : "Source a production line",
      detail:
        locale === "fr"
          ? "Décrivez le produit, le volume et les contraintes du site."
          : "Describe the product, volume, and site constraints.",
      href: `/request-quote?type=machinery&product=${encodeURIComponent(
        locale === "fr" ? "Ligne de production" : "Production line",
      )}`,
      icon: Factory,
    },
    {
      title:
        locale === "fr"
          ? "Échanger sur le financement d'un équipement"
          : "Discuss equipment financing",
      detail:
        locale === "fr"
          ? "Ajoutez cette demande à un dossier machine pour un suivi après revue technique, sans promesse de financement."
          : "Add financing follow-up to a machinery requirement after technical review, without a financing promise.",
      href: "/request-quote?type=machinery&financing=discussion",
      icon: Landmark,
    },
    {
      title:
        locale === "fr" ? "Demander une maintenance" : "Request maintenance",
      detail:
        locale === "fr"
          ? "Signalez l'équipement, la panne et l'impact opérationnel."
          : "Report the equipment, fault, and operational impact.",
      href: `/request-quote?type=industrial_service&product=${encodeURIComponent(
        locale === "fr" ? "Maintenance industrielle" : "Industrial maintenance",
      )}`,
      icon: Wrench,
    },
    {
      title:
        locale === "fr"
          ? "Soumettre un défi industriel"
          : "Submit an industrial challenge",
      detail:
        locale === "fr"
          ? "Documentez un problème récurrent à résoudre ou à fabriquer localement."
          : "Document a recurring problem to solve or manufacture locally.",
      href: "/my-factory#industrial-challenges",
      icon: ClipboardList,
    },
  ];

  const machineryEmergencyHref = `/request-quote?type=industrial_service&urgency=urgent&product=${encodeURIComponent(
    locale === "fr" ? "Arrêt de ligne" : "Production line stopped",
  )}`;

  const machineryOperatingStages = [
    {
      number: "01",
      title: locale === "fr" ? "Capturer le besoin" : "Capture the need",
      detail:
        locale === "fr"
          ? "Une pièce, une machine, une ligne ou un blocage de production réel."
          : "A real part, machine, production line, or production blocker.",
      icon: Search,
    },
    {
      number: "02",
      title: locale === "fr" ? "Documenter la preuve" : "Document the evidence",
      detail:
        locale === "fr"
          ? "Photo, référence, mesure, plan, fichier CAD ou échantillon disponible."
          : "Photo, reference, measurement, drawing, CAD file, or available sample.",
      icon: ClipboardList,
    },
    {
      number: "03",
      title:
        locale === "fr" ? "Revoir la bonne route" : "Review the right route",
      detail:
        locale === "fr"
          ? "Stock vérifié, fournisseur qualifié, import, assemblage ou fabrication locale."
          : "Verified stock, a qualified supplier, import, assembly, or local manufacturing.",
      icon: Settings2,
    },
    {
      number: "04",
      title: locale === "fr" ? "Contrôler et réutiliser" : "Control and reuse",
      detail:
        locale === "fr"
          ? "Le dossier technique, les décisions et les pièces validées restent traçables."
          : "The technical record, decisions, and approved parts remain traceable.",
      icon: CheckCircle2,
    },
  ];

  const machineryPriorityAreas = [
    {
      title:
        locale === "fr"
          ? "Composants mécaniques à qualifier"
          : "Mechanical components to qualify",
      detail:
        locale === "fr"
          ? "Sprockets, poulies, logements de roulements, accouplements, tambours et pièces de pompe."
          : "Sprockets, pulleys, bearing housings, couplings, drums, and pump components.",
    },
    {
      title:
        locale === "fr"
          ? "Éléments de précision à sourcer"
          : "Precision elements to source",
      detail:
        locale === "fr"
          ? "Roulements, courroies, chaînes, joints, moteurs, réducteurs et capteurs."
          : "Bearings, belts, chains, seals, motors, reducers, and sensors.",
    },
    {
      title:
        locale === "fr"
          ? "Systèmes à cadrer par la demande"
          : "Systems to scope through demand",
      detail:
        locale === "fr"
          ? "Pompes, convoyeurs, mélangeurs, unités agro-industrielles et ensembles sur mesure."
          : "Pumps, conveyors, mixers, agro-industrial units, and custom assemblies.",
    },
  ];

  const titleByView: Record<
    IndustrialView,
    { eyebrow: string; title: string; detail: string }
  > = {
    home: {
      eyebrow: copy.heroEyebrow,
      title: copy.heroTitle,
      detail: copy.heroText,
    },
    factories: {
      eyebrow: copy.verifiedOnly,
      title: copy.verifiedFactories,
      detail: copy.factoriesDescription,
    },
    products: {
      eyebrow: copy.verifiedOnly,
      title: copy.exportProducts,
      detail: copy.productsDescription,
    },
    supply: {
      eyebrow: copy.verifiedOnly,
      title: copy.industrialSupply,
      detail: copy.supplyDescription,
    },
    machinery: {
      eyebrow: "Exportunity",
      title: copy.machineryTitle,
      detail: copy.machineryDescription,
    },
    quote: {
      eyebrow:
        locale === "fr"
          ? "Besoin industriel confidentiel"
          : "Confidential industrial requirement",
      title: copy.requestQuote,
      detail: copy.quoteDescription,
    },
    register: {
      eyebrow: locale === "fr" ? "Onboarding d'usine" : "Factory onboarding",
      title: locale === "fr" ? "Enregistrer une usine" : "Register a factory",
      detail: copy.registerDescription,
    },
    map: {
      eyebrow: copy.mapEyebrow,
      title: copy.mapTitle,
      detail: copy.mapDescription,
    },
    factoryProfile: {
      eyebrow: locale === "fr" ? "Usine verifiee" : "Verified factory",
      title: locale === "fr" ? "Profil industriel" : "Industrial profile",
      detail:
        locale === "fr"
          ? "Produits, capacites et preuves publiques verifies par Exportunity."
          : "Public products, capabilities, and proof verified by Exportunity.",
    },
    claim: {
      eyebrow: locale === "fr" ? "Propriete du profil" : "Profile ownership",
      title:
        locale === "fr"
          ? "Revendiquer un profil d'usine"
          : "Claim a factory profile",
      detail:
        locale === "fr"
          ? "Exportunity verifie les demandes de propriete avant toute modification du profil."
          : "Exportunity verifies ownership claims before changing a factory profile.",
    },
    factoryWorkspace: {
      eyebrow: locale === "fr" ? "Espace propriétaire" : "Owner workspace",
      title: locale === "fr" ? "Mon usine" : "My factory",
      detail:
        locale === "fr"
          ? "Gérez vos informations publiques, vos produits soumis et vos capacités sans contourner la revue Exportunity."
          : "Manage public details, submitted products, and capabilities without bypassing Exportunity review.",
    },
  };

  const queryType = queryValue(location, "type");
  const queryUrgency = queryValue(location, "urgency");
  const queryFinancing = queryValue(location, "financing");
  const quoteFactoryId = queryValue(location, "factory");
  const quoteProduct = queryValue(location, "product");
  const claimFactoryId = factoryClaimId(location);
  const publicFactoryId = factoryProfileId(location);
  const isDark = theme === "dark";
  const navLabel = (key: (typeof NAVIGATION)[number]["key"]) => copy[key];

  return (
    <div className={cn("min-h-screen", isDark && "dark")}>
      <div className="min-h-screen bg-[#F7F8FA] text-slate-950 transition-colors dark:bg-[#05070B] dark:text-white">
        <header className="sticky top-0 z-40 border-b border-slate-900/10 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111F]/90">
          <div className="mx-auto flex min-h-16 max-w-[1560px] items-center gap-4 px-4 lg:px-7">
            <Link
              href={isMachineryBrand ? "/machinery" : "/industrial"}
              className={cn(
                "flex h-11 shrink-0 items-center overflow-hidden rounded-lg shadow-[0_8px_20px_rgba(7,17,31,0.16)]",
                isMachineryBrand ? "bg-[#07111F] px-2.5" : "bg-[#07121F]",
              )}
              aria-label={isMachineryBrand ? "Exportunity Machinery" : "Exportunity"}
            >
              <img
                src={
                  isMachineryBrand
                    ? "/tenants/exportunity/machinery-logo.svg"
                    : "/tenants/exportunity/logo.svg?v=20260731-company"
                }
                alt={isMachineryBrand ? "Exportunity Machinery" : "Exportunity"}
                className={cn(
                  "h-full w-auto object-contain",
                  isMachineryBrand ? "max-w-[178px]" : "max-w-[198px]",
                )}
              />
            </Link>
            <nav className="hidden flex-1 items-center justify-center gap-1 xl:flex">
              {NAVIGATION.map((item) => {
                const Icon = item.icon;
                const active = activeKey === item.key;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition 2xl:gap-2 2xl:px-3 2xl:text-sm",
                      active
                        ? "bg-[#F5A623]/15 text-slate-950 dark:text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white",
                    )}
                  >
                    <Icon className="hidden h-4 w-4 2xl:block" />
                    <span className="whitespace-nowrap">
                      {navLabel(item.key)}
                    </span>
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setLanguage(locale === "fr" ? "en" : "fr")}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
              >
                <Languages className="h-4 w-4" />
                {locale === "fr" ? "EN" : "FR"}
              </button>
              <button
                type="button"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
                aria-label={isDark ? "Use light mode" : "Use dark mode"}
              >
                {isDark ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
              <Link
                href={isAuthenticated ? "/my-factory" : "/login"}
                className="hidden h-9 items-center rounded-lg bg-[#07111F] px-3 text-sm font-semibold text-white hover:bg-[#0A1628] dark:bg-[#F5A623] dark:text-slate-950 sm:inline-flex"
              >
                {isAuthenticated
                  ? locale === "fr"
                    ? "Mon usine"
                    : "My factory"
                  : copy.login}
              </Link>
            </div>
          </div>
          <div className="scrollbar-hide flex gap-1 overflow-x-auto border-t border-slate-900/5 px-3 py-2 xl:hidden dark:border-white/10">
            {NAVIGATION.map((item) => {
              const active = activeKey === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
                    active
                      ? "bg-[#F5A623]/15 text-slate-950 dark:text-white"
                      : "text-slate-600 dark:text-slate-300",
                  )}
                >
                  {navLabel(item.key)}
                </Link>
              );
            })}
            <Link
              href={isAuthenticated ? "/my-factory" : "/login"}
              className="ml-auto shrink-0 rounded-lg bg-[#07111F] px-3 py-1.5 text-sm font-semibold text-white dark:bg-[#F5A623] dark:text-slate-950"
            >
              {isAuthenticated
                ? locale === "fr"
                  ? "Mon usine"
                  : "My factory"
                : copy.account}
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-[1560px] px-4 py-8 lg:px-7 lg:py-10">
          {view === "home" ? (
            <>
              <section className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
                <div className="relative min-h-[520px] overflow-hidden rounded-2xl border border-[#F5A623]/35 bg-[#07111F] px-5 py-6 shadow-[0_28px_64px_rgba(7,17,31,0.2)] sm:px-8 sm:py-9">
                  <img
                    src="/tenants/exportunity/industrial/machinery-team.png"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[72%_center] opacity-45"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,31,0.98)_0%,rgba(7,17,31,0.9)_46%,rgba(7,17,31,0.48)_100%)]" />
                  <div className="relative z-10 flex h-full max-w-3xl flex-col">
                    <p className="text-sm font-semibold text-[#F5A623]">
                      {copy.heroEyebrow}
                    </p>
                    <h1 className="mt-3 max-w-2xl text-[26px] font-semibold leading-tight text-white sm:mt-4 sm:text-4xl">
                      {copy.heroTitle}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:mt-4 sm:text-base sm:leading-7">
                      {copy.heroText}
                    </p>
                    <IndustrialAssistantChat language={locale} requester={user} />
                    <section
                      aria-label={copy.assistantName}
                      className="hidden mt-7 rounded-2xl border border-white/20 bg-[#02070e]/60 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-md"
                    >
                      <div className="flex items-center gap-3 px-1 pb-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F5A623] text-[#07111F] shadow-[0_8px_20px_rgba(245,166,35,0.24)]">
                          <Bot className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-white">
                            {copy.assistantName}
                          </span>
                          <span className="block text-xs text-slate-300">
                            {copy.assistantRole}
                          </span>
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-sm leading-6 text-slate-100">
                        {copy.assistantGreeting}
                      </div>
                      <form
                        onSubmit={goSearch}
                        className="mt-3 flex items-center gap-2 rounded-xl border border-white/20 bg-white p-2 shadow-[0_10px_28px_rgba(0,0,0,0.2)]"
                      >
                        <MessageCircle className="ml-1 h-5 w-5 shrink-0 text-[#a96f0b]" />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm text-slate-950 outline-none placeholder:text-slate-400"
                          placeholder={copy.assistantPlaceholder}
                          aria-label={copy.assistantPlaceholder}
                        />
                        <VoiceToTextButton
                          draftText={search}
                          setDraftText={setSearch}
                          appendDraftText={(text) =>
                            setSearch((current) => `${current} ${text}`.trim())
                          }
                          hideHelper
                          helperText={copy.assistantVoice}
                          recordingText={
                            locale === "fr"
                              ? "Touchez pour arrêter l'enregistrement"
                              : "Tap again to stop recording"
                          }
                          unavailableText={
                            locale === "fr"
                              ? "Microphone indisponible"
                              : "Microphone unavailable"
                          }
                        />
                        <button
                          type="submit"
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#F5A623] text-[#07111F] transition hover:bg-[#f9a800] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#07111F] focus-visible:ring-offset-2"
                          aria-label={copy.assistantSend}
                          title={copy.assistantSend}
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </form>
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {assistantQuickReplies.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => {
                              setSearch(prompt);
                              navigate(`/factories?q=${encodeURIComponent(prompt)}`);
                            }}
                            className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:border-[#F5A623]/80 hover:bg-[#F5A623]/15"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-300">
                        {copy.assistantHint}
                      </p>
                    </section>
                    <div className="mt-6 grid gap-x-5 sm:grid-cols-2">
                      {heroNeedActions.map((action) => {
                        const Icon = action.icon;
                        return (
                          <Link
                            key={action.title}
                            href={action.href}
                            className="group flex min-h-20 items-start gap-3 border-t border-white/20 py-4 text-left hover:border-[#F5A623]"
                          >
                            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#F5A623]" />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-white">
                                {action.title}
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-slate-300">
                                {action.detail}
                              </span>
                            </span>
                            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#F5A623]" />
                          </Link>
                        );
                      })}
                    </div>
                    <p className="mt-auto flex items-center gap-2 pt-5 text-sm text-slate-200">
                      <Paperclip className="h-4 w-4 shrink-0 text-[#F5A623]" />
                      {locale === "fr"
                        ? "Vous pouvez joindre une photo, une référence, un dessin ou un fichier CAD."
                        : "You can attach a photo, reference, drawing, or CAD file."}
                    </p>
                  </div>
                </div>
                <div className="relative min-h-[520px]">
                  <IndustrialMap
                    factories={factories}
                    selectedFactory={selectedFactory}
                    onSelectFactory={setSelectedFactory}
                    selectedContext={selectedIndustrialContext}
                    onSelectContext={(context) => {
                      setSelectedFactory(null);
                      setSelectedIndustrialContext(context);
                    }}
                    isDark={isDark}
                    language={locale}
                    className="absolute inset-0 min-h-[520px] shadow-[0_24px_64px_rgba(7,17,31,0.18)]"
                  />
                  <div className="absolute left-4 top-4 max-w-[245px] rounded-xl border border-white/60 bg-white/90 p-4 shadow-lg backdrop-blur dark:border-white/15 dark:bg-[#07111F]/90">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a96f0b]">
                      {copy.verifiedMap}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-slate-700 dark:text-slate-200">
                      {copy.mapDetail}
                    </p>
                    <Link
                      href="/map"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#865400] hover:text-[#6f4300] dark:text-[#F5A623] dark:hover:text-[#f9b54b]"
                    >
                      {copy.openMap}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  {selectedFactory ? (
                    <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-white/70 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-white/15 dark:bg-[#07111F]/95">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-950 dark:text-white">
                            {selectedFactory.name}
                          </p>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            {selectedFactory.industry} •{" "}
                            {[selectedFactory.city, selectedFactory.countryCode]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        </div>
                        <Link
                          href={`/factories/${selectedFactory.id}`}
                          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#a96f0b]"
                        >
                          {locale === "fr" ? "Ouvrir l'usine" : "Open factory"}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ) : selectedIndustrialContext ? (
                    <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-[#F5A623]/40 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-[#F5A623]/35 dark:bg-[#07111F]/95">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#865400] dark:text-[#F5A623]">
                        {industrialContextText(
                          selectedIndustrialContext.eyebrow,
                          locale,
                        )}
                      </p>
                      <div className="mt-2 flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-950 dark:text-white">
                            {industrialContextText(
                              selectedIndustrialContext.name,
                              locale,
                            )}
                          </p>
                          <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
                            {industrialContextText(
                              selectedIndustrialContext.summary,
                              locale,
                            )}
                          </p>
                        </div>
                        <a
                          href={selectedIndustrialContext.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#865400] dark:text-[#F5A623]"
                        >
                          {locale === "fr" ? "Source" : "Source"}
                          <ArrowRight className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
              <section className="mt-9 border-y border-slate-200 py-6 dark:border-white/10">
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {locale === "fr"
                    ? "Un parcours industriel contrôlé"
                    : "A controlled industrial workflow"}
                </p>
                <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {industrialNeedFlow.map((step) => (
                    <div
                      key={step.title}
                      className="min-w-0 xl:border-l xl:border-slate-200 xl:pl-5 first:xl:border-l-0 first:xl:pl-0 dark:xl:border-white/10"
                    >
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">
                        {step.title}
                      </p>
                      <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {step.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="mt-14 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
                <div>
                  <SectionHeading
                    eyebrow={copy.verifiedOnly}
                    title={copy.categoryTitle}
                    detail={copy.howItWorks}
                  />
                  <Link
                    href="/factories/register"
                    className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#a96f0b]"
                  >
                    {locale === "fr"
                      ? "Enregistrer une usine"
                      : "Register a factory"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {taxonomy.slice(0, 6).map((category) => (
                    <Link
                      key={category.code}
                      href={categoryRoute(category)}
                      className="rounded-xl border border-slate-200 bg-white p-4 hover:border-[#F5A623]/50 dark:border-white/10 dark:bg-slate-900"
                    >
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">
                        {category.label[locale]}
                      </p>
                      <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">
                        {category.description[locale]}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <>
              {view !== "map" &&
              view !== "factoryProfile" &&
              view !== "factoryWorkspace" ? (
                <SectionHeading {...titleByView[view]} />
              ) : null}
              {view !== "map" &&
              view !== "quote" &&
              view !== "register" &&
              view !== "claim" &&
              view !== "factoryProfile" &&
              view !== "factoryWorkspace" ? (
                <form
                  onSubmit={goSearch}
                  className="mt-6 flex max-w-3xl rounded-xl border border-slate-300 bg-white p-1.5 dark:border-white/15 dark:bg-slate-900"
                >
                  <Search className="my-2 ml-2 h-5 w-5 text-[#a96f0b]" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-slate-400 dark:text-white"
                    placeholder={copy.searchPlaceholder}
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[#F5A623] px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    {copy.search}
                  </button>
                </form>
              ) : null}
              {directoryError ? (
                <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100">
                  {directoryError}
                </div>
              ) : null}
              {view === "map" ? (
                <section className="-mt-2">
                  <div className="relative">
                    <IndustrialMap
                      factories={filteredFactories}
                      selectedFactory={selectedFactory}
                      onSelectFactory={setSelectedFactory}
                      selectedContext={selectedIndustrialContext}
                      onSelectContext={(context) => {
                        setSelectedFactory(null);
                        setSelectedIndustrialContext(context);
                      }}
                      isDark={isDark}
                      language={locale}
                      showEmptyState={false}
                      className="h-[calc(100dvh-8rem)] min-h-[500px] lg:h-[calc(100dvh-7.5rem)]"
                    />
                    <div className="absolute left-4 top-4 z-[600] w-[calc(100%-2rem)] max-w-[420px]">
                      <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_18px_48px_rgba(7,17,31,0.18)] backdrop-blur-xl dark:border-white/15 dark:bg-[#07111F]/95">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a96f0b] dark:text-[#F5A623]">
                          {copy.mapEyebrow}
                        </p>
                        <h1 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                          {copy.mapTitle}
                        </h1>
                        <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {copy.mapDescription}
                        </p>
                        <form
                          onSubmit={goSearch}
                          className="mt-4 flex rounded-xl border border-slate-300 bg-white p-1.5 shadow-sm dark:border-white/15 dark:bg-[#07111F]"
                        >
                          <Search className="my-2 ml-2 h-4 w-4 shrink-0 text-[#a96f0b]" />
                          <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 dark:text-white"
                            placeholder={copy.searchPlaceholder}
                            aria-label={copy.searchPlaceholder}
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-[#F5A623] px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-[#f9a800]"
                          >
                            {copy.search}
                          </button>
                        </form>
                      </div>
                      {factories.length ? (
                        <details className="mt-3 rounded-xl border border-white/70 bg-white/95 shadow-[0_14px_34px_rgba(7,17,31,0.14)] backdrop-blur-xl dark:border-white/15 dark:bg-[#07111F]/95">
                        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 marker:hidden dark:text-white">
                          <span className="flex items-center justify-between gap-3">
                            {locale === "fr"
                              ? "Filtres de la carte"
                              : "Map filters"}
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              {locale === "fr"
                                ? `${filteredFactories.length} visible${filteredFactories.length > 1 ? "s" : ""}`
                                : `${filteredFactories.length} visible`}
                            </span>
                          </span>
                        </summary>
                        <div className="border-t border-slate-200 p-3 dark:border-white/10">
                          <FactoryDirectoryFilters
                            factories={factories}
                            filters={factoryFilters}
                            onChange={setFactoryFilters}
                            language={locale}
                          />
                        </div>
                        </details>
                      ) : null}
                    </div>
                    <FactoryMapContextPanel
                      factories={filteredFactories}
                      selectedFactory={selectedFactory}
                      onSelect={setSelectedFactory}
                      selectedContext={selectedIndustrialContext}
                      onSelectContext={(context) => {
                        setSelectedFactory(null);
                        setSelectedIndustrialContext(context);
                      }}
                      language={locale}
                    />
                  </div>
                </section>
              ) : null}
              {view === "factories" ? (
                <section className="mt-7">
                  {searchQuery ? (
                    <IndustrialSearchSummary
                      query={searchQuery}
                      factoryCount={filteredFactories.length}
                      catalogCount={catalogItems.length}
                      searchContext={searchContext}
                      language={locale}
                    />
                  ) : null}
                  <FactoryDirectoryFilters
                    factories={factories}
                    filters={factoryFilters}
                    onChange={setFactoryFilters}
                    language={locale}
                  />
                  {factories.length ? (
                    <div className="mt-4 max-w-sm">
                      <FactoryDirectoryModeToggle
                        mode={factoryDirectoryMode}
                        onChange={setFactoryDirectoryMode}
                        language={locale}
                      />
                    </div>
                  ) : null}
                  {factoryDirectoryMode === "table" ? (
                    <div className="mt-5">
                      {factoryFiltersActive && !filteredFactories.length ? (
                        <EmptyState
                          title={
                            locale === "fr"
                              ? "Aucune usine vérifiée ne correspond aux filtres"
                              : "No verified factory matches these filters"
                          }
                          detail={
                            locale === "fr"
                              ? "Modifiez ou réinitialisez les filtres pour retrouver les profils publics disponibles."
                              : "Adjust or reset the filters to review available public profiles."
                          }
                        />
                      ) : (
                        <FactoryDirectoryTable
                          factories={filteredFactories}
                          selectedFactory={selectedFactory}
                          onSelect={setSelectedFactory}
                          language={locale}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
                      <IndustrialMap
                        factories={filteredFactories}
                        selectedFactory={selectedFactory}
                        onSelectFactory={setSelectedFactory}
                        selectedContext={selectedIndustrialContext}
                        onSelectContext={(context) => {
                          setSelectedFactory(null);
                          setSelectedIndustrialContext(context);
                        }}
                        isDark={isDark}
                        language={locale}
                        showEmptyState={!factoryFiltersActive}
                        className="h-[500px]"
                      />
                      <div className="min-w-0">
                        {selectedFactory ? (
                          <div className="mb-4 rounded-2xl border border-[#F5A623]/50 bg-[#F5A623]/10 p-5">
                            <StatusPill>
                              {locale === "fr"
                                ? "Usine vérifiée"
                                : "Verified factory"}
                            </StatusPill>
                            <h2 className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
                              {selectedFactory.name}
                            </h2>
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                              {selectedFactory.industry} •{" "}
                              {[
                                selectedFactory.industrialZone,
                                selectedFactory.city,
                                selectedFactory.countryCode,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </p>
                            {selectedFactory.description ? (
                              <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
                                {selectedFactory.description}
                              </p>
                            ) : null}
                            {selectedFactory.website ? (
                              <a
                                className="mt-4 inline-flex text-sm font-semibold text-[#a96f0b]"
                                href={selectedFactory.website}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {locale === "fr" ? "Site web" : "Website"}
                                <ArrowRight className="ml-1 h-4 w-4" />
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                        {factoryFiltersActive && !filteredFactories.length ? (
                          <EmptyState
                            title={
                              locale === "fr"
                                ? "Aucune usine vérifiée ne correspond aux filtres"
                                : "No verified factory matches these filters"
                            }
                            detail={
                              locale === "fr"
                                ? "Modifiez ou réinitialisez les filtres pour retrouver les profils publics disponibles."
                                : "Adjust or reset the filters to review available public profiles."
                            }
                          />
                        ) : (
                          <FactoryList
                            factories={filteredFactories}
                            selectedFactory={selectedFactory}
                            onSelect={setSelectedFactory}
                            language={locale}
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {searchQuery ? (
                    <section className="mt-8 border-t border-slate-200 pt-8 dark:border-white/10">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a96f0b]">
                        {locale === "fr"
                          ? "Résultats techniques"
                          : "Technical results"}
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                        {locale === "fr"
                          ? `Produits, composants et machines liés à « ${searchQuery} »`
                          : `Products, components, and machinery related to “${searchQuery}”`}
                      </h2>
                      <div className="mt-5">
                        <CatalogList
                          items={catalogItems}
                          language={locale}
                          emptyTitle={
                            locale === "fr"
                              ? "Aucun catalogue approuvé ne correspond à cette recherche"
                              : "No approved catalog item matches this search"
                          }
                          emptyDetail={
                            locale === "fr"
                              ? "Essayez une référence, un modèle, une matière, une application ou un terme technique équivalent."
                              : "Try a reference, model, material, application, or equivalent technical term."
                          }
                        />
                      </div>
                    </section>
                  ) : null}
                </section>
              ) : null}
              {view === "products" ? (
                <section className="mt-7">
                  {selectedCategory?.classification ===
                  "export_ready_factory_product" ? (
                    <div className="mb-6">
                      <CategoryFocus
                        category={selectedCategory}
                        language={locale}
                        clearHref="/export-products"
                      />
                    </div>
                  ) : null}
                  <CatalogList
                    items={visibleExportItems}
                    language={locale}
                    emptyTitle={copy.noCatalog}
                    emptyDetail={copy.noCatalogDetail}
                  />
                </section>
              ) : null}
              {view === "supply" ? (
                <section className="mt-7">
                  {selectedCategory &&
                  [
                    "raw_material",
                    "industrial_input",
                    "spare_part",
                    "industrial_service",
                  ].includes(selectedCategory.classification) ? (
                    <div className="mb-6">
                      <CategoryFocus
                        category={selectedCategory}
                        language={locale}
                        clearHref="/industrial-supply"
                      />
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {taxonomy.map((category) => (
                      <Link
                        key={category.code}
                        href={categoryRoute(category)}
                        className={cn(
                          "rounded-2xl border bg-white p-5 transition hover:border-[#F5A623]/50 dark:bg-slate-900",
                          selectedCategory?.code === category.code
                            ? "border-[#F5A623] ring-2 ring-[#F5A623]/15"
                            : "border-slate-200 dark:border-white/10",
                        )}
                      >
                        <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                          {category.label[locale]}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {category.description[locale]}
                        </p>
                        <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                          {category.examples[locale].join(" • ")}
                        </p>
                      </Link>
                    ))}
                  </div>
                  <div className="mt-10">
                    <CatalogList
                      items={visibleSupplyItems}
                      language={locale}
                      emptyTitle={copy.noCatalog}
                      emptyDetail={copy.noCatalogDetail}
                    />
                  </div>
                </section>
              ) : null}
              {view === "machinery" ? (
                <section className="mt-7 space-y-7">
                  {selectedCategory?.classification === "machinery" ? (
                    <CategoryFocus
                      category={selectedCategory}
                      language={locale}
                      clearHref="/machinery"
                    />
                  ) : null}
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_54px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#07111F]">
                    <div className="grid xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
                      <div className="relative overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(245,166,35,0.18),transparent_38%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(245,166,35,0.16),transparent_44%)]" />
                        <div className="relative">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a5f00] dark:text-[#F5A623]">
                            <Wrench className="h-4 w-4" />
                            {locale === "fr"
                              ? "Opération industrialisée"
                              : "Industrial operating model"}
                          </div>
                          <h2 className="mt-5 max-w-2xl text-3xl font-semibold leading-tight text-slate-950 dark:text-white">
                            {locale === "fr"
                              ? "De l'arrêt de ligne à la solution technique"
                              : "From a stopped line to a technical solution"}
                          </h2>
                          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-700 dark:text-slate-200">
                            {locale === "fr"
                              ? "Exportunity Machinery aide à cadrer une machine, une ligne, une pièce, une installation ou une maintenance. Le besoin est documenté, revu puis orienté vers la bonne route avant toute mise en relation."
                              : "Exportunity Machinery helps frame a machine, line, part, installation, or maintenance need. The case is documented, reviewed, and routed through the appropriate path before any introduction."}
                          </p>
                          <div className="mt-5 flex flex-wrap gap-2">
                            {(locale === "fr"
                              ? ["Documenté", "Revu", "Traçable"]
                              : ["Documented", "Reviewed", "Traceable"]
                            ).map((label) => (
                              <span
                                key={label}
                                className="rounded-full border border-[#F5A623]/35 bg-[#F5A623]/10 px-3 py-1 text-xs font-semibold text-[#875300] dark:text-[#F5A623]"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                          <div className="mt-7 flex flex-wrap gap-3">
                            <Link
                              href="/request-quote?type=machinery"
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5A623] px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#f9a800]"
                            >
                              <ClipboardList className="h-4 w-4" />
                              {copy.requestQuote}
                            </Link>
                            <Link
                              href="/request-quote?type=custom_manufacturing"
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-[#F5A623]/60 hover:bg-[#F5A623]/10 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:border-[#F5A623]/70 dark:hover:bg-[#F5A623]/10"
                            >
                              <Settings2 className="h-4 w-4" />
                              {locale === "fr"
                                ? "Créer un dossier technique"
                                : "Create a technical record"}
                            </Link>
                          </div>
                          <div className="mt-6 border-l-2 border-[#F5A623] pl-4">
                            <p className="text-sm font-semibold text-slate-950 dark:text-white">
                              {locale === "fr"
                                ? "Ma ligne de production est arrêtée"
                                : "My production line is stopped"}
                            </p>
                            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                              {locale === "fr"
                                ? "Ouvrez un besoin prioritaire avec la panne, l'équipement et l'impact de production. Aucun fournisseur n'est contacté automatiquement."
                                : "Open a priority case with the fault, equipment, and production impact. No supplier is contacted automatically."}
                            </p>
                            <Link
                              href={machineryEmergencyHref}
                              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#865400] hover:text-[#6f4300] dark:text-[#F5A623] dark:hover:text-[#f9b54b]"
                            >
                              {locale === "fr"
                                ? "Décrire l'arrêt de ligne"
                                : "Describe the line stop"}
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </div>
                        </div>
                      </div>
                      <div className="relative min-h-[280px] overflow-hidden bg-[#07111F] xl:min-h-full">
                        <img
                          src="/tenants/exportunity/industrial/machinery-team.png"
                          alt={
                            locale === "fr"
                              ? "Illustration d'un atelier d'ingénierie industrielle"
                              : "Industrial engineering workshop illustration"
                          }
                          className="absolute inset-0 h-full w-full object-cover object-[64%_center] opacity-90"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,31,0.62),rgba(7,17,31,0.06)_56%,rgba(7,17,31,0.18))]" />
                        <div className="relative flex h-full min-h-[280px] flex-col justify-end p-6 sm:p-7">
                          <div className="max-w-sm border-l-2 border-[#F5A623] pl-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F5A623]">
                              Exportunity Machinery
                            </p>
                            <p className="mt-2 text-base font-semibold leading-6 text-white">
                              {locale === "fr"
                                ? "Une demande réelle devient un dossier technique réutilisable."
                                : "A real requirement becomes a reusable technical record."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-slate-200 px-5 py-5 dark:border-white/10 sm:px-7">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        {locale === "fr"
                          ? "Parcours contrôlé"
                          : "Controlled workflow"}
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {machineryOperatingStages.map((stage) => {
                          const Icon = stage.icon;
                          return (
                            <div
                              key={stage.number}
                              className="border-l border-slate-200 pl-4 first:border-l-0 first:pl-0 dark:border-white/10"
                            >
                              <div className="flex items-center gap-2 text-[#9a5f00] dark:text-[#F5A623]">
                                <span className="text-xs font-semibold tabular-nums">
                                  {stage.number}
                                </span>
                                <Icon className="h-4 w-4" />
                              </div>
                              <h3 className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">
                                {stage.title}
                              </h3>
                              <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                {stage.detail}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                  <section className="border-y border-slate-200 py-6 dark:border-white/10">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a5f00] dark:text-[#F5A623]">
                      {locale === "fr"
                        ? "Axes de qualification"
                        : "Qualification priorities"}
                    </p>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {locale === "fr"
                        ? "Ces familles servent à qualifier et organiser un besoin industriel. Elles ne constituent pas une déclaration de stock ou de capacité publiée."
                        : "These families guide industrial qualification and organization. They are not a declaration of published stock or capacity."}
                    </p>
                    <div className="mt-5 grid gap-4 lg:grid-cols-3">
                      {machineryPriorityAreas.map((area) => (
                        <div
                          key={area.title}
                          className="border-t border-slate-200 pt-4 dark:border-white/10"
                        >
                          <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                            {area.title}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {area.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {machineryActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <Link
                          key={action.title}
                          href={action.href}
                          className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#F5A623]/50 hover:shadow-lg dark:border-white/10 dark:bg-slate-900"
                        >
                          <Icon className="h-5 w-5 text-[#a96f0b]" />
                          <h2 className="mt-4 text-base font-semibold text-slate-950 dark:text-white">
                            {action.title}
                          </h2>
                          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {action.detail}
                          </p>
                          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-800 dark:text-white">
                            {locale === "fr" ? "Ouvrir" : "Open"}
                            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                  <CatalogList
                    items={visibleMachineryItems}
                    language={locale}
                    emptyTitle={copy.noCatalog}
                    emptyDetail={copy.noCatalogDetail}
                  />
                </section>
              ) : null}
              {view === "factoryProfile" ? (
                <section className="mt-1">
                  <FactoryPublicProfilePage
                    factoryId={publicFactoryId}
                    language={locale}
                  />
                </section>
              ) : null}
              {view === "factoryWorkspace" ? (
                <section className="mt-1">
                  <FactoryWorkspacePage language={locale} taxonomy={taxonomy} />
                </section>
              ) : null}
              {view === "quote" ? (
                <section className="mt-7 max-w-4xl">
                  <QuoteForm
                    taxonomy={taxonomy}
                    language={locale}
                    initialType={queryType}
                    initialCategoryCode={queryCategory}
                    initialUrgency={queryUrgency}
                    initialFactoryId={quoteFactoryId}
                    initialTitle={quoteProduct}
                    initialFinancingInterest={
                      queryFinancing === "discussion" ||
                      queryFinancing === "true" ||
                      queryFinancing === "1"
                    }
                  />
                </section>
              ) : null}
              {view === "register" ? (
                <section className="mt-7 max-w-4xl">
                  <FactoryRegistrationForm language={locale} />
                </section>
              ) : null}
              {view === "claim" ? (
                <section className="mt-7 max-w-3xl">
                  <FactoryClaimForm
                    factoryId={claimFactoryId}
                    language={locale}
                  />
                </section>
              ) : null}
            </>
          )}
        </main>
        <footer className="border-t border-slate-900/10 bg-white py-8 dark:border-white/10 dark:bg-[#07111F]">
          <div className="mx-auto flex max-w-[1560px] flex-col gap-3 px-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between lg:px-7 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-white">
              {language === "fr"
                ? "Exportunity aide les usines à produire, s'approvisionner et exporter."
                : "Exportunity helps factories produce, procure, and export."}
            </p>
            <div className="flex items-center gap-4">
              <Link href="/factories/register" className="hover:text-[#a96f0b]">
                {locale === "fr"
                  ? "Enregistrer une usine"
                  : "Register a factory"}
              </Link>
              <Link href="/request-quote" className="hover:text-[#a96f0b]">
                {copy.quote}
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
