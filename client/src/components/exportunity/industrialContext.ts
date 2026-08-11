export type IndustrialContextLanguage = "fr" | "en";

export type IndustrialContextCopy = {
  fr: string;
  en: string;
};

export type IndustrialTerritoryCode = "BJ" | "CI" | "AE";

export type IndustrialContextKind =
  | "industrial_zone"
  | "logistics_gateway"
  | "innovation_hub"
  | "agro_processing_reference"
  | "commodity_hub";

export type IndustrialContextLocation = {
  id: string;
  territoryCode: IndustrialTerritoryCode;
  countryCode: IndustrialTerritoryCode;
  city: string;
  kind: IndustrialContextKind;
  markerLabel: string;
  latitude: number;
  longitude: number;
  name: IndustrialContextCopy;
  eyebrow: IndustrialContextCopy;
  summary: IndustrialContextCopy;
  sourceLabel: string;
  sourceUrl: string;
};

export type IndustrialSectorLens = {
  id: string;
  territoryCode: IndustrialTerritoryCode;
  title: IndustrialContextCopy;
  summary: IndustrialContextCopy;
  sourceLabel: string;
  sourceUrl: string;
};

export type IndustrialTerritory = {
  code: IndustrialTerritoryCode;
  countryCode: IndustrialTerritoryCode;
  name: IndustrialContextCopy;
  shortName: IndustrialContextCopy;
  corridorName: IndustrialContextCopy;
  mapCenter: [number, number];
  mapZoom: number;
  routeContextIds: [string, string] | null;
  routeLabel: IndustrialContextCopy;
  summary: IndustrialContextCopy;
};

export const DEFAULT_INDUSTRIAL_TERRITORY_CODE: IndustrialTerritoryCode = "CI";

export const INDUSTRIAL_TERRITORY_ORDER: IndustrialTerritoryCode[] = [
  "CI",
  "BJ",
  "AE",
];

export const INDUSTRIAL_TERRITORIES: Record<
  IndustrialTerritoryCode,
  IndustrialTerritory
> = {
  CI: {
    code: "CI",
    countryCode: "CI",
    name: { fr: "Cote d'Ivoire", en: "Cote d'Ivoire" },
    shortName: { fr: "Abidjan", en: "Abidjan" },
    corridorName: {
      fr: "Zones industrielles d'Abidjan",
      en: "Abidjan industrial zones",
    },
    mapCenter: [5.35, -4.08],
    mapZoom: 10,
    routeContextIds: ["abidjan-pk24", "port-abidjan"],
    routeLabel: {
      fr: "Liaison industrielle PK24 - Port d'Abidjan",
      en: "PK24 - Port of Abidjan industrial link",
    },
    summary: {
      fr: "Zones industrielles, producteurs, terminaux portuaires et besoins d'approvisionnement autour d'Abidjan.",
      en: "Industrial zones, producers, port terminals, and supply requirements around Abidjan.",
    },
  },
  BJ: {
    code: "BJ",
    countryCode: "BJ",
    name: { fr: "Benin", en: "Benin" },
    shortName: { fr: "Cotonou / GDIZ", en: "Cotonou / GDIZ" },
    corridorName: {
      fr: "Axe GDIZ - Cotonou",
      en: "GDIZ - Cotonou corridor",
    },
    mapCenter: [6.82, 2.42],
    mapZoom: 9,
    routeContextIds: ["gdiz", "port-cotonou"],
    routeLabel: {
      fr: "Liaison industrielle GDIZ - Port de Cotonou",
      en: "GDIZ - Port of Cotonou industrial link",
    },
    summary: {
      fr: "Production, transformation, competences et logistique autour de Cotonou et de la GDIZ.",
      en: "Production, processing, skills, and logistics around Cotonou and GDIZ.",
    },
  },
  AE: {
    code: "AE",
    countryCode: "AE",
    name: { fr: "Emirats arabes unis", en: "United Arab Emirates" },
    shortName: { fr: "Dubai", en: "Dubai" },
    corridorName: {
      fr: "Corridor industriel de Dubai",
      en: "Dubai industrial corridor",
    },
    mapCenter: [24.96, 55.09],
    mapZoom: 10,
    routeContextIds: ["dubai-industrial-city", "jebel-ali-port"],
    routeLabel: {
      fr: "Liaison industrie - logistique de Dubai",
      en: "Dubai industry - logistics link",
    },
    summary: {
      fr: "Sourcing international, fabrication, logistique, matieres premieres et ecosystemes de commerce a Dubai.",
      en: "International sourcing, manufacturing, logistics, raw materials, and trade ecosystems in Dubai.",
    },
  },
};

