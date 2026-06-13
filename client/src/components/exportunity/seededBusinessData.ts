export type SeededBusinessType = "marketplace" | "wholesale";

export type SeededBusinessPlace = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  city: string;
  district: string;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  openStatus: string;
  type: SeededBusinessType;
  source?: "google" | "seeded" | "onboarded" | "manual";
  verificationStatus: string;
  contactStatus?: string;
  availableQuantity?: string;
  moq?: string;
  leadTime?: string;
};

type SeededFilter = {
  city?: string;
  type?: SeededBusinessType;
};

const abidjanMarketplace: SeededBusinessPlace[] = [
  {
    id: "abj-001",
    name: "Le Pain Doré",
    category: "Bakery",
    lat: 5.3554,
    lng: -4.0033,
    city: "Abidjan",
    district: "Cocody",
    imageUrl:
      "https://images.unsplash.com/photo-1517686469429-8bdb9b0b4f42?auto=format&fit=crop&w=1400&q=80",
    rating: 4.8,
    reviewCount: 224,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Public listing",
    availableQuantity: "Fresh stock, 40+",
    contactStatus: "phone",
  },
  {
    id: "abj-002",
    name: "Cafe Baobab",
    category: "Cafe",
    lat: 5.3599,
    lng: -4.0051,
    city: "Abidjan",
    district: "Marcory",
    imageUrl:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1400&q=80",
    rating: 4.7,
    reviewCount: 138,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Verification review",
    availableQuantity: "In stock",
    contactStatus: "phone",
  },
  {
    id: "abj-003",
    name: "Green Basket Market",
    category: "Organic Food",
    lat: 5.3646,
    lng: -4.0114,
    city: "Abidjan",
    district: "Riviera 3",
    imageUrl:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1400&q=80",
    rating: 4.4,
    reviewCount: 97,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Public listing",
    availableQuantity: "Seasonal produce",
    contactStatus: "phone",
  },
  {
    id: "abj-004",
    name: "Casa Market",
    category: "Grocery Store",
    lat: 5.3585,
    lng: -4.0215,
    city: "Abidjan",
    district: "Adjamé",
    imageUrl:
      "https://images.unsplash.com/photo-1584269600464-37b1c7b6f7ee?auto=format&fit=crop&w=1400&q=80",
    rating: 4.5,
    reviewCount: 161,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Public listing",
    availableQuantity: "Daily essentials",
    contactStatus: "phone",
  },
  {
    id: "abj-005",
    name: "Pharmacie du Faubourg",
    category: "Pharmacy",
    lat: 5.3559,
    lng: -4.0212,
    city: "Abidjan",
    district: "Treichville",
    imageUrl:
      "https://images.unsplash.com/photo-1583947215259-38e98e4205b4?auto=format&fit=crop&w=1400&q=80",
    rating: 4.6,
    reviewCount: 189,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Public listing",
    contactStatus: "phone",
  },
  {
    id: "abj-006",
    name: "Koffi Hardware",
    category: "Hardware Store",
    lat: 5.3605,
    lng: -4.0186,
    city: "Abidjan",
    district: "Yopougon",
    imageUrl:
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=80",
    rating: 4.3,
    reviewCount: 84,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Supplier verification",
    availableQuantity: "Stocked",
    contactStatus: "phone",
  },
  {
    id: "abj-007",
    name: "Maison et Saveur",
    category: "Gift Shop",
    lat: 5.3529,
    lng: -4.0124,
    city: "Abidjan",
    district: "Cocody",
    imageUrl:
      "https://images.unsplash.com/photo-1511994298241-608e28f14fde?auto=format&fit=crop&w=1400&q=80",
    rating: 4.5,
    reviewCount: 73,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Public listing",
    contactStatus: "phone",
  },
  {
    id: "abj-008",
    name: "Electro Plus",
    category: "Electronics",
    lat: 5.367,
    lng: -4.0071,
    city: "Abidjan",
    district: "Plateau",
    imageUrl:
      "https://images.unsplash.com/photo-1550013762-6ca8c4b4f7fd?auto=format&fit=crop&w=1400&q=80",
    rating: 4.2,
    reviewCount: 112,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Verification review",
    availableQuantity: "Refurbished stock",
    contactStatus: "phone",
  },
  {
    id: "abj-009",
    name: "Maison du Tissu",
    category: "Home Goods",
    lat: 5.3469,
    lng: -4.0062,
    city: "Abidjan",
    district: "Anyama",
    imageUrl:
      "https://images.unsplash.com/photo-1479064555552-46f9cc5f3f3f?auto=format&fit=crop&w=1400&q=80",
    rating: 4.2,
    reviewCount: 93,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Public listing",
    availableQuantity: "Ready",
    contactStatus: "phone",
  },
  {
    id: "abj-010",
    name: "Boulangerie Bibi",
    category: "Bakery",
    lat: 5.3431,
    lng: -4.02,
    city: "Abidjan",
    district: "Bingerville",
    imageUrl:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1400&q=80",
    rating: 4.6,
    reviewCount: 145,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Public listing",
    availableQuantity: "Ready",
    contactStatus: "phone",
  },
];

