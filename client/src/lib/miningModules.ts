export type MiningModuleMode = "marketplace" | "dore" | "machinery" | "investments";

export const DEFAULT_COUNTRY = "Côte d'Ivoire" as const;
export const UAE_COUNTRY = "United Arab Emirates" as const;

export type MachineryCategory = "extraction" | "processing" | "support" | "mobility" | "spare_parts";
export type MachineryCondition = "new" | "refurbished" | "used";
export type MachineryStatus = "in_stock" | "built_to_order" | "used" | "reserved" | "unavailable";
export type SellerType = "manufacturer" | "authorized_representative" | "owner_resale";

export type MineVerificationStatus = "verified" | "pending";
export type CadastrePermitStatus = "active" | "pending" | "expired" | "suspended";
export type CadastreClaimStatus = "unclaimed" | "pending" | "verified";

export type GeoLocation = {
  country: string;
  region: string;
  city?: string;
  lat: number;
  lng: number;
};

export type CadastrePermit = {
  permitId: string;
  country: string;
  region: string;
  holderName: string;
  permitType: string;
  permitStatus: CadastrePermitStatus;
  commodity: string;
  sourceUrl: string;
  geometry: Array<[number, number]>;
  centroid: { lat: number; lng: number };
  geometryHash: string;
  lastSyncAt: string;
  licenseActiveSinceYear: number;
};

export type CadastreSource = {
  country: string;
  label: string;
  sourceUrl: string;
  available: boolean;
};

export type Money = {
  amount: number;
  currency: "USD" | "EUR" | "XOF" | "AED";
};

export type MachineryItem = {
  id: string;
  type: "machinery";
  name: string;
  category: MachineryCategory;
  condition: MachineryCondition;
  status: MachineryStatus;
  location: GeoLocation;
  price?: Money;
  financingAvailable?: boolean;
  buildTimeWeeksMin?: number;
  buildTimeWeeksMax?: number;
  deliveryTimeWeeksMin?: number;
  deliveryTimeWeeksMax?: number;
  specs: Record<string, string>;
  images: string[];
  sellerType: SellerType;
  allowCustomBuildRequest?: boolean;
  linkedMineId?: string;
};

export type Mine = {
  id: string;
  legalName: string;
  country: string;
  region: string;
  locality?: string;
  lat: number;
  lng: number;
  licenseType: string;
  licenseNumber: string;
  licenseIssuedDate: string; // ISO
  licenseExpiryDate: string; // ISO
  licenseActiveSinceYear: number;
  verificationStatus: MineVerificationStatus;
  publicVisible: boolean;
  historicalProductionTotalKg: number;
  historicalProductionLast12MonthsKg: number;
  currentCapacityKgPerMonth: number;
  remainingPotential: "low" | "medium" | "high";
  remainingLifeYearsAtCurrentRate?: number;
  cadastre: {
    cadastreCountry: string;
    cadastreSourceUrl: string;
    permitId: string;
    permitType: string;
    permitStatus: CadastrePermitStatus;
    commodity: string;
    geometryHash: string;
    lastSyncAt: string;
  };
  cadastreClaimStatus: CadastreClaimStatus;
  cadastreVerifiedOwnerId?: string;
};

export type CapitalUseItem =
  | { label: string; amount?: Money }
  | { label: string; amount?: Money; machineryId: string };

export type InvestmentOpportunity = {
  id: string;
  type: "investment";
  title: string;
  mineId: string;
  mineVerificationStatus: MineVerificationStatus;
  location: GeoLocation;
  capitalRequired: Money;
  durationMonths: number;
  returnModelLabel: string;
  returnIndicativeRange?: string;
  capitalUse: CapitalUseItem[];
};

