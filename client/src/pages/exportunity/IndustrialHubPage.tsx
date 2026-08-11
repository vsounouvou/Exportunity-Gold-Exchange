import {
  Fragment,
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
  CircleMarker,
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
  Anchor,
  ArrowRight,
  Building2,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Factory,
  FileCheck2,
  Gem,
  Globe2,
  GraduationCap,
  Handshake,
  Landmark,
  Languages,
  List,
  LoaderCircle,
  MapPinned,
  Moon,
  PackageSearch,
  Paperclip,
  Plus,
  Search,
  ShoppingCart,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  Wheat,
  Wrench,
} from "lucide-react";

import { useLocale } from "@/contexts/LocaleContext";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  DEFAULT_INDUSTRIAL_TERRITORY_CODE,
  INDUSTRIAL_CONTEXT_LOCATIONS,
  INDUSTRIAL_SECTOR_LENSES,
  INDUSTRIAL_TERRITORIES,
  INDUSTRIAL_TERRITORY_ORDER,
  industrialContextsForTerritory,
  industrialContextText,
  type IndustrialContextLocation,
  type IndustrialTerritory,
  type IndustrialTerritoryCode,
} from "@/components/exportunity/industrialContext";
import { IndustrialAssistantChat } from "@/components/exportunity/IndustrialAssistantChat";
import type {
  IndustrialAssistantContext,
  IndustrialAssistantProductContext,
} from "@/components/exportunity/IndustrialAssistantChat";
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
  localizedName?: { fr?: string; en?: string } | null;
  localizedDescription?: { fr?: string; en?: string } | null;
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
  factoryId?: string | null;
  factoryName: string;
  factoryCity?: string | null;
  factoryCountryCode: string;
  listingKind?:
    | "verified_factory_catalog"
    | "documented_factory_output"
    | "exportunity_sourcing_program";
  sourceUrl?: string | null;
  sourceLabel?: { fr?: string; en?: string } | null;
  inventoryVerified?: boolean;
  requestMode?:
    "availability_request" | "parts_order_request" | "technical_review";
  displayPriority?: number;
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

const INDUSTRIAL_CONTEXT_VISUALS = {
  industrial_zone: { icon: Factory, markerCode: "I" },
  logistics_gateway: { icon: Anchor, markerCode: "L" },
  innovation_hub: { icon: GraduationCap, markerCode: "S" },
  agro_processing_reference: { icon: Wheat, markerCode: "A" },
  commodity_hub: { icon: Gem, markerCode: "M" },
} satisfies Record<
  IndustrialContextLocation["kind"],
  { icon: typeof Factory; markerCode: string }
>;

function industrialContextLayerLabel(
  kind: IndustrialContextLocation["kind"],
  language: "fr" | "en",
) {
  const labels = {
    industrial_zone: language === "fr" ? "Industrie" : "Industry",
    logistics_gateway: language === "fr" ? "Logistique" : "Logistics",
    innovation_hub: language === "fr" ? "Competences" : "Skills",
    agro_processing_reference: language === "fr" ? "Agro" : "Agro",
    commodity_hub: language === "fr" ? "Matieres" : "Commodities",
  } as const;
  return labels[kind];
}

function IndustrialContextIcon({
  context,
  className,
}: {
  context: IndustrialContextLocation;
  className?: string;
}) {
  const Icon = INDUSTRIAL_CONTEXT_VISUALS[context.kind].icon;
  return <Icon className={className} aria-hidden="true" />;
}

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

function catalogRequirementHref(item: CatalogItem, language: "fr" | "en") {
  const params = new URLSearchParams({
    type:
      REQUIREMENT_TYPE_BY_CLASSIFICATION[item.classification] ||
      "industrial_service",
    product: catalogItemName(item, language),
  });
  if (item.factoryId) params.set("factory", item.factoryId);
  if (item.categoryCode) params.set("category", item.categoryCode);
  params.set("catalogItem", item.id);
  params.set("order", item.id);
  return `/request-quote?${params.toString()}`;
}

function catalogItemName(item: CatalogItem, language: "fr" | "en") {
  return item.localizedName?.[language] || item.name;
}

function catalogItemDescription(item: CatalogItem, language: "fr" | "en") {
  return item.localizedDescription?.[language] || item.description || "";
}

function catalogClassificationLabel(
  classification: string,
  language: "fr" | "en",
) {
  const labels: Record<string, { fr: string; en: string }> = {
    export_ready_factory_product: {
      fr: "Produit d'usine",
      en: "Factory output",
    },
    spare_part: { fr: "Piece detachee", en: "Spare part" },
    machinery: { fr: "Equipement", en: "Equipment" },
    industrial_input: { fr: "Outillage et intrant", en: "Tools and inputs" },
    raw_material: { fr: "Matiere premiere", en: "Raw material" },
    industrial_service: { fr: "Service technique", en: "Technical service" },
  };
  return (
    labels[classification]?.[language] || classification.replace(/_/g, " ")
  );
}

function catalogListingLabel(item: CatalogItem, language: "fr" | "en") {
  if (item.listingKind === "documented_factory_output")
    return language === "fr"
      ? "Production documentee"
      : "Documented factory output";
  if (item.listingKind === "exportunity_sourcing_program")
    return language === "fr" ? "Sourcing Exportunity" : "Exportunity sourcing";
  return language === "fr" ? "Catalogue verifie" : "Verified catalog";
}

function catalogActionLabel(item: CatalogItem, language: "fr" | "en") {
  if (item.requestMode === "technical_review")
    return language === "fr" ? "Ouvrir l'etude" : "Open technical review";
  if (item.requestMode === "parts_order_request")
    return language === "fr" ? "Commander la piece" : "Order this part";
  return language === "fr" ? "Commander ce produit" : "Order this product";
}

function assistantProductContext(
  item: CatalogItem,
  language: "fr" | "en",
): IndustrialAssistantProductContext {
  return {
    id: item.id,
    name: catalogItemName(item, language),
    description: catalogItemDescription(item, language),
    imageUrl: item.media?.[0] || null,
    factoryId: item.factoryId || null,
    factoryName: item.factoryName || null,
    factoryLocation: [item.factoryCity, item.factoryCountryCode]
      .filter(Boolean)
      .join(", "),
    categoryCode: item.categoryCode,
    classification: item.classification,
    requirementType:
      REQUIREMENT_TYPE_BY_CLASSIFICATION[item.classification] ||
      "industrial_service",
    unitOfMeasure: item.unitOfMeasure || null,
    minimumOrderQuantity: item.minimumOrderQuantity || null,
    leadTimeText: item.leadTimeText || null,
    reference: item.partNumber || item.productCode || null,
  };
}

function contextCatalogItems(
  context: IndustrialContextLocation | null,
  items: CatalogItem[],
) {
  if (!context) {
    return items.filter(
      (item) =>
        item.listingKind === "documented_factory_output" ||
        item.listingKind === "verified_factory_catalog",
    );
  }

  if (context.id === "gdiz") {
    return items.filter(
      (item) =>
        item.listingKind === "documented_factory_output" &&
        (String(item.factoryCity || "")
          .toLocaleLowerCase("fr")
          .includes("glo-djigbe") ||
          String(item.sourceUrl || "").includes("gdiz-benin.com")),
    );
  }

  if (context.id === "port-cotonou") {
    return items.filter(
      (item) =>
        item.factoryCountryCode === "BJ" &&
        item.classification === "export_ready_factory_product",
    );
  }

  if (context.id === "ketou-agro-processing") {
    return items.filter((item) =>
      ["machinery", "industrial_input", "industrial_service"].includes(
        item.classification,
      ),
    );
  }

  const territoryItems = items.filter(
    (item) =>
      item.factoryCountryCode === context.countryCode ||
      item.listingKind === "exportunity_sourcing_program",
  );

  if (context.kind === "logistics_gateway") {
    return territoryItems.filter((item) =>
      [
        "export_ready_factory_product",
        "raw_material",
        "industrial_service",
      ].includes(item.classification),
    );
  }

  if (context.kind === "commodity_hub") {
    return territoryItems.filter((item) =>
      ["raw_material", "industrial_input", "industrial_service"].includes(
        item.classification,
      ),
    );
  }

  return territoryItems.filter((item) =>
    [
      "export_ready_factory_product",
      "industrial_service",
      "machinery",
      "spare_part",
    ].includes(item.classification),
  );
}

