export type IndustrialTaxonomyCategory = {
  code: string;
  classification:
    | "export_ready_factory_product"
    | "machinery"
    | "raw_material"
    | "industrial_input"
    | "spare_part"
    | "industrial_service";
  label: { fr: string; en: string };
  description: { fr: string; en: string };
  examples: { fr: string[]; en: string[] };
};

export const INDUSTRIAL_TAXONOMY: IndustrialTaxonomyCategory[] = [
  {
    code: "export_ready_factory_products",
    classification: "export_ready_factory_product",
    label: { fr: "Produits d'usine prêts à l'export", en: "Export-ready factory products" },
    description: {
      fr: "Produits B2B fabriqués par des usines vérifiées et des entreprises prêtes à exporter.",
      en: "B2B products manufactured by verified factories and export-ready companies.",
    },
    examples: {
      fr: ["Produits agro-transformés", "Emballages", "Textiles", "Composants industriels"],
      en: ["Processed agricultural products", "Packaging", "Textiles", "Industrial components"],
    },
  },
  {
    code: "machinery_and_production_equipment",
    classification: "machinery",
    label: { fr: "Machines et équipements de production", en: "Machinery and production equipment" },
    description: {
      fr: "Machines, lignes de production, équipements industriels et systèmes de manutention.",
      en: "Machines, production lines, industrial equipment, and material-handling systems.",
    },
    examples: {
      fr: ["Machines de conditionnement", "Pompes", "Compresseurs", "Lignes complètes"],
      en: ["Packaging machinery", "Pumps", "Compressors", "Complete lines"],
    },
  },
  {
    code: "raw_materials",
    classification: "raw_material",
    label: { fr: "Matières premières", en: "Raw materials" },
    description: {
      fr: "Matières premières, commodités, polymères, métaux et intrants de transformation.",
      en: "Raw materials, commodities, polymers, metals, and processing feedstock.",
    },
    examples: {
      fr: ["Métaux", "Polymères", "Fibres textiles", "Intrants alimentaires"],
      en: ["Metals", "Polymers", "Textile fibres", "Food-processing inputs"],
    },
  },
  {
    code: "industrial_inputs_and_consumables",
    classification: "industrial_input",
    label: { fr: "Intrants et consommables industriels", en: "Industrial inputs and consumables" },
    description: {
      fr: "Consommables de production, sécurité, outillage et fluides techniques.",
      en: "Production consumables, safety equipment, tooling, and technical fluids.",
    },
    examples: {
      fr: ["Lubrifiants", "Filtres", "Abrasifs", "Câbles"],
      en: ["Lubricants", "Filters", "Abrasives", "Cables"],
    },
  },
  {
    code: "spare_parts_and_components",
    classification: "spare_part",
    label: { fr: "Pièces détachées et composants", en: "Spare parts and components" },
    description: {
      fr: "Pièces de rechange, composants mécaniques, électriques et composants à fabriquer.",
      en: "Replacement parts, mechanical and electrical components, and components to manufacture.",
    },
    examples: {
      fr: ["Roulements", "Courroies", "Réducteurs", "Capteurs"],
      en: ["Bearings", "Belts", "Reducers", "Sensors"],
    },
  },
  {
    code: "industrial_services",
    classification: "industrial_service",
    label: { fr: "Services industriels", en: "Industrial services" },
    description: {
      fr: "Installation, maintenance, réparation, fabrication, ingénierie et logistique industrielle.",
      en: "Installation, maintenance, repair, fabrication, engineering, and industrial logistics.",
    },
    examples: {
      fr: ["Maintenance", "Usinage CNC", "Installation", "Inspection d'usine"],
      en: ["Maintenance", "CNC machining", "Installation", "Factory inspection"],
    },
  },
];

export const INDUSTRIAL_REQUIREMENT_TYPES = [
  "machinery",
  "raw_material",
  "industrial_input",
  "spare_part",
  "custom_manufacturing",
  "industrial_service",
  "export_quotation",
] as const;

export function normalizeIndustrialText(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isIndustrialCategoryCode(value: string) {
  return INDUSTRIAL_TAXONOMY.some((category) => category.code === value);
}
