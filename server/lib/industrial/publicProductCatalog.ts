import { normalizeIndustrialText } from "./taxonomy";

export type PublicIndustrialCatalogListingKind =
  | "documented_factory_output"
  | "exportunity_sourcing_program";

export type PublicIndustrialCatalogItem = {
  id: string;
  name: string;
  description: string;
  localizedName: { fr: string; en: string };
  localizedDescription: { fr: string; en: string };
  categoryCode: string;
  classification:
    | "export_ready_factory_product"
    | "machinery"
    | "raw_material"
    | "industrial_input"
    | "spare_part"
    | "industrial_service";
  productCode: null;
  supplyModes: string[];
  priceMode: "request_quotation" | "technical_review_required";
  availabilityStatus: "subject_to_confirmation";
  manufacturer: string;
  brand: null;
  model: null;
  partNumber: null;
  countryOfOrigin: string | null;
  application: string;
  compatibleMachinery: string[];
  material: null;
  unitOfMeasure: null;
  minimumOrderQuantity: null;
  productionCapacityText: null;
  leadTimeText: null;
  certifications: string[];
  media: string[];
  factoryId: null;
  factoryName: string;
  factoryCity: string | null;
  factoryCountryCode: "BJ";
  listingKind: PublicIndustrialCatalogListingKind;
  sourceUrl: string | null;
  sourceLabel: { fr: string; en: string } | null;
  inventoryVerified: false;
  requestMode: "availability_request" | "parts_order_request" | "technical_review";
  displayPriority: number;
};

const FACTORY_PRODUCTS_IMAGE =
  "/tenants/exportunity/industrial/catalog/made-in-benin-products.png";
const SPARE_PARTS_IMAGE =
  "/tenants/exportunity/industrial/catalog/spare-parts.png";
const FACTORY_TOOLS_IMAGE =
  "/tenants/exportunity/industrial/catalog/factory-tools.png";

const GDIZ_2025_SOURCE =
  "https://gdiz-benin.com/fr/2025-a-ete-une-annee-de-realisations-majeures-pour-la-gdiz/";
const GDIZ_LAUNCH_SOURCE = "https://gdiz-benin.com/launch-event/";
const GDIZ_WEAVING_SOURCE =
  "https://gdiz-benin.com/fr/usine-de-tissage-de-gdiz/";
const GDIZ_KNITTING_SOURCE =
  "https://gdiz-benin.com/knitting-textile-plant/";

type FactoryProductInput = {
  id: string;
  name: { fr: string; en: string };
  description: { fr: string; en: string };
  manufacturer: string;
  application: string;
  image?: string;
  sourceUrl: string;
  sourceLabel?: { fr: string; en: string };
  priority: number;
};

function factoryProduct(input: FactoryProductInput): PublicIndustrialCatalogItem {
  return {
    id: `curated-factory-${input.id}`,
    name: input.name.en,
    description: input.description.en,
    localizedName: input.name,
    localizedDescription: input.description,
    categoryCode: "export_ready_factory_products",
    classification: "export_ready_factory_product",
    productCode: null,
    supplyModes: ["factory_direct_inquiry", "bulk_export"],
    priceMode: "request_quotation",
    availabilityStatus: "subject_to_confirmation",
    manufacturer: input.manufacturer,
    brand: null,
    model: null,
    partNumber: null,
    countryOfOrigin: "Benin",
    application: input.application,
    compatibleMachinery: [],
    material: null,
    unitOfMeasure: null,
    minimumOrderQuantity: null,
    productionCapacityText: null,
    leadTimeText: null,
    certifications: [],
    media: [input.image || FACTORY_PRODUCTS_IMAGE],
    factoryId: null,
    factoryName: input.manufacturer,
    factoryCity: "Glo-Djigbe",
    factoryCountryCode: "BJ",
    listingKind: "documented_factory_output",
    sourceUrl: input.sourceUrl,
    sourceLabel:
      input.sourceLabel || {
        fr: "Source officielle GDIZ",
        en: "Official GDIZ source",
      },
    inventoryVerified: false,
    requestMode: "availability_request",
    displayPriority: input.priority,
  };
}

