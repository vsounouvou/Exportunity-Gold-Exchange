import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Anchor,
  ArrowRight,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Factory,
  Gem,
  Globe2,
  GraduationCap,
  Languages,
  LogIn,
  MapPin,
  MessageSquareText,
  Moon,
  PackageSearch,
  Route,
  Ship,
  ShoppingBag,
  Sun,
  Truck,
  Wheat,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "wouter";

import {
  IndustrialAssistantChat,
  type IndustrialAssistantContext,
  type IndustrialAssistantProductContext,
} from "@/components/exportunity/IndustrialAssistantChat";
import {
  INDUSTRIAL_CONTEXT_LOCATIONS,
  industrialContextText,
  type IndustrialContextKind,
  type IndustrialContextLocation,
} from "@/components/exportunity/industrialContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";
type MarketCode = "GLOBAL" | "CI" | "BJ" | "AE" | "OTHER";
type MissionType =
  | "trade"
  | "source"
  | "sell_export"
  | "manage_supply"
  | "market_expansion";

type CatalogItem = {
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
  displayPriority?: number;
};

type CatalogPayload = {
  ok?: boolean;
  items?: CatalogItem[];
};

type Pathway = {
  id: MissionType;
  href: string;
  icon: LucideIcon;
  fr: string;
  en: string;
  detailFr: string;
  detailEn: string;
};

type IndustryLens = {
  id: string;
  icon: LucideIcon;
  fr: string;
  en: string;
  categoryCodes: string[];
  requirementType: string | null;
};

const PATHWAYS: Pathway[] = [
  {
    id: "trade",
    href: "/",
    icon: MessageSquareText,
    fr: "Dites-nous ce qu'il vous faut",
    en: "Tell us what you need",
    detailFr: "Une demande devient un dossier commercial suivi.",
    detailEn: "A requirement becomes a tracked commercial case.",
  },
  {
    id: "source",
    href: "/source",
    icon: PackageSearch,
    fr: "Sourcer",
    en: "Source",
    detailFr: "Produits, services, fournisseurs et logistique.",
    detailEn: "Products, services, suppliers, and logistics.",
  },
  {
    id: "sell_export",
    href: "/sell-export",
    icon: Ship,
    fr: "Vendre et exporter",
    en: "Sell and export",
    detailFr: "Qualifier une offre et preparer son acces au marche.",
    detailEn: "Qualify an offer and prepare market access.",
  },
  {
    id: "manage_supply",
    href: "/manage-supply",
    icon: Boxes,
    fr: "Gerer l'approvisionnement",
    en: "Manage supply",
    detailFr: "Structurer fournisseurs, RFQ, commandes et suivi.",
    detailEn: "Structure suppliers, RFQs, orders, and follow-up.",
  },
  {
    id: "market_expansion",
    href: "/expand",
    icon: Globe2,
    fr: "Entrer sur un marche",
    en: "Enter a market",
    detailFr: "Explorer la demande, les partenaires et les contraintes.",
    detailEn: "Explore demand, partners, and constraints.",
  },
];

const INDUSTRY_LENSES: IndustryLens[] = [
  {
    id: "agriculture",
    icon: Wheat,
    fr: "Agriculture et matieres premieres",
    en: "Agriculture and commodities",
    categoryCodes: ["raw-materials", "industrial-inputs"],
    requirementType: "raw_material",
  },
  {
    id: "food",
    icon: ShoppingBag,
    fr: "Agroalimentaire et produits",
    en: "Food and consumer products",
    categoryCodes: ["export-ready-factory-products"],
    requirementType: "export_quotation",
  },
  {
    id: "machinery",
    icon: Wrench,
    fr: "Machines et equipements",
    en: "Machinery and equipment",
    categoryCodes: ["machinery"],
    requirementType: "machinery",
  },
  {
    id: "manufacturing",
    icon: Factory,
    fr: "Industrie et composants",
    en: "Manufacturing and components",
    categoryCodes: ["spare-parts", "industrial-inputs"],
    requirementType: "spare_part",
  },
  {
    id: "metals",
    icon: Gem,
    fr: "Metaux precieux et mines",
    en: "Precious metals and mining",
    categoryCodes: ["raw-materials", "industrial-services"],
    requirementType: "raw_material",
  },
  {
    id: "mobility",
    icon: Truck,
    fr: "Mobilite et transport",
    en: "Mobility and transport",
    categoryCodes: ["machinery", "industrial-services"],
    requirementType: "industrial_service",
  },
  {
    id: "construction",
    icon: Building2,
    fr: "Construction et materiaux",
    en: "Construction and materials",
    categoryCodes: ["raw-materials", "industrial-inputs", "machinery"],
    requirementType: "industrial_input",
  },
  {
    id: "energy",
    icon: CircleDollarSign,
    fr: "Energie et infrastructures",
    en: "Energy and infrastructure",
    categoryCodes: ["machinery", "industrial-services"],
    requirementType: "industrial_service",
  },
];

const MARKET_OPTIONS: Array<{
  code: MarketCode;
  fr: string;
  en: string;
  detailFr: string;
  detailEn: string;
}> = [
  {
    code: "GLOBAL",
    fr: "Global",
    en: "Global",
    detailFr: "Tous les marches",
    detailEn: "All markets",
  },
  {
    code: "CI",
    fr: "Cote d'Ivoire",
    en: "Cote d'Ivoire",
    detailFr: "Abidjan et corridors",
    detailEn: "Abidjan and corridors",
  },
  {
    code: "BJ",
    fr: "Benin",
    en: "Benin",
    detailFr: "Cotonou, GDIZ et Ketou",
    detailEn: "Cotonou, GDIZ, and Ketou",
  },
  {
    code: "AE",
    fr: "Emirats arabes unis",
    en: "United Arab Emirates",
    detailFr: "Dubai et Jebel Ali",
    detailEn: "Dubai and Jebel Ali",
  },
  {
    code: "OTHER",
    fr: "Autre marche",
    en: "Another market",
    detailFr: "Indiquez votre pays a Awa",
    detailEn: "Tell Awa your market",
  },
];