const cotonouMarketplace: SeededBusinessPlace[] = [
  {
    id: "cbj-001",
    name: "Douceur de Cotonou",
    category: "Bakery",
    lat: 6.3652,
    lng: 2.4184,
    city: "Cotonou",
    district: "Akpakpa",
    imageUrl:
      "https://images.unsplash.com/photo-1602526211322-b31f2dcf1a2c?auto=format&fit=crop&w=1400&q=80",
    rating: 4.7,
    reviewCount: 204,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Public listing",
    availableQuantity: "Fresh pastries",
    contactStatus: "phone",
  },
  {
    id: "cbj-002",
    name: "Marché Akpakpa",
    category: "Grocery Store",
    lat: 6.3521,
    lng: 2.4089,
    city: "Cotonou",
    district: "Akpakpa",
    imageUrl:
      "https://images.unsplash.com/photo-1532635246-3a6b1d6c2c1f?auto=format&fit=crop&w=1400&q=80",
    rating: 4.5,
    reviewCount: 88,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Verification review",
    availableQuantity: "Staples daily",
    contactStatus: "phone",
  },
  {
    id: "cbj-003",
    name: "Pharmacie du Littoral",
    category: "Pharmacy",
    lat: 6.3574,
    lng: 2.4131,
    city: "Cotonou",
    district: "Calavi",
    imageUrl:
      "https://images.unsplash.com/photo-1583947215259-38e98e4205b4?auto=format&fit=crop&w=1400&q=80",
    rating: 4.6,
    reviewCount: 120,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Public listing",
    availableQuantity: "24/7",
    contactStatus: "phone",
  },
  {
    id: "cbj-004",
    name: "Kora Café",
    category: "Cafe",
    lat: 6.3668,
    lng: 2.4216,
    city: "Cotonou",
    district: "Porto-Novo",
    imageUrl:
      "https://images.unsplash.com/photo-1534008757030-6f0d1d4f1f17?auto=format&fit=crop&w=1400&q=80",
    rating: 4.4,
    reviewCount: 74,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Public listing",
    availableQuantity: "In stock",
    contactStatus: "phone",
  },
  {
    id: "cbj-005",
    name: "Bricolage Centrale",
    category: "Hardware Store",
    lat: 6.3698,
    lng: 2.4077,
    city: "Cotonou",
    district: "Adjarra",
    imageUrl:
      "https://images.unsplash.com/photo-1618220179428-22790b4613f5?auto=format&fit=crop&w=1400&q=80",
    rating: 4.3,
    reviewCount: 59,
    openStatus: "Open",
    type: "marketplace",
    verificationStatus: "Supplier verification",
    availableQuantity: "Tools / Materials",
    contactStatus: "phone",
  },
];