const CI_LOCATIONS: Array<Pick<GeoLocation, "country" | "region" | "city" | "lat" | "lng">> = [
  { country: DEFAULT_COUNTRY, region: "Abidjan", city: "Abidjan", lat: 5.3599, lng: -4.0083 },
  { country: DEFAULT_COUNTRY, region: "Gbêkê", city: "Bouaké", lat: 7.6906, lng: -5.0397 },
  { country: DEFAULT_COUNTRY, region: "Lacs", city: "Yamoussoukro", lat: 6.8276, lng: -5.2893 },
  { country: DEFAULT_COUNTRY, region: "Haut-Sassandra", city: "Daloa", lat: 6.8774, lng: -6.4504 },
  { country: DEFAULT_COUNTRY, region: "Poro", city: "Korhogo", lat: 9.458, lng: -5.629 },
  { country: DEFAULT_COUNTRY, region: "Bagoué", city: "Boundiali", lat: 9.523, lng: -6.486 },
  { country: DEFAULT_COUNTRY, region: "Tonkpi", city: "Man", lat: 7.4125, lng: -7.553 },
  { country: DEFAULT_COUNTRY, region: "Kabadougou", city: "Odienné", lat: 9.5053, lng: -7.5643 },
  { country: DEFAULT_COUNTRY, region: "Marahoué", city: "Issia", lat: 6.4907, lng: -6.5832 },
  { country: DEFAULT_COUNTRY, region: "Tchologo", city: "Ferkessédougou", lat: 9.5928, lng: -5.1945 },
];

const UAE_LOCATIONS: Array<Pick<GeoLocation, "country" | "region" | "city" | "lat" | "lng">> = [
  { country: UAE_COUNTRY, region: "Dubai", city: "Dubai", lat: 25.2048, lng: 55.2708 },
  { country: UAE_COUNTRY, region: "Dubai", city: "Jebel Ali", lat: 24.9857, lng: 55.0612 },
];

const NEUTRAL_PLACEHOLDER_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" width="800" height="480">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0f172a"/>
        <stop offset="0.5" stop-color="#111827"/>
        <stop offset="1" stop-color="#020617"/>
      </linearGradient>
    </defs>
    <rect width="800" height="480" fill="url(#g)"/>
  </svg>`
)}`;

const IMG = {
  extraction: NEUTRAL_PLACEHOLDER_IMAGE,
  processing: NEUTRAL_PLACEHOLDER_IMAGE,
  support: NEUTRAL_PLACEHOLDER_IMAGE,
  mobility: NEUTRAL_PLACEHOLDER_IMAGE,
  spare_parts: NEUTRAL_PLACEHOLDER_IMAGE,
  mine: NEUTRAL_PLACEHOLDER_IMAGE,
};

function hashGeometry(points: Array<[number, number]>) {
  const input = points.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join("|");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `geo_${(hash >>> 0).toString(16)}`;
}

function makePermitPolygon(lat: number, lng: number, delta = 0.06): Array<[number, number]> {
  return [
    [lat + delta, lng - delta],
    [lat + delta, lng + delta],
    [lat - delta, lng + delta],
    [lat - delta, lng - delta],
  ];
}

function locCI(i: number) {
  return CI_LOCATIONS[i % CI_LOCATIONS.length];
}
function locUAE(i: number) {
  return UAE_LOCATIONS[i % UAE_LOCATIONS.length];
}

function makeItem(args: Omit<MachineryItem, "type">): MachineryItem {
  return { type: "machinery", ...args };
}