function assistantContextForSelection({
  factory,
  context,
  items,
  language,
  territory,
}: {
  factory: PublicFactory | null;
  context: IndustrialContextLocation | null;
  items: CatalogItem[];
  language: "fr" | "en";
  territory: IndustrialTerritory;
}): IndustrialAssistantContext {
  if (factory) {
    const productCount = items.filter(
      (item) => item.factoryId === factory.id,
    ).length;
    return {
      id: `factory:${factory.id}`,
      title: factory.name,
      role:
        language === "fr"
          ? "Exportunity AI | Assistant de l'usine"
          : "Exportunity AI | Factory assistant",
      intro:
        language === "fr"
          ? productCount
            ? `Vous explorez ${factory.name}. Je peux vous montrer ses ${productCount} produits approuves, verifier une reference et ouvrir une commande industrielle.`
            : `Vous explorez ${factory.name}. Je peux verifier une reference et ouvrir une commande industrielle avec cette usine.`
          : productCount
            ? `You are exploring ${factory.name}. I can show its ${productCount} approved products, verify a reference, and open an industrial order.`
            : `You are exploring ${factory.name}. I can verify a reference and open an industrial order with this factory.`,
      quickReplies:
        language === "fr"
          ? [
              `Que vend ${factory.name} ?`,
              "Verifier la disponibilite",
              "Demarrer une commande",
              "Joindre une photo de piece",
              "Organiser la livraison",
            ]
          : [
              `What does ${factory.name} sell?`,
              "Check availability",
              "Start an order",
              "Attach a part photo",
              "Arrange delivery",
            ],
    };
  }

  if (context?.id === "gdiz") {
    return {
      id: "context:gdiz",
      title: "GDIZ",
      role:
        language === "fr"
          ? "Exportunity AI | Guide industriel"
          : "Exportunity AI | Industrial guide",
      intro:
        language === "fr"
          ? "Vous etes a la GDIZ avec Awa. Je vous montre maintenant les producteurs et produits documentes, puis je peux verifier la disponibilite et ouvrir votre commande."
          : "You are at GDIZ with Awa. I can now show documented producers and products, verify availability, and open your order.",
      quickReplies:
        language === "fr"
          ? [
              "Voir les producteurs de la GDIZ",
              "Commander des produits textiles",
              "Sourcer de l'huile de soja",
              "Trouver des emballages",
              "Verifier une disponibilite",
            ]
          : [
              "Show GDIZ producers",
              "Order textile products",
              "Source soybean oil",
              "Find packaging",
              "Check availability",
            ],
    };
  }

  if (context?.id === "port-cotonou") {
    return {
      id: "context:port-cotonou",
      title: industrialContextText(context.name, language),
      role:
        language === "fr"
          ? "Exportunity AI | Export et logistique"
          : "Exportunity AI | Export and logistics",
      intro:
        language === "fr"
          ? "Vous explorez la passerelle logistique de Cotonou. Je peux relier un produit documente a un besoin d'export, de transit ou de livraison."
          : "You are exploring Cotonou's logistics gateway. I can connect a documented product to an export, transit, or delivery requirement.",
      quickReplies:
        language === "fr"
          ? [
              "Voir les produits prets a exporter",
              "Estimer une livraison",
              "Preparer un dossier export",
              "Trouver un fournisseur",
              "Demander un devis logistique",
            ]
          : [
              "Show export-ready products",
              "Estimate delivery",
              "Prepare an export case",
              "Find a supplier",
              "Request a logistics quote",
            ],
    };
  }

  if (context?.id === "port-abidjan" || context?.id === "jebel-ali-port") {
    const placeName = industrialContextText(context.name, language);
    return {
      id: `context:${context.id}`,
      title: placeName,
      role:
        language === "fr"
          ? "Exportunity AI | Export et logistique"
          : "Exportunity AI | Export and logistics",
      intro:
        language === "fr"
          ? `Vous explorez ${placeName}. Awa peut cadrer le produit, l'incoterm, la destination et les contraintes de transport, puis ouvrir un dossier logistique a confirmer.`
          : `You are exploring ${placeName}. Awa can scope the product, Incoterm, destination, and transport constraints, then open a logistics case for confirmation.`,
      quickReplies:
        language === "fr"
          ? [
              "Preparer une expedition export",
              "Trouver un fournisseur",
              "Sourcer des matieres premieres",
              "Verifier les documents requis",
              "Demander un devis logistique",
            ]
          : [
              "Prepare an export shipment",
              "Find a supplier",
              "Source raw materials",
              "Check required documents",
              "Request a logistics quote",
            ],
    };
  }

  if (context?.id === "dmcc-commodities") {
    return {
      id: "context:dmcc-commodities",
      title: industrialContextText(context.name, language),
      role:
        language === "fr"
          ? "Exportunity AI | Sourcing et conformite"
          : "Exportunity AI | Sourcing and compliance",
      intro:
        language === "fr"
          ? "DMCC est affiche comme ecosysteme public de commerce. Awa peut qualifier votre besoin en matieres premieres ou metaux precieux, puis organiser les controles de contrepartie, d'origine et de conformite avant toute transaction."
          : "DMCC is shown as a public trade ecosystem. Awa can qualify your commodity or precious-metals requirement, then organize counterparty, origin, and compliance checks before any transaction.",
      quickReplies:
        language === "fr"
          ? [
              "Sourcer une matiere premiere",
              "Verifier un fournisseur de metaux",
              "Preparer un dossier d'origine",
              "Organiser une inspection",
              "Ouvrir un besoin confidentiel",
            ]
          : [
              "Source a commodity",
              "Verify a metals supplier",
              "Prepare an origin file",
              "Arrange an inspection",
              "Open a confidential requirement",
            ],
    };
  }

  if (context?.territoryCode === "CI") {
    return {
      id: `context:${context.id}`,
      title: industrialContextText(context.name, language),
      role:
        language === "fr"
          ? "Exportunity AI | Industrie Cote d'Ivoire"
          : "Exportunity AI | Cote d'Ivoire industry",
      intro:
        language === "fr"
          ? `Vous explorez ${industrialContextText(context.name, language)}. Awa peut rechercher des producteurs, produits, pieces et capacites documentees, puis ouvrir un dossier commercial sans inventer de stock.`
          : `You are exploring ${industrialContextText(context.name, language)}. Awa can find documented producers, products, parts, and capabilities, then open a commercial case without inventing stock.`,
      quickReplies:
        language === "fr"
          ? [
              "Trouver un fabricant",
              "Voir les produits exportables",
              "Commander une piece detachee",
              "Sourcer un intrant industriel",
              "Ouvrir une commande",
            ]
          : [
              "Find a manufacturer",
              "Show export-ready products",
              "Order a spare part",
              "Source an industrial input",
              "Open an order",
            ],
    };
  }

  if (context?.territoryCode === "AE") {
    return {
      id: `context:${context.id}`,
      title: industrialContextText(context.name, language),
      role:
        language === "fr"
          ? "Exportunity AI | Sourcing international"
          : "Exportunity AI | International sourcing",
      intro:
        language === "fr"
          ? `Vous explorez ${industrialContextText(context.name, language)}. Awa peut qualifier une recherche de machine, piece, fournisseur ou partenaire logistique et organiser les verifications avant mise en relation.`
          : `You are exploring ${industrialContextText(context.name, language)}. Awa can qualify a machinery, part, supplier, or logistics search and organize verification before an introduction.`,
      quickReplies:
        language === "fr"
          ? [
              "Sourcer une machine",
              "Trouver des pieces industrielles",
              "Comparer des fournisseurs",
              "Organiser une livraison vers l'Afrique",
              "Ouvrir un dossier de sourcing",
            ]
          : [
              "Source machinery",
              "Find industrial parts",
              "Compare suppliers",
              "Arrange delivery to Africa",
              "Open a sourcing case",
            ],
    };
  }

  if (context?.id === "ketou-agro-processing") {
    return {
      id: "context:ketou",
      title: industrialContextText(context.name, language),
      role:
        language === "fr"
          ? "Exportunity AI | Agro-industrie"
          : "Exportunity AI | Agro-industry",
      intro:
        language === "fr"
          ? "Ketou est ici un repere public, pas une usine publiee. Dites-moi la production visee et je peux cadrer la machine, les intrants et les fournisseurs a verifier."
          : "Ketou is a public reference here, not a published factory. Tell me the intended output and I can scope the machinery, inputs, and suppliers to verify.",
      quickReplies:
        language === "fr"
          ? [
              "Ligne de transformation du manioc",
              "Equipement pour le riz",
              "Machine pour le mais",
              "Trouver des pieces de rechange",
              "Ouvrir une etude technique",
            ]
          : [
              "Cassava processing line",
              "Rice processing equipment",
              "Maize processing machinery",
              "Find spare parts",
              "Open a technical review",
            ],
    };
  }

  if (context) {
    return {
      id: `context:${context.id}`,
      title: industrialContextText(context.name, language),
      role:
        language === "fr"
          ? "Exportunity AI | Guide industriel"
          : "Exportunity AI | Industrial guide",
      intro:
        language === "fr"
          ? `Vous explorez ${industrialContextText(context.name, language)}. Dites-moi votre besoin et je vous orienterai vers les produits, capacites ou partenaires a verifier.`
          : `You are exploring ${industrialContextText(context.name, language)}. Tell me your requirement and I will guide you to products, capabilities, or partners to verify.`,
    };
  }

  return {
    id: "industrial-discovery",
    title:
      language === "fr"
        ? "Reseau industriel Exportunity"
        : "Exportunity industrial network",
    role:
      language === "fr"
        ? "Exportunity AI | Guide industriel"
        : "Exportunity AI | Industrial guide",
    intro:
      language === "fr"
        ? `Bonjour, je suis Awa Kouadio, votre interlocutrice commerciale. Vous explorez ${industrialContextText(territory.name, language)}. Dites-moi le produit, la piece, la machine, la matiere premiere ou la route export dont vous avez besoin.`
        : `Hello, I am Awa Kouadio, your commercial lead. You are exploring ${industrialContextText(territory.name, language)}. Tell me which product, part, machine, commodity, or export route you need.`,
    quickReplies:
      territory.code === "AE"
        ? language === "fr"
          ? [
              "Sourcer une machine a Dubai",
              "Trouver des pieces industrielles",
              "Verifier un fournisseur",
              "Sourcer des matieres premieres",
              "Organiser l'export vers l'Afrique",
            ]
          : [
              "Source machinery in Dubai",
              "Find industrial parts",
              "Verify a supplier",
              "Source commodities",
              "Arrange export to Africa",
            ]
        : territory.code === "CI"
          ? language === "fr"
            ? [
                "Trouver un fabricant a Abidjan",
                "Voir les produits exportables",
                "Commander une piece detachee",
                "Sourcer un intrant industriel",
                "Preparer une expedition export",
              ]
            : [
                "Find a manufacturer in Abidjan",
                "Show export-ready products",
                "Order a spare part",
                "Source an industrial input",
                "Prepare an export shipment",
              ]
          : language === "fr"
            ? [
                "Voir les producteurs de la GDIZ",
                "Trouver une piece detachee",
                "Voir les produits exportables",
                "Sourcer une machine",
                "Demarrer une commande",
              ]
            : [
                "Show GDIZ producers",
                "Find a spare part",
                "Show export-ready products",
                "Source a machine",
                "Start an order",
              ],
  };
}

function queryValue(location: string, key: string) {
  const query = location.includes("?")
    ? location.split("?")[1]
    : typeof window !== "undefined"
      ? window.location.search.slice(1)
      : "";
  return new URLSearchParams(query || "").get(key) || "";
}

function isIndustrialTerritoryCode(
  value: string | null | undefined,
): value is IndustrialTerritoryCode {
  return Boolean(value && value in INDUSTRIAL_TERRITORIES);
}

function initialIndustrialTerritoryCode(): IndustrialTerritoryCode {
  if (typeof window === "undefined") return DEFAULT_INDUSTRIAL_TERRITORY_CODE;

  const requested = new URLSearchParams(window.location.search)
    .get("market")
    ?.toUpperCase();
  if (isIndustrialTerritoryCode(requested)) return requested;

  const saved = window.localStorage
    .getItem("exportunity-industrial-territory")
    ?.toUpperCase();
  if (isIndustrialTerritoryCode(saved)) return saved;

  const browserLocale = window.navigator.language.toUpperCase();
  if (browserLocale.endsWith("-AE")) return "AE";
  if (browserLocale.endsWith("-BJ")) return "BJ";
  if (browserLocale.endsWith("-CI")) return "CI";

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timeZone === "Asia/Dubai") return "AE";
  if (timeZone === "Africa/Porto-Novo") return "BJ";
  if (timeZone === "Africa/Abidjan") return "CI";

  return DEFAULT_INDUSTRIAL_TERRITORY_CODE;
}