// These are public infrastructure references, deliberately separate from the
// verified factory directory. A map reference is never a claim that a company
// is onboarded, has available inventory, or is endorsed by Exportunity.
export const INDUSTRIAL_CONTEXT_LOCATIONS: IndustrialContextLocation[] = [
  {
    id: "gdiz",
    territoryCode: "BJ",
    countryCode: "BJ",
    city: "Glo-Djigbe",
    kind: "industrial_zone",
    markerLabel: "GDIZ",
    latitude: 6.61098,
    longitude: 2.25939,
    name: {
      fr: "GDIZ - Zone Industrielle de Glo-Djigbe",
      en: "GDIZ - Glo-Djigbe Industrial Zone",
    },
    eyebrow: {
      fr: "Zone industrielle integree - information publique",
      en: "Integrated industrial zone - public information",
    },
    summary: {
      fr: "Repere pour les chaines de valeur coton-textile, anacarde, soja, agro-transformation, bois et ingenierie legere. Ce point ne represente ni une usine Exportunity ni une capacite disponible.",
      en: "A reference point for cotton-textile, cashew, soy, agro-processing, wood, and light-engineering value chains. It does not represent an Exportunity factory or available capacity.",
    },
    sourceLabel: "GDIZ Benin",
    sourceUrl: "https://gdiz-benin.com/fr/decouvrir-gdiz/",
  },
  {
    id: "port-cotonou",
    territoryCode: "BJ",
    countryCode: "BJ",
    city: "Cotonou",
    kind: "logistics_gateway",
    markerLabel: "PAC",
    latitude: 6.3574,
    longitude: 2.4304,
    name: {
      fr: "Port Autonome de Cotonou",
      en: "Port of Cotonou",
    },
    eyebrow: {
      fr: "Passerelle logistique - information publique",
      en: "Logistics gateway - public information",
    },
    summary: {
      fr: "Repere logistique pour les flux d'import-export, les prestations marchandises, le transit et l'acces camion. Ce point n'est pas un transporteur recommande ni une promesse de delai.",
      en: "A logistics reference point for import-export flows, cargo services, transit, and truck access. It is not a recommended carrier or a delivery-time promise.",
    },
    sourceLabel: "Port Autonome de Cotonou",
    sourceUrl: "https://portdecotonou.bj/nos-services/",
  },
  {
    id: "seme-city",
    territoryCode: "BJ",
    countryCode: "BJ",
    city: "Cotonou",
    kind: "innovation_hub",
    markerLabel: "SEME",
    latitude: 6.3505418,
    longitude: 2.408397,
    name: { fr: "Seme City", en: "Seme City" },
    eyebrow: {
      fr: "Innovation, competences et recherche - information publique",
      en: "Innovation, skills, and research - public information",
    },
    summary: {
      fr: "Repere public pour la formation, la recherche appliquee et l'entrepreneuriat innovant. Ce point ne confirme ni une usine, ni un fournisseur, ni une capacite de production Exportunity.",
      en: "A public reference for skills, applied research, and innovative entrepreneurship. It does not confirm an Exportunity factory, supplier, or production capacity.",
    },
    sourceLabel: "Seme City",
    sourceUrl: "https://semecity.bj/a-propos/qui-sommes-nous/",
  },
  {
    id: "ketou-agro-processing",
    territoryCode: "BJ",
    countryCode: "BJ",
    city: "Ketou",
    kind: "agro_processing_reference",
    markerLabel: "KETOU",
    latitude: 7.3604193,
    longitude: 2.6024222,
    name: {
      fr: "Ketou - reference agro-transformation",
      en: "Ketou - agro-processing reference",
    },
    eyebrow: {
      fr: "Programme public de transformation - information publique",
      en: "Public processing programme - public information",
    },
    summary: {
      fr: "Repere territorial lie a un programme public annonce pour des infrastructures de transformation du manioc, du riz et du mais. Il ne represente ni une installation operationnelle verifiee ni une offre commerciale publiee.",
      en: "A geographic reference for a publicly announced cassava, rice, and maize processing-infrastructure programme. It is not a verified operating facility or a published commercial offering.",
    },
    sourceLabel: "Gouvernement du Benin",
    sourceUrl:
      "https://www.gouv.bj/article/2853/productions-agricoles-bientot-unites-transformation-manioc-mais-produits-ketou/",
  },
  {
    id: "abidjan-pk24",
    territoryCode: "CI",
    countryCode: "CI",
    city: "Abidjan",
    kind: "industrial_zone",
    markerLabel: "PK24",
    latitude: 5.4243443,
    longitude: -4.1580357,
    name: {
      fr: "Zone Industrielle Akoupe-Zeudji PK24",
      en: "Akoupe-Zeudji PK24 Industrial Zone",
    },
    eyebrow: {
      fr: "Zone industrielle d'Abidjan - information publique",
      en: "Abidjan industrial zone - public information",
    },
    summary: {
      fr: "Repere public gere dans le reseau des zones industrielles de la SOGEDI. Les entreprises, produits et capacites doivent etre verifies individuellement avant publication ou mise en relation.",
      en: "A public reference within the SOGEDI industrial-zone network. Companies, products, and capabilities must be individually verified before publication or introduction.",
    },
    sourceLabel: "SOGEDI",
    sourceUrl: "https://www.sogedi.ci/abidjan/",
  },
  {
    id: "yopougon-industrial-zone",
    territoryCode: "CI",
    countryCode: "CI",
    city: "Abidjan",
    kind: "industrial_zone",
    markerLabel: "YOPOUGON",
    latitude: 5.3744062,
    longitude: -4.0845378,
    name: {
      fr: "Zone Industrielle de Yopougon",
      en: "Yopougon Industrial Zone",
    },
    eyebrow: {
      fr: "Zone industrielle d'Abidjan - information publique",
      en: "Abidjan industrial zone - public information",
    },
    summary: {
      fr: "Repere territorial pour la decouverte de fabricants et besoins industriels a qualifier. Il ne constitue ni un annuaire d'entreprises verifiees ni une preuve de stock.",
      en: "A territorial reference for discovering manufacturers and industrial requirements to qualify. It is not a verified company directory or proof of stock.",
    },
    sourceLabel: "SOGEDI",
    sourceUrl: "https://www.sogedi.ci/abidjan/",
  },
  {
    id: "port-abidjan",
    territoryCode: "CI",
    countryCode: "CI",
    city: "Abidjan",
    kind: "logistics_gateway",
    markerLabel: "PAA",
    latitude: 5.3166667,
    longitude: -4.0166667,
    name: {
      fr: "Port Autonome d'Abidjan",
      en: "Port of Abidjan",
    },
    eyebrow: {
      fr: "Passerelle portuaire et export - information publique",
      en: "Port and export gateway - public information",
    },
    summary: {
      fr: "Repere pour les terminaux conteneurs, roulier, mineralier, petrolier, cerealier et la reparation navale. Toute route, capacite et prestation commerciale reste a confirmer.",
      en: "A reference for container, ro-ro, mineral, oil, grain, and ship-repair terminals. Any route, capacity, or commercial service remains subject to confirmation.",
    },
    sourceLabel: "Port Autonome d'Abidjan",
    sourceUrl: "https://www.portabidjan.ci/fr/le-port-dabidjan/installations-et-activites",
  },
  {
    id: "dubai-industrial-city",
    territoryCode: "AE",
    countryCode: "AE",
    city: "Dubai",
    kind: "industrial_zone",
    markerLabel: "DIC",
    latitude: 24.8399006,
    longitude: 55.0662934,
    name: {
      fr: "Dubai Industrial City",
      en: "Dubai Industrial City",
    },
    eyebrow: {
      fr: "Ecosysteme industriel et logistique - information publique",
      en: "Industrial and logistics ecosystem - public information",
    },
    summary: {
      fr: "Repere public pour les terrains industriels, entrepots, fabrication et logistique. Les entreprises et offres doivent etre qualifiees separement par Exportunity.",
      en: "A public reference for industrial land, warehousing, manufacturing, and logistics. Companies and offerings must be separately qualified by Exportunity.",
    },
    sourceLabel: "Dubai Industrial City",
    sourceUrl: "https://dubaiindustrialcity.ae/",
  },
  {
    id: "jebel-ali-port",
    territoryCode: "AE",
    countryCode: "AE",
    city: "Dubai",
    kind: "logistics_gateway",
    markerLabel: "JEBEL ALI",
    latitude: 24.9804578,
    longitude: 55.0598883,
    name: { fr: "Port de Jebel Ali", en: "Jebel Ali Port" },
    eyebrow: {
      fr: "Passerelle logistique mondiale - information publique",
      en: "Global logistics gateway - public information",
    },
    summary: {
      fr: "Repere public pour les flux conteneurises, vrac, roulier, stockage et connexions intermodales. Exportunity confirme separement les prestataires, tarifs et delais.",
      en: "A public reference for container, bulk, ro-ro, storage, and intermodal flows. Exportunity separately confirms providers, rates, and lead times.",
    },
    sourceLabel: "DP World - Jebel Ali Port",
    sourceUrl: "https://www.dpworld.com/en/ports-terminals/uae/jebel-ali-port",
  },
  {
    id: "dmcc-commodities",
    territoryCode: "AE",
    countryCode: "AE",
    city: "Dubai",
    kind: "commodity_hub",
    markerLabel: "DMCC",
    latitude: 25.0686931,
    longitude: 55.1404673,
    name: {
      fr: "DMCC - ecosystemes de matieres premieres",
      en: "DMCC - commodities ecosystems",
    },
    eyebrow: {
      fr: "Commerce de matieres premieres - information publique",
      en: "Commodities trade - public information",
    },
    summary: {
      fr: "Repere public pour les ecosystemes de commerce, dont l'or et les metaux precieux. Ce contexte ne prouve ni l'identite d'un fournisseur, ni l'origine d'un metal, ni l'approbation d'une transaction.",
      en: "A public reference for trade ecosystems, including gold and precious metals. This context does not prove supplier identity, metal origin, or transaction approval.",
    },
    sourceLabel: "DMCC Gold Ecosystem",
    sourceUrl: "https://dmcc.ae/ecosystems/gold",
  },
];