export const MACHINERY_ITEMS: MachineryItem[] = [
  // Extraction (10)
  ...Array.from({ length: 10 }).map((_, i) =>
    makeItem({
      id: `mach-ex-${String(i + 1).padStart(3, "0")}`,
      name: [
        "Alluvial Gold Trommel 2.0m",
        "Excavator 22T (Tracked)",
        "Suction Dredge 6-inch",
        "Backhoe Loader 4x4",
        "Portable Water Pump Set",
        "Vibrating Screen Deck 3x1.2m",
        "Compressor 185 CFM",
        "Drill Rig (RC) Compact",
        "Slurry Pump 6x4",
        "Handheld Gold Detector Pro",
      ][i],
      category: "extraction",
      condition: i % 3 === 0 ? "new" : i % 3 === 1 ? "refurbished" : "used",
      status: i % 3 === 2 ? "used" : i % 4 === 0 ? "built_to_order" : "in_stock",
      location: locCI(i),
      price: { amount: 12000 + i * 4500, currency: "USD" },
      financingAvailable: i % 2 === 0,
      sellerType: i % 3 === 0 ? "manufacturer" : "authorized_representative",
      allowCustomBuildRequest: i % 3 === 0,
      ...(i % 4 === 0
        ? { buildTimeWeeksMin: 4, buildTimeWeeksMax: 6, deliveryTimeWeeksMin: 2, deliveryTimeWeeksMax: 3 }
        : {}),
      specs: {
        "Target capacity": `${6 + i} t/h`,
        "Power source": i % 2 === 0 ? "Diesel" : "Electric",
      },
      images: [IMG.extraction],
    })
  ),

  // Processing (10)
  ...Array.from({ length: 10 }).map((_, i) =>
    makeItem({
      id: `mach-pr-${String(i + 1).padStart(3, "0")}`,
      name: [
        "Jaw Crusher 400x600",
        "Ball Mill 900x1800",
        "Shaking Table 6S",
        "Centrifugal Concentrator 30",
        "Carbon-in-Pulp Tank Set",
        "Gold Smelting Furnace 25kg",
        "Cyclone Cluster 6-inch",
        "Mixer/Agitator 7.5kW",
        "Thickener 12m",
        "Magnetic Separator Wet",
      ][i],
      category: "processing",
      condition: i % 3 === 0 ? "refurbished" : i % 3 === 1 ? "used" : "new",
      status: i % 3 === 1 ? "used" : i % 5 === 0 ? "built_to_order" : "in_stock",
      location: locCI(i + 10),
      price: { amount: 18000 + i * 6500, currency: "USD" },
      financingAvailable: true,
      sellerType: i % 2 === 0 ? "authorized_representative" : "manufacturer",
      allowCustomBuildRequest: i % 2 === 1,
      ...(i % 5 === 0
        ? { buildTimeWeeksMin: 5, buildTimeWeeksMax: 7, deliveryTimeWeeksMin: 2, deliveryTimeWeeksMax: 4 }
        : {}),
      specs: {
        Throughput: `${10 + i * 3} t/h`,
        Power: `${15 + i * 5} kW`,
      },
      images: [IMG.processing],
    })
  ),

  // Support (10)
  ...Array.from({ length: 10 }).map((_, i) =>
    makeItem({
      id: `mach-su-${String(i + 1).padStart(3, "0")}`,
      name: [
        "Generator 250 kVA",
        "Solar Hybrid Power Kit 50kW",
        "Water Treatment Unit",
        "Container Workshop 20ft",
        "Laboratory Scale + Assay Kit",
        "Fuel Tank 10,000L",
        "Safety PPE Pack (Site)",
        "Site Lighting Tower",
        "Weighbridge Portable",
        "Satellite Comms Kit",
      ][i],
      category: "support",
      condition: i % 3 === 0 ? "new" : i % 3 === 1 ? "refurbished" : "used",
      status: i % 3 === 2 ? "used" : i % 4 === 0 ? "reserved" : "in_stock",
      location: locCI(i + 20),
      price: { amount: 6000 + i * 3800, currency: "USD" },
      financingAvailable: i % 2 === 0,
      sellerType: i % 4 === 0 ? "manufacturer" : "authorized_representative",
      allowCustomBuildRequest: i % 4 === 0,
      ...(i % 4 === 0
        ? { buildTimeWeeksMin: 3, buildTimeWeeksMax: 5, deliveryTimeWeeksMin: 2, deliveryTimeWeeksMax: 3 }
        : {}),
      specs: {
        "Power source": i % 2 === 0 ? "Diesel" : "Hybrid",
        "Target capacity": i % 2 === 0 ? "250 kVA" : "50 kW",
      },
      images: [IMG.support],
    })
  ),

  // Mobility (10)
  ...Array.from({ length: 10 }).map((_, i) =>
    makeItem({
      id: `mach-mo-${String(i + 1).padStart(3, "0")}`,
      name: [
        "4x4 Mine Transport Pickup",
        "Tipper Truck 10T",
        "Lowbed Trailer 40T",
        "Motorbike Fleet (x5)",
        "Service Van 4x4",
        "Forklift 3.5T",
        "Wheel Loader 3m³",
        "Fuel Bowser Truck",
        "Ambulance 4x4",
        "Crew Bus 30 seats",
      ][i],
      category: "mobility",
      condition: i % 3 === 0 ? "used" : i % 3 === 1 ? "refurbished" : "new",
      status: i % 2 === 0 ? "used" : i % 5 === 0 ? "unavailable" : "in_stock",
      location: locCI(i + 30),
      price: { amount: 9000 + i * 7200, currency: "USD" },
      financingAvailable: i % 2 === 1,
      sellerType: i % 2 === 0 ? "owner_resale" : "authorized_representative",
      specs: {
        Drivetrain: i % 2 === 0 ? "4x4" : "RWD",
        Payload: `${800 + i * 250} kg`,
      },
      images: [IMG.mobility],
    })
  ),

  // Spare Parts (10)
  ...Array.from({ length: 10 }).map((_, i) =>
    makeItem({
      id: `mach-sp-${String(i + 1).padStart(3, "0")}`,
      name: [
        "Crusher Jaw Plate Set",
        "Hydraulic Hose Kit",
        "Generator AVR Module",
        "Pump Impeller 6-inch",
        "Bearing Kit (Conveyor)",
        "Screen Mesh 10mm (Roll)",
        "V-Belt Set (Industrial)",
        "Oil Filter Pack (x12)",
        "CIP Carbon Screen",
        "Motor Starter 30kW",
      ][i],
      category: "spare_parts",
      condition: "new",
      status: i % 6 === 0 ? "reserved" : "in_stock",
      location: locCI(i + 40),
      price: { amount: 120 + i * 95, currency: "USD" },
      financingAvailable: false,
      sellerType: i % 2 === 0 ? "authorized_representative" : "manufacturer",
      allowCustomBuildRequest: i % 2 === 1,
      specs: {
        Compatibility: i % 2 === 0 ? "Crusher / Conveyor" : "Generator / Pump",
        Condition: "New",
      },
      images: [IMG.spare_parts],
    })
  ),

  // Optional Dubai references (filtered out by default country)
  makeItem({
    id: "mach-uae-001",
    name: "Custom Trommel Build (Factory)",
    category: "extraction",
    condition: "new",
    status: "built_to_order",
    location: locUAE(0),
    price: { amount: 78000, currency: "AED" },
    financingAvailable: true,
    sellerType: "manufacturer",
    allowCustomBuildRequest: true,
    buildTimeWeeksMin: 4,
    buildTimeWeeksMax: 6,
    deliveryTimeWeeksMin: 2,
    deliveryTimeWeeksMax: 3,
    specs: { "Target capacity": "30 t/h", "Power source": "Diesel / Electric" },
    images: [IMG.extraction],
  }),
  makeItem({
    id: "mach-uae-002",
    name: "Spare Parts Bundle (Dubai Stock)",
    category: "spare_parts",
    condition: "new",
    status: "in_stock",
    location: locUAE(1),
    price: { amount: 3200, currency: "AED" },
    financingAvailable: false,
    sellerType: "authorized_representative",
    allowCustomBuildRequest: false,
    specs: { Notes: "Export-ready packaging", LeadTime: "3–7 days" },
    images: [IMG.spare_parts],
  }),
];

