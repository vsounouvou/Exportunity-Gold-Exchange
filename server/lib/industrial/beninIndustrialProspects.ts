import { normalizeIndustrialText } from "./taxonomy";
import type { IndustrialFactoryLeadCandidate } from "./factoryLeadIntake";

export const BENIN_INDUSTRIAL_PROSPECT_CHECKED_AT = "2026-08-06";

export type BeninIndustrialProspectRole =
  | "industrial_buyer"
  | "manufacturer"
  | "inventory_partner"
  | "technical_supplier"
  | "logistics_partner"
  | "institutional_partner";

export type BeninIndustrialProspectEvidenceStatus =
  | "approved_in_gdiz"
  | "operational_source_confirmed"
  | "under_construction"
  | "industry_directory_listing"
  | "public_operator";

export type BeninIndustrialProspect = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  countryCode: "BJ";
  primaryIndustry: string;
  roles: BeninIndustrialProspectRole[];
  sourceType:
    | "official_registry"
    | "official_operator"
    | "industry_directory";
  sourceName: string;
  sourceTitle: string;
  sourceUrl: string;
  evidenceStatus: BeninIndustrialProspectEvidenceStatus;
  evidenceSummary: string;
  checkedAt: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  approvedInvestmentFcfa: number | null;
  opportunityHypotheses: string[];
  importableAsFactoryLead: boolean;
  verificationRequired: true;
  outreachAllowed: false;
};

type ProspectInput = Omit<
  BeninIndustrialProspect,
  | "countryCode"
  | "checkedAt"
  | "website"
  | "email"
  | "phone"
  | "approvedInvestmentFcfa"
  | "importableAsFactoryLead"
  | "verificationRequired"
  | "outreachAllowed"
> &
  Partial<
    Pick<
      BeninIndustrialProspect,
      | "website"
      | "email"
      | "phone"
      | "approvedInvestmentFcfa"
      | "importableAsFactoryLead"
    >
  >;

const APIEX_GDIZ_COMPANIES =
  "https://investbenin.bj/invest/zes/gdiz/companies";
const GDIZ_LAUNCH = "https://gdiz-benin.com/launch-event/";
const GDIZ_SECTORS = "https://gdiz-benin.com/fr/secteurs-industriels-cles/";
const CIPB_MEMBERS = "https://cipb.bj/en/our-members/";
const PORT_COMMUNITY = "https://portdecotonou.bj/communaute-portuaire/";

function prospect(input: ProspectInput): BeninIndustrialProspect {
  return {
    ...input,
    countryCode: "BJ",
    checkedAt: BENIN_INDUSTRIAL_PROSPECT_CHECKED_AT,
    website: input.website || null,
    email: input.email || null,
    phone: input.phone || null,
    approvedInvestmentFcfa: input.approvedInvestmentFcfa || null,
    importableAsFactoryLead: input.importableAsFactoryLead ?? true,
    verificationRequired: true,
    outreachAllowed: false,
  };
}

function gdizApproved(input: {
  id: string;
  name: string;
  primaryIndustry: string;
  approvedInvestmentFcfa: number;
  evidenceSummary: string;
  roles?: BeninIndustrialProspectRole[];
  sourceUrl?: string;
  website?: string;
}) {
  return prospect({
    ...input,
    city: "Abomey-Calavi",
    district: "Glo-Djigbe Industrial Zone",
    roles: input.roles || ["industrial_buyer", "manufacturer"],
    sourceType: "official_registry",
    sourceName: "APIEx Benin",
    sourceTitle: "Approved companies in the Glo-Djigbe Industrial Zone",
    sourceUrl: input.sourceUrl || APIEX_GDIZ_COMPANIES,
    evidenceStatus: "approved_in_gdiz",
    opportunityHypotheses: [
      "Industrial maintenance and recurring spare-parts demand",
      "Local supplier qualification and technical sourcing",
      "Production, warehouse or export-logistics support",
    ],
  });
}

function directoryProspect(input: Omit<ProspectInput, "sourceType">) {
  return prospect({ ...input, sourceType: "industry_directory" });
}

/**
 * Initial, officially sourced prospect universe for staff qualification.
 * This is not an exhaustive legal register and must never be published as
 * verified Exportunity inventory without an independent review.
 */