export const INDUSTRIAL_SECTOR_LENSES: IndustrialSectorLens[] = [
  {
    id: "cotton-textile",
    territoryCode: "BJ",
    title: { fr: "Coton et textile", en: "Cotton and textile" },
    summary: {
      fr: "Filature, tissage, tricotage et confection figurent parmi les filieres de la GDIZ.",
      en: "Spinning, weaving, knitting, and garment-making are among GDIZ value chains.",
    },
    sourceLabel: "GDIZ - secteurs industriels",
    sourceUrl: "https://gdiz-benin.com/fr/secteurs-industriels-cles/",
  },
  {
    id: "cashew",
    territoryCode: "BJ",
    title: { fr: "Anacarde", en: "Cashew" },
    summary: {
      fr: "Transformation de l'anacarde et produits derives dans les filieres publiques de reference.",
      en: "Cashew processing and derivatives in the public reference value chains.",
    },
    sourceLabel: "GDIZ - secteurs industriels",
    sourceUrl: "https://gdiz-benin.com/fr/secteurs-industriels-cles/",
  },
  {
    id: "soy-agro",
    territoryCode: "BJ",
    title: { fr: "Soja et agro-transformation", en: "Soy and agro-processing" },
    summary: {
      fr: "Huiles, tourteaux, ingredients et autres transformations agro-industrielles sont des axes identifies.",
      en: "Oils, meal, ingredients, and other agro-industrial processing are identified focus areas.",
    },
    sourceLabel: "GDIZ - secteurs industriels",
    sourceUrl: "https://gdiz-benin.com/fr/secteurs-industriels-cles/",
  },
  {
    id: "benin-light-engineering",
    territoryCode: "BJ",
    title: { fr: "Ingenierie legere", en: "Light engineering" },
    summary: {
      fr: "Pieces, sous-ensembles et besoins de reverse engineering sont qualifies dossier par dossier.",
      en: "Parts, subassemblies, and reverse-engineering needs are qualified case by case.",
    },
    sourceLabel: "GDIZ - investment sectors",
    sourceUrl: "https://gdiz-benin.com/invest-in-gdiz/",
  },
  {
    id: "abidjan-industrial-zones",
    territoryCode: "CI",
    title: { fr: "Zones industrielles d'Abidjan", en: "Abidjan industrial zones" },
    summary: {
      fr: "PK24, Yopougon, Vridi et Koumassi structurent le contexte public de prospection industrielle.",
      en: "PK24, Yopougon, Vridi, and Koumassi structure the public industrial-prospecting context.",
    },
    sourceLabel: "SOGEDI",
    sourceUrl: "https://www.sogedi.ci/abidjan/",
  },
  {
    id: "abidjan-port-terminals",
    territoryCode: "CI",
    title: { fr: "Terminaux et export", en: "Terminals and export" },
    summary: {
      fr: "Conteneurs, roulier, minerais, petrole, cereales et reparation navale donnent plusieurs axes de sourcing et de logistique.",
      en: "Containers, ro-ro, minerals, oil, grain, and ship repair provide multiple sourcing and logistics lenses.",
    },
    sourceLabel: "Port Autonome d'Abidjan",
    sourceUrl: "https://www.portabidjan.ci/fr/le-port-dabidjan/installations-et-activites",
  },
  {
    id: "dubai-manufacturing-logistics",
    territoryCode: "AE",
    title: { fr: "Fabrication et logistique", en: "Manufacturing and logistics" },
    summary: {
      fr: "Dubai Industrial City constitue un repere public pour la fabrication, l'entreposage et la distribution regionale.",
      en: "Dubai Industrial City is a public reference for manufacturing, warehousing, and regional distribution.",
    },
    sourceLabel: "Dubai Industrial City",
    sourceUrl: "https://dubaiindustrialcity.ae/",
  },
  {
    id: "dubai-commodities",
    territoryCode: "AE",
    title: { fr: "Matieres premieres et metaux precieux", en: "Commodities and precious metals" },
    summary: {
      fr: "Le contexte DMCC aide a orienter la prospection, sans remplacer la verification de contrepartie, d'origine ou de conformite.",
      en: "The DMCC context helps orient sourcing without replacing counterparty, origin, or compliance verification.",
    },
    sourceLabel: "DMCC Gold Ecosystem",
    sourceUrl: "https://dmcc.ae/ecosystems/gold",
  },
  {
    id: "jebel-ali-trade",
    territoryCode: "AE",
    title: { fr: "Commerce et transit mondial", en: "Global trade and transit" },
    summary: {
      fr: "Jebel Ali relie les besoins de transport, stockage et distribution a des flux mondiaux a qualifier.",
      en: "Jebel Ali connects transport, storage, and distribution needs to global flows that require qualification.",
    },
    sourceLabel: "DP World - Jebel Ali Port",
    sourceUrl: "https://www.dpworld.com/en/ports-terminals/uae/jebel-ali-port",
  },
];

export const BENIN_INDUSTRIAL_MAP_CENTER: [number, number] =
  INDUSTRIAL_TERRITORIES.BJ.mapCenter;

export const BENIN_INDUSTRIAL_CONTEXT_LOCATIONS =
  INDUSTRIAL_CONTEXT_LOCATIONS.filter(
    (context) => context.territoryCode === "BJ",
  );

export const BENIN_INDUSTRIAL_SECTOR_LENSES = INDUSTRIAL_SECTOR_LENSES.filter(
  (sector) => sector.territoryCode === "BJ",
);

export function industrialContextsForTerritory(
  territoryCode: IndustrialTerritoryCode,
) {
  return INDUSTRIAL_CONTEXT_LOCATIONS.filter(
    (context) => context.territoryCode === territoryCode,
  );
}

export function industrialSectorLensesForTerritory(
  territoryCode: IndustrialTerritoryCode,
) {
  return INDUSTRIAL_SECTOR_LENSES.filter(
    (sector) => sector.territoryCode === territoryCode,
  );
}

export function industrialContextText(
  value: IndustrialContextCopy,
  language: IndustrialContextLanguage,
) {
  return value[language];
}