export const CADASTRE_SOURCES: CadastreSource[] = [
  {
    country: DEFAULT_COUNTRY,
    label: "Cadastre Minier (Côte d'Ivoire)",
    sourceUrl: "https://www.cadastreminier.gouv.ci",
    available: true,
  },
  {
    country: "Ghana",
    label: "Ghana Mining Cadastre (GSD)",
    sourceUrl: "https://cadastre.gsd.gov.gh",
    available: true,
  },
];

const CADASTRE_SOURCE_INDEX = new Map(
  CADASTRE_SOURCES.map((source) => [source.country.toLowerCase(), source]),
);

export const CADASTRE_PERMITS: CadastrePermit[] = [
  {
    permitId: "CI-HS-AL-2019-044",
    country: DEFAULT_COUNTRY,
    region: "Haut-Sassandra",
    holderName: "Sassandra Gold Cooperative SARL",
    permitType: "Artisanal License",
    permitStatus: "active",
    commodity: "Gold",
    sourceUrl: CADASTRE_SOURCE_INDEX.get(DEFAULT_COUNTRY.toLowerCase())?.sourceUrl || "",
    geometry: makePermitPolygon(6.8774, -6.4504),
    centroid: { lat: 6.8774, lng: -6.4504 },
    geometryHash: hashGeometry(makePermitPolygon(6.8774, -6.4504)),
    lastSyncAt: "2026-01-20T08:00:00.000Z",
    licenseActiveSinceYear: 2019,
  },
  {
    permitId: "CI-PO-SIP-2018-012",
    country: DEFAULT_COUNTRY,
    region: "Poro",
    holderName: "Poro Mining Operations SA",
    permitType: "Semi-Industrial Permit",
    permitStatus: "active",
    commodity: "Gold",
    sourceUrl: CADASTRE_SOURCE_INDEX.get(DEFAULT_COUNTRY.toLowerCase())?.sourceUrl || "",
    geometry: makePermitPolygon(9.458, -5.629),
    centroid: { lat: 9.458, lng: -5.629 },
    geometryHash: hashGeometry(makePermitPolygon(9.458, -5.629)),
    lastSyncAt: "2026-01-20T08:00:00.000Z",
    licenseActiveSinceYear: 2018,
  },
  {
    permitId: "CI-TC-IL-2020-003",
    country: DEFAULT_COUNTRY,
    region: "Tchologo",
    holderName: "Tchologo Gold Holdings",
    permitType: "Industrial License",
    permitStatus: "active",
    commodity: "Gold",
    sourceUrl: CADASTRE_SOURCE_INDEX.get(DEFAULT_COUNTRY.toLowerCase())?.sourceUrl || "",
    geometry: makePermitPolygon(9.5928, -5.1945),
    centroid: { lat: 9.5928, lng: -5.1945 },
    geometryHash: hashGeometry(makePermitPolygon(9.5928, -5.1945)),
    lastSyncAt: "2026-01-20T08:00:00.000Z",
    licenseActiveSinceYear: 2020,
  },
  {
    permitId: "CI-TO-AL-2017-091",
    country: DEFAULT_COUNTRY,
    region: "Tonkpi",
    holderName: "Tonkpi Artisanal Group",
    permitType: "Artisanal License",
    permitStatus: "active",
    commodity: "Gold",
    sourceUrl: CADASTRE_SOURCE_INDEX.get(DEFAULT_COUNTRY.toLowerCase())?.sourceUrl || "",
    geometry: makePermitPolygon(7.4125, -7.553),
    centroid: { lat: 7.4125, lng: -7.553 },
    geometryHash: hashGeometry(makePermitPolygon(7.4125, -7.553)),
    lastSyncAt: "2026-01-20T08:00:00.000Z",
    licenseActiveSinceYear: 2017,
  },
  {
    permitId: "CI-KB-AL-2016-027",
    country: DEFAULT_COUNTRY,
    region: "Kabadougou",
    holderName: "Kabadougou Processing Cooperative",
    permitType: "Artisanal License",
    permitStatus: "active",
    commodity: "Gold",
    sourceUrl: CADASTRE_SOURCE_INDEX.get(DEFAULT_COUNTRY.toLowerCase())?.sourceUrl || "",
    geometry: makePermitPolygon(9.5053, -7.5643),
    centroid: { lat: 9.5053, lng: -7.5643 },
    geometryHash: hashGeometry(makePermitPolygon(9.5053, -7.5643)),
    lastSyncAt: "2026-01-20T08:00:00.000Z",
    licenseActiveSinceYear: 2016,
  },
];