type SourcingProductInput = {
  id: string;
  name: { fr: string; en: string };
  description: { fr: string; en: string };
  application: string;
  classification?: "spare_part" | "industrial_input" | "machinery" | "industrial_service";
  categoryCode?: string;
  image?: string;
  priority: number;
  compatibleMachinery?: string[];
};

function sourcingProduct(input: SourcingProductInput): PublicIndustrialCatalogItem {
  const classification = input.classification || "spare_part";
  return {
    id: `curated-sourcing-${input.id}`,
    name: input.name.en,
    description: input.description.en,
    localizedName: input.name,
    localizedDescription: input.description,
    categoryCode:
      input.categoryCode ||
      (classification === "machinery"
        ? "machinery_and_production_equipment"
        : classification === "industrial_input"
          ? "industrial_inputs_and_consumables"
          : classification === "industrial_service"
            ? "industrial_services"
            : "spare_parts_and_components"),
    classification,
    productCode: null,
    supplyModes:
      classification === "industrial_service"
        ? ["technical_review", "made_to_drawing"]
        : ["source_and_deliver", "made_to_specification"],
    priceMode:
      classification === "industrial_service"
        ? "technical_review_required"
        : "request_quotation",
    availabilityStatus: "subject_to_confirmation",
    manufacturer: "Exportunity Machinery sourcing network",
    brand: null,
    model: null,
    partNumber: null,
    countryOfOrigin: null,
    application: input.application,
    compatibleMachinery: input.compatibleMachinery || [],
    material: null,
    unitOfMeasure: null,
    minimumOrderQuantity: null,
    productionCapacityText: null,
    leadTimeText: null,
    certifications: [],
    media: [input.image || SPARE_PARTS_IMAGE],
    factoryId: null,
    factoryName: "Exportunity Machinery",
    factoryCity: "Cotonou",
    factoryCountryCode: "BJ",
    listingKind: "exportunity_sourcing_program",
    sourceUrl: null,
    sourceLabel: null,
    inventoryVerified: false,
    requestMode:
      classification === "industrial_service"
        ? "technical_review"
        : "parts_order_request",
    displayPriority: input.priority,
  };
}