export const BENIN_INDUSTRIAL_PROSPECTS: BeninIndustrialProspect[] = [
  gdizApproved({
    id: "gdiz-a2g-csb",
    name: "A2G / CSB",
    primaryIndustry: "Industrial support and commercial services",
    approvedInvestmentFcfa: 686_608_884,
    evidenceSummary: "APIEx lists the company among approved GDIZ investors.",
    roles: ["industrial_buyer", "technical_supplier"],
  }),
  gdizApproved({
    id: "gdiz-africa-jute-bags",
    name: "Africa Jute Bags",
    primaryIndustry: "Industrial packaging",
    approvedInvestmentFcfa: 5_305_000_000,
    evidenceSummary: "APIEx lists a packaging investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-afrikan-ceramic-solutions",
    name: "Afrikan Ceramic Solutions",
    primaryIndustry: "Stone and ceramics",
    approvedInvestmentFcfa: 25_722_000_000,
    evidenceSummary: "APIEx lists a stone and ceramics investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-atlantic-moulin-benin",
    name: "Atlantic Moulin Benin",
    primaryIndustry: "Wheat flour milling",
    approvedInvestmentFcfa: 12_349_000_000,
    evidenceSummary: "APIEx lists a wheat flour investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-b-steel",
    name: "B-Steel",
    primaryIndustry: "Steel and construction materials",
    approvedInvestmentFcfa: 18_977_000_000,
    evidenceSummary: "APIEx lists a construction-materials investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-benin-agri-business",
    name: "Benin Agri Business",
    primaryIndustry: "Soy processing",
    approvedInvestmentFcfa: 10_024_000_000,
    evidenceSummary: "APIEx approval is complemented by GDIZ reporting a soy-processing unit.",
    sourceUrl: GDIZ_LAUNCH,
  }),
  gdizApproved({
    id: "gdiz-benin-cashew",
    name: "Benin Cashew",
    primaryIndustry: "Cashew processing",
    approvedInvestmentFcfa: 32_798_000_000,
    evidenceSummary: "GDIZ reports five cashew-processing units with 120,000 tonnes annual capacity.",
    sourceUrl: GDIZ_LAUNCH,
  }),
  gdizApproved({
    id: "gdiz-benin-organics",
    name: "Benin Organics",
    primaryIndustry: "Soy processing",
    approvedInvestmentFcfa: 3_241_000_000,
    evidenceSummary: "GDIZ reports a soy-processing unit with 60,000 tonnes annual capacity.",
    sourceUrl: GDIZ_LAUNCH,
  }),
  gdizApproved({
    id: "gdiz-benin-textile",
    name: "Benin Textile",
    primaryIndustry: "Integrated textile manufacturing",
    approvedInvestmentFcfa: 132_680_000_000,
    evidenceSummary: "APIEx lists a major textile investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-benin-textile-corporation",
    name: "Benin Textile Corporation",
    primaryIndustry: "Textile manufacturing",
    approvedInvestmentFcfa: 72_819_000_000,
    evidenceSummary: "APIEx lists an export-oriented textile investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-ben-intex",
    name: "Benintex",
    primaryIndustry: "Textile manufacturing",
    approvedInvestmentFcfa: 2_006_000_000,
    evidenceSummary: "APIEx lists an export-oriented textile investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-cdf-akad",
    name: "CDF-AKAD",
    primaryIndustry: "Industrial packaging",
    approvedInvestmentFcfa: 4_130_000_000,
    evidenceSummary: "APIEx lists a packaging investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-comfort-meuble",
    name: "Comfort Meuble",
    primaryIndustry: "Wood products and furniture",
    approvedInvestmentFcfa: 593_000_000,
    evidenceSummary: "APIEx lists an export-oriented wood-products investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-dhazira",
    name: "Dhazira",
    primaryIndustry: "Industrial real estate and support services",
    approvedInvestmentFcfa: 1_461_000_000,
    evidenceSummary: "APIEx lists an industrial support and real-estate investment approved in GDIZ.",
    roles: ["industrial_buyer", "technical_supplier"],
  }),
  gdizApproved({
    id: "gdiz-ehua-industries",
    name: "Ehua Industries",
    primaryIndustry: "Animal feed manufacturing",
    approvedInvestmentFcfa: 16_000_000_000,
    evidenceSummary: "APIEx lists an animal-feed investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-fabrique-beninoise-tabac",
    name: "Fabrique Beninoise de Tabac",
    primaryIndustry: "Manufacturing",
    approvedInvestmentFcfa: 868_760_000,
    evidenceSummary: "APIEx lists an export-oriented manufacturing investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-fhc-medica",
    name: "FHC Medica",
    primaryIndustry: "Pharmaceutical manufacturing",
    approvedInvestmentFcfa: 7_234_000_000,
    evidenceSummary: "APIEx lists a pharmaceutical investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-keuni-foods",
    name: "Keuni Foods",
    primaryIndustry: "Pineapple concentrate processing",
    approvedInvestmentFcfa: 4_162_000_000,
    evidenceSummary: "APIEx lists an export-oriented pineapple processing investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-krishi-agri",
    name: "Krishi Agri",
    primaryIndustry: "Cottonseed oil processing",
    approvedInvestmentFcfa: 548_000_000,
    evidenceSummary: "APIEx lists an export-oriented cottonseed oil investment approved in GDIZ.",
  }),
  gdizApproved({
    id: "gdiz-kvs-garment",
    name: "KVS Garment",
    primaryIndustry: "Garment manufacturing",
    approvedInvestmentFcfa: 1_563_000_000,
    evidenceSummary: "APIEx lists an export-oriented garment investment approved in GDIZ.",
  }),

  prospect({
    id: "gdiz-unicarton-benin",
    name: "Unicarton Benin",
    city: "Abomey-Calavi",
    district: "Glo-Djigbe Industrial Zone",
    primaryIndustry: "Corrugated board and metal packaging",
    roles: ["industrial_buyer", "manufacturer"],
    sourceType: "official_operator",
    sourceName: "GDIZ / SIPI-Benin",
    sourceTitle: "Industrial units operating at GDIZ",
    sourceUrl: GDIZ_LAUNCH,
    evidenceStatus: "operational_source_confirmed",
    evidenceSummary:
      "GDIZ identifies an operating Unicarton unit manufacturing corrugated cardboard boxes and metal cans for industrial packaging.",
    opportunityHypotheses: [
      "Packaging-line maintenance and recurring spare-parts demand",
      "Conveyors, motors, bearings and transmission components",
      "Industrial packaging supply for local production and export",
    ],
  }),

  directoryProspect({
    id: "benin-sodeco",
    name: "SODECO",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Cotton ginning and agro-industry",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "SODECO",
    sourceTitle: "Official company website",
    sourceUrl: "https://sodeco.bj/",
    evidenceStatus: "operational_source_confirmed",
    evidenceSummary: "The company reports cotton-ginning operations, large installed capacity and a national workforce.",
    website: "https://sodeco.bj/",
    opportunityHypotheses: ["Conveyor and transmission parts", "Gin maintenance spares", "Recurring plant maintenance requirements"],
  }),
  directoryProspect({
    id: "benin-fludor",
    name: "Fludor Benin",
    city: "Bohicon",
    district: "Cana",
    primaryIndustry: "Oilseed crushing and cashew processing",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "Fludor Benin",
    sourceTitle: "Who we are",
    sourceUrl: "https://fludorbenin.com/fludorbenin/who-we-are/",
    evidenceStatus: "operational_source_confirmed",
    evidenceSummary: "The official site describes cottonseed, soy, shea and cashew industrial processing in Cana.",
    website: "https://fludorbenin.com/",
    opportunityHypotheses: ["Crusher and conveyor spares", "Pump and bearing requirements", "Maintenance and local fabrication"],
  }),
  directoryProspect({
    id: "benin-sobebra",
    name: "SOBEBRA",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Beverage manufacturing",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "SOBEBRA",
    sourceTitle: "Company history",
    sourceUrl: "https://www.sobebra.bj/notre-histoire/",
    evidenceStatus: "operational_source_confirmed",
    evidenceSummary: "The official company site describes beer, soft-drink and water production in Benin.",
    website: "https://www.sobebra.bj/",
    opportunityHypotheses: ["Bottling-line maintenance", "Pumps, seals and conveyor components", "Planned shutdown spares"],
  }),
  directoryProspect({
    id: "benin-scb-bouclier",
    name: "SCB Ciment Bouclier",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Cement manufacturing",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "Ciment Bouclier",
    sourceTitle: "Official company website",
    sourceUrl: "https://www.cimentbouclier.com/?lang=en",
    evidenceStatus: "operational_source_confirmed",
    evidenceSummary: "The official site describes cement grinding, laboratory, bagging and logistics operations.",
    website: "https://www.cimentbouclier.com/",
    opportunityHypotheses: ["Bulk-handling and conveyor components", "Bearings, couplings and reducers", "Maintenance service contracts"],
  }),
  directoryProspect({
    id: "benin-cimbenin",
    name: "CIMBENIN",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Cement manufacturing",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB lists CIMBENIN among its industrial members.",
    opportunityHypotheses: ["Crusher and conveyor maintenance", "Power-transmission spares", "Industrial supply agreements"],
  }),
  directoryProspect({
    id: "benin-dongaco",
    name: "DONGACO Industrial Complex",
    city: "Seme-Podji",
    district: null,
    primaryIndustry: "Diversified manufacturing",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "Government of Benin",
    sourceTitle: "APIEx working visit to the DONGACO industrial complex",
    sourceUrl: "https://www.gouv.bj/article/904/visite-travail-complexe-industriel-groupe-dongaco-seme-podji-directeur-general-apiex-fait-made-benin-priorite/",
    evidenceStatus: "operational_source_confirmed",
    evidenceSummary: "The government source describes five production units across beverages, oils, paper, textiles and consumer chemicals.",
    opportunityHypotheses: ["Multi-site maintenance requirements", "Conveyor, pump and packaging spares", "Local fabrication and supplier consolidation"],
  }),
  directoryProspect({
    id: "benin-alpha-benin",
    name: "Alpha-Benin",
    city: "Seme-Podji",
    district: null,
    primaryIndustry: "Pasta manufacturing",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB lists Alpha-Benin as a pasta producer in Seme-Podji.",
    opportunityHypotheses: ["Food-line and packaging spares", "Bearings, belts and motors", "Maintenance planning"],
  }),
  directoryProspect({
    id: "benin-atc-ib",
    name: "ATC-IB",
    city: "Allada",
    district: null,
    primaryIndustry: "Wood processing",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB lists an industrial wood operation in Allada.",
    opportunityHypotheses: ["Saw-line and conveyor spares", "Dust-handling components", "Machine maintenance support"],
  }),
  directoryProspect({
    id: "benin-grands-moulins",
    name: "Grands Moulins du Benin",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Flour milling",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB lists Grands Moulins du Benin among its industrial members.",
    opportunityHypotheses: ["Milling and bulk-handling spares", "Pulleys, bearings and seals", "Recurring maintenance supply"],
  }),
  directoryProspect({
    id: "benin-groupe-veto-services",
    name: "Groupe Veto Services",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Animal feed and agricultural supply",
    roles: ["industrial_buyer", "manufacturer", "inventory_partner"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB describes animal-feed, storage and distribution activities.",
    opportunityHypotheses: ["Feed-line spares", "Warehouse and handling equipment", "Distribution partnership"],
  }),
  directoryProspect({
    id: "benin-sobepec",
    name: "SOBEPEC",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Paints and coatings",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB lists SOBEPEC in paints and coatings.",
    opportunityHypotheses: ["Mixing and pumping equipment", "Seals, motors and reducers", "Maintenance sourcing"],
  }),
  directoryProspect({
    id: "benin-fifa-ste-luce",
    name: "FIFA de Ste Luce",
    city: "Tori-Bossito",
    district: null,
    primaryIndustry: "Water production",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB lists a water-production operation in Tori-Bossito.",
    opportunityHypotheses: ["Bottling and pump maintenance", "Food-grade seals and bearings", "Packaging-line support"],
  }),
  directoryProspect({
    id: "benin-siab",
    name: "SIAB",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Construction materials",
    roles: ["industrial_buyer", "manufacturer", "inventory_partner"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB lists SIAB in construction materials.",
    opportunityHypotheses: ["Industrial equipment and material supply", "Fabricated components", "Construction-sector distribution"],
  }),
  directoryProspect({
    id: "benin-sopal",
    name: "SOPAL SARL",
    city: "Ze",
    district: null,
    primaryIndustry: "Aluminium profiles",
    roles: ["industrial_buyer", "manufacturer"],
    sourceName: "Government of Benin",
    sourceTitle: "Industrial development visit to SOPAL SARL",
    sourceUrl: "https://pmepe.gouv.bj/article/95/developpement-petites-moyennes-entreprises-ministre-awaou-baco-contact-realites-industrielles-sopal-sarl-ze",
    evidenceStatus: "under_construction",
    evidenceSummary: "The government source describes an aluminium-profiles plant project in Ze; operational status requires confirmation.",
    opportunityHypotheses: ["Plant commissioning support", "Extrusion-line industrial inputs", "Maintenance and supplier onboarding"],
  }),
  directoryProspect({
    id: "benin-benin-equipements",
    name: "Benin Equipements",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Industrial equipment distribution and service",
    roles: ["inventory_partner", "technical_supplier"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB lists industrial equipment sales and after-sales activities.",
    opportunityHypotheses: ["Marketplace inventory partnership", "After-sales service routing", "Joint customer requirements"],
  }),
  directoryProspect({
    id: "benin-la-roche",
    name: "La Roche",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Construction materials and equipment",
    roles: ["inventory_partner", "technical_supplier", "industrial_buyer"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB lists construction materials and equipment activities.",
    opportunityHypotheses: ["Marketplace inventory partnership", "Construction-equipment supply", "Industrial customer referrals"],
  }),
  directoryProspect({
    id: "benin-colas",
    name: "COLAS Benin",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Infrastructure construction",
    roles: ["industrial_buyer"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB lists COLAS Benin among its members.",
    opportunityHypotheses: ["Heavy-equipment spares", "Fleet maintenance supplies", "Fabricated construction components"],
  }),
  directoryProspect({
    id: "benin-sogea-satom",
    name: "SOGEA-SATOM Benin",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Infrastructure construction",
    roles: ["industrial_buyer"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "industry_directory_listing",
    evidenceSummary: "CIPB lists SOGEA-SATOM among its members.",
    opportunityHypotheses: ["Heavy-equipment spares", "Workshop requirements", "Local fabrication and maintenance"],
  }),

  ...[
    ["port-autonome-cotonou", "Port Autonome de Cotonou"],
    ["sobemap", "SOBEMAP"],
    ["benin-terminal", "Benin Terminal"],
    ["coman", "COMAN"],
    ["smtc", "SMTC"],
    ["roro-terminal", "Roro Terminal"],
    ["cma-cgm-benin", "CMA CGM Benin"],
    ["msc-benin", "MSC Benin"],
    ["maersk-benin", "Maersk Benin"],
    ["r-logistic-benin", "R-Logistic Benin"],
    ["oma-benin", "OMA Benin"],
  ].map(([id, name]) =>
    directoryProspect({
      id: `benin-${id}`,
      name,
      city: "Cotonou",
      district: "Port of Cotonou ecosystem",
      primaryIndustry: "Port and industrial logistics",
      roles: ["logistics_partner"],
      sourceName: "Port Autonome de Cotonou",
      sourceTitle: "Port community directory",
      sourceUrl: PORT_COMMUNITY,
      evidenceStatus: "public_operator",
      evidenceSummary: "The operator appears in the Port of Cotonou public community directory.",
      opportunityHypotheses: ["Factory import and export routing", "Warehouse and terminal coordination", "Industrial cargo visibility"],
      importableAsFactoryLead: false,
    }),
  ),

  directoryProspect({
    id: "benin-apiex",
    name: "APIEx Benin",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Investment and export facilitation",
    roles: ["institutional_partner"],
    sourceName: "APIEx Benin",
    sourceTitle: "Official investment platform",
    sourceUrl: "https://investbenin.bj/",
    evidenceStatus: "public_operator",
    evidenceSummary: "National investment and export promotion authority and publisher of the GDIZ approved-company list.",
    website: "https://investbenin.bj/",
    email: "apiex.contact@apiex.bj",
    phone: "+229 01 52 83 66 66",
    opportunityHypotheses: ["Official registry validation", "Investor introductions", "Export-readiness coordination"],
    importableAsFactoryLead: false,
  }),
  directoryProspect({
    id: "benin-gdiz-sipi",
    name: "GDIZ / SIPI-Benin",
    city: "Abomey-Calavi",
    district: "Glo-Djigbe Industrial Zone",
    primaryIndustry: "Industrial zone development",
    roles: ["institutional_partner"],
    sourceName: "GDIZ",
    sourceTitle: "Key industrial sectors",
    sourceUrl: GDIZ_SECTORS,
    evidenceStatus: "public_operator",
    evidenceSummary: "GDIZ publishes its industrial sectors, operating model and investor ecosystem.",
    website: "https://gdiz-benin.com/",
    opportunityHypotheses: ["Factory introductions", "Supplier qualification", "GDIZ assembly, warehouse and quality-control collaboration"],
    importableAsFactoryLead: false,
  }),
  directoryProspect({
    id: "benin-cipb",
    name: "CIPB",
    city: "Cotonou",
    district: null,
    primaryIndustry: "Private-sector industry network",
    roles: ["institutional_partner"],
    sourceName: "CIPB",
    sourceTitle: "Member directory",
    sourceUrl: CIPB_MEMBERS,
    evidenceStatus: "public_operator",
    evidenceSummary: "The business council publishes a member directory covering major Beninese industrial operators.",
    website: "https://cipb.bj/",
    opportunityHypotheses: ["Member introductions", "Demand-validation roundtables", "Industrial outreach governance"],
    importableAsFactoryLead: false,
  }),
];

export function beninIndustrialProspectSummary() {
  const countsByRole = BENIN_INDUSTRIAL_PROSPECTS.reduce<Record<string, number>>(
    (counts, item) => {
      for (const role of item.roles) counts[role] = (counts[role] || 0) + 1;
      return counts;
    },
    {},
  );

  return {
    total: BENIN_INDUSTRIAL_PROSPECTS.length,
    importableFactoryLeads: BENIN_INDUSTRIAL_PROSPECTS.filter(
      (item) => item.importableAsFactoryLead,
    ).length,
    gdizApproved: BENIN_INDUSTRIAL_PROSPECTS.filter(
      (item) => item.evidenceStatus === "approved_in_gdiz",
    ).length,
    logisticsPartners: countsByRole.logistics_partner || 0,
    institutionalPartners: countsByRole.institutional_partner || 0,
    countsByRole,
  };
}

export function findBeninIndustrialProspects(ids: string[]) {
  const selected = new Set(ids);
  return BENIN_INDUSTRIAL_PROSPECTS.filter((item) => selected.has(item.id));
}

export function mapBeninIndustrialProspectToFactoryLead(
  item: BeninIndustrialProspect,
): IndustrialFactoryLeadCandidate | null {
  if (!item.importableAsFactoryLead) return null;

  const qualificationScore =
    item.evidenceStatus === "approved_in_gdiz"
      ? 88
      : item.evidenceStatus === "operational_source_confirmed"
        ? 82
        : item.evidenceStatus === "under_construction"
          ? 64
          : 70;

  return {
    source: item.sourceType,
    googlePlaceId: null,
    name: item.name,
    normalizedName: normalizeIndustrialText(item.name),
    primaryIndustry: item.primaryIndustry,
    googleTypes: [],
    address: item.district || item.city,
    city: item.city,
    countryCode: item.countryCode,
    latitude: null,
    longitude: null,
    phone: item.phone,
    website: item.website,
    googleMapsUrl: null,
    rating: null,
    reviewCount: null,
    businessStatus: item.evidenceStatus,
    openingHours: {},
    qualificationScore,
    metadata: {
      source: item.sourceType,
      sourceProspectId: item.id,
      sourceName: item.sourceName,
      sourceTitle: item.sourceTitle,
      sourceUrl: item.sourceUrl,
      sourceCheckedAt: item.checkedAt,
      sourceStatus: item.evidenceStatus,
      evidenceSummary: item.evidenceSummary,
      roles: item.roles,
      publicEmail: item.email,
      approvedInvestmentFcfa: item.approvedInvestmentFcfa,
      opportunityHypotheses: item.opportunityHypotheses,
      publicListing: true,
      verificationRequired: true,
      outreachAllowed: false,
      publicProfileCreated: false,
      qualificationBasis: "official_or_industry_source_requires_staff_review",
    },
  };
}

export function mapBeninIndustrialProspectsToFactoryLeads(
  items: BeninIndustrialProspect[],
) {
  return items
    .map(mapBeninIndustrialProspectToFactoryLead)
    .filter((item): item is IndustrialFactoryLeadCandidate => Boolean(item));
}