const CADASTRE_PERMIT_INDEX = new Map(
  CADASTRE_PERMITS.map((permit) => [permit.permitId.toLowerCase(), permit]),
);

function mapCadastreForPermit(permitId: string) {
  const permit = CADASTRE_PERMIT_INDEX.get(permitId.toLowerCase());
  if (!permit) return null;
  return {
    cadastreCountry: permit.country,
    cadastreSourceUrl: permit.sourceUrl,
    permitId: permit.permitId,
    permitType: permit.permitType,
    permitStatus: permit.permitStatus,
    commodity: permit.commodity,
    geometryHash: permit.geometryHash,
    lastSyncAt: permit.lastSyncAt,
  };
}

export const MINES: Mine[] = [
  {
    id: "mine-ci-hs-01",
    legalName: "Sassandra Gold Cooperative SARL",
    country: DEFAULT_COUNTRY,
    region: "Haut-Sassandra",
    locality: "Daloa",
    lat: 6.8774,
    lng: -6.4504,
    licenseType: "Artisanal License",
    licenseNumber: "CI-HS-AL-2019-044",
    licenseIssuedDate: "2019-05-14",
    licenseExpiryDate: "2029-05-14",
    licenseActiveSinceYear: 2019,
    verificationStatus: "verified",
    publicVisible: true,
    historicalProductionTotalKg: 820,
    historicalProductionLast12MonthsKg: 108,
    currentCapacityKgPerMonth: 11,
    remainingPotential: "high",
    remainingLifeYearsAtCurrentRate: 6,
    cadastre: mapCadastreForPermit("CI-HS-AL-2019-044")!,
    cadastreClaimStatus: "verified",
    cadastreVerifiedOwnerId: "owner-ci-hs-01",
  },
  {
    id: "mine-ci-po-01",
    legalName: "Poro Mining Operations SA",
    country: DEFAULT_COUNTRY,
    region: "Poro",
    locality: "Korhogo",
    lat: 9.458,
    lng: -5.629,
    licenseType: "Semi-Industrial Permit",
    licenseNumber: "CI-PO-SIP-2018-012",
    licenseIssuedDate: "2018-02-02",
    licenseExpiryDate: "2028-02-02",
    licenseActiveSinceYear: 2018,
    verificationStatus: "verified",
    publicVisible: true,
    historicalProductionTotalKg: 1240,
    historicalProductionLast12MonthsKg: 156,
    currentCapacityKgPerMonth: 14,
    remainingPotential: "medium",
    remainingLifeYearsAtCurrentRate: 5,
    cadastre: mapCadastreForPermit("CI-PO-SIP-2018-012")!,
    cadastreClaimStatus: "verified",
    cadastreVerifiedOwnerId: "owner-ci-po-01",
  },
  {
    id: "mine-ci-tc-01",
    legalName: "Tchologo Gold Holdings",
    country: DEFAULT_COUNTRY,
    region: "Tchologo",
    locality: "Ferkessédougou",
    lat: 9.5928,
    lng: -5.1945,
    licenseType: "Industrial License",
    licenseNumber: "CI-TC-IL-2020-003",
    licenseIssuedDate: "2020-08-10",
    licenseExpiryDate: "2030-08-10",
    licenseActiveSinceYear: 2020,
    verificationStatus: "verified",
    publicVisible: true,
    historicalProductionTotalKg: 540,
    historicalProductionLast12MonthsKg: 74,
    currentCapacityKgPerMonth: 7,
    remainingPotential: "medium",
    remainingLifeYearsAtCurrentRate: 4,
    cadastre: mapCadastreForPermit("CI-TC-IL-2020-003")!,
    cadastreClaimStatus: "verified",
    cadastreVerifiedOwnerId: "owner-ci-tc-01",
  },
  {
    id: "mine-ci-to-01",
    legalName: "Tonkpi Artisanal Group",
    country: DEFAULT_COUNTRY,
    region: "Tonkpi",
    locality: "Man",
    lat: 7.4125,
    lng: -7.553,
    licenseType: "Artisanal License",
    licenseNumber: "CI-TO-AL-2017-091",
    licenseIssuedDate: "2017-11-01",
    licenseExpiryDate: "2027-11-01",
    licenseActiveSinceYear: 2017,
    verificationStatus: "verified",
    publicVisible: true,
    historicalProductionTotalKg: 460,
    historicalProductionLast12MonthsKg: 62,
    currentCapacityKgPerMonth: 6,
    remainingPotential: "low",
    remainingLifeYearsAtCurrentRate: 3,
    cadastre: mapCadastreForPermit("CI-TO-AL-2017-091")!,
    cadastreClaimStatus: "verified",
    cadastreVerifiedOwnerId: "owner-ci-to-01",
  },
  {
    id: "mine-ci-kb-01",
    legalName: "Kabadougou Processing Cooperative",
    country: DEFAULT_COUNTRY,
    region: "Kabadougou",
    locality: "Odienné",
    lat: 9.5053,
    lng: -7.5643,
    licenseType: "Artisanal License",
    licenseNumber: "CI-KB-AL-2016-027",
    licenseIssuedDate: "2016-03-20",
    licenseExpiryDate: "2026-03-20",
    licenseActiveSinceYear: 2016,
    verificationStatus: "verified",
    publicVisible: true,
    historicalProductionTotalKg: 390,
    historicalProductionLast12MonthsKg: 55,
    currentCapacityKgPerMonth: 5,
    remainingPotential: "medium",
    remainingLifeYearsAtCurrentRate: 4,
    cadastre: mapCadastreForPermit("CI-KB-AL-2016-027")!,
    cadastreClaimStatus: "verified",
    cadastreVerifiedOwnerId: "owner-ci-kb-01",
  },
];