const MARKET_CENTERS: Record<MarketCode, { center: [number, number]; zoom: number }> = {
  GLOBAL: { center: [13.2, 25], zoom: 3 },
  CI: { center: [5.36, -4.08], zoom: 10 },
  BJ: { center: [6.82, 2.42], zoom: 8 },
  AE: { center: [24.96, 55.09], zoom: 10 },
  OTHER: { center: [13.2, 25], zoom: 3 },
};

const GLOBAL_MARKET_CLUSTERS = (["CI", "BJ", "AE"] as const).map((code) => ({
  code,
  center: MARKET_CENTERS[code].center,
  count: INDUSTRIAL_CONTEXT_LOCATIONS.filter((item) => item.territoryCode === code).length,
}));

const CONTEXT_VISUALS: Record<
  IndustrialContextKind,
  { icon: LucideIcon; code: string; color: string; background: string }
> = {
  industrial_zone: {
    icon: Factory,
    code: "IND",
    color: "#F5A623",
    background: "#07111F",
  },
  logistics_gateway: {
    icon: Anchor,
    code: "PORT",
    color: "#FFFFFF",
    background: "#0B4F6C",
  },
  innovation_hub: {
    icon: GraduationCap,
    code: "SKILL",
    color: "#07111F",
    background: "#F5A623",
  },
  agro_processing_reference: {
    icon: Wheat,
    code: "AGRO",
    color: "#FFFFFF",
    background: "#237A57",
  },
  commodity_hub: {
    icon: Gem,
    code: "TRADE",
    color: "#07111F",
    background: "#F8C45B",
  },
};

const REQUIREMENT_TYPE_BY_CLASSIFICATION: Record<string, string> = {
  machinery: "machinery",
  spare_part: "spare_part",
  industrial_input: "industrial_input",
  raw_material: "raw_material",
  industrial_service: "industrial_service",
  export_ready_factory_product: "export_quotation",
};

function routeMission(pathname: string): MissionType {
  if (pathname.startsWith("/source")) return "source";
  if (pathname.startsWith("/sell-export")) return "sell_export";
  if (pathname.startsWith("/manage-supply")) return "manage_supply";
  if (pathname.startsWith("/expand")) return "market_expansion";
  return "trade";
}

function catalogItemName(item: CatalogItem, language: "fr" | "en") {
  return item.localizedName?.[language] || item.name;
}

function catalogItemDescription(item: CatalogItem, language: "fr" | "en") {
  return item.localizedDescription?.[language] || item.description || "";
}

function catalogSource(item: CatalogItem, language: "fr" | "en") {
  return item.sourceLabel?.[language] || item.factoryName || "Exportunity";
}

function catalogStatus(item: CatalogItem, language: "fr" | "en") {
  if (item.listingKind === "exportunity_sourcing_program") {
    return language === "fr"
      ? "Fournisseur et disponibilite a qualifier"
      : "Supplier and availability to qualify";
  }
  if (item.listingKind === "documented_factory_output") {
    return language === "fr"
      ? "Production documentee, disponibilite a confirmer"
      : "Documented output, availability to confirm";
  }
  return language === "fr"
    ? "Catalogue verifie, disponibilite a confirmer"
    : "Verified catalog, availability to confirm";
}

function classificationLabel(value: string, language: "fr" | "en") {
  const labels: Record<string, { fr: string; en: string }> = {
    export_ready_factory_product: {
      fr: "Produit d'usine",
      en: "Factory output",
    },
    spare_part: { fr: "Piece detachee", en: "Spare part" },
    machinery: { fr: "Machine", en: "Machinery" },
    industrial_input: { fr: "Intrant industriel", en: "Industrial input" },
    raw_material: { fr: "Matiere premiere", en: "Raw material" },
    industrial_service: { fr: "Service", en: "Service" },
  };
  return labels[value]?.[language] || value.replace(/_/g, " ");
}

function catalogIcon(classification: string) {
  if (classification === "machinery") return Wrench;
  if (classification === "spare_part") return Boxes;
  if (classification === "raw_material") return Gem;
  if (classification === "industrial_service") return BriefcaseBusiness;
  if (classification === "export_ready_factory_product") return Factory;
  return PackageSearch;
}

function assistantProduct(
  item: CatalogItem,
  language: "fr" | "en",
): IndustrialAssistantProductContext {
  const sourcingProgram = item.listingKind === "exportunity_sourcing_program";
  return {
    id: item.id,
    name: catalogItemName(item, language),
    description: catalogItemDescription(item, language),
    imageUrl: item.media?.[0] || null,
    factoryId: sourcingProgram ? null : item.factoryId || null,
    factoryName: sourcingProgram
      ? "Exportunity AI Sourcing"
      : item.factoryName || "Exportunity",
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
    territoryCode: ["CI", "BJ", "AE"].includes(item.factoryCountryCode)
      ? item.factoryCountryCode
      : null,
  };
}

