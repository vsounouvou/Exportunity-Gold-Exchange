export type IndustrialContextLanguage = "fr" | "en";

export type IndustrialContextCopy = {
  fr: string;
  en: string;
};

export type IndustrialContextLocation = {
  id: string;
  kind:
    | "industrial_zone"
    | "logistics_gateway"
    | "innovation_hub"
    | "agro_processing_reference";
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
  title: IndustrialContextCopy;
  summary: IndustrialContextCopy;
  sourceLabel: string;
  sourceUrl: string;
};

export const BENIN_INDUSTRIAL_MAP_CENTER: [number, number] = [6.82, 2.42];

// These are public infrastructure references, deliberately separate from the
// verified factory directory. A map reference is never a claim that a company
// is onboarded, has available inventory, or is endorsed by Exportunity.
export const BENIN_INDUSTRIAL_CONTEXT_LOCATIONS: IndustrialContextLocation[] = [
  {
    id: "gdiz",
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
    kind: "innovation_hub",
    markerLabel: "SEME",
    latitude: 6.3505418,
    longitude: 2.408397,
    name: {
      fr: "Seme City",
      en: "Seme City",
    },
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
];

export const BENIN_INDUSTRIAL_SECTOR_LENSES: IndustrialSectorLens[] = [
  {
    id: "cotton-textile",
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
    title: { fr: "Soja et agro-transformation", en: "Soy and agro-processing" },
    summary: {
      fr: "Huiles, tourteaux, ingredients et autres transformations agro-industrielles sont des axes identifies.",
      en: "Oils, meal, ingredients, and other agro-industrial processing are identified focus areas.",
    },
    sourceLabel: "GDIZ - secteurs industriels",
    sourceUrl: "https://gdiz-benin.com/fr/secteurs-industriels-cles/",
  },
  {
    id: "wood-packaging",
    title: { fr: "Bois et emballage", en: "Wood and packaging" },
    summary: {
      fr: "Transformation du bois et emballage constituent des axes de chaine de valeur presentes par la GDIZ.",
      en: "Wood transformation and packaging are value-chain areas presented by GDIZ.",
    },
    sourceLabel: "GDIZ - presentation",
    sourceUrl: "https://gdiz-benin.com/fr/",
  },
  {
    id: "light-engineering",
    title: { fr: "Ingenierie legere", en: "Light engineering" },
    summary: {
      fr: "Une piste pour les pieces, sous-ensembles et besoins de reverse engineering - a qualifier dossier par dossier.",
      en: "A lens for parts, subassemblies, and reverse-engineering needs - qualified case by case.",
    },
    sourceLabel: "GDIZ - investment sectors",
    sourceUrl: "https://gdiz-benin.com/invest-in-gdiz/",
  },
  {
    id: "advanced-industry",
    title: { fr: "Electronique, pharma et mobilite", en: "Electronics, pharma, and mobility" },
    summary: {
      fr: "Assemblage de telephones et ordinateurs, industrie pharmaceutique et vehicules electriques sont repertories comme filieres a explorer.",
      en: "Phone and computer assembly, pharmaceutical industry, and electric vehicles are listed as sectors to explore.",
    },
    sourceLabel: "GDIZ - key industries",
    sourceUrl: "https://gdiz-benin.com/key-industry-sectors/",
  },
  {
    id: "roots-grains",
    title: {
      fr: "Manioc, riz et mais",
      en: "Cassava, rice, and maize",
    },
    summary: {
      fr: "La transformation de ces filieres fait l'objet d'un programme public documente a Ketou.",
      en: "Processing these value chains is the subject of a documented public programme in Ketou.",
    },
    sourceLabel: "Gouvernement du Benin - Ketou",
    sourceUrl:
      "https://www.gouv.bj/article/2853/productions-agricoles-bientot-unites-transformation-manioc-mais-produits-ketou/",
  },
  {
    id: "innovation-skills",
    title: {
      fr: "Innovation et competences industrielles",
      en: "Industrial innovation and skills",
    },
    summary: {
      fr: "Formation, recherche appliquee et entrepreneuriat constituent un contexte de capacite a mobiliser, pas une offre de fabrication.",
      en: "Skills, applied research, and entrepreneurship are capability context to mobilize, not a manufacturing offering.",
    },
    sourceLabel: "Seme City",
    sourceUrl: "https://semecity.bj/a-propos/notre-mission/",
  },
];

export function industrialContextText(
  value: IndustrialContextCopy,
  language: IndustrialContextLanguage,
) {
  return value[language];
}