function mineToLocation(mineId: string): GeoLocation {
  const mine = MINES.find((m) => m.id === mineId);
  if (!mine) return { ...locCI(0) };
  return {
    country: mine.country,
    region: mine.region,
    city: mine.locality,
    lat: mine.lat,
    lng: mine.lng,
  };
}

export const INVESTMENT_OPPORTUNITIES: InvestmentOpportunity[] = [
  {
    id: "inv-ci-001",
    type: "investment",
    title: "Processing upgrade — Haut-Sassandra",
    mineId: "mine-ci-hs-01",
    mineVerificationStatus: "verified",
    location: mineToLocation("mine-ci-hs-01"),
    capitalRequired: { amount: 250000, currency: "USD" },
    durationMonths: 9,
    returnModelLabel: "Return per rotation (indicative)",
    returnIndicativeRange: "Gold-linked return (indicative): 6–10% per rotation",
    capitalUse: [
      { label: "Crusher refurbishment", machineryId: "mach-pr-001" },
      { label: "Site power backup", machineryId: "mach-su-001" },
      { label: "Spare parts + installation", amount: { amount: 25000, currency: "USD" } },
    ],
  },
  {
    id: "inv-ci-002",
    type: "investment",
    title: "Fleet capacity — Poro",
    mineId: "mine-ci-po-01",
    mineVerificationStatus: "verified",
    location: mineToLocation("mine-ci-po-01"),
    capitalRequired: { amount: 180000, currency: "USD" },
    durationMonths: 6,
    returnModelLabel: "Return per rotation (indicative)",
    returnIndicativeRange: "Gold-linked return (indicative): 4–8% per rotation",
    capitalUse: [
      { label: "Excavator deployment", machineryId: "mach-ex-002" },
      { label: "Fuel + safety + logistics", amount: { amount: 15000, currency: "USD" } },
    ],
  },
  {
    id: "inv-ci-003",
    type: "investment",
    title: "Power stabilization — Tchologo",
    mineId: "mine-ci-tc-01",
    mineVerificationStatus: "verified",
    location: mineToLocation("mine-ci-tc-01"),
    capitalRequired: { amount: 120000, currency: "USD" },
    durationMonths: 5,
    returnModelLabel: "Return per rotation (indicative)",
    returnIndicativeRange: "Gold-linked return (indicative): 3–6% per rotation",
    capitalUse: [
      { label: "Generator + hybrid kit", machineryId: "mach-su-002" },
      { label: "Installation + spares", amount: { amount: 12000, currency: "USD" } },
    ],
  },
  {
    id: "inv-ci-004",
    type: "investment",
    title: "Recovery optimization — Tonkpi",
    mineId: "mine-ci-to-01",
    mineVerificationStatus: "verified",
    location: mineToLocation("mine-ci-to-01"),
    capitalRequired: { amount: 95000, currency: "USD" },
    durationMonths: 4,
    returnModelLabel: "Return per rotation (indicative)",
    returnIndicativeRange: "Gold-linked return (indicative): 2–5% per rotation",
    capitalUse: [
      { label: "Shaking table + screen", machineryId: "mach-pr-003" },
      { label: "Spare parts bundle", machineryId: "mach-sp-001" },
    ],
  },
];