function mapMarkerIcon(context: IndustrialContextLocation, active: boolean) {
  const visual = CONTEXT_VISUALS[context.kind];
  if (!active) {
    return L.divIcon({
      className: "exportunity-global-marker",
      html: `<span style="position:relative;display:grid;place-items:center;width:38px;height:38px;border:2px solid rgba(255,255,255,.94);border-radius:9px;background:${visual.background};color:${visual.color};box-shadow:0 10px 24px rgba(7,17,31,.34);font-family:Arial,sans-serif;font-size:8px;font-weight:800;letter-spacing:0"><span>${visual.code}</span><span style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">${context.markerLabel}</span></span>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });
  }
  const width = Math.max(active ? 96 : 86, context.markerLabel.length * 8 + 42);
  return L.divIcon({
    className: "exportunity-global-marker",
    html: `<span style="display:flex;align-items:center;gap:7px;width:${width}px;height:${active ? 42 : 38}px;padding:0 9px;border:2px solid ${active ? "#F5A623" : "rgba(255,255,255,.92)"};border-radius:8px;background:${visual.background};color:${visual.color};box-shadow:0 12px 26px rgba(7,17,31,.32);font-family:Arial,sans-serif;font-size:10px;font-weight:800;letter-spacing:0"><span style="display:grid;place-items:center;width:21px;height:21px;border-radius:5px;background:${visual.color};color:${visual.background};font-size:8px">${visual.code}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${context.markerLabel}</span></span>`,
    iconSize: [width, active ? 42 : 38],
    iconAnchor: [Math.round(width / 2), active ? 21 : 19],
  });
}

function marketClusterIcon(code: "CI" | "BJ" | "AE", count: number) {
  return L.divIcon({
    className: "exportunity-global-market-cluster",
    html: `<span style="position:relative;display:grid;place-items:center;width:34px;height:34px;border:2px solid #F5A623;border-radius:50%;background:#07111F;color:#fff;box-shadow:0 10px 28px rgba(7,17,31,.4);font-family:Arial,sans-serif;font-size:9px;font-weight:800"><span>${code}</span><span style="position:absolute;right:-7px;top:-7px;display:grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border:2px solid #fff;border-radius:999px;background:#F5A623;color:#07111F;font-size:9px">${count}</span></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function GlobalMapViewport({
  market,
  selected,
}: {
  market: MarketCode;
  selected: IndustrialContextLocation | null;
}) {
  const map = useMap();

  useEffect(() => {
    window.setTimeout(() => map.invalidateSize(), 0);
    if (selected) {
      map.flyTo([selected.latitude, selected.longitude], 11, {
        duration: 0.65,
      });
      return;
    }
    const viewport = MARKET_CENTERS[market];
    map.flyTo(viewport.center, viewport.zoom, { duration: 0.65 });
  }, [map, market, selected]);

  return null;
}

function missionContext(
  mission: MissionType,
  language: "fr" | "en",
  market: MarketCode,
  selectedLocation: IndustrialContextLocation | null,
  industry: IndustryLens | null,
): IndustrialAssistantContext {
  const marketLabel = MARKET_OPTIONS.find((item) => item.code === market);
  const territoryCode = ["CI", "BJ", "AE"].includes(market) ? market : null;
  const destinationReplies =
    market === "CI"
      ? ["Abidjan, Cote d'Ivoire", "Port d'Abidjan", "San-Pedro", "Autre destination"]
      : market === "BJ"
        ? ["Cotonou, Benin", "Port de Cotonou", "GDIZ, Glo-Djigbe", "Autre destination"]
        : market === "AE"
          ? ["Dubai, UAE", "Jebel Ali Port", "Abu Dhabi", "Autre destination"]
          : language === "fr"
            ? ["Cote d'Ivoire", "Benin", "Emirats arabes unis", "Autre pays"]
            : ["Cote d'Ivoire", "Benin", "United Arab Emirates", "Another country"];

  if (selectedLocation) {
    const name = industrialContextText(selectedLocation.name, language);
    return {
      id: `global-location-${selectedLocation.id}`,
      title: name,
      role:
        language === "fr"
          ? "Directrice commerciale | Commerce mondial"
          : "Commercial Director | Global trade",
      intro:
        language === "fr"
          ? `Vous explorez ${name}. Il s'agit d'un repere public, pas d'une promesse de stock ni d'un fournisseur approuve. Dites-moi ce que vous voulez acheter, vendre, acheminer ou developper dans ce corridor; je vais ouvrir un dossier commercial verifiable.`
          : `You are exploring ${name}. This is a public reference, not a stock promise or an approved supplier. Tell me what you want to buy, sell, move, or develop in this corridor; I will open a verifiable commercial case.`,
      quickReplies:
        language === "fr"
          ? [
              "Sourcer un produit dans cette zone",
              "Trouver un partenaire logistique",
              "Vendre vers ce marche",
              "Verifier une capacite industrielle",
              "Preparer une mission commerciale",
            ]
          : [
              "Source a product in this area",
              "Find a logistics partner",
              "Sell into this market",
              "Verify industrial capacity",
              "Prepare a commercial mission",
            ],
      requirementType: industry?.requirementType || null,
      destinationReplies,
      territoryCode: selectedLocation.territoryCode,
      tradeIntake: true,
      missionType: mission,
    };
  }

  if (industry) {
    const industryName = language === "fr" ? industry.fr : industry.en;
    return {
      id: `global-industry-${industry.id}-${market}`,
      title: industryName,
      role:
        language === "fr"
          ? "Directrice commerciale | Commerce mondial"
          : "Commercial Director | Global trade",
      intro:
        language === "fr"
          ? `Je vais qualifier votre mission ${industryName.toLocaleLowerCase("fr")}${marketLabel && market !== "GLOBAL" ? ` pour ${marketLabel.fr}` : " a l'echelle internationale"}. Decrivez le produit, le service, la specification ou le resultat attendu.`
          : `I will qualify your ${industryName.toLocaleLowerCase("en")} mission${marketLabel && market !== "GLOBAL" ? ` for ${marketLabel.en}` : " internationally"}. Describe the product, service, specification, or result you need.`,
      quickReplies:
        language === "fr"
          ? [
              "Je cherche un fournisseur",
              "Je veux vendre ou exporter",
              "J'ai une specification technique",
              "Je veux comparer des offres",
              "J'ai besoin d'un partenaire local",
            ]
          : [
              "I need a supplier",
              "I want to sell or export",
              "I have a technical specification",
              "I want to compare offers",
              "I need a local partner",
            ],
      requirementType: industry.requirementType,
      destinationReplies,
      territoryCode,
      tradeIntake: true,
      missionType: mission,
    };
  }

  const copy: Record<
    MissionType,
    { fr: string; en: string; repliesFr: string[]; repliesEn: string[]; requirementType: string | null }
  > = {
    trade: {
      fr: "Bonjour, je suis Awa Kouadio, votre interlocutrice commerciale Exportunity. Dites-moi ce que votre entreprise doit acheter, vendre, approvisionner ou developper; je vais transformer le besoin en dossier commercial suivi.",
      en: "Hello, I am Awa Kouadio, your Exportunity commercial lead. Tell me what your company needs to buy, sell, supply, or develop; I will turn it into a tracked commercial case.",
      repliesFr: [
        "Je cherche un produit ou un fournisseur",
        "Je veux vendre ou exporter",
        "Je veux gerer mes approvisionnements",
        "Je veux entrer sur un nouveau marche",
        "J'ai un besoin logistique",
      ],
      repliesEn: [
        "I need a product or supplier",
        "I want to sell or export",
        "I want to manage supply",
        "I want to enter a new market",
        "I have a logistics requirement",
      ],
      requirementType: null,
    },
    source: {
      fr: "Dites-moi exactement ce que vous devez sourcer. Je vais recueillir la specification, la quantite, l'origine, la destination et les conditions commerciales avant revue interne.",
      en: "Tell me exactly what you need to source. I will capture the specification, quantity, origin, destination, and commercial terms before internal review.",
      repliesFr: [
        "Sourcer une matiere premiere",
        "Trouver une machine",
        "Commander une piece detachee",
        "Comparer des fournisseurs",
        "Organiser le transport",
      ],
      repliesEn: [
        "Source a raw material",
        "Find machinery",
        "Order a spare part",
        "Compare suppliers",
        "Arrange logistics",
      ],
      requirementType: null,
    },
    sell_export: {
      fr: "Decrivez ce que votre entreprise veut vendre ou exporter. Je vais qualifier le produit, la capacite, les preuves, les marches cibles et la prochaine etape commerciale.",
      en: "Describe what your company wants to sell or export. I will qualify the product, capacity, evidence, target markets, and next commercial step.",
      repliesFr: [
        "Exporter un produit alimentaire",
        "Presenter une capacite industrielle",
        "Trouver des acheteurs",
        "Preparer un dossier export",
        "Evaluer un nouveau marche",
      ],
      repliesEn: [
        "Export a food product",
        "Present industrial capacity",
        "Find buyers",
        "Prepare an export file",
        "Assess a new market",
      ],
      requirementType: "export_quotation",
    },
    manage_supply: {
      fr: "Expliquez la chaine d'approvisionnement que vous voulez gerer. Je vais identifier les fournisseurs, approbations, RFQ, commandes, documents et alertes a structurer.",
      en: "Explain the supply chain you want to manage. I will identify the suppliers, approvals, RFQs, orders, documents, and alerts to structure.",
      repliesFr: [
        "Centraliser mes fournisseurs",
        "Lancer une consultation RFQ",
        "Comparer des devis",
        "Suivre une commande",
        "Gerer un risque fournisseur",
      ],
      repliesEn: [
        "Centralize my suppliers",
        "Launch an RFQ",
        "Compare quotations",
        "Track an order",
        "Manage supplier risk",
      ],
      requirementType: "industrial_service",
    },
    market_expansion: {
      fr: "Indiquez le marche cible et l'objectif commercial. Je vais cadrer la demande, les partenaires, la reglementation, les canaux et les risques a etudier.",
      en: "Tell me the target market and commercial objective. I will frame the demand, partners, regulation, channels, and risks to assess.",
      repliesFr: [
        "Entrer en Cote d'Ivoire",
        "Entrer au Benin",
        "Entrer aux Emirats arabes unis",
        "Trouver un partenaire local",
        "Etudier un autre marche",
      ],
      repliesEn: [
        "Enter Cote d'Ivoire",
        "Enter Benin",
        "Enter the United Arab Emirates",
        "Find a local partner",
        "Assess another market",
      ],
      requirementType: "industrial_service",
    },
  };
  const active = copy[mission];
  return {
    id: `global-${mission}-${market}`,
    title:
      language === "fr" ? "Dossier commercial Exportunity" : "Exportunity commercial case",
    role:
      language === "fr"
        ? "Directrice commerciale | Commerce mondial"
        : "Commercial Director | Global trade",
    intro: language === "fr" ? active.fr : active.en,
    quickReplies: language === "fr" ? active.repliesFr : active.repliesEn,
    requirementType: active.requirementType,
    destinationReplies,
    territoryCode,
    tradeIntake: true,
    missionType: mission,
  };
}

function ProductCard({
  item,
  language,
  selected,
  onSelect,
}: {
  item: CatalogItem;
  language: "fr" | "en";
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = catalogIcon(item.classification);
  const image = item.media?.[0];
  return (
    <article
      className={cn(
        "group grid min-w-[250px] grid-cols-[88px_minmax(0,1fr)] overflow-hidden rounded-lg border bg-white shadow-sm transition sm:min-w-0",
        selected
          ? "border-[#F5A623] shadow-[0_14px_34px_rgba(245,166,35,0.2)]"
          : "border-slate-200 hover:border-[#F5A623]/70 hover:shadow-md",
        "dark:bg-[#0A1628] dark:text-white",
      )}
    >
      <div className="relative min-h-[146px] overflow-hidden bg-[#07111F]">
        {image ? (
          <img
            src={image}
            alt={catalogItemName(item, language)}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Icon className="h-8 w-8 text-[#F5A623]" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col p-3">
        <span className="text-[10px] font-bold uppercase text-[#986100] dark:text-[#F8C45B]">
          {classificationLabel(item.classification, language)}
        </span>
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
          {catalogItemName(item, language)}
        </h3>
        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-300">
          {catalogSource(item, language)}
        </p>
        <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
          {catalogStatus(item, language)}
        </p>
        <button
          type="button"
          onClick={onSelect}
          className="mt-auto inline-flex min-h-9 items-center justify-between gap-2 rounded-md bg-[#07111F] px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-[#14243B] dark:bg-[#F5A623] dark:text-[#07111F] dark:hover:bg-[#F8C45B]"
        >
          <span>{language === "fr" ? "Ouvrir avec Awa" : "Open with Awa"}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        </button>
      </div>
    </article>
  );
}

export default function GlobalTradeHomePage() {
  const [location] = useLocation();
  const { language: localeLanguage, setLanguage } = useLocale();
  const { user, isAuthenticated } = useSession();
  const language: "fr" | "en" = localeLanguage === "fr" ? "fr" : "en";
  const mission = routeMission(location.split("?")[0] || "/");
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("exportunity-global-theme") === "dark"
      ? "dark"
      : "light";
  });
  const [market, setMarket] = useState<MarketCode>("GLOBAL");
  const [marketMenuOpen, setMarketMenuOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] =
    useState<IndustrialContextLocation | null>(null);
  const [selectedIndustry, setSelectedIndustry] =
    useState<IndustryLens | null>(null);
  const [selectedProduct, setSelectedProduct] =
    useState<IndustrialAssistantProductContext | null>(null);
  const assistantRef = useRef<HTMLElement | null>(null);

  const catalogQuery = useQuery<CatalogPayload>({
    queryKey: ["/api/industrial/catalog"],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    window.localStorage.setItem("exportunity-global-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.title =
      language === "fr"
        ? "Exportunity | Commerce mondial, sourcing et expansion"
        : "Exportunity | Global trade, sourcing and expansion";
  }, [language]);

  const visibleLocations = useMemo(
    () =>
      market === "GLOBAL" || market === "OTHER"
        ? INDUSTRIAL_CONTEXT_LOCATIONS
        : INDUSTRIAL_CONTEXT_LOCATIONS.filter(
            (item) => item.territoryCode === market,
          ),
    [market],
  );

  const catalogItems = useMemo(() => {
    const items = [...(catalogQuery.data?.items || [])].sort(
      (a, b) => Number(b.displayPriority || 0) - Number(a.displayPriority || 0),
    );
    const marketFiltered =
      market === "GLOBAL" || market === "OTHER"
        ? items
        : items.filter(
            (item) =>
              item.factoryCountryCode === market ||
              item.listingKind === "exportunity_sourcing_program",
          );
    if (!selectedIndustry) return marketFiltered.slice(0, 8);
    const industryFiltered = marketFiltered.filter(
      (item) =>
        selectedIndustry.categoryCodes.includes(item.categoryCode) ||
        REQUIREMENT_TYPE_BY_CLASSIFICATION[item.classification] ===
          selectedIndustry.requirementType,
    );
    return (industryFiltered.length ? industryFiltered : marketFiltered).slice(
      0,
      8,
    );
  }, [catalogQuery.data?.items, market, selectedIndustry]);

  const activeContext = useMemo(
    () =>
      missionContext(
        mission,
        language,
        market,
        selectedLocation,
        selectedIndustry,
      ),
    [language, market, mission, selectedIndustry, selectedLocation],
  );

  const selectedMarket =
    MARKET_OPTIONS.find((item) => item.code === market) || MARKET_OPTIONS[0];

  const selectMarket = (nextMarket: MarketCode) => {
    setMarket(nextMarket);
    setSelectedLocation(null);
    setSelectedProduct(null);
    setMarketMenuOpen(false);
  };

  const selectIndustry = (industry: IndustryLens) => {
    setSelectedIndustry((current) => (current?.id === industry.id ? null : industry));
    setSelectedLocation(null);
    setSelectedProduct(null);
  };

  const openProduct = (item: CatalogItem) => {
    setSelectedProduct(assistantProduct(item, language));
    window.setTimeout(() => {
      if (window.innerWidth < 1024) {
        assistantRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
  };

  const activePathway = PATHWAYS.find((item) => item.id === mission) || PATHWAYS[0];
  const mapRoutes: Array<Array<[number, number]>> = [
    [
      [5.3166667, -4.0166667],
      [6.3574, 2.4304],
    ],
    [
      [6.3574, 2.4304],
      [24.9804578, 55.0598883],
    ],
  ];

  return (
    <div
      className={cn(
        "min-h-screen bg-[#F7F8FA] text-[#111827]",
        theme === "dark" && "dark bg-[#05070B] text-white",
      )}
      data-testid="exportunity-global-trade-home"
      data-market={market}
      data-mission={mission}
    >
      <header className="sticky top-0 z-[1100] border-b border-slate-200 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#05070B]/95">
        <div className="mx-auto flex h-[68px] max-w-[1680px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
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

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex" aria-label="Main navigation">
            {PATHWAYS.slice(1).map((pathway) => (
              <Link
                key={pathway.id}
                href={pathway.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition",
                  mission === pathway.id
                    ? "bg-[#F5A623]/16 text-[#7A4D00] dark:text-[#F8C45B]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white",
                )}
              >
                {language === "fr" ? pathway.fr : pathway.en}
              </Link>
            ))}
            <Link
              href="/marketplace"
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            >
              Marketplace
            </Link>
            <Link
              href="/industrial"
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {language === "fr" ? "Industries" : "Industries"}
            </Link>
            <Link
              href="/trade"
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {language === "fr" ? "Intelligence marchés" : "Trade intelligence"}
            </Link>
            <Link
              href="/producer-exchange"
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {language === "fr" ? "Bourse producteurs" : "Producer exchange"}
            </Link>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMarketMenuOpen((open) => !open)}
                aria-expanded={marketMenuOpen}
                className="inline-flex h-9 max-w-[104px] items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-left text-xs font-semibold text-slate-800 shadow-sm hover:border-[#F5A623] dark:border-white/15 dark:bg-[#0A1628] dark:text-white sm:h-10 sm:max-w-none sm:gap-2 sm:px-3"
              >
                <Globe2 className="h-4 w-4 shrink-0 text-[#B26F00] dark:text-[#F5A623]" />
                <span className="truncate">
                  {language === "fr" ? selectedMarket.fr : selectedMarket.en}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </button>
              {marketMenuOpen ? (
                <div className="absolute right-0 top-12 z-[1200] w-[285px] overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 shadow-[0_18px_48px_rgba(15,23,42,0.2)] dark:border-white/15 dark:bg-[#0A1628]">
                  {MARKET_OPTIONS.map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => selectMarket(option.code)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition",
                        market === option.code
                          ? "bg-[#F5A623]/16 text-slate-950 dark:text-white"
                          : "hover:bg-slate-100 dark:hover:bg-white/10",
                      )}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#07111F] text-[10px] font-bold text-[#F5A623]">
                        {option.code === "GLOBAL" ? "ALL" : option.code}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {language === "fr" ? option.fr : option.en}
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-300">
                          {language === "fr" ? option.detailFr : option.detailEn}
                        </span>
                      </span>
                      {market === option.code ? (
                        <CheckCircle2 className="ml-auto h-4 w-4 text-[#B26F00] dark:text-[#F5A623]" />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setLanguage(language === "fr" ? "en" : "fr")}
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-[#F5A623] hover:text-slate-950 dark:border-white/15 dark:bg-[#0A1628] dark:text-slate-200 dark:hover:text-white sm:h-10 sm:w-10"
              aria-label={language === "fr" ? "Switch to English" : "Passer en francais"}
              title={language === "fr" ? "English" : "Francais"}
            >
              <Languages className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-[#F5A623] hover:text-slate-950 dark:border-white/15 dark:bg-[#0A1628] dark:text-slate-200 dark:hover:text-white sm:h-10 sm:w-10"
              aria-label={theme === "light" ? "Use dark mode" : "Use light mode"}
              title={theme === "light" ? "Dark mode" : "Light mode"}
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <Link
              href={isAuthenticated ? "/ai-team" : "/auth?next=/ai-team"}
              className="hidden h-10 items-center gap-2 rounded-md bg-[#07111F] px-3 text-xs font-semibold text-white transition hover:bg-[#14243B] sm:inline-flex dark:bg-[#F5A623] dark:text-[#07111F] dark:hover:bg-[#F8C45B]"
            >
              <LogIn className="h-4 w-4" />
              {language === "fr" ? "Plateforme" : "Platform"}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_370px] lg:items-start">
        <main
          className="order-1 min-w-0 lg:col-start-1 lg:row-start-1"
          aria-label="Global trade discovery"
        >
          <section className="border-b border-slate-200 pb-4 dark:border-white/10">
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
              <div className="max-w-3xl">
                <p className="text-xs font-bold uppercase text-[#9A6200] dark:text-[#F5A623]">
                  Exportunity global trade network
                </p>
                <h1 className="mt-2 text-2xl font-semibold leading-tight text-[#07111F] dark:text-white sm:text-4xl">
                  Trade. Source. Expand. Operate.
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
                  {language === "fr"
                    ? "Exportunity aide les entreprises a trouver des fournisseurs, atteindre des acheteurs, gerer leurs approvisionnements et executer entre les marches."
                    : "Exportunity helps companies find suppliers, reach buyers, manage supply, and execute across markets."}
                </p>
                <Link
                  href="/marketplace"
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-[#07111F] px-3 text-xs font-semibold text-white transition hover:bg-[#14243B] dark:bg-[#F5A623] dark:text-[#07111F] dark:hover:bg-[#F8C45B]"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {language === "fr"
                    ? "Explorer les produits et usines autour de moi"
                    : "Explore products and factories around me"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                <MapPin className="h-4 w-4 text-[#B26F00] dark:text-[#F5A623]" />
                <span>
                  {language === "fr"
                    ? "Global par defaut. Le marche choisi affine le contexte, sans limiter le reseau."
                    : "Global by default. Your market selection refines context without limiting the network."}
                </span>
              </div>
            </div>

            <div className="mt-4 hidden gap-2 sm:grid sm:grid-cols-2 xl:grid-cols-5">
              {PATHWAYS.map((pathway) => {
                const Icon = pathway.icon;
                const active = pathway.id === mission;
                return (
                  <Link
                    key={pathway.id}
                    href={pathway.href}
                    className={cn(
                      "flex min-h-[78px] min-w-[205px] snap-start items-start gap-3 rounded-lg border p-3 transition sm:min-w-0",
                      active
                        ? "border-[#F5A623] bg-[#FFF8E8] shadow-sm dark:bg-[#F5A623]/10"
                        : "border-slate-200 bg-white hover:border-[#F5A623]/70 hover:bg-[#FFFDF8] dark:border-white/10 dark:bg-[#0A1628] dark:hover:bg-white/10",
                    )}
                  >
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md", active ? "bg-[#F5A623] text-[#07111F]" : "bg-[#07111F] text-[#F5A623]") }>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-950 dark:text-white">
                        {language === "fr" ? pathway.fr : pathway.en}
                      </span>
                      <span className="mt-1 block text-[11px] leading-4 text-slate-500 dark:text-slate-300">
                        {language === "fr" ? pathway.detailFr : pathway.detailEn}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        </main>

        <section
          className="order-3 min-w-0 lg:col-start-1 lg:row-start-2"
          aria-labelledby="network-map-title"
        >
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase text-[#9A6200] dark:text-[#F5A623]">
                  {language === "fr" ? "Reseau et corridors" : "Network and corridors"}
                </p>
                <h2 id="network-map-title" className="mt-1 text-xl font-semibold text-[#07111F] dark:text-white">
                  {language === "fr"
                    ? `Explorer ${selectedMarket.fr}`
                    : `Explore ${selectedMarket.en}`}
                </h2>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-300">
                <Route className="h-4 w-4 text-[#B26F00] dark:text-[#F5A623]" />
                {language === "fr"
                  ? "Reperes publics et liaisons de contexte, pas des expeditions en direct."
                  : "Public references and context links, not live shipments."}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0A1628]">
              <div className="relative h-[390px] sm:h-[470px] lg:h-[520px]">
                <MapContainer
                  center={MARKET_CENTERS[market].center}
                  zoom={MARKET_CENTERS[market].zoom}
                  minZoom={2}
                  maxZoom={18}
                  scrollWheelZoom
                  className="h-full w-full"
                  zoomControl
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url={
                      theme === "dark"
                        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    }
                  />
                  <GlobalMapViewport market={market} selected={selectedLocation} />
                  {(market === "GLOBAL" || market === "OTHER")
                    ? mapRoutes.map((positions, index) => (
                        <Polyline
                          key={`global-context-route-${index}`}
                          positions={positions}
                          pathOptions={{
                            color: "#F5A623",
                            weight: 3,
                            opacity: 0.65,
                            dashArray: "8 10",
                          }}
                        />
                      ))
                    : null}
                  {market === "GLOBAL" || market === "OTHER"
                    ? GLOBAL_MARKET_CLUSTERS.map((cluster) => {
                        const marketOption = MARKET_OPTIONS.find((item) => item.code === cluster.code)!;
                        return (
                          <Marker
                            key={`market-cluster-${cluster.code}`}
                            position={cluster.center}
                            icon={marketClusterIcon(cluster.code, cluster.count)}
                            title={language === "fr" ? marketOption.fr : marketOption.en}
                            riseOnHover
                            eventHandlers={{ click: () => selectMarket(cluster.code) }}
                          >
                            <Tooltip direction="top" offset={[0, -18]} opacity={0.96}>
                              <span className="font-semibold">
                                {language === "fr" ? marketOption.fr : marketOption.en} · {cluster.count}
                              </span>
                            </Tooltip>
                          </Marker>
                        );
                      })
                    : visibleLocations.map((context) => (
                        <Marker
                          key={context.id}
                          position={[context.latitude, context.longitude]}
                          icon={mapMarkerIcon(context, selectedLocation?.id === context.id)}
                          title={industrialContextText(context.name, language)}
                          riseOnHover
                          zIndexOffset={selectedLocation?.id === context.id ? 1000 : 0}
                          eventHandlers={{
                            click: () => {
                              setSelectedLocation(context);
                              setSelectedProduct(null);
                            },
                          }}
                        >
                          <Tooltip direction="top" offset={[0, -20]} opacity={0.96}>
                            <span className="font-semibold">
                              {industrialContextText(context.name, language)}
                            </span>
                          </Tooltip>
                        </Marker>
                      ))}
                </MapContainer>
                <div className="pointer-events-none absolute left-3 top-3 z-[500] flex items-center gap-2 rounded-md border border-white/80 bg-white/92 px-2.5 py-2 text-[11px] font-semibold text-[#07111F] shadow-md backdrop-blur dark:border-white/15 dark:bg-[#07111F]/90 dark:text-white">
                  <Globe2 className="h-4 w-4 text-[#B26F00] dark:text-[#F5A623]" />
                  {visibleLocations.length} {language === "fr" ? "reperes documentes" : "documented references"}
                </div>
              </div>

              <div className="min-h-[118px] border-t border-slate-200 p-3 dark:border-white/10 sm:p-4">
                {selectedLocation ? (
                  <div className="grid gap-3 sm:grid-cols-[42px_minmax(0,1fr)_auto] sm:items-start">
                    {(() => {
                      const VisualIcon = CONTEXT_VISUALS[selectedLocation.kind].icon;
                      return (
                        <span className="grid h-10 w-10 place-items-center rounded-md bg-[#07111F] text-[#F5A623]">
                          <VisualIcon className="h-5 w-5" />
                        </span>
                      );
                    })()}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-950 dark:text-white">
                          {industrialContextText(selectedLocation.name, language)}
                        </h3>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-200">
                          {language === "fr" ? "Information publique" : "Public information"}
                        </span>
                      </div>
                      <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                        {industrialContextText(selectedLocation.summary, language)}
                      </p>
                    </div>
                    <div className="flex gap-2 sm:flex-col">
                      <a
                        href={selectedLocation.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-[#F5A623] hover:text-slate-950 dark:border-white/20 dark:bg-white/5 dark:text-white"
                      >
                        {language === "fr" ? "Voir la source" : "View source"}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLocation(null);
                          setSelectedProduct(null);
                        }}
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                        {language === "fr" ? "Fermer" : "Close"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[82px] items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#07111F] text-[#F5A623]">
                      <MapPin className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">
                        {language === "fr"
                          ? "Selectionnez un repere pour comprendre son role commercial."
                          : "Select a reference to understand its commercial role."}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-300">
                        {language === "fr"
                          ? "Chaque fiche distingue les informations publiques des fournisseurs, capacites et stocks verifies."
                          : "Every profile separates public context from verified suppliers, capacity, and inventory."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
        </section>

        <aside
          ref={assistantRef}
          className="relative z-[100] isolate order-2 min-w-0 scroll-mt-20 lg:sticky lg:top-[84px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100vh-100px)]"
          aria-label="Exportunity commercial assistant"
        >
          <div className="mb-2 flex items-center justify-between gap-3 lg:hidden">
            <div>
              <p className="text-[11px] font-bold uppercase text-[#9A6200] dark:text-[#F5A623]">
                Exportunity AI
              </p>
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
            context={activeContext}
            product={selectedProduct}
            onCloseProduct={() => setSelectedProduct(null)}
            mode="commercial"
            pane
            className="mt-0 h-[440px] min-h-0 rounded-lg sm:h-[520px] lg:h-full lg:min-h-[610px]"
          />
        </aside>

        <section className="relative z-0 order-4 min-w-0 lg:col-span-2 lg:row-start-3" id="industries" aria-labelledby="industries-title">
          <div className="border-y border-slate-200 py-4 dark:border-white/10">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-[11px] font-bold uppercase text-[#9A6200] dark:text-[#F5A623]">
                  {language === "fr" ? "Industries dynamiques" : "Dynamic industries"}
                </p>
                <h2 id="industries-title" className="mt-1 text-xl font-semibold text-[#07111F] dark:text-white">
                  {language === "fr"
                    ? "Choisissez un secteur, puis expliquez le besoin a Awa"
                    : "Choose an industry, then explain the requirement to Awa"}
                </h2>
              </div>
              {selectedIndustry ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIndustry(null);
                    setSelectedProduct(null);
                  }}
                  className="inline-flex min-h-9 items-center gap-2 self-start rounded-md px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white sm:self-auto"
                >
                  <X className="h-3.5 w-3.5" />
                  {language === "fr" ? "Tous les secteurs" : "All industries"}
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible">
              {INDUSTRY_LENSES.map((industry) => {
                const Icon = industry.icon;
                const active = selectedIndustry?.id === industry.id;
                return (
                  <button
                    key={industry.id}
                    type="button"
                    onClick={() => selectIndustry(industry)}
                    className={cn(
                      "flex min-h-[58px] min-w-[220px] items-center gap-3 rounded-lg border px-3 text-left transition lg:min-w-0",
                      active
                        ? "border-[#F5A623] bg-[#FFF8E8] text-slate-950 dark:bg-[#F5A623]/10 dark:text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-[#F5A623]/70 dark:border-white/10 dark:bg-[#0A1628] dark:text-slate-200",
                    )}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#07111F] text-[#F5A623]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-semibold">
                      {language === "fr" ? industry.fr : industry.en}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="order-5 min-w-0 pb-8 lg:col-span-2 lg:row-start-4" aria-labelledby="opportunities-title">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-[11px] font-bold uppercase text-[#9A6200] dark:text-[#F5A623]">
                {language === "fr" ? "Catalogue publie" : "Published catalog"}
              </p>
              <h2 id="opportunities-title" className="mt-1 text-xl font-semibold text-[#07111F] dark:text-white">
                {selectedIndustry
                  ? language === "fr"
                    ? selectedIndustry.fr
                    : selectedIndustry.en
                  : language === "fr"
                    ? "Produits, pieces et services a qualifier"
                    : "Products, parts, and services to qualify"}
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-300">
                {language === "fr"
                  ? "Les sources sont affichees. Prix, stock, capacite, fournisseur et delai sont confirmes dans le dossier avant tout engagement."
                  : "Sources are shown. Price, stock, capacity, supplier, and lead time are confirmed in the case before any commitment."}
              </p>
            </div>
            <Link
              href="/industrial"
              className="inline-flex min-h-10 items-center gap-2 self-start rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-[#F5A623] hover:text-slate-950 dark:border-white/20 dark:bg-white/5 dark:text-white sm:self-auto"
            >
              <Factory className="h-4 w-4 text-[#B26F00] dark:text-[#F5A623]" />
              {language === "fr" ? "Ouvrir la verticale industrielle" : "Open industrial vertical"}
            </Link>
          </div>

          {catalogQuery.isLoading ? (
            <div className="mt-4 grid min-h-[170px] place-items-center rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-[#0A1628]">
              <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#F5A623]/30 border-t-[#F5A623]" />
                {language === "fr" ? "Chargement du catalogue..." : "Loading catalog..."}
              </div>
            </div>
          ) : catalogItems.length ? (
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
              {catalogItems.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  language={language}
                  selected={selectedProduct?.id === item.id}
                  onSelect={() => openProduct(item)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 flex min-h-[150px] items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0A1628]">
              <PackageSearch className="h-8 w-8 shrink-0 text-[#B26F00] dark:text-[#F5A623]" />
              <div>
                <p className="font-semibold text-slate-950 dark:text-white">
                  {language === "fr"
                    ? "Aucune offre publiee ne correspond encore a ce filtre."
                    : "No published offer currently matches this filter."}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {language === "fr"
                    ? "Decrivez le besoin a Awa; elle ouvrira un dossier de sourcing sans inventer un stock."
                    : "Describe the requirement to Awa; she will open a sourcing case without inventing inventory."}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-xs text-slate-500 dark:border-white/10 dark:bg-[#07111F] dark:text-slate-300 sm:px-6">
        <div className="mx-auto flex max-w-[1680px] flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <p>
            {language === "fr"
              ? "Exportunity qualifie les contreparties, preuves et conditions avant tout engagement commercial."
              : "Exportunity qualifies counterparties, evidence, and terms before any commercial commitment."}
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/industrial" className="hover:text-slate-950 dark:hover:text-white">
              {language === "fr" ? "Industries" : "Industries"}
            </Link>
            <Link href="/trade" className="hover:text-slate-950 dark:hover:text-white">
              {language === "fr" ? "Intelligence marchés" : "Trade intelligence"}
            </Link>
            <Link href="/producer-exchange" className="hover:text-slate-950 dark:hover:text-white">
              {language === "fr" ? "Bourse producteurs" : "Producer exchange"}
            </Link>
            <Link href="/privacy" className="hover:text-slate-950 dark:hover:text-white">
              {language === "fr" ? "Confidentialite" : "Privacy"}
            </Link>
            <Link href="/terms" className="hover:text-slate-950 dark:hover:text-white">
              {language === "fr" ? "Conditions" : "Terms"}
            </Link>
          </div>
        </div>
      </footer>

      <style>{`
        .exportunity-global-marker { background: transparent !important; border: 0 !important; }
        .leaflet-container { font-family: Arial, sans-serif; background: ${theme === "dark" ? "#07111F" : "#e8eef3"}; }
        .leaflet-control-attribution { font-size: 9px; }
        .leaflet-tooltip { border: 1px solid rgba(15, 23, 42, .12); border-radius: 6px; box-shadow: 0 10px 28px rgba(7, 17, 31, .18); }
      `}</style>
    </div>
  );
}