function IndustrialTerritorySwitcher({
  value,
  onChange,
  language,
  className,
}: {
  value: IndustrialTerritoryCode;
  onChange: (territoryCode: IndustrialTerritoryCode) => void;
  language: "fr" | "en";
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={
        language === "fr" ? "Choisir un marche" : "Choose a market"
      }
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm dark:border-white/15 dark:bg-[#07111F]/95",
        className,
      )}
    >
      <span
        className="hidden h-8 w-8 shrink-0 items-center justify-center text-[#865400] sm:inline-flex dark:text-[#F5A623]"
        title={language === "fr" ? "Marches Exportunity" : "Exportunity markets"}
      >
        <Globe2 className="h-4 w-4" aria-hidden="true" />
      </span>
      {INDUSTRIAL_TERRITORY_ORDER.map((territoryCode) => {
        const territory = INDUSTRIAL_TERRITORIES[territoryCode];
        const active = territoryCode === value;
        return (
          <button
            key={territoryCode}
            type="button"
            aria-pressed={active}
            title={industrialContextText(territory.name, language)}
            onClick={() => onChange(territoryCode)}
            className={cn(
              "min-h-8 min-w-0 flex-1 rounded-md px-2 py-1 text-xs font-semibold transition sm:flex-none sm:px-3",
              active
                ? "bg-[#F5A623] text-[#07111F] shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white",
            )}
          >
            <span className="block truncate">
              {industrialContextText(territory.shortName, language)}
            </span>
          </button>
        );
      })}
    </div>
  );
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

function industrialContextMarkerStyle(kind: IndustrialContextLocation["kind"]) {
  const markerStyles = {
    industrial_zone: {
      background: "#07111F",
      border: "#F5A623",
      color: "#F5A623",
      pulse: "#F5A623",
    },
    logistics_gateway: {
      background: "#FFFFFF",
      border: "#0B1D33",
      color: "#07111F",
      pulse: "#0B1D33",
    },
    innovation_hub: {
      background: "#F5A623",
      border: "#07111F",
      color: "#07111F",
      pulse: "#F5A623",
    },
    agro_processing_reference: {
      background: "#07111F",
      border: "#FFFFFF",
      color: "#FFFFFF",
      pulse: "#FFFFFF",
    },
    commodity_hub: {
      background: "#FFFFFF",
      border: "#F5A623",
      color: "#8A5700",
      pulse: "#F5A623",
    },
  } as const;
  return markerStyles[kind];
}

function mapIndustrialContextIcon(
  context: IndustrialContextLocation,
  active: boolean,
  productCount = 0,
) {
  const style = industrialContextMarkerStyle(context.kind);
  const markerCode = INDUSTRIAL_CONTEXT_VISUALS[context.kind].markerCode;
  const label = `${context.markerLabel}${productCount ? ` · ${productCount}` : ""}`;
  const width = productCount ? (active ? 88 : 80) : active ? 66 : 58;
  return L.divIcon({
    className: "exportunity-industrial-context-marker",
    html: `<span style="display:flex;align-items:center;justify-content:center;gap:6px;min-width:${width}px;height:${active ? 42 : 38}px;padding:0 9px;border-radius:12px;border:2px solid ${style.border};background:${style.background};box-shadow:0 10px 24px rgba(7,17,31,.38);color:${style.color};font-weight:900;font-size:11px;letter-spacing:.08em;transition:all .2s ease"><span style="display:flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:6px;background:${style.color};color:${style.background};font-size:9px;letter-spacing:0">${markerCode}</span><span>${label}</span></span>`,
    iconSize: [width, active ? 42 : 38],
    iconAnchor: [Math.round(width / 2), active ? 21 : 19],
  });
}

function MapViewport({
  factory,
  context,
  territory,
}: {
  factory: PublicFactory | null;
  context: IndustrialContextLocation | null;
  territory: IndustrialTerritory;
}) {
  const map = useMap();
  useEffect(() => {
    if (factory && factory.latitude !== null && factory.longitude !== null) {
      map.flyTo([factory.latitude, factory.longitude], 13, { duration: 0.75 });
      return;
    }
    if (context) {
      map.flyTo([context.latitude, context.longitude], 12, { duration: 0.75 });
      return;
    }
    map.flyTo(territory.mapCenter, territory.mapZoom, { duration: 0.75 });
  }, [context, factory, map, territory]);
  return null;
}