export function getMineById(mineId: string) {
  return MINES.find((m) => m.id === mineId) || null;
}

export function isMinePublicVerified(mine: Mine | null) {
  return !!mine && mine.publicVisible && mine.verificationStatus === "verified";
}

export function getCadastreSourceForCountry(country: string) {
  return CADASTRE_SOURCE_INDEX.get(country.toLowerCase()) || null;
}

export function isCadastreCountryAvailable(country: string) {
  const source = getCadastreSourceForCountry(country);
  return !!source && source.available && !!source.sourceUrl;
}

export function getCadastrePermitById(permitId: string) {
  return CADASTRE_PERMIT_INDEX.get(permitId.toLowerCase()) || null;
}

export function getCadastrePermitsForCountry(country: string | "all") {
  if (country === "all") return CADASTRE_PERMITS;
  return CADASTRE_PERMITS.filter((permit) => permit.country.toLowerCase() === country.toLowerCase());
}

export function getCadastrePermitForMine(mine: Mine | null) {
  if (!mine?.cadastre?.permitId) return null;
  return getCadastrePermitById(mine.cadastre.permitId);
}

export function isCadastrePermitValid(permit: CadastrePermit | null | undefined) {
  return !!permit?.permitId && !!permit?.sourceUrl && !!permit?.geometryHash;
}