const abidjanWholesale: SeededBusinessPlace[] = [
  {
    id: "abj-wh-001",
    name: "Cocody Materials Depot",
    category: "Building Materials",
    lat: 5.355,
    lng: -4.0082,
    city: "Abidjan",
    district: "Cocody",
    imageUrl:
      "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1400&q=80",
    rating: 4.3,
    reviewCount: 48,
    openStatus: "Open",
    type: "wholesale",
    verificationStatus: "Supplier verification",
    moq: "50 sacks",
    leadTime: "1-2 days",
    contactStatus: "phone",
    availableQuantity: "Bulk stock",
  },
  {
    id: "abj-wh-002",
    name: "Delta Foods Wholesale",
    category: "Food Distributor",
    lat: 5.3482,
    lng: -4.0141,
    city: "Abidjan",
    district: "Marcory",
    imageUrl:
      "https://images.unsplash.com/photo-1563565375-f4bc2d5f8f95?auto=format&fit=crop&w=1400&q=80",
    rating: 4.4,
    reviewCount: 67,
    openStatus: "Open",
    type: "wholesale",
    verificationStatus: "Public listing",
    moq: "100 units",
    leadTime: "Same day",
    contactStatus: "phone",
    availableQuantity: "Cereals, oils",
  },
  {
    id: "abj-wh-003",
    name: "Packaging Hub CI",
    category: "Packaging Supplier",
    lat: 5.3608,
    lng: -4.0209,
    city: "Abidjan",
    district: "Yopougon",
    imageUrl:
      "https://images.unsplash.com/photo-1600488999580-3f55a4d34f6c?auto=format&fit=crop&w=1400&q=80",
    rating: 4.0,
    reviewCount: 36,
    openStatus: "Open",
    type: "wholesale",
    verificationStatus: "Supplier verification",
    moq: "500 pcs",
    leadTime: "3-5 days",
    contactStatus: "phone",
    availableQuantity: "Bags, wrappers",
  },
  {
    id: "abj-wh-004",
    name: "LogiCo Cotonou Lines",
    category: "Logistics Partner",
    lat: 5.362,
    lng: -4.0161,
    city: "Abidjan",
    district: "Port-Bouet",
    imageUrl:
      "https://images.unsplash.com/photo-1541971887444-0d98a73cde5d?auto=format&fit=crop&w=1400&q=80",
    rating: 4.2,
    reviewCount: 58,
    openStatus: "Open",
    type: "wholesale",
    verificationStatus: "Public listing",
    moq: "Min booking",
    leadTime: "Next-day routes",
    contactStatus: "phone",
    availableQuantity: "Regional freight",
  },
  {
    id: "abj-wh-005",
    name: "Factory Connect",
    category: "Machinery Supplier",
    lat: 5.3662,
    lng: -4.0224,
    city: "Abidjan",
    district: "Koumassi",
    imageUrl:
      "https://images.unsplash.com/photo-1556742049-538d0dce3d5f?auto=format&fit=crop&w=1400&q=80",
    rating: 4.4,
    reviewCount: 24,
    openStatus: "Open",
    type: "wholesale",
    verificationStatus: "Verification review",
    moq: "1 unit",
    leadTime: "7-14 days",
    contactStatus: "phone",
    availableQuantity: "Used + new",
  },
];

const cotonouWholesale: SeededBusinessPlace[] = [
  {
    id: "cbj-wh-001",
    name: "Benin Bulk Hub",
    category: "Food Ingredient Distributor",
    lat: 6.365,
    lng: 2.421,
    city: "Cotonou",
    district: "Cadjehoun",
    imageUrl:
      "https://images.unsplash.com/photo-1604719312566-6f9f4f5f1f8b?auto=format&fit=crop&w=1400&q=80",
    rating: 4.2,
    reviewCount: 52,
    openStatus: "Open",
    type: "wholesale",
    verificationStatus: "Public listing",
    moq: "200kg",
    leadTime: "2-4 days",
    contactStatus: "phone",
    availableQuantity: "Dry goods",
  },
  {
    id: "cbj-wh-002",
    name: "Cotonou Building Supply",
    category: "Building Materials",
    lat: 6.36,
    lng: 2.4228,
    city: "Cotonou",
    district: "Akpakpa",
    imageUrl:
      "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1400&q=80",
    rating: 4.1,
    reviewCount: 37,
    openStatus: "Open",
    type: "wholesale",
    verificationStatus: "Supplier verification",
    moq: "30 bags",
    leadTime: "1 week",
    contactStatus: "phone",
    availableQuantity: "Cement / sand",
  },
];

const seededDataByType: Record<SeededBusinessType, SeededBusinessPlace[]> = {
  marketplace: [...abidjanMarketplace, ...cotonouMarketplace],
  wholesale: [...abidjanWholesale, ...cotonouWholesale],
};

export function getSeededBusinessPlaces({ city, type }: SeededFilter = {}) {
  const cities = city ? [city.toLowerCase()] : null;
  let filtered = [...(type ? seededDataByType[type] : [...seededDataByType.marketplace, ...seededDataByType.wholesale])];
  if (cities) {
    filtered = filtered.filter((place) => cities.includes(place.city.toLowerCase()));
  }
  if (!cities && !type) return [...seededDataByType.marketplace, ...seededDataByType.wholesale];
  return filtered;
}