function IndustrialMap({
  territory,
  contexts,
  factories,
  selectedFactory,
  onSelectFactory,
  className,
  isDark,
  language,
  showEmptyState = true,
  selectedContext = null,
  onSelectContext,
  contextProductCounts = {},
}: {
  territory: IndustrialTerritory;
  contexts: IndustrialContextLocation[];
  factories: PublicFactory[];
  selectedFactory: PublicFactory | null;
  onSelectFactory: (factory: PublicFactory) => void;
  className?: string;
  isDark: boolean;
  language: "fr" | "en";
  showEmptyState?: boolean;
  selectedContext?: IndustrialContextLocation | null;
  onSelectContext?: (context: IndustrialContextLocation) => void;
  contextProductCounts?: Record<string, number>;
}) {
  const visibleFactories = factories.filter(
    (factory) => factory.latitude !== null && factory.longitude !== null,
  );
  const routeContexts = (territory.routeContextIds || [])
    .map((contextId) => contexts.find((context) => context.id === contextId))
    .filter((context): context is IndustrialContextLocation => Boolean(context));
  const routePositions =
    routeContexts.length === 2
      ? (routeContexts.map(
          (context) => [context.latitude, context.longitude] as [number, number],
        ) as [[number, number], [number, number]])
      : null;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-900/10 bg-slate-200",
        className,
      )}
    >
      <MapContainer
        center={territory.mapCenter}
        zoom={territory.mapZoom}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
        aria-label={
          language === "fr"
            ? `Carte industrielle - ${industrialContextText(territory.name, language)}`
            : `Industrial map - ${industrialContextText(territory.name, language)}`
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
        <MapViewport
          factory={selectedFactory}
          context={selectedContext}
          territory={territory}
        />
        {routePositions ? (
          <Polyline
            positions={routePositions}
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
                {industrialContextText(territory.routeLabel, language)}
              </span>
              <span className="mt-0.5 block text-xs text-slate-600">
                {language === "fr"
                  ? "Contexte public de chaine logistique, pas un itineraire de transport."
                  : "Public supply-chain context, not a transport route."}
              </span>
            </Tooltip>
          </Polyline>
        ) : null}
        {contexts.map((context) => {
          const active = selectedContext?.id === context.id;
          const style = industrialContextMarkerStyle(context.kind);
          const eventHandlers = onSelectContext
            ? { click: () => onSelectContext(context) }
            : undefined;
          return (
            <Fragment key={context.id}>
              <CircleMarker
                key={`${context.id}-signal`}
                center={[context.latitude, context.longitude]}
                radius={active ? 22 : 16}
                pathOptions={{
                  color: style.border,
                  fillColor: style.pulse,
                  fillOpacity: active ? 0.3 : 0.16,
                  opacity: active ? 0.75 : 0.42,
                  weight: active ? 2 : 1,
                }}
                eventHandlers={eventHandlers}
              />
              <Marker
                key={context.id}
                position={[context.latitude, context.longitude]}
                icon={mapIndustrialContextIcon(
                  context,
                  active,
                  contextProductCounts[context.id] || 0,
                )}
                eventHandlers={eventHandlers}
                zIndexOffset={active ? 900 : 450}
              >
                <Tooltip direction="top" offset={[0, -22]} opacity={1}>
                  <span className="block text-sm font-semibold">
                    {industrialContextText(context.name, language)}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-600">
                    {contextProductCounts[context.id]
                      ? language === "fr"
                        ? `${contextProductCounts[context.id]} produits documentes a explorer`
                        : `${contextProductCounts[context.id]} documented products to explore`
                      : language === "fr"
                        ? "Information publique - pas une usine verifiee"
                        : "Public information - not a verified factory"}
                  </span>
                </Tooltip>
              </Marker>
            </Fragment>
          );
        })}
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
      {showEmptyState &&
      visibleFactories.length === 0 &&
      !selectedFactory &&
      !selectedContext ? (
        <div className="absolute bottom-4 left-4 z-[500] hidden max-w-[326px] rounded-xl border border-white/70 bg-white/95 p-4 shadow-lg backdrop-blur sm:block dark:border-white/15 dark:bg-[#07111F]/95">
          <MapPinned className="h-5 w-5 text-[#a96f0b]" />
          <p className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">
            {language === "fr"
              ? `La carte montre les reperes publics de ${industrialContextText(territory.name, language)}`
              : `The map shows public references in ${industrialContextText(territory.name, language)}`}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {language === "fr"
              ? `${contexts.map((context) => context.markerLabel).join(", ")} sont affiches comme contexte public. Les usines ne sont ajoutees qu'apres verification et autorisation de publication.`
              : `${contexts.map((context) => context.markerLabel).join(", ")} appear as public context. Factories are added only after verification and publication approval.`}
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
              <IndustrialContextIcon
                context={selectedContext}
                className="mt-1 h-5 w-5 shrink-0 text-[#a96f0b] dark:text-[#F5A623]"
              />
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
              {INDUSTRIAL_CONTEXT_LOCATIONS.map((context) => (
                <button
                  key={context.id}
                  type="button"
                  onClick={() => onSelectContext(context)}
                  className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 p-3 text-left transition hover:border-[#F5A623]/60 hover:bg-[#F5A623]/15"
                >
                  <span className="flex items-start gap-2">
                    <IndustrialContextIcon
                      context={context}
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#a96f0b] dark:text-[#F5A623]"
                    />
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#865400] dark:text-[#F5A623]">
                        {industrialContextLayerLabel(context.kind, language)}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-slate-950 dark:text-white">
                        {industrialContextText(context.name, language)}
                      </span>
                    </span>
                  </span>
                  <span className="mt-2 line-clamp-2 block text-xs leading-5 text-slate-600 dark:text-slate-300">
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
                {INDUSTRIAL_SECTOR_LENSES.map((sector) => (
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

function IndustrialSelectionCommerce({
  selectedFactory,
  selectedContext,
  items,
  loading,
  language,
  activeItemId,
  onStartConversation,
}: {
  selectedFactory: PublicFactory | null;
  selectedContext: IndustrialContextLocation | null;
  items: CatalogItem[];
  loading: boolean;
  language: "fr" | "en";
  activeItemId?: string | null;
  onStartConversation?: (item: CatalogItem) => void;
}) {
  const producers = Array.from(
    new Set(items.map((item) => item.factoryName).filter(Boolean)),
  );
  const title = selectedFactory
    ? selectedFactory.name
    : selectedContext
      ? industrialContextText(selectedContext.name, language)
      : language === "fr"
        ? "Producteurs et produits documentes"
        : "Documented producers and products";
  const detail = selectedFactory
    ? language === "fr"
      ? "Les produits approuves de cette usine apparaissent ici. La commande confirme ensuite quantite, prix, delai et paiement."
      : "This factory's approved products appear here. The order then confirms quantity, price, lead time, and payment."
    : selectedContext?.id === "gdiz"
      ? language === "fr"
        ? "Productions citees par des sources officielles GDIZ. Exportunity confirme la disponibilite, le prix et l'usine responsable avant commande."
        : "Production documented by official GDIZ sources. Exportunity confirms availability, price, and the responsible factory before an order."
      : selectedContext
        ? language === "fr"
          ? "Ce repere donne le contexte industriel. Les offres ci-dessous sont des pistes documentees ou des services de sourcing a verifier avec Awa."
          : "This reference provides industrial context. The offerings below are documented leads or sourcing services to verify with Awa."
        : language === "fr"
          ? "Selectionnez GDIZ ou une usine publiee pour voir directement ce qu'elle produit."
          : "Select GDIZ or a published factory to see what it produces.";

  return (
    <section
      data-testid="industrial-selection-commerce"
      className="mt-5 border-t border-slate-200 pt-6 dark:border-white/10"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#946000] dark:text-[#F5A623]">
            {selectedFactory
              ? language === "fr"
                ? "Entrer dans l'usine"
                : "Enter the factory"
              : language === "fr"
                ? "Acheter et s'approvisionner"
                : "Buy and source"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {detail}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-[#0A1628] dark:text-slate-200">
            <Factory className="h-3.5 w-3.5 text-[#a96f0b]" />
            {producers.length} {language === "fr" ? "producteurs" : "producers"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-[#0A1628] dark:text-slate-200">
            <PackageSearch className="h-3.5 w-3.5 text-[#a96f0b]" />
            {items.length} {language === "fr" ? "produits" : "products"}
          </span>
        </div>
      </div>

      {producers.length ? (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {producers.map((producer) => (
            <span
              key={producer}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#F5A623]/30 bg-[#F5A623]/10 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-[#f8d28a]"
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              {producer}
            </span>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-5 flex min-h-28 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 dark:border-white/10 dark:bg-[#0A1628] dark:text-slate-300">
          <LoaderCircle className="h-4 w-4 animate-spin text-[#a96f0b]" />
          {language === "fr"
            ? "Awa charge les offres industrielles..."
            : "Awa is loading industrial offerings..."}
        </div>
      ) : items.length ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {items.slice(0, 9).map((item) => (
            <article
              key={item.id}
              className={cn(
                "group flex min-w-0 overflow-hidden rounded-xl border bg-white shadow-[0_10px_26px_rgba(15,23,42,0.07)] transition hover:border-[#F5A623]/70 hover:shadow-[0_16px_34px_rgba(15,23,42,0.11)] dark:bg-[#0A1628]",
                activeItemId === item.id
                  ? "border-[#F5A623] ring-2 ring-[#F5A623]/20 dark:border-[#F5A623]"
                  : "border-slate-200 dark:border-white/10",
              )}
            >
              <div className="h-auto w-24 shrink-0 bg-[#07111F] sm:w-28">
                {item.media?.[0] ? (
                  <img
                    src={item.media[0]}
                    alt={catalogItemName(item, language)}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full min-h-32 place-items-center">
                    <PackageSearch className="h-8 w-8 text-[#F5A623]" />
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col p-3.5">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.11em] text-[#946000] dark:text-[#F5A623]">
                  {item.factoryName}
                </p>
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
                  {catalogItemName(item, language)}
                </h3>
                <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {catalogItemDescription(item, language)}
                </p>
                <div className="mt-auto flex items-center gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      onStartConversation
                        ? onStartConversation(item)
                        : undefined
                    }
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-[#F5A623] px-2.5 py-1.5 text-xs font-semibold text-[#07111F] hover:bg-[#f9a800]"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    {catalogActionLabel(item, language)}
                  </button>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={
                        language === "fr"
                          ? `Source de ${catalogItemName(item, language)}`
                          : `Source for ${catalogItemName(item, language)}`
                      }
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:border-[#F5A623]/60 hover:text-[#865400] dark:border-white/10 dark:text-slate-300"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-5 dark:border-white/15 dark:bg-[#0A1628]">
          <p className="text-sm font-semibold text-slate-950 dark:text-white">
            {language === "fr"
              ? "Aucun stock public n'est affirme ici"
              : "No public stock is claimed here"}
          </p>
          <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {language === "fr"
              ? "Awa peut ouvrir un dossier de sourcing ou de fabrication a partir de votre produit, photo, plan ou reference."
              : "Awa can open a sourcing or manufacturing case from your product, photo, drawing, or reference."}
          </p>
          <Link
            href="/request-quote"
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#F5A623] px-3.5 py-2 text-sm font-semibold text-[#07111F]"
          >
            <ClipboardList className="h-4 w-4" />
            {language === "fr" ? "Demarrer une commande" : "Start an order"}
          </Link>
        </div>
      )}

      <div className="mt-5 grid gap-2 border-t border-slate-200 pt-4 text-xs text-slate-600 sm:grid-cols-4 dark:border-white/10 dark:text-slate-300">
        {(language === "fr"
          ? [
              "1. Produit et quantite",
              "2. Disponibilite et prix",
              "3. Confirmation de commande",
              "4. Paiement securise",
            ]
          : [
              "1. Product and quantity",
              "2. Availability and price",
              "3. Order confirmation",
              "4. Secure payment",
            ]
        ).map((step) => (
          <span
            key={step}
            className="rounded-lg bg-slate-100 px-3 py-2 font-medium dark:bg-white/5"
          >
            {step}
          </span>
        ))}
      </div>
    </section>
  );
}

function CatalogList({
  items,
  language,
  emptyTitle,
  emptyDetail,
  loading = false,
  activeItemId,
  onStartConversation,
  compact = false,
}: {
  items: CatalogItem[];
  language: "fr" | "en";
  emptyTitle: string;
  emptyDetail: string;
  loading?: boolean;
  activeItemId?: string | null;
  onStartConversation?: (item: CatalogItem) => void;
  compact?: boolean;
}) {
  if (loading)
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-32 items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-8 text-sm font-medium text-slate-700 shadow-[0_10px_28px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-[#0A1628] dark:text-slate-200"
      >
        <LoaderCircle className="h-5 w-5 animate-spin text-[#a96f0b] dark:text-[#F5A623]" />
        {language === "fr"
          ? "Chargement des offres industrielles documentees..."
          : "Loading documented industrial offerings..."}
      </div>
    );
  if (!items.length)
    return <EmptyState title={emptyTitle} detail={emptyDetail} />;
  return (
    <div
      className={cn(
        "grid gap-4 md:grid-cols-2",
        compact ? "xl:grid-cols-2" : "xl:grid-cols-3",
      )}
    >
      {items.map((item) => (
        <article
          key={item.id}
          className={cn(
            "group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-[#F5A623]/65 hover:shadow-[0_18px_38px_rgba(15,23,42,0.12)] dark:bg-[#0A1628]",
            activeItemId === item.id
              ? "border-[#F5A623] ring-2 ring-[#F5A623]/20 dark:border-[#F5A623]"
              : "border-slate-200 dark:border-white/10",
          )}
        >
          <div className="relative aspect-[16/9] overflow-hidden bg-[#07111F]">
            {item.media?.[0] ? (
              <img
                src={item.media[0]}
                alt={catalogItemName(item, language)}
                loading="lazy"
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
              />
            ) : (
              <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_50%_30%,rgba(245,166,35,0.22),transparent_45%),#07111F]">
                <PackageSearch className="h-12 w-12 text-[#F5A623]" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07111F]/75 via-transparent to-transparent" />
            <span className="absolute bottom-3 left-3 rounded-md border border-white/20 bg-[#07111F]/88 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-white backdrop-blur">
              {catalogClassificationLabel(item.classification, language)}
            </span>
          </div>
          <div className="flex flex-1 flex-col p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#946000] dark:text-[#F5A623]">
                  {catalogListingLabel(item, language)}
                </p>
                <h3 className="mt-1.5 text-base font-semibold leading-6 text-slate-950 dark:text-white">
                  {catalogItemName(item, language)}
                </h3>
              </div>
              <StatusPill>
                {language === "fr" ? "Sur demande" : "On request"}
              </StatusPill>
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {catalogItemDescription(item, language) ||
                (language === "fr"
                  ? "Les specifications et la disponibilite sont confirmees apres revue de votre besoin."
                  : "Specifications and availability are confirmed after review of your requirement.")}
            </p>
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/10">
              {item.factoryId ? (
                <Link
                  href={`/factories/${item.factoryId}`}
                  className="text-sm font-semibold text-slate-900 hover:text-[#946000] dark:text-white dark:hover:text-[#F5A623]"
                >
                  {item.factoryName}
                </Link>
              ) : (
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {item.factoryName}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {[item.factoryCity, item.factoryCountryCode]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                {item.partNumber || item.productCode ? (
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                    {language === "fr" ? "Ref." : "Ref."}{" "}
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
                    {language === "fr" ? "Delai" : "Lead time"}:{" "}
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
            </div>
            <div className="mt-auto flex items-center gap-3 pt-4">
              {onStartConversation ? (
                <button
                  type="button"
                  onClick={() => onStartConversation(item)}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#F5A623] px-3 py-2 text-sm font-semibold text-[#07111F] transition hover:bg-[#f9a800]"
                >
                  {catalogActionLabel(item, language)}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <Link
                  href={catalogRequirementHref(item, language)}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#F5A623] px-3 py-2 text-sm font-semibold text-[#07111F] transition hover:bg-[#f9a800]"
                >
                  {catalogActionLabel(item, language)}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              {item.sourceUrl && item.sourceLabel ? (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-[#F5A623] hover:text-[#946000] dark:border-white/15 dark:text-slate-300 dark:hover:text-[#F5A623]"
                  aria-label={item.sourceLabel[language] || "Source"}
                  title={item.sourceLabel[language] || "Source"}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>
            <p className="mt-3 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              {language === "fr"
                ? "Stock, prix et delai confirmes avant engagement."
                : "Stock, price, and lead time are confirmed before commitment."}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

function ConversationalCatalog({
  items,
  language,
  loading,
  emptyTitle,
  emptyDetail,
  requester,
  selectedProduct,
  onStartConversation,
  onCloseConversation,
}: {
  items: CatalogItem[];
  language: "fr" | "en";
  loading: boolean;
  emptyTitle: string;
  emptyDetail: string;
  requester?: { displayName?: string | null; email?: string | null } | null;
  selectedProduct: IndustrialAssistantProductContext | null;
  onStartConversation: (item: CatalogItem) => void;
  onCloseConversation: () => void;
}) {
  return (
    <div
      className={cn(
        "grid items-start gap-5",
        selectedProduct && "xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]",
      )}
    >
      <div className="order-2 min-w-0 xl:order-1">
        <CatalogList
          items={items}
          language={language}
          loading={loading}
          emptyTitle={emptyTitle}
          emptyDetail={emptyDetail}
          activeItemId={selectedProduct?.id || null}
          onStartConversation={onStartConversation}
          compact={Boolean(selectedProduct)}
        />
      </div>
      {selectedProduct ? (
        <aside
          id="industrial-product-conversation"
          className="order-1 min-w-0 scroll-mt-28 xl:order-2 xl:sticky xl:top-28"
        >
          <IndustrialAssistantChat
            language={language}
            requester={requester}
            product={selectedProduct}
            onCloseProduct={onCloseConversation}
            className="!mt-0 shadow-[0_22px_54px_rgba(7,17,31,0.22)]"
          />
          <p className="mt-3 px-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {language === "fr"
              ? "Awa rassemble la quantite, la destination et le delai dans la conversation. La demande devient ensuite un dossier reel suivi par l'equipe commerciale."
              : "Awa gathers quantity, destination, and timing in the conversation. The request then becomes a real case tracked by the commercial team."}
          </p>
        </aside>
      ) : null}
    </div>
  );
}

function FeaturedCatalogSection({
  items,
  language,
  territory,
  activeItemId,
  onStartConversation,
}: {
  items: CatalogItem[];
  language: "fr" | "en";
  territory: IndustrialTerritory;
  activeItemId?: string | null;
  onStartConversation?: (item: CatalogItem) => void;
}) {
  if (!items.length) return null;
  const marketCopy =
    territory.code === "BJ"
      ? {
          detail:
            language === "fr"
              ? "Pieces de rechange, equipements et productions documentees au Benin. Awa confirme le fournisseur, le prix, la disponibilite et le delai avant engagement."
              : "Spare parts, equipment, and documented output in Benin. Awa confirms the supplier, price, availability, and lead time before commitment.",
          catalogueLabel:
            language === "fr" ? "Produits du Benin" : "Products from Benin",
          catalogueHref: "/export-products?market=BJ",
        }
      : territory.code === "CI"
        ? {
            detail:
              language === "fr"
                ? "Pieces, equipements et sourcing industriel pour la Cote d'Ivoire. Les offres affichees sont qualifiees par Awa avant cotation, livraison ou mise en relation."
                : "Parts, equipment, and industrial sourcing for Cote d'Ivoire. Awa qualifies every displayed offer before quotation, delivery, or supplier introduction.",
            catalogueLabel:
              language === "fr"
                ? "Offres pour la Cote d'Ivoire"
                : "Offers for Cote d'Ivoire",
            catalogueHref: "/industrial-supply?market=CI",
          }
        : {
            detail:
              language === "fr"
                ? "Machines, intrants, matieres premieres et routes d'approvisionnement depuis Dubai. Awa verifie chaque fournisseur et chaque condition commerciale avant mise en relation."
                : "Machinery, industrial inputs, commodities, and supply routes from Dubai. Awa verifies each supplier and commercial condition before introduction.",
            catalogueLabel:
              language === "fr"
                ? "Sourcing depuis Dubai"
                : "Sourcing from Dubai",
            catalogueHref: "/industrial-supply?market=AE",
          };
  return (
    <section
      className="mt-8 border-y border-slate-200 py-7 dark:border-white/10"
      aria-labelledby="industrial-featured-products"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#946000] dark:text-[#F5A623]">
            {language === "fr"
              ? "Produits et pieces industrielles"
              : "Industrial products and parts"}
          </p>
          <h2
            id="industrial-featured-products"
            className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white"
          >
            {language === "fr"
              ? "Commencez par ce que votre usine doit acheter"
              : "Start with what your factory needs to buy"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {marketCopy.detail}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/industrial-supply"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-[#F5A623] dark:border-white/15 dark:bg-transparent dark:text-white"
          >
            <Settings2 className="h-4 w-4" />
            {language === "fr" ? "Toutes les pieces" : "All parts"}
          </Link>
          <Link
            href={marketCopy.catalogueHref}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#07111F] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0A1628] dark:bg-[#F5A623] dark:text-[#07111F]"
          >
            <PackageSearch className="h-4 w-4" />
            {marketCopy.catalogueLabel}
          </Link>
        </div>
      </div>
      <div className="scrollbar-hide mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
        {items.map((item) => (
          <article
            key={`featured-${item.id}`}
            className={cn(
              "group flex w-[76vw] max-w-[310px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border bg-white shadow-[0_10px_26px_rgba(15,23,42,0.07)] transition hover:border-[#F5A623]/70 dark:bg-[#0A1628] lg:w-auto lg:max-w-none",
              activeItemId === item.id
                ? "border-[#F5A623] ring-2 ring-[#F5A623]/20 dark:border-[#F5A623]"
                : "border-slate-200 dark:border-white/10",
            )}
          >
            <div className="relative aspect-[16/9] overflow-hidden bg-[#07111F]">
              <img
                src={
                  item.media?.[0] ||
                  "/tenants/exportunity/industrial/machinery-team.png"
                }
                alt={catalogItemName(item, language)}
                loading="lazy"
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07111F]/80 via-transparent to-transparent" />
              <span className="absolute bottom-2.5 left-2.5 rounded-md bg-[#07111F]/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white">
                {catalogClassificationLabel(item.classification, language)}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#946000] dark:text-[#F5A623]">
                {catalogListingLabel(item, language)}
              </p>
              <h3 className="mt-1.5 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
                {catalogItemName(item, language)}
              </h3>
              <p className="mt-1.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                {item.factoryName}
              </p>
              <button
                type="button"
                onClick={() => onStartConversation?.(item)}
                className="mt-3 inline-flex min-h-9 items-center justify-between gap-2 rounded-lg bg-[#F5A623]/14 px-3 py-2 text-xs font-semibold text-[#704600] transition hover:bg-[#F5A623] hover:text-[#07111F] dark:text-[#F5A623] dark:hover:text-[#07111F]"
              >
                {catalogActionLabel(item, language)}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CatalogQuickRail({
  items,
  language,
  territory,
  activeItemId,
  onStartConversation,
}: {
  items: CatalogItem[];
  language: "fr" | "en";
  territory: IndustrialTerritory;
  activeItemId?: string | null;
  onStartConversation?: (item: CatalogItem) => void;
}) {
  const visibleItems = items.slice(0, 6);
  if (!visibleItems.length) return null;
  const title =
    territory.code === "BJ"
      ? language === "fr"
        ? "Pieces, equipements et productions documentees au Benin"
        : "Parts, equipment, and documented output in Benin"
      : territory.code === "CI"
        ? language === "fr"
          ? "Pieces, equipements et sourcing pour la Cote d'Ivoire"
          : "Parts, equipment, and sourcing for Cote d'Ivoire"
        : language === "fr"
          ? "Machines, matieres et sourcing international depuis Dubai"
          : "Machinery, commodities, and international sourcing from Dubai";

  return (
    <section
      className="mb-4 border-b border-slate-200 pb-4 dark:border-white/10"
      aria-labelledby="industrial-quick-products"
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#946000] dark:text-[#F5A623]">
            {language === "fr"
              ? "Acheter pour votre usine"
              : "Buy for your factory"}
          </p>
          <h2
            id="industrial-quick-products"
            className="truncate text-sm font-semibold text-slate-950 dark:text-white"
          >
            {title}
          </h2>
        </div>
        <Link
          href={`/industrial-supply?market=${territory.code}`}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#7f5100] hover:text-[#5e3a00] dark:text-[#F5A623]"
        >
          {language === "fr" ? "Voir le catalogue" : "View catalogue"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="scrollbar-hide flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 xl:grid xl:grid-cols-6 xl:overflow-visible xl:pb-0">
        {visibleItems.map((item) => (
          <button
            type="button"
            key={`quick-${item.id}`}
            onClick={() => onStartConversation?.(item)}
            className={cn(
              "group flex w-[230px] shrink-0 snap-start items-center gap-2.5 rounded-lg border bg-white p-2 text-left shadow-[0_5px_16px_rgba(15,23,42,0.05)] transition hover:border-[#F5A623]/75 hover:shadow-[0_8px_22px_rgba(15,23,42,0.09)] dark:bg-[#0A1628] xl:w-auto",
              activeItemId === item.id
                ? "border-[#F5A623] ring-2 ring-[#F5A623]/20 dark:border-[#F5A623]"
                : "border-slate-200 dark:border-white/10",
            )}
          >
            <img
              src={
                item.media?.[0] ||
                "/tenants/exportunity/industrial/machinery-team.png"
              }
              alt=""
              aria-hidden="true"
              className="h-12 w-14 shrink-0 rounded-md object-cover"
            />
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[#946000] dark:text-[#F5A623]">
                {catalogClassificationLabel(item.classification, language)}
              </span>
              <span className="mt-0.5 block line-clamp-2 text-xs font-semibold leading-4 text-slate-900 group-hover:text-[#704600] dark:text-white dark:group-hover:text-[#F5A623]">
                {catalogItemName(item, language)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
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
  initialCatalogItemId,
  initialFinancingInterest,
}: {
  taxonomy: TaxonomyCategory[];
  language: "fr" | "en";
  initialType: string;
  initialCategoryCode: string;
  initialUrgency: string;
  initialFactoryId: string;
  initialTitle: string;
  initialCatalogItemId: string;
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
            technicalDetails: {
              ...collectTechnicalDetails(form),
              ...(initialCatalogItemId
                ? { catalogItemId: initialCatalogItemId }
                : {}),
              intakeSource: "public_industrial_catalog",
            },
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
  const [selectedTerritoryCode, setSelectedTerritoryCode] =
    useState<IndustrialTerritoryCode>(initialIndustrialTerritoryCode);
  const selectedTerritory = INDUSTRIAL_TERRITORIES[selectedTerritoryCode];
  const territoryContexts = useMemo(
    () => industrialContextsForTerritory(selectedTerritoryCode),
    [selectedTerritoryCode],
  );
  const [factories, setFactories] = useState<PublicFactory[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [searchContext, setSearchContext] =
    useState<IndustrialSearchContext | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyCategory[]>([]);
  const [selectedFactory, setSelectedFactory] = useState<PublicFactory | null>(
    null,
  );
  const [selectedIndustrialContext, setSelectedIndustrialContext] =
    useState<IndustrialContextLocation | null>(null);
  const selectionCommerceRef = useRef<HTMLDivElement | null>(null);
  const [factoryFilters, setFactoryFilters] = useState<FactoryDirectoryFilters>(
    EMPTY_FACTORY_DIRECTORY_FILTERS,
  );
  const [factoryDirectoryMode, setFactoryDirectoryMode] =
    useState<FactoryDirectoryMode>("map");
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [search, setSearch] = useState(queryValue(location, "q"));
  const view = readView(location);
  const activeKey =
    view === "home"
      ? null
      : view === "register" ||
          view === "factoryProfile" ||
          view === "claim" ||
          view === "factoryWorkspace"
        ? "factories"
        : view;
  useEffect(() => {
    if (
      view === "factories" &&
      !selectedFactory &&
      !selectedIndustrialContext
    ) {
      setSelectedIndustrialContext(territoryContexts[0] || null);
    }
  }, [selectedFactory, selectedIndustrialContext, territoryContexts, view]);

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
          heroEyebrow: "Exportunity AI | Awa Kouadio",
          heroTitle:
            "Que devons-nous sourcer, fabriquer ou acheminer pour vous ?",
          heroText:
            "Discutez avec Awa ou joignez une photo, une reference ou un plan. Elle mobilise le reseau Exportunity en Cote d'Ivoire, au Benin et aux Emirats selon votre besoin.",
          searchPlaceholder:
            "Rechercher une usine, un produit, une machine, une matière première ou une pièce",
          search: "Rechercher",
          verifiedMap: `Reseau industriel | ${industrialContextText(selectedTerritory.shortName, locale)}`,
          mapDetail: `${industrialContextText(selectedTerritory.summary, locale)} Les entreprises et offres restent soumises a verification.`,
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
          verifiedFactories: "Usines, producteurs et produits industriels",
          exportProducts: "Produits prêts à l'export",
          industrialSupply: "Approvisionnement industriel",
          machineryTitle: "Exportunity Machinery",
          mapEyebrow: "Reseau industriel multi-marches",
          mapTitle: "Carte industrielle Exportunity",
          mapDescription: `Explorez ${industrialContextText(selectedTerritory.name, locale)}, ses reperes publics et les fabricants verifies autorises a etre publies. Changez de marche entre la Cote d'Ivoire, le Benin et les Emirats.`,
          factoriesDescription:
            "Explorez les producteurs documentés, leurs produits et les profils d'usines vérifiés. Awa confirme ensuite disponibilité, prix et commande.",
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
          heroEyebrow: "Exportunity AI | Awa Kouadio",
          heroTitle: "What do you need to source, manufacture, or move?",
          heroText:
            "Message Awa or attach a photo, reference, or drawing. She mobilizes Exportunity's network in Cote d'Ivoire, Benin, and the UAE according to your requirement.",
          searchPlaceholder:
            "Search a factory, product, machine, raw material, or part number",
          search: "Search",
          verifiedMap: `Industrial network | ${industrialContextText(selectedTerritory.shortName, locale)}`,
          mapDetail: `${industrialContextText(selectedTerritory.summary, locale)} Companies and offerings remain subject to verification.`,
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
          verifiedFactories: "Factories, producers, and industrial products",
          exportProducts: "Export-ready products",
          industrialSupply: "Industrial supply",
          machineryTitle: "Exportunity Machinery",
          mapEyebrow: "Multi-market industrial network",
          mapTitle: "Exportunity industrial map",
          mapDescription: `Explore ${industrialContextText(selectedTerritory.name, locale)}, its public references, and verified manufacturers authorized for publication. Switch between Cote d'Ivoire, Benin, and the UAE.`,
          factoriesDescription:
            "Explore documented producers, their products, and verified factory profiles. Awa then confirms availability, price, and the order.",
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
    window.localStorage.setItem(
      "exportunity-industrial-territory",
      selectedTerritoryCode,
    );
  }, [selectedTerritoryCode]);

  useEffect(() => {
    const requestedTerritory = queryValue(location, "market").toUpperCase();
    if (
      isIndustrialTerritoryCode(requestedTerritory) &&
      requestedTerritory !== selectedTerritoryCode
    ) {
      setSelectedTerritoryCode(requestedTerritory);
      setSelectedFactory(null);
      setSelectedIndustrialContext(null);
    }
  }, [location, selectedTerritoryCode]);

  useEffect(() => {
    if (
      selectedFactory &&
      selectedFactory.countryCode.toUpperCase() !== selectedTerritoryCode
    ) {
      setSelectedFactory(null);
    }
    if (
      selectedIndustrialContext &&
      selectedIndustrialContext.territoryCode !== selectedTerritoryCode
    ) {
      setSelectedIndustrialContext(null);
    }
  }, [selectedFactory, selectedIndustrialContext, selectedTerritoryCode]);

  useEffect(() => {
    setSearch(queryValue(location, "q"));
  }, [location]);

  const searchQuery = queryValue(location, "q");
  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
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
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
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
  const territoryFactories = useMemo(
    () =>
      filteredFactories.filter(
        (factory) =>
          factory.countryCode.toUpperCase() === selectedTerritory.countryCode,
      ),
    [filteredFactories, selectedTerritory.countryCode],
  );

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
  const territoryCatalogItems = useMemo(() => {
    const localItems = catalogItems.filter(
      (item) => item.factoryCountryCode === selectedTerritory.countryCode,
    );
    const sourcingPrograms = catalogItems.filter(
      (item) => item.listingKind === "exportunity_sourcing_program",
    );
    return Array.from(
      new Map(
        [...localItems, ...sourcingPrograms].map((item) => [item.id, item]),
      ).values(),
    );
  }, [catalogItems, selectedTerritory.countryCode]);
  const featuredCatalogItems = useMemo(() => {
    const territorySupply = territoryCatalogItems.filter((item) =>
      [
        "raw_material",
        "industrial_input",
        "spare_part",
        "industrial_service",
      ].includes(item.classification),
    );
    const territoryProducts = territoryCatalogItems.filter(
      (item) => item.classification === "export_ready_factory_product",
    );
    const territoryMachinery = territoryCatalogItems.filter(
      (item) => item.classification === "machinery",
    );
    const spareParts = territorySupply.filter(
      (item) => item.classification === "spare_part",
    );
    const tools = territorySupply.filter(
      (item) => item.classification === "industrial_input",
    );
    const rawMaterials = territorySupply.filter(
      (item) => item.classification === "raw_material",
    );
    const candidates = [
      spareParts[0],
      territoryProducts[0],
      spareParts[1],
      territoryMachinery[0],
      territoryProducts[1],
      spareParts[4],
      tools[0],
      rawMaterials[0],
      territoryProducts[4],
    ].filter((item): item is CatalogItem => Boolean(item));
    return Array.from(
      new Map(candidates.map((item) => [item.id, item])).values(),
    ).slice(0, 8);
  }, [territoryCatalogItems]);
  const selectionCatalogItems = useMemo(() => {
    if (selectedFactory) {
      return catalogItems.filter(
        (item) => item.factoryId === selectedFactory.id,
      );
    }
    return contextCatalogItems(selectedIndustrialContext, catalogItems);
  }, [catalogItems, selectedFactory, selectedIndustrialContext]);
  const contextProductCounts = useMemo(
    () =>
      Object.fromEntries(
        territoryContexts.map((context) => [
          context.id,
          contextCatalogItems(context, catalogItems).length,
        ]),
      ),
    [catalogItems, territoryContexts],
  );
  const selectionAssistantContext = useMemo(
    () =>
      assistantContextForSelection({
        factory: selectedFactory,
        context: selectedIndustrialContext,
        items: catalogItems,
        language: locale,
        territory: selectedTerritory,
      }),
    [
      catalogItems,
      locale,
      selectedFactory,
      selectedIndustrialContext,
      selectedTerritory,
    ],
  );
  const scrollToSelectionCommerce = () => {
    window.setTimeout(() => {
      const section = selectionCommerceRef.current;
      if (!section) return;
      const top = section.getBoundingClientRect().top + window.scrollY - 92;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }, 80);
  };
  const revealFactorySelection = () => {
    if (view !== "factories") return;
    scrollToSelectionCommerce();
  };
  const changeIndustrialTerritory = (
    territoryCode: IndustrialTerritoryCode,
  ) => {
    setSelectedTerritoryCode(territoryCode);
    setSelectedFactory(null);
    setSelectedIndustrialContext(
      industrialContextsForTerritory(territoryCode)[0] || null,
    );
  };
  const selectFactoryForCommerce = (factory: PublicFactory) => {
    const factoryTerritoryCode = factory.countryCode.toUpperCase();
    if (isIndustrialTerritoryCode(factoryTerritoryCode)) {
      setSelectedTerritoryCode(factoryTerritoryCode);
    }
    setSelectedIndustrialContext(null);
    setSelectedFactory(factory);
    revealFactorySelection();
  };
  const selectIndustrialContextForCommerce = (
    context: IndustrialContextLocation,
  ) => {
    setSelectedTerritoryCode(context.territoryCode);
    setSelectedFactory(null);
    setSelectedIndustrialContext(context);
    revealFactorySelection();
  };
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
  const orderItemIdFromLocation =
    queryValue(location, "order") ||
    (view === "quote" ? queryValue(location, "catalogItem") : "");
  const [selectedOrderItemId, setSelectedOrderItemId] = useState(
    orderItemIdFromLocation,
  );

  useEffect(() => {
    setSelectedOrderItemId(orderItemIdFromLocation);
  }, [orderItemIdFromLocation]);

  useEffect(() => {
    const syncOrderFromBrowserHistory = () => {
      const browserLocation = `${window.location.pathname}${window.location.search}`;
      setSelectedOrderItemId(
        queryValue(browserLocation, "order") ||
          (readView(browserLocation) === "quote"
            ? queryValue(browserLocation, "catalogItem")
            : ""),
      );
    };
    window.addEventListener("popstate", syncOrderFromBrowserHistory);
    return () =>
      window.removeEventListener("popstate", syncOrderFromBrowserHistory);
  }, []);

  const selectedOrderItem = useMemo(
    () => catalogItems.find((item) => item.id === selectedOrderItemId) || null,
    [catalogItems, selectedOrderItemId],
  );
  const selectedAssistantProduct = useMemo(
    () =>
      selectedOrderItem
        ? assistantProductContext(selectedOrderItem, locale)
        : null,
    [locale, selectedOrderItem],
  );

  const updateOrderConversation = (item: CatalogItem | null) => {
    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    if (item) params.set("order", item.id);
    else params.delete("order");
    const query = params.toString();
    setSelectedOrderItemId(item?.id || "");
    navigate(`${pathname}${query ? `?${query}` : ""}`);
    if (item) {
      window.setTimeout(() => {
        document
          .getElementById("industrial-product-conversation")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  };

  const goSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = search.trim();
    const destination = view === "map" ? "/map" : "/factories";
    navigate(
      trimmed ? `${destination}?q=${encodeURIComponent(trimmed)}` : destination,
    );
  };

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
      eyebrow:
        locale === "fr"
          ? "Exportunity AI | Acheter et sourcer"
          : "Exportunity AI | Buy and source",
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

  const quoteProduct = queryValue(location, "product");
  const quoteAssistantContext: IndustrialAssistantContext = {
    id: "commercial-quote-intake",
    title:
      locale === "fr"
        ? "Commande et devis industriel"
        : "Industrial order and quotation",
    role:
      locale === "fr"
        ? "Directrice commerciale | Relation client"
        : "Commercial Director | Client relationships",
    intro:
      locale === "fr"
        ? `Bonjour, je suis Awa Kouadio, directrice commerciale chez Exportunity.${
            quoteProduct ? ` Vous souhaitez avancer sur ${quoteProduct}.` : ""
          } Je vais qualifier votre besoin, lever les points bloquants et convenir avec vous de la prochaine etape. Que souhaitez-vous acheter ou faire fabriquer ?`
        : `Hello, I am Awa Kouadio, Exportunity's Commercial Director.${
            quoteProduct
              ? ` You would like to move forward with ${quoteProduct}.`
              : ""
          } I will qualify your requirement, resolve blockers, and agree the next step with you. What do you need to buy or manufacture?`,
    quickReplies:
      locale === "fr"
        ? [
            "Commander une piece detachee",
            "Obtenir un devis machine",
            "Faire fabriquer une piece",
            "Sourcer un intrant industriel",
            "Commander un produit d'usine",
          ]
        : [
            "Order a spare part",
            "Get a machinery quote",
            "Manufacture a custom part",
            "Source an industrial input",
            "Order a factory product",
          ],
  };
  const claimFactoryId = factoryClaimId(location);
  const publicFactoryId = factoryProfileId(location);
  const isDark = theme === "dark";
  const navLabel = (key: (typeof NAVIGATION)[number]["key"]) => copy[key];
  const heroTrustSignals = [
    {
      icon: FileCheck2,
      label:
        locale === "fr"
          ? "Photo, plan ou référence"
          : "Photo, drawing, or reference",
    },
    {
      icon: ShieldCheck,
      label:
        locale === "fr" ? "Dossier technique privé" : "Private technical case",
    },
    {
      icon: Handshake,
      label:
        locale === "fr" ? "Contact après validation" : "Contact after approval",
    },
  ];

  return (
    <div className={cn("min-h-screen", isDark && "dark")}>
      <div className="min-h-screen bg-[#F7F8FA] text-slate-950 transition-colors dark:bg-[#05070B] dark:text-white">
        <header className="sticky top-0 z-40 border-b border-slate-900/10 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111F]/90">
          <div className="mx-auto flex min-h-16 max-w-[1560px] items-center gap-4 px-4 lg:px-7">
            <Link
              href="/industrial"
              className="flex h-11 shrink-0 items-center overflow-hidden rounded-lg bg-[#07111F] px-2.5 shadow-[0_8px_20px_rgba(7,17,31,0.16)]"
              aria-label="Exportunity AI"
            >
              <img
                src="/tenants/exportunity/logo.svg"
                alt="Exportunity AI"
                className="h-full w-auto max-w-[194px] object-contain"
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
                    aria-current={active ? "page" : undefined}
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
          <div className="scrollbar-hide flex snap-x snap-mandatory gap-1 overflow-x-auto border-t border-slate-900/5 px-3 py-2 xl:hidden dark:border-white/10">
            {NAVIGATION.map((item) => {
              const Icon = item.icon;
              const active = activeKey === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 snap-start items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
                    active
                      ? "bg-[#F5A623]/15 text-slate-950 dark:text-white"
                      : "text-slate-600 dark:text-slate-300",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
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

        <main className="mx-auto max-w-[1560px] px-4 py-4 sm:py-6 lg:px-7 lg:py-8">
          {view === "home" ? (
            <>
              <CatalogQuickRail
                items={featuredCatalogItems}
                language={locale}
                territory={selectedTerritory}
                activeItemId={selectedOrderItemId || null}
                onStartConversation={updateOrderConversation}
              />
              <section
                data-testid="industrial-home-primary"
                className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)] xl:gap-6"
              >
                <div className="relative min-h-[500px] overflow-hidden rounded-2xl border border-[#F5A623]/35 bg-[#07111F] px-5 py-5 shadow-[0_28px_64px_rgba(7,17,31,0.2)] sm:min-h-[520px] sm:px-8 sm:py-6">
                  <img
                    src="/tenants/exportunity/industrial/machinery-team.png"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[70%_center] opacity-60"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,31,0.98)_0%,rgba(7,17,31,0.88)_50%,rgba(7,17,31,0.3)_100%)]" />
                  <div className="relative z-10 flex h-full max-w-3xl flex-col">
                    <p className="text-sm font-semibold text-[#F5A623]">
                      {selectedAssistantProduct
                        ? locale === "fr"
                          ? "Exportunity | Awa Kouadio"
                          : "Exportunity | Awa Kouadio"
                        : copy.heroEyebrow}
                    </p>
                    <h1 className="mt-3 max-w-2xl text-[26px] font-semibold leading-tight text-white sm:text-3xl">
                      {selectedAssistantProduct
                        ? locale === "fr"
                          ? `Commander ${selectedAssistantProduct.name}`
                          : `Order ${selectedAssistantProduct.name}`
                        : copy.heroTitle}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base sm:leading-6">
                      {selectedAssistantProduct
                        ? locale === "fr"
                          ? "Awa qualifie la quantite, la destination, le delai et vos criteres d'achat, puis cree un dossier commercial reel pour confirmation du prix et de la disponibilite."
                          : "Awa qualifies quantity, destination, timing, and buying criteria, then creates a real commercial case for price and availability confirmation."
                        : copy.heroText}
                    </p>
                    <div
                      id="industrial-product-conversation"
                      className="scroll-mt-28"
                    >
                      <IndustrialAssistantChat
                        language={locale}
                        requester={user}
                        context={selectionAssistantContext}
                        product={selectedAssistantProduct}
                        onCloseProduct={() => updateOrderConversation(null)}
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-4">
                      {heroTrustSignals.map((signal) => {
                        const Icon = signal.icon;
                        return (
                          <div
                            key={signal.label}
                            className="min-w-0 text-center sm:flex sm:items-center sm:gap-2 sm:text-left"
                          >
                            <Icon className="mx-auto h-4 w-4 shrink-0 text-[#F5A623] sm:mx-0" />
                            <span className="mt-1 block text-[10px] font-medium leading-4 text-slate-200 sm:mt-0 sm:text-xs">
                              {signal.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="relative min-h-[520px]">
                  <IndustrialMap
                    territory={selectedTerritory}
                    contexts={territoryContexts}
                    factories={territoryFactories}
                    selectedFactory={selectedFactory}
                    onSelectFactory={selectFactoryForCommerce}
                    selectedContext={selectedIndustrialContext}
                    onSelectContext={selectIndustrialContextForCommerce}
                    isDark={isDark}
                    language={locale}
                    contextProductCounts={contextProductCounts}
                    className="absolute inset-0 min-h-[520px] shadow-[0_24px_64px_rgba(7,17,31,0.18)]"
                  />
                  <div className="absolute left-3 right-3 top-3 z-[600] rounded-xl border border-white/70 bg-white/95 p-2 shadow-[0_16px_38px_rgba(7,17,31,0.18)] backdrop-blur-xl sm:left-4 sm:right-auto sm:top-4 sm:w-[calc(100%-2rem)] sm:max-w-[350px] sm:p-3.5 dark:border-white/15 dark:bg-[#07111F]/95">
                    <IndustrialTerritorySwitcher
                      value={selectedTerritoryCode}
                      onChange={changeIndustrialTerritory}
                      language={locale}
                      className="mb-2 border-slate-200/80 bg-slate-50/90 shadow-none dark:bg-white/[0.04]"
                    />
                    <div className="hidden items-start gap-2.5 sm:flex">
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F5A623]/15 text-[#865400] dark:text-[#F5A623]">
                        <MapPinned className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a96f0b] dark:text-[#F5A623]">
                          {copy.verifiedMap}
                        </p>
                        <p className="mt-1 hidden text-xs leading-5 text-slate-600 sm:block dark:text-slate-300">
                          {copy.mapDetail}
                        </p>
                      </div>
                    </div>
                    <div className="flex snap-x gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mt-3 sm:grid sm:grid-cols-2 sm:gap-2 sm:overflow-visible">
                      {territoryContexts.map((context) => {
                        const active =
                          selectedIndustrialContext?.id === context.id;
                        return (
                          <button
                            key={context.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              selectIndustrialContextForCommerce(context)
                            }
                            className={cn(
                              "w-[88px] shrink-0 snap-start rounded-lg border px-2 py-1.5 text-left transition sm:w-auto sm:p-2",
                              active
                                ? "border-[#F5A623] bg-[#F5A623]/15 shadow-[0_6px_14px_rgba(245,166,35,0.16)]"
                                : "border-slate-200/90 bg-white/70 hover:border-[#F5A623]/65 hover:bg-[#F5A623]/10 dark:border-white/10 dark:bg-white/[0.04]",
                            )}
                          >
                            <span className="flex items-center gap-1.5">
                              <IndustrialContextIcon
                                context={context}
                                className="h-3.5 w-3.5 shrink-0 text-[#865400] dark:text-[#F5A623]"
                              />
                              <span className="truncate text-xs font-bold tracking-[0.08em] text-slate-900 dark:text-white">
                                {context.markerLabel}
                              </span>
                            </span>
                            <span className="mt-1 hidden truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 sm:block dark:text-slate-400">
                              {industrialContextLayerLabel(
                                context.kind,
                                locale,
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <Link
                      href="/map"
                      className="mt-3 hidden items-center gap-1 text-xs font-semibold text-[#865400] hover:text-[#6f4300] sm:inline-flex dark:text-[#F5A623] dark:hover:text-[#f9b54b]"
                    >
                      {copy.openMap}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  {selectedFactory ? (
                    <div className="absolute bottom-4 left-4 right-4 z-[650] rounded-xl border border-white/70 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-white/15 dark:bg-[#07111F]/95">
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
                    <div
                      data-testid="industrial-home-context-card"
                      className="absolute bottom-3 left-3 right-3 z-[650] rounded-xl border border-[#F5A623]/40 bg-white/95 p-3 shadow-xl backdrop-blur sm:bottom-4 sm:left-4 sm:right-4 sm:p-4 dark:border-[#F5A623]/35 dark:bg-[#07111F]/95"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#865400] dark:text-[#F5A623]">
                        {industrialContextText(
                          selectedIndustrialContext.eyebrow,
                          locale,
                        )}
                      </p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-white">
                        {industrialContextText(
                          selectedIndustrialContext.name,
                          locale,
                        )}
                      </p>
                      <p className="mt-1 line-clamp-3 text-sm leading-5 text-slate-600 sm:line-clamp-none dark:text-slate-300">
                        {industrialContextText(
                          selectedIndustrialContext.summary,
                          locale,
                        )}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={scrollToSelectionCommerce}
                          className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-[#F5A623] px-3 py-2 text-sm font-semibold text-[#07111F] transition hover:bg-[#f9a800]"
                        >
                          <PackageSearch className="h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {selectedIndustrialContext.id === "gdiz"
                              ? locale === "fr"
                                ? `Voir ${selectionCatalogItems.length} produits GDIZ`
                                : `View ${selectionCatalogItems.length} GDIZ products`
                              : selectionCatalogItems.length
                                ? locale === "fr"
                                  ? `Voir ${selectionCatalogItems.length} offres liees`
                                  : `View ${selectionCatalogItems.length} related offerings`
                              : locale === "fr"
                                  ? "Sourcer dans cette zone"
                                  : "Source in this area"}
                          </span>
                        </button>
                        <a
                          href={selectedIndustrialContext.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={
                            locale === "fr"
                              ? `Source publique pour ${industrialContextText(selectedIndustrialContext.name, locale)}`
                              : `Public source for ${industrialContextText(selectedIndustrialContext.name, locale)}`
                          }
                          title={
                            locale === "fr"
                              ? "Source publique"
                              : "Public source"
                          }
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-300 bg-white text-[#865400] transition hover:border-[#F5A623] hover:bg-[#F5A623]/10 dark:border-white/15 dark:bg-white/5 dark:text-[#F5A623]"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
              {selectedFactory || selectedIndustrialContext ? (
                <div ref={selectionCommerceRef}>
                  <IndustrialSelectionCommerce
                    selectedFactory={selectedFactory}
                    selectedContext={selectedIndustrialContext}
                    items={selectionCatalogItems}
                    loading={catalogLoading}
                    language={locale}
                    activeItemId={selectedOrderItemId || null}
                    onStartConversation={updateOrderConversation}
                  />
                </div>
              ) : null}
              <FeaturedCatalogSection
                items={featuredCatalogItems}
                language={locale}
                territory={selectedTerritory}
                activeItemId={selectedOrderItemId || null}
                onStartConversation={updateOrderConversation}
              />
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
              view !== "factories" &&
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
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">
                        {industrialContextText(selectedTerritory.name, locale)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {industrialContextText(selectedTerritory.summary, locale)}
                      </p>
                    </div>
                    <IndustrialTerritorySwitcher
                      value={selectedTerritoryCode}
                      onChange={changeIndustrialTerritory}
                      language={locale}
                      className="w-full sm:w-auto"
                    />
                  </div>
                  <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0">
                      <IndustrialMap
                        territory={selectedTerritory}
                        contexts={territoryContexts}
                        factories={territoryFactories}
                        selectedFactory={selectedFactory}
                        onSelectFactory={selectFactoryForCommerce}
                        selectedContext={selectedIndustrialContext}
                        onSelectContext={selectIndustrialContextForCommerce}
                        isDark={isDark}
                        language={locale}
                        contextProductCounts={contextProductCounts}
                        showEmptyState={false}
                        className="h-[58dvh] min-h-[440px] xl:h-[calc(100dvh-7.5rem)] xl:min-h-[620px]"
                      />
                    </div>
                    <aside
                      id="industrial-product-conversation"
                      className="min-w-0 overflow-x-hidden scroll-mt-28 xl:max-h-[calc(100dvh-7.5rem)] xl:overflow-y-auto xl:pr-1"
                    >
                      <IndustrialAssistantChat
                        language={locale}
                        requester={user}
                        context={selectionAssistantContext}
                        product={selectedAssistantProduct}
                        onCloseProduct={() => updateOrderConversation(null)}
                        className="!mt-0 shadow-[0_22px_54px_rgba(7,17,31,0.22)]"
                      />
                      <IndustrialSelectionCommerce
                        selectedFactory={selectedFactory}
                        selectedContext={selectedIndustrialContext}
                        items={selectionCatalogItems}
                        loading={catalogLoading}
                        language={locale}
                        activeItemId={selectedOrderItemId || null}
                        onStartConversation={updateOrderConversation}
                      />
                    </aside>
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
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">
                        {industrialContextText(selectedTerritory.name, locale)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {locale === "fr"
                          ? "Selectionnez un repere pour explorer les produits et ouvrir une conversation commerciale."
                          : "Select a reference to explore products and open a commercial conversation."}
                      </p>
                    </div>
                    <IndustrialTerritorySwitcher
                      value={selectedTerritoryCode}
                      onChange={changeIndustrialTerritory}
                      language={locale}
                      className="w-full sm:w-auto"
                    />
                  </div>
                  <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="order-2 min-w-0 xl:order-1">
                      <IndustrialMap
                        territory={selectedTerritory}
                        contexts={territoryContexts}
                        factories={territoryFactories}
                        selectedFactory={selectedFactory}
                        onSelectFactory={selectFactoryForCommerce}
                        selectedContext={selectedIndustrialContext}
                        onSelectContext={selectIndustrialContextForCommerce}
                        isDark={isDark}
                        language={locale}
                        contextProductCounts={contextProductCounts}
                        showEmptyState={false}
                        className="h-[340px] sm:h-[360px] xl:h-[380px]"
                      />
                      <div ref={selectionCommerceRef}>
                        <IndustrialSelectionCommerce
                          selectedFactory={selectedFactory}
                          selectedContext={selectedIndustrialContext}
                          items={selectionCatalogItems}
                          loading={catalogLoading}
                          language={locale}
                          activeItemId={selectedOrderItemId || null}
                          onStartConversation={updateOrderConversation}
                        />
                      </div>
                    </div>
                    <aside
                      id="industrial-product-conversation"
                      className="order-1 min-w-0 scroll-mt-28 xl:order-2 xl:sticky xl:top-28"
                    >
                      <IndustrialAssistantChat
                        language={locale}
                        requester={user}
                        context={selectionAssistantContext}
                        product={selectedAssistantProduct}
                        onCloseProduct={() => updateOrderConversation(null)}
                        className="!mt-0 shadow-[0_22px_54px_rgba(7,17,31,0.22)]"
                      />
                      <p className="mt-3 px-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {locale === "fr"
                          ? "Awa enregistre un vrai dossier industriel. La disponibilite, le prix et le fournisseur sont verifies avant toute commande ou mise en relation."
                          : "Awa records a real industrial case. Availability, price, and supplier are verified before any order or introduction."}
                      </p>
                    </aside>
                  </div>

                  {factories.length ? (
                    <details className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#0A1628]">
                      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-900 marker:hidden dark:text-white">
                        <span className="flex items-center justify-between gap-3">
                          {locale === "fr"
                            ? "Repertoire des profils d'usines verifies"
                            : "Verified factory profile directory"}
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {factories.length}
                          </span>
                        </span>
                      </summary>
                      <div className="border-t border-slate-200 p-4 dark:border-white/10">
                        <FactoryDirectoryFilters
                          factories={factories}
                          filters={factoryFilters}
                          onChange={setFactoryFilters}
                          language={locale}
                        />
                        <div className="mt-4 max-w-sm">
                          <FactoryDirectoryModeToggle
                            mode={factoryDirectoryMode}
                            onChange={setFactoryDirectoryMode}
                            language={locale}
                          />
                        </div>
                        <div className="mt-5">
                          {factoryFiltersActive && !filteredFactories.length ? (
                            <EmptyState
                              title={
                                locale === "fr"
                                  ? "Aucune usine verifiee ne correspond aux filtres"
                                  : "No verified factory matches these filters"
                              }
                              detail={
                                locale === "fr"
                                  ? "Modifiez ou reinitialisez les filtres pour retrouver les profils publics disponibles."
                                  : "Adjust or reset the filters to review available public profiles."
                              }
                            />
                          ) : factoryDirectoryMode === "table" ? (
                            <FactoryDirectoryTable
                              factories={filteredFactories}
                              selectedFactory={selectedFactory}
                              onSelect={selectFactoryForCommerce}
                              language={locale}
                            />
                          ) : (
                            <FactoryList
                              factories={filteredFactories}
                              selectedFactory={selectedFactory}
                              onSelect={selectFactoryForCommerce}
                              language={locale}
                            />
                          )}
                        </div>
                      </div>
                    </details>
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
                  <ConversationalCatalog
                    items={visibleExportItems}
                    language={locale}
                    loading={catalogLoading}
                    emptyTitle={copy.noCatalog}
                    emptyDetail={copy.noCatalogDetail}
                    requester={user}
                    selectedProduct={selectedAssistantProduct}
                    onStartConversation={(item) =>
                      updateOrderConversation(item)
                    }
                    onCloseConversation={() => updateOrderConversation(null)}
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
                    <ConversationalCatalog
                      items={visibleSupplyItems}
                      language={locale}
                      loading={catalogLoading}
                      emptyTitle={copy.noCatalog}
                      emptyDetail={copy.noCatalogDetail}
                      requester={user}
                      selectedProduct={selectedAssistantProduct}
                      onStartConversation={(item) =>
                        updateOrderConversation(item)
                      }
                      onCloseConversation={() => updateOrderConversation(null)}
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
                  <ConversationalCatalog
                    items={visibleMachineryItems}
                    language={locale}
                    loading={catalogLoading}
                    emptyTitle={copy.noCatalog}
                    emptyDetail={copy.noCatalogDetail}
                    requester={user}
                    selectedProduct={selectedAssistantProduct}
                    onStartConversation={(item) =>
                      updateOrderConversation(item)
                    }
                    onCloseConversation={() => updateOrderConversation(null)}
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
                <section className="mt-7 max-w-5xl">
                  <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <IndustrialAssistantChat
                      mode="commercial"
                      language={locale}
                      requester={user}
                      context={quoteAssistantContext}
                      product={selectedAssistantProduct}
                      onCloseProduct={
                        selectedAssistantProduct
                          ? () => navigate("/request-quote")
                          : undefined
                      }
                      className="!mt-0"
                    />
                    <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-[#0A1628]">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#946000] dark:text-[#F5A623]">
                        {locale === "fr"
                          ? "Awa vous accompagne"
                          : "Awa guides the deal"}
                      </p>
                      <h2 className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
                        {locale === "fr"
                          ? "Une question a la fois"
                          : "One question at a time"}
                      </h2>
                      <ol className="mt-4 space-y-3 text-sm leading-5 text-slate-600 dark:text-slate-300">
                        {(locale === "fr"
                          ? [
                              "Produit, reference ou photo",
                              "Quantite et destination",
                              "Delai et priorite d'achat",
                              "Recapitulatif et confirmation",
                            ]
                          : [
                              "Product, reference, or photo",
                              "Quantity and destination",
                              "Timing and buying priority",
                              "Summary and confirmation",
                            ]
                        ).map((step, index) => (
                          <li key={step} className="flex gap-2.5">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#F5A623]/15 text-xs font-bold text-[#704600] dark:text-[#F5A623]">
                              {index + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="mt-4 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500 dark:border-white/10 dark:text-slate-400">
                        {locale === "fr"
                          ? "Awa ne promet ni stock, ni prix, ni delai non verifies. Votre confirmation cree un vrai dossier commercial suivi dans le Centre des operations."
                          : "Awa does not promise unverified stock, pricing, or lead times. Your confirmation creates a real commercial case tracked in the Operations Center."}
                      </p>
                    </aside>
                  </div>
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