export function isMineCadastreVerified(mine: Mine | null) {
  if (!mine) return false;
  if (!isCadastreCountryAvailable(mine.country)) return false;
  const permit = getCadastrePermitForMine(mine) || null;
  if (!isCadastrePermitValid(permit)) return false;
  return mine.cadastreClaimStatus === "verified";
}

export function formatMachineryCategory(category: MachineryCategory, t?: (key: string) => string): string {
  if (t) return t(`machinery.category.${category}`);
  if (category === "extraction") return "Extraction";
  if (category === "processing") return "Processing";
  if (category === "support") return "Support";
  if (category === "mobility") return "Mobility";
  return "Spare Parts";
}

export function formatMachineryCondition(condition: MachineryCondition, t?: (key: string) => string): string {
  if (t) return t(`machinery.condition.${condition}`);
  if (condition === "new") return "New";
  if (condition === "refurbished") return "Refurbished";
  return "Used";
}

export function formatMachineryStatus(status: MachineryStatus, t?: (key: string) => string): string {
  if (t) return t(`machinery.status.${status}`);
  if (status === "in_stock") return "In stock";
  if (status === "built_to_order") return "Built-to-order";
  if (status === "used") return "Used (second-hand)";
  if (status === "reserved") return "Reserved";
  return "Unavailable";
}

export function formatSellerType(type: SellerType, t?: (key: string) => string): string {
  if (t) return t(`seller.type.${type}`);
  if (type === "manufacturer") return "Manufacturer";
  if (type === "authorized_representative") return "Authorized Representative";
  return "Owner resale (Used)";
}

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type MachineryFilters = {
  query: string;
  category: MachineryCategory | "all";
  condition: MachineryCondition | "all";
  status: MachineryStatus | "all";
  country: string | "all";
  region: string | "all";
};

export function filterMachinery(items: MachineryItem[], filters: MachineryFilters): MachineryItem[] {
  const q = normalizeText(filters.query).trim();
  return items.filter((item) => {
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (filters.condition !== "all" && item.condition !== filters.condition) return false;
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.country !== "all" && normalizeText(item.location.country) !== normalizeText(filters.country)) return false;
    if (filters.region !== "all" && normalizeText(item.location.region) !== normalizeText(filters.region)) return false;

    if (!q) return true;
    const hay = normalizeText(
      `${item.name} ${item.category} ${item.condition} ${item.status} ${item.location.country} ${item.location.region} ${item.sellerType}`
    );
    return hay.includes(q);
  });
}

export type InvestmentFilters = {
  query: string;
  country: string | "all";
  region: string | "all";
};

export function filterOpportunities(items: InvestmentOpportunity[], filters: InvestmentFilters): InvestmentOpportunity[] {
  const q = normalizeText(filters.query).trim();
  return items
    .filter((item) => item.mineVerificationStatus === "verified")
    .filter((item) => {
      const mine = getMineById(item.mineId);
      if (!isMinePublicVerified(mine)) return false;
      if (!isMineCadastreVerified(mine)) return false;
      if (filters.country !== "all" && normalizeText(item.location.country) !== normalizeText(filters.country)) return false;
      if (filters.region !== "all" && normalizeText(item.location.region) !== normalizeText(filters.region)) return false;

      if (!q) return true;
      const permit = mine?.cadastre?.permitId || "";
      const hay = normalizeText(`${item.title} ${item.mineId} ${permit} ${item.location.country} ${item.location.region}`);
      return hay.includes(q);
    });
}