export const PUBLIC_INDUSTRIAL_CATALOG: PublicIndustrialCatalogItem[] = [
  sourcingProduct({
    id: "sprockets-chain-wheels",
    name: { fr: "Pignons et roues a chaine", en: "Sprockets and chain wheels" },
    description: {
      fr: "Composants de transmission a identifier, sourcer ou fabriquer a partir d'une reference, d'un plan ou d'un echantillon.",
      en: "Transmission components sourced or made from a reference, drawing, or physical sample.",
    },
    application: "Conveyors, transmissions, and rotating equipment",
    priority: 10,
    compatibleMachinery: ["Conveyors", "Packaging lines", "Process equipment"],
  }),
  sourcingProduct({
    id: "bearings-housings",
    name: { fr: "Roulements et paliers", en: "Bearings and bearing housings" },
    description: {
      fr: "Roulements, paliers et logements selon dimensions, charge, vitesse, et environnement de production.",
      en: "Bearings, mounted units, and housings matched to dimensions, load, speed, and plant conditions.",
    },
    application: "Rotating shafts, conveyors, pumps, and production lines",
    priority: 20,
    compatibleMachinery: ["Pumps", "Conveyors", "Electric motors"],
  }),
  sourcingProduct({
    id: "pulleys-belts",
    name: { fr: "Poulies et courroies", en: "Pulleys and industrial belts" },
    description: {
      fr: "Poulies, courroies et profils de transmission selectionnes par reference ou mesures de la machine.",
      en: "Pulleys, belts, and drive profiles selected from a part reference or machine measurements.",
    },
    application: "Belt-driven production equipment and material handling",
    priority: 30,
    compatibleMachinery: ["Fans", "Compressors", "Conveyors"],
  }),
  sourcingProduct({
    id: "couplings-hubs",
    name: { fr: "Accouplements et moyeux", en: "Couplings and hubs" },
    description: {
      fr: "Accouplements flexibles ou rigides et moyeux pour relier moteurs, pompes, reducteurs et arbres.",
      en: "Flexible or rigid couplings and hubs for motors, pumps, gearboxes, and driven shafts.",
    },
    application: "Power transmission and shaft connection",
    priority: 40,
    compatibleMachinery: ["Pumps", "Gearboxes", "Mixers"],
  }),
  sourcingProduct({
    id: "pump-parts",
    name: { fr: "Pieces de pompe et turbines", en: "Pump parts and impellers" },
    description: {
      fr: "Turbines, couvercles, corps et pieces d'usure a qualifier selon fluide, dimensions et conditions de service.",
      en: "Impellers, covers, casings, and wear parts qualified against fluid, dimensions, and service conditions.",
    },
    application: "Water, food processing, utilities, and industrial fluids",
    priority: 50,
    compatibleMachinery: ["Centrifugal pumps", "Process pumps", "Utility systems"],
  }),
  sourcingProduct({
    id: "conveyor-parts",
    name: { fr: "Pieces de convoyeur", en: "Conveyor parts" },
    description: {
      fr: "Rouleaux, axes, supports, tambours, chaines et composants fabriques ou sources pour la manutention.",
      en: "Rollers, shafts, brackets, drums, chains, and components made or sourced for material handling.",
    },
    application: "Bulk handling, packaging, warehousing, and process lines",
    priority: 60,
    compatibleMachinery: ["Belt conveyors", "Roller conveyors", "Bucket elevators"],
  }),
  sourcingProduct({
    id: "bushings-sleeves",
    name: { fr: "Bagues et douilles bronze", en: "Bronze bushings and sleeves" },
    description: {
      fr: "Bagues, douilles et inserts d'usure sur mesure pour ensembles tournants et travaux de reparation.",
      en: "Custom bushings, sleeves, and wear inserts for rotating assemblies and repair work.",
    },
    application: "Rotating assemblies, pivots, and maintenance repair",
    priority: 70,
  }),
  sourcingProduct({
    id: "flanges-brackets-bases",
    name: { fr: "Brides, supports et bases", en: "Flanges, brackets, and machine bases" },
    description: {
      fr: "Pieces structurelles et d'interface fabriquees selon plan, cote, materiau et environnement d'utilisation.",
      en: "Structural and interface parts made to drawing, dimensions, material, and operating environment.",
    },
    application: "Machine integration, pipework, mounting, and retrofits",
    priority: 80,
  }),
  sourcingProduct({
    id: "motors-reducers",
    name: { fr: "Moteurs et reducteurs", en: "Electric motors and gear reducers" },
    description: {
      fr: "Motorisation et reduction selectionnees selon puissance, vitesse, couple, alimentation et montage.",
      en: "Motors and reduction drives selected by power, speed, torque, electrical supply, and mounting.",
    },
    application: "Production machinery, conveyors, pumps, and mixers",
    classification: "machinery",
    image: FACTORY_TOOLS_IMAGE,
    priority: 90,
  }),
  sourcingProduct({
    id: "pumps-drive-equipment",
    name: { fr: "Pompes et equipements d'entrainement", en: "Pumps and drive equipment" },
    description: {
      fr: "Pompes et ensembles d'entrainement qualifies apres revue du fluide, du debit, de la pression et du site.",
      en: "Pumps and drive assemblies qualified after review of fluid, flow, pressure, and site conditions.",
    },
    application: "Industrial utilities and process systems",
    classification: "machinery",
    image: FACTORY_TOOLS_IMAGE,
    priority: 100,
  }),
  sourcingProduct({
    id: "measurement-maintenance-tools",
    name: { fr: "Outillage de mesure et maintenance", en: "Measurement and maintenance tools" },
    description: {
      fr: "Pieds a coulisse, micrometres, outils de serrage et kits de maintenance pour ateliers industriels.",
      en: "Calipers, micrometers, torque tools, and maintenance kits for industrial workshops.",
    },
    application: "Inspection, maintenance, assembly, and quality control",
    classification: "industrial_input",
    image: FACTORY_TOOLS_IMAGE,
    priority: 110,
  }),
  sourcingProduct({
    id: "sensors-electrical-controls",
    name: { fr: "Capteurs et composants electriques", en: "Sensors and electrical control components" },
    description: {
      fr: "Capteurs, protections et composants de commande a selectionner selon schema, tension et environnement.",
      en: "Sensors, protection devices, and control components selected by schematic, voltage, and environment.",
    },
    application: "Industrial automation, motor control, and machine safety",
    classification: "industrial_input",
    image: FACTORY_TOOLS_IMAGE,
    priority: 120,
  }),
  sourcingProduct({
    id: "reverse-engineering",
    name: { fr: "Retro-ingenierie d'une piece", en: "Reverse engineering a part" },
    description: {
      fr: "Un dossier technique a partir d'une photo, d'un echantillon, de mesures ou d'un plan avant toute fabrication.",
      en: "A technical record built from a photo, sample, measurements, or drawing before any manufacturing route is approved.",
    },
    application: "Obsolete, imported, damaged, or undocumented industrial parts",
    classification: "industrial_service",
    image: SPARE_PARTS_IMAGE,
    priority: 130,
  }),
  factoryProduct({
    id: "cashew-kernels",
    name: { fr: "Noix de cajou transformees", en: "Processed cashew kernels" },
    description: {
      fr: "Produit agro-industriel documente par la GDIZ. Calibre, emballage, volume et disponibilite sont confirmes avec l'unite avant cotation.",
      en: "Agro-industrial output documented by GDIZ. Grade, packaging, volume, and availability are confirmed with the unit before quotation.",
    },
    manufacturer: "KAJU / Benin Cashew",
    application: "Bulk food ingredient and export distribution",
    image: "/tenants/exportunity/industrial/catalog/products/processed-cashew-kernels.webp",
    sourceUrl: GDIZ_LAUNCH_SOURCE,
    priority: 200,
  }),
  factoryProduct({
    id: "organic-soybean-oil",
    name: { fr: "Huile de soja biologique", en: "Organic soybean oil" },
    description: {
      fr: "Production citee par la GDIZ. Specification, conditionnement et capacite disponible restent a confirmer avec l'unite.",
      en: "Output cited by GDIZ. Specification, packaging, and available capacity remain subject to factory confirmation.",
    },
    manufacturer: "Benin Organics",
    application: "Food manufacturing and bulk distribution",
    image: "/tenants/exportunity/industrial/catalog/products/organic-soybean-oil.webp",
    sourceUrl: GDIZ_LAUNCH_SOURCE,
    priority: 210,
  }),
  factoryProduct({
    id: "organic-soybean-meal",
    name: { fr: "Tourteau de soja biologique", en: "Organic soybean meal" },
    description: {
      fr: "Coproduit de transformation cite par la GDIZ. Composition, emballage et disponibilite sont verifies avant engagement.",
      en: "Processing co-product cited by GDIZ. Composition, packaging, and availability are verified before commitment.",
    },
    manufacturer: "Benin Organics",
    application: "Feed and agro-industrial input",
    image: "/tenants/exportunity/industrial/catalog/products/organic-soybean-meal.webp",
    sourceUrl: GDIZ_LAUNCH_SOURCE,
    priority: 220,
  }),
  factoryProduct({
    id: "conventional-soy-products",
    name: { fr: "Huile et tourteau de soja", en: "Soybean oil and meal" },
    description: {
      fr: "Produits de transformation conventionnelle cites par la GDIZ. Les conditions commerciales sont confirmees directement.",
      en: "Conventional processing outputs cited by GDIZ. Commercial conditions are confirmed directly with the unit.",
    },
    manufacturer: "Benin Agri Business",
    application: "Food processing, feed, and industrial distribution",
    image: "/tenants/exportunity/industrial/catalog/products/organic-soybean-oil.webp",
    sourceUrl: GDIZ_LAUNCH_SOURCE,
    priority: 230,
  }),
  factoryProduct({
    id: "corrugated-boxes",
    name: { fr: "Caisses en carton ondule", en: "Corrugated cardboard boxes" },
    description: {
      fr: "Emballages industriels cites par la GDIZ. Dimensions, resistance, impression et quantite sont a specifier dans la demande.",
      en: "Industrial packaging cited by GDIZ. Dimensions, strength, print requirements, and quantity are specified in the request.",
    },
    manufacturer: "Unicarton Benin",
    application: "Factory packaging, logistics, and export preparation",
    image: "/tenants/exportunity/industrial/catalog/products/corrugated-boxes.webp",
    sourceUrl: GDIZ_LAUNCH_SOURCE,
    priority: 240,
  }),
  factoryProduct({
    id: "metal-cans",
    name: { fr: "Boites metalliques", en: "Metal packaging cans" },
    description: {
      fr: "Emballages metalliques cites par la GDIZ. Format, usage alimentaire ou industriel et volume sont confirmes avant cotation.",
      en: "Metal packaging cited by GDIZ. Format, food or industrial use, and volume are confirmed before quotation.",
    },
    manufacturer: "Unicarton Benin",
    application: "Food and industrial packaging",
    image: "/tenants/exportunity/industrial/catalog/products/metal-cans.webp",
    sourceUrl: GDIZ_LAUNCH_SOURCE,
    priority: 250,
  }),
  factoryProduct({
    id: "cotton-tshirts-polos",
    name: { fr: "T-shirts et polos en coton", en: "Cotton T-shirts and polo shirts" },
    description: {
      fr: "Articles de maille documentes par la GDIZ. Matiere, grammage, tailles, marquage et volume sont confirmes avec l'usine.",
      en: "Knitted garments documented by GDIZ. Fabric, weight, sizes, branding, and volume are confirmed with the factory.",
    },
    manufacturer: "GDIZ textile production units",
    application: "Uniforms, brands, institutional orders, and export distribution",
    image: "/tenants/exportunity/industrial/catalog/products/cotton-tshirts-polos.webp",
    sourceUrl: GDIZ_KNITTING_SOURCE,
    sourceLabel: { fr: "Usine de maille GDIZ", en: "GDIZ knitting plant" },
    priority: 260,
  }),
  factoryProduct({
    id: "knitted-garments",
    name: { fr: "Leggings, vetements de nuit et sous-vetements", en: "Leggings, nightwear, and undergarments" },
    description: {
      fr: "Categories de production documentees par l'usine de maille GDIZ. Le dossier precise modele, matiere et quantite.",
      en: "Production categories documented by the GDIZ knitting plant. The request defines style, fabric, and quantity.",
    },
    manufacturer: "GDIZ textile production units",
    application: "Private label, institutional, and export textile orders",
    image: "/tenants/exportunity/industrial/catalog/products/knitted-garments.webp",
    sourceUrl: GDIZ_KNITTING_SOURCE,
    sourceLabel: { fr: "Usine de maille GDIZ", en: "GDIZ knitting plant" },
    priority: 270,
  }),
  factoryProduct({
    id: "cotton-yarn",
    name: { fr: "Fil de coton", en: "Cotton yarn" },
    description: {
      fr: "Produit textile cite par la GDIZ. Titre du fil, composition, conditionnement et disponibilite sont a confirmer.",
      en: "Textile output cited by GDIZ. Yarn count, composition, packaging, and availability are confirmed before quotation.",
    },
    manufacturer: "Benin Textile (BTEX)",
    application: "Knitting, weaving, and textile manufacturing",
    image: "/tenants/exportunity/industrial/catalog/products/cotton-yarn.webp",
    sourceUrl: GDIZ_LAUNCH_SOURCE,
    priority: 280,
  }),
  factoryProduct({
    id: "towels",
    name: { fr: "Serviettes en coton", en: "Cotton towels" },
    description: {
      fr: "Serviettes classiques, luxe et speciales documentees par la GDIZ. Grammage, dimensions et volume sont a definir.",
      en: "Classic, luxury, and special towels documented by GDIZ. Weight, dimensions, and volume are defined in the request.",
    },
    manufacturer: "Benin Textile (BTEX) / GDIZ weaving plant",
    application: "Hospitality, institutional, retail, and export supply",
    image: "/tenants/exportunity/industrial/catalog/products/cotton-towels.webp",
    sourceUrl: GDIZ_WEAVING_SOURCE,
    sourceLabel: { fr: "Usine de tissage GDIZ", en: "GDIZ weaving plant" },
    priority: 290,
  }),
  factoryProduct({
    id: "bed-linen",
    name: { fr: "Linge de lit en coton", en: "Cotton bed linen" },
    description: {
      fr: "Draps plats, housses, imprimes, jacquard et literie institutionnelle documentes par la GDIZ.",
      en: "Flat, fitted, printed, jacquard, and institutional bed linen documented by GDIZ.",
    },
    manufacturer: "Benin Textile (BTEX) / GDIZ weaving plant",
    application: "Hotels, hospitals, institutions, brands, and export orders",
    image: "/tenants/exportunity/industrial/catalog/products/cotton-bed-linen.webp",
    sourceUrl: GDIZ_WEAVING_SOURCE,
    sourceLabel: { fr: "Usine de tissage GDIZ", en: "GDIZ weaving plant" },
    priority: 300,
  }),
  factoryProduct({
    id: "woven-cotton-fabrics",
    name: { fr: "Tissus coton pour chemises et pantalons", en: "Woven cotton shirting and bottom-weight fabrics" },
    description: {
      fr: "Tissus coton documentes par l'usine de tissage GDIZ. Construction, largeur, finition et quantite sont a confirmer.",
      en: "Cotton fabrics documented by the GDIZ weaving plant. Construction, width, finish, and quantity are confirmed before quotation.",
    },
    manufacturer: "GDIZ weaving plant",
    application: "Garment manufacturing and export textile supply",
    image: "/tenants/exportunity/industrial/catalog/products/woven-cotton-fabrics.webp",
    sourceUrl: GDIZ_WEAVING_SOURCE,
    sourceLabel: { fr: "Usine de tissage GDIZ", en: "GDIZ weaving plant" },
    priority: 310,
  }),
  factoryProduct({
    id: "gdiz-2025-production",
    name: { fr: "Productions industrielles GDIZ 2025", en: "GDIZ 2025 industrial output" },
    description: {
      fr: "La GDIZ signale notamment cajou, huile et tourteau de soja, carreaux, textile, linge et emballages. Chaque demande est verifiee par produit et par usine.",
      en: "GDIZ reports cashew, soybean oil and meal, tiles, textiles, linen, and packaging among 2025 outputs. Each request is verified by product and factory.",
    },
    manufacturer: "GDIZ industrial ecosystem",
    application: "Multi-category industrial sourcing in Benin",
    sourceUrl: GDIZ_2025_SOURCE,
    sourceLabel: { fr: "Bilan officiel GDIZ 2025", en: "Official GDIZ 2025 review" },
    priority: 320,
  }),
].sort((left, right) => left.displayPriority - right.displayPriority);

export function findPublicIndustrialCatalog(options?: {
  query?: string;
  category?: string;
  classification?: string;
  limit?: number;
}) {
  const query = normalizeIndustrialText(options?.query);
  const limit = Math.max(1, Math.min(100, options?.limit || 36));
  return PUBLIC_INDUSTRIAL_CATALOG.filter((item) => {
    if (options?.category && item.categoryCode !== options.category) return false;
    if (
      options?.classification &&
      item.classification !== options.classification
    )
      return false;
    if (!query) return true;
    const searchable = normalizeIndustrialText(
      [
        item.name,
        item.localizedName.fr,
        item.localizedDescription.fr,
        item.description,
        item.manufacturer,
        item.application,
        item.classification,
        item.categoryCode,
        ...item.compatibleMachinery,
      ].join(" "),
    );
    return query
      .split(" ")
      .filter(Boolean)
      .every((term) => searchable.includes(term));
  }).slice(0, limit);
}
